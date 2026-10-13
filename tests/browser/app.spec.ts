import { test, expect } from './fixtures';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'entrelinhas-e2e-'));
const videoPath = join(dir, 'training.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x202641:s=320x180:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', videoPath]);
const captionsPath = join(dir, 'training.srt');
writeFileSync(captionsPath, '1\n00:00:00,000 --> 00:00:02,000\nThis is a training video.\n\n2\n00:00:03,000 --> 00:00:05,500\nLet us begin.\n');

test('local video, captions, editing, seeking, export, persistence and deletion', async ({ page, context }) => {
  const outbound: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1')) outbound.push(request.url()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Entenda cada palavra.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Transcrever e traduzir', exact: true })).toBeDisabled();
  await page.locator('#video-input').setInputFiles(videoPath);
  await expect(page.locator('#file-title')).toHaveText('training');
  await expect(page.locator('#video')).toBeVisible();
  expect(await page.locator('#video').evaluate((v: HTMLVideoElement) => v.src)).toMatch(/^blob:/);
  await page.locator('#remember').check();
  await expect(page.locator('#video-badge')).toHaveText('Guardado neste dispositivo');
  await page.locator('#captions-input').setInputFiles(captionsPath);
  await expect(page.locator('#segment-count')).toHaveText('2 trechos');
  await page.getByRole('tab', { name: 'Original' }).click();
  await expect(page.locator('.original').first()).toHaveText('This is a training video.');
  await page.getByRole('button', { name: 'Editar trecho 1' }).click();
  await page.locator('#edit-translated').fill('Este é um vídeo de treinamento.');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByRole('tab', { name: 'Português' }).click();
  await expect(page.locator('.translation').first()).toHaveText('Este é um vídeo de treinamento.');
  await page.locator('[data-seek="1"]').first().click();
  await expect.poll(() => page.locator('#video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(3, 0);
  await expect(page.locator('[data-segment="1"]')).toHaveClass(/is-active/);
  await page.locator('#search').fill('treinamento');
  await expect(page.locator('.segment')).toHaveCount(1);
  await page.locator('#search').fill('');
  await page.getByRole('button', { name: 'Exportar legendas' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Legenda SRT' }).click();
  expect((await download).suggestedFilename()).toBe('training.srt');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Minha biblioteca' }).click();
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await expect(page.locator('#video')).toBeVisible();
  await expect(page.locator('.translation').first()).toHaveText('Este é um vídeo de treinamento.');
  await page.getByRole('button', { name: 'Minha biblioteca' }).click();
  await page.getByRole('button', { name: 'Excluir training' }).click();
  await page.getByRole('button', { name: 'Excluir vídeo', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(0);
  expect(outbound).toEqual([]);
  expect(errors).toEqual([]);
});

test('mobile layout has no horizontal overflow and imports safely escaped projects', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const playerFits = await page.evaluate(() => {
    const card = document.querySelector('.player-card')!.getBoundingClientRect();
    const stage = document.querySelector('.video-stage')!.getBoundingClientRect();
    const title = document.querySelector('.player-empty h2')!.getBoundingClientRect();
    return stage.right <= card.right && title.right <= stage.right && title.left >= stage.left;
  });
  expect(playerFits).toBe(true);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Minha biblioteca' }).click();
  await page.locator('#project-input').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, title: '<img src=x onerror=alert(1)>', filename: 'training.mp4', size: 0, duration: 6, segments: [{ start: 0, end: 2, original: '<script>alert(1)</script>', translated: 'Tradução local' }] })) });
  await expect(page.locator('#file-title')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#reattach')).toBeVisible();
  await page.getByRole('tab', { name: 'Original' }).click();
  await expect(page.locator('.original')).toHaveText('<script>alert(1)</script>');
  expect(await page.locator('#transcript script').count()).toBe(0);
  await page.locator('#reattach-button').click();
  await page.locator('#video-input').setInputFiles(videoPath);
  await expect(page.locator('#video')).toBeVisible();
  await expect(page.locator('#segment-count')).toHaveText('1 trecho');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('PWA is scoped to the Pages subdirectory and the shell works offline', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('Service worker is not active');
  });
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');
  // Manifest id is resolved against start_url's origin, unlike scope/start_url.
  // './' would collide with every other PWA using './' on this GitHub Pages domain.
  const origin = new URL(page.url()).origin;
  expect(new URL(manifest.id, origin).pathname).toBe('/Video_Translate/');
  expect(new URL(manifest.id, origin).href).not.toBe(new URL('/Implantation-WS/', origin).href);
  const cdp = await context.newCDPSession(page);
  const processed = await cdp.send('Page.getAppManifest');
  expect(processed.manifest.id).toBe(`${origin}/Video_Translate/`);
  expect(processed.manifest.scope).toBe(`${origin}/Video_Translate/`);
  expect(manifest.scope).toBe('./');
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#access-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Entenda cada palavra.' })).toBeVisible();
});

test('real browser audio extraction reaches the model download; network failure is visible', async ({ page, context }) => {
  await context.route('https://huggingface.co/**', route => route.abort('blockedbyclient'));
  const uploads: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET' && !request.url().includes('/functions/v1/') && !request.url().includes('/auth/v1/')) uploads.push(request.url()); });
  await page.goto('./');
  await page.locator('#video-input').setInputFiles(process.env.EXAMPLE_VIDEO || videoPath);
  await expect(page.locator('#process')).toBeEnabled();
  await page.locator('#process').click();
  // The actual FFmpeg WASM worker must successfully extract PCM before this request.
  await expect.poll(async () => {
    const detail = await page.locator('#error-detail').textContent();
    const status = await page.locator('#progress-message').textContent();
    return `${detail} ${status}`;
  }, { timeout: 45000 }).toMatch(/huggingface|Preparando o modelo|Baixando transcrição|Ouvindo/);
  await expect(page.locator('#error-panel')).toBeVisible({ timeout: 45000 });
  expect(uploads).toEqual([]);
});
