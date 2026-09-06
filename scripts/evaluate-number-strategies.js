"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Engine = require("../engine");
const Research = require("../number-research");
const root = path.resolve(__dirname, "..");
const sha256 = content => crypto.createHash("sha256").update(content).digest("hex");
const sources = [];
const reports = ["ssq", "dlt"].map(gameId => {
  const sourcePath = "data/" + gameId + "_history.json";
  const raw = fs.readFileSync(path.join(root, sourcePath), "utf8");
  const draws = JSON.parse(raw).reverse();
  sources.push({ path: sourcePath, sha256: sha256(raw), draws: draws.length, latestDate: draws.at(-1).date });
  return Research.runTournament({ gameId, draws, evaluatePrize: Engine.evaluatePrize, prizeEstimates: Engine.PRIZE_ESTIMATES[gameId] });
});
const report = { generatedAt: new Date().toISOString(), status: "EXPLORATORY_ONLY_NO_PREDICTIVE_ADVANTAGE_ESTABLISHED",
  reproducibility: "node scripts/evaluate-number-strategies.js; offline bundled historical snapshots; fixed protocol and seeds; generatedAt is metadata only.",
  protocol: Research.PROTOCOL, sources,
  codeHashes: Object.fromEntries(["engine.js", "scientific-evaluation.js", "number-research.js", "scripts/evaluate-number-strategies.js"].map(file => [file, sha256(fs.readFileSync(path.join(root, file)))])), reports };
const target = path.join(root, "docs", "testing", "number-tournament.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: target, status: report.status, results: reports.map(game => ({ gameId: game.gameId,
  strategies: game.reports.map(({ strategyId, summary, familyAdjustedNetDifference }) => ({ strategyId, summary, familyAdjustedNetDifference })) })) }, null, 2));
