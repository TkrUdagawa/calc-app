// 音声読み上げ: Web 標準の SpeechSynthesis を ja-JP で使う薄いラッパー。
// 非対応環境では無音で動作継続する(フォールバック)。

const NUM_WORDS = [
  'ゼロ', 'いち', 'に', 'さん', 'し', 'ご',
  'ろく', 'なな', 'はち', 'きゅう', 'じゅう',
];

/** 0〜10 はひらがな読み、それ以外は数字のまま読ませる */
function numToYomi(n) {
  return NUM_WORDS[n] ?? String(n);
}

export function createSpeech({ enabled = () => true } = {}) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const supported = !!synth;
  let jaVoice = null;

  function pickVoice() {
    if (!supported) return;
    const voices = synth.getVoices();
    jaVoice =
      voices.find((v) => v.lang === 'ja-JP') ||
      voices.find((v) => v.lang && v.lang.startsWith('ja')) ||
      null;
  }
  if (supported) {
    pickVoice();
    // 音声リストは非同期に揃うことがある
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = pickVoice;
    }
  }

  function speak(text, { rate = 1, pitch = 1.1 } = {}) {
    if (!supported || !enabled()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.rate = rate;
    u.pitch = pitch;
    synth.cancel(); // 連続発話の重なりを防ぐ
    synth.speak(u);
  }

  function cancel() {
    if (supported) synth.cancel();
  }

  // 出題: 「<start> たす <addend> は?」
  // 助詞の「は」は音声合成だと「ha」と読まれてしまうため、読み用には「わ」を渡す。
  function speakProblem(start, addend) {
    speak(`${start} たす ${addend} わ？`, { rate: 0.95 });
  }

  // 初級で進むたびに「歩数」を数える(量の実感を優先)
  function speakStep(step) {
    speak(numToYomi(step), { rate: 1.1 });
  }

  // 正解: 「<goal>! やったね!」
  function speakCorrect(goal) {
    speak(`${goal}！ やったね！`, { rate: 1, pitch: 1.3 });
  }

  // 不正解: やさしい促し
  function speakTryAgain() {
    speak('もういちど、かぞえてみよう', { rate: 0.95 });
  }

  // 10両そろって出発するとき
  function speakDeparture() {
    speak('でんしゃ かんせい！ しゅっぱつ しんこう！', { rate: 1, pitch: 1.3 });
  }

  return { cancel, speakProblem, speakStep, speakCorrect, speakTryAgain, speakDeparture };
}
