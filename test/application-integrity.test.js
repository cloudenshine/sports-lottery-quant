"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const dataCode = fs.readFileSync(path.join(root, 'sports-mock-data.js'), 'utf8');
const snapshotNow = Date.parse('2026-09-06T02:00:00Z');
function loadData(payload, now = snapshotNow) {
  class SnapshotDate extends Date { static now() { return now; } }
  const context = vm.createContext({ window: { SPORTS_LIVE: payload }, Date: SnapshotDate });
  vm.runInContext(dataCode, context);
  return context.window.MockData;
}
test('legacy or missing sports data cannot silently become live demos', () => {
  for (const payload of [undefined, {}, JSON.parse(fs.readFileSync(path.join(root, 'data/sports_live.json')))]) {
    const data = loadData(payload);
    if (payload?.schemaVersion === 2) continue;
    assert.equal(data.JINGCAI_MATCHES.length, 0);
    assert.equal(data.SFC_MATCHES.length, 0);
    assert.equal(data.META.isRealTime, false);
    assert.ok(data.CLASSIC_JINGCAI_MATCHES.length > 0);
  }
});
function validSnapshot() {
  const { parseJingcai, parseSFC } = require('../sync-sports-live');
  const row = `<tr class='bet-tb-tr' data-fixtureid='123' data-matchnum='周日001' data-matchdate='2026-09-06' data-matchtime='23:00' data-homesxname='甲队' data-awaysxname='乙队' data-rangqiu='-1'>` +
    ['3', '1', '0'].map((key, i) => `<span data-type='nspf' data-value='${key}' data-sp='${2 + i}'></span>`).join('') + '</tr>';
  const observed = new Date(snapshotNow - 60000);
  const sfcHtml = Array.from({ length: 14 }, (_, i) => `<tr class='bet-tb-tr' data-vs='主${i} vs 客${i}' data-bjpl='2.1,3.2,3.0'></tr>`).join('');
  return { schemaVersion: 2, dataKind: 'source-snapshot', salesStatus: 'unverified', syncedAt: observed.toISOString(), displayTime: '2026/9/6 09:59:00',
    jingcaiCount: 1, sfcCount: 14, jingcai: parseJingcai(row, { now: observed }), sfc: parseSFC(sfcHtml) };
}
test('browser accepts the corrected synchronizer contract without claiming live sales or form observations', () => {
  const data = loadData(validSnapshot());
  assert.equal(data.META.validSnapshot, true);
  assert.equal(data.META.isRealTime, false);
  assert.equal(data.JINGCAI_MATCHES.length, 1);
  assert.equal(data.SFC_MATCHES.length, 14);
  assert.equal(data.JINGCAI_MATCHES[0].homeTeam.recentResults.length, 0);
  assert.equal(data.JINGCAI_MATCHES[0].odds.RQSPF, undefined);
});
test('browser rejects malformed or falsely relabeled schema2 snapshots before rendering', () => {
  const mutations = [
    p => { p.jingcai = [{}]; },
    p => { p.jingcai = [null]; },
    p => { p.jingcai[0].homeTeam.homeMatches = 10; },
    p => { p.jingcai[0].homeTeam.recentResults = ['W']; },
    p => { p.jingcai[0].h2h = [{ score: '1-0' }]; },
    p => { p.jingcai[0].dataQuality.source = 'invented'; },
    p => { p.dataKind = 'live'; },
    p => { p.salesStatus = 'verified'; },
    p => { delete p.jingcai[0].odds.SPF['1']; },
    p => { p.jingcai[0].odds.SPF['3'] = 0; },
    p => { p.jingcai[0].odds.SPF['3'] = '2.1'; },
    p => { p.jingcai[0].odds.SPF['3'] = Infinity; },
    p => { p.jingcai[0].odds.CRS = { '1:0': 7 }; },
    p => { p.jingcai[0].dataQuality.quotedMarkets = ['RQSPF']; },
    p => { p.jingcai.push(p.jingcai[0]); p.jingcaiCount++; },
    p => { p.jingcai[0].homeTeam.name = '<img>'; },
    p => { p.jingcai[0].kickoffTime = '25:00'; },
    p => { p.jingcai[0].matchDate = '2026-02-30'; },
    p => { p.jingcai[0].kickoffAt = '2026-09-06T14:00:00.000Z'; },
    p => { p.sfc[0].odds['3'] = null; },
    p => { p.sfc[0].dataQuality.issue = '26001'; },
    p => { p.sfc[1] = { ...p.sfc[0], matchIdx: 2 }; },
    p => { p.sfc.pop(); p.sfcCount--; },
    p => { p.jingcaiCount = 2; },
    p => { delete p.sfc; },
  ];
  for (const mutate of mutations) {
    const payload = validSnapshot(); mutate(payload);
    const data = loadData(payload);
    assert.equal(data.META.validSnapshot, false, String(mutate));
    assert.equal(data.JINGCAI_MATCHES.length, 0);
    assert.equal(data.SFC_MATCHES.length, 0);
  }
  const old = JSON.parse(fs.readFileSync(path.join(root, 'data/sports_live.json')));
  const legacy = JSON.parse(JSON.stringify(old));
  legacy.jingcai[0].homeTeam.homeMatches = 10;
  const relabeled = { ...validSnapshot(), jingcai: legacy.jingcai, sfc: legacy.sfc, jingcaiCount: legacy.jingcai.length, sfcCount: legacy.sfc.length };
  assert.equal(loadData(relabeled).META.validSnapshot, false);
});
test('expired and future source snapshots are unavailable; finished fixtures are not offered', () => {
  const old = validSnapshot(); old.syncedAt = new Date(snapshotNow - 24 * 3600000 - 1).toISOString();
  const expired = loadData(old);
  assert.equal(expired.META.stale, true);
  assert.equal(expired.JINGCAI_MATCHES.length, 0);
  assert.equal(expired.SFC_MATCHES.length, 0);
  const future = validSnapshot(); future.syncedAt = new Date(snapshotNow + 1).toISOString();
  assert.equal(loadData(future).META.validSnapshot, false);
  assert.equal(loadData(future).JINGCAI_MATCHES.length, 0);
  const finished = loadData(validSnapshot(), Date.parse('2026-09-06T16:00:00Z'));
  assert.equal(finished.META.validSnapshot, true);
  assert.equal(finished.JINGCAI_MATCHES.length, 0);
});
test('valid empty source arrays remain empty and never activate demonstrations', () => {
  const payload = { ...validSnapshot(), jingcai: [], sfc: [], jingcaiCount: 0, sfcCount: 0 };
  const data = loadData(payload);
  assert.equal(data.META.validSnapshot, true);
  assert.equal(data.JINGCAI_MATCHES.length, 0);
  assert.equal(data.SFC_MATCHES.length, 0);
  assert.ok(data.CLASSIC_JINGCAI_MATCHES.length > 0);
});
test('standalone scripts contain exact current source modules', () => {
  for (const [output, files] of [
    ['number-tools-standalone.html', ['engine.js', 'data/ssq-compact.js', 'data/dlt-compact.js']],
    ['lotto-standalone.html', ['number-models.js', 'number-settlement.js', 'number-app.js']],
    ['sports-standalone.html', ['sports-mock-data.js', 'sports-form-analyzer.js', 'sports-jingcai-engine.js', 'sports-sfc-engine.js', 'sports-beidan-engine.js', 'sports-lancai-engine.js']],
  ]) {
    const html = fs.readFileSync(path.join(root, output), 'utf8');
    for (const file of files) assert.ok(html.includes(fs.readFileSync(path.join(root, file), 'utf8')), output + ' stale: ' + file);
    const source = output === 'lotto-standalone.html' ? 'index.html' : output === 'number-tools-standalone.html' ? 'number-tools.html' : 'sports.html';
    for (const match of fs.readFileSync(path.join(root, source), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      assert.ok(html.includes(match[1]), output + ' has stale application logic');
    }
  }
});
test('application removes fabricated random baselines and real-time sync claims', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /const randomBaseline = game|2500000000|92\.0|开奖\+15秒静默轮询同步/);
  const sports = fs.readFileSync(path.join(root, 'sports.html'), 'utf8');
  assert.doesNotMatch(sports, /今日实时在售赛事|即时盘面|单场返还 ~73%/);
});
