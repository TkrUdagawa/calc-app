import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowOf, colOf, stepPath } from '../js/board.js';

test('rowOf maps numbers to their row (1-indexed, 10 per row)', () => {
  assert.equal(rowOf(1), 1);
  assert.equal(rowOf(10), 1);
  assert.equal(rowOf(11), 2);
  assert.equal(rowOf(20), 2);
  assert.equal(rowOf(21), 3);
  assert.equal(rowOf(30), 3);
});

test('colOf maps numbers to their column (1-indexed)', () => {
  assert.equal(colOf(1), 1);
  assert.equal(colOf(8), 8);
  assert.equal(colOf(10), 10);
  assert.equal(colOf(11), 1);
  assert.equal(colOf(15), 5);
  assert.equal(colOf(20), 10);
  assert.equal(colOf(21), 1);
});

test('stepPath returns each cell visited from start to start+addend', () => {
  // 8 + 7 = 15: visits 9,10 then wraps to 11,12,13,14,15
  assert.deepEqual(stepPath(8, 7), [9, 10, 11, 12, 13, 14, 15]);
});

test('stepPath for a single step', () => {
  assert.deepEqual(stepPath(5, 1), [6]);
});

test('stepPath stays on one row when no wrap occurs', () => {
  assert.deepEqual(stepPath(1, 3), [2, 3, 4]);
});

test('stepPath crossing two row boundaries (10->11 and 20->21)', () => {
  // 9 + 13 would exceed 30; use 18 + 5 crossing 20->21
  assert.deepEqual(stepPath(18, 5), [19, 20, 21, 22, 23]);
});
