(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NumberCrowdModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // This model estimates the number of other first-prize winners conditional on
  // a ticket. It does not alter the fair draw probability of a ticket.
  const VERSION = "1.0.0";
  const GAMES = Object.freeze({
    ssq: Object.freeze({ mainMax: 33, mainCount: 6, specialMax: 16, specialCount: 1, baseCostYuan: 2 }),
    dlt: Object.freeze({ mainMax: 35, mainCount: 5, specialMax: 12, specialCount: 2, baseCostYuan: 2 })
  });
  const DEFAULTS = Object.freeze({ l2: 2, maxIterations: 100, tolerance: 1e-8, candidateMultiplier: 64 });

  function gameFor(gameId) {
    if (!Object.hasOwn(GAMES, gameId)) throw new RangeError("Unknown number lottery game");
    return GAMES[gameId];
  }
  function finiteNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(label + " must be finite");
    return value;
  }
  function positiveNumber(value, label) {
    finiteNumber(value, label);
    if (value <= 0) throw new RangeError(label + " must be positive");
    return value;
  }
  function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(label);
    return value;
  }
  function timestamp(value, label) {
    if (value instanceof Date) value = value.toISOString();
    if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) throw new RangeError(label + " must be a valid timestamp");
    const day = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (day) {
      const calendar = new Date(day[1] + "T00:00:00Z");
      if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day[1]) throw new RangeError(label + " has an invalid calendar date");
    }
    return Date.parse(value);
  }
  function drawTime(row) {
    const value = row.drawAt || row.at || (typeof row.date === "string" ? row.date + "T23:59:59.999+08:00" : row.date);
    return timestamp(value, "draw time");
  }
  function observedTime(row) {
    let time = drawTime(row);
    for (const value of [row.availableAt, row.publishedAt, row.fetchedAt, row.source && row.source.fetchedAt]) {
      if (value != null) time = Math.max(time, timestamp(value, "observation time"));
    }
    return time;
  }
  function validateTicket(gameId, ticket) {
    const game = gameFor(gameId);
    if (!ticket || typeof ticket !== "object") throw new TypeError("Ticket object required");
    const out = {};
    for (const zone of ["main", "special"]) {
      const values = ticket[zone];
      const max = game[zone + "Max"], count = game[zone + "Count"];
      if (!Array.isArray(values) || values.length !== count || new Set(values).size !== count) throw new RangeError("Invalid " + zone + " numbers");
      out[zone] = values.map(value => integer(value, 1, max, "Invalid " + zone + " number")).sort((a, b) => a - b);
    }
    return out;
  }
  function targetOf(row) {
    if (row && row.target != null) return row.target;
    if (row.coWinners != null) {
      if (!Number.isInteger(row.coWinners) || row.coWinners < 0) throw new RangeError("coWinners must be a nonnegative integer");
      return row.coWinners;
    }
    const base = row.winners && row.winners.base && row.winners.base["1"];
    const additional = row.winners && row.winners.additional && row.winners.additional["1"];
    if (base == null && additional == null) return null;
    const values = [base, additional].filter(value => value != null);
    if (values.some(value => !Number.isInteger(value) || value < 0)) throw new RangeError("first-prize winner counts must be nonnegative integers");
    // DLT publishes base and additional first-prize counts separately. Both
    // represent tickets sharing the same head combination, so count both.
    return values.reduce((sum, value) => sum + value, 0);
  }
  function salesOf(row) {
    if (row.salesYuan == null) return null;
    return positiveNumber(row.salesYuan, "salesYuan");
  }
  function normaliseRows(gameId, history, asOf, options) {
    gameFor(gameId);
    if (!Array.isArray(history)) throw new TypeError("history must be an array");
    const cutoff = asOf == null ? Infinity : timestamp(asOf, "asOf");
    const rows = history.map((row, index) => {
      if (!row || typeof row !== "object") throw new TypeError("history row " + index + " must be an object");
      const ticket = validateTicket(gameId, row);
      const drawAt = drawTime(row), availableAt = observedTime(row);
      const issue = row.issue == null ? null : String(row.issue);
      const target = targetOf(row), salesYuan = salesOf(row);
      return { row, ticket, issue, target, salesYuan, drawAt, availableAt };
    }).filter(item => item.availableAt < cutoff && item.target != null);
    rows.sort((a, b) => a.drawAt - b.drawAt || String(a.issue || "").localeCompare(String(b.issue || "")));
    if (options && options.requireTargets && rows.length !== history.length) throw new RangeError("Every row needs a valid first-prize winner count");
    return rows;
  }
  function pairCount(values, predicate) {
    let count = 0;
    for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) if (predicate(values[i], values[j])) count++;
    return count;
  }
  function featureObject(gameId, ticket) {
    const game = gameFor(gameId), t = validateTicket(gameId, ticket), result = {};
    for (const zone of ["main", "special"]) {
      const values = t[zone], max = game[zone + "Max"];
      for (let number = 1; number <= max; number++) result[zone + "Number_" + number] = values.includes(number) ? 1 : 0;
      result[zone + "BirthdayCount"] = values.filter(number => number <= 31).length;
      result[zone + "ConsecutivePairs"] = pairCount(values, (a, b) => b - a === 1);
      result[zone + "SameEndingPairs"] = pairCount(values, (a, b) => a % 10 === b % 10);
      result[zone + "OddCount"] = values.filter(number => number % 2 === 1).length;
      result[zone + "LowCount"] = values.filter(number => number <= Math.floor(max / 2)).length;
      result[zone + "Sum"] = values.reduce((sum, number) => sum + number, 0);
    }
    return result;
  }
  function featureNames(gameId) {
    return Object.keys(featureObject(gameId, { main: Array.from({ length: gameFor(gameId).mainCount }, (_, i) => i + 1), special: Array.from({ length: gameFor(gameId).specialCount }, (_, i) => i + 1) }));
  }
  function meanAndScale(rows, names) {
    const mean = Object.create(null), scale = Object.create(null);
    for (const name of names) {
      mean[name] = rows.reduce((sum, row) => sum + row.features[name], 0) / (rows.length || 1);
      const variance = rows.reduce((sum, row) => sum + (row.features[name] - mean[name]) ** 2, 0) / (rows.length || 1);
      scale[name] = Math.sqrt(variance) || 1;
    }
    return { mean, scale };
  }
  function logOffset(salesYuan, medianSales) {
    return salesYuan == null ? 0 : Math.log(salesYuan / medianSales);
  }
  function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
  }
  function poissonNll(y, lambda) {
    return lambda - y * Math.log(lambda) + logGamma(y + 1);
  }
  function logGamma(z) {
    // Lanczos approximation, sufficient for nonnegative integer winner counts.
    const coefficients = [0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let x = coefficients[0];
    for (let i = 1; i < coefficients.length; i++) x += coefficients[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  function solveLinear(matrix, vector) {
    const n = vector.length, a = matrix.map((row, i) => row.slice().concat(vector[i]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      if (Math.abs(a[pivot][col]) < 1e-12) return null;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      for (let row = col + 1; row < n; row++) {
        const factor = a[row][col] / a[col][col];
        for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
      }
    }
    const result = Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let value = a[row][n];
      for (let col = row + 1; col < n; col++) value -= a[row][col] * result[col];
      result[row] = value / a[row][row];
    }
    return result;
  }
  function fitPoisson(rows, names, offsets, l2, options) {
    const n = rows.length, p = names.length, dimension = p + 1;
    const beta = Array(dimension).fill(0);
    const meanTarget = n ? rows.reduce((sum, row) => sum + row.target, 0) / n : 1;
    beta[0] = Math.log(Math.max(meanTarget, 1e-6));
    let objective = Infinity, converged = n === 0, iterations = 0;
    const etaAt = (row, offset, candidate) => {
      let eta = candidate[0] + offset;
      for (let j = 0; j < p; j++) eta += row.vector[j] * candidate[j + 1];
      return Math.max(-30, Math.min(30, eta));
    };
    const objectiveAt = candidate => rows.reduce((sum, row, i) => sum + poissonNll(row.target, Math.exp(etaAt(row, offsets[i], candidate))), 0) + l2 * candidate.slice(1).reduce((sum, value) => sum + value * value, 0) / 2;
    objective = n ? objectiveAt(beta) : 0;
    for (iterations = 1; iterations <= (options.maxIterations || DEFAULTS.maxIterations) && !converged; iterations++) {
      const gradient = Array(dimension).fill(0), hessian = Array.from({ length: dimension }, () => Array(dimension).fill(0));
      for (let i = 0; i < n; i++) {
        const row = rows[i], lambda = Math.exp(etaAt(row, offsets[i], beta)), residual = lambda - row.target;
        gradient[0] += residual;
        hessian[0][0] += lambda;
        for (let j = 0; j < p; j++) {
          const x = row.vector[j];
          gradient[j + 1] += residual * x;
          hessian[0][j + 1] += lambda * x;
          hessian[j + 1][0] += lambda * x;
          for (let k = 0; k <= j; k++) {
            const value = lambda * x * row.vector[k];
            hessian[j + 1][k + 1] += value;
            if (k !== j) hessian[k + 1][j + 1] += value;
          }
        }
      }
      for (let j = 1; j < dimension; j++) { gradient[j] += l2 * beta[j]; hessian[j][j] += l2; }
      const gradNorm = Math.max(...gradient.map(Math.abs));
      if (gradNorm < (options.tolerance || DEFAULTS.tolerance)) { converged = true; break; }
      const direction = solveLinear(hessian, gradient.map(value => -value));
      if (!direction || direction.some(value => !Number.isFinite(value))) break;
      let step = 1, candidate = beta.map((value, i) => value + direction[i]), next = objectiveAt(candidate);
      while (!(next < objective) && step > 1 / 1024) { step /= 2; candidate = beta.map((value, i) => value + step * direction[i]); next = objectiveAt(candidate); }
      if (!(next < objective)) break;
      for (let i = 0; i < dimension; i++) beta[i] = candidate[i];
      if (Math.abs(objective - next) <= (options.tolerance || DEFAULTS.tolerance) * (1 + objective)) converged = true;
      objective = next;
    }
    const maxAbsBeta = Math.max(...beta.slice(1).map(Math.abs), 0);
    return { beta, objective, iterations: Math.min(iterations, options.maxIterations || DEFAULTS.maxIterations), converged, nonConvergence: !converged, maxAbsBeta };
  }
  function fit(options) {
    options = options || {};
    const gameId = options.gameId || "ssq", useFeatures = options.features !== false, names = useFeatures ? featureNames(gameId) : [], l2 = options.l2 == null ? DEFAULTS.l2 : finiteNumber(options.l2, "l2");
    if (l2 < 0) throw new RangeError("l2 must be nonnegative");
    const rows = normaliseRows(gameId, options.history || [], options.asOf, { requireTargets: false });
    const salesMedian = median(rows.map(row => row.salesYuan).filter(value => value != null));
    const prepared = rows.map(row => ({ ...row, features: useFeatures ? featureObject(gameId, row.ticket) : {} }));
    const stats = meanAndScale(prepared, names);
    const vectors = prepared.map(row => names.map(name => (row.features[name] - stats.mean[name]) / stats.scale[name]));
    const modelRows = prepared.map((row, i) => ({ ...row, vector: vectors[i] }));
    const offsets = modelRows.map(row => logOffset(row.salesYuan, salesMedian));
    const fitted = fitPoisson(modelRows, names, offsets, l2, options);
    const parameterCount = names.length + 1;
    const overfitReasons = [];
    if (modelRows.length && modelRows.length < parameterCount * 4) overfitReasons.push("training rows are fewer than four times the parameter count");
    if (fitted.maxAbsBeta > 8) overfitReasons.push("large regularized coefficient magnitude");
    const model = {
      version: VERSION, gameId, modelType: useFeatures ? "regularized-poisson-conditional-sharing-proxy" : "sales-only-poisson-baseline", featureNames: names,
      featureMean: stats.mean, featureScale: stats.scale, beta: fitted.beta, l2, salesMedianYuan: salesMedian,
      salesOffset: { type: "log_ratio", coefficient: 1, denominator: "training median salesYuan", unknownUnitsAbsorbedByIntercept: true },
      trainingCount: modelRows.length, trainingCutoff: modelRows.length ? new Date(modelRows.at(-1).drawAt).toISOString() : null,
      trainingIssues: modelRows.map(row => row.issue).filter(Boolean), parameters: parameterCount,
      diagnostics: { converged: fitted.converged, nonConvergence: fitted.nonConvergence, iterations: fitted.iterations, objective: fitted.objective, maxAbsBeta: fitted.maxAbsBeta, overfitFlag: overfitReasons.length > 0, overfitReasons },
      assumptions: ["first-prize winner count is a conditional crowd-intensity target", "salesYuan enters as log(sales / training median) with fixed coefficient one", "sales includes additional-play sales and is not an exact ticket count; the intercept absorbs the unknown unit conversion", useFeatures ? "number and structure weights are estimated from winner counts and regularized" : "no ticket features are used; this is the sales-only comparison baseline", "the sharing result is a Poisson proxy and is not actual lottery EV", "fair head-prize probability remains uniform for every legal ticket"]
    };
    return model;
  }
  function predict(model, ticket, options) {
    if (!model || model.version !== VERSION || !Array.isArray(model.featureNames) || !Array.isArray(model.beta)) throw new TypeError("A fitted crowd model is required");
    const t = validateTicket(model.gameId, ticket), raw = featureObject(model.gameId, t), salesYuan = options && options.salesYuan != null ? positiveNumber(options.salesYuan, "salesYuan") : model.salesMedianYuan;
    let eta = model.beta[0] + logOffset(salesYuan, model.salesMedianYuan || 1);
    for (let i = 0; i < model.featureNames.length; i++) eta += ((raw[model.featureNames[i]] - model.featureMean[model.featureNames[i]]) / (model.featureScale[model.featureNames[i]] || 1)) * model.beta[i + 1];
    const lambda = Math.exp(Math.max(-30, Math.min(30, eta)));
    return { lambda, predictedCoWinners: lambda, expectedShare: expectedSharing(lambda), selectionDensity: expectedSharing(lambda), salesYuanUsed: salesYuan, featureValues: raw, interpretation: "conditional-sharing-proxy; not a number-generation probability" };
  }
  function expectedSharing(lambda) {
    finiteNumber(lambda, "lambda");
    if (lambda < 0) throw new RangeError("lambda must be nonnegative");
    return lambda < 1e-8 ? 1 - lambda / 2 + lambda * lambda / 6 : -Math.expm1(-lambda) / lambda;
  }
  function combinations(n, k) {
    let result = 1;
    for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
    return result;
  }
  function headProbabilityUniform(gameId) {
    const game = gameFor(gameId);
    return 1 / (combinations(game.mainMax, game.mainCount) * combinations(game.specialMax, game.specialCount));
  }
  function rngFor(seed) {
    integer(seed, 0, 0xffffffff, "Seed must be an unsigned 32-bit integer");
    let state = seed >>> 0;
    return () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function sampleZone(max, count, random) {
    const set = new Set();
    while (set.size < count) set.add(1 + Math.floor(random() * max));
    return Array.from(set).sort((a, b) => a - b);
  }
  function key(ticket) { return ticket.main.join(",") + "|" + ticket.special.join(","); }
  function createPortfolio(options) {
    options = options || {};
    const model = options.model || fit(options), game = gameFor(model.gameId), count = integer(options.count == null ? 5 : options.count, 1, 1000, "count");
    const budget = options.budgetYuan == null ? count * game.baseCostYuan : positiveNumber(options.budgetYuan, "budgetYuan");
    if (budget < count * game.baseCostYuan) throw new RangeError("budgetYuan cannot pay for requested count");
    let candidates = options.candidates;
    if (candidates != null && !Array.isArray(candidates)) throw new TypeError("candidates must be an array");
    if (!candidates) {
      const candidateCount = Math.max(count * (options.candidateMultiplier || DEFAULTS.candidateMultiplier), count);
      const random = rngFor(options.seed == null ? 0 : options.seed), seen = new Set(); candidates = [];
      while (candidates.length < candidateCount) { const ticket = { main: sampleZone(game.mainMax, game.mainCount, random), special: sampleZone(game.specialMax, game.specialCount, random) }; if (!seen.has(key(ticket))) { seen.add(key(ticket)); candidates.push(ticket); } }
    }
    const uniqueCandidates = [], candidateKeys = new Set();
    for (const candidate of candidates) { const ticket = validateTicket(model.gameId, candidate), ticketKey = key(ticket); if (!candidateKeys.has(ticketKey)) { candidateKeys.add(ticketKey); uniqueCandidates.push(ticket); } }
    const scored = uniqueCandidates.map(ticket => { const score = predict(model, ticket, { salesYuan: options.salesYuan }); return { ticket, predictedCoWinners: score.lambda, expectedShare: score.expectedShare, selectionDensity: score.expectedShare, headprobuniform: headProbabilityUniform(model.gameId) }; });
    scored.sort((a, b) => a.predictedCoWinners - b.predictedCoWinners || key(a.ticket).localeCompare(key(b.ticket)));
    if (scored.length < count) throw new RangeError("candidate set is smaller than count");
    const tickets = scored.slice(0, count);
    return { version: VERSION, gameId: model.gameId, model, tickets, candidatesExamined: scored.length, portfolio: { count, costYuan: count * game.baseCostYuan, budgetYuan: budget, objective: "rank finite candidates by predicted conditional co-winner intensity", assumptions: ["headprobuniform is the fair legal-ticket head-prize probability", "selectionDensity is a ranking/share proxy, not a number-generation probability", "expectedShare = E[1/(1+N)] for N~Poisson(lambda); this is not actual DLT/SSQ prize-pool EV", "no claim of reliable return advantage is made without prospective out-of-sample evidence"] } };
  }
  function scoreRow(model, row) {
    const prediction = predict(model, row.ticket || row, { salesYuan: model.salesMedianYuan });
    const y = targetOf(row), lambda = prediction.lambda;
    return { y, lambda, logscore: poissonNll(y, lambda), deviance: 2 * (y === 0 ? lambda : y * Math.log(y / lambda) - (y - lambda)) };
  }
  function aggregate(scores) {
    const n = scores.length || 1;
    const totalLogscore = scores.reduce((sum, row) => sum + row.logscore, 0), totalDeviance = scores.reduce((sum, row) => sum + row.deviance, 0);
    return { count: scores.length, meanLogscore: totalLogscore / n, meanLogScore: totalLogscore / n, meanDeviance: totalDeviance / n, totalLogscore, totalLogScore: totalLogscore, totalDeviance };
  }
  function evaluate(options) {
    options = options || {};
    const gameId = options.gameId || "ssq", all = normaliseRows(gameId, options.draws || options.history || [], null, { requireTargets: true });
    const holdoutCount = integer(options.holdout == null ? 120 : options.holdout, 1, 10000, "holdout"), trainMinimum = integer(options.trainMinimum == null ? 200 : options.trainMinimum, 1, 10000, "trainMinimum");
    if (all.length < trainMinimum + holdoutCount) throw new RangeError("evaluation requires at least trainMinimum + holdout rows");
    const holdout = all.slice(-holdoutCount), start = all.length - holdoutCount;
    if (start < trainMinimum) throw new RangeError("evaluation training history is shorter than trainMinimum");
    const modelScores = [], baselineScores = [], fits = [];
    for (let i = 0; i < holdout.length; i++) {
      const train = all.slice(0, start + i), trainRows = train.map(item => item.row), model = fit({ gameId, history: trainRows, l2: options.l2, maxIterations: options.maxIterations, tolerance: options.tolerance });
      const modelScore = scoreRow(model, holdout[i]), baselineModel = fit({ gameId, history: trainRows, features: false, l2: options.l2, maxIterations: options.maxIterations, tolerance: options.tolerance });
      // Both models are scored on the same future winning ticket and forecast sales.
      modelScores.push(modelScore); baselineScores.push(scoreRow(baselineModel, holdout[i]));
      fits.push({ issue: holdout[i].issue, trainingCount: train.length, converged: model.diagnostics.converged, overfitFlag: model.diagnostics.overfitFlag });
    }
    const modelMetrics = aggregate(modelScores), baselineMetrics = aggregate(baselineScores);
    const devianceImprovement = baselineMetrics.meanDeviance - modelMetrics.meanDeviance, logscoreImprovement = baselineMetrics.meanLogscore - modelMetrics.meanLogscore;
    const signal = devianceImprovement > 0 && logscoreImprovement > 0;
    return { version: VERSION, gameId, status: signal ? "exploratory_signal_requires_prospective_validation" : "unsupported", conclusion: signal ? "An exploratory holdout improvement was observed; it is not evidence of reliable return advantage." : "No out-of-sample signal versus the sales-only baseline; reliable return advantage is unsupported.", protocol: { trainMinimum, holdoutCount, chronological: true, noHoldoutTuning: true, sameTarget: "winners.base[1] + winners.additional[1] when present", salesOffset: "log(salesYuan / training median), coefficient fixed at one" }, model: modelMetrics, salesOnlyBaseline: baselineMetrics, improvement: { meanDeviance: devianceImprovement, meanLogscore: logscoreImprovement }, fits, sourceRange: { firstIssue: all[0].issue, lastIssue: all.at(-1).issue } };
  }
  function generate(options) { return createPortfolio(options); }
  return { VERSION, GAMES, DEFAULTS, featureNames, featureObject, validateTicket, fit, predict, expectedSharing, headProbabilityUniform, createPortfolio, generate, evaluate, rngFor };
});
