// Convert PDF glyph runs into reading paragraphs. No document HTML is evaluated.
export function paragraphBlocks(items) {
  const runs = items.filter(i => typeof i.str === 'string' && i.str.trim() && !/^[\uE000-\uF8FF\s]+$/.test(i.str)).map(i => ({
    text: i.str, x: i.transform[4], y: -i.transform[5], width: i.width, size: Math.abs(i.height || i.transform[3] || 12),
  })).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const run of runs) {
    const line = lines.findLast(l => Math.abs(l.y - run.y) < Math.min(l.size, run.size) * .35 && run.x - l.right < 80);
    if (line) {
      const gap = run.x - line.right;
      line.text += (gap > run.size * .12 && !/\s$/.test(line.text) && !/^\s/.test(run.text) ? ' ' : '') + run.text;
      line.right = run.x + run.width;
      line.size = Math.max(line.size, run.size);
    } else lines.push({ ...run, right: run.x + run.width });
  }
  const sizes = runs.map(r => r.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 12;
  const blocks = [];
  for (const line of lines) {
    const previous = blocks.at(-1);
    const heading = line.size > body * 1.12 && line.text.length < 180;
    const bullet = /^\s*[•●▪\-]\s/.test(line.text);
    if (previous && !previous.heading && !heading && !bullet && line.y - previous.lastY < body * 1.65 && Math.abs(line.x - previous.x) < 45) {
      previous.original += (previous.original.endsWith('-') ? '' : ' ') + line.text.trim();
      previous.lastY = line.y;
    } else blocks.push({ original: line.text.trim(), y: line.y, lastY: line.y, x: line.x, heading });
  }
  return blocks.map(({ original, y, heading }) => ({ original, y, heading }));
}
