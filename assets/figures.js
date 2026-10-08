// Interactive figures for §6 (find the scale) and §7 (print on another sheet).
// One drawing function per figure, used twice: the builder pre-renders the default state into index.html,
// the page redraws on click. Every number comes from scale.js, so the figure can never disagree with the converter.
import { SCALES, SHEETS, calibrate, printOnSheet, parseLength, formatNumber } from './scale.js';

const r1 = (n) => +n.toFixed(1);
// Readouts and captions keep a scale label on one line (same rule as the page copy).
const nb = (t) => t.replace(/ = /g, '\u00a0=\u00a0');
const scaleLabel = (id) => SCALES.find((s) => s.id === id).label;
const sheetName = (id) => SHEETS.find((s) => s.id === id).label.replace(/ \(.*\)$/, '');

// ---------- §6: a 20′-0″ wall measured on the print ----------
export const FIND_CASES = {
  exact: { measured: '5"', text: '5″' },
  resized: { measured: '4 13/16"', text: '4 13/16″' },
};

export function findFigure(caseId) {
  const c = FIND_CASES[caseId];
  const measured = parseLength(c.measured, 'in');
  const r = calibrate(parseLength(`20'`, 'ft'), measured, ['architectural']);
  const X0 = 50, PX = 100;
  const x = (inches) => r1(X0 + inches * PX);
  const ticks = Array.from({ length: 5.25 * 8 + 1 }, (_, i) => {
    const xi = x(i / 8), inch = i % 8 === 0, half = i % 4 === 0;
    return `<line x1="${xi}" y1="104" x2="${xi}" y2="${inch ? 126 : half ? 120 : 114}"/>${inch ? `<text x="${xi}" y="146" text-anchor="middle">${i / 8}</text>` : ''}`;
  }).join('');
  const end = x(measured);
  const svg = `<g class="ff-dim"><line x1="${x(0)}" y1="38" x2="${end}" y2="38"/><line x1="${x(0)}" y1="30" x2="${x(0)}" y2="58"/><line x1="${end}" y1="30" x2="${end}" y2="58"/>`
    + `<line class="ff-tick" x1="${x(0) - 6}" y1="44" x2="${x(0) + 6}" y2="32"/><line class="ff-tick" x1="${r1(end - 6)}" y1="44" x2="${r1(end + 6)}" y2="32"/>`
    + `<text x="${r1((x(0) + end) / 2)}" y="28" text-anchor="middle">20′-0″</text></g>`
    // Resized print: the true-size wall (5″) stays as a dashed outline, so the shrink is visible.
    + (caseId === 'resized' ? `<rect class="ff-ghost" x="${x(0)}" y="62" width="${5 * PX}" height="18"/>` : '')
    + `<rect class="ff-wall" x="${x(0)}" y="62" width="${r1(measured * PX)}" height="18"/>`
    + `<g class="ff-ruler"><rect x="${x(0)}" y="104" width="${5.25 * PX}" height="26"/>${ticks}</g>`
    + `<line class="ff-read" x1="${end}" y1="84" x2="${end}" y2="130"/>`
    + `<text class="ff-label" x="${r1(end - 10)}" y="98" text-anchor="end">${c.text} on the print</text>`;
  const ratio = `1:${formatNumber(r.R, 2)}`;
  const out = caseId === 'exact'
    ? `${ratio} · ${r.nearest.label} · printed at ${formatNumber(r.printPercent, 2)}%`
    : `${ratio} · closest ${r.nearest.label} · printed at ${formatNumber(r.printPercent, 2)}% · reprint at ${formatNumber(r.reprintPercent, 1)}%`;
  const caption = caseId === 'exact'
    ? 'A 20′-0″ wall that measures 5″ on the print.'
    : 'The same 20′-0″ wall measuring 4 13/16″ on a resized print.';
  return { svg, out: nb(out), caption: nb(caption) };
}

// ---------- §7: one sheet fitted to a smaller one ----------
export const SHEET_CASES = [
  { scale: '1:50', from: 'iso-a1', to: 'iso-a3', group: 'metric' },
  { scale: '1:50', from: 'iso-a0', to: 'iso-a3', group: 'metric' },
  { scale: '1/4in', from: 'arch-d', to: 'arch-b', group: 'architectural' },
  { scale: '1/4in', from: 'arch-d', to: 'ansi-b', group: 'architectural' },
];

export function sheetFigure(i) {
  const c = SHEET_CASES[i];
  const from = SHEETS.find((s) => s.id === c.from), to = SHEETS.find((s) => s.id === c.to);
  const R = SCALES.find((s) => s.id === c.scale).R;
  const r = printOnSheet(R, c.from, c.to, [c.group]);
  // Landscape, true proportions; the larger sheet fills the box, the smaller sits in its lower-left corner.
  const K = Math.min(330 / from.h, 220 / from.w), X = 40, Y = 24;
  const A = { w: from.h * K, h: from.w * K }, B = { w: to.h * K, h: to.w * K };
  const by = Y + A.h - B.h;
  const pct = `${formatNumber(r.percent, 2)}%`;
  const newScale = r.exact ? r.nearest.label : `1:${formatNumber(r.R, 1)}`;
  const svg = `<rect class="sf-from" x="${X}" y="${Y}" width="${r1(A.w)}" height="${r1(A.h)}"/>`
    + `<rect class="sf-to" x="${X}" y="${r1(by)}" width="${r1(B.w)}" height="${r1(B.h)}"/>`
    + `<line class="sf-arrow" x1="${r1(X + A.w - 6)}" y1="${Y + 6}" x2="${r1(X + B.w + 8)}" y2="${r1(by - 8)}" marker-end="url(#sf-head)"/>`
    + `<defs><marker id="sf-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="sf-head"/></marker></defs>`
    + `<text class="sf-pct" x="${r1(X + (A.w + B.w) / 2 + 12)}" y="${r1(Y + (by - Y) / 2 + 4)}">${pct}</text>`
    + `<text class="sf-label" x="${X + 12}" y="${Y + 24}">${sheetName(c.from)} · ${scaleLabel(c.scale)}</text>`
    + `<text class="sf-label sf-label-to" x="${X + 12}" y="${r1(by + 24)}">${sheetName(c.to)} · ${newScale}</text>`;
  const out = r.exact
    ? `${pct} · ${scaleLabel(c.scale)} → ${r.nearest.label} (exact)`
    : `${pct} · ${scaleLabel(c.scale)} → 1:${formatNumber(r.R, 1)}, closest ${r.nearest.label} (not exact)`;
  const caption = `${sheetName(c.from)} fitted to ${sheetName(c.to)} prints at ${pct}, so ${scaleLabel(c.scale)} becomes ${newScale}.`;
  return { svg, out: nb(out), caption: nb(caption) };
}
