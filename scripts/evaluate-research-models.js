"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Models = require("../research-models");
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const sampleFlag = args.find(arg => arg.startsWith("--bootstrap-samples="));
const requestedBootstrapSamples = sampleFlag ? Number(sampleFlag.split("=")[1]) : null;
if (requestedBootstrapSamples !== null && (!Number.isInteger(requestedBootstrapSamples) || requestedBootstrapSamples < 200)) throw new RangeError("bootstrap-samples must be an integer >= 200");
if (args.some(arg => arg.startsWith("--") && arg !== sampleFlag)) throw new Error("Unknown evaluation option");
const input = path.resolve(root, args.find(arg => !arg.startsWith("--")) || "data/research/football-history.json");
const target = path.join(root, "docs/testing/model-tournament.json");
let records = [], inputSha256 = null, inputSnapshotPath = null, inputByteLength = null, sourceStatus = "MISSING_HISTORY";
if (fs.existsSync(input)) {
  const raw = fs.readFileSync(input), parsed = JSON.parse(raw.toString("utf8"));
  records = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(records)) throw new TypeError("History source must contain a records array");
  inputSha256 = crypto.createHash("sha256").update(raw).digest("hex");
  const snapshot = path.join(root, "docs/testing/model-tournament-inputs", inputSha256 + ".json");
  fs.mkdirSync(path.dirname(snapshot), { recursive: true });
  try { fs.writeFileSync(snapshot, raw, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  // Never overwrite a prior receipt, including when replaying this same snapshot.
  if (!fs.readFileSync(snapshot).equals(raw)) throw new Error("Existing input snapshot does not match its content-addressed bytes");
  inputSnapshotPath = path.relative(root, snapshot).replace(/\\/g, "/");
  inputByteLength = raw.length;
  sourceStatus = records.length ? "AVAILABLE_RETROSPECTIVE_HISTORY" : "EMPTY_HISTORY";
}
const grouped = new Map();
function sourceFamily(sourceId) {
  if (/^espn-eng1-(?:\d{4}|current)$/.test(sourceId)) return "espn-eng1";
  if (/^500-jingcai(?:-results-\d+)?$/.test(sourceId)) return "500-jingcai";
  return sourceId;
}
for (const record of records) {
  const sourceId = sourceFamily(record.source && record.source.sourceId || "unspecified-source");
  if (!grouped.has(sourceId)) grouped.set(sourceId, []);
  grouped.get(sourceId).push(record);
}
if (!grouped.size) grouped.set("unspecified-source", []);
const plannedPairs = Models.MODEL_IDS.reduce((sum, model) => sum + ["uniform", "historical", "market"].filter(baseline => baseline !== model && Models.MODEL_IDS.includes(baseline)).length, 0);
const plannedFamily = (plannedPairs * 2 + Models.MODEL_IDS.length * Models.DECISION_POLICIES.length * 4) * grouped.size;
const minimumBootstrapSamples = Math.ceil(20 * plannedFamily / 0.05);
const bootstrapSamples = requestedBootstrapSamples === null ? minimumBootstrapSamples : Math.max(requestedBootstrapSamples, minimumBootstrapSamples);
const sourceDeduplication = [];
for (const [sourceId, sourceRecords] of grouped) {
  const events = new Map();
  const facts = r => JSON.stringify([r.kickoffAt, r.homeTeam, r.awayTeam, r.homeGoals, r.awayGoals, r.competition || "", r.odds && [r.odds.home, r.odds.draw, r.odds.away]]);
  for (const record of sourceRecords) {
    if (events.has(record.eventId) && facts(events.get(record.eventId)) !== facts(record)) throw new Error("Conflicting duplicate event in source family " + sourceId + ": " + record.eventId);
    if (!events.has(record.eventId)) events.set(record.eventId, record);
  }
  sourceDeduplication.push({ sourceId, inputRecords: sourceRecords.length, uniqueEvents: events.size, identicalDuplicatesRemoved: sourceRecords.length - events.size });
  grouped.set(sourceId, [...events.values()].sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt)));
}
// Each source is an independent sensitivity analysis, never pooled duplicate matches.
const tournaments = [...grouped].map(([sourceId, sourceRecords]) => ({ sourceId, ...Models.walkForward(sourceRecords, { familyMultiplier: grouped.size, paperRuleAssumption: Models.PAPER_RULE_ID, evThreshold: 1.05, bootstrapSamples }) }));
const report = {
  generatedAt: new Date().toISOString(),
  source: { path: path.relative(root, input), snapshotPath: inputSnapshotPath, sha256: inputSha256, byteLength: inputByteLength, status: sourceStatus },
  modelSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "research-models.js"))).digest("hex"),
  reproducibility: "node scripts/evaluate-research-models.js [history.json] [--bootstrap-samples=N]; deterministic model grid and bootstrap seed; no network calls",
  reproduceCommand: inputSnapshotPath ? "node scripts/evaluate-research-models.js " + inputSnapshotPath + " --bootstrap-samples=" + bootstrapSamples : null,
  bootstrapSamples,
  status: "PENDING_PROSPECTIVE_CONFIRMATION", predictiveAdvantageEstablished: false,
  evidenceClass: "retrospective", version: Models.VERSION, modelIds: Models.MODEL_IDS,
  paperRuleAssumption: Models.PAPER_RULE_ID, decisionPolicies: Models.DECISION_POLICIES, evThreshold: 1.05,
  sourceDeduplication,
  records: records.length, evaluatedEvents: tournaments.reduce((s, t) => s + t.evaluatedEvents, 0),
  sourcePolicy: "Explicit source families: espn-eng1-YEAR/current -> espn-eng1; 500-jingcai/results-N -> 500-jingcai. Other providers remain separate. Same-family identical event IDs are deduplicated; conflicting facts fail. Cross-provider overlapping events never pool. Bonferroni counts planned comparisons across every source; repeated observations are not independent confirmation.",
  tournaments,
  comparisons: tournaments.flatMap(t => t.comparisons.map(c => ({ sourceId: t.sourceId, ...c }))),
  returns: tournaments.flatMap(t => t.returns.map(r => ({ sourceId: t.sourceId, ...r }))),
};
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output: target, status: report.status, sourceStatus, records: report.records, evaluatedEvents: report.evaluatedEvents, comparisons: report.comparisons.length, predictiveAdvantageEstablished: report.predictiveAdvantageEstablished }, null, 2));
