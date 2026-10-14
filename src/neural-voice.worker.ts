import * as ort from 'onnxruntime-web/wasm';
import { trimPadding, pcm16, encodeWav } from './voice-audio.mjs';

type Language='pt-BR'|'en-US';
type Chunk={text:string;lang:Language;marks:{id:string;offset:number}[]};
const ROOT='https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/';
const VOICES={
  'pt-BR':{root:ROOT+'pt/pt_BR/faber/medium/',file:'pt_BR-faber-medium',label:'PT-BR'},
  'en-US':{root:ROOT+'en/en_US/ljspeech/high/',file:'en_US-ljspeech-high',label:'inglês'},
};
const CACHE='entrelinhas-voice-v1';
const models=new Map<Language,{session:ort.InferenceSession;config:any}>();
let phonemizer:any,printed:(ids:number[])=>void=()=>{},queue=Promise.resolve(),activeId=0;
const progress=(message:string)=>self.postMessage({id:activeId,type:'progress',message});
async function resource(language:Language,extension:string){
  const voice=VOICES[language],url=voice.root+voice.file+extension,cache=await caches.open(CACHE),saved=await cache.match(url);
  if(saved)return saved;
  progress(`Baixando a voz natural em ${voice.label}…`);
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Não foi possível baixar a voz em ${voice.label} (HTTP ${response.status}).`);
  try{await cache.put(url,response.clone());}catch{progress('Sem espaço para guardar a voz; disponível nesta sessão.');}
  return response;
}
async function prepare(baseURL:string,language:Language){
  if(models.has(language))return models.get(language)!;
  if(!phonemizer){
    progress('Preparando as vozes locais…');
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('runtime/',baseURL).href;
    const runtime=new URL('runtime/piper/',baseURL).href;
    const {default:createPiper}=await import(/* @vite-ignore */ `${runtime}piper-phonemize.mjs`);
    phonemizer=await createPiper({noInitialRun:true,noExitRuntime:true,locateFile:(file:string)=>runtime+file,
      print:(line:string)=>{try{const value=JSON.parse(line);if(Array.isArray(value.phoneme_ids))printed(value.phoneme_ids);}catch{/* Never log supplied text. */}},printErr:()=>{},
    });
  }
  const config=await(await resource(language,'.onnx.json')).json();
  const bytes=await(await resource(language,'.onnx')).arrayBuffer();
  progress(`Carregando a voz em ${VOICES[language].label} no dispositivo…`);
  const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
  const model={session,config};models.set(language,model);return model;
}
async function generate(chunk:Chunk,baseURL:string){
  const {session,config}=await prepare(baseURL,chunk.lang);
  const ids=await new Promise<number[]>((resolve,reject)=>{
    let complete=false;printed=value=>{complete=true;resolve(value);};
    try{phonemizer.callMain(['-l',config.espeak.voice,'--input',JSON.stringify([{text:chunk.text.trim()}]),'--espeak_data','/espeak-ng-data']);if(!complete)reject(new Error('Não foi possível preparar a pronúncia local.'));}catch{reject(new Error('Não foi possível preparar a pronúncia local.'));}
  });
  const input=BigInt64Array.from(ids,BigInt);
  const result=await session.run({input:new ort.Tensor('int64',input,[1,input.length]),input_lengths:new ort.Tensor('int64',BigInt64Array.from([input.length],BigInt)),scales:new ort.Tensor('float32',Float32Array.from([config.inference.noise_scale,config.inference.length_scale,config.inference.noise_w]))});
  if(config.audio.sample_rate!==22050)throw new Error('Formato de voz local incompatível.');
  return pcm16(trimPadding(result.output.data as Float32Array,22050));
}
self.onmessage=event=>{
  const {id,text,chunks:provided,baseURL,languages}=event.data;
  queue=queue.then(async()=>{
    activeId=id;
    try{
      const chunks:Chunk[]=provided??(typeof text==='string'&&text.trim()?[{text,lang:'pt-BR',marks:[]}]:[]);
      if(!Array.isArray(chunks)||chunks.length>4096||chunks.some(chunk=>typeof chunk.text!=='string'||chunk.text.length>1000||!Object.hasOwn(VOICES,chunk.lang)||!Array.isArray(chunk.marks)||chunk.marks.some(mark=>typeof mark.id!=='string'||mark.id.length>100||!Number.isInteger(mark.offset)||mark.offset<0||mark.offset>chunk.text.length))||chunks.reduce((sum,chunk)=>sum+chunk.text.length,0)>60000)throw new Error('Texto de narração inválido.');
      if(!chunks.length){
        const selected:Language[]=languages??['pt-BR'];
        if(!Array.isArray(selected)||selected.length>2||selected.some(language=>!Object.hasOwn(VOICES,language)))throw new Error('Idioma de voz inválido.');
        for(const language of selected)await prepare(baseURL,language);
        self.postMessage({id,type:'ready'});return;
      }
      const parts:Int16Array[]=[],marks:{id:string;start:number}[]=[];let length=0;
      for(const [index,chunk] of chunks.entries()){
        progress(`Preparando a narração contínua: ${index+1} de ${chunks.length}…`);
        const samples=await generate(chunk,baseURL);
        for(const mark of chunk.marks)marks.push({id:mark.id,start:(length+samples.length*mark.offset/Math.max(1,chunk.text.length))/22050});
        parts.push(samples);length+=samples.length;
        if(length*2>128*1024*1024)throw new Error('Narração muito longa para uma única leitura. Leia uma parte por vez.');
      }
      const audio=encodeWav(parts,22050);
      self.postMessage({id,type:'audio',audio,duration:length/22050,marks},[audio]);
    }catch(error){self.postMessage({id,type:'error',message:error instanceof Error?error.message:'Não foi possível gerar as vozes neste dispositivo.'});}
  });
};
