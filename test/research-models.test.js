"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../research-models");
function rows(n = 50) {
  return Array.from({ length: n }, (_, i) => ({ eventId: String(i), kickoffAt: new Date(Date.UTC(2025, 0, i + 1, 12)).toISOString(), homeTeam: "team" + (i % 5), awayTeam: "team" + ((i + 2) % 5), homeGoals: i % 4, awayGoals: (i * 7) % 3, competition: "test", odds: { home: 2.1, draw: 3.5, away: 3.6 } }));
}
const fixture = { eventId: "next", kickoffAt: "2026-01-01T12:00:00Z", homeTeam: "new-home", awayTeam: "new-away", competition: "test", odds: { home: 2.1, draw: 3.5, away: 3.6 } };
test("all implemented models return normalized probabilities for cold starts and new teams", () => {
  for (const history of [[], rows()]) for (const id of M.MODEL_IDS) {
    const p = M.predict(id, history, fixture);
    assert.ok(p.probabilities.every(v => Number.isFinite(v) && v > 0 && v < 1));
    assert.ok(Math.abs(p.probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.equal(p.evidenceClass, "retrospective");
    assert.ok(p.trainingCutoff === null || Date.parse(p.trainingCutoff) < Date.parse(fixture.kickoffAt));
  }
});
test("complete market de-vig has independently calculable proportional and symmetric power answers", () => {
  const p = M.marketProbabilities({ home: 2, draw: 3, away: 4 });
  [6 / 13, 4 / 13, 3 / 13].forEach((v, i) => assert.ok(Math.abs(p[i] - v) < 1e-14));
  for (const method of ["proportional", "power"]) {
    assert.ok(M.marketProbabilities({ home: 2.5, draw: 2.5, away: 2.5 }, method).every(v => Math.abs(v - 1 / 3) < 1e-14));
    assert.equal(M.marketProbabilities({ home: 2, draw: 3 }, method), null);
    assert.equal(M.marketProbabilities({ home: 2, draw: 3, away: 1 }, method), null);
  }
  assert.equal(M.predict("market", [], { ...fixture, odds: null }).status, "missing_complete_market");
});
test("future scores, same-kickoff scores and unavailable results cannot alter earlier predictions", () => {
  const original = rows(65), target = original[43];
  const poisoned = original.map((r, i) => i >= 43 ? { ...r, homeGoals: 99, awayGoals: 98 } : { ...r });
  for (const model of M.MODEL_IDS) assert.deepEqual(M.predict(model, original, target), M.predict(model, poisoned, target));
  const late = { ...original[42], resultRecordedAt: "2026-01-01T00:00:00Z" };
  assert.equal(M.predict("elo", [...original.slice(0, 42), late], target).trainingCount, 42);
  const sameKickoff = { ...original[42], eventId: "simultaneous", kickoffAt: target.kickoffAt };
  assert.deepEqual(M.predict("poisson", [...original.slice(0, 43), sameKickoff], target), M.predict("poisson", original.slice(0, 43), target));
});
test("same kickoff Elo updates are permutation invariant", () => {
  const data = rows(20);
  data[1].kickoffAt = data[0].kickoffAt;
  const swapped = [data[1], data[0], ...data.slice(2)];
  assert.deepEqual(M.predict("elo", data, fixture), M.predict("elo", swapped, fixture));
});
test("historical baseline never pools other competitions; malformed chronology and duplicate ids rejected", () => {
  const history = rows();
  assert.equal(M.predict("poisson", history, { ...fixture, competition: "unseen" }).trainingCount, 0);
  assert.throws(() => M.walkForward(history.slice().reverse()), /chronological/);
  assert.throws(() => M.walkForward([...history, history.at(-1)]), /Duplicate/);
  assert.throws(() => M.predict("elo", [{ ...history[0], homeGoals: -1 }], fixture), /goals/);
  assert.throws(() => M.walkForward(history, { modelIds: ["elo", "elo"] }), /Unique/);
  assert.throws(() => M.predict("unknown", history, fixture), /Unknown model/);
});
test("Poisson responds to measured scoring strength with shrinkage; Elo handles draws explicitly", () => {
  const history = rows(60).map(r => ({ ...r, homeTeam: "strong", awayTeam: "weak", homeGoals: 3, awayGoals: 0 }));
  const target = { ...fixture, homeTeam: "strong", awayTeam: "weak" };
  for (const model of ["poisson", "elo"]) {
    const p = M.predict(model, history, target).probabilities;
    assert.ok(p[0] > 0.6);
    assert.ok(p[1] > 0 && p[2] > 0);
  }
});
test("proper scores penalize confidently wrong forecasts more than uniform", () => {
  assert.ok(M.score([0.9, 0.05, 0.05], 0).logLoss < M.score([1 / 3, 1 / 3, 1 / 3], 0).logLoss);
  assert.ok(M.score([0.9, 0.05, 0.05], 1).brier > M.score([1 / 3, 1 / 3, 1 / 3], 1).brier);
  assert.equal(M.score([1, 0, 0], 1).logLoss, Infinity);
  assert.throws(() => M.score([0.5, 0.5, 0.5], 0));
  assert.throws(() => M.score([1, 0, 0], 3));
});
test("walk-forward pairs exactly the same events and one-unit budget; absent settlement has no ROI", () => {
  const history = rows(45);
  const report = M.walkForward(history, { modelIds: ["uniform", "historical", "elo", "market"], minTraining: 10, bootstrapSamples: 200 });
  assert.ok(report.returns.every(r => r.matchedEvents === 0));
  const verified = history.map(r => ({ ...r, settlementRule: { id: "fixed-decimal-1x2", verified: true, sourceUrl: "https://example.test/rules", verifiedAt: "2024-01-01T00:00:00Z" } }));
  const withReturns = M.walkForward(verified, { modelIds: ["uniform", "elo"], minTraining: 10, bootstrapSamples: 200 });
  for (const r of withReturns.returns) { assert.equal(r.strategyStake, r.randomBaselineStake); if (r.decisionPolicy === "argmax") assert.equal(r.strategyStake, 35); }
  assert.equal(withReturns.returns[0].totalNet, withReturns.returns[0].baselineExpectedNet);
  assert.equal(withReturns.returns[0].baselineExpectedNet, verified.slice(10).reduce((s, r) => s + [r.odds.home, r.odds.draw, r.odds.away][r.homeGoals > r.awayGoals ? 0 : r.homeGoals === r.awayGoals ? 1 : 2] / 3 - 1, 0));
  assert.equal(report.status, "PENDING_PROSPECTIVE_CONFIRMATION");
  assert.equal(report.predictiveAdvantageEstablished, false);
  assert.ok(report.comparisons.every(c => !c.exploratoryPositive));
});
test("Bonferroni intervals expand with the full planned model family; few independent days stay pending", () => {
  const xs = Array.from({ length: 100 }, (_, i) => Math.sin(i));
  const one = M.pairedBlockInterval(xs, { comparisons: 1, samples: 2000 });
  const many = M.pairedBlockInterval(xs, { comparisons: 40, samples: 2000 });
  assert.ok(many.interval[0] <= one.interval[0]); assert.ok(many.interval[1] >= one.interval[1]);
  assert.equal(many.status, "insufficient_bootstrap_resolution");
  assert.ok(many.minimumSamplesForTailResolution > many.samples);
  const adequate = M.pairedBlockInterval(xs, { comparisons: 2, samples: 800 });
  assert.equal(adequate.expectedTailReplicates, 10);
  assert.equal(adequate.resolutionSufficient, true);
  assert.equal(adequate.status, "exploratory");
  assert.equal(M.pairedBlockInterval(xs.slice(0, 29)).status, "insufficient_blocks");
  assert.throws(() => M.pairedBlockInterval(xs, { comparisons: 0 }));
  const sameDay = rows(40).map((r, i) => ({ ...r, kickoffAt: new Date(Date.UTC(2025, 0, 1, 0, i)).toISOString() }));
  const report = M.walkForward(sameDay, { modelIds: ["uniform", "historical"], minTraining: 0, bootstrapSamples: 200 });
  assert.equal(report.comparisons[0].uncertainty.periods, 1);
  assert.equal(report.comparisons[0].uncertainty.interval, null);
});
test("empty data yield explicit pending, missing market never replaced with fabricated probabilities", () => {
  const empty = M.walkForward([]);
  assert.equal(empty.evaluatedEvents, 0); assert.equal(empty.predictiveAdvantageEstablished, false);
  const history = rows(35).map(r => ({ ...r, odds: null }));
  const result = M.walkForward(history, { minTraining: 30, bootstrapSamples: 200 });
  assert.ok(result.comparisons.filter(c => c.baseline === "market" || c.candidate === "market").every(c => c.matchedEvents === 0));
});
test("known post-kickoff odds are excluded even from retrospective market and return comparisons", () => {
  const record = { ...fixture, oddsCapturedAt: "2026-01-01T13:00:00Z" };
  assert.equal(M.predict("market", [], record).probabilities, null);
  assert.ok(M.predict("ensemble", [], record).probabilities.every(Number.isFinite));
});
test("date-only history uses a full-day completion assumption and bounded holdout retains training history", () => {
  const history = rows(50).map(r => ({ ...r, kickoffAt: r.kickoffAt.slice(0, 10) }));
  const target = { ...fixture, kickoffAt: "2025-01-02T12:00:00Z" };
  assert.equal(M.predict("historical", history, target).trainingCount, 1);
  assert.equal(M.predict("historical", history, { ...target, kickoffAt: "2025-01-02" }).trainingCount, 1);
  const report = M.walkForward(rows(50), { modelIds: ["uniform", "historical"], maxEvaluationEvents: 5, bootstrapSamples: 200 });
  assert.equal(report.evaluatedEvents, 5);
  assert.equal(report.points[0].predictions.historical.trainingCount, 45);
});
test("per-tournament cached nested fits equal independent past-only forecasts", () => {
  const history = rows(53);
  const report = M.walkForward(history, { modelIds: ["poisson", "elo", "ensemble"], maxEvaluationEvents: 5, bootstrapSamples: 200 });
  for (const point of report.points) {
    const target = history.find(r => r.eventId === point.eventId);
    for (const modelId of report.modelIds) assert.deepEqual(point.predictions[modelId].probabilities, M.predict(modelId, history, target).probabilities);
  }
});
test("paper settlement is explicit and unverified, with separate fixed-budget and actual-exposure baselines", () => {
  const report = M.walkForward(rows(45), { modelIds: ["market"], minTraining: 10, bootstrapSamples: 200, paperRuleAssumption: M.PAPER_RULE_ID });
  const argmax = report.returns.find(r => r.decisionPolicy === "argmax"), ev = report.returns.find(r => r.decisionPolicy === "ev-threshold");
  assert.equal(argmax.actualStake, 35); assert.equal(argmax.noBetCount, 0); assert.equal(argmax.exposureBudget, 35);
  assert.equal(ev.actualStake, 0); assert.equal(ev.noBetCount, 35); assert.equal(ev.exposureBudget, 35);
  assert.equal(ev.totalNet, 0); assert.equal(ev.baselineExpectedNet, 0); assert.equal(ev.randomBaselineStake, 0);
  assert.equal(ev.returnAgainstMarket.stake, 0); assert.equal(ev.returnAgainstMarket.net, 0);
  assert.equal(ev.fullBudgetRandomBaseline.stake, 35);
  assert.deepEqual(ev.evidence, ["paper_assumption"]); assert.equal(ev.paperRuleAssumption, M.PAPER_RULE_ID);
  assert.equal(report.points[0].predictions.market.hypotheticalReturn.officialRuleVerified, false);
  assert.equal(report.predictiveAdvantageEstablished, false);
  assert.throws(() => M.walkForward([], { paperRuleAssumption: "invented" }));
});
test("pre-outcome decisions implement strict EV hurdle, cash, unit caps, and equal random tie-breaking", () => {
  const odds = { home: 2.1, draw: 3, away: 4 };
  assert.equal(M.decisionFor([0.5, 0.3, 0.2], odds, { policy: "ev-threshold" }).stake, 0);
  const bet = M.decisionFor([0.51, 0.29, 0.2], odds, { policy: "ev-threshold" });
  assert.equal(bet.stake, 1); assert.deepEqual(bet.picks, [0]);
  assert.deepEqual(M.decisionFor([1 / 3, 1 / 3, 1 / 3], odds).picks, [0, 1, 2]);
  assert.equal(M.decisionFor([0.51, 0.29, 0.2], { home: 2.1, draw: 3 }, { policy: "ev-threshold" }), null);
  assert.throws(() => M.decisionFor([0.51, 0.29, 0.2], odds, { evThreshold: 0.5 }));
});
