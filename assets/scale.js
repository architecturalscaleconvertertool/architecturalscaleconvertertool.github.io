// Pure scale math: parse lengths/scales, convert, format. No DOM access.

const MM_PER_IN = 25.4;
const UNIT_TO_IN = { in: 1, ft: 12, mm: 1 / MM_PER_IN, cm: 10 / MM_PER_IN, m: 1000 / MM_PER_IN };

const NUM = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const METRIC_RE = new RegExp(`^(${NUM})\\s*(mm|cm|m)$`);
const IMPERIAL_RE = new RegExp(
  `^(?:(${NUM})\\s*')?\\s*-?\\s*(?:(${NUM})(?:\\s+(\\d+)\\/(\\d+))?|(\\d+)\\/(\\d+))?\\s*(")?$`
);

function normalize(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[′’‘]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/''/g, '"')
    .replace(/\s*(?:feet|foot|ft)\b/g, "'")
    .replace(/\s*(?:inches|inch|in)\b/g, '"')
    .replace(/\b(\d{1,3}(?:,\d{3})+)(?=\D|$)/g, (m) => m.replace(/,/g, ''))
    .replace(/(\d)-(\d+\/\d+)/g, '$1 $2')
    .replace(/\s+/g, ' ');
}

/** Parse a length string into inches. Unitless numbers use defaultUnit. Returns null if invalid. */
export function parseLength(text, defaultUnit = 'in') {
  const s = normalize(text);
  if (s === '' || s.startsWith('-') || s.includes(',')) return null;

  const metric = s.match(METRIC_RE);
  if (metric) return Number(metric[1]) * UNIT_TO_IN[metric[2]];

  const m = s.match(IMPERIAL_RE);
  if (!m) return null;
  const [, feet, whole, fNum, fDen, soloNum, soloDen, inchMark] = m;
  if (feet === undefined && whole === undefined && soloNum === undefined) return null;

  const num = fNum ?? soloNum;
  const den = fDen ?? soloDen;
  if (den !== undefined && Number(den) === 0) return null;
  const inchPart = (whole !== undefined ? Number(whole) : 0) + (num !== undefined ? Number(num) / Number(den) : 0);
  const hasInchPart = whole !== undefined || num !== undefined;

  if (feet !== undefined) return Number(feet) * 12 + inchPart;
  if (inchMark) return inchPart;
  if (!hasInchPart || !(defaultUnit in UNIT_TO_IN)) return null;
  return inchPart * UNIT_TO_IN[defaultUnit];
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/** Format inches as feet-inch with a fraction rounded to 1/denominator, e.g. 12'-6 3/4". */
export function formatFeetInches(inches, denominator = 16) {
  const units = Math.round(inches * denominator);
  const perFoot = 12 * denominator;
  const feet = Math.floor(units / perFoot);
  const rest = units - feet * perFoot;
  const whole = Math.floor(rest / denominator);
  const fracNum = rest % denominator;
  let inchText = String(whole);
  if (fracNum > 0) {
    const g = gcd(fracNum, denominator);
    const frac = `${fracNum / g}/${denominator / g}`;
    inchText = whole > 0 || feet > 0 ? `${whole} ${frac}` : frac;
  }
  return feet > 0 ? `${feet}'-${inchText}"` : `${inchText}"`;
}

/** Format a number with US separators and at most maxDigits decimals. */
export function formatNumber(value, maxDigits = 3) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxDigits }).format(value);
}

/** All display forms of one length. */
export function formatLength(inches, denominator = 16) {
  return {
    feetInches: formatFeetInches(inches, denominator),
    feet: `${formatNumber(inches / 12, 4)} ft`,
    inches: `${formatNumber(inches, 4)} in`,
    mm: `${formatNumber(inches * MM_PER_IN, 1)} mm`,
    m: `${formatNumber((inches * MM_PER_IN) / 1000, 4)} m`,
  };
}

const ARCH = ['1/32', '1/16', '3/32', '1/8', '3/16', '1/4', '3/8', '1/2', '3/4', '1', '1-1/2', '3'];
const ENG = [10, 20, 30, 40, 50, 60, 100, 200];
const METRIC = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

function fractionValue(text) {
  return text.split('-').reduce((sum, part) => {
    const [n, d] = part.split('/').map(Number);
    return sum + (d ? n / d : n);
  }, 0);
}

/** Standard drawing scales. R = real size / drawing size (same unit). */
export const SCALES = [
  ...ARCH.map((x) => ({ id: `${x}in`, group: 'architectural', label: `${x}″ = 1′-0″`, R: 12 / fractionValue(x) })),
  ...ENG.map((n) => ({ id: `1in=${n}ft`, group: 'engineering', label: `1″ = ${n}′`, R: 12 * n })),
  ...METRIC.map((n) => ({ id: `1:${n}`, group: 'metric', label: `1:${n}`, R: n })),
];

const isPositive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Resolve a preset id or a custom scale ("1:75", `3/16" = 1'-0"`, `1" = 25'`, "48") to R. Null if invalid. */
export function parseScale(text) {
  const s = String(text ?? '').trim();
  const preset = SCALES.find((sc) => sc.id === s);
  if (preset) return preset.R;

  const ratio = s.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const R = Number(ratio[2]) / Number(ratio[1]);
    return isPositive(R) ? R : null;
  }
  if (s.includes('=')) {
    const [left, right, extra] = s.split('=');
    if (extra !== undefined) return null;
    const paper = parseLength(left);
    const real = parseLength(right);
    return isPositive(paper) && isPositive(real) ? real / paper : null;
  }
  const factor = /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
  return isPositive(factor) ? factor : null;
}

/** Mode A: drawing size -> real size (inches). */
export function paperToReal(paperInches, R) {
  return isPositive(R) && paperInches >= 0 ? paperInches * R : null;
}

/** Mode B: real size -> drawing size (inches). */
export function realToPaper(realInches, R) {
  return isPositive(R) && realInches >= 0 ? realInches / R : null;
}

/** Mode C: factor and print percentage to turn a drawing at fromR into toR. */
export function rescale(fromR, toR) {
  if (!isPositive(fromR) || !isPositive(toR)) return null;
  const factor = fromR / toR;
  return { factor, percent: factor * 100 };
}

/** Closest preset to R on a log scale, optionally limited to groups. */
export function nearestScale(R, groups = ['architectural', 'engineering', 'metric']) {
  if (!isPositive(R)) return null;
  let best = null;
  for (const sc of SCALES) {
    if (!groups.includes(sc.group)) continue;
    const distance = Math.abs(Math.log(R / sc.R));
    if (!best || distance < best.distance) best = { scale: sc, distance };
  }
  return best ? best.scale : null;
}

const EQUIVALENT_MAX_PERCENT = 10;

/** For a scale ratio R, the nearest scale in each other system (skipping ownGroup) when the drawing size differs by at most 10%. */
export function equivalents(R, ownGroup) {
  const nearest = {};
  for (const group of ['architectural', 'engineering', 'metric']) {
    if (group === ownGroup) continue;
    const sc = nearestScale(R, [group]);
    const percent = sc ? Math.abs(R / sc.R - 1) * 100 : Infinity;
    nearest[group] = percent <= EQUIVALENT_MAX_PERCENT ? { scale: sc, percent, direction: sc.R > R ? 'smaller' : 'larger' } : null;
  }
  return { ratio: R, factor: R, nearest };
}

/** Mode D: find the true scale of a print from one known real dimension and its measured length. */
export function calibrate(realInches, measuredInches, groups) {
  if (!isPositive(realInches) || !isPositive(measuredInches)) return null;
  const R = realInches / measuredInches;
  const nearest = nearestScale(R, groups);
  if (!nearest) return null;
  return {
    R,
    nearest,
    printPercent: (nearest.R / R) * 100,
    reprintPercent: (R / nearest.R) * 100,
  };
}

const DRAWING_UNITS = new Set(['in', 'ft', 'mm']);

/**
 * Mode E: AutoCAD values. drawingUnit is the model-space unit: 'in' (architectural), 'ft' (civil) or 'mm'.
 * Paper space is inches for 'in' and 'ft', millimeters for 'mm'. Feet units divide the factor by 12.
 */
export function autocadSettings(R, paperTextInches, drawingUnit = 'in') {
  if (!isPositive(R) || !isPositive(paperTextInches) || !DRAWING_UNITS.has(drawingUnit)) return null;
  const factor = drawingUnit === 'ft' ? R / 12 : R;
  const modelTextInches = paperTextInches * R;
  const modelTextValue = drawingUnit === 'ft' ? modelTextInches / 12 : drawingUnit === 'mm' ? modelTextInches * MM_PER_IN : modelTextInches;
  return {
    scaleFactor: factor,
    viewportXP: `1/${formatNumber(factor, 4).replace(/,/g, '')}xp`,
    dimscale: factor,
    modelTextInches,
    modelTextValue,
  };
}

const mmSheet = (id, label, w, h) => ({ id, group: 'iso', label: `${label} (${w} × ${h} mm)`, w: w / MM_PER_IN, h: h / MM_PER_IN });

/** Sheet sizes in inches (w <= h). ARCH and ANSI per ASME Y14.1, A series per ISO 216. */
export const SHEETS = [
  ...[['a', 'A', 9, 12], ['b', 'B', 12, 18], ['c', 'C', 18, 24], ['d', 'D', 24, 36], ['e1', 'E1', 30, 42], ['e', 'E', 36, 48]]
    .map(([k, l, w, h]) => ({ id: `arch-${k}`, group: 'arch', label: `ARCH ${l} (${w} × ${h} in)`, w, h })),
  ...[['a', 'A', 8.5, 11], ['b', 'B', 11, 17], ['c', 'C', 17, 22], ['d', 'D', 22, 34], ['e', 'E', 34, 44]]
    .map(([k, l, w, h]) => ({ id: `ansi-${k}`, group: 'ansi', label: `ANSI ${l} (${w} × ${h} in)`, w, h })),
  mmSheet('iso-a0', 'A0', 841, 1189),
  mmSheet('iso-a1', 'A1', 594, 841),
  mmSheet('iso-a2', 'A2', 420, 594),
  mmSheet('iso-a3', 'A3', 297, 420),
  mmSheet('iso-a4', 'A4', 210, 297),
];

const EXACT_TOLERANCE = 0.005;

/**
 * Mode F: print a sheet drawn at R onto another sheet with "fit to page".
 * groups limits the "closest standard scale" to the drawing's own scale system.
 */
export function printOnSheet(R, fromId, toId, groups) {
  const from = SHEETS.find((s) => s.id === fromId);
  const to = SHEETS.find((s) => s.id === toId);
  if (!isPositive(R) || !from || !to) return null;
  const fit = Math.min(to.w / from.w, to.h / from.h);
  const newR = R / fit;
  const nearest = nearestScale(newR, groups);
  if (!nearest) return null;
  return {
    percent: fit * 100,
    R: newR,
    nearest,
    exact: Math.abs(newR / nearest.R - 1) <= EXACT_TOLERANCE,
  };
}
