import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Test-only proxy adapter. Large public model GETs stream through the static
// test server, avoiding Chromium's 100 MB DevTools pipe. No private files use it.
export async function cloudModelTransport(context){
  let count=0;
  if(process.env.HTTPS_PROXY||process.env.https_proxy){
    const execute=promisify(execFile),pending=new Set();
    context.once('close',()=>{for(const directory of pending)void rm(directory,{recursive:true,force:true});});
    await context.route(/^https:\/\/(huggingface\.co|[^/]+\.hf\.co|[^/]+\.xethub\.hf\.co)\//,async route=>{
      if(route.request().method()!=='GET')throw new Error('Unexpected external request method');
      const directory=await mkdtemp(join(tmpdir(),'entrelinhas-model-get-'));let streaming=false;
      try{
        await execute('curl',['--silent','--show-error','--location','--max-time','300','-D',join(directory,'headers'),'-o',join(directory,'body'),route.request().url()],{timeout:310000});
        const headers=await readFile(join(directory,'headers'),'utf8'),statuses=[...headers.matchAll(/^HTTP\/[^\s]+\s+(\d+)/gm)];
        const status=Number(statuses.at(-1)?.[1]||502),contentType=[...headers.matchAll(/^content-type:\s*(.+)$/gim)].at(-1)?.[1].trim()||'application/octet-stream',size=(await stat(join(directory,'body'))).size;
        count++;if(status>=400)console.log(`Model GET returned ${status}.`);
        if(size<=65*1024*1024)await route.fulfill({status,body:await readFile(join(directory,'body')),headers:{'content-type':contentType,'access-control-allow-origin':'*'}});
        else{
          pending.add(directory);await route.fulfill({status:302,headers:{location:`http://127.0.0.1:4173/Video_Translate/__public_model_test__/${directory.split('/').at(-1)}`,'access-control-allow-origin':'*'},body:''});streaming=true;
        }
      }catch{await route.abort('failed').catch(()=>{});}
      finally{if(!streaming)await rm(directory,{recursive:true,force:true});}
    });
  }
  return()=>count;
}
