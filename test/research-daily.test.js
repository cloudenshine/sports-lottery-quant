"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { spawnSync } = require("node:child_process");
const { runDaily, choosePaperTrade, acquireLock } = require("../research-daily");
const { createLedger } = require("../research-ledger");
const protocol = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/research/protocol.json"), "utf8"));
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "protocol.json"), JSON.stringify(protocol));
  let now = "2026-09-06T10:00:00.000Z";
  const source = () => ({ sourceId: "500-jingcai", sourceUrl: "https://example.org/source", bodySha256: "a".repeat(64), fetchedAt: now });
  const fixture = () => ({ eventId: "500:1", kickoffAt: "2026-09-06T12:00:00.000Z", homeTeam: "Home", awayTeam: "Away", competition: "League", odds: { home: 4, draw: 4, away: 4 }, oddsObservedAt: now, source: source(), singleBetAvailable: true, salesOpen: true, oddsKind: "china-jingcai-test" });
  const collection = { records: [], fixtures: [fixture()], status: { status: "ok", results: [{ sourceId: "500-jingcai", status: "ok", records: 0, fixtures: 1 }] } };
  const run = () => runDaily({ dataDir: dir, reportDir: dir, now: () => now, collect: async () => collection });
  return { dir, run, collection, fixture, source, advance: value => { now = value; } };
}
test("daily commits actual pregame predictions once, scores only later results and preserves restart idempotency", async t => {
  const f = setup(t);
  const first = await f.run();
  assert.equal(first.daily.createdPredictions, 7);
  assert.equal(first.ledger.predictionCount, 7);
  assert.equal(first.promotion.eligible, false);
  const repeat = await f.run();
  assert.equal(repeat.daily.createdPredictions, 0);
  f.advance("2026-09-06T15:00:00.000Z");
  f.collection.records = [{ ...f.fixture(), homeGoals: 2, awayGoals: 1 }];
  f.collection.fixtures = [];
  const settled = await f.run();
  assert.equal(settled.daily.createdResults, 1);
  assert.equal(settled.daily.createdSettlements, 7);
  assert.equal(settled.ledger.properScores.count, 7);
  assert.ok(settled.ledger.assumedPaperCount > 0);
  assert.equal(settled.ledger.settledPaperCount, 0);
  const again = await f.run();
  assert.equal(again.daily.createdResults, 0);
  assert.equal(again.daily.createdSettlements, 0);
  assert.equal(again.ledger.assumedPaperTotals.profit, settled.ledger.assumedPaperTotals.profit);
});
test("stale, closed, old-capture and post-kickoff fixtures never enter the prediction ledger", async t => {
  const f = setup(t), fixture = f.fixture();
  f.collection.fixtures = [
    { ...fixture, eventId: "stale", stale: true },
    { ...fixture, eventId: "closed", salesOpen: false },
    { ...fixture, eventId: "old", source: { ...f.source(), fetchedAt: "2026-09-06T08:00:00Z" } },
    { ...fixture, eventId: "past", kickoffAt: "2026-09-06T09:00:00Z" }
  ];
  const result = await f.run();
  assert.equal(result.ledger.predictionCount, 0);
  assert.equal(result.daily.skipped.length, 4);
});
test("future observed results cannot affect prospective probabilities", async t => {
  const f = setup(t);
  f.collection.records = [{ ...f.fixture(), eventId: "earlier", kickoffAt: "2026-09-05T12:00:00Z", homeGoals: 99, awayGoals: 0, source: { ...f.source(), fetchedAt: "2026-09-06T11:00:00Z" } }];
  const output = await f.run();
  assert.ok(output.recentPredictions.every(p => p.payload.prediction.trainingCount === 0));
});
test("registered protocol mutation stops new records and preserves last successful dashboard", async t => {
  const f = setup(t); await f.run();
  const before = fs.readFileSync(path.join(f.dir, "dashboard.json"), "utf8");
  fs.writeFileSync(path.join(f.dir, "protocol.json"), JSON.stringify({ ...protocol, numbers: {} }));
  await assert.rejects(f.run(), /Registered protocol\/code changed/);
  assert.equal(fs.readFileSync(path.join(f.dir, "dashboard.json"), "utf8"), before);
  assert.equal(fs.existsSync(path.join(f.dir, "daily.lock")), false);
  assert.ok(fs.existsSync(path.join(f.dir, "last-failure.json")));
});
test("live daily lock forbids concurrent run and releasing it permits retry", t => {
  const f = setup(t), unlock = acquireLock(f.dir);
  assert.throws(() => acquireLock(f.dir), /already active/);
  unlock(); const second = acquireLock(f.dir); second();
});
test("EV policy respects single eligibility, holds cash and randomizes tied choices analytically", () => {
  const p = { probabilities: [1 / 3, 1 / 3, 1 / 3] };
  const f = { odds: { home: 4, draw: 4, away: 4 }, oddsKind: "china-jingcai-test", singleBetAvailable: true };
  assert.deepEqual(choosePaperTrade(p, f, protocol).selectionWeights, p.probabilities);
  assert.equal(choosePaperTrade(p, { ...f, singleBetAvailable: false }, protocol), null);
  assert.equal(choosePaperTrade(p, { ...f, odds: { home: 2, draw: 2, away: 2 } }, protocol), null);
});
test("missing market waits for a complete same-information batch; interrupted batch replays original prices", async t => {
  const f = setup(t);
  f.collection.fixtures[0].odds = null;
  assert.equal((await f.run()).ledger.predictionCount, 0);
  f.collection.fixtures[0] = f.fixture();
  const first = await f.run();
  const original = first.recentPredictions.find(r => r.payload.prediction.modelId === "market");
  // Simulate a crash before this individual receipt was published. Only the
  // temporary fixture directory is changed, never an actual research ledger.
  fs.unlinkSync(path.join(f.dir, "ledger/predictions", original.id + ".json"));
  f.advance("2026-09-06T10:05:00.000Z");
  f.collection.fixtures[0] = { ...f.fixture(), odds: { home: 2, draw: 3, away: 7 } };
  const resumed = await f.run();
  const restored = resumed.recentPredictions.find(r => r.payload.prediction.modelId === "market");
  assert.deepEqual(restored.payload, original.payload);
  assert.equal(new Set(resumed.recentPredictions.map(r => r.payload.batchId)).size, 1);
});
test("withdrawn result leaves totals, and a later identical final restores them without double counting", async t => {
  const f = setup(t); await f.run();
  f.advance("2026-09-06T15:00:00.000Z");
  f.collection.records = [{ ...f.fixture(), homeGoals: 2, awayGoals: 1 }]; f.collection.fixtures = [];
  const final = await f.run();
  f.advance("2026-09-06T15:05:00.000Z");
  f.collection.records = []; f.collection.fixtures = [{ ...f.fixture(), status: "postponed", salesOpen: false }];
  const withdrawn = await f.run();
  assert.equal(withdrawn.daily.createdRetractions, 1);
  assert.equal(withdrawn.ledger.properScores.count, 0);
  assert.equal(withdrawn.ledger.assumedPaperTotals.profit, 0);
  assert.equal((await f.run()).daily.createdRetractions, 0);
  f.advance("2026-09-06T15:10:00.000Z");
  f.collection.records = [{ ...f.fixture(), homeGoals: 2, awayGoals: 1 }]; f.collection.fixtures = [];
  const restored = await f.run();
  assert.equal(restored.daily.createdResults, 1);
  assert.equal(restored.ledger.properScores.count, 7);
  assert.equal(restored.ledger.assumedPaperTotals.profit, final.ledger.assumedPaperTotals.profit);
});
test("daily persists decisions before every cohort has locked", async t => {
  const f = setup(t); const output = await f.run();
  const saved = JSON.parse(fs.readFileSync(path.join(f.dir, "decisions", protocol.protocolId + ".json"), "utf8"));
  assert.equal(saved.locked, false);
  assert.deepEqual(saved, output.promotion);
});
test("concurrent stale-lock recovery grants exactly one owner", async t => {
  const f = setup(t);
  const deadPid = Number(spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }).stdout);
  assert.throws(() => process.kill(deadPid, 0), { code: "ESRCH" });
  fs.writeFileSync(path.join(f.dir, "daily.lock"), JSON.stringify({ pid: deadPid, token: "dead-owner" }));
  const script = `const {parentPort,workerData}=require('node:worker_threads');
    let release; try {release=require(workerData.module).acquireLock(workerData.dir);parentPort.postMessage({ok:true});}
    catch(e){parentPort.postMessage({ok:false,error:e.message});}
    parentPort.on('message',()=>{if(release)release();parentPort.close();});`;
  const workers = [0, 1].map(() => new Worker(script, { eval: true, workerData: { module: path.resolve(__dirname, "../research-daily.js"), dir: f.dir } }));
  t.after(async () => { await Promise.all(workers.map(w => w.terminate())); });
  const reports = await Promise.all(workers.map(w => new Promise((resolve, reject) => { w.once("message", resolve); w.once("error", reject); })));
  assert.equal(reports.filter(r => r.ok).length, 1);
  for (const w of workers) w.postMessage("release");
});
