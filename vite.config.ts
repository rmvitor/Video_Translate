import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  optimizeDeps: {
    // FFmpeg creates a nested worker relative to its module; prebundling breaks that URL.
    exclude: ['@ffmpeg/ffmpeg'],
    // Prepare the lazy AI dependency up front so Vite doesn't reload during processing.
    include: ['@huggingface/transformers'],
  },
  build: { target: 'es2022' },
});
