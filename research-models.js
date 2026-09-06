"use strict";

// Offline research only. A reconstructed forecast is never a prospective receipt.
const VERSION = "1.0.0";
const MODEL_IDS = Object.freeze(["uniform", "historical", "poisson", "elo", "market", "market-power", "ensemble"]);
const DAY = 86400000;
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const outcome = r => r.homeGoals > r.awayGoals ? 0 : r.homeGoals === r.awayGoals ? 1 : 2;
function time(s) { const t = Date.parse(s); if (!Number.isFinite(t)) throw new TypeError("Valid timestamp required"); return t; }
function normalize(xs) { const sum = xs.reduce((a, b) => a + b, 0); return xs.map(p => p / sum); }
function score(p, y) {
  if (!Array.isArray(p) || p.length !== 3 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1) || Math.abs(p.reduce((s, v) => s + v, 0) - 1) > 1e-10 || !Number.isInteger(y) || y < 0 || y > 2) throw new RangeError("Normalized three-outcome probabilities and valid outcome required");
  return { logLoss: -Math.log(p[y]), brier: p.reduce((s, v, i) => s + (v - Number(i === y)) ** 2, 0) };
}
function validateRecord(r, result = true) {
  if (!r || typeof r.eventId !== "string" || !r.eventId || typeof r.homeTeam !== "string" || !r.homeTeam || typeof r.awayTeam !== "string" || !r.awayTeam || r.homeTeam === r.awayTeam) throw new TypeError("Event id and distinct teams required");
  time(r.kickoffAt);
  if (r.resultRecordedAt !== undefined && time(r.resultRecordedAt) < time(r.kickoffAt)) throw new TypeError("Result cannot predate kickoff");
  if (result && (![r.homeGoals, r.awayGoals].every(g => Number.isInteger(g) && g >= 0 && g <= 100))) throw new TypeError("Observed nonnegative integer goals required");
}
function validateHistory(records) {
  if (!Array.isArray(records)) throw new TypeError("History must be an array");
  const seen = new Set(); let previous = -Infinity;
  for (const r of records) {
    validateRecord(r);
    if (seen.has(r.eventId)) throw new TypeError("Duplicate event id");
    seen.add(r.eventId);
    if (time(r.kickoffAt) < previous) throw new TypeError("History must be chronological");
    previous = time(r.kickoffAt);
  }
}
function availableAt(r) {
  if (r.resultRecordedAt) return time(r.resultRecordedAt);
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.kickoffAt) || ["day", "date"].includes(r.kickoffPrecision)) return time(r.kickoffAt.slice(0, 10)) + DAY - 1;
  return time(r.kickoffAt) + 3 * 3600000;
}
function pastFor(history, fixture) {
  const cutoff = time(fixture.kickoffAt);
  return history.filter(r => r.eventId !== fixture.eventId && time(r.kickoffAt) < cutoff && availableAt(r) < cutoff && (!["day", "date"].includes(r.kickoffPrecision) || r.kickoffAt.slice(0, 10) < fixture.kickoffAt.slice(0, 10)) && (r.competition || "") === (fixture.competition || ""));
}
function marketProbabilities(odds, method = "proportional") {
  if (!["proportional", "power"].includes(method)) throw new RangeError("Unknown de-vig method");
  const values = odds && [odds.home, odds.draw, odds.away];
  if (!values || values.some(v => !Number.isFinite(v) || v <= 1)) return null;
  const q = values.map(v => 1 / v);
  if (method === "proportional") return normalize(q);
  let low = 0, high = 1;
  while (q.reduce((s, v) => s + v ** high, 0) > 1) high *= 2;
  for (let i = 0; i < 80; i++) { const mid = (low + high) / 2; if (q.reduce((s, v) => s + v ** mid, 0) > 1) low = mid; else high = mid; }
  return normalize(q.map(v => v ** ((low + high) / 2)));
}
function marketFor(record, method = "proportional") {
  if (record.oddsCapturedAt && time(record.oddsCapturedAt) >= time(record.kickoffAt)) return null;
  return marketProbabilities(record.odds, method);
}
function baseRate(history) { const counts = [2, 2, 2]; history.forEach(r => counts[outcome(r)]++); return normalize(counts); }
function poissonMass(lambda) {
  const mass = [Math.exp(-lambda)]; let total = mass[0];
  for (let k = 1; k < 200 && 1 - total > 1e-14; k++) { mass.push(mass[k - 1] * lambda / k); total += mass[k]; }
  return normalize(mass);
}
function poisson(history, fixture, { shrinkage = 12, halfLifeDays = 365 } = {}) {
  if (!Number.isFinite(shrinkage) || shrinkage <= 0 || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) throw new RangeError("Positive model hyperparameters required");
  const cutoff = time(fixture.kickoffAt);
  const weighted = history.map(r => ({ r, w: 2 ** (-(cutoff - time(r.kickoffAt)) / DAY / halfLifeDays) }));
  // Gamma-like prior avoids zero scoring rates and shrinks new teams to the league.
  const weight = weighted.reduce((s, x) => s + x.w, 0);
  const hMean = (weighted.reduce((s, { r, w }) => s + w * r.homeGoals, 0) + 6 * 1.4) / (weight + 6);
  const aMean = (weighted.reduce((s, { r, w }) => s + w * r.awayGoals, 0) + 6 * 1.1) / (weight + 6);
  function strength(team, attack) {
    let goals = 0, exposure = 0;
    for (const { r, w } of weighted) {
      if (r.homeTeam === team) { goals += w * (attack ? r.homeGoals : r.awayGoals); exposure += w * (attack ? hMean : aMean); }
      if (r.awayTeam === team) { goals += w * (attack ? r.awayGoals : r.homeGoals); exposure += w * (attack ? aMean : hMean); }
    }
    return (goals + shrinkage) / (exposure + shrinkage);
  }
  const lh = Math.min(15, Math.max(0.05, hMean * strength(fixture.homeTeam, true) * strength(fixture.awayTeam, false)));
  const la = Math.min(15, Math.max(0.05, aMean * strength(fixture.awayTeam, true) * strength(fixture.homeTeam, false)));
  const h = poissonMass(lh), a = poissonMass(la), p = [0, 0, 0];
  h.forEach((ph, i) => a.forEach((pa, j) => { p[i > j ? 0 : i === j ? 1 : 2] += ph * pa; }));
  return normalize(p);
}
function elo(history, fixture) {
  const ratings = new Map(); let draws = 2, games = 8;
  const rating = team => ratings.get(team) || 0;
  function probabilities(home, away) {
    const d = Math.max(-8, Math.min(8, (rating(home) - rating(away) + 60) * Math.LN10 / 400));
    const drawRate = draws / games;
    const nu = 2 * drawRate / (1 - drawRate);
    return normalize([Math.exp(d / 2), nu, Math.exp(-d / 2)]);
  }
  // Aggregate equal-kickoff updates so input order within a batch has no effect.
  for (let i = 0; i < history.length;) {
    let j = i; const changes = new Map();
    while (j < history.length && time(history[j].kickoffAt) === time(history[i].kickoffAt)) {
      const r = history[j++], p = probabilities(r.homeTeam, r.awayTeam), y = outcome(r);
      const delta = 24 * ((y === 0 ? 1 : y === 1 ? 0.5 : 0) - (p[0] + 0.5 * p[1]));
      changes.set(r.homeTeam, (changes.get(r.homeTeam) || 0) + delta); changes.set(r.awayTeam, (changes.get(r.awayTeam) || 0) - delta);
    }
    for (const [team, delta] of changes) ratings.set(team, rating(team) + delta);
    for (let k = i; k < j; k++) { games++; draws += Number(outcome(history[k]) === 1); }
    i = j;
  }
  return probabilities(fixture.homeTeam, fixture.awayTeam);
}
const POISSON_GRID = Object.freeze([{ shrinkage: 12, halfLifeDays: 365 }, { shrinkage: 24, halfLifeDays: 365 }, { shrinkage: 12, halfLifeDays: 180 }]);
function cachedPrediction(cache, key, compute) { if (!cache) return compute(); if (!cache.has(key)) cache.set(key, compute()); return cache.get(key); }
function cachedPoisson(history, fixture, parameters, cache) { return cachedPrediction(cache, "p:" + fixture.eventId + ":" + JSON.stringify(parameters), () => poisson(history, fixture, parameters)); }
function cachedElo(history, fixture, cache) { return cachedPrediction(cache, "e:" + fixture.eventId, () => elo(history, fixture)); }
function tunePoisson(history, cache) {
  if (history.length < 40) return { parameters: POISSON_GRID[0], validationCount: 0 };
  const validation = history.slice(-20);
  const losses = POISSON_GRID.map(parameters => mean(validation.map(r => score(cachedPoisson(pastFor(history, r), r, parameters, cache), outcome(r)).logLoss)));
  return { parameters: POISSON_GRID[losses.indexOf(Math.min(...losses))], validationCount: validation.length };
}
function ensemble(history, fixture, parameters, cache) {
  const eloPrediction = cachedElo(history, fixture, cache);
  const local = normalize(cachedPoisson(history, fixture, parameters, cache).map((p, i) => (p + eloPrediction[i]) / 2));
  const market = marketFor(fixture);
  if (!market) return { probabilities: local, marketWeight: null, validationCount: 0 };
  const valid = history.filter(r => marketFor(r)).slice(-20);
  if (valid.length < 10) return { probabilities: market, marketWeight: 1, validationCount: valid.length };
  const cases = valid.map(r => {
    const prior = pastFor(history, r);
    // Fixed inner parameters: do not use the outer history's selected parameters.
    const p = cachedPoisson(prior, r, POISSON_GRID[0], cache), e = cachedElo(prior, r, cache);
    return { local: p.map((v, i) => (v + e[i]) / 2), market: marketFor(r), y: outcome(r) };
  });
  const weights = [1, 0.75, 0.5, 0.25, 0];
  const losses = weights.map(w => mean(cases.map(c => score(c.local.map((p, i) => (1 - w) * p + w * c.market[i]), c.y).logLoss)));
  const w = weights[losses.indexOf(Math.min(...losses))];
  return { probabilities: local.map((p, i) => (1 - w) * p + w * market[i]), marketWeight: w, validationCount: valid.length };
}
function predictInternal(modelId, history, fixture, options = {}, cache = null) {
  if (!MODEL_IDS.includes(modelId)) throw new RangeError("Unknown model");
  validateHistory(history); validateRecord(fixture, false);
  const past = pastFor(history, fixture);
  const assumptions = ["Competition-specific history only; results must be available strictly before kickoff.", "Missing result publication timestamp assumes kickoff + 3 hours (date-only: next day); retrospective research only."];
  let probabilities, tuning = null;
  if (modelId === "uniform") probabilities = [1 / 3, 1 / 3, 1 / 3];
  if (modelId === "historical") probabilities = baseRate(past);
  if (modelId === "elo") { probabilities = cachedElo(past, fixture, cache); assumptions.push("Davidson draw model, home advantage 60 Elo, K=24; fixed research assumptions."); }
  if (["market", "market-power"].includes(modelId)) probabilities = marketFor(fixture, modelId === "market-power" ? "power" : "proportional");
  if (["poisson", "ensemble"].includes(modelId)) {
    tuning = options.tune === false ? { parameters: POISSON_GRID[0], validationCount: 0 } : tunePoisson(past, cache);
    assumptions.push("Independent goal counts; empirical shrinkage attack/defence ratios; rates bounded [0.05,15]; no injury or lineup covariates.");
    if (modelId === "poisson") probabilities = cachedPoisson(past, fixture, tuning.parameters, cache);
    else { const combined = ensemble(past, fixture, tuning.parameters, cache); probabilities = combined.probabilities; tuning = { ...tuning, ensemble: combined }; }
  }
  const provenOddsTiming = fixture.oddsCapturedAt && time(fixture.oddsCapturedAt) < time(fixture.kickoffAt);
  if (fixture.odds && !provenOddsTiming) assumptions.push("Odds have no proven pre-kickoff capture timestamp; retrospective only.");
  return { modelId, version: VERSION, probabilities, trainingCutoff: past.length ? new Date(Math.max(...past.map(availableAt))).toISOString() : null, trainingCount: past.length, assumptions, tuning, evidenceClass: "retrospective", status: probabilities ? "available" : "missing_complete_market" };
}
function predict(modelId, history, fixture, options = {}) { return predictInternal(modelId, history, fixture, options); }

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function pairedBlockInterval(differences, { comparisons = 1, alpha = 0.05, samples = 4000, seed = 91027, blockLength } = {}) {
  if (!Array.isArray(differences) || differences.some(v => !Number.isFinite(v))) throw new TypeError("Finite paired differences required");
  if (!Number.isInteger(comparisons) || comparisons < 1 || !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1 || !Number.isInteger(samples) || samples < 200) throw new RangeError("Invalid inference settings");
  const n = differences.length, block = blockLength === undefined ? Math.max(1, Math.ceil(Math.cbrt(n))) : blockLength;
  if (!Number.isInteger(block) || block < 1 || (n && block > n)) throw new RangeError("Invalid block length");
  const meta = { meanDifference: mean(differences), periods: n, confidenceLevel: 1 - alpha / comparisons, familywiseAlpha: alpha, comparisons, method: "paired daily circular moving-block percentile bootstrap with Bonferroni adjustment", samples, seed, blockLength: block };
  if (n < 30) return { ...meta, interval: null, status: "insufficient_blocks" };
  const random = rng(seed), values = [];
  for (let b = 0; b < samples; b++) {
    let total = 0;
    for (let i = 0; i < n;) { const start = Math.floor(random() * n); for (let k = 0; k < block && i < n; k++, i++) total += differences[(start + k) % n]; }
    values.push(total / n);
  }
  values.sort((a, b) => a - b);
  const tail = alpha / (2 * comparisons);
  const expectedTailReplicates = samples * tail;
  const resolutionSufficient = expectedTailReplicates >= 10;
  return { ...meta, interval: [values[Math.floor((samples - 1) * tail)], values[Math.ceil((samples - 1) * (1 - tail))]], expectedTailReplicates, resolutionSufficient, minimumSamplesForTailResolution: Math.ceil(10 / tail), status: resolutionSufficient ? "exploratory" : "insufficient_bootstrap_resolution", limitation: resolutionSufficient ? "Exploratory approximation, not prospective confirmation." : "Too few bootstrap draws in the Bonferroni-adjusted tails. Displayed bounds are rough exploration; they cannot authorize a positive advantage conclusion. Increase samples before formal inference." };
}
const PAPER_RULE_ID = "fixed-decimal-1x2-paper-v1";
const DECISION_POLICIES = Object.freeze(["argmax", "ev-threshold"]);
function decisionFor(p, odds, { policy = "argmax", evThreshold = 1.05 } = {}) {
  score(p, 0);
  if (!DECISION_POLICIES.includes(policy) || !Number.isFinite(evThreshold) || evThreshold < 1) throw new RangeError("Valid fixed decision policy and EV threshold >= 1 required");
  if (!marketProbabilities(odds)) return null;
  const prices = [odds.home, odds.draw, odds.away];
  const values = policy === "argmax" ? p : p.map((v, i) => v * prices[i]);
  const maximum = Math.max(...values);
  const noBet = policy === "ev-threshold" && maximum <= evThreshold;
  const picks = noBet ? [] : values.map((v, i) => Math.abs(v - maximum) < 1e-12 ? i : -1).filter(i => i >= 0);
  return { policy, evThreshold: policy === "ev-threshold" ? evThreshold : null, stake: noBet ? 0 : 1, picks, noBet, maxExpectedGross: Math.max(...p.map((v, i) => v * prices[i])), tieBreaking: "uniform random among maxima, analytically averaged in retrospective evaluation" };
}
function fixedOddsReturn(record, p, options = {}, policy = "argmax") {
  const verification = record.ruleVerification;
  const rule = record.settlementRule || (verification && verification.market === "1X2_REGULATION" ? { ...verification, id: verification.ruleId } : null);
  const verified = Boolean(rule && ["fixed-decimal-1x2", "fixed-decimal-1x2-v1"].includes(rule.id) && rule.verified === true && /^https:\/\//.test(rule.sourceUrl || "") && rule.verifiedAt && Number.isFinite(Date.parse(rule.verifiedAt)));
  const paper = options.paperRuleAssumption === PAPER_RULE_ID;
  if ((!verified && !paper) || !marketFor(record)) return null;
  const odds = [record.odds.home, record.odds.draw, record.odds.away];
  const decision = decisionFor(p, record.odds, { policy, evThreshold: options.evThreshold === undefined ? 1.05 : options.evThreshold });
  const marketDecision = decisionFor(marketFor(record), record.odds);
  const y = outcome(record);
  const settled = action => action.stake ? (action.picks.includes(y) ? odds[y] / action.picks.length : 0) - 1 : 0;
  return { ...decision, net: settled(decision), uniformExpectedNet: decision.stake * (odds[y] / 3 - 1), fullBudgetUniformExpectedNet: odds[y] / 3 - 1, marketNetOnSameExposure: decision.stake * settled(marketDecision), exposureBudget: 1, evidence: verified ? "verified_rule_hypothetical" : "paper_assumption", paperRuleAssumption: verified ? null : PAPER_RULE_ID, officialRuleVerified: verified, assumption: "Retrospective paper singles: quoted decimal odds return includes stake; unit cap; cash returns zero; random ties analytically averaged. No actual execution, fees, tax, commission, rebate, odds movement, voids or stake restrictions modeled. This mathematical contract is not an official payout-rule verification." };
}
function walkForward(records, options = {}) {
  validateHistory(records);
  const modelIds = options.modelIds || MODEL_IDS;
  if (!Array.isArray(modelIds) || !modelIds.length || new Set(modelIds).size !== modelIds.length || modelIds.some(m => !MODEL_IDS.includes(m))) throw new RangeError("Unique supported models required");
  const minTraining = options.minTraining === undefined ? 30 : options.minTraining;
  if (!Number.isInteger(minTraining) || minTraining < 0) throw new RangeError("Invalid training threshold");
  const maxEvaluationEvents = options.maxEvaluationEvents === undefined ? 300 : options.maxEvaluationEvents;
  if (!Number.isInteger(maxEvaluationEvents) || maxEvaluationEvents < 1) throw new RangeError("Invalid evaluation limit");
  if (options.paperRuleAssumption !== undefined && options.paperRuleAssumption !== null && options.paperRuleAssumption !== PAPER_RULE_ID) throw new RangeError("Unknown paper settlement assumption");
  if (options.evThreshold !== undefined && (!Number.isFinite(options.evThreshold) || options.evThreshold < 1)) throw new RangeError("Invalid EV threshold");
  const points = [], cache = new Map();
  for (const record of records.slice(-maxEvaluationEvents)) {
    const history = pastFor(records, record);
    if (history.length < minTraining) continue;
    const predictions = {};
    for (const modelId of modelIds) {
      const prediction = predictInternal(modelId, history, record, options, cache);
      const returnsByPolicy = Object.fromEntries(DECISION_POLICIES.map(policy => [policy, prediction.probabilities ? fixedOddsReturn(record, prediction.probabilities, options, policy) : null]));
      predictions[modelId] = { ...prediction, scores: prediction.probabilities ? score(prediction.probabilities, outcome(record)) : null, hypotheticalReturn: returnsByPolicy.argmax, returnsByPolicy };
    }
    points.push({ eventId: record.eventId, kickoffAt: record.kickoffAt, outcome: outcome(record), predictions });
  }
  const comparisons = [];
  const pairs = modelIds.flatMap(candidate => ["uniform", "historical", "market"].filter(baseline => baseline !== candidate && modelIds.includes(baseline)).map(baseline => [candidate, baseline]));
  // Count the complete planned family, including pairs whose market data are missing.
  const familyMultiplier = options.familyMultiplier === undefined ? 1 : options.familyMultiplier;
  if (!Number.isInteger(familyMultiplier) || familyMultiplier < 1) throw new RangeError("Invalid source-family multiplier");
  const familySize = Math.max(1, pairs.length * 2 + modelIds.length * DECISION_POLICIES.length * 4) * familyMultiplier;
  function intervalByDay(rows) {
    const days = new Map();
    for (const { date, difference } of rows) { const day = date.slice(0, 10); if (!days.has(day)) days.set(day, []); days.get(day).push(difference); }
    return pairedBlockInterval([...days.values()].map(mean), { comparisons: familySize, samples: options.bootstrapSamples || 4000, seed: options.seed === undefined ? 91027 : options.seed });
  }
  for (const [candidate, baseline] of pairs) {
    const paired = points.filter(p => p.predictions[candidate].scores && p.predictions[baseline].scores);
    for (const metric of ["logLoss", "brier"]) {
      const uncertainty = intervalByDay(paired.map(p => ({ date: p.kickoffAt, difference: p.predictions[baseline].scores[metric] - p.predictions[candidate].scores[metric] })));
      comparisons.push({ candidate, baseline, metric, matchedEvents: paired.length, positiveMeans: "candidate improves proper score", uncertainty, exploratoryPositive: paired.length >= 300 && uncertainty.periods >= 60 && uncertainty.resolutionSufficient === true && uncertainty.interval !== null && uncertainty.interval[0] > 0 });
    }
  }
  const returns = modelIds.flatMap(modelId => DECISION_POLICIES.map(decisionPolicy => {
    const paired = points.filter(p => p.predictions[modelId].returnsByPolicy[decisionPolicy]);
    const observation = point => point.predictions[modelId].returnsByPolicy[decisionPolicy];
    const sum = field => paired.reduce((s, p) => s + observation(p)[field], 0);
    const interval = difference => intervalByDay(paired.map(p => ({ date: p.kickoffAt, difference: difference(observation(p)) })));
    const actualStake = sum("stake"), totalNet = sum("net"), evidence = [...new Set(paired.map(p => observation(p).evidence))];
    return { modelId, decisionPolicy, evThreshold: decisionPolicy === "ev-threshold" ? options.evThreshold === undefined ? 1.05 : options.evThreshold : null, matchedEvents: paired.length, missingReturnEvents: points.length - paired.length, noBetCount: paired.length - actualStake, actualStake, exposureBudget: paired.length, strategyStake: actualStake, randomBaselineStake: actualStake, totalNet, netPerStakedUnit: actualStake ? totalNet / actualStake : null, netPerExposureUnit: paired.length ? totalNet / paired.length : null, baselineExpectedNet: sum("uniformExpectedNet"), uncertainty: interval(r => r.net - r.uniformExpectedNet), fullBudgetRandomBaseline: { stake: paired.length, expectedNet: sum("fullBudgetUniformExpectedNet"), uncertainty: interval(r => r.net - r.fullBudgetUniformExpectedNet) }, returnAgainstMarket: { baseline: "proportional-market argmax on exactly candidate betting events", stake: actualStake, net: sum("marketNetOnSameExposure"), uncertainty: interval(r => r.net - r.marketNetOnSameExposure) }, netAgainstCash: interval(r => r.net), evidence, paperRuleAssumption: evidence.includes("paper_assumption") ? PAPER_RULE_ID : null, interpretation: "Proper scores measure probability quality separately. Return comparison 1 uses uniform random on the candidate's exact betting events and equal actual stake. Comparison 2 reserves one unit on every eligible quoted event, with the candidate holding unused units as zero-return cash. Market return comparator uses the candidate's exact exposure. These are retrospective hypothetical monetary outcomes, not actual transactions or proof of profit." };
  }));
  return { version: VERSION, status: "PENDING_PROSPECTIVE_CONFIRMATION", evidenceClass: "retrospective", predictiveAdvantageEstablished: false, records: records.length, evaluatedEvents: points.length, minTraining, maxEvaluationEvents, modelIds: [...modelIds], decisionPolicies: DECISION_POLICIES, paperRuleAssumption: options.paperRuleAssumption || null, plannedFamilySize: familySize, thresholds: { minMatchedEvents: 300, minDays: 60, familywiseAlpha: 0.05, prospectiveRequired: true, preregistrationRequired: true }, limitations: ["Reconstructed historical forecasts are not preregistered prospective forecasts; no outcome establishes prospective superiority.", "Bootstrap intervals are exploratory finite-sample approximations; daily averaging targets equal-day performance and reduces same-day pseudo-replication.", "Unknown result timestamps use a three-hour completion assumption (date-only: next day), not a proven publication time.", "Returns require verified fixed-decimal rules OR explicit paper settlement assumptions labeled as unverified mathematics; lottery floating payouts are excluded. No execution, fees, tax, commission, rebate, odds movement or voids modeled."], comparisons, returns, points };
}
module.exports = { VERSION, MODEL_IDS, PAPER_RULE_ID, DECISION_POLICIES, decisionFor, predict, walkForward, marketProbabilities, pairedBlockInterval, score, validateHistory };
