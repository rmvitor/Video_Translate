import { test, expect, type Page } from '@playwright/test';
const endpoint = 'https://generativelanguage.googleapis.com/**';
const dummyKey = 'dummy-test-key-never-real';
async function seed(page: Page) {
  await page.route('**/seed.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Seed</title>' }));
  await page.goto('./seed.html');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('entrelinhas-local', 2); request.onupgradeneeded = () => { for (const name of ['projects', 'documents', 'collections']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const preview = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30"><rect width="60" height="30" fill="purple"/></svg>'], { type: 'image/svg+xml' });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['projects', 'documents', 'collections'], 'readwrite');
      tx.objectStore('collections').put({ id: 'course', title: 'Projeto de implantação', createdAt: 1, subjects: [{ id: 'intro', title: 'Introdução' }, { id: 'setup', title: 'Configuração' }] });
      tx.objectStore('documents').put({ id: 'pdf', title: 'Boas-vindas', filename: 'secret-welcome.pdf', createdAt: 1, collectionId: 'course', subjectId: 'intro', pages: [{ number: 1, preview, images: [{ id: 'img', blob: preview, width: 60, height: 30, y: 100 }], blocks: [{ id: 'block-a', original: 'Welcome to the project.', translated: '', y: 1, heading: true }, { id: 'block-b', original: 'Prepare the accounts before closing.', translated: '', y: 50, heading: false }] }] });
      tx.objectStore('projects').put({ id: 'video', title: 'Fechamento', filename: 'secret-close.mp4', size: 1, lastModified: 1, duration: 10, createdAt: 2, collectionId: 'course', subjectId: 'setup', sourceLanguage: 'es', segments: [{ start: 0, end: 4, original: 'Hola, este es el proyecto.', translated: 'Olá, este é o projeto.' }, { start: 5, end: 9, original: 'Revisa las cuentas.', translated: 'Revise as contas.' }] });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.goto('./');
}
async function readDB(page: Page, store: string, id: string) {
  return page.evaluate(async ({ store, id }) => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('entrelinhas-local'); r.onsuccess = () => resolve(r.result); }); const result = await new Promise<any>(resolve => { const r = db.transaction(store).objectStore(store).get(id); r.onsuccess = () => resolve(r.result); }); db.close(); return result; }, { store, id });
}
async function course(page: Page) {
  await page.getByRole('button', { name: 'Projetos e assuntos', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir projeto', exact: true }).click();
}

test('course outline navigates PDF/video, remembers progress and last material without losing the player', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page); await course(page);
  await expect(page.locator('#project-outlet #pdf-reader')).toBeVisible();
  await expect(page.locator('.material-card')).toHaveCount(2);
  await page.locator('#toggle-completed').click();
  await expect(page.locator('.collection-header p')).toContainText('1/2');
  await page.locator('.project-notes summary').click();
  await page.locator('#project-notes').fill('Preparar implantação na próxima semana.');
  await page.locator('#save-project-notes').click();
  await page.locator('#next-material').click();
  await expect(page.locator('#project-outlet #workspace-view')).toBeVisible();
  await expect(page.locator('#file-title')).toHaveText('Fechamento');
  await expect(page.locator('#video-source-language')).toHaveValue('es');
  await expect(page.locator('.translation').first()).toHaveText('Olá, este é o projeto.');
  await page.locator('#toggle-completed').click();
  await page.getByRole('button', { name: 'Minha biblioteca' }).click();
  await page.locator('[data-open="video"]').click();
  await page.getByRole('button', { name: 'Projetos e assuntos', exact: true }).click();
  await expect(page.locator('.collection-header p')).toContainText('2/2');
  await page.reload(); await course(page);
  await expect(page.locator('#project-outlet #workspace-view')).toBeVisible();
  await expect(page.locator('.collection-header p')).toContainText('2/2');
  await expect(page.locator('#project-notes')).toHaveValue('Preparar implantação na próxima semana.');
  await page.locator('#previous-material').click();
  await expect(page.locator('#project-outlet #pdf-reader')).toBeVisible();
  await expect(page.locator('#toggle-completed')).toHaveText('Marcar como pendente');
  await page.getByRole('button', { name: 'Páginas PDF', exact: true }).click();
  await expect(page.locator('#documents-view #pdf-reader')).toBeVisible();
  await expect(page.locator('#workspace-view')).not.toBeVisible();
  await page.getByRole('button', { name: 'Traduzir vídeo', exact: true }).click();
  await expect(page.locator('#workspace-view')).toBeVisible();
  expect(await page.locator('#video').count()).toBe(1);
  await page.getByRole('button', { name: 'Projetos e assuntos', exact: true }).click();
  await expect(page.locator('#project-outlet #pdf-reader')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('appearance persists locally and supports dark project views and custom accent', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Preferências', exact: true }).click();
  await page.locator('#theme-choice').selectOption('dark');
  await page.locator('#accent-choice').fill('#ffcc00');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#ffcc00');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await course(page);
  await page.screenshot({ path: '/tmp/entrelinhas-course-dark.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/entrelinhas-course-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Gemini sends only selected text after consent and persists only reviewed translation/analysis', async ({ page, context }) => {
  const sent: any[] = [];
  await context.route(endpoint, async route => {
    const request = route.request(), body = request.postDataJSON(), units = JSON.parse(body.contents[0].parts[0].text).units;
    sent.push({ url: request.url(), headers: request.headers(), body, units });
    const translate = body.generationConfig.responseSchema.properties.translations;
    const reply = translate ? { translations: units.map((unit: any) => ({ id: unit.id, translated: 'Tradução revisável em PT-BR.' })) } : { summary: 'Acompanhe a preparação das contas.', keyPoints: ['Prepare as contas.'], questions: ['Qual é a data do fechamento?'] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) });
  });
  await seed(page); await course(page);
  await page.locator('#online-pdf').click();
  await page.locator('#review-gemini-key').fill(dummyKey);
  await page.locator('[data-online-unit="1"]').uncheck();
  await page.locator('#send-online').click();
  await expect(page.locator('#online-error')).toContainText('Confirme o envio');
  expect(sent).toHaveLength(0);
  await page.locator('#online-consent').check(); await page.locator('#send-online').click();
  await expect(page.locator('#apply-online')).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].units).toEqual([{ id: '0', text: 'Welcome to the project.' }]);
  expect(sent[0].headers['x-goog-api-key']).toBe(dummyKey);
  expect(sent[0].url).not.toContain(dummyKey);
  for (const forbidden of ['secret-welcome.pdf', 'secret-close.mp4', dummyKey, 'inlineData', 'fileData', 'block-a', 'Prepare the accounts']) expect(JSON.stringify(sent[0].body)).not.toContain(forbidden);
  expect((await readDB(page, 'documents', 'pdf')).pages[0].blocks[0].translated).toBe('');
  await page.locator('[data-proposal="0"]').fill('Boas-vindas ao projeto.');
  await page.locator('#apply-online').click();
  await expect(page.locator('.pdf-copy').first()).toHaveText('Boas-vindas ao projeto.');
  expect((await readDB(page, 'documents', 'pdf')).pages[0].blocks[1].translated).toBe('');
  await page.locator('#analyze-pdf').click();
  await expect(page.locator('#review-gemini-key')).toHaveValue(dummyKey);
  await page.locator('#online-consent').check(); await page.locator('#send-online').click();
  await expect(page.locator('#analysis-proposal')).toContainText('Acompanhe a preparação');
  await page.locator('#apply-online').click();
  await expect(page.locator('#pdf-reader .analysis-copy')).toContainText('Qual é a data');
  expect(JSON.stringify(await readDB(page, 'documents', 'pdf'))).not.toContain(dummyKey);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(dummyKey);
  await page.reload(); await course(page); await page.locator('#online-pdf').click();
  await expect(page.locator('#review-gemini-key')).toHaveValue('');
});

test('malformed Gemini response and quota errors do not overwrite translations', async ({ page, context }) => {
  let quota = false;
  await context.route(endpoint, route => route.fulfill(quota ? { status: 429, body: 'quota' } : { contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ translations: [{ id: '999', translated: '<script>bad</script>' }, { id: '0', translated: 'unexpected' }] }) }] } }] }) }));
  await seed(page); await course(page); await page.locator('#online-pdf').click();
  await page.locator('#review-gemini-key').fill(dummyKey); await page.locator('#online-consent').check(); await page.locator('#send-online').click();
  await expect(page.locator('#online-error')).toContainText('inválida');
  await expect(page.locator('#apply-online')).toHaveCount(0);
  expect((await readDB(page, 'documents', 'pdf')).pages[0].blocks.every((b: any) => b.translated === '')).toBe(true);
  quota = true; await page.locator('#send-online').click(); await expect(page.locator('#online-error')).toContainText('Cota');
});
