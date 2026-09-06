'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseHistory, parseDltDetail, parseSsqDetail, parseNextIssues, syncNumberSources, issueId } = require('../numbers-sources');
const now = new Date('2026-09-06T02:00:00Z');
const source = { sourceId: 'test', sourceUrl: 'https://example.test/result', fetchedAt: now.toISOString(), bodySha256: 'a'.repeat(64), rawRef: 'raw/a.body' };
const td = values => `<tr class="t_tr1">${values.map(v => `<td>${v}</td>`).join('')}</tr>`;
const history = game => `<tbody id="tdata">${td(game === 'ssq' ? ['26102', 3, 4, 10, 13, 16, 25, 9, '', '782,244,968', 4, '8,286,261', 93, '176,680', '335,960,988', '2026-09-03'] : ['26101', 9, 11, 18, 26, 33, 9, 11, '692,723,357', 10, '5,927,001', 167, '81,242', '315,133,456', '2026-09-05'])}</tbody>`;
const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
function ssqDetail({ fortune = false } = {}) { return `<h1>双色球2026102期开奖结果</h1>开奖时间：2026-09-03 21:15:00 本期销量：335,960,988 元 奖池滚存：782,244,968 元 ${[3, 4, 10, 13, 16, 25].map(n => `<b class="red">${n}</b>`).join('')}<b class="blue">09</b><table>${[8286261, 176680, 3000, 200, 10, 5].map((v, i) => td([`${names[i]}等奖`, i + 1, v])).join('')}${fortune ? td(['福运奖', 100, 5]) : ''}</table>`; }
function dltDetail() { return `第26101期开奖公告 开奖日期：2026年9月5日 本期全国销售金额：315,133,456元 692,723,357.41元奖金滚入下期奖池 <li>本期开奖号码：</li><li>09 11 18 26 33</li><li>09 11</li>${[5927001, 81242, 5000, 300, 150, 15, 5].map((n, i) => `<ul><li>${names[i]}等奖</li><li class="TextAlignR">${i + 1}注</li><li class="TextAlignR">${n}元</li><li class="TextAlignR">100元</li>${i < 2 ? '<li class="TextAlignR">0注</li><li class="TextAlignR">---元</li><li class="TextAlignR">0元</li>' : ''}</ul>`).join('')}`; }
const next = `<article><a href="/history.php?type=ssq">双色球</a><div>下期 2026103 · 2026-09-06 21:15</div></article><article><a href="/history.php?type=dlt">大乐透</a><div>下期 26102 · 2026-09-07 21:25</div></article>`;
test('published history preserves actual variable payouts and day precision without filling missing tiers', () => {
  for (const game of ['ssq', 'dlt']) { const [draw] = parseHistory(history(game), game, source, now); assert.equal(draw.gameId, game); assert.equal(draw.drawAtPrecision, 'day'); assert.equal(Object.keys(draw.payouts.base).length, 2); assert.equal(draw.payouts.base[3], undefined); assert.equal(draw.source, source); }
  assert.equal(issueId('2026103'), '26103'); assert.throws(() => issueId('2026000'));
});
test('invalid and duplicate draw observations are rejected', () => {
  assert.throws(() => parseHistory(history('ssq').replace('<td>4</td>', '<td>3</td>'), 'ssq', source, now));
  assert.throws(() => parseHistory(history('dlt').replace('2026-09-05', '2026-09-20'), 'dlt', source, now));
  assert.throws(() => parseHistory(history('ssq').replace('</tbody>', history('ssq').match(/<tr[\s\S]*<\/tr>/)[0] + '</tbody>'), 'ssq', source, now));
});
test('DLT complete official table retains extra payout null when no published prize', () => {
  const draw = parseDltDetail(dltDetail(), source, now); assert.equal(draw.payouts.base[3], 5000); assert.equal(draw.payouts.additional[1], null); assert.equal(draw.poolYuan, 692723357.41); assert.equal(Object.keys(draw.payouts.base).length, 7);
  assert.throws(() => parseDltDetail(dltDetail().replace('七等奖', '未知奖'), source, now));
});
test('SSQ missing fortune row remains unknown; explicit published fortune is retained', () => {
  const unknown = parseSsqDetail(ssqDetail(), source, now); assert.equal(unknown.specialPrizeActive, null); assert.equal(unknown.payouts.base.fortune, undefined);
  const active = parseSsqDetail(ssqDetail({ fortune: true }), source, now); assert.equal(active.specialPrizeActive, true); assert.equal(active.payouts.base.fortune, 5); assert.equal(active.winners.base.fortune, 100);
});
test('promotional DLT rows do not contaminate basic or additional settlement amounts', () => {
  let html = dltDetail().replace('第26101', '第25057').replace('2026年9月5日', '2025年5月24日');
  const first = html.match(/<ul>[\s\S]*?<\/ul>/)[0];
  const values = [4, 10000000, 40000000, 1, 10000000, 10000000, 0, '---', 0, 0, '---', 0];
  const promo = `<ul><li><div>一等奖</div><div>基本</div><div>派奖</div><div>追加</div><div>派奖</div></li>${values.map(v => `<li class="TextAlignR">${v}</li>`).join('')}</ul>`;
  html = html.replace(first, promo) + '<ul><li>八等奖</li><li class="TextAlignR">20</li><li class="TextAlignR">15</li><li class="TextAlignR">300</li></ul><ul><li>九等奖</li><li class="TextAlignR">100</li><li class="TextAlignR">5</li><li class="TextAlignR">500</li></ul>';
  const draw = parseDltDetail(html, source, now); assert.equal(draw.payouts.base[1], 10000000); assert.equal(draw.payouts.additional[1], null); assert.equal(draw.promotion.payouts.base[1], 10000000); assert.equal(draw.promotion.eligibility, 'unverified');
});
test('separate 2026 DLT promotional rows cannot overwrite base prizes or winner counts', () => {
  const row = '<ul><li>六等奖派奖</li><li class="TextAlignR">896,767注</li><li class="TextAlignR">7.5元</li><li class="TextAlignR">6,725,753元</li></ul>';
  for (const html of [dltDetail() + row, row + dltDetail()]) {
    const draw = parseDltDetail(html, source, now); assert.equal(draw.payouts.base[6], 15); assert.equal(draw.winners.base[6], 6); assert.equal(draw.promotion.payouts.base[6], 7.5); assert.equal(draw.promotion.winners.base[6], 896767);
  }
  assert.throws(() => parseDltDetail(dltDetail() + row + row, source, now), /Duplicate promotion/);
});
test('SSQ alternate published page and missing pool preserve independently observed facts', () => {
  let html = ssqDetail().replace('双色球2026102期开奖结果', '开奖期数： 第 2026102 期').replace('开奖时间：2026-09-03 21:15:00', '开奖日期： 2026年9月3日').replace(/<b class="(red|blue)">(\d+)<\/b>/g, '<div class="$1-ball">$2</div>').replace('782,244,968', '--');
  const draw = parseSsqDetail(html, source, now); assert.equal(draw.poolYuan, null); assert.equal(draw.payouts.base[3], 3000);
});
test('next issue is read from announcement and never incremented or assigned a sale deadline', () => {
  const result = parseNextIssues(next, source, now); assert.equal(result.ssq.issue, '26103'); assert.equal(result.dlt.issue, '26102'); assert.equal(result.ssq.salesCloseAt, null);
  assert.throws(() => parseNextIssues(history('ssq'), source, now)); assert.throws(() => parseNextIssues(next, source, new Date('2026-09-08')));
});
test('collector archives, is repeatable, preserves last good data on failure, and clears unavailable next issue', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'numbers-source-')); t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const sources = { ssq: 'https://test/ssq', dlt: 'https://test/dlt', next: 'https://test/next', ssqDetail: () => 'https://test/sdetail', dltDetail: () => 'https://test/ddetail' };
  const bodies = { 'https://test/ssq': history('ssq'), 'https://test/dlt': history('dlt'), 'https://test/next': next, 'https://test/sdetail': ssqDetail(), 'https://test/ddetail': dltDetail() };
  const fetchImpl = async url => new Response(bodies[url], { status: 200 });
  const first = await syncNumberSources({ dataDir, now, sources, fetchImpl }); assert.equal(first.games.ssq.draws.length, 1); assert.equal(first.games.dlt.detailsOk, 1); assert.equal(first.games.ssq.nextIssue.issue, '26103');
  const count = fs.readdirSync(path.join(dataDir, 'raw')).length;
  await syncNumberSources({ dataDir, now, sources, fetchImpl }); assert.equal(fs.readdirSync(path.join(dataDir, 'raw')).length, count);
  const failed = await syncNumberSources({ dataDir, now, sources, fetchImpl: async () => new Response('blocked', { status: 403 }) });
  assert.equal(failed.games.ssq.status, 'stale'); assert.equal(failed.games.ssq.draws[0].payouts.base[3], 3000); assert.equal(failed.games.ssq.nextIssue, null); assert.ok(failed.status.results.some(r => r.httpStatus === 403 && r.rawRef));
  assert.ok(JSON.parse(fs.readFileSync(path.join(dataDir, 'sources.json'))).games.ssq.sourceStatus);
});
test('conflicting official detail identity cannot overwrite known draw numbers', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'numbers-conflict-')); t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const sources = { ssq: 'https://test/ssq', dlt: 'https://test/dlt', next: 'https://test/next', ssqDetail: () => 'https://test/sdetail', dltDetail: () => 'https://test/ddetail' };
  const fetchImpl = async url => new Response(url.endsWith('/ssq') ? history('ssq') : url.endsWith('/dlt') ? history('dlt') : url.endsWith('/next') ? next : url.endsWith('/sdetail') ? ssqDetail().replace('<b class="red">3</b>', '<b class="red">2</b>') : dltDetail());
  const result = await syncNumberSources({ dataDir, now, sources, fetchImpl }); assert.equal(result.games.ssq.draws[0].main[0], 3); assert.equal(result.games.ssq.status, 'degraded'); assert.ok(result.status.results.some(r => r.error === 'Detail/history identity mismatch'));
});
