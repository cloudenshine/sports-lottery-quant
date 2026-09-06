"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../number-settlement");
const ssq = (issue = "2026014") => ({ gameId: "ssq", issue, main: [1, 2, 3, 4, 5, 6], special: [1], specialPrizeActive: false, payouts: { base: { 1: 10000000, 2: 123456, 3: 3000, 4: 200, 5: 10, 6: 5, fortune: 5 } }, winners: { base: { 1: 2, 2: 100 } } });
const dlt = (issue = "26014") => ({ gameId: "dlt", issue, main: [1, 2, 3, 4, 5], special: [1, 2], payouts: { base: { 1: 10000000, 2: 123457, 3: 6666, 4: 380, 5: 200, 6: 18, 7: 7 } }, winners: { base: { 1: 2, 2: 100 } } });
function ticket(draw, h, b) {
  const out = { main: draw.main.slice(0, h), special: draw.special.slice(0, b) };
  for (let n = 1; out.main.length < draw.main.length; n++) if (!draw.main.includes(n)) out.main.push(n);
  for (let n = 1; out.special.length < draw.special.length; n++) if (!draw.special.includes(n)) out.special.push(n);
  return out;
}
test("number settlement normalizes both issue conventions and respects era boundaries", () => {
  assert.equal(S.normalizeIssue("26014"), "2026014");
  assert.equal(S.normalizeIssue("2026014"), "2026014");
  assert.equal(S.ruleForIssue("dlt", "19018").supported, false);
  assert.equal(S.ruleForIssue("dlt", "19019").levels, 9);
  assert.equal(S.ruleForIssue("dlt", "26013").levels, 9);
  assert.equal(S.ruleForIssue("dlt", "26014").levels, 7);
  assert.equal(S.ruleForIssue("ssq", "26013").fortunePossible, false);
  assert.equal(S.ruleForIssue("ssq", "26014").fortunePossible, true);
  for (const value of ["2026000", "2026367", "2601", "1999014", "2026-014", null]) assert.throws(() => S.normalizeIssue(value));
});
test("number settlement exhausts all 18 DLT hit patterns across both eras", () => {
  const expected9 = [[0, 0, 9], [0, 0, 9], [0, 9, 8], [9, 8, 6], [7, 5, 4], [3, 2, 1]];
  const expected7 = [[0, 0, 7], [0, 0, 7], [0, 7, 6], [7, 6, 5], [5, 4, 3], [3, 2, 1]];
  for (const [issue, expected] of [["19019", expected9], ["26013", expected9], ["26014", expected7]]) {
    for (let h = 0; h <= 5; h++) for (let b = 0; b <= 2; b++) assert.equal(S.prizeLevel({ gameId: "dlt", issue, mainHits: h, specialHits: b }), expected[h][b], `${issue}: ${h}+${b}`);
  }
});
test("number settlement exhausts SSQ highest-tier priority with optional fortune prize", () => {
  const before = [[0, 6], [0, 6], [0, 6], [0, 5], [5, 4], [4, 3], [2, 1]];
  for (let h = 0; h <= 6; h++) for (let b = 0; b <= 1; b++) {
    assert.equal(S.prizeLevel({ gameId: "ssq", issue: "26013", mainHits: h, specialHits: b }), before[h][b]);
    assert.equal(S.prizeLevel({ gameId: "ssq", issue: "26014", mainHits: h, specialHits: b, specialPrizeActive: true }), h === 3 && b === 0 ? "fortune" : before[h][b]);
  }
  const draw = ssq(); delete draw.specialPrizeActive;
  assert.equal(S.evaluateTicket({ gameId: "ssq", ticket: ticket(draw, 3, 0), draw }).status, "pending_payout");
  draw.specialPrizeActive = true;
  assert.equal(S.evaluateTicket({ gameId: "ssq", ticket: ticket(draw, 3, 0), draw }).grossYuan, 5);
});
test("number settlement uses published actual tier amount, never a default prize estimate", () => {
  const draw = dlt(); draw.payouts.base[3] = 4321;
  const result = S.evaluateTicket({ gameId: "dlt", ticket: ticket(draw, 5, 0), draw });
  assert.equal(result.grossYuan, 4321); assert.equal(result.netYuan, 4319); assert.equal(result.taxTreatment, "before_tax");
  delete draw.payouts.base[3];
  assert.equal(S.evaluateTicket({ gameId: "dlt", ticket: ticket(draw, 5, 0), draw }).grossYuan, null);
  assert.equal(S.evaluateTicket({ gameId: "dlt", ticket: ticket(draw, 0, 0), draw }).grossYuan, 0);
});
test("number settlement treats zero-winner floating prize placeholders as unidentified", () => {
  const draw = dlt(); draw.winners.base[1] = 0; draw.payouts.base[1] = 0;
  assert.equal(S.evaluateTicket({ gameId: "dlt", ticket: ticket(draw, 5, 2), draw }).status, "pending_payout");
  draw.payouts.base[1] = 10000000;
  assert.equal(S.evaluateTicket({ gameId: "dlt", ticket: ticket(draw, 5, 2), draw }).grossYuan, null);
  const baseline = S.uniformExpectedGross({ gameId: "dlt", draw });
  assert.equal(baseline.publishedPrizeTableExpectedGrossYuan, null); assert.ok(baseline.identifiedBounds.lowerYuan > 0); assert.equal(baseline.identifiedBounds.upperYuan, null);
});
test("number settlement prioritizes additional published payouts and labels derived 80 percent", () => {
  const draw = dlt(), input = { gameId: "dlt", ticket: ticket(draw, 5, 1), draw, additional: true };
  const inferred = S.evaluateTicket(input);
  assert.equal(inferred.additionalPayoutYuan, 98765); assert.equal(inferred.costYuan, 3); assert.match(inferred.additionalBasis, /derived/);
  draw.payouts.additional = { 2: 98764 };
  assert.equal(S.evaluateTicket(input).additionalPayoutYuan, 98764);
  draw.payouts.additional[2] = null;
  assert.equal(S.evaluateTicket(input).grossYuan, null);
  assert.equal(S.evaluateTicket({ ...input, ticket: ticket(draw, 3, 0) }).additionalPayoutYuan, 0);
  assert.throws(() => S.evaluateTicket({ gameId: "ssq", draw: ssq(), ticket: ticket(ssq(), 0, 0), additional: true }));
});
test("number settlement never reports a partial portfolio as a closed return", () => {
  const draw = dlt(); delete draw.payouts.base[1];
  const tickets = [ticket(draw, 5, 2), ticket(draw, 0, 2)];
  const result = S.settlePortfolio({ gameId: "dlt", draw, tickets, budgetYuan: 4 });
  assert.equal(result.closed, false); assert.equal(result.knownGrossYuan, 7); assert.equal(result.netYuan, null); assert.equal(result.pendingCount, 1); assert.equal(result.costYuan, 4);
  assert.throws(() => S.settlePortfolio({ gameId: "dlt", draw, tickets, budgetYuan: 3 }));
  assert.throws(() => S.settlePortfolio({ gameId: "dlt", draw, tickets, budgetYuan: NaN }));
  assert.equal(S.settlePortfolio({ gameId: "dlt", draw: dlt("19018"), tickets }).status, "unsupported_rules");
});
test("number settlement combinatorial baseline partitions the full universe exactly", () => {
  for (const [gameId, draw, universe] of [["ssq", ssq(), 17721088], ["dlt", dlt(), 21425712]]) {
    const result = S.uniformExpectedGross({ gameId, draw, count: 5 });
    assert.equal(result.universe, universe);
    assert.equal(result.patterns.reduce((sum, p) => sum + p.combinations, 0), universe);
    assert.equal(result.patterns.find(p => p.level === 1).combinations, 1);
    assert.ok(Math.abs(result.patterns.reduce((sum, p) => sum + p.probability, 0) - 1) < 1e-12);
    assert.equal(result.counterfactualExpectedGrossYuan, null);
    assert.equal(result.status, "identified_published_table_scenario");
    assert.ok(Math.abs(result.publishedPrizeTableExpectedGrossYuan - 5 * result.patterns.reduce((sum, p) => sum + p.probability * p.grossYuan, 0)) < 1e-12);
  }
});
test("number settlement rejects mismatched, unfinalized and malformed external records", () => {
  const draw = dlt();
  for (const changed of [{ ...draw, status: "scheduled" }, { ...draw, gameId: "ssq" }, { ...draw, main: [1, 1, 3, 4, 5] }, { ...draw, payouts: { base: { 1: NaN } } }]) assert.throws(() => S.evaluateTicket({ gameId: "dlt", draw: changed, ticket: ticket(draw, 0, 0) }));
  assert.throws(() => S.evaluateTicket({ gameId: "dlt", draw, ticket: { ...ticket(draw, 0, 0), issue: "26015" } }));
  assert.throws(() => S.prizeLevel({ gameId: "ssq", issue: "26014", mainHits: 7, specialHits: 0 }));
});
test("number settlement discloses separately listed promotion without adding unverified awards", () => {
  const draw = dlt(); draw.promotion = { eligibility: "unverified", payouts: { base: { 1: 10000000 } } };
  draw.payoutScope = "published_base_prizes_excluding_promotion";
  const ticket = { main: [...draw.main], special: [...draw.special] };
  const result = S.evaluateTicket({ gameId: "dlt", draw, ticket });
  assert.equal(result.grossYuan, 10000000); assert.match(result.reason, /promotional awards excluded/);
  assert.equal(result.promotions.eligibility, "unverified");
  assert.match(S.settlePortfolio({ gameId: "dlt", draw, tickets: [ticket] }).promotionDisclosure, /excluded/);
});
