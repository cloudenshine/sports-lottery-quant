'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const vm = require('node:vm');
const { parseJingcai, parseSFC, fetchBuffer, writeFileSet, main: sync } = require('../sync-sports-live');
const { parseSsq, parseDlt, validateDraws, assertPreservesHistory, update } = require('../update-all-history');
const { createServer, resolvePublicPath } = require('../serve');
const now = new Date('2026-09-06T02:00:00Z');
const options = { now };
const market = (type = 'nspf') => ['3', '1', '0'].map((v, i) => `<span data-sp='${2 + i}' data-value='${v}' data-type='${type}'></span>`).join('');
const jc = (body = market(), attrs = '') => `<tr data-fixtureid='123' data-matchnum='周日001' data-matchdate='2026-09-06' data-matchtime='23:00' data-homesxname='甲队' data-awaysxname='乙队' data-rangqiu='-1' class='active bet-tb-tr' ${attrs}>${body}</tr>`;
const sfc = Array.from({ length: 14 }, (_, i) => `<tr data-vs='主${i} vs 客${i}' data-bjpl='2.10,3.20,3.00' class='bet-tb-tr active'></tr>`).join('');
function historyRow(game, issue = '26101', date = '2026-09-01', balls) {
  return `<tr class='t_tr1'>${[issue, ...(balls || (game === 'ssq' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 1, 2])), date].map(v => `<td>${v}</td>`).join('')}</tr>`;
}
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lottery-integrity-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('build and analysis modules import without data reads, writes or execution', () => {
  const read = fs.readFileSync;
  const readGuard = mock.method(fs, 'readFileSync', (file, ...args) => {
    if (typeof file === 'string' && /[\\/]data[\\/]/.test(file)) throw new Error('Unexpected import-time data read');
    return read(file, ...args);
  });
  const writeGuard = mock.method(fs, 'writeFileSync', () => { throw new Error('Unexpected import-time write'); });
  try {
    for (const name of ['../build-compact', '../analyze']) {
      delete require.cache[require.resolve(name)];
      assert.doesNotThrow(() => require(name));
    }
  } finally { readGuard.mock.restore(); writeGuard.mock.restore(); }
});
test('compact and statistics CLIs accept canonical array histories and derive correct metadata', t => {
  const dir = temp(t);
  const { buildCompact } = require('../build-compact');
  const { analyze, analyzeSSQ } = require('../analyze');
  const ssq = parseSsq(historyRow('ssq'), options);
  const dlt = parseDlt(historyRow('dlt'), options);
  fs.writeFileSync(path.join(dir, 'ssq_history.json'), JSON.stringify(ssq));
  fs.writeFileSync(path.join(dir, 'dlt_history.json'), JSON.stringify(dlt));
  const meta = buildCompact({ dataDir: dir, now });
  assert.equal(meta.ssq.total, 1);
  assert.equal(meta.dlt.latestIssue, '26101');
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(dir, 'ssq-compact.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(dir, 'dlt-compact.js'), 'utf8'), context);
  assert.equal(JSON.stringify(context.window.SSQ_DRAWS), '[[1,2,3,4,5,6,7]]');
  assert.equal(JSON.stringify(context.window.DLT_DRAWS), '[[1,2,3,4,5,1,2]]');
  assert.equal(context.window.SSQ_META.latestDraw.issue, '26101');
  const stats = analyze({ dataDir: dir, now });
  assert.equal(stats.ssq.total, 1);
  assert.equal(stats.ssq.blue['7'], 1);
  assert.equal(stats.ssq.sum.min, 21);
  assert.equal(stats.dlt.sum.min, 15);
  assert.equal(stats.dlt.universe.full, 21425712);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'stats.json'))), stats);
  assert.throws(() => analyzeSSQ({ draws: ssq }, options), /history/);
  const previousBundle = fs.readFileSync(path.join(dir, 'ssq-compact.js'), 'utf8');
  const previousStats = fs.readFileSync(path.join(dir, 'stats.json'), 'utf8');
  fs.writeFileSync(path.join(dir, 'dlt_history.json'), JSON.stringify([{ ...dlt[0], main: [1, 1, 3, 4, 5] }]));
  assert.throws(() => buildCompact({ dataDir: dir, now }), /Invalid main/);
  assert.throws(() => analyze({ dataDir: dir, now }), /Invalid main/);
  assert.equal(fs.readFileSync(path.join(dir, 'ssq-compact.js'), 'utf8'), previousBundle);
  assert.equal(fs.readFileSync(path.join(dir, 'stats.json'), 'utf8'), previousStats);
});
test('descriptive single-pair counts exclude two pairs in both lottery games', () => {
  const { analyzeSSQ, analyzeDLT } = require('../analyze');
  for (const [game, analyzeGame, twoPair, onePair] of [
    ['ssq', analyzeSSQ, [1, 2, 10, 11, 20, 30], [1, 2, 10, 15, 20, 30]],
    ['dlt', analyzeDLT, [1, 2, 10, 11, 20], [1, 2, 10, 15, 20]],
  ]) {
    const special = game === 'ssq' ? [7] : [1, 5];
    const draws = [
      { issue: '26101', date: '2026-09-01', main: twoPair, special },
      { issue: '26100', date: '2026-08-30', main: onePair, special },
    ];
    const stats = analyzeGame(draws, options);
    assert.deepEqual(stats.consecutive.onePairOnly, [1, '50.00%']);
    assert.deepEqual(stats.consecutive.twoPairs, [1, '50.00%']);
  }
});
test('five-draw and twenty-draw pools use their own complete historical windows', () => {
  const { analyzeSSQ } = require('../analyze');
  // Synthetic fixtures intentionally repeat numbers so every eligible sample
  // has an independently obvious overlap of six, with no prediction involved.
  const draws = Array.from({ length: 21 }, (_, i) => ({ issue: String(26101 - i),
    date: new Date(Date.parse('2026-09-06T00:00:00Z') - i * 86400000).toISOString().slice(0, 10),
    main: [1, 2, 10, 15, 20, 30], special: [7] }));
  const short = analyzeSSQ(draws.slice(0, 6), options).recency;
  assert.deepEqual(short.overlapLast5DrawPool, [0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(short.overlapLast20DrawPool, [0, 0, 0, 0, 0, 0, 0]);
  const full = analyzeSSQ(draws, options).recency;
  assert.deepEqual(full.overlapLast5DrawPool, [0, 0, 0, 0, 0, 0, 16]);
  assert.deepEqual(full.overlapLast20DrawPool, [0, 0, 0, 0, 0, 0, 1]);
});

test('source odds are parsed independent of attribute order without invented form or markets', () => {
  const match = parseJingcai(jc(), options)[0];
  assert.deepEqual(match.odds, { SPF: { '3': 2, '1': 3, '0': 4 } });
  assert.deepEqual(match.homeTeam.recentResults, []);
  assert.equal(match.homeTeam.homeMatches, undefined);
  assert.deepEqual(match.h2h, []);
  assert.equal(match.dataQuality.teamStatistics, 'unavailable');
  assert.equal(match.dataQuality.salesStatus, 'unverified');
  assert.equal(match.kickoffAt, '2026-09-06T15:00:00.000Z');
  const handicapOnly = parseJingcai(jc(market('spf')), options)[0];
  assert.equal(handicapOnly.odds.SPF, undefined);
  assert.deepEqual(handicapOnly.odds.RQSPF, { handicap: -1, '3': 2, '1': 3, '0': 4 });
});
test('malformed, duplicate, stale or unquoted fixtures fail closed', () => {
  for (const html of ['', '<html>Access denied</html>', jc(''), jc() + jc(), jc().replace('2026-09-06', '2026-02-30'), jc().replace('2026-09-06', '2026-09-05'), jc().replace('甲队', '甲\u0001队')]) assert.throws(() => parseJingcai(html, options));
  assert.throws(() => parseJingcai(jc(), { now: new Date('invalid') }));
});
test('SFC requires fourteen complete source rows and never substitutes odds', () => {
  assert.equal(parseSFC(sfc).length, 14);
  assert.equal(parseSFC(sfc)[0].dataQuality.issue, 'unavailable');
  assert.throws(() => parseSFC(sfc.replace('2.10,3.20,3.00', '')));
  assert.throws(() => parseSFC(sfc.replace('2.10,3.20,3.00', 'NaN,3.20,3.00')));
  assert.throws(() => parseSFC(sfc.replace(/<tr[^>]*><\/tr>/, '')));
});
test('history validates every ball, issue, date and chronology', () => {
  const valid = parseSsq(historyRow('ssq'), options);
  assert.deepEqual(valid[0].main, [1, 2, 3, 4, 5, 6]);
  assert.equal(parseDlt(historyRow('dlt'), options)[0].special.length, 2);
  for (const html of ['', historyRow('ssq', '26101', '2026-09-07'), historyRow('ssq', '26101', '2026-02-30'), historyRow('ssq', '25101'), historyRow('ssq', '26101', '2026-09-01', [1, 2, 'NaN', 4, 5, 6, 7]), historyRow('ssq', '26101', '2026-09-01', [1, 2, 2, 4, 5, 6, 7]), historyRow('ssq', '26101', '2026-09-01', [1, 2, 3, 4, 5, 34, 7]), historyRow('ssq') + historyRow('ssq'), historyRow('ssq') + historyRow('ssq', '26099', '2026-08-28')]) assert.throws(() => parseSsq(html, options));
  const reverse = parseSsq(historyRow('ssq', '26100', '2026-08-30') + historyRow('ssq'), options);
  assert.equal(reverse[0].issue, '26101');
  assert.throws(() => validateDraws([{ ...valid[0], special: [17] }], 'ssq', options));
  assert.throws(() => assertPreservesHistory(valid, [], 'ssq', options));
  assert.throws(() => assertPreservesHistory(valid, [{ ...valid[0], special: [8] }], 'ssq', options));
});
test('failed sports and history imports preserve all previous files', async t => {
  const dir = temp(t);
  for (const name of ['sports_live.json', 'sports-live-data.js', 'ssq_history.json', 'dlt_history.json']) fs.writeFileSync(path.join(dir, name), 'previous');
  await assert.doesNotReject(sync({ dataDir: dir, now, fetch: async url => Buffer.from(url.includes('jczq') ? jc() : 'broken') }));
  const partial = JSON.parse(fs.readFileSync(path.join(dir, 'sports_live.json')));
  assert.equal(partial.jingcaiCount, 1);
  assert.equal(partial.sfcCount, 0);
  assert.equal(partial.sourceStatus.markets.jingcai.status, 'ok');
  assert.equal(partial.sourceStatus.markets.sfc.status, 'failed');
  assert.match(partial.sourceErrors.sfc, /No recognized match rows/);
  await assert.rejects(update({ dataDir: dir, now, minimumCounts: { ssq: 1, dlt: 1 }, fetch: async () => Buffer.from('broken') }));
  for (const name of ['ssq_history.json', 'dlt_history.json']) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'previous');
});
test('a later history source failure cannot publish the earlier source', async t => {
  const dir = temp(t);
  const old = parseSsq(historyRow('ssq', '26100', '2026-08-30'), options);
  const stored = JSON.stringify(old);
  fs.writeFileSync(path.join(dir, 'ssq_history.json'), stored);
  fs.writeFileSync(path.join(dir, 'ssq-compact.js'), 'old bundle');
  await assert.rejects(update({ dataDir: dir, now, minimumCounts: { ssq: 1, dlt: 1 }, fetch: async url => {
    if (url.includes('/dlt/')) throw new Error('DLT source unavailable');
    return Buffer.from(historyRow('ssq') + historyRow('ssq', '26100', '2026-08-30'));
  } }), /DLT source unavailable/);
  assert.equal(fs.readFileSync(path.join(dir, 'ssq_history.json'), 'utf8'), stored);
  assert.equal(fs.readFileSync(path.join(dir, 'ssq-compact.js'), 'utf8'), 'old bundle');
});
test('offline valid imports publish consistent source metadata and compact bundles', async t => {
  const dir = temp(t);
  await sync({ dataDir: dir, now, fetch: async url => Buffer.from(url.includes('jczq') ? jc() : sfc) });
  const payload = JSON.parse(fs.readFileSync(path.join(dir, 'sports_live.json')));
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.dataKind, 'source-snapshot');
  assert.equal(payload.jingcaiCount, payload.jingcai.length);
  const result = await update({ dataDir: dir, now, minimumCounts: { ssq: 1, dlt: 1 }, fetch: async url => Buffer.from(historyRow(url.includes('/ssq/') ? 'ssq' : 'dlt')) });
  assert.equal(result.ssq.latestIssue, '26101');
  assert.match(fs.readFileSync(path.join(dir, 'ssq-compact.js'), 'utf8'), /window.SSQ_DRAWS = \[\[1,2,3,4,5,6,7\]\]/);
});
test('a failure during replacement rolls back already replaced files', t => {
  const dir = temp(t), first = path.join(dir, 'a'), second = path.join(dir, 'b');
  fs.writeFileSync(first, 'old-a'); fs.writeFileSync(second, 'old-b');
  const rename = fs.renameSync;
  const patched = mock.method(fs, 'renameSync', (from, to) => { if (to === second) throw new Error('disk failure'); return rename(from, to); });
  try { assert.throws(() => writeFileSet([[first, 'new-a'], [second, 'new-b']]), /disk failure/); } finally { patched.mock.restore(); }
  assert.equal(fs.readFileSync(first, 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(second, 'utf8'), 'old-b');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a', 'b']);
});
test('HTTP source failures and oversized responses reject rather than parse an error page', async () => {
  for (const [statusCode, body, maxBytes] of [[503, 'failure', 100], [200, 'too large', 2]]) {
    const patched = mock.method(https, 'get', (_url, _opts, cb) => {
      const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = error => req.emit('error', error);
      queueMicrotask(() => { const response = Readable.from([Buffer.from(body)]); response.statusCode = statusCode; cb(response); });
      return req;
    });
    try { await assert.rejects(fetchBuffer('https://fixture.invalid', { maxBytes })); } finally { patched.mock.restore(); }
  }
});
test('static server rejects traversal and private files, supports HEAD and restricts methods', async t => {
  const dir = temp(t);
  fs.writeFileSync(path.join(dir, 'sports.html'), 'fixture');
  fs.writeFileSync(path.join(dir, 'package.json'), 'private');
  fs.mkdirSync(path.join(dir, 'docs', 'testing'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'testing', 'scientific-evaluation.json'), '{"fixture":true}');
  for (const url of ['/../package.json', '/%2e%2e/package.json', '/%2e%2e%5cpackage.json', '/.git/config', '/package.json', '/%ZZ', '/sports.html%00']) assert.equal(resolvePublicPath(dir, url), null);
  const server = createServer({ root: dir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (url, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method }, res => { let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, body })); });
    req.on('error', reject); req.end();
  });
  assert.deepEqual(await request('/'), { status: 200, body: 'fixture' });
  assert.deepEqual(await request('/sports.html', 'HEAD'), { status: 200, body: '' });
  assert.equal((await request('/package.json')).status, 404);
  assert.deepEqual(await request('/docs/testing/scientific-evaluation.json'), { status: 200, body: '{"fixture":true}' });
  assert.equal((await request('/docs/testing/private.json')).status, 404);
  assert.equal((await request('/sports.html', 'POST')).status, 405);
  const info = JSON.parse((await request('/api/server-info')).body);
  assert.equal(info.port, server.address().port);
  assert.equal(info.lanEnabled, false);
});
