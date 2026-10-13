import { env, pipeline } from '@huggingface/transformers';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { Segment, WorkerEvent } from './types';
import { LANGUAGES } from './preferences.mjs';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm!.numThreads = 1;
// Files are served with the PWA: no CDN code is executed.
env.backends.onnx.wasm!.wasmPaths = new URL(`${import.meta.env.BASE_URL}runtime/`, self.location.origin + '/').href;

type SpeechOutput = { text: string; chunks?: { text: string; timestamp: [number | null, number | null] }[] };
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<SpeechOutput | SpeechOutput[]>;
type Translator = ((text: string, options: Record<string, unknown>) => Promise<{ translation_text: string }[]>) & {
  tokenizer: { model: { vocab: string[] } };
};
// Narrow the library's very large conditional type to the two single-input pipelines we use.
const createPipeline = pipeline as unknown as (task: string, model: string, options: Record<string, unknown>) => Promise<unknown>;
let transcriber: Transcriber | undefined;
let translator: Translator | undefined;

const send = (message: WorkerEvent) => self.postMessage(message);
function status(stage: 'audio' | 'models' | 'transcribe' | 'translate', message: string, progress?: number) {
  send({ type: 'status', stage, message, progress });
}

function downloading(label: string) {
  return (event: { status: string; file?: string; progress?: number }) => {
    if (event.status === 'progress') {
      status('models', `${label} · ${event.file?.split('/').pop() ?? 'modelo'}`, event.progress);
    } else if (event.status === 'initiate') {
      status('models', `Baixando ${label.toLowerCase()} para este dispositivo…`);
    }
  };
}

async function audioFromVideo(file: File, baseURL: string): Promise<Float32Array> {
  status('audio', 'Extraindo o áudio no seu dispositivo…');
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({ coreURL: `${baseURL}runtime/ffmpeg-core.js`, wasmURL: `${baseURL}runtime/ffmpeg-core.wasm` });
    await ffmpeg.writeFile('input', new Uint8Array(await file.arrayBuffer()));
    const code = await ffmpeg.exec(['-i', 'input', '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'audio.raw']);
    if (code !== 0) throw new Error('Não foi possível extrair o áudio. Verifique se o vídeo tem uma faixa de áudio válida.');
    const bytes = await ffmpeg.readFile('audio.raw');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4) throw new Error('O vídeo não contém áudio.');
    return new Float32Array(bytes.slice().buffer);
  } finally {
    ffmpeg.terminate();
  }
}

async function translateUnits(units: { id: string; text: string }[], onResult?: (id: string, translated: string) => void, sourceLanguage = 'en') {
  if (sourceLanguage === 'pt') { for (const unit of units) onResult?.(unit.id, unit.text); return units.map(unit => unit.text); }
  status('models', 'Preparando o modelo de tradução para português…');
  translator ??= await createPipeline('translation', sourceLanguage === 'en' ? 'Xenova/opus-mt-en-ROMANCE' : 'Xenova/m2m100_418M', {
    device: 'wasm', dtype: 'q8', progress_callback: downloading('Tradução'),
  }) as Translator;
  const target = sourceLanguage === 'en' ? ['>>pt_br<<', '>>pt<<', '>>por<<'].find(token => translator!.tokenizer.model.vocab.includes(token)) : 'pt';
  if (!target) throw new Error('O modelo de tradução não contém um idioma português suportado.');
  const output: string[] = [];
  for (const [index, unit] of units.entries()) {
    status('translate', `Traduzindo trecho ${index + 1} de ${units.length}…`, index / units.length * 100);
    const words = unit.text.split(/\s+/);
    const pieces: string[] = [];
    for (let start = 0; start < words.length; start += 80) {
      const result = await translator(`${sourceLanguage === 'en' ? target + ' ' : ''}${words.slice(start, start + 80).join(' ')}`, { max_new_tokens: 256, ...(sourceLanguage !== 'en' ? { src_lang: sourceLanguage, tgt_lang: 'pt' } : {}) });
      pieces.push(result[0].translation_text.trim());
    }
    const translated = pieces.join(' ');
    output.push(translated);
    onResult?.(unit.id, translated);
  }
  return output;
}

self.onmessage = async (event: MessageEvent<{ file?: File; segments?: Segment[]; blocks?: { id: string; text: string }[]; baseURL: string; sourceLanguage?: string; transcribeOnly?: boolean }>) => {
  try {
    const source = event.data.sourceLanguage || 'en';
    const language = LANGUAGES.find(([code]) => code === source)?.[2];
    if (!language) throw new Error('Escolha um idioma original suportado.');
    // Pass the actual app directory: worker bundles live one directory below it on Pages.
    env.backends.onnx.wasm!.wasmPaths = `${event.data.baseURL}runtime/`;
    if (event.data.blocks) {
      await translateUnits(event.data.blocks, (id, translated) => send({ type: 'text-translated', id, translated }), source);
      send({ type: 'text-complete' });
      return;
    }
    let segments = event.data.segments;
    if (!segments) {
      const audio = await audioFromVideo(event.data.file!, event.data.baseURL);
      if (audio.length / 16000 > 1800) throw new Error('Esta versão processa até 30 minutos por vídeo. Divida o treinamento em partes menores.');
      status('models', 'Preparando o modelo de transcrição…');
      transcriber ??= await createPipeline('automatic-speech-recognition', source === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny', {
        device: 'wasm', dtype: 'q8', progress_callback: downloading('Transcrição'),
      }) as Transcriber;
      status('transcribe', 'Ouvindo e transcrevendo localmente… Isso pode levar alguns minutos.');
      const result = await transcriber(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, ...(source !== 'en' ? { language, task: 'transcribe' } : {}) });
      const output = Array.isArray(result) ? result[0] : result;
      const duration = audio.length / 16000;
      segments = (output.chunks ?? []).map((chunk, index, chunks) => ({
        start: Math.max(0, chunk.timestamp[0] ?? (index ? chunks[index - 1].timestamp[1] ?? 0 : 0)),
        end: Math.min(duration, chunk.timestamp[1] ?? chunks[index + 1]?.timestamp[0] ?? duration),
        original: chunk.text.trim(),
        translated: '',
      })).filter(s => s.original && s.end > s.start);
      if (!segments.length) throw new Error('Não foi possível identificar fala no áudio. Você pode importar uma legenda SRT ou VTT.');
      send({ type: 'transcribed', segments });
    }
    if (event.data.transcribeOnly) { send({ type: 'complete', segments }); return; }
    const texts = await translateUnits(segments.map((s, i) => ({ id: String(i), text: s.original })), undefined, source);
    const translated = segments.map((s, i) => ({ ...s, translated: texts[i] }));
    send({ type: 'complete', segments: translated });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    send({ type: 'error', message: detail });
  }
};
