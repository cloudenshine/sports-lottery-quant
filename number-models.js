(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NumberModels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "2.0.0";
  const GAMES = Object.freeze({
    ssq: Object.freeze({ mainMax: 33, mainCount: 6, specialMax: 16, specialCount: 1 }),
    dlt: Object.freeze({ mainMax: 35, mainCount: 5, specialMax: 12, specialCount: 2 })
  });
  const MODEL_IDS = Object.freeze(["uniform", "frequency_shrink", "recency_shrink", "omission_reversal", "transition_shrink", "mixture", "coverage"]);
  const COMPONENT_IDS = Object.freeze(["uniform", "frequency_shrink", "recency_shrink", "omission_reversal", "transition_shrink"]);
  const PARAMETERS = Object.freeze({ maximumHistory: 500, priorDraws: 100, logOddsStrength: 0.5,
    halfLifeDraws: 100, omissionPriorWaitingTimes: 10, coverageCandidates: 64 });
  const ZONES = ["main", "special"];
  function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(label);
    return value;
  }
  function gameFor(id) {
    if (!Object.hasOwn(GAMES, id)) throw new RangeError("Unknown number lottery game");
    return GAMES[id];
  }
  function instant(value, label) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new RangeError(label + " requires an ISO timestamp with timezone");
    const result = Date.parse(value);
    if (!Number.isFinite(result)) throw new RangeError(label + " is invalid");
    if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) throw new RangeError(label + " has an invalid clock time");
    // Date.parse normalizes impossible calendar dates such as February 30.
    const day = value.slice(0, 10), calendar = new Date(day + "T00:00:00Z");
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) throw new RangeError(label + " has an invalid calendar date");
    return result;
  }
  function drawTime(draw) {
    if (draw.at != null) return instant(draw.at, "draw.at");
    if (typeof draw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draw.date)) {
      // A date-only archive does not prove an intraday publication time.
      return instant(draw.date + "T23:59:59.999+08:00", "draw.date");
    }
    return instant(draw.date, "draw.date");
  }
  function validateTicket(gameId, ticket) {
    const game = gameFor(gameId);
    if (!ticket || typeof ticket !== "object") throw new TypeError("Ticket object required");
    const out = {};
    for (const name of ZONES) {
      const numbers = ticket[name];
      if (!Array.isArray(numbers) || numbers.length !== game[name + "Count"] || new Set(numbers).size !== numbers.length) throw new RangeError("Invalid " + name + " numbers");
      out[name] = numbers.map(n => integer(n, 1, game[name + "Max"], "Invalid " + name + " number")).sort((a, b) => a - b);
    }
    return out;
  }
  function validateDraw(gameId, draw) {
    const numbers = validateTicket(gameId, draw), at = drawTime(draw);
    let available = at;
    for (const field of [draw.availableAt, draw.publishedAt, draw.fetchedAt, draw.source && draw.source.fetchedAt]) {
      if (field != null) available = Math.max(available, instant(field, "Draw observation time"));
    }
    if (draw.issue != null && (typeof draw.issue !== "string" || !draw.issue.trim())) throw new RangeError("Draw issue must be a nonempty string");
    return { ...numbers, issue: draw.issue == null ? null : draw.issue, at: new Date(at).toISOString(), availableAt: new Date(available).toISOString() };
  }
  function validateHistory(gameId, history) {
    gameFor(gameId);
    if (!Array.isArray(history)) throw new TypeError("History array required");
    const rows = history.map(row => validateDraw(gameId, row)).sort((a, b) => a.at.localeCompare(b.at) || (a.issue || "").localeCompare(b.issue || ""));
    const issues = new Set(), dates = new Set();
    for (const row of rows) {
      if ((row.issue != null && issues.has(row.issue)) || dates.has(row.at)) throw new RangeError("Duplicate draw issue or draw time");
      if (row.issue != null) issues.add(row.issue);
      dates.add(row.at);
    }
    return rows;
  }
  function logAdd(a, b) {
    if (a === -Infinity) return b;
    if (b === -Infinity) return a;
    const m = Math.max(a, b);
    return m + Math.log1p(Math.exp(Math.min(a, b) - m));
  }
  function checkWeights(weights, k) {
    if (!Array.isArray(weights) || !weights.length || weights.some(w => !Number.isFinite(w) || w <= 0)) throw new RangeError("Strictly positive finite subset weights required");
    integer(k, 0, weights.length, "Invalid subset size");
  }
  // Suffix dynamic program in log space: E[i,r] = E[i+1,r] + w[i] E[i+1,r-1].
  // This is Fisher's product-weight distribution over unordered k-subsets;
  // sequential roulette without replacement has a different distribution.
  function subsetTable(weights, k) {
    checkWeights(weights, k);
    const dp = Array.from({ length: weights.length + 1 }, () => Array(k + 1).fill(-Infinity));
    dp[weights.length][0] = 0;
    for (let i = weights.length - 1; i >= 0; i--) {
      dp[i][0] = 0;
      for (let r = 1; r <= k; r++) dp[i][r] = logAdd(dp[i + 1][r], Math.log(weights[i]) + dp[i + 1][r - 1]);
    }
    return dp;
  }
  function elementarySymmetric(weights, k) {
    const result = Math.exp(subsetTable(weights, k)[0][k]);
    if (!Number.isFinite(result)) throw new RangeError("Elementary symmetric polynomial exceeds finite numeric range; use subsetLogProbability");
    return result;
  }
  function subsetLogProbability(weights, k, subset) {
    const table = subsetTable(weights, k);
    if (!Array.isArray(subset) || subset.length !== k || new Set(subset).size !== k) throw new RangeError("Invalid subset");
    return subset.reduce((sum, n) => sum + Math.log(weights[integer(n, 1, weights.length, "Invalid subset number") - 1]), 0) - table[0][k];
  }
  function sampleFromTable(weights, k, rng, table) {
    const selected = [];
    let needed = k;
    for (let i = 0; i < weights.length && needed > 0; i++) {
      const u = rng();
      if (!Number.isFinite(u) || u < 0 || u >= 1) throw new RangeError("Random source must produce finite values in [0, 1)");
      const inclusion = Math.exp(Math.log(weights[i]) + table[i + 1][needed - 1] - table[i][needed]);
      if (weights.length - i === needed || u < inclusion) { selected.push(i + 1); needed--; }
    }
    if (needed !== 0) throw new Error("Subset sampling failed");
    return selected;
  }
  function sampleSubset(weights, k, rng) {
    if (typeof rng !== "function") throw new TypeError("Random function required");
    return sampleFromTable(weights, k, rng, subsetTable(weights, k));
  }
  function marginalInclusions(weights, k, logNormalizer) {
    return weights.map((weight, i) => {
      const others = weights.slice(0, i).concat(weights.slice(i + 1));
      return Math.exp(Math.log(weight) + subsetTable(others, k - 1)[0][k - 1] - logNormalizer);
    });
  }
  function rngFor(seed) {
    let state = integer(seed, 0, 0xffffffff, "Seed must be an unsigned 32-bit integer") >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function weightsFor(id, rows, name, game) {
    const n = game[name + "Max"], k = game[name + "Count"], p = k / n;
    if (id === "uniform" || id === "coverage" || !rows.length) return Array(n).fill(1);
    const totals = Array(n).fill(0), exposures = Array(n).fill(0), prior = PARAMETERS.priorDraws;
    if (id === "omission_reversal") {
      const age = Array(n).fill(rows.length);
      for (let j = 0; j < rows.length; j++) for (const value of rows[j][name]) age[value - 1] = rows.length - 1 - j;
      const expectedAge = (1 - p) / p, priorAge = PARAMETERS.omissionPriorWaitingTimes * expectedAge;
      // This is a bounded-strength reversal hypothesis, not the gambler's fallacy asserted as fact.
      return age.map(a => Math.sqrt((a + priorAge + 1) / (expectedAge + priorAge + 1)));
    }
    if (id === "transition_shrink") {
      const previous = new Set(rows[rows.length - 1][name]);
      for (let j = 1; j < rows.length; j++) {
        const before = new Set(rows[j - 1][name]), after = new Set(rows[j][name]);
        for (let i = 0; i < n; i++) if (before.has(i + 1) === previous.has(i + 1)) {
          exposures[i]++; if (after.has(i + 1)) totals[i]++;
        }
      }
    } else {
      for (let j = 0; j < rows.length; j++) {
        const weight = id === "recency_shrink" ? 2 ** (-(rows.length - 1 - j) / PARAMETERS.halfLifeDraws) : 1;
        for (let i = 0; i < n; i++) exposures[i] += weight;
        for (const value of rows[j][name]) totals[value - 1] += weight;
      }
    }
    return totals.map((total, i) => {
      const posterior = (total + prior * p) / (exposures[i] + prior);
      return Math.exp(PARAMETERS.logOddsStrength * (Math.log(posterior / (1 - posterior)) - Math.log(p / (1 - p))));
    });
  }
  const hypotheses = {
    uniform: "Every legal complete combination is equally likely; no historical predictive signal is assumed.",
    frequency_shrink: "Tests persistence of historical number frequency, with fixed shrinkage toward the fair-draw prior.",
    recency_shrink: "Tests recent frequency persistence using fixed exponential decay and prior shrinkage.",
    omission_reversal: "Tests a fixed, shrunk waiting-time reversal hypothesis. Independent fair draws have no compensating memory.",
    transition_shrink: "Tests per-number dependence between successive supplied observations conditional on appearance in the last observed draw, shrunk toward independence; gaps do not establish a true one-draw lag.",
    mixture: "Fixed equal mixture of five complete-ticket probability models; weights are never selected from holdout performance.",
    coverage: "Uses the uniform predictive model and a finite greedy search for number/pair coverage in the ticket portfolio."
  };
  function fitPrepared(gameId, id, rows, asOf) {
    const game = gameFor(gameId);
    const model = { id, version: VERSION, gameId, asOf, trainingCount: rows.length,
      trainingCutoff: rows.length ? new Date(Math.max(...rows.map(row => Date.parse(row.availableAt)))).toISOString() : null,
      parameters: { ...PARAMETERS }, assumptions: [hypotheses[id],
        "Only draws whose draw and supplied observation timestamps strictly precede asOf are used. Date-only records become eligible after the end of that Beijing calendar day.",
        "Untimestamped historical archives establish retrospective availability assumptions only, not prospective publication evidence.",
        "Parameters are fixed research hypotheses, not measured or guaranteed winning advantages."] };
    if (id === "mixture") {
      model.components = COMPONENT_IDS.map(componentId => ({ weight: 1 / COMPONENT_IDS.length, model: fitPrepared(gameId, componentId, rows, asOf) }));
      model.assumptions.push("Main and special zones are independent conditional on a component; the joint mixture is computed on whole tickets, not on averaged zone weights.");
      model.probabilities = { interpretation: "Exact model marginal inclusion probabilities; each zone sums to its draw count." };
      for (const name of ZONES) model.probabilities[name] = Array.from({ length: game[name + "Max"] }, (_, i) => model.components.reduce((sum, c) => sum + c.weight * c.model.probabilities[name][i], 0));
    } else {
      model.zones = {};
      model.probabilities = { interpretation: "Exact model marginal inclusion probabilities; they are not independent Bernoulli probabilities and each zone sums to its draw count." };
      for (const name of ZONES) {
        const weights = weightsFor(id, rows, name, game), count = game[name + "Count"];
        const logNormalizer = subsetTable(weights, count)[0][count];
        model.zones[name] = { count, weights, logNormalizer };
        model.probabilities[name] = marginalInclusions(weights, count, logNormalizer);
      }
      model.assumptions.push("Main and special zones are modeled independently. Within each zone P(S)=product(weights in S)/e_k(weights), an exactly normalized fixed-size subset distribution.");
      if (id === "omission_reversal") model.assumptions.push("Numbers never seen inside the fixed history window have right-censored waiting times; the window length is used as a lower bound, not an observed complete waiting time.");
      if (!["uniform", "coverage", "omission_reversal"].includes(id)) model.assumptions.push("Smoothed empirical inclusion odds define fixed-strength distribution weights; the exact model marginals are recomputed from the subset normalizer, not equated with the smoothed observations.");
    }
    return model;
  }
  function fit({ gameId, modelId = "uniform", history = [], asOf } = {}) {
    const cutoff = instant(asOf, "asOf");
    if (!MODEL_IDS.includes(modelId)) throw new RangeError("Unknown number model");
    const rows = validateHistory(gameId, history).filter(row => Date.parse(row.availableAt) < cutoff).slice(-PARAMETERS.maximumHistory);
    return fitPrepared(gameId, modelId, rows, new Date(cutoff).toISOString());
  }
  function logProbability(model, ticket) {
    if (!model || model.version !== VERSION || !MODEL_IDS.includes(model.id)) throw new RangeError("Invalid or unsupported number model");
    const numbers = validateTicket(model.gameId, ticket), game = gameFor(model.gameId);
    if (model.id === "mixture") {
      if (!Array.isArray(model.components) || model.components.length !== COMPONENT_IDS.length) throw new RangeError("Invalid mixture components");
      let total = -Infinity, sum = 0;
      for (let i = 0; i < model.components.length; i++) {
        const c = model.components[i];
        if (!c || !Number.isFinite(c.weight) || c.weight <= 0 || c.model.id !== COMPONENT_IDS[i] || c.model.gameId !== model.gameId) throw new RangeError("Invalid mixture component");
        sum += c.weight; total = logAdd(total, Math.log(c.weight) + logProbability(c.model, numbers));
      }
      if (Math.abs(sum - 1) > 1e-12) throw new RangeError("Mixture weights must sum to one");
      return total;
    }
    let result = 0;
    for (const name of ZONES) {
      const zone = model.zones && model.zones[name];
      if (!zone || zone.count !== game[name + "Count"] || !Array.isArray(zone.weights) || zone.weights.length !== game[name + "Max"]) throw new RangeError("Invalid model zone");
      // Recompute from weights at the serialized-model boundary instead of trusting a supplied cached normalizer.
      result += subsetLogProbability(zone.weights, zone.count, numbers[name]);
    }
    return result;
  }
  function score(model, draw) {
    const lp = logProbability(model, draw), game = gameFor(model.gameId);
    const uniformLogLoss = ZONES.reduce((sum, name) => sum + subsetTable(Array(game[name + "Max"]).fill(1), game[name + "Count"])[0][game[name + "Count"]], 0);
    return { logProbability: lp, logLoss: -lp, uniformLogLoss, improvementVsUniform: uniformLogLoss + lp };
  }
  function samplerFor(model, random) {
    if (model.id === "mixture") {
      const samplers = model.components.map(c => samplerFor(c.model, random));
      return () => {
        const u = random(); let cumulative = 0;
        for (let i = 0; i < samplers.length; i++) { cumulative += model.components[i].weight; if (u < cumulative || i === samplers.length - 1) return samplers[i](); }
      };
    }
    const tables = {};
    for (const name of ZONES) tables[name] = subsetTable(model.zones[name].weights, model.zones[name].count);
    return () => {
      const ticket = {};
      for (const name of ZONES) ticket[name] = sampleFromTable(model.zones[name].weights, model.zones[name].count, random, tables[name]);
      return ticket;
    };
  }
  function ticketKey(ticket) { return ticket.main.join(",") + "+" + ticket.special.join(","); }
  function pairs(numbers) {
    const out = [];
    for (let i = 0; i < numbers.length; i++) for (let j = i + 1; j < numbers.length; j++) out.push(numbers[i] + "," + numbers[j]);
    return out;
  }
  function generate({ gameId, modelId = "uniform", history = [], asOf, count = 5, seed = 0 } = {}) {
    integer(count, 1, 100, "Ticket count must be from 1 through 100");
    const random = rngFor(seed), model = fit({ gameId, modelId, history, asOf }), sample = samplerFor(model, random), game = gameFor(gameId);
    const tickets = [], seen = new Set(), covered = { main: new Set(), mainPairs: new Set(), special: new Set(), specialPairs: new Set() };
    let candidatesExamined = 0;
    const maximumCandidates = count * (modelId === "coverage" ? PARAMETERS.coverageCandidates : 1) + 10000;
    function features(ticket) { return { main: ticket.main, mainPairs: pairs(ticket.main), special: ticket.special, specialPairs: pairs(ticket.special) }; }
    function marginalCoverage(ticket) {
      const f = features(ticket), denominators = { main: game.mainMax, mainPairs: game.mainMax * (game.mainMax - 1) / 2,
        special: game.specialMax, specialPairs: Math.max(1, game.specialMax * (game.specialMax - 1) / 2) };
      return Object.keys(f).reduce((sum, name) => sum + f[name].filter(value => !covered[name].has(value)).length / denominators[name], 0);
    }
    while (tickets.length < count && candidatesExamined < maximumCandidates) {
      let chosen = null, best = -Infinity;
      const batch = modelId === "coverage" ? PARAMETERS.coverageCandidates : 1;
      for (let j = 0; j < batch && candidatesExamined < maximumCandidates; j++) {
        const candidate = sample(); candidatesExamined++;
        if (seen.has(ticketKey(candidate))) continue;
        const gain = modelId === "coverage" ? marginalCoverage(candidate) : 0;
        if (gain > best) { chosen = candidate; best = gain; }
      }
      if (!chosen) continue;
      tickets.push(chosen); seen.add(ticketKey(chosen));
      const f = features(chosen);
      for (const name of Object.keys(f)) for (const value of f[name]) covered[name].add(value);
    }
    if (tickets.length !== count) throw new Error("Finite portfolio search exhausted before reaching the requested distinct ticket count");
    return { tickets, model, portfolio: { count, costYuan: count * 2, seed, duplicateCount: 0, candidatesExamined,
      selection: modelId === "coverage" ? "greedy-low-order-coverage" : "model-sampling-with-distinct-ticket-rejection",
      coverage: Object.fromEntries(Object.entries(covered).map(([name, values]) => [name, values.size])),
      objective: modelId === "coverage" ? "Greedily maximize the sum of newly covered fractions of main numbers, main pairs, special numbers and special pairs across 64 uniform candidates per step; not a global optimum guarantee." : "Sample complete tickets from the registered probability model and reject duplicate tickets within the budget.",
      assumptions: ["The output portfolio is a selection policy, not a set of independent probability samples after deduplication or coverage optimization.",
        "Under independent uniform draws, each legal fixed ticket has the same prize probabilities. Distinct tickets change coverage and return dependence, not expected gross return for a fixed additive prize table.",
        "Prize sharing, pool amounts, rule versions and actual per-issue payouts require separate settlement evidence; this model does not estimate other buyers' choices."] } };
  }
  return Object.freeze({ VERSION, MODEL_IDS, GAMES, PARAMETERS, validateTicket, validateDraw, validateHistory, fit, generate,
    logProbability, score, elementarySymmetric, subsetLogProbability, sampleSubset, rngFor });
});
