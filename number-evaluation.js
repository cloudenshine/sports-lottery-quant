"use strict";
const crypto = require("node:crypto");
const Models = require("./number-models");
const Settlement = require("./number-settlement");

const VERSION = "2.0.0";
const PROTOCOL = Object.freeze({ version: VERSION, minimumTrainingDraws: 200, testPeriods: 120,
  count: 5, seed: 20260906, alpha: 0.05, familySize: 12, additional: false,
  endpoint: "last_120_published_draws_at_input_snapshot", evidenceMode: "retrospective_reconstructed" });
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function digest(value) { return crypto.createHash("sha256").update(stable(value)).digest("hex"); }
function integer(value, min, max, label) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(label); return value; }
function issueSeed(gameId, issue, seed) { return crypto.createHash("sha256").update(gameId + ":" + issue + ":" + seed).digest().readUInt32LE(0); }
function updateEvidence(previousLogE, logProbability, uniformLogProbability, { familySize = PROTOCOL.familySize, alpha = PROTOCOL.alpha } = {}) {
  if (![previousLogE, logProbability, uniformLogProbability].every(Number.isFinite) || logProbability > 0 || uniformLogProbability > 0) throw new RangeError("Finite log probabilities and logE required");
  integer(familySize, 1, 100000, "Invalid evidence family size");
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) throw new RangeError("Invalid alpha");
  const logE = previousLogE + logProbability - uniformLogProbability, threshold = familySize / alpha;
  if (!Number.isFinite(logE)) throw new RangeError("Evidence accumulation exceeded finite log range");
  return { logE, eValue: logE <= Math.log(Number.MAX_VALUE) ? Math.exp(logE) : null,
    eValueOverflow: logE > Math.log(Number.MAX_VALUE), threshold, logThreshold: Math.log(threshold), crossed: logE >= Math.log(threshold),
    null: "conditionally_independent_uniform_draws", scope: "number_distribution_only_not_profit" };
}
function reconstructed(draw) {
  // Today's archive capture cannot establish what a historical forecaster saw.
  // Only this explicitly retrospective path drops observation timestamps.
  return { issue: String(draw.issue), date: draw.date, ...(draw.at ? { at: draw.at } : {}), main: draw.main, special: draw.special };
}
function evaluateGame({ gameId, draws, testPeriods = PROTOCOL.testPeriods, minimumTrainingDraws = PROTOCOL.minimumTrainingDraws,
  count = PROTOCOL.count, seed = PROTOCOL.seed, additional = false, throughIssue } = {}) {
  if (!Object.hasOwn(Models.GAMES, gameId)) throw new RangeError("Unknown gameId");
  integer(testPeriods, 1, 10000, "Invalid testPeriods"); integer(minimumTrainingDraws, 1, Models.PARAMETERS.maximumHistory, "Invalid minimumTrainingDraws");
  integer(count, 1, 100, "Invalid count"); integer(seed, 0, 4294967295, "Invalid seed");
  if (typeof additional !== "boolean" || (additional && gameId !== "dlt")) throw new RangeError("Invalid additional option");
  if (!Array.isArray(draws)) throw new TypeError("Draw array required");
  const byIssue = new Map();
  for (const draw of draws) {
    Settlement.validateDraw(gameId, draw);
    const key = Settlement.normalizeIssue(draw.issue);
    if (byIssue.has(key)) throw new RangeError("Duplicate normalized issue");
    byIssue.set(key, draw);
  }
  const normalized = Models.validateHistory(gameId, draws.map(reconstructed));
  let rows = normalized.map(row => byIssue.get(Settlement.normalizeIssue(row.issue)));
  if (throughIssue !== undefined) {
    const target = Settlement.normalizeIssue(throughIssue), index = rows.findIndex(row => Settlement.normalizeIssue(row.issue) === target);
    if (index < 0) throw new RangeError("throughIssue is absent from observations");
    rows = rows.slice(0, index + 1);
  }
  const start = Math.max(minimumTrainingDraws, rows.length - testPeriods), periods = [];
  const accumulators = new Map(Models.MODEL_IDS.map(modelId => [modelId, { modelId, model: modelId, logE: 0, maxLogE: 0, rows: [] }]));
  for (let i = start; i < rows.length; i++) {
    const draw = rows[i], history = rows.slice(0, i).map(reconstructed);
    const asOf = draw.at || draw.date + "T00:00:00+08:00";
    const sharedSeed = issueSeed(gameId, Settlement.normalizeIssue(draw.issue), seed), outcomes = {};
    for (const modelId of Models.MODEL_IDS) {
      const generated = Models.generate({ gameId, modelId, history, asOf, count, seed: sharedSeed });
      if (generated.model.trainingCount < minimumTrainingDraws) throw new RangeError("Insufficient strictly earlier observations at evaluation cutoff");
      const scored = Models.score(generated.model, draw);
      const settled = Settlement.settlePortfolio({ gameId, tickets: generated.tickets, draw, additional, budgetYuan: count * (additional ? 3 : 2) });
      const accumulator = accumulators.get(modelId);
      const evidence = updateEvidence(accumulator.logE, scored.logProbability, -scored.uniformLogLoss);
      accumulator.logE = evidence.logE; accumulator.maxLogE = Math.max(accumulator.maxLogE, evidence.logE);
      const observation = { issue: String(draw.issue), date: draw.date, asOf, seed: sharedSeed,
        trainingCount: generated.model.trainingCount, trainingCutoff: generated.model.trainingCutoff,
        tickets: generated.tickets, logProbability: scored.logProbability, logLossImprovement: scored.improvementVsUniform,
        costYuan: settled.costYuan, grossYuan: settled.grossYuan, netYuan: settled.netYuan, knownGrossYuan: settled.knownGrossYuan,
        status: settled.status, pendingCount: settled.pendingCount, ruleId: settled.ruleId,
        pendingReasons: [...new Set(settled.rows.filter(x => x.grossYuan === null).map(x => x.reason))], logE: evidence.logE };
      accumulator.rows.push(observation); outcomes[modelId] = observation;
    }
    periods.push({ issue: String(draw.issue), date: draw.date, outcomes,
      uniformExpectation: Settlement.uniformExpectedGross({ gameId, draw, count, additional }) });
  }
  const baseline = accumulators.get("uniform").rows;
  const byModel = [...accumulators.values()].map(accumulator => {
    const observations = accumulator.rows, complete = observations.filter(x => x.netYuan !== null);
    const pairedRows = observations.map((x, i) => ({ issue: x.issue, differenceYuan: x.netYuan === null || baseline[i].netYuan === null ? null : x.netYuan - baseline[i].netYuan }));
    const pairedComplete = pairedRows.filter(x => x.differenceYuan !== null), allComplete = observations.length > 0 && complete.length === observations.length;
    const pairedAllComplete = observations.length > 0 && pairedComplete.length === observations.length;
    const knownGrossYuan = observations.reduce((sum, row) => sum + row.knownGrossYuan, 0), costYuan = observations.reduce((sum, row) => sum + row.costYuan, 0);
    const observedPairSum = pairedComplete.reduce((sum, row) => sum + row.differenceYuan, 0);
    return { modelId: accumulator.modelId, model: accumulator.modelId, periods: observations.length,
      settledPeriods: complete.length, pendingPeriods: observations.length - complete.length, actualPrizeSamples: pairedComplete.length,
      costYuan, grossYuan: allComplete ? knownGrossYuan : null, netYuan: allComplete ? knownGrossYuan - costYuan : null,
      knownGrossYuan, knownNetLowerBoundYuan: knownGrossYuan - costYuan,
      paired: { completePeriods: pairedComplete.length, pendingPeriods: observations.length - pairedComplete.length,
        sumNetDifferenceYuan: pairedAllComplete ? observedPairSum : null,
        meanNetDifferenceYuan: pairedAllComplete ? observedPairSum / observations.length : null,
        observedCompletePairSumYuan: observedPairSum, rows: pairedRows,
        warning: "Complete-pair subtotal is descriptive and must not be used as an advantage estimate when any scheduled pair is missing" },
      meanNetDifference: pairedAllComplete ? observedPairSum / observations.length : null, familyAdjustedInterval: null,
      logE: accumulator.logE, eValue: accumulator.logE <= Math.log(Number.MAX_VALUE) ? Math.exp(accumulator.logE) : null,
      evidence: { ...updateEvidence(accumulator.logE, 0, 0), maxLogE: accumulator.maxLogE,
        retrospectiveDiagnosticOnly: true, confirmatoryRejection: false,
        reason: "Predictable likelihood ratios form an e-process under the fair IID null only for a prospectively fixed procedure; retrospective model/endpoint selection is not confirmatory evidence" },
      decision: "not_proven", reliableReturnAdvantage: false,
      uncertainty: { status: "unidentified", method: "no_rare_prize_bootstrap", interval: null,
        reason: "No verified prospective finite return bound or complete counterfactual prize-sharing model; a short archive cannot establish tail-safe return advantage" } };
  });
  return { version: VERSION, gameId, status: periods.length ? "evaluated_retrospective" : "insufficient_history",
    evidenceMode: "retrospective_reconstructed", inputSha256: digest(rows), inputDrawCount: rows.length,
    firstIssue: periods[0]?.issue ?? null, lastIssue: periods.at(-1)?.issue ?? null,
    firstDate: periods[0]?.date ?? null, lastDate: periods.at(-1)?.date ?? null,
    protocol: { ...PROTOCOL, testPeriods, minimumTrainingDraws, count, seed, additional, modelIds: [...Models.MODEL_IDS], modelVersion: Models.VERSION,
      modelParameters: Models.PARAMETERS, settlementVersion: Settlement.VERSION,
      defaultProtocol: testPeriods === PROTOCOL.testPeriods && minimumTrainingDraws === PROTOCOL.minimumTrainingDraws && count === PROTOCOL.count && seed === PROTOCOL.seed && !additional },
    byModel, periods, decision: "not_proven", reliableReturnAdvantage: false,
    limitations: ["Historical observations were collected later; this is a reconstruction, not a pre-draw prediction record.",
      "All models receive the same past observations, ticket count, cost and issue-specific random seed; duplicates within each portfolio are rejected.",
      "Payouts replay published tables before tax; adding hypothetical winners may change floating prizes. Counterfactual pool sharing is not reconstructed.",
      "Distribution likelihood evidence and observed net return answer different questions. Neither a retrospective e-value nor a positive paper return proves future profit.",
      "Any incomplete payout keeps the full-window return or paired difference unknown; complete-pair subtotals do not remove missing outcomes."] };
}
function evaluateAll({ games, ...options } = {}) {
  if (!games || typeof games !== "object" || Array.isArray(games)) throw new TypeError("games object required");
  const reports = {};
  for (const gameId of ["ssq", "dlt"]) if (games[gameId]) reports[gameId] = evaluateGame({ ...options, gameId, draws: Array.isArray(games[gameId]) ? games[gameId] : games[gameId].draws });
  if (!Object.keys(reports).length) throw new RangeError("No SSQ/DLT observations supplied");
  return { version: VERSION, protocol: PROTOCOL, evidenceMode: "retrospective_reconstructed", games: reports, decision: "not_proven", reliableReturnAdvantage: false };
}
module.exports = Object.freeze({ VERSION, PROTOCOL, evaluateGame, evaluateAll, updateEvidence, digest, issueSeed });
