import * as ort from 'onnxruntime-web/wasm';

const MODEL_ROOT='https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/pt/pt_BR/faber/medium/';
const CACHE='entrelinhas-voice-v1';
let session:ort.InferenceSession|undefined,config:any,phonemizer:any,initializing:Promise<void>|undefined;
let printed:(ids:number[])=>void=()=>{};
let queue=Promise.resolve();
const progress=(message:string)=>self.postMessage({type:'progress',message});
async function resource(name:string) {
  const url=MODEL_ROOT+name,cache=await caches.open(CACHE),saved=await cache.match(url);
  if(saved)return saved;
  progress('Baixando a voz natural PT-BR…');
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Não foi possível baixar a voz natural (HTTP ${response.status}).`);
  const copy=response.clone();try{await cache.put(url,copy);}catch{progress('Sem espaço para guardar a voz; disponível nesta sessão.');}
  return response;
}
async function prepare(baseURL:string) {
  if(session)return;
  if(initializing)return initializing;
  initializing=(async()=>{
    progress('Preparando a voz neural local…');
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('runtime/',baseURL).href;
    const runtime=new URL('runtime/piper/',baseURL).href;
    const {default:createPiper}=await import(/* @vite-ignore */ `${runtime}piper-phonemize.mjs`);
    phonemizer=await createPiper({noInitialRun:true,noExitRuntime:true,locateFile:(file:string)=>runtime+file,
      print:(line:string)=>{try{const value=JSON.parse(line);if(Array.isArray(value.phoneme_ids))printed(value.phoneme_ids);}catch{/* Ignore runtime diagnostics; never log the supplied text. */}},
      printErr:()=>{},
    });
    config=await (await resource('pt_BR-faber-medium.onnx.json')).json();
    const model=await (await resource('pt_BR-faber-medium.onnx')).arrayBuffer();
    progress('Carregando a voz natural no dispositivo…');
    session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
    progress('Voz Faber pronta. Narração gerada neste dispositivo.');
  })();
  try{await initializing;}finally{initializing=undefined;}
}
function wav(samples:Float32Array,rate:number) {
  const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);
  const tag=(offset:number,text:string)=>[...text].forEach((letter,index)=>view.setUint8(offset+index,letter.charCodeAt(0)));
  tag(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);
  view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,index)=>view.setInt16(44+index*2,Math.max(-1,Math.min(1,sample))*(sample<0?32768:32767),true));return bytes;
}
self.onmessage=event=>{
  const {id,text,baseURL}=event.data;
  queue=queue.then(async()=>{
    try {
      await prepare(baseURL);
      if(typeof text!=='string'||text.length>1000)throw new Error('Trecho de narração inválido.');
      if(!text.trim()){self.postMessage({id,type:'ready'});return;}
      const ids=await new Promise<number[]>((resolve,reject)=>{
        let complete=false;printed=value=>{complete=true;resolve(value);};
        try{phonemizer.callMain(['-l',config.espeak.voice,'--input',JSON.stringify([{text:text.trim()}]),'--espeak_data','/espeak-ng-data']);if(!complete)reject(new Error('Não foi possível preparar a pronúncia local.'));}catch{reject(new Error('Não foi possível preparar a pronúncia local.'));}
      });
      const input=BigInt64Array.from(ids,BigInt);
      const result=await session!.run({input:new ort.Tensor('int64',input,[1,input.length]),input_lengths:new ort.Tensor('int64',BigInt64Array.from([input.length],BigInt)),scales:new ort.Tensor('float32',Float32Array.from([config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w]))});
      const audio=wav(result.output.data as Float32Array,config.audio.sample_rate);
      self.postMessage({id,type:'audio',audio},[audio]);
    }catch(error){self.postMessage({id,type:'error',message:error instanceof Error?error.message:'Não foi possível gerar a voz natural neste dispositivo.'});}
  });
};
