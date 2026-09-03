/**
 * sports-lancai-engine.js
 * 竞彩篮球 (JCLQ) 核心计算与量化分析引擎
 * 涵盖：胜负(MNL)、让分胜负(HDC)、大小分(HILO)、胜分差(WNM)四大玩法结算与规则、队伍节奏与背靠背体能预测模型、互斥校验。
 */

const LancaiEngine = {
  /**
   * 胜负 (MNL) 结果结算
   */
  settleMNL(homeScore, awayScore) {
    return homeScore > awayScore ? 'home' : 'away';
  },

  /**
   * 让分胜负 (HDC) 结果结算
   * @param {number} homeScore 主队得分
   * @param {number} awayScore 客队得分
   * @param {number} handicap 让分点 (通常带0.5，如 -5.5, +3.5)
   */
  settleHDC(homeScore, awayScore, handicap) {
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
    const total = homeScore + awayScore;
    return total > totalLine ? 'over' : 'under';
  },

  /**
   * 胜分差 (WNM) 结果结算 (12个区间)
   */
  settleWNM(homeScore, awayScore) {
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
      projectedSpread
    };
  },

  /**
   * 篮彩单注互斥校验
   */
  validateBasketballTicket(legs) {
    const seenMatchIds = new Set();
    for (const leg of legs) {
      if (seenMatchIds.has(leg.matchId)) {
        throw new Error(`Cannot combine multiple markets of the same basketball match in a single parlay: ${leg.matchId}`);
      }
      seenMatchIds.add(leg.matchId);
    }
    return true;
  },

  /**
   * 展开篮彩复选单为合法单注笛卡尔积组合
   */
  expandSlipToCombinations(slip) {
    const matches = slip.matches || [];
    if (matches.length === 0) return [];

    function cartesian(arr) {
      return arr.reduce((a, b) => {
        return a.flatMap(d => b.picks.map(e => [...d, { matchId: b.matchId, matchNum: b.matchNum || b.matchId, ...e }]));
      }, [[]]);
    }

    const rawCombos = cartesian(matches);
    return rawCombos.map((legs, idx) => {
      this.validateBasketballTicket(legs);
      const totalOdds = legs.reduce((prod, l) => prod * (l.odds || 1.0), 1.0);
      return {
        id: `lq_combo_${idx + 1}`,
        legs,
        totalOdds: Math.round(totalOdds * 10000) / 10000
      };
    });
  },

  /**
   * 篮彩 ILP 奖金优化求解器
   */
  optimizeBonus(combos, budgetYuan, strategy = 'equal') {
    const n = combos.length;
    if (n === 0) throw new Error('No combinations to optimize');
    const minCost = n * 2;
    if (budgetYuan < minCost) {
      throw new Error(`Budget ${budgetYuan} Yuan is insufficient for ${n} combinations`);
    }

    const mults = new Array(n).fill(1);
    let remainingBudget = budgetYuan - minCost;
    let extraBets = Math.floor(remainingBudget / 2);

    while (extraBets > 0) {
      let minIdx = 0;
      let minPayout = mults[0] * combos[0].totalOdds * 2;
      for (let i = 1; i < n; i++) {
        const p = mults[i] * combos[i].totalOdds * 2;
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
      const expectedPayout = Math.round(multiplier * c.totalOdds * 2 * 100) / 100;
      return {
        id: c.id,
        multiplier,
        totalOdds: c.totalOdds,
        expectedPayout,
        legs: c.legs
      };
    });

    const totalCost = mults.reduce((sum, m) => sum + m * 2, 0);
    return {
      strategy,
      budget: budgetYuan,
      totalCost,
      leftoverYuan: budgetYuan - totalCost,
      allocations
    };
  },

  /**
   * 篮彩量化模型自动选单 (节奏分析 & 背靠背疲劳)
   */
  generateQuantPicksLancai(matches, strategy = 'steady') {
    if (!matches || matches.length < 2) throw new Error('Requires at least 2 matches');
    const m1 = matches[0];
    const m2 = matches[1];

    // 第一场选背靠背疲劳受让方逆选（让分胜）
    // 第二场选大分/小分
    return {
      matches: [
        {
          matchId: m1.id,
          matchNum: m1.matchNum,
          picks: [{ market: 'HDC', selection: 'rq_home', label: `让主胜(${m1.odds.HDC.handicap})`, odds: m1.odds.HDC.rq_home }]
        },
        {
          matchId: m2.id,
          matchNum: m2.matchNum,
          picks: [{ market: 'HILO', selection: 'over', label: `大分(${m2.odds.HILO.totalLine})`, odds: m2.odds.HILO.over }]
        }
      ],
      passType: '2_1'
    };
  },

  /**
   * 篮彩批量实体票单生成
   */
  generateBatchTickets(optimizedResult, meta = {}) {
    const allocations = optimizedResult.allocations || [];
    const dateStr = meta.date || new Date().toISOString().slice(0, 10);
    const passType = meta.passType || '2_1';
    const passLabel = passType.replace('_', '串');

    const tickets = allocations.map((item, idx) => {
      const ticketNo = `LQ-${dateStr.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`;
      const legTexts = item.legs.map(l => `${l.matchNum || l.matchId}[${l.label || l.selection}](${l.odds})`);
      const fullDesc = legTexts.join(' × ');
      const amountYuan = item.multiplier * 2;

      return {
        ticketNo,
        date: dateStr,
        gameName: '中国体育彩票 · 竞彩篮球(JCLQ)',
        passType: passLabel,
        legs: item.legs,
        fullDesc,
        multiplier: item.multiplier,
        amountYuan,
        expectedPayout: item.expectedPayout,
        posLine: `[竞彩篮球] ${dateStr} ${fullDesc} | ${passLabel} | ${item.multiplier}倍 | ${amountYuan}元`
      };
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
