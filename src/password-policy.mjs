const modes = ['', 'letters_digits', 'lower_upper_letters_digits', 'lower_upper_letters_digits_symbols'];
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
export function passwordError(password, policy) {
  if ([...password].length < policy.minimumLength) return `Use pelo menos ${policy.minimumLength} caracteres.`;
  if (policy.requiredCharacters && (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password))) return 'Inclua letras e números na senha.';
  if (policy.requiredCharacters.startsWith('lower_upper') && (!/[a-z]/.test(password) || !/[A-Z]/.test(password))) return 'Inclua letras maiúsculas e minúsculas.';
  if (policy.requiredCharacters.endsWith('_symbols') && !/[^a-zA-Z0-9]/.test(password)) return 'Inclua um símbolo na senha.';
  return '';
}
