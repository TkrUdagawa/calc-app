// 表示層: 盤面の描画、電車の移動アニメーション、モード別の操作、
// 正解演出、設定オーバーレイを結線する。game と speech に依存する。

import { LINES, getLine, stationCode, stationName, stationYomi } from './lines.js';
import { makeCouplingProblem } from './problem.js';
import { parseSpokenNumber } from './numwords.js';

const STEP_MS = 340; // 電車アニメーションの所要時間(CSS の .train transition と合わせる)

// 60びょうチャレンジ: 1問あたりの速度(難易度=おまかせ上限ごと)。難しいほど速い。
const KMH_PER_PROBLEM = { 5: 10, 7: 15, 9: 20 };

// 速度から電車のランク(速いほど上位)
function trainClass(kmh) {
  if (kmh >= 200) return { emoji: '🚅', name: 'しんかんせん' };
  if (kmh >= 120) return { emoji: '🚄', name: 'とっきゅう' };
  if (kmh >= 60) return { emoji: '🚆', name: 'きゅうこう' };
  if (kmh >= 1) return { emoji: '🚃', name: 'ふつうでんしゃ' };
  return { emoji: '🚃', name: '' };
}

// 漢字 + ふりがな(ルビ)の HTML。yomi が無くても崩れない。
const rubyHtml = (name, yomi, cls = '') =>
  `<ruby${cls ? ` class="${cls}"` : ''}>${name}<rt>${yomi || ''}</rt></ruby>`;

export function createUI({ game, speech, challenge, recog }) {
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const boardWrap = boardEl.parentElement;
  const trainEl = $('train');
  // 毎回参照する固定要素はキャッシュしておく
  const stripEl = $('train-strip');
  const rewardCountEl = $('reward-count');
  const stationBarEl = $('station-bar');
  const rewardEl = document.querySelector('.reward');
  const hudEl = $('challenge-hud');
  const hudScoreEl = $('hud-score');
  const hudTimerEl = $('hud-timer');
  const lineTrackEl = $('line-track');
  const streakNowEl = $('streak-now');
  // 連続モードの駅すすみは常に京浜東北線(路線モードの選択とは独立)
  const KEIHIN = getLine('keihin');
  const TERMINUS = KEIHIN.stations.length; // 47(大船)
  const streakStops = {}; // 駅番号 -> .stop 要素

  // 現在選択中の路線('normal' のときはテーマ変更なし)
  const currentLine = () => getLine(game.state.lineId);
  // 完成両数(この両数つながると出発)。路線ごとに異なる。
  const completionCars = () => currentLine().cars;
  // チャレンジ中は強制的にタップ回答(advanced)になる
  const effectiveMode = () => (challenge.state.active ? 'advanced' : game.state.mode);
  let timerId = null; // 60びょうチャレンジのカウントダウン
  let timeLeft = 0;
  let challengeMax = 9; // チャレンジの難易度(おまかせ上限 5/7/9)
  let coupleProblem = null; // 連結モードの現在の問題 {a,b,sum}
  let coupleBusy = false;   // 連結アニメ中の入力ロック
  // 車両は内側のラッパーにまとめ、出発時はこれごと右へ走らせる
  const carsEl = document.createElement('div');
  carsEl.className = 'train-cars';
  stripEl.appendChild(carsEl);
  const cells = {}; // 数 -> セル要素
  let busy = false; // アニメーション/判定中の入力ロック

  // ---- 盤面の生成(はんいに応じて作り直す。列は常に10) ----
  function buildBoard() {
    boardEl.innerHTML = '';
    for (const k in cells) delete cells[k];
    for (let n = 1; n <= game.state.maxNumber; n++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.n = String(n);
      cell.textContent = String(n);
      cell.addEventListener('click', () => onCellTap(n));
      boardEl.appendChild(cell);
      cells[n] = cell;
    }
  }

  // ---- 電車の位置決め ----
  function moveTrainTo(n, animate = true) {
    const cell = cells[n];
    if (!cell) return;
    updateStationBar(n); // 電車のいる駅を上部バーへ
    const wrap = boardWrap.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const x = c.left - wrap.left + c.width / 2 - trainEl.offsetWidth / 2;
    const y = c.top - wrap.top + c.height / 2 - trainEl.offsetHeight / 2;
    if (!animate) {
      const prev = trainEl.style.transition;
      trainEl.style.transition = 'none';
      trainEl.style.transform = `translate(${x}px, ${y}px)`;
      // 強制リフロー後にトランジションを戻す
      void trainEl.offsetWidth;
      trainEl.style.transition = prev;
    } else {
      trainEl.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // ---- 問題表示 ----
  function renderProblem() {
    const { start, addend } = game.state.problem;
    $('p-start').textContent = start;
    $('p-addend').textContent = addend;
    $('p-goal').textContent = '？';
    // セルの装飾をリセットしてスタートを強調
    for (const n in cells) {
      cells[n].classList.remove('start', 'right', 'wrong');
    }
    cells[start].classList.add('start');
    renderStepsLeft();
  }

  function renderStepsLeft() {
    if (effectiveMode() !== 'beginner') {
      $('steps-left').textContent = '';
      return;
    }
    $('steps-left').textContent = '●'.repeat(game.state.stepsLeft);
  }

  // ---- 車両の見た目 ----
  // 路線色の CSS 車両(em 基準なので親の font-size に応じて拡縮する)。
  function lineCarSpan(line, isEngine) {
    const s = document.createElement('span');
    s.className = 'line-car' + (isEngine ? ' is-engine' : '');
    s.style.setProperty('--car-body', line.body);
    s.style.setProperty('--car-band', line.band);
    return s;
  }
  // 1両ぶんの中身を作る。ノーマルは絵文字、路線モードは色つき CSS 車両。
  function makeCar(isEngine) {
    const car = document.createElement('span');
    car.className = 'car';
    const line = currentLine();
    if (line.color) car.appendChild(lineCarSpan(line, isEngine));
    else car.textContent = isEngine ? '🚂' : '🚃';
    return car;
  }

  // ---- ごほうび編成 ----
  function updateRewardCount() {
    rewardCountEl.textContent = `せいかい ${game.state.trainLength}かい`;
  }

  // いま見えている車両数。完成両数ごとに出発するので 0〜(両数-1) を循環する。
  function visibleCars() {
    return game.state.trainLength % completionCars();
  }

  // 全再構築は初期表示・リセット・出発後・路線変更時のみ(毎正解では append)。
  function renderTrainStrip() {
    carsEl.innerHTML = '';
    carsEl.appendChild(makeCar(true)); // 先頭(機関車)
    for (let i = 0; i < visibleCars(); i++) carsEl.appendChild(makeCar(false));
    updateRewardCount();
    stripEl.scrollLeft = stripEl.scrollWidth;
  }

  // 正解時に1両だけ連結する(O(1))。追加した要素を返す。
  function appendCar() {
    const car = makeCar(false);
    carsEl.appendChild(car);
    updateRewardCount();
    stripEl.scrollLeft = stripEl.scrollWidth;
    return car;
  }

  // 盤面の電車の見た目を現在の路線に合わせる。
  function renderBoardTrain() {
    const line = currentLine();
    trainEl.textContent = '';
    if (line.color) trainEl.appendChild(lineCarSpan(line, false));
    else trainEl.textContent = '🚃';
  }

  // ---- 路線モード: 駅ラベル・現在駅・テーマ ----
  // 各マスに数字(＋路線モードなら駅ナンバー/駅名)を描く。
  function decorateCells() {
    const line = currentLine();
    for (let n = 1; n <= game.state.maxNumber; n++) {
      const cell = cells[n];
      const code = stationCode(line, n);
      const name = stationName(line, n);
      const yomi = stationYomi(line, n);
      let html = `<span class="cell-num">${n}</span>`;
      if (line.color && (code || name)) {
        if (code) html += `<span class="cell-code">${code}</span>`;
        if (name) html += rubyHtml(name, yomi, 'cell-name');
        cell.classList.add('has-station');
      } else {
        cell.classList.remove('has-station');
      }
      cell.innerHTML = html;
    }
  }

  // 電車のいる駅を上部バーに表示(路線モードのみ)。
  function updateStationBar(n) {
    const line = currentLine();
    if (!line.color) { stationBarEl.classList.add('hidden'); return; }
    stationBarEl.classList.remove('hidden');
    const code = stationCode(line, n);
    const codeEl = $('station-code');
    codeEl.textContent = code || '';
    codeEl.style.display = code ? '' : 'none'; // 駅ナンバーが無い駅は空チップを隠す
    const name = stationName(line, n);
    const yomi = stationYomi(line, n);
    const nameEl = $('station-name');
    if (name) nameEl.innerHTML = rubyHtml(name, yomi);
    else nameEl.textContent = `${n}`;
  }

  // 路線色をテーマ変数に流し込む(ノーマルは既定値へ戻す)。
  function applyTheme() {
    const line = currentLine();
    const root = document.documentElement;
    document.body.classList.toggle('line-mode', !!line.color);
    document.body.dataset.line = line.id;
    const vars = {
      '--accent': line.color, '--accent-dark': line.accent,
      '--bg': line.bg, '--cell-edge': line.edge, '--line-color': line.color,
    };
    for (const [k, v] of Object.entries(vars)) {
      if (v) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
  }

  // 路線モード一式を現在の選択に合わせて反映する。
  function applyLine() {
    applyTheme();
    decorateCells();
    renderBoardTrain();
    renderTrainStrip();
  }

  // ---- 路線選択オーバーレイ(タイトル長押しで開く) ----
  function buildLineSelect() {
    const wrap = $('line-options');
    wrap.innerHTML = '';
    for (const line of [...LINES.selectableLines, LINES.normal]) {
      const b = document.createElement('button');
      b.className = 'line-opt';
      b.dataset.line = line.id;
      const chip = line.color
        ? `<span class="line-chip" style="background:${line.color}"></span>`
        : `<span class="line-chip normal">🚃</span>`;
      const cars = line.color ? `<span class="line-opt-cars">${line.cars}両</span>` : '';
      b.innerHTML = `${chip}<span class="line-opt-name">${line.name}</span>${cars}`;
      b.addEventListener('click', () => selectLine(line.id));
      wrap.appendChild(b);
    }
    $('close-line-select').addEventListener('click', closeLineSelect);
  }
  function refreshLineSelectUI() {
    document.querySelectorAll('#line-options .line-opt').forEach((el) =>
      el.classList.toggle('selected', el.dataset.line === game.state.lineId));
  }
  function openLineSelect() { speech.cancel(); refreshLineSelectUI(); $('line-select').classList.remove('hidden'); }
  function closeLineSelect() { $('line-select').classList.add('hidden'); }
  function selectLine(id) {
    game.setLine(id);
    applyLine();
    closeLineSelect();
    nextProblem();
  }

  // 10両そろったら「出発進行!」で右へ走り去り、機関車だけに戻す。
  function departTrain() {
    speech.speakDeparture();
    celebrate(); // もうひと盛り上げ
    carsEl.classList.add('departing');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      carsEl.classList.remove('departing');
      renderTrainStrip();              // visibleCars() は 0 → 機関車だけ
      carsEl.classList.add('arriving'); // 新しい機関車が左から到着
      setTimeout(() => carsEl.classList.remove('arriving'), 500);
    };
    carsEl.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 900); // フォールバック
  }

  // ---- モード反映 ----
  function renderMode() {
    const adv = effectiveMode() === 'advanced';
    $('advance-btn').classList.toggle('hidden', adv);
    for (const n in cells) {
      cells[n].classList.toggle('tappable', adv);
    }
    renderStepsLeft();
  }

  // ---- 出題 ----
  function nextProblem() {
    // チャレンジ中は「おまかせ(難易度の上限まで)」を強制(保存値は変えない)
    const active = challenge.state.active;
    game.newProblem(
      active ? 'random' : game.state.addendChoice,
      active ? challengeMax : game.state.randomMax
    );
    renderProblem();
    renderMode();
    trainEl.style.opacity = '1'; // 連結演出で隠した電車を戻す
    moveTrainTo(game.state.problem.start, false);
    busy = false;
    $('advance-btn').disabled = false;
    if (!challenge.state.active) {
      speech.speakProblem(game.state.problem.start, game.state.problem.addend);
    }
  }

  // ---- 初級: すすむ ----
  function onAdvance() {
    if (busy || effectiveMode() !== 'beginner') return;
    if (game.state.stepsLeft <= 0) return;
    busy = true;
    $('advance-btn').disabled = true;
    const r = game.stepForward();
    moveTrainTo(r.pos, true);
    renderStepsLeft();
    const stepNo = game.state.problem.addend - game.state.stepsLeft; // 何歩目か
    speech.speakStep(stepNo);
    setTimeout(() => {
      if (r.arrived) {
        onCorrect();
      } else {
        busy = false;
        $('advance-btn').disabled = false;
      }
    }, STEP_MS);
  }

  // ---- 上級/チャレンジ: マスをタップ ----
  function onCellTap(n) {
    if (busy || effectiveMode() !== 'advanced') return;
    if (game.checkTap(n)) {
      busy = true;
      moveTrainTo(n, true);
      setTimeout(challenge.state.active ? onChallengeCorrect : onCorrect, STEP_MS);
    } else {
      cells[n].classList.add('wrong');
      setTimeout(() => cells[n].classList.remove('wrong'), 400);
      if (challenge.state.active && challenge.state.type === 'streak') {
        onChallengeWrong(); // 連続モードは1ミスで終了
      } else {
        speech.speakTryAgain(); // 通常 / タイムはやりなおし
      }
    }
  }

  // ---- 正解 ----
  function onCorrect() {
    const goal = game.state.problem.goal;
    $('p-goal').textContent = goal;
    cells[goal].classList.add('right');
    game.recordCorrect();
    celebrate();
    speech.speakCorrect(goal);
    // 盤面の電車が編成へ飛んで連結 → 着地後に、満タンなら出発演出
    flyTrainToStrip(() => {
      if (visibleCars() === 0) {        // 完成両数に達した(出発)
        departTrain();
        setTimeout(nextProblem, 2400);
      } else {
        setTimeout(nextProblem, 900);
      }
    });
  }

  // 盤面で動いていた電車を、ごほうび編成の末尾へ飛ばして連結する演出。
  // onLanded は車両が着地した時点で呼ばれる。
  function flyTrainToStrip(onLanded) {
    // 1両だけ連結し、その着地点を測る
    const newCar = appendCar();
    newCar.style.visibility = 'hidden'; // 着地するまで隠す(レイアウトは保持)

    const target = newCar.getBoundingClientRect();
    const src = trainEl.getBoundingClientRect();
    const startFont = getComputedStyle(trainEl).fontSize;
    const endFont = getComputedStyle(newCar).fontSize;

    trainEl.style.opacity = '0'; // 盤面の電車は飛んでいくので隠す

    const line = currentLine();
    const fly = document.createElement('div');
    fly.className = 'flying-car';
    if (line.color) fly.appendChild(lineCarSpan(line, false));
    else fly.textContent = '🚃';
    fly.style.left = src.left + 'px';
    fly.style.top = src.top + 'px';
    fly.style.fontSize = startFont;
    document.body.appendChild(fly);
    void fly.offsetWidth; // リフロー後にトランジション開始

    fly.style.left = target.left + 'px';
    fly.style.top = target.top + 'px';
    fly.style.fontSize = endFont;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      fly.remove();
      newCar.style.visibility = '';
      newCar.classList.add('car-just-joined'); // 連結のひと弾み
      if (onLanded) onLanded();
    };
    fly.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 800); // 念のためのフォールバック
  }

  // ---- 紙吹雪演出 ----
  function celebrate() {
    const layer = $('celebrate');
    layer.classList.remove('hidden');
    const emojis = ['🎉', '⭐', '🎊', '🚃', '✨'];
    layer.innerHTML = '';
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      c.textContent = emojis[i % emojis.length];
      c.style.left = Math.random() * 100 + 'vw';
      c.style.animationDuration = 1 + Math.random() * 1.2 + 's';
      c.style.animationDelay = Math.random() * 0.3 + 's';
      layer.appendChild(c);
    }
    setTimeout(() => layer.classList.add('hidden'), 1800);
  }

  // ---- チャレンジ ----
  // 連続モード: 京浜東北線の路線図(JK01〜JK47)を1度だけ生成する。
  function buildStreakLine() {
    lineTrackEl.innerHTML = '';
    for (let i = 1; i <= TERMINUS; i++) {
      const stop = document.createElement('div');
      stop.className = 'stop';
      stop.innerHTML = `<span class="dot"></span><span class="stop-code">${stationCode(KEIHIN, i)}</span>`;
      lineTrackEl.appendChild(stop);
      streakStops[i] = stop;
    }
  }

  // 連続数 N → 現在駅 JK0(N+1)、上限は終点。
  const streakStationIndex = () => Math.min(challenge.state.score + 1, TERMINUS);

  function updateStreakLine() {
    const idx = streakStationIndex();
    for (let i = 1; i <= TERMINUS; i++) {
      const s = streakStops[i];
      s.classList.toggle('done', i < idx);
      s.classList.toggle('current', i === idx);
      s.classList.toggle('todo', i > idx);
    }
    const cur = streakStops[idx];
    lineTrackEl.scrollLeft = cur.offsetLeft - lineTrackEl.clientWidth / 2 + cur.offsetWidth / 2;
    const code = stationCode(KEIHIN, idx);
    const name = stationName(KEIHIN, idx);
    const yomi = stationYomi(KEIHIN, idx);
    streakNowEl.innerHTML =
      `<span class="now-code">${code}</span>` +
      rubyHtml(name, yomi, 'now-name') +
      (idx >= TERMINUS ? `<span class="terminus">しゅうてん!</span>` : '');
  }

  function refreshDiffUI() {
    document.querySelectorAll('.diff-opt').forEach((el) =>
      el.classList.toggle('selected', Number(el.dataset.chmax) === challengeMax));
  }

  function openChallengeSelect() {
    speech.cancel();
    $('best-streak').textContent = `ベスト: ${challenge.state.best.streak}もん`;
    $('best-time').textContent = `ベスト: ${challenge.state.best.time}もん`;
    refreshDiffUI();
    $('challenge-select').classList.remove('hidden');
  }

  // 60びょうの現在スピード(km/h)= とけた数 × 難易度ごとの1問あたり
  const currentSpeed = () => challenge.state.score * (KMH_PER_PROBLEM[challengeMax] || 10);

  function updateSpeed() {
    const kmh = currentSpeed();
    const c = trainClass(kmh);
    $('time-speed').innerHTML =
      `<span class="speed-emoji">${c.emoji}</span>` +
      `<span class="speed-kmh">${kmh}</span><span class="speed-unit">km/h</span>` +
      (c.name ? `<span class="speed-name">${c.name}</span>` : '');
  }

  function updateHud() {
    hudScoreEl.textContent = challenge.state.score;
    hudScoreEl.classList.remove('pop');
    void hudScoreEl.offsetWidth;
    hudScoreEl.classList.add('pop'); // スコアがポンと跳ねる
    if (challenge.state.type === 'time') updateSpeed();
  }

  function tick() {
    timeLeft -= 1;
    hudTimerEl.textContent = `⏱ ${timeLeft}`;
    hudTimerEl.classList.toggle('low', timeLeft <= 10); // 残りわずかは赤く
    if (timeLeft <= 0) {
      clearInterval(timerId);
      timerId = null;
      finishChallenge();
    }
  }

  function startChallenge(type) {
    speech.unlockAudio(); // 操作(クリック)のうちに効果音を起こしておく
    $('challenge-select').classList.add('hidden');
    $('challenge-result').classList.add('hidden');
    challenge.start(type);
    // 画面を「チャレンジ用」に切替
    rewardEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    $('challenge-btn').classList.add('hidden');
    $('settings-btn').classList.add('hidden');
    $('couple-btn').classList.add('hidden');
    $('quit-challenge').classList.remove('hidden');
    $('hud-label').textContent = type === 'streak' ? 'れんぞく' : 'とけた';
    if (type === 'time') {
      timeLeft = 60;
      hudTimerEl.textContent = `⏱ ${timeLeft}`;
      hudTimerEl.classList.remove('hidden', 'low');
      timerId = setInterval(tick, 1000);
    } else {
      hudTimerEl.classList.add('hidden');
    }
    // モード別の表示: 連続=京浜東北の駅すすみ / 60びょう=スピード
    $('streak-line').classList.toggle('hidden', type !== 'streak');
    $('time-speed').classList.toggle('hidden', type !== 'time');
    if (type === 'streak') updateStreakLine();
    updateHud(); // time のときは updateSpeed も走る
    nextProblem();
  }

  // 正解(チャレンジ中の高速ループ)。読み上げの代わりに「ピンポーン」を鳴らす。
  function onChallengeCorrect() {
    challenge.correct();
    speech.chimeCorrect();
    updateHud();
    if (challenge.state.type === 'streak') updateStreakLine(); // 次の駅へ進む
    cells[game.state.problem.goal].classList.add('right');
    setTimeout(nextProblem, 420);
  }

  // 連続モードでミス → 正解マスを見せて終了。
  function onChallengeWrong() {
    busy = true;
    challenge.wrong(); // 内部で finish 済み
    cells[game.state.problem.goal].classList.add('right');
    setTimeout(finishChallenge, 800);
  }

  function finishChallenge() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (challenge.state.active) challenge.finish(); // タイム/やめる経由
    showChallengeResult();
  }

  function showChallengeResult() {
    busy = true;
    const { type, score, isRecord, best } = challenge.state;
    $('result-record').classList.toggle('hidden', !isRecord);
    if (type === 'streak') {
      // 到達した京浜東北線の駅を併記
      const idx = streakStationIndex();
      const reached = score > 0
        ? `<br><span class="reached">${stationCode(KEIHIN, idx)} ${stationName(KEIHIN, idx)} まで!</span>`
        : '';
      $('result-text').innerHTML = `れんぞく ${score}もん!${reached}`;
    } else {
      // 60びょう: 到達スピードと電車のランクを併記
      const kmh = currentSpeed();
      const c = trainClass(kmh);
      const speed = score > 0
        ? `<br><span class="reached">${c.emoji} ${kmh}km/h${c.name ? ' ' + c.name : ''}!</span>`
        : '';
      $('result-text').innerHTML = `60びょうで ${score}もん!${speed}`;
    }
    $('result-best').textContent = `ベスト: ${best[type]}もん`;
    celebrate();
    speech.speakResult(score, isRecord);
    $('challenge-result').classList.remove('hidden');
  }

  // 通常モードへ復帰。
  function endChallenge() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    $('challenge-result').classList.add('hidden');
    hudEl.classList.add('hidden');
    rewardEl.classList.remove('hidden');
    $('quit-challenge').classList.add('hidden');
    $('challenge-btn').classList.remove('hidden');
    $('settings-btn').classList.remove('hidden');
    $('couple-btn').classList.remove('hidden');
    renderTrainStrip(); // 通常の編成を戻す
    nextProblem();
  }

  // ---- 連結モード(音声/タップで合計を答える) ----
  const COUPLE_STEP_MS = 600;

  function coupleCar(which) {
    const c = document.createElement('span');
    c.className = 'couple-car ' + which; // a / b で色分け
    return c;
  }

  function renderTrains(a, b) {
    const ta = $('train-a');
    const tb = $('train-b');
    ta.innerHTML = '';
    tb.innerHTML = '';
    for (let i = 0; i < a; i++) ta.appendChild(coupleCar('a'));
    for (let i = 0; i < b; i++) tb.appendChild(coupleCar('b'));
    document.querySelector('.couple-trains').classList.remove('coupled');
  }

  function buildCouplePad() {
    const pad = $('couple-pad');
    pad.innerHTML = '';
    for (let n = 2; n <= 18; n++) {
      const b = document.createElement('button');
      b.className = 'pad-key';
      b.textContent = n;
      b.addEventListener('click', () => checkCouple(n));
      pad.appendChild(b);
    }
  }

  function nextCouple() {
    coupleBusy = false;
    coupleProblem = makeCouplingProblem({ rng: Math.random });
    const { a, b } = coupleProblem;
    $('cp-a').textContent = a;
    $('cp-b').textContent = b;
    $('cp-q').textContent = '？';
    $('couple-status').textContent = '';
    renderTrains(a, b);
    speech.speakProblem(a, b); // 「5たす8わ?」
  }

  function checkCouple(n) {
    if (coupleBusy || !coupleProblem) return;
    if (n === coupleProblem.sum) {
      coupleBusy = true;
      recog.stop();
      $('cp-q').textContent = coupleProblem.sum;
      $('couple-status').textContent = '';
      document.querySelector('.couple-trains').classList.add('coupled'); // 連結アニメ
      celebrate();
      speech.speakCoupleResult(coupleProblem.sum); // 「ぜんぶで 13りょう! やったね!」
      setTimeout(nextCouple, COUPLE_STEP_MS + 1400);
    } else {
      $('couple-status').textContent = 'もういちど！ かぞえてみよう';
      speech.speakTryAgain();
    }
  }

  function onMic() {
    if (coupleBusy) return;
    $('couple-status').textContent = 'きいているよ… 🎤';
    recog.listen(
      (alts) => {
        for (const t of alts) {
          const n = parseSpokenNumber(t);
          if (n != null) { checkCouple(n); return; }
        }
        $('couple-status').textContent = 'もういちど！ すうじでもOK';
      },
      (err) => {
        if (err === 'not-allowed') $('couple-status').textContent = 'マイクの きょかが ひつようだよ';
        else if (err === 'no-speech') $('couple-status').textContent = 'きこえなかった、もういちど';
        else $('couple-status').textContent = 'すうじで こたえてね';
      }
    );
  }

  function enterCouple() {
    speech.cancel();
    document.body.classList.add('couple-mode');
    $('couple-view').classList.remove('hidden');
    nextCouple();
  }

  function exitCouple() {
    recog.stop();
    coupleProblem = null;
    document.body.classList.remove('couple-mode');
    $('couple-view').classList.add('hidden');
    nextProblem(); // 通常の数字盤に戻る
  }

  // ---- 設定オーバーレイ ----
  function buildSettings() {
    // 足す数の選択ボタン
    const wrap = $('addend-choices');
    wrap.innerHTML = '';
    for (let a = 1; a <= 9; a++) {
      const b = document.createElement('button');
      b.textContent = '+' + a;
      b.dataset.addend = String(a);
      b.addEventListener('click', () => selectAddend(a));
      wrap.appendChild(b);
    }
    // おまかせ: 上限(〜5/〜7/〜9)を選ぶ。選ぶと足す数は 1〜上限 のランダムになる。
    const row = document.createElement('div');
    row.className = 'omakase-row';
    row.innerHTML = '<span class="omakase-label">✨ おまかせ ✨</span>';
    for (const n of [5, 7, 9]) {
      const b = document.createElement('button');
      b.className = 'omakase-cap';
      b.dataset.randommax = String(n);
      b.textContent = '〜' + n;
      b.addEventListener('click', () => selectRandomCap(n));
      row.appendChild(b);
    }
    wrap.appendChild(row);

    document.querySelectorAll('.range-opt').forEach((el) =>
      el.addEventListener('click', () => selectMax(Number(el.dataset.max))));
    document.querySelectorAll('.mode-opt').forEach((el) =>
      el.addEventListener('click', () => selectMode(el.dataset.mode)));
    document.querySelectorAll('.sound-opt').forEach((el) =>
      el.addEventListener('click', () => selectSound(el.dataset.sound === 'on')));

    $('settings-btn').addEventListener('click', openSettings);
    $('close-settings').addEventListener('click', closeSettings);
    $('reset-train').addEventListener('click', () => {
      game.resetTrain();
      renderTrainStrip();
    });
    refreshSettingsUI();
  }

  function refreshSettingsUI() {
    const a = game.state.addendChoice;
    // 固定の足す数(+1〜+9)
    document.querySelectorAll('#addend-choices button[data-addend]').forEach((b) => {
      b.classList.toggle('selected', Number(b.dataset.addend) === a);
    });
    // おまかせの上限(addendChoice が 'random' のとき、選んだ上限を強調)
    document.querySelectorAll('#addend-choices .omakase-cap').forEach((b) => {
      b.classList.toggle('selected', a === 'random' && Number(b.dataset.randommax) === game.state.randomMax);
    });
    document.querySelectorAll('.range-opt').forEach((el) =>
      el.classList.toggle('selected', Number(el.dataset.max) === game.state.maxNumber));
    document.querySelectorAll('.mode-opt').forEach((el) =>
      el.classList.toggle('selected', el.dataset.mode === game.state.mode));
    document.querySelectorAll('.sound-opt').forEach((el) =>
      el.classList.toggle('selected', (el.dataset.sound === 'on') === game.state.soundOn));
  }

  function selectAddend(a) { game.setAddendChoice(a); refreshSettingsUI(); }
  // 「おまかせ〜N」を選ぶ: おまかせ + 上限 N
  function selectRandomCap(n) {
    game.setAddendChoice('random');
    game.setRandomMax(n);
    refreshSettingsUI();
  }
  // はんいを変えたら盤面を作り直し、駅ラベルも貼り直す(出題は設定を閉じたときに更新)
  function selectMax(n) {
    game.setMax(n);
    buildBoard();
    decorateCells();
    refreshSettingsUI();
  }
  function selectMode(m) { game.setMode(m); refreshSettingsUI(); renderMode(); }
  function selectSound(on) {
    game.setSoundOn(on);
    refreshSettingsUI();
    if (!on) speech.cancel();
  }
  function openSettings() { speech.cancel(); $('settings').classList.remove('hidden'); }
  function closeSettings() {
    $('settings').classList.add('hidden');
    nextProblem(); // 設定変更を反映した新しい問題で再開
  }

  // タイトル長押し(2秒)で隠しの路線選択を開く。
  // キャンセルは window の pointerup/cancel で判定する(押している間に
  // カーソルがタイトルから少しズレても誤キャンセルしないように)。
  function bindLongPress() {
    const title = document.querySelector('.app-title');
    let timer = null;
    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
    };
    title.addEventListener('pointerdown', (e) => {
      e.preventDefault();           // 文字選択ドラッグを抑止
      cancel();                     // 念のため前回分を掃除
      timer = setTimeout(() => { timer = null; openLineSelect(); }, 2000);
      window.addEventListener('pointerup', cancel);
      window.addEventListener('pointercancel', cancel);
    });
  }

  // ---- 起動 ----
  function start() {
    $('advance-btn').addEventListener('click', onAdvance);
    $('replay-btn').addEventListener('click', () =>
      speech.speakProblem(game.state.problem.start, game.state.problem.addend));
    window.addEventListener('resize', () => {
      if (game.state.trainPos != null) moveTrainTo(game.state.trainPos, false);
    });
    // チャレンジ関連
    $('challenge-btn').addEventListener('click', openChallengeSelect);
    $('close-challenge').addEventListener('click', () => $('challenge-select').classList.add('hidden'));
    document.querySelectorAll('.diff-opt').forEach((el) =>
      el.addEventListener('click', () => { challengeMax = Number(el.dataset.chmax); refreshDiffUI(); }));
    $('ch-streak').addEventListener('click', () => startChallenge('streak'));
    $('ch-time').addEventListener('click', () => startChallenge('time'));

    // 連結モード
    buildCouplePad();
    if (!recog.supported) $('mic-btn').classList.add('hidden'); // 非対応はタップのみ
    $('couple-btn').addEventListener('click', enterCouple);
    $('couple-back').addEventListener('click', exitCouple);
    $('mic-btn').addEventListener('click', onMic);
    $('couple-replay').addEventListener('click', () => {
      if (coupleProblem) speech.speakProblem(coupleProblem.a, coupleProblem.b);
    });
    $('quit-challenge').addEventListener('click', finishChallenge);
    $('result-retry').addEventListener('click', () => startChallenge(challenge.state.type));
    $('result-end').addEventListener('click', endChallenge);

    buildBoard();  // はんいに応じてマスを生成
    buildSettings();
    buildLineSelect();
    buildStreakLine();
    bindLongPress();
    applyLine();   // 保存された路線(テーマ・駅ラベル・電車)を反映
    nextProblem();
  }

  return { start };
}
