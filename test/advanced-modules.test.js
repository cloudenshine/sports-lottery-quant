"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;
before(() => {
  E = loadEngine();
});

describe("Advanced Module 1: Ticket Diagnostic & AI Scalpel", () => {
  it("diagnoses a bad ticket (4-run + birthday trap) and suggests AI optimization", () => {
    // 01 02 03 04 05 06 + 09 (4-run, all birthday, low sum=21)
    const res = E.diagnoseTicket("ssq", [1, 2, 3, 4, 5, 6], [9]);
    assert.ok(res.reject.length > 0, "detects hard reject");
    assert.ok(res.crowd.heat > 0, "detects crowd heat");
    assert.ok(res.healthScore < 60, "health score penalized");
    assert.ok(res.optimized, "provides AI optimization");
    assert.ok(res.optimized.main.length === 6);
    assert.ok(res.optimized.changeLog.length > 0);
  });

  it("diagnoses a healthy ticket and assigns high health score", () => {
    // 04 12 18 21 27 32 + 08
    const res = E.diagnoseTicket("ssq", [4, 12, 18, 21, 27, 32], [8]);
    assert.equal(res.reject.length, 0);
    assert.ok(res.healthScore >= 80);
  });
});

describe("Advanced Module 2: Omissions and Dynamics", () => {
  it("computes omissions and neighbor counts in ticket shape", () => {
    const ctx = E.analyze("ssq");
    assert.ok(Array.isArray(ctx.omissions));
    assert.ok(ctx.omissions.length >= 34);

    const shape = E.ticketShape("ssq", [1, 5, 10, 15, 20, 25], [6], ctx);
    assert.ok(Array.isArray(shape.omissions));
    assert.ok(shape.sumOmission >= 0);
    assert.ok(typeof shape.neighbors === "number");
  });
});

describe("Advanced Module 3: Lottery Wheels (Mathematical Design Matrix)", () => {
  it("generates 10-6-6-5 wheel for SSQ (14 tickets)", () => {
    const pool = [2, 5, 8, 12, 16, 19, 23, 27, 30, 33];
    const res = E.generateWheel("ssq", pool, "ssq_10_6_6_5", [8]);
    assert.equal(res.count, 14);
    assert.equal(res.tickets.length, 14);
    assert.equal(res.costYuan, 28);
    for (const t of res.tickets) {
      assert.equal(t.main.length, 6);
      assert.deepEqual(t.special, [8]);
    }
  });

  it("generates 8-5-5-4 wheel for DLT (4 tickets)", () => {
    const pool = [3, 7, 11, 18, 22, 26, 31, 35];
    const res = E.generateWheel("dlt", pool, "dlt_8_5_5_4", [4, 11]);
    assert.equal(res.count, 4);
    assert.equal(res.costYuan, 8);
  });

  it("rejects pool with incorrect number count", () => {
    const pool = [2, 5, 8];
    const res = E.generateWheel("ssq", pool, "ssq_10_6_6_5", [8]);
    assert.ok(res.error);
  });
});

describe("Advanced Module 4: DLT Zhuijia (3 Yuan)", () => {
  it("calculates 3 Yuan price for DLT when zhuijia is enabled", () => {
    const out = E.generate("dlt", { count: 5, budgetYuan: 20, zhuijia: true });
    assert.equal(out.unitPrice, 3);
    assert.equal(out.costYuan, 15); // 5 * 3 = 15
    assert.equal(out.leftoverYuan, 5); // 20 - 15 = 5
  });

  it("expandDanTuo respects zhuijia for DLT", () => {
    const res = E.expandDanTuo("dlt", [3, 12], [5, 18, 24, 30], [2, 8], { zhuijia: true });
    assert.equal(res.unitPrice, 3);
    assert.equal(res.costYuan, res.count * 3);
  });

  it("simulateTimeMachine handles zhuijia mode", () => {
    const res = E.simulateTimeMachine("dlt", { periods: 15, count: 5, zhuijia: true });
    assert.equal(res.isZhuijia, true);
    assert.equal(res.totalCost, 15 * 5 * 3);
  });
});
