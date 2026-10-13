# Componentes de terceiros

O build distribui bibliotecas e runtimes instalados pelo npm. Preserve as licenças aplicáveis ao redistribuir o aplicativo. Os modelos são baixados pelo usuário e não são incluídos no repositório.

| Componente | Versão | Licença / origem |
| --- | --- | --- |
| Transformers.js | 3.8.1 | Apache-2.0 · https://github.com/huggingface/transformers.js |
| ONNX Runtime Web | conforme package-lock.json | MIT · https://github.com/microsoft/onnxruntime |
| @ffmpeg/ffmpeg | 0.12.15 | MIT · https://github.com/ffmpegwasm/ffmpeg.wasm |
| @ffmpeg/core | 0.12.10 | GPL-2.0-or-later · https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core |
| FFmpeg e bibliotecas do core WASM | conforme distribuição do core | Licenças e código-fonte: https://github.com/ffmpegwasm/ffmpeg.wasm e https://ffmpeg.org/legal.html |
| Lucide | 0.468.0 | ISC · https://github.com/lucide-icons/lucide |
| whisper-tiny.en (conversão Xenova) | resolvido pelo Hugging Face | Model card: https://huggingface.co/Xenova/whisper-tiny.en |
| opus-mt-en-ROMANCE (conversão Xenova) | resolvido pelo Hugging Face | Model card: https://huggingface.co/Xenova/opus-mt-en-ROMANCE |

`prepare:assets` copia os arquivos de licença disponíveis para `dist/licenses/` através de `public/licenses/`. O texto da GPL e as licenças dos runtimes estão nessa pasta. Consulte os avisos distribuídos e os respectivos repositórios para termos completos e código-fonte correspondente.
