"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;
before(() => {
  E = loadEngine();
});

function t(main, special) {
  return { main, special };
}

describe("complete SSQ prize matrix", () => {
  const draw = { main: [2, 8, 14, 19, 25, 31], special: [9] };

  const cases = [
    [[2, 8, 14, 19, 25, 31], [9], 1],
    [[2, 8, 14, 19, 25, 31], [1], 2],
    [[2, 8, 14, 19, 25, 3], [9], 3],
    [[2, 8, 14, 19, 25, 3], [1], 4],
    [[2, 8, 14, 19, 4, 5], [9], 4],
    [[2, 8, 14, 19, 4, 5], [1], 5],
    [[2, 8, 14, 4, 5, 6], [9], 5],
    [[2, 8, 4, 5, 6, 7], [9], 6],
    [[1, 3, 4, 5, 6, 7], [1], 0],
  ];

  for (const [main, special, level] of cases) {
    it(`${main.join(",")} + ${special} => ${level}`, () => {
      assert.equal(E.evaluatePrize("ssq", t(main, special), draw), level);
    });
  }
});

describe("complete DLT prize matrix", () => {
  const draw = { main: [3, 9, 16, 22, 30], special: [4, 11] };
  const cases = [
    [[3, 9, 16, 22, 30], [4, 11], 1],
    [[3, 9, 16, 22, 30], [4, 5], 2],
    [[3, 9, 16, 22, 30], [1, 2], 3],
    [[3, 9, 16, 22, 1], [4, 11], 3],
    [[3, 9, 16, 22, 1], [4, 5], 4],
    [[3, 9, 16, 22, 1], [1, 2], 5],
    [[3, 9, 16, 1, 2], [4, 11], 5],
    [[3, 9, 16, 1, 2], [4, 5], 6],
    [[3, 9, 1, 2, 5], [4, 11], 6],
    [[3, 9, 16, 1, 2], [1, 2], 7],
    [[3, 9, 1, 2, 5], [4, 5], 7],
    [[3, 1, 2, 5, 6], [4, 11], 7],
    [[1, 2, 5, 6, 7], [4, 11], 7],
    [[1, 2, 5, 6, 7], [8, 9], 0],
  ];
  for (const [main, special, level] of cases) {
    it(`${main.join("/")} + ${special.join("/")} => ${level}`, () => {
      assert.equal(E.evaluatePrize("dlt", t(main, special), draw), level);
    });
  }
});

describe("budget leftover and zero budget", () => {
  it("reports leftoverYuan", () => {
    const out = E.generate("ssq", { count: 20, seed: 3, budgetYuan: 10 });
    assert.equal(out.tickets.length, 5);
    assert.equal(out.costYuan, 10);
    assert.equal(out.leftoverYuan, 0);
  });

  it("odd budget leaves 1 yuan", () => {
    const out = E.generate("dlt", { count: 10, seed: 4, budgetYuan: 9 });
    assert.equal(out.tickets.length, 4);
    assert.equal(out.costYuan, 8);
    assert.equal(out.leftoverYuan, 1);
  });

  it("budget below one ticket yields empty portfolio", () => {
    const out = E.generate("ssq", { count: 5, seed: 1, budgetYuan: 1 });
    assert.equal(out.tickets.length, 0);
    assert.equal(out.costYuan, 0);
    assert.equal(out.leftoverYuan, 1);
    assert.equal(out.honesty.jackpotOdds, 0);
  });
});

describe("comb and overlap helpers", () => {
  it("comb matches known lottery sizes", () => {
    assert.equal(E.comb(33, 6), 1107568);
    assert.equal(E.comb(35, 5), 324632);
    assert.equal(E.comb(12, 2), 66);
    assert.equal(E.comb(5, 0), 1);
    assert.equal(E.comb(5, 6), 0);
  });

  it("overlap is symmetric and ignores order", () => {
    assert.equal(E.overlap([1, 2, 3], [3, 2, 9]), 2);
    assert.equal(E.overlap([], [1]), 0);
  });
});
