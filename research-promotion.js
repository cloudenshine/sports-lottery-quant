'use strict';

const { createHash } = require('node:crypto');
const { pairedBlockInterval } = require('./research-models');

const REGISTERED_SOURCES = ['espn-eng1', '500-jingcai'];
const DAY = 86400000;
function sourceFamily(id) {
  if (/^espn-eng1(?:-|$)/.test(id)) return 'espn-eng1';
  if (/^500-jingcai(?:-|$)/.test(id)) return '500-jingcai';
  return id;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function time(value) {
  return typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
}
function invariant(condition, message) { if (!condition) throw new TypeError(message); }
function average(values) { return values.reduce((a, b) => a + b, 0) / values.length; }

/** Fixed-horizon research decision. This module never authorizes transactions. */
function evaluatePromotion({ protocol, ledgerSummary, previousDecision, now }) {
  const settings = protocol && protocol.sports && protocol.sports.promotion;
  invariant(settings && protocol.protocolId && Number.isFinite(time(protocol.registeredAt)), 'A protocol with registeredAt is required');
  const models = protocol.sports.candidateFamily;
  invariant(Array.isArray(models) && models.length === 7 && new Set(models).size === 7 && ['uniform', 'market'].every(m => models.includes(m)), 'Seven preregistered models including both comparators are required');
  const minimumSettledEvents = settings.minimumSettledEvents;
  const minimumCalendarDays = settings.minimumCalendarDays;
  const horizonDays = settings.fixedCalendarHorizonDays;
  invariant(Number.isInteger(minimumSettledEvents) && minimumSettledEvents >= 500 && Number.isInteger(minimumCalendarDays) && minimumCalendarDays >= 90, 'The registered horizon cannot be below 500 events and 90 days');
  invariant(Number.isInteger(horizonDays) && horizonDays >= minimumCalendarDays, 'A fixed calendar horizon at least as long as the minimum calendar span is required');
  invariant(settings.reviewOnlyAtRegisteredHorizon === true && Number.isFinite(settings.familyWiseAlpha) && settings.familyWiseAlpha > 0 && settings.familyWiseAlpha <= 0.05, 'Fixed-horizon family-wise error control is required');
  invariant(Number.isFinite(protocol.sports.paperStake) && protocol.sports.paperStake > 0, 'A fixed paper stake is required');
  invariant(ledgerSummary && Array.isArray(ledgerSummary.rows), 'Ledger rows are required');
  const current = time(now instanceof Date ? now.toISOString() : now || ledgerSummary.generatedAt);
  invariant(Number.isFinite(current), 'An explicit valid evaluation time is required');
  const registeredAt = time(protocol.registeredAt), horizonAt = registeredAt + horizonDays * DAY;
  invariant(current >= registeredAt, 'Evaluation cannot precede registration');
  const protocolHash = createHash('sha256').update(canonical(protocol)).digest('hex');
  if (previousDecision && previousDecision.protocolId === protocol.protocolId) {
    invariant(previousDecision.protocolHash === protocolHash, 'Protocol changed under the same identifier; register a new protocol');
    if (previousDecision.locked === true) return structuredClone(previousDecision);
  }
  const previous = previousDecision && previousDecision.protocolId === protocol.protocolId ? previousDecision : null;
  const comparisons = REGISTERED_SOURCES.length * models.length * 3;
  const exclusions = { otherProtocol: 0, unregisteredModel: 0, invalidProspectiveRow: 0 };
  const groups = new Map(REGISTERED_SOURCES.map(s => [s, []]));
  const invalidGroups = new Set();
  for (const row of ledgerSummary.rows) {
    if (!row || row.protocolId !== protocol.protocolId) { exclusions.otherProtocol++; continue; }
    if (!models.includes(row.modelId)) { exclusions.unregisteredModel++; continue; }
    const sourceId = typeof row.sourceId === 'string' ? sourceFamily(row.sourceId) : 'invalid-source';
    if (!groups.has(sourceId)) groups.set(sourceId, []);
    const recorded = time(row.recordedAt), kickoff = time(row.kickoffAt);
    if (!row.predictionId || !row.eventId || typeof row.modelVersion !== 'string' || !row.modelVersion || !Number.isFinite(recorded) || !Number.isFinite(kickoff) || recorded < registeredAt || recorded >= kickoff || recorded > current) {
      exclusions.invalidProspectiveRow++; invalidGroups.add(sourceId); continue;
    }
    if (kickoff >= registeredAt && kickoff < horizonAt) groups.get(sourceId).push(row);
  }
  const cohorts = [];
  for (const [sourceId, rows] of groups) for (const modelId of models) {
    const old = previous && previous.cohorts && previous.cohorts.find(c => c.sourceId === sourceId && c.modelId === modelId && c.locked);
    if (old) { cohorts.push(structuredClone(old)); continue; }
    const cohort = { sourceId, modelId, modelVersion: null, status: 'COLLECTING', eligible: false, researchEvidenceEligible: false, locked: false, settledEvents: 0, matchedEvents: 0, calendarDays: Math.min(horizonDays, Math.floor((current - registeredAt) / DAY)), minimumSettledEvents, minimumCalendarDays, startedAt: protocol.registeredAt, horizonAt: new Date(horizonAt).toISOString(), reasons: [], calendarBasis: 'fixed UTC elapsed-day window [registeredAt, horizonAt); settlement delays cannot extend membership', fixedPredictionIds: [], fixedEventIds: [] };
    cohorts.push(cohort);
    const fail = (status, reason) => { cohort.status = status; cohort.reasons.push(reason); cohort.locked = true; };
    if (!REGISTERED_SOURCES.includes(sourceId)) { fail('UNREGISTERED_SOURCE', 'Source is outside the two preregistered families; a new protocol is needed.'); continue; }
    if (invalidGroups.has(sourceId)) { fail('INVALID_PROSPECTIVE_EVIDENCE', 'Malformed, backdated or post-kickoff rows must be audited under a new protocol, not selectively omitted.'); continue; }
    const requiredModels = [...new Set([modelId, 'uniform', 'market'])];
    const relevant = rows.filter(r => requiredModels.includes(r.modelId));
    const versions = Object.fromEntries(requiredModels.map(m => [m, [...new Set(relevant.filter(r => r.modelId === m).map(r => r.modelVersion))]]));
    if (Object.values(versions).some(v => v.length > 1)) { fail('MIXED_MODEL_VERSIONS', 'Model or comparator version changed within this protocol; versions cannot be pooled or selected by outcome.'); continue; }
    cohort.modelVersion = (versions[modelId] || [])[0] || null;
    cohort.comparatorVersions = { uniform: versions.uniform[0] || null, market: versions.market[0] || null };
    const events = new Map(); let conflict = false;
    for (const row of relevant) {
      if (!events.has(row.eventId)) events.set(row.eventId, new Map());
      const event = events.get(row.eventId), existing = event.get(row.modelId);
      if (existing && canonical(existing) !== canonical(row)) conflict = true;
      else event.set(row.modelId, row);
    }
    if (conflict) { fail('DUPLICATE_EVENT_CONFLICT', 'Conflicting forecasts for the same source, event and model cannot count as independent evidence.'); continue; }
    const matched = [...events.entries()].filter(([, event]) => requiredModels.every(m => event.has(m))).map(([eventId, event]) => ({ eventId, rows: requiredModels.map(m => event.get(m)), candidate: event.get(modelId), market: event.get('market') })).sort((a, b) => a.candidate.kickoffAt.localeCompare(b.candidate.kickoffAt) || a.eventId.localeCompare(b.eventId));
    if (matched.some(event => event.rows.some(row => time(row.kickoffAt) !== time(event.candidate.kickoffAt)))) { fail('EVENT_IDENTITY_CONFLICT', 'Matched forecasts disagree about the kickoff time.'); continue; }
    const sameInformation = event => event.rows.every(row => /^[a-f0-9]{64}$/.test(row.batchId || '') && /^[a-f0-9]{64}$/.test(row.sourceBodySha256 || '') && Number.isFinite(time(row.sourceFetchedAt)) && time(row.sourceFetchedAt) <= time(row.recordedAt) && row.batchId === event.candidate.batchId && row.sourceBodySha256 === event.candidate.sourceBodySha256 && row.sourceFetchedAt === event.candidate.sourceFetchedAt);
    if (matched.some(event => !sameInformation(event))) { fail('DIFFERENT_INFORMATION_SNAPSHOTS', 'Every matched model must belong to the same immutable batch and source body/capture time; missing or inconsistent information cannot be selectively omitted.'); continue; }
    // All matched fixtures inside the calendar window count, never only a favorable prefix.
    const fixed = matched;
    cohort.matchedEvents = matched.length;
    cohort.fixedEventIds = fixed.map(event => event.eventId);
    cohort.fixedPredictionIds = fixed.flatMap(event => event.rows.map(row => row.predictionId));
    cohort.settledEvents = fixed.filter(event => event.rows.every(row => row.settlement && row.settlement.scoring) && time(event.candidate.kickoffAt) <= current).length;
    if (current < horizonAt) {
      cohort.reasons.push(`The registered ${horizonDays}-day observation window remains open; no significance calculation is permitted.`);
      continue;
    }
    if (fixed.length < minimumSettledEvents) { fail('INSUFFICIENT_SAMPLE', 'The fixed calendar window closed below the minimum matched-event count; later fixtures cannot extend it.'); continue; }
    if (cohort.settledEvents < fixed.length) {
      cohort.status = 'AWAITING_WINDOW_SETTLEMENTS';
      cohort.reasons.push(`Awaiting all ${fixed.length} matched events in the closed window; ${cohort.settledEvents} have scores. The window will not expand.`);
      continue;
    }
    cohort.locked = true;
    cohort.decidedAt = new Date(current).toISOString();
    const invalidScores = fixed.some(event => event.rows.some(row => !Number.isFinite(row.settlement.scoring.logLoss) || row.settlement.scoring.logLoss < 0 || !Number.isFinite(row.settlement.scoring.brier) || row.settlement.scoring.brier < 0 || row.settlement.scoring.brier > 2));
    if (invalidScores) { fail('NONFINITE_OR_INVALID_SCORE', 'An infinite log loss or invalid proper score cannot be silently clipped or excluded from the fixed sample.'); continue; }
    const validPaper = row => (row.status === 'scored_no_trade' && row.settlement.paper === null) || (['settled_paper', 'settled_paper_assumption'].includes(row.status) && row.settlement.paper && ['profit', 'randomExpectedProfit', 'marketExpectedProfit'].every(k => Number.isFinite(row.settlement.paper[k])) && row.settlement.paper.stake === protocol.sports.paperStake);
    if (fixed.some(event => !validPaper(event.candidate))) { fail('PAPER_RETURN_EVIDENCE_MISSING', 'Every fixed candidate event needs a finite, equal-stake paper return and same-stake random/market baselines.'); continue; }
    cohort.paperExposureEvents = fixed.filter(event => event.candidate.settlement.paper !== null).length;
    cohort.abstainedEvents = fixed.length - cohort.paperExposureEvents;
    if (!cohort.paperExposureEvents) { fail('NO_PAPER_EXPOSURE', 'All matched events stayed in cash; scores alone cannot establish a monetary return advantage.'); continue; }
    const byDay = new Map();
    for (const event of fixed) {
      const day = new Date(event.candidate.kickoffAt).toISOString().slice(0, 10), paper = event.candidate.settlement.paper || { profit: 0, randomExpectedProfit: 0 };
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({ marketLogLossImprovement: event.market.settlement.scoring.logLoss - event.candidate.settlement.scoring.logLoss, netReturn: paper.profit / protocol.sports.paperStake, randomReturnImprovement: (paper.profit - paper.randomExpectedProfit) / protocol.sports.paperStake });
    }
    cohort.distinctDays = byDay.size;
    cohort.returnEstimand = 'profit per registered opportunity budget, including zero-profit abstentions; random return uses the same actual exposure, not independent opportunity selection';
    cohort.inference = Object.fromEntries(['marketLogLossImprovement', 'netReturn', 'randomReturnImprovement'].map((criterion, index) => [criterion, pairedBlockInterval([...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, daily]) => average(daily.map(v => v[criterion]))), { comparisons, alpha: settings.familyWiseAlpha, samples: 20000, seed: 73019 + index })]));
    cohort.researchEvidenceEligible = Object.values(cohort.inference).every(result => result.resolutionSufficient !== false && result.interval !== null && result.interval[0] > 0);
    cohort.paperAssumptionCount = fixed.filter(event => event.candidate.status === 'settled_paper_assumption' || event.candidate.settlement.paperRuleAssumption).length;
    cohort.status = cohort.researchEvidenceEligible ? 'RESEARCH_EVIDENCE_POSITIVE_EXECUTION_PENDING' : 'FIXED_HORIZON_NOT_ESTABLISHED';
    if (!cohort.researchEvidenceEligible) cohort.reasons.push('At least one multiplicity-adjusted lower bound failed the preregistered positive threshold.');
    if (cohort.paperAssumptionCount) cohort.reasons.push('Hypothetical settlement assumptions do not establish official purchasability or redeemable returns.');
    cohort.reasons.push('Actual transaction, official settlement applicability and execution evidence remain pending; this paper-only study cannot authorize deployment.');
  }
  const registered = cohorts.filter(c => REGISTERED_SOURCES.includes(c.sourceId));
  const collecting = registered.some(c => !c.locked);
  return { schemaVersion: 1, protocolId: protocol.protocolId, protocolHash, generatedAt: new Date(current).toISOString(), status: collecting ? 'COLLECTING_PROSPECTIVE_EVIDENCE' : 'FIXED_HORIZON_RESEARCH_REVIEW_COMPLETE', eligible: false, researchEvidenceEligible: registered.some(c => c.researchEvidenceEligible), locked: !collecting, settledEvents: Math.max(0, ...registered.map(c => c.settledEvents)), calendarDays: Math.min(horizonDays, Math.floor((current - registeredAt) / DAY)), minimumSettledEvents, minimumCalendarDays, registeredAt: protocol.registeredAt, horizonAt: new Date(horizonAt).toISOString(), plannedComparisons: comparisons, reasons: ['Each source/model uses all matched events inside the fixed calendar window; counts are never summed across models or sources.', 'No daily significance checking before the fixed horizon; decisions persist unchanged thereafter.', 'Paper evidence cannot establish actual executable or redeemable profit.'], limitations: ['Daily block bootstrap is a finite-sample approximation, not a guarantee of future returns.', 'The bootstrap estimand weights UTC event days equally; report event counts and distinct days separately.'], exclusions, cohorts };
}

module.exports = { evaluatePromotion, sourceFamily };
