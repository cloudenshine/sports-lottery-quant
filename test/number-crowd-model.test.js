"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Crowd = require("../number-crowd-model");

function rows(count = 320, gameId = "ssq") {
  const game = Crowd.GAMES[gameId];
  return Array.from({ length: count }, (_, i) => {
    const consecutive = i % 2 === 0;
    const main = consecutive
      ? [1, 2, 10, 20, 28, game.mainMax].slice(0, game.mainCount)
      : [3, 8, 15, 22, 27, 32].slice(0, game.mainCount);
    const special = game.specialCount === 1 ? [(i % game.specialMax) + 1] : [1, 7];
    return { issue: String(23001 + i), date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), main, special, salesYuan: 100000000 + (i % 5) * 1000000, coWinners: consecutive ? 12 : 1 };
  });
}

test("feature weights are learned from winner counts, including birthday and consecutive structure", () => {
  const model = Crowd.fit({ gameId: "ssq", history: rows() });
  assert.equal(model.trainingCount, 320);
  assert.equal(model.diagnostics.converged, true);
  assert.ok(model.featureNames.includes("mainBirthdayCount"));
  assert.ok(model.featureNames.includes("mainConsecutivePairs"));
  const highCrowd = Crowd.predict(model, rows(1)[0]).lambda;
  const lowCrowd = Crowd.predict(model, rows(2)[1]).lambda;
  assert.ok(highCrowd > lowCrowd, `${highCrowd} should exceed ${lowCrowd}`);
  assert.equal(model.assumptions.some(value => value.includes("estimated from winner counts")), true);
});

test("sales offset is multiplicative and unknown ticket units stay in the intercept", () => {
  const history = rows(20).map((row, i) => ({ ...row, coWinners: 4, salesYuan: i % 2 ? 200 : 100 }));
  const model = Crowd.fit({ gameId: "ssq", history });
  const ticket = history[0];
  const one = Crowd.predict(model, ticket, { salesYuan: 100 }).lambda;
  const two = Crowd.predict(model, ticket, { salesYuan: 200 }).lambda;
  assert.ok(Math.abs(two / one - 2) < 1e-8, `${two / one} should equal the fixed offset ratio`);
  assert.ok(model.assumptions.some(value => value.includes("not an exact ticket count")));
});

test("chronological evaluation requires 200 training and 120 holdout rows", () => {
  const result = Crowd.evaluate({ gameId: "ssq", draws: rows(), trainMinimum: 200, holdout: 120 });
  assert.equal(result.protocol.chronological, true);
  assert.equal(result.protocol.noHoldoutTuning, true);
  assert.equal(result.model.count, 120);
  assert.equal(result.salesOnlyBaseline.count, 120);
  assert.ok(["unsupported", "exploratory_signal_requires_prospective_validation"].includes(result.status));
  assert.equal(typeof result.model.meanDeviance, "number");
  assert.equal(typeof result.salesOnlyBaseline.meanLogscore, "number");
});

test("future draw and observation timestamps are excluded before fitting", () => {
  const history = rows(2).map((row, i) => ({ ...row, source: { sourceId: "test", sourceUrl: "https://example.invalid", fetchedAt: i ? "2025-02-01T00:00:00Z" : "2024-01-01T00:00:00Z", bodySha256: "a", rawRef: "raw/a" } }));
  const model = Crowd.fit({ gameId: "ssq", history, asOf: "2025-01-01T00:00:00Z" });
  assert.equal(model.trainingCount, 1);
  assert.deepEqual(model.trainingIssues, [history[0].issue]);
});

test("sharing function has exact zero boundary and legal-ticket probability is uniform", () => {
  assert.equal(Crowd.expectedSharing(0), 1);
  assert.ok(Math.abs(Crowd.expectedSharing(1) - (1 - Math.exp(-1))) < 1e-14);
  assert.throws(() => Crowd.expectedSharing(-1), /nonnegative/);
  assert.ok(Math.abs(Crowd.headProbabilityUniform("ssq") - 1 / (17721088)) < 1e-20);
  assert.ok(Math.abs(Crowd.headProbabilityUniform("dlt") - 1 / (21425712)) < 1e-20);
});

test("finite candidate portfolio is deterministic, ranked, legal and budget matched", () => {
  const model = Crowd.fit({ gameId: "ssq", history: rows() });
  const candidates = [
    { main: [1, 2, 10, 20, 28, 33], special: [1] },
    { main: [3, 8, 15, 22, 27, 32], special: [2] },
    { main: [4, 9, 14, 19, 24, 30], special: [3] }
  ];
  const a = Crowd.createPortfolio({ model, candidates, count: 2, budgetYuan: 4 });
  const b = Crowd.createPortfolio({ model, candidates, count: 2, budgetYuan: 4 });
  assert.deepEqual(a, b);
  assert.equal(a.portfolio.costYuan, 4);
  assert.equal(a.portfolio.budgetYuan, 4);
  assert.ok(a.tickets[0].predictedCoWinners <= a.tickets[1].predictedCoWinners);
  assert.equal(a.tickets[0].headprobuniform, Crowd.headProbabilityUniform("ssq"));
  assert.ok(a.portfolio.assumptions.some(value => value.includes("not a number-generation probability")));
  assert.throws(() => Crowd.createPortfolio({ model, candidates, count: 2, budgetYuan: 2 }), /cannot pay/);
});

test("browser UMD exposes the same deterministic API", () => {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "number-crowd-model.js"), "utf8"), context);
  const Browser = context.globalThis.NumberCrowdModel;
  assert.equal(Browser.VERSION, Crowd.VERSION);
  const options = { gameId: "dlt", history: rows(10, "dlt"), count: 2, seed: 0 };
  assert.deepEqual(JSON.parse(JSON.stringify(Browser.createPortfolio(options))), JSON.parse(JSON.stringify(Crowd.createPortfolio(options))));
});
