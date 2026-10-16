import test from 'node:test';
import assert from 'node:assert/strict';
import { translationSentences, translationParts, translateText, translationModel } from '../src/translation.mjs';

const countTokens = text => Array.from(text).length;

test('each sentence is translated independently and reassembled in order', async () => {
  const first = 'Finally, select the desired negative format.';
  const second = 'The default is parentheses, but a dash is also available.';
  const calls = [];
  const output = await translateText(`${first} ${second}`, {
    countTokens,
    // Simulate the model bug: a multi-sentence call silently drops the first.
    translate: async text => { calls.push(text); return text === first ? 'Finalmente, selecione o formato negativo desejado.' : 'O padrão é parênteses, mas um traço também está disponível.'; },
  });
  assert.deepEqual(calls, [first, second]);
  assert.equal(output, 'Finalmente, selecione o formato negativo desejado. O padrão é parênteses, mas um traço também está disponível.');
});

test('sentence splitting keeps abbreviations, quoted text, decimals and final fragments', () => {
  const text = 'Dr. Smith selected 1,250.50. Click "Save." Then review the account';
  for (const Segmenter of [Intl.Segmenter, null]) {
    assert.deepEqual(translationParts(text, { countTokens, maxTokens: 200, Segmenter }), [
      'Dr. Smith selected 1,250.50.', 'Click "Save."', 'Then review the account',
    ]);
  }
  assert.deepEqual(translationSentences('Choose a currency\n associated with the entity.'), ['Choose a currency associated with the entity.']);
});

test('token budgets preserve every word and order in long text, including the last words', () => {
  const text = Array.from({ length: 95 }, (_, i) => `identificador${i}`).join(' ') + ' last words';
  const parts = translationParts(text, { countTokens, maxTokens: 70 });
  assert.ok(parts.length > 10);
  assert.ok(parts.every(part => countTokens(part) <= 70));
  assert.equal(parts.join(' '), text);
});

test('token budgets also bound scripts without spaces and long Unicode identifiers', () => {
  const text = '選択してください。' + '非常に長い文字列😀'.repeat(30);
  const parts = translationParts(text, { source: 'ja', countTokens, maxTokens: 30 });
  assert.ok(parts.every(part => countTokens(part) <= 30));
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(part => !/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(part)));
  assert.throws(() => translationParts('a', { countTokens: () => 9, maxTokens: 8 }), /sem truncá-lo/);
});

test('empty results fail instead of marking a partially translated unit complete', async () => {
  const calls = [];
  await assert.rejects(translateText('Click Save. Close the dialog.', {
    countTokens,
    translate: async text => { calls.push(text); return calls.length === 1 ? 'Clique em Salvar.' : '   '; },
  }), /frase vazia/);
  assert.deepEqual(calls, ['Click Save.', 'Close the dialog.']);
});

test('a possibly truncated result is discarded and translated again in smaller parts', async () => {
  const calls = [];
  const result = await translateText('Review each account before closing', {
    countTokens, maxOutputTokens: 40,
    translate: async text => { calls.push(text); return calls.length === 1 ? 'x'.repeat(36) : `[${text}]`; },
  });
  assert.ok(calls.length > 1);
  assert.equal(calls.slice(1).join(' '), 'Review each account before closing');
  assert.ok(!result.includes('xxxx'));
  assert.ok(result.includes('closing'));
  await assert.rejects(translateText('Save', { countTokens, maxOutputTokens: 8, translate: async () => 'x'.repeat(10) }), /limite de geração/);
});

test('model selection follows the source and Portuguese input bypasses inference', async () => {
  assert.notEqual(translationModel('en'), translationModel('es'));
  assert.equal(translationModel('es'), translationModel('fr'));
  assert.equal(await translateText('Texto já em português.', { source: 'pt', countTokens, translate: async () => { throw new Error('Should not run'); } }), 'Texto já em português.');
  assert.equal(await translateText('   ', { countTokens, translate: async () => { throw new Error('Should not run'); } }), '');
  assert.equal(await translateText('—', { countTokens, translate: async () => { throw new Error('Should not run'); } }), '—');
});
