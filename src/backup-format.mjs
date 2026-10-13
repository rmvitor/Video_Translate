import { Zip, ZipPassThrough, unzipSync, strToU8, strFromU8 } from 'fflate';
import { validateProject } from './subtitles.mjs';
import { LANGUAGES } from './preferences.mjs';
const MAGIC = strToU8('ELBK0001');
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
const PASSWORD_MIN=12, ITERATIONS=250000;
const id=value=>{if(typeof value!=='string'||!value||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new Error('Identificação inválida no backup.');return value;};
const text=(value,max=20000)=>{if(typeof value!=='string'||value.length>max)throw new Error('Texto inválido no backup.');return value;};
const number=value=>{if(!Number.isFinite(value)||value<0)throw new Error('Número inválido no backup.');return value;};
const coordinate=value=>{if(!Number.isFinite(value)||Math.abs(value)>1e9)throw new Error('Posição inválida no backup.');return value;};
const optionalText=(value,max)=>value===undefined?undefined:text(value,max);
function metadata(value) { return {id:id(value.id),title:text(value.title,250),createdAt:number(value.createdAt),collectionId:value.collectionId?id(value.collectionId):undefined,subjectId:value.subjectId?id(value.subjectId):undefined,completedAt:value.completedAt===undefined?undefined:number(value.completedAt),sourceLanguage:LANGUAGES.some(([code])=>code===value.sourceLanguage)?value.sourceLanguage:'en',analysis:optionalText(value.analysis,40000)}; }
async function keyFor(password,salt) {
  if(typeof password!=='string'||password.length<PASSWORD_MIN)throw new Error('Use uma senha de backup com pelo menos 12 caracteres.');
  const raw=await crypto.subtle.importKey('raw',strToU8(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function createBackup(snapshot,password,includeVideos=true,onProgress=(done,total)=>{}) {
  const files=new Map(), addBlob=(blob)=>{if(!(blob instanceof Blob))throw new Error('Arquivo local inválido.');const path=`blobs/${files.size}`;files.set(path,blob);return {path,type:blob.type};};
  const projects=snapshot.projects.map(value=>({...metadata(value),...validateProject({version:1,...value}),video:includeVideos&&value.video?addBlob(value.video):undefined}));
  const collections=snapshot.collections.map(value=>({id:id(value.id),title:text(value.title,250),createdAt:number(value.createdAt),subjects:value.subjects.map(subject=>({id:id(subject.id),title:text(subject.title,250)})),lastMaterialId:value.lastMaterialId?id(value.lastMaterialId):undefined,notes:optionalText(value.notes,20000)}));
  const documents=snapshot.documents.map(value=>({...metadata(value),filename:text(value.filename,250),pages:value.pages.map(page=>({number:page.number,blocks:page.blocks.map(block=>({id:id(block.id),original:text(block.original),translated:text(block.translated),y:coordinate(block.y),heading:Boolean(block.heading)})),images:page.images.map(image=>({id:id(image.id),width:number(image.width),height:number(image.height),y:coordinate(image.y),displayWidth:image.displayWidth,blank:Boolean(image.blank),blob:addBlob(image.blob)})),preview:addBlob(page.preview)}))}));
  const manifest=strToU8(JSON.stringify({format:'entrelinhas-local',version:1,projects,collections,documents}));
  if(manifest.length>8*1024*1024||[...files.values()].reduce((total,file)=>total+file.size,manifest.length)>MAX_BACKUP_BYTES-100000)throw new Error('Backup muito grande (limite 512 MB). Exporte sem os vídeos e transfira os arquivos originais separadamente.');
  // Store ZIP entries without compression. Stream local media into the archive without a single huge array per video.
  const packed=await new Promise(async(resolve,reject)=>{
    const chunks=[];let size=0;const zip=new Zip((err,data,final)=>{if(err){reject(err);return;}size+=data.length;if(size>MAX_BACKUP_BYTES){reject(new Error('Backup excede o limite de tamanho.'));return;}chunks.push(data);if(final)resolve(new Blob(chunks));});
    try{
      const record=new ZipPassThrough('manifest.json');zip.add(record);record.push(manifest,true);
      let completed=0;
      for(const [path,blob] of files){const entry=new ZipPassThrough(path);zip.add(entry);const reader=blob.stream().getReader();try{while(true){const {value,done}=await reader.read();if(done)break;entry.push(value,false);}}finally{reader.releaseLock();}entry.push(new Uint8Array(),true);onProgress(++completed,files.size);}
      zip.end();
    }catch(err){zip.terminate();reject(err);}
  });
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFor(password,salt);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:MAGIC},key,await packed.arrayBuffer());
  return new Blob([MAGIC,salt,iv,cipher],{type:'application/octet-stream'});
}
export async function readBackup(blob,password) {
  if(blob.size>MAX_BACKUP_BYTES+1024||blob.size<52)throw new Error('Arquivo de backup inválido ou acima de 512 MB.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(!MAGIC.every((value,index)=>bytes[index]===value))throw new Error('Selecione um backup .entrelinhas criado pelo aplicativo.');
  let raw;
  try{const key=await keyFor(password,bytes.slice(8,24));raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(24,36),additionalData:MAGIC},key,bytes.slice(36));}
  catch{throw new Error('Senha incorreta ou backup corrompido. Nada foi importado.');}
  let count=0,total=0;
  const entries=unzipSync(new Uint8Array(raw),{filter:entry=>{
    if(++count>10000||!(/^(manifest\.json|blobs\/\d+)$/.test(entry.name))||entry.compression!==0||(total+=entry.originalSize)>MAX_BACKUP_BYTES)throw new Error('Estrutura de backup inválida.');
    return true;
  }});
  if(!entries['manifest.json']||entries['manifest.json'].length>8*1024*1024)throw new Error('Índice do backup inválido.');
  const value=JSON.parse(strFromU8(entries['manifest.json']));
  if(value.format!=='entrelinhas-local'||value.version!==1||!['projects','collections','documents'].every(name=>Array.isArray(value[name])&&value[name].length<=10000))throw new Error('Versão ou estrutura de backup inválida.');
  const asset=(reference,image=false)=>{
    if(!reference||!/^blobs\/\d+$/.test(reference.path)||!entries[reference.path]||typeof reference.type!=='string'||reference.type.length>100||(image&&!['image/png','image/webp','image/jpeg'].includes(reference.type))||(!image&&reference.type&&!reference.type.startsWith('video/')&&!['application/octet-stream','application/x-matroska'].includes(reference.type)))throw new Error('Arquivo incorporado inválido.');
    return new Blob([entries[reference.path]],{type:reference.type});
  };
  const collections=value.collections.map(collection=>{
    if(!Array.isArray(collection.subjects)||collection.subjects.length>1000)throw new Error('Subassuntos inválidos.');
    return {id:id(collection.id),title:text(collection.title,250),createdAt:number(collection.createdAt),subjects:collection.subjects.map(subject=>({id:id(subject.id),title:text(subject.title,250)})),lastMaterialId:collection.lastMaterialId?id(collection.lastMaterialId):undefined,notes:optionalText(collection.notes,20000)};
  });
  const projects=value.projects.map(project=>({...metadata(project),...validateProject({version:1,...project}),video:project.video?asset(project.video):undefined}));
  const documents=value.documents.map(document=>{
    if(!Array.isArray(document.pages)||document.pages.length>100)throw new Error('Páginas inválidas.');
    return {...metadata(document),filename:text(document.filename,250),pages:document.pages.map(page=>{
      if(!Number.isInteger(page.number)||page.number<1||!Array.isArray(page.blocks)||page.blocks.length>10000||!Array.isArray(page.images)||page.images.length>2000)throw new Error('Página inválida.');
      return {number:page.number,preview:asset(page.preview,true),blocks:page.blocks.map(block=>({id:id(block.id),original:text(block.original),translated:text(block.translated),y:coordinate(block.y),heading:Boolean(block.heading)})),images:page.images.map(image=>({id:id(image.id),blob:asset(image.blob,true),width:number(image.width),height:number(image.height),y:coordinate(image.y),displayWidth:image.displayWidth===undefined?undefined:number(image.displayWidth),blank:Boolean(image.blank)}))};
    })};
  });
  for(const items of [collections,projects,documents])if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Identificações duplicadas no backup.');
  return {projects,collections,documents};
}
