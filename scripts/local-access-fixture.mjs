// Test-only authorization stub for real-model checks. Never imported by the application build.
// It keeps model inference testable without a hosted Supabase project. It does not validate hosted Auth.
export const MODEL_DATABASE = 'entrelinhas-local:user:00000000-0000-4000-8000-000000000990';
export async function localAccessFixture(context) {
  const user={id:'00000000-0000-4000-8000-000000000990',email:'model-check@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=`${Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,session_id:'10000000-0000-4000-8000-000000000990',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.synthetic-model-check`;
  const session={access_token:token,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
  await context.route('**/access-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:'http://127.0.0.1:4173',publishableKey:'sb_publishable_synthetic_model_check'})}));
  await context.addInitScript(session=>sessionStorage.setItem('entrelinhas.auth.127.0.0.1:4173',JSON.stringify(session)),session);
  await context.route('**/auth/v1/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('/token')?session:user)}));
  await context.route('**/functions/v1/access-control',route=>{
    const input=route.request().postDataJSON();
    if(Object.keys(input).some(key=>key!=='action')||!['start','heartbeat','logout'].includes(input.action))throw new Error('Unexpected content in the test access request');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({allowed:true,lease_seconds:65,profile:{...user,display_name:'Model validation',role:'user',status:'active'}})});
  });
}
