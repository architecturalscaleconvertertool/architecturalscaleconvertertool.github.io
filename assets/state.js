// Shareable URL state in the fragment: #mode=A&scale=1/4in&v=2.5in (never sent to the server). Pure functions, no DOM access.

export const MODES = {
  A: ['scale', 'v', 'unit'],
  B: ['scale', 'v', 'unit'],
  C: ['from', 'to'],
  D: ['real', 'measured', 'system'],
  E: ['scale', 'text', 'unit'],
  F: ['scale', 'sheet', 'target'],
};

const MAX_VALUE_LENGTH = 40;
const PRECISIONS = new Set(['8', '16', '32']);

/** Deep-link hashes: #drawing-to-real opens mode A with default values. */
export const MODE_SLUGS = {
  'drawing-to-real': 'A',
  'real-to-drawing': 'B',
  rescale: 'C',
  'find-scale': 'D',
  autocad: 'E',
  print: 'F',
};

const stripPrefix = (text) => String(text ?? '').replace(/^[#?]/, '');

/** Mode letter for a slug hash like "#rescale", else null. Other hashes (anchors, state) return null. */
export function modeFromHash(hash) {
  const slug = stripPrefix(hash).toLowerCase();
  return Object.hasOwn(MODE_SLUGS, slug) ? MODE_SLUGS[slug] : null;
}

/** True when a hash or query string carries converter state (has a mode= key). */
export function hasState(text) {
  return new URLSearchParams(stripPrefix(text)).has('mode');
}

/** Build a fragment from a mode and its fields. Unknown fields and empty values are dropped; precision 16 is the default and is omitted. */
export function encodeState(mode, fields = {}) {
  if (!(mode in MODES)) return '';
  const params = new URLSearchParams({ mode });
  for (const key of MODES[mode]) {
    const value = fields[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value).trim());
  }
  const precision = String(fields.precision ?? '').trim();
  if (PRECISIONS.has(precision) && precision !== '16') params.set('precision', precision);
  return `#${params.toString()}`;
}

/** Read a fragment or legacy query string, with or without the leading # or ?. Invalid mode falls back to A; oversized or unknown fields are ignored; precision must be 8, 16 or 32. */
export function decodeState(text) {
  const params = new URLSearchParams(stripPrefix(text));
  const raw = (params.get('mode') ?? '').toUpperCase();
  const mode = raw in MODES ? raw : 'A';
  const fields = {};
  for (const key of MODES[mode]) {
    const value = params.get(key);
    if (value !== null && value.length <= MAX_VALUE_LENGTH) fields[key] = value;
  }
  const precision = params.get('precision');
  if (PRECISIONS.has(precision)) fields.precision = precision;
  return { mode, fields };
}
