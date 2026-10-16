import {test,expect,USER_DB,mockAccess} from './fixtures';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'entrelinhas-export-')),video=join(dir,'training.mp4');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x202641:s=320x180:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-shortest',video]);
const webm=join(dir,'training.webm');execFileSync('ffmpeg',['-v','error','-i',video,'-c:v','libvpx','-deadline','realtime','-cpu-used','5','-c:a','libopus',webm]);
const segments=[{start:0,end:2,original:'Welcome.',translated:'Bem-vindo ao treinamento.'},{start:2,end:4,original:'Continue.',translated:'Confira cada etapa antes de continuar.'}];
async function seed(page:import('@playwright/test').Page,remember=true,input=video){
 await page.goto('./');await page.locator('#video-input').setInputFiles(input);await expect(page.locator('#file-title')).toHaveText('training');if(remember)await page.locator('#remember').check();
 await page.evaluate(async({name,segments})=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(name,2);r.onsuccess=()=>resolve(r.result);});await new Promise<void>(resolve=>{const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects'),r=store.getAll();r.onsuccess=()=>{const p=r.result[0];p.segments=segments;store.put(p);};tx.oncomplete=()=>resolve();});db.close();},{name:USER_DB,segments});
 await page.reload();await page.getByRole('button',{name:/^Minha biblioteca/}).click();await page.getByRole('tab',{name:'Vídeos',exact:true}).click();await page.getByRole('button',{name:'Ver tradução',exact:true}).click();
}
async function save(page:import('@playwright/test').Page,name:string){await page.waitForFunction(()=>!document.querySelector<HTMLElement>('#video-export-result')!.hidden||Boolean(document.querySelector('#video-export-error')!.textContent),undefined,{timeout:45000});const error=await page.locator('#video-export-error').textContent();if(error)throw new Error(error);const pending=page.waitForEvent('download');await page.locator('#save-export-video').click();const download=await pending;const path=join(dir,name);await download.saveAs(path);return path;}
const probe=(path:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}));
async function voiceFixture(page:import('@playwright/test').Page,delay=0){
 await page.addInitScript(delay=>{
  const Native=window.Worker;(window as any).__voiceExports={requests:0,responses:0,terminated:0};
  class Voice extends EventTarget{onmessage:any;onerror:any;postMessage(data:any){const state=(window as any).__voiceExports;state.requests++;const rate=22050,count=data.chunks.length*rate*3,audio=new ArrayBuffer(44+count*2),view=new DataView(audio);const text=(offset:number,s:string)=>[...s].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));text(0,'RIFF');view.setUint32(4,audio.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,count*2,true);for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.sin(i*2*Math.PI*660/rate)*12000,true);setTimeout(()=>{state.responses++;this.onmessage?.({data:{id:data.id,type:'audio',audio,duration:count/rate,marks:data.chunks.flatMap((c:any,i:number)=>c.marks.map((m:any)=>({id:m.id,start:i*3+m.offset/c.text.length*3})))}});},delay);}terminate(){(window as any).__voiceExports.terminated++;}}
  (window as any).Worker=class{constructor(url:any,options:any){return String(url).includes('neural-voice.worker')?new Voice():new Native(url,options);}};
 },delay);
}

test('downloads a real local MP4 with selectable PT-BR subtitles and the original audio',async({page,context})=>{
 const outbound:string[]=[];context.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1'))outbound.push(r.url());});await seed(page);
 await page.locator('#download-video').click();await page.locator('#download-audio').selectOption('original');await page.locator('#download-subtitles').selectOption('track');await page.locator('#prepare-video-download').click();
 const path=await save(page,'track.mp4'),info=probe(path);expect(info.streams.filter((s:any)=>s.codec_type==='audio')).toHaveLength(1);expect(info.streams.find((s:any)=>s.codec_type==='subtitle').codec_name).toBe('mov_text');expect(info.streams.find((s:any)=>s.codec_type==='subtitle').tags.language).toBe('por');
 const text=execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:s:0','-f','srt','pipe:1'],{encoding:'utf8'});expect(text).toContain('Bem-vindo ao treinamento.');expect(text).toContain('Confira cada etapa');expect(outbound).toEqual([]);expect(readFileSync(video)).not.toEqual(readFileSync(path));
});

test('burns a visible Portuguese caption into the picture without requiring a subtitle-capable player',async({page})=>{
 await seed(page);await page.locator('#download-video').click();await page.locator('#download-audio').selectOption('original');await page.locator('#prepare-video-download').click();
 const path=await save(page,'burned.mp4'),info=probe(path);expect(info.streams.filter((s:any)=>s.codec_type==='subtitle')).toHaveLength(0);expect(info.streams.find((s:any)=>s.codec_type==='video').codec_name).toBe('h264');
 const pixels=execFileSync('ffmpeg',['-v','error','-ss','0.5','-i',path,'-frames:v','1','-vf','crop=iw:ih/2:0:ih/2','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);let white=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i]>180&&pixels[i+1]>180&&pixels[i+2]>180)white++;expect(white).toBeGreaterThan(100);
});

test('asks to reattach a missing original and blocks narration with incomplete translation',async({page})=>{
 await seed(page,false);await page.locator('#download-video').click();await expect(page.locator('#locate-export-video')).toBeVisible();await expect(page.locator('#prepare-video-download')).toBeDisabled();await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.locator('#reattach-button').click();await page.locator('#video-input').setInputFiles(video);await expect(page.locator('#video')).toBeVisible();
 await page.getByRole('button',{name:'Editar trecho 1'}).click();await page.locator('#edit-translated').fill('');await page.getByRole('button',{name:'Salvar alterações'}).click();
 await page.locator('#download-video').click();await page.locator('#prepare-video-download').click();await expect(page.locator('#video-export-error')).toContainText('Traduza todos');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('reuses prepared PT-BR speech and exports two audio tracks with captions at actual voice boundaries',async({page})=>{
 await voiceFixture(page);await seed(page);await page.locator('#video-narration').check();await expect(page.locator('#narration-status')).toContainText('pronta');expect(await page.evaluate(()=>(window as any).__voiceExports.requests)).toBe(1);
 await page.locator('#download-video').click();await page.locator('#download-audio').selectOption('both');await page.locator('#download-subtitles').selectOption('track');await page.locator('#prepare-video-download').click();
 const path=await save(page,'narrated.mp4'),info=probe(path);expect(await page.evaluate(()=>(window as any).__voiceExports.requests)).toBe(1);
 const audio=info.streams.filter((s:any)=>s.codec_type==='audio');expect(audio).toHaveLength(2);expect(audio[0].tags.language).toBe('por');expect(audio[0].disposition.default).toBe(1);expect(Number(info.format.duration)).toBeGreaterThanOrEqual(6);
 const spoken=execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:s:0','-f','srt','pipe:1'],{encoding:'utf8'}),original=execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:s:1','-f','srt','pipe:1'],{encoding:'utf8'});expect(spoken).toContain('00:00:03,000');expect(original).toContain('00:00:02,000');
 const tail=execFileSync('ffmpeg',['-v','error','-ss','4.5','-i',path,'-map','0:a:0','-t','0.5','-f','s16le','pipe:1']);expect(tail.some(byte=>byte!==0)).toBe(true);
});

test('closing an export cancels generation and ignores a late voice result',async({page})=>{
 await voiceFixture(page,1000);await seed(page);await page.locator('#download-video').click();await page.locator('#prepare-video-download').click();await expect(page.locator('#cancel-video-export')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#dialog')).not.toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__voiceExports.responses)).toBe(1);expect(await page.evaluate(()=>(window as any).__voiceExports.terminated)).toBeGreaterThan(0);
 await page.locator('#download-video').click();await expect(page.locator('#video-export-result')).toBeHidden();await expect(page.locator('#prepare-video-download')).toBeEnabled();
});

test('revoking access cancels an export before any file becomes downloadable',async({page,context})=>{
 const account=await mockAccess(context);await voiceFixture(page,1000);await seed(page);await page.locator('#download-video').click();await page.locator('#prepare-video-download').click();await expect(page.locator('#cancel-video-export')).toBeVisible();
 account.setStatus('blocked');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('#access-reason')).toContainText('bloqueou');await expect(page.locator('#dialog')).not.toBeVisible();await expect(page.locator('#app')).not.toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__voiceExports.responses)).toBe(1);expect(await page.evaluate(()=>(window as any).__voiceExports.terminated)).toBeGreaterThan(0);
});

test('converts a local WebM source to H.264 and AAC without adding an unwanted subtitle track',async({page})=>{
 await seed(page,true,webm);await page.locator('#download-video').click();await page.locator('#download-audio').selectOption('original');await page.locator('#download-subtitles').selectOption('none');await page.locator('#prepare-video-download').click();
 const path=await save(page,'converted.mp4'),info=probe(path);expect(info.streams.find((s:any)=>s.codec_type==='video').codec_name).toBe('h264');expect(info.streams.find((s:any)=>s.codec_type==='audio').codec_name).toBe('aac');expect(info.streams.filter((s:any)=>s.codec_type==='subtitle')).toHaveLength(0);
});
