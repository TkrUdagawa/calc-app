// 盤面モデル: 数(上限は可変。game の maxNumber)を 10 列のグリッドに配置する純粋関数群。
// 「折り返し」はレイアウト(列が 10 を超えると次の行へ)で表現され、
// 数値そのものは連番なので stepPath は単純な連番列になる。

// 列数。styles.css の .board の grid-template-columns: repeat(10, ...) と必ず一致させること
// (rowOf/colOf の計算と実際の見た目の折り返しが揃う前提)。
const COLS = 10;

/** 数 n が何段目か(1始まり)。例: 11 → 2 */
export function rowOf(n) {
  return Math.ceil(n / COLS);
}

/** 数 n が何列目か(1始まり)。例: 11 → 1, 15 → 5 */
export function colOf(n) {
  return ((n - 1) % COLS) + 1;
}

/** start から addend だけ進むときに通過する各マスの配列。
 *  例: stepPath(8, 7) → [9,10,11,12,13,14,15] */
export function stepPath(start, addend) {
  const path = [];
  for (let i = 1; i <= addend; i++) {
    path.push(start + i);
  }
  return path;
}
