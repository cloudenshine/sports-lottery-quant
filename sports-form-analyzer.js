/**
 * sports-form-analyzer.js
 * 真实队伍竞技状态与动态量化分析器
 * 涵盖：近期战绩走势、主客场拆解、泊松攻防xG建模、体能伤停、交锋H2H、以及机构赔率价值/陷阱雷达。
 */

function factorial(n) {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

const FormAnalyzer = {
  /**
   * 分析近期战绩走势
   * @param {Object} stats { recentResults: ['W','W',...], goalsFor, goalsAgainst, matches }
   */
  analyzeRecentForm(stats) {
    const results = stats.recentResults || [];
    const n = results.length || stats.matches || 1;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let weightedPoints = 0;
    let totalWeight = 0;

    // 最近比赛赋予更高的时间衰减权重
    results.forEach((r, idx) => {
      const weight = Math.pow(0.88, idx); // 0是最新一场，权重最高
      totalWeight += weight;
      if (r === 'W') {
        wins++;
        weightedPoints += 3 * weight;
      } else if (r === 'D') {
        draws++;
        weightedPoints += 1 * weight;
      } else {
        losses++;
      }
    });

    const maxWeightedPoints = totalWeight * 3;
    let formScore = maxWeightedPoints > 0 ? (weightedPoints / maxWeightedPoints) * 100 : 50;

    // 净胜球修正 (-10 ~ +10)
    const gd = (stats.goalsFor || 0) - (stats.goalsAgainst || 0);
    const gdMod = Math.max(-10, Math.min(10, gd * 1.2));
    formScore = Math.max(5, Math.min(98, formScore + gdMod * 0.4));

    // 计算连胜/连败连平 streak
    let streakType = results[0] || 'D';
    let streakCount = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i] === streakType) {
        streakCount++;
      } else {
        break;
      }
    }

    return {
      formScore: Math.round(formScore * 10) / 10,
      winRate: wins / n,
      undefeatedRate: (wins + draws) / n,
      streak: { type: streakType, count: streakCount },
      wins, draws, losses,
      goalsForPerMatch: (stats.goalsFor || 0) / n,
      goalsAgainstPerMatch: (stats.goalsAgainst || 0) / n
    };
  },

  /**
   * 分析主客场特征拆解与预期进球
   */
  analyzeHomeAwaySplits(homeTeam, awayTeam) {
    const leagueAvgGoals = 1.38; // 联赛单队场均基准进球
    const homeMatches = homeTeam.homeMatches || 1;
    const awayMatches = awayTeam.awayMatches || 1;

    const homeGF = (homeTeam.homeGF || 0) / homeMatches;
    const homeGA = (homeTeam.homeGA || 0) / homeMatches;
    const awayGF = (awayTeam.awayGF || 0) / awayMatches;
    const awayGA = (awayTeam.awayGA || 0) / awayMatches;

    // 攻防相对强度
    const homeAtt = homeGF / leagueAvgGoals;
    const awayDef = awayGA / leagueAvgGoals;
    const awayAtt = awayGF / leagueAvgGoals;
    const homeDef = homeGA / leagueAvgGoals;

    // 主场优势加成 (经验值 ~ 1.15)
    const homeAdvantageFactor = 1.15;

    const expectedGoalsHome = Math.max(0.2, homeAtt * awayDef * leagueAvgGoals * homeAdvantageFactor);
    const expectedGoalsAway = Math.max(0.2, awayAtt * homeDef * leagueAvgGoals);

    const homeAdvantageIndex = expectedGoalsHome / expectedGoalsAway;

    return {
      expectedGoalsHome: Math.round(expectedGoalsHome * 100) / 100,
      expectedGoalsAway: Math.round(expectedGoalsAway * 100) / 100,
      homeAdvantageIndex: Math.round(homeAdvantageIndex * 100) / 100
    };
  },

  /**
   * 双变量泊松分布模拟比赛真实概率
   */
  poissonMatchProbabilities(lambdaHome, muAway, options = {}) {
    const maxGoals = options.maxGoals || 6;
    let grid = [];
    let sumProb = 0;

    for (let h = 0; h <= maxGoals; h++) {
      grid[h] = [];
      for (let a = 0; a <= maxGoals; a++) {
        const p = poisson(h, lambdaHome) * poisson(a, muAway);
        grid[h][a] = p;
        sumProb += p;
      }
    }

    // 归一化
    let probHome = 0;
    let probDraw = 0;
    let probAway = 0;
    let scores = [];
    let totalGoalsDist = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 };

    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const normP = grid[h][a] / sumProb;
        if (h > a) probHome += normP;
        else if (h === a) probDraw += normP;
        else probAway += normP;

        scores.push({ score: `${h}-${a}`, prob: normP });

        const tg = h + a;
        if (tg >= 7) {
          totalGoalsDist['7+'] += normP;
        } else {
          totalGoalsDist[String(tg)] += normP;
        }
      }
    }

    scores.sort((s1, s2) => s2.prob - s1.prob);

    return {
      probHome: Math.round(probHome * 1000) / 1000,
      probDraw: Math.round(probDraw * 1000) / 1000,
      probAway: Math.round(probAway * 1000) / 1000,
      topScores: scores.slice(0, 10),
      totalGoalsProb: totalGoalsDist
    };
  },

  /**
   * 计算休整天数与疲劳损耗
   */
  calculateFatigue(restDays, options = {}) {
    const injuries = options.keyInjuriesCount || 0;
    let penalty = 0;
    let isTired = false;

    if (restDays <= 2) {
      penalty = 0.12;
      isTired = true;
    } else if (restDays === 3) {
      penalty = 0.05;
      isTired = true;
    } else if (restDays >= 7) {
      penalty = 0.0;
      isTired = false;
    }

    penalty += injuries * 0.03;
    penalty = Math.min(0.25, penalty);

    return {
      fatiguePenalty: Math.round(penalty * 100) / 100,
      isTired,
      restDays
    };
  },

  /**
   * 历史交锋心理优势分析
   */
  analyzeH2H(teamA, teamB, h2hMatches = []) {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;

    h2hMatches.forEach(m => {
      const isHomeA = m.home === teamA;
      if (m.winner === 'draw') {
        draws++;
      } else if ((m.winner === 'home' && isHomeA) || (m.winner === 'away' && !isHomeA)) {
        homeWins++; // teamA won
      } else {
        awayWins++; // teamB won
      }
    });

    const total = h2hMatches.length || 1;
    const score = (homeWins * 1.0 + draws * 0.3) / total;

    return {
      homeWins,
      draws,
      awayWins,
      h2hAdvantageScore: Math.round(score * 100) / 100
    };
  },

  /**
   * 市场离散度与价值注 (EV) / 诱盘陷阱雷达
   */
  evaluateMarketValue(params) {
    const { realProb, marketOdds, marketReturnRate = 0.73, teamFormScore = 50 } = params;
    const ev = realProb * marketOdds;
    const marketImpliedProb = (1 / marketOdds) * marketReturnRate;

    const isValueBet = ev > 1.05;

    // 诱盘/过热陷阱逻辑：
    // 队伍名义近况极好 (teamFormScore > 85)，但机构给出的赔率很低 (比如 1.45)，而由于真实战术/体能/伤停模型计算的真实胜率大幅缩水 (realProb < 0.45)
    // 导致 EV 极低 (< 0.70)，典型的大众跟风盲打陷阱
    const isOverheatedTrap = teamFormScore > 85 && ev < 0.75 && realProb < 0.45;

    return {
      ev: Math.round(ev * 1000) / 1000,
      marketImpliedProb: Math.round(marketImpliedProb * 1000) / 1000,
      isValueBet,
      trapWarning: isOverheatedTrap,
      isOverheatedTrap
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormAnalyzer;
}
if (typeof window !== 'undefined') {
  window.FormAnalyzer = FormAnalyzer;
}
