'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Models = require('./number-models');
const Settlement = require('./number-settlement');
const DEFAULT_DIR = path.join(__dirname, 'data', 'numbers');
const HOUR = 3600000;
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
function instant(value, label) {
  if (value instanceof Date) value = value.toISOString();
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid ' + label);
  const day = value.slice(0, 10);
  if (new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw new Error('Invalid ' + label);
  return Date.parse(value);
}
function issueKey(issue) { return Settlement.normalizeIssue(issue).slice(2); }
function gameCheck(gameId) { if (!Object.hasOwn(Models.GAMES, gameId)) throw new Error('Unknown gameId'); }
function sourceCheck(source, now, fresh = false) {
  if (!source || typeof source.sourceId !== 'string' || !source.sourceId || !/^https?:\/\//.test(source.sourceUrl || '') || !/^[a-f0-9]{64}$/.test(source.bodySha256 || '') || typeof source.rawRef !== 'string' || !source.rawRef) throw new Error('Missing archived source provenance');
  const observed = instant(source.fetchedAt, 'source fetchedAt');
  if (observed > now) throw new Error('Source observation is in the future');
  if (fresh && now - observed > 24 * HOUR) throw new Error('Next issue source is stale');
  return observed;
}
function verifyRaw(source, dataDir, memo) {
  const target = path.resolve(dataDir, source.rawRef), relative = path.relative(path.resolve(dataDir), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Source rawRef escapes data directory');
  if (memo.has(target)) { if (memo.get(target) !== source.bodySha256) throw new Error('Conflicting source body hash'); return; }
  const actual = digest(fs.readFileSync(target));
  if (actual !== source.bodySha256) throw new Error('Archived source body hash mismatch');
  memo.set(target, actual);
}
function eligibleInputs({ gameId, nextIssue, draws, now }) {
  gameCheck(gameId); const at = instant(now, 'now');
  if (!nextIssue) throw new Error('A published next issue is required');
  const issue = issueKey(nextIssue.issue), drawAt = instant(nextIssue.drawAt, 'next drawAt');
  if (nextIssue.gameId && nextIssue.gameId !== gameId) throw new Error('Next issue game mismatch');
  if (drawAt <= at || drawAt - at > 7 * 24 * HOUR) throw new Error('Next draw must be within the following seven days');
  sourceCheck(nextIssue.source, at, true);
  const cutoff = Math.min(drawAt - 3 * HOUR, nextIssue.salesCloseAt ? instant(nextIssue.salesCloseAt, 'salesCloseAt') : Infinity);
  if (cutoff <= at) throw new Error('Prospective registration cutoff has passed');
  if (!Array.isArray(draws) || draws.length === 0) throw new Error('Observed training draws are required');
  const history = Models.validateHistory(gameId, draws);
  for (let i = 0; i < draws.length; i++) {
    const row = draws[i]; sourceCheck(row.source, at);
    if (row.gameId && row.gameId !== gameId) throw new Error('History game mismatch');
    if (Number(issueKey(row.issue)) >= Number(issue)) throw new Error('History contains the predicted or later issue');
  }
  if (history.some(row => instant(row.availableAt, 'training availability') >= at)) throw new Error('Training draw was unavailable at registration');
  return { issue, at, cutoffAt: new Date(cutoff).toISOString(), trainingCount: history.length };
}
function registrationEligibility(args) {
  try { const info = eligibleInputs(args); return { eligible: true, reasons: [], cutoffAt: info.cutoffAt, trainingCount: info.trainingCount }; }
  catch (error) { return { eligible: false, reasons: [error.message], cutoffAt: null, trainingCount: 0 }; }
}
function seal(record) { return { ...record, digest: digest(record) }; }
function readRecord(file) {
  const record = JSON.parse(fs.readFileSync(file, 'utf8')), { digest: claimed, ...payload } = record;
  if (claimed !== digest(payload)) throw new Error('Ledger record integrity failure: ' + path.basename(file));
  return record;
}
// A complete temporary record is linked into place atomically. link refuses an
// existing destination on Windows and POSIX; readers never see a partial JSON.
function immutableWrite(file, record, beforePublish) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (beforePublish) beforePublish();
    try { fs.linkSync(temporary, file); return true; } catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function protocolCheck(protocol) {
  if (!protocol || typeof protocol.id !== 'string' || !protocol.id.trim() || !/^[a-f0-9]{64}$/.test(protocol.hash || '')) throw new Error('Protocol id and SHA-256 hash are required');
  if (protocol.ticketCount !== undefined && protocol.ticketCount !== 5) throw new Error('This protocol registers exactly five tickets per model');
}
function registerBatch({ dataDir = DEFAULT_DIR, gameId, nextIssue, draws, now, protocol }) {
  const suppliedNow = now !== undefined;
  const forecastTime = suppliedNow ? now : new Date().toISOString();
  gameCheck(gameId); protocolCheck(protocol);
  const issue = issueKey(nextIssue?.issue), batchId = digest([protocol.id, gameId, issue]);
  const file = path.join(dataDir, 'ledger', 'batches', batchId + '.json');
  function existing() {
    const batch = readRecord(file);
    if (batch.protocol.hash !== protocol.hash) throw new Error('Existing issue batch belongs to a different protocol hash');
    return { created: false, batch };
  }
  // Idempotent retrieval also works after the cutoff. It cannot create or alter tickets.
  if (fs.existsSync(file)) return existing();
  const input = eligibleInputs({ gameId, nextIssue, draws, now: forecastTime }), memo = new Map();
  verifyRaw(nextIssue.source, dataDir, memo); for (const draw of draws) verifyRaw(draw.source, dataDir, memo);
  const asOf = new Date(input.at).toISOString(), trainingHash = digest(draws);
  const predictions = Models.MODEL_IDS.map(modelId => {
    const seed = parseInt(digest([protocol.id, protocol.hash, gameId, issue, modelId]).slice(0, 8), 16);
    const generated = Models.generate({ gameId, modelId, history: draws, asOf, count: 5, seed });
    return { modelId, seed, additional: false, costYuan: 10, trainingHash, ...generated };
  });
  const registeredAt = suppliedNow ? asOf : new Date().toISOString();
  const registrationTime = instant(registeredAt, 'registration completion');
  if (registrationTime < input.at) throw new Error('Registration clock moved backwards during generation');
  if (registrationTime >= instant(input.cutoffAt, 'registration cutoff')) throw new Error('Prospective registration cutoff passed during generation');
  const batch = seal({ schemaVersion: 1, batchId, gameId, issue, forecastAsOf: asOf, registeredAt, cutoffAt: input.cutoffAt,
    protocol, engineVersions: { models: Models.VERSION, settlement: Settlement.VERSION }, nextIssue, trainingHash,
    trainingDraws: draws, predictions, ticketCountPerModel: 5, costYuanPerModel: 10, paperOnly: true });
  const beforePublish = suppliedNow ? undefined : () => {
    const publishTime = instant(new Date().toISOString(), 'registration publication');
    if (publishTime < registrationTime) throw new Error('Registration clock moved backwards during publication');
    if (publishTime >= instant(input.cutoffAt, 'registration cutoff')) throw new Error('Prospective registration cutoff passed before publication');
  };
  return immutableWrite(file, batch, beforePublish) ? { created: true, batch } : existing();
}
function filesIn(directory) { return fs.existsSync(directory) ? fs.readdirSync(directory).filter(x => /^[a-f0-9]{64}\.json$/.test(x)).map(x => path.join(directory, x)) : []; }
function readBatches({ dataDir = DEFAULT_DIR, gameId } = {}) {
  if (gameId !== undefined) gameCheck(gameId);
  return filesIn(path.join(dataDir, 'ledger', 'batches')).map(readRecord).filter(x => !gameId || x.gameId === gameId).sort((a, b) => a.registeredAt.localeCompare(b.registeredAt) || a.batchId.localeCompare(b.batchId));
}
function readSettlements(dataDir, batchId) {
  return filesIn(path.join(dataDir, 'ledger', 'settlements', batchId)).map(readRecord).sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.recordedAt.localeCompare(b.recordedAt));
}
function drawContent(draw) { const { source, fetchedAt, availableAt, publishedAt, ...content } = draw; return content; }
function settleBatches({ dataDir = DEFAULT_DIR, games, now = new Date().toISOString() }) {
  const at = instant(now, 'now'), memo = new Map(); let created = 0, revisions = 0, pending = 0;
  const outcomes = [];
  for (const batch of readBatches({ dataDir })) {
    const rows = Array.isArray(games?.[batch.gameId]) ? games[batch.gameId] : games?.[batch.gameId]?.draws || [];
    const matches = rows.filter(row => issueKey(row.issue) === batch.issue);
    if (matches.length > 1) throw new Error('Conflicting result rows for one issue');
    const draw = matches[0]; if (!draw) { pending++; continue; }
    const observed = sourceCheck(draw.source, at); verifyRaw(draw.source, dataDir, memo);
    if (observed <= instant(batch.registeredAt, 'registration')) throw new Error('Result observation predates prospective registration');
    if (instant(batch.nextIssue.drawAt, 'drawAt') > at) { pending++; continue; }
    if (observed < instant(batch.nextIssue.drawAt, 'drawAt')) throw new Error('Result source observation predates the scheduled draw');
    if (draw.gameId && draw.gameId !== batch.gameId) throw new Error('Settlement game mismatch');
    const contentHash = digest(drawContent(draw)), earlier = readSettlements(dataDir, batch.batchId), latest = earlier.at(-1);
    if (latest?.contentHash === contentHash) { if (!latest.closed) pending++; outcomes.push(latest); continue; }
    if (latest && observed <= instant(latest.observedAt, 'previous observation')) throw new Error('Changed result is not a newer source observation');
    const withdrawn = draw.status === 'withdrawn' || draw.status === 'retracted';
    const results = batch.predictions.map(prediction => {
      if (withdrawn) return { modelId: prediction.modelId, costYuan: prediction.costYuan, closed: false, status: 'withdrawn', grossYuan: null, netYuan: null };
      return { modelId: prediction.modelId, ...Settlement.settlePortfolio({ gameId: batch.gameId, tickets: prediction.tickets, draw, additional: false }),
        probabilityScore: Models.score(prediction.model, draw) };
    });
    const record = seal({ schemaVersion: 1, batchId: batch.batchId, batchDigest: batch.digest, gameId: batch.gameId, issue: batch.issue,
      contentHash, observedAt: new Date(observed).toISOString(), recordedAt: new Date(at).toISOString(), previousDigest: latest?.digest || null,
      result: draw, closed: results.every(row => row.closed), results });
    // Observation timestamp is part of the revision key: a correction can later
    // restore an earlier score without losing its own chronological receipt.
    const file = path.join(dataDir, 'ledger', 'settlements', batch.batchId, digest([contentHash, record.observedAt]) + '.json');
    if (immutableWrite(file, record)) { created++; if (latest) revisions++; }
    if (!record.closed) pending++; outcomes.push(record);
  }
  return { created, revisions, pending, batches: outcomes };
}
function summarizeLedger({ dataDir = DEFAULT_DIR, gameId, now = new Date() } = {}) {
  const at = instant(now, 'summary now');
  const batches = readBatches({ dataDir, gameId }).filter(batch => instant(batch.registeredAt, 'registration') <= at), byProtocol = {}, recent = []; let settledCount = 0, predictionCount = 0, ticketCount = 0;
  for (const batch of batches) {
    const latest = readSettlements(dataDir, batch.batchId).filter(record => instant(record.observedAt, 'observation') <= at && instant(record.recordedAt, 'recording') <= at).at(-1);
    const due = instant(batch.nextIssue.drawAt, 'scheduled draw') <= at;
    if (latest && latest.batchDigest !== batch.digest) throw new Error('Settlement belongs to a different batch digest');
    if (latest?.closed) settledCount++;
    for (const prediction of batch.predictions) {
      predictionCount++; ticketCount += prediction.tickets.length;
      const key = gameId ? prediction.modelId : batch.gameId + ':' + prediction.modelId;
      const protocolKey = batch.protocol.id + ':' + batch.protocol.hash;
      const byModel = (byProtocol[protocolKey] ||= { protocol: batch.protocol, byModel: {} }).byModel;
      const sum = byModel[key] ||= { gameId: batch.gameId, modelId: prediction.modelId, predictionCount: 0, ticketCount: 0, settledCount: 0, pendingCount: 0, duePredictionCount: 0, missingScoredCount: 0, scoredCount: 0, committedCostYuan: 0, settledCostYuan: 0, settledGrossYuan: 0, settledNetYuan: 0, logEValueVsUniform: 0 };
      sum.predictionCount++; sum.ticketCount += prediction.tickets.length; sum.committedCostYuan += prediction.costYuan;
      const result = latest?.results.find(x => x.modelId === prediction.modelId);
      if (due) { sum.duePredictionCount++; if (!result?.probabilityScore) sum.missingScoredCount++; }
      if (result?.closed) { sum.settledCount++; sum.settledCostYuan += result.costYuan; sum.settledGrossYuan += result.grossYuan; sum.settledNetYuan += result.netYuan; }
      else sum.pendingCount++;
      if (result?.probabilityScore) {
        sum.logEValueVsUniform += result.probabilityScore.improvementVsUniform;
        sum.logProbability = (sum.logProbability || 0) + result.probabilityScore.logProbability;
        sum.scoredCount = (sum.scoredCount || 0) + 1;
      }
      sum.distributionThreshold = 240;
      sum.distributionEvidence = sum.missingScoredCount > 0 ? 'suspended_incomplete_results' : sum.logEValueVsUniform >= Math.log(240) ? 'nonuniformity_evidence' : 'not_demonstrated';
      sum.profitAdvantage = 'not_proven';
    }
    recent.push({ batchId: batch.batchId, gameId: batch.gameId, issue: batch.issue, registeredAt: batch.registeredAt, cutoffAt: batch.cutoffAt,
      protocolId: batch.protocol.id, status: latest ? latest.closed ? 'settled_published' : 'pending_payout' : 'awaiting_draw',
      predictions: batch.predictions.map(({ modelId, tickets, costYuan }) => ({ modelId, tickets, costYuan })), settlement: latest || null });
  }
  return { asOf: new Date(at).toISOString(), batchCount: batches.length, predictionCount, predictionCountDefinition: 'one pre-draw model portfolio per game and issue', ticketCount,
    settledCount, pendingCount: batches.length - settledCount, byProtocol,
    byModel: Object.keys(byProtocol).length === 1 ? Object.values(byProtocol)[0].byModel : {}, batches: recent.reverse().slice(0, 30),
    advantageStatus: 'not_demonstrated', returnBasis: 'published_prize_table_paper_replay_before_tax',
    limitation: 'Current settled-only sums are descriptive. Pending payouts remain unresolved; log likelihood evidence is not evidence of positive monetary return.' };
}
module.exports = { registrationEligibility, registerBatch, readBatches, settleBatches, summarizeLedger };
