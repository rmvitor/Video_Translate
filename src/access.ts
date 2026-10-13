import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { authStorage } from './auth-storage.mjs';
import { publicAccessConfig, leaseDeadline, accessPayload } from './access-protocol.mjs';
export type AccessProfile = { id: string; email: string; display_name: string; role: 'user'|'master'; status: string; expires_at?: string };
type Options = { lock: () => Promise<void>; unlock: (profile: AccessProfile) => Promise<void>; toast: (message: string) => void };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function createAccess(options: Options) {
  const shell = document.querySelector<HTMLElement>('#app')!;
  const screen = document.createElement('section'); screen.id='access-screen'; shell.before(screen);
  let client: SupabaseClient | undefined, config: ReturnType<typeof publicAccessConfig>, session: Session|null=null, profile: AccessProfile|undefined;
  let granted=false, deadline=0, checking=false, generation=0, recovery=false, signingOut=false;
  let heartbeat: ReturnType<typeof setInterval>|undefined, watchdog: ReturnType<typeof setInterval>|undefined;
  let transition=Promise.resolve();
  shell.hidden=true; shell.inert=true;
  function show(message='', setup=false) {
    screen.hidden=false;
    screen.innerHTML=`<div class="access-card"><a class="access-brand" href="./">entrelinhas<span>.</span></a><div class="eyebrow">SEUS ARQUIVOS CONTINUAM LOCAIS</div><h1>${setup?'Acesso em preparação':signingOut?'Encerrando sessão':recovery?'Defina uma nova senha':session?'Sua conta':'Entre para continuar'}</h1><p class="access-description">O login libera a ferramenta. O Supabase recebe dados de conta e acesso, incluindo IP e horários. Vídeos, PDFs, imagens, textos e backups continuam neste dispositivo.</p>${setup?'<p>O administrador precisa configurar o projeto Supabase para ativar o login.</p>':signingOut?'<p>Encerrando sua sessão. Seus materiais locais estão preservados.</p>':recovery?'<form id="recovery-form"><label class="field-label">Nova senha<input id="recovery-password" type="password" autocomplete="new-password" minlength="12" required /></label><button class="button primary">Salvar nova senha</button></form>':session?`<strong>${esc(session.user.email)}</strong><p id="access-reason">${esc(message)}</p><div class="inline-actions"><button class="button primary" id="retry-access">Verificar acesso novamente</button><button class="button secondary" id="gate-signout">Sair da conta</button></div>`:`<form id="signin-form"><label class="field-label">E-mail<input id="access-email" type="email" autocomplete="username" maxlength="254" required /></label><label class="field-label">Senha<input id="access-password" type="password" autocomplete="current-password" minlength="1" required /></label><label class="field-label" id="signup-name-field" hidden>Seu nome<input id="access-name" maxlength="120" autocomplete="name" /></label><button class="button primary" id="auth-submit">Entrar</button><p id="auth-error" role="alert"></p></form><div class="inline-actions"><button class="text-button" id="toggle-signup">Solicitar acesso</button><button class="text-button" id="forgot-password">Esqueci minha senha</button></div>`}<p class="access-status" id="access-status" role="status">${!session?esc(message):''}</p><p class="settings-status">A autorização é conferida online. O bloqueio de acesso não apaga a biblioteca local.</p></div>`;
    let signup=false;
    screen.querySelector('#toggle-signup')?.addEventListener('click',()=> { signup=!signup; screen.querySelector<HTMLElement>('#signup-name-field')!.hidden=!signup; screen.querySelector('#auth-submit')!.textContent=signup?'Solicitar acesso':'Entrar'; screen.querySelector('#toggle-signup')!.textContent=signup?'Já tenho uma conta':'Solicitar acesso'; screen.querySelector<HTMLInputElement>('#access-password')!.autocomplete=signup?'new-password':'current-password';screen.querySelector<HTMLInputElement>('#access-password')!.minLength=signup?12:1; });
    screen.querySelector('#signin-form')?.addEventListener('submit',async event=>{
      event.preventDefault(); if(!client) return;
      const button=screen.querySelector<HTMLButtonElement>('#auth-submit')!, error=screen.querySelector('#auth-error')!;
      button.disabled=true; error.textContent='';
      const email=screen.querySelector<HTMLInputElement>('#access-email')!.value.trim(), password=screen.querySelector<HTMLInputElement>('#access-password')!.value;
      try {
        const result=signup?await client.auth.signUp({email,password,options:{data:{display_name:screen.querySelector<HTMLInputElement>('#access-name')!.value.trim()},emailRedirectTo:new URL('./',location.href).href}}):await client.auth.signInWithPassword({email,password});
        if(result.error) throw new Error(signup?'Não foi possível cadastrar. Confira os dados, os requisitos de senha e o limite de tentativas.':'Não foi possível entrar. Confira e-mail, senha, confirmação da conta e tente novamente.');
        if(signup&&!result.data.session){show('Confira seu e-mail para confirmar a conta. Depois, aguarde a aprovação do master.');return;}
        session=result.data.session; await check('start');
      }catch(err){error.textContent=err instanceof Error?err.message:'Não foi possível acessar o serviço.';}
      finally{button.disabled=false;}
    });
    screen.querySelector('#forgot-password')?.addEventListener('click',async()=>{
      const email=screen.querySelector<HTMLInputElement>('#access-email')!.value.trim();
      if(!email){screen.querySelector('#auth-error')!.textContent='Informe seu e-mail primeiro.';return;}
      const result=await client!.auth.resetPasswordForEmail(email,{redirectTo:new URL('./',location.href).href});
      screen.querySelector('#auth-error')!.textContent=result.error?'Não foi possível solicitar a recuperação. Tente novamente.':'Se houver uma conta com esse e-mail, você receberá as instruções de recuperação.';
    });
    screen.querySelector('#recovery-form')?.addEventListener('submit',async event=>{
      event.preventDefault(); const button=screen.querySelector<HTMLButtonElement>('form button')!;button.disabled=true;
      const result=await client!.auth.updateUser({password:screen.querySelector<HTMLInputElement>('#recovery-password')!.value});
      if(result.error){screen.querySelector('#access-status')!.textContent='Não foi possível alterar a senha. Confira o link e os requisitos da senha.';button.disabled=false;return;}
      recovery=false;await check('start');
    });
    screen.querySelector('#retry-access')?.addEventListener('click',()=>void check('start'));
    screen.querySelector('#gate-signout')?.addEventListener('click',()=>void signout());
  }
  async function lock(message:string) {
    const wasGranted=granted;generation++;granted=false;deadline=0;profile=undefined;shell.hidden=true;shell.inert=true;
    document.querySelector<HTMLDialogElement>('#dialog')?.close();
    show(message);
    if(wasGranted) transition=transition.then(options.lock); await transition;
    document.dispatchEvent(new CustomEvent('access-changed'));
  }
  async function call(action:string,values:Record<string,unknown>={}) {
    if(!client||!config||!session)throw new Error('Entre na sua conta.');
    if(!['start','heartbeat','logout'].includes(action)&&(!granted||performance.now()>=deadline))throw new Error('Sua autorização precisa ser renovada.');
    const current=await client.auth.getSession();if(!current.data.session)throw new Error('Sessão encerrada.');
    const response=await fetch(`${config.url}/functions/v1/access-control`,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:`Bearer ${current.data.session.access_token}`},body:JSON.stringify(accessPayload(action,values)),signal:AbortSignal.timeout(12000),cache:'no-store'});
    if(!response.ok)throw new Error(response.status===401?'Sessão inválida. Entre novamente.':response.status===403?'Você não tem permissão para esta operação.':'Não foi possível consultar o controle de acesso.');
    return response.json();
  }
  const reasons:Record<string,string>={pending:'Seu cadastro aguarda a aprovação do master.',blocked:'O master bloqueou o acesso desta conta.',expired:'A validade do seu acesso terminou. Solicite a liberação ao master.',not_started:'Seu período de acesso ainda não começou.',unconfirmed:'Confirme o e-mail da conta para continuar.',session_expired:'Sua sessão terminou ou foi revogada. Saia da conta e entre novamente.',signed_out:'Você saiu da conta.'};
  async function check(action:'start'|'heartbeat') {
    if(checking||!session||recovery||signingOut)return; checking=true;const epoch=generation;
    try {
      const response=await call(action);if(epoch!==generation)return;
      const until=leaseDeadline(response,performance.now());
      if(!until){await lock(reasons[response.reason]||'Acesso não autorizado.');return;}
      if(response.profile.id!==session.user.id)throw new Error('Resposta de autorização inválida.');
      deadline=until;profile=response.profile;
      if(!granted){await transition;await options.unlock(profile!);if(epoch!==generation)return;granted=true;}
      screen.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input=>{input.value='';});
      screen.hidden=true;shell.hidden=false;shell.inert=false;document.dispatchEvent(new CustomEvent('access-changed'));
    }catch{if(epoch===generation)await lock('Não foi possível confirmar sua autorização. Confira a conexão e tente novamente.');}
    finally{checking=false;}
  }
  async function signout() {
    if(signingOut)return;signingOut=true;generation++;
    const remote=session?call('logout').catch(()=>{}):Promise.resolve();
    session=null;await lock('Você saiu da conta.');
    try{await remote;await client?.auth.signOut({scope:'local'});}finally{if(config)sessionStorage.removeItem(`entrelinhas.auth.${new URL(config.url).host}`);session=null;signingOut=false;show('Você saiu da conta.');}
  }
  async function init() {
    show('Verificando configuração…',true);
    try{
      // Public configuration only. Cached copy serves the shell offline; access still requires the server.
      const response=await fetch(new URL('access-config.json',location.href),{cache:'no-cache'});
      config=publicAccessConfig(await response.json());
      if(!config){show('',true);return;}
      client=createClient(config.url,config.publishableKey,{global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(12000)})},auth:{persistSession:true,storage:authStorage(sessionStorage,localStorage),storageKey:`entrelinhas.auth.${new URL(config.url).host}`,flowType:'pkce',detectSessionInUrl:true,autoRefreshToken:true}});
      client.auth.onAuthStateChange((event,value)=>{
        if(signingOut)return;
        if(event==='TOKEN_REFRESHED'){session=value;return;}
        if(event==='PASSWORD_RECOVERY')recovery=true;
        if(event==='SIGNED_OUT'){generation++;session=null;void lock('Você saiu da conta.');return;}
        if(value){session=value;queueMicrotask(()=>recovery?void lock('Defina sua nova senha.'):void check('start'));}
      });
      const current=await client.auth.getSession();session=current.data.session;
      if(session)await check('start');else show();
      heartbeat=setInterval(()=>{if(session&&granted&&!document.hidden)void check('heartbeat');},30000);
      watchdog=setInterval(()=>{if(granted&&performance.now()>=deadline)void lock('A autorização venceu. Conecte-se e verifique o acesso novamente.');},1000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)void check(granted?'heartbeat':'start');});
      window.addEventListener('online',()=>{if(session)void check(granted?'heartbeat':'start');});
    }catch{show('Não foi possível carregar a configuração de acesso. Confira a conexão e tente recarregar.',true);}
  }
  return {init,call,signout,get granted(){return granted&&performance.now()<deadline;},get profile(){return profile;},get ready(){return Boolean(config);}};
}
