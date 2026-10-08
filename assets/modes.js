// What each converter mode computes, as pure functions of its field values.
// Shared by the browser (app.js) and the page builder, so the first render matches the live tool.
import {
  SCALES, SHEETS, parseLength, parseScale, formatLength, formatFeetInches, formatNumber,
  paperToReal, realToPaper, rescale, calibrate, autocadSettings, printOnSheet, equivalents,
} from './scale.js';
import { scaleBarSpec, scaleBarSvg } from './scalebar.js';

export const DEFAULTS = {
  A: { scale: '1/4in', v: '2 1/2"', unit: 'in' },
  B: { scale: '1/4in', v: `12'-6"`, unit: 'ft' },
  C: { from: '1/8in', to: '1/4in' },
  D: { real: `20'`, measured: '4 13/16"', system: 'architectural' },
  E: { scale: '1/4in', text: '3/32"', unit: 'in' },
  F: { scale: '1/4in', sheet: 'arch-d', target: 'ansi-b' },
};

const SCALE_ERROR = `Enter a valid scale, e.g. 1:75 or 3/16" = 1'-0".`;

/** Resolve a preset id or typed scale into { R, label, system }. */
export function resolveScale(raw) {
  const preset = SCALES.find((s) => s.id === raw);
  if (preset) return { R: preset.R, label: preset.label, system: preset.group === 'metric' ? 'metric' : 'imperial', group: preset.group };
  const R = parseScale(raw);
  if (R === null) return null;
  return { R, label: String(raw).trim(), system: String(raw).includes(':') ? 'metric' : 'imperial', group: undefined };
}

const sheetLabel = (id) => SHEETS.find((s) => s.id === id)?.label.replace(/ \(.*\)$/, '') ?? id;
const bar = (R, system, label) => ({ spec: scaleBarSpec(R, system), caption: `SCALE: ${label}` });

function lengthResult(inches, precision, primaryKey) {
  const f = formatLength(inches, precision);
  const all = [['Feet-inches', 'feetInches'], ['Feet', 'feet'], ['Inches', 'inches'], ['Millimeters', 'mm'], ['Meters', 'm']];
  return { primary: f[primaryKey], rows: all.filter(([, k]) => k !== primaryKey).map(([label, k]) => [label, f[k]]) };
}

export const MODES = {
  A(f, precision = 16) {
    const s = resolveScale(f.scale);
    if (!s) return { error: SCALE_ERROR };
    if (!String(f.v ?? '').trim()) return { empty: 'Type a measurement taken on the drawing.' };
    const paper = parseLength(f.v, f.unit);
    if (paper === null) return { error: 'Enter a drawing measurement, e.g. 2 1/2" or 64 mm.' };
    const real = paperToReal(paper, s.R);
    const key = s.system === 'metric' ? (real >= 1000 / 25.4 ? 'm' : 'mm') : 'feetInches';
    return { caption: `Real size at ${s.label}`, ...lengthResult(real, precision, key), bar: bar(s.R, s.system, s.label) };
  },
  B(f, precision = 16) {
    const s = resolveScale(f.scale);
    if (!s) return { error: SCALE_ERROR };
    if (!String(f.v ?? '').trim()) return { empty: 'Type a real-world size.' };
    const real = parseLength(f.v, f.unit);
    if (real === null) return { error: `Enter a real size, e.g. 12'-6 3/4" or 3.81 m.` };
    const paper = realToPaper(real, s.R);
    const key = s.system === 'metric' ? 'mm' : 'feetInches';
    const out = lengthResult(paper, precision, key);
    if (key === 'feetInches') out.primary = formatFeetInches(paper, precision);
    return { caption: `Length on the drawing at ${s.label}`, ...out, bar: bar(s.R, s.system, s.label) };
  },
  C(f) {
    const from = resolveScale(f.from);
    const to = resolveScale(f.to);
    if (!from || !to) return { error: SCALE_ERROR };
    const r = rescale(from.R, to.R);
    const direction = r.factor > 1 ? 'Enlarge' : r.factor < 1 ? 'Reduce' : 'No change';
    return {
      caption: `Copy ${from.label} to ${to.label} at`,
      primary: `${formatNumber(r.percent, 2)}%`,
      rows: [['Size factor', `× ${formatNumber(r.factor, 4)}`], ['Direction', direction]],
      bar: bar(to.R, to.system, to.label),
    };
  },
  D(f) {
    if (!String(f.real ?? '').trim() || !String(f.measured ?? '').trim()) return { empty: 'Enter one real dimension and the same dimension measured on the print.' };
    const real = parseLength(f.real, 'ft');
    const measured = parseLength(f.measured, 'in');
    const groups = f.system === 'any' ? undefined : [f.system];
    const r = real === null || measured === null ? null : calibrate(real, measured, groups);
    if (r === null) return { error: `Enter both lengths, e.g. 20' and 4 13/16".` };
    const system = r.nearest.group === 'metric' ? 'metric' : 'imperial';
    return {
      caption: 'Closest standard scale',
      primary: r.nearest.label,
      rows: [
        ['Measured ratio', `1:${formatNumber(r.R, 2)}`],
        ['Print size vs. true scale', `${formatNumber(r.printPercent, 2)}%`],
        ['Reprint at', `${formatNumber(r.reprintPercent, 2)}%`],
      ],
      bar: bar(r.nearest.R, system, r.nearest.label),
    };
  },
  E(f, precision = 16) {
    const s = resolveScale(f.scale);
    if (!s) return { error: SCALE_ERROR };
    if (!String(f.text ?? '').trim()) return { empty: 'Type the text height you want on the printed sheet.' };
    const text = parseLength(f.text, f.unit === 'mm' ? 'mm' : 'in');
    const r = text === null ? null : autocadSettings(s.R, text, f.unit);
    if (r === null) return { error: 'Enter the printed text height, e.g. 3/32" or 2.5 mm.' };
    const typed = f.unit === 'mm'
      ? `${formatNumber(r.modelTextValue, 1)} mm`
      : `${formatNumber(r.modelTextValue, 4)} (${formatFeetInches(r.modelTextInches, precision)})`;
    return {
      caption: `AutoCAD scale factor for ${s.label}`,
      primary: formatNumber(r.scaleFactor, 4),
      rows: [['Viewport scale (ZOOM)', r.viewportXP], ['DIMSCALE', formatNumber(r.dimscale, 4)], ['Model text height to type', typed]],
      bar: bar(s.R, s.system, s.label),
    };
  },
  F(f) {
    const s = resolveScale(f.scale);
    if (!s) return { error: SCALE_ERROR };
    const r = printOnSheet(s.R, f.sheet, f.target, s.group ? [s.group] : undefined);
    if (r === null) return { error: 'Choose both sheet sizes.' };
    const system = r.nearest.group === 'metric' ? 'metric' : 'imperial';
    return {
      caption: `Print ${sheetLabel(f.sheet)} on ${sheetLabel(f.target)} at`,
      primary: `${formatNumber(r.percent, 2)}%`,
      rows: [
        ['Scale on the new sheet', `1:${formatNumber(r.R, 1)}`],
        ['Closest standard scale', r.exact ? `${r.nearest.label} (exact)` : `${r.nearest.label} (not exact)`],
      ],
      note: r.exact ? '' : `Measure this print with a 1:${formatNumber(r.R, 1)} ratio, not with a standard scale.`,
      bar: bar(r.R, system, `1:${formatNumber(r.R, 1)}`),
    };
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GROUP_NAMES = { architectural: 'architectural', engineering: 'engineering', metric: 'metric' };

/** F1 strip under a result: ratio, factor and the closest scale in the other systems (within 10% of drawing size). */
export function renderEquivalents(rawScale) {
  const s = resolveScale(rawScale);
  if (!s) return '';
  const eq = equivalents(s.R, s.group);
  const ratio = formatNumber(s.R, 2);
  const parts = [`1:${ratio}`, `factor ${ratio}`];
  for (const [group, near] of Object.entries(eq.nearest)) {
    parts.push(near
      ? `closest ${GROUP_NAMES[group]} ${near.scale.label}, ${formatNumber(near.percent, 1)}% ${near.direction}`
      : `no ${GROUP_NAMES[group]} scale within 10%`);
  }
  return `<p class="equiv">${parts.map((p) => `<span>${esc(p)}</span>`).join('')}</p>`;
}

/** HTML for the result panel. Values are escaped; the scale bar SVG is generated, not user text. */
export function renderResult(result) {
  if (result.error) return `<p class="result-msg result-error" role="alert">${esc(result.error)}</p>`;
  if (result.empty) return `<p class="result-msg">${esc(result.empty)}</p>`;
  const rows = result.rows.map(([label, value]) => `<div class="result-row"><dt>${esc(label)}</dt><dd><span class="num">${esc(value)}</span><button type="button" class="copy" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}">Copy</button></dd></div>`).join('');
  const note = result.note ? `<p class="result-note">${esc(result.note)}</p>` : '';
  const figure = result.bar?.spec
    ? `<figure class="scalebar"><div class="scalebar-svg">${scaleBarSvg(result.bar.spec)}</div><figcaption><span>Graphic scale, ${esc(result.bar.caption.replace('SCALE: ', ''))}</span><button type="button" class="link-btn" data-download-bar>Download SVG</button></figcaption></figure>`
    : '';
  return `<p class="result-caption">${esc(result.caption)}</p>`
    + `<p class="result-primary"><output class="num">${esc(result.primary)}</output><button type="button" class="copy" data-copy="${esc(result.primary)}" aria-label="Copy result">Copy</button></p>`
    + `<dl class="result-list">${rows}</dl>${note}${figure}`;
}
