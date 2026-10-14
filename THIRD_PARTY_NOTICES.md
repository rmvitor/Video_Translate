# Componentes de terceiros

O build distribui bibliotecas e runtimes instalados pelo npm. Preserve as licenças aplicáveis ao redistribuir o aplicativo. Os modelos são baixados pelo usuário e não são incluídos no repositório.

| Componente | Versão | Licença / origem |
| --- | --- | --- |
| Transformers.js | 3.8.1 | Apache-2.0 · https://github.com/huggingface/transformers.js |
| ONNX Runtime Web | conforme package-lock.json | MIT · https://github.com/microsoft/onnxruntime |
| @ffmpeg/ffmpeg | 0.12.15 | MIT · https://github.com/ffmpegwasm/ffmpeg.wasm |
| @ffmpeg/core | 0.12.10 | GPL-2.0-or-later · https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core |
| FFmpeg e bibliotecas do core WASM | conforme distribuição do core | Licenças e código-fonte: https://github.com/ffmpegwasm/ffmpeg.wasm e https://ffmpeg.org/legal.html |
| Supabase JavaScript | 2.117.3 | MIT · https://github.com/supabase/supabase-js |
| fflate | 0.8.3 | MIT · https://github.com/101arrowz/fflate |
| Lucide | 0.468.0 | ISC · https://github.com/lucide-icons/lucide |
| PDF.js / pdfjs-dist | 5.4.624 | Apache-2.0 · https://github.com/mozilla/pdf.js |
| @diffusionstudio/piper-wasm | 1.0.0 | Wrapper declarado MIT; fontes/build: https://github.com/diffusion-studio/piper-wasm/tree/69522c832bd52d7c16389e9a8aee568065027689 |
| Piper phonemizer | conforme runtime acima | MIT · https://github.com/rhasspy/piper-phonemize |
| eSpeak NG incorporado no phonemizer WASM | conforme runtime acima | GPL-3.0-or-later · fontes: https://github.com/rhasspy/espeak-ng e https://github.com/wide-video/piper-phonemize |
| Voz neural PT-BR Faber medium | revisão c10ece1aade47bb51c153c893d14e5bf8e5b7117 | Dataset CC0 conforme MODEL_CARD: https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/pt/pt_BR/faber/medium/MODEL_CARD |
| Voz neural inglesa LJSpeech high | revisão c10ece1aade47bb51c153c893d14e5bf8e5b7117 | Dataset em domínio público, modelo treinado do zero conforme MODEL_CARD: https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/en/en_US/ljspeech/high/MODEL_CARD · https://keithito.com/LJ-Speech-Dataset/ |
| whisper-tiny.en (conversão Xenova) | resolvido pelo Hugging Face | Model card: https://huggingface.co/Xenova/whisper-tiny.en |
| whisper-tiny (conversão Xenova) | resolvido pelo Hugging Face | Model card: https://huggingface.co/Xenova/whisper-tiny |
| whisper-base.en / whisper-base (conversão Xenova, padrão reforçado) | resolvido pelo Hugging Face | Model cards: https://huggingface.co/Xenova/whisper-base.en e https://huggingface.co/Xenova/whisper-base · modelos OpenAI Whisper MIT |
| whisper-small.en / whisper-small (conversão Xenova, maior precisão) | resolvido pelo Hugging Face | Model cards: https://huggingface.co/Xenova/whisper-small.en e https://huggingface.co/Xenova/whisper-small · modelos OpenAI Whisper MIT |
| m2m100_418M (conversão Xenova) | resolvido pelo Hugging Face | Model card: https://huggingface.co/Xenova/m2m100_418M · modelo original: https://huggingface.co/facebook/m2m100_418M |
| opus-mt-en-ROMANCE (conversão Xenova) | resolvido pelo Hugging Face | Model card: https://huggingface.co/Xenova/opus-mt-en-ROMANCE |

`prepare:assets` copia os arquivos de licença disponíveis para `dist/licenses/` através de `public/licenses/`. O texto da GPL e as licenças dos runtimes estão nessa pasta. Consulte os avisos distribuídos e os respectivos repositórios para termos completos e código-fonte correspondente.
