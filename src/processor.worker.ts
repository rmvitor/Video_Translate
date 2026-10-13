import { env, pipeline } from '@huggingface/transformers';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { Segment, WorkerEvent } from './types';

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

self.onmessage = async (event: MessageEvent<{ file?: File; segments?: Segment[]; baseURL: string }>) => {
  try {
    // Pass the actual app directory: worker bundles live one directory below it on Pages.
    env.backends.onnx.wasm!.wasmPaths = `${event.data.baseURL}runtime/`;
    let segments = event.data.segments;
    if (!segments) {
      const audio = await audioFromVideo(event.data.file!, event.data.baseURL);
      if (audio.length / 16000 > 1800) throw new Error('Esta versão processa até 30 minutos por vídeo. Divida o treinamento em partes menores.');
      status('models', 'Preparando o modelo de transcrição…');
      transcriber ??= await createPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        device: 'wasm', dtype: 'q8', progress_callback: downloading('Transcrição'),
      }) as Transcriber;
      status('transcribe', 'Ouvindo e transcrevendo em inglês… Isso pode levar alguns minutos.');
      const result = await transcriber(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
      const output = Array.isArray(result) ? result[0] : result;
      const duration = audio.length / 16000;
      segments = (output.chunks ?? []).map((chunk, index, chunks) => ({
        start: Math.max(0, chunk.timestamp[0] ?? (index ? chunks[index - 1].timestamp[1] ?? 0 : 0)),
        end: Math.min(duration, chunk.timestamp[1] ?? chunks[index + 1]?.timestamp[0] ?? duration),
        original: chunk.text.trim(),
        translated: '',
      })).filter(s => s.original && s.end > s.start);
      if (!segments.length) throw new Error('Não foi possível identificar fala em inglês no áudio. Você pode importar uma legenda SRT ou VTT.');
      send({ type: 'transcribed', segments });
    }
    status('models', 'Preparando o modelo de tradução para português…');
    translator ??= await createPipeline('translation', 'Xenova/opus-mt-en-ROMANCE', {
      device: 'wasm', dtype: 'q8', progress_callback: downloading('Tradução'),
    }) as Translator;
    // Select a real token from the downloaded vocabulary rather than assuming a language code.
    const target = ['>>pt_br<<', '>>pt<<', '>>por<<'].find(token => translator!.tokenizer.model.vocab.includes(token));
    if (!target) throw new Error('O modelo de tradução não contém um idioma português suportado.');
    const translated: Segment[] = [];
    for (const [index, segment] of segments.entries()) {
      status('translate', `Traduzindo trecho ${index + 1} de ${segments.length}…`, index / segments.length * 100);
      // Bound token input; long imported captions are translated in smaller pieces.
      const words = segment.original.split(/\s+/);
      const pieces: string[] = [];
      for (let start = 0; start < words.length; start += 80) {
        const result = await translator(`${target} ${words.slice(start, start + 80).join(' ')}`, { max_new_tokens: 256 });
        const item = Array.isArray(result) ? result[0] : result;
        pieces.push(item.translation_text.trim());
      }
      translated.push({ ...segment, translated: pieces.join(' ') });
    }
    send({ type: 'complete', segments: translated });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    send({ type: 'error', message: detail });
  }
};
