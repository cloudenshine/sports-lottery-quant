"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");
const E = loadEngine();

test("exact prize probabilities normalize and preserve jackpot combinatorics", () => {
  for (const id of ["ssq", "dlt"]) {
    const p = E.prizeProbabilities(id);
    assert.ok(Math.abs(Object.values(p).reduce((a,b) => a+b, 0) - 1) < 1e-12);
    assert.equal(p[1], 1 / E.GAMES[id].universeFull);
  }
  const ev = E.evaluateDynamicEV("dlt", 0, false);
  assert.equal(ev.payoutAssumptions[7], 5);
  assert.equal(E.evaluateDynamicEV("dlt", 800000000, false).payoutAssumptions[7], 7);
});

test("duplicate and permuted tickets do not increase distinct outcome coverage", () => {
  const ticket = { main:[1,2,3,4,5], special:[1,2] };
  const copy = { main:[5,4,3,2,1], special:[2,1] };
  const a = E.portfolioCoverage("dlt", [ticket]);
  const b = E.portfolioCoverage("dlt", [ticket, copy]);
  assert.deepEqual(a, b);
  assert.equal(a.sixth.p, 1/66);
  assert.equal(E.portfolioCoverage("dlt", [ticket, {main:[6,7,8,9,10], special:[3,4]}]).sixth.p, 2/66);
});

test("known binary Kelly result uses net return per unit and never creates money", () => {
  const result = E.computeKellyPosition(0.1, 0.55, 100);
  assert.ok(Math.abs(result.kellyFraction - 0.1) < 1e-12);
  assert.equal(E.computeKellyPosition(0.1, 0.55, 0).suggestedSpend, 0);
  assert.ok(E.computeKellyPosition(0.1, 0.55, 1).suggestedSpend <= 0.1);
  assert.throws(() => E.computeKellyPosition(NaN, 0.5, 100));
});

test("generation validates count, budget, pool sizes and seed zero is reproducible", () => {
  for (const options of [{count:NaN},{count:2.5},{budgetYuan:-1},{budgetYuan:Infinity},{budgetYuan:NaN},{mode:"cover",poolSize:36}]) {
    assert.throws(() => E.generate("ssq", options));
  }
  const options = {count:3, seed:0};
  assert.deepEqual(E.generate("ssq",options).tickets, E.generate("ssq",options).tickets);
  assert.equal(E.generate("ssq", {count:0}).costYuan, 0);
  const infeasible = E.generate("ssq", {count:1, seed:1, filters:{sumMin:10000}});
  assert.equal(infeasible.tickets.length, 0);
  assert.equal(infeasible.complete, false);
  assert.equal(infeasible.requestedCount, 1);
  assert.ok(E.expandDanTuo("ssq",[1],[2,3,4,5,6],[17]).error);
  assert.ok(E.generateWheel("ssq",[1,2,3,4,5,6,7,8],"ssq_8_6_6_5",[1],{budgetYuan:1}).error);
  assert.throws(() => E.evaluatePrize("ssq",{main:[1,1,1,1,1,1],special:[1]}, E.analyze("ssq").last));
});

test("provided history generation is isolated from ambient future records", () => {
  const history = E.analyze("ssq").draws.slice(30, 100);
  const options = {count:3,seed:7,smartPool:true};
  const before = E.generateFromHistory("ssq", options, history).tickets;
  const saved = global.SSQ_DRAWS;
  try {
    global.SSQ_DRAWS = [[1,2,3,4,5,6,1]];
    assert.deepEqual(E.generateFromHistory("ssq", options, history).tickets, before);
  } finally { global.SSQ_DRAWS = saved; }
});

test("time machine selection ignores target and all later records in ordinary and wheel modes", () => {
  const saved = global.SSQ_DRAWS;
  try {
    global.SSQ_DRAWS = saved.slice(0, 75);
    for (const mode of ["unique", "wheel"]) {
      const options = {periods:10,count:2,seed:8,mode,smartPool:true,wheelKey:"ssq_8_6_6_5"};
      const before = E.simulateTimeMachine("ssq", options).points[0].tickets.map(t => ({main:t.main,special:t.special}));
      const original = global.SSQ_DRAWS;
      global.SSQ_DRAWS = original.map((row,i) => i < 10 ? [1,2,3,4,5,6,1] : row);
      const after = E.simulateTimeMachine("ssq", options).points[0].tickets.map(t => ({main:t.main,special:t.special}));
      assert.deepEqual(after, before);
      global.SSQ_DRAWS = original;
    }
  } finally { global.SSQ_DRAWS = saved; }
});

test("draw calendar is explicitly Beijing time on every host timezone", () => {
  assert.equal(E.getNextDrawInfo("ssq", "2026-09-06T12:00:00Z").nextDrawTime.toISOString(), "2026-09-06T13:15:00.000Z");
  assert.equal(E.getNextDrawInfo("ssq", "2026-09-06T14:00:00Z").nextDrawTime.toISOString(), "2026-09-08T13:15:00.000Z");
});

test("every advertised wheel bound is proved over every conditional outcome", () => {
  for (const key of Object.keys(E.WHEEL_DESIGNS)) {
    const certificate = E.verifyWheelDesign(key);
    assert.equal(certificate.verified, true, key);
    assert.equal(certificate.outcomes, E.comb(E.WHEEL_DESIGNS[key].poolSize, E.WHEEL_DESIGNS[key].conditionHits));
  }
  assert.equal(E.WHEEL_DESIGNS.ssq_10_6_6_5.minimumMainHits, 4);
  assert.equal(E.WHEEL_DESIGNS.dlt_8_5_5_4.minimumMainHits, 3);
});

test("draw injection validates complete numbers and does not discard repeated main numbers", () => {
  const saved = global.SSQ_DRAWS;
  const meta = global.SSQ_META;
  try {
    global.SSQ_DRAWS = [[1,2,3,4,5,6,1]];
    global.SSQ_META = {latestIssue:"2026001"};
    assert.ok(E.injectNewDraw("ssq",{issue:"2026002",main:[1,2,3,4,5,6],special:[2]}).success);
    assert.equal(global.SSQ_DRAWS.length, 2);
    assert.ok(E.injectNewDraw("ssq",{issue:"2026002",main:[1,2,3,4,5,6],special:[3]}).error);
    assert.ok(E.injectNewDraw("ssq",{main:[1,1,1,1,1,1],special:[2]}).error);
  } finally { global.SSQ_DRAWS = saved; global.SSQ_META = meta; }
});
