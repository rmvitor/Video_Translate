// Static test server that reproduces GitHub Pages' repository subdirectory.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const model=url.pathname.match(/^\/Video_Translate\/__public_model_test__\/(entrelinhas-model-get-[a-zA-Z0-9]+)$/);
    if(model&&req.method==='GET'){
      const path=resolve(tmpdir(),model[1],'body'),info=await stat(path);
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':info.size,'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});
      const stream=createReadStream(path);stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);return;
    }
    if (!url.pathname.startsWith('/Video_Translate/')) { res.writeHead(404); res.end(); return; }
    let path = resolve(root, decodeURIComponent(url.pathname.slice('/Video_Translate/'.length)) || 'index.html');
    if (!path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
    let info = await stat(path);
    if(info.isDirectory()){
      if(!url.pathname.endsWith('/')){res.writeHead(301,{Location:url.pathname+'/'+url.search});res.end();return;}
      path=resolve(path,'index.html');info=await stat(path);
    }
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
}).listen(4173, '127.0.0.1', () => console.log('Servidor estático de testes em /Video_Translate/.'));
