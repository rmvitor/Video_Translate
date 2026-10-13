// Real Edge handler + SDK against simulated Auth/RPC. No messages or network requests are sent.
const MASTER='00000000-0000-4000-8000-000000000001',USER='00000000-0000-4000-8000-000000000002',INVITED='00000000-0000-4000-8000-000000000003';
const token=(id:string)=>`${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({sub:id,session_id:'10000000-0000-4000-8000-000000000001'}))}.synthetic-test`;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
Deno.test('Edge validates Auth and master before inviting; rejects content, bad origins and identity mismatches',async()=>{
 let handler:(request:Request)=>Promise<Response>=()=>{throw new Error('Handler not initialized');};
 const originalServe=Deno.serve,originalFetch=globalThis.fetch,requests:{path:string;body:any}[]=[];
 Deno.env.set('SUPABASE_URL','https://fixture.supabase.co');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','sb_secret_synthetic_fixture');
 (Deno as any).serve=(callback:typeof handler)=>{handler=callback;};
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),headers=new Headers(init?.headers),body=typeof init?.body==='string'?JSON.parse(init.body):null;
  requests.push({path:url.pathname,body});
  if(url.pathname==='/auth/v1/user'){
   const value=headers.get('authorization');const id=value===`Bearer ${token(MASTER)}`?MASTER:value===`Bearer ${token(USER)}`?USER:null;
   return id?json({id,email:'fixture@example.test',aud:'authenticated',role:'authenticated',user_metadata:{role:'master'},app_metadata:{}}):json({message:'Invalid token'},401);
  }
  if(url.pathname==='/rest/v1/rpc/manage_access'){
   if(body.actor!==MASTER)return json({code:'42501',message:'Master access required'},403);
   return json({ok:true});
  }
  if(url.pathname==='/auth/v1/invite')return json({id:INVITED,email:body.email,app_metadata:{},user_metadata:body.data});
  throw new Error('Unexpected fixture API path');
 };
 try{
  await import('../supabase/functions/access-control/index.ts');
  const call=(action:any,authorization?:string,origin='https://rmvitor.github.io')=>handler(new Request('https://fixture.supabase.co/functions/v1/access-control',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(authorization?{Authorization:'Bearer '+authorization}:{})},body:JSON.stringify(action)}));
  assert((await call({action:'start'})).status===401,'Anonymous call allowed');
  assert((await call({action:'invite',email:'customer@example.test',display_name:'Customer'},'invalid')).status===401,'Invalid token allowed');
  assert((await call({action:'invite',email:'customer@example.test',display_name:'Customer'},token(USER))).status===403,'Ordinary user invited someone');
  assert(!requests.some(request=>request.path==='/auth/v1/invite'),'Invitation happened before authorization');
  assert((await call({action:'invite',email:'customer@example.test',display_name:'Customer',video:'private'},token(MASTER))).status===400,'Unknown training content accepted');
  assert((await call({action:'invite',email:'customer@example.test',display_name:'Customer'},token(MASTER),'https://untrusted.example')).status===403,'Unknown origin accepted');
  const response=await call({action:'invite',email:'customer@example.test',display_name:'Customer',contact:'11900000000'},token(MASTER));
  assert(response.status===200,'Master invite failed');const result=await response.json();assert(result.ok&&result.api_version===2,'Version missing');
  const invite=requests.find(request=>request.path==='/auth/v1/invite');assert(invite?.body.data.contact==='11900000000','Contact missing');
  const authorization=requests.findIndex(request=>request.body?.operation==='invite_authorize'&&request.body.actor===MASTER),sent=requests.findIndex(request=>request.path==='/auth/v1/invite');assert(authorization>=0&&authorization<sent,'Master authorization must precede invitation');
  assert(requests.some(request=>request.body?.operation==='invite_record'&&request.body.params.user_id===INVITED),'Invitation audit missing');
  assert(!JSON.stringify(result).includes('sb_secret'),'Server key exposed');
 }finally{Deno.serve=originalServe;globalThis.fetch=originalFetch;}
});
