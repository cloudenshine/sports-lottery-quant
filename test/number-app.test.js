'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../number-app');
const models = require('../number-models');
const now = Date.parse('2026-09-06T00:00:00Z');
const input = { gameId: 'ssq', modelId: 'uniform', count: '5', budget: '10', seed: '0', additional: false };
const history = [{ issue: '2026001', date: '2026-01-01', main: [1, 2, 3, 4, 5, 6], special: [7] }];
const game = { draws: history, nextIssue: { issue: '2026102', drawAt: '2026-09-06T13:15:00Z', salesCloseAt: null, source: { sourceId: 'fixture', fetchedAt: '2026-09-06T00:00:00Z' } }, registration: { eligible: true, sourceFresh: true, cutoff: '2026-09-06T10:15:00Z' } };

test('number app validates exact budget, seed zero and DLT additional cost', () => {
  assert.equal(app.validateSelection(input).seed, 0);
  assert.equal(app.validateSelection({ ...input, gameId: 'dlt', additional: true, budget: '15' }).costYuan, 15);
  for (const patch of [{ count: '1.1' }, { count: 101 }, { seed: '' }, { seed: -1 }, { budget: 'NaN' }, { budget: 9 }, { modelId: 'constructor' }, { gameId: 'invalid' }]) assert.throws(() => app.validateSelection({ ...input, ...patch }));
  assert.throws(() => app.validateSelection({ ...input, gameId: 'dlt', additional: true }), /预算不足/);
});
test('readiness uses server eligibility, research cutoff and real source instead of source-wide failure', () => {
  assert.equal(app.issueReadiness({ ...game, sourceStatus: 'degraded' }, now).ready, true);
  for (const changed of [{}, { ...game, nextIssue: null }, { ...game, draws: [] }, { ...game, registration: null }, { ...game, registration: { ...game.registration, eligible: false } }, { ...game, nextIssue: { ...game.nextIssue, source: null } }]) assert.equal(app.issueReadiness(changed, now).ready, false);
  assert.equal(app.issueReadiness(game, Date.parse(game.registration.cutoff)).ready, false);
  assert.equal(app.issueReadiness(game, Date.parse(game.nextIssue.drawAt) + 1).ready, false);
});
test('readiness independently expires a source after 24 hours and rejects future or missing capture times', () => {
  const withCapturedAt = fetchedAt => ({ ...game, nextIssue: { ...game.nextIssue, source: { ...game.nextIssue.source, fetchedAt } } });
  assert.equal(app.issueReadiness(withCapturedAt(new Date(now - 24 * 3600000).toISOString()), now).ready, true);
  for (const value of [undefined, 'invalid', new Date(now + 1).toISOString(), new Date(now - 24 * 3600000 - 1).toISOString()]) assert.equal(app.issueReadiness(withCapturedAt(value), now).ready, false);
});
test('new app generates valid complete-combination probabilities reproducibly through NumberModels', () => {
  const result = app.generateSelection(models, game, input, now);
  assert.equal(result.selection.seed, 0);
  assert.equal(result.tickets.length, 5);
  assert.equal(result.purpose, 'exploratory_paper_only');
  assert.deepEqual(result.tickets, app.generateSelection(models, game, input, now).tickets);
  for (const ticket of result.tickets) {
    assert.equal(ticket.probabilityRatio, 1);
    assert.equal(ticket.probability, Math.exp(ticket.logProbability));
    assert.equal(ticket.main.length, 6);
    assert.equal(ticket.special.length, 1);
  }
  assert.throws(() => app.generateSelection(null, game, input, now), /引擎/);
  assert.throws(() => app.generateSelection(models, {}, input, now), /目标期/);
});
test('all seven candidates generate both games through the new engine with an equal-cost baseline', () => {
  for (const modelId of Object.keys(app.names)) for (const gameId of ['ssq', 'dlt']) {
    const sample = gameId === 'ssq' ? game : { ...game, draws: [{ ...history[0], main: [1, 2, 3, 4, 5], special: [6, 7] }] };
    const result = app.generateSelection(models, sample, { ...input, gameId, modelId }, now);
    assert.equal(result.selection.costYuan, 10);
    assert.equal(result.tickets.length, 5);
    assert.equal(new Set(result.tickets.map(t => t.main.join(',') + '/' + t.special.join(','))).size, 5);
    assert.ok(result.tickets.every(t => t.probability > 0 && t.probability <= 1 && t.baselineProbability > 0));
  }
});

function fakeDOM() {
  const elements = {};
  const node = id => elements[id] ||= { value: '', innerHTML: '', textContent: '', disabled: false, hidden: false, listeners: {}, setAttribute(key, value) { this[key] = value; }, addEventListener(event, fn) { this.listeners[event] = fn; } };
  for (const [id, value] of Object.entries({ model: 'uniform', count: '5', budget: '10', seed: '0', additional: 'false' })) node(id).value = value;
  return { elements, getElementById: node, body: { appendChild() {} }, createElement() { return { click() {}, remove() {} }; } };
}
function currentGame() {
  const future = new Date(Date.now() + 86400000).toISOString();
  return { ...game, nextIssue: { ...game.nextIssue, drawAt: future, source: { ...game.nextIssue.source, fetchedAt: new Date().toISOString() } }, registration: { ...game.registration, cutoff: new Date(Date.now() + 3600000).toISOString() } };
}
test('empty/offline dashboard is safe and cannot imply a successful registration', () => {
  const dom = fakeDOM();
  app.mount(dom, { location: { protocol: 'file:' }, NumberModels: models });
  assert.equal(dom.elements.generate.disabled, true);
  assert.equal(dom.elements.register.disabled, true);
  assert.match(dom.elements['registration-status'].textContent, /只读快照/);
  assert.match(dom.elements['evaluation-summary'].innerHTML, /尚无/);
});
test('selection changes and failed generation invalidate results and exports', () => {
  const dom = fakeDOM();
  const mounted = app.mount(dom, { NUMBER_DASHBOARD: { games: { ssq: currentGame(), dlt: currentGame() } }, location: { protocol: 'http:' }, NumberModels: models });
  dom.elements.generate.listeners.click();
  assert.ok(mounted.getResult());
  assert.equal(dom.elements['export-json'].disabled, false);
  dom.elements.seed.value = '1'; dom.elements.seed.listeners.input();
  assert.equal(mounted.getResult(), null);
  assert.equal(dom.elements['export-json'].disabled, true);
  assert.equal(dom.elements.generated.innerHTML, '');
  dom.elements.generate.listeners.click();
  dom.elements.budget.value = '1'; dom.elements.generate.listeners.click();
  assert.equal(mounted.getResult(), null);
  assert.match(dom.elements['generation-status'].textContent, /预算/);
  dom.elements['game-dlt'].listeners.click();
  assert.equal(dom.elements['additional-control'].hidden, false);
});
test('source strings and report model names are escaped before HTML insertion', () => {
  const dom = fakeDOM();
  const evil = '<img src=x onerror="alert(1)">';
  const data = { ...currentGame(), report: { byModel: [{ modelId: evil, actualPrizeSamples: 1, meanNetDifference: null, decision: 'not_proven' }] }, ledgerSummary: { predictionCount: evil } };
  data.nextIssue = { ...data.nextIssue, issue: evil };
  app.mount(dom, { NUMBER_DASHBOARD: { games: { ssq: data }, sources: [{ sourceId: evil }] }, location: { protocol: 'file:' }, NumberModels: models });
  for (const id of ['data-summary', 'source-details', 'evaluation-summary', 'ledger-summary']) assert.doesNotMatch(dom.elements[id].innerHTML, /<img/);
  assert.match(dom.elements['data-summary'].innerHTML, /&lt;img/);
});
test('registration errors remain errors; successful request reloads the server dashboard', async () => {
  const dom = fakeDOM();
  const calls = [];
  const environment = { NUMBER_DASHBOARD: { games: { ssq: currentGame() } }, location: { protocol: 'http:', hostname: '127.0.0.1' }, NumberModels: models, fetch: async (url, options) => { calls.push({ url, options }); return { ok: false, json: async () => ({ error: '固定协议校验失败' }) }; } };
  const mounted = app.mount(dom, environment);
  await mounted.ready;
  calls.length = 0;
  await dom.elements.register.listeners.click();
  assert.match(dom.elements['registration-status'].textContent, /固定协议校验失败/);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { gameId: 'ssq' });
  const refreshed = { generatedAt: new Date().toISOString(), games: { ssq: { ...currentGame(), ledgerSummary: { predictionCount: 7, settledCount: 0, pendingCount: 7 } } } };
  environment.fetch = async url => ({ ok: true, json: async () => url.endsWith('dashboard') ? refreshed : { ok: true } });
  await dom.elements.register.listeners.click();
  assert.equal(mounted.getDashboard(), refreshed);
  assert.match(dom.elements['registration-status'].textContent, /完成/);
});
test('local mount refreshes once, replacing stale eligibility and ledger with the server snapshot', async () => {
  const dom = fakeDOM();
  const snapshot = { generatedAt: '2026-01-01T00:00:00Z', games: { ssq: {} } };
  const latest = { generatedAt: new Date().toISOString(), games: { ssq: { ...currentGame(), ledgerSummary: { batchCount: 2, predictionCount: 14, settledCount: 1, pendingCount: 1 } } } };
  const calls = [];
  let resolveFetch;
  const mounted = app.mount(dom, { NUMBER_DASHBOARD: snapshot, NumberModels: models, location: { protocol: 'http:', hostname: 'localhost' }, fetch: (url, options) => { calls.push({ url, options }); return new Promise(resolve => { resolveFetch = resolve; }); } });
  assert.equal(mounted.getDashboard(), snapshot);
  assert.equal(dom.elements.register.disabled, true);
  resolveFetch({ ok: true, json: async () => latest });
  await mounted.ready;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/numbers/dashboard');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(mounted.getDashboard(), latest);
  assert.equal(dom.elements.register.disabled, false);
  assert.match(dom.elements['global-status'].textContent, /最新数据/);
});
test('initial refresh failures preserve snapshot and show a visible failure without asserting freshness', async () => {
  for (const fetch of [async () => { throw new Error('connection refused'); }, async () => ({ ok: true, json: async () => ({ error: 'wrong payload' }) })]) {
    const dom = fakeDOM();
    const snapshot = { games: { ssq: currentGame() } };
    const mounted = app.mount(dom, { NUMBER_DASHBOARD: snapshot, NumberModels: models, location: { protocol: 'http:', hostname: 'localhost' }, fetch });
    await mounted.ready;
    assert.equal(mounted.getDashboard(), snapshot);
    assert.match(dom.elements['global-status'].textContent, /刷新失败/);
    assert.match(dom.elements['data-refresh-status'].textContent, /保留原快照/);
    assert.doesNotMatch(dom.elements['global-status'].textContent, /已读取本机最新数据/);
  }
});
test('return table shows whole-window losses and clearly separates log E distribution evidence', () => {
  const dom = fakeDOM();
  app.mount(dom, { NUMBER_DASHBOARD: { games: { ssq: { ...currentGame(), report: { byModel: [{ modelId: 'uniform', actualPrizeSamples: 120, netYuan: -950, meanNetDifference: 0, logE: -3.75, decision: 'not_proven' }] } } } }, location: { protocol: 'file:' }, NumberModels: models });
  const html = dom.elements['evaluation-summary'].innerHTML;
  assert.match(html, /全窗口净额/);
  assert.match(html, /-950/);
  assert.match(html, /-3.75/);
  assert.match(html, /不是收益证据/);
});
test('standalone snapshots and remote-host pages cannot write a local registration', async () => {
  for (const location of [{ protocol: 'https:', hostname: 'example.com' }, { protocol: 'http:', hostname: 'localhost' }]) {
    const dom = fakeDOM();
    let fetched = false;
    app.mount(dom, { NUMBER_APP_OFFLINE: location.hostname === 'localhost', NUMBER_DASHBOARD: { games: { ssq: currentGame() } }, NumberModels: models, location, fetch: async () => { fetched = true; } });
    assert.equal(dom.elements.register.disabled, true);
    await dom.elements.register.listeners.click();
    assert.equal(fetched, false);
  }
});
test('CSV export quotes fields and neutralizes spreadsheet formulas in source-derived issue strings', () => {
  const result = app.generateSelection(models, game, input, now);
  result.target = { ...result.target, issue: '=HYPERLINK("bad")' };
  const content = app.csv(result);
  assert.match(content, /"'=HYPERLINK\(""bad""\)"/);
  assert.match(content, /exploratory_paper_only/);
});
test('main application loads only the new number engine and keeps legacy tools a separate link', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /src="number-models.js"/);
  assert.match(html, /src="data\/numbers\/dashboard.js"/);
  assert.match(html, /href="number-tools.html"/);
  assert.doesNotMatch(html, /src="engine.js"|crowdScore|structureScore|generateSmartPool/);
  assert.ok(fs.existsSync(path.join(__dirname, '../number-tools.html')));
});
