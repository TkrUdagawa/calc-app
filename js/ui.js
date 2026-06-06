// 表示層: 盤面の描画、電車の移動アニメーション、モード別の操作、
// 正解演出、設定オーバーレイを結線する。game と speech に依存する。

import { MAX } from './board.js';

const STEP_MS = 340; // 電車アニメーションの所要時間(CSS の .train transition と合わせる)

export function createUI({ game, speech }) {
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const boardWrap = boardEl.parentElement;
  const trainEl = $('train');
  // 毎回参照する固定要素はキャッシュしておく
  const stripEl = $('train-strip');
  const rewardCountEl = $('reward-count');
  const cells = {}; // 数 -> セル要素
  let busy = false; // アニメーション/判定中の入力ロック

  // ---- 盤面の生成 ----
  for (let n = 1; n <= MAX; n++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.n = String(n);
    cell.textContent = String(n);
    cell.addEventListener('click', () => onCellTap(n));
    boardEl.appendChild(cell);
    cells[n] = cell;
  }

  // ---- 電車の位置決め ----
  function moveTrainTo(n, animate = true) {
    const cell = cells[n];
    if (!cell) return;
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
    if (game.state.mode !== 'beginner') {
      $('steps-left').textContent = '';
      return;
    }
    $('steps-left').textContent = '●'.repeat(game.state.stepsLeft);
  }

  // ---- ごほうび編成 ----
  // 先頭は機関車 🚂、正解ごとに増える車両は盤面の電車と同じ 🚃。
  function makeCar(emoji) {
    const car = document.createElement('span');
    car.className = 'car';
    car.textContent = emoji;
    return car;
  }
  function updateRewardCount() {
    rewardCountEl.textContent = `せいかい ${game.state.trainLength}かい`;
  }

  // 全再構築は初期表示とリセット時のみ(編成長に比例するので毎正解では使わない)。
  function renderTrainStrip() {
    stripEl.innerHTML = '';
    stripEl.appendChild(makeCar('🚂'));
    for (let i = 0; i < game.state.trainLength; i++) stripEl.appendChild(makeCar('🚃'));
    updateRewardCount();
    stripEl.scrollLeft = stripEl.scrollWidth;
  }

  // 正解時に1両だけ連結する(O(1))。追加した要素を返す。
  function appendCar() {
    const car = makeCar('🚃');
    stripEl.appendChild(car);
    updateRewardCount();
    stripEl.scrollLeft = stripEl.scrollWidth;
    return car;
  }

  // ---- モード反映 ----
  function renderMode() {
    const adv = game.state.mode === 'advanced';
    $('advance-btn').classList.toggle('hidden', adv);
    for (const n in cells) {
      cells[n].classList.toggle('tappable', adv);
    }
    renderStepsLeft();
  }

  // ---- 出題 ----
  function nextProblem() {
    game.newProblem();
    renderProblem();
    renderMode();
    trainEl.style.opacity = '1'; // 連結演出で隠した電車を戻す
    moveTrainTo(game.state.problem.start, false);
    busy = false;
    $('advance-btn').disabled = false;
    speech.speakProblem(game.state.problem.start, game.state.problem.addend);
  }

  // ---- 初級: すすむ ----
  function onAdvance() {
    if (busy || game.state.mode !== 'beginner') return;
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

  // ---- 上級: マスをタップ ----
  function onCellTap(n) {
    if (busy || game.state.mode !== 'advanced') return;
    if (game.checkTap(n)) {
      busy = true;
      moveTrainTo(n, true);
      setTimeout(onCorrect, STEP_MS);
    } else {
      cells[n].classList.add('wrong');
      setTimeout(() => cells[n].classList.remove('wrong'), 400);
      speech.speakTryAgain();
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
    flyTrainToStrip();        // 盤面の電車が編成へ飛んで連結
    setTimeout(nextProblem, 1800);
  }

  // 盤面で動いていた電車を、ごほうび編成の末尾へ飛ばして連結する演出。
  function flyTrainToStrip() {
    // 1両だけ連結し、その着地点を測る
    const newCar = appendCar();
    newCar.style.visibility = 'hidden'; // 着地するまで隠す(レイアウトは保持)

    const target = newCar.getBoundingClientRect();
    const src = trainEl.getBoundingClientRect();
    const startFont = getComputedStyle(trainEl).fontSize;
    const endFont = getComputedStyle(newCar).fontSize;

    trainEl.style.opacity = '0'; // 盤面の電車は飛んでいくので隠す

    const fly = document.createElement('div');
    fly.className = 'flying-car';
    fly.textContent = '🚃';
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
    const omakase = document.createElement('button');
    omakase.textContent = '✨ おまかせ ✨';
    omakase.className = 'omakase';
    omakase.dataset.addend = 'random';
    omakase.addEventListener('click', () => selectAddend('random'));
    wrap.appendChild(omakase);

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
    document.querySelectorAll('#addend-choices button').forEach((b) => {
      const v = b.dataset.addend === 'random' ? 'random' : Number(b.dataset.addend);
      b.classList.toggle('selected', v === a);
    });
    document.querySelectorAll('.mode-opt').forEach((el) =>
      el.classList.toggle('selected', el.dataset.mode === game.state.mode));
    document.querySelectorAll('.sound-opt').forEach((el) =>
      el.classList.toggle('selected', (el.dataset.sound === 'on') === game.state.soundOn));
  }

  function selectAddend(a) { game.setAddendChoice(a); refreshSettingsUI(); }
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

  // ---- 起動 ----
  function start() {
    $('advance-btn').addEventListener('click', onAdvance);
    $('replay-btn').addEventListener('click', () =>
      speech.speakProblem(game.state.problem.start, game.state.problem.addend));
    window.addEventListener('resize', () => {
      if (game.state.trainPos != null) moveTrainTo(game.state.trainPos, false);
    });
    buildSettings();
    renderTrainStrip();
    nextProblem();
  }

  return { start };
}
