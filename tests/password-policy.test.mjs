import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordPolicy,passwordRequirements,passwordError} from '../src/password-policy.mjs';
test('password policy mirrors supported Auth rules without reducing the eight-character minimum',()=>{
  assert.throws(()=>passwordPolicy({minimumLength:6}));assert.throws(()=>passwordPolicy({requiredCharacters:'unsupported'}));
  assert.equal(passwordError('12345678',passwordPolicy()),'');
  const policy=passwordPolicy({minimumLength:12,requiredCharacters:'lower_upper_letters_digits_symbols'});
  assert.match(passwordError('Curta1!',policy),/12/);assert.match(passwordError('somenteletras',policy),/números/);assert.match(passwordError('minusculas123',policy),/maiúsculas/);assert.match(passwordError('SenhaLonga123',policy),/símbolo/);assert.equal(passwordError('SenhaLonga123!',policy),'');
  assert.ok(passwordRequirements(policy).some(rule=>rule.includes('12')));
});
