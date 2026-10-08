import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleBarSpec, scaleBarSvg } from '../assets/scalebar.js';
import { SCALES } from '../assets/scale.js';

test('picks round lengths that land near 4 inches or 100 mm on paper', () => {
  assert.deepEqual(scaleBarSpec(48), { length: 16, unit: 'FT', labels: [0, 4, 8, 16], paperMm: 101.6, system: 'imperial' });
  assert.equal(scaleBarSpec(96).length, 32);
  assert.deepEqual(scaleBarSpec(240).labels, [0, 20, 40, 80]);
  assert.deepEqual(scaleBarSpec(4), { length: 1, unit: 'IN', labels: [0, 3, 6, 12], paperMm: 76.2, system: 'imperial' });
  assert.deepEqual(scaleBarSpec(100, 'metric').labels, [0, 2.5, 5, 10]);
  assert.deepEqual(scaleBarSpec(1, 'metric'), { length: 0.1, unit: 'MM', labels: [0, 25, 50, 100], paperMm: 100, system: 'metric' });
});

test('every preset scale gets a bar between 35 and 155 mm long', () => {
  for (const s of SCALES) {
    const spec = scaleBarSpec(s.R, s.group === 'metric' ? 'metric' : 'imperial');
    assert.ok(spec, s.id);
    assert.ok(spec.paperMm >= 35 && spec.paperMm <= 155, `${s.id}: ${spec.paperMm}`);
  }
});

test('rejects invalid scale factors', () => {
  assert.equal(scaleBarSpec(0), null);
  assert.equal(scaleBarSpec(-5), null);
  assert.equal(scaleBarSpec(NaN), null);
  assert.equal(scaleBarSvg(null), '');
});

test('download SVG is sized in millimeters so it prints at true scale', () => {
  const svg = scaleBarSvg(scaleBarSpec(48), 'SCALE: 1/4" = 1\'-0"', { download: true });
  assert.match(svg, /width="113\.6mm" height="17mm"/);
  assert.match(svg, />16 FT</);
  assert.match(svg, /SCALE: 1\/4&quot; = 1'-0&quot;/);
  assert.doesNotMatch(svg, /currentColor|bar-accent/);
});

test('screen SVG is accessible and themeable', () => {
  const svg = scaleBarSvg(scaleBarSpec(100, 'metric'));
  assert.match(svg, /role="img" aria-label="Graphic scale, 0 to 10 m"/);
  assert.match(svg, /currentColor/);
  assert.match(svg, /class="bar-accent"/);
  assert.doesNotMatch(svg, /mm"/);
});
