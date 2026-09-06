'use strict';

// Local paper research only. Immutable records make a rerun safe, but are not
// a substitute for an externally timestamped, tamper-evident public registry.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function hash(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function check(ok, message) { if (!ok) throw new Error(message); }
function text(value, name) { check(typeof value === 'string' && value.trim().length > 0, name + ' is required'); return value; }
function date(value, name) { check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), name + ' must be an ISO date with explicit timezone'); return new Date(value).toISOString(); }
function sourceOf(source, latest) {
  check(source && typeof source === 'object', 'source snapshot is required');
  const result = {
    sourceId: text(source.sourceId, 'sourceId'), sourceUrl: text(source.sourceUrl, 'sourceUrl'),
    fetchedAt: date(source.fetchedAt, 'fetchedAt'), bodySha256: source.bodySha256
  };
  check(/^https?:\/\//.test(result.sourceUrl), 'sourceUrl must use HTTP(S)');
  check(/^[a-f0-9]{64}$/i.test(result.bodySha256), 'bodySha256 must be a SHA-256 digest');
  check(Date.parse(result.fetchedAt) <= latest, 'source snapshot cannot be from the future');
  if (source.rawRef !== undefined) result.rawRef = text(source.rawRef, 'rawRef');
  return result;
}
function matchOf(match) {
  check(match && typeof match === 'object', 'match is required');
  const result = { eventId: text(match.eventId, 'eventId'), kickoffAt: date(match.kickoffAt, 'kickoffAt'), homeTeam: text(match.homeTeam, 'homeTeam'), awayTeam: text(match.awayTeam, 'awayTeam'), competition: text(match.competition, 'competition'), odds: null };
  if (match.odds != null) {
    result.odds = {};
    for (const key of ['home', 'draw', 'away']) {
      check(Number.isFinite(match.odds[key]) && match.odds[key] > 1, 'decimal odds must be finite and > 1');
      result.odds[key] = match.odds[key];
    }
  }
  if (match.sourceEventId !== undefined) result.sourceEventId = text(match.sourceEventId, 'sourceEventId');
  return result;
}

function createLedger({ directory, now = () => new Date() }) {
  const root = path.resolve(text(directory, 'directory'));
  for (const kind of ['predictions', 'results', 'settlements', 'retractions']) fs.mkdirSync(path.join(root, kind), { recursive: true });
  function clock() { const value = new Date(now()); check(Number.isFinite(value.getTime()), 'invalid ledger clock'); return value.toISOString(); }
  function location(kind, id) { check(/^[a-f0-9]{64}$/.test(id), 'invalid record id'); return path.join(root, kind, id + '.json'); }
  function read(kind, id) {
    try { return JSON.parse(fs.readFileSync(location(kind, id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function list(kind) { return fs.readdirSync(path.join(root, kind)).filter(f => /^[a-f0-9]{64}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(root, kind, f), 'utf8'))); }
  function persist(kind, id, payload) {
    const record = { schemaVersion: 1, id, recordedAt: clock(), payload };
    if (kind === 'predictions') check(Date.parse(record.recordedAt) < Date.parse(payload.match.kickoffAt), 'prediction commit must be before kickoff');
    const target = location(kind, id);
    // Publish a completely written inode using an exclusive hard link. A crash
    // leaves either no committed record or a complete one, never partial JSON.
    const temporary = target + '.' + crypto.randomUUID() + '.tmp';
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try {
      fs.linkSync(temporary, target);
      return record;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = read(kind, id);
      check(canonical(existing.payload) === canonical(payload), 'immutable record conflict: ' + id);
      return existing;
    } finally { fs.unlinkSync(temporary); }
  }
  function recordPrediction(input) {
    const recordedAt = clock();
    const current = Date.parse(recordedAt);
    const match = matchOf(input.match);
    const prediction = input.prediction;
    check(prediction && typeof prediction === 'object', 'prediction is required');
    const probabilities = prediction.probabilities;
    check(Array.isArray(probabilities) && probabilities.length === 3 && probabilities.every(p => Number.isFinite(p) && p >= 0 && p <= 1), 'probabilities must be [H,D,A]');
    check(Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-8, 'probabilities must sum to 1');
    const trainingCutoff = date(prediction.trainingCutoff, 'trainingCutoff');
    check(Date.parse(trainingCutoff) <= current, 'trainingCutoff cannot be from the future');
    check(Date.parse(trainingCutoff) < Date.parse(match.kickoffAt), 'trainingCutoff must be before kickoff');
    check(Number.isSafeInteger(prediction.trainingCount) && prediction.trainingCount >= 0, 'trainingCount must be nonnegative');
    check(Array.isArray(prediction.assumptions) && prediction.assumptions.every(v => typeof v === 'string'), 'assumptions must be an array of strings');
    const payload = {
      protocolId: text(input.protocolId, 'protocolId'), windowId: text(input.windowId, 'windowId'), match,
      source: sourceOf(input.source, current), prediction: {
        modelId: text(prediction.modelId, 'modelId'), version: text(prediction.version, 'version'),
        probabilities: [...probabilities], trainingCutoff, trainingCount: prediction.trainingCount, assumptions: [...prediction.assumptions]
      }, oddsObservedAt: null, paperTrade: null
    };
    if (input.batchId !== undefined) {
      check(typeof input.batchId === 'string' && /^[a-f0-9]{64}$/.test(input.batchId), 'batchId must be a lowercase SHA-256 digest');
      payload.batchId = input.batchId;
    }
    if (match.odds) {
      payload.oddsObservedAt = date(input.oddsObservedAt, 'oddsObservedAt');
      check(Date.parse(payload.oddsObservedAt) <= current && Date.parse(payload.oddsObservedAt) <= Date.parse(payload.source.fetchedAt), 'oddsObservedAt cannot be after prediction or collection');
    }
    if (input.paperTrade != null) {
      const trade = input.paperTrade;
      check(Number.isFinite(trade.stake) && trade.stake > 0, 'paper stake must be positive');
      check(match.odds, 'paper trade requires observed odds');
      if (trade.selectionWeights !== undefined) {
        check(trade.selection === undefined && trade.decimalOdds === undefined, 'selectionWeights cannot be combined with a fixed selection or decimalOdds');
        const weights = trade.selectionWeights;
        check(Array.isArray(weights) && weights.length === 3 && weights.every(v => Number.isFinite(v) && v >= 0 && v <= 1), 'selectionWeights must be nonnegative [H,D,A]');
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        check(Math.abs(total - 1) < 1e-8, 'selectionWeights must sum to 1');
        payload.paperTrade = { selectionWeights: weights.map(v => v / total), stake: trade.stake, selectionMethod: 'single_randomized_selection_expected_profit', execution: 'paper_only' };
      } else {
        const index = ['H', 'D', 'A'].indexOf(trade.selection);
        check(index >= 0, 'paper selection must be H, D or A');
        const decimalOdds = match.odds[['home', 'draw', 'away'][index]];
        if (trade.decimalOdds !== undefined) check(trade.decimalOdds === decimalOdds, 'paper odds must equal observed odds');
        payload.paperTrade = { selection: trade.selection, stake: trade.stake, decimalOdds, execution: 'paper_only' };
      }
    }
    const id = hash([payload.protocolId, match.eventId, prediction.modelId, payload.windowId]);
    const existing = read('predictions', id);
    if (existing) { check(canonical(existing.payload) === canonical(payload), 'immutable prediction key conflict: ' + id); return existing; }
    check(current < Date.parse(match.kickoffAt), 'prediction must be recorded before kickoff; historical backfill is forbidden');
    check(!['finished', 'final', 'ft', 'completed'].includes(String(input.match.status).toLowerCase()) && input.match.homeGoals == null && input.match.awayGoals == null, 'prediction input cannot contain a final result');
    return persist('predictions', id, payload);
  }
  function recordResult(input) {
    const current = Date.parse(clock());
    const match = matchOf(input.match);
    check(['finished', 'final', 'ft', 'completed'].includes(String(input.match.status).toLowerCase()), 'only final results can be recorded');
    check([input.match.homeGoals, input.match.awayGoals].every(n => Number.isSafeInteger(n) && n >= 0), 'final goals must be nonnegative integers; missing scores cannot become zero');
    const observedAt = date(input.observedAt || input.source.fetchedAt, 'observedAt');
    check(Date.parse(observedAt) <= current && Date.parse(observedAt) >= Date.parse(match.kickoffAt), 'result observation must be after kickoff and not in the future');
    const payload = { match: { ...match, homeGoals: input.match.homeGoals, awayGoals: input.match.awayGoals, status: 'finished' }, source: sourceOf(input.source, current), observedAt, revisionReason: input.revisionReason || null };
    check(Date.parse(payload.source.fetchedAt) >= Date.parse(match.kickoffAt), 'result source must have been collected after kickoff');
    check(Date.parse(observedAt) <= Date.parse(payload.source.fetchedAt), 'result observation cannot be after source collection');
    const id = hash(payload);
    const existing = read('results', id);
    if (existing) return existing;
    const prior = list('results').filter(r => r.payload.match.eventId === match.eventId);
    const changed = prior.some(r => r.payload.match.homeGoals !== payload.match.homeGoals || r.payload.match.awayGoals !== payload.match.awayGoals || r.payload.match.kickoffAt !== match.kickoffAt);
    if (changed) text(input.revisionReason, 'revisionReason for corrected source facts');
    return persist('results', id, payload);
  }
  function recordRetraction({ eventId, source, reason, status }) {
    const normalizedStatus = text(status, 'retraction status').toLowerCase();
    check(!['finished', 'final', 'ft', 'completed'].includes(normalizedStatus), 'a final status cannot retract a result');
    const payload = { eventId: text(eventId, 'eventId'), source: sourceOf(source, Date.parse(clock())), reason: text(reason, 'retraction reason'), status: normalizedStatus };
    return persist('retractions', hash(payload), payload);
  }
  function settlePrediction({ predictionId, resultId, ruleVerification = { verified: false }, paperRuleAssumption }) {
    check(paperRuleAssumption === undefined || paperRuleAssumption === 'fixed-decimal-1x2-paper-v1', 'unsupported paperRuleAssumption');
    const prediction = read('predictions', predictionId);
    const result = read('results', resultId);
    check(prediction && result, 'prediction and result records must exist');
    const p = prediction.payload;
    const r = result.payload;
    check(p.match.eventId === r.match.eventId && p.match.kickoffAt === r.match.kickoffAt && p.match.homeTeam === r.match.homeTeam && p.match.awayTeam === r.match.awayTeam, 'prediction/result event identity mismatch');
    const outcomeIndex = r.match.homeGoals > r.match.awayGoals ? 0 : r.match.homeGoals === r.match.awayGoals ? 1 : 2;
    const probability = p.prediction.probabilities[outcomeIndex];
    const scoring = { outcome: ['H', 'D', 'A'][outcomeIndex], logLoss: probability === 0 ? null : -Math.log(probability), logLossStatus: probability === 0 ? 'infinite' : 'finite', brier: p.prediction.probabilities.reduce((total, q, i) => total + (q - (i === outcomeIndex ? 1 : 0)) ** 2, 0) };
    const verified = ruleVerification.verified === true;
    let rules = { verified: false };
    if (verified) {
      check(ruleVerification.market === '1X2_REGULATION', 'only verified 1X2_REGULATION paper rules are supported');
      rules = { verified: true, market: ruleVerification.market, ruleId: text(ruleVerification.ruleId, 'ruleId'), sourceUrl: text(ruleVerification.sourceUrl, 'rule sourceUrl'), verifiedAt: date(ruleVerification.verifiedAt, 'verifiedAt') };
      check(/^https?:\/\//.test(rules.sourceUrl) && Date.parse(rules.verifiedAt) <= Date.parse(clock()), 'invalid rule verification provenance');
    }
    let paper = null;
    let status = 'scored_no_trade';
    if (p.paperTrade && !verified) status = 'pending_rule_verification';
    if (p.paperTrade && (verified || paperRuleAssumption)) {
      const assumed = !verified;
      if (assumed) check(p.paperTrade.stake === 2, 'fixed-decimal-1x2-paper-v1 requires one hypothetical 2 yuan stake');
      status = assumed ? 'settled_paper_assumption' : 'settled_paper';
      const odds = ['home', 'draw', 'away'].map(k => p.match.odds[k]);
      const totalInverse = odds.reduce((total, odd) => total + 1 / odd, 0);
      const stake = p.paperTrade.stake;
      const selectedOutcomeWeight = p.paperTrade.selectionWeights ? p.paperTrade.selectionWeights[outcomeIndex] : p.paperTrade.selection === scoring.outcome ? 1 : 0;
      paper = { stake, profit: stake * selectedOutcomeWeight * odds[outcomeIndex] - stake, randomExpectedProfit: stake * odds[outcomeIndex] / 3 - stake, marketExpectedProfit: stake * ((1 / odds[outcomeIndex]) / totalInverse) * odds[outcomeIndex] - stake, baselineMethod: 'same_stake_expected_profit_of_random_or_normalized_implied_odds_selection', execution: 'paper_only' };
      if (p.paperTrade.selectionWeights) {
        paper.profitKind = 'exact_expected_profit_of_single_randomized_selection';
        paper.selectionWeights = [...p.paperTrade.selectionWeights];
        paper.selectionInterpretation = 'One hypothetical whole-stake choice drawn from H/D/A weights; expectation over choice, not split stakes or an actual order.';
      }
      if (assumed) paper.ruleAssumption = { id: paperRuleAssumption, market: '1X2_REGULATION', currency: 'CNY', fixedStake: 2, description: 'One hypothetical 2 yuan selection at observed fixed decimal odds; mathematical paper payoff only, not verified official settlement or actual/redeemable earnings.', officialSettlement: false, actualOrder: false, redeemable: false };
    }
    const payload = { predictionId, resultId, status, scoring, paper, ruleVerification: rules };
    return persist('settlements', hash(payload), payload);
  }
  function summary() {
    const predictions = list('predictions');
    const results = list('results');
    const settlements = list('settlements');
    const retractions = list('retractions');
    const latestResults = new Map();
    for (const result of results.sort((a, b) => a.payload.observedAt.localeCompare(b.payload.observedAt) || a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))) latestResults.set(result.payload.match.eventId, result);
    const latestRetractions = new Map();
    for (const retraction of retractions.sort((a, b) => a.payload.source.fetchedAt.localeCompare(b.payload.source.fetchedAt) || a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))) latestRetractions.set(retraction.payload.eventId, retraction);
    const rows = predictions.map(record => {
      const latest = latestResults.get(record.payload.match.eventId);
      const latestRetraction = latestRetractions.get(record.payload.match.eventId);
      const retracted = latestRetraction && (!latest || latestRetraction.payload.source.fetchedAt >= latest.payload.observedAt);
      const rank = s => s.payload.ruleVerification.verified ? 2 : s.payload.status === 'settled_paper_assumption' ? 1 : 0;
      const candidates = settlements.filter(s => s.payload.predictionId === record.id && latest && s.payload.resultId === latest.id).sort((a, b) => rank(a) - rank(b) || a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
      const settlement = retracted ? null : candidates.at(-1) || null;
      return { predictionId: record.id, eventId: record.payload.match.eventId, modelId: record.payload.prediction.modelId, modelVersion: record.payload.prediction.version, protocolId: record.payload.protocolId, batchId: record.payload.batchId || null, sourceId: record.payload.source.sourceId, sourceBodySha256: record.payload.source.bodySha256, sourceFetchedAt: record.payload.source.fetchedAt, recordedAt: record.recordedAt, kickoffAt: record.payload.match.kickoffAt, status: retracted ? 'result_retracted' : settlement ? settlement.payload.status : latest ? 'pending_settlement' : 'awaiting_result', retraction: retracted ? latestRetraction.payload : null, settlement: settlement ? settlement.payload : null };
    });
    const settled = rows.filter(r => r.status === 'settled_paper');
    const totals = { stake: 0, profit: 0, randomExpectedProfit: 0, marketExpectedProfit: 0 };
    for (const row of settled) for (const key of Object.keys(totals)) totals[key] += row.settlement.paper[key];
    function aggregate(group) {
      const scored = group.filter(r => r.settlement);
      const paper = group.filter(r => r.status === 'settled_paper');
      const assumedPaper = group.filter(r => r.status === 'settled_paper_assumption');
      const pendingReasons = {};
      for (const row of group) if (['awaiting_result', 'pending_settlement', 'pending_rule_verification', 'result_retracted'].includes(row.status)) pendingReasons[row.status] = (pendingReasons[row.status] || 0) + 1;
      const paperTotals = { stake: 0, profit: 0, randomExpectedProfit: 0, marketExpectedProfit: 0 };
      for (const row of paper) for (const key of Object.keys(paperTotals)) paperTotals[key] += row.settlement.paper[key];
      const assumedPaperTotals = { stake: 0, profit: 0, randomExpectedProfit: 0, marketExpectedProfit: 0 };
      for (const row of assumedPaper) for (const key of Object.keys(assumedPaperTotals)) assumedPaperTotals[key] += row.settlement.paper[key];
      const sumBrier = scored.reduce((sum, row) => sum + row.settlement.scoring.brier, 0);
      const infiniteLogLossCount = scored.filter(row => row.settlement.scoring.logLossStatus === 'infinite').length;
      const sumLogLoss = infiniteLogLossCount ? null : scored.reduce((sum, row) => sum + row.settlement.scoring.logLoss, 0);
      return { predictionCount: group.length, scoredCount: scored.length, settledPaperCount: paper.length, assumedPaperCount: assumedPaper.length, pendingCount: Object.values(pendingReasons).reduce((a, b) => a + b, 0), pendingReasons, paper: paperTotals, assumedPaper: assumedPaperTotals, properScores: { count: scored.length, sumBrier, sumLogLoss, logLossStatus: infiniteLogLossCount ? 'infinite' : scored.length ? 'finite' : 'unscored', infiniteLogLossCount, meanBrier: scored.length ? sumBrier / scored.length : null, meanLogLoss: scored.length && !infiniteLogLossCount ? sumLogLoss / scored.length : null } };
    }
    const all = aggregate(rows);
    const modelKeys = [...new Set(rows.map(r => canonical([r.protocolId, r.modelId, r.modelVersion])))].sort();
    const byModel = modelKeys.map(key => {
      const [protocolId, modelId, version] = JSON.parse(key);
      return { protocolId, modelId, version, ...aggregate(rows.filter(r => r.protocolId === protocolId && r.modelId === modelId && r.modelVersion === version)) };
    });
    const bySource = [...new Set(rows.map(r => r.sourceId))].sort().map(sourceId => ({ sourceId, ...aggregate(rows.filter(r => r.sourceId === sourceId)) }));
    return { schemaVersion: 1, generatedAt: clock(), predictionCount: predictions.length, resultVersionCount: results.length, retractionVersionCount: retractions.length, settlementVersionCount: settlements.length, settledPaperCount: settled.length, assumedPaperCount: all.assumedPaperCount, assumedPaperTotals: all.assumedPaper, pendingCount: all.pendingCount, pendingReasons: all.pendingReasons, properScores: all.properScores, totals, byModel, bySource, predictiveAdvantage: 'not_established', rows };
  }
  return { recordPrediction, recordResult, recordRetraction, settlePrediction, summary, listPredictions: () => list('predictions'), listResults: () => list('results'), listRetractions: () => list('retractions'), listSettlements: () => list('settlements') };
}

module.exports = { createLedger };
