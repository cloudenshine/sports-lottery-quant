'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const Ledger = require('../numbers-ledger');
const Models = require('../number-models');
function fixture(t, gameId = 'ssq') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'numbers-ledger-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const body = Buffer.from('genuine-test-source'), bodySha256 = crypto.createHash('sha256').update(body).digest('hex');
  fs.mkdirSync(path.join(dataDir, 'raw')); fs.writeFileSync(path.join(dataDir, 'raw', bodySha256 + '.body'), body);
  const source = { sourceId: 'fixture', sourceUrl: 'https://example.org/public', fetchedAt: '2026-09-05T10:00:00Z', bodySha256, rawRef: 'raw/' + bodySha256 + '.body' };
  const args = { dataDir, gameId, protocol: { id: 'numbers-test-v2', hash: 'a'.repeat(64), ticketCount: 5 }, now: '2026-09-05T11:00:00Z',
    nextIssue: { issue: '26102', drawAt: '2026-09-06T13:15:00Z', source },
    draws: [{ gameId, issue: '26101', date: '2026-09-03', main: gameId === 'ssq' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5], special: gameId === 'ssq' ? [1] : [1, 2], source }] };
  return args;
}
function resultFor(args, ticket) {
  return { gameId: args.gameId, issue: '26102', date: '2026-09-06', main: ticket.main, special: ticket.special,
    source: { ...args.nextIssue.source, fetchedAt: '2026-09-06T14:00:00Z' }, specialPrizeActive: false,
    payouts: { base: { 1: 5000000, 2: 100000, 3: 3000, 4: 200, 5: 10, 6: 5, 7: 5 } }, winners: { base: { 1: 1, 2: 1 } } };
}
test('registers every model together, same budget, exact input provenance and stable tickets', t => {
  const args = fixture(t), first = Ledger.registerBatch(args);
  assert.equal(first.created, true); assert.equal(first.batch.predictions.length, Models.MODEL_IDS.length);
  for (const row of first.batch.predictions) { assert.equal(row.tickets.length, 5); assert.equal(row.costYuan, 10); assert.equal(row.model.trainingCount, 1); assert.equal(row.trainingHash, first.batch.trainingHash); }
  assert.deepEqual(first.batch.trainingDraws, args.draws);
  const rerun = Ledger.registerBatch({ ...args, now: '2026-09-09T11:00:00Z', draws: [] });
  assert.equal(rerun.created, false); assert.deepEqual(rerun.batch, first.batch);
  assert.throws(() => Ledger.registerBatch({ ...args, protocol: { ...args.protocol, hash: 'b'.repeat(64) } }), /different protocol hash/);
  const sum = Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: args.gameId, now: args.now });
  assert.equal(sum.batchCount, 1); assert.equal(sum.predictionCount, 7); assert.equal(sum.ticketCount, 35); assert.equal(sum.pendingCount, 1);
});
test('rejects late/future/stale/unobserved inputs and invalid raw evidence', t => {
  const args = fixture(t);
  for (const bad of [
    { ...args, now: '2026-09-06T10:15:00Z' },
    { ...args, nextIssue: null },
    { ...args, nextIssue: { ...args.nextIssue, drawAt: '2026-09-20T13:15:00Z' } },
    { ...args, nextIssue: { ...args.nextIssue, source: { ...args.nextIssue.source, fetchedAt: '2026-09-05T12:00:00Z' } } },
    { ...args, nextIssue: { ...args.nextIssue, source: { ...args.nextIssue.source, fetchedAt: '2026-09-03T12:00:00Z' } } },
    { ...args, draws: [{ ...args.draws[0], date: '2026-09-05' }] },
    { ...args, draws: [{ ...args.draws[0], issue: '26102' }] },
    { ...args, draws: [{ ...args.draws[0], source: { ...args.draws[0].source, fetchedAt: '2026-09-06T12:00:00Z' } }] }
  ]) { assert.equal(Ledger.registrationEligibility(bad).eligible, false); assert.throws(() => Ledger.registerBatch(bad)); }
  fs.writeFileSync(path.join(args.dataDir, args.nextIssue.source.rawRef), 'tampered');
  assert.throws(() => Ledger.registerBatch(args), /hash mismatch/);
  assert.equal(Ledger.readBatches({ dataDir: args.dataDir }).length, 0);
});
test('real sales close wins over the conservative research cutoff', t => {
  const args = fixture(t); args.nextIssue.salesCloseAt = '2026-09-05T10:30:00Z';
  assert.equal(Ledger.registrationEligibility(args).eligible, false);
});
test('parallel registration creates one complete immutable batch', async t => {
  const args = fixture(t), modulePath = require.resolve('../numbers-ledger');
  const run = () => new Promise((resolve, reject) => {
    const worker = new Worker('const {parentPort,workerData}=require("worker_threads"); const result=require(workerData.modulePath).registerBatch(workerData.args); parentPort.postMessage({created:result.created,digest:result.batch.digest});', { eval: true, workerData: { modulePath, args } });
    worker.once('message', resolve); worker.once('error', reject);
  });
  const outcomes = await Promise.all([run(), run(), run()]);
  assert.equal(outcomes.filter(x => x.created).length, 1); assert.equal(new Set(outcomes.map(x => x.digest)).size, 1);
  assert.equal(Ledger.readBatches({ dataDir: args.dataDir }).length, 1);
});
test('published settlement, correction and restoration are append-only and idempotent', t => {
  const args = fixture(t), batch = Ledger.registerBatch(args).batch, draw = resultFor(args, batch.predictions[0].tickets[0]);
  const settle = result => Ledger.settleBatches({ dataDir: args.dataDir, games: { ssq: { draws: [result] } }, now: '2026-09-07T15:00:00Z' });
  assert.equal(settle(draw).created, 1); assert.equal(settle(draw).created, 0);
  let sum = Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: 'ssq', now: '2026-09-08T00:00:00Z' });
  assert.equal(sum.byModel.uniform.settledGrossYuan >= 5000000, true); assert.equal(sum.byModel.uniform.scoredCount, 1);
  const changed = { ...draw, payouts: { base: { ...draw.payouts.base, 1: 4000000 } }, source: { ...draw.source, fetchedAt: '2026-09-07T10:00:00Z' } };
  assert.equal(settle(changed).revisions, 1);
  assert.throws(() => settle(draw), /not a newer/);
  const restored = { ...draw, source: { ...draw.source, fetchedAt: '2026-09-07T11:00:00Z' } };
  assert.equal(settle(restored).revisions, 1); assert.equal(settle(restored).created, 0);
  sum = Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: 'ssq', now: '2026-09-08T00:00:00Z' });
  assert.equal(sum.byModel.uniform.scoredCount, 1); assert.equal(sum.byModel.uniform.logEValueVsUniform, 0);
  assert.equal(fs.readdirSync(path.join(args.dataDir, 'ledger', 'settlements', batch.batchId)).length, 3);
});
test('unknown winning payouts stay pending while probability scores remain available', t => {
  const args = fixture(t), batch = Ledger.registerBatch(args).batch, draw = resultFor(args, batch.predictions[0].tickets[0]);
  draw.payouts.base[1] = null;
  const result = Ledger.settleBatches({ dataDir: args.dataDir, games: { ssq: [draw] }, now: '2026-09-06T15:00:00Z' });
  assert.equal(result.pending, 1); assert.equal(result.batches[0].results[0].netYuan, null);
  const sum = Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: 'ssq', now: '2026-09-08T00:00:00Z' });
  assert.equal(sum.byModel.uniform.pendingCount, 1); assert.equal(sum.byModel.uniform.scoredCount, 1); assert.equal(sum.byModel.uniform.profitAdvantage, 'not_proven');
});
test('early result observations are rejected and a withdrawal removes previous settled totals', t => {
  const args = fixture(t), batch = Ledger.registerBatch(args).batch, draw = resultFor(args, batch.predictions[0].tickets[0]);
  const settle = result => Ledger.settleBatches({ dataDir: args.dataDir, games: { ssq: [result] }, now: '2026-09-07T15:00:00Z' });
  assert.throws(() => settle({ ...draw, source: { ...draw.source, fetchedAt: '2026-09-06T12:00:00Z' } }), /predates the scheduled draw/);
  settle(draw);
  settle({ ...draw, status: 'withdrawn', source: { ...draw.source, fetchedAt: '2026-09-07T12:00:00Z' } });
  const sum = Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: 'ssq', now: '2026-09-08T00:00:00Z' });
  assert.equal(sum.byModel.uniform.settledGrossYuan, 0); assert.equal(sum.byModel.uniform.settledCount, 0);
  assert.equal(sum.byModel.uniform.scoredCount || 0, 0); assert.equal(sum.pendingCount, 1);
});
test('protocol cohorts are separated and integrity tampering is rejected', t => {
  const args = fixture(t), first = Ledger.registerBatch(args);
  Ledger.registerBatch({ ...args, protocol: { ...args.protocol, id: 'different-protocol' } });
  const sum = Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: 'ssq', now: args.now });
  assert.equal(Object.keys(sum.byProtocol).length, 2); assert.deepEqual(sum.byModel, {});
  const file = path.join(args.dataDir, 'ledger', 'batches', first.batch.batchId + '.json');
  const changed = JSON.parse(fs.readFileSync(file)); changed.predictions[0].tickets[0].main[0] = 33; fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(() => Ledger.readBatches({ dataDir: args.dataDir }), /integrity failure/);
});
test('distribution evidence requires all due results in the fixed cohort even above its threshold', t => {
  const args = fixture(t);
  args.draws = Array.from({ length: 150 }, (_, i) => ({ ...args.draws[0], issue: String(25001 + i),
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10) }));
  Ledger.registerBatch(args);
  Ledger.registerBatch({ ...args, nextIssue: { ...args.nextIssue, issue: '26103', drawAt: '2026-09-07T13:15:00Z' } });
  const first = resultFor(args, args.draws[0]); first.payouts.base[1] = null;
  const second = { ...first, issue: '26103', date: '2026-09-07', source: { ...first.source, fetchedAt: '2026-09-07T14:00:00Z' } };
  const settle = (draws, now) => Ledger.settleBatches({ dataDir: args.dataDir, games: { ssq: draws }, now });
  const summary = now => Ledger.summarizeLedger({ dataDir: args.dataDir, gameId: 'ssq', now });
  assert.equal(summary('2026-09-05T10:59:59Z').batchCount, 0);
  const before = summary(args.now).byModel.frequency_shrink;
  assert.equal(before.duePredictionCount, 0); assert.equal(before.missingScoredCount, 0); assert.equal(before.distributionEvidence, 'not_demonstrated');
  settle([first], '2026-09-06T15:00:00Z');
  const unobserved = summary('2026-09-06T14:30:00Z').byModel.frequency_shrink;
  assert.equal(unobserved.missingScoredCount, 1); assert.equal(unobserved.distributionEvidence, 'suspended_incomplete_results');
  const partialCalendar = summary('2026-09-06T15:00:00Z').byModel.frequency_shrink;
  assert.equal(partialCalendar.duePredictionCount, 1); assert.equal(partialCalendar.missingScoredCount, 0);
  assert.equal(partialCalendar.logEValueVsUniform > Math.log(240), true);
  assert.equal(partialCalendar.distributionEvidence, 'nonuniformity_evidence');
  assert.equal(partialCalendar.profitAdvantage, 'not_proven');
  const missing = summary('2026-09-07T15:00:00Z').byModel.frequency_shrink;
  assert.equal(missing.duePredictionCount, 2); assert.equal(missing.missingScoredCount, 1);
  assert.equal(missing.logEValueVsUniform, partialCalendar.logEValueVsUniform);
  assert.equal(missing.distributionEvidence, 'suspended_incomplete_results');
  settle([first, second], '2026-09-07T15:00:00Z');
  const complete = summary('2026-09-07T15:00:00Z').byModel.frequency_shrink;
  assert.equal(complete.scoredCount, 2); assert.equal(complete.missingScoredCount, 0);
  assert.equal(complete.distributionEvidence, 'nonuniformity_evidence');
  settle([{ ...first, status: 'withdrawn', source: { ...first.source, fetchedAt: '2026-09-08T14:00:00Z' } }, second], '2026-09-08T15:00:00Z');
  const withdrawn = summary('2026-09-08T15:00:00Z').byModel.frequency_shrink;
  assert.equal(withdrawn.scoredCount, 1); assert.equal(withdrawn.missingScoredCount, 1);
  assert.equal(withdrawn.logEValueVsUniform > Math.log(240), true);
  assert.equal(withdrawn.distributionEvidence, 'suspended_incomplete_results');
  assert.equal(summary('2026-09-07T15:00:00Z').byModel.frequency_shrink.distributionEvidence, 'nonuniformity_evidence');
});
function withLiveClock(times, work) {
  const RealDate = global.Date; let calls = 0;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [times[Math.min(calls++, times.length - 1)]])); }
  };
  try { return work(); } finally { global.Date = RealDate; }
}
test('live registration records completion time separately from forecast training time', t => {
  const args = fixture(t); delete args.now;
  const start = '2026-09-05T11:00:00.000Z', finish = '2026-09-05T11:02:00.000Z';
  const { batch } = withLiveClock([start, finish, '2026-09-05T11:02:00.100Z'], () => Ledger.registerBatch(args));
  assert.equal(batch.forecastAsOf, start); assert.equal(batch.registeredAt, finish);
  for (const prediction of batch.predictions) assert.equal(prediction.model.asOf, start);
});
test('live generation crossing cutoff cannot publish a backdated prediction', t => {
  const args = fixture(t); delete args.now;
  args.nextIssue.source = { ...args.nextIssue.source, fetchedAt: '2026-09-06T09:00:00Z' };
  assert.throws(() => withLiveClock(['2026-09-06T10:14:59Z', '2026-09-06T10:15:00Z'], () => Ledger.registerBatch(args)), /cutoff passed during generation/);
  assert.equal(Ledger.readBatches({ dataDir: args.dataDir }).length, 0);
  assert.throws(() => withLiveClock(['2026-09-06T10:14:58Z', '2026-09-06T10:14:59Z', '2026-09-06T10:15:00Z'], () => Ledger.registerBatch(args)), /cutoff passed before publication/);
  assert.equal(Ledger.readBatches({ dataDir: args.dataDir }).length, 0);
  assert.deepEqual(fs.readdirSync(path.join(args.dataDir, 'ledger', 'batches')), []);
});
