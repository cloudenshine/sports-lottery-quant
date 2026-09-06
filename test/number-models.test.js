"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Models = require("../number-models");
const AS_OF = "2025-06-01T12:00:00+08:00";
function combinations(n, k, start = 1, prefix = []) {
  if (!k) return [prefix];
  const result = [];
  for (let i = start; i <= n - k + 1; i++) result.push(...combinations(n, k - 1, i + 1, [...prefix, i]));
  return result;
}
function history(gameId, count = 100) {
  const game = Models.GAMES[gameId];
  const random = Models.rngFor(70913);
  return Array.from({ length: count }, (_, i) => ({ issue: String(2025000 + i), date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    main: Models.sampleSubset(Array(game.mainMax).fill(1), game.mainCount, random),
    special: Models.sampleSubset(Array(game.specialMax).fill(1), game.specialCount, random) }));
}
function close(a, b, tolerance = 1e-11) { assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`); }

test("product-weight subset probabilities exactly normalize over exhaustive small universes", () => {
  for (const weights of [[1, 1, 1, 1, 1], [0.2, 0.5, 1, 3, 8]]) for (const k of [0, 1, 2, 3, 5]) {
    const sets = combinations(weights.length, k);
    const products = sets.map(set => set.reduce((p, n) => p * weights[n - 1], 1));
    const exact = products.reduce((sum, p) => sum + p, 0);
    close(Models.elementarySymmetric(weights, k), exact);
    close(sets.reduce((sum, set) => sum + Math.exp(Models.subsetLogProbability(weights, k, set)), 0), 1);
    sets.forEach((set, i) => close(Math.exp(Models.subsetLogProbability(weights, k, set)), products[i] / exact));
  }
  const large = [1e250, 1e200, 1e100];
  assert.ok(Number.isFinite(Models.subsetLogProbability(large, 2, [1, 2])));
  assert.throws(() => Models.elementarySymmetric(large, 2), /finite numeric range/);
});

test("weighted subset sampler matches the product distribution rather than sequential roulette", () => {
  const weights = [1, 2, 5, 9], k = 2, random = Models.rngFor(0), counts = new Map();
  const sampleCount = 40000;
  for (let i = 0; i < sampleCount; i++) {
    const selected = Models.sampleSubset(weights, k, random);
    assert.equal(new Set(selected).size, k);
    const key = selected.join(","); counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const set of combinations(weights.length, k)) {
    const expected = Math.exp(Models.subsetLogProbability(weights, k, set));
    // Fixed seed and a generous absolute bound (at least five standard errors).
    close((counts.get(set.join(",")) || 0) / sampleCount, expected, 0.012);
  }
});

test("uniform complete-ticket probabilities and exact inclusion marginals match both official game spaces", () => {
  const exactUniverses = { ssq: 17721088, dlt: 21425712 };
  for (const gameId of Object.keys(exactUniverses)) {
    const model = Models.fit({ gameId, modelId: "uniform", asOf: AS_OF });
    const ticket = history(gameId, 1)[0];
    close(Math.exp(Models.logProbability(model, ticket)), 1 / exactUniverses[gameId], 1e-20);
    close(Models.score(model, ticket).logLoss, Math.log(exactUniverses[gameId]));
    close(Models.score(model, ticket).improvementVsUniform, 0);
    for (const zone of ["main", "special"]) {
      const game = Models.GAMES[gameId];
      close(model.probabilities[zone].reduce((a, b) => a + b, 0), game[zone + "Count"]);
      model.probabilities[zone].forEach(p => close(p, game[zone + "Count"] / game[zone + "Max"]));
    }
  }
});

test("every candidate has a valid uniform empty-history prior and serializable finite model", () => {
  for (const gameId of Object.keys(Models.GAMES)) for (const modelId of Models.MODEL_IDS) {
    const model = Models.fit({ gameId, modelId, asOf: AS_OF });
    const uniform = Models.fit({ gameId, modelId: "uniform", asOf: AS_OF });
    const ticket = history(gameId, 1)[0];
    assert.equal(model.trainingCount, 0); assert.equal(model.trainingCutoff, null);
    close(Models.logProbability(model, ticket), Models.logProbability(uniform, ticket));
    assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
    assert.ok(model.assumptions.length >= 4);
  }
});

test("future draws and future observation timestamps cannot affect any fitted model or seeded portfolio", () => {
  const base = history("ssq", 25), future = { ...history("ssq", 1)[0], issue: "2025999", date: "2025-07-01" };
  const lateObserved = { ...history("ssq", 1)[0], issue: "2025998", date: "2025-02-01", source: { fetchedAt: "2025-08-01T00:00:00Z" } };
  for (const modelId of Models.MODEL_IDS) {
    const options = { gameId: "ssq", modelId, history: base, asOf: AS_OF, seed: 0, count: 4 };
    assert.deepEqual(Models.generate(options), Models.generate({ ...options, history: [...base, future, lateObserved].reverse() }));
  }
  const sameDay = [{ ...base[0], date: "2025-06-01" }];
  assert.equal(Models.fit({ gameId: "ssq", history: sameDay, asOf: AS_OF }).trainingCount, 0);
  assert.equal(Models.fit({ gameId: "ssq", history: sameDay, asOf: "2025-06-02T00:00:00+08:00" }).trainingCount, 1);
  const at = { ...base[0], at: "2025-06-01T04:00:00Z" };
  assert.equal(Models.fit({ gameId: "ssq", history: [at], asOf: AS_OF }).trainingCount, 0, "equal timestamps are not past");
});

test("all candidates generate reproducible distinct legal portfolios under equal base cost", () => {
  for (const gameId of Object.keys(Models.GAMES)) for (const modelId of Models.MODEL_IDS) {
    const options = { gameId, modelId, history: history(gameId), asOf: AS_OF, count: 100, seed: 0 };
    const generated = Models.generate(options);
    assert.deepEqual(generated, Models.generate(options));
    assert.equal(generated.tickets.length, 100);
    assert.equal(new Set(generated.tickets.map(t => JSON.stringify(t))).size, 100);
    assert.equal(generated.portfolio.costYuan, 200);
    assert.equal(generated.model.trainingCount, 100);
    for (const ticket of generated.tickets) {
      assert.doesNotThrow(() => Models.validateTicket(gameId, ticket));
      assert.ok(Number.isFinite(Models.logProbability(generated.model, ticket)));
    }
    for (const zone of ["main", "special"]) close(generated.model.probabilities[zone].reduce((a, b) => a + b, 0), Models.GAMES[gameId][zone + "Count"]);
  }
});

test("mixture probability is the equal mixture of whole-ticket probabilities", () => {
  const model = Models.fit({ gameId: "dlt", modelId: "mixture", history: history("dlt"), asOf: AS_OF });
  for (const ticket of history("dlt", 5)) {
    const expected = model.components.reduce((sum, c) => sum + c.weight * Math.exp(Models.logProbability(c.model, ticket)), 0);
    close(Math.exp(Models.logProbability(model, ticket)), expected, 1e-20);
  }
  const roundTrip = JSON.parse(JSON.stringify(model));
  close(Models.logProbability(roundTrip, history("dlt", 1)[0]), Models.logProbability(model, history("dlt", 1)[0]));
  roundTrip.components[0].weight = 0.5;
  assert.throws(() => Models.logProbability(roundTrip, history("dlt", 1)[0]), /sum to one/);
});

test("fixed alternatives test distinct hypotheses without looking at holdout outcomes", () => {
  const rows = history("ssq", 100).map((r, i) => ({ ...r, main: [1, 2, 3, 4, 5, 6], special: [i % 2 ? 1 : 2] }));
  const fit = modelId => Models.fit({ gameId: "ssq", modelId, history: rows, asOf: AS_OF });
  assert.ok(fit("frequency_shrink").probabilities.main[0] > 6 / 33);
  assert.ok(fit("omission_reversal").probabilities.main[0] < 6 / 33);
  const transition = fit("transition_shrink");
  assert.ok(transition.probabilities.special[1] > transition.probabilities.special[0], "last special=1, alternation predicts 2");
  assert.notDeepEqual(fit("frequency_shrink").zones, fit("recency_shrink").zones);
});

test("coverage reports actual low-order coverage and retains a uniform predictive model", () => {
  for (const gameId of Object.keys(Models.GAMES)) {
    const result = Models.generate({ gameId, modelId: "coverage", asOf: AS_OF, count: 15, seed: 14 });
    const numbers = new Set(result.tickets.flatMap(t => t.main)), specials = new Set(result.tickets.flatMap(t => t.special));
    assert.equal(result.portfolio.coverage.main, numbers.size);
    assert.equal(result.portfolio.coverage.special, specials.size);
    assert.equal(result.portfolio.candidatesExamined, 15 * Models.PARAMETERS.coverageCandidates);
    assert.match(result.portfolio.objective, /not a global optimum/);
    const baseline = Models.fit({ gameId, asOf: AS_OF });
    for (const ticket of result.tickets) close(Models.logProbability(result.model, ticket), Models.logProbability(baseline, ticket));
    assert.ok(result.portfolio.assumptions.some(text => text.includes("not expected gross return")));
  }
});

test("model boundaries reject malformed observations, duplicate issues and nonfinite inputs", () => {
  const row = history("ssq", 1)[0], defaults = { gameId: "ssq", asOf: AS_OF };
  for (const patch of [{ gameId: "wrong" }, { modelId: "wrong" }, { asOf: "2025-06-01" }, { asOf: "2025-02-30T00:00:00Z" }, { asOf: "2025-06-01T24:00:00Z" },
    { history: [{}] }, { history: [{ ...row, main: [1, 2, 3, 4, 5, NaN] }] }, { history: [{ ...row, date: "2025-02-30" }] },
    { history: [{ ...row, source: { fetchedAt: "tomorrow" } }] }, { history: [row, row] }]) assert.throws(() => Models.fit({ ...defaults, ...patch }));
  for (const patch of [{ count: 101 }, { count: 0 }, { count: 2.1 }, { seed: -1 }, { seed: NaN }, { seed: 2 ** 32 }]) assert.throws(() => Models.generate({ ...defaults, ...patch }));
  assert.throws(() => Models.subsetLogProbability([1, NaN], 1, [1]));
  assert.throws(() => Models.subsetLogProbability([1, 0], 1, [1]));
  assert.throws(() => Models.subsetLogProbability([1, 1], 2, [1, 1]));
  assert.throws(() => Models.sampleSubset([1, 1], 1, () => NaN));
  assert.throws(() => Models.sampleSubset([1, 1], 1, () => 1));
});

test("browser and Node share the same side-effect-free API and serialized prediction", () => {
  const context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "number-models.js"), "utf8"), context);
  const Browser = context.globalThis.NumberModels;
  assert.equal(Browser.VERSION, Models.VERSION);
  const options = { gameId: "dlt", modelId: "mixture", history: history("dlt", 5), asOf: AS_OF, count: 3, seed: 0 };
  assert.deepEqual(JSON.parse(JSON.stringify(Browser.generate(options))), Models.generate(options));
});
