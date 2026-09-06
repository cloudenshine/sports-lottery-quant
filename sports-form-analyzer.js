/**
 * sports-form-analyzer.js
 * 真实队伍竞技状态与动态量化分析器
 * 涵盖：近期战绩走势、主客场拆解、泊松攻防xG建模、体能伤停、交锋H2H、以及机构赔率价值/陷阱雷达。
 */

function formFinite(value, name, min = 0) {
  if (!Number.isFinite(value) || value < min) throw new RangeError(`${name} must be finite and >= ${min}`);
}

// Recurrence avoids factorial overflow. The support expands until omitted mass is negligible.
function formPoissonMass(lambda, minimumSupport = 0) {
  const mass = [Math.exp(-lambda)];
  let sum = mass[0];
  const limit = Math.max(minimumSupport, Math.ceil(lambda + 14 * Math.sqrt(lambda + 1) + 30));
  for (let k = 1; k <= limit; k++) {
    mass[k] = mass[k - 1] * lambda / k;
    sum += mass[k];
    if (k >= minimumSupport && k > lambda && 1 - sum <= 1e-13) break;
  }
  return { mass, sum };
}

const FormAnalyzer = {
  /**
   * 分析近期战绩走势
   * @param {Object} stats { recentResults: ['W','W',...], goalsFor, goalsAgainst, matches }
   */
  analyzeRecentForm(stats) {
    const results = stats.recentResults || [];
    if (!Array.isArray(results) || results.some(r => !['W', 'D', 'L'].includes(r))) throw new RangeError('recentResults must contain W, D or L');
    const n = results.length;
    const goalMatches = stats.matches ?? n;
    if (!Number.isInteger(goalMatches) || goalMatches <= 0 || n === 0) throw new RangeError('Recent form requires observed matches and results');
    formFinite(stats.goalsFor ?? 0, 'goalsFor');
    formFinite(stats.goalsAgainst ?? 0, 'goalsAgainst');
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
      goalsForPerMatch: (stats.goalsFor || 0) / goalMatches,
      goalsAgainstPerMatch: (stats.goalsAgainst || 0) / goalMatches
    };
  },

  /**
   * 分析主客场特征拆解与预期进球
   */
  analyzeHomeAwaySplits(homeTeam, awayTeam) {
    const leagueAvgGoals = 1.38; // 联赛单队场均基准进球
    const homeMatches = homeTeam.homeMatches;
    const awayMatches = awayTeam.awayMatches;
    if (!Number.isInteger(homeMatches) || homeMatches <= 0 || !Number.isInteger(awayMatches) || awayMatches <= 0) throw new RangeError('Home/away splits require positive observed match counts');
    ['homeGF', 'homeGA'].forEach(k => formFinite(homeTeam[k], k));
    ['awayGF', 'awayGA'].forEach(k => formFinite(awayTeam[k], k));

    const homeGF = (homeTeam.homeGF || 0) / homeMatches;
    const homeGA = (homeTeam.homeGA || 0) / homeMatches;
    const awayGF = (awayTeam.awayGF || 0) / awayMatches;
    const awayGA = (awayTeam.awayGA || 0) / awayMatches;

    // 攻防相对强度
    const homeAtt = homeGF / leagueAvgGoals;
    const awayDef = awayGA / leagueAvgGoals;
    const awayAtt = awayGF / leagueAvgGoals;
    const homeDef = homeGA / leagueAvgGoals;

    // Home/away split observations already include venue effects; do not multiply a second arbitrary bonus.
    const homeAdvantageFactor = 1;

    const expectedGoalsHome = Math.max(0.2, homeAtt * awayDef * leagueAvgGoals * homeAdvantageFactor);
    const expectedGoalsAway = Math.max(0.2, awayAtt * homeDef * leagueAvgGoals);

    const homeAdvantageIndex = expectedGoalsHome / expectedGoalsAway;

    return {
      expectedGoalsHome: Math.round(expectedGoalsHome * 100) / 100,
      expectedGoalsAway: Math.round(expectedGoalsAway * 100) / 100,
      homeAdvantageIndex: Math.round(homeAdvantageIndex * 100) / 100,
      modelStatus: 'uncalibrated',
      leagueBaselineGoals: leagueAvgGoals
    };
  },

  /**
   * 独立泊松条件模型；不等同于已校准真实概率
   */
  poissonMatchProbabilities(lambdaHome, muAway, options = {}) {
    formFinite(lambdaHome, 'lambdaHome');
    formFinite(muAway, 'muAway');
    if (lambdaHome > 100 || muAway > 100) throw new RangeError('Goal means must not exceed numerical support limit 100');
    const maxGoals = options.maxGoals ?? 6;
    if (!Number.isInteger(maxGoals) || maxGoals < 0 || maxGoals > 1000) throw new RangeError('maxGoals must be an integer from 0 to 1000');
    const home = formPoissonMass(lambdaHome, maxGoals);
    const away = formPoissonMass(muAway, maxGoals);
    const retainedMass = home.sum * away.sum;
    let probHome = 0, probDraw = 0, probAway = 0;
    const scores = [];
    const totalGoalsDist = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 };
    for (let h = 0; h < home.mass.length; h++) {
      for (let a = 0; a < away.mass.length; a++) {
        const p = home.mass[h] * away.mass[a] / retainedMass;
        if (h > a) probHome += p;
        else if (h === a) probDraw += p;
        else probAway += p;
        scores.push({ score: `${h}-${a}`, prob: p });
        totalGoalsDist[h + a >= 7 ? '7+' : String(h + a)] += p;
      }
    }
    scores.sort((x, y) => y.prob - x.prob);
    return {
      probHome, probDraw, probAway,
      topScores: scores.slice(0, 10),
      totalGoalsProb: totalGoalsDist,
      omittedProbability: Math.max(0, 1 - retainedMass),
      support: { home: home.mass.length - 1, away: away.mass.length - 1 },
      model: 'independent-poisson',
      modelStatus: 'uncalibrated',
      assumptions: ['Independent home and away goal counts', 'Input goal means require out-of-sample validation']
    };
  },

  /**
   * 计算休整天数与疲劳损耗
   */
  calculateFatigue(restDays, options = {}) {
    formFinite(restDays, 'restDays');
    const injuries = options.keyInjuriesCount ?? 0;
    if (!Number.isInteger(injuries) || injuries < 0) throw new RangeError('keyInjuriesCount must be a nonnegative integer');
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

    h2hMatches = h2hMatches.filter(m => (m.home === teamA && m.away === teamB) || (m.home === teamB && m.away === teamA));
    h2hMatches.forEach(m => {
      if (!['home', 'draw', 'away'].includes(m.winner)) throw new RangeError('Invalid H2H winner');
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
      h2hAdvantageScore: h2hMatches.length ? Math.round(score * 100) / 100 : null,
      sampleSize: h2hMatches.length
    };
  },

  /**
   * 市场离散度与价值注 (EV) / 诱盘陷阱雷达
   */
  evaluateMarketValue(params) {
    const { realProb, marketOdds, teamFormScore = 50, marketOddsList } = params;
    formFinite(realProb, 'realProb');
    if (realProb > 1) throw new RangeError('realProb must be <= 1');
    formFinite(marketOdds, 'marketOdds', 1.000000000001);
    formFinite(teamFormScore, 'teamFormScore');
    if (teamFormScore > 100) throw new RangeError('teamFormScore must be <= 100');
    const ev = realProb * marketOdds;
    // A single quote identifies only the break-even probability. De-vigging needs a complete market.
    let fairMarketProbability = null;
    if (marketOddsList !== undefined) {
      if (!Array.isArray(marketOddsList) || marketOddsList.length < 2 || !marketOddsList.includes(marketOdds)) {
        throw new RangeError('marketOddsList must contain the complete market including marketOdds');
      }
      marketOddsList.forEach(o => formFinite(o, 'market odds', 1.000000000001));
      fairMarketProbability = (1 / marketOdds) / marketOddsList.reduce((sum, o) => sum + 1 / o, 0);
    }
    return {
      ev,
      expectedNetReturn: ev - 1,
      marketImpliedProb: 1 / marketOdds,
      fairMarketProbability,
      fullKellyFraction: Math.max(0, Math.min(1, (ev - 1) / (marketOdds - 1))),
      isValueBet: ev > 1.05,
      modelStatus: 'conditional-on-input-probability',
      evidenceOfPredictiveEdge: false,
      trapWarning: false,
      isOverheatedTrap: false,
      formModelDisagreement: teamFormScore > 85 && ev < 0.75 && realProb < 0.45
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormAnalyzer;
}
if (typeof window !== 'undefined') {
  window.FormAnalyzer = FormAnalyzer;
}
