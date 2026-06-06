// 状態管理: 現在の問題・電車位置・モード・編成長・設定を保持し、
// 進む/正誤判定/正解記録などの遷移を提供する。
// DOM や localStorage には直接触れず、storage を注入して永続化する(テスト容易性)。

import { makeProblem } from './problem.js';
import { MAX } from './board.js';

const KEYS = {
  trainLength: 'td.trainLength',
  addendChoice: 'td.addendChoice',
  mode: 'td.mode',
  soundOn: 'td.soundOn',
};

/**
 * ゲーム状態を生成する。
 * @param {object} deps
 * @param {Storage} deps.storage  localStorage 互換(getItem/setItem)
 * @param {() => number} [deps.rng] 乱数源(出題用)
 */
export function createGame({ storage, rng = Math.random } = {}) {
  const load = (key, fallback) => {
    const v = storage.getItem(key);
    return v === null ? fallback : v;
  };

  const state = {
    problem: null,        // { start, addend, goal }
    trainPos: null,       // 電車が今いるマスの数
    stepsLeft: 0,         // 初級モードであと何回進めばゴールか
    trainLength: Number(load(KEYS.trainLength, 0)),
    addendChoice: parseAddend(load(KEYS.addendChoice, 'random')),
    mode: load(KEYS.mode, 'beginner'),         // 'beginner' | 'advanced'
    soundOn: load(KEYS.soundOn, 'true') === 'true',
  };

  // 'random' はそのまま、それ以外は数値の足す数として解釈する
  function parseAddend(v) {
    const s = String(v);
    return s === 'random' ? 'random' : Number(s);
  }

  function newProblem() {
    const p = makeProblem({ addend: state.addendChoice, max: MAX, rng });
    state.problem = p;
    state.trainPos = p.start;
    state.stepsLeft = p.addend;
    return p;
  }

  function stepForward() {
    if (state.stepsLeft <= 0) return { pos: state.trainPos, arrived: true };
    state.trainPos += 1;
    state.stepsLeft -= 1;
    return { pos: state.trainPos, arrived: state.stepsLeft === 0 };
  }

  function checkTap(n) {
    return n === state.problem.goal;
  }

  function recordCorrect() {
    state.trainLength += 1;
    storage.setItem(KEYS.trainLength, state.trainLength);
    return state.trainLength;
  }

  function resetTrain() {
    state.trainLength = 0;
    storage.setItem(KEYS.trainLength, 0);
  }

  function setAddendChoice(choice) {
    state.addendChoice = choice === 'random' ? 'random' : Number(choice);
    storage.setItem(KEYS.addendChoice, String(state.addendChoice));
  }

  function setMode(mode) {
    state.mode = mode;
    storage.setItem(KEYS.mode, mode);
  }

  function setSoundOn(on) {
    state.soundOn = !!on;
    storage.setItem(KEYS.soundOn, String(state.soundOn));
  }

  return {
    state,
    newProblem,
    stepForward,
    checkTap,
    recordCorrect,
    resetTrain,
    setAddendChoice,
    setMode,
    setSoundOn,
  };
}
