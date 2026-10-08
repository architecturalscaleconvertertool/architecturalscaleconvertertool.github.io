// Graphic scale bars. Pure functions: pick a round real length for a drawing scale,
// then draw the bar as SVG at true paper size (viewBox units are millimeters on paper).

const MM_PER_IN = 25.4;
const IMPERIAL_FT = [1, 2, 4, 8, 16, 20, 32, 40, 64, 80, 100, 160, 200, 320, 400, 800, 1000, 1600, 2000, 4000];
const METRIC_M = [0.1, 0.2, 0.4, 0.8, 1, 2, 4, 8, 10, 20, 40, 80, 100, 200, 400, 800, 1000];
const TARGET_MM = { imperial: 4 * MM_PER_IN, metric: 100 };
const MIN_MM = 35;
const MAX_MM = 155;
const FRACTIONS = [0, 0.125, 0.25, 0.5, 1];
const LABELLED = [0, 0.25, 0.5, 1];

const round = (n) => Math.round(n * 1000) / 1000;

/** Choose a round bar length for scale factor R. Returns null for an invalid R. */
export function scaleBarSpec(R, system = 'imperial') {
  if (!Number.isFinite(R) || R <= 0) return null;
  const metric = system === 'metric';
  const lengths = metric ? METRIC_M : IMPERIAL_FT;
  const realMm = (L) => (metric ? L * 1000 : L * 12 * MM_PER_IN);
  const target = TARGET_MM[metric ? 'metric' : 'imperial'];
  let best = null;
  for (const L of lengths) {
    const paperMm = realMm(L) / R;
    if (paperMm < MIN_MM || paperMm > MAX_MM) continue;
    const distance = Math.abs(Math.log(paperMm / target));
    if (!best || distance < best.distance) best = { L, paperMm, distance };
  }
  if (!best) return null;
  const { L, paperMm } = best;
  let unit;
  let labels;
  if (metric) {
    unit = L < 1 ? 'MM' : 'M';
    labels = LABELLED.map((f) => round(unit === 'MM' ? L * f * 1000 : L * f));
  } else {
    unit = L < 4 ? 'IN' : 'FT';
    labels = LABELLED.map((f) => round(unit === 'IN' ? L * f * 12 : L * f));
  }
  return { length: L, unit, labels, paperMm: round(paperMm), system: metric ? 'metric' : 'imperial' };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/**
 * Draw a scale bar. `download: true` gives a print-ready file sized in mm, black on white.
 * Otherwise the bar scales to its container and uses currentColor, with one accent segment.
 */
export function scaleBarSvg(spec, caption = '', { download = false } = {}) {
  if (!spec) return '';
  const pad = download ? 6 : 9;
  const fontSize = download ? 2.5 : 3.6;
  const barTop = fontSize + 3.5;
  const rowH = download ? 2 : 2.6;
  const w = spec.paperMm;
  const width = round(w + pad * 2);
  const height = round(barTop + rowH * 2 + (caption ? 7 : 3));
  const x = (f) => round(pad + w * f);
  const ink = download ? '#000' : 'currentColor';
  const parts = [];
  for (let i = 0; i < FRACTIONS.length - 1; i += 1) {
    const x0 = x(FRACTIONS[i]);
    const segW = round(x(FRACTIONS[i + 1]) - x0);
    const top = i % 2 === 0;
    parts.push(`<rect x="${x0}" y="${top ? barTop : barTop + rowH}" width="${segW}" height="${rowH}" fill="${ink}"/>`);
    if (!download && i === FRACTIONS.length - 2) {
      parts.push(`<rect class="bar-accent" x="${x0}" y="${barTop}" width="${segW}" height="${rowH}"/>`);
    }
  }
  parts.push(`<rect x="${pad}" y="${barTop}" width="${round(w)}" height="${rowH * 2}" fill="none" stroke="${ink}" stroke-width="0.3"/>`);
  for (const f of FRACTIONS.slice(1, -1)) {
    parts.push(`<line x1="${x(f)}" y1="${barTop}" x2="${x(f)}" y2="${round(barTop + rowH * 2)}" stroke="${ink}" stroke-width="0.3"/>`);
  }
  const text = LABELLED.map((f, i) => {
    const last = i === LABELLED.length - 1;
    const label = last ? `${spec.labels[i]} ${spec.unit}` : spec.labels[i];
    return `<text x="${x(f)}" y="${round(barTop - 1.4)}" text-anchor="middle">${esc(label)}</text>`;
  });
  if (caption) text.push(`<text x="${pad}" y="${round(barTop + rowH * 2 + 4.6)}">${esc(caption)}</text>`);
  const size = download ? ` width="${width}mm" height="${height}mm"` : '';
  const role = download ? '' : ` role="img" aria-label="${esc(`Graphic scale, 0 to ${spec.labels[3]} ${spec.unit.toLowerCase()}`)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"${size}${role}>`
    + `<g font-family="Inter, Helvetica, Arial, sans-serif" font-size="${fontSize}" fill="${ink}">${text.join('')}</g>`
    + `${parts.join('')}</svg>`;
}
