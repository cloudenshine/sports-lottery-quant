const test = require('node:test');
const assert = require('node:assert/strict');
const BeidanEngine = require('../sports-beidan-engine.js');

test('Beidan (北京单场 - DC) Engine Tests', async (t) => {
  await t.test('1. Floating SP and 65% statutory return rate', () => {
    // Beidan statutory payout rate is 65%
    assert.strictEqual(BeidanEngine.RETURN_RATE, 0.65);

    // Expected prize calculation: 2 * SP1 * SP2 * 0.65
    // E.g. SP1 = 2.10, SP2 = 1.90
    // 2 * 2.10 * 1.90 * 0.65 = 5.187 => rounded to 5.19 Yuan
    const prize = BeidanEngine.calculateFloatingPayout([2.10, 1.90], 1);
    assert.strictEqual(prize, 5.19);
  });

  await t.test('2. Handicap SPF logic (-0.5, +0.5, -1, +1, etc.)', () => {
    // Match score 2-1 (Home 2, Away 1)
    // If handicap is -1 (Home -1): Effective score is 1-1 => Outcome is 'draw' (1)
    const out1 = BeidanEngine.evaluateHandicapResult(2, 1, -1);
    assert.strictEqual(out1, 'draw');

    // If handicap is -0.5 (Home -0.5): Effective score is 1.5 - 1 => Outcome is 'home' (3)
    const out2 = BeidanEngine.evaluateHandicapResult(2, 1, -0.5);
    assert.strictEqual(out2, 'home');

    // If handicap is +0.5 (Home +0.5): Effective score is 2.5 - 1 => Outcome is 'home' (3)
    const out3 = BeidanEngine.evaluateHandicapResult(2, 1, 0.5);
    assert.strictEqual(out3, 'home');

    // Match score 1-2 (Home 1, Away 2), handicap +1: 2-2 => 'draw' (1)
    const out4 = BeidanEngine.evaluateHandicapResult(1, 2, 1);
    assert.strictEqual(out4, 'draw');
  });

  await t.test('3. Beidan parlay range: supports 1 to 15 legs', () => {
    // 1-leg
    assert.doesNotThrow(() => {
      BeidanEngine.validateParlayLegCount(1);
    });
    // 15-legs
    assert.doesNotThrow(() => {
      BeidanEngine.validateParlayLegCount(15);
    });
    // > 15 legs should throw
    assert.throws(() => {
      BeidanEngine.validateParlayLegCount(16);
    }, /Beidan supports up to 15 legs/i);
  });

  await t.test('4. Beidan Slip expansion and Bonus Optimization (65% return)', () => {
    const slip = {
      matches: [
        { matchId: 'DC001', matchNum: '北单001', picks: [{ selection: '3', label: '胜', sp: 2.1 }] },
        { matchId: 'DC002', matchNum: '北单002', picks: [{ selection: '1', label: '平', sp: 3.5 }, { selection: '0', label: '负', sp: 3.2 }] }
      ],
      passType: '2_1'
    };
    const combos = BeidanEngine.expandSlipToCombinations(slip);
    assert.strictEqual(combos.length, 2);

    const opt = BeidanEngine.optimizeBonus(combos, 50, 'equal');
    assert.ok(opt.totalCost <= 50);
    assert.strictEqual(opt.allocations.length, 2);
    assert.ok(opt.allocations[0].multiplier >= 1);
  });

  await t.test('5. Beidan Quant Model Selection and Batch Tickets Export', () => {
    const matches = [
      { id: 'DC001', matchNum: '北单001', handicap: -0.5, spOdds: { '3': 1.95, '1': 3.4, '0': 3.5 } },
      { id: 'DC002', matchNum: '北单002', handicap: 0.5, spOdds: { '3': 2.10, '1': 3.3, '0': 3.1 } },
      { id: 'DC003', matchNum: '北单003', handicap: -1.5, spOdds: { '3': 2.25, '1': 3.8, '0': 2.6 } }
    ];
    const qSlip = BeidanEngine.generateQuantPicksBeidan(matches, 'steady');
    assert.ok(qSlip.matches.length >= 2);

    const combos = BeidanEngine.expandSlipToCombinations(qSlip);
    const opt = BeidanEngine.optimizeBonus(combos, 40, 'equal');
    const batch = BeidanEngine.generateBatchTickets(opt, { passType: '2_1' });
    assert.ok(batch.totalTickets >= 1);
    assert.strictEqual(batch.totalAmountYuan, opt.totalCost);

    const posTxt = BeidanEngine.exportPOSText(batch);
    assert.match(posTxt, /北京单场/);
    assert.match(posTxt, /终端代码: DC\|/);
  });
});
