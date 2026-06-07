import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/game.js';

// メモリ上の偽 storage(localStorage 互換の最小実装)
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

// 常に同じ問題(8+7)を返すように rng を固定したいが、makeProblem 経由なので
// addend 固定 + rng 固定で start を決定的にする。
const fixedRng = () => 0; // start は最小(=1)になる

test('maxNumber defaults to 30 and persists across instances', () => {
  const storage = fakeStorage();
  const g = createGame({ storage, rng: fixedRng });
  assert.equal(g.state.maxNumber, 30);
  g.setMax(100);
  assert.equal(g.state.maxNumber, 100);
  const g2 = createGame({ storage, rng: fixedRng });
  assert.equal(g2.state.maxNumber, 100);
});

test('newProblem keeps the goal within the configured range', () => {
  const highRng = () => 0.999999; // start を上限寄りにする
  const g = createGame({ storage: fakeStorage(), rng: highRng });
  g.setMax(20);
  g.setAddendChoice(9);
  g.newProblem();
  assert.ok(g.state.problem.goal <= 20, `goal ${g.state.problem.goal} should be <= 20`);
  assert.ok(g.state.problem.start >= 1);
});

test('new game starts the train at the problem start position', () => {
  const g = createGame({ storage: fakeStorage(), rng: fixedRng });
  g.setAddendChoice(7);
  g.newProblem();
  assert.equal(g.state.problem.addend, 7);
  assert.equal(g.state.trainPos, g.state.problem.start);
  assert.equal(g.state.stepsLeft, 7);
});

test('stepForward advances the train one cell and decrements stepsLeft', () => {
  const g = createGame({ storage: fakeStorage(), rng: fixedRng });
  g.setAddendChoice(7);
  g.newProblem();
  const start = g.state.problem.start;
  const r = g.stepForward();
  assert.equal(g.state.trainPos, start + 1);
  assert.equal(g.state.stepsLeft, 6);
  assert.equal(r.arrived, false);
});

test('stepForward the full addend reaches the goal and reports arrival', () => {
  const g = createGame({ storage: fakeStorage(), rng: fixedRng });
  g.setAddendChoice(7);
  g.newProblem();
  let r;
  for (let i = 0; i < 7; i++) r = g.stepForward();
  assert.equal(g.state.trainPos, g.state.problem.goal);
  assert.equal(r.arrived, true);
});

test('checkTap returns true only for the goal cell', () => {
  const g = createGame({ storage: fakeStorage(), rng: fixedRng });
  g.setAddendChoice(7);
  g.newProblem();
  const { goal } = g.state.problem;
  assert.equal(g.checkTap(goal), true);
  assert.equal(g.checkTap(goal + 1), false);
  assert.equal(g.checkTap(goal - 1), false);
});

test('recordCorrect grows the train and persists the length', () => {
  const storage = fakeStorage();
  const g = createGame({ storage, rng: fixedRng });
  assert.equal(g.state.trainLength, 0);
  g.recordCorrect();
  g.recordCorrect();
  assert.equal(g.state.trainLength, 2);
  // 再生成しても保存された長さが復元される
  const g2 = createGame({ storage, rng: fixedRng });
  assert.equal(g2.state.trainLength, 2);
});

test('settings (addendChoice, mode, soundOn) persist across instances', () => {
  const storage = fakeStorage();
  const g = createGame({ storage, rng: fixedRng });
  g.setAddendChoice('random');
  g.setMode('advanced');
  g.setSoundOn(false);
  const g2 = createGame({ storage, rng: fixedRng });
  assert.equal(g2.state.addendChoice, 'random');
  assert.equal(g2.state.mode, 'advanced');
  assert.equal(g2.state.soundOn, false);
});

test('resetTrain sets the train length back to zero and persists', () => {
  const storage = fakeStorage();
  const g = createGame({ storage, rng: fixedRng });
  g.recordCorrect();
  g.resetTrain();
  assert.equal(g.state.trainLength, 0);
  const g2 = createGame({ storage, rng: fixedRng });
  assert.equal(g2.state.trainLength, 0);
});
