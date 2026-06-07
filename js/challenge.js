// チャレンジの状態機械(純粋ロジック)。スコア・連続/とけた数・終了判定・ベスト記録を扱う。
// 60秒の経過(時間管理)は UI 側の責務で、ここには持ち込まない。
// 永続化は storage を注入(game.js と同じパターン)。

const KEYS = {
  streak: 'td.best.streak',
  time: 'td.best.time',
};

export function createChallenge({ storage } = {}) {
  const loadBest = (type) => Number(storage.getItem(KEYS[type])) || 0;

  const state = {
    type: null,        // 'streak' | 'time'
    active: false,
    score: 0,
    finished: false,
    isRecord: false,
    best: { streak: loadBest('streak'), time: loadBest('time') },
  };

  function start(type) {
    state.type = type;
    state.active = true;
    state.finished = false;
    state.isRecord = false;
    state.score = 0;
  }

  // 正解。両モードとも score を増やす。
  function correct() {
    if (!state.active) return;
    state.score += 1;
  }

  // 不正解。連続モードは即終了、タイムは無視(やりなおし)。
  function wrong() {
    if (!state.active) return;
    if (state.type === 'streak') finish();
  }

  // 終了して結果を確定し、必要ならベストを更新する。
  function finish() {
    if (!state.active) return { score: state.score, isRecord: false };
    state.active = false;
    state.finished = true;
    if (state.score > state.best[state.type]) {
      state.best[state.type] = state.score;
      storage.setItem(KEYS[state.type], state.score);
      state.isRecord = true;
    }
    return { type: state.type, score: state.score, isRecord: state.isRecord };
  }

  return { state, start, correct, wrong, finish };
}
