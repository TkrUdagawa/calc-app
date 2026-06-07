// 表示層: 盤面の描画、電車の移動アニメーション、モード別の操作、
// 正解演出、設定オーバーレイを結線する。game と speech に依存する。

import { MAX } from './board.js';
import { LINES, getLine, stationCode, stationName, stationYomi } from './lines.js';

const STEP_MS = 340; // 電車アニメーションの所要時間(CSS の .train transition と合わせる)

export function createUI({ game, speech }) {
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const boardWrap = boardEl.parentElement;
  const trainEl = $('train');
  // 毎回参照する固定要素はキャッシュしておく
  const stripEl = $('train-strip');
  const rewardCountEl = $('reward-count');
  const stationBarEl = $('station-bar');

  // 現在選択中の路線('normal' のときはテーマ変更なし)
  const currentLine = () => getLine(game.state.lineId);
  // 完成両数(この両数つながると出発)。路線ごとに異なる。
  const completionCars = () => currentLine().cars;
  // 車両は内側のラッパーにまとめ、出発時はこれごと右へ走らせる
  const carsEl = document.createElement('div');
  carsEl.className = 'train-cars';
  stripEl.appendChild(carsEl);
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
    if (game.state.mode !== 'beginner') {
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
    for (let n = 1; n <= MAX; n++) {
      const cell = cells[n];
      const code = stationCode(line, n);
      const name = stationName(line, n);
      const yomi = stationYomi(line, n);
      let html = `<span class="cell-num">${n}</span>`;
      if (line.color && (code || name)) {
        if (code) html += `<span class="cell-code">${code}</span>`;
        if (name) html += `<ruby class="cell-name">${name}<rt>${yomi || ''}</rt></ruby>`;
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
    if (name) nameEl.innerHTML = `<ruby>${name}<rt>${yomi || ''}</rt></ruby>`;
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
    buildSettings();
    buildLineSelect();
    bindLongPress();
    applyLine();   // 保存された路線(テーマ・駅ラベル・電車)を反映
    nextProblem();
  }

  return { start };
}
