// 起動: 実物の localStorage / SpeechSynthesis を使って各モジュールを結線する。

import { createGame } from './game.js';
import { createSpeech } from './speech.js';
import { createUI } from './ui.js';

const game = createGame({ storage: window.localStorage });
const speech = createSpeech({ enabled: () => game.state.soundOn });
const ui = createUI({ game, speech });

ui.start();

// PWA: Service Worker を登録(http(s) 環境でのみ動作)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* オフライン化に失敗してもアプリ自体は動く */
    });
  });
}
