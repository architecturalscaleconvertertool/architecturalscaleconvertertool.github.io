// UI wiring for the converter. Math lives in scale.js, mode logic in modes.js, URL state in state.js.
// Works for the full six-mode tool and for single-mode embeds. Also wires segmented tabs and "open mode" links.
import { SCALES, formatNumber } from './scale.js';
import { MODES, DEFAULTS, renderResult, renderEquivalents } from './modes.js';
import { scaleBarSvg } from './scalebar.js';
import { findFigure, sheetFigure } from './figures.js';
import { MODES as FIELDS, encodeState, decodeState, modeFromHash, hasState } from './state.js';

const $ = (id) => document.getElementById(id);
const SCALE_FIELDS = new Set(['scale', 'from', 'to']);
// Quick scales row: which field of the active mode a chip fills (mode D has no single scale, so the row hides).
const QUICK_TARGET = { A: 'scale', B: 'scale', C: 'to', E: 'scale', F: 'scale' };
const EQUIV_MODES = new Set(['A', 'B', 'E']);

const tool = document.querySelector('[data-tool]');
const urlState = tool?.hasAttribute('data-url-state');
const modes = Object.keys(MODES).filter((m) => $(`panel-${m}`));
const lastResult = {};
let activeMode = modes.find((m) => !$(`panel-${m}`).hidden) ?? modes[0];

function wireCustomScales() {
  for (const select of document.querySelectorAll('select[data-scale]')) {
    select.addEventListener('change', () => { $(`${select.id}-custom`).hidden = select.value !== 'custom'; });
  }
}

function readField(mode, name) {
  const id = `${mode.toLowerCase()}-${name}`;
  const el = $(id);
  if (!el) return undefined;
  if (SCALE_FIELDS.has(name) && el.value === 'custom') return $(`${id}-custom`).value.trim();
  return el.value;
}

function writeField(mode, name, value) {
  const id = `${mode.toLowerCase()}-${name}`;
  const el = $(id);
  if (!el) return;
  if (SCALE_FIELDS.has(name)) {
    const isPreset = SCALES.some((s) => s.id === value);
    el.value = isPreset ? value : 'custom';
    $(`${id}-custom`).hidden = isPreset;
    if (!isPreset) $(`${id}-custom`).value = value;
  } else if (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === value)) {
    el.value = value;
  }
}

const fieldsOf = (mode) => Object.fromEntries(FIELDS[mode].map((name) => [name, readField(mode, name)]));

function syncQuick(mode) {
  const row = document.querySelector('[data-quick]');
  if (!row) return;
  row.hidden = !(mode in QUICK_TARGET);
  const value = mode in QUICK_TARGET ? readField(mode, QUICK_TARGET[mode]) : null;
  for (const chip of row.querySelectorAll('[data-quick-pick]')) chip.setAttribute('aria-pressed', String(chip.dataset.quickPick === value));
}

function update(mode = activeMode, { writeUrl = true } = {}) {
  const fields = fieldsOf(mode);
  const result = MODES[mode](fields, Number($('precision')?.value ?? 16));
  lastResult[mode] = result;
  const equiv = EQUIV_MODES.has(mode) && !result.error ? renderEquivalents(fields.scale) : '';
  $(`${mode.toLowerCase()}-out`).innerHTML = renderResult(result) + equiv;
  syncQuick(mode);
  if (urlState && writeUrl) history.replaceState(null, '', location.pathname + encodeState(mode, { ...fields, precision: $('precision')?.value }));
}

function activate(mode, { focus = false, writeUrl = true } = {}) {
  activeMode = mode;
  for (const m of modes) {
    const tab = $(`tab-${m}`);
    const selected = m === mode;
    $(`panel-${m}`).hidden = !selected;
    if (!tab) continue;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focus) tab.focus();
    }
  }
  update(mode, { writeUrl });
}

function applyState({ mode, fields }, opts) {
  if (!modes.includes(mode)) return false;
  for (const [name, value] of Object.entries(fields)) {
    if (name === 'precision') { if ($('precision')) $('precision').value = value; } else writeField(mode, name, value);
  }
  activate(mode, opts);
  return true;
}

// Read the fragment (state or mode slug); an old ?mode= link is decoded once, then rewritten to a clean fragment URL.
function applyLocation({ migrate = false } = {}) {
  if (urlState && hasState(location.hash)) {
    applyState(decodeState(location.hash), { writeUrl: false });
  } else if (urlState && migrate && hasState(location.search)) {
    applyState(decodeState(location.search));
  } else if (modes.includes(modeFromHash(location.hash))) {
    activate(modeFromHash(location.hash), { writeUrl: false });
  } else if (migrate) {
    activate(activeMode, { writeUrl: false });
  }
}

function downloadBar(mode) {
  const bar = lastResult[mode]?.bar;
  if (!bar?.spec) return;
  const svg = scaleBarSvg(bar.spec, bar.caption.replace(/″/g, '"').replace(/′/g, "'"), { download: true });
  const slug = bar.caption.replace('SCALE: ', '').replace(/[^0-9a-z]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  link.download = `graphic-scale-${slug}.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1500);
}

function init() {
  if (!tool) return;
  wireCustomScales();
  for (const m of modes) {
    $(`tab-${m}`)?.addEventListener('click', () => activate(m));
    const form = $(`panel-${m}`).querySelector('form');
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', () => update(m));
    form.addEventListener('change', () => update(m));
  }
  tool.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = modes.indexOf(activeMode);
    const next = Number.isFinite(keys[e.key]) ? (i + keys[e.key] + modes.length) % modes.length : (keys[e.key] < 0 ? 0 : modes.length - 1);
    activate(modes[next], { focus: true });
  });
  $('precision')?.addEventListener('change', () => update());
  tool.addEventListener('click', (e) => {
    if (e.target.closest('[data-download-bar]')) {
      downloadBar(activeMode);
      return;
    }
    const share = e.target.closest('[data-share]');
    if (share && navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(() => flash(share, 'Link copied'));
      return;
    }
    if (e.target.closest('[data-reset]')) {
      for (const [name, value] of Object.entries(DEFAULTS[activeMode])) writeField(activeMode, name, value);
      if ($('precision')) $('precision').value = '16';
      update();
      return;
    }
    const copy = e.target.closest('button[data-copy]');
    if (copy && navigator.clipboard) navigator.clipboard.writeText(copy.dataset.copy).then(() => flash(copy, 'Copied'));
  });
  applyLocation({ migrate: true });
  addEventListener('hashchange', () => applyLocation());
  tool.classList.add('is-ready');
}

// Links like /?mode=D#converter switch the tool in place when it is on this page; elsewhere they navigate.
function initModeLinks() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-open-mode]');
    if (!link || !tool || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(link.href);
    if (url.pathname !== location.pathname) return;
    e.preventDefault();
    const { mode, fields } = decodeState(hasState(url.search) ? url.search : url.hash);
    for (const [name, value] of Object.entries(fields)) if (name !== 'precision') writeField(mode, name, value);
    activate(mode);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    tool.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    $(`tab-${mode}`)?.focus({ preventScroll: true });
  });
}

// Segmented tabs: every panel is in the HTML and visible without JavaScript; this turns them into tabs.
function initPills() {
  for (const group of document.querySelectorAll('[data-pills]')) {
    const list = group.querySelector('[role="tablist"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const show = (tab, focus) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !on;
      }
      if (focus) tab.focus();
    };
    list.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) show(tab);
    });
    list.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const i = tabs.indexOf(document.activeElement);
      const next = Number.isFinite(keys[e.key]) ? (i + keys[e.key] + tabs.length) % tabs.length : (keys[e.key] < 0 ? 0 : tabs.length - 1);
      show(tabs[next], true);
    });
    list.hidden = false;
    show(tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0]);
    group.classList.add('is-ready');
    // A link to a heading inside a hidden panel (#autocad-settings) or to the panel itself opens that tab first.
    const openFromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      const panel = target?.closest('[role="tabpanel"]');
      if (!panel || !group.contains(panel) || !panel.hidden) return;
      show(tabs.find((t) => t.getAttribute('aria-controls') === panel.id));
      target.scrollIntoView({ block: 'start' });
    };
    openFromHash();
    addEventListener('hashchange', openFromHash);
  }
}

function scrollToTool(mode) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  tool.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  const first = $(`panel-${mode}`)?.querySelector('input:not([hidden]), select');
  first?.focus({ preventScroll: true });
}

// Quick-scale chips (inside the tool and in the hero cards) and mode buttons in the content.
function initActions() {
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-quick-pick]');
    if (pick && tool) {
      if (!(activeMode in QUICK_TARGET)) activate('A');
      writeField(activeMode, QUICK_TARGET[activeMode], pick.dataset.quickPick);
      update();
      if (pick.hasAttribute('data-scroll-tool')) scrollToTool(activeMode);
      return;
    }
    const btn = e.target.closest('button.mode-btn[data-mode]');
    if (btn && tool && modes.includes(btn.dataset.mode)) {
      const mode = btn.dataset.mode;
      for (const [name, value] of new URLSearchParams(btn.dataset.preset ?? '')) writeField(mode, name, value);
      activate(mode);
      scrollToTool(mode);
    }
  });
}

// Tooltips: hover and focus work in CSS; a tap toggles .is-open, Escape or a tap elsewhere closes it.
// Each tooltip is nudged back inside the viewport when it would spill over an edge.
function initTips() {
  const wraps = [...document.querySelectorAll('.tip-wrap')];
  const place = (wrap) => {
    const tip = wrap.querySelector('.tip');
    tip.style.setProperty('--shift', '0px');
    const r = tip.getBoundingClientRect();
    const pad = 8;
    const vw = document.body.getBoundingClientRect().width; // the body box keeps the device width even while a tooltip overflows
    const shift = r.left < pad ? pad - r.left : r.right > vw - pad ? vw - pad - r.right : 0;
    tip.style.setProperty('--shift', `${shift}px`);
  };
  const closeAll = (except) => { for (const w of wraps) if (w !== except) w.classList.remove('is-open'); };
  for (const wrap of wraps) {
    wrap.addEventListener('mouseenter', () => place(wrap));
    wrap.addEventListener('focusin', () => place(wrap));
  }
  document.addEventListener('pointerup', (e) => {
    const wrap = e.target.closest('.tip-wrap');
    closeAll(wrap);
    // A tap on an action chip (button) runs the action only; its tooltip would cover the result it just changed.
    if (wrap && e.pointerType === 'touch' && !wrap.querySelector('button')) { wrap.classList.toggle('is-open'); place(wrap); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAll();
    const open = document.activeElement?.closest('.tip-wrap');
    if (open) open.classList.add('tip-off');
  });
  document.addEventListener('focusout', (e) => e.target.closest?.('.tip-wrap')?.classList.remove('tip-off'));
}

// §4 slider: a line and a square at the chosen print percentage (length × k, area × k²) and the scale 1/8″ = 1′-0″ becomes.
function initRescaleDemo() {
  const fig = document.querySelector('[data-rescale-demo]');
  if (!fig) return;
  const q = (sel) => fig.querySelector(sel);
  const range = q('input[type="range"]');
  const from = Number(fig.dataset.from);
  const draw = () => {
    const pct = Number(range.value);
    const k = pct / 100;
    const len = 64 * k;
    const side = 24 * k;
    q('[data-rf-line]').setAttribute('x2', 56 + len);
    const sq = q('[data-rf-square]');
    sq.setAttribute('width', side);
    sq.setAttribute('height', side);
    sq.setAttribute('y', 130 - side);
    const lenNote = q('[data-rf-len]');
    lenNote.setAttribute('x', 66 + len);
    lenNote.textContent = `×${formatNumber(k, 2)}`;
    const areaNote = q('[data-rf-area]');
    areaNote.textContent = `×${formatNumber(k * k, 2)}`;
    q('[data-rf-pct]').textContent = `${pct}%`;
    q('[data-rf-cap]').textContent = `${pct}%`;
    const to = from / k;
    const match = SCALES.find((s) => Math.abs(s.R - to) < 1e-9);
    const out = `${pct}% · 1:${formatNumber(from, 2)} → 1:${formatNumber(to, 2)}${match ? ` (${match.label})` : ''}`;
    q('[data-rf-out]').textContent = out;
    range.setAttribute('aria-valuetext', out);
  };
  range.addEventListener('input', draw);
}

// §6 / §7 figures: the controls redraw the figure with the same functions the builder used for the default state.
function paintFigure(fig, d) {
  fig.querySelector('[data-fig-svg]').innerHTML = d.svg;
  fig.querySelector('[data-fig-out]').textContent = d.out;
  fig.querySelector('[data-fig-cap]').textContent = d.caption;
}
function initFigureDemos() {
  const find = document.querySelector('[data-find-demo]');
  if (find) {
    const btns = [...find.querySelectorAll('[data-find-case]')];
    for (const b of btns) b.addEventListener('click', () => {
      for (const x of btns) x.setAttribute('aria-pressed', String(x === b));
      paintFigure(find, findFigure(b.dataset.findCase));
    });
  }
  const sheet = document.querySelector('[data-sheet-demo]');
  if (sheet) {
    const picks = [...document.querySelectorAll('[data-sheet-case]')];
    const pick = (b) => {
      for (const x of picks) x.setAttribute('aria-pressed', String(x === b));
      paintFigure(sheet, sheetFigure(Number(b.dataset.sheetCase)));
    };
    for (const b of picks) {
      b.addEventListener('click', () => pick(b));
      // The whole row is the target; the button in its head cell carries keyboard focus and state.
      b.closest('tr').addEventListener('click', (e) => { if (e.target !== b) pick(b); });
    }
  }
}

// Read more: content ships in the HTML as hidden="until-found", so find-in-page and text fragments still reach it.
function initMore() {
  for (const btn of document.querySelectorAll('.more-btn[aria-controls]')) {
    const box = $(btn.getAttribute('aria-controls'));
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Read less' : 'Read more';
      if (open) box.removeAttribute('hidden'); else box.setAttribute('hidden', 'until-found');
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    box.addEventListener('beforematch', () => set(true));
  }
}

init();
initModeLinks();
initPills();
initActions();
initTips();
initMore();
initRescaleDemo();
initFigureDemos();
