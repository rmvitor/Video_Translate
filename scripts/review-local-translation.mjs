// Public synthetic sentences only. Exercises the production translation worker,
// without uploading content, accessing a real account or using Gemini.
import {chromium} from '@playwright/test';
import {mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localAccessFixture} from './local-access-fixture.mjs';
import {cloudModelTransport} from './model-transport.mjs';

const sentences=[
  'Do not post entries until the reconciliation is approved.',
  'Close Management is the name of the menu. Keep this interface label unchanged.',
  'Click Home Management, then select Insight.',
  'The balance is $1,250.50, not $1,520.50.',
  'The administrator can approve tasks; the preparer cannot.',
  'Never share your password or multi-factor authentication code.',
  'If the due date falls on a weekend, move it to the next business day.',
  'The account is locked, but the period is still open.',
  'Carry forward the opening balance without duplicating the journal entries.',
  'Perform a three-way match between the purchase order, goods receipt, and invoice.',
  'An aging report lists outstanding items by the number of days overdue.',
  'Access is read-only unless the administrator grants edit permission.',
];
const profile=process.env.AI_TEST_PROFILE||await mkdtemp(join(tmpdir(),'entrelinhas-quality-'));
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
  await localAccessFixture(context);const transfers=await cloudModelTransport(context);
  const page=await context.newPage();await page.bringToFront();for(const other of context.pages())if(other!==page)await other.close();
  await page.goto('http://127.0.0.1:4173/Video_Translate/');await page.locator('#app').waitFor({state:'visible'});
  const worker=(await readdir('dist/assets')).find(name=>/^processor.worker-.*\.js$/.test(name));if(!worker)throw new Error('Build the application first.');
  const results=await page.evaluate(({worker,sentences})=>new Promise((resolve,reject)=>{
    const engine=new Worker(new URL('assets/'+worker,location.href),{type:'module'}),output=[];
    const timer=setTimeout(()=>{engine.terminate();reject(new Error('Translation timed out'));},600000);
    const finish=()=>{clearTimeout(timer);engine.terminate();};
    engine.onerror=()=>{finish();reject(new Error('Translation worker failed'));};
    engine.onmessage=event=>{
      const message=event.data;
      if(message.type==='text-translated')output.push({source:sentences[Number(message.id)],translation:message.translated});
      if(message.type==='text-complete'){finish();resolve(output);}
      if(message.type==='error'){finish();reject(new Error(message.message));}
    };
    engine.postMessage({blocks:sentences.map((text,index)=>({id:String(index),text})),sourceLanguage:'en',baseURL:new URL('./',location.href).href});
  }),{worker,sentences});
  if(results.length!==sentences.length||results.some(result=>!result.translation?.trim()))throw new Error('Missing translation results');
  console.log(JSON.stringify({model:'Xenova/opus-mt-en-ROMANCE',dtype:'q8',engine:'production browser WASM worker',modelGETs:transfers(),results},null,2));
}finally{await context.close();}
