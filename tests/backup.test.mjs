import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, readBackup } from '../src/backup-format.mjs';
import { publicAccessConfig, leaseDeadline, accessPayload } from '../src/access-protocol.mjs';
const password='uma senha local de teste';
const png=new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'});
const snapshot={collections:[{id:'collection',title:'Projeto interno',createdAt:1,subjects:[{id:'topic',title:'Assunto'}],notes:'Notas locais',lastMaterialId:'video'}],projects:[{id:'video',title:'Treinamento',filename:'secret.mp4',createdAt:2,size:3,lastModified:1,duration:3,collectionId:'collection',subjectId:'topic',sourceLanguage:'es',completedAt:3,analysis:'Análise local',segments:[{start:0,end:3,original:'Hola',translated:'Olá'}],video:new Blob(['abc'],{type:'video/mp4'}),apiKey:'DO-NOT-EXPORT'}],documents:[{id:'pdf',title:'Página',filename:'secret.pdf',createdAt:4,collectionId:'collection',subjectId:'topic',pages:[{number:1,preview:png,images:[{id:'img',width:1,height:1,y:1,blob:png}],blocks:[{id:'text',y:1,heading:true,original:'Welcome',translated:'Bem-vindo'}]}]}]};
test('encrypted local backup restores text, relationships, images, videos and progress, excluding credentials',async()=>{
 const file=await createBackup(snapshot,password);
 assert.ok(!(new TextDecoder().decode(await file.arrayBuffer())).includes('Projeto interno'));
 const restored=await readBackup(file,password);
 assert.equal(restored.collections[0].notes,'Notas locais');assert.equal(restored.collections[0].lastMaterialId,'video');
 assert.equal(restored.projects[0].sourceLanguage,'es');assert.equal(restored.projects[0].completedAt,3);assert.equal(restored.projects[0].analysis,'Análise local');
 assert.equal(restored.projects[0].subjectId,'topic');assert.equal(await restored.projects[0].video.text(),'abc');assert.equal('apiKey' in restored.projects[0],false);
 assert.equal(restored.documents[0].pages[0].blocks[0].translated,'Bem-vindo');assert.equal(restored.documents[0].pages[0].images[0].blob.type,'image/png');
 assert.deepEqual(new Uint8Array(await restored.documents[0].pages[0].preview.arrayBuffer()),new Uint8Array(await png.arrayBuffer()));
 const withoutVideo=await readBackup(await createBackup(snapshot,password,false),password);assert.equal(withoutVideo.projects[0].video,undefined);assert.equal(withoutVideo.projects[0].segments.length,1);
});
test('wrong passwords, corrupted backup and unsafe record ids are rejected before persistence',async()=>{
 const file=await createBackup(snapshot,password);
 await assert.rejects(()=>readBackup(file,'senha completamente errada'),/Senha incorreta/);
 const bytes=new Uint8Array(await file.arrayBuffer());bytes[bytes.length-1]^=1;await assert.rejects(()=>readBackup(new Blob([bytes]),password),/corrompido/);
 await assert.rejects(()=>createBackup({...snapshot,collections:[{...snapshot.collections[0],id:'" onmouseover="alert(1)'}]},password),/Identificação/);
 await assert.rejects(()=>createBackup(snapshot,'short'),/12 caracteres/);
});
test('access uses only public configuration, a bounded server lease and account-only request fields',()=>{
 assert.equal(publicAccessConfig({}),null);
 assert.throws(()=>publicAccessConfig({url:'https://example.supabase.co',publishableKey:'sb_secret_hidden'}));
 assert.throws(()=>publicAccessConfig({url:'https://example.supabase.co',publishableKey:`x.${btoa(JSON.stringify({role:'service_role'}))}.x`}));
 assert.equal(publicAccessConfig({url:'https://example.supabase.co',publishableKey:'sb_publishable_public'}).url,'https://example.supabase.co');
 assert.equal(leaseDeadline({allowed:true,profile:{id:'1',role:'master'},lease_seconds:999999},0),65000);
 assert.equal(leaseDeadline({allowed:false},0),0);
 assert.deepEqual(accessPayload('heartbeat',{video:new Blob(),text:'private',ip:'forged',user_id:'forged'}),{action:'heartbeat'});
 assert.deepEqual(accessPayload('update',{user_id:'user',status:'active',session_minutes:60,role:'master',video:'private'}),{action:'update',user_id:'user',status:'active',session_minutes:60});
 assert.throws(()=>accessPayload('toString'));
});

test('PKCE email-link verifiers cross tabs temporarily while access tokens remain session-only',async()=>{
 const { authStorage }=await import('../src/auth-storage.mjs');
 const store=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
 const local=store(),firstSession=store(),secondSession=store();let now=0;
 const first=authStorage(firstSession,local,()=>now),second=authStorage(secondSession,local,()=>now);
 first.setItem('auth','private-token');first.setItem('auth-code-verifier','temporary-verifier');
 assert.equal(local.getItem('auth'),null);assert.equal(second.getItem('auth'),null);assert.equal(second.getItem('auth-code-verifier'),'temporary-verifier');
 now=3600001;assert.equal(second.getItem('auth-code-verifier'),null);assert.equal(local.getItem('auth-code-verifier'),null);
});
