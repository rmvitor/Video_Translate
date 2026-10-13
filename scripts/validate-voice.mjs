import {chromium} from '@playwright/test';
import {mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localAccessFixture} from './local-access-fixture.mjs';
import {cloudModelTransport} from './model-transport.mjs';

// Harmless public sample only. Authorization is simulated; speech inference is real.
const profile=process.env.VOICE_TEST_PROFILE||await mkdtemp(join(tmpdir(),'entrelinhas-voice-'));
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  await localAccessFixture(context);const transfers=await cloudModelTransport(context);
  await context.addInitScript(()=>{
    const original=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){const media=this;return original.call(this).then(()=>{if(media instanceof HTMLAudioElement)(window).__testVoiceAudio=media;});};
  });
  const page=await context.newPage();page.on('console',msg=>{if(msg.type()==='error')console.log('Browser runtime error: '+msg.text().slice(0,250));});
  await page.goto('http://127.0.0.1:4173/Video_Translate/');await page.locator('#app').waitFor({state:'visible'});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  const worker=(await readdir('dist/assets')).find(name=>/^neural-voice.worker-.*\.js$/.test(name));if(!worker)throw new Error('Voice worker missing from build');
  const run=async offline=>page.evaluate(async({worker,offline})=>{
    const voice=new Worker(new URL('assets/'+worker,location.href),{type:'module'});let id=0;
    const say=text=>new Promise((resolve,reject)=>{
      const request=++id;const timer=setTimeout(()=>reject(new Error('Voice inference timeout')),240000);
      voice.onmessage=event=>{
        const message=event.data;if(message.type==='progress')return;if(message.id!==request)return;clearTimeout(timer);
        if(message.type==='error'){reject(new Error(message.message));return;}
        const audio=new DataView(message.audio);let peak=0;for(let offset=44;offset<audio.byteLength;offset+=2)peak=Math.max(peak,Math.abs(audio.getInt16(offset,true)));
        const sampleRate=audio.getUint32(24,true);resolve({bytes:audio.byteLength,sampleRate,seconds:(audio.byteLength-44)/2/sampleRate,peak});
      };
      voice.onerror=()=>{clearTimeout(timer);reject(new Error('Voice worker failed'));};voice.postMessage({id:request,text,baseURL:new URL('./',location.href).href});
    });
    try{return [await say(offline?'A voz continua funcionando sem conexão.':'Olá. Este treinamento está em português.'),await say('Acompanhe o vídeo no seu idioma.')];}finally{voice.terminate();}
  },{worker,offline});
  const online=await run(false);if(online.some(audio=>audio.peak<100||audio.seconds<.3))throw new Error('Voice returned silence or truncated audio');
  console.log('Real PT-BR voice generated:',JSON.stringify({audio:online,modelGETs:transfers()}));
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const preview=await new Promise(resolve=>canvas.toBlob(resolve));
    const db=await new Promise(resolve=>{const request=indexedDB.open('entrelinhas-local:user:00000000-0000-4000-8000-000000000990',2);request.onsuccess=()=>resolve(request.result);});
    await new Promise(resolve=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:'voice-public-sample',title:'Teste público de voz',filename:'voice.pdf',createdAt:1,pages:[{number:1,preview,images:[],blocks:[{id:'public-block',original:'Public voice sample.',translated:'Olá. Este treinamento está em português. Acompanhe cada etapa e organize seus projetos.',y:1,heading:false}]}]});tx.oncomplete=resolve;});db.close();
  });
  await page.getByRole('button',{name:'Páginas PDF',exact:true}).click();await page.getByRole('button',{name:'Abrir página',exact:true}).click();await page.locator('#read-pdf').click();
  await page.waitForFunction(()=>window.__testVoiceAudio?.duration>.3&&!window.__testVoiceAudio.paused,undefined,{timeout:60000});
  await page.locator('#pause-reading').click();if(!await page.evaluate(()=>window.__testVoiceAudio.paused))throw new Error('Natural narration did not pause');
  await page.locator('#pause-reading').click();await page.waitForFunction(()=>!window.__testVoiceAudio.paused);
  await page.locator('#stop-reading').click();console.log('Real natural voice playback, pause, resume and stop passed through the reader UI.');
  await context.unrouteAll({behavior:'wait'});await localAccessFixture(context);await context.setOffline(true);
  const offline=await run(true);if(offline.some(audio=>audio.peak<100||audio.seconds<.3))throw new Error('Offline voice failed');
  console.log('Fresh voice worker generated two complete phrases offline from cached models:',JSON.stringify(offline));
}finally{await context.close();}
