// Real local inference on generic UI instructions only, in an isolated account
// fixture. No training file, real account or online translation service is used.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localAccessFixture } from './local-access-fixture.mjs';
import { cloudModelTransport } from './model-transport.mjs';

const original = 'Finally, select the desired negative format. By default, the value is shown in parentheses, but a dash is also available.';
const instructions = 'Click Save. Then, close the dialog. Do not delete the account.';
const profile = process.env.AI_TEST_PROFILE || await mkdtemp(join(tmpdir(), 'entrelinhas-translation-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  await localAccessFixture(context);
  const transfers = await cloudModelTransport(context);
  const externalWrites = [];
  context.on('request', request => {
    if (new URL(request.url()).hostname !== '127.0.0.1' && request.method() !== 'GET') externalWrites.push(request.method() + ' ' + new URL(request.url()).origin);
  });
  const page = await context.newPage();
  for (const other of context.pages()) if (other !== page) await other.close();
  await page.goto('http://127.0.0.1:4173/Video_Translate/');
  // Refresh only this dedicated test profile's shell registration so a cached
  // older build cannot supply a worker that is missing from its offline shell.
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.unregister(); });
  await page.goto('about:blank');
  await page.goto('http://127.0.0.1:4173/Video_Translate/');
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const worker = (await readdir('dist/assets')).find(name => /^processor.worker-.*\.js$/.test(name));
  if (!worker) throw new Error('Build the app before running this check.');
  const segments = [{ start: 50, end: 60, original, translated: 'Tradução anterior incompleta.' }, { start: 60, end: 68, original: instructions, translated: '' }];
  async function infer(payload) {
    return page.evaluate(({ worker, payload }) => new Promise((resolve, reject) => {
      const engine = new Worker(new URL('assets/' + worker, location.href), { type: 'module' }), blocks = [];
      const finish = () => { clearTimeout(timer); engine.terminate(); };
      const timer = setTimeout(() => { finish(); reject(new Error('Local translation timed out.')); }, 600000);
      engine.onerror = event => { finish(); reject(new Error(event.message || 'Unable to load the local translation worker.')); };
      engine.onmessage = event => {
        const data = event.data;
        if (data.type === 'text-translated') blocks.push(data);
        if (data.type === 'error') { finish(); reject(new Error(data.message)); }
        if (data.type === 'complete' || data.type === 'text-complete') { finish(); resolve(data.type === 'complete' ? data.segments : blocks); }
      };
      engine.postMessage({ ...payload, sourceLanguage: 'en', baseURL: new URL('./', location.href).href });
    }), { worker, payload });
  }
  const translated = await infer({ segments });
  assert.deepEqual(translated.map(({ start, end, original }) => ({ start, end, original })), segments.map(({ start, end, original }) => ({ start, end, original })));
  assert.match(translated[0].translated, /Finalmente, selecione o formato negativo desejado\./);
  assert.match(translated[0].translated, /parênteses/i);
  assert.match(translated[1].translated, /salvar.*feche.*não (?:exclua|apague|delete)/i);
  const blocks = await infer({ blocks: [{ id: 'pdf-text', text: original }, { id: 'long-text', text: Array(8).fill(instructions).join(' ') }] });
  assert.equal(blocks[0].id, 'pdf-text');
  assert.equal(blocks[0].translated, translated[0].translated);
  assert.equal((blocks[1].translated.match(/não (?:exclua|apague|delete)/gi) || []).length, 8);
  await context.unrouteAll({ behavior: 'wait' });
  await localAccessFixture(context);
  await context.setOffline(true);
  const offline = await infer({ segments });
  assert.deepEqual(offline, translated);
  assert.deepEqual(externalWrites, []);
  console.log(JSON.stringify({ engine: 'production browser WASM worker', model: 'Xenova/opus-mt-en-ROMANCE', modelGETs: transfers(), video: translated, pdfMatchesVideo: true, longBlockInstructionsPreserved: 8, originalTextAndTimingPreserved: true, offlineFreshWorkerMatches: true, externalWrites }, null, 2));
} finally { await context.close(); }
