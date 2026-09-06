"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Sources = require("./research-sources");
const Models = require("./research-models");
const { createLedger } = require("./research-ledger");

const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const family = id => id.startsWith("espn-eng1-") ? "espn-eng1" : id.startsWith("500-jingcai") ? "500-jingcai" : id;
const read = (file, fallback = null) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } };
function atomic(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + "." + crypto.randomUUID() + ".tmp"; fs.writeFileSync(tmp, text, { flag: "wx" }); fs.renameSync(tmp, file); }
function json(file, value) { atomic(file, JSON.stringify(value, null, 2) + "\n"); }
function acquireLock(directory) {
  const file = path.join(directory, "daily.lock");
  const value = { pid: process.pid, token: crypto.randomUUID(), startedAt: new Date().toISOString() };
  // Serialize acquisition AND dead-owner recovery. Without this guard a second
  // recovery process can rename the first process's newly acquired live lock.
  const guard = path.join(directory, "daily-acquire.lock");
  try { fs.writeFileSync(guard, JSON.stringify(value), { flag: "wx" }); }
  catch (e) { if (e.code === "EEXIST") throw new Error("Daily lock acquisition/recovery active; retry, or inspect an orphaned daily-acquire.lock"); throw e; }
  try {
    const previous = read(file);
    if (previous) {
      if (!Number.isInteger(previous?.pid) || previous.pid < 1) throw new Error("Invalid daily lock; inspect before recovery");
      try { process.kill(previous.pid, 0); throw new Error("Research daily run already active"); }
      catch (probe) { if (probe.code !== "ESRCH") throw probe; }
      fs.renameSync(file, file + ".recovered-" + crypto.randomUUID());
    }
    fs.writeFileSync(file, JSON.stringify(value), { flag: "wx" });
    return () => { if (read(file)?.token === value.token) fs.unlinkSync(file); };
  } finally { fs.unlinkSync(guard); }
}
function freezeProtocol(dataDir, protocol, now) {
  const fingerprint = sha(JSON.stringify(protocol));
  const codeHashes = Object.fromEntries(["research-daily.js", "research-sources.js", "research-models.js", "research-ledger.js", "research-promotion.js", "scripts/research-daily.js"].map(name => [name, sha(fs.readFileSync(path.join(__dirname, name)))]));
  const file = path.join(dataDir, "protocol-receipts", protocol.protocolId + ".json");
  const prior = read(file);
  if (prior) {
    if (prior.protocolSha256 !== fingerprint || JSON.stringify(prior.codeHashes) !== JSON.stringify(codeHashes)) throw new Error("Registered protocol/code changed: create a new reviewed protocolId before new forecasts");
    return prior;
  }
  const receipt = { protocolId: protocol.protocolId, registeredAt: now, protocolSha256: fingerprint, codeHashes, protocol, scope: "Local immutable preregistration; no external trusted timestamp claim" };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  return receipt;
}
function choosePaperTrade(prediction, fixture, protocol) {
  if (!fixture.odds || fixture.salesOpen === false || (fixture.oddsKind?.startsWith("china-jingcai") && fixture.singleBetAvailable !== true)) return null;
  const expected = ["home", "draw", "away"].map((key, i) => prediction.probabilities[i] * fixture.odds[key]);
  const best = Math.max(...expected);
  if (best <= protocol.sports.paperDecision.minimumExpectedGrossReturn) return null;
  const winners = expected.map((value, i) => Math.abs(value - best) < 1e-12 ? i : -1).filter(i => i >= 0);
  return { selectionWeights: [0, 1, 2].map(i => winners.includes(i) ? 1 / winners.length : 0), stake: protocol.sports.paperStake, decisionPolicy: "ev-threshold" };
}
async function runDaily(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(__dirname, "data/research"));
  const reportDir = options.reportDir || path.join(__dirname, "docs/testing");
  const clock = options.now || (() => new Date());
  fs.mkdirSync(dataDir, { recursive: true });
  const unlock = acquireLock(dataDir);
  const startedAt = new Date(clock()).toISOString();
  const daily = { startedAt, createdPredictions: 0, createdResults: 0, createdSettlements: 0, createdRetractions: 0, skipped: [], errors: [] };
  let dashboard;
  try {
    const protocol = read(path.join(dataDir, "protocol.json"));
    if (!protocol || !/^[\w-]+$/.test(protocol.protocolId) || protocol.paperOnly !== true || !protocol.sports?.paperDecision || !protocol.sports.candidateFamily.every(id => Models.MODEL_IDS.includes(id))) throw new Error("Valid paper-only research protocol required");
    const receipt = freezeProtocol(dataDir, protocol, startedAt);
    const collected = await (options.collect || Sources.syncResearchSources)({ dataDir });
    const { records, fixtures, status } = collected;
    const ledger = createLedger({ directory: path.join(dataDir, "ledger"), now: clock });
    const existing = ledger.listPredictions();
    const keys = new Set(existing.map(r => [r.payload.protocolId, r.payload.match.eventId, r.payload.prediction.modelId, r.payload.windowId].join("|")));
    const sourceHealth = new Map(status.results.map(s => [s.sourceId, s]));
    for (const fixture of fixtures) {
      const now = +new Date(clock()), until = Date.parse(fixture.kickoffAt) - now;
      let reason = null;
      if (fixture.stale || sourceHealth.get(fixture.source.sourceId)?.status !== "ok") reason = "source_not_fresh";
      else if (until < protocol.sports.minimumMinutesToKickoff * 60000 || until > protocol.sports.maximumHoursToKickoff * 3600000) reason = "outside_registered_forecast_window";
      else if (fixture.salesOpen === false || (fixture.stopSellingAt && Date.parse(fixture.stopSellingAt) <= now)) reason = "sales_closed";
      else if (!Number.isFinite(Date.parse(fixture.source.fetchedAt)) || now - Date.parse(fixture.source.fetchedAt) > protocol.sports.maximumSourceAgeMinutes * 60000) reason = "source_observation_too_old";
      else if (!Models.marketProbabilities(fixture.odds)) reason = "complete_market_required_for_matched_forecast_batch";
      if (reason) { daily.skipped.push({ eventId: fixture.eventId, reason }); continue; }
      // Only genuinely available records enter a prospective forecast. The
      // retrospective kickoff+3h assumption is never used for this filter.
      const history = records.filter(r => family(r.source.sourceId) === family(fixture.source.sourceId) && r.competition === fixture.competition && Date.parse(r.source.fetchedAt) <= now && Date.parse(r.kickoffAt) < now).map(r => ({ ...r, resultRecordedAt: r.source.fetchedAt })).sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
      const batchFile = path.join(dataDir, "forecast-batches", protocol.protocolId, sha(fixture.eventId) + ".json");
      let batch = read(batchFile);
      if (!batch) {
        const inputs = [];
        try {
          for (const modelId of protocol.sports.candidateFamily) {
            const prediction = Models.predict(modelId, history, { ...fixture, oddsCapturedAt: fixture.oddsObservedAt });
            if (!prediction.probabilities) throw new Error("Incomplete matched forecast batch: " + modelId);
            prediction.trainingCutoff ||= new Date(now).toISOString();
            prediction.assumptions.push("Prospective receipt uses only results actually fetched before this forecast; zero-history models use explicit priors.");
            if (prediction.trainingCount === 0) prediction.assumptions.push("No same-source competition training history; statistical predictions are cold-start priors.");
            inputs.push({ protocolId: protocol.protocolId, windowId: protocol.sports.forecastWindow, match: fixture, source: fixture.source, oddsObservedAt: fixture.oddsObservedAt, prediction, paperTrade: choosePaperTrade(prediction, fixture, protocol) });
          }
          const batchId = sha(JSON.stringify(inputs));
          batch = { batchId, preparedAt: new Date(clock()).toISOString(), inputs: inputs.map(input => ({ ...input, batchId })) };
          fs.mkdirSync(path.dirname(batchFile), { recursive: true });
          // Publish full original information before committing individual
          // receipts; retry replays these inputs, never later market prices.
          const temp = batchFile + "." + crypto.randomUUID() + ".tmp";
          fs.writeFileSync(temp, JSON.stringify(batch, null, 2), { flag: "wx" });
          try { fs.linkSync(temp, batchFile); } finally { fs.unlinkSync(temp); }
        } catch (e) { daily.errors.push({ eventId: fixture.eventId, stage: "prepare_batch", error: e.message }); continue; }
      }
      for (const input of batch.inputs) {
        const modelId = input.prediction.modelId;
        const key = [protocol.protocolId, fixture.eventId, modelId, protocol.sports.forecastWindow].join("|");
        if (keys.has(key)) continue;
        try {
          ledger.recordPrediction(input);
          daily.createdPredictions++; keys.add(key);
        } catch (e) { daily.errors.push({ eventId: fixture.eventId, modelId, error: e.message }); }
      }
    }
    const predictions = ledger.listPredictions(), watched = new Set(predictions.map(r => r.payload.match.eventId));
    const priorResults = ledger.listResults();
    const retractions = ledger.listRetractions();
    for (const fixture of fixtures.filter(f => watched.has(f.eventId) && !f.stale && sourceHealth.get(f.source.sourceId)?.status === "ok")) {
      const previous = priorResults.filter(r => r.payload.match.eventId === fixture.eventId).sort((a, b) => a.payload.observedAt.localeCompare(b.payload.observedAt)).at(-1);
      if (!previous || Date.parse(fixture.source.fetchedAt) < Date.parse(previous.payload.observedAt)) continue;
      const old = retractions.filter(r => r.payload.eventId === fixture.eventId).sort((a, b) => a.payload.source.fetchedAt.localeCompare(b.payload.source.fetchedAt)).at(-1);
      if (old && old.payload.status === String(fixture.status || "source_no_longer_final") && Date.parse(old.payload.source.fetchedAt) >= Date.parse(previous.payload.observedAt)) continue;
      try {
        retractions.push(ledger.recordRetraction({ eventId: fixture.eventId, source: fixture.source, status: String(fixture.status || "source_no_longer_final"), reason: "Public source explicitly no longer reports a settled regulation-time result; original result is retained for audit" }));
        daily.createdRetractions++;
      } catch (e) { daily.errors.push({ eventId: fixture.eventId, stage: "retraction", error: e.message }); }
    }
    for (const record of records.filter(r => watched.has(r.eventId) && !r.stale)) {
      const previous = priorResults.filter(r => r.payload.match.eventId === record.eventId).sort((a, b) => a.payload.observedAt.localeCompare(b.payload.observedAt)).at(-1);
      const withdrawal = retractions.filter(r => r.payload.eventId === record.eventId).sort((a, b) => a.payload.source.fetchedAt.localeCompare(b.payload.source.fetchedAt)).at(-1);
      const withdrawn = previous && withdrawal && Date.parse(withdrawal.payload.source.fetchedAt) >= Date.parse(previous.payload.observedAt);
      if (previous && !withdrawn && ["kickoffAt", "homeGoals", "awayGoals", "homeTeam", "awayTeam"].every(key => previous.payload.match[key] === record[key])) continue;
      try {
        const result = ledger.recordResult({ match: { ...record, status: "finished" }, source: record.source, revisionReason: previous ? "Public source supplied revised final facts; original observation retained" : undefined });
        priorResults.push(result); daily.createdResults++;
      } catch (e) { daily.errors.push({ eventId: record.eventId, stage: "result", error: e.message }); }
    }
    const settledKeys = new Set(ledger.listSettlements().map(r => r.payload.predictionId + "|" + r.payload.resultId));
    for (const prediction of predictions) {
      const result = priorResults.filter(r => r.payload.match.eventId === prediction.payload.match.eventId).sort((a, b) => a.payload.observedAt.localeCompare(b.payload.observedAt)).at(-1);
      if (!result || settledKeys.has(prediction.id + "|" + result.id)) continue;
      try {
        ledger.settlePrediction({ predictionId: prediction.id, resultId: result.id, paperRuleAssumption: protocol.sports.paperDecision.settlementAssumption });
        daily.createdSettlements++;
      } catch (e) { daily.errors.push({ eventId: prediction.payload.match.eventId, stage: "settlement", error: e.message }); }
    }
    const summary = ledger.summary();
    const { evaluatePromotion } = require("./research-promotion");
    const decisionFile = path.join(dataDir, "decisions", protocol.protocolId + ".json");
    const promotion = evaluatePromotion({ protocol: { ...protocol, registeredAt: receipt.registeredAt }, ledgerSummary: summary, previousDecision: read(decisionFile), now: new Date(clock()).toISOString() });
    // Persist partially locked cohorts too; another source awaiting results
    // must not cause an already decided cohort to be tested a second time.
    if (!read(decisionFile)?.locked) json(decisionFile, promotion);
    const ruleWatch = options.watchRules ? await options.watchRules({ dataDir }) : options.collect ? null : await require("./research-rule-watch").watchRules({ dataDir });
    daily.finishedAt = new Date(clock()).toISOString();
    daily.status = daily.errors.length ? "partial_failure" : status.status === "ok" ? "ok" : "degraded";
    const tournament = read(path.join(reportDir, "model-tournament.json"));
    if (tournament) tournament.tournaments = tournament.tournaments.map(({ points, ...rest }) => rest);
    dashboard = { schemaVersion: 1, generatedAt: daily.finishedAt, protocol, registration: receipt, sources: status, data: { historyCount: records.length, fixtureCount: fixtures.length, bySource: status.results.map(s => ({ sourceId: s.sourceId, historyCount: s.records, fixtureCount: s.fixtures })) }, ledger: { ...summary, rows: undefined }, daily, promotion, sportsTournament: tournament, numberTournament: read(path.join(reportDir, "number-tournament.json")), recentPredictions: predictions.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 50), recentSettlements: ledger.listSettlements().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 50), rules: read(path.join(dataDir, "rules-registry.json")), execution: "paper_only", limitations: ["Historical reconstruction and local prospective receipts are separate evidence.", "Paper returns use an explicit fixed-decimal assumption; secondary quotes do not prove executable official prices or winning tickets."] };
    dashboard.ruleWatch = ruleWatch;
    if (ruleWatch?.status === "degraded" && daily.status === "ok") daily.status = "degraded";
    json(path.join(dataDir, "dashboard.json"), dashboard);
    atomic(path.join(dataDir, "dashboard.js"), "window.RESEARCH_DASHBOARD = " + JSON.stringify(dashboard).replace(/</g, "\\u003c") + ";\n");
    json(path.join(dataDir, "runs", daily.finishedAt.replace(/[:.]/g, "-") + "-" + crypto.randomUUID() + ".json"), { ...daily, protocolReceipt: receipt, data: dashboard.data, ledger: { predictions: summary.predictionCount, resultVersions: summary.resultVersionCount, settlementVersions: summary.settlementVersionCount }, promotion });
    return dashboard;
  } catch (e) {
    json(path.join(dataDir, "last-failure.json"), { startedAt, failedAt: new Date(clock()).toISOString(), error: e.message, priorDashboardPreserved: true });
    throw e;
  } finally { unlock(); }
}
module.exports = { runDaily, choosePaperTrade, acquireLock, freezeProtocol, family };
