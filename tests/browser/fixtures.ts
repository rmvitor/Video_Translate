import { test as base, expect, type BrowserContext } from '@playwright/test';
export { expect };
export const USER_ID='00000000-0000-4000-8000-000000000001';
export const USER_DB=`entrelinhas-local:user:${USER_ID}`;
export async function mockAccess(context:BrowserContext,options:{role?:'master'|'user';status?:string;session?:boolean;lease?:number}={}) {
  let state=options.status||'active',offline=false;
  const calls:any[]=[];
  const user={id:USER_ID,email:'fixture@example.test',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:USER_ID,session_id:'10000000-0000-4000-8000-000000000001',exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')}.fixture-signature`;
  const session={access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
  const profile={...user,display_name:'Fixture',role:options.role||'user',status:state};
  await context.route('**/access-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:'http://127.0.0.1:4173',publishableKey:'sb_publishable_fixture'})}));
  if(options.session!==false)await context.addInitScript(session=>{if(!sessionStorage.getItem('fixture-initialized')){sessionStorage.setItem('entrelinhas.auth.127.0.0.1:4173',JSON.stringify(session));sessionStorage.setItem('fixture-initialized','true');}},session);
  await context.route('**/auth/v1/**',route=>{
    const req=route.request();calls.push({path:new URL(req.url()).pathname,body:req.postDataJSON(),method:req.method()});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(req.url().includes('/token')?session:req.url().includes('/signup')?{user,session:null}:req.url().includes('/user')?user:{})});
  });
  await context.route('**/functions/v1/access-control',route=>{
    if(offline)return route.abort('internetdisconnected');
    const body=route.request().postDataJSON();calls.push({path:'/functions/v1/access-control',body,method:route.request().method()});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(state==='active'?{allowed:true,lease_seconds:options.lease||65,profile,session:{started_at:new Date().toISOString(),deadline:new Date(Date.now()+3600000).toISOString()}}:{allowed:false,reason:state,profile:{...profile,status:state}})});
  });
  const original=context.setOffline.bind(context);context.setOffline=async value=>{offline=value;await original(value);};
  return {calls,setStatus:(value:string)=>{state=value;},profile,session};
}
export const test=base.extend<{accessFixture:void}>({accessFixture:[async({context,page},use)=>{await mockAccess(context);const original=page.goto.bind(page);page.goto=async(...args)=>{const response=await original(...args);if(!String(args[0]).includes('seed.html'))await expect(page.locator('#app')).toBeVisible();return response;};await use();},{auto:true}]});
