"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Evaluation = require("../number-evaluation");
const Models = require("../number-models");
const { main } = require("../scripts/evaluate-numbers-v2");
function draws(gameId = "ssq", count = 15) {
  const game = Models.GAMES[gameId], random = Models.rngFor(7521);
  return Array.from({ length: count }, (_, i) => ({ gameId, issue: String(25001 + i),
    date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    main: Models.sampleSubset(Array(game.mainMax).fill(1), game.mainCount, random),
    special: Models.sampleSubset(Array(game.specialMax).fill(1), game.specialCount, random),
    payouts: { base: { 1: 5000000, 2: 120000, 3: 3000, 4: 200, 5: 10, 6: 5, 7: 5, 8: 5, 9: 5 }, additional: { 1: 4000000, 2: 96000 } },
    specialPrizeActive: false, source: { fetchedAt: "2026-09-06T00:00:00Z", bodySha256: "fixture" } }));
}
test("number evaluation reconstructs only earlier draws and preserves exact default budgets", () => {
  const report = Evaluation.evaluateGame({ gameId: "ssq", draws: draws(), minimumTrainingDraws: 10, testPeriods: 3 });
  assert.equal(report.evidenceMode, "retrospective_reconstructed");
  assert.equal(report.periods.length, 3);
  for (const period of report.periods) for (const row of Object.values(period.outcomes)) {
    assert.equal(row.costYuan, 10); assert.equal(row.tickets.length, 5);
    assert.ok(row.trainingCount >= 10); assert.ok(Date.parse(row.trainingCutoff) < Date.parse(row.asOf));
  }
  const uniform = report.byModel.find(row => row.modelId === "uniform");
  assert.equal(uniform.eValue, 1); assert.equal(uniform.logE, 0);
  assert.equal(uniform.meanNetDifference, 0);
  assert.ok(report.byModel.every(row => row.decision === "not_proven" && row.familyAdjustedInterval === null));
});
test("fixed endpoint is invariant to later observations and reversed input order", () => {
  const data = draws(), options = { gameId: "ssq", testPeriods: 3, minimumTrainingDraws: 5, throughIssue: "25012" };
  const a = Evaluation.evaluateGame({ ...options, draws: data.slice(0, 12) });
  const b = Evaluation.evaluateGame({ ...options, draws: data.slice().reverse() });
  assert.deepEqual(a, b);
});
test("missing winning payout leaves whole-window and all paired results unknown", () => {
  const data = draws("ssq", 11), draw = data.at(-1), asOf = draw.date + "T00:00:00+08:00";
  const generated = Models.generate({ gameId: "ssq", modelId: "uniform", history: data.slice(0, -1).map(({ source, ...row }) => row), asOf,
    count: 5, seed: Evaluation.issueSeed("ssq", "2025011", Evaluation.PROTOCOL.seed) });
  Object.assign(draw, generated.tickets[0]); draw.payouts.base[1] = 0; draw.winners = { base: { 1: 0 } };
  const report = Evaluation.evaluateGame({ gameId: "ssq", draws: data, minimumTrainingDraws: 10, testPeriods: 1 });
  const uniform = report.byModel.find(row => row.modelId === "uniform");
  assert.equal(uniform.netYuan, null); assert.equal(uniform.grossYuan, null); assert.equal(uniform.pendingPeriods, 1);
  assert.ok(report.byModel.every(row => row.paired.pendingPeriods === 1 && row.meanNetDifference === null && !row.reliableReturnAdvantage));
  assert.equal(report.periods[0].uniformExpectation.counterfactualExpectedGrossYuan, null);
  assert.equal(report.periods[0].uniformExpectation.publishedPrizeTableExpectedGrossYuan, null);
});
test("dlt additional is equally charged to every model and random comparator", () => {
  const report = Evaluation.evaluateGame({ gameId: "dlt", draws: draws("dlt"), minimumTrainingDraws: 10, testPeriods: 2, additional: true, count: 4 });
  assert.ok(report.byModel.every(row => row.costYuan === 24));
  assert.equal(report.protocol.defaultProtocol, false);
});
test("e-process performs predictable likelihood-ratio multiplication with family correction", () => {
  let value = Evaluation.updateEvidence(0, Math.log(0.5), Math.log(0.25));
  assert.equal(value.eValue, 2); assert.equal(value.threshold, 240); assert.equal(value.crossed, false);
  value = Evaluation.updateEvidence(value.logE, Math.log(0.5), Math.log(0.25));
  assert.ok(Math.abs(value.eValue - 4) < 1e-12);
  assert.equal(value.scope, "number_distribution_only_not_profit");
  assert.throws(() => Evaluation.updateEvidence(Infinity, -1, -1));
  assert.throws(() => Evaluation.updateEvidence(0, 1, -1));
  assert.throws(() => Evaluation.updateEvidence(0, -1, -1, { alpha: NaN }));
});
test("finite input validation and insufficient history never imply advantage", () => {
  const input = { gameId: "ssq", draws: draws("ssq", 2) };
  for (const field of ["count", "seed", "testPeriods", "minimumTrainingDraws"]) assert.throws(() => Evaluation.evaluateGame({ ...input, [field]: Infinity }));
  assert.throws(() => Evaluation.evaluateGame({ ...input, draws: [...input.draws, { ...input.draws[0], issue: "2025001" }] }), /Duplicate/);
  const report = Evaluation.evaluateGame(input);
  assert.equal(report.status, "insufficient_history"); assert.equal(report.reliableReturnAdvantage, false);
  assert.ok(report.byModel.every(row => row.netYuan === null && row.meanNetDifference === null));
});
test("offline evaluation CLI writes source digest and explicit retrospective report", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-evaluation-"));
  try {
    const input = path.join(directory, "sources.json"), output = path.join(directory, "report.json");
    const source = { games: { ssq: { draws: draws("ssq", 2) } } }; fs.writeFileSync(input, JSON.stringify(source));
    const result = main(["--input", input, "--output", output]);
    assert.equal(result.source.inputSha256, Evaluation.digest(source));
    assert.equal(JSON.parse(fs.readFileSync(output)).evidenceMode, "retrospective_reconstructed");
    assert.throws(() => main(["--unknown", "x"]), /Usage/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
