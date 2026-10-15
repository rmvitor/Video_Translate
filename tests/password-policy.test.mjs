import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordPolicy,passwordRequirements,passwordError,passwordChecks} from '../src/password-policy.mjs';
test('password policy mirrors supported Auth rules without reducing the eight-character minimum',()=>{
  assert.throws(()=>passwordPolicy({minimumLength:6}));assert.throws(()=>passwordPolicy({requiredCharacters:'unsupported'}));
  assert.equal(passwordError('12345678',passwordPolicy()),'');
  const policy=passwordPolicy({minimumLength:12,requiredCharacters:'lower_upper_letters_digits_symbols'});
  assert.match(passwordError('Curta1!',policy),/12/);assert.match(passwordError('somenteletras',policy),/números/);assert.match(passwordError('minusculas123',policy),/maiúsculas/);assert.match(passwordError('SenhaLonga123',policy),/símbolo/);assert.equal(passwordError('SenhaLonga123!',policy),'');
  assert.ok(passwordRequirements(policy).some(rule=>rule.includes('12')));
});

test('each password rule updates independently and rejects whitespace or accented letters as symbols',()=>{
 const policy=passwordPolicy({requiredCharacters:'lower_upper_letters_digits_symbols'});
 assert.deepEqual(passwordChecks('',policy).map(check=>check.met),[false,false,false,false,false]);
 assert.deepEqual(passwordChecks('Abc',policy).map(check=>check.met),[false,true,true,false,false]);
 assert.deepEqual(passwordChecks('Abcdefg1',policy).map(check=>check.met),[true,true,true,true,false]);
 assert.ok(passwordChecks('Abcdefg1!',policy).every(check=>check.met));
 for(const value of ['Abcdefg1 ','Abcdefg1é','Abcdefg1\t']){assert.match(passwordError(value,policy),/símbolo/);assert.equal(passwordChecks(value,policy).find(check=>check.id==='symbol').met,false);}
 assert.equal(passwordChecks('Abcdefg1',policy).find(check=>check.id==='symbol').met,false);
 assert.deepEqual(passwordChecks('12345678',passwordPolicy()).map(check=>check.id),['length']);
});
