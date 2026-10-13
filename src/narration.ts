import type { Segment } from './types';

export type ReadingItem = { id: string; text: string };
const NEURAL_VOICE={voiceURI:'entrelinhas:piper:faber',name:'Faber · voz neural natural',lang:'pt-BR',localService:true,default:true};
export class LocalNarrator {
  state: 'idle' | 'reading' | 'paused' = 'idle';
  private chosenVoice='';
  get voiceURI(){return this.chosenVoice;}
  set voiceURI(value:string){this.chosenVoice=value;try{localStorage.setItem('entrelinhas.voice',value);}catch{/* The voice choice still works in this session. */}}
  rate = 1;
  private token = 0;
  private listeners = new Set<() => void>();
  private watchdog?: ReturnType<typeof setTimeout>;
  private neuralWorker?:Worker;
  private neuralId=0;
  private requests=new Map<number,{resolve:(audio?:ArrayBuffer)=>void;reject:(error:Error)=>void}>();
  private audio?:HTMLAudioElement;
  private audioURL='';
  private playbackError?: (message:string)=>void;
  status='Voz neural PT-BR local. O primeiro uso baixa o modelo (cerca de 64 MB).';
  readonly available = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  constructor() {
    try{this.chosenVoice=localStorage.getItem('entrelinhas.voice')||'';}catch{/* Use the natural local voice by default. */}
    if (this.available) window.speechSynthesis.addEventListener('voiceschanged', () => this.notify());
  }
  get voices() {
    return [NEURAL_VOICE,...(this.available ? speechSynthesis.getVoices().filter(v => v.localService && v.lang.replace('_', '-').toLowerCase() === 'pt-br') : [])];
  }
  get voice() { return this.voices.find(v => v.voiceURI === this.voiceURI) ?? this.voices[0]; }
  subscribe(listener: () => void) { this.listeners.add(listener); listener(); return () => this.listeners.delete(listener); }
  private notify() { for (const listener of this.listeners) listener(); }
  requireVoice() {
    if(this.voice?.voiceURI===NEURAL_VOICE.voiceURI)return;
    if (!this.available) throw new Error('Este navegador não oferece narração. Use um navegador compatível com leitura em voz alta.');
    if (!this.voice) throw new Error('Nenhuma voz local PT-BR disponível. Instale uma voz de Português (Brasil) nas configurações de fala do sistema e reabra o navegador. Vozes remotas não são usadas para proteger seu conteúdo.');
  }
  stop() {
    this.token++;
    clearTimeout(this.watchdog);
    if (this.available) speechSynthesis.cancel();
    this.clearAudio();
    this.playbackError=undefined;
    if(this.requests.size){this.neuralWorker?.terminate();this.neuralWorker=undefined;for(const request of this.requests.values())request.reject(new Error('Narração cancelada.'));this.requests.clear();}
    this.state = 'idle'; this.notify();
  }
  pause() {
    if (this.state === 'reading') { if(this.voice?.voiceURI===NEURAL_VOICE.voiceURI)this.audio?.pause();else speechSynthesis.pause();this.state = 'paused'; this.notify(); }
  }
  resume() {
    if (this.state === 'paused') { this.state = 'reading';if(this.voice?.voiceURI===NEURAL_VOICE.voiceURI)void this.audio?.play().catch(()=>this.playbackError?.('Dê play novamente para permitir a narração neste navegador.'));else speechSynthesis.resume();this.notify(); }
  }
  private clearAudio(){if(this.audio){this.audio.onended=null;this.audio.onerror=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.audio=undefined;}if(this.audioURL){URL.revokeObjectURL(this.audioURL);this.audioURL='';}}
  private synthesize(text:string):Promise<ArrayBuffer|undefined> {
    if(!this.neuralWorker){
      this.neuralWorker=new Worker(new URL('./neural-voice.worker.ts',import.meta.url),{type:'module'});
      this.neuralWorker.onmessage=event=>{
        const data=event.data;if(data.type==='progress'){this.status=data.message;this.notify();return;}
        const request=this.requests.get(data.id);if(!request)return;this.requests.delete(data.id);
        if(data.type==='error')request.reject(new Error(data.message));else request.resolve(data.audio);
      };
      this.neuralWorker.onerror=event=>{event.preventDefault();for(const request of this.requests.values())request.reject(new Error('Não foi possível iniciar a voz neural. Confira a conexão, o espaço e a memória do dispositivo.'));this.requests.clear();this.neuralWorker?.terminate();this.neuralWorker=undefined;};
    }
    const id=++this.neuralId;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(this.requests.has(id)){this.neuralWorker?.terminate();this.neuralWorker=undefined;const error=new Error('A preparação da voz demorou demais. Confira a conexão e tente novamente.');for(const request of this.requests.values())request.reject(error);this.requests.clear();}},240000);this.requests.set(id,{resolve:audio=>{clearTimeout(timer);resolve(audio);},reject:error=>{clearTimeout(timer);reject(error);}});this.neuralWorker!.postMessage({id,text,baseURL:new URL(import.meta.env.BASE_URL,location.href).href});});
  }
  async prepare(){if(this.state!=='idle')throw new Error('Pare a narração antes de preparar a voz.');try{await this.synthesize('');}catch(error){this.status=error instanceof Error?error.message:'Não foi possível preparar a voz.';this.notify();throw error;}}
  read(items: ReadingItem[], onItem: (id: string) => void, onFinish: (error?: string) => void = () => {}, rate = this.rate) {
    this.requireVoice();
    this.stop();
    const token = this.token;
    const chunks = items.flatMap(item => {
      const words = item.text.trim().split(/\s+/);
      const parts: ReadingItem[] = [];
      let text = '';
      for (const word of words) {
        if ((text + word).length > 350 && text) { parts.push({ id: item.id, text }); text = ''; }
        text += (text ? ' ' : '') + word;
      }
      if (text) parts.push({ id: item.id, text });
      return parts;
    });
    let index = 0;
    const finish = (error?: string) => {
      if (token !== this.token) return;
      clearTimeout(this.watchdog);
      this.clearAudio();
      this.playbackError=undefined;
      this.state = 'idle'; this.notify(); onFinish(error);
    };
    this.playbackError=finish;
    const next = () => {
      if (token !== this.token) return;
      if (index >= chunks.length) { finish(); return; }
      const chunk = chunks[index++];
      if(this.voice?.voiceURI===NEURAL_VOICE.voiceURI){
        this.state='reading';this.status='Gerando a narração local…';this.notify();
        void this.synthesize(chunk.text).then(buffer=>{
          if(token!==this.token||!buffer)return;
          this.clearAudio();this.audioURL=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
          const audio=new Audio(this.audioURL);this.audio=audio;audio.playbackRate=Math.min(2,Math.max(.6,rate));
          audio.onended=()=>{this.clearAudio();next();};audio.onerror=()=>finish('Não foi possível reproduzir a voz natural.');
          onItem(chunk.id);if(this.state!=='paused')void audio.play().catch(()=>finish('Toque em Ler ou dê play novamente para permitir a narração neste navegador.'));
        }).catch(error=>{if(token===this.token)finish(error instanceof Error?error.message:'Não foi possível gerar a voz natural.');});
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.voice = this.voice!; utterance.lang = 'pt-BR'; utterance.rate = Math.min(2, Math.max(.6, rate));
      utterance.onstart = () => { if (token === this.token) onItem(chunk.id); };
      utterance.onend = () => { clearTimeout(this.watchdog); next(); };
      utterance.onerror = event => finish(`A voz local não conseguiu ler este trecho (${event.error}).`);
      // A broken voice must not leave video playback permanently waiting.
      this.watchdog = setTimeout(() => { if (token === this.token && this.state !== 'paused') { this.stop(); onFinish('A voz não respondeu. Tente outra voz local.'); } }, 120000);
      this.state = 'reading'; this.notify(); speechSynthesis.speak(utterance);
    };
    next();
  }
}

// Read each translated cue while the video advances. Hold the video at the cue's
// end if speech is longer, so words aren't cut off by the next cue.
export class VideoNarration {
  enabled = false;
  private index = -1;
  private speaking = false;
  private held = false;
  private wasMuted = false;
  private manuallyMuted = false;
  constructor(
    private video: HTMLVideoElement,
    private narrator: LocalNarrator,
    private getSegments: () => Segment[],
    private onChange: (message: string) => void,
    private muteControl: HTMLInputElement,
  ) {
    video.addEventListener('play', () => { if (this.enabled) { this.held = false; this.narrator.resume(); this.tick(); } });
    video.addEventListener('pause', () => { if (this.enabled && !this.held && !video.ended) this.narrator.pause(); });
    video.addEventListener('ended', () => {
      if (!this.enabled) return;
      if (this.speaking) { this.narrator.resume(); this.onChange('Concluindo a leitura do último trecho…'); }
      else this.onChange('Leitura concluída.');
    });
    video.addEventListener('timeupdate', () => this.tick());
    video.addEventListener('seeking', () => {
      if (!this.enabled) return;
      const resume = this.held;
      this.narrator.stop(); this.speaking = false; this.index = -1; this.held = false;
      if (resume) void video.play().catch(() => this.onChange('Dê play para continuar a narração.'));
    });
    video.addEventListener('seeked', () => this.tick());
    muteControl.addEventListener('change', () => { this.manuallyMuted = true; video.muted = muteControl.checked; });
  }
  enable() {
    this.narrator.requireVoice();
    if (!this.getSegments().some(s => s.translated.trim())) throw new Error('Gere ou revise a tradução antes de ativar a narração em PT-BR.');
    this.wasMuted = this.video.muted;
    this.manuallyMuted = false;
    this.enabled = true; this.index = -1;
    this.video.muted = true; this.muteControl.checked = true;
    this.onChange('Narração PT-BR ativada. Dê play para ouvir.');
    this.tick();
  }
  disable() {
    if (!this.enabled) return;
    const resume = this.held;
    this.enabled = false; this.held = false; this.speaking = false; this.index = -1;
    this.narrator.stop();
    if (!this.manuallyMuted) { this.video.muted = this.wasMuted; this.muteControl.checked = this.wasMuted; }
    if (resume) void this.video.play().catch(() => {});
    this.onChange('Narração desativada.');
  }
  private tick() {
    if (!this.enabled || this.video.paused || this.video.seeking) return;
    const segments = this.getSegments();
    if (this.speaking && this.index >= 0 && this.video.currentTime >= segments[this.index].end - .05) {
      this.held = true; this.video.pause(); this.onChange('Aguardando a leitura do trecho…'); return;
    }
    const index = segments.findIndex(s => this.video.currentTime >= s.start && this.video.currentTime < s.end);
    if (index < 0 || index === this.index) return;
    this.index = index;
    this.speaking = false;
    const text = segments[index].translated.trim();
    if (!text) { this.onChange('Este trecho ainda não tem tradução.'); return; }
    this.speaking = true;
    try {
      this.narrator.read([{ id: String(index), text }], () => this.onChange(`Lendo trecho ${index + 1} em PT-BR…`), error => {
        this.speaking = false;
        if (error) { this.disable(); this.onChange(error); return; }
        if (this.video.ended) this.onChange('Leitura concluída.');
        if (this.held) { this.held = false; void this.video.play().catch(() => this.onChange('Dê play para continuar.')); }
      }, this.narrator.rate * this.video.playbackRate);
    } catch (error) { this.onChange(error instanceof Error ? error.message : 'Não foi possível narrar.'); this.disable(); }
  }
}
