import type { Segment } from './types';
import { buildNarrationPlan, buildVideoNarrationPlan, narrationPlaybackRate, narrationPosition, narrationCueTiming } from './narration-plan.mjs';

export type ReadingItem = {id:string;text:string;original?:string;sourceLanguage?:string};
export type NarrationLanguage='mixed'|'pt-BR'|'en-US';
const NEURAL_VOICE={voiceURI:'entrelinhas:piper:faber',name:'Natural local',lang:'pt-BR',localService:true,default:true};
type Prepared={audio?:ArrayBuffer;duration?:number;marks?:{id:string;start:number}[]};
export class LocalNarrator {
  state:'idle'|'reading'|'paused'='idle';
  private chosenVoice='';
  language:NarrationLanguage='pt-BR';
  englishTerms='';
  get voiceURI(){return this.chosenVoice;}
  set voiceURI(value:string){this.chosenVoice=value;try{localStorage.setItem('entrelinhas.voice',value);}catch{/* Session choice remains available. */}}
  rate=1;
  private token=0;
  private listeners=new Set<()=>void>();
  private watchdog?:ReturnType<typeof setTimeout>;
  private neuralWorker?:Worker;
  private neuralId=0;
  private requests=new Map<number,{resolve:(value:Prepared)=>void;reject:(error:Error)=>void;touch:()=>void}>();
  private audio?:HTMLAudioElement;
  private audioURL='';
  private utterances:SpeechSynthesisUtterance[]=[];
  private seconds=0;
  private audioMarks:{id:string;start:number}[]=[];
  ready=false;
  preparing=false;
  get duration(){return this.seconds;}
  get audioPosition(){return this.audio?.currentTime??0;}
  get audioCue(){if(!this.audio||!this.ready)return undefined;return [...this.audioMarks].reverse().find(mark=>mark.start<=this.audioPosition)?.id;}
  cueTiming(segments:Segment[]){return this.audioCue===undefined?null:narrationCueTiming(segments,this.audioMarks,this.seconds,this.audioCue);}
  get usesNaturalVoice(){return this.voice.voiceURI===NEURAL_VOICE.voiceURI||(this.language!=='pt-BR'&&!this.englishVoice);}
  seekVideo(segments:Segment[],time:number){
    if(!this.audio||!this.ready)return null;
    const position=narrationPosition(segments,this.audioMarks,this.seconds,time);
    this.audio.pause();this.audio.currentTime=Math.min(this.seconds,Math.max(0,position.offset));
    this.state='paused';this.status='Narração contínua pronta.';this.notify();return position;
  }
  status='Voz natural local em PT-BR. Prepare a voz antes do primeiro uso.';
  readonly available='speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
  constructor(){
    try{this.chosenVoice=localStorage.getItem('entrelinhas.voice')||'';}catch{/* Use natural voices by default. */}
    if(this.available)speechSynthesis.addEventListener('voiceschanged',()=>this.notify());
  }
  get voices(){return [NEURAL_VOICE,...(this.available?speechSynthesis.getVoices().filter(v=>v.localService&&v.lang.replace('_','-').toLowerCase()==='pt-br'):[])];}
  get voice(){return this.voices.find(v=>v.voiceURI===this.voiceURI)??this.voices[0];}
  private get englishVoice(){return this.available?speechSynthesis.getVoices().find(v=>v.localService&&/^en(?:[-_]|$)/i.test(v.lang)):undefined;}
  subscribe(listener:()=>void){this.listeners.add(listener);listener();return()=>this.listeners.delete(listener);}
  private notify(){for(const listener of this.listeners)listener();}
  requireVoice(){if(this.voice.voiceURI===NEURAL_VOICE.voiceURI)return;if(!this.available)throw new Error('Use um navegador compatível com narração local.');}
  stop(){
    const active=this.state!=='idle'||this.preparing||this.requests.size>0;
    this.token++;clearTimeout(this.watchdog);
    if(this.available)speechSynthesis.cancel();
    this.clearAudio();this.utterances=[];this.seconds=0;this.ready=false;
    if(this.requests.size){this.neuralWorker?.terminate();this.neuralWorker=undefined;for(const request of this.requests.values())request.reject(new Error('Narração cancelada.'));this.requests.clear();}
    this.onFailure=undefined;this.playbackError=undefined;this.state='idle';this.preparing=false;if(active)this.status='Narração interrompida.';this.notify();
  }
  pause(){if(this.state==='reading'){clearTimeout(this.watchdog);this.audio?.pause();if(this.utterances.length)speechSynthesis.pause();this.state='paused';this.notify();}}
  resume(){if(this.state==='paused'){this.state='reading';if(this.audio)void this.audio.play().catch(()=>this.playbackError?.('Dê play novamente para permitir a narração neste navegador.'));else if(this.utterances.length){speechSynthesis.resume();this.armWatchdog(this.token);}this.notify();}}
  setPlaybackRate(value:number){const rate=Math.min(2,Math.max(.6,value));if(this.audio)this.audio.playbackRate=rate;for(const utterance of this.utterances)utterance.rate=rate;}
  private clearAudio(){this.audioMarks=[];if(this.audio){this.audio.onended=null;this.audio.onerror=null;this.audio.ontimeupdate=null;this.audio.onplay=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.audio=undefined;}if(this.audioURL){URL.revokeObjectURL(this.audioURL);this.audioURL='';}}
  private armWatchdog(token:number){clearTimeout(this.watchdog);this.watchdog=setTimeout(()=>{if(token===this.token&&this.state==='reading'){const failure=this.onFailure;this.stop();failure?.('A voz não respondeu. Tente outra voz local.');}},120000);}
  private onFailure?:(error:string)=>void;
  private playbackError?:(error:string)=>void;
  private synthesize(chunks:ReturnType<typeof buildNarrationPlan>,languages?:string[]):Promise<Prepared>{
    if(!this.neuralWorker){
      this.neuralWorker=new Worker(new URL('./neural-voice.worker.ts',import.meta.url),{type:'module'});
      this.neuralWorker.onmessage=event=>{
        const data=event.data,request=this.requests.get(data.id);
        if(data.type==='progress'){if(request){request.touch();this.status=data.message;this.notify();}return;}
        if(!request)return;this.requests.delete(data.id);
        if(data.type==='error')request.reject(new Error(data.message));else request.resolve(data);
      };
      this.neuralWorker.onerror=event=>{event.preventDefault();for(const request of this.requests.values())request.reject(new Error('Não foi possível iniciar a voz natural. Confira a conexão e a memória do dispositivo.'));this.requests.clear();this.neuralWorker?.terminate();this.neuralWorker=undefined;};
    }
    const id=++this.neuralId;
    return new Promise((resolve,reject)=>{
      let timer:ReturnType<typeof setTimeout>;
      const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!this.requests.has(id))return;this.neuralWorker?.terminate();this.neuralWorker=undefined;for(const request of this.requests.values())request.reject(new Error('A preparação da voz demorou demais. Tente novamente.'));this.requests.clear();},240000);};
      this.requests.set(id,{touch,resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});touch();
      this.neuralWorker!.postMessage({id,chunks,languages,baseURL:new URL(import.meta.env.BASE_URL,document.baseURI).href});
    });
  }
  async prepare(){
    if(this.state!=='idle'||this.preparing)throw new Error('Conclua a preparação ou pare a narração antes de preparar as vozes.');
    const token=this.token;this.preparing=true;this.status='Preparando as vozes locais…';this.notify();
    try{
      await this.synthesize([],this.language==='pt-BR'?['pt-BR']:this.language==='en-US'?['en-US']:['pt-BR','en-US']);
      if(token!==this.token)throw new Error('Preparação cancelada.');
      this.status='Vozes prontas para uso local.';
    }catch(error){if(token===this.token)this.status=error instanceof Error?error.message:'Não foi possível preparar as vozes.';throw error;}
    finally{if(token===this.token){this.preparing=false;this.notify();}}
  }
  read(items:ReadingItem[],onItem:(id:string)=>void,onFinish:(error?:string)=>void=()=>{},rate=this.rate,options:{paused?:boolean;onReady?:()=>void;retainAudio?:boolean;alignVideoCues?:boolean}={}){
    this.requireVoice();
    const chunks=(options.alignVideoCues?buildVideoNarrationPlan:buildNarrationPlan)(items,this.language,this.englishTerms);
    this.stop();const token=this.token;
    const finish=(error?:string)=>{
      if(token!==this.token)return;clearTimeout(this.watchdog);
      const retain=Boolean(options.retainAudio&&this.audio&&!error);
      if(!retain){this.token++;if(error&&this.utterances.length)speechSynthesis.cancel();this.clearAudio();}
      this.utterances=[];this.state='idle';this.ready=retain;this.status=error||'Narração concluída.';
      this.onFailure=retain?onFinish:undefined;this.playbackError=retain?finish:undefined;this.notify();onFinish(error);
    };
    this.onFailure=onFinish;this.playbackError=finish;
    if(!chunks.length){finish();return;}
    this.state=options.paused?'paused':'reading';this.notify();
    const neural=this.usesNaturalVoice;
    if(neural){
      this.status='Preparando a narração contínua…';this.notify();
      void this.synthesize(chunks).then(result=>{
        if(token!==this.token)return;if(!result.audio){finish('A voz local não gerou o áudio. Tente novamente.');return;}
        this.audioURL=URL.createObjectURL(new Blob([result.audio],{type:'audio/wav'}));const audio=new Audio(this.audioURL);this.audio=audio;this.seconds=result.duration||0;this.audioMarks=result.marks||[];
        audio.playbackRate=Math.min(2,Math.max(.6,rate));audio.preservesPitch=true;
        const marks=this.audioMarks;let last='';const highlight=()=>{const mark=[...marks].reverse().find(m=>m.start<=audio.currentTime);if(mark&&mark.id!==last){last=mark.id;onItem(last);}};
        audio.ontimeupdate=highlight;audio.onplay=highlight;audio.onended=()=>finish();audio.onerror=()=>finish('Não foi possível reproduzir a narração local.');
        this.ready=true;this.status='Narração contínua pronta.';this.notify();options.onReady?.();
        if(this.state==='reading')void audio.play().catch(()=>finish('Toque em Ler ou dê play novamente para permitir a narração.'));
      }).catch(error=>{if(token===this.token)finish(error instanceof Error?error.message:'Não foi possível gerar a narração.');});
      return;
    }
    // Queue the whole reading before playback. End-of-section events never
    // cancel speech or wait for synthesis of the following paragraph.
    this.utterances=chunks.map((chunk,index)=>{
      const utterance=new SpeechSynthesisUtterance(chunk.text);utterance.voice=chunk.lang==='en-US'?this.englishVoice!:this.voice as SpeechSynthesisVoice;utterance.lang=chunk.lang;utterance.rate=Math.min(2,Math.max(.6,rate));
      utterance.onstart=()=>{if(token!==this.token)return;if(chunk.marks[0])onItem(chunk.marks[0].id);if(this.state==='reading')this.armWatchdog(token);};
      utterance.onboundary=event=>{if(token!==this.token)return;const mark=[...chunk.marks].reverse().find(m=>m.offset<=event.charIndex);if(mark)onItem(mark.id);};
      utterance.onend=()=>{if(token!==this.token)return;clearTimeout(this.watchdog);if(index===chunks.length-1)finish();};
      utterance.onerror=event=>{if(token===this.token)finish(`A voz local não conseguiu ler este texto (${event.error}).`);};return utterance;
    });
    this.ready=true;this.status='Narração contínua pronta.';this.notify();options.onReady?.();
    if(this.state==='paused')speechSynthesis.pause();else {speechSynthesis.resume();this.armWatchdog(token);}
    for(const utterance of this.utterances)speechSynthesis.speak(utterance);
  }
}

// A single reading continues across all cues. Only user pauses/seeks or leaving
// the material interrupt it; speech is allowed to finish after the video ends.
export class VideoNarration {
  enabled=false;
  private first=-1;
  private finished=false;
  private wasMuted=false;
  private manuallyMuted=false;
  private spokenCue:number|undefined;
  private publishedCue:number|undefined;
  private frame:number|undefined;
  get currentCue(){
    if(!this.enabled||!this.narrator.ready||this.finished)return undefined;
    const timing=this.narrator.cueTiming(this.getSegments());
    if(timing)return timing.id;
    return this.spokenCue;
  }
  private publishCue(force=false){const cue=this.currentCue;if(force||cue!==this.publishedCue){this.publishedCue=cue;this.onCue(cue);}}
  private monitor(){if(this.frame!==undefined||!this.enabled||!this.narrator.ready||this.video.paused||this.video.ended)return;this.frame=requestAnimationFrame(()=>{this.frame=undefined;this.tick();this.monitor();});}
  private stopMonitor(){if(this.frame!==undefined)cancelAnimationFrame(this.frame);this.frame=undefined;}
  constructor(private video:HTMLVideoElement,private narrator:LocalNarrator,private getSegments:()=>Segment[],private onChange:(message:string)=>void,private muteControl:HTMLInputElement,private context:()=>{sourceLanguage?:string;englishTerms?:string}=()=>({}),private onCue:(cue:number|undefined)=>void=()=>{}){
    video.addEventListener('play',()=>{this.tick();this.monitor();});
    video.addEventListener('pause',()=>{this.stopMonitor();if(this.enabled&&!video.ended)this.narrator.pause();});
    video.addEventListener('ended',()=>{if(!this.enabled)return;if(!this.finished){this.narrator.resume();this.onChange('Concluindo a narração sem cortar o texto…');}else this.onChange('Narração concluída.');});
    video.addEventListener('timeupdate',()=>this.tick());
    video.addEventListener('ratechange',()=>this.adjustRate());
    video.addEventListener('seeking',()=>{if(this.enabled){this.narrator.pause();this.finished=false;}});
    video.addEventListener('seeked',()=>{
      if(!this.enabled)return;
      if(this.positionAudio())return;
      // A pending natural reading already covers the whole video. Its ready
      // callback will seek to the latest position; do not restart synthesis.
      if(this.narrator.ready||this.narrator.state==='idle')this.start();
    });
    muteControl.addEventListener('change',()=>{this.manuallyMuted=true;video.muted=muteControl.checked;});
  }
  enable(){
    this.narrator.requireVoice();
    if(!this.getSegments().some(s=>(this.narrator.language==='en-US'?s.original:s.translated).trim()))throw new Error('Prepare o texto antes de ativar a narração.');
    if(this.enabled)this.disable();this.wasMuted=this.video.muted;this.manuallyMuted=false;this.enabled=true;this.start();
  }
  disable(){
    if(!this.enabled)return;this.enabled=false;this.stopMonitor();this.finished=false;this.first=-1;this.narrator.stop();this.spokenCue=undefined;this.publishCue(true);
    if(!this.manuallyMuted){this.video.muted=this.wasMuted;this.muteControl.checked=this.wasMuted;}
    this.onChange('Narração desativada.');
  }
  private positionAudio(){
    const position=this.narrator.seekVideo(this.getSegments(),this.video.currentTime);if(!position)return false;
    this.finished=position.finished;this.adjustRate();
    this.onChange(position.finished?'Narração concluída.':this.video.paused?'Narração contínua pronta. Dê play para ouvir.':'Narração contínua. O vídeo segue sem pausas automáticas.');this.tick();this.publishCue(true);this.monitor();return true;
  }
  private start(){
    const segments=this.getSegments(),context=this.context();this.first=segments.findIndex(s=>s.end>this.video.currentTime);
    this.finished=false;if(this.first<0){this.finished=true;this.onChange('Narração concluída.');return;}
    const natural=this.narrator.usesNaturalVoice,begin=natural?0:this.first;
    this.narrator.englishTerms=context.englishTerms||'';
    this.onChange('Preparando a narração contínua. Aguarde ficar pronta para dar play.');
    try{
      this.narrator.read(segments.slice(begin).map((s,index)=>({id:String(index+begin),text:s.translated,original:s.original,sourceLanguage:context.sourceLanguage||'en'})),id=>{
        this.spokenCue=Number(id);this.publishCue();
        if(this.enabled)this.onChange(this.video.paused&&!this.video.ended?'Narração contínua pronta. Dê play para ouvir.':'Narração contínua. O vídeo segue sem pausas automáticas.');
      },error=>{
        if(!this.enabled)return;this.finished=true;this.stopMonitor();this.publishCue(true);
        if(error){this.disable();this.onChange(error);}else this.onChange('Narração concluída.');
      },narrationPlaybackRate(this.video.playbackRate),{paused:this.video.paused,retainAudio:true,alignVideoCues:natural,onReady:()=>{
        if(!this.enabled)return;if(!this.manuallyMuted){this.video.muted=true;this.muteControl.checked=true;}
        if(this.video.ended){this.narrator.resume();this.onChange('Concluindo a narração sem cortar o texto…');return;}
        if(this.positionAudio())return;
        this.adjustRate();this.onChange(this.video.paused?'Narração contínua pronta. Dê play para ouvir.':'Narração contínua. O vídeo segue sem pausas automáticas.');this.tick();this.publishCue(true);this.monitor();
      }});
    }catch(error){this.disable();this.onChange(error instanceof Error?error.message:'Não foi possível narrar.');}
  }
  private adjustRate(){
    if(!this.enabled)return;
    this.narrator.setPlaybackRate(narrationPlaybackRate(this.video.playbackRate));
  }
  private tick(){
    if(!this.enabled||this.finished)return;
    this.publishCue();
    if(this.video.paused||this.video.seeking||this.first<0)return;
    this.narrator.resume();
  }
}
