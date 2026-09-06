"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Science = require("../scientific-evaluation");

function history(n = 55) {
  return Array.from({ length: n }, (_, index) => ({
    issue: String(index + 1), date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    ...Science.uniformTickets("ssq", 1, index)[0],
  }));
}
function options(overrides = {}) {
  return { gameId: "ssq", draws: history(), periods: 25, minTraining: 30, count: 3, seeds: [11, 22, 33],
    strategy: ({ gameId, count, seed }) => Science.uniformTickets(gameId, count, seed),
    evaluatePrize: (_id, ticket, draw) => ticket.special[0] === draw.special[0] ? 6 : 0,
    prizeEstimates: { 6: 5 }, ...overrides };
}

test("exact prior partitions the entire draw space with exact integer outcomes", () => {
  for (const [gameId, expected] of [["ssq", 17721088], ["dlt", 21425712]]) {
    const prior = Science.exactLotteryPrior(gameId, 5);
    assert.equal(prior.combinations, expected);
    assert.equal(prior.matchDistribution.reduce((sum, cell) => sum + cell.outcomes, 0), expected);
    assert.equal(prior.jackpotProbability, 5 / expected);
    assert.equal(prior.matchDistribution.at(-1).outcomes, 1);
  }
  assert.throws(() => Science.exactLotteryPrior("other"));
  assert.throws(() => Science.exactLotteryPrior("ssq", -1));
});

test("uniform baseline is reproducible, legal, unique and accepts seed zero", () => {
  const tickets = Science.uniformTickets("dlt", 50, 0);
  assert.deepEqual(tickets, Science.uniformTickets("dlt", 50, 0));
  assert.notDeepEqual(tickets, Science.uniformTickets("dlt", 50, 1));
  assert.equal(new Set(tickets.map(ticket => JSON.stringify(ticket))).size, 50);
  for (const ticket of tickets) {
    assert.equal(ticket.main.length, 5);
    assert.equal(ticket.special.length, 2);
    assert.equal(new Set(ticket.main).size, 5);
    assert.ok(ticket.main.every(n => n >= 1 && n <= 35));
    assert.ok(ticket.special.every(n => n >= 1 && n <= 12));
  }
});

test("walk-forward passes immutable past only and scores equal budgets per seed", () => {
  const observed = [];
  const input = options({ strategy: ({ gameId, history: past, count, seed }) => {
    assert.ok(Object.isFrozen(past));
    assert.ok(Object.isFrozen(past[0].main));
    observed.push(past.at(-1).date);
    return Science.uniformTickets(gameId, count, seed);
  } });
  const report = Science.walkForward(input);
  assert.equal(observed.length, 75);
  for (let i = 0; i < report.points.length; i++) {
    const point = report.points[i];
    assert.ok(point.trainingEnd < point.date);
    for (const trial of point.trials) {
      assert.equal(trial.strategy.costYuan, 6);
      assert.equal(trial.baseline.costYuan, 6);
      assert.equal(trial.strategy.estimatedNetYuan, trial.strategy.estimatedPrizeYuan - 6);
    }
  }
  assert.equal(report.estimatedNetDifference.periods, 25, "seed replicates must not inflate independent sample count");
  assert.deepEqual(report, Science.walkForward(input));
});

test("changing a future outcome cannot change any earlier trial", () => {
  const input = options();
  const original = Science.walkForward(input);
  const changed = structuredClone(input.draws);
  changed[changed.length - 1].main = [1, 2, 3, 4, 5, 6];
  changed[changed.length - 1].special = [16];
  const after = Science.walkForward({ ...input, draws: changed });
  assert.deepEqual(original.points.slice(0, -1), after.points.slice(0, -1));
  assert.deepEqual(original.points.at(-1).trials.map(t => t.strategy.tickets), after.points.at(-1).trials.map(t => t.strategy.tickets));
});

test("changing evaluation window does not change overlapping period predictions", () => {
  const first = Science.walkForward(options());
  const shortened = Science.walkForward(options({ periods: 20 }));
  assert.deepEqual(first.points.slice(-20), shortened.points);
});

test("walk-forward rejects malformed chronology, draws, baseline budgets and missing payouts", () => {
  assert.throws(() => Science.walkForward(options({ draws: history().reverse() })), /chronological/);
  const repeated = history(); repeated[2].issue = repeated[1].issue;
  assert.throws(() => Science.walkForward(options({ draws: repeated })), /issue/);
  const duplicateNumbers = history(); duplicateNumbers[0].main[0] = duplicateNumbers[0].main[1];
  assert.throws(() => Science.walkForward(options({ draws: duplicateNumbers })), /main/);
  assert.throws(() => Science.walkForward(options({ seeds: [1, 1] })), /Distinct/);
  assert.throws(() => Science.walkForward(options({ strategy: () => [] })), /fixed budget/);
  assert.throws(() => Science.walkForward(options({ evaluatePrize: () => 1 })), /Missing prize/);
  assert.throws(() => Science.walkForward(options({ strategy: () => Array(3).fill(Science.uniformTickets("ssq", 1, 7)[0]) })), /Duplicate/);
});

test("bootstrap is paired, deterministic, and refuses to disguise small samples as confidence", () => {
  const differences = Array.from({ length: 40 }, (_, i) => i % 3 - 1);
  assert.deepEqual(Science.pairedInterval(differences), Science.pairedInterval(differences));
  assert.deepEqual(Science.pairedInterval(Array(25).fill(2)).interval, [2, 2]);
  assert.equal(Science.pairedInterval([1, 2]).interval, null);
  assert.throws(() => Science.pairedInterval([Infinity]));
});

test("sports scoring uses proper scores and rejects invalid probabilities and outcomes", () => {
  assert.deepEqual(Science.probabilityScores([0, 1], 1), { brier: 0, logLoss: -0 });
  assert.deepEqual(Science.probabilityScores([0.5, 0.5], 0), { brier: 0.5, logLoss: Math.log(2) });
  assert.equal(Science.probabilityScores([0, 1], 0).logLoss, Infinity);
  for (const vector of [[-0.1, 1.1], [NaN, 1], [0.1, 0.1], [Infinity, 0], [1]]) assert.throws(() => Science.probabilityScores(vector, 0));
  assert.throws(() => Science.probabilityScores([0.5, 0.5], 2));
  assert.throws(() => Science.probabilityScores([0.5, 0.5], 0.5));
});

function sportsRows() {
  return Array.from({ length: 25 }, (_, i) => ({ eventId: "event-" + i,
    predictedAt: new Date(Date.UTC(2025, 1, i + 1, 8)).toISOString(), marketAt: new Date(Date.UTC(2025, 1, i + 1, 9)).toISOString(), eventAt: new Date(Date.UTC(2025, 1, i + 1, 12)).toISOString(),
    probabilities: [0.7, 0.3], marketProbabilities: [0.5, 0.5], outcome: i % 2,
  }));
}

test("sports reports market-paired holdout scores without claiming predictive advantage", () => {
  assert.equal(Science.compareSportsProbabilities([]).status, "INSUFFICIENT_DATA");
  const report = Science.compareSportsProbabilities(sportsRows());
  assert.equal(report.observations, 25);
  assert.equal(report.predictiveAdvantageEstablished, false);
  assert.equal(report.brierDifference.periods, 25);
  assert.ok(report.meanModelBrier > report.meanMarketBrier);
  const rows = sportsRows(); rows[0].predictedAt = rows[0].eventAt;
  assert.throws(() => Science.compareSportsProbabilities(rows), /predate/);
  const repeated = sportsRows(); repeated[1].eventId = repeated[0].eventId;
  assert.throws(() => Science.compareSportsProbabilities(repeated), /Distinct/);
  const impossible = sportsRows(); impossible[0].probabilities = [0, 1];
  assert.equal(Science.compareSportsProbabilities(impossible).logLossDifference.status, "nonfinite_log_loss");
});
