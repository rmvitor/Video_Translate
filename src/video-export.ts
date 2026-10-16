import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { LocalNarrator, type VideoVoiceAudio, type ReadingItem } from './narration';
import type { Project } from './types';
import { validateVideoExport, exportTimeline, videoSubtitles, videoExportCommand } from './video-export-plan.mjs';

export type VideoExportOptions={audio:'pt-BR'|'original'|'both';subtitles:'burned'|'track'|'none'};
export const videoReadingItems=(project:Project):ReadingItem[]=>project.segments.map((segment,index)=>({id:String(index),text:segment.translated,original:segment.original,sourceLanguage:project.sourceLanguage||'en'}));

export async function exportTranslatedVideo(project:Project,file:Blob,options:VideoExportOptions,signal:AbortSignal,progress:(message:string,percent?:number)=>void,cached?:VideoVoiceAudio):Promise<Blob> {
  validateVideoExport(project,file,options.audio,options.subtitles);signal.throwIfAborted();
  let narration:VideoVoiceAudio|undefined;
  if(options.audio!=='original'){
    if(cached){narration=cached;progress('Reutilizando a narração em PT-BR já preparada…',30);}
    else{
      const voice=new LocalNarrator(),unsubscribe=voice.subscribe(()=>progress(voice.status));
      try{narration=await voice.renderVideoAudio(videoReadingItems(project),signal);}finally{unsubscribe();voice.dispose();}
    }
  }
  signal.throwIfAborted();
  const timeline=exportTimeline(project.segments,project.duration,narration),ffmpeg=new FFmpeg();
  let mounted=false;
  const abort=()=>ffmpeg.terminate();signal.addEventListener('abort',abort,{once:true});
  try{
    const base=new URL(import.meta.env.BASE_URL,document.baseURI);
    progress('Preparando a montagem do vídeo no dispositivo…',35);
    await ffmpeg.load({coreURL:new URL('runtime/ffmpeg-core.js',base).href,wasmURL:new URL('runtime/ffmpeg-core.wasm',base).href});signal.throwIfAborted();
    await ffmpeg.createDir('/source');
    mounted=await ffmpeg.mount(FFFSType.WORKERFS,{blobs:[{name:'video',data:file}]},'/source');
    if(!mounted)await ffmpeg.writeFile('/source/video',new Uint8Array(await file.arrayBuffer()));
    const probe=await ffmpeg.ffprobe(['-v','error','-show_entries','stream=codec_type,codec_name:format=duration','-of','json','/source/video','-o','probe.json']);
    // core 0.12.10 leaves ret=-1 after a successful ffprobe. Require its complete
    // JSON manifest as well; a missing/invalid manifest must still fail closed.
    if(probe!==0&&probe!==-1)throw new Error('Não foi possível ler as faixas do vídeo original.');
    let info;
    try{info=JSON.parse(String(await ffmpeg.readFile('probe.json','utf8')));if(!Array.isArray(info.streams)||!Number.isFinite(Number(info.format?.duration))||Number(info.format.duration)<=0)throw new Error();}
    catch{throw new Error('Não foi possível ler as faixas do vídeo original.');}
    const video=info.streams.find((stream:{codec_type:string})=>stream.codec_type==='video');
    if(!video)throw new Error('O arquivo não contém uma faixa de vídeo válida.');
    if(narration)await ffmpeg.writeFile('narration.wav',new Uint8Array(await narration.blob.arrayBuffer()));
    if(options.subtitles!=='none')await ffmpeg.writeFile('captions.srt',videoSubtitles(timeline.captions));
    if(options.subtitles==='track'&&options.audio==='both')await ffmpeg.writeFile('original-timing.srt',videoSubtitles(exportTimeline(project.segments,project.duration).captions));
    if(options.subtitles==='burned'){
      progress('Preparando a legenda fixa…',40);await ffmpeg.createDir('fonts');
      const response=await fetch(new URL('runtime/pdf/standard_fonts/LiberationSans-Regular.ttf',base),{signal});
      if(!response.ok)throw new Error('Não foi possível carregar a fonte da legenda. Abra o app conectado e tente novamente.');
      await ffmpeg.writeFile('fonts/LiberationSans-Regular.ttf',new Uint8Array(await response.arrayBuffer()));
    }
    signal.throwIfAborted();
    ffmpeg.on('progress',event=>{if(!signal.aborted)progress('Montando o MP4. Mantenha esta tela aberta…',45+Math.min(1,Math.max(0,event.time/1000000/timeline.duration))*48);});
    progress('Montando o MP4. Mantenha esta tela aberta…',45);
    const code=await ffmpeg.exec(videoExportCommand({...options,videoDuration:project.duration,duration:timeline.duration,leadIn:timeline.leadIn,videoCodec:video.codec_name,hasOriginalAudio:info.streams.some((stream:{codec_type:string})=>stream.codec_type==='audio')}));
    signal.throwIfAborted();
    if(code!==0)throw new Error('Não foi possível montar o MP4 neste dispositivo. Tente um vídeo menor ou outra opção de legenda. O original foi preservado.');
    progress('Preparando o arquivo para baixar…',96);
    const bytes=await ffmpeg.readFile('translated.mp4');signal.throwIfAborted();
    if(!(bytes instanceof Uint8Array)||bytes.length<100)throw new Error('A exportação não gerou um vídeo válido.');
    return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'video/mp4'});
  }finally{
    signal.removeEventListener('abort',abort);
    if(mounted&&!signal.aborted)await ffmpeg.unmount('/source').catch(()=>{});
    ffmpeg.terminate();
  }
}
