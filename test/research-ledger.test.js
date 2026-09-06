'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { createLedger } = require('../research-ledger');

const before = '2026-09-01T10:00:00.000Z';
const after = '2026-09-01T15:00:00.000Z';
function prediction() {
  return { protocolId: 'prospective-v1', windowId: 'T24', match: { eventId: 'match-1', kickoffAt: '2026-09-01T12:00:00.000Z', homeTeam: 'Home', awayTeam: 'Away', competition: 'League', odds: { home: 2, draw: 3, away: 4 } }, source: { sourceId: 'official', sourceUrl: 'https://example.org/events', fetchedAt: before, bodySha256: 'a'.repeat(64) }, prediction: { modelId: 'poisson', version: '1', probabilities: [0.5, 0.25, 0.25], trainingCutoff: '2026-08-31T23:59:59Z', trainingCount: 100, assumptions: ['90 minute result'] }, oddsObservedAt: before, paperTrade: { selection: 'H', stake: 2 } };
}
function result(homeGoals = 2, awayGoals = 0) {
  return { match: { ...prediction().match, status: 'finished', homeGoals, awayGoals }, source: { ...prediction().source, fetchedAt: after, bodySha256: 'b'.repeat(64) } };
}
const rules = { verified: true, market: '1X2_REGULATION', ruleId: 'regulation-v1', sourceUrl: 'https://example.org/rules', verifiedAt: after };
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-ledger-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let current = before;
  return { directory, ledger: createLedger({ directory, now: () => current }), advance: (value = after) => { current = value; } };
}

test('prediction is immutable, exact replay is idempotent across restart and later time', t => {
  const f = fixture(t); const p = prediction();
  const first = f.ledger.recordPrediction(p);
  assert.deepEqual(f.ledger.recordPrediction(p), first);
  f.advance();
  assert.deepEqual(createLedger({ directory: f.directory, now: () => after }).recordPrediction(p), first);
  p.prediction.probabilities = [0.4, 0.3, 0.3];
  assert.throws(() => f.ledger.recordPrediction(p), /conflict/);
  assert.equal(f.ledger.listPredictions().length, 1);
});
test('same key does not silently replace model version or source snapshot', t => {
  const { ledger } = fixture(t); const p = prediction(); ledger.recordPrediction(p);
  p.prediction.version = '2'; assert.throws(() => ledger.recordPrediction(p), /conflict/);
  p.prediction.version = '1'; p.source.bodySha256 = 'f'.repeat(64); assert.throws(() => ledger.recordPrediction(p), /conflict/);
});
test('batch provenance is immutable, propagated to summary, and does not change prediction unique key', t => {
  const { ledger } = fixture(t); const p = prediction(); p.batchId = 'c'.repeat(64);
  const first = ledger.recordPrediction(p);
  assert.equal(first.payload.batchId, p.batchId);
  assert.deepEqual(ledger.recordPrediction(p), first);
  const row = ledger.summary().rows[0];
  assert.equal(row.batchId, p.batchId);
  assert.equal(row.sourceBodySha256, p.source.bodySha256);
  assert.equal(row.sourceFetchedAt, p.source.fetchedAt);
  p.batchId = 'd'.repeat(64);
  assert.throws(() => ledger.recordPrediction(p), /immutable prediction key conflict/);
  delete p.batchId;
  assert.throws(() => ledger.recordPrediction(p), /immutable prediction key conflict/);
  assert.equal(ledger.listPredictions().length, 1);
});
test('batch provenance rejects malformed IDs and legacy predictions retain a null summary batch', t => {
  const { ledger } = fixture(t);
  for (const batchId of ['not-a-hash', 'a'.repeat(63), null, 1]) {
    const p = prediction(); p.batchId = batchId;
    assert.throws(() => ledger.recordPrediction(p), /batchId/);
  }
  const saved = ledger.recordPrediction(prediction());
  assert.equal(Object.hasOwn(saved.payload, 'batchId'), false);
  assert.equal(ledger.summary().rows[0].batchId, null);
});
test('new prediction forbids historical backfill, known results and future training/source/odds', t => {
  const f = fixture(t);
  for (const change of [p => { p.match.kickoffAt = before; }, p => { p.match.status = 'finished'; }, p => { p.match.homeGoals = 0; }, p => { p.prediction.trainingCutoff = after; }, p => { p.source.fetchedAt = after; }, p => { p.oddsObservedAt = after; }]) {
    const p = prediction(); change(p); assert.throws(() => f.ledger.recordPrediction(p));
  }
  assert.equal(f.ledger.listPredictions().length, 0);
});
test('invalid probabilities and invented paper price rejected', t => {
  const { ledger } = fixture(t);
  for (const probabilities of [[0.5, 0.5, 0.5], [-1, 1, 1], [NaN, 0, 1]]) { const p = prediction(); p.prediction.probabilities = probabilities; assert.throws(() => ledger.recordPrediction(p)); }
  const p = prediction(); p.paperTrade.decimalOdds = 100; assert.throws(() => ledger.recordPrediction(p), /observed odds/);
});
test('results require final scores and authentic time, never turn missing values into zero', t => {
  const f = fixture(t); f.advance();
  const missing = result(); delete missing.match.homeGoals; assert.throws(() => f.ledger.recordResult(missing), /goals/);
  const live = result(); live.match.status = 'live'; assert.throws(() => f.ledger.recordResult(live), /final/);
  const future = result(); future.source.fetchedAt = '2026-09-02T00:00:00Z'; assert.throws(() => f.ledger.recordResult(future), /future/);
  const early = result(); early.source.fetchedAt = before; assert.throws(() => f.ledger.recordResult(early), /after kickoff/);
});
test('unverified rules keep monetary settlement pending, then verified paper result is idempotent', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const r = f.ledger.recordResult(result());
  const pending = f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id });
  assert.equal(pending.payload.status, 'pending_rule_verification'); assert.equal(pending.payload.paper, null);
  const pendingSummary = f.ledger.summary();
  assert.equal(pendingSummary.byModel[0].properScores.count, 1);
  assert.equal(pendingSummary.byModel[0].paper.profit, 0);
  assert.deepEqual(pendingSummary.pendingReasons, { pending_rule_verification: 1 });
  assert.equal(pendingSummary.bySource[0].sourceId, 'official');
  const settled = f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id, ruleVerification: rules });
  assert.equal(settled.payload.paper.profit, 2);
  assert.equal(settled.payload.paper.stake, 2);
  assert.equal(settled.payload.paper.execution, 'paper_only');
  assert.ok(Math.abs(settled.payload.paper.randomExpectedProfit - (4 / 3 - 2)) < 1e-12);
  assert.deepEqual(f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id, ruleVerification: rules }), settled);
  const summary = f.ledger.summary(); assert.equal(summary.settledPaperCount, 1); assert.equal(summary.totals.profit, 2); assert.equal(summary.predictiveAdvantage, 'not_established');
});
test('source score correction retains old records and excludes obsolete settlement from totals', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const r = f.ledger.recordResult(result());
  f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id, ruleVerification: rules });
  const correction = result(0, 2); correction.source.fetchedAt = '2026-09-01T16:00:00Z'; f.advance(correction.source.fetchedAt);
  assert.throws(() => f.ledger.recordResult(correction), /revisionReason/);
  correction.revisionReason = 'Provider corrected full-time score';
  const r2 = f.ledger.recordResult(correction);
  assert.equal(f.ledger.summary().totals.profit, 0);
  assert.equal(f.ledger.summary().rows[0].status, 'pending_settlement');
  const s2 = f.ledger.settlePrediction({ predictionId: p.id, resultId: r2.id, ruleVerification: rules });
  assert.equal(s2.payload.paper.profit, -2); assert.equal(f.ledger.listResults().length, 2); assert.equal(f.ledger.listSettlements().length, 2); assert.equal(f.ledger.summary().totals.profit, -2);
  assert.deepEqual(f.ledger.recordResult(correction), r2);
  assert.deepEqual(f.ledger.recordResult(result()), r, 'replaying original source after correction must remain idempotent');
});
test('result retraction removes scores and profits until a strictly newer final restores them', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const original = f.ledger.recordResult(result());
  f.ledger.settlePrediction({ predictionId: p.id, resultId: original.id, ruleVerification: rules });
  assert.equal(f.ledger.summary().totals.profit, 2);
  const at = '2026-09-01T16:00:00.000Z'; f.advance(at);
  const input = { eventId: p.payload.match.eventId, source: { ...result().source, fetchedAt: at, bodySha256: 'c'.repeat(64) }, status: 'postponed', reason: 'Provider withdrew the final score' };
  const withdrawal = f.ledger.recordRetraction(input);
  assert.deepEqual(f.ledger.recordRetraction(input), withdrawal);
  let summary = f.ledger.summary();
  assert.equal(summary.rows[0].status, 'result_retracted'); assert.equal(summary.rows[0].settlement, null);
  assert.equal(summary.rows[0].retraction.reason, input.reason);
  assert.equal(summary.totals.profit, 0); assert.equal(summary.properScores.count, 0);
  assert.equal(summary.byModel[0].properScores.count, 0); assert.equal(summary.byModel[0].paper.profit, 0);
  assert.deepEqual(summary.pendingReasons, { result_retracted: 1 });
  assert.equal(summary.retractionVersionCount, 1);
  assert.equal(f.ledger.listResults().length, 1); assert.equal(f.ledger.listSettlements().length, 1);
  const sameTime = result(); sameTime.source.fetchedAt = at;
  const simultaneous = f.ledger.recordResult(sameTime);
  f.ledger.settlePrediction({ predictionId: p.id, resultId: simultaneous.id, ruleVerification: rules });
  assert.equal(f.ledger.summary().rows[0].status, 'result_retracted', 'equal-time final cannot override withdrawal');
  const corrected = result(0, 2); corrected.source.fetchedAt = '2026-09-01T17:00:00.000Z'; corrected.revisionReason = 'Provider published corrected final'; f.advance(corrected.source.fetchedAt);
  const newest = f.ledger.recordResult(corrected);
  assert.equal(f.ledger.summary().rows[0].status, 'pending_settlement');
  f.ledger.settlePrediction({ predictionId: p.id, resultId: newest.id, ruleVerification: rules });
  summary = f.ledger.summary();
  assert.equal(summary.rows[0].status, 'settled_paper'); assert.equal(summary.rows[0].retraction, null);
  assert.equal(summary.totals.profit, -2); assert.equal(summary.properScores.count, 1); assert.equal(summary.pendingCount, 0);
  const restarted = createLedger({ directory: f.directory, now: () => corrected.source.fetchedAt });
  assert.deepEqual(restarted.recordRetraction(input), withdrawal);
  assert.equal(restarted.listRetractions().length, 1); assert.equal(restarted.summary().totals.profit, -2);
  assert.equal(restarted.summary().properScores.count, 1);
});
test('retracted assumptions lose financial aggregates and retraction provenance is validated', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const r = f.ledger.recordResult(result());
  f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' });
  const input = { eventId: p.payload.match.eventId, source: result().source, reason: 'Score returned to live', status: 'live' };
  assert.throws(() => f.ledger.recordRetraction({ ...input, status: 'finished' }), /cannot retract/);
  assert.throws(() => f.ledger.recordRetraction({ ...input, reason: '' }), /reason/);
  assert.throws(() => f.ledger.recordRetraction({ ...input, source: { ...input.source, fetchedAt: '2026-09-02T00:00:00Z' } }), /future/);
  f.ledger.recordRetraction(input);
  const summary = f.ledger.summary();
  assert.equal(summary.assumedPaperCount, 0); assert.equal(summary.assumedPaperTotals.profit, 0);
  assert.equal(summary.byModel[0].assumedPaper.profit, 0); assert.equal(summary.properScores.count, 0);
  assert.equal(summary.rows[0].status, 'result_retracted');
});
test('abstaining produces probability scores but no fabricated financial return', t => {
  const f = fixture(t); const input = prediction(); delete input.paperTrade; input.match.odds = null;
  const p = f.ledger.recordPrediction(input); f.advance(); const r = f.ledger.recordResult(result());
  const s = f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id });
  assert.equal(s.payload.status, 'scored_no_trade'); assert.equal(s.payload.paper, null); assert.ok(Math.abs(s.payload.scoring.logLoss - Math.log(2)) < 1e-12);
});
test('different event result cannot settle a prediction', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const input = result(); input.match.eventId = 'other'; const r = f.ledger.recordResult(input);
  assert.throws(() => f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id }), /identity mismatch/);
});
test('explicit paper assumption settles separately, while default remains pending', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const r = f.ledger.recordResult(result());
  const args = { predictionId: p.id, resultId: r.id };
  assert.equal(f.ledger.settlePrediction(args).payload.status, 'pending_rule_verification');
  const assumed = f.ledger.settlePrediction({ ...args, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' });
  assert.equal(assumed.payload.status, 'settled_paper_assumption');
  assert.equal(assumed.payload.paper.profit, 2);
  assert.equal(assumed.payload.ruleVerification.verified, false);
  assert.equal(assumed.payload.paper.ruleAssumption.fixedStake, 2);
  assert.equal(assumed.payload.paper.ruleAssumption.officialSettlement, false);
  assert.equal(assumed.payload.paper.ruleAssumption.actualOrder, false);
  assert.equal(assumed.payload.paper.ruleAssumption.redeemable, false);
  assert.deepEqual(f.ledger.settlePrediction({ ...args, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' }), assumed);
  f.advance('2026-09-01T16:00:00Z'); f.ledger.settlePrediction(args);
  const summary = f.ledger.summary();
  assert.equal(summary.assumedPaperCount, 1); assert.equal(summary.assumedPaperTotals.profit, 2);
  assert.equal(summary.settledPaperCount, 0); assert.equal(summary.totals.profit, 0);
  assert.equal(summary.pendingCount, 0); assert.equal(summary.properScores.count, 1);
  assert.equal(summary.byModel[0].assumedPaperCount, 1); assert.equal(summary.byModel[0].assumedPaper.profit, 2);
  assert.equal(summary.byModel[0].paper.profit, 0);
});
test('verified settlement outranks assumption and never double counts', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); f.advance(); const r = f.ledger.recordResult(result());
  const args = { predictionId: p.id, resultId: r.id };
  const verified = f.ledger.settlePrediction({ ...args, ruleVerification: rules });
  assert.deepEqual(f.ledger.settlePrediction({ ...args, ruleVerification: rules, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' }), verified);
  f.advance('2026-09-01T16:00:00Z'); f.ledger.settlePrediction({ ...args, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' });
  const summary = f.ledger.summary();
  assert.equal(summary.settledPaperCount, 1); assert.equal(summary.totals.profit, 2);
  assert.equal(summary.assumedPaperCount, 0); assert.equal(summary.assumedPaperTotals.profit, 0);
  assert.equal(summary.properScores.count, 1);
  assert.equal(summary.rows[0].settlement.paper.ruleAssumption, undefined);
});
test('assumption rejects unknown rules and any stake other than hypothetical 2 yuan', t => {
  const f = fixture(t); const input = prediction(); input.paperTrade.stake = 4;
  const p = f.ledger.recordPrediction(input); f.advance(); const r = f.ledger.recordResult(result());
  const args = { predictionId: p.id, resultId: r.id };
  assert.throws(() => f.ledger.settlePrediction({ ...args, paperRuleAssumption: 'invented' }), /unsupported/);
  assert.throws(() => f.ledger.settlePrediction({ ...args, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' }), /2 yuan/);
  assert.equal(f.ledger.settlePrediction({ ...args, ruleVerification: rules }).payload.paper.stake, 4);
});
test('uniform argmax ties use exact expectation of one randomized choice without home bias or splitting', t => {
  const f = fixture(t); const input = prediction(); input.prediction.probabilities = [1 / 3, 1 / 3, 1 / 3];
  input.paperTrade = { stake: 2, selectionWeights: [1 / 3, 1 / 3, 1 / 3] };
  const p = f.ledger.recordPrediction(input); f.advance(); const r = f.ledger.recordResult(result());
  const s = f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id, paperRuleAssumption: 'fixed-decimal-1x2-paper-v1' });
  assert.equal(s.payload.paper.profit, s.payload.paper.randomExpectedProfit);
  assert.notEqual(s.payload.paper.profit, 2);
  assert.equal(s.payload.paper.profitKind, 'exact_expected_profit_of_single_randomized_selection');
  assert.deepEqual(s.payload.paper.selectionWeights, [1 / 3, 1 / 3, 1 / 3]);
  assert.match(s.payload.paper.selectionInterpretation, /not split stakes or an actual order/);
  assert.equal(s.payload.paper.stake, 2);
});
test('selection weights reject ambiguity and invalid normalization', t => {
  const { ledger } = fixture(t);
  for (const selectionWeights of [[0, 0, 0], [0.5, 0.5, 0.5], [-1, 1, 1], [1, NaN, 0], [1, 0]]) {
    const p = prediction(); p.paperTrade = { stake: 2, selectionWeights }; assert.throws(() => ledger.recordPrediction(p), /selectionWeights/);
  }
  const p = prediction(); p.paperTrade.selectionWeights = [1, 0, 0]; assert.throws(() => ledger.recordPrediction(p), /cannot be combined/);
});
test('zero probability for realized outcome preserves infinite log loss through JSON and aggregates', t => {
  const f = fixture(t); const input = prediction(); input.prediction.probabilities = [0, 0.5, 0.5];
  const p = f.ledger.recordPrediction(input); f.advance(); const r = f.ledger.recordResult(result());
  const settled = f.ledger.settlePrediction({ predictionId: p.id, resultId: r.id });
  assert.equal(settled.payload.scoring.logLoss, null);
  assert.equal(settled.payload.scoring.logLossStatus, 'infinite');
  assert.equal(settled.payload.scoring.brier, 1.5);
  const reloaded = createLedger({ directory: f.directory, now: () => after });
  assert.equal(reloaded.listSettlements()[0].payload.scoring.logLossStatus, 'infinite');
  const summary = JSON.parse(JSON.stringify(reloaded.summary()));
  for (const scores of [summary.properScores, summary.byModel[0].properScores, summary.bySource[0].properScores]) {
    assert.equal(scores.logLossStatus, 'infinite'); assert.equal(scores.infiniteLogLossCount, 1);
    assert.equal(scores.sumLogLoss, null); assert.equal(scores.meanLogLoss, null);
    assert.equal(scores.meanBrier, 1.5);
  }
});
test('orphan crash temporary is ignored and rerun publishes one complete record', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.directory, 'predictions', 'orphan.tmp'), '{broken');
  const p = f.ledger.recordPrediction(prediction()); assert.equal(f.ledger.listPredictions().length, 1);
  assert.deepEqual(createLedger({ directory: f.directory, now: () => before }).recordPrediction(prediction()), p);
});
test('corrupt committed record fails loudly and is never overwritten', t => {
  const f = fixture(t); const p = f.ledger.recordPrediction(prediction()); fs.writeFileSync(path.join(f.directory, 'predictions', p.id + '.json'), '{broken');
  assert.throws(() => f.ledger.recordPrediction(prediction()), SyntaxError);
  assert.equal(fs.readFileSync(path.join(f.directory, 'predictions', p.id + '.json'), 'utf8'), '{broken');
});
test('concurrent writers publish exactly one record, conflicting writer fails', async t => {
  const f = fixture(t);
  function run(input) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads'); const {createLedger}=require(workerData.module); try { parentPort.postMessage({id:createLedger({directory:workerData.directory,now:()=>workerData.now}).recordPrediction(workerData.input).id}); } catch(e) {parentPort.postMessage({error:e.message});}`, { eval: true, workerData: { module: require.resolve('../research-ledger'), directory: f.directory, now: before, input } });
      worker.once('message', resolve); worker.once('error', reject);
    });
  }
  const p = prediction(); const altered = prediction(); altered.prediction.version = '2';
  const outcomes = await Promise.all([run(p), run(p), run(p), run(altered)]);
  assert.equal(f.ledger.listPredictions().length, 1);
  assert.ok(outcomes.some(v => v.id)); assert.ok(outcomes.some(v => /conflict/.test(v.error)));
  assert.equal(fs.readdirSync(path.join(f.directory, 'predictions')).filter(n => n.endsWith('.tmp')).length, 0);
});
