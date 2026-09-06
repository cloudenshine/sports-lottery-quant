"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Crowd = require("../number-crowd-model");

const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "data", "numbers", "sources.json");
const outputPath = path.join(root, "data", "returns", "crowd-report.json");
const scriptPath = path.join(root, "data", "returns", "crowd-report.js");
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const inputHash = sha256(fs.readFileSync(inputPath));
const codeHash = sha256(fs.readFileSync(path.join(root, "number-crowd-model.js")));

function sourceEvidence(draws) {
  const sourceRows = draws.filter(row => row.source && row.source.sourceId && row.source.fetchedAt && row.source.bodySha256 && row.source.rawRef);
  return {
    records: draws.length,
    recordsWithSourceFields: sourceRows.length,
    sourceFieldsRequired: ["sourceId", "sourceUrl", "fetchedAt", "bodySha256", "rawRef"],
    sourceIds: Array.from(new Set(sourceRows.map(row => row.source.sourceId))).sort(),
    bodyHashes: Array.from(new Set(sourceRows.map(row => row.source.bodySha256))).sort(),
    fetchedAtRange: sourceRows.length ? { first: sourceRows.map(row => row.source.fetchedAt).sort()[0], last: sourceRows.map(row => row.source.fetchedAt).sort().at(-1) } : null
  };
}

function evaluateGame(gameId) {
  const draws = input.games[gameId] && input.games[gameId].draws;
  if (!Array.isArray(draws)) throw new Error("Missing draws for " + gameId);
  const model = Crowd.fit({ gameId, history: draws });
  const evaluation = Crowd.evaluate({ gameId, draws, trainMinimum: 200, holdout: 120 });
  const generated = Crowd.createPortfolio({ gameId, model, count: 5, seed: 0 });
  const { model: ignoredModel, ...portfolio } = generated;
  return { source: sourceEvidence(draws), model, evaluation, portfolio };
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "EXPLORATORY_CONDITIONAL_SHARING_PROXY",
  conclusion: "A sales and crowd-preference count model can rank a finite candidate set for a conditional sharing proxy. It cannot increase fair draw probability or establish reliable return advantage.",
  protocol: {
    model: "regularized Poisson; log(salesYuan / training median) fixed offset; intercept absorbs unknown ticket-unit conversion",
    target: "winners.base[1] + winners.additional[1] when present; first-prize co-winner count",
    trainMinimum: 200,
    holdout: 120,
    chronological: true,
    noHoldoutTuning: true,
    sharing: "E[1/(1+N)] = (1 - exp(-lambda)) / lambda for N~Poisson(lambda), with value 1 at lambda=0",
    interpretation: "conditional-sharing-proxy; not actual SSQ/DLT floating-prize EV"
  },
  input: { path: "data/numbers/sources.json", sha256: inputHash, generatedAt: input.generatedAt, sourceStatus: input.status },
  codeHashes: { "number-crowd-model.js": codeHash, "scripts/evaluate-number-crowd.js": sha256(fs.readFileSync(__filename)) },
  games: { ssq: evaluateGame("ssq"), dlt: evaluateGame("dlt") }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
const publicJson = JSON.stringify(report).replace(/</g, "\\u003c");
fs.writeFileSync(scriptPath, "window.NUMBER_CROWD_REPORT = " + publicJson + ";\n", "utf8");
console.log(JSON.stringify({ output: path.relative(root, outputPath), script: path.relative(root, scriptPath), status: report.status, games: Object.fromEntries(Object.entries(report.games).map(([gameId, game]) => [gameId, { records: game.source.records, holdout: game.evaluation.model.count, evaluation: game.evaluation.status, meanDevianceImprovement: game.evaluation.improvement.meanDeviance, meanLogscoreImprovement: game.evaluation.improvement.meanLogscore, converged: game.model.diagnostics.converged, overfitFlag: game.model.diagnostics.overfitFlag }])) }, null, 2));
