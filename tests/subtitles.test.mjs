import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtitles, exportSubtitles, activeSegment, validateProject, timestamp } from '../src/subtitles.mjs';

const segments = [
  { start: .25, end: 2.7, original: 'This is a training video.', translated: 'Este é um vídeo de treinamento.' },
  { start: 3, end: 5.5, original: 'Let us begin.', translated: 'Vamos começar.' },
];

test('SRT round-trip preserves timing and language, including CRLF', () => {
  const text = exportSubtitles(segments, 'original').replace(/\n/g, '\r\n');
  assert.deepEqual(parseSubtitles(text), segments.map(s => ({ ...s, translated: '' })));
});
test('VTT parsing supports cue identifiers and settings', () => {
  const text = 'WEBVTT\n\ncue-1\n00:00:00.250 --> 00:00:02.700 align:start\nThis is a training video.\n\n00:03.000 --> 00:05.500\nLet us begin.';
  assert.deepEqual(parseSubtitles(text), segments.map(s => ({ ...s, translated: '' })));
});
test('exported translated subtitles use Portuguese, milliseconds carry correctly', () => {
  assert.match(exportSubtitles(segments), /Este é um vídeo de treinamento\./);
  assert.equal(timestamp(59.9999), '00:01:00,000');
  assert.match(exportSubtitles(segments, 'translated', 'vtt'), /^WEBVTT\n/);
});
test('sync selects exact boundaries and leaves gaps without captions', () => {
  assert.equal(activeSegment(segments, .25), 0);
  assert.equal(activeSegment(segments, 2.7), -1);
  assert.equal(activeSegment(segments, 3), 1);
  assert.equal(activeSegment(segments, 5.5), -1);
});
test('invalid subtitles and corrupted projects are rejected', () => {
  assert.throws(() => parseSubtitles('not a subtitle'));
  assert.throws(() => parseSubtitles('1\n00:00:02,000 --> 00:00:01,000\nBackwards'));
  assert.throws(() => validateProject({ version: 1, title: 'Test', segments: [{ start: '0', end: 4, original: 'x', translated: 'y' }] }));
  assert.throws(() => validateProject({ version: 2, title: 'Test', segments }));
});
test('project validation excludes arbitrary fields and preserves the two languages', () => {
  const project = validateProject({ version: 1, title: 'Test', filename: 'test.mp4', duration: 6, segments, video: 'untrusted', id: 'untrusted', sourceLanguage: 'es', analysis: 'Resumo local', completedAt: 1234, apiKey: 'must-not-import' });
  assert.deepEqual(project.segments, segments);
  assert.equal('video' in project, false);
  assert.equal('id' in project, false);
  assert.equal('apiKey' in project, false);
  assert.equal(project.sourceLanguage, 'es');
  assert.equal(project.analysis, 'Resumo local');
  assert.equal(project.completedAt, 1234);
});
