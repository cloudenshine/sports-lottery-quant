"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;
before(() => {
  E = loadEngine();
});

describe("Real-time Draw Calendar and 15s Incremental Sync", () => {
  it("computes next draw schedule correctly for SSQ (Tuesday, Thursday, Sunday at 21:15)", () => {
    // 假设时间为周一 10:00 (2026-08-31)
    const monday = new Date("2026-08-31T10:00:00+08:00");
    const nextDraw = E.getNextDrawInfo("ssq", monday);
    assert.ok(nextDraw);
    assert.equal(nextDraw.dayOfWeek, 2, "Next draw is Tuesday");
    assert.equal(nextDraw.nextDrawTime.getHours(), 21);
    assert.equal(nextDraw.nextDrawTime.getMinutes(), 15);
    // 15秒延时同步目标
    assert.equal(nextDraw.syncTargetTime.getSeconds(), 15);
  });

  it("computes next draw schedule correctly for DLT (Monday, Wednesday, Saturday at 21:25)", () => {
    // 假设时间为周一 10:00
    const monday = new Date("2026-08-31T10:00:00+08:00");
    const nextDraw = E.getNextDrawInfo("dlt", monday);
    assert.ok(nextDraw);
    assert.equal(nextDraw.dayOfWeek, 1, "Next draw is Monday (today)");
    assert.equal(nextDraw.nextDrawTime.getHours(), 21);
    assert.equal(nextDraw.nextDrawTime.getMinutes(), 25);
  });

  it("injectNewDraw hot-injects newly opened draw into memory without reloading", () => {
    const initTotal = E.analyze("ssq").total;
    const newDraw = {
      issue: "26102",
      date: "2026-09-03",
      main: [1, 5, 12, 18, 24, 30],
      special: [9],
    };
    const res = E.injectNewDraw("ssq", newDraw);
    assert.ok(res.success);
    
    // 验证立即被底层识别
    const afterCtx = E.analyze("ssq");
    assert.equal(afterCtx.total, initTotal + 1);
    assert.deepEqual(afterCtx.last.main, [1, 5, 12, 18, 24, 30]);
    assert.deepEqual(afterCtx.last.special, [9]);
  });
});
