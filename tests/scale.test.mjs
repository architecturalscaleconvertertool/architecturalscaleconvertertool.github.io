import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, SHEETS, parseScale, paperToReal, realToPaper, rescale, nearestScale, calibrate, autocadSettings, printOnSheet, equivalents } from '../assets/scale.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const R = (id) => SCALES.find((s) => s.id === id).R;

test('architectural scales match the Archtoolbox scale-factor table', () => {
  const expected = { '1/32in': 384, '1/16in': 192, '3/32in': 128, '1/8in': 96, '3/16in': 64, '1/4in': 48,
    '3/8in': 32, '1/2in': 24, '3/4in': 16, '1in': 12, '1-1/2in': 8, '3in': 4 };
  for (const [id, r] of Object.entries(expected)) close(R(id), r);
});

test('engineering and metric scales', () => {
  const eng = { 10: 120, 20: 240, 30: 360, 40: 480, 50: 600, 60: 720, 100: 1200, 200: 2400 };
  for (const [n, r] of Object.entries(eng)) close(R(`1in=${n}ft`), r);
  close(R('1:100'), 100);
  assert.equal(SCALES.length, 32);
  assert.equal(new Set(SCALES.map((s) => s.id)).size, 32);
});

test('parseScale reads presets and custom notation', () => {
  close(parseScale('1/4in'), 48);
  close(parseScale('1:75'), 75);
  close(parseScale('1 : 75'), 75);
  close(parseScale(`3/16" = 1'-0"`), 64);
  close(parseScale(`1-1/2" = 1'-0"`), 8);
  close(parseScale(`1" = 25'`), 300);
  close(parseScale('48'), 48);
  for (const bad of ['', 'abc', '0', '1:0', '0:5', `1" = `, '1=2=3', '-48']) {
    assert.equal(parseScale(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('mode A and B convert both ways', () => {
  close(paperToReal(2.5, 48), 120);
  close(realToPaper(120, 48), 2.5);
  assert.equal(paperToReal(2.5, 0), null);
  assert.equal(realToPaper(-1, 48), null);
});

test('mode C: 1/8" to 1/4" prints at 200%', () => {
  const r = rescale(96, 48);
  close(r.factor, 2);
  close(r.percent, 200);
  close(rescale(100, 50).percent, 200);
  assert.equal(rescale(0, 48), null);
});

test('mode D finds the nearest standard scale and reprint percentage', () => {
  // A 20' wall should be 5" at 1/4" = 1'-0" but measures 4 13/16": the print is at 96.25%.
  const r = calibrate(240, 4.8125, ['architectural']);
  assert.equal(r.nearest.id, '1/4in');
  close(r.R, 240 / 4.8125);
  close(r.printPercent, 96.25);
  close(r.reprintPercent, 240 / 4.8125 / 48 * 100);
  assert.equal(calibrate(240, 0), null);
  assert.equal(nearestScale(100, ['metric']).id, '1:100');
  assert.equal(nearestScale(48, []), null);
});

test('mode E AutoCAD values for 1/4" with 3/32" text', () => {
  const r = autocadSettings(48, 3 / 32);
  assert.equal(r.scaleFactor, 48);
  assert.equal(r.viewportXP, '1/48xp');
  assert.equal(r.dimscale, 48);
  close(r.modelTextInches, 4.5);
  assert.equal(autocadSettings(1200, 0.125).viewportXP, '1/1200xp');
  assert.equal(autocadSettings(48, 0), null);
});

test('mode E in feet drawing units avoids the 12x trap', () => {
  const r = autocadSettings(240, 0.1, 'ft');
  assert.equal(r.scaleFactor, 20);
  assert.equal(r.viewportXP, '1/20xp');
  assert.equal(r.dimscale, 20);
  close(r.modelTextValue, 2);
  close(r.modelTextInches, 24);
  close(autocadSettings(48, 3 / 32, 'in').modelTextValue, 4.5);
  close(autocadSettings(100, 2.5 / 25.4, 'mm').modelTextValue, 250);
  assert.equal(autocadSettings(48, 0.1, 'yd'), null);
});

test('sheet sizes follow ASME Y14.1 (ARCH, ANSI) and ISO 216 (A series)', () => {
  const S = (id) => SHEETS.find((s) => s.id === id);
  assert.deepEqual([S('arch-d').w, S('arch-d').h], [24, 36]);
  assert.deepEqual([S('arch-e1').w, S('arch-e1').h], [30, 42]);
  assert.deepEqual([S('ansi-b').w, S('ansi-b').h], [11, 17]);
  close(S('iso-a1').w, 594 / 25.4);
  close(S('iso-a1').h, 841 / 25.4);
  assert.equal(SHEETS.length, 16);
});

test('mode F: half-size set halves the scale exactly', () => {
  const r = printOnSheet(48, 'arch-d', 'arch-b', ['architectural']);
  close(r.percent, 50);
  close(r.R, 96);
  assert.equal(r.nearest.id, '1/8in');
  assert.equal(r.exact, true);
});

test('mode F: 24x36 on 11x17 fits at 45.83% and is not a standard scale', () => {
  const r = printOnSheet(48, 'arch-d', 'ansi-b', ['architectural']);
  close(r.percent, (11 / 24) * 100);
  close(r.R, 48 / (11 / 24));
  assert.equal(r.nearest.id, '1/8in');
  assert.equal(r.exact, false);
  assert.equal(printOnSheet(48, 'arch-d', 'nope'), null);
  assert.equal(printOnSheet(0, 'arch-d', 'arch-b'), null);
  // Without a group limit the closest scale to 1:104.7 is metric 1:100.
  assert.equal(printOnSheet(48, 'arch-d', 'ansi-b').nearest.id, '1:100');
});

test('equivalents lists nearby scales in the other systems', () => {
  const a = equivalents(48, 'architectural');
  assert.equal(a.ratio, 48);
  assert.equal(a.factor, 48);
  assert.deepEqual(Object.keys(a.nearest), ['engineering', 'metric']);
  assert.equal(a.nearest.engineering, null);
  assert.equal(a.nearest.metric.scale.id, '1:50');
  close(a.nearest.metric.percent, 4);
  assert.equal(a.nearest.metric.direction, 'smaller');
  const b = equivalents(96, 'architectural');
  assert.equal(b.nearest.metric.scale.id, '1:100');
  close(b.nearest.metric.percent, 4);
  assert.equal(b.nearest.metric.direction, 'smaller');
  assert.deepEqual(Object.keys(equivalents(48, null).nearest), ['architectural', 'engineering', 'metric']);
  assert.equal(equivalents(52, 'architectural').nearest.metric.direction, 'larger');
});
