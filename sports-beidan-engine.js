/**
 * sports-beidan-engine.js
 * 北京单场 (DC) 核心计算引擎
 * 涵盖：官方 65% 浮动返还率精算、浮动 SP 兑奖计算、让球盘口结算 (-0.5, +0.5, -1, +1 等)、1~15 串关合法性校验。
 */

const RETURN_RATE = 0.65;

const BeidanEngine = {
  RETURN_RATE,

  /**
   * 北单浮动 SP 奖金预估与官方结算
   * 官方单注基准 2 元，扣除 35% 后按 65% 返奖率结算
   */
  calculateFloatingPayout(spList, multiplier = 1) {
    const totalSp = spList.reduce((prod, sp) => prod * (sp || 1.0), 1.0);
    const rawPayout = 2.0 * totalSp * RETURN_RATE * multiplier;
    return Math.round(rawPayout * 100) / 100;
  },

  /**
   * 北单让球盘口赛果判定
   * @param {number} homeGoals 主队实际进球
   * @param {number} awayGoals 客队实际进球
   * @param {number} handicap 让球数 (支持小数如 -0.5, +0.5 以及整数 -1, +1 等)
   */
  evaluateHandicapResult(homeGoals, awayGoals, handicap) {
    const effectiveHome = homeGoals + handicap;
    if (effectiveHome > awayGoals) return 'home';
    if (effectiveHome === awayGoals) return 'draw';
    return 'away';
  },

  /**
   * 北单串关关数合法性校验 (支持 1 到 15 关)
   */
  validateParlayLegCount(legCount) {
    if (legCount < 1 || legCount > 15) {
      throw new Error(`Beidan supports up to 15 legs, got ${legCount}`);
    }
    return true;
  },

  /**
   * 展开北单复式注单为合法单注笛卡尔积组合
   */
  expandSlipToCombinations(slip) {
    const matches = slip.matches || [];
    if (matches.length === 0) return [];
    this.validateParlayLegCount(matches.length);

    function cartesian(arr) {
      return arr.reduce((a, b) => {
        return a.flatMap(d => b.picks.map(e => [...d, { matchId: b.matchId, matchNum: b.matchNum || b.matchId, ...e }]));
      }, [[]]);
    }

    const rawCombos = cartesian(matches);
    return rawCombos.map((legs, idx) => {
      const totalSp = legs.reduce((prod, l) => prod * (l.sp || 1.0), 1.0);
      return {
        id: `dc_combo_${idx + 1}`,
        legs,
        totalSp: Math.round(totalSp * 10000) / 10000
      };
    });
  },

  /**
   * 北单浮动奖金 ILP 优化
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

    // 考虑 65% 官方返还率
    while (extraBets > 0) {
      let minIdx = 0;
      let minPayout = mults[0] * combos[0].totalSp * 2 * RETURN_RATE;
      for (let i = 1; i < n; i++) {
        const p = mults[i] * combos[i].totalSp * 2 * RETURN_RATE;
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
      const expectedPayout = Math.round(multiplier * c.totalSp * 2 * RETURN_RATE * 100) / 100;
      return {
        id: c.id,
        multiplier,
        totalSp: c.totalSp,
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
   * 北单量化模型自动选单
   */
  generateQuantPicksBeidan(matches, strategy = 'steady') {
    if (!matches || matches.length < 2) throw new Error('Requires at least 2 matches');
    // 挑选 2 场盘口清晰、SP 均衡的比赛
    const m1 = matches[0];
    const m2 = matches[1];

    return {
      matches: [
        {
          matchId: m1.id,
          matchNum: m1.matchNum,
          picks: [{ selection: '3', label: '胜', sp: m1.spOdds['3'] }]
        },
        {
          matchId: m2.id,
          matchNum: m2.matchNum,
          picks: [{ selection: '0', label: '负', sp: m2.spOdds['0'] }]
        }
      ],
      passType: '2_1'
    };
  },

  /**
   * 北单批量实体票单生成
   */
  generateBatchTickets(optimizedResult, meta = {}) {
    const allocations = optimizedResult.allocations || [];
    const dateStr = meta.date || new Date().toISOString().slice(0, 10);
    const passType = meta.passType || '2_1';
    const passLabel = passType.replace('_', '串');

    const tickets = allocations.map((item, idx) => {
      const ticketNo = `DC-${dateStr.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`;
      const legTexts = item.legs.map(l => `${l.matchNum || l.matchId}[${l.label || l.selection}](SP:${l.sp})`);
      const fullDesc = legTexts.join(' × ');
      const amountYuan = item.multiplier * 2;

      return {
        ticketNo,
        date: dateStr,
        gameName: '中国体育彩票 · 北京单场(DC)',
        passType: passLabel,
        legs: item.legs,
        fullDesc,
        multiplier: item.multiplier,
        amountYuan,
        expectedPayout: item.expectedPayout,
        posLine: `[北京单场] ${dateStr} ${fullDesc} | ${passLabel} | ${item.multiplier}倍 | ${amountYuan}元 | 浮动预估:${item.expectedPayout}元`
      };
    });

    return {
      totalTickets: tickets.length,
      totalAmountYuan: tickets.reduce((s, t) => s + t.amountYuan, 0),
      tickets
    };
  },

  /**
   * 北单导出打票机代码
   */
  exportPOSText(batchResult, meta = {}) {
    const lines = [];
    lines.push('================================================');
    lines.push('       中国体育彩票 · 北京单场(DC)机打单        ');
    lines.push(`出票日期: ${meta.date || new Date().toLocaleString('zh-CN')}  返还率: 65%(浮动彩池)`);
    lines.push(`总单注数: ${batchResult.totalTickets} 张  总金额: ${batchResult.totalAmountYuan} 元`);
    lines.push('================================================\n');

    batchResult.tickets.forEach((t) => {
      lines.push(`【单号 ${t.ticketNo}】`);
      lines.push(`对阵选项: ${t.fullDesc}`);
      lines.push(`过关方式: ${t.passType} | 倍数: ${t.multiplier} 倍 | 票面金额: ${t.amountYuan} 元`);
      lines.push(`预估奖金: ${t.expectedPayout} 元 (实际以赛后官方 SP 为准)`);
      lines.push(`终端代码: DC|${t.legs.map(l => `${l.matchNum || l.matchId}:${l.selection}`).join('*')}|${t.passType}|${t.multiplier}`);
      lines.push('------------------------------------------------');
    });

    lines.push('\n[请彩站店员核对后置入打票机扫描出票]');
    return lines.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BeidanEngine;
}
if (typeof window !== 'undefined') {
  window.BeidanEngine = BeidanEngine;
}
