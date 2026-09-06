"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./load-engine");

let E;
before(() => {
  E = loadEngine();
});

describe("Math Genius Module 1: Shannon Spatial Entropy (信息论与空间熵)", () => {
  it("calculates high entropy for well-dispersed tickets and low entropy for clumped tickets", () => {
    // 密集聚集号 (低熵注): 01, 02, 03, 04, 05, 06 (全部挤在第一箱 [1-8])
    const clumped = E.shannonEntropy([1, 2, 3, 4, 5, 6], 33);
    assert.equal(clumped.entropy, 0, "All numbers in one bin has 0 entropy");
    assert.equal(clumped.score, 0);

    // 完美离散号 (高熵注): 03, 07, 12, 18, 26, 32 (跨越4个箱)
    const dispersed = E.shannonEntropy([3, 7, 12, 18, 26, 32], 33);
    assert.ok(dispersed.entropy > 1.8, "Multi-bin distribution has high entropy");
    assert.ok(dispersed.score >= 90);
  });

  it("hardReject can filter out low-entropy tickets if minEntropy is set", () => {
    const ctx = E.analyze("ssq");
    const clumpedShape = E.ticketShape("ssq", [1, 2, 3, 4, 5, 6], [8], ctx);
    const reasons = E.hardReject("ssq", clumpedShape, ctx, { minEntropy: 50 });
    assert.ok(reasons.some(r => r.includes("香农空间熵过低")));
  });
});

describe("Math Genius Module 2: Steiner Systems & Fano Plane (斯坦纳三元系与块设计)", () => {
  it("verifies Steiner Fano Plane S(2,3,7) covering matrix", () => {
    const pool = [2, 7, 12, 17, 22, 27, 32];
    const res = E.generateWheel("ssq", pool, "steiner_fano_7_3", [9]);
    assert.equal(res.count, 7, "Fano plane has exactly 7 blocks");
    assert.equal(res.tickets.length, 7);
    
    // 验证每一对二元组 (Pair) 均在块中被高频紧覆盖
    const pairs = new Set();
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        pairs.add(pool[i] + "-" + pool[j]);
      }
    }
    const coveredPairs = new Set();
    for (const t of res.tickets) {
      for (let i = 0; i < t.main.length; i++) {
        for (let j = i + 1; j < t.main.length; j++) {
          coveredPairs.add(t.main[i] + "-" + t.main[j]);
        }
      }
    }
    assert.equal(coveredPairs.size, pairs.size, "Steiner system covers 100% of pairs lossless");
  });

  it("verifies Steiner Affine S(3,4,8) has exactly 14 tickets", () => {
    const pool = [1, 5, 9, 13, 17, 21, 25, 29];
    const res = E.generateWheel("ssq", pool, "steiner_affine_8_6", [6]);
    assert.equal(res.count, 14);
  });
});

describe("Math Genius Module 3: Dynamic EV & Kelly Criterion (动态期望值与凯利公式)", () => {
  it("calculates negative EV in ordinary periods and suggests defensive position", () => {
    // 平常期 25 亿奖池，无派奖
    const evOrdinary = E.evaluateDynamicEV("ssq", 2500000000, false);
    assert.equal(evOrdinary.isPositiveEV, false, "Ordinary lottery has negative EV");
    assert.ok(evOrdinary.netEV < 0);

    const kelly = E.computeKellyPosition(evOrdinary.netEV, 0.3, 1000);
    assert.equal(kelly.kellyFraction, 0, "Kelly prescribes 0 allocation when EV is negative");
    assert.equal(kelly.level, "DEFENSIVE");
  });

  it("does not fabricate promotion EV without published payout terms", () => {
    // 派奖期
    const evPromo = E.evaluateDynamicEV("ssq", 3000000000, true);
    const ordinary = E.evaluateDynamicEV("ssq", 3000000000, false);
    assert.equal(evPromo.totalEV, ordinary.totalEV);
    assert.equal(evPromo.actualEVKnown, false);
    assert.equal(evPromo.isPositiveEV, false);
  });
});

describe("Number list text export", () => {
  it("exports a reviewable text list without claiming an official terminal protocol", () => {
    const tickets = [
      { main: [3, 8, 12, 19, 25, 31], special: [9] },
      { main: [4, 7, 14, 20, 26, 33], special: [12] },
    ];
    const txt = E.exportTerminalTxt("ssq", tickets, { issue: "26102" });
    assert.ok(txt.includes("QUANT-LOTTO 号码文本清单（非销售终端导入协议）"));
    assert.ok(txt.includes("001 | 03 08 12 19 25 31 + 09"));
    assert.ok(txt.includes("002 | 04 07 14 20 26 33 + 12"));
    assert.ok(txt.includes("内容校验 FNV-1a/UTF-16:"));
    const changed = E.exportTerminalTxt("ssq", [{main:[1,8,12,19,25,31],special:[9]},tickets[1]], {issue:"26102"});
    const checksum = value => value.match(/UTF-16: ([0-9A-F]{8})/)[1];
    assert.notEqual(checksum(txt), checksum(changed));
  });
});

describe("Math Genius Module 5: Backtest Pipeline Controls (回测管线与香农/凯利对照实验)", () => {
  it("supports entropy-threshold and kelly-adapt in walk-forward backtesting", () => {
    // 运行带香农空间熵约束的回测
    const resEntropy = E.simulateTimeMachine("ssq", { periods: 10, count: 5, minEntropy: 60 });
    assert.ok(resEntropy.periods === 10);
    assert.ok(resEntropy.totalCost > 0);

    // 运行带凯利仓位自适应的回测
    const resKelly = E.simulateTimeMachine("ssq", { periods: 10, count: 5, kellyAdapt: true });
    assert.ok(resKelly.periods === 10);
    assert.equal(resKelly.totalCost, 0, "Unknown multi-prize return distribution cannot justify a Kelly stake");
  });
});

describe("Math Genius Module 6: Effective Action Ratio (有效作用占比多元对冲)", () => {
  it("reports exact repeat-class probabilities without forced historical quotas", () => {
    const out = E.generate("ssq", { count: 10, mode: "unique", seed: 999 });
    assert.equal(out.tickets.length, 10);
    
    // Repeat classes are descriptive; no fixed empirical quota is a prediction.
    const last = E.analyze("ssq").last;
    for (const t of out.tickets) {
      assert.ok(t.topologyRole.startsWith(E.overlap(t.main, last.main) + "重号"));
      assert.ok(t.explain.actionRatio.includes("理论概率"));
    }
  });
});
