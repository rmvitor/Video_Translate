// Real Piper + FFmpeg/WASM export of a synthetic video. No internal training
// files or real accounts are used. Requires the built app's static test server.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localAccessFixture,MODEL_DATABASE} from './local-access-fixture.mjs';
import {cloudModelTransport} from './model-transport.mjs';
const folder=mkdtempSync(join(tmpdir(),'entrelinhas-real-export-')),filename=`local-export-${Date.now()}.mp4`,input=join(folder,filename);
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x202641:s=320x180:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-shortest',input]);
const profile=process.env.AI_TEST_PROFILE||mkdtempSync(join(tmpdir(),'entrelinhas-export-profile-'));
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,acceptDownloads:true,args:['--no-sandbox']});
let report,stage="starting";
const progressTimer=setInterval(()=>console.log("Local export validation: "+stage),10000);
try{
 await localAccessFixture(context);const transfers=await cloudModelTransport(context),writes=[];context.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).hostname!=='127.0.0.1'&&r.method()!=='GET')writes.push(r.method()+' '+new URL(r.url()).origin);});
 const page=await context.newPage();await page.bringToFront();for(const other of context.pages())if(other!==page)await other.close();page.on('crash',()=>console.log('Export test renderer crashed.'));
 await page.goto('http://127.0.0.1:4173/Video_Translate/');await page.locator('#app').waitFor({state:'visible'});await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())?.unregister();});await page.goto('about:blank');await page.goto('http://127.0.0.1:4173/Video_Translate/');await page.locator('#app').waitFor({state:'visible'});await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
 await page.locator('#video-input').setInputFiles(input);await page.waitForFunction(()=>!document.querySelector('#remember').disabled);await page.locator('#remember').check();
 await page.waitForFunction(async({name,filename})=>{const db=await new Promise(resolve=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);});const rows=await new Promise(resolve=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return rows.some(p=>p.filename===filename&&p.video);},{name:MODEL_DATABASE,filename});
 const id=await page.evaluate(async({name,filename})=>{const db=await new Promise(resolve=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);});const id=await new Promise(resolve=>{const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects'),r=store.getAll();let id;r.onsuccess=()=>{const p=r.result.find(p=>p.filename===filename);id=p.id;p.segments=[{start:0,end:2,original:'Welcome.',translated:'Bem-vindo ao treinamento.'},{start:2,end:4,original:'Check the data.',translated:'Confira os dados antes de continuar.'}];store.put(p);};tx.oncomplete=()=>resolve(id);});db.close();return id;},{name:MODEL_DATABASE,filename});
 await page.reload();await page.locator('#app').waitFor({state:'visible'});await page.getByRole('button',{name:/^Minha biblioteca/}).click();await page.getByRole('tab',{name:'Vídeos',exact:true}).click();await page.locator(`[data-open="${id}"]`).click();
 async function render(audio,subtitles,name){stage='preparing '+name;await page.locator('#download-video').click();await page.locator('#download-audio').selectOption(audio);await page.locator('#download-subtitles').selectOption(subtitles);await page.locator('#prepare-video-download').click();await page.waitForFunction(()=>!document.querySelector('#video-export-result').hidden||Boolean(document.querySelector('#video-export-error').textContent),undefined,{timeout:300000});stage='ready '+name;const error=await page.locator('#video-export-error').textContent();if(error)throw new Error(error);const pending=page.waitForEvent('download');await page.locator('#save-export-video').click();const path=join(folder,name);stage='saving '+name;await(await pending).saveAs(path);await page.getByRole('button',{name:'Fechar',exact:true}).click();return path;}
 const file=await render('pt-BR','burned','narrated.mp4');
 const inspect=path=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}));
 const info=inspect(file),audio=info.streams.filter(s=>s.codec_type==='audio');assert.equal(audio.length,1);assert.equal(audio[0].codec_name,'aac');assert.equal(audio[0].tags.language,'por');assert.equal(info.streams.find(s=>s.codec_type==='video').codec_name,'h264');
 const samples=execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-f','s16le','pipe:1']);assert.ok(samples.some(byte=>byte!==0));
 const pixels=execFileSync('ffmpeg',['-v','error','-ss','0.5','-i',file,'-frames:v','1','-vf','crop=iw:ih/2:0:ih/2','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);let white=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i]>180&&pixels[i+1]>180&&pixels[i+2]>180)white++;assert.ok(white>50);
 await context.unrouteAll({behavior:'wait'});await localAccessFixture(context);await context.setOffline(true);
 const offlineFile=await render('both','track','offline-dual.mp4'),offline=inspect(offlineFile);assert.equal(offline.streams.filter(s=>s.codec_type==='audio').length,2);assert.equal(offline.streams.filter(s=>s.codec_type==='subtitle').length,2);assert.deepEqual(writes,[]);
 report={online:{file,duration:Number(info.format.duration),portugueseAAC:true,burnedCaptionWhitePixels:white},offline:{file:offlineFile,audioTracks:2,subtitleTracks:2},modelGETs:transfers(),externalWrites:writes};
}finally{clearInterval(progressTimer);await context.close();}
console.log(JSON.stringify(report,null,2));
