import type { Project } from './types';
import type { VideoVoiceAudio } from './narration';
import { exportTranslatedVideo, type VideoExportOptions } from './video-export';
import { validateVideoExport } from './video-export-plan.mjs';

type Options={project:()=>Project|undefined;file:()=>Blob|undefined;cached:(project:Project)=>VideoVoiceAudio|undefined;stop:()=>void;allowed:()=>boolean;epoch:()=>number;isBusy:()=>boolean;onBusy:()=>void;dialog:(html:string)=>void;locate:()=>void;toast:(message:string)=>void};
export function createVideoExport(options:Options){
  const modal=document.querySelector<HTMLDialogElement>('#dialog')!;
  const find=<T extends HTMLElement=HTMLElement>(id:string)=>modal.querySelector<T>('#'+id)!;
  let busy=false,owned=false,controller:AbortController|undefined,generation=0,resultURL='';
  const release=()=>{if(resultURL){const url=resultURL;resultURL='';setTimeout(()=>URL.revokeObjectURL(url),30000);}};
  function cancel(){generation++;controller?.abort();controller=undefined;busy=false;release();options.onBusy();}
  modal.addEventListener('close',()=>{if(owned){owned=false;cancel();}});
  modal.addEventListener('cancel',()=>{if(owned)cancel();});
  function selection():VideoExportOptions{return {audio:find<HTMLSelectElement>('download-audio').value as VideoExportOptions['audio'],subtitles:find<HTMLSelectElement>('download-subtitles').value as VideoExportOptions['subtitles']};}
  function explain(){
    release();find('video-export-result').hidden=true;
    const {audio,subtitles}=selection();
    find('video-export-description').textContent=[audio==='original'?'Mantém o áudio original.':audio==='both'?'PT-BR será a faixa principal; o áudio original ficará disponível como alternativa.':'O áudio do arquivo será a narração em PT-BR.',subtitles==='burned'?'A legenda fica visível na imagem e não pode ser desligada. Essa opção exige mais tempo para montar.':subtitles==='track'?'A legenda pode ser ligada no player compatível, como VLC. Com duas faixas de áudio, há uma legenda para cada ritmo.':'O arquivo será gerado sem legenda.',audio!=='original'?'Voz Natural local em PT-BR, em ritmo 1×. A legenda acompanha a fala; as cenas podem adiantar ou atrasar. Se a narração for mais longa, a última imagem permanece até ela terminar.':'A legenda segue os tempos da transcrição.'].join(' ');
  }
  function open(){
    if(!options.allowed())return;
    if(busy||options.isBusy()){options.toast('Conclua ou cancele o processamento atual antes de baixar o vídeo.');return;}
    const project=options.project();if(!project?.segments.length)return;
    const pending=project.segments.filter(s=>!s.translated.trim()).length,hasFile=Boolean(options.file());
    release();owned=true;
    options.dialog(`<div class="dialog-symbol"><i data-lucide="download" aria-hidden="true"></i></div><h2>Baixar vídeo traduzido</h2><p>Prepare um MP4 neste dispositivo. O vídeo e o áudio continuam locais.</p><div id="video-export-fields"><label class="field-label">Áudio<select id="download-audio"><option value="pt-BR">Narração em PT-BR</option><option value="both">PT-BR + áudio original em faixas separadas</option><option value="original">Áudio original</option></select></label><label class="field-label">Legenda em PT-BR<select id="download-subtitles"><option value="burned">Fixa na imagem</option><option value="track">Faixa selecionável no player</option><option value="none">Sem legenda</option></select></label></div><p id="video-export-description" class="dialog-note"></p>${!hasFile?'<p class="library-notice">Selecione o vídeo original para montar o arquivo. Seus textos já estão guardados.</p><button type="button" class="button secondary" id="locate-export-video">Localizar vídeo original</button>':''}${pending?`<p class="library-notice">Ainda há ${pending} trecho(s) sem tradução. Traduza todos antes de incluir áudio ou legenda em PT-BR.</p>`:''}<button type="button" class="button primary" id="prepare-video-download" ${!hasFile?'disabled':''}>Preparar MP4</button><div id="video-export-progress" hidden aria-live="polite"><p id="video-export-status"></p><progress id="video-export-meter" max="100"></progress><button type="button" class="button secondary" id="cancel-video-export">Cancelar exportação</button></div><p id="video-export-error" class="field-error" role="alert"></p><div id="video-export-result" hidden><p>Vídeo pronto. Salve o arquivo no local que preferir.</p><a class="button primary" id="save-export-video">Baixar MP4</a></div><p class="dialog-note">Até 500 MB e 30 minutos de vídeo de origem. Arquivos grandes exigem memória e podem demorar, especialmente no celular. Mantenha o app aberto durante a preparação.</p>`);
    explain();
    for(const id of ['download-audio','download-subtitles'])find(id).addEventListener('change',()=>{find('video-export-error').textContent='';explain();});
    find('locate-export-video')?.addEventListener('click',()=>{modal.close();options.locate();});
    find('cancel-video-export').addEventListener('click',()=>{cancel();find('video-export-fields').querySelectorAll('select').forEach(s=>s.disabled=false);find<HTMLButtonElement>('prepare-video-download').disabled=false;find('video-export-progress').hidden=true;find('video-export-error').textContent='Exportação cancelada. O vídeo original e as traduções foram preservados.';});
    find('prepare-video-download').addEventListener('click',()=>void run());
  }
  async function run(){
    if(busy||!options.allowed()||options.isBusy())return;
    const project=options.project(),file=options.file();if(!project||!file)return;
    const selected=selection(),snapshot={...project,video:undefined,segments:project.segments.map(s=>({...s}))};
    try{validateVideoExport(snapshot,file,selected.audio,selected.subtitles);}catch(error){find('video-export-error').textContent=(error as Error).message;return;}
    const token=++generation,epoch=options.epoch();controller=new AbortController();const signal=controller.signal;
    const current=()=>token===generation&&epoch===options.epoch()&&owned&&options.allowed();
    busy=true;release();find('video-export-error').textContent='';find('video-export-result').hidden=true;find('video-export-progress').hidden=false;
    find('video-export-fields').querySelectorAll('select').forEach(s=>s.disabled=true);find<HTMLButtonElement>('prepare-video-download').disabled=true;options.onBusy();
    try{
      const cached=selected.audio==='original'?undefined:options.cached(snapshot);options.stop();
      const blob=await exportTranslatedVideo(snapshot,file,selected,signal,(message,percent)=>{if(!current())return;find('video-export-status').textContent=message;const meter=find<HTMLProgressElement>('video-export-meter');if(percent===undefined)meter.removeAttribute('value');else meter.value=percent;},cached);
      if(!current())return;
      resultURL=URL.createObjectURL(blob);const save=find<HTMLAnchorElement>('save-export-video');save.href=resultURL;save.download=`${project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'entrelinhas'}-${selected.audio==='original'&&selected.subtitles==='none'?'original':'pt-br'}.mp4`;
      find('video-export-result').hidden=false;find('video-export-progress').hidden=true;
    }catch(error){if(current())find('video-export-error').textContent=error instanceof Error?error.message:'Não foi possível exportar neste dispositivo. Tente um vídeo menor e confira a memória disponível.';}
    finally{if(token===generation){controller=undefined;busy=false;options.onBusy();if(owned){find('video-export-progress').hidden=true;find('video-export-fields').querySelectorAll('select').forEach(s=>s.disabled=false);find<HTMLButtonElement>('prepare-video-download').disabled=false;}}}
  }
  return {open,cancel,get busy(){return busy;}};
}
