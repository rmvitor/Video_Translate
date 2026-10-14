import {test,expect,type Page} from '@playwright/test';
import {mockAccess,USER_DB} from './fixtures';

async function seed(page:Page){
 await page.goto('./');await expect(page.locator('#app')).toBeVisible();
 await page.evaluate(async name=>{
  const canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;const preview=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!)));
  const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(name,2);request.onsuccess=()=>resolve(request.result);});
  await new Promise<void>(resolve=>{const tx=db.transaction(['collections','projects','documents'],'readwrite');
   tx.objectStore('collections').put({id:'a',title:'Projeto A',createdAt:2,subjects:[{id:'s1',title:'Assunto 1'},{id:'s2',title:'Assunto 2'}]});
   tx.objectStore('collections').put({id:'b',title:'Projeto B',createdAt:1,subjects:[{id:'b1',title:'Assunto B'}]});
   for(const [id,title,order] of [['pdf1','Página 1',0],['pdf2','Página 2',1]] as const)tx.objectStore('documents').put({id,title,filename:id+'.pdf',createdAt:order+1,collectionId:'a',subjectId:'s1',sortOrder:order,pages:[{number:1,preview,images:[],blocks:[{id:'block-'+id,original:'Welcome to training.',translated:'Bem-vindo ao treinamento.',y:1,heading:false}]}]});
   tx.objectStore('projects').put({id:'video1',title:'Vídeo 1',filename:'private.mp4',duration:3,segments:[{start:0,end:3,original:'Welcome.',translated:'Bem-vindo.'}],createdAt:3,collectionId:'a',subjectId:'s1',sortOrder:2});
   tx.oncomplete=()=>resolve();
  });db.close();
 },USER_DB);
 await page.getByRole('button',{name:'Projetos e assuntos',exact:true}).click();await page.locator('[data-collection="a"]').click();await expect(page.locator('.collection-header h2')).toHaveText('Projeto A');
}
async function record(page:Page,store:string,id:string){return page.evaluate(async({name,store,id})=>{const db=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(name,2);request.onsuccess=()=>resolve(request.result);});return new Promise<any>(resolve=>{const request=db.transaction(store).objectStore(store).get(id);request.onsuccess=()=>{db.close();resolve(request.result);};});},{name:USER_DB,store,id});}

test('project navigation moves and orders materials, deletes individual files and deletes projects only from the list',async({page,context})=>{
 await mockAccess(context);await seed(page);
 await expect(page.locator('#new-collection')).not.toBeVisible();await expect(page.locator('[data-delete-collection]')).toHaveCount(0);await expect(page.locator('#pdf-settings')).not.toHaveAttribute('open','');
 await page.locator('[data-move-material="video1"]').click();await page.locator('#move-subject').selectOption('s2');await page.getByRole('button',{name:'Mover material',exact:true}).click();
 await expect(page.locator('.outline-topic').filter({has:page.locator('[data-subject="s2"]')}).locator('.outline-material')).toContainText('Vídeo 1');
 await expect(page.locator('#project-outlet #pdf-reader')).toContainText('Página 1');
 await page.locator('[data-move-material="pdf2"]').click();await page.locator('#move-position').selectOption('0');await page.getByRole('button',{name:'Mover material',exact:true}).click();
 await expect(page.locator('.outline-material').first()).toContainText('Página 2');expect((await record(page,'documents','pdf2')).sortOrder).toBe(0);
 await page.locator('[data-move-material="pdf2"]').click();await page.locator('#move-subject').selectOption('s2');await page.getByRole('button',{name:'Mover material',exact:true}).click();
 await expect(page.locator('.outline-topic').filter({has:page.locator('[data-subject="s2"]')}).locator('[data-material="pdf2"]')).toContainText('Página 2');
 await page.locator('[data-move-material="video1"]').click();await page.locator('#move-collection').selectOption('b');await page.locator('#move-subject').selectOption('b1');await page.getByRole('button',{name:'Mover material',exact:true}).click();
 await expect(page.locator('[data-material="video1"]')).toHaveCount(0);expect((await record(page,'projects','video1')).collectionId).toBe('b');
 await page.locator('[data-remove-material="pdf2"]').click();await page.locator('#confirm-delete-material').click();await expect(page.locator('[data-material="pdf2"]')).toHaveCount(0);expect(await record(page,'documents','pdf2')).toBeUndefined();
 await page.locator('#back-collections').click();await expect(page.locator('#new-collection')).toBeVisible();await page.locator('[data-delete-collection="a"]').click();await page.locator('#confirm-remove-organization').click();await expect(page.locator('[data-collection="a"]')).toHaveCount(0);
 expect(await record(page,'collections','a')).toBeUndefined();expect((await record(page,'documents','pdf1')).collectionId).toBeUndefined();expect((await record(page,'projects','video1')).collectionId).toBe('b');
});

test('dark theme covers a short full-height page and the whole sidebar follows the chosen color',async({page,context})=>{
 await mockAccess(context);await page.setViewportSize({width:2048,height:1200});await page.goto('./');await page.getByRole('button',{name:'Preferências',exact:true}).click();await page.locator('#theme-choice').selectOption('dark');
 const initial=await page.locator('#sidebar').evaluate(element=>getComputedStyle(element).backgroundColor);
 await page.locator('#accent-choice').fill('#0d9488');
 const colors=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).backgroundColor,body:getComputedStyle(document.body).backgroundColor,app:getComputedStyle(document.querySelector('#app')!).backgroundColor,height:document.body.getBoundingClientRect().height,viewport:innerHeight,sidebar:getComputedStyle(document.querySelector('#sidebar')!).backgroundColor}));
 expect(colors.root).toBe('rgb(20, 23, 36)');expect(colors.body).toBe(colors.root);expect(colors.app).toBe(colors.root);expect(colors.height).toBeGreaterThanOrEqual(colors.viewport);expect(colors.sidebar).not.toBe(initial);
 await page.getByRole('button',{name:'Projetos e assuntos',exact:true}).click();await page.getByRole('button',{name:'Criar projeto',exact:true}).click();expect(await page.locator('#dialog').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(28, 32, 48)');
 await page.screenshot({path:'/tmp/entrelinhas-dark-updated.png',fullPage:true});
});

test('simplified signup sends name and contact as account metadata and keeps the tool locked',async({page,context})=>{
 const fixture=await mockAccess(context,{session:false});await page.goto('./');await expect(page.locator('#signin-form')).toBeVisible();await expect(page.locator('#access-screen')).not.toContainText('O Supabase recebe');
 await page.locator('#toggle-signup').click();await page.locator('#access-email').fill('customer@example.test');await page.locator('#access-password').fill('1234567');await page.locator('#access-name').fill('Cliente de teste');await page.locator('#access-contact').fill('+55 11 90000-0000');await page.locator('#auth-submit').click();
 expect(fixture.calls.filter(call=>call.path.endsWith('/signup'))).toHaveLength(0);
 await page.locator('#access-password').fill('12345678');await page.locator('#auth-submit').click();
 await expect(page.locator('#resend-confirmation-form')).toBeVisible();await expect(page.locator('#app')).not.toBeVisible();
 const signup=fixture.calls.find(call=>call.path.endsWith('/signup'));expect(signup.body.password).toBe('12345678');expect(signup.body.data).toEqual({display_name:'Cliente de teste',contact:'+55 11 90000-0000'});expect(signup.body.data.role).toBeUndefined();
});

test('invited user defines a password before the tool can open',async({page,context})=>{
 const fixture=await mockAccess(context,{session:false});
 const hash=new URLSearchParams({access_token:fixture.session.access_token,refresh_token:fixture.session.refresh_token,expires_in:'3600',token_type:'bearer',type:'invite'});
 await page.goto('./#'+hash);await expect(page.locator('#recovery-form')).toBeVisible();await expect(page.locator('#app')).not.toBeVisible();
 await page.locator('#recovery-password').fill('12345678');await page.locator('#recovery-confirmation').fill('12345678');await page.getByRole('button',{name:'Salvar nova senha'}).click();await expect(page.locator('#access-status')).toContainText('Senha alterada com sucesso');await expect(page.locator('#signin-form')).toBeVisible();
 expect(fixture.calls.some(call=>call.path.endsWith('/user')&&call.method==='PUT')).toBe(true);
});

test('master invites, approves, controls commercial terms and removes access without handling content',async({page,context})=>{
 const fixture=await mockAccess(context,{role:'master'}),calls:any[]=[],member={id:'00000000-0000-4000-8000-000000000002',email:'customer@example.test',display_name:'Cliente',contact:'+55 11 90000-0000',role:'user',status:'pending',session_minutes:480,active_seconds:0};
 await context.route('**/functions/v1/access-control',route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(body.action==='update')Object.assign(member,body);if(body.action==='remove')member.status='removed';
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body.action==='list'?{api_version:2,schema_version:2,users:[member],counts:{total:2,pending:1,active:1,blocked:0,removed:0,expired:0}}:['invite','update','remove','revoke'].includes(body.action)?{ok:true,api_version:2}:{allowed:true,lease_seconds:65,profile:fixture.profile})});
 });
 await page.goto('./');await page.locator('#admin-nav').click();await expect(page.locator('#invite-user')).toBeEnabled();await expect(page.locator('.admin-table')).toContainText('+55 11 90000-0000');
 await page.locator('#admin-status').selectOption('pending');await expect.poll(()=>calls.filter(call=>call.action==='list').at(-1)?.status).toBe('pending');
 await page.locator('#invite-user').click();await page.locator('#invite-name').fill('Novo cliente');await page.locator('#invite-email').fill('new@example.test');await page.locator('#invite-contact').fill('11999990000');await page.getByRole('button',{name:'Enviar convite',exact:true}).click();await expect(page.locator('#dialog')).not.toBeVisible();
 expect(calls.find(call=>call.action==='invite')).toEqual({action:'invite',email:'new@example.test',display_name:'Novo cliente',contact:'11999990000'});
 await page.locator('[data-approve]').click();await expect(page.locator('.admin-table .status-label')).toHaveText('Liberado');
 await page.locator('[data-policy]').click();await page.locator('[data-release-days="30"]').click();await page.locator('#policy-plan').fill('Mensal');await page.locator('#policy-billing').selectOption('paid');await page.locator('#policy-amount').fill('49.90');await page.locator('#policy-notes').fill('Pagamento confirmado');await page.getByRole('button',{name:'Salvar política de acesso'}).click();await expect(page.locator('#dialog')).not.toBeVisible();
 const update=calls.filter(call=>call.action==='update').at(-1);expect(update.amount_cents).toBe(4990);expect(update.billing_status).toBe('paid');expect(Date.parse(update.expires_at)).toBeGreaterThan(Date.parse(update.starts_at));
 await page.locator('[data-remove-access]').click();await page.locator('#confirm-revoke').click();await expect(page.locator('.admin-table .status-label')).toHaveText('Acesso removido');expect(calls.some(call=>call.action==='remove')).toBe(true);
 expect(JSON.stringify(calls)).not.toMatch(/video|transcript|fileData|inlineData/);
});

test('Gemini recovers from unavailable model with discovered text models and sends only consented text',async({page,context})=>{
 await mockAccess(context);const requests:any[]=[];
 await context.route('https://generativelanguage.googleapis.com/v1beta/models**',route=>{
  const request=route.request(),url=request.url();requests.push({url,method:request.method(),body:request.method()==='POST'?request.postDataJSON():null});
  if(request.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({models:[{name:'models/gemini-3-flash-preview',displayName:'Available Flash',supportedGenerationMethods:['generateContent']},{name:'models/gemini-tts',supportedGenerationMethods:['generateContent']}]})});
  if(url.includes('gemini-2.5-flash:'))return route.fulfill({status:404,body:'model unavailable'});
  const units=JSON.parse(request.postDataJSON().contents[0].parts[0].text).units;
  return route.fulfill({contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({translations:units.map((unit:any)=>({id:unit.id,translated:'Tradução pelo modelo disponível.'}))})}]}}]})});
 });
 await seed(page);await page.locator('#online-pdf').click();await page.locator('#review-gemini-key').fill('fictional-key-for-tests');await page.locator('#online-consent').check();await page.locator('#send-online').click();await expect(page.locator('#apply-online')).toBeVisible();
 expect(requests.map(request=>request.method)).toEqual(['POST','GET','POST']);expect(requests[2].url).toContain('gemini-3-flash-preview:generateContent');expect(requests[0].body).toEqual(requests[2].body);expect(JSON.stringify(requests)).not.toContain('private.mp4');
 await page.locator('#apply-online').click();await expect(page.locator('.pdf-copy').first()).toHaveText('Tradução pelo modelo disponível.');
});
