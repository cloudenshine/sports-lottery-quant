'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { renderDashboard } = require('../research-dashboard');
const { resolvePublicPath } = require('../serve');
const root = path.join(__dirname, '..');

test('research app renders empty and malformed snapshots without inventing records', () => {
  for (const input of [undefined, null, {}, { schemaVersion: 2 }, { schemaVersion: 1, sources: { results: {} }, ledger: {}, sportsTournament: {} }]) {
    const html = renderDashboard(input);
    assert.match(html, /首次采集尚未完成/);
    assert.match(html, /尚无已登记的赛前预测/);
    assert.match(html, /样本门槛不会自动证明盈利/);
    assert.doesNotMatch(html, /NaN|undefined|>null</);
  }
});

test('research evidence stays separated by source and baseline, with pending returns explicit', () => {
  const html = renderDashboard({ schemaVersion: 1, generatedAt: '2026-09-06T00:00:00Z',
    data: { historyCount: 760, fixtureCount: 50 }, sources: { results: [{ sourceId: 'source-one', status: 'failed', error: 'HTTP 503', recordCount: 760 }] },
    ledger: { predictionCount: 14, settledPaperCount: 0, byModel: [{ modelId: 'market', predictionCount: 2, scoredCount: 1, settledPaperCount: 0, pendingCount: 2, properScores: { meanBrier: 0.6, logLossStatus: 'infinite' } }] },
    sportsTournament: { comparisons: [{ sourceId: 'source-two', candidate: 'elo', baseline: 'market', metric: 'logLoss', matchedEvents: 100, uncertainty: { meanDifference: 0.03, interval: [-0.02, 0.07] } }], returns: [{ sourceId: 'source-two', modelId: 'elo', matchedEvents: 0, totalNet: 0 }] },
    promotion: { eligible: false, settledEvents: 2, calendarDays: 1, reasons: ['规则尚待核验'] } });
  assert.match(html, /source-one/); assert.match(html, /HTTP 503/); assert.match(html, /source-two/);
  assert.match(html, /Elo 强度 \/ 市场去水/); assert.match(html, /\[-0.0200, 0.0700\]/);
  assert.match(html, /未满足结算条件/); assert.match(html, /尚未结算/); assert.match(html, /∞（实际结果被赋零概率）/);
  assert.match(html, /规则尚待核验/); assert.match(html, /历史探索 · 非前瞻证据/);
});

test('untrusted source and forecast fields cannot inject markup or script', () => {
  const attack = '<img src=x onerror="alert(1)"><script>bad</script>';
  const html = renderDashboard({ schemaVersion: 1, protocol: { protocolId: attack }, sources: { results: [{ sourceId: attack, status: attack, error: attack }] },
    recentPredictions: [{ recordedAt: '2026-09-06T00:00:00Z', payload: { source: { sourceId: attack }, match: { homeTeam: attack, awayTeam: 'B', kickoffAt: '2026-09-06T04:00:00Z' }, prediction: { modelId: attack, probabilities: [0.5, 0.2, 0.3] } } }] });
  assert.doesNotMatch(html, /<img|<script|onerror="/);
  assert.match(html, /&lt;img/); assert.match(html, /50.0% \/ 20.0% \/ 30.0%/);
});

test('assumed paper settlements and probability scores are distinct evidence columns', () => {
  const html = renderDashboard({ schemaVersion: 1, ledger: { assumedPaperCount: 3, assumedPaperTotals: { profit: -2.75 }, settledPaperCount: 0,
    byModel: [{ modelId: 'elo', predictionCount: 3, scoredCount: 3, assumedPaperCount: 3, assumedPaper: { profit: -2.75 }, settledPaperCount: 0, properScores: { meanLogLoss: 0.85, meanBrier: 0.51 } }] },
    recentSettlements: [{ payload: { status: 'settled_paper_assumption', scoring: { outcome: 'H', logLoss: 0.5 }, paper: { profit: 1.1 } } }] });
  assert.match(html, /数学假设下已结算 3 条，假设净额 -2.75 元/);
  assert.match(html, /概率：对数损失/); assert.match(html, /核验规则纸面净额/); assert.match(html, /数学假设纸面净额 \/ 条数/);
  assert.match(html, /-2.75 \/ 3/); assert.match(html, /已按数学假设纸面结算/);
  assert.match(html, /概率改善不等于净盈利/); assert.match(html, /两类均无真实下单或可兑奖收益/);
});

test('historical monetary rows show both decision policies and cash/market contrasts', () => {
  const common = { sourceId: 'mirror', modelId: 'elo', matchedEvents: 300, exposureBudget: 300, totalNet: -5.75, baselineExpectedNet: -7,
    netAgainstCash: { interval: [-0.33, 0.22] }, uncertainty: { interval: [-0.12, 0.25] },
    returnAgainstMarket: { net: -9.1, uncertainty: { interval: [-0.3, 0.4] } },
    fullBudgetRandomBaseline: { uncertainty: { interval: [-0.11, 0.21] } }, evidence: ['paper_assumption'], paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' };
  const html = renderDashboard({ schemaVersion: 1, sportsTournament: { returns: [
    { ...common, decisionPolicy: 'argmax', actualStake: 300, noBetCount: 0 },
    { ...common, decisionPolicy: 'ev-threshold', evThreshold: 1.05, actualStake: 275, noBetCount: 25 }
  ] } });
  assert.match(html, /每场选最高概率/); assert.match(html, /预期回报阈值 &gt; 1.05/); assert.doesNotMatch(html, /≥ 1.05/);
  assert.match(html, /300 \/ 25/); assert.match(html, /275 \/ 300/); assert.match(html, /-5.75/);
  assert.match(html, /\[-0.3300, 0.2200\]/); assert.match(html, /\[-0.3000, 0.4000\]/); assert.match(html, /\[-0.1100, 0.2100\]/);
  assert.match(html, /固定赔率数学假设/); assert.match(html, /fixed-decimal-1x2-paper-v1/);
  assert.match(html, /优于随机仍可能亏损/); assert.doesNotMatch(html, /未满足结算条件/);
});

test('live source count names and saved fixture statuses render without false future labels', () => {
  const html = renderDashboard({ schemaVersion: 1, data: { fixtureCount: 84 }, sources: { results: [
    { sourceId: 'espn', status: 'cached', records: 380, fixtures: 0 },
    { sourceId: 'both-fields', status: 'ok', recordCount: 0, fixtureCount: 4, records: 999, fixtures: 888 }
  ] } });
  assert.match(html, /380 \/ 0/); assert.match(html, /0 \/ 4/);
  assert.match(html, /赛程与状态记录/); assert.match(html, /已保存快照/);
  assert.doesNotMatch(html, /已采集未来赛程|999 \/ 888/);
});

test('promotion explains the fixed observation window in Chinese and keeps audit reasons collapsed', () => {
  const html = renderDashboard({ schemaVersion: 1, promotion: { status: 'COLLECTING_PROSPECTIVE_EVIDENCE', reasons: ['Each source/model uses all matched events.'] } });
  assert.match(html, /观察期仍在进行，按固定截止时间检验/);
  assert.match(html, /不把不同模型或来源的数量相加/);
  assert.match(html, /<details class="note"><summary>查看审计原因原文<\/summary><ul><li>Each source/);
  assert.doesNotMatch(html, /<details[^>]*open/);
});

test('official raw-page monitoring distinguishes collection, version review and contract verification', () => {
  const html = renderDashboard({ schemaVersion: 1, ruleWatch: { sourceCount: 11, failedCount: 0, reviewRequiredCount: 1, results: [
    { sourceId: 'reviewed', publisher: '官方机构', url: 'https://example.gov.cn/rules?a=1&b=2', status: 'cached', reviewRequired: false, lastSuccessfulFetchAt: '2026-09-06T00:00:00Z' },
    { sourceId: 'changed', url: 'javascript:alert(1)', status: 'ok', reviewRequired: true }
  ] } });
  assert.match(html, /可用官方原文 <strong>11<\/strong>/);
  assert.match(html, /待复核 <strong>1<\/strong>/); assert.match(html, /该版本已复核/);
  assert.match(html, /不会自动补齐尚待核验的合同条款/);
  assert.match(html, /href="https:\/\/example.gov.cn\/rules\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test('research public routes do not expose the private ledger or raw archives', () => {
  assert.equal(resolvePublicPath(root, '/research.html'), fs.realpathSync(path.join(root, 'research.html')));
  assert.equal(resolvePublicPath(root, '/research-dashboard.js'), fs.realpathSync(path.join(root, 'research-dashboard.js')));
  for (const url of ['/data/research/protocol.json', '/data/research/ledger/predictions/secret.json', '/data/research/raw/source.json', '/research-ledger.js']) assert.equal(resolvePublicPath(root, url), null);
});

test('source apps link to research and research standalone contains its renderer', () => {
  for (const name of ['index.html', 'sports.html']) assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /href="research\.html"/);
  const html = fs.readFileSync(path.join(root, 'research-standalone.html'), 'utf8');
  assert.doesNotMatch(html, /<script src=/);
  assert.match(html, /function renderDashboard/);
  let count = 0;
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) { new vm.Script(match[1]); count++; }
  assert.equal(count, 1);
  const renderer = fs.readFileSync(path.join(root, 'research-dashboard.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  assert.ok(html.includes(renderer), 'standalone must embed the current renderer');
});
