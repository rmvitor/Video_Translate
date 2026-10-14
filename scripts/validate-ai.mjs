// Optional real-inference check. Never adds the input video or its text to the repository.
// Requires the built app's test server on port 4173, Chromium and network access for model GETs.
import { chromium } from '@playwright/test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { localAccessFixture, MODEL_DATABASE } from './local-access-fixture.mjs';
import { cloudModelTransport } from './model-transport.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.VIDEO_INPUT) throw new Error('Defina VIDEO_INPUT com o caminho local do vídeo de teste.');
const profile = process.env.AI_TEST_PROFILE || await mkdtemp(join(tmpdir(), 'entrelinhas-ai-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'], headless: true,
});
await localAccessFixture(context);
const transfers = await cloudModelTransport(context);
const page = await context.newPage();
let lastMessage = '';
let timer;
try {
  await page.goto('http://127.0.0.1:4173/Video_Translate/');
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  await page.locator('#video-input').setInputFiles(process.env.VIDEO_INPUT);
  await page.waitForFunction(() => !document.querySelector('#process').disabled);
  await page.locator('#process').click();
  timer = setInterval(async () => {
    try {
      const message = await page.locator('#progress-message').textContent();
      if (message !== lastMessage) { console.log(message); lastMessage = message; }
    } catch { /* page may have closed */ }
  }, 10000);
  await page.waitForFunction(() => !document.querySelector('#error-panel').hidden || document.querySelectorAll('.segment .translation').length > 0 && document.querySelector('#progress-area').hidden, undefined, { timeout: 900000 });
  if (await page.locator('#error-panel').isVisible()) throw new Error(await page.locator('#error-detail').textContent());
  const summary = await page.evaluate(() => ({
    segments: document.querySelectorAll('.segment').length,
    translated: Array.from(document.querySelectorAll('.translation')).every(n => n.textContent && !n.textContent.includes('ainda não')),
    duration: document.querySelector('video').duration,
    subtitleTracks: document.querySelector('video').textTracks.length,
  }));
  if (!summary.translated || summary.segments < 1) throw new Error('Não foram geradas legendas traduzidas.');
  console.log('Real browser inference passed:', JSON.stringify({ ...summary, modelGETs: transfers() }));
  // Require meaningful timed text in both languages without logging private content.
  const contentChecks = await page.evaluate(async databaseName => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const items = await new Promise((resolve, reject) => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    const segments = items.sort((a, b) => b.createdAt - a.createdAt)[0].segments;
    return {
      distinctTranslations: segments.every(s => s.translated.trim().toLowerCase() !== s.original.trim().toLowerCase()),
      validTiming: segments.every(s => s.start >= 0 && s.end > s.start && s.end <= document.querySelector('video').duration + .1),
      hasPortugueseWords: segments.some(s => /\b(uma?|para|período|não|você|fechamento|é)\b/i.test(s.translated)),
    };
  }, MODEL_DATABASE);
  if (!Object.values(contentChecks).every(Boolean)) throw new Error('Content checks failed: ' + JSON.stringify(contentChecks));
  console.log('Timing and Portuguese text checks passed (private text omitted).');
  if(process.env.TRANSCRIPT_EXPECTED){
    const coverage=await page.evaluate(async({databaseName,reference})=>{
      const db=await new Promise(resolve=>{const request=indexedDB.open(databaseName);request.onsuccess=()=>resolve(request.result);});
      const items=await new Promise(resolve=>{const request=db.transaction('projects').objectStore('projects').getAll();request.onsuccess=()=>resolve(request.result);});db.close();
      const normalize=text=>text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
      const expected=normalize(reference),actual=normalize(items.sort((a,b)=>b.createdAt-a.createdAt)[0].segments.map(segment=>segment.original).join(' '));
      let previous=new Uint16Array(actual.length+1);
      for(const word of expected){const next=new Uint16Array(actual.length+1);for(let j=1;j<=actual.length;j++)next[j]=word===actual[j-1]?previous[j-1]+1:Math.max(previous[j],next[j-1]);previous=next;}
      const matched=previous[actual.length];return {expectedWords:expected.length,recognizedWords:actual.length,recall:matched/expected.length,precision:matched/actual.length};
    },{databaseName:MODEL_DATABASE,reference:process.env.TRANSCRIPT_EXPECTED});
    if(coverage.recall<.9||coverage.precision<.9)throw new Error('Reference transcription coverage failed: '+JSON.stringify(coverage));
    console.log('Reference word coverage passed (text omitted):',JSON.stringify(coverage));
  }
  // Remove the proxy adapter: offline must use the real browser cache only.
  await context.unrouteAll({ behavior: 'wait' });
  await localAccessFixture(context);
  await context.setOffline(true);
  const offlineName = `offline-validation-${Date.now()}`;
  await page.locator('#video-input').setInputFiles({
    name: `${offlineName}.mp4`, mimeType: 'video/mp4', buffer: await readFile(process.env.VIDEO_INPUT),
  });
  await page.waitForFunction(name => document.querySelector('#file-title').textContent === name && !document.querySelector('#process').disabled, offlineName);
  if (await page.locator('.segment').count()) throw new Error('Offline check requires a fresh project without existing subtitles.');
  await page.locator('#process').click();
  await page.waitForFunction(() => !document.querySelector('#error-panel').hidden || document.querySelector('#progress-area').hidden, undefined, { timeout: 300000 });
  if (await page.locator('#error-panel').isVisible()) throw new Error('Offline translation failed: ' + await page.locator('#error-detail').textContent());
  console.log('Offline transcription/translation engine passed using cached models and simulated authorization.');
} finally {
  clearInterval(timer);
  await context.close();
}
