// 出題生成: 足す数(固定 or おまかせ)と上限から1問を作る純粋関数。
// rng は [0,1) を返す関数で、テスト容易性のため注入する(既定は Math.random)。

/** min..max(両端含む)の整数を rng から得る */
function randInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * 1問を生成する。
 * @param {object} opts
 * @param {number|'random'} opts.addend  足す数。'random' なら 1〜addendMax から選ぶ
 * @param {number} [opts.max=30]          盤面の上限(goal がこれを超えない)
 * @param {number} [opts.addendMax=9]     'random' のときの足す数の上限(おまかせの難易度)
 * @param {() => number} [opts.rng]       乱数源
 * @returns {{start:number, addend:number, goal:number}}
 */
export function makeProblem({ addend, max = 30, addendMax = 9, rng = Math.random } = {}) {
  const a = addend === 'random' ? randInt(1, addendMax, rng) : addend;
  // start は 1..(max - a) の範囲。これで goal = start + a が max を超えない。
  const start = randInt(1, max - a, rng);
  return { start, addend: a, goal: start + a };
}

/**
 * 連結モードの出題。1桁 + 1桁(両方 1〜9)。
 * @returns {{a:number, b:number, sum:number}}
 */
export function makeCouplingProblem({ rng = Math.random } = {}) {
  const a = randInt(1, 9, rng);
  const b = randInt(1, 9, rng);
  return { a, b, sum: a + b };
}
