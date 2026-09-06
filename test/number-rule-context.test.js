"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Context = require("../number-rule-context"), Settlement = require("../number-settlement");
function row(issue, poolYuan, extra = {}) { return { issue, gameId: "ssq", main: [1, 2, 3, 4, 5, 6], special: [1], poolYuan, specialPrizeActive: null, payouts: { base: { 6: 5 } }, source: { sourceUrl: "https://example.test/draw/" + issue, bodySha256: "a".repeat(64) }, ...extra }; }
test("number rule context official start and stop anchors retain distinct retrieval evidence", () => {
  const result = Context.enrichDraws({ gameId: "ssq", draws: [row("26076", 292048181), row("26014", 2876368081)] });
  assert.equal(result.draws[0].specialPrizeActive, true); assert.equal(result.draws[1].specialPrizeActive, false);
  assert.match(result.draws[1].specialPrizeEvidence.officialAnchor.access, /405/);
  assert.equal(result.draws[0].specialPrizeEvidence.officialAnchor.bodySha256.length, 64);
});
test("number rule context uses previous pool, inclusive activation and strict stopping hysteresis", () => {
  const draws = [row("26014", 1000000000), row("26015", 300000000), row("26016", 299999999), row("26017", 1000000000), row("26018", 1500000000), row("26019", 1499999999), row("26020", 500000000)];
  const result = Context.enrichDraws({ gameId: "ssq", draws });
  assert.deepEqual(result.draws.map(d => d.specialPrizeActive), [true, true, true, false, false, true, true]);
  assert.deepEqual(draws.map(d => d.specialPrizeActive), Array(7).fill(null));
  assert.equal(result.draws[3].specialPrizeEvidence.previousIssue, "2026016");
  assert.equal(result.draws[3].specialPrizeEvidence.previousPoolAfterDrawYuan, 299999999);
});
test("number rule context missing issue or pool/source breaks inherited state", () => {
  assert.equal(Context.enrichDraws({ gameId: "ssq", draws: [row("26014", 1000000000), row("26016", 1000000000)] }).draws[1].specialPrizeActive, null);
  for (const bad of [{ poolYuan: null }, { poolYuan: "1000000000" }, { source: {} }]) {
    const result = Context.enrichDraws({ gameId: "ssq", draws: [row("26014", 1000000000, bad), row("26015", 1000000000)] });
    assert.equal(result.draws[1].specialPrizeActive, null);
  }
  const crossYear = [row("26150", 1800000000), row("27001", 1800000000)];
  assert.equal(Context.enrichDraws({ gameId: "ssq", draws: crossYear }).draws[1].specialPrizeActive, null);
});
test("number rule context does not invent prize amounts or infer inactive from absent fortune row", () => {
  const draw = row("26014", 1000000000), result = Context.enrichDraws({ gameId: "ssq", draws: [draw] });
  assert.deepEqual(result.draws[0].payouts, draw.payouts);
  assert.equal(Settlement.evaluateTicket({ gameId: "ssq", draw: result.draws[0], ticket: { main: [1, 2, 3, 7, 8, 9], special: [2] } }).grossYuan, null);
  assert.equal(Context.enrichDraws({ gameId: "ssq", draws: [row("26055", 1000000000)] }).draws[0].specialPrizeActive, null);
});
test("number rule context published fortune row can restart a broken chain and conflicts become unknown", () => {
  const live = row("26055", 1000000000, { payouts: { base: { fortune: 5 } } });
  const result = Context.enrichDraws({ gameId: "ssq", draws: [live, row("26056", 1000000000)] });
  assert.deepEqual(result.draws.map(d => d.specialPrizeActive), [true, true]);
  const conflict = Context.enrichDraws({ gameId: "ssq", draws: [row("26075", 1700000000), row("26076", 1000000000)] });
  assert.equal(conflict.draws[1].specialPrizeActive, null); assert.equal(conflict.summary.conflicts.length, 1);
});
test("number rule context validates duplicate issues and is idempotent", () => {
  assert.throws(() => Context.enrichDraws({ gameId: "ssq", draws: [row("26014", 100), row("2026014", 100)] }));
  const a = Context.enrichDraws({ gameId: "ssq", draws: [row("26014", 1000000000), row("26015", 900000000)] });
  assert.deepEqual(Context.enrichDraws({ gameId: "ssq", draws: a.draws }), a);
  const conflict = Context.enrichDraws({ gameId: "ssq", draws: [row("26014", 1000000000, { specialPrizeActive: false })] });
  assert.deepEqual(Context.enrichDraws({ gameId: "ssq", draws: conflict.draws }), conflict);
});
