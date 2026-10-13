import { test, expect } from './fixtures';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const dir = mkdtempSync(join(tmpdir(), 'entrelinhas-materials-'));
const pdfPath = join(dir, 'Training.pdf');
// A real, small two-page PDF with text and an embedded RGB image, generated locally.
const image = deflateSync(Buffer.from(Array.from({ length: 16 * 16 * 3 }, (_, i) => i % 3 === 0 ? 117 : i % 3 === 1 ? 100 : 230)));
const stream = (buffer: Buffer, extra = '') => Buffer.concat([Buffer.from(`<< /Length ${buffer.length} ${extra} >>\nstream\n`), buffer, Buffer.from('\nendstream')]);
const objects = [
  Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
  Buffer.from('<< /Type /Pages /Kids [3 0 R 7 0 R] /Count 2 >>'),
  Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>'),
  Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  stream(Buffer.from('BT /F1 20 Tf 40 780 Td (Welcome to training) Tj /F1 12 Tf 0 -40 Td (This course teaches account reconciliation.) Tj ET q 80 0 0 80 40 600 cm /Im1 Do Q')),
  stream(image, '/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode'),
  Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 8 0 R >>'),
  stream(Buffer.from('BT /F1 20 Tf 40 780 Td (Learning objectives) Tj /F1 12 Tf 0 -40 Td (Learn how to close a period.) Tj ET q 80 0 0 80 40 600 cm /Im1 Do Q')),
];
let body = Buffer.from('%PDF-1.4\n'), offsets = [0];
objects.forEach((object, i) => { offsets.push(body.length); body = Buffer.concat([body, Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]); });
const xref = body.length;
body = Buffer.concat([body, Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)]);
writeFileSync(pdfPath, body);
const videoPath = join(dir, 'training.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x202641:s=320x180:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', videoPath]);

async function localVoiceFixture(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('entrelinhas.voice','fixture-local');
    const local = { name: 'Voz local de teste', lang: 'pt-BR', voiceURI: 'fixture-local', localService: true, default: true };
    const remote = { name: 'Voz remota proibida', lang: 'pt-BR', voiceURI: 'fixture-remote', localService: false, default: false };
    const english={name:'Local English',lang:'en-US',voiceURI:'fixture-english',localService:true};
    const state = { utterances: [] as any[], current: undefined as any, paused: false, canceled: 0, queue:[] as any[] };
    const advance=()=>{if(state.paused||state.current||!state.queue.length)return;const utterance=state.queue.shift();state.current=utterance;queueMicrotask(()=>{if(state.current===utterance)utterance.onstart?.({});});};
    (window as any).__speech = state;
    (window as any).SpeechSynthesisUtterance = class { text: string; constructor(text: string) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [local, remote, english, {name:'Remote English',lang:'en-US',voiceURI:'remote-english',localService:false}], addEventListener: () => {},
      speak: (utterance: any) => { state.utterances.push(utterance);state.queue.push(utterance);const end=utterance.onend;utterance.onend=(event:any)=>{end?.(event);if(state.current===utterance)state.current=undefined;advance();};advance(); },
      cancel: () => { state.current = undefined;state.queue=[]; state.canceled++; },
      pause: () => { state.paused = true; }, resume: () => { state.paused = false;advance(); },
    } });
  });
}

test('projects and subjects organize a real PDF, preserving images, revisions and offline pages', async ({ page, context }) => {
  await localVoiceFixture(page);
  await context.route('https://huggingface.co/**', route => route.abort());
  const requests: string[] = [];
  context.on('request', request => { if (request.method() !== 'GET' && !request.url().includes('/functions/v1/') && !request.url().includes('/auth/v1/')) requests.push(request.url()); });
  await page.goto('./');
  await page.getByRole('button', { name: 'Projetos e assuntos', exact: true }).click();
  await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  await page.locator('#learning-title').fill('Reconciliação');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.collection-header h2')).toHaveText('Reconciliação');
  await page.getByRole('button', { name: 'Novo subassunto' }).click();
  await page.locator('#learning-title').fill('Introdução');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: 'Introdução', exact: true }).click();
  await page.locator('#collection-pdf').click();
  await page.locator('#pdf-input').setInputFiles(process.env.EXAMPLE_PDF || pdfPath);
  await expect(page.locator('.reading-page')).toHaveCount(2, { timeout: 30000 });
  expect(await page.locator('.pdf-figure img').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.pdf-figure img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#pdf-collection option:checked')).toHaveText('Reconciliação');
  await expect(page.locator('#pdf-subject option:checked')).toHaveText('Introdução');
  await page.locator('#translate-pdf').click();
  await expect(page.locator('#pdf-error')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('.reading-page')).toHaveCount(2);
  await page.locator('[data-edit-block]').first().click();
  await page.locator('#pdf-edit-translation').fill('Boas-vindas ao treinamento!');
  await page.getByRole('button', { name: 'Salvar tradução' }).click();
  await expect(page.locator('.pdf-copy').first()).toHaveText('Boas-vindas ao treinamento!');
  await page.locator('#read-pdf').click();
  await expect(page.locator('.is-reading')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__speech.current.lang)).toBe('pt-BR');
  expect(await page.evaluate(() => (window as any).__speech.current.voice.localService)).toBe(true);
  await expect(page.locator('[aria-label="Voz local da página"] option')).toHaveCount(2);
  await page.locator('#pause-reading').click();
  expect(await page.evaluate(() => (window as any).__speech.paused)).toBe(true);
  await page.locator('#pause-reading').click();
  expect(await page.evaluate(() => (window as any).__speech.paused)).toBe(false);
  await page.locator('#stop-reading').click();
  const download = page.waitForEvent('download');
  await page.locator('#export-page').click();
  const exported = readFileSync((await (await download).path())!, 'utf8');
  expect(exported).toContain('Boas-vindas ao treinamento!');
  expect(exported).toMatch(/data:image\/(webp|png)/);
  await page.reload();
  await page.getByRole('button', { name: 'Projetos e assuntos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
  await expect(page.locator('.material-card')).toHaveCount(1);
  await page.locator('[data-material][data-kind="pdf"]').click();
  await expect(page.locator('.pdf-copy').first()).toHaveText('Boas-vindas ao treinamento!');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await context.setOffline(true); await page.reload();
  await expect(page.locator('#access-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
  await context.setOffline(false); await page.reload();
  await page.getByRole('button', { name: 'Minha biblioteca' }).click();
  await page.getByRole('button', { name: 'Ver tradução', exact: true }).click();
  await expect(page.locator('.reading-page')).toHaveCount(2);
  await expect.poll(() => page.locator('.pdf-figure img').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(requests).toEqual([]);
});

test('continuous narration keeps every cue without auto-pausing the video and respects manual pause and seek', async ({ page }) => {
  await localVoiceFixture(page); await page.goto('./');
  await page.locator('#project-input').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, title: 'Treinamento', filename: 'training.mp4', duration: 4, segments: [{ start: 0, end: .5, original: 'Welcome.', translated: 'Boas-vindas ao treinamento.' }, { start: .8, end: 3.9, original: 'Let us start.', translated: 'Vamos começar a aprender.' }] })) });
  await page.locator('#reattach-button').click();
  await page.locator('#video-input').setInputFiles(videoPath);
  await expect(page.locator('#video')).toBeVisible();
  await page.locator('#view-video-library').click();
  await expect(page.locator('#library-outlet #workspace-view')).toBeVisible();
  await page.locator('#video-narration').check();
  await expect(page.locator('#library-outlet #workspace-view')).toBeVisible();
  await expect(page.locator('#mute-original')).toBeChecked();
  expect(await page.locator('#video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await page.locator('#video').evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => page.evaluate(() => (window as any).__speech.current?.text)).toBe('Boas-vindas ao treinamento. Vamos começar a aprender.');
  await expect.poll(()=>page.locator('#video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(1.1);
  expect(await page.locator('#video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(false);
  expect(await page.evaluate(()=>(window as any).__speech.utterances.length)).toBe(1);
  await page.locator('#video').evaluate((v: HTMLVideoElement) => v.pause());
  expect(await page.evaluate(() => (window as any).__speech.paused)).toBe(true);
  await page.locator('#video').evaluate((v: HTMLVideoElement) => { v.currentTime = 1.2; });
  await page.locator('#video').evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => page.evaluate(() => (window as any).__speech.current?.text)).toBe('Vamos começar a aprender.');
  await expect.poll(()=>page.locator('#video').evaluate((v:HTMLVideoElement)=>v.ended),{timeout:10000}).toBe(true);
  await expect(page.locator('#narration-status')).toContainText('Concluindo');
  await page.evaluate(()=>(window as any).__speech.current.onend({}));
  await expect(page.locator('#narration-status')).toHaveText('Narração concluída.');
  expect(await page.locator('#video').evaluate((v:HTMLVideoElement)=>v.ended)).toBe(true);
  await page.locator('#video-narration').uncheck();
  expect(await page.locator('#video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await expect(page.locator('#mute-original')).not.toBeChecked();
});

test('database upgrade preserves existing videos and text and accepts new study projects', async ({ page }) => {
  await page.route('**/seed.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Seed</title>' }));
  await page.goto('./seed.html');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entrelinhas-local', 1); request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ id: 'legacy', title: 'Meu vídeo anterior', filename: 'legacy.mp4', size: 100, lastModified: 0, duration: 6, createdAt: Date.now(), segments: [{ start: 0, end: 3, original: 'Welcome', translated: 'Bem-vindo' }] }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  await page.goto('./');
  await page.locator('#claim-legacy').click();
  await expect(page.locator('#claim-legacy')).toHaveCount(0);
  await page.getByRole('button', { name: 'Minha biblioteca' }).click();
  await expect(page.locator('.library-card h2')).toHaveText('Meu vídeo anterior');
  await page.getByRole('tab', { name: 'Vídeos', exact: true }).click();
  await page.getByRole('button', { name: 'Ver tradução', exact: true }).click();
  await expect(page.locator('.translation')).toHaveText('Bem-vindo');
  await page.getByRole('button', { name: 'Projetos e assuntos', exact: true }).click();
  await page.getByRole('button', { name: 'Criar projeto', exact: true }).click();
  await page.locator('#learning-title').fill('Novo projeto');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.locator('.collection-header h2')).toHaveText('Novo projeto');
});

test('natural local voice is available without installed system voices and remote voices stay excluded', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ name: 'Remote', lang: 'pt-BR', localService: false }], addEventListener: () => {}, cancel: () => {} } }));
  await page.goto('./');
  await page.locator('#project-input').setInputFiles({ name: 'voice.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, title: 'Voice', segments: [{ start: 0, end: 2, original: 'Hello', translated: 'Olá' }] })) });
  await expect(page.locator('[aria-label="Voz local do vídeo"] option')).toHaveCount(1);
  await expect(page.locator('[aria-label="Voz local do vídeo"]')).toHaveValue('entrelinhas:piper:faber');
  await expect(page.locator('[aria-label="Voz local do vídeo"] option')).not.toContainText('Remote');
});

test('creation opens PDF and session video translations in their library tabs without uploading files',async({page,context})=>{
  const uploads:string[]=[], sent:any[]=[];context.on('request',request=>{if(request.method()!=='GET'&&!request.url().includes('/auth/v1/')&&!request.url().includes('/functions/v1/')&&!request.url().startsWith('https://generativelanguage.googleapis.com/'))uploads.push(request.url());});
  await context.route('https://generativelanguage.googleapis.com/**',route=>{const body=route.request().postDataJSON();sent.push(body);const units=JSON.parse(body.contents[0].parts[0].text).units;return route.fulfill({contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({translations:units.map((unit:any)=>({id:unit.id,translated:'Bem-vindo ao treinamento.'}))})}]}}]})});});
  await page.goto('./');await page.locator('#video-input').setInputFiles(videoPath);
  await expect(page.locator('#file-title')).toHaveText('training');
  const blob=await page.locator('#video').evaluate((v:HTMLVideoElement)=>v.src);
  await page.locator('#view-video-library').click();
  await expect(page.locator('#library-outlet #video')).toBeVisible();
  expect(await page.locator('#video').evaluate((v:HTMLVideoElement)=>v.src)).toBe(blob);
  await page.getByRole('tab',{name:'Páginas',exact:true}).click();
  await expect(page.locator('#library-pages-panel')).toBeVisible();
  await page.getByRole('button',{name:'Selecionar PDF',exact:true}).click();await page.locator('#pdf-input').setInputFiles(pdfPath);
  await expect(page.locator('#documents-view #pdf-reader')).toBeVisible();
  await page.locator('#online-pdf').click();await page.locator('#review-gemini-key').fill('fictional-test-key');await page.locator('#online-consent').check();await page.locator('#send-online').click();await expect(page.locator('#apply-online')).toBeVisible();await page.locator('#apply-online').click();
  await expect(page.locator('#library-outlet #pdf-reader')).toBeVisible();
  expect(sent).toHaveLength(1);expect(JSON.stringify(sent)).not.toMatch(/inlineData|fileData|Training\.pdf|training\.mp4/);
  await page.getByRole('button',{name:'Páginas PDF',exact:true}).click();await page.locator('#view-pdf-library').click();
  await expect(page.locator('#library-outlet .pdf-copy').first()).toHaveText('Bem-vindo ao treinamento.');
  await expect(page.locator('#library-outlet .reading-page')).toHaveCount(2);
  expect(await page.locator('#library-outlet .pdf-figure img').count()).toBeGreaterThan(0);
  await page.getByRole('tab',{name:'Vídeos',exact:true}).click();await page.locator('[data-open]').click();
  await expect(page.locator('#library-outlet #video')).toBeVisible();
  expect(await page.locator('#video').evaluate((v:HTMLVideoElement)=>v.src)).toBe(blob);
  await expect(page.locator('#library-count')).toHaveText('2');expect(uploads).toEqual([]);
});

test('bilingual local narration pronounces English labels, saves custom terms per material and reads original English',async({page,context})=>{
  await localVoiceFixture(page);const outbound:string[]=[];
  context.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1'))outbound.push(request.url());});
  await page.goto('./');await page.getByRole('button',{name:'Páginas PDF',exact:true}).click();await page.locator('#pdf-input').setInputFiles(pdfPath);
  await expect(page.locator('#pdf-reader')).toBeVisible();
  await page.locator('[data-edit-block]').first().click();await page.locator('#pdf-edit-translation').fill('Abra Home Management e confira o Insight no widget.');await page.getByRole('button',{name:'Salvar tradução',exact:true}).click();
  await page.locator('#pdf-settings summary').click();await page.locator('[data-english-terms=pdf]').fill('widget');await page.locator('[data-english-terms=pdf]').blur();
  await page.locator('#read-pdf').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__speech.utterances.filter((u:any)=>u.lang==='en-US').map((u:any)=>u.text))).toEqual(['Home Management','Insight','widget.']);
  const voices=await page.evaluate(()=>(window as any).__speech.utterances.map((u:any)=>({text:u.text,lang:u.lang,voice:u.voice.voiceURI,local:u.voice.localService})));
  expect(voices.every((voice:any)=>voice.local)).toBe(true);expect(voices.filter((voice:any)=>voice.lang==='en-US').every((voice:any)=>voice.voice==='fixture-english')).toBe(true);
  await page.locator('#stop-reading').click();
  await page.locator('[data-narration-language]').filter({visible:true}).selectOption('en-US');await page.locator('#read-pdf').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__speech.current?.text)).toContain('Welcome to training');
  expect(await page.evaluate(()=>(window as any).__speech.current.lang)).toBe('en-US');
  await page.locator('#stop-reading').click();await page.reload();await page.getByRole('button',{name:'Minha biblioteca'}).click();await page.locator('[data-open-pdf]').click();await page.locator('#pdf-settings summary').click();
  await expect(page.locator('#library-outlet #pdf-reader')).toBeVisible();
  await expect(page.locator('[data-english-terms=pdf]')).toBeVisible();
  await expect(page.locator('[data-english-terms=pdf]')).toHaveValue('widget');
  expect(outbound).toEqual([]);
});
