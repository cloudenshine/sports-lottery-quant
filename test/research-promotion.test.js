'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePromotion, sourceFamily } = require('../research-promotion');
const baseProtocol = require('../data/research/protocol.json');
const DAY = 86400000;
const start = Date.parse('2026-09-06T00:00:00Z');
const iso = n => new Date(n).toISOString();
function protocol() {
  const value = structuredClone(baseProtocol);
  value.registeredAt = iso(start);
  value.sports.promotion.fixedCalendarHorizonDays = 90;
  return value;
}
function rows(count = 500, options = {}) {
  const value = [];
  for (let i = 0; i < count; i++) for (const modelId of ['uniform', 'market', 'poisson']) {
    const kickoff = start + (1 + i % 85) * DAY + Math.floor(i / 85) * 60000;
    value.push({ predictionId: `${options.prefix || ''}${modelId}-${i}`, eventId: `${options.prefix || ''}event-${i}`, modelId, modelVersion: '1.0.0', protocolId: protocol().protocolId, sourceId: options.sourceId || '500-jingcai-fixtures', batchId: i.toString(16).padStart(64, '0'), sourceBodySha256: 'a'.repeat(64), sourceFetchedAt: iso(kickoff - 3601000), recordedAt: iso(kickoff - 3600000), kickoffAt: iso(kickoff), status: 'settled_paper_assumption', settlement: { scoring: { logLoss: modelId === 'poisson' ? 0.3 : 1.2, brier: 0.5 }, paper: { stake: 2, profit: modelId === 'poisson' ? 2 : -1, randomExpectedProfit: -0.2, marketExpectedProfit: -0.3 }, paperRuleAssumption: { id: 'fixed-decimal' } } });
  }
  return value;
}
function evaluate(data, extra = {}) { return evaluatePromotion({ protocol: protocol(), ledgerSummary: { rows: data }, now: iso(start + 91 * DAY), ...extra }); }
function poisson(result, sourceId = '500-jingcai') { return result.cohorts.find(c => c.modelId === 'poisson' && c.sourceId === sourceId); }

test('source aliases map explicitly and never blend unrelated providers', () => {
  assert.equal(sourceFamily('espn-eng1-2025'), 'espn-eng1');
  assert.equal(sourceFamily('500-jingcai-fixtures'), '500-jingcai');
  assert.equal(sourceFamily('other-espn-eng1'), 'other-espn-eng1');
  const result = evaluate(rows(300).concat(rows(300, { sourceId: 'espn-eng1-history', prefix: 'espn-' })));
  assert.equal(poisson(result).settledEvents, 300);
  assert.equal(poisson(result, 'espn-eng1').status, 'INSUFFICIENT_SAMPLE');
  assert.equal(result.settledEvents, 300);
  assert.equal(result.plannedComparisons, 42);
});

test('no significance calculation while the fixed calendar window remains open, even with 500 outcomes', () => {
  const result = evaluate(rows(), { now: iso(start + 89 * DAY) });
  const cohort = poisson(result);
  assert.equal(cohort.status, 'COLLECTING');
  assert.equal(cohort.inference, undefined);
  assert.equal(cohort.locked, false);
  assert.equal(result.eligible, false);
});

test('the complete fixed window is evaluated once with family correction, but paper evidence cannot promote execution', () => {
  const result = evaluate(rows(510));
  const cohort = poisson(result);
  assert.equal(cohort.settledEvents, 510);
  assert.equal(cohort.fixedEventIds.length, 510);
  assert.equal(cohort.inference.netReturn.comparisons, 42);
  assert.equal(cohort.inference.netReturn.samples, 20000);
  assert.equal(cohort.researchEvidenceEligible, true);
  assert.equal(cohort.paperAssumptionCount, 510);
  assert.equal(cohort.eligible, false);
  assert.equal(cohort.locked, true);
  assert.equal(result.eligible, false);
  const changed = rows(520);
  changed.forEach(row => { row.settlement.paper.profit = -2; });
  const next = evaluate(changed, { previousDecision: result, now: iso(start + 150 * DAY) });
  assert.deepEqual(next, result);
});

test('window boundary is exclusive; insufficient sample locks without rolling forward', () => {
  const input = rows(499);
  const late = rows(1, { prefix: 'late-' });
  late.forEach(row => { row.kickoffAt = iso(start + 90 * DAY); row.recordedAt = iso(start + 89 * DAY); });
  const first = evaluate(input.concat(late));
  assert.equal(poisson(first).status, 'INSUFFICIENT_SAMPLE');
  assert.equal(poisson(first).settledEvents, 499);
  assert.equal(poisson(first).inference, undefined);
  const next = evaluate(rows(600), { previousDecision: first });
  assert.deepEqual(poisson(next), poisson(first));
});

test('unsettled events inside the closed window remain in the sample and must settle before inference', () => {
  const input = rows(510);
  input.find(row => row.modelId === 'poisson' && row.eventId === 'event-509').settlement = null;
  const first = evaluate(input);
  assert.equal(poisson(first).status, 'AWAITING_WINDOW_SETTLEMENTS');
  assert.equal(poisson(first).matchedEvents, 510);
  assert.equal(poisson(first).settledEvents, 509);
  assert.equal(poisson(first).inference, undefined);
  const next = evaluate(rows(510), { previousDecision: first, now: iso(start + 95 * DAY) });
  assert.equal(poisson(next).researchEvidenceEligible, true);
});

test('cash abstentions stay in the matched sample and zero exposure never proves a return advantage', () => {
  const input = rows();
  input.filter(row => row.modelId === 'poisson').forEach(row => { row.status = 'scored_no_trade'; row.settlement.paper = null; });
  const allCash = evaluate(input);
  assert.equal(poisson(allCash).status, 'NO_PAPER_EXPOSURE');
  assert.equal(poisson(allCash).settledEvents, 500);
  assert.equal(poisson(allCash).abstainedEvents, 500);
  input.find(row => row.modelId === 'poisson').settlement.paper = { stake: 2, profit: 2, randomExpectedProfit: -0.2, marketExpectedProfit: -0.3 };
  input.find(row => row.modelId === 'poisson').status = 'settled_paper_assumption';
  const mixed = evaluate(input);
  assert.equal(poisson(mixed).abstainedEvents, 499);
  assert.equal(poisson(mixed).fixedEventIds.length, 500);
  assert.equal(poisson(mixed).researchEvidenceEligible, false);
});

test('versions, conflicting duplicate forecasts and invalid chronology fail closed instead of being selected out', () => {
  const mixed = rows(10); mixed.find(row => row.modelId === 'poisson').modelVersion = '2.0.0';
  assert.equal(poisson(evaluate(mixed)).status, 'MIXED_MODEL_VERSIONS');
  const duplicates = rows(10); const extra = structuredClone(duplicates[2]); extra.predictionId = 'different'; duplicates.push(extra);
  assert.equal(poisson(evaluate(duplicates)).status, 'DUPLICATE_EVENT_CONFLICT');
  const past = rows(10); past[0].recordedAt = past[0].kickoffAt;
  assert.equal(poisson(evaluate(past)).status, 'INVALID_PROSPECTIVE_EVIDENCE');
  const before = rows(10); before[0].recordedAt = iso(start - 1);
  assert.equal(poisson(evaluate(before)).status, 'INVALID_PROSPECTIVE_EVIDENCE');
});

test('duplicate identical rows do not multiply event sample size; missing comparators never count', () => {
  const input = rows(10);
  const result = evaluate(input.concat(structuredClone(input)));
  assert.equal(poisson(result).settledEvents, 10);
  const noMarket = evaluate(input.filter(row => row.modelId !== 'market'));
  assert.equal(poisson(noMarket).settledEvents, 0);
});

test('different protocol rows are excluded and changing a frozen decision protocol is rejected', () => {
  const input = rows(10); input.forEach(row => { row.protocolId = 'other'; });
  const result = evaluate(input);
  assert.equal(result.exclusions.otherProtocol, 30);
  assert.equal(result.settledEvents, 0);
  const changed = protocol(); changed.sports.paperStake = 3;
  assert.throws(() => evaluate([], { protocol: changed, previousDecision: result }), /Protocol changed/);
  const unregistered = protocol(); delete unregistered.registeredAt;
  assert.throws(() => evaluate([], { protocol: unregistered }), /registeredAt/);
});

test('infinite scores and unknown rule returns cannot be hidden by clipping or dropping events', () => {
  const bad = rows(); bad.find(row => row.modelId === 'poisson').settlement.scoring.logLoss = null;
  assert.equal(poisson(evaluate(bad)).status, 'NONFINITE_OR_INVALID_SCORE');
  const missing = rows(); missing.find(row => row.modelId === 'poisson').status = 'pending_rule_verification';
  assert.equal(poisson(evaluate(missing)).status, 'PAPER_RETURN_EVIDENCE_MISSING');
});

test('matched models require the same immutable batch and authentic source snapshot, never a favorable remaining subset', () => {
  for (const change of [
    row => { delete row.batchId; },
    row => { row.batchId = 'b'.repeat(64); },
    row => { delete row.sourceBodySha256; },
    row => { row.sourceBodySha256 = 'b'.repeat(64); },
    row => { delete row.sourceFetchedAt; },
    row => { row.sourceFetchedAt = iso(timeOf(row.sourceFetchedAt) - 1000); },
    row => { row.sourceFetchedAt = row.kickoffAt; }
  ]) {
    const input = rows(510);
    change(input.find(row => row.modelId === 'poisson'));
    const cohort = poisson(evaluate(input));
    assert.equal(cohort.status, 'DIFFERENT_INFORMATION_SNAPSHOTS');
    assert.equal(cohort.locked, true);
    assert.equal(cohort.inference, undefined);
  }
});
function timeOf(value) { return Date.parse(value); }

test('insufficient adjusted bootstrap tail resolution cannot establish research eligibility even with positive displayed bounds', () => {
  const strict = protocol();
  strict.sports.promotion.familyWiseAlpha = 0.0001;
  const cohort = poisson(evaluate(rows(), { protocol: strict }));
  assert.equal(cohort.inference.netReturn.resolutionSufficient, false);
  assert.ok(cohort.inference.netReturn.interval[0] > 0);
  assert.equal(cohort.researchEvidenceEligible, false);
});
