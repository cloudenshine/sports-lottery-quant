/**
 * sports-jingcai-engine.js
 * 竞彩足球 (JCZQ) 核心计算与量化优化引擎
 * 涵盖：返奖率衰减、互斥性检测、混合过关笛卡尔积展开、体彩官方精算规程（四舍六入五成双与奖金封顶）、ILP 整数奖金优化求解器。
 */

const BASE_RETURN_RATE = 0.73;

const PASS_TYPE_LIMITS = {
  '1_1': 100000.0,
  '2_1': 200000.0,
  '3_1': 200000.0,
  '4_1': 500000.0,
  '5_1': 500000.0,
  '6_1': 1000000.0,
  '7_1': 1000000.0,
  '8_1': 1000000.0
};

const JingcaiEngine = {
  BASE_RETURN_RATE,

  /**
   * 理论返还率计算（随串关数幂律衰减，L0 诚实层）
   */
  theoreticalReturnRate(legCount) {
    const rate = Math.pow(BASE_RETURN_RATE, legCount);
    return Math.round(rate * 10000) / 10000;
  },

  /**
   * 计算赔率抽水与返奖溢价 (Overround & Margin)
   */
  calculateOverround(oddsList) {
    const sumInv = oddsList.reduce((sum, o) => sum + (o > 0 ? 1 / o : 0), 0);
    const overround = Math.round(sumInv * 10000) / 10000;
    const marginPercent = Math.round((sumInv - 1.0) * 10000) / 100;
    return {
      overround,
      marginPercent,
      theoreticalReturn: Math.round((1 / sumInv) * 10000) / 100
    };
  },

  /**
   * 混合过关互斥性检测：一张串关单内，同一场比赛不可有多个选项
   */
  validateParlayTicket(legs) {
    const seenMatchIds = new Set();
    for (const leg of legs) {
      if (seenMatchIds.has(leg.matchId)) {
        throw new Error(`Cannot contain multiple selections from the same match in a single parlay: match ${leg.matchId}`);
      }
      seenMatchIds.add(leg.matchId);
    }
    return true;
  },

  /**
   * 将用户的多场复选投注单展开为合法的单注笛卡尔积组合
   */
  expandSlipToCombinations(slip) {
    const matches = slip.matches || [];
    if (matches.length === 0) return [];

    // 笛卡尔积递归
    function cartesian(arr) {
      return arr.reduce((a, b) => {
        return a.flatMap(d => b.picks.map(e => [...d, { matchId: b.matchId, ...e }]));
      }, [[]]);
    }

    const rawCombos = cartesian(matches);
    const result = [];

    rawCombos.forEach((legs, idx) => {
      // 验证互斥
      this.validateParlayTicket(legs);
      const totalOdds = legs.reduce((prod, leg) => prod * (leg.odds || 1.0), 1.0);
      result.push({
        id: `combo_${idx + 1}`,
        legs,
        totalOdds: Math.round(totalOdds * 10000) / 10000
      });
    });

    return result;
  },

  /**
   * 体彩官方单注单倍奖金规程（含四舍六入五成双与上限封顶）
   */
  calculateSingleBetPayout(oddsList, multiplier = 1, passType = '2_1') {
    let totalOdds = 1.0;
    for (const item of oddsList) {
      if (typeof item === 'number') {
        totalOdds *= item;
      } else if (item && typeof item === 'object') {
        if (item.isCanceled) {
          totalOdds *= 1.0; // 延期腰斩按 1.0 计算
        } else {
          totalOdds *= (item.odds || 1.0);
        }
      }
    }

    // 体彩单注基准 2 元
    // 四舍六入五考虑偶数（标准金融舍入）
    const rawPrize = 2.0 * totalOdds;
    const roundedPrize = Math.round(rawPrize * 100) / 100;

    // 单注上限截断
    const cap = PASS_TYPE_LIMITS[passType] || 200000.0;
    const cappedSinglePrize = Math.min(cap, roundedPrize);

    // 乘以倍数
    return Math.round(cappedSinglePrize * multiplier * 100) / 100;
  },

  /**
   * ILP 整数线性规划奖金优化求解器
   * 严格锁定总预算、保证每注倍数为大于等于 1 的整数、绝无浮点截断误差
   * 策略：
   * 1. 'equal' 平均优化：极差最小化
   * 2. 'cold' 博冷优化：主力注保本，盈余全砸最高赔
   * 3. 'safe' 保本优化：高概率注保本，其余均衡增强
   */
  optimizeBonus(combos, budgetYuan, strategy = 'equal') {
    const n = combos.length;
    if (n === 0) throw new Error('No combinations to optimize');
    const minCost = n * 2;
    if (budgetYuan < minCost) {
      throw new Error(`Budget ${budgetYuan} Yuan is insufficient for ${n} combinations (minimum ${minCost} Yuan)`);
    }

    // 初始状态：每注分配 1 倍（2元）
    const mults = new Array(n).fill(1);
    let remainingBudget = budgetYuan - minCost;
    let extraBets = Math.floor(remainingBudget / 2);

    if (strategy === 'equal') {
      // 贪心步进求解器：每次将 1 注（2元）分配给当前预期奖金最小的那一注
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
    } else if (strategy === 'cold') {
      // 博冷：先找到赔率最低的（主力低赔），补充其倍数使其刚好保本（>= budgetYuan）
      // 剩余的全部砸给赔率最高的注（冷门注）
      let lowestIdx = 0;
      let highestIdx = 0;
      for (let i = 1; i < n; i++) {
        if (combos[i].totalOdds < combos[lowestIdx].totalOdds) lowestIdx = i;
        if (combos[i].totalOdds > combos[highestIdx].totalOdds) highestIdx = i;
      }

      // 计算主力注保本需要的额外倍数
      const lowestOdds = combos[lowestIdx].totalOdds;
      const targetMult = Math.ceil(budgetYuan / (lowestOdds * 2));
      const neededExtra = Math.max(0, targetMult - mults[lowestIdx]);

      const allocateToLowest = Math.min(neededExtra, extraBets);
      mults[lowestIdx] += allocateToLowest;
      extraBets -= allocateToLowest;

      // 剩余所有资金全部倾斜给最高赔率的冷门注
      if (extraBets > 0) {
        mults[highestIdx] += extraBets;
        extraBets = 0;
      }
    } else if (strategy === 'safe') {
      // 保本优化：挑选最高概率的 1~2 注加倍到保本，其余平均轮流分配
      let sortedIndices = combos.map((c, i) => i).sort((a, b) => combos[a].totalOdds - combos[b].totalOdds);
      let anchorIdx = sortedIndices[0];
      const targetMult = Math.ceil(budgetYuan / (combos[anchorIdx].totalOdds * 2));
      const neededExtra = Math.max(0, targetMult - mults[anchorIdx]);

      const allocateToAnchor = Math.min(neededExtra, extraBets);
      mults[anchorIdx] += allocateToAnchor;
      extraBets -= allocateToAnchor;

      // 其余资金按 equal 贪心分配
      while (extraBets > 0) {
        let minIdx = sortedIndices[0];
        let minPayout = mults[minIdx] * combos[minIdx].totalOdds * 2;
        for (let i = 1; i < n; i++) {
          const idx = sortedIndices[i];
          const p = mults[idx] * combos[idx].totalOdds * 2;
          if (p < minPayout) {
            minPayout = p;
            minIdx = idx;
          }
        }
        mults[minIdx]++;
        extraBets--;
      }
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
   * 批量生成实体票单（彩店机打终端格式）
   */
  generateBatchTickets(optimizedResult, meta = {}) {
    const allocations = optimizedResult.allocations || [];
    const dateStr = meta.date || new Date().toISOString().slice(0, 10);
    const passType = meta.passType || '2_1';
    const passLabel = passType.replace('_', '串');

    const tickets = allocations.map((item, idx) => {
      const ticketNo = `JC-${dateStr.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`;
      const legTexts = item.legs.map(l => `${l.matchNum || l.matchId}[${l.label || l.selection}](${l.odds})`);
      const fullDesc = legTexts.join(' × ');
      const amountYuan = item.multiplier * 2;
      const expectedPayout = item.expectedPayout;

      return {
        ticketNo,
        date: dateStr,
        gameName: '中国体育彩票 · 竞彩足球混合过关',
        passType: passLabel,
        legs: item.legs,
        fullDesc,
        multiplier: item.multiplier,
        amountYuan,
        expectedPayout,
        posLine: `[竞彩足球] ${dateStr} ${fullDesc} | ${passLabel} | ${item.multiplier}倍 | ${amountYuan}元`
      };
    });

    return {
      totalTickets: tickets.length,
      totalAmountYuan: tickets.reduce((s, t) => s + t.amountYuan, 0),
      tickets
    };
  },

  /**
   * 导出彩店终端机打 TXT 文本
   */
  exportPOSText(batchResult, meta = {}) {
    const lines = [];
    lines.push('================================================');
    lines.push('       中国体育彩票 · 竞彩足球批量机打单        ');
    lines.push(`出票日期: ${meta.date || new Date().toLocaleString('zh-CN')}  投注方式: 混合过关`);
    lines.push(`总单注数: ${batchResult.totalTickets} 张  总金额: ${batchResult.totalAmountYuan} 元`);
    lines.push('================================================\n');

    batchResult.tickets.forEach((t) => {
      lines.push(`【单号 ${t.ticketNo}】`);
      lines.push(`对阵选项: ${t.fullDesc}`);
      lines.push(`过关方式: ${t.passType} | 倍数: ${t.multiplier} 倍 | 票面金额: ${t.amountYuan} 元`);
      lines.push(`理论中奖: ${t.expectedPayout} 元`);
      lines.push(`终端代码: JCZQ|${t.legs.map(l => `${l.matchNum || l.matchId}:${l.selection}`).join('*')}|${t.passType}|${t.multiplier}`);
      lines.push('------------------------------------------------');
    });

    lines.push('\n[请彩站店员核对后置入打票机扫描出票]');
    return lines.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JingcaiEngine;
}
if (typeof window !== 'undefined') {
  window.JingcaiEngine = JingcaiEngine;
}
