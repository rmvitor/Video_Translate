import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function walk(directory, prefix = '') {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${item.name}`;
    if (item.isDirectory()) files.push(...await walk(join(directory, item.name), `${path}/`));
    else if (item.name !== 'sw.js') files.push(path);
  }
  return files;
}
const files = (await walk('dist')).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(join('dist', file)));
const version = hash.digest('hex').slice(0, 16);
await writeFile('dist/sw.js', `// Generated for this build; only same-origin app files are cached here.
const PREFIX = 'entrelinhas-shell:' + self.registration.scope + ':';
const CACHE = PREFIX + ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(path => new URL(path, self.registration.scope).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Requests for videos use blob URLs and never enter this handler. No POST/upload is handled.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try { return await fetch(event.request); }
      catch { return await cache.match(new URL('index.html', self.registration.scope).href) || Response.error(); }
    }
    return await cache.match(event.request) || fetch(event.request);
  })());
});
`);
console.log(`PWA: ${files.length} arquivos preparados para uso offline (build ${version}).`);
