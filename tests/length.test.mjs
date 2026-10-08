import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLength, formatFeetInches, formatLength } from '../assets/scale.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('parseLength accepts spec input forms', () => {
  close(parseLength(`12'-6 3/4"`), 150.75);
  close(parseLength(`12' 6.75"`), 150.75);
  close(parseLength('150.75"'), 150.75);
  close(parseLength('3.81 m'), 150);
  close(parseLength('3810 mm'), 150);
  close(parseLength('381 cm'), 150);
  close(parseLength('12′-6 3/4″'), 150.75);
  close(parseLength('12 ft 6 in'), 150);
  close(parseLength(`12'`), 144);
  close(parseLength('3/4"'), 0.75);
  close(parseLength(`6-1/2"`), 6.5);
  close(parseLength(`12''`), 12);
});

test('parseLength rejects invalid input', () => {
  for (const bad of ['', 'abc', '"', `-6"`, '-3 m', '1/0"', '3,81 m', `12'-6 3/4" x`, '5 kg']) {
    assert.equal(parseLength(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('missing space reads 63/4 as a fraction, not 6 3/4', () => {
  close(parseLength('63/4"'), 15.75);
});

test('unitless numbers use the selected default unit', () => {
  close(parseLength('12'), 12);
  close(parseLength('12', 'ft'), 144);
  close(parseLength('254', 'mm'), 10);
  assert.equal(parseLength('12', 'yd'), null);
});

test('thousands separators are accepted', () => {
  close(parseLength('1,200 mm'), 1200 / 25.4);
});

test('formatFeetInches rounds and reduces fractions', () => {
  assert.equal(formatFeetInches(150.75), `12'-6 3/4"`);
  assert.equal(formatFeetInches(144), `12'-0"`);
  assert.equal(formatFeetInches(0.75), '3/4"');
  assert.equal(formatFeetInches(0), '0"');
  assert.equal(formatFeetInches(144.03125, 16), `12'-0 1/16"`);
  assert.equal(formatFeetInches(144.03125, 32), `12'-0 1/32"`);
  assert.equal(formatFeetInches(10.1, 8), '10 1/8"');
});

test('rounding carries into the next foot', () => {
  assert.equal(formatFeetInches(11.999), `1'-0"`);
  assert.equal(formatFeetInches(23.98), `2'-0"`);
});

test('formatLength returns every display unit', () => {
  assert.deepEqual(formatLength(150), {
    feetInches: `12'-6"`, feet: '12.5 ft', inches: '150 in', mm: '3,810 mm', m: '3.81 m',
  });
});
