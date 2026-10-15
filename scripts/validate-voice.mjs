import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localAccessFixture} from './local-access-fixture.mjs';
import {buildNarrationPlan} from '../src/narration-plan.mjs';
import {cloudModelTransport} from './model-transport.mjs';

// Harmless public sample only. Authorization is simulated; speech inference is real.
const profile=process.env.VOICE_TEST_PROFILE||await mkdtemp(join(tmpdir(),'entrelinhas-voice-'));
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  await localAccessFixture(context);const transfers=await cloudModelTransport(context);
  await context.addInitScript(()=>{
    const pause=HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause=function(){if(this instanceof HTMLAudioElement&&window.__captureVoicePauses&&!this.ended&&this.currentTime<this.duration-.05)window.__voicePauses++;return pause.call(this);};
    const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){const media=this;return original.call(this).then(()=>{if(media instanceof HTMLAudioElement)(window).__testVoiceAudio=media;});};
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{constructor(url,options){super(url,options);if(String(url).includes('neural-voice.worker'))this.addEventListener('message',event=>{if(event.data.type==='audio')window.__voiceMarks=event.data.marks;});}};
  });
  const page=await context.newPage();await page.bringToFront();for(const other of context.pages())if(other!==page)await other.close();page.on('requestfailed',request=>console.log('Voice asset request failed: '+new URL(request.url()).pathname+' '+request.failure()?.errorText));page.on('crash',()=>console.log('Voice test renderer crashed.'));page.on('console',msg=>{if(msg.type()==='error')console.log('Browser runtime error: '+msg.text().slice(0,250));else if(msg.text().startsWith('Generating local voice:')||msg.text().startsWith('Voice progress:'))console.log(msg.text());});
  await page.goto('http://127.0.0.1:4173/Video_Translate/');await page.locator('#app').waitFor({state:'visible'});
  // Reused synthetic profiles retain public models, but may still run the
  // previous build's service worker. Install this build's shell before testing
  // offline workers. This touches only the dedicated test browser profile.
  await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())?.unregister();});
  await page.goto('about:blank');await page.goto('http://127.0.0.1:4173/Video_Translate/');await page.locator('#app').waitFor({state:'visible'});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  const worker=(await readdir('dist/assets')).find(name=>/^neural-voice.worker-.*\.js$/.test(name));if(!worker)throw new Error('Voice worker missing from build');
  const mixed=buildNarrationPlan([{id:'intro',text:'Abra o Insight e confira Home Management.',original:'Open Insight and Home Management.'},{id:'next',text:'Confira os dados antes de continuar.'}],'mixed');
  const run=async offline=>page.evaluate(async({worker,offline,mixed})=>{
    const voice=new Worker(new URL('assets/'+worker,location.href),{type:'module'});let id=0;
    const say=chunks=>new Promise((resolve,reject)=>{
      console.log('Generating local voice:',[...new Set(chunks.map(chunk=>chunk.lang))].join(', '));
      const request=++id;const timer=setTimeout(()=>reject(new Error('Voice inference timeout')),240000);
      voice.onmessage=event=>{
        const message=event.data;if(message.type==='progress'){console.log('Voice progress: '+message.message);return;}if(message.id!==request)return;clearTimeout(timer);
        if(message.type==='error'){reject(new Error(message.message));return;}
        const audio=new DataView(message.audio);let peak=0;for(let offset=44;offset<audio.byteLength;offset+=2)peak=Math.max(peak,Math.abs(audio.getInt16(offset,true)));
        const sampleRate=audio.getUint32(24,true);resolve({bytes:audio.byteLength,sampleRate,seconds:(audio.byteLength-44)/2/sampleRate,peak,marks:message.marks});
      };
      voice.onerror=()=>{clearTimeout(timer);reject(new Error('Voice worker failed'));};voice.postMessage({id:request,chunks,baseURL:new URL('./',location.href).href});
    });
    try{return [await say([{text:offline?'A voz continua funcionando sem conexão.':'Olá. Este treinamento está em português.',lang:'pt-BR',marks:[]}]),await say([{text:'Open Insight and Home Management.',lang:'en-US',marks:[]}]),await say(mixed)];}finally{voice.terminate();}
  },{worker,offline,mixed});
  const online=await run(false);if(online.some(audio=>audio.peak<100||audio.seconds<.3))throw new Error('Voice returned silence or truncated audio');
  console.log('Real Portuguese, English and combined continuous voice generated:',JSON.stringify({audio:online,modelGETs:transfers()}));
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const preview=await new Promise(resolve=>canvas.toBlob(resolve));
    const db=await new Promise(resolve=>{const request=indexedDB.open('entrelinhas-local:user:00000000-0000-4000-8000-000000000990',2);request.onsuccess=()=>resolve(request.result);});
    await new Promise(resolve=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:'voice-public-sample',title:'Teste público de voz',filename:'voice.pdf',createdAt:1,pages:[{number:1,preview,images:[],blocks:[{id:'public-block',original:'Public voice sample.',translated:'Abra o Insight e confira Home Management. Acompanhe cada etapa e organize seus projetos.',y:1,heading:false}]}]});tx.oncomplete=resolve;});db.close();
  });
  await page.getByRole('button',{name:'Minha biblioteca'}).click();await page.getByRole('button',{name:'Ver tradução',exact:true}).click();await page.locator('#pdf-settings > summary').click();await page.locator('[data-narration-language]').filter({visible:true}).selectOption('mixed');await page.locator('#read-pdf').click();
  await page.waitForFunction(()=>window.__testVoiceAudio?.duration>.3&&!window.__testVoiceAudio.paused,undefined,{timeout:60000});
  await page.locator('#pause-reading').click();if(!await page.evaluate(()=>window.__testVoiceAudio.paused))throw new Error('Natural narration did not pause');
  await page.locator('#pause-reading').click();await page.waitForFunction(()=>!window.__testVoiceAudio.paused);
  await page.locator('#stop-reading').click();console.log('Real natural voice playback, pause, resume and stop passed through the reader UI.');
  const videoFile=join(profile,'public-voice-test.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x202641:s=320x180:d=20','-c:v','libx264','-y',videoFile]);
  await page.evaluate(async bytes=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('entrelinhas-local:user:00000000-0000-4000-8000-000000000990',2);request.onsuccess=()=>resolve(request.result);});
    const video=new Blob([new Uint8Array(bytes)],{type:'video/mp4'});
    await new Promise(resolve=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({id:'public-video',title:'Teste público de vídeo',filename:'public-voice-test.mp4',createdAt:2,size:video.size,lastModified:0,duration:20,video,sourceLanguage:'en',segments:[{start:0,end:.5,original:'Open Insight.',translated:'Abra o Insight.'},{start:12,end:19.8,original:'Check Home Management and proceed with all data.',translated:'Confira Home Management e prossiga com todos os dados.'}]});tx.oncomplete=resolve;});db.close();
  },Array.from(await readFile(videoFile)));
  await page.reload();await page.locator('#app').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Minha biblioteca'}).click();await page.getByRole('tab',{name:'Vídeos',exact:true}).click();await page.locator('[data-open="public-video"]').click();
  await page.locator('#video-settings > summary').click();if(await page.locator('[data-narration-language]').filter({visible:true}).inputValue()!=='pt-BR')throw new Error('Portuguese must be the default');
  await page.locator('#video-narration').check();await page.locator('#library-outlet #workspace-view').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#narration-status').textContent==='Narração contínua pronta. Dê play para ouvir.',undefined,{timeout:180000});
  await page.evaluate(()=>{window.__testVoiceAudio=undefined;window.__voicePauses=0;window.__captureVoicePauses=true;window.__automaticPauses=0;window.__pauseDetails=[];document.querySelector('#video').addEventListener('pause',event=>{window.__pauseDetails.push({time:event.target.currentTime,ended:event.target.ended});if(!event.target.ended&&event.target.currentTime>.1&&event.target.currentTime<event.target.duration-.1)window.__automaticPauses++;});});
  await page.locator('#video').evaluate(video=>video.play());await page.waitForFunction(()=>window.__testVoiceAudio?.duration>.3&&!window.__testVoiceAudio.paused);
  await page.waitForFunction(()=>document.querySelector('#video').currentTime>1.3);
  if(await page.locator('#video').evaluate(video=>video.paused)||await page.evaluate(()=>window.__automaticPauses!==0))throw new Error('Narration automatically paused the video: '+JSON.stringify(await page.evaluate(()=>({time:document.querySelector('#video').currentTime,ended:document.querySelector('#video').ended,pauses:window.__pauseDetails}))));
  await page.waitForFunction(()=>window.__testVoiceAudio.currentTime>window.__voiceMarks[1].start+.15,undefined,{timeout:6000});
  if(await page.evaluate(()=>window.__voicePauses!==0||document.querySelector('#video').currentTime>=12))throw new Error('Speech waited for a later cue timestamp');
  if(await page.evaluate(()=>window.__testVoiceAudio.playbackRate)!==1)throw new Error('Speech pace changed without a player speed change');
  await page.evaluate(()=>{window.__captureVoicePauses=false;});
  const preparedURL=await page.evaluate(()=>window.__testVoiceAudio.src);
  const marks=await page.evaluate(()=>window.__voiceMarks);
  if(marks.length!==2||marks[0].id!=='0'||marks[0].start!==0||marks[1].id!=='1'||marks[1].start<=0)throw new Error('Video cue boundaries were not generated separately: '+JSON.stringify(marks));
  await page.locator('#video').evaluate(video=>video.pause());if(!await page.evaluate(()=>window.__testVoiceAudio.paused))throw new Error('Manual video pause did not pause narration');
  for(const time of [12.5,0,16,12.5]){
    await page.locator('#video').evaluate((video,time)=>{video.currentTime=time;},time);
    await page.waitForFunction(()=>!document.querySelector('#video').seeking&&document.querySelector('#narration-status').textContent==='Narração contínua pronta. Dê play para ouvir.');
    if(!await page.locator('#video').evaluate(video=>video.paused))throw new Error('Seeking resumed a manually paused video');
    if(await page.evaluate(()=>window.__testVoiceAudio.src)!==preparedURL)throw new Error('Seeking regenerated the prepared narration');
    const text=time===0?'Abra o Insight.':'Confira Home Management e prossiga com todos os dados.';
    await page.waitForFunction(text=>Array.from(document.querySelector('#video').textTracks).find(track=>track.mode==='showing')?.cues?.[0]?.text===text&&document.querySelector('.segment.is-active .translation')?.textContent===text,text);
  }
  await page.locator('#caption-language').selectOption('both');
  await page.waitForFunction(()=>Array.from(document.querySelector('#video').textTracks).find(track=>track.mode==='showing')?.cues?.[0]?.text==='Confira Home Management e prossiga com todos os dados.\nCheck Home Management and proceed with all data.');
  await page.locator('#caption-language').selectOption('translated');
  await page.locator('#video').evaluate(video=>video.play());await page.waitForFunction(()=>document.querySelector('#video').ended);
  await page.waitForFunction(()=>document.querySelector('#narration-status').textContent==='Narração concluída.',undefined,{timeout:60000});
  await page.locator('#video').evaluate(video=>{video.currentTime=0;});await page.waitForFunction(()=>document.querySelector('#narration-status').textContent==='Narração contínua pronta. Dê play para ouvir.');if(await page.evaluate(()=>window.__testVoiceAudio.src)!==preparedURL)throw new Error('Rewinding after completion regenerated narration');
  await page.locator('#video-narration').uncheck();if(await page.locator('#video').evaluate(video=>video.muted))throw new Error('Original mute state was not restored');
  console.log('Real PT-BR continuous speech crossed a large source gap with no voice or video pauses; captions, cached seeks and manual pause passed.');
  await context.unrouteAll({behavior:'wait'});await localAccessFixture(context);await context.setOffline(true);
  const offline=await run(true);if(offline.some(audio=>audio.peak<100||audio.seconds<.3))throw new Error('Offline voice failed');
  console.log('Fresh voice worker generated Portuguese, English and continuous bilingual audio offline from cached models:',JSON.stringify(offline));
}catch(error){const active=context.pages().find(page=>page.url().includes('/Video_Translate/'));if(active)console.log('Voice validation state:',await active.evaluate(()=>({hidden:document.hidden,appLocked:document.querySelector('#app')?.hidden,gate:document.querySelector('#access-reason')?.textContent,gateStatus:document.querySelector('#access-status')?.textContent,status:document.querySelector('#narration-status')?.textContent,videoHidden:document.querySelector('#workspace-view')?.hidden,view:document.documentElement.dataset.view,parent:document.querySelector('#workspace-view')?.parentElement.id,libraryReaderHidden:document.querySelector('#library-reader')?.hidden})).catch(()=>({closed:true})));throw error;}finally{await context.close().catch(()=>{});}
