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

const SFCEngine = {
  /**
   * 14场胜负彩注数计算
   */
  calculateSFC14Bets(picks) {
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
    let totalScore = 0;
    let countedMatches = 0;

    let maxColdInTicket = 0;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (!p || p.length === 0) continue;
      const odds = oddsList[i] && oddsList[i].odds ? oddsList[i].odds : { '3': 2.0, '1': 3.2, '0': 3.5 };

      let maxMatchOdds = 0;
      for (const sel of p) {
        const o = odds[sel] || 2.0;
        if (o > maxMatchOdds) maxMatchOdds = o;
      }

      // 赔率映射为冷度分：1.10~1.35 => 5~15分; 1.35~2.20 => 20~40分; >3.0 => 60~100分
      let matchColdScore = Math.min(100, Math.max(5, (maxMatchOdds - 1.0) * 20));
      totalScore += matchColdScore;
      if (matchColdScore > maxColdInTicket) maxColdInTicket = matchColdScore;
      countedMatches++;
    }

    const avgColdScore = countedMatches > 0 ? totalScore / countedMatches : 20;
    // 胜负彩中，只要出现 1~3 场深冷大冷，全国奖池就产生质变；因此综合平均冷度与最高冷度
    const blendedScore = 0.6 * avgColdScore + 0.4 * maxColdInTicket;
    const finalScore = Math.round(blendedScore * 10) / 10;

    // 当全选大热门（平均冷度 < 25），触发火锅奖预警
    const firePotWarning = finalScore < 25;

    return {
      score: finalScore,
      firePotWarning,
      description: firePotWarning 
        ? '⚠️ 大热火锅奖预警：选项全为超低赔主力正路，全国中奖注数极多，奖金可能极其微薄！'
        : (finalScore > 50 ? '🌟 黄金冷门配比：兼顾主力防冷，具有极高单注奖池博弈价值' : '⚖️ 均衡防守单：正路为主兼顾稳妥')
    };
  },

  /**
   * 保14中13 覆盖设计缩水矩阵 (Covering Wheel)
   */
  generateCoveringReduction(picks, options = {}) {
    const guarantee = options.guarantee || 13;

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
      guaranteedRank: guarantee
    };
  },

  /**
   * 14场胜负彩量化模型自动选单 (防冷对冲型)
   */
  generateQuantPicks14(matches) {
    if (!matches || matches.length < 14) throw new Error('Requires 14 matches');
    const picks = [];
    let doubleCount = 0;

    for (let i = 0; i < 14; i++) {
      const m = matches[i];
      const odds = m.odds || { '3': 2.0, '1': 3.2, '0': 3.5 };
      const o3 = odds['3'], o1 = odds['1'], o0 = odds['0'];

      if (o3 <= 1.45 && doubleCount >= 4) {
        picks.push(['3']); // 稳胆
      } else if (o0 <= 1.45 && doubleCount >= 4) {
        picks.push(['0']); // 客场稳胆
      } else if (o3 < o0) {
        // 主队占优但需防平
        if (doubleCount < 4) {
          picks.push(['3', '1']);
          doubleCount++;
        } else {
          picks.push(['3']);
        }
      } else {
        // 势均力敌或客队微优
        if (doubleCount < 4) {
          picks.push(['1', '0']);
          doubleCount++;
        } else {
          picks.push(['0']);
        }
      }
    }

    // 确保至少有 3 个双选进行防冷覆盖
    while (doubleCount < 3) {
      for (let i = 0; i < 14; i++) {
        if (picks[i].length === 1 && doubleCount < 3) {
          picks[i].push('1');
          doubleCount++;
        }
      }
    }

    const { betCount, costYuan } = this.calculateSFC14Bets(picks);
    return { picks, betCount, costYuan, doubleCount };
  },

  /**
   * 任选九场量化模型自动选单 (高性价比稳胆型)
   */
  generateQuantPicksRX9(matches) {
    if (!matches || matches.length < 14) throw new Error('Requires 14 matches');
    // 按最低赔率升序排序，挑选最有信心的 9 场
    const indexed = matches.map((m, idx) => {
      const odds = m.odds || { '3': 2.0, '1': 3.2, '0': 3.5 };
      const minOdds = Math.min(odds['3'], odds['1'], odds['0']);
      return { idx, minOdds, odds };
    });
    indexed.sort((a, b) => a.minOdds - b.minOdds);

    const chosenIndices = new Set(indexed.slice(0, 9).map(item => item.idx));
    const picks = new Array(14).fill(null).map(() => []);

    let doubleCount = 0;
    for (let i = 0; i < 14; i++) {
      if (chosenIndices.has(i)) {
        const o = matches[i].odds || { '3': 2.0, '1': 3.2, '0': 3.5 };
        if (o['3'] < o['0']) {
          if (doubleCount < 2 && o['3'] > 1.4) {
            picks[i] = ['3', '1'];
            doubleCount++;
          } else {
            picks[i] = ['3'];
          }
        } else {
          if (doubleCount < 2 && o['0'] > 1.4) {
            picks[i] = ['1', '0'];
            doubleCount++;
          } else {
            picks[i] = ['0'];
          }
        }
      }
    }

    const res = this.calculateRX9Bets(picks);
    return { picks, betCount: res.betCount, costYuan: res.costYuan, selectedCount: 9 };
  },

  /**
   * SFC / RX9 批量票单生成
   */
  generateBatchTickets(picks, mode = '14', meta = {}) {
    const issue = meta.issue || '25068';
    const multiplier = meta.multiplier || 1;
    const gameName = mode === '14' ? '中国体育彩票 · 14场胜负彩' : '中国体育彩票 · 任选九场';

    function cartesian(arr) {
      return arr.reduce((a, b) => a.flatMap(d => b.map(e => [...d, e])), [[]]);
    }

    const activePicks = mode === '14' ? picks : picks.filter(p => p && p.length > 0);
    const allBets = cartesian(picks.map(p => (p && p.length > 0 ? p : ['*'])));

    // 最多截取前 20 注作为实体出单展示，避免几百注撑爆
    const displayBets = allBets.slice(0, 20);
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
