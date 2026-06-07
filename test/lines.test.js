import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, getLine, stationCode, stationName, stationYomi } from '../js/lines.js';

test('normal line has no theme/stations and completes at 10 cars', () => {
  const n = getLine('normal');
  assert.equal(n.cars, 10);
  assert.equal(n.code, null);
  assert.equal(stationCode(n, 1), null);
  assert.equal(stationName(n, 1), null);
});

test('getLine falls back to normal for unknown ids', () => {
  assert.equal(getLine('nope'), LINES.normal);
  assert.equal(getLine(undefined), LINES.normal);
});

test('山手線: 30 coded stations, 11-car train', () => {
  const y = getLine('yamanote');
  assert.equal(y.code, 'JY');
  assert.equal(y.cars, 11);
  assert.equal(y.stations.length, 30);
  assert.equal(y.coded, 30);
  assert.equal(stationName(y, 1), '東京');
  assert.equal(stationCode(y, 1), 'JY01');
  assert.equal(stationCode(y, 8), 'JY08');
  assert.equal(stationName(y, 30), '有楽町');
  assert.equal(stationCode(y, 30), 'JY30');
});

test('京浜東北線: 全47駅(大宮〜大船)に駅ナンバーあり、10両', () => {
  const k = getLine('keihin');
  assert.equal(k.code, 'JK');
  assert.equal(k.cars, 10);
  assert.equal(k.coded, 47);
  assert.equal(k.stations.length, 47);
  assert.equal(stationName(k, 1), '大宮');
  assert.equal(stationCode(k, 22), 'JK22');
  assert.equal(stationName(k, 31), '蒲田');
  assert.equal(stationName(k, 47), '大船');
  assert.equal(stationCode(k, 47), 'JK47');
  assert.equal(stationYomi(k, 47), 'おおふな');
});

test('常磐線: 15-car train, only first 10 stations are coded (JJ)', () => {
  const j = getLine('joban');
  assert.equal(j.code, 'JJ');
  assert.equal(j.cars, 15);
  assert.equal(j.coded, 10);
  assert.equal(stationCode(j, 10), 'JJ10');
  assert.equal(stationName(j, 10), '取手');
  // 取手以北は駅名はあるが駅ナンバーは無い
  assert.equal(stationCode(j, 11), null);
  assert.ok(stationName(j, 11) && stationName(j, 11).length > 0);
});

test('日比谷線: 22 coded stations incl. 虎ノ門ヒルズ(H06), 7-car train', () => {
  const h = getLine('hibiya');
  assert.equal(h.code, 'H');
  assert.equal(h.cars, 7);
  assert.equal(h.coded, 22);
  assert.equal(stationName(h, 1), '中目黒');
  assert.equal(stationName(h, 6), '虎ノ門ヒルズ');
  assert.equal(stationCode(h, 6), 'H06');
  assert.equal(stationName(h, 22), '北千住');
  // 23マス以降は駅なし
  assert.equal(stationName(h, 23), null);
  assert.equal(stationCode(h, 23), null);
});

test('stations carry hiragana readings (furigana)', () => {
  const y = getLine('yamanote');
  assert.equal(stationName(y, 17), '新宿');
  assert.equal(stationYomi(y, 17), 'しんじゅく');
  assert.equal(stationYomi(y, 1), 'とうきょう');
  const h = getLine('hibiya');
  assert.equal(stationYomi(h, 6), 'とらのもんヒルズ'); // 虎ノ門ヒルズ
  // 駅の無いマスは読みも null
  assert.equal(stationYomi(h, 23), null);
  // 取手以北(駅ナンバー無し)でも読みはある
  const j = getLine('joban');
  assert.equal(stationName(j, 11), '藤代');
  assert.equal(stationYomi(j, 11), 'ふじしろ');
});

test('selectable lines exclude normal and are in display order', () => {
  const { selectableLines } = LINES;
  assert.deepEqual(
    selectableLines.map((l) => l.id),
    ['yamanote', 'keihin', 'joban', 'hibiya']
  );
});
