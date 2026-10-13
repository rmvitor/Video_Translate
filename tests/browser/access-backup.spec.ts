import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockAccess, USER_ID, USER_DB } from './fixtures';
const userFile={name:'local.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,title:'Treinamento local secreto',filename:'local.mp4',duration:4,segments:[{start:0,end:3,original:'Private training text.',translated:'Texto local confidencial.'}]}))};
async function counts(page:Page,name=USER_DB){return page.evaluate(async name=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(name,2);r.onupgradeneeded=()=>{for(const store of ['projects','documents','collections'])if(!r.result.objectStoreNames.contains(store))r.result.createObjectStore(store,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);});const result=await Promise.all(['projects','documents','collections'].map(store=>new Promise<number>(resolve=>{const r=db.transaction(store).objectStore(store).count();r.onsuccess=()=>resolve(r.result);})));db.close();return result;},name);}

test('unconfigured deployment fails closed and does not load the local library',async({page})=>{
 const calls:string[]=[];page.on('request',r=>{if(r.method()==='POST')calls.push(r.url());});
 await page.goto('./');await expect(page.getByRole('heading',{name:'Acesso em preparação'})).toBeVisible();await expect(page.locator('#app')).not.toBeVisible();expect(calls).toEqual([]);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('sign-in pending approval, grant and block keep library local and hide master actions',async({page,context})=>{
 await page.clock.install();const access=await mockAccess(context,{session:false,status:'pending'});await page.goto('./');
 await page.locator('#access-email').fill('fixture@example.test');await page.locator('#access-password').fill('fixture password only');await page.locator('#auth-submit').click();
 await expect(page.locator('#access-reason')).toContainText('aguarda');await expect(page.locator('#app')).not.toBeVisible();
 access.setStatus('active');await page.locator('#retry-access').click();await expect(page.locator('#app')).toBeVisible();await expect(page.locator('#admin-nav')).not.toBeVisible();
 await page.locator('#project-input').setInputFiles(userFile);await expect(page.locator('#file-title')).toHaveText('Treinamento local secreto');
 access.setStatus('blocked');await page.clock.fastForward(31000);await expect(page.locator('#access-reason')).toContainText('bloqueou');await expect(page.locator('#app')).not.toBeVisible();
 expect(await counts(page)).toEqual([1,0,0]);
 for(const call of access.calls.filter(call=>call.path.includes('/functions/')))expect(Object.keys(call.body)).toEqual(['action']);
 expect(JSON.stringify(access.calls)).not.toContain('Private training text');expect(JSON.stringify(access.calls)).not.toContain('local.mp4');
});

test('authorization lease expires without renewal and logout preserves local records',async({page,context})=>{
 await page.clock.install();await mockAccess(context,{lease:2});await page.goto('./');await expect(page.locator('#app')).toBeVisible();
 await page.locator('#project-input').setInputFiles(userFile);await expect(page.locator('#file-title')).toHaveText('Treinamento local secreto');
 await page.clock.fastForward(3000);await expect(page.locator('#app')).not.toBeVisible();expect(await counts(page)).toEqual([1,0,0]);
 await page.locator('#retry-access').click();await expect(page.locator('#app')).toBeVisible();await page.locator('#signout').click();await expect(page.locator('#signin-form')).toBeVisible();expect(await counts(page)).toEqual([1,0,0]);
 expect(await page.evaluate(()=>sessionStorage.getItem('entrelinhas.auth.127.0.0.1:4173'))).toBe(null);
});

test('master panel manages approval, time policy and revocation using account metadata only',async({page,context})=>{
 const access=await mockAccess(context,{role:'master'}),bodies:any[]=[];
 const member={id:'00000000-0000-4000-8000-000000000002',email:'member@example.test',display_name:'Usuário pendente',role:'user',status:'pending',session_minutes:60,active_seconds:120,last_ip:'203.0.113.5',last_seen_at:'2026-10-13T15:00:00Z',created_at:'2026-10-13T14:00:00Z'};
 await context.route('**/functions/v1/access-control',route=>{
  const body=route.request().postDataJSON();bodies.push(body);
  const reply=body.action==='list'?{users:[member],counts:{total:2,pending:1,active:1,blocked:0}}:body.action==='history'?{sessions:[{started_at:'2026-10-13T14:00:00Z',last_seen_at:member.last_seen_at,active_seconds:120,ip:member.last_ip,user_agent:'Fixture browser'}],events:[{created_at:member.created_at,event:'registration',details:{},ip:member.last_ip}]}:['update','revoke'].includes(body.action)?{ok:true}:{allowed:true,lease_seconds:65,profile:access.profile};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(reply)});
 });
 await page.goto('./');await expect(page.locator('#app')).toBeVisible();await page.locator('#admin-nav').click();await expect(page.locator('.admin-table')).toContainText('member@example.test');
 await page.locator('[data-policy]').click();await page.locator('#policy-status').selectOption('active');await page.locator('#policy-minutes').fill('120');await page.locator('#policy-end').fill('2026-11-01T17:30');await page.getByRole('button',{name:'Salvar política de acesso'}).click();
 const update=bodies.find(body=>body.action==='update');expect(update.status).toBe('active');expect(update.session_minutes).toBe(120);expect(update.user_id).toBe(member.id);expect(update.expires_at).toMatch(/^2026-11-01T/);expect(update.role).toBeUndefined();
 await page.locator('[data-revoke]').click();await page.locator('#confirm-revoke').click();expect(bodies.some(body=>body.action==='revoke'&&body.user_id===member.id)).toBe(true);
 await page.locator('[data-history]').click();await expect(page.locator('#admin-history')).toContainText('203.0.113.5');await page.screenshot({path:'/tmp/entrelinhas-master-access.png',fullPage:true});
});

test('encrypted local backup transfers projects, PDF images and saved video into a fresh browser without uploads',async({page,context,browser})=>{
 const access=await mockAccess(context);await page.goto('./');await expect(page.locator('#app')).toBeVisible();
 await page.evaluate(async name=>{
  const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d')!.fillRect(0,0,20,20);const image=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!),'image/png'));
  const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);});
  await new Promise<void>(resolve=>{const tx=db.transaction(['projects','documents','collections'],'readwrite');
   tx.objectStore('collections').put({id:'collection',title:'Projeto local secreto',createdAt:1,subjects:[{id:'topic',title:'Assunto'}],notes:'Notas locais',lastMaterialId:'pdf'});
   tx.objectStore('projects').put({id:'video',title:'Vídeo local',filename:'local.mp4',createdAt:2,duration:3,size:3,lastModified:1,collectionId:'collection',subjectId:'topic',completedAt:3,segments:[{start:0,end:3,original:'Private training text.',translated:'Texto local confidencial.'}],video:new Blob(['abc'],{type:'video/mp4'})});
   tx.objectStore('documents').put({id:'pdf',title:'Página local',filename:'local.pdf',createdAt:3,collectionId:'collection',subjectId:'topic',analysis:'Resumo local secreto',pages:[{number:1,preview:image,images:[{id:'img',blob:image,width:20,height:20,y:10}],blocks:[{id:'text',original:'Welcome',translated:'Bem-vindo',y:1,heading:true}]}]});tx.oncomplete=()=>resolve();});db.close();
 },USER_DB);
 await page.getByRole('button',{name:'Preferências',exact:true}).click();await page.locator('#backup-password').fill('minha senha de backup local');
 const download=page.waitForEvent('download');await page.locator('#export-backup').click();const file=readFileSync((await (await download).path())!);expect(file.toString()).not.toContain('Projeto local secreto');
 const other=await browser.newContext();try{
  const otherAccess=await mockAccess(other),second=await other.newPage();await second.goto(page.url());await expect(second.locator('#app')).toBeVisible();expect(await counts(second)).toEqual([0,0,0]);
  await second.getByRole('button',{name:'Preferências',exact:true}).click();await second.locator('#backup-password').fill('senha errada de backup');await second.locator('#backup-input').setInputFiles({name:'backup.entrelinhas',mimeType:'application/octet-stream',buffer:file});await expect(second.locator('#backup-status')).toContainText('Senha incorreta');expect(await counts(second)).toEqual([0,0,0]);
  await second.locator('#backup-password').fill('minha senha de backup local');await second.locator('#backup-input').setInputFiles({name:'backup.entrelinhas',mimeType:'application/octet-stream',buffer:file});await expect(second.locator('#backup-status')).toContainText('3 materiais/organizações adicionados');expect(await counts(second)).toEqual([1,1,1]);
  await second.getByRole('button',{name:'Projetos e assuntos',exact:true}).click();await second.getByRole('button',{name:'Abrir projeto',exact:true}).click();await expect(second.locator('#pdf-reader')).toContainText('Bem-vindo');await expect.poll(()=>second.locator('.pdf-figure img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(20);await expect(second.locator('.collection-header p')).toContainText('1/2');
  await second.getByRole('button',{name:'Preferências',exact:true}).click();await second.locator('#backup-password').fill('minha senha de backup local');await second.locator('#backup-input').setInputFiles({name:'backup.entrelinhas',mimeType:'application/octet-stream',buffer:file});await expect(second.locator('#backup-status')).toContainText('3 já existentes preservados');
  expect(JSON.stringify([...access.calls,...otherAccess.calls])).not.toMatch(/Private training text|local\.mp4|Resumo local secreto|Projeto local secreto/);
 }finally{await other.close();}
});

test('password recovery email link works in a new tab without persisting the auth token',async({page,context})=>{
 await mockAccess(context,{session:false});await page.goto('./');await page.locator('#access-email').fill('fixture@example.test');await page.locator('#forgot-password').click();
 await expect(page.locator('#auth-error')).toContainText('instruções de recuperação');
 expect(await page.evaluate(()=>localStorage.getItem('entrelinhas.auth.127.0.0.1:4173'))).toBe(null);
 const next=await context.newPage();await next.goto(page.url()+'?code=fixture-code');
 await expect(next.locator('#recovery-form')).toBeVisible();await next.locator('#recovery-password').fill('new fixture password only');await next.getByRole('button',{name:'Salvar nova senha'}).click();await expect(next.locator('#app')).toBeVisible();
 expect(await next.evaluate(()=>localStorage.getItem('entrelinhas.auth.127.0.0.1:4173'))).toBe(null);
});

test('different accounts on one device have separate local libraries and logout clears the previous UI',async({page,context})=>{
 const access=await mockAccess(context);const secondId='00000000-0000-4000-8000-000000000002';
 const token2=`${Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:secondId,session_id:'10000000-0000-4000-8000-000000000002',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture-signature`;
 const secondSession={...access.session,access_token:token2,user:{...access.session.user,id:secondId,email:'second@example.test'}};
 await context.route('**/auth/v1/token*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().postDataJSON().email==='second@example.test'?secondSession:access.session)}));
 await context.route('**/functions/v1/access-control',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({allowed:true,lease_seconds:65,profile:route.request().headers().authorization?.includes(token2)?{...access.profile,id:secondId,email:'second@example.test'}:access.profile})}));
 await page.goto('./');await expect(page.locator('#app')).toBeVisible();await page.locator('#project-input').setInputFiles(userFile);await expect(page.locator('#file-title')).toHaveText('Treinamento local secreto');
 await page.locator('#signout').click();await expect(page.locator('#signin-form')).toBeVisible();await page.locator('#access-email').fill('second@example.test');await page.locator('#access-password').fill('fixture password only');await page.locator('#auth-submit').click();await expect(page.locator('#app')).toBeVisible();
 await page.getByRole('button',{name:'Minha biblioteca'}).click();await expect(page.locator('.library-card')).toHaveCount(0);expect(await counts(page)).toEqual([1,0,0]);expect(await counts(page,`entrelinhas-local:user:${secondId}`)).toEqual([0,0,0]);
});
