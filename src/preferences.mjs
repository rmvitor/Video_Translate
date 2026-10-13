export const LANGUAGES = [
  ['en', 'Inglês', 'english'], ['es', 'Espanhol', 'spanish'], ['fr', 'Francês', 'french'],
  ['de', 'Alemão', 'german'], ['it', 'Italiano', 'italian'], ['ja', 'Japonês', 'japanese'],
  ['zh', 'Chinês', 'chinese'], ['ko', 'Coreano', 'korean'], ['ru', 'Russo', 'russian'],
  ['ar', 'Árabe', 'arabic'], ['hi', 'Hindi', 'hindi'], ['nl', 'Holandês', 'dutch'], ['pt', 'Português', 'portuguese'],
];
export function normalizePreferences(value) {
  return {
    theme: ['light', 'dark', 'system'].includes(value?.theme) ? value.theme : 'system',
    color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : '#7564e6',
  };
}
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
export function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function accentForeground(color) { return contrastRatio(color, '#ffffff') >= contrastRatio(color, '#000000') ? '#ffffff' : '#000000'; }
export function readableAccent(color, surface) {
  let rgb = color.slice(1).match(/../g).map(v => parseInt(v, 16));
  const lighter = luminance(surface) < .3;
  for (let i = 0; i < 100 && contrastRatio(color, surface) < 4.5; i++) {
    rgb = rgb.map(v => Math.round(v * .9 + (lighter ? 255 : 0) * .1));
    color = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return color;
}
