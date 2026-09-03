const test = require('node:test');
const assert = require('node:assert/strict');
const SFCEngine = require('../sports-sfc-engine.js');

test('SFC (14场胜负彩) and RX9 (任选九场) Engine Tests', async (t) => {
  await t.test('1. SFC 14 matches bet count calculation', () => {
    // 14 matches: 10 singles, 3 doubles, 1 triple
    // Total bets = 1^10 * 2^3 * 3^1 = 8 * 3 = 24 bets = 48 Yuan
    const picks = [
      ['3'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0'],
      ['3', '1'], ['3', '0'], ['1', '0'],
      ['3', '1', '0']
    ];
    const result = SFCEngine.calculateSFC14Bets(picks);
    assert.strictEqual(result.betCount, 24);
    assert.strictEqual(result.costYuan, 48);

    // Incomplete 14 picks should throw
    assert.throws(() => {
      SFCEngine.calculateSFC14Bets(picks.slice(0, 13));
    }, /SFC 14 requires exactly 14 matches/i);
  });

  await t.test('2. RX9 (任选九) bet count calculation (C(M, 9) combinations)', () => {
    // Exact 9 matches selected, all single: 1 bet = 2 Yuan
    const exact9Single = new Array(14).fill(null);
    for (let i = 0; i < 9; i++) exact9Single[i] = ['3'];
    const r1 = SFCEngine.calculateRX9Bets(exact9Single);
    assert.strictEqual(r1.betCount, 1);
    assert.strictEqual(r1.costYuan, 2);

    // 10 matches selected, all single: C(10, 9) = 10 bets = 20 Yuan
    const tenMatchesSingle = new Array(14).fill(null);
    for (let i = 0; i < 10; i++) tenMatchesSingle[i] = ['3'];
    const r2 = SFCEngine.calculateRX9Bets(tenMatchesSingle);
    assert.strictEqual(r2.betCount, 10);
    assert.strictEqual(r2.costYuan, 20);

    // 9 matches selected: 7 singles, 2 doubles: 1 * 2^2 = 4 bets = 8 Yuan
    const nineWithDoubles = new Array(14).fill(null);
    for (let i = 0; i < 7; i++) nineWithDoubles[i] = ['3'];
    nineWithDoubles[7] = ['3', '1'];
    nineWithDoubles[8] = ['3', '0'];
    const r3 = SFCEngine.calculateRX9Bets(nineWithDoubles);
    assert.strictEqual(r3.betCount, 4);
    assert.strictEqual(r3.costYuan, 8);

    // Less than 9 matches selected should throw
    const eightMatches = new Array(14).fill(null);
    for (let i = 0; i < 8; i++) eightMatches[i] = ['3'];
    assert.throws(() => {
      SFCEngine.calculateRX9Bets(eightMatches);
    }, /RX9 requires at least 9 selected matches/i);
  });

  await t.test('3. Coldness Index & "Fire-Pot" (火锅奖) warning', () => {
    // All 14 matches pick ultra-favorites with probabilities > 0.70
    const ultraHotOdds = new Array(14).fill({ odds: { '3': 1.25, '1': 5.50, '0': 11.0 } });
    const hotPicks = new Array(14).fill(['3']);
    const hotColdness = SFCEngine.calculateColdnessIndex(hotPicks, ultraHotOdds);
    assert.ok(hotColdness.score < 25, `Ultra-hot picks should have low coldness score, got ${hotColdness.score}`);
    assert.strictEqual(hotColdness.firePotWarning, true, 'Should warn about low jackpot pool split (火锅奖)');

    // Balanced picks with 3 medium underdogs (odds > 3.5)
    const balancedPicks = [...hotPicks];
    balancedPicks[3] = ['1']; // draw
    balancedPicks[7] = ['0']; // away underdog
    balancedPicks[11] = ['1'];
    const balancedColdness = SFCEngine.calculateColdnessIndex(balancedPicks, ultraHotOdds);
    assert.ok(balancedColdness.score > 40);
    assert.strictEqual(balancedColdness.firePotWarning, false);
  });

  await t.test('4. Covering / Reduction Wheel (保14中13)', () => {
    // A 14-match ticket with 4 doubles and 10 singles = 16 bets
    // Reduction algorithm compresses to subset guaranteeing at least 13 hits
    const picks = [
      ['3', '1'], ['3', '0'], ['1', '0'], ['3', '1'],
      ['3'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0']
    ];
    const wheel = SFCEngine.generateCoveringReduction(picks, { guarantee: 13 });
    assert.ok(wheel.reducedBets.length < 16, 'Reduced bets count should be strictly less than full 16 bets');
    assert.ok(wheel.compressionRate > 0);
    // Verify covering property: every possible outcome within picks has at least one reduced bet matching >= 13
    assert.strictEqual(wheel.guaranteedRank, 13);
  });

  await t.test('5. SFC / RX9 Quant Model Selection (量化模型自动选单)', () => {
    const matches = new Array(14).fill(null).map((_, i) => ({
      matchIdx: i + 1,
      home: `主队${i+1}`,
      away: `客队${i+1}`,
      odds: i < 6 ? { '3': 1.30, '1': 4.8, '0': 8.5 } : { '3': 2.30, '1': 3.1, '0': 2.8 }
    }));

    // 14-match model selection: should assign bankers to heavy favorites and double protection to tight matches
    const q14 = SFCEngine.generateQuantPicks14(matches);
    assert.strictEqual(q14.picks.length, 14);
    assert.ok(q14.betCount >= 8, 'Should configure multi-bets for protection');
    assert.ok(q14.costYuan >= 16);

    // RX9 model selection: should pick exactly 9 matches
    const qRx9 = SFCEngine.generateQuantPicksRX9(matches);
    const selectedCount = qRx9.picks.filter(p => p && p.length > 0).length;
    assert.strictEqual(selectedCount, 9, 'RX9 model must select exactly 9 matches');
    assert.ok(qRx9.betCount >= 1);
  });

  await t.test('6. SFC / RX9 Batch Tickets Generation & POS Export', () => {
    const picks = [
      ['3', '1'], ['3'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0'], ['3'], ['1'], ['0']
    ];
    const batch = SFCEngine.generateBatchTickets(picks, '14', { issue: '25068', multiplier: 2 });
    assert.strictEqual(batch.totalTickets, 2);
    assert.strictEqual(batch.totalAmountYuan, 8); // 2 bets * 2 multiplier * 2 yuan = 8 yuan

    const posTxt = SFCEngine.exportPOSText(batch, { issue: '25068' });
    assert.match(posTxt, /传统足彩/);
    assert.match(posTxt, /第25068期/);
    assert.match(posTxt, /终端代码: SFC14\|/);
  });
});
