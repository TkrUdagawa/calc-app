import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge } from '../js/challenge.js';

// game.test.js と同じメモリ storage
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('new challenge is inactive with zero bests', () => {
  const c = createChallenge({ storage: fakeStorage() });
  assert.equal(c.state.active, false);
  assert.equal(c.state.best.streak, 0);
  assert.equal(c.state.best.time, 0);
});

test('start activates the chosen type and resets score', () => {
  const c = createChallenge({ storage: fakeStorage() });
  c.start('streak');
  assert.equal(c.state.active, true);
  assert.equal(c.state.type, 'streak');
  assert.equal(c.state.score, 0);
  assert.equal(c.state.finished, false);
});

test('streak: correct increments, first wrong finishes and keeps the score', () => {
  const c = createChallenge({ storage: fakeStorage() });
  c.start('streak');
  c.correct(); c.correct(); c.correct();
  assert.equal(c.state.score, 3);
  c.wrong();
  assert.equal(c.state.finished, true);
  assert.equal(c.state.active, false);
  assert.equal(c.state.score, 3);
});

test('time: wrong is ignored (keeps going), correct counts', () => {
  const c = createChallenge({ storage: fakeStorage() });
  c.start('time');
  c.correct();
  c.wrong(); // やりなおし: 無視
  c.correct();
  assert.equal(c.state.active, true);
  assert.equal(c.state.score, 2);
});

test('correct does nothing once finished/inactive', () => {
  const c = createChallenge({ storage: fakeStorage() });
  c.start('streak');
  c.correct();
  c.finish();
  c.correct(); // 終了後は無視
  assert.equal(c.state.score, 1);
});

test('finish updates best and flags a new record, persisted across instances', () => {
  const storage = fakeStorage();
  const c = createChallenge({ storage });
  c.start('streak');
  c.correct(); c.correct();
  const r = c.finish();
  assert.equal(r.score, 2);
  assert.equal(c.state.isRecord, true);
  assert.equal(c.state.best.streak, 2);

  const c2 = createChallenge({ storage });
  assert.equal(c2.state.best.streak, 2);
});

test('finish with a lower score does not beat the best and is not a record', () => {
  const storage = fakeStorage({ 'td.best.streak': '5' });
  const c = createChallenge({ storage });
  c.start('streak');
  c.correct(); c.correct(); // score 2 < best 5
  c.finish();
  assert.equal(c.state.isRecord, false);
  assert.equal(c.state.best.streak, 5);
});

test('bests are tracked separately per type', () => {
  const storage = fakeStorage();
  const c = createChallenge({ storage });
  c.start('time');
  c.correct(); c.correct(); c.correct();
  c.finish();
  assert.equal(c.state.best.time, 3);
  assert.equal(c.state.best.streak, 0);
});
