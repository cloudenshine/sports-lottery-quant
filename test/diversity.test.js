"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;
before(() => {
  E = loadEngine();
});

describe("portfolio diversity (regression: all tickets looked identical)", () => {
  it("SSQ unique portfolio spans at least 3 odd/even profiles", () => {
    const out = E.generate("ssq", { count: 5, seed: 260821, mode: "unique", budgetYuan: 10 });
    assert.equal(out.tickets.length, 5);
    const odds = new Set(out.tickets.map((t) => t.shape.odd));
    assert.ok(odds.size >= 3, `odd variety ${odds.size}: ${[...odds]}`);
  });

  it("SSQ unique portfolio spans at least 2 run shapes", () => {
    const out = E.generate("ssq", { count: 5, seed: 260821, mode: "unique", budgetYuan: 10 });
    const runs = new Set(out.tickets.map((t) => t.shape.run));
    assert.ok(runs.size >= 2, `run variety ${runs.size}`);
  });

  it("SSQ unique portfolio sum spread >= 15", () => {
    const out = E.generate("ssq", { count: 5, seed: 260821, mode: "unique", budgetYuan: 10 });
    const sums = out.tickets.map((t) => t.shape.sum);
    const spread = Math.max(...sums) - Math.min(...sums);
    assert.ok(spread >= 15, `sum spread ${spread}`);
  });

  it("DLT unique portfolio spans at least 3 odd/even profiles", () => {
    const out = E.generate("dlt", { count: 5, seed: 260821, mode: "unique", budgetYuan: 10 });
    const odds = new Set(out.tickets.map((t) => t.shape.odd));
    assert.ok(odds.size >= 3, `odd variety ${odds.size}: ${[...odds]}`);
  });

  it("DLT unique portfolio sum spread >= 15", () => {
    const out = E.generate("dlt", { count: 5, seed: 260821, mode: "unique", budgetYuan: 10 });
    const sums = out.tickets.map((t) => t.shape.sum);
    const spread = Math.max(...sums) - Math.min(...sums);
    assert.ok(spread >= 15, `sum spread ${spread}`);
  });

  it("two different seeds produce different shape profiles (not same face)", () => {
    const a = E.generate("ssq", { count: 5, seed: 260821, mode: "unique", budgetYuan: 10 });
    const b = E.generate("ssq", { count: 5, seed: 260822, mode: "unique", budgetYuan: 10 });
    const profile = (t) => `${t.shape.odd}|${t.shape.small}|${t.shape.run}|${Math.floor(t.shape.sum / 10)}`;
    assert.notDeepEqual(a.tickets.map(profile), b.tickets.map(profile));
  });

  it("cover mode also spans multiple odd profiles", () => {
    const out = E.generate("ssq", { count: 8, seed: 17, mode: "cover", budgetYuan: 16, poolSize: 10 });
    const odds = new Set(out.tickets.map((t) => t.shape.odd));
    assert.ok(odds.size >= 3, `cover odd variety ${odds.size}`);
  });
});
