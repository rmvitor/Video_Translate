import { createClient, type Session, type SupabaseClient, type AuthError } from '@supabase/supabase-js';
import { authStorage } from './auth-storage.mjs';
import { publicAccessConfig, leaseDeadline, accessPayload, authLinkReason, authLinkMessage, savedAuthLinkReason } from './access-protocol.mjs';
import { passwordPolicy, passwordError } from './password-policy.mjs';
import {enhancePasswordInputs,concealPasswords,bindPasswordChecklist} from './password-fields';
export type AccessProfile = { id: string; email: string; display_name: string; role: 'user'|'master'; status: string; expires_at?: string };
type Options = { lock: () => Promise<void>; unlock: (profile: AccessProfile) => Promise<void>; toast: (message: string) => void };
type AuthPage = ''|'recuperar-senha'|'nova-senha'|'confirmar-email';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const genericRecovery='Se houver uma conta com esse e-mail, você receberá as instruções de recuperação. Confira também o spam. Abra o botão do e-mail neste mesmo navegador e perfil, onde o pedido foi feito.';
export function createAccess(options: Options) {
  const shell = document.querySelector<HTMLElement>('#app')!;
  const screen = document.createElement('section'); screen.id='access-screen'; shell.before(screen);
  const baseURL=new URL(import.meta.env.BASE_URL,document.baseURI);
  const pageURL=(page:AuthPage)=>new URL(page?`${page}/`:'./',baseURL).href;
  const currentPage=():AuthPage=>['recuperar-senha','nova-senha','confirmar-email'].find(page=>location.pathname.replace(/\/$/,'').endsWith('/'+page)) as AuthPage||'';
  let page=currentPage(),client: SupabaseClient | undefined, config: ReturnType<typeof publicAccessConfig>, session: Session|null=null, profile: AccessProfile|undefined;
  let granted=false, deadline=0, checking=false, generation=0, recovery=false, signingOut=false,initializing=true,authBusy=false,callbackFailure=false;
  let callbackReason='missing';
  let rememberedEmail='',confirmationComplete=false,uiVersion=0;
  let heartbeat: ReturnType<typeof setInterval>|undefined, watchdog: ReturnType<typeof setInterval>|undefined;
  let transition=Promise.resolve();
  shell.hidden=true; shell.inert=true;
  const policy=()=>config?.passwordPolicy||passwordPolicy();
  const requirements=(id:string)=>`<ul class="password-requirements" id="${id}" aria-label="Requisitos da senha"></ul><p class="password-help">Use uma senha exclusiva. Senhas conhecidas como expostas podem ser recusadas.</p>`;
  function cleanCallback(){history.replaceState({},'',pageURL(page)+(callbackFailure?'?link='+savedAuthLinkReason(callbackReason):''));}
  async function navigate(next:AuthPage,message=''){
    page=next;callbackFailure=false;callbackReason='missing';confirmationComplete=false;history.pushState({},'',pageURL(page));
    if(next)await lock(message);else if(session)await check('start');else show(message);
  }
  function serverPasswordError(error:AuthError){
    if(error.code==='weak_password')return 'A senha não atende à política do sistema. Confira os requisitos abaixo e use uma senha diferente.';
    if(error.code==='same_password')return 'Use uma senha diferente da atual.';
    if(error.code==='reauthentication_needed'||error.code==='reauthentication_not_valid')return 'Sua sessão exige nova autenticação. Solicite um link de recuperação para alterar a senha.';
    if(error.status===429||error.code?.includes('rate_limit'))return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    return 'Não foi possível alterar a senha. Confira a conexão, a validade do link e tente novamente.';
  }
  function show(message='',setup=false){
    const version=++uiVersion;screen.hidden=false;
    const field=(label:string,id:string,type='password',autocomplete='new-password')=>`<label class="field-label">${label}<input id="${id}" type="${type}" autocomplete="${autocomplete}" ${type==='password'?`minlength="${policy().minimumLength}"`: 'maxlength="254"'} required /></label>`;
    let heading='Entre para continuar',content='';
    if(setup){heading=initializing?'Verificando acesso':'Acesso em preparação';content='<p>Carregando a configuração de acesso. Se o problema persistir, contate o administrador.</p>';}
    else if(signingOut){heading='Encerrando sessão';content='<p>Encerrando sua sessão. Seus materiais locais estão preservados.</p>';}
    else if(page==='recuperar-senha'){
      heading='Recuperar senha';content=`<p>Informe seu e-mail para receber um link de recuperação.</p><form id="reset-request-form">${field('E-mail','reset-email','email','email')}<button class="button primary" id="send-recovery">Enviar link de recuperação</button><p id="auth-error" role="alert"></p></form><a class="text-button" data-auth-page="" href="${pageURL('')}">Voltar ao login</a>`;
    }else if(page==='nova-senha'||recovery){
      heading=recovery?'Defina uma nova senha':'Alterar senha';
      content=session&&!callbackFailure?`<form id="recovery-form">${field('Nova senha','recovery-password')}${field('Confirme a nova senha','recovery-confirmation')}${requirements('recovery-requirements')}<button class="button primary" id="save-password">Salvar nova senha</button><p id="auth-error" role="alert"></p></form><div class="inline-actions"><a class="text-button" data-auth-page="recuperar-senha" href="${pageURL('recuperar-senha')}">Solicitar outro link</a><a class="text-button" data-auth-page="" href="${pageURL('')}">Voltar ao login</a></div>`:`<p id="invalid-auth-link" role="alert">${authLinkMessage(callbackFailure?callbackReason:'missing')}</p><div class="inline-actions"><a class="button primary" data-auth-page="recuperar-senha" href="${pageURL('recuperar-senha')}">Solicitar novo link</a><a class="text-button" data-auth-page="" href="${pageURL('')}">Voltar ao login</a></div>`;
    }else if(page==='confirmar-email'){
      heading=confirmationComplete?'E-mail confirmado':'Confirme seu e-mail';
      content=confirmationComplete?`<p>Seu e-mail foi confirmado. O acesso à ferramenta depende da aprovação do master.</p><a class="button primary" data-auth-page="" href="${pageURL('')}">Continuar</a>`:`${callbackFailure?`<p role="alert">${authLinkMessage(callbackReason)}</p>`:'<p>Confira a caixa de entrada e o spam. Use o botão do e-mail no mesmo navegador e perfil em que solicitou o cadastro. Depois da confirmação, aguarde a aprovação do master.</p>'}<form id="resend-confirmation-form">${field('E-mail','confirmation-email','email','email')}<button class="button primary" id="resend-confirmation">Reenviar confirmação</button><p id="auth-error" role="alert"></p></form><a class="text-button" data-auth-page="" href="${pageURL('')}">Voltar ao login</a>`;
    }else if(callbackFailure){heading='Não foi possível validar o link';content=`<p id="invalid-auth-link" role="alert">${authLinkMessage(callbackFailure?callbackReason:'missing')}</p><a class="button primary" data-auth-page="recuperar-senha" href="${pageURL('recuperar-senha')}">Solicitar novo link</a>`;}
    else if(session){heading='Sua conta';content=`<strong>${esc(session.user.email)}</strong><p id="access-reason">${esc(message)}</p><div class="inline-actions"><button class="button primary" id="retry-access">Verificar acesso novamente</button><button class="button secondary" id="gate-signout">Sair da conta</button></div>`;}
    else content=`<form id="signin-form">${field('E-mail','access-email','email','username')}<label class="field-label">Senha<input id="access-password" type="password" autocomplete="current-password" minlength="1" required aria-describedby="signup-requirements" /></label><div id="signup-password-help" hidden>${requirements('signup-requirements')}</div><label class="field-label" id="signup-name-field" hidden>Nome<input id="access-name" maxlength="120" autocomplete="name" /></label><label class="field-label" id="signup-contact-field" hidden>Contato (telefone ou WhatsApp)<input id="access-contact" type="tel" maxlength="120" autocomplete="tel" /></label><button class="button primary" id="auth-submit">Entrar</button><p id="auth-error" role="alert"></p></form><div class="inline-actions"><button class="text-button" id="toggle-signup">Solicitar acesso</button><a class="text-button" id="forgot-password" data-auth-page="recuperar-senha" href="${pageURL('recuperar-senha')}">Esqueci minha senha</a></div>`;
    screen.innerHTML=`<div class="access-card"><a class="access-brand" data-auth-page="" href="${pageURL('')}">entrelinhas<span>.</span></a><h1>${heading}</h1>${content}<p class="access-status" id="access-status" role="status" aria-live="polite">${!session||page?esc(message):''}</p></div>`;
    screen.querySelectorAll<HTMLButtonElement>('form button').forEach(button=>button.type='submit');
    enhancePasswordInputs(screen);
    for(const [inputId,listId] of [['access-password','signup-requirements'],['recovery-password','recovery-requirements']]){
      const input=screen.querySelector<HTMLInputElement>('#'+inputId),list=screen.querySelector<HTMLElement>('#'+listId);
      if(input&&list)bindPasswordChecklist(input,list,policy());
    }
    screen.querySelector('#access-password')?.removeAttribute('aria-describedby');
    for(const id of ['access-email','reset-email','confirmation-email']){const input=screen.querySelector<HTMLInputElement>('#'+id);if(input)input.value=rememberedEmail;}
    screen.querySelectorAll<HTMLAnchorElement>('[data-auth-page]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();if(authBusy)return;rememberedEmail=screen.querySelector<HTMLInputElement>('input[type=email]')?.value.trim()||rememberedEmail;recovery=false;void navigate(link.dataset.authPage as AuthPage);}));
    let signup=false;
    screen.querySelector('#toggle-signup')?.addEventListener('click',()=>{
      signup=!signup;screen.querySelector('#auth-error')!.textContent='';
      for(const id of ['signup-name-field','signup-contact-field','signup-password-help'])screen.querySelector<HTMLElement>('#'+id)!.hidden=!signup;
      for(const id of ['access-name','access-contact'])screen.querySelector<HTMLInputElement>('#'+id)!.required=signup;
      screen.querySelector('h1')!.textContent=signup?'Solicitar cadastro':'Entre para continuar';screen.querySelector('#auth-submit')!.textContent=signup?'Solicitar acesso':'Entrar';screen.querySelector('#toggle-signup')!.textContent=signup?'Já tenho uma conta':'Solicitar acesso';
      const password=screen.querySelector<HTMLInputElement>('#access-password')!;password.autocomplete=signup?'new-password':'current-password';password.minLength=signup?policy().minimumLength:1;
      if(signup)password.setAttribute('aria-describedby','signup-requirements signup-requirements-summary');else password.removeAttribute('aria-describedby');
      concealPasswords(screen);
    });
    async function submit(formId:string,action:(form:HTMLFormElement)=>Promise<void>){
      const form=screen.querySelector<HTMLFormElement>('#'+formId);if(!form)return;
      form.addEventListener('input',()=>{if(!authBusy)form.querySelector('#auth-error')!.textContent='';});
      form.addEventListener('submit',async event=>{
        event.preventDefault();if(!client||authBusy)return;const button=form.querySelector<HTMLButtonElement>('button[type=submit]')!,label=button.textContent;
        authBusy=true;button.disabled=true;button.textContent='Aguarde…';form.setAttribute('aria-busy','true');const error=form.querySelector('#auth-error')!;error.textContent='';
        try{await action(form);}catch(err){if(version===uiVersion)error.textContent=err instanceof Error?err.message:'Não foi possível conectar ao serviço. Tente novamente.';}
        finally{authBusy=false;if(version===uiVersion){button.disabled=false;button.textContent=button.dataset.nextLabel||label;form.removeAttribute('aria-busy');}}
      });
    }
    const input=(form:HTMLFormElement,id:string)=>form.querySelector<HTMLInputElement>('#'+id)!.value;
    void submit('signin-form',async form=>{
      const email=input(form,'access-email').trim(),password=input(form,'access-password');rememberedEmail=email;
      if(signup){const error=passwordError(password,policy());if(error)throw new Error(error);}
      const result=signup?await client!.auth.signUp({email,password,options:{data:{display_name:input(form,'access-name').trim(),contact:input(form,'access-contact').trim()},emailRedirectTo:pageURL('confirmar-email')}}):await client!.auth.signInWithPassword({email,password});
      if(version!==uiVersion)return;
      if(result.error)throw new Error(signup?(result.error.code==='weak_password'?serverPasswordError(result.error):'Não foi possível solicitar o cadastro. Confira os dados, os requisitos da senha e tente novamente.'):'Não foi possível entrar. Confira e-mail, senha e confirmação da conta.');
      if(signup&&!result.data.session){await navigate('confirmar-email');return;}
      session=result.data.session;await check('start');
    });
    void submit('reset-request-form',async form=>{
      rememberedEmail=input(form,'reset-email').trim();
      const result=await client!.auth.resetPasswordForEmail(rememberedEmail,{redirectTo:pageURL('nova-senha')});
      if(version!==uiVersion)return;
      // Never disclose account existence, including Auth's user-not-found response.
      if(result.error&&result.error.code!=='user_not_found')throw new Error(result.error.status===429?'Muitas solicitações. Aguarde alguns minutos antes de reenviar.':'Não foi possível enviar o link. Confira a conexão e tente novamente.');
      screen.querySelector('#access-status')!.textContent=genericRecovery;(form.querySelector('button') as HTMLButtonElement).dataset.nextLabel='Reenviar link de recuperação';
    });
    void submit('resend-confirmation-form',async form=>{
      rememberedEmail=input(form,'confirmation-email').trim();
      const result=await client!.auth.resend({type:'signup',email:rememberedEmail,options:{emailRedirectTo:pageURL('confirmar-email')}});
      if(version!==uiVersion)return;
      if(result.error&&result.error.code!=='user_not_found')throw new Error('Não foi possível reenviar agora. Aguarde alguns minutos e tente novamente.');
      screen.querySelector('#access-status')!.textContent='Se houver uma confirmação pendente para esse e-mail, enviaremos um novo link.';
    });
    void submit('recovery-form',async form=>{
      const password=input(form,'recovery-password'),confirmation=input(form,'recovery-confirmation'),error=passwordError(password,policy());
      if(error)throw new Error(error);if(password!==confirmation)throw new Error('As senhas não coincidem. Confira a confirmação.');
      const current=await client!.auth.getSession(),verified=await client!.auth.getUser();
      if(version!==uiVersion)return;
      if(callbackFailure||current.error||!current.data.session||verified.error||verified.data.user?.id!==current.data.session.user.id){if(!callbackFailure)callbackReason=verified.error&&authLinkReason(verified.error)==='unavailable'?'unavailable':'session';callbackFailure=true;cleanCallback();show();return;}
      const result=await client!.auth.updateUser({password});
      if(version!==uiVersion)return;
      if(result.error)throw new Error(serverPasswordError(result.error));
      rememberedEmail=result.data.user?.email||rememberedEmail;recovery=false;page='';cleanCallback();await signout();show('Senha alterada com sucesso. Entre com sua nova senha.');
    });
    screen.querySelector('#retry-access')?.addEventListener('click',()=>void check('start'));
    screen.querySelector('#gate-signout')?.addEventListener('click',()=>void signout());
  }
  async function lock(message:string){
    const wasGranted=granted;generation++;granted=false;deadline=0;profile=undefined;shell.hidden=true;shell.inert=true;
    document.querySelector<HTMLDialogElement>('#dialog')?.close();show(message);
    if(wasGranted)transition=transition.then(options.lock);await transition;
    document.dispatchEvent(new CustomEvent('access-changed'));
  }
  async function call(action:string,values:Record<string,unknown>={}) {
    if(!client||!config||!session)throw new Error('Entre na sua conta.');
    if(!['start','heartbeat','logout'].includes(action)&&(!granted||performance.now()>=deadline))throw new Error('Sua autorização precisa ser renovada.');
    const current=await client.auth.getSession();if(!current.data.session)throw new Error('Sessão encerrada.');
    const response=await fetch(`${config.url}/functions/v1/access-control`,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:`Bearer ${current.data.session.access_token}`},body:JSON.stringify(accessPayload(action,values)),signal:AbortSignal.timeout(12000),cache:'no-store'});
    if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(typeof detail.error==='string'&&detail.error.length<=500?detail.error:response.status===401?'Sessão inválida. Entre novamente.':response.status===403?'Você não tem permissão para esta operação.':'Não foi possível consultar o controle de acesso.');}
    return response.json();
  }
  const reasons:Record<string,string>={pending:'Seu cadastro aguarda a aprovação do master.',blocked:'O master bloqueou o acesso desta conta.',removed:'Seu acesso foi removido. Entre em contato com o administrador.',expired:'A validade do seu acesso terminou. Solicite a liberação ao master.',not_started:'Seu período de acesso ainda não começou.',unconfirmed:'Confirme o e-mail da conta para continuar.',session_expired:'Sua sessão terminou ou foi revogada. Saia da conta e entre novamente.',signed_out:'Você saiu da conta.'};
  async function check(action:'start'|'heartbeat') {
    if(checking||!session||recovery||page||callbackFailure||signingOut)return; checking=true;const epoch=generation;
    try {
      const response=await call(action);if(epoch!==generation)return;
      const until=leaseDeadline(response,performance.now());
      if(!until){await lock(reasons[response.reason]||'Acesso não autorizado.');return;}
      if(response.profile.id!==session.user.id)throw new Error('Resposta de autorização inválida.');
      deadline=until;profile=response.profile;
      if(!granted){await transition;await options.unlock(profile!);if(epoch!==generation)return;granted=true;}
      concealPasswords(screen,true);
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
  async function init(){
    show('Verificando configuração…',true);
    const params=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
    const callbackType=params.get('type')||hash.get('type'),code=params.get('code'),tokenHash=params.get('token_hash');
    const urlError=params.get('error_code')||hash.get('error_code')||params.get('error')||hash.get('error');
    const savedFailure=params.has('link');
    const callback=Boolean(code||tokenHash||hash.get('access_token')||urlError||savedFailure);
    if(callbackType==='invite'||callbackType==='recovery'){recovery=true;page='nova-senha';}
    try{
      const response=await fetch(new URL('access-config.json',baseURL),{cache:'no-cache'});config=publicAccessConfig(await response.json());
      if(!config){initializing=false;show('',true);return;}
      client=createClient(config.url,config.publishableKey,{global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal||AbortSignal.timeout(12000)})},auth:{persistSession:true,storage:authStorage(sessionStorage,localStorage),storageKey:`entrelinhas.auth.${new URL(config.url).host}`,flowType:hash.has('access_token')?'implicit':'pkce',detectSessionInUrl:true,autoRefreshToken:true}});
      client.auth.onAuthStateChange((event,value)=>{
        if(signingOut)return;
        if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){session=value;return;}
        if(event==='PASSWORD_RECOVERY'){recovery=true;page='nova-senha';}
        if(event==='SIGNED_OUT'){generation++;session=null;if(!initializing&&!authBusy)void lock('Sua sessão terminou. Entre novamente.');return;}
        if(value){session=value;if(page==='nova-senha'&&screen.querySelector('#recovery-form'))return;if(!initializing&&!authBusy)queueMicrotask(()=>{if(recovery){cleanCallback();void lock('Defina sua nova senha.');}else if(page)show();else void check('start');});}
      });
      const initialized=await client.auth.initialize();
      callbackFailure=Boolean(initialized.error||urlError||savedFailure);
      if(callbackFailure)callbackReason=urlError?authLinkReason({code:urlError}):initialized.error?authLinkReason(initialized.error):savedAuthLinkReason(params.get('link'));
      if(tokenHash&&!callbackFailure){
        if(callbackType!=='recovery'&&callbackType!=='signup'&&callbackType!=='invite'&&callbackType!=='email'){callbackFailure=true;callbackReason='invalid';}
        else{const verified=await client.auth.verifyOtp({token_hash:tokenHash,type:callbackType});callbackFailure=Boolean(verified.error);if(verified.error)callbackReason=authLinkReason(verified.error);session=verified.data.session;}
      }
      // Without this browser's PKCE verifier a code must never fall back to an
      // unrelated existing session. The SDK leaves unmatched codes in the URL.
      if(code&&new URLSearchParams(location.search).has('code')&&!callbackFailure){callbackFailure=true;callbackReason='browser';}
      const current=await client.auth.getSession();session=current.data.session;
      if(callback&&!session&&!callbackFailure){callbackFailure=true;callbackReason='missing';}
      if(recovery)page='nova-senha';
      if(page==='confirmar-email'&&callback&&!callbackFailure&&session)confirmationComplete=true;
      if(callback)cleanCallback();initializing=false;
      if(page||callbackFailure||recovery)show();else if(session)await check('start');else show();
      heartbeat=setInterval(()=>{if(session&&granted&&!document.hidden)void check('heartbeat');},30000);
      watchdog=setInterval(()=>{if(granted&&performance.now()>=deadline)void lock('A autorização venceu. Conecte-se e verifique o acesso novamente.');},1000);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&!page)void check(granted?'heartbeat':'start');});
      window.addEventListener('online',()=>{if(session&&!page)void check(granted?'heartbeat':'start');});
      window.addEventListener('popstate',()=>{if(authBusy)return;page=currentPage();recovery=false;callbackFailure=false;callbackReason='missing';if(page)void lock('');else if(session)void check('start');else show();});
    }catch{initializing=false;show('Não foi possível carregar o acesso. Confira a conexão e recarregue a página.',true);}
  }
  document.addEventListener('click',event=>{if((event.target as Element).closest('#change-account-password')&&granted)void navigate('nova-senha');});
  return {init,call,signout,get granted(){return granted&&performance.now()<deadline;},get profile(){return profile;},get ready(){return Boolean(config);}};
}
