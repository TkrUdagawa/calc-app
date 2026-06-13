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

// 音声認識(連結モードの回答用)。webkitSpeechRecognition の薄いラッパー。
// オンライン必須・マイク許可が必要。非対応環境は supported=false でタップにフォールバック。
export function createRecognizer({ lang = 'ja-JP' } = {}) {
  const Ctor = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  const supported = !!Ctor;
  let rec = null;
  let listening = false;

  function listen(onResult, onError) {
    if (!supported) { if (onError) onError('unsupported'); return; }
    if (listening) return;
    rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 5; // 幼児の発音に備え候補を多めに
    rec.continuous = false;
    listening = true;
    rec.onresult = (e) => {
      const res = e.results[0];
      const alts = [];
      for (let i = 0; i < res.length; i++) alts.push(res[i].transcript);
      if (onResult) onResult(alts);
    };
    rec.onerror = (e) => { if (onError) onError(e.error || 'error'); };
    rec.onend = () => { listening = false; };
    try { rec.start(); } catch (err) { listening = false; if (onError) onError('error'); }
  }

  function stop() {
    if (rec && listening) { try { rec.stop(); } catch (e) { /* noop */ } }
  }

  return { supported, listen, stop };
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

  // チャレンジ結果
  function speakResult(score, isRecord) {
    const head = isRecord ? 'しんきろく！ ' : '';
    speak(`${head}${score}もん！ すごい！`, { rate: 1, pitch: 1.3 });
  }

  // 連結モードの正解(車両なので「りょう」)
  function speakCoupleResult(sum) {
    speak(`${sum}りょう！ やったね！`, { rate: 1, pitch: 1.3 });
  }

  // ---- 効果音(Web Audio。ファイル不要・オフライン可) ----
  let audioCtx = null;
  function ensureAudio() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  // 正解音の再生がユーザー操作の少し後になるので、操作時に先に起こしておく。
  function unlockAudio() {
    try { ensureAudio(); } catch (e) { /* 非対応でも無音で続行 */ }
  }
  function tone(ctx, freq, start, dur, peak = 0.25) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
  // 「ピンポーン」: 高い音 → やや低い音(ドアベル風の下降2音)
  function chimeCorrect() {
    if (!enabled()) return;
    try {
      const ctx = ensureAudio();
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(ctx, 1318.5, t, 0.16);        // ピン(E6)
      tone(ctx, 1046.5, t + 0.14, 0.5);  // ポーン(C6、長め)
    } catch (e) {
      /* 非対応でも無音で続行 */
    }
  }

  return {
    cancel, speakProblem, speakStep, speakCorrect, speakTryAgain, speakDeparture, speakResult,
    speakCoupleResult, chimeCorrect, unlockAudio,
  };
}
