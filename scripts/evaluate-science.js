"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const E = require("../engine");
const Science = require("../scientific-evaluation");

const root = path.resolve(__dirname, "..");
if (typeof E.generateFromHistory !== "function") throw new Error("Engine must expose generateFromHistory for isolated past-only evaluation");
const sources = [];
const reports = ["ssq", "dlt"].map(gameId => {
  const relativePath = "data/" + gameId + "_history.json";
  const raw = fs.readFileSync(path.join(root, relativePath), "utf8");
  const draws = JSON.parse(raw).reverse();
  sources.push({ path: relativePath, sha256: crypto.createHash("sha256").update(raw).digest("hex"), draws: draws.length, latestDate: draws[draws.length - 1].date });
  return Science.walkForward({
    gameId, draws, periods: 100, count: 5, seeds: [1701, 2903, 4109],
    strategyName: "engine unique mode, default filters, smartPool=false; fixed before this evaluation",
    strategy: ({ gameId, history, count, seed }) => E.generateFromHistory(gameId, { count, seed, mode: "unique", smartPool: false }, history.slice().reverse()),
    evaluatePrize: E.evaluatePrize,
    prizeEstimates: E.PRIZE_ESTIMATES[gameId],
  });
});
const report = {
  generatedAt: new Date().toISOString(),
  engineSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "engine.js"))).digest("hex"),
  sources, reproducibility: "node scripts/evaluate-science.js; fixed seeds. generatedAt is metadata only.",
  status: "EXPLORATORY_ONLY_NO_PREDICTIVE_ADVANTAGE_ESTABLISHED", reports,
  sports: Science.compareSportsProbabilities([]),
};
const target = path.join(root, "docs", "testing", "scientific-evaluation.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: target, status: report.status, reports: reports.map(({ gameId, periods, summary, estimatedNetDifference, hitDifference }) => ({ gameId, periods, summary, estimatedNetDifference, hitDifference })), sports: report.sports }, null, 2));
