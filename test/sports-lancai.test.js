const test = require('node:test');
const assert = require('node:assert/strict');
const LancaiEngine = require('../sports-lancai-engine.js');

test('Lancai (竞彩篮球 - JCLQ) Engine Tests', async (t) => {
  await t.test('1. Basketball 4 Core Markets & Outcome Settlement', () => {
    // Final score: Home (Warriors) 112, Away (Lakers) 105
    // Net difference: Home won by 7 points. Total points: 217

    // 1. MNL (胜负)
    const mnlResult = LancaiEngine.settleMNL(112, 105);
    assert.strictEqual(mnlResult, 'home');

    // 2. HDC (让分胜负) - Warriors -5.5
    // 112 - 5.5 = 106.5 > 105 => rq_home wins
    const hdcResult1 = LancaiEngine.settleHDC(112, 105, -5.5);
    assert.strictEqual(hdcResult1, 'rq_home');

    // If handicap was -8.5: 112 - 8.5 = 103.5 < 105 => rq_away wins
    const hdcResult2 = LancaiEngine.settleHDC(112, 105, -8.5);
    assert.strictEqual(hdcResult2, 'rq_away');

    // 3. HILO (大小分) - Line 215.5 vs actual 217
    const hiloResult1 = LancaiEngine.settleHILO(112, 105, 215.5);
    assert.strictEqual(hiloResult1, 'over');

    const hiloResult2 = LancaiEngine.settleHILO(112, 105, 220.5);
    assert.strictEqual(hiloResult2, 'under');

    // 4. WNM (胜分差) - Home won by 7 points => 'home_6_10'
    const wnmResult = LancaiEngine.settleWNM(112, 105);
    assert.strictEqual(wnmResult, 'home_6_10');
  });

  await t.test('2. Basketball Team Dynamics: Pace, OffRtg, DefRtg and Back-to-Back', () => {
    const homeTeam = {
      name: 'Warriors',
      pace: 102.5,
      offRtg: 116.2,
      defRtg: 112.0,
      isBackToBack: true // tired
    };
    const awayTeam = {
      name: 'Lakers',
      pace: 100.0,
      offRtg: 114.5,
      defRtg: 113.8,
      isBackToBack: false
    };
    const estimate = LancaiEngine.estimateBasketballDynamics(homeTeam, awayTeam);
    assert.ok(estimate.projectedPace > 100);
    // Back-to-back penalty applied
    assert.ok(estimate.homeFatigueFactor < 1.0);
    // Projected totals
    assert.ok(estimate.projectedTotalPoints > 210 && estimate.projectedTotalPoints < 240);
  });

  await t.test('3. Mutual Exclusion check for basketball mixed parlay', () => {
    // Ticket with 2 markets from same match M_BASKET_01
    const invalidTicket = [
      { matchId: 'B001', market: 'MNL', selection: 'home', odds: 1.60 },
      { matchId: 'B001', market: 'HILO', selection: 'over', odds: 1.75 }
    ];
    assert.throws(() => {
      LancaiEngine.validateBasketballTicket(invalidTicket);
    }, /cannot combine multiple markets of the same basketball match/i);
  });

  await t.test('4. Lancai mixed parlay expansion and ILP optimization', () => {
    const slip = {
      matches: [
        { matchId: 'B001', matchNum: '周六301', picks: [{ market: 'MNL', selection: 'home', label: '主胜', odds: 1.55 }] },
        { matchId: 'B002', matchNum: '周六302', picks: [{ market: 'HDC', selection: 'rq_home', label: '让主胜', odds: 1.82 }, { market: 'HDC', selection: 'rq_away', label: '让客胜', odds: 1.82 }] }
      ],
      passType: '2_1'
    };
    const combos = LancaiEngine.expandSlipToCombinations(slip);
    assert.strictEqual(combos.length, 2);

    const opt = LancaiEngine.optimizeBonus(combos, 60, 'equal');
    assert.ok(opt.totalCost <= 60);
    assert.strictEqual(opt.allocations.length, 2);
  });

  await t.test('5. Lancai Quant Model Selection and Batch Tickets Export', () => {
    const matches = [
      {
        id: 'LQ001', matchNum: '周六301',
        homeTeam: { name: '勇士', pace: 102.0, offRtg: 116.0, defRtg: 110.0, isBackToBack: false },
        awayTeam: { name: '湖人', pace: 100.0, offRtg: 114.0, defRtg: 115.0, isBackToBack: true },
        odds: { MNL: { home: 1.55, away: 2.30 }, HDC: { handicap: -4.5, rq_home: 1.82, rq_away: 1.82 }, HILO: { totalLine: 226.5, over: 1.80, under: 1.80 } }
      },
      {
        id: 'LQ002', matchNum: '周六302',
        homeTeam: { name: '凯尔特人', pace: 99.0, offRtg: 120.0, defRtg: 108.0, isBackToBack: false },
        awayTeam: { name: '雄鹿', pace: 101.0, offRtg: 116.0, defRtg: 112.0, isBackToBack: false },
        odds: { MNL: { home: 1.35, away: 3.00 }, HDC: { handicap: -7.5, rq_home: 1.80, rq_away: 1.84 }, HILO: { totalLine: 228.5, over: 1.82, under: 1.82 } }
      }
    ];

    const qSlip = LancaiEngine.generateQuantPicksLancai(matches, 'steady');
    assert.strictEqual(qSlip.matches.length, 2);

    const combos = LancaiEngine.expandSlipToCombinations(qSlip);
    const opt = LancaiEngine.optimizeBonus(combos, 50, 'equal');
    const batch = LancaiEngine.generateBatchTickets(opt, { passType: '2_1' });
    assert.strictEqual(batch.totalAmountYuan, opt.totalCost);

    const posTxt = LancaiEngine.exportPOSText(batch);
    assert.match(posTxt, /竞彩篮球/);
    assert.match(posTxt, /终端代码: JCLQ\|/);
  });
});
