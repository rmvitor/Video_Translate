import { mkdir, copyFile, readdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('public/runtime');
await mkdir(target, { recursive: true });
const piper=resolve(target,'piper');await mkdir(piper,{recursive:true});
for(const name of ['piper_phonemize.data','piper_phonemize.wasm'])await copyFile(resolve('node_modules/@diffusionstudio/piper-wasm/build',name),resolve(piper,name));
await writeFile(resolve(piper,'piper-phonemize.mjs'),await readFile(resolve('node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js'),'utf8')+'\nexport default createPiperPhonemize;\n');
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
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(resolve('node_modules/pdfjs-dist', directory), resolve(target, 'pdf', directory), { recursive: true });
}
for (const [source, name] of [
  ['node_modules/@huggingface/transformers/LICENSE', 'Transformers-Apache-2.0.txt'],
  ['node_modules/lucide/LICENSE', 'Lucide-ISC.txt'],
  ['node_modules/pdfjs-dist/LICENSE', 'PDFjs-Apache-2.0.txt'],
  ['node_modules/@supabase/supabase-js/LICENSE', 'Supabase-MIT.txt'],
  ['node_modules/fflate/LICENSE', 'fflate-MIT.txt'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
]) {
  await copyFile(resolve(source), resolve('public/licenses', name));
}
console.log('Runtimes locais preparados.');
