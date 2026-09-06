/**
 * sports-lancai-engine.js
 * 竞彩篮球 (JCLQ) 核心计算与量化分析引擎
 * 涵盖：胜负(MNL)、让分胜负(HDC)、大小分(HILO)、胜分差(WNM)四大玩法结算与规则、队伍节奏与背靠背体能预测模型、互斥校验。
 */

function lancaiValidateSlip(matches, passType) {
  if (!Array.isArray(matches)) throw new RangeError('matches must be an array');
  if (matches.length > 8) throw new RangeError('Too many parlay matches');
  if (passType !== undefined && passType !== `${matches.length}_1`) throw new RangeError('Only the matching all-leg n_1 pass type is supported');
  const ids = new Set();
  let count = 1;
  for (const m of matches) {
    if (!m || m.matchId == null || String(m.matchId).trim() === '') throw new RangeError('matchId is required');
    const id = String(m.matchId);
    if (ids.has(id)) throw new RangeError('Cannot contain multiple selections from the same match in a single parlay');
    ids.add(id);
    if (!Array.isArray(m.picks) || !m.picks.length) throw new RangeError('Each match requires picks');
    const selected = new Set();
    for (const p of m.picks) {
      if (!p || p.selection == null || !Number.isFinite(p.odds) || p.odds <= 1) throw new RangeError('Selections require finite decimal odds greater than 1');
      const identity = `${p.market || ''}:${p.selection}`;
      if (selected.has(identity)) throw new RangeError('Duplicate match selection');
      selected.add(identity);
    }
    count *= m.picks.length;
    if (count > 100000) throw new RangeError('Slip expansion supports at most 100000 combinations');
  }
}

function lancaiValidateScores(home, away) {
  if (![home, away].every(s => Number.isInteger(s) && s >= 0)) throw new RangeError('Scores must be nonnegative integers');
}

// Football and basketball share the verified fixed-prize arithmetic and physical-ticket limits.
// sports.html loads JingcaiEngine first; Node resolves the same implementation through require.
function lancaiPayoutEngine() {
  if (typeof module !== 'undefined' && module.exports) return require('./sports-jingcai-engine.js');
  if (typeof window !== 'undefined' && window.JingcaiEngine) return window.JingcaiEngine;
  throw new Error('JingcaiEngine payout arithmetic must be loaded before LancaiEngine');
}

const LancaiEngine = {
  calculateSingleBetPayout(oddsList, multiplier = 1, passType = '2_1') {
    return lancaiPayoutEngine().calculateSingleBetPayout(oddsList, multiplier, passType);
  },

  calculateTicketPayout(winningBets, multiplier = 1, options = {}) {
    return lancaiPayoutEngine().calculateTicketPayout(winningBets, multiplier, options);
  },

  validateTicketLimits(unitBetCount, multiplier = 1) {
    return lancaiPayoutEngine().validateTicketLimits(unitBetCount, multiplier);
  },

  splitTicketMultipliers(multiplier, unitBetCount = 1) {
    return lancaiPayoutEngine().splitTicketMultipliers(multiplier, unitBetCount);
  },
  /**
   * 胜负 (MNL) 结果结算
   */
  settleMNL(homeScore, awayScore) {
    lancaiValidateScores(homeScore, awayScore);
    if (homeScore === awayScore) throw new RangeError('Tied score does not establish a final basketball winner');
    return homeScore > awayScore ? 'home' : 'away';
  },

  /**
   * 让分胜负 (HDC) 结果结算
   * @param {number} homeScore 主队得分
   * @param {number} awayScore 客队得分
   * @param {number} handicap 让分点 (通常带0.5，如 -5.5, +3.5)
   */
  settleHDC(homeScore, awayScore, handicap) {
    lancaiValidateScores(homeScore, awayScore);
    if (!Number.isFinite(handicap) || homeScore + handicap === awayScore) throw new RangeError('Invalid or tied handicap; settlement rule required');
    const net = homeScore + handicap - awayScore;
    return net > 0 ? 'rq_home' : 'rq_away';
  },

  /**
   * 大小分 (HILO) 结果结算
   * @param {number} homeScore 主队得分
   * @param {number} awayScore 客队得分
   * @param {number} totalLine 预设总分基准 (如 215.5)
   */
  settleHILO(homeScore, awayScore, totalLine) {
    lancaiValidateScores(homeScore, awayScore);
    if (!Number.isFinite(totalLine) || totalLine <= 0 || homeScore + awayScore === totalLine) throw new RangeError('Invalid or tied total line; settlement rule required');
    const total = homeScore + awayScore;
    return total > totalLine ? 'over' : 'under';
  },

  /**
   * 胜分差 (WNM) 结果结算 (12个区间)
   */
  settleWNM(homeScore, awayScore) {
    lancaiValidateScores(homeScore, awayScore);
    if (homeScore === awayScore) throw new RangeError('Tied score does not establish a final basketball winner');
    const diff = homeScore - awayScore;
    const isHome = diff > 0;
    const absDiff = Math.abs(diff);
    const side = isHome ? 'home' : 'away';

    let range = '';
    if (absDiff >= 1 && absDiff <= 5) range = '1_5';
    else if (absDiff >= 6 && absDiff <= 10) range = '6_10';
    else if (absDiff >= 11 && absDiff <= 15) range = '11_15';
    else if (absDiff >= 16 && absDiff <= 20) range = '16_20';
    else if (absDiff >= 21 && absDiff <= 25) range = '21_25';
    else range = '26_plus';

    return `${side}_${range}`;
  },

  /**
   * 篮球队伍战力与节奏预期动态建模
   * 结合攻防百回合效率 (OffRtg/DefRtg)、回合节奏 (Pace) 与背靠背疲劳损耗
   */
  estimateBasketballDynamics(homeTeam, awayTeam) {
    for (const team of [homeTeam, awayTeam]) {
      if (!team || ['pace', 'offRtg', 'defRtg'].some(k => !Number.isFinite(team[k]) || team[k] <= 0)) throw new RangeError('Observed positive pace, offRtg and defRtg are required');
    }
    const leagueAvgRtg = 114.0;
    const projectedPace = ((homeTeam.pace || 100.0) + (awayTeam.pace || 100.0)) / 2.0;

    const homeFatigueFactor = homeTeam.isBackToBack ? 0.96 : 1.0;
    const awayFatigueFactor = awayTeam.isBackToBack ? 0.96 : 1.0;

    // 主场优势约 +2.5 分
    const homeAdvantagePts = 2.5;

    const homeExp = ((homeTeam.offRtg * awayTeam.defRtg) / leagueAvgRtg) * (projectedPace / 100.0) * homeFatigueFactor + homeAdvantagePts;
    const awayExp = ((awayTeam.offRtg * homeTeam.defRtg) / leagueAvgRtg) * (projectedPace / 100.0) * awayFatigueFactor;

    const projectedTotalPoints = Math.round((homeExp + awayExp) * 10) / 10;
    const projectedSpread = Math.round((homeExp - awayExp) * 10) / 10;

    return {
      projectedPace: Math.round(projectedPace * 10) / 10,
      homeFatigueFactor,
      awayFatigueFactor,
      projectedHomeScore: Math.round(homeExp * 10) / 10,
      projectedAwayScore: Math.round(awayExp * 10) / 10,
      projectedTotalPoints,
      projectedSpread,
      modelStatus: 'uncalibrated-heuristic',
      evidenceOfPredictiveEdge: false
    };
  },

  /**
   * 篮彩单注互斥校验
   */
  validateBasketballTicket(legs) {
    if (!Array.isArray(legs) || !legs.length) throw new RangeError('A nonempty legs array is required');
    const seenMatchIds = new Set();
    for (const leg of legs) {
      if (!leg || leg.matchId == null || String(leg.matchId).trim() === '') throw new RangeError('matchId is required');
      if (seenMatchIds.has(String(leg.matchId))) {
        throw new Error(`Cannot combine multiple markets of the same basketball match in a single parlay: ${leg.matchId}`);
      }
      seenMatchIds.add(String(leg.matchId));
    }
    return true;
  },

  /**
   * 展开篮彩复选单为合法单注笛卡尔积组合
   */
  expandSlipToCombinations(slip) {
    const matches = slip.matches || [];
    if (matches.length === 0) return [];
    lancaiValidateSlip(matches, slip.passType);

    function cartesian(arr) {
      return arr.reduce((a, b) => {
        return a.flatMap(d => b.picks.map(e => [...d, { ...e, matchId: b.matchId, matchNum: b.matchNum || b.matchId }]));
      }, [[]]);
    }

    const rawCombos = cartesian(matches);
    return rawCombos.map((legs, idx) => {
      this.validateBasketballTicket(legs);
      const totalOdds = legs.reduce((prod, l) => prod * l.odds, 1.0);
      if (!Number.isFinite(totalOdds)) throw new RangeError('Combination price overflow');
      return {
        id: `lq_combo_${idx + 1}`,
        passType: slip.passType || `${legs.length}_1`,
        legs,
        totalOdds
      };
    });
  },

  /**
   * 篮彩 条件奖金分配启发式
   */
  optimizeBonus(combos, budgetYuan, strategy = 'equal') {
    if (!Array.isArray(combos)) throw new RangeError('combinations must be an array');
    if (!Number.isFinite(budgetYuan) || budgetYuan < 0 || budgetYuan > 200000) throw new RangeError('Budget must be finite, nonnegative and at most 200000 Yuan for this allocation solver');
    if (combos.some(c => !c || !Number.isFinite(c.totalOdds) || c.totalOdds < 1 || !Number.isFinite(c.totalOdds * Math.max(2, budgetYuan)))) throw new RangeError('Combination prices must be finite and positive');
    if (!['equal'].includes(strategy)) throw new RangeError('Unsupported allocation strategy');

    const n = combos.length;
    if (n === 0) throw new Error('No combinations to optimize');
    const minCost = n * 2;
    if (budgetYuan < minCost) {
      throw new Error(`Budget ${budgetYuan} Yuan is insufficient for ${n} combinations`);
    }

    const passTypes = combos.map(c => c.passType || (c.legs && `${c.legs.length}_1`) || '2_1');
    const unitPrizeCents = combos.map((c, i) => lancaiPayoutEngine().calculateSingleBetPayoutCents(c.legs || [c.totalOdds], passTypes[i]));
    const mults = new Array(n).fill(1);
    let remainingBudget = budgetYuan - minCost;
    let extraBets = Math.floor(remainingBudget / 2);

    while (extraBets > 0) {
      let minIdx = 0;
      let minPayout = mults[0] * unitPrizeCents[0];
      for (let i = 1; i < n; i++) {
        const p = mults[i] * unitPrizeCents[i];
        if (p < minPayout) {
          minPayout = p;
          minIdx = i;
        }
      }
      mults[minIdx]++;
      extraBets--;
    }

    const allocations = combos.map((c, i) => {
      const multiplier = mults[i];
      const expectedPayout = this.calculateSingleBetPayout(c.legs || [c.totalOdds], multiplier, passTypes[i]);
      return {
        id: c.id,
        multiplier,
        totalOdds: c.totalOdds,
        passType: passTypes[i],
        quotePrecisionStatus: c.legs ? 'original-leg-decimals' : 'aggregated-odds-input',
        expectedPayout,
        payoutIfWin: expectedPayout,
        payoutMeaning: 'conditional-on-winning-not-expected-value',
        legs: c.legs
      };
    });

    const totalCost = mults.reduce((sum, m) => sum + m * 2, 0);
    return {
      strategy,
      budget: budgetYuan,
      totalCost,
      leftoverYuan: budgetYuan - totalCost,
      allocations,
      allocationMethod: 'greedy-integer-allocation',
      guaranteedProfit: false,
      evidenceOfPredictiveEdge: false,
      payoutRulesStatus: 'verified-fixed-payout-arithmetic-only',
      ruleIds: ['jingcai.fixed-gross-payout', 'jingcai.rounding', 'jingcai.caps', 'jingcai.policy-limits'],
      eligibilityStatus: 'not-evaluated',
      resultStatus: 'not-evaluated'
    };
  },

  /**
   * 篮彩量化模型自动选单 (节奏分析 & 背靠背疲劳)
   */
  generateQuantPicksLancai(matches, strategy = 'steady') {
    if (!Array.isArray(matches) || matches.length < 2) throw new Error('Requires at least 2 matches');
    const pairs = { MNL: ['home', 'away'], HDC: ['rq_home', 'rq_away'], HILO: ['over', 'under'] };
    const candidates = matches.map(m => {
      if (!m || m.id == null || !m.odds) throw new RangeError('Observed match identity and odds are required');
      let best = null;
      for (const [market, selections] of Object.entries(pairs)) {
        const quotes = m.odds[market];
        if (!quotes) continue;
        if (selections.some(k => !Number.isFinite(quotes[k]) || quotes[k] <= 1)) throw new RangeError('Complete decimal market odds greater than 1 are required');
        if (market === 'HDC' && !Number.isFinite(quotes.handicap)) throw new RangeError('Observed handicap is required');
        if (market === 'HILO' && (!Number.isFinite(quotes.totalLine) || quotes.totalLine <= 0)) throw new RangeError('Observed total line is required');
        const total = selections.reduce((sum, k) => sum + 1 / quotes[k], 0);
        for (const selection of selections) {
          const probability = 1 / quotes[selection] / total;
          if (!best || probability > best.probability) best = { probability, market, selection, odds: quotes[selection], label: selection };
        }
      }
      if (!best) throw new RangeError('At least one complete basketball market is required');
      return { matchId: m.id, matchNum: m.matchNum, picks: [best], probability: best.probability };
    });
    if (new Set(candidates.map(m => String(m.matchId))).size !== candidates.length) throw new RangeError('Duplicate match identity');
    candidates.sort((a, b) => b.probability - a.probability || String(a.matchId).localeCompare(String(b.matchId)));
    return { matches: candidates.slice(0, 2), passType: '2_1', modelStatus: 'market-implied-baseline', evidenceOfPredictiveEdge: false };
  },

  /**
   * 篮彩批量实体票单生成
   */
  generateBatchTickets(optimizedResult, meta = {}) {
    const allocations = optimizedResult.allocations || [];
    const dateStr = meta.date || new Date().toISOString().slice(0, 10);

    let sequence = 0;
    const tickets = allocations.flatMap(item => {
      if (!Array.isArray(item.legs) || !item.legs.length) throw new RangeError('Original ticket legs are required for batch export');
      const itemPassType = item.passType || meta.passType || `${item.legs.length}_1`;
      if (meta.passType && item.passType && meta.passType !== item.passType) throw new RangeError('Batch pass type conflicts with allocation');
      if (itemPassType !== `${item.legs.length}_1`) throw new RangeError('Batch pass type must match original legs');
      const itemPassLabel = itemPassType.replace('_', '串');
      const legTexts = item.legs.map(l => `${l.matchNum || l.matchId}[${l.label || l.selection}](${l.oddsDecimal ?? l.odds})`);
      const fullDesc = legTexts.join(' × ');
      return this.splitTicketMultipliers(item.multiplier).map(multiplier => {
        this.validateTicketLimits(1, multiplier);
        const ticketNo = `LQ-${dateStr.replace(/-/g, '')}-${String(++sequence).padStart(3, '0')}`;
        const amountYuan = multiplier * 2;
        const expectedPayout = this.calculateSingleBetPayout(item.legs, multiplier, itemPassType);
        return {
          ticketNo, date: dateStr, gameName: '中国体育彩票 · 竞彩篮球(JCLQ)',
          passType: itemPassLabel, legs: item.legs, fullDesc, multiplier, amountYuan, expectedPayout,
          payoutIfWin: expectedPayout, sourceAllocationId: item.id,
          posLine: `[竞彩篮球] ${dateStr} ${fullDesc} | ${itemPassLabel} | ${multiplier}倍 | ${amountYuan}元`
        };
      });
    });

    return {
      totalTickets: tickets.length,
      totalAmountYuan: tickets.reduce((s, t) => s + t.amountYuan, 0),
      tickets
    };
  },

  /**
   * 篮彩导出打票机代码
   */
  exportPOSText(batchResult, meta = {}) {
    const lines = [];
    lines.push('================================================');
    lines.push('       中国体育彩票 · 竞彩篮球(JCLQ)机打单       ');
    lines.push(`出票日期: ${meta.date || new Date().toLocaleString('zh-CN')}  玩法: 混合过关`);
    lines.push(`总单注数: ${batchResult.totalTickets} 张  总金额: ${batchResult.totalAmountYuan} 元`);
    lines.push('================================================\n');

    batchResult.tickets.forEach((t) => {
      lines.push(`【单号 ${t.ticketNo}】`);
      lines.push(`对阵选项: ${t.fullDesc}`);
      lines.push(`过关方式: ${t.passType} | 倍数: ${t.multiplier} 倍 | 票面金额: ${t.amountYuan} 元`);
      lines.push(`理论中奖: ${t.expectedPayout} 元`);
      lines.push(`终端代码: JCLQ|${t.legs.map(l => `${l.matchNum || l.matchId}:${l.selection}`).join('*')}|${t.passType}|${t.multiplier}`);
      lines.push('------------------------------------------------');
    });

    lines.push('\n[请彩站店员核对后置入打票机扫描出票]');
    return lines.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LancaiEngine;
}
if (typeof window !== 'undefined') {
  window.LancaiEngine = LancaiEngine;
}
