const test = require('node:test');
const assert = require('node:assert/strict');
const FormAnalyzer = require('../sports-form-analyzer.js');

test('Team Form & Dynamics Analyzer', async (t) => {
  await t.test('1. Recent form score and streak calculation', () => {
    // Team A: 5 wins, 1 draw (strong form)
    const strongStats = {
      recentResults: ['W', 'W', 'W', 'D', 'W', 'W'], // latest to oldest
      goalsFor: 14,
      goalsAgainst: 3,
      matches: 6
    };
    const formA = FormAnalyzer.analyzeRecentForm(strongStats);
    assert.ok(formA.formScore > 80, `Expected strong form score > 80, got ${formA.formScore}`);
    assert.strictEqual(formA.winRate, 5 / 6);
    assert.strictEqual(formA.undefeatedRate, 1.0);
    assert.strictEqual(formA.streak.type, 'W');
    assert.strictEqual(formA.streak.count, 3);

    // Team B: slump form
    const slumpStats = {
      recentResults: ['L', 'L', 'D', 'L', 'W', 'L'],
      goalsFor: 4,
      goalsAgainst: 12,
      matches: 6
    };
    const formB = FormAnalyzer.analyzeRecentForm(slumpStats);
    assert.ok(formB.formScore < 35, `Expected slump form score < 35, got ${formB.formScore}`);
    assert.strictEqual(formB.streak.type, 'L');
    assert.strictEqual(formB.streak.count, 2);
  });

  await t.test('2. Home / Away split dynamics and goal expectancy', () => {
    const homeTeam = {
      name: 'Arsenal',
      homeMatches: 10,
      homeGF: 25, // 2.5 per game
      homeGA: 8,  // 0.8 per game
      homeWins: 8, homeDraws: 1, homeLosses: 1
    };
    const awayTeam = {
      name: 'Chelsea',
      awayMatches: 10,
      awayGF: 12, // 1.2 per game
      awayGA: 16, // 1.6 per game
      awayWins: 3, awayDraws: 3, awayLosses: 4
    };
    const split = FormAnalyzer.analyzeHomeAwaySplits(homeTeam, awayTeam);
    assert.ok(split.homeAdvantageIndex > 1.2, 'Arsenal home advantage index should be strong');
    assert.ok(split.expectedGoalsHome > split.expectedGoalsAway, 'Home xG should exceed Away xG');
    assert.ok(split.expectedGoalsHome > 1.8, 'Arsenal expected goals should reflect high home GF');
  });

  await t.test('3. Bivariate Poisson match simulation for true probabilities and scores', () => {
    // Given xG: Home 2.1, Away 0.9
    const matchSim = FormAnalyzer.poissonMatchProbabilities(2.1, 0.9, { maxGoals: 6 });
    // Probabilities must sum to 1.0 (within epsilon)
    const totalProb = matchSim.probHome + matchSim.probDraw + matchSim.probAway;
    assert.ok(Math.abs(totalProb - 1.0) < 0.01, `Total prob should be ~1.0, got ${totalProb}`);
    // Home should be favored
    assert.ok(matchSim.probHome > matchSim.probAway);
    assert.ok(matchSim.probHome > 0.6, `Home prob should be > 0.6, got ${matchSim.probHome}`);
    // Most likely scores should include 2-0, 2-1, 1-0
    const topScores = matchSim.topScores.slice(0, 3).map(s => s.score);
    assert.ok(topScores.some(s => ['2-0', '2-1', '1-0', '3-1'].includes(s)));
    // Total goals distribution should sum to ~1.0
    const totalGoalProbs = Object.values(matchSim.totalGoalsProb).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(totalGoalProbs - 1.0) < 0.02);
  });

  await t.test('4. Rest days & fatigue penalty', () => {
    // Rest days 2 (European mid-week fatigue)
    const fatigueImpact = FormAnalyzer.calculateFatigue(2, { keyInjuriesCount: 2 });
    assert.ok(fatigueImpact.fatiguePenalty > 0.08, 'Fatigue penalty should be significant for 2 days rest');
    assert.strictEqual(fatigueImpact.isTired, true);

    // Rest days 7 (fresh squad)
    const freshImpact = FormAnalyzer.calculateFatigue(7, { keyInjuriesCount: 0 });
    assert.strictEqual(freshImpact.fatiguePenalty, 0);
    assert.strictEqual(freshImpact.isTired, false);
  });

  await t.test('5. Head-to-Head (H2H) psychological edge', () => {
    const h2h = [
      { home: 'Real Madrid', away: 'Atletico Madrid', score: '2-0', winner: 'home' },
      { home: 'Atletico Madrid', away: 'Real Madrid', score: '1-1', winner: 'draw' },
      { home: 'Real Madrid', away: 'Atletico Madrid', score: '3-1', winner: 'home' },
      { home: 'Atletico Madrid', away: 'Real Madrid', score: '0-2', winner: 'away' },
      { home: 'Real Madrid', away: 'Atletico Madrid', score: '1-0', winner: 'home' }
    ];
    const edge = FormAnalyzer.analyzeH2H('Real Madrid', 'Atletico Madrid', h2h);
    assert.strictEqual(edge.homeWins, 4);
    assert.strictEqual(edge.draws, 1);
    assert.strictEqual(edge.awayWins, 0);
    assert.ok(edge.h2hAdvantageScore > 0.7);
  });

  await t.test('6. Market divergence & Value Bet radar (EV > 1.05 and Trap Warning)', () => {
    // True estimated probability vs Market Odds
    // Scenario 1: True prob = 0.55, Market Odds = 2.10. EV = 0.55 * 2.10 = 1.155 (Value Bet!)
    const valueAnalysis = FormAnalyzer.evaluateMarketValue({
      realProb: 0.55,
      marketOdds: 2.10,
      marketReturnRate: 0.73,
      teamFormScore: 82
    });
    assert.ok(valueAnalysis.ev > 1.10);
    assert.strictEqual(valueAnalysis.isValueBet, true);
    assert.strictEqual(valueAnalysis.trapWarning, false);

    // Scenario 2: Team has high form (90), but market odds are suspiciously high (e.g. 2.60 when prob should be 0.60)
    // Indicating deep market suspicion / trap / rotation
    const trapAnalysis = FormAnalyzer.evaluateMarketValue({
      realProb: 0.38, // real chances dropped due to injuries/rotation
      marketOdds: 1.45, // market heavily public-backed (overheated)
      marketReturnRate: 0.73,
      teamFormScore: 92
    });
    assert.ok(trapAnalysis.ev < 0.70);
    assert.strictEqual(trapAnalysis.isOverheatedTrap, true);
  });
});
