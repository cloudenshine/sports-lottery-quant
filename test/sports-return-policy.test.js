const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDecision } = require('../sports-return-policy.js');

const reliable = {
  market: 'jczq',
  odds: { home: 2.2, draw: 3.8, away: 4.5 },
  probabilities: [0.7, 0.2, 0.1],
  probabilityLowerBounds: [0.55, 0.15, 0.05],
  kickoffAt: '2026-09-10T12:00:00.000Z',
  oddsObservedAt: '2026-09-10T11:00:00.000Z',
  now: '2026-09-10T11:30:00.000Z',
  officialSale: true,
  settlementRuleVerified: true,
  settlementTerms: { verified: true, feeRate: 0, taxRate: 0, maxPayoutYuan: null },
  calibrated: true,
  source: { sourceId: 'test-official', sourceUrl: 'https://example.invalid/quote' },
  budgetYuan: 100,
  stakeUnitYuan: 2
};

test('two football prices cannot certify an arbitrage that omits the draw', () => {
  const meta = {eventId:'one',marketVariant:'SPF',line:null,settlementPeriod:'regulation',sourceId:'fixture',officialSale:true,settlementRuleVerified:true,kickoffAt:reliable.kickoffAt,oddsObservedAt:reliable.oddsObservedAt};
  const result = evaluateDecision({...reliable, odds:{home:3,away:3},probabilities:[0.5,0.5],probabilityLowerBounds:[0.1,0.1], arbitrageQuotes:[{...meta,selection:'home',odds:3},{...meta,selection:'away',odds:3}]});
  assert.equal(result.arbitrage.conditionalGuarantee,false);
  assert.ok(result.arbitrage.reasonCodes.includes('unverified_exhaustive_market'));
});

test('fixed odds decision uses actual odds, worst probability bound and Kelly cap', () => {
  const result = evaluateDecision(reliable);
  assert.equal(result.status, 'supported_trade');
  assert.equal(result.action, 'trade');
  assert.equal(result.renderable.stakeYuan, 24);
  assert.equal(result.risk.heldCashYuan, 76);
  assert.equal(result.expected.bestGross, 1.54);
  assert.equal(result.expected.edgePerOutcome[0], 0.54);
  assert.equal(result.expected.marketImpliedProbabilities.length, 3);
  assert.ok(result.expected.worstCase.net > 0);
  assert.equal(result.reasonCodes.length, 0);
  assert.ok(result.expectationProof.improvementAtSameExposureYuan > 0);
  assert.ok(result.expectationProof.improvementAtFullBudgetYuan > 0);
});

test('random baseline is same-budget and includes unused cash explicitly', () => {
  const result = evaluateDecision(reliable);
  const expectedRandomGross = (0.7 * 2.2 + 0.2 * 3.8 + 0.1 * 4.5) / 3;
  assert.equal(result.baseline.expectedGrossPerUnit, expectedRandomGross);
  assert.equal(result.baseline.fullBudget.stakeYuan, 100);
  assert.equal(result.baseline.fullBudget.unusedYuan, 0);
  assert.equal(result.baseline.sameExposure.stakeYuan, 24);
  assert.equal(result.expectationProof.expectationOnly, true);
});

test('missing calibration, official sale or pre-match timing is research-only', () => {
  const uncalibrated = evaluateDecision({ ...reliable, calibrated: false });
  assert.equal(uncalibrated.status, 'research_only');
  assert.ok(uncalibrated.reasonCodes.includes('probability_uncalibrated'));

  const saleUnknown = evaluateDecision({ ...reliable, officialSale: undefined });
  assert.equal(saleUnknown.status, 'research_only');
  assert.ok(saleUnknown.reasonCodes.includes('official_sale_unknown'));

  const afterKickoff = evaluateDecision({ ...reliable, oddsObservedAt: '2026-09-10T12:01:00.000Z' });
  assert.equal(afterKickoff.status, 'research_only');
  assert.ok(afterKickoff.reasonCodes.includes('odds_not_pre_match'));

  const futureQuote = evaluateDecision({ ...reliable, now: '2026-09-10T11:00:00.000Z', oddsObservedAt: '2026-09-10T11:01:00.000Z' });
  assert.equal(futureQuote.status, 'research_only');
  assert.ok(futureQuote.reasonCodes.includes('odds_timestamp_future'));
});

test('negative worst-case interval holds cash despite positive point EV', () => {
  const result = evaluateDecision({ ...reliable, probabilityLowerBounds: [0, 0, 0] });
  assert.equal(result.status, 'hold_cash');
  assert.equal(result.action, 'hold_cash');
  assert.equal(result.risk.selectedStakeYuan, 0);
  assert.ok(result.reasonCodes.includes('worst_case_negative'));
});

test('floating odds markets are never represented as fixed redeemable trades', () => {
  const result = evaluateDecision({ ...reliable, market: 'beidan' });
  assert.equal(result.status, 'research_only');
  assert.ok(result.reasonCodes.includes('floating_market_not_supported'));
  assert.match(result.reasons.join(' '), /浮动返奖/);
});

test('a point EV tie with random selection is not called an advantage', () => {
  const result = evaluateDecision({
    ...reliable,
    odds: { home: 2, draw: 2, away: 2 },
    probabilities: [1 / 3, 1 / 3, 1 / 3],
    probabilityLowerBounds: [1 / 3, 1 / 3, 1 / 3]
  });
  assert.equal(result.status, 'hold_cash');
  assert.ok(result.reasonCodes.includes('no_improvement_over_random'));
  assert.equal(result.renderable.actualActionStakeYuan, 0);
});

test('aggregate payout caps do not create a false ordinary trade', () => {
  const result = evaluateDecision({ ...reliable, settlementTerms: { verified: true, feeRate: 0, taxRate: 0, maxPayoutYuan: 10 } });
  assert.equal(result.status, 'hold_cash');
  assert.ok(result.reasonCodes.includes('aggregate_payout_cap_requires_allocation'));
  assert.equal(result.renderable.actualActionStakeYuan, 0);
});

test('small-budget complete same-market arbitrage receives an integer certificate', () => {
  const quoteMeta = { eventId: 'E-1', marketVariant: 'SPF', line: null, settlementPeriod: 'regulation', kickoffAt: '2026-09-10T12:00:00.000Z', oddsObservedAt: '2026-09-10T11:59:30.000Z', sourceId: 'source-a' };
  const result = evaluateDecision({
    market: 'jczq', odds: { home: 4, draw: 4, away: 4 }, probabilities: [1 / 3, 1 / 3, 1 / 3], budgetYuan: 6, stakeUnitYuan: 2,
    kickoffAt: '2026-09-10T12:00:00.000Z', oddsObservedAt: '2026-09-10T11:59:30.000Z',
    now: '2026-09-10T11:59:45.000Z', settlementTerms: { verified: true, feeRate: 0, taxRate: 0, maxPayoutYuan: null },
    arbitrageQuotes: [
      { ...quoteMeta, selection: 'home', odds: 4, market: 'jczq', officialSale: true, settlementRuleVerified: true },
      { ...quoteMeta, selection: 'draw', odds: 4, market: 'jczq', officialSale: true, settlementRuleVerified: true },
      { ...quoteMeta, selection: 'away', odds: 4, market: 'jczq', officialSale: true, settlementRuleVerified: true }
    ]
  });
  assert.equal(result.arbitrage.status, 'conditional_guarantee');
  assert.deepEqual(result.arbitrage.plan.allocation, [1, 1, 1]);
  assert.equal(result.arbitrage.plan.totalCostYuan, 6);
  assert.equal(result.arbitrage.plan.guaranteedProfitYuan, 2);
  assert.equal(result.status, 'supported_trade');
  assert.equal(result.renderable.headline, '支持交易：条件套利');
});

test('arbitrage requires all mutually exclusive outcomes and simultaneous quotes', () => {
  const result = evaluateDecision({
    ...reliable,
    now: '2026-09-10T11:00:00.000Z',
    settlementTerms: { verified: true, feeRate: 0, taxRate: 0, maxPayoutYuan: null },
    arbitrageQuotes: [
      { selection: 'home', odds: 4, market: 'jczq', marketVariant: 'SPF', line: null, settlementPeriod: 'regulation', eventId: 'E-1', sourceId: 'source-a', officialSale: true, settlementRuleVerified: true, kickoffAt: reliable.kickoffAt, oddsObservedAt: reliable.oddsObservedAt },
      { selection: 'draw', odds: 4, market: 'jczq', marketVariant: 'SPF', line: null, settlementPeriod: 'regulation', eventId: 'E-1', sourceId: 'source-a', officialSale: true, settlementRuleVerified: true, kickoffAt: reliable.kickoffAt, oddsObservedAt: reliable.oddsObservedAt }
    ]
  });
  assert.equal(result.arbitrage.status, 'invalid');
  assert.ok(result.arbitrage.reasonCodes.includes('incomplete_or_duplicate_outcomes'));
  assert.equal(result.arbitrage.conditionalGuarantee, false);
});

test('arbitrage rejects a quote timestamp that is in the future of the decision clock', () => {
  const meta = { market: 'jczq', marketVariant: 'SPF', line: null, settlementPeriod: 'regulation', eventId: 'E-2', sourceId: 'source-a', officialSale: true, settlementRuleVerified: true, kickoffAt: '2026-09-10T12:00:00.000Z', oddsObservedAt: '2026-09-10T11:01:00.000Z' };
  const result = evaluateDecision({
    market: 'jczq', odds: { home: 4, draw: 4, away: 4 }, probabilities: [1 / 3, 1 / 3, 1 / 3], budgetYuan: 6, stakeUnitYuan: 2,
    now: '2026-09-10T11:00:00.000Z', settlementTerms: { verified: true, feeRate: 0, taxRate: 0, maxPayoutYuan: null },
    arbitrageQuotes: ['home', 'draw', 'away'].map(selection => ({ ...meta, selection, odds: 4 }))
  });
  assert.equal(result.arbitrage.status, 'invalid');
  assert.ok(result.arbitrage.reasonCodes.includes('quotes_not_simultaneous_pre_match'));
});
