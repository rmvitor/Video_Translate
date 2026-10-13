import { chromium } from '@playwright/test';
import { cloudModelTransport } from './model-transport.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!process.env.PDF_INPUT) throw new Error('Defina PDF_INPUT com um arquivo local.');
const profile = process.env.AI_TEST_PROFILE || await mkdtemp(join(tmpdir(), 'entrelinhas-pdf-ai-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], headless: true });
const transfers = await cloudModelTransport(context);
const page = await context.newPage();
let timer;
try {
  await page.goto('http://127.0.0.1:4173/Video_Translate/');
  await page.getByRole('button', { name: 'Páginas PDF', exact: true }).click();
  await page.locator('#pdf-input').setInputFiles(process.env.PDF_INPUT);
  await page.locator('#pdf-reader').waitFor({ state: 'visible', timeout: 60000 });
  const pages = await page.locator('.reading-page').count();
  const images = await page.locator('.pdf-figure img').count();
  console.log('PDF extracted:', JSON.stringify({ pages, images, textBlocks: await page.locator('.pdf-block').count() }));
  if (!images) throw new Error('No embedded images preserved');
  await page.locator('#translate-pdf').click();
  let previous = '';
  timer = setInterval(async () => { try { const text = await page.locator('#pdf-progress-label').textContent(); if (text !== previous) { console.log(text); previous = text; } } catch {} }, 10000);
  await page.waitForFunction(() => !document.querySelector('#pdf-error').hidden || document.querySelector('#pdf-progress').hidden, undefined, { timeout: 900000 });
  if (await page.locator('#pdf-error').isVisible()) throw new Error(await page.locator('#pdf-error').textContent());
  const summary = await page.evaluate(() => ({ blocks: document.querySelectorAll('.pdf-block').length, pending: document.querySelectorAll('.pdf-block.pending').length, images: document.querySelectorAll('.pdf-figure img').length, nativeLocalVoices: speechSynthesis.getVoices().filter(v => v.localService && v.lang.toLowerCase() === 'pt-br').length }));
  if (summary.pending || !summary.blocks) throw new Error('Not all PDF blocks translated');
  console.log('Real PDF translation passed:', JSON.stringify({ ...summary, modelGETs: transfers() }));
  await context.unrouteAll({ behavior: 'wait' }); await context.setOffline(true); await page.reload();
  await page.getByRole('button', { name: 'Páginas PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir página', exact: true }).first().click();
  if (await page.locator('.pdf-block.pending').count()) throw new Error('Offline text not persisted');
  console.log('Offline PDF reader passed. Private text omitted.');
  await context.setOffline(false);
  await page.screenshot({ path: '/tmp/entrelinhas-pdf-reader.png', fullPage: true });
} finally { clearInterval(timer); await context.close(); }
