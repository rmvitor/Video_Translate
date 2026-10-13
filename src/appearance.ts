import { normalizePreferences, accentForeground, readableAccent } from './preferences.mjs';

const KEY = 'entrelinhas.appearance';
let preference = normalizePreferences(undefined);
try { preference = normalizePreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { /* Use defaults when storage is unavailable or corrupt. */ }
const system = matchMedia('(prefers-color-scheme: dark)');
function apply() {
  const theme = preference.theme === 'system' ? (system.matches ? 'dark' : 'light') : preference.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--accent', preference.color);
  document.documentElement.style.setProperty('--accent-contrast', accentForeground(preference.color));
  document.documentElement.style.setProperty('--accent-ink', readableAccent(preference.color, theme === 'dark' ? '#1c2030' : '#ffffff'));
  document.documentElement.style.setProperty('--purple', preference.color);
  document.documentElement.style.setProperty('--purple-dark', preference.color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#10121c' : preference.color);
}
apply(); system.addEventListener('change', apply);
export function initAppearance() {
  const panel = document.querySelector('#appearance-fields')!;
  panel.innerHTML = `<label class="field-label">Tema<select id="theme-choice" aria-label="Tema do aplicativo"><option value="system">Acompanhar o sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label><label class="field-label">Cor do aplicativo<div class="color-controls"><input type="color" id="accent-choice" aria-label="Cor do aplicativo" /><span id="accent-code"></span></div></label><div class="color-presets">${['#7564e6', '#eb3948', '#2563eb', '#0d9488', '#d97706', '#db2777'].map(color => `<button class="color-preset" data-accent="${color}" style="--swatch:${color}" aria-label="Usar cor ${color}"></button>`).join('')}</div>`;
  const theme = document.querySelector<HTMLSelectElement>('#theme-choice')!, color = document.querySelector<HTMLInputElement>('#accent-choice')!;
  theme.value = preference.theme; color.value = preference.color;
  document.querySelector('#accent-code')!.textContent = preference.color;
  const save = () => {
    preference = normalizePreferences({ theme: theme.value, color: color.value });
    try { localStorage.setItem(KEY, JSON.stringify(preference)); } catch { /* Appearance still works in this session. */ }
    document.querySelector('#accent-code')!.textContent = preference.color; apply();
  };
  theme.addEventListener('change', save); color.addEventListener('input', save);
  panel.querySelectorAll<HTMLButtonElement>('[data-accent]').forEach(button => button.addEventListener('click', () => { color.value = button.dataset.accent!; save(); }));
}
