import * as pdfjs from 'pdfjs-dist';
import pdfWorkerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { paragraphBlocks } from './pdf-layout.mjs';
import type { PdfPage, PdfImage, PdfDocument } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerURL;
const blobFromCanvas = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preservar a imagem da página.')), 'image/webp', .92));

type ImagePixels = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8Array | Uint8ClampedArray };
async function imageBlob(image: ImagePixels): Promise<{ blob: Blob; blank: boolean } | undefined> {
  if (!image.width || !image.height || image.width * image.height > 16000000) return;
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  if (image.bitmap) ctx.drawImage(image.bitmap, 0, 0);
  else if (image.data) {
    const pixels = ctx.createImageData(image.width, image.height);
    const raw = image.data;
    for (let i = 0; i < image.width * image.height; i++) {
      if (raw.length === image.width * image.height * 4) pixels.data.set(raw.subarray(i * 4, i * 4 + 4), i * 4);
      else {
        const rgb = raw.length === image.width * image.height * 3;
        const value = (raw[Math.floor(i / 8)] & (1 << (7 - i % 8))) ? 255 : 0;
        pixels.data[i * 4] = rgb ? raw[i * 3] : value;
        pixels.data[i * 4 + 1] = rgb ? raw[i * 3 + 1] : value;
        pixels.data[i * 4 + 2] = rgb ? raw[i * 3 + 2] : value;
        pixels.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  } else return;
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let blank = true;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 0 && (rgba[i] < 250 || rgba[i + 1] < 250 || rgba[i + 2] < 250)) { blank = false; break; }
  }
  const blob = await blobFromCanvas(canvas);
  canvas.width = canvas.height = 0;
  return { blob, blank };
}

export async function extractPdf(file: File, onPage: (page: number, total: number) => void, signal: AbortSignal): Promise<PdfDocument> {
  if (file.size > 50 * 1024 * 1024) throw new Error('Escolha um PDF de até 50 MB.');
  const base = new URL(import.meta.env.BASE_URL, location.href).href;
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false,
    cMapUrl: `${base}runtime/pdf/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${base}runtime/pdf/standard_fonts/`, wasmUrl: `${base}runtime/pdf/wasm/`,
    useSystemFonts: false,
  });
  const abort = () => { void loading.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) { abort(); throw new Error('Importação cancelada.'); }
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 100) throw new Error('Use um PDF de até 100 páginas. Divida documentos maiores em partes.');
    const pages: PdfPage[] = [];
    let totalText = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      if (signal.aborted) throw new Error('Importação cancelada.');
      onPage(number, pdf.numPages);
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      const blocks = paragraphBlocks(text.items).map((b, index) => ({ ...b, y: b.y + viewport.height, id: `${number}-${index}`, translated: '' }));
      totalText += blocks.reduce((sum, b) => sum + b.original.length, 0);
      if (totalText > 500000) throw new Error('O PDF contém texto demais para processar de uma vez. Divida o documento.');
      const canvas = document.createElement('canvas');
      const previewViewport = page.getViewport({ scale: Math.min(1.6, 1400 / viewport.width) });
      canvas.width = Math.ceil(previewViewport.width); canvas.height = Math.ceil(previewViewport.height);
      await page.render({ canvas, viewport: previewViewport, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
      const preview = await blobFromCanvas(canvas);
      canvas.width = canvas.height = 0;
      const operators = await page.getOperatorList();
      const images: PdfImage[] = [];
      let matrix = [1, 0, 0, 1, 0, 0];
      const stack: number[][] = [];
      const seen = new Set<string>();
      for (let i = 0; i < operators.fnArray.length; i++) {
        const op = operators.fnArray[i], args = operators.argsArray[i];
        if (op === pdfjs.OPS.save) stack.push(matrix.slice());
        else if (op === pdfjs.OPS.restore) matrix = stack.pop() ?? matrix;
        else if (op === pdfjs.OPS.transform) matrix = pdfjs.Util.transform(matrix, args);
        else if (op === pdfjs.OPS.paintImageXObject || op === pdfjs.OPS.paintInlineImageXObject || op === pdfjs.OPS.paintImageXObjectRepeat) {
          const key = typeof args[0] === 'string' ? args[0] : `inline-${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          try {
            const image = typeof args[0] === 'string' ? (key.startsWith('g_') ? page.commonObjs : page.objs).get(key) as ImagePixels : args[0] as ImagePixels;
            const preserved = await imageBlob(image);
            if (preserved) {
              const pointA = viewport.convertToViewportPoint(matrix[4], matrix[5]);
              const pointB = viewport.convertToViewportPoint(matrix[4] + matrix[2], matrix[5] + matrix[3]);
              const pointC = viewport.convertToViewportPoint(matrix[4] + matrix[0], matrix[5] + matrix[1]);
              const displayWidth = Math.max(16, Math.hypot(pointC[0] - pointA[0], pointC[1] - pointA[1]) * 1.35);
              images.push({ id: `${number}-image-${images.length}`, ...preserved, width: image.width, height: image.height, displayWidth, y: Math.min(pointA[1], pointB[1]) });
            }
          } catch { /* Original page preview preserves graphics if an embedded format cannot be separated. */ }
        }
      }
      pages.push({ number, blocks, images, preview });
      page.cleanup();
    }
    return { id: crypto.randomUUID(), title: file.name.replace(/\.pdf$/i, ''), filename: file.name, createdAt: Date.now(), pages };
  } finally {
    signal.removeEventListener('abort', abort);
    await loading.destroy();
  }
}
