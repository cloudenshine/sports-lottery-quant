const test = require('node:test');
const assert = require('node:assert/strict');
const JingcaiEngine = require('../sports-jingcai-engine.js');

test('Jingcai (JCZQ) Core Engine & Optimization Tests', async (t) => {
  await t.test('1. Return rate decay and overround (Honesty L0)', () => {
    // 1-leg ~ 0.73
    const r1 = JingcaiEngine.theoreticalReturnRate(1);
    assert.ok(Math.abs(r1 - 0.73) < 0.01);

    // 2-leg ~ 0.73^2 = 0.5329
    const r2 = JingcaiEngine.theoreticalReturnRate(2);
    assert.ok(Math.abs(r2 - 0.533) < 0.01);

    // 8-leg ~ 0.73^8 ~ 0.08
    const r8 = JingcaiEngine.theoreticalReturnRate(8);
    assert.ok(r8 < 0.09, '8-leg parlay theoretical return should drop below 9%');

    // Overround for 3-way odds [1.90, 3.20, 3.60]
    // 1/1.9 + 1/3.2 + 1/3.6 = 0.5263 + 0.3125 + 0.2778 = 1.1166 => Margin ~11.66%
    const margin = JingcaiEngine.calculateOverround([1.90, 3.20, 3.60]);
    assert.ok(margin.overround > 1.10);
    assert.ok(margin.marginPercent > 10);
  });

  await t.test('2. Anti-Mutual-Exclusion: prevents intra-match parlay collision', () => {
    // Two picks from match M001: SPF 'home' and TTG '0'
    const invalidTicket = [
      { matchId: 'M001', market: 'SPF', selection: 'home', odds: 1.80 },
      { matchId: 'M001', market: 'TTG', selection: '0', odds: 8.50 }
    ];
    assert.throws(() => {
      JingcaiEngine.validateParlayTicket(invalidTicket);
    }, /cannot contain multiple selections from the same match/i);

    // Valid ticket: two distinct matches
    const validTicket = [
      { matchId: 'M001', market: 'SPF', selection: 'home', odds: 1.80 },
      { matchId: 'M002', market: 'RQSPF', selection: 'rq_away', odds: 1.65 }
    ];
    assert.doesNotThrow(() => {
      JingcaiEngine.validateParlayTicket(validTicket);
    });
  });

  await t.test('3. Expand Multi-match Slip into valid Cartesian Combinations', () => {
    // User selects M001: [SPF home(1.8), SPF draw(3.2)], M002: [RQSPF rq_away(1.5)]
    // In 2串1, this should expand into 2 valid combinations:
    // Combo 1: M001(home) * M002(rq_away)
    // Combo 2: M001(draw) * M002(rq_away)
    const slip = {
      matches: [
        {
          matchId: 'M001',
          picks: [
            { market: 'SPF', selection: 'home', odds: 1.80 },
            { market: 'SPF', selection: 'draw', odds: 3.20 }
          ]
        },
        {
          matchId: 'M002',
          picks: [
            { market: 'RQSPF', selection: 'rq_away', odds: 1.50 }
          ]
        }
      ],
      passType: '2_1'
    };
    const combos = JingcaiEngine.expandSlipToCombinations(slip);
    assert.strictEqual(combos.length, 2);
    assert.strictEqual(combos[0].legs.length, 2);
    assert.strictEqual(combos[1].legs.length, 2);
    assert.notStrictEqual(combos[0].legs[0].selection, combos[1].legs[0].selection);
  });

  await t.test('4. Official Banker Rounding and Ticket Prize Limits', () => {
    // Official single bet price: 2 Yuan
    // 2 * 1.85 * 2.15 = 7.955 => Rounded to 7.96 Yuan
    const prize = JingcaiEngine.calculateSingleBetPayout([1.85, 2.15], 1);
    assert.strictEqual(prize, 7.96);

    // Ceiling limits:
    // Single match max 100,000
    const hugeOdds1 = [60000.0];
    const prizeSingle = JingcaiEngine.calculateSingleBetPayout(hugeOdds1, 1, '1_1');
    assert.strictEqual(prizeSingle, 100000.0);

    // 2-leg max 200,000
    const hugeOdds2 = [500.0, 500.0]; // 2 * 250000 = 500,000 => capped to 200,000
    const prize2Leg = JingcaiEngine.calculateSingleBetPayout(hugeOdds2, 1, '2_1');
    assert.strictEqual(prize2Leg, 200000.0);

    // 4-leg max 500,000
    const hugeOdds4 = [100.0, 100.0, 10.0, 10.0]; // 20,000,000 => capped to 500,000
    const prize4Leg = JingcaiEngine.calculateSingleBetPayout(hugeOdds4, 1, '4_1');
    assert.strictEqual(prize4Leg, 500000.0);

    // 6-leg max 1,000,000
    const hugeOdds6 = [20.0, 20.0, 20.0, 20.0, 5.0, 5.0];
    const prize6Leg = JingcaiEngine.calculateSingleBetPayout(hugeOdds6, 1, '6_1');
    assert.strictEqual(prize6Leg, 1000000.0);
  });

  await t.test('5. Postponed / Canceled match fallback: odds treated as 1.0', () => {
    // Match M002 is canceled. Leg odds becomes 1.0
    const odds = [1.80, { odds: 3.50, isCanceled: true }];
    const payout = JingcaiEngine.calculateSingleBetPayout(odds, 1, '2_1');
    // 2 * 1.80 * 1.0 = 3.60
    assert.strictEqual(payout, 3.60);
  });

  await t.test('6. ILP Bonus Optimization: Equal Profit (Variance Minimized)', () => {
    // 3 combinations with odds: Combo A (2.5), Combo B (5.0), Combo C (10.0)
    // Budget: 100 Yuan (50 bets)
    const combos = [
      { id: 'c1', totalOdds: 2.50 },
      { id: 'c2', totalOdds: 5.00 },
      { id: 'c3', totalOdds: 10.00 }
    ];
    const optimized = JingcaiEngine.optimizeBonus(combos, 100, 'equal');

    // Total spend must exactly equal budget or budget - 2 if indivisible, but never exceed
    assert.ok(optimized.totalCost <= 100);
    assert.ok(optimized.totalCost >= 96);
    // All multipliers must be integers >= 1
    optimized.allocations.forEach(a => {
      assert.ok(Number.isInteger(a.multiplier));
      assert.ok(a.multiplier >= 1);
    });

    // In equal profit, the lowest odds combo (2.50) must receive the highest multiplier
    const m1 = optimized.allocations.find(a => a.id === 'c1').multiplier;
    const m2 = optimized.allocations.find(a => a.id === 'c2').multiplier;
    const m3 = optimized.allocations.find(a => a.id === 'c3').multiplier;
    assert.ok(m1 > m2, 'Lower odds must have higher multiplier in equal profit');
    assert.ok(m2 > m3, 'Middle odds must have higher multiplier than highest odds');

    // Projected payouts should be roughly balanced (variance minimized)
    const payouts = optimized.allocations.map(a => a.expectedPayout);
    const minPayout = Math.min(...payouts);
    const maxPayout = Math.max(...payouts);
    assert.ok(maxPayout - minPayout < 35, `Max-Min gap should be small in equal profit, got ${maxPayout - minPayout}`);
  });

  await t.test('7. ILP Bonus Optimization: Cold Skewed (Underdog Maximization)', () => {
    const combos = [
      { id: 'c1', totalOdds: 2.00 }, // favorite
      { id: 'c2', totalOdds: 4.00 },
      { id: 'c3', totalOdds: 15.00 } // deep cold
    ];
    const budget = 100;
    const optimized = JingcaiEngine.optimizeBonus(combos, budget, 'cold');
    assert.ok(optimized.totalCost <= budget);
    // Cold allocation dumps extra budget to the highest odds combo (c3)
    const a3 = optimized.allocations.find(a => a.id === 'c3');
    const a1 = optimized.allocations.find(a => a.id === 'c1');
    assert.ok(a3.multiplier > 1);
    // Highest payout should be from c3
    assert.ok(a3.expectedPayout > a1.expectedPayout * 2);
  });

  await t.test('8. ILP Bonus Optimization: Budget Locks and Insufficient Budget Rejection', () => {
    const combos = [
      { id: 'c1', totalOdds: 2.0 },
      { id: 'c2', totalOdds: 3.0 },
      { id: 'c3', totalOdds: 4.0 }
    ];
    // Need at least 3 combos * 2 = 6 Yuan. Budget = 4 Yuan must reject!
    assert.throws(() => {
      JingcaiEngine.optimizeBonus(combos, 4, 'equal');
    }, /Budget 4 Yuan is insufficient for 3 combinations/i);
  });

  await t.test('9. Batch Ticket Generation (批量出票) and POS Text Export', () => {
    const combos = [
      { id: 'c1', totalOdds: 3.5, legs: [{ matchNum: '周四001', selection: '胜', label: '胜', odds: 1.75 }, { matchNum: '周四002', selection: '平', label: '平', odds: 2.0 }] },
      { id: 'c2', totalOdds: 4.8, legs: [{ matchNum: '周四001', selection: '胜', label: '胜', odds: 1.75 }, { matchNum: '周四002', selection: '负', label: '负', odds: 2.74 }] }
    ];
    const opt = JingcaiEngine.optimizeBonus(combos, 40, 'equal');
    const batch = JingcaiEngine.generateBatchTickets(opt, { date: '2026-09-03', passType: '2_1' });

    assert.strictEqual(batch.totalTickets, 2);
    assert.strictEqual(batch.totalAmountYuan, opt.totalCost);
    assert.ok(batch.tickets[0].ticketNo.startsWith('JC-20260903-'));
    assert.strictEqual(batch.tickets[0].passType, '2串1');

    const posTxt = JingcaiEngine.exportPOSText(batch);
    assert.match(posTxt, /中国体育彩票 · 竞彩足球批量机打单/);
    assert.match(posTxt, /周四001\[胜\]\(1.75\)\s*[×*]\s*周四002\[平\]\(2\)/);
    assert.match(posTxt, /终端代码: JCZQ\|/);
  });
});
