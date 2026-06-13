// 音声認識の文字列を整数に変換する純粋関数。
// 数字(半角/全角)を優先し、無ければ日本語の数の読み(ひらがな/漢数字)を 0〜99 で解釈する。

// 1の位(漢数字・ひらがなの読みの揺れも含む)
const UNIT = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  'いち': 1, 'に': 2, 'さん': 3, 'し': 4, 'よん': 4, 'ご': 5, 'ろく': 6,
  'しち': 7, 'なな': 7, 'はち': 8, 'きゅう': 9, 'く': 9,
  'ぜろ': 0, 'れい': 0, '零': 0, 'まる': 0,
};
// 長いキーから先に照合する(「しち」を「し」より優先)
const UNIT_KEYS = Object.keys(UNIT).sort((a, b) => b.length - a.length);
const TENS = ['じゅう', 'じゅっ', '十'];

function parseJa(s) {
  s = s.replace(/\s/g, '');
  let total = 0;
  let current = 0;
  let matched = false;
  let i = 0;
  while (i < s.length) {
    // 十の位
    const ten = TENS.find((t) => s.startsWith(t, i));
    if (ten) {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
      i += ten.length;
      matched = true;
      continue;
    }
    // 1の位(最長一致)
    const key = UNIT_KEYS.find((k) => s.startsWith(k, i));
    if (key) {
      current = UNIT[key];
      i += key.length;
      matched = true;
      continue;
    }
    i += 1; // 数と無関係な文字(りょう・だよ 等)は読み飛ばす
  }
  return matched ? total + current : null;
}

/** 認識テキストを整数に。数として読めなければ null。 */
export function parseSpokenNumber(text) {
  if (!text) return null;
  // 全角数字 → 半角
  const s = String(text).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const digits = s.match(/\d+/);
  if (digits) {
    const n = parseInt(digits[0], 10);
    return Number.isFinite(n) ? n : null;
  }
  return parseJa(s);
}
