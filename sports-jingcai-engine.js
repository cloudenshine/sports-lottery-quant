/**
 * sports-jingcai-engine.js
 * 竞彩足球 (JCZQ) 核心计算与量化优化引擎
 * 涵盖：返奖率衰减、互斥性检测、混合过关笛卡尔积展开、体彩官方精算规程（四舍六入五成双与奖金封顶）、ILP 整数奖金优化求解器。
 */

function jingcaiValidateSlip(matches, passType) {
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

// Verified contracts: data/research/rules-registry.json jingcai.rounding/caps/policy-limits.
// https://www.fjtc.com.cn/2024-04/01/content_31550891.htm (I.1-2, II)
// https://www.sport.gov.cn/cpzx/n5656/c897408/content.html (III.6)
// https://www.sport.gov.cn/gdnps/files/c28047814/28048342.pdf (II.2)
function jingcaiDecimalParts(value) {
  if (!['number', 'string'].includes(typeof value)) throw new RangeError('Decimal odds must be a number or decimal string');
  const text = String(value);
  if (text.length > 1000 || !Number.isFinite(Number(text)) || Number(text) < 1) throw new RangeError('Decimal odds must be finite and at least 1');
  const match = /^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new RangeError('Invalid decimal odds syntax');
  const fraction = match[2] || '';
  let scale = fraction.length - Number(match[3] || 0);
  let coefficient = BigInt(match[1] + fraction);
  if (Math.abs(scale) > 1000) throw new RangeError('Decimal precision exceeds supported limit');
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  if (coefficient < 10n ** BigInt(scale)) throw new RangeError('Decimal odds must be at least 1');
  return { coefficient, scale };
}

function jingcaiUnitPrizeCents(oddsList, passType) {
  if (!Array.isArray(oddsList) || !oddsList.length || oddsList.length > 8) throw new RangeError('Odds list must contain 1 to 8 legs');
  if (!Object.hasOwn(PASS_TYPE_LIMITS, passType)) throw new RangeError('Unsupported pass type');
  let coefficient = 2n, scale = 0;
  for (const item of oddsList) {
    // This flag is an asserted official invalid-match determination, never inferred from missing scores.
    if (item && typeof item === 'object' && item.isCanceled === true) continue;
    const value = item && typeof item === 'object' ? (item.oddsDecimal ?? item.odds) : item;
    const decimal = jingcaiDecimalParts(value);
    coefficient *= decimal.coefficient;
    scale += decimal.scale;
  }
  const mills = coefficient * 1000n / (10n ** BigInt(scale));
  let cents = mills / 10n;
  const third = mills % 10n;
  // Literal official third-digit rule, not binary Math.round or generic mathematical half-even.
  if (third > 5n || (third === 5n && cents % 2n === 1n)) cents++;
  const cap = BigInt(PASS_TYPE_LIMITS[passType]) * 100n;
  return cents > cap ? cap : cents;
}

function jingcaiCentsToYuan(cents) {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Payout exceeds exact cent integer range');
  return Number(cents) / 100;
}

function jingcaiCombinationPrizeCents(combo) {
  const passType = combo.passType || (combo.legs && `${combo.legs.length}_1`) || '2_1';
  return jingcaiUnitPrizeCents(combo.legs || [combo.totalOdds], passType);
}

const JingcaiEngine = {
  BASE_RETURN_RATE,

  /**
   * 在各腿独立且返还率相同的假设下作情景计算；0.73 不是实测单场返还率
   */
  theoreticalReturnRate(legCount, assumedReturnPerLeg = BASE_RETURN_RATE) {
    if (!Number.isInteger(legCount) || legCount < 1 || legCount > 8) throw new RangeError('legCount must be an integer from 1 to 8');
    if (!Number.isFinite(assumedReturnPerLeg) || assumedReturnPerLeg <= 0 || assumedReturnPerLeg > 1) throw new RangeError('assumedReturnPerLeg must be in (0,1]');
    const rate = Math.pow(assumedReturnPerLeg, legCount);
    return Math.round(rate * 10000) / 10000;
  },

  /**
   * 计算赔率抽水与返奖溢价 (Overround & Margin)
   */
  calculateOverround(oddsList) {
    if (!Array.isArray(oddsList) || oddsList.length < 2 || oddsList.some(o => !Number.isFinite(o) || o <= 1)) throw new RangeError('A complete market of finite decimal odds greater than 1 is required');
    const sumInv = oddsList.reduce((sum, o) => sum + (o > 0 ? 1 / o : 0), 0);
    const overround = Math.round(sumInv * 10000) / 10000;
    const marginPercent = Math.round((sumInv - 1.0) * 10000) / 100;
    return {
      overround,
      normalizedProbabilities: oddsList.map(o => (1 / o) / sumInv),
      marginPercent,
      theoreticalReturn: Math.round((1 / sumInv) * 10000) / 100
    };
  },

  /**
   * 混合过关互斥性检测：一张串关单内，同一场比赛不可有多个选项
   */
  validateParlayTicket(legs) {
    if (!Array.isArray(legs) || !legs.length) throw new RangeError('A nonempty legs array is required');
    const seenMatchIds = new Set();
    for (const leg of legs) {
      if (!leg || leg.matchId == null || String(leg.matchId).trim() === '') throw new RangeError('matchId is required');
      if (seenMatchIds.has(String(leg.matchId))) {
        throw new Error(`Cannot contain multiple selections from the same match in a single parlay: match ${leg.matchId}`);
      }
      seenMatchIds.add(String(leg.matchId));
    }
    return true;
  },

  /**
   * 将用户的多场复选投注单展开为合法的单注笛卡尔积组合
   */
  expandSlipToCombinations(slip) {
    const matches = slip.matches || [];
    if (matches.length === 0) return [];
    jingcaiValidateSlip(matches, slip.passType);

    // 笛卡尔积递归
    function cartesian(arr) {
      return arr.reduce((a, b) => {
        return a.flatMap(d => b.picks.map(e => [...d, { ...e, matchId: b.matchId }]));
      }, [[]]);
    }

    const rawCombos = cartesian(matches);
    const result = [];

    rawCombos.forEach((legs, idx) => {
      // 验证互斥
      this.validateParlayTicket(legs);
      const totalOdds = legs.reduce((prod, leg) => prod * leg.odds, 1.0);
      if (!Number.isFinite(totalOdds)) throw new RangeError('Combination price overflow');
      result.push({
        id: `combo_${idx + 1}`,
        passType: slip.passType || `${legs.length}_1`,
        legs,
        totalOdds
      });
    });

    return result;
  },

  /**
   * Verified fixed-gross payout arithmetic only. Caller supplies ticket-time prices and result/void evidence.
   * Multiplier here may represent an aggregate plan; physical ticket limits apply at ticket validation/export.
   */
  calculateSingleBetPayout(oddsList, multiplier = 1, passType = '2_1') {
    if (!Number.isSafeInteger(multiplier) || multiplier < 1) throw new RangeError('multiplier must be a positive integer');
    return jingcaiCentsToYuan(jingcaiUnitPrizeCents(oddsList, passType) * BigInt(multiplier));
  },

  calculateSingleBetPayoutCents(oddsList, passType = '2_1') {
    return Number(jingcaiUnitPrizeCents(oddsList, passType));
  },

  validateTicketLimits(unitBetCount, multiplier = 1) {
    if (!Number.isSafeInteger(unitBetCount) || unitBetCount < 1) throw new RangeError('unitBetCount must be a positive integer');
    if (!Number.isSafeInteger(multiplier) || multiplier < 1 || multiplier > 50) throw new RangeError('Physical ticket multiplier must be 1 to 50');
    if (unitBetCount * multiplier * 2 > 6000) throw new RangeError('Physical ticket stake must not exceed 6000 Yuan');
    return true;
  },

  splitTicketMultipliers(multiplier, unitBetCount = 1) {
    if (!Number.isSafeInteger(multiplier) || multiplier < 1 || multiplier > 100000) throw new RangeError('Plan multiplier must be an integer from 1 to 100000');
    this.validateTicketLimits(unitBetCount, 1);
    const chunk = Math.min(50, Math.floor(6000 / (2 * unitBetCount)));
    const parts = [];
    for (let remaining = multiplier; remaining > 0; remaining -= chunk) parts.push(Math.min(chunk, remaining));
    return parts;
  },

  /** Sum individually rounded and capped winning units, then multiply. Losing units still count toward stake. */
  calculateTicketPayout(winningBets, multiplier = 1, options = {}) {
    if (!Array.isArray(winningBets)) throw new RangeError('winningBets must be an array');
    const totalUnitBets = options.totalUnitBets ?? winningBets.length;
    if (totalUnitBets < winningBets.length) throw new RangeError('totalUnitBets cannot be less than winning unit count');
    this.validateTicketLimits(totalUnitBets, multiplier);
    let cents = 0n;
    for (const bet of winningBets) {
      const oddsList = Array.isArray(bet) ? bet : bet.oddsList;
      const passType = Array.isArray(bet) ? `${bet.length}_1` : (bet.passType || `${oddsList.length}_1`);
      cents += jingcaiUnitPrizeCents(oddsList, passType);
    }
    return jingcaiCentsToYuan(cents * BigInt(multiplier));
  },

  /**
   * 整数条件奖金分配启发式
   * 严格锁定总预算、保证每注倍数为大于等于 1 的整数、绝无浮点截断误差
   * 策略：
   * 1. 'equal' 平均优化：极差最小化
   * 2. 'cold' 博冷优化：主力注保本，盈余全砸最高赔
   * 3. 'safe' 保本优化：高概率注保本，其余均衡增强
   */
  optimizeBonus(combos, budgetYuan, strategy = 'equal') {
    if (!Array.isArray(combos)) throw new RangeError('combinations must be an array');
    if (!Number.isFinite(budgetYuan) || budgetYuan < 0 || budgetYuan > 200000) throw new RangeError('Budget must be finite, nonnegative and at most 200000 Yuan for this allocation solver');
    if (combos.some(c => !c || !Number.isFinite(c.totalOdds) || c.totalOdds < 1 || !Number.isFinite(c.totalOdds * Math.max(2, budgetYuan)))) throw new RangeError('Combination prices must be finite and positive');
    if (!['equal', 'cold', 'safe'].includes(strategy)) throw new RangeError('Unsupported allocation strategy');

    const n = combos.length;
    if (n === 0) throw new Error('No combinations to optimize');
    const minCost = n * 2;
    if (budgetYuan < minCost) {
      throw new Error(`Budget ${budgetYuan} Yuan is insufficient for ${n} combinations (minimum ${minCost} Yuan)`);
    }

    const unitPrizeCents = combos.map(jingcaiCombinationPrizeCents);
    const unitPayouts = unitPrizeCents.map(jingcaiCentsToYuan);
    // 初始状态：每注分配 1 倍（2元）
    const mults = new Array(n).fill(1);
    let remainingBudget = budgetYuan - minCost;
    let extraBets = Math.floor(remainingBudget / 2);

    if (strategy === 'equal') {
      // 贪心步进求解器：每次将 1 注（2元）分配给当前预期奖金最小的那一注
      while (extraBets > 0) {
        let minIdx = 0;
        let minPayout = mults[0] * Number(unitPrizeCents[0]);
        for (let i = 1; i < n; i++) {
          const p = mults[i] * Number(unitPrizeCents[i]);
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
      const targetMult = Math.ceil(budgetYuan / unitPayouts[lowestIdx]);
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
      const targetMult = Math.ceil(budgetYuan / unitPayouts[anchorIdx]);
      const neededExtra = Math.max(0, targetMult - mults[anchorIdx]);

      const allocateToAnchor = Math.min(neededExtra, extraBets);
      mults[anchorIdx] += allocateToAnchor;
      extraBets -= allocateToAnchor;

      // 其余资金按 equal 贪心分配
      while (extraBets > 0) {
        let minIdx = sortedIndices[0];
        let minPayout = mults[minIdx] * Number(unitPrizeCents[minIdx]);
        for (let i = 1; i < n; i++) {
          const idx = sortedIndices[i];
          const p = mults[idx] * Number(unitPrizeCents[idx]);
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
      const expectedPayout = jingcaiCentsToYuan(unitPrizeCents[i] * BigInt(multiplier));
      return {
        id: c.id,
        multiplier,
        totalOdds: c.totalOdds,
        passType: c.passType || (c.legs && `${c.legs.length}_1`) || '2_1',
        unitPrizeCents: Number(unitPrizeCents[i]),
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
   * 批量生成实体票单（彩店机打终端格式）
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
      const unitCents = jingcaiUnitPrizeCents(item.legs, itemPassType);
      const legTexts = item.legs.map(l => `${l.matchNum || l.matchId}[${l.label || l.selection}](${l.oddsDecimal ?? l.odds})`);
      const fullDesc = legTexts.join(' × ');
      return this.splitTicketMultipliers(item.multiplier).map(multiplier => {
        this.validateTicketLimits(1, multiplier);
        const ticketNo = `JC-${dateStr.replace(/-/g, '')}-${String(++sequence).padStart(3, '0')}`;
        const amountYuan = multiplier * 2;
        const expectedPayout = jingcaiCentsToYuan(unitCents * BigInt(multiplier));
        return {
          ticketNo, date: dateStr, gameName: '中国体育彩票 · 竞彩足球混合过关',
          passType: itemPassLabel, legs: item.legs, fullDesc, multiplier, amountYuan, expectedPayout,
          payoutIfWin: expectedPayout, sourceAllocationId: item.id,
          posLine: `[竞彩足球] ${dateStr} ${fullDesc} | ${itemPassLabel} | ${multiplier}倍 | ${amountYuan}元`
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
