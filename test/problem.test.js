import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProblem } from '../js/problem.js';

// rng は [0,1) を返す関数。テストでは固定値を注入して決定的に検証する。
const constRng = (v) => () => v;

test('makeProblem with a fixed addend keeps that addend', () => {
  const p = makeProblem({ addend: 7, max: 30, rng: constRng(0) });
  assert.equal(p.addend, 7);
});

test('makeProblem computes goal = start + addend', () => {
  const p = makeProblem({ addend: 7, max: 30, rng: constRng(0) });
  assert.equal(p.goal, p.start + p.addend);
});

test('makeProblem keeps goal within the board (start + addend <= max)', () => {
  // rng=0.999... pushes start to its maximum
  const p = makeProblem({ addend: 7, max: 30, rng: constRng(0.999999) });
  assert.ok(p.start + p.addend <= 30, `goal ${p.goal} should be <= 30`);
  assert.ok(p.start >= 1, 'start should be >= 1');
});

test('makeProblem start is at least 1 even at rng=0', () => {
  const p = makeProblem({ addend: 9, max: 30, rng: constRng(0) });
  assert.equal(p.start, 1);
});

test('makeProblem with "random" addend picks an addend in 1..9', () => {
  // first rng call selects addend, second selects start
  let calls = 0;
  const rng = () => (calls++ === 0 ? 0 : 0); // addend -> 1, start -> 1
  const p = makeProblem({ addend: 'random', max: 30, rng });
  assert.ok(p.addend >= 1 && p.addend <= 9);
});

test('makeProblem random addend at rng~1 picks addend 9', () => {
  const p = makeProblem({ addend: 'random', max: 30, rng: constRng(0.999999) });
  assert.equal(p.addend, 9);
});

test('makeProblem "random" respects an addendMax cap', () => {
  const p = makeProblem({ addend: 'random', max: 30, addendMax: 7, rng: constRng(0.999999) });
  assert.equal(p.addend, 7);
  for (let i = 0; i < 300; i++) {
    const q = makeProblem({ addend: 'random', max: 30, addendMax: 7, rng: Math.random });
    assert.ok(q.addend >= 1 && q.addend <= 7, `addend ${q.addend} out of 1..7`);
  }
});

test('makeProblem always produces valid problems across many random draws', () => {
  for (let i = 0; i < 500; i++) {
    const p = makeProblem({ addend: 'random', max: 30, rng: Math.random });
    assert.ok(p.addend >= 1 && p.addend <= 9, `addend ${p.addend} out of range`);
    assert.ok(p.start >= 1, `start ${p.start} < 1`);
    assert.ok(p.goal <= 30, `goal ${p.goal} > 30`);
    assert.equal(p.goal, p.start + p.addend);
  }
});
