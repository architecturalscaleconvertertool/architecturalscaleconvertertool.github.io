import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, encodeState, decodeState, modeFromHash, hasState, MODE_SLUGS } from '../assets/state.js';

test('round-trips the spec example', () => {
  const qs = encodeState('A', { scale: '1/4in', v: '2.5in' });
  assert.equal(qs, '#mode=A&scale=1%2F4in&v=2.5in');
  assert.deepEqual(decodeState(qs), { mode: 'A', fields: { scale: '1/4in', v: '2.5in' } });
});

test('feet-inch values with quotes survive the URL', () => {
  const qs = encodeState('B', { scale: '1/8in', v: `12'-6 3/4"` });
  assert.equal(decodeState(qs).fields.v, `12'-6 3/4"`);
});

test('drops fields that do not belong to the mode and empty values', () => {
  assert.equal(encodeState('C', { from: '1/8in', to: '1/4in', v: '3in' }), '#mode=C&from=1%2F8in&to=1%2F4in');
  assert.equal(encodeState('A', { scale: '1/4in', v: '  ' }), '#mode=A&scale=1%2F4in');
  assert.equal(encodeState('Z', { scale: '1/4in' }), '');
});

test('garbage query falls back to mode A without throwing', () => {
  assert.deepEqual(decodeState('?mode=Z&v=abc'), { mode: 'A', fields: { v: 'abc' } });
  assert.deepEqual(decodeState(''), { mode: 'A', fields: {} });
  assert.deepEqual(decodeState(undefined), { mode: 'A', fields: {} });
  assert.deepEqual(decodeState(`?mode=e&scale=${'9'.repeat(41)}`), { mode: 'E', fields: {} });
});

test('mode F keeps scale and both sheet ids', () => {
  const qs = encodeState('F', { scale: '1/4in', sheet: 'arch-d', target: 'ansi-b' });
  assert.deepEqual(decodeState(qs), { mode: 'F', fields: { scale: '1/4in', sheet: 'arch-d', target: 'ansi-b' } });
});

test('encode returns a fragment with no query marker', () => {
  assert.ok(!encodeState('A', { scale: '1/4in', v: '2in' }).includes('?'));
  assert.deepEqual(decodeState('mode=B&v=3in'), { mode: 'B', fields: { v: '3in' } });
});

test('decodes a legacy ?mode= link', () => {
  assert.deepEqual(decodeState('?mode=A&scale=1%2F4in&v=2.5in'), { mode: 'A', fields: { scale: '1/4in', v: '2.5in' } });
  assert.equal(hasState('?mode=D'), true);
  assert.equal(hasState('#converter'), false);
  assert.equal(hasState(''), false);
});

test('modeFromHash maps the six slugs and ignores other hashes', () => {
  const expected = { '#drawing-to-real': 'A', '#real-to-drawing': 'B', '#rescale': 'C', '#find-scale': 'D', '#autocad': 'E', '#print': 'F' };
  for (const [hash, mode] of Object.entries(expected)) assert.equal(modeFromHash(hash), mode);
  assert.equal(Object.keys(MODE_SLUGS).length, 6);
  for (const hash of ['#converter', '#faq-what', '#mode=A', '', '#', undefined, '#constructor']) assert.equal(modeFromHash(hash), null);
});

test('precision round-trips; default 16 is omitted; junk is dropped', () => {
  for (const mode of Object.keys(MODES)) {
    assert.equal(decodeState(encodeState(mode, { precision: '32' })).fields.precision, '32');
    assert.equal(decodeState(encodeState(mode, { precision: 8 })).fields.precision, '8');
  }
  assert.equal(encodeState('A', { precision: '16' }), '#mode=A');
  assert.equal(decodeState('#mode=A&precision=64').fields.precision, undefined);
  assert.equal(decodeState('#mode=A&precision=abc').fields.precision, undefined);
  assert.equal(encodeState('A', { precision: '99' }), '#mode=A');
});
