"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Research = require("../number-research");
const Science = require("../scientific-evaluation");
const Engine = require("../engine");
function draws(gameId, n = 120) {
  return Array.from({ length: n }, (_, i) => ({ issue: String(i + 1), date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), ...Science.uniformTickets(gameId, 1, i)[0] }));
}
test("registered strategies generate reproducible legal distinct equal-budget portfolios", () => {
  for (const gameId of ["ssq", "dlt"]) for (const strategy of Research.STRATEGIES) {
    const options = { gameId, history: draws(gameId), count: 50, seed: 0 };
    const tickets = Research.selectTickets(strategy.id, options);
    assert.deepEqual(tickets, Research.selectTickets(strategy.id, options));
    assert.equal(tickets.length, 50);
    assert.equal(new Set(tickets.map(ticket => JSON.stringify(ticket))).size, 50);
    for (const ticket of tickets) assert.doesNotThrow(() => Engine.evaluatePrize(gameId, ticket, ticket));
  }
});
test("history windows exclude old observations and public boundaries reject malformed inputs", () => {
  const original = draws("ssq", 110), changed = structuredClone(original);
  changed[0].main = [1, 2, 3, 4, 5, 6]; changed[0].special = [1];
  for (const id of ["hot_shrink", "cold_shrink"]) assert.deepEqual(
    Research.selectTickets(id, { gameId: "ssq", history: original, seed: 42 }),
    Research.selectTickets(id, { gameId: "ssq", history: changed, seed: 42 }));
  for (const patch of [{ gameId: "bad" }, { seed: -1 }, { count: 0 }, { history: [{}] }]) assert.throws(() => Research.selectTickets("hot_shrink", { gameId: "ssq", seed: 1, ...patch }));
  assert.throws(() => Research.selectTickets("unknown", { gameId: "ssq", seed: 1 }));
});
test("prize probabilities exactly partition the draw universe and preserve expectation for every portfolio", () => {
  for (const gameId of ["ssq", "dlt"]) {
    const single = Research.exactPrizeProbabilities(gameId, Engine.evaluatePrize, Engine.PRIZE_ESTIMATES[gameId]);
    const many = Research.exactPrizeProbabilities(gameId, Engine.evaluatePrize, Engine.PRIZE_ESTIMATES[gameId], 5);
    assert.equal(single.singleTicketPrizeProbabilities.reduce((sum, row) => sum + row.outcomes, 0), single.combinations);
    assert.equal(single.singleTicketPrizeProbabilities.find(row => row.level === 1).outcomes, 1);
    assert.equal(many.jackpotProbability, 5 / single.combinations);
    assert.equal(many.portfolioScenarioExpectedGrossYuan, single.singleTicketScenarioExpectedGrossYuan * 5);
    assert.equal(many.portfolioScenarioExpectedNetYuan, (single.singleTicketScenarioExpectedGrossYuan - 2) * 5);
    assert.deepEqual(single.singleTicketPrizeProbabilities, many.singleTicketPrizeProbabilities);
  }
  assert.throws(() => Research.exactPrizeProbabilities("ssq", Engine.evaluatePrize, {}));
});
test("multiple comparisons retain the full registered family and cannot claim an advantage", () => {
  const zero = Research.familyInterval(Array(30).fill(0));
  assert.equal(zero.comparisons, 8);
  assert.equal(zero.individualConfidenceLevel, 0.99375);
  assert.deepEqual(zero.interval, [0, 0]);
  assert.equal(zero.status, "NO_POSITIVE_SCENARIO_SIGNAL");
  assert.equal(Research.familyInterval([1]).status, "INSUFFICIENT_PERIODS");
  assert.throws(() => Research.familyInterval([1, 2], 1));
  assert.throws(() => Research.familyInterval([NaN]));
});
test("every tournament strategy is future-independent, equal-cost and seed-clustered", () => {
  const options = { gameId: "ssq", draws: draws("ssq", 104), periods: 4, count: 2, seeds: [1, 2], evaluatePrize: Engine.evaluatePrize, prizeEstimates: Engine.PRIZE_ESTIMATES.ssq };
  const before = Research.runTournament(options);
  const changed = structuredClone(options.draws);
  changed.at(-1).main = [1, 2, 3, 4, 5, 6]; changed.at(-1).special = [16];
  const after = Research.runTournament({ ...options, draws: changed });
  assert.equal(before.predictiveAdvantageEstablished, false);
  for (let i = 0; i < before.reports.length; i++) {
    const report = before.reports[i], modified = after.reports[i];
    assert.deepEqual(report.points.slice(0, -1), modified.points.slice(0, -1));
    assert.deepEqual(report.points.at(-1).trials.map(row => row.strategy.tickets), modified.points.at(-1).trials.map(row => row.strategy.tickets));
    assert.equal(report.familyAdjustedNetDifference.periods, 4);
    assert.equal(Object.hasOwn(report, "hitDifference"), false, "secondary hit endpoint must not add an unadjusted inference");
    for (const point of report.points) {
      assert.ok(point.trainingEnd < point.date);
      for (const trial of point.trials) {
        assert.equal(trial.strategy.costYuan, 4);
        assert.equal(trial.baseline.costYuan, 4);
      }
    }
  }
});
