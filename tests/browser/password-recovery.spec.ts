import {test,expect} from '@playwright/test';
import {mockAccess} from './fixtures';
import {readFileSync} from 'node:fs';
const password='SenhaNova123!';

function emailAction(file:string,hash:string){
 const html=readFileSync(new URL(`../../supabase/templates/${file}`,import.meta.url),'utf8');
 const href=html.match(/href="([^"]*token_hash=[^"]+)"/)?.[1];
 if(!href)throw new Error('O template precisa de um botão com token de autenticação.');
 const url=new URL(href.replace('{{ .TokenHash }}',hash).replaceAll('&amp;','&'));
 expect(url.origin).toBe('https://rmvitor.github.io');
 return './'+url.pathname.replace('/Video_Translate/','')+url.search;
}

test('signup checks update while typing and password visibility works without submitting or storing the password',async({page,context})=>{
 const fixture=await mockAccess(context,{session:false});
 await context.route('**/access-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:'http://127.0.0.1:4173',publishableKey:'sb_publishable_fixture',passwordPolicy:{minimumLength:8,requiredCharacters:'lower_upper_letters_digits_symbols'}})}));
 await page.goto('./');await page.locator('#toggle-signup').click();
 const checks=page.locator('#signup-requirements [data-met=true]'),input=page.locator('#access-password'),eye=page.locator('[data-password-toggle="access-password"]');
 await expect(checks).toHaveCount(0);
 for(const [text,count] of [['A',1],['Ab',2],['Abcdefg1',4],['Abcdefg1!',5],['Abcdefg1',4]] as const){await input.fill(text);await expect(checks).toHaveCount(count);}
 await expect(page.locator('#signup-requirements-summary')).toHaveText('4 de 5 requisitos atendidos.');
 await eye.click();await expect(input).toHaveAttribute('type','text');await expect(eye).toHaveAttribute('aria-pressed','true');await expect(eye).toHaveAccessibleName('Ocultar senha');
 await eye.press('Enter');await expect(input).toHaveAttribute('type','password');await expect(input).toHaveValue('Abcdefg1');expect(fixture.calls.some(call=>call.path.endsWith('/signup'))).toBe(false);
 await input.fill('Abcdefg1 ');await expect(page.locator('#signup-requirements [data-requirement=symbol]')).toHaveAttribute('data-met','false');
 await page.locator('#access-email').fill('new@example.test');await page.locator('#access-name').fill('Novo usuário');await page.locator('#access-contact').fill('11999990000');await page.locator('#auth-submit').click();await expect(page.locator('#auth-error')).toContainText('símbolo');expect(fixture.calls.some(call=>call.path.endsWith('/signup'))).toBe(false);
 await input.fill('Abcdefg1!');await expect(page.locator('#signup-requirements-summary')).toHaveText('Todos os requisitos atendidos.');await expect(page.locator('#auth-error')).toBeEmpty();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/entrelinhas-password-checklist-mobile.png',fullPage:true});
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'/tmp/entrelinhas-password-checklist-dark.png',fullPage:true});
 await page.locator('#auth-submit').click();await expect(page.locator('#resend-confirmation-form')).toBeVisible();
 expect(fixture.calls.filter(call=>call.path.endsWith('/signup'))).toHaveLength(1);expect(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage))).not.toContain('Abcdefg1!');
});

test('login accepts existing passwords and clears a revealed password after authorization',async({page,context})=>{
 await mockAccess(context,{session:false});await page.goto('./');await page.locator('#access-email').fill('fixture@example.test');await page.locator('#access-password').fill('antiga');await page.locator('[data-password-toggle="access-password"]').click();await expect(page.locator('#access-password')).toHaveAttribute('type','text');
 await page.locator('#auth-submit').click();await expect(page.locator('#app')).toBeVisible();await expect(page.locator('#access-password')).toHaveValue('');await expect(page.locator('#access-password')).toHaveAttribute('type','password');await expect(page.locator('[data-password-toggle="access-password"]')).toHaveAttribute('aria-pressed','false');
});

test('recovery link crosses tabs with PKCE, saves the confirmed password and requires login with the new password',async({page,context})=>{
  const fixture=await mockAccess(context,{session:false});let saved='',redirect='';const updates:any[]=[];
  await context.route('**/auth/v1/recover*',route=>{const body=route.request().postDataJSON();expect(body.email).toBe('fixture@example.test');expect(body.code_challenge).toBeTruthy();expect(body.code_challenge_method).toBe('s256');redirect=new URL(route.request().url()).searchParams.get('redirect_to')!;return route.fulfill({contentType:'application/json',body:'{}'});});
  await context.route('**/auth/v1/user',route=>{if(route.request().method()==='PUT'){saved=route.request().postDataJSON().password;updates.push(saved);}return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture.session.user)});});
  await context.route('**/auth/v1/token*',route=>{
    const request=route.request(),body=request.postDataJSON();
    if(new URL(request.url()).searchParams.get('grant_type')==='pkce'){expect(body.auth_code).toBe('fixture-code');expect(body.code_verifier).toBeTruthy();return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture.session)});}
    return route.fulfill({status:body.password===saved?200:400,contentType:'application/json',body:JSON.stringify(body.password===saved?fixture.session:{error_code:'invalid_credentials',msg:'Invalid login credentials'})});
  });
  await page.goto('./');await page.locator('#access-email').fill('fixture@example.test');await page.getByRole('link',{name:'Esqueci minha senha'}).click();await expect(page).toHaveURL(/\/recuperar-senha\/$/);
  await expect(page.locator('#reset-email')).toHaveValue('fixture@example.test');await page.locator('#send-recovery').click();await expect(page.locator('#access-status')).toContainText('Se houver uma conta');await expect(page.locator('#send-recovery')).toHaveText('Reenviar link de recuperação');
  expect(new URL(redirect).pathname).toBe('/Video_Translate/nova-senha/');
  const callback=new URL(redirect);callback.searchParams.set('code','fixture-code');const next=await context.newPage();await next.goto(callback.href);await expect(next.locator('#recovery-form')).toBeVisible();await expect(next.locator('#app')).not.toBeVisible();
  await expect(next).toHaveURL(/\/nova-senha\/$/);expect(fixture.calls.some(call=>call.path.endsWith('/access-control'))).toBe(false);
  await next.locator('#recovery-password').fill(password);await next.locator('[data-password-toggle="recovery-password"]').click();await expect(next.locator('#recovery-password')).toHaveAttribute('type','text');expect(updates).toHaveLength(0);
  await next.locator('#recovery-confirmation').fill('OutraSenha123!');await next.locator('[data-password-toggle="recovery-confirmation"]').click();await expect(next.locator('#recovery-confirmation')).toHaveAttribute('type','text');await next.locator('#save-password').click();await expect(next.locator('#auth-error')).toContainText('não coincidem');expect(updates).toHaveLength(0);
  await next.locator('#recovery-confirmation').fill(password);await next.locator('#recovery-confirmation').press('Enter');await expect(next.locator('#access-status')).toContainText('Senha alterada com sucesso');await expect(next.locator('#signin-form')).toBeVisible();await expect(next.locator('#app')).not.toBeVisible();expect(updates).toEqual([password]);
  await next.locator('#access-password').fill('SenhaAntiga123!');await next.locator('#auth-submit').click();await expect(next.locator('#auth-error')).toContainText('Não foi possível entrar');
  await next.locator('#access-password').fill(password);await next.locator('#auth-submit').click();await expect(next.locator('#app')).toBeVisible();
  expect(await next.evaluate(()=>document.baseURI)).toBe('http://127.0.0.1:4173/Video_Translate/');
  expect(await next.evaluate(()=>localStorage.getItem('entrelinhas.auth.127.0.0.1:4173'))).toBe(null);
  expect(await next.evaluate(()=>Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(key=>key?.endsWith('-code-verifier')))).toHaveLength(0);
});

test('public routes survive direct loading; expired links, missing PKCE and absent sessions cannot save a password',async({page,context})=>{
  const fixture=await mockAccess(context,{session:false});
  await page.goto('./nova-senha/');await expect(page.locator('#invalid-auth-link')).toBeVisible();await expect(page.locator('#recovery-form')).toHaveCount(0);await expect(page.locator('#app')).not.toBeVisible();
  await page.goto('./nova-senha/?code=missing-verifier');await expect(page.locator('#invalid-auth-link')).toBeVisible();await expect(page.locator('#recovery-form')).toHaveCount(0);
  await page.goto('./nova-senha/#error=access_denied&error_code=otp_expired&error_description=private-details');await expect(page.locator('#invalid-auth-link')).toContainText('expirou');await expect(page.locator('#access-screen')).not.toContainText('private-details');
  await page.getByRole('link',{name:'Solicitar novo link'}).click();await page.reload();await expect(page.locator('#reset-request-form')).toBeVisible();expect(fixture.calls.some(call=>call.path.endsWith('/user')&&call.method==='PUT')).toBe(false);
  expect(await page.evaluate(()=>document.baseURI)).toBe('http://127.0.0.1:4173/Video_Translate/');
});

test('invalid recovery code cannot use an already signed-in account; expired session is verified before updating',async({page,context})=>{
  const fixture=await mockAccess(context);await page.goto('./nova-senha/?code=missing-verifier');await expect(page.locator('#invalid-auth-link')).toBeVisible();await expect(page.locator('#recovery-form')).toHaveCount(0);
  await page.reload();await expect(page.locator('#invalid-auth-link')).toBeVisible();await expect(page.locator('#recovery-form')).toHaveCount(0);
  await page.goto('./nova-senha/');await expect(page.locator('#recovery-form')).toBeVisible();
  await context.route('**/auth/v1/user',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error_code:'bad_jwt',msg:'Expired token'})}));
  await page.locator('#recovery-password').fill(password);await page.locator('#recovery-confirmation').fill(password);await page.locator('#save-password').click();await expect(page.locator('#invalid-auth-link')).toBeVisible();expect(fixture.calls.some(call=>call.path.endsWith('/user')&&call.method==='PUT')).toBe(false);
});

test('recovery resend hides account existence and handles throttling without duplicate requests',async({page,context})=>{
  await mockAccess(context,{session:false});let requests=0,mode='unknown';
  await context.route('**/auth/v1/recover*',async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,100));return route.fulfill({status:mode==='rate'?429:mode==='unknown'?404:200,contentType:'application/json',body:JSON.stringify(mode==='rate'?{error_code:'over_email_send_rate_limit',msg:'Rate limit'}:mode==='unknown'?{error_code:'user_not_found',msg:'User not found'}:{})});});
  await page.goto('./recuperar-senha/');await page.locator('#reset-email').fill('unknown@example.test');await page.locator('#send-recovery').click();await expect(page.locator('#send-recovery')).toBeDisabled();await expect(page.locator('#access-status')).toContainText('Se houver uma conta');expect(requests).toBe(1);
  mode='rate';await page.locator('#send-recovery').click();await expect(page.locator('#auth-error')).toContainText('Aguarde');await expect(page.locator('#send-recovery')).toBeEnabled();
  mode='success';await page.locator('#send-recovery').click();await expect.poll(()=>requests).toBe(3);await expect(page.locator('#access-status')).toContainText('Se houver uma conta');
});

test('signup displays configured password requirements and confirmation callback keeps master approval',async({page,context})=>{
  const fixture=await mockAccess(context,{session:false,status:'pending'});let redirect='';
  await context.route('**/access-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({url:'http://127.0.0.1:4173',publishableKey:'sb_publishable_fixture',passwordPolicy:{minimumLength:12,requiredCharacters:'lower_upper_letters_digits_symbols'}})}));
  await context.route('**/auth/v1/signup*',route=>{redirect=new URL(route.request().url()).searchParams.get('redirect_to')!;expect(route.request().postDataJSON().password).toBe(password);return route.fulfill({contentType:'application/json',body:JSON.stringify({user:fixture.session.user,session:null})});});
  await page.goto('./');await page.locator('#toggle-signup').click();await expect(page.locator('#signup-requirements')).toContainText('12 caracteres');await expect(page.locator('#signup-requirements')).toContainText('maiúscula');await expect(page.locator('#signup-requirements')).toContainText('símbolo');
  await page.locator('#access-email').fill('fixture@example.test');await page.locator('#access-name').fill('Teste');await page.locator('#access-contact').fill('11999990000');await page.locator('#access-password').fill('somenteletras');await page.locator('#auth-submit').click();await expect(page.locator('#auth-error')).toContainText('letras e números');
  await page.locator('#access-password').fill(password);await page.locator('#auth-submit').click();await expect(page).toHaveURL(/\/confirmar-email\/$/);await expect(page.locator('#resend-confirmation-form')).toBeVisible();await page.locator('#resend-confirmation').click();await expect(page.locator('#access-status')).toContainText('confirmação pendente');
  expect(new URL(redirect).pathname).toBe('/Video_Translate/confirmar-email/');const callback=new URL(redirect);callback.searchParams.set('code','confirmation-code');const next=await context.newPage();await next.goto(callback.href);await expect(next.getByRole('heading',{name:'E-mail confirmado'})).toBeVisible();await expect(next.locator('#app')).not.toBeVisible();
  await next.getByRole('link',{name:'Continuar',exact:true}).click();await expect(next.locator('#access-reason')).toContainText('aprovação');await expect(next.locator('#app')).not.toBeVisible();
});

test('signed-in password change uses the existing session and displays server password errors',async({page,context})=>{
  const fixture=await mockAccess(context);await page.goto('./');await expect(page.locator('#app')).toBeVisible();await page.getByRole('button',{name:'Preferências',exact:true}).click();await page.locator('#change-account-password').click();await expect(page).toHaveURL(/\/nova-senha\/$/);await expect(page.locator('#recovery-form')).toBeVisible();await expect(page.locator('#app')).not.toBeVisible();
  await context.route('**/auth/v1/user',route=>route.request().method()==='PUT'?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({code:'weak_password',message:'Password is weak',weak_password:{reasons:['pwned']}})}):route.fulfill({contentType:'application/json',body:JSON.stringify(fixture.session.user)}));
  await page.locator('#recovery-password').fill(password);await page.locator('#recovery-confirmation').fill(password);await page.locator('#save-password').click();await expect(page.locator('#auth-error')).toContainText('política do sistema');await expect(page.locator('#save-password')).toBeEnabled();
  await page.getByRole('link',{name:'Voltar ao login'}).click();await expect(page.locator('#app')).toBeVisible();
});

test('custom token-hash recovery callback works without a PKCE verifier in a different browser',async({page,context})=>{
  const fixture=await mockAccess(context,{session:false});let verified=false;
  await context.route('**/auth/v1/verify',route=>{expect(route.request().postDataJSON()).toMatchObject({token_hash:'opaque-fixture-hash',type:'recovery'});verified=true;return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture.session)});});
  await page.goto(emailAction('reset-password.html','opaque-fixture-hash'));await expect(page.locator('#recovery-form')).toBeVisible();expect(verified).toBe(true);await expect(page).toHaveURL(/\/nova-senha\/$/);await expect(page.locator('#app')).not.toBeVisible();
});

test('the signup email template verifies its token and still requires master approval',async({page,context})=>{
 const fixture=await mockAccess(context,{session:false,status:'pending'});let verified=false;
 await context.route('**/auth/v1/verify',route=>{expect(route.request().postDataJSON()).toMatchObject({token_hash:'signup-fixture-hash',type:'signup'});verified=true;return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture.session)});});
 await page.goto(emailAction('confirm-signup.html','signup-fixture-hash'));await expect(page.getByRole('heading',{name:'E-mail confirmado'})).toBeVisible();expect(verified).toBe(true);await expect(page).toHaveURL(/\/confirmar-email\/$/);await expect(page.locator('#app')).not.toBeVisible();
 await page.getByRole('link',{name:'Continuar',exact:true}).click();await expect(page.locator('#access-reason')).toContainText('aprovação');await expect(page.locator('#app')).not.toBeVisible();
});

test('an expired email-template token cannot use an unrelated signed-in session',async({page,context})=>{
 await mockAccess(context);
 await context.route('**/auth/v1/verify',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error_code:'otp_expired',msg:'Email link is invalid or has expired'})}));
 await page.goto(emailAction('confirm-signup.html','expired-fixture-hash'));await expect(page.locator('#resend-confirmation-form')).toBeVisible();await expect(page.locator('#access-screen')).toContainText('inválido ou expirou');await expect(page.locator('#app')).not.toBeVisible();expect(new URL(page.url()).searchParams.has('token_hash')).toBe(false);
});
