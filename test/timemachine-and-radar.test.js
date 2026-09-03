"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;
before(() => {
  E = loadEngine();
});

describe("Radar Metrics and Time-Machine Backtest", () => {
  it("generates tickets with valid radar metrics", () => {
    const out = E.generate("ssq", { count: 5, seed: 100, mode: "unique" });
    assert.equal(out.tickets.length, 5);
    for (const t of out.tickets) {
      assert.ok(t.radar, "ticket has radar");
      assert.ok(t.radar.antiCrowd >= 0 && t.radar.antiCrowd <= 100);
      assert.ok(t.radar.balance >= 0 && t.radar.balance <= 100);
      assert.ok(t.radar.dispersion >= 0 && t.radar.dispersion <= 100);
      assert.ok(t.radar.coldHot >= 0 && t.radar.coldHot <= 100);
      assert.ok(t.radar.safety >= 0 && t.radar.safety <= 100);
      assert.ok(t.explain.tactic, "has tactical classification");
      assert.ok(Array.isArray(t.explain.traps), "has avoided traps");
    }
  });

  it("simulateTimeMachine runs walk-forward simulation across historical periods", () => {
    const res = E.simulateTimeMachine("ssq", { periods: 30, count: 5, seed: 888 });
    assert.equal(res.periods, 30);
    assert.equal(res.countPerPeriod, 5);
    assert.equal(res.totalCost, 30 * 5 * 2);
    assert.ok(res.points.length === 30);
    assert.ok(typeof res.hitRate === "number");
    assert.ok(res.hitRate >= 0 && res.hitRate <= 1);
    assert.ok(typeof res.totalReturn === "number");
  });

  it("simulateTimeMachine works on DLT", () => {
    const res = E.simulateTimeMachine("dlt", { periods: 20, count: 5, seed: 999 });
    assert.equal(res.periods, 20);
    assert.equal(res.totalCost, 20 * 5 * 2);
    assert.ok(res.points.length === 20);
  });
});
