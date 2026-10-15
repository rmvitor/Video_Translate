const modes = ['', 'letters_digits', 'lower_upper_letters_digits', 'lower_upper_letters_digits_symbols'];
const SYMBOLS = "!@#$%^&*()_+-=[]{};':\"|<>?,./`~";
export function passwordPolicy(value = {}) {
  const minimumLength = value.minimumLength ?? 8;
  const requiredCharacters = value.requiredCharacters ?? '';
  if (!Number.isInteger(minimumLength) || minimumLength < 8 || minimumLength > 128 || !modes.includes(requiredCharacters)) throw new Error('Política pública de senha inválida.');
  return { minimumLength, requiredCharacters };
}
export function passwordRequirements(policy) {
  const rules = [`Pelo menos ${policy.minimumLength} caracteres.`];
  if (policy.requiredCharacters === 'letters_digits') rules.push('Inclua letras e números.');
  if (policy.requiredCharacters.startsWith('lower_upper')) rules.push('Inclua letras maiúsculas, minúsculas e números.');
  if (policy.requiredCharacters.endsWith('_symbols')) rules.push('Inclua também um símbolo, como !, @ ou #.');
  return rules;
}
export function passwordChecks(password, policy) {
  const checks=[{id:'length',label:`Pelo menos ${policy.minimumLength} caracteres.`,met:[...password].length>=policy.minimumLength}];
  if(policy.requiredCharacters==='letters_digits')checks.push({id:'letter',label:'Uma letra (A–Z ou a–z).',met:/[a-zA-Z]/.test(password)});
  if(policy.requiredCharacters.startsWith('lower_upper'))checks.push(
    {id:'uppercase',label:'Uma letra maiúscula (A–Z).',met:/[A-Z]/.test(password)},
    {id:'lowercase',label:'Uma letra minúscula (a–z).',met:/[a-z]/.test(password)},
  );
  if(policy.requiredCharacters)checks.push({id:'number',label:'Um número (0–9).',met:/[0-9]/.test(password)});
  if(policy.requiredCharacters.endsWith('_symbols'))checks.push({id:'symbol',label:'Um símbolo (ex.: !, @ ou #).',met:[...password].some(char=>SYMBOLS.includes(char))});
  return checks;
}
export function passwordError(password, policy) {
  if ([...password].length < policy.minimumLength) return `Use pelo menos ${policy.minimumLength} caracteres.`;
  if (policy.requiredCharacters && (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password))) return 'Inclua letras e números na senha.';
  if (policy.requiredCharacters.startsWith('lower_upper') && (!/[a-z]/.test(password) || !/[A-Z]/.test(password))) return 'Inclua letras maiúsculas e minúsculas.';
  if (policy.requiredCharacters.endsWith('_symbols') && !passwordChecks(password,policy).find(check=>check.id==='symbol').met) return 'Inclua um símbolo na senha.';
  return '';
}
