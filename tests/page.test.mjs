import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCALES, formatNumber, formatFeetInches, nearestScale, rescale } from '../assets/scale.js';
import { MODES, DEFAULTS, renderResult, renderEquivalents } from '../assets/modes.js';
import { decodeState } from '../assets/state.js';
import { findFigure, sheetFigure, SHEET_CASES } from '../assets/figures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Non-breaking spaces (scale labels kept on one line, build.mjs keepScales) are layout, not content: compare as plain spaces.
const html = readFileSync(join(root, 'index.html'), 'utf8').replace(/\u00a0/g, ' ');
const ORIGIN = 'https://architecturalscaleconvertertool.github.io';
// The only links that leave the site, besides the source repository.
const OUTBOUND = [
  // §5.3 source citation (AutoCAD help).
  'https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-66E7DB72-B2A7-4166-9970-9E19CC06F739.htm',
  'https://www.usfa.fema.gov/downloads/pdf/nfa/engineer-architect-scales.pdf',
  'https://openlab.citytech.cuny.edu/andersonnicolecmce1110fall2021/files/2021/03/06_slides_scale-REMOTE.pdf',
];
const REPO = 'https://github.com/architecturalscaleconvertertool/architecturalscaleconvertertool.github.io';

test('head carries title, canonical, social image and WebApplication schema', () => {
  assert.match(html, /<title>Free Architectural Scale Converter &amp; Drawing Scale Calculator<\/title>/);
  assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/">`));
  assert.ok(html.includes(`<meta property="og:image" content="${ORIGIN}/assets/icons/og-image.png">`));
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 1, 'one @graph block');
  const app = blocks[0]['@graph'].find((s) => s['@type'] === 'WebApplication');
  assert.equal(app.applicationCategory, 'UtilitiesApplication');
  assert.equal(app.offers.price, 0);
  assert.equal(app.codeRepository, undefined, 'codeRepository belongs on SoftwareSourceCode');
});

test('every mode panel ships with its default result already rendered', () => {
  for (const mode of Object.keys(MODES)) {
    const key = mode.toLowerCase();
    const equiv = ['A', 'B', 'E'].includes(mode) ? renderEquivalents(DEFAULTS[mode].scale) : '';
    const expected = renderResult(MODES[mode](DEFAULTS[mode])) + equiv;
    assert.ok(html.includes(`<div class="result" id="${key}-out" aria-live="polite">${expected}</div>`), `panel ${mode}`);
  }
});

test('§5 tables list all 32 presets once, with values computed by scale.js', () => {
  // §5 chart (architectural), §5.1 (engineering), §5.2 (metric): one row per preset, every cell from scale.js.
  const rows = [...html.matchAll(/<tr data-scale-id="([^"]+)">(.*?)<\/tr>/g)];
  assert.deepEqual(rows.map((r) => r[1]).sort(), SCALES.map((s) => s.id).sort());
  const primes = (t) => t.replace(/'/g, '′').replace(/"/g, '″');
  const pct = (a, b) => `${formatNumber(rescale(a, b).percent, 2)}%`;
  for (const [, id, cellHtml] of rows) {
    const cells = [...cellHtml.matchAll(/<t[hd][^>]*>([^<]*)<\/t[hd]>/g)].map((m) => m[1]);
    const s = SCALES.find((x) => x.id === id);
    const near = nearestScale(s.R, ['architectural']);
    const expected = {
      architectural: [s.label, `1:${formatNumber(s.R, 4)}`, formatNumber(12 / s.R, 5), primes(formatFeetInches(s.R))],
      engineering: [s.label, `1:${formatNumber(s.R, 4)}`, near.label, pct(s.R, near.R)],
      metric: [s.label, near.label, pct(s.R, near.R)],
    }[s.group];
    assert.deepEqual(cells, expected, id);
  }
});

test('every element id used by app.js exists in index.html', () => {
  const ids = ['precision'];
  for (const m of ['A', 'B', 'C', 'D', 'E', 'F']) ids.push(`tab-${m}`, `panel-${m}`, `${m.toLowerCase()}-out`);
  ids.push('a-scale', 'a-scale-custom', 'a-v', 'a-unit', 'b-scale', 'b-scale-custom', 'b-v', 'b-unit',
    'c-from', 'c-from-custom', 'c-to', 'c-to-custom', 'd-real', 'd-measured', 'd-system', 'e-scale', 'e-scale-custom', 'e-unit', 'e-text',
    'f-scale', 'f-scale-custom', 'f-sheet', 'f-target');
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `missing id="${id}"`);
  assert.doesNotMatch(html, /"None|None"/);
});

test('no third-party scripts, stylesheets or fonts', () => {
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  assert.doesNotMatch(html, /<link[^>]+rel="(stylesheet|preload)"[^>]+href="https?:/);
  assert.doesNotMatch(readFileSync(join(root, 'assets/style.css'), 'utf8'), /url\("?https?:/);
});

test('JavaScript stays under 50 KB and fonts under 50 KB', () => {
  const size = (dir, ext) => readdirSync(join(root, dir)).filter((f) => f.endsWith(ext)).reduce((n, f) => n + statSync(join(root, dir, f)).size, 0);
  assert.ok(size('assets', '.js') < 50 * 1024, 'js');
  assert.ok(size('assets/fonts', '.woff2') < 50 * 1024, 'fonts');
});

test('no em dash in visible copy', () => {
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, /—/);
});

test('repository files for GitHub Pages are present', () => {
  for (const f of ['README.md', 'LICENSE', 'robots.txt', 'sitemap.xml', '.nojekyll', 'favicon.ico', 'assets/icons/favicon.svg', 'assets/icons/apple-touch-icon.png', 'assets/icons/og-image.png', 'assets/fonts/OFL-Inter.txt']) { // Inter is the only font shipped
    assert.ok(statSync(join(root, f)).isFile(), `missing ${f}`);
  }
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes(`<loc>${ORIGIN}/</loc>`));
  assert.equal((sitemap.match(/<loc>/g) ?? []).length, 1, 'sitemap lists only the home page');
  assert.ok(!existsSync(join(root, 'about')), 'no /about/ page');
  assert.ok(readFileSync(join(root, 'robots.txt'), 'utf8').includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
});

test('links leave the site only to the planned outbound pages, the repo and nothing else', () => {
  const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith(ORIGIN));
  for (const href of external) assert.ok(OUTBOUND.includes(href) || href.startsWith(REPO), `unexpected external link ${href}`);
  for (const href of OUTBOUND) assert.equal(html.split(`href="${href}"`).length - 1, 1, `outbound link used once: ${href}`);
});

test('mode buttons open a real mode with values the tool accepts', () => {
  // Content sections hand off to the tool with <button class="mode-btn" data-mode data-preset> (no URL is generated).
  const buttons = [...html.matchAll(/<button type="button" class="[^"]*\bmode-btn" data-mode="([A-F])" data-preset="([^"]*)">/g)];
  assert.ok(buttons.length >= 3, `found ${buttons.length}`);
  for (const [, mode, preset] of buttons) {
    const fields = Object.fromEntries(new URLSearchParams(preset.replace(/&amp;/g, '&')));
    for (const name of Object.keys(fields)) assert.ok(name in DEFAULTS[mode], `${mode} has no field ${name}`);
    const result = MODES[mode]({ ...DEFAULTS[mode], ...fields });
    assert.ok(!result.error && !result.empty, `${mode} ${preset} gives ${JSON.stringify(result)}`);
  }
});

test('FAQ: 4 tabs, each one column with the anchor H2 open first + H3 questions, matching the FAQPage schema word for word', () => {
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = schemas[0]['@graph'].find((s) => s['@type'] === 'FAQPage');
  const sec = html.slice(html.indexOf('<section class="sec sec-band faq-sec"'), html.indexOf('<section class="sec cta-sec"'));
  const plain = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
  const leads = [...sec.matchAll(/<details name="faq-[a-z-]+" open class="faq-anchor"><summary><h2 id="[^"]+">([^<]+)<\/h2><\/summary><div class="faq-a">\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [m[1], m[2]]);
  const qs = [...sec.matchAll(/<summary><h3 id="[^"]+">([^<]+)<\/h3><\/summary><div class="faq-a">\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [m[1], m[2]]);
  assert.equal(leads.length, 4, 'anchor H2');
  assert.equal(qs.length, 16, 'H3 questions');
  assert.equal(faq.mainEntity.length, 20);
  const page = new Map([...leads, ...qs].map(([q, a]) => [plain(q), plain(a)]));
  for (const e of faq.mainEntity) assert.equal(page.get(e.name), e.acceptedAnswer.text, e.name);
  assert.equal((sec.match(/role="tabpanel"/g) ?? []).length, 4);
  assert.doesNotMatch(sec, /role="tabpanel"[^>]*hidden/, 'every panel ships visible');
  assert.equal((sec.match(/<details name="faq-[a-z-]+" open/g) ?? []).length, 4, 'one open question per tab: the anchor H2');
});

test('segmented tabs point at panels that exist', () => {
  for (const [, id] of html.matchAll(/role="tab" id="[^"]+" aria-controls="([^"]+)"/g)) {
    assert.ok(html.includes(`id="${id}" role="tabpanel"`) || html.includes(`id="${id}"`), `missing panel ${id}`);
  }
});

test('§6 and §7 figures ship their default state from figures.js, and every case draws', () => {
  // The page redraws with the same functions, so the shipped default must be exactly their output.
  for (const d of [findFigure('exact'), sheetFigure(0)]) {
    assert.ok(html.includes(d.svg), 'default svg');
    assert.ok(html.includes(`>${d.out.replace(/\u00a0/g, ' ')}</p>`), `default readout: ${d.out}`);
  }
  for (const c of ['exact', 'resized']) assert.match(findFigure(c).out, /^1:\d/);
  SHEET_CASES.forEach((_, i) => {
    assert.match(sheetFigure(i).out, /^\d+(\.\d+)?% · /);
    assert.ok(html.includes(`data-sheet-case="${i}"`), `row ${i} picks the figure`);
  });
});

test('§5 H3 blocks sit in three tabs, every panel ships visible with its H3', () => {
  // Tabs are CSS-collapse only: the HTML holds all three panels unhidden, and the tab row stays hidden until app.js runs.
  const group = html.match(/<div class="pills sub-tabs" data-pills>([\s\S]*?)\n    <\/div>\n    <\/div>/)?.[1] ?? '';
  assert.match(group, /<div class="pill-list" role="tablist" aria-label="Scale conversions" hidden>/);
  const panels = [['scales-engineering', 'architectural-to-engineering'], ['scales-metric', 'architectural-to-metric'], ['scales-autocad', 'autocad-settings']];
  for (const [panel, h3] of panels) {
    assert.ok(group.includes(`aria-controls="${panel}"`), `tab for ${panel}`);
    const start = group.indexOf(`<div class="pill-panel" id="${panel}" role="tabpanel" aria-labelledby="${panel}-tab">`);
    assert.ok(start > -1, `panel ${panel} ships without hidden`);
    assert.ok(group.indexOf(`<h3 id="${h3}">`, start) > start, `H3 ${h3} inside ${panel}`);
  }
});

test('<strong> marks at most 5 key facts; other bold text uses <b>', () => {
  const n = (html.match(/<strong>/g) ?? []).length;
  assert.ok(n >= 1 && n <= 5, `strong count ${n}`);
});

test('404 page: noindex, no canonical or schema, one H1, links back to the converter and every mode', async () => {
  const nf = readFileSync(join(root, '404.html'), 'utf8');
  const { MODE_SLUGS } = await import('../assets/state.js');
  assert.ok(nf.includes('<meta name="robots" content="noindex">'));
  assert.doesNotMatch(nf, /rel="canonical"|og:url|application\/ld\+json/);
  assert.equal((nf.match(/<h1[ >]/g) ?? []).length, 1);
  assert.ok(nf.includes('href="/#converter"'));
  for (const slug of Object.keys(MODE_SLUGS)) assert.ok(nf.includes(`href="/#${slug}"`), `mode link ${slug}`);
  for (const [, url] of nf.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) assert.ok(url === '/' || existsSync(join(root, url)), `404 asset ${url}`);
  assert.ok(!readFileSync(join(root, 'sitemap.xml'), 'utf8').includes('404'), '404 stays out of the sitemap');
});

test('footer feedback links open the repo issue forms that exist', () => {
  for (const name of ['wrong-result.yml', 'request-a-scale.yml']) {
    assert.ok(existsSync(join(root, '.github/ISSUE_TEMPLATE', name)), `template ${name}`);
    assert.ok(html.includes(`href="${REPO}/issues/new?template=${name}"`), `footer link ${name}`);
  }
});

test('feedback email is shown as text, in the footer and on the 404 page', () => {
  const nf = readFileSync(join(root, '404.html'), 'utf8');
  for (const page of [html, nf]) {
    assert.ok(page.includes('href="mailto:architecturalscaleconvertertoo@gmail.com"'));
    assert.ok(page.includes('architecturalscaleconvertertoo<wbr>@gmail.com'), 'address visible as text');
  }
});

test('Search Console verification meta stays in the home page head', () => {
  const headHtml = html.slice(0, html.indexOf('</head>'));
  assert.ok(headHtml.includes('<meta name="google-site-verification" content="ytuIqkSI_jHG8FxRSMyL-ykCzTX9wo5r1-VuqxOckNc">'));
});
