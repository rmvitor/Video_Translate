import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
// These credentials are injected by Supabase into the function, never bundled in the PWA.
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const origins = (Deno.env.get('ACCESS_ALLOWED_ORIGINS') || 'https://rmvitor.github.io').split(',').map(value => value.trim());
const fields: Record<string, string[]> = { start: [], heartbeat: [], logout: [], list: ['search','offset','status'], history: ['user_id','offset'], update: ['user_id','status','starts_at','expires_at','session_minutes','display_name','contact','plan_name','billing_status','amount_cents','next_payment_at','notes'], revoke: ['user_id'], remove:['user_id'], invite:['email','display_name','contact'] };
Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const headers = { 'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (origin && !origins.includes(origin)) return reply({ error: 'Origem não permitida.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405);
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 16384) return reply({ error: 'Entre na sua conta.' }, 401);
  // getUser verifies with the Auth server, including JWT expiry; decoding alone is never authorization.
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  let sessionId: string;
  try { const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); if (payload.sub !== auth.user.id || !/^[0-9a-f-]{36}$/i.test(payload.session_id)) throw new Error(); sessionId=payload.session_id; }
  catch { return reply({ error: 'Sessão sem identificação válida.' }, 401); }
  const reader=request.body?.getReader(); const chunks:Uint8Array[]=[];let size=0;
  if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192){await reader.cancel();return reply({ error: 'Requisição de acesso muito grande.' },413);}chunks.push(chunk.value);}}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  const text = new TextDecoder().decode(raw);
  if (text.length > 8192) return reply({ error: 'Requisição de acesso muito grande.' }, 413);
  let input: Record<string, unknown>;
  try { input=JSON.parse(text); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); }
  catch { return reply({ error: 'Requisição inválida.' }, 400); }
  const action = String(input.action);
  if (!Object.hasOwn(fields,action) || Object.keys(input).some(key => key!=='action' && !fields[action].includes(key))) return reply({ error: 'A API de acesso não aceita arquivos ou conteúdo de treinamento.' }, 400);
  // Header values are observed at the gateway. IP is audit context, never proof of identity.
  const cf = request.headers.get('cf-connecting-ip');
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const observedIp = (cf || forwarded || '').slice(0,80) || null;
  const ipSource = cf ? 'cf-connecting-ip' : forwarded ? 'x-forwarded-for' : null;
  const common = { actor: auth.user.id, auth_session: sessionId, operation: action, observed_ip: observedIp, ip_source: ipSource };
  if(action==='invite'){
    const email=typeof input.email==='string'?input.email.trim().toLowerCase():'',name=typeof input.display_name==='string'?input.display_name.trim():'',contact=typeof input.contact==='string'?input.contact.trim():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120||contact.length>120)return reply({error:'Confira nome, e-mail e contato.'},400);
    const {error:permissionError}=await admin.rpc('manage_access',{...common,operation:'invite_authorize'});
    if(permissionError)return reply({error:'Apenas o master autorizado pode adicionar usuários. Confira a migração de acesso.'},403);
    const {data:invitation,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:name,contact},redirectTo:'https://rmvitor.github.io/Video_Translate/'});
    if(inviteError||!invitation.user)return reply({error:'Não foi possível enviar o convite. Confira o SMTP do Supabase e se o e-mail já possui conta.'},400);
    const {error:auditError}=await admin.rpc('manage_access',{...common,operation:'invite_record',params:{user_id:invitation.user.id}});
    if(auditError)return reply({error:'Convite enviado; atualize a lista para conferir o cadastro e o histórico.'},409);
    return reply({ok:true,api_version:2});
  }
  const { data, error } = ['start','heartbeat','logout'].includes(action)
    ? await admin.rpc('check_access', { ...common, agent: request.headers.get('user-agent')?.slice(0,300) || '' })
    : await admin.rpc('manage_access', { ...common, params: Object.fromEntries(fields[action].filter(key => input[key]!==undefined).map(key => [key,input[key]])) });
  if (error) return reply({ error: error.code==='42501' ? 'Apenas o master pode gerenciar acessos.' : 'Não foi possível aplicar esta operação. Confira os campos e a configuração do acesso.' }, error.code==='42501' ? 403 : 400);
  return reply({...data,api_version:2});
});
