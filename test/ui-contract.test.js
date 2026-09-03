"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

describe("UI contract matches L0-L4 controls", () => {
  const ids = [
    "game",
    "mode",
    "count",
    "budget",
    "seed",
    "poolSize",
    "antiCrowd",
    "rejectFull",
    "rejectMain",
    "rotateSpecial",
    "kill4run",
    "sumMin",
    "sumMax",
    "acMin",
    "acMax",
    "spanMin",
    "spanMax",
    "run",
    "honesty",
    "dan",
    "tuo",
    "spec",
    "danBudget",
    "runDan",
    "view-dantuo",
    "view-plan",
    "view-stats",
  ];
  for (const id of ids) {
    it(`has #${id}`, () => {
      assert.match(html, new RegExp(`id="${id}"`));
    });
  }

  it("does not claim jackpot improvement", () => {
    assert.equal(/稳赚|必中大奖|提高一等奖命中率，都是真的/.test(html), false);
    assert.match(html, /不提高大奖概率/);
    assert.match(html, /若承诺提高一等奖命中率，都是在骗人/);
  });

  it("exposes dan-tuo budget lock copy", () => {
    assert.match(html, /超出预算会直接拒绝/);
  });
});
