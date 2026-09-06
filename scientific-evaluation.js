"use strict";

// Evaluation has no ambient draw database: predictors receive past observations only.
const GAMES = Object.freeze({
  ssq: Object.freeze({ mainMax: 33, mainCount: 6, specialMax: 16, specialCount: 1, price: 2 }),
  dlt: Object.freeze({ mainMax: 35, mainCount: 5, specialMax: 12, specialCount: 2, price: 2 }),
});

function gameFor(id) {
  if (!Object.hasOwn(GAMES, id)) throw new RangeError("Unknown lottery game");
  return GAMES[id];
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(label);
  return value;
}
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) value = value * (n - i + 1) / i;
  return Math.round(value);
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
function validateTicket(id, ticket) {
  const game = gameFor(id);
  for (const [name, count, max] of [["main", game.mainCount, game.mainMax], ["special", game.specialCount, game.specialMax]]) {
    const values = ticket && ticket[name];
    if (!Array.isArray(values) || values.length !== count || new Set(values).size !== count) throw new RangeError("Invalid " + name + " numbers");
    values.forEach(value => integer(value, 1, max, "Invalid " + name + " number"));
  }
}
function ticketKey(ticket) {
  return [ticket.main, ticket.special].map(values => values.slice().sort((a, b) => a - b).join(",")).join("+");
}

function exactLotteryPrior(gameId, uniqueTicketCount = 1) {
  const game = gameFor(gameId);
  const combinations = choose(game.mainMax, game.mainCount) * choose(game.specialMax, game.specialCount);
  integer(uniqueTicketCount, 0, combinations, "Invalid unique ticket count");
  const matchDistribution = [];
  for (let main = 0; main <= game.mainCount; main++) {
    for (let special = 0; special <= game.specialCount; special++) {
      const outcomes = choose(game.mainCount, main) * choose(game.mainMax - game.mainCount, game.mainCount - main)
        * choose(game.specialCount, special) * choose(game.specialMax - game.specialCount, game.specialCount - special);
      matchDistribution.push({ main, special, outcomes, probability: outcomes / combinations });
    }
  }
  return {
    gameId, combinations, uniqueTicketCount, jackpotProbability: uniqueTicketCount / combinations,
    matchDistribution,
    assumption: "Independent, uniform fair draws. Each distinct full combination has equal probability. Duplicate tickets do not add jackpot coverage.",
  };
}

function uniformTickets(gameId, count, seed) {
  const game = gameFor(gameId);
  integer(count, 0, 50, "Invalid ticket count");
  integer(seed, 0, 0xffffffff, "Invalid seed");
  const rng = rngFor(seed);
  function sample(max, n) {
    const pool = Array.from({ length: max }, (_, i) => i + 1);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng() * (max - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n).sort((a, b) => a - b);
  }
  const tickets = [];
  const seen = new Set();
  while (tickets.length < count) {
    const ticket = { main: sample(game.mainMax, game.mainCount), special: sample(game.specialMax, game.specialCount) };
    const key = ticketKey(ticket);
    if (!seen.has(key)) { seen.add(key); tickets.push(ticket); }
  }
  return tickets;
}

const mean = values => values.reduce((total, value) => total + value, 0) / values.length;

// Seeds are averaged within a draw first. Circular moving blocks preserve short-range
// dependence between consecutive draw-level differences; this is exploratory inference.
function pairedInterval(differences, { seed = 90210, samples = 2000, blockLength } = {}) {
  if (!Array.isArray(differences) || !differences.length || differences.some(value => !Number.isFinite(value))) throw new RangeError("Finite paired differences required");
  integer(seed, 0, 0xffffffff, "Invalid bootstrap seed");
  integer(samples, 200, 100000, "Invalid bootstrap samples");
  const n = differences.length;
  const block = blockLength === undefined ? Math.max(1, Math.ceil(Math.cbrt(n))) : integer(blockLength, 1, n, "Invalid block length");
  const result = { meanDifference: mean(differences), periods: n, confidenceLevel: 0.95, method: "circular moving-block percentile bootstrap", blockLength: block, samples, seed, interval: null };
  if (n < 20) return { ...result, status: "insufficient_periods", limitation: "At least 20 paired periods required; rare jackpots remain poorly estimated even in longer samples." };
  const rng = rngFor(seed);
  const bootstrap = [];
  for (let replicate = 0; replicate < samples; replicate++) {
    let total = 0;
    for (let i = 0; i < n;) {
      const start = Math.floor(rng() * n);
      for (let j = 0; j < block && i < n; j++, i++) total += differences[(start + j) % n];
    }
    bootstrap.push(total / n);
  }
  bootstrap.sort((a, b) => a - b);
  result.interval = [bootstrap[Math.floor((samples - 1) * 0.025)], bootstrap[Math.ceil((samples - 1) * 0.975)]];
  return { ...result, status: "exploratory", limitation: "No adjustment for strategy selection or repeated testing; finite history cannot estimate rare-jackpot tail risk reliably." };
}

function walkForward(options) {
  const { gameId, draws, strategy, evaluatePrize, prizeEstimates, strategyName = "unspecified strategy", seeds = [1701, 2903, 4109], count = 5, periods = 100, minTraining = 30 } = options;
  const game = gameFor(gameId);
  integer(count, 1, 50, "Invalid ticket count");
  integer(periods, 1, 10000, "Invalid periods");
  integer(minTraining, 1, 100000, "Invalid minimum training size");
  if (typeof strategy !== "function" || typeof evaluatePrize !== "function") throw new TypeError("Strategy and prize evaluator required");
  if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length) throw new RangeError("Distinct seeds required");
  seeds.forEach(seed => integer(seed, 0, 0xffffffff, "Invalid seed"));
  if (!Array.isArray(draws) || draws.length < minTraining + periods) throw new RangeError("Insufficient chronological history");
  const seenIssues = new Set();
  const cleanDraws = draws.map((draw, index) => {
    validateTicket(gameId, draw);
    if (typeof draw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(draw.date) || !Number.isFinite(Date.parse(draw.date)) || new Date(draw.date).toISOString().slice(0, 10) !== draw.date) throw new RangeError("Valid draw dates required");
    if (index && draws[index - 1].date >= draw.date) throw new RangeError("Draws must be strictly chronological");
    if (typeof draw.issue !== "string" || !draw.issue || seenIssues.has(draw.issue)) throw new RangeError("Distinct issue identifiers required");
    seenIssues.add(draw.issue);
    return Object.freeze({ issue: draw.issue, date: draw.date, main: Object.freeze(draw.main.slice()), special: Object.freeze(draw.special.slice()) });
  });
  if (!prizeEstimates || Object.values(prizeEstimates).some(value => !Number.isFinite(value) || value < 0)) throw new RangeError("Finite nonnegative prize estimates required");

  function score(tickets, target) {
    if (!Array.isArray(tickets) || tickets.length !== count) throw new RangeError("Strategy must supply exactly the fixed budget ticket count");
    tickets.forEach(ticket => validateTicket(gameId, ticket));
    if (new Set(tickets.map(ticketKey)).size !== count) throw new RangeError("Duplicate strategy tickets reduce coverage and are rejected");
    const wins = [];
    let estimatedPrizeYuan = 0;
    tickets.forEach((ticket, index) => {
      const level = evaluatePrize(gameId, ticket, target);
      integer(level, 0, 20, "Invalid prize level");
      if (level) {
        if (!Object.hasOwn(prizeEstimates, level)) throw new RangeError("Missing prize estimate for level " + level);
        estimatedPrizeYuan += prizeEstimates[level];
        wins.push({ ticketIndex: index, level });
      }
    });
    const costYuan = count * game.price;
    return { tickets: tickets.map(ticket => ({ main: ticket.main.slice(), special: ticket.special.slice() })), wins, hit: Number(wins.length > 0), winningTickets: wins.length, costYuan, estimatedPrizeYuan, estimatedNetYuan: estimatedPrizeYuan - costYuan };
  }

  const points = [];
  const start = cleanDraws.length - periods;
  for (let index = start; index < cleanDraws.length; index++) {
    const target = cleanDraws[index];
    const history = Object.freeze(cleanDraws.slice(0, index));
    const trials = seeds.map(seed => {
      // Tie seed to issue, not array length or evaluation-window position.
      let periodSeed = seed;
      for (const c of target.issue) periodSeed = Math.imul(periodSeed ^ c.charCodeAt(0), 16777619) >>> 0;
      const prediction = strategy({ gameId, history, count, seed: periodSeed });
      const selected = score(Array.isArray(prediction) ? prediction : prediction.tickets, target);
      const baseline = score(uniformTickets(gameId, count, (periodSeed ^ 0x5bd1e995) >>> 0), target);
      return { seed, periodSeed, strategy: selected, baseline };
    });
    points.push({ issue: target.issue, date: target.date, trainingPeriods: history.length, trainingEnd: history[history.length - 1].date, trials,
      pairedEstimatedNetDifferenceYuan: mean(trials.map(trial => trial.strategy.estimatedNetYuan - trial.baseline.estimatedNetYuan)),
      pairedHitDifference: mean(trials.map(trial => trial.strategy.hit - trial.baseline.hit)),
    });
  }
  const summary = {};
  for (const name of ["strategy", "baseline"]) {
    summary[name] = {
      meanTotalCostYuan: periods * count * game.price,
      meanTotalEstimatedPrizeYuan: points.reduce((total, point) => total + mean(point.trials.map(trial => trial[name].estimatedPrizeYuan)), 0),
      meanTotalEstimatedNetYuan: points.reduce((total, point) => total + mean(point.trials.map(trial => trial[name].estimatedNetYuan)), 0),
      meanHitRate: mean(points.map(point => mean(point.trials.map(trial => trial[name].hit)))),
    };
  }
  return { schemaVersion: 1, gameId, strategyName, periods, countPerPeriod: count, seeds,
    evidenceStatus: "EXPLORATORY_ONLY_NO_PREDICTIVE_ADVANTAGE_ESTABLISHED",
    payoutBasis: { type: "fixed_prize_scenario_estimates", prizeEstimates: { ...prizeEstimates }, limitation: "Floating prizes are estimates. Rule changes, historical per-issue payouts, tax and promotions are not reconstructed; this is not realized historical profit." },
    protocol: "Expanding past-only training; fixed equal base-stake budget; unique uniform random baseline; seeds averaged within each draw before paired bootstrap. No parameter tuning on evaluated draws.",
    prior: exactLotteryPrior(gameId, count), summary,
    estimatedNetDifference: pairedInterval(points.map(point => point.pairedEstimatedNetDifferenceYuan)),
    hitDifference: pairedInterval(points.map(point => point.pairedHitDifference)), points,
  };
}

function probabilityScores(probabilities, outcome) {
  if (!Array.isArray(probabilities) || probabilities.length < 2 || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw new RangeError("Valid probability vector required");
  if (Math.abs(probabilities.reduce((total, p) => total + p, 0) - 1) > 1e-10) throw new RangeError("Probabilities must sum to one");
  integer(outcome, 0, probabilities.length - 1, "Invalid observed outcome index");
  return {
    brier: probabilities.reduce((total, p, index) => total + (p - Number(index === outcome)) ** 2, 0),
    logLoss: probabilities[outcome] === 0 ? Infinity : -Math.log(probabilities[outcome]),
  };
}

function compareSportsProbabilities(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Observed out-of-sample rows required");
  if (!rows.length) return { status: "INSUFFICIENT_DATA", predictiveAdvantageEstablished: false, observations: 0, reason: "Real timestamped pre-event predictions, market probabilities and settled outcomes required." };
  const seen = new Set();
  let classes;
  let previousEventTime = -Infinity;
  const scored = rows.map(row => {
    if (!row || typeof row.eventId !== "string" || !row.eventId || seen.has(row.eventId)) throw new RangeError("Distinct event identifiers required");
    seen.add(row.eventId);
    const predictedAt = Date.parse(row.predictedAt);
    const marketAt = Date.parse(row.marketAt);
    const eventAt = Date.parse(row.eventAt);
    if (![predictedAt, marketAt, eventAt].every(Number.isFinite) || predictedAt >= eventAt || marketAt >= eventAt) throw new RangeError("Predictions and market baseline must predate the event");
    if (eventAt < previousEventTime) throw new RangeError("Events must be chronological");
    previousEventTime = eventAt;
    const model = probabilityScores(row.probabilities, row.outcome);
    const market = probabilityScores(row.marketProbabilities, row.outcome);
    if (row.probabilities.length !== row.marketProbabilities.length || (classes !== undefined && classes !== row.probabilities.length)) throw new RangeError("Consistent outcome classes required");
    classes = row.probabilities.length;
    return { eventId: row.eventId, model, market };
  });
  const brierDifferences = scored.map(row => row.model.brier - row.market.brier);
  const logDifferences = scored.map(row => row.model.logLoss - row.market.logLoss);
  return { status: "EXPLORATORY_ONLY", predictiveAdvantageEstablished: false, observations: rows.length,
    brierConvention: "Multiclass sum of squared probability errors (range 0 to 2); negative model-minus-market difference favors model.",
    meanModelBrier: mean(scored.map(row => row.model.brier)), meanMarketBrier: mean(scored.map(row => row.market.brier)),
    meanModelLogLoss: mean(scored.map(row => row.model.logLoss)), meanMarketLogLoss: mean(scored.map(row => row.market.logLoss)),
    brierDifference: pairedInterval(brierDifferences),
    logLossDifference: logDifferences.every(Number.isFinite) ? pairedInterval(logDifferences) : { interval: null, status: "nonfinite_log_loss", reason: "A zero probability was assigned to an observed outcome; loss is infinite and is not clipped." },
    limitation: "Timestamp fields alone cannot prove predictions were archived before kickoff. Requires independently retained predictions, a frozen model, representative holdout events, consistent class ordering and a justified de-vigged market baseline. Scores alone do not establish betting profit.",
    scores: scored,
  };
}

module.exports = { exactLotteryPrior, uniformTickets, pairedInterval, walkForward, probabilityScores, compareSportsProbabilities };
