// Translate sentences independently: Marian can silently omit an instruction
// when several sentences share one subtitle/PDF block. Keep the original unit
// and its timing intact; only reassemble its translated sentences here.
export const TRANSLATION_INPUT_TOKENS = 160;
export const TRANSLATION_OUTPUT_TOKENS = 384;
export const translationModel = (source = 'en') => source === 'en' ? 'Xenova/opus-mt-en-ROMANCE' : 'Xenova/m2m100_418M';

const normalized = text => String(text || '').replace(/\s+/gu, ' ').trim();
const abbreviation = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|[A-Z](?:\.[A-Z])*)\.$/u;

function fallbackSentences(text) {
  const sentences = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?。！？]+["'”’»)\]]*(?:\s+|$)/gu)) {
    const end = match.index + match[0].length;
    const before = text.slice(start, match.index + 1);
    // Decimal points have no following whitespace. Do not split common titles,
    // abbreviations or initials either when Intl.Segmenter is unavailable.
    if (match[0].startsWith('.') && abbreviation.test(before)) continue;
    sentences.push(text.slice(start, end).trim());
    start = end;
  }
  if (start < text.length) sentences.push(text.slice(start).trim());
  return sentences.filter(Boolean);
}

export function translationSentences(text, source = 'en', Segmenter = Intl.Segmenter) {
  const clean = normalized(text);
  if (!clean) return [];
  if (!Segmenter) return fallbackSentences(clean);
  const sentences = [];
  for (const { segment } of new Segmenter(source, { granularity: 'sentence' }).segment(clean)) {
    const part = segment.trim();
    if (!part) continue;
    if (sentences.length && abbreviation.test(sentences.at(-1))) sentences[sentences.length - 1] += ' ' + part;
    else sentences.push(part);
  }
  return sentences;
}

function boundedParts(text, countTokens, maxTokens) {
  if (countTokens(text) <= maxTokens) return [text];
  const points = Array.from(text);
  if (points.length < 2) throw new Error('O modelo não consegue processar um caractere deste texto sem truncá-lo.');
  let middle = Math.floor(points.length / 2);
  // Prefer a word boundary. Split by Unicode code points only for an unusually
  // long identifier or a language without spaces, never through a surrogate.
  const prefix = points.slice(0, middle).join('');
  const space = prefix.lastIndexOf(' ');
  if (space > 0) middle = Array.from(prefix.slice(0, space)).length;
  return [points.slice(0, middle).join('').trim(), points.slice(middle).join('').trim()]
    .flatMap(part => boundedParts(part, countTokens, maxTokens));
}

export function translationParts(text, { source = 'en', countTokens, maxTokens = TRANSLATION_INPUT_TOKENS, Segmenter = Intl.Segmenter }) {
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('Limite de tokens de tradução inválido.');
  return translationSentences(text, source, Segmenter).flatMap(sentence => boundedParts(sentence, countTokens, maxTokens));
}

export async function translateText(text, { source = 'en', countTokens, translate, maxTokens = TRANSLATION_INPUT_TOKENS, maxOutputTokens = TRANSLATION_OUTPUT_TOKENS }) {
  if (source === 'pt') return text;
  const output = [];
  async function render(part, depth = 0) {
    if (!/[\p{L}\p{N}]/u.test(part)) return part;
    const result = normalized(await translate(part));
    if (!result) throw new Error('A tradução local retornou uma frase vazia. O texto original foi preservado; tente novamente ou revise o trecho.');
    // The pipeline returns decoded text. Near the generation limit, split and
    // retry locally rather than accept a possibly truncated translation.
    if (countTokens(result) >= maxOutputTokens - 4) {
      const smaller = boundedParts(part, countTokens, Math.max(1, Math.floor(countTokens(part) / 2)));
      if (depth >= 4 || smaller.length < 2) throw new Error('A tradução local atingiu o limite de geração. Divida ou revise o trecho antes de continuar.');
      const pieces = [];
      for (const piece of smaller) pieces.push(await render(piece, depth + 1));
      return pieces.join(' ');
    }
    return result;
  }
  for (const part of translationParts(text, { source, countTokens, maxTokens })) output.push(await render(part));
  return output.join(' ');
}
