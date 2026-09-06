"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Evaluation = require("../number-evaluation");
const root = path.resolve(__dirname, "..");
function main(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--input", "--output"].includes(argv[i]) || !argv[i + 1]) throw new RangeError("Usage: node scripts/evaluate-numbers-v2.js [--input snapshot.json] [--output report.json]");
    options[argv[i].slice(2)] = path.resolve(argv[i + 1]);
  }
  const input = options.input || path.join(root, "data", "numbers", "sources.json");
  const output = options.output || path.join(root, "docs", "testing", "numbers-v2-evaluation.json");
  const body = fs.readFileSync(input), source = JSON.parse(body.toString("utf8"));
  const report = { generatedAt: new Date().toISOString(), source: { inputPath: input, inputSha256: Evaluation.digest(source),
    inputBodySha256: crypto.createHash("sha256").update(body).digest("hex") }, ...Evaluation.evaluateAll({ games: source.games }) };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, decision: report.decision, games: Object.fromEntries(Object.entries(report.games).map(([id, game]) => [id, { periods: game.periods.length, status: game.status, inputSha256: game.inputSha256 }])) }, null, 2));
  return report;
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { main };
