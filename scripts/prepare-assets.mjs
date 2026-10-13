import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('public/runtime');
await mkdir(target, { recursive: true });
await mkdir(resolve('public/licenses'), { recursive: true });
const ort = resolve('node_modules/onnxruntime-web/dist');
for (const name of await readdir(ort)) {
  if (/\.(wasm|mjs)$/.test(name) && name.startsWith('ort-wasm')) {
    await copyFile(resolve(ort, name), resolve(target, name));
  }
}
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(resolve('node_modules/@ffmpeg/core/dist/esm', name), resolve(target, name));
}
for (const [source, name] of [
  ['node_modules/@huggingface/transformers/LICENSE', 'Transformers-Apache-2.0.txt'],
  ['node_modules/lucide/LICENSE', 'Lucide-ISC.txt'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
]) {
  await copyFile(resolve(source), resolve('public/licenses', name));
}
console.log('Runtimes locais preparados.');
