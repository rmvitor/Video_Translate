import type { Segment } from './types';

export type ReadingItem = { id: string; text: string };
export class LocalNarrator {
  state: 'idle' | 'reading' | 'paused' = 'idle';
  voiceURI = '';
  rate = 1;
  private token = 0;
  private listeners = new Set<() => void>();
  private watchdog?: ReturnType<typeof setTimeout>;
  readonly available = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  constructor() {
    if (this.available) window.speechSynthesis.addEventListener('voiceschanged', () => this.notify());
  }
  get voices() {
    return this.available ? speechSynthesis.getVoices().filter(v => v.localService && v.lang.replace('_', '-').toLowerCase() === 'pt-br') : [];
  }
  get voice() { return this.voices.find(v => v.voiceURI === this.voiceURI) ?? this.voices[0]; }
  subscribe(listener: () => void) { this.listeners.add(listener); listener(); return () => this.listeners.delete(listener); }
  private notify() { for (const listener of this.listeners) listener(); }
  requireVoice() {
    if (!this.available) throw new Error('Este navegador não oferece narração. Use um navegador compatível com leitura em voz alta.');
    if (!this.voice) throw new Error('Nenhuma voz local PT-BR disponível. Instale uma voz de Português (Brasil) nas configurações de fala do sistema e reabra o navegador. Vozes remotas não são usadas para proteger seu conteúdo.');
  }
  stop() {
    this.token++;
    clearTimeout(this.watchdog);
    if (this.available) speechSynthesis.cancel();
    this.state = 'idle'; this.notify();
  }
  pause() {
    if (this.state === 'reading') { speechSynthesis.pause(); this.state = 'paused'; this.notify(); }
  }
  resume() {
    if (this.state === 'paused') { speechSynthesis.resume(); this.state = 'reading'; this.notify(); }
  }
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
      this.state = 'idle'; this.notify(); onFinish(error);
    };
    const next = () => {
      if (token !== this.token) return;
      if (index >= chunks.length) { finish(); return; }
      const chunk = chunks[index++];
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
