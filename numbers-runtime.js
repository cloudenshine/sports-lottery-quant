'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Models = require('./number-models');
const Ledger = require('./numbers-ledger');
const DEFAULT_DIR = path.join(__dirname, 'data/numbers');
const COMPUTE_FILES = ['number-models.js', 'number-settlement.js', 'number-rule-context.js', 'number-evaluation.js', 'numbers-ledger.js', 'numbers-sources.js', 'numbers-runtime.js', 'scripts/numbers-daily.js'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function read(filename, fallback) { return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : fallback; }
function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temp = filename + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); fs.renameSync(temp, filename); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function protocolDefinition() {
  const body = { id: 'numbers-prospective-v2', schemaVersion: 2, modelIds: [...Models.MODEL_IDS], games: ['ssq', 'dlt'],
    ticketCount: 5, costYuan: 10, additional: false, sourceMaxAgeHours: 24, registrationLeadHours: 3,
    minimumTrainingDraws: 200, evaluationDays: 365, minimumIssuesPerGame: 120,
    alpha: 0.05, comparisonFamily: 12, distributionEThreshold: 240,
    returns: 'Published-table paper returns before tax; distribution evidence is not return advantage. Missing payouts remain pending.',
    stopping: 'The return review occurs after the fixed 365-day window, using every registered issue; no early profit promotion or favorable-subset selection.',
    codeHashes: Object.fromEntries(COMPUTE_FILES.map(name => [name, sha(fs.readFileSync(path.join(__dirname, name)))])) };
  return { ...body, hash: sha(JSON.stringify(body)) };
}
function getProtocol({ dataDir = DEFAULT_DIR, freeze = false, now = new Date() } = {}) {
  const current = protocolDefinition(), filename = path.join(dataDir, 'protocol.json'), saved = read(filename, null);
  if (saved) {
    const { hash, status, frozenAt, reviewAt, receiptSha256, ...body } = saved;
    const { receiptSha256: unusedReceipt, ...receipt } = saved;
    if (hash !== current.hash || sha(JSON.stringify(body)) !== hash || sha(JSON.stringify(receipt)) !== receiptSha256 || status !== 'frozen' || !Number.isFinite(Date.parse(frozenAt)) || reviewAt !== new Date(Date.parse(frozenAt) + 365 * 86400000).toISOString()) throw new Error('Frozen number protocol or computation code changed; create a reviewed new protocol before further registration or settlement.');
    return saved;
  }
  if (!freeze) return { ...current, status: 'draft' };
  const frozenAt = new Date(now).toISOString();
  const frozen = { ...current, status: 'frozen', frozenAt, reviewAt: new Date(Date.parse(frozenAt) + 365 * 86400000).toISOString() };
  frozen.receiptSha256 = sha(JSON.stringify(frozen));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(frozen, null, 2), { flag: 'wx' });
  return frozen;
}
function withLock(dataDir, action) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filename = path.join(dataDir, 'runtime.lock');
  let fd;
  try { fd = fs.openSync(filename, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = read(filename, null);
    if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Number runtime lock is unreadable; inspect it before recovery');
    try { process.kill(owner.pid, 0); throw new Error('Number daily job is already running'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    fs.unlinkSync(filename); fd = fs.openSync(filename, 'wx');
  }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); fs.closeSync(fd);
  return Promise.resolve().then(action).finally(() => fs.unlinkSync(filename));
}
function loadSources(dataDir = DEFAULT_DIR) {
  const sources = read(path.join(dataDir, 'sources.json'), { generatedAt: null, status: { status: 'unavailable' }, games: {} });
  for (const [gameId, game] of Object.entries(sources.games)) {
    const enriched = require('./number-rule-context').enrichDraws({ gameId, draws: game.draws });
    sources.games[gameId] = { ...game, draws: enriched.draws, ruleContext: enriched.summary };
  }
  return sources;
}
function dashboard({ dataDir = DEFAULT_DIR, now = new Date(), save = true } = {}) {
  const sources = loadSources(dataDir), evaluation = read(path.join(dataDir, 'evaluation.json'), null);
  let protocol, protocolError = null;
  try { protocol = getProtocol({ dataDir, now }); } catch (error) { protocol = read(path.join(dataDir, 'protocol.json'), null); protocolError = error.message; }
  const games = {};
  for (const gameId of ['ssq', 'dlt']) {
    const game = sources.games[gameId] || { draws: [], nextIssue: null, sourceStatus: { status: 'unavailable' } };
    const eligibility = Ledger.registrationEligibility({ gameId, draws: game.draws, nextIssue: game.nextIssue, now });
    const reasons = [...(eligibility.reasons || [])];
    if (game.draws.length < 200) reasons.push('至少需要 200 期已公开训练记录');
    if (protocolError) reasons.push(protocolError);
    if (protocol?.reviewAt && (Date.parse(now) >= Date.parse(protocol.reviewAt) || Date.parse(game.nextIssue?.drawAt) >= Date.parse(protocol.reviewAt))) reasons.push('本协议固定观察窗口已结束；已有批次继续结算，新增批次需另立协议');
    games[gameId] = { ...game, registration: { ...eligibility, eligible: eligibility.eligible && reasons.length === 0,
      reasons, reason: reasons.join('；'), cutoff: eligibility.cutoffAt, sourceFresh: eligibility.eligible },
      report: evaluation?.games?.[gameId] || null, ledgerSummary: Ledger.summarizeLedger({ dataDir, gameId, now }) };
  }
  const result = { schemaVersion: 2, generatedAt: new Date(now).toISOString(), sourceGeneratedAt: sources.generatedAt,
    status: protocolError ? 'protocol_mismatch' : sources.status?.status || 'unavailable', protocol, protocolError,
    sources: sources.status, games, evaluation, ledger: Ledger.summarizeLedger({ dataDir, now }),
    profitAdvantage: { status: 'not_proven', reason: '是否存在可靠收益优势由固定协议的新观察判定；概率检验、历史收益和工程测试分别展示。' } };
  if (save) { write(path.join(dataDir, 'dashboard.json'), result); write(path.join(dataDir, 'dashboard.js'), 'window.NUMBER_DASHBOARD = ' + JSON.stringify(result).replace(/</g, '\\u003c') + ';\n'); }
  return result;
}
async function registerGame({ dataDir = DEFAULT_DIR, gameId, now } = {}) {
  if (!['ssq', 'dlt'].includes(gameId)) throw new RangeError('Unknown number lottery game');
  return withLock(dataDir, () => {
    const observedAt = now || new Date(), state = dashboard({ dataDir, now: observedAt, save: false }), game = state.games[gameId];
    if (!game.registration.eligible) throw new Error(game.registration.reason || 'Registration is unavailable');
    const protocol = getProtocol({ dataDir, freeze: true, now: observedAt });
    const registration = Ledger.registerBatch({ dataDir, gameId, nextIssue: game.nextIssue, draws: game.draws, ...(now ? { now } : {}), protocol });
    return { ...registration, dashboard: dashboard({ dataDir, now: now || new Date() }) };
  });
}
async function runDaily({ dataDir = DEFAULT_DIR, collect = true, register = true, evaluate = true, now, sourceOptions = {} } = {}) {
  return withLock(dataDir, async () => {
    // Check an existing freeze before spending network requests or changing evaluation state.
    getProtocol({ dataDir, now: now || new Date() });
    if (collect) await require('./numbers-sources').syncNumberSources({ ...sourceOptions, dataDir, ...(now ? { now } : {}) });
    const sources = loadSources(dataDir);
    const inputHash = sha(JSON.stringify(sources.games));
    const oldReport = read(path.join(dataDir, 'evaluation.json'), null);
    if (evaluate && oldReport?.runtimeInputHash !== inputHash && Object.values(sources.games).some(g => g.draws?.length >= 320)) {
      const report = require('./number-evaluation').evaluateAll({ games: sources.games });
      write(path.join(dataDir, 'evaluation.json'), { ...report, runtimeInputHash: inputHash });
      write(path.join(dataDir, 'evaluation-inputs', inputHash + '.json'), sources);
    }
    const observedAt = now || new Date();
    let protocol = getProtocol({ dataDir, now: observedAt });
    const before = dashboard({ dataDir, now: observedAt, save: false }), registrations = [];
    if (register && Object.values(before.games).some(g => g.registration.eligible)) protocol = getProtocol({ dataDir, freeze: true, now: observedAt });
    const settlements = Ledger.settleBatches({ dataDir, games: sources.games, now: observedAt });
    for (const gameId of ['ssq', 'dlt']) {
      const game = before.games[gameId];
      if (register && game.registration.eligible) registrations.push({ gameId, ...Ledger.registerBatch({ dataDir, gameId, nextIssue: game.nextIssue, draws: game.draws, ...(now ? { now } : {}), protocol }) });
    }
    const finishedAt = now || new Date();
    const result = { generatedAt: new Date(finishedAt).toISOString(), sourceStatus: sources.status?.status || 'unavailable',
      registrations: registrations.map(r => ({ gameId: r.gameId, created: r.created, issue: r.batch.issue || r.batch.nextIssue?.issue })), settlements };
    write(path.join(dataDir, 'daily-runs', result.generatedAt.replace(/[:.]/g, '-') + '-' + crypto.randomUUID() + '.json'), result);
    return { ...result, dashboard: dashboard({ dataDir, now: finishedAt }) };
  });
}
module.exports = { DEFAULT_DIR, COMPUTE_FILES, getProtocol, withLock, loadSources, dashboard, registerGame, runDaily };
