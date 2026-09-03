"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;

before(() => {
  E = loadEngine();
});

function ticket(main, special) {
  return { main, special };
}

describe("L0 honesty layer", () => {
  it("exposes exact universe sizes", () => {
    assert.equal(E.GAMES.ssq.universeFull, 17721088);
    assert.equal(E.GAMES.dlt.universeFull, 21425712);
    assert.equal(E.GAMES.ssq.price, 2);
    assert.equal(E.GAMES.dlt.price, 2);
  });

  it("never claims jackpot odds improved by filtering", () => {
    const out = E.generate("ssq", { count: 5, seed: 11, budgetYuan: 10 });
    assert.ok(out.honesty);
    assert.equal(out.honesty.jackpotOdds, 5 / 17721088);
    assert.match(out.honesty.disclaimer, /不提高一等奖概率|先验不变|过滤不改变单注概率/);
    assert.equal(out.honesty.filterImprovesJackpot, false);
  });

  it("caps spend by budget and reports leftover", () => {
    const out = E.generate("ssq", { count: 20, seed: 3, budgetYuan: 10 });
    assert.ok(out.tickets.length <= 5);
    assert.equal(out.costYuan, out.tickets.length * 2);
    assert.ok(out.costYuan <= 10);
    assert.equal(out.budgetYuan, 10);
  });

  it("rejects unknown game instead of silently falling through", () => {
    assert.throws(() => E.generate("pl3", { count: 1, seed: 1 }), /unknown game|未知玩法/i);
  });
});

describe("L1 hard filters: consecutive / extremes / history", () => {
  it("kills 4-run and longer, keeps 3-run", () => {
    const ctx = E.analyze("ssq");
    const filters = E.defaultFilters("ssq");
    const four = E.ticketShape("ssq", [1, 2, 3, 4, 20, 33], [7]);
    const three = E.ticketShape("ssq", [1, 2, 3, 10, 20, 33], [7]);
    const five = E.ticketShape("ssq", [8, 9, 10, 11, 12, 30], [1]);
    assert.ok(E.hardReject("ssq", four, ctx, filters).some((r) => /4连/.test(r)));
    assert.ok(E.hardReject("ssq", five, ctx, filters).some((r) => /5连/.test(r)));
    assert.equal(
      E.hardReject("ssq", three, ctx, filters).some((r) => /连号/.test(r)),
      false
    );
  });

  it("kills all-odd, all-even, same-ending-4, strict arithmetic", () => {
    const ctx = E.analyze("ssq");
    const filters = E.defaultFilters("ssq");
    const allOdd = E.ticketShape("ssq", [1, 3, 5, 7, 9, 11], [2]);
    const allEven = E.ticketShape("ssq", [2, 4, 6, 8, 10, 12], [2]);
    const sameEnd = E.ticketShape("ssq", [1, 11, 21, 31, 8, 18], [3]);
    const arith = E.ticketShape("ssq", [1, 5, 9, 13, 17, 21], [4]);
    assert.ok(E.hardReject("ssq", allOdd, ctx, filters).length > 0);
    assert.ok(E.hardReject("ssq", allEven, ctx, filters).length > 0);
    assert.ok(E.hardReject("ssq", sameEnd, ctx, filters).some((r) => /同尾/.test(r)));
    assert.ok(E.hardReject("ssq", arith, ctx, filters).some((r) => /等差/.test(r)));
  });

  it("rejects exact full-history collision but not main-only by default", () => {
    const ctx = E.analyze("ssq");
    const filters = E.defaultFilters("ssq");
    const last = ctx.draws[0];
    const fullHit = E.ticketShape("ssq", last.main, last.special);
    const mainOnly = E.ticketShape("ssq", last.main, last.special[0] === 16 ? [1] : [16]);
    assert.ok(E.hardReject("ssq", fullHit, ctx, filters).some((r) => /全号/.test(r)));
    assert.equal(
      E.hardReject("ssq", mainOnly, ctx, filters).some((r) => /主号撞车/.test(r)),
      false
    );
    const strict = Object.assign({}, filters, { rejectExactMain: true });
    assert.ok(E.hardReject("ssq", mainOnly, ctx, strict).some((r) => /主号/.test(r)));
  });

  it("does not treat last-20 hot pool membership as a hard reject", () => {
    const ctx = E.analyze("ssq");
    const filters = E.defaultFilters("ssq");
    const last20Pool = new Set(ctx.last20.flatMap((d) => d.main));
    const fromPool = [];
    for (const n of last20Pool) {
      fromPool.push(n);
      if (fromPool.length === 6) break;
    }
    const shape = E.ticketShape("ssq", fromPool, [8]);
    const reasons = E.hardReject("ssq", shape, ctx, filters);
    assert.equal(reasons.some((r) => /热号|近20|热池/.test(r)), false);
  });

  it("walk-forward: default filters must pass >=80% of historical draws without peeking at the draw itself", () => {
    const ssq = E.walkForwardPassRate("ssq", E.defaultFilters("ssq"));
    const dlt = E.walkForwardPassRate("dlt", E.defaultFilters("dlt"));
    assert.ok(ssq.rate >= 0.8, `ssq walk-forward ${ssq.rate}`);
    assert.ok(dlt.rate >= 0.8, `dlt walk-forward ${dlt.rate}`);
    assert.ok(ssq.usedPriorContext, "must evaluate each draw with only prior history");
  });
});

describe("L2 anti-crowd: kill shapes not numbers", () => {
  it("scores birthday / lucky / copy-last as hot, not as hard reject", () => {
    const ctx = E.analyze("ssq");
    const filters = E.defaultFilters("ssq");
    const birthday = E.ticketShape("ssq", [1, 5, 9, 12, 18, 24], [2]);
    const crowd = E.crowdScore("ssq", birthday, ctx);
    assert.ok(crowd.heat >= 10);
    assert.ok(crowd.notes.some((n) => /生日/.test(n)));
    const reasons = E.hardReject("ssq", birthday, ctx, filters);
    assert.equal(reasons.some((r) => /生日/.test(r)), false);
  });

  it("copying last draw minus one number is treated as crowd, and overlap>=4 is hard-killed", () => {
    const ctx = E.analyze("ssq");
    const filters = E.defaultFilters("ssq");
    const last = ctx.last.main.slice().sort((a, b) => a - b);
    const clone4 = last.slice();
    const replacement = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !last.includes(n));
    clone4[5] = replacement;
    const shape = E.ticketShape("ssq", clone4, [1]);
    const overlap = E.overlap(shape.main, last);
    assert.ok(overlap >= 4);
    assert.ok(E.hardReject("ssq", shape, ctx, filters).some((r) => /上期|重叠/.test(r)));
  });

  it("unique mode refuses tickets with crowd heat above threshold", () => {
    const out = E.generate("ssq", { count: 8, seed: 99, mode: "unique", budgetYuan: 16 });
    assert.ok(out.tickets.length >= 3);
    for (const t of out.tickets) {
      assert.ok(t.crowd <= 40, `crowd ${t.crowd} ticket ${t.main}`);
    }
  });
});

describe("L3 portfolio: spread mains, rotate specials, cover small prizes", () => {
  it("unique tickets share at most 3 main numbers pairwise", () => {
    const out = E.generate("ssq", { count: 6, seed: 2026, mode: "unique", budgetYuan: 12 });
    assert.equal(out.tickets.length, 6);
    for (let i = 0; i < out.tickets.length; i++) {
      for (let j = i + 1; j < out.tickets.length; j++) {
        const o = E.overlap(out.tickets[i].main, out.tickets[j].main);
        assert.ok(o <= 3, `ticket ${i} and ${j} share ${o}`);
      }
    }
  });

  it("rotates SSQ blues so five tickets cover five distinct blues", () => {
    const out = E.generate("ssq", { count: 5, seed: 8, mode: "unique", budgetYuan: 10 });
    const blues = out.tickets.map((t) => t.special[0]);
    assert.equal(new Set(blues).size, 5);
    const cov = E.portfolioCoverage("ssq", out.tickets);
    assert.ok(Math.abs(cov.sixth.p - 5 / 16) < 1e-9);
  });

  it("cover mode uses a bounded main pool and spreads 3-subsets", () => {
    const out = E.generate("ssq", { count: 8, seed: 17, mode: "cover", budgetYuan: 16, poolSize: 10 });
    assert.ok(out.pool);
    assert.equal(out.pool.length, 10);
    for (const t of out.tickets) {
      assert.ok(t.main.every((n) => out.pool.includes(n)));
    }
    const cov = E.portfolioCoverage("ssq", out.tickets);
    assert.ok(cov.tripleCover >= 8);
  });

  it("DLT cover rotates back-area pairs and never repeats an identical pair", () => {
    const out = E.generate("dlt", { count: 6, seed: 21, mode: "cover", budgetYuan: 12 });
    const keys = out.tickets.map((t) => E.keyOf(t.special));
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("L4 dan-tuo and budget", () => {
  it("expands 2 dan + 8 tuo + 3 blues into C(8,4)*3 = 210 SSQ tickets", () => {
    const r = E.expandDanTuo("ssq", [3, 17], [1, 5, 9, 12, 20, 25, 28, 33], [2, 8, 16], { budgetYuan: 1000 });
    assert.equal(r.error, undefined);
    assert.equal(r.count, 210);
    assert.equal(r.costYuan, 420);
    assert.ok(r.tickets.every((t) => t.main.includes(3) && t.main.includes(17)));
  });

  it("refuses dan-tuo that exceeds budget instead of silently truncating without notice", () => {
    const r = E.expandDanTuo("ssq", [3, 17], [1, 5, 9, 12, 20, 25, 28, 33], [2, 8, 16], { budgetYuan: 20 });
    assert.ok(r.error);
    assert.match(String(r.error), /预算|budget/i);
    assert.equal(r.tickets.length, 0);
  });

  it("validates dan/tuo disjoint and counts", () => {
    const overlap = E.expandDanTuo("ssq", [1, 2], [2, 3, 4, 5, 6, 7], [1]);
    assert.ok(overlap.error);
    const tooMany = E.expandDanTuo("ssq", [1, 2, 3, 4, 5, 6, 7], [8], [1]);
    assert.ok(tooMany.error);
    const dlt = E.expandDanTuo("dlt", [1, 2], [3, 4, 5, 6, 7], [8, 9]);
    assert.equal(dlt.count, 10);
  });
});

describe("prize table adversarial cases", () => {
  const drawSsq = { main: [1, 2, 3, 4, 5, 6], special: [7] };
  const drawDlt = { main: [1, 2, 3, 4, 5], special: [6, 7] };

  it("SSQ: blue-only is 6th, 6+0 is 2nd, 5+1 is 3rd, 2+1 is 6th not 5th", () => {
    assert.equal(E.evaluatePrize("ssq", ticket([10, 11, 12, 13, 14, 15], [7]), drawSsq), 6);
    assert.equal(E.evaluatePrize("ssq", ticket([1, 2, 3, 4, 5, 6], [16]), drawSsq), 2);
    assert.equal(E.evaluatePrize("ssq", ticket([1, 2, 3, 4, 5, 16], [7]), drawSsq), 3);
    assert.equal(E.evaluatePrize("ssq", ticket([1, 2, 10, 11, 12, 13], [7]), drawSsq), 6);
    assert.equal(E.evaluatePrize("ssq", ticket([1, 2, 3, 10, 11, 12], [8]), drawSsq), 0);
    assert.equal(E.evaluatePrize("ssq", ticket([1, 2, 3, 4, 5, 6], [7]), drawSsq), 1);
  });

  it("DLT: 0+2 is 7th, 5+0 is 3rd, 4+2 is 3rd, 2+0 is miss", () => {
    assert.equal(E.evaluatePrize("dlt", ticket([10, 11, 12, 13, 14], [6, 7]), drawDlt), 7);
    assert.equal(E.evaluatePrize("dlt", ticket([1, 2, 3, 4, 5], [8, 9]), drawDlt), 3);
    assert.equal(E.evaluatePrize("dlt", ticket([1, 2, 3, 4, 10], [6, 7]), drawDlt), 3);
    assert.equal(E.evaluatePrize("dlt", ticket([1, 2, 10, 11, 12], [8, 9]), drawDlt), 0);
    assert.equal(E.evaluatePrize("dlt", ticket([1, 2, 3, 4, 5], [6, 7]), drawDlt), 1);
  });

  it("highest prize only: 6+1 is 1st not also 6th", () => {
    assert.equal(E.evaluatePrize("ssq", ticket([1, 2, 3, 4, 5, 6], [7]), drawSsq), 1);
  });
});

describe("generation integrity and determinism", () => {
  it("same seed yields identical tickets", () => {
    const a = E.generate("ssq", { count: 5, seed: 4242, mode: "unique", budgetYuan: 10 });
    const b = E.generate("ssq", { count: 5, seed: 4242, mode: "unique", budgetYuan: 10 });
    assert.deepEqual(
      a.tickets.map((t) => t.main.concat(t.special)),
      b.tickets.map((t) => t.main.concat(t.special))
    );
  });

  it("different seeds diverge", () => {
    const a = E.generate("dlt", { count: 4, seed: 1, budgetYuan: 8 });
    const b = E.generate("dlt", { count: 4, seed: 2, budgetYuan: 8 });
    assert.notDeepEqual(
      a.tickets.map((t) => t.main.join(",")),
      b.tickets.map((t) => t.main.join(","))
    );
  });

  it("generated tickets always pass hardReject", () => {
    for (const gameId of ["ssq", "dlt"]) {
      const out = E.generate(gameId, { count: 8, seed: 77, mode: "unique", budgetYuan: 16 });
      const ctx = out.ctx;
      for (const t of out.tickets) {
        const reasons = E.hardReject(gameId, t.shape, ctx, out.filters);
        assert.deepEqual(reasons, [], `${gameId} ${t.main} ${reasons}`);
        assert.equal(t.main.length, E.GAMES[gameId].mainCount);
        assert.equal(new Set(t.main).size, t.main.length);
        assert.ok(t.main.every((n) => n >= 1 && n <= E.GAMES[gameId].mainMax));
      }
    }
  });

  it("does not emit duplicate full tickets inside a portfolio", () => {
    const out = E.generate("ssq", { count: 10, seed: 5, mode: "structure", budgetYuan: 20 });
    const keys = out.tickets.map((t) => E.keyOf(t.main) + "+" + E.keyOf(t.special));
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("adversary: naive strategies the machine must beat on uniqueness", () => {
  it("birthday-style 1-31 pack is hotter than a generated unique ticket", () => {
    const ctx = E.analyze("ssq");
    const hot = E.crowdScore("ssq", E.ticketShape("ssq", [1, 8, 9, 16, 18, 24], [6]), ctx);
    const out = E.generate("ssq", { count: 1, seed: 13, mode: "unique", budgetYuan: 2 });
    assert.ok(out.tickets[0].crowd < hot.heat);
  });

  it("copy-last plus lucky numbers is rejected or high-heat", () => {
    const ctx = E.analyze("ssq");
    const last = ctx.last.main.slice();
    const copy = E.ticketShape("ssq", last, ctx.last.special);
    const reasons = E.hardReject("ssq", copy, ctx, E.defaultFilters("ssq"));
    assert.ok(reasons.length > 0);
  });
});
