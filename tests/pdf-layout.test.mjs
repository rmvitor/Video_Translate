import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphBlocks } from '../src/pdf-layout.mjs';
const item = (str, x, y, height = 12) => ({ str, transform: [1, 0, 0, height, x, y], width: str.length * 6, height });
test('PDF glyph runs become paragraphs, preserving headings and bullet boundaries', () => {
  const result = paragraphBlocks([
    item('Welcome!', 20, 780, 20),
    item('Hello', 20, 740), item('world.', 55, 740), item('This is training.', 20, 725),
    item('• First objective', 30, 690), item('• Second objective', 30, 675),
    item('\uf0c9', 20, 810),
  ]);
  assert.deepEqual(result.map(b => b.original), ['Welcome!', 'Hello world. This is training.', '• First objective', '• Second objective']);
  assert.equal(result[0].heading, true);
});
test('PDF text from widely separated columns is not fused into one line', () => {
  const blocks = paragraphBlocks([item('Left column', 10, 700), item('Right column', 300, 700)]);
  assert.deepEqual(blocks.map(b => b.original), ['Left column', 'Right column']);
});
