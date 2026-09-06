/**
 * sports-sfc-engine.js
 * 传统足球彩票：14场胜负彩 (SFC 14) 与任选九场 (RX9) 核心计算引擎
 * 涵盖：组合注数精确乘法与 C(M, 9) 展开、冷门指数与火锅奖（大热超低赔均分）预警、保14中13覆盖缩水矩阵。
 */

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = combinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

function sfcValidatePicks(picks, allowEmpty = false) {
  if (!Array.isArray(picks) || picks.length !== 14) throw new RangeError('SFC 14 requires exactly 14 matches');
  picks.forEach((p, i) => {
    if (allowEmpty && (p == null || (Array.isArray(p) && p.length === 0))) return;
    if (!Array.isArray(p) || p.length === 0) throw new RangeError(`Match ${i + 1} has no picks`);
    if (p.some(v => !['3', '1', '0'].includes(v)) || new Set(p).size !== p.length) throw new RangeError('Picks must be unique selections from 3, 1, 0');
  });
}

function sfcRankMarket(match) {
  const odds = match && match.odds;
  if (!odds || ['3', '1', '0'].some(k => !Number.isFinite(odds[k]) || odds[k] <= 1)) throw new RangeError('Complete finite decimal odds greater than 1 are required');
  const sum = ['3', '1', '0'].reduce((n, k) => n + 1 / odds[k], 0);
  return ['3', '1', '0'].map(selection => ({ selection, prob: (1 / odds[selection]) / sum })).sort((a, b) => b.prob - a.prob);
}

const SFCEngine = {
  /**
   * 14场胜负彩注数计算
   */
  calculateSFC14Bets(picks) {
    sfcValidatePicks(picks);
    if (!picks || picks.length !== 14) {
      throw new Error('SFC 14 requires exactly 14 matches');
    }
    let betCount = 1;
    for (let i = 0; i < 14; i++) {
      const matchPicks = picks[i];
      if (!matchPicks || matchPicks.length === 0) {
        throw new Error(`Match ${i + 1} has no picks`);
      }
      betCount *= matchPicks.length;
    }
    return {
      betCount,
      costYuan: betCount * 2
    };
  },

  /**
   * 任选九场注数计算 (C(M, 9) 展开)
   */
  calculateRX9Bets(picks) {
    sfcValidatePicks(picks, true);
    if (!picks || picks.length < 14) {
      throw new Error('Picks array must cover 14 matches structure');
    }
    const selectedIndices = [];
    for (let i = 0; i < picks.length; i++) {
      if (picks[i] && picks[i].length > 0) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length < 9) {
      throw new Error(`RX9 requires at least 9 selected matches, got ${selectedIndices.length}`);
    }

    // 选取 9 场的所有组合
    const combos = combinations(selectedIndices, 9);
    let totalBets = 0;

    for (const group of combos) {
      let groupBets = 1;
      for (const idx of group) {
        groupBets *= picks[idx].length;
      }
      totalBets += groupBets;
    }

    return {
      betCount: totalBets,
      costYuan: totalBets * 2,
      selectedCount: selectedIndices.length
    };
  },

  /**
   * 冷门指数与火锅奖 (超低赔大热火锅) 预警分析
   */
  calculateColdnessIndex(picks, oddsList) {
    sfcValidatePicks(picks, true);
    if (!Array.isArray(oddsList)) throw new RangeError('Market odds are required');
    let totalScore = 0;
    let countedMatches = 0;

    let maxColdInTicket = 0;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (!p || p.length === 0) continue;
      sfcRankMarket(oddsList[i]);
      const odds = oddsList[i].odds;

      let maxMatchOdds = 0;
      for (const sel of p) {
        const o = odds[sel];
        if (o > maxMatchOdds) maxMatchOdds = o;
      }

      // 赔率映射为冷度分：1.10~1.35 => 5~15分; 1.35~2.20 => 20~40分; >3.0 => 60~100分
      let matchColdScore = Math.min(100, Math.max(5, (maxMatchOdds - 1.0) * 20));
      totalScore += matchColdScore;
      if (matchColdScore > maxColdInTicket) maxColdInTicket = matchColdScore;
      countedMatches++;
    }

    if (!countedMatches) throw new RangeError('Coldness requires selected matches with market odds');
    const avgColdScore = totalScore / countedMatches;
    // 胜负彩中，只要出现 1~3 场深冷大冷，全国奖池就产生质变；因此综合平均冷度与最高冷度
    const blendedScore = 0.6 * avgColdScore + 0.4 * maxColdInTicket;
    const finalScore = Math.round(blendedScore * 10) / 10;

    // 当全选大热门（平均冷度 < 25），触发火锅奖预警
    const firePotWarning = finalScore < 25;

    return {
      score: finalScore,
      firePotWarning,
      description: firePotWarning 
        ? '低赔率选项集中；仅凭赔率无法推断中奖注数和分奖金额。'
        : (finalScore > 50 ? '含较高赔率选项；这不构成正期望或预测优势证据。' : '赔率分布居中；未估计奖池收益。'),
      modelStatus: 'descriptive-odds-heuristic',
      evidenceOfPredictiveEdge: false
    };
  },

  /**
   * 保14中13 覆盖设计缩水矩阵 (Covering Wheel)
   */
  generateCoveringReduction(picks, options = {}) {
    sfcValidatePicks(picks);
    const guarantee = options.guarantee ?? 13;
    if (!Number.isInteger(guarantee) || guarantee < 0 || guarantee > 14) throw new RangeError('guarantee must be an integer from 0 to 14');
    if (this.calculateSFC14Bets(picks).betCount > 2048) throw new RangeError('Exact covering search supports at most 2048 combinations');

    // 生成所有全组合
    function cartesian(arr) {
      return arr.reduce((a, b) => a.flatMap(d => b.map(e => [...d, e])), [[]]);
    }
    const allCombos = cartesian(picks);
    const originalBetCount = allCombos.length;

    // 贪心覆盖算法：每次选取覆盖剩余未保 13 目标最多的那一注
    const uncovered = new Set(allCombos.map((_, i) => i));
    const reducedBets = [];

    // 计算两注的重合场数
    function matchCount(c1, c2) {
      let count = 0;
      for (let i = 0; i < c1.length; i++) {
        if (c1[i] === c2[i]) count++;
      }
      return count;
    }

    while (uncovered.size > 0 && reducedBets.length < originalBetCount) {
      let bestCandidate = null;
      let bestCoveredIndices = [];

      // 在候选注中评估
      for (let i = 0; i < allCombos.length; i++) {
        const candidate = allCombos[i];
        const coveredThis = [];
        for (const uncIdx of uncovered) {
          if (matchCount(candidate, allCombos[uncIdx]) >= guarantee) {
            coveredThis.push(uncIdx);
          }
        }
        if (coveredThis.length > bestCoveredIndices.length) {
          bestCandidate = candidate;
          bestCoveredIndices = coveredThis;
        }
      }

      if (!bestCandidate || bestCoveredIndices.length === 0) {
        // 兜底补齐第一个未覆盖的
        const firstUnc = uncovered.values().next().value;
        reducedBets.push(allCombos[firstUnc]);
        uncovered.delete(firstUnc);
      } else {
        reducedBets.push(bestCandidate);
        bestCoveredIndices.forEach(idx => uncovered.delete(idx));
      }
    }

    const compressionRate = Math.round((1 - reducedBets.length / originalBetCount) * 1000) / 10;

    return {
      originalBetCount,
      reducedBets,
      compressionRate,
      guaranteedRank: guarantee,
      guaranteeCondition: 'All 14 realized outcomes must belong to the supplied picks'
    };
  },

  /**
   * 14场胜负彩量化模型自动选单 (防冷对冲型)
   */
  generateQuantPicks14(matches) {
    if (!Array.isArray(matches) || matches.length !== 14) throw new Error('Requires 14 matches');
    const ranked = matches.map(sfcRankMarket);
    // At fixed four doubles, maximize product coverage under the market-implied independence baseline.
    const doubled = new Set(ranked.map((r, i) => ({ i, gain: (r[0].prob + r[1].prob) / r[0].prob }))
      .sort((a, b) => b.gain - a.gain).slice(0, 4).map(x => x.i));
    const picks = ranked.map((r, i) => r.slice(0, doubled.has(i) ? 2 : 1).map(x => x.selection));
    const { betCount, costYuan } = this.calculateSFC14Bets(picks);
    return { picks, betCount, costYuan, doubleCount: doubled.size, modelStatus: 'market-implied-baseline', evidenceOfPredictiveEdge: false };
  },

  /**
   * 任选九场量化模型自动选单 (高性价比稳胆型)
   */
  generateQuantPicksRX9(matches) {
    if (!Array.isArray(matches) || matches.length !== 14) throw new Error('Requires 14 matches');
    const ranked = matches.map(sfcRankMarket);
    let best = null;
    // Enumerate 2002 subsets; choose the best two doubles within each at a fixed four-bet budget.
    for (const group of combinations(ranked.map((_, i) => i), 9)) {
      const doubles = group.slice().sort((a, b) => ranked[b][1].prob / ranked[b][0].prob - ranked[a][1].prob / ranked[a][0].prob).slice(0, 2);
      const probability = group.reduce((p, i) => p * (ranked[i][0].prob + (doubles.includes(i) ? ranked[i][1].prob : 0)), 1);
      if (!best || probability > best.probability) best = { group, doubles, probability };
    }
    const picks = ranked.map((r, i) => best.group.includes(i) ? r.slice(0, best.doubles.includes(i) ? 2 : 1).map(x => x.selection) : []);
    const res = this.calculateRX9Bets(picks);
    return { picks, betCount: res.betCount, costYuan: res.costYuan, selectedCount: 9,
      modelStatus: 'market-implied-baseline', evidenceOfPredictiveEdge: false, independenceAssumed: true };
  },

  /**
   * SFC / RX9 批量票单生成
   */
  generateBatchTickets(picks, mode = '14', meta = {}) {
    const issue = meta.issue || '25068';
    const multiplier = meta.multiplier ?? 1;
    if (!Number.isSafeInteger(multiplier) || multiplier < 1) throw new RangeError('multiplier must be a positive integer');
    if (!['14', '9'].includes(mode)) throw new RangeError('mode must be 14 or 9');
    const count = mode === '14' ? this.calculateSFC14Bets(picks) : this.calculateRX9Bets(picks);
    if (count.betCount > 100000) throw new RangeError('Batch export supports at most 100000 bets');
    const gameName = mode === '14' ? '中国体育彩票 · 14场胜负彩' : '中国体育彩票 · 任选九场';

    function cartesian(arr) {
      return arr.reduce((a, b) => a.flatMap(d => b.map(e => [...d, e])), [[]]);
    }

    const activeIndices = picks.map((p, i) => p && p.length ? i : -1).filter(i => i >= 0);
    const groups = mode === '14' ? [activeIndices] : combinations(activeIndices, 9);
    const allBets = groups.flatMap(group => cartesian(picks.map((p, i) => group.includes(i) ? p : ['*'])));
    const displayBets = allBets;
    const tickets = displayBets.map((bet, idx) => {
      const ticketNo = `SFC-${issue}-${String(idx + 1).padStart(3, '0')}`;
      const betStr = bet.join(' ');
      const amountYuan = 2 * multiplier;

      return {
        ticketNo,
        issue,
        gameName,
        betStr,
        multiplier,
        amountYuan,
        posLine: `[${gameName}] 第${issue}期 ${betStr} | ${multiplier}倍 | ${amountYuan}元`
      };
    });

    const totalBets = allBets.length;
    const totalAmountYuan = totalBets * 2 * multiplier;

    return {
      mode,
      issue,
      totalTickets: tickets.length,
      totalAmountYuan,
      tickets
    };
  },

  /**
   * SFC / RX9 导出打票机代码
   */
  exportPOSText(batchResult, meta = {}) {
    const issue = batchResult.issue || meta.issue || '25068';
    const lines = [];
    lines.push('================================================');
    lines.push(`       中国体育彩票 · 传统足彩(${batchResult.mode === '14' ? '14场' : '任九'})机打单       `);
    lines.push(`彩票期号: 第${issue}期  总注数: ${batchResult.totalTickets} 注  总金额: ${batchResult.totalAmountYuan} 元`);
    lines.push('================================================\n');

    batchResult.tickets.forEach((t) => {
      lines.push(`【单号 ${t.ticketNo}】`);
      lines.push(`投注号码: ${t.betStr}`);
      lines.push(`倍数: ${t.multiplier} 倍 | 金额: ${t.amountYuan} 元`);
      lines.push(`终端代码: SFC${batchResult.mode === '14' ? '14' : '9'}|${issue}|${t.betStr.replace(/\s+/g, '')}|${t.multiplier}`);
      lines.push('------------------------------------------------');
    });

    lines.push('\n[请彩站店员核对期号后置入打票机扫描出票]');
    return lines.join('\n');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SFCEngine;
}
if (typeof window !== 'undefined') {
  window.SFCEngine = SFCEngine;
}
