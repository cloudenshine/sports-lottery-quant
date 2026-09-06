"use strict";

const Science = require("./scientific-evaluation");
const GAMES = Object.freeze({
  ssq: Object.freeze({ mainMax: 33, mainCount: 6, specialMax: 16, specialCount: 1 }),
  dlt: Object.freeze({ mainMax: 35, mainCount: 5, specialMax: 12, specialCount: 2 }),
});
const STRATEGIES = Object.freeze([
  Object.freeze({ id: "uniform", name: "均匀随机不重复", hypothesis: "Control: equal probability for every full combination." }),
  Object.freeze({ id: "hot_shrink", name: "历史热频收缩", hypothesis: "Test persistence of marginal frequency; no assumed causal advantage." }),
  Object.freeze({ id: "cold_shrink", name: "历史冷频收缩", hypothesis: "Test reversal of marginal frequency; fair draws have no compensating memory." }),
  Object.freeze({ id: "coverage", name: "号码分散覆盖", hypothesis: "Reduce repeated number exposure across tickets; changes dependence, not marginal expected return." }),
]);
// Fixed before the tournament; historical outputs must not be used to tune this protocol.
const PROTOCOL = Object.freeze({ version: 1, periods: 100, count: 5, seeds: Object.freeze([1701, 2903, 4109]),
  minTraining: 100, frequencyWindow: 100, priorDraws: 100, frequencyStrength: 0.5, coverageCandidates: 32,
  familyComparisons: 8, familyAlpha: 0.05, bootstrapSamples: 20000, bootstrapSeed: 53819,
  primaryEndpoint: "draw-level mean scenario net yuan minus equal-cost uniform baseline, seeds averaged within draw",
  family: "Four strategies x two games; only scenario net differences are inferential endpoints. Hit rates are descriptive.",
  promotion: "Exploratory historical results cannot promote a strategy. Freeze protocol and archive future predictions before draws; independently validate per-issue payouts and a prospective holdout before claiming an edge.",
});
function gameFor(id) {
  if (!Object.hasOwn(GAMES, id)) throw new RangeError("Unknown lottery game");
  return GAMES[id];
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(label);
  return value;
}
function rngFor(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const key = ticket => ticket.main.join(",") + "+" + ticket.special.join(",");

function selectTickets(strategyId, { gameId, history = [], count = PROTOCOL.count, seed }) {
  const game = gameFor(gameId);
  if (!STRATEGIES.some(strategy => strategy.id === strategyId)) throw new RangeError("Unknown number strategy");
  integer(count, 1, 50, "Invalid ticket count");
  integer(seed, 0, 0xffffffff, "Invalid seed");
  if (!Array.isArray(history)) throw new TypeError("History array required");
  if (strategyId === "uniform") return Science.uniformTickets(gameId, count, seed);
  const rng = rngFor(seed);
  const recent = history.slice(-PROTOCOL.frequencyWindow);
  const weights = {};
  for (const name of ["main", "special"]) {
    const max = game[name + "Max"], size = game[name + "Count"], p = size / max;
    const frequency = Array(max).fill(0);
    for (const draw of recent) {
      const values = draw && draw[name];
      if (!Array.isArray(values) || values.length !== size || new Set(values).size !== size) throw new RangeError("Invalid history numbers");
      for (const value of values) frequency[integer(value, 1, max, "Invalid history number") - 1]++;
    }
    weights[name] = frequency.map(observed => {
      const posterior = (observed + PROTOCOL.priorDraws * p) / (recent.length + PROTOCOL.priorDraws);
      const direction = strategyId === "cold_shrink" ? -1 : 1;
      return Math.max(0.1, 1 + direction * PROTOCOL.frequencyStrength * (posterior / p - 1));
    });
  }
  function sample(name) {
    const pool = weights[name].map((weight, index) => ({ number: index + 1, weight }));
    const picked = [];
    while (picked.length < game[name + "Count"]) {
      let target = rng() * pool.reduce((sum, item) => sum + item.weight, 0);
      let index = 0;
      while (index < pool.length - 1 && target >= pool[index].weight) target -= pool[index++].weight;
      picked.push(pool.splice(index, 1)[0].number);
    }
    return picked.sort((a, b) => a - b);
  }
  const tickets = [], seen = new Set();
  const exposure = { main: Array(game.mainMax + 1).fill(0), special: Array(game.specialMax + 1).fill(0) };
  while (tickets.length < count) {
    let ticket;
    if (strategyId === "coverage") {
      let bestScore = Infinity;
      for (let i = 0; i < PROTOCOL.coverageCandidates; i++) {
        const candidate = Science.uniformTickets(gameId, 1, Math.floor(rng() * 4294967296))[0];
        if (seen.has(key(candidate))) continue;
        const score = ["main", "special"].reduce((sum, name) => sum + candidate[name].reduce((total, n) => total + exposure[name][n], 0) / game[name + "Count"], 0);
        if (score < bestScore) { bestScore = score; ticket = candidate; }
      }
      // A finite candidate batch may contain only already-owned tickets; try another batch.
      if (!ticket) continue;
    } else ticket = { main: sample("main"), special: sample("special") };
    if (seen.has(key(ticket))) continue;
    seen.add(key(ticket));
    tickets.push(ticket);
    for (const name of ["main", "special"]) for (const number of ticket[name]) exposure[name][number]++;
  }
  return tickets;
}

function familyInterval(differences, comparisons = PROTOCOL.familyComparisons) {
  if (!Array.isArray(differences) || !differences.length || differences.some(value => !Number.isFinite(value))) throw new RangeError("Finite draw differences required");
  integer(comparisons, PROTOCOL.familyComparisons, 1000, "Comparison family cannot omit registered tests");
  const n = differences.length, alpha = PROTOCOL.familyAlpha / comparisons;
  const result = { meanDifference: mean(differences), periods: n, familyAlpha: PROTOCOL.familyAlpha, comparisons,
    individualConfidenceLevel: 1 - alpha, method: "Bonferroni-adjusted circular moving-block percentile bootstrap (approximate exploratory interval)",
    interval: null, status: "INSUFFICIENT_PERIODS", samples: PROTOCOL.bootstrapSamples, seed: PROTOCOL.bootstrapSeed,
    limitation: "Bootstrap cannot recover unseen rare jackpots. Bonferroni adjustment is approximate because marginal bootstrap coverage is approximate; neither this interval nor scenario payouts prove a future or realized-profit edge." };
  if (n < 20) return result;
  const blockLength = Math.max(1, Math.ceil(Math.cbrt(n)));
  const random = rngFor(PROTOCOL.bootstrapSeed), estimates = [];
  for (let sample = 0; sample < PROTOCOL.bootstrapSamples; sample++) {
    let total = 0, taken = 0;
    while (taken < n) {
      const start = Math.floor(random() * n);
      for (let offset = 0; offset < blockLength && taken < n; offset++, taken++) total += differences[(start + offset) % n];
    }
    estimates.push(total / n);
  }
  estimates.sort((a, b) => a - b);
  const low = estimates[Math.floor(alpha / 2 * estimates.length)];
  const high = estimates[Math.min(estimates.length - 1, Math.ceil((1 - alpha / 2) * estimates.length) - 1)];
  return { ...result, blockLength, interval: [low, high], status: low > 0 ? "EXPLORATORY_POSITIVE_SCENARIO_SIGNAL" : "NO_POSITIVE_SCENARIO_SIGNAL" };
}

function exactPrizeProbabilities(gameId, evaluatePrize, prizeEstimates, count = 1) {
  const game = gameFor(gameId), prior = Science.exactLotteryPrior(gameId, count);
  if (typeof evaluatePrize !== "function" || !prizeEstimates || Object.values(prizeEstimates).some(value => !Number.isFinite(value) || value < 0)) throw new TypeError("Prize evaluator and nonnegative finite scenario payouts required");
  const ticket = { main: Array.from({ length: game.mainCount }, (_, i) => i + 1), special: Array.from({ length: game.specialCount }, (_, i) => i + 1) };
  const levels = {};
  for (const cell of prior.matchDistribution) {
    const draw = {};
    for (const name of ["main", "special"]) draw[name] = ticket[name].slice(0, cell[name]).concat(Array.from({ length: game[name + "Count"] - cell[name] }, (_, i) => game[name + "Count"] + i + 1));
    const level = evaluatePrize(gameId, ticket, draw);
    integer(level, 0, 20, "Invalid prize level");
    if (level && !Object.hasOwn(prizeEstimates, level)) throw new RangeError("Missing scenario payout for level " + level);
    levels[level] = (levels[level] || 0) + cell.outcomes;
  }
  const singleTicketPrizeProbabilities = Object.entries(levels).map(([level, outcomes]) => ({ level: Number(level), outcomes, probability: outcomes / prior.combinations, scenarioPayoutYuan: Number(level) ? prizeEstimates[level] : 0 }));
  const gross = singleTicketPrizeProbabilities.reduce((sum, row) => sum + row.probability * row.scenarioPayoutYuan, 0);
  return { ...prior, singleTicketPrizeProbabilities, singleTicketAnyPrizeProbability: 1 - (levels[0] || 0) / prior.combinations,
    singleTicketScenarioExpectedGrossYuan: gross, portfolioScenarioExpectedGrossYuan: count * gross,
    portfolioScenarioExpectedNetYuan: count * (gross - 2),
    portfolioExplanation: "For any fixed distinct N tickets in fair independent draws, jackpot probability = N / universe. Each ticket has the same marginal prize distribution; linearity fixes scenario expected gross at N times single-ticket expectation. Overlap changes variance and probability of any small prize; any-prize probability is not expected profit. Floating payouts and historical settlement are not reconstructed." };
}

function runTournament(options) {
  const { gameId, draws, evaluatePrize, prizeEstimates, periods = PROTOCOL.periods, count = PROTOCOL.count, seeds = PROTOCOL.seeds } = options;
  const reports = STRATEGIES.map(strategy => {
    const evaluated = Science.walkForward({ gameId, draws, evaluatePrize, prizeEstimates, periods, count, seeds,
      minTraining: PROTOCOL.minTraining, strategyName: strategy.name,
      strategy: context => selectTickets(strategy.id, context) });
    const { estimatedNetDifference, hitDifference, ...report } = evaluated;
    return { ...report, strategyId: strategy.id, hypothesis: strategy.hypothesis,
      familyAdjustedNetDifference: familyInterval(report.points.map(point => point.pairedEstimatedNetDifferenceYuan)),
      descriptiveHitDifference: mean(report.points.map(point => point.pairedHitDifference)) };
  });
  return { schemaVersion: 1, gameId, protocol: PROTOCOL, runParameters: { periods, count, seeds: [...seeds] },
    status: "EXPLORATORY_ONLY_NO_PREDICTIVE_ADVANTAGE_ESTABLISHED", predictiveAdvantageEstablished: false,
    exactPrior: exactPrizeProbabilities(gameId, evaluatePrize, prizeEstimates, count), reports };
}

module.exports = { STRATEGIES, PROTOCOL, selectTickets, familyInterval, exactPrizeProbabilities, runTournament };
