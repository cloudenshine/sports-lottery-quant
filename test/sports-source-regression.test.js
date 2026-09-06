'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main: sync, parseJingcai, parseSFC } = require('../sync-sports-live');

const now = new Date('2026-09-06T02:00:00Z');
const jc = `<tr class="bet-tb-tr" data-fixtureid="123" data-matchnum="周日001" data-matchdate="2026-09-06" data-matchtime="23:00" data-simpleleague="英超" data-homesxname="甲队" data-awaysxname="乙队" data-rangqiu="-1"><span data-type="nspf" data-value="3" data-sp="2.10"></span><span data-type="nspf" data-value="1" data-sp="3.20"></span><span data-type="nspf" data-value="0" data-sp="3.00"></span></tr>`;
function sfcRow(index, odds = '2.10,3.20,3.00') {
  return `<tr class="bet-tb-tr" data-cid="${index}" data-vs="主${index}vs客${index}" data-bjpl="${odds}"></tr>`;
}
const completeSfc = Array.from({ length: 14 }, (_, i) => sfcRow(i + 1)).join('');
const malformedSfc = Array.from({ length: 14 }, (_, i) => sfcRow(i + 1, i === 12 ? '' : undefined)).join('');

function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sports-source-regression-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('SFC source row 13 with no fixed odds fails closed without invented values', () => {
  assert.throws(() => parseSFC(malformedSfc), /Invalid SFC fixture 13/);
  assert.deepEqual(parseSFC(completeSfc)[12].odds, { '3': 2.1, '1': 3.2, '0': 3 });
});

test('a failed SFC market does not discard a verified JCZQ market', async t => {
  const dir = temporaryDirectory(t);
  const payload = await sync({ dataDir: dir, now, fetch: async url => Buffer.from(url.includes('/jczq/') ? jc : malformedSfc) });
  assert.equal(payload.jingcaiCount, 1);
  assert.equal(payload.sfcCount, 0);
  assert.equal(payload.sourceStatus.status, 'partial');
  assert.equal(payload.sourceStatus.markets.jingcai.status, 'ok');
  assert.equal(payload.sourceStatus.markets.sfc.status, 'failed');
  assert.equal(payload.sourceErrors.sfc, 'Invalid SFC fixture 13');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sports_live.json'))).sfc, []);
});

test('source fixture extraction remains strict about provenance fields', () => {
  const match = parseJingcai(jc, { now })[0];
  assert.deepEqual(match.homeTeam.recentResults, []);
  assert.equal(match.homeTeam.rank, null);
  assert.deepEqual(match.h2h, []);
  assert.deepEqual(match.odds, { SPF: { '3': 2.1, '1': 3.2, '0': 3 } });
});
