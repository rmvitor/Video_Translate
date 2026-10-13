import { LANGUAGES } from './preferences.mjs';
export function formatClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  return [hours || null, String(minutes).padStart(2, '0'), String(value % 60).padStart(2, '0')].filter(v => v !== null).join(':');
}

export function timestamp(seconds, separator = ',') {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}

export function exportSubtitles(segments, language = 'translated', format = 'srt') {
  const separator = format === 'vtt' ? '.' : ',';
  const body = segments.map((s, i) => `${i + 1}\n${timestamp(s.start, separator)} --> ${timestamp(s.end, separator)}\n${s[language] || s.original}\n`).join('\n');
  return format === 'vtt' ? `WEBVTT\n\n${body}` : body;
}

export function parseSubtitles(text) {
  const blocks = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/);
  const result = [];
  const toSeconds = value => {
    const parts = value.replace(',', '.').split(':').map(Number);
    if (parts.some(n => !Number.isFinite(n))) throw new Error('Tempo de legenda inválido.');
    return parts.reduce((total, part) => total * 60 + part, 0);
  };
  for (const block of blocks) {
    const lines = block.split('\n');
    const index = lines.findIndex(line => line.includes('-->'));
    if (index === -1) continue;
    const match = lines[index].match(/^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) throw new Error('Formato de legenda inválido.');
    const start = toSeconds(match[1]);
    const end = toSeconds(match[2]);
    const original = lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').trim();
    if (end <= start || !original) throw new Error('A legenda contém um trecho inválido.');
    result.push({ start, end, original, translated: '' });
  }
  if (!result.length) throw new Error('Nenhuma legenda encontrada. Use um arquivo SRT ou VTT.');
  return result.sort((a, b) => a.start - b.start);
}

export function activeSegment(segments, time) {
  return segments.findIndex(s => time >= s.start && time < s.end);
}

export function validateProject(data) {
  if (!data || data.version !== 1 || typeof data.title !== 'string' || !Array.isArray(data.segments) || data.segments.length > 20000) {
    throw new Error('Arquivo de projeto inválido.');
  }
  const segments = data.segments.map(s => {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || typeof s.original !== 'string' || typeof s.translated !== 'string' || s.original.length > 10000 || s.translated.length > 10000) {
      throw new Error('O projeto contém um trecho inválido.');
    }
    return { start: s.start, end: s.end, original: s.original, translated: s.translated };
  }).sort((a, b) => a.start - b.start);
  return {
    title: data.title.slice(0, 250),
    filename: typeof data.filename === 'string' ? data.filename.slice(0, 250) : '',
    size: Number.isFinite(data.size) && data.size >= 0 ? data.size : 0,
    lastModified: Number.isFinite(data.lastModified) ? data.lastModified : 0,
    duration: Number.isFinite(data.duration) && data.duration >= 0 ? data.duration : 0,
    segments,
    sourceLanguage: LANGUAGES.some(([code]) => code === data.sourceLanguage) ? data.sourceLanguage : 'en',
    analysis: typeof data.analysis === 'string' ? data.analysis.slice(0, 40000) : undefined,
    completedAt: Number.isFinite(data.completedAt) && data.completedAt > 0 ? data.completedAt : undefined,
    collectionId: typeof data.collectionId === 'string' ? data.collectionId.slice(0, 100) : undefined,
    subjectId: typeof data.subjectId === 'string' ? data.subjectId.slice(0, 100) : undefined,
    sortOrder: Number.isFinite(data.sortOrder) && data.sortOrder >= 0 ? data.sortOrder : undefined,
  };
}
