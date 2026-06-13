import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpokenNumber } from '../js/numwords.js';

test('parses half-width and full-width digits', () => {
  assert.equal(parseSpokenNumber('13'), 13);
  assert.equal(parseSpokenNumber('１８'), 18);
  assert.equal(parseSpokenNumber('5'), 5);
});

test('parses hiragana number words', () => {
  assert.equal(parseSpokenNumber('ご'), 5);
  assert.equal(parseSpokenNumber('じゅう'), 10);
  assert.equal(parseSpokenNumber('じゅうさん'), 13);
  assert.equal(parseSpokenNumber('じゅう さん'), 13); // スペース入り
  assert.equal(parseSpokenNumber('じゅうはち'), 18);
  assert.equal(parseSpokenNumber('にじゅう'), 20);
  assert.equal(parseSpokenNumber('にじゅうさん'), 23);
});

test('parses kanji numerals', () => {
  assert.equal(parseSpokenNumber('十三'), 13);
  assert.equal(parseSpokenNumber('七'), 7);
  assert.equal(parseSpokenNumber('二十'), 20);
});

test('accepts reading variants for the same number', () => {
  assert.equal(parseSpokenNumber('なな'), 7);
  assert.equal(parseSpokenNumber('しち'), 7);
  assert.equal(parseSpokenNumber('よん'), 4);
  assert.equal(parseSpokenNumber('し'), 4);
  assert.equal(parseSpokenNumber('きゅう'), 9);
  assert.equal(parseSpokenNumber('ぜろ'), 0);
});

test('ignores trailing words like りょう / だよ', () => {
  assert.equal(parseSpokenNumber('13りょう'), 13);
  assert.equal(parseSpokenNumber('じゅうさんりょう'), 13);
  assert.equal(parseSpokenNumber('はちだよ'), 8);
});

test('returns null when no number is found', () => {
  assert.equal(parseSpokenNumber('あいうえお'), null);
  assert.equal(parseSpokenNumber(''), null);
  assert.equal(parseSpokenNumber(undefined), null);
});

test('covers the coupling-mode answer range 2..18', () => {
  const yomi = ['に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう',
    'じゅう', 'じゅういち', 'じゅうに', 'じゅうさん', 'じゅうよん', 'じゅうご',
    'じゅうろく', 'じゅうなな', 'じゅうはち'];
  yomi.forEach((w, i) => assert.equal(parseSpokenNumber(w), i + 2, `${w} → ${i + 2}`));
});
