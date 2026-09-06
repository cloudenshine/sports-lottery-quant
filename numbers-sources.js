'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const GAMES = { ssq: [6, 33, 1, 16], dlt: [5, 35, 2, 12] };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const plain = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const cells = row => (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || []).map(plain);
function numeric(value) { const s = String(value).replace(/[,元注\s]/g, ''); if (!s || /^(?:-|—)+$/.test(s)) return null; if (!/^\d+(?:\.\d+)?$/.test(s) || !Number.isFinite(Number(s))) throw new Error(`Invalid published number: ${value}`); return Number(s); }
function issueId(issue) { let s = String(issue); if (/^20\d{5}$/.test(s)) s = s.slice(2); if (/^\d{5}$/.test(s) && Number(s.slice(2)) > 0) return s; throw new Error('Invalid issue'); }
function validate(draw, now = new Date()) {
  const rule = GAMES[draw.gameId]; if (!rule) throw new Error('Invalid game');
  draw.issue = issueId(draw.issue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draw.date) || new Date(`${draw.date}T00:00:00Z`).toISOString().slice(0, 10) !== draw.date || draw.issue.slice(0, 2) !== draw.date.slice(2, 4)) throw new Error('Invalid draw date');
  if (draw.date > new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)) throw new Error('Future draw');
  for (const [field, count, max] of [['main', rule[0], rule[1]], ['special', rule[2], rule[3]]]) {
    if (!Array.isArray(draw[field]) || draw[field].length !== count || new Set(draw[field]).size !== count || draw[field].some(n => !Number.isInteger(n) || n < 1 || n > max)) throw new Error(`Invalid ${field}`);
    draw[field].sort((a, b) => a - b);
  }
  return draw;
}
function baseDraw(gameId, issue, date, main, special, source) {
  return { gameId, issue: issueId(issue), date, drawAt: `${date}T23:59:59+08:00`, drawAtPrecision: 'day', drawAtEvidence: 'Conservative end-of-published-date boundary, not observed draw time', main, special, payouts: { base: {}, additional: {} }, winners: { base: {}, additional: {} }, salesYuan: null, poolYuan: null, ruleId: gameId === 'dlt' ? (Number(issueId(issue)) >= 26014 ? 'dlt-2026-7-level' : 'dlt-2019-9-level') : (Number(issueId(issue)) >= 26014 ? 'ssq-2026' : 'ssq-legacy-6-level'), specialPrizeActive: gameId === 'ssq' && Number(issueId(issue)) >= 26014 ? null : false, source };
}
function parseHistory(html, gameId, source, now) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').match(/<tbody\b[^>]*id=["']tdata["'][^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error('Missing history table');
  const draws = (body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).map(row => {
    const c = cells(row), offset = gameId === 'ssq' ? 9 : 8, r = GAMES[gameId];
    if (c.length !== offset + 7) throw new Error('Unexpected history columns');
    const draw = baseDraw(gameId, c[0], c.at(-1), c.slice(1, 1 + r[0]).map(Number), c.slice(1 + r[0], 1 + r[0] + r[2]).map(Number), source);
    draw.poolYuan = numeric(c[offset]); draw.salesYuan = numeric(c[offset + 5]);
    for (let tier = 1; tier <= 2; tier++) { draw.winners.base[tier] = numeric(c[offset + 1 + (tier - 1) * 2]); draw.payouts.base[tier] = numeric(c[offset + 2 + (tier - 1) * 2]); }
    draw.payoutEvidence = 'published_draw_table_partial';
    return validate(draw, now);
  });
  if (!draws.length || new Set(draws.map(d => d.issue)).size !== draws.length) throw new Error('Empty or duplicate history');
  return draws.sort((a, b) => a.date.localeCompare(b.date));
}
const tierNames = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
function parseDltDetail(html, source, now) {
  const text = plain(html), issue = text.match(/第(\d{5})期开奖公告/)?.[1], day = text.match(/开奖日期：(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const numbers = html.match(/本期开奖号码：[\s\S]*?<li>([^<]+)<\/li>\s*<li>([^<]+)<\/li>/)?.slice(1).map(s => s.trim().split(/\s+/).map(Number));
  if (!issue || !day || !numbers) throw new Error('Missing official DLT draw identity');
  const draw = baseDraw('dlt', issue, `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`, ...numbers, source);
  for (const ul of html.match(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi) || []) {
    const firstCell = plain(ul.match(/<li\b[^>]*>([\s\S]*?)<\/li>/i)?.[1] || '');
    const label = firstCell.match(/^([一二三四五六七八九])等奖(派奖)?(?:\s|$)/);
    const tier = label ? tierNames.indexOf(label[1]) + 1 : 0;
    if (!tier) continue;
    const values = (ul.match(/<li\b[^>]*class=["']TextAlignR["'][^>]*>[\s\S]*?<\/li>/gi) || []).map(s => numeric(plain(s)));
    if (label[2]) {
      if (values.length !== 3) throw new Error('Incomplete separate promotional row');
      draw.promotion ||= { eligibility: 'unverified', payouts: { base: {}, additional: {} }, winners: { base: {}, additional: {} } };
      if (Object.hasOwn(draw.promotion.payouts.base, tier)) throw new Error('Duplicate promotion prize row');
      draw.promotion.payouts.base[tier] = values[1]; draw.promotion.winners.base[tier] = values[0];
      draw.payoutScope = 'published_base_prizes_excluding_promotion';
      continue;
    }
    if (![3, 6, 12].includes(values.length)) throw new Error('Incomplete official prize row');
    if (Object.hasOwn(draw.payouts.base, tier)) throw new Error('Duplicate base prize row');
    draw.winners.base[tier] = values[0]; draw.payouts.base[tier] = values[1];
    if (values.length === 6) { draw.winners.additional[tier] = values[3]; draw.payouts.additional[tier] = values[4]; }
    if (values.length === 12) {
      const labels = [...ul.matchAll(/<div\b[^>]*>([^<]+)<\/div>/g)].map(m => m[1].trim()).slice(1);
      if (JSON.stringify(labels) !== JSON.stringify(['基本', '派奖', '追加', '派奖'])) throw new Error('Unknown promotional row structure');
      draw.winners.additional[tier] = values[6]; draw.payouts.additional[tier] = values[7];
      draw.promotion ||= { eligibility: 'unverified', payouts: { base: {}, additional: {} }, winners: { base: {}, additional: {} } };
      draw.promotion.payouts.base[tier] = values[4]; draw.promotion.winners.base[tier] = values[3];
      draw.promotion.payouts.additional[tier] = values[10]; draw.promotion.winners.additional[tier] = values[9];
      draw.payoutScope = 'published_base_prizes_excluding_promotion';
    }
  }
  const expected = Number(issue) >= 26014 ? 7 : 9;
  if (Object.keys(draw.payouts.base).length !== expected) throw new Error('Incomplete official prize table');
  draw.salesYuan = numeric(text.match(/本期全国销售金额：([\d,.]+)元/)?.[1]);
  draw.poolYuan = numeric(text.match(/([\d,.]+)元奖金滚入下期奖池/)?.[1]);
  draw.payoutEvidence = 'published_draw_table';
  return validate(draw, now);
}
function parseSsqDetail(html, source, now) {
  const text = plain(html), issue = text.match(/双色球(20\d{5})期开奖结果/)?.[1] || text.match(/开奖期数：\s*第\s*(20\d{5})\s*期/)?.[1];
  const chineseDay = text.match(/开奖日期：\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const date = text.match(/开奖时间：\s*(\d{4}-\d{2}-\d{2})/)?.[1] || (chineseDay && `${chineseDay[1]}-${chineseDay[2].padStart(2, '0')}-${chineseDay[3].padStart(2, '0')}`);
  const block = html.match(/<div[^>]*class=["'][^"']*vResult_contentDigit_ball[^"']*["'][^>]*>([\s\S]*?)<\/div>/)?.[1] || html;
  const reds = [...block.matchAll(/<(?:b|div)\s+class=["']red(?:-ball)?["'][^>]*>\s*(\d{1,2})\s*<\/(?:b|div)>/g)].map(m => Number(m[1]));
  const blues = [...block.matchAll(/<(?:b|div)\s+class=["']blue(?:-ball)?["'][^>]*>\s*(\d{1,2})\s*<\/(?:b|div)>/g)].map(m => Number(m[1]));
  if (!issue || !date) throw new Error('Missing SSQ detail identity');
  const draw = baseDraw('ssq', issue, date, reds, blues, source);
  for (const row of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const c = cells(row), tier = tierNames.findIndex(name => c[0] === `${name}等奖`) + 1;
    if (tier && c.length === 3) { draw.winners.base[tier] = numeric(c[1]); draw.payouts.base[tier] = numeric(c[2]); }
    if (c[0] === '福运奖' && c.length === 3) { draw.specialPrizeActive = true; draw.winners.base.fortune = numeric(c[1]); draw.payouts.base.fortune = numeric(c[2]); }
  }
  if (Object.keys(draw.payouts.base).length < 6) throw new Error('Incomplete SSQ prize table');
  draw.salesYuan = numeric(text.match(/本期销量：\s*([\d,.\-]+)/)?.[1]);
  draw.poolYuan = numeric(text.match(/(?:奖池滚存|累计奖池)：\s*([\d,.\-]+)/)?.[1]);
  draw.payoutEvidence = draw.specialPrizeActive === null ? 'published_draw_table_special_status_unknown' : 'published_draw_table';
  return validate(draw, now);
}
function parseNextIssues(html, source, now = new Date()) {
  const result = {};
  for (const article of html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) || []) {
    const gameId = article.match(/history\.php\?type=(ssq|dlt)["']/)?.[1], next = plain(article).match(/下期 (\d{5}|20\d{5}) · (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/);
    if (!gameId || !next) continue;
    const drawAt = `${next[2]}T${next[3]}:00+08:00`;
    if (!(Date.parse(drawAt) > now.getTime())) continue;
    result[gameId] = { issue: issueId(next[1]), drawAt, salesCloseAt: null, scheduleEvidence: 'secondary_published_next_issue_announcement', source };
  }
  if (!Object.keys(result).length) throw new Error('No future issue announcement');
  return result;
}
function atomicJson(filename, value) { fs.mkdirSync(path.dirname(filename), { recursive: true }); const temp = `${filename}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, filename); }
async function syncNumberSources({ dataDir = path.join(__dirname, 'data/numbers'), fetchImpl = fetch, now = new Date(), detailLimit = 300, concurrency = 4, refreshDetails = false, sources } = {}) {
  if (!Number.isInteger(detailLimit) || detailLimit < 0 || detailLimit > 2000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('Invalid collection limits');
  const startedAt = new Date(now).toISOString(), statuses = [], corrections = [];
  const cfg = sources || { ssq: 'https://datachart.500star.com/ssq/history/newinc/history.php?start=23001', dlt: 'https://datachart.500star.com/dlt/history/newinc/history.php?start=23001', next: 'https://www.tifucai.com/index.php' };
  fs.mkdirSync(path.join(dataDir, 'raw'), { recursive: true });
  async function acquire(sourceId, sourceUrl, parser, { cache = false } = {}) {
    const cacheFile = path.join(dataDir, 'cache', `${sha(sourceUrl)}.json`);
    if (cache && fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile));
        if (!/^raw\/[a-f0-9]{64}\.body$/.test(cached.rawRef) || cached.sourceUrl !== sourceUrl) throw new Error('Invalid cached source identity');
        const buffer = fs.readFileSync(path.join(dataDir, cached.rawRef));
        if (sha(buffer) !== cached.bodySha256) throw new Error('Cached archive hash mismatch');
        return parser(buffer.toString('utf8'), cached, now);
      } catch (error) { statuses.push({ sourceId, sourceUrl, status: 'cache_rejected', error: error.message }); }
    }
    let source, response;
    try {
      response = await fetchImpl(sourceUrl, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'LotteryResearch/1.0 public-result-archive' } });
      const buffer = Buffer.from(await response.arrayBuffer()), bodySha256 = sha(buffer), rawRef = `raw/${bodySha256}.body`;
      if (!fs.existsSync(path.join(dataDir, rawRef))) fs.writeFileSync(path.join(dataDir, rawRef), buffer, { flag: 'wx' });
      source = { sourceId, sourceUrl, fetchedAt: fetchImpl === fetch ? new Date().toISOString() : startedAt, bodySha256, rawRef };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parser(buffer.toString('utf8'), source, now);
      atomicJson(cacheFile, source); statuses.push({ ...source, status: 'ok' }); return parsed;
    } catch (error) { statuses.push({ sourceId, sourceUrl, ...source, status: 'failed', error: error.message, httpStatus: response?.status || null }); throw error; }
  }
  const games = {};
  for (const gameId of Object.keys(GAMES)) {
    const previousFile = path.join(dataDir, `${gameId}.json`), previous = fs.existsSync(previousFile) ? JSON.parse(fs.readFileSync(previousFile)) : { draws: [] };
    const byIssue = new Map(previous.draws.map(draw => [draw.issue, draw])); let fresh = false;
    try {
      const rows = await acquire(`500star-${gameId}-history`, cfg[gameId], (html, source) => parseHistory(html, gameId, source, now));
      for (const draw of rows) {
        const old = byIssue.get(draw.issue);
        if (old && (JSON.stringify(old.main) !== JSON.stringify(draw.main) || JSON.stringify(old.special) !== JSON.stringify(draw.special) || old.date !== draw.date)) { corrections.push({ gameId, issue: draw.issue, old, incoming: draw, disposition: 'quarantined_conflicting_draw' }); continue; }
        if (!old || Object.keys(old.payouts.base).length <= 2) byIssue.set(draw.issue, draw);
      }
      fresh = true;
    } catch { /* Preserve previous observations and expose failure. */ }
    const candidates = [...byIssue.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, detailLimit);
    let cursor = 0, detailsOk = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const draw = candidates[cursor++], sourceUrl = cfg[`${gameId}Detail`] ? cfg[`${gameId}Detail`](draw.issue) : gameId === 'dlt' ? `https://gdlottery.cn/f_html/kjgg/P085_${draw.issue}.html` : `https://www.vipc.cn/result/ssq/20${draw.issue}`;
        try {
          const cache = !refreshDetails && !candidates.slice(0, 10).some(d => d.issue === draw.issue);
          let detail;
          try { detail = await acquire(gameId === 'dlt' ? 'guangdong-ticai-dlt-detail' : 'vipc-ssq-detail', sourceUrl, gameId === 'dlt' ? parseDltDetail : parseSsqDetail, { cache }); }
          catch (error) {
            if (gameId !== 'ssq' || sources) throw error;
            detail = await acquire('tianji-ssq-detail', `https://yc.16788.cn/kaijiang/ssq/20${draw.issue}.html`, parseSsqDetail, { cache });
          }
          if (detail.issue !== draw.issue || detail.date !== draw.date || JSON.stringify(detail.main) !== JSON.stringify(draw.main) || JSON.stringify(detail.special) !== JSON.stringify(draw.special)) throw new Error('Detail/history identity mismatch');
          if (Object.keys(draw.payouts.base).length > 2 && (JSON.stringify(draw.payouts) !== JSON.stringify(detail.payouts) || JSON.stringify(draw.winners) !== JSON.stringify(detail.winners))) corrections.push({ gameId, issue: draw.issue, old: draw, incoming: detail, disposition: draw.source.bodySha256 === detail.source.bodySha256 ? 'parser_reinterpretation_same_source' : 'published_payout_revision' });
          if (detail.poolYuan === null && draw.poolYuan !== null) { detail.poolYuan = draw.poolYuan; detail.poolSource = draw.source; }
          if (detail.salesYuan === null && draw.salesYuan !== null) { detail.salesYuan = draw.salesYuan; detail.salesSource = draw.source; }
          byIssue.set(draw.issue, { ...detail, corroboration: draw.source.sourceId.includes('history') ? [draw.source] : draw.corroboration || [] }); detailsOk++;
        } catch (error) { statuses.push({ sourceId: `${gameId}-detail-validation`, sourceUrl, issue: draw.issue, status: 'failed', error: error.message }); }
      }
    }));
    games[gameId] = { gameId, fetchedAt: startedAt, draws: [...byIssue.values()].sort((a, b) => a.date.localeCompare(b.date)), nextIssue: null, status: fresh ? (detailsOk === candidates.length && !corrections.some(c => c.gameId === gameId && c.disposition.startsWith('quarantined')) ? 'ok' : 'degraded') : previous.draws.length ? 'stale' : 'failed', detailsOk, detailTarget: candidates.length };
  }
  try { const next = await acquire('tifucai-next-issue', cfg.next, parseNextIssues); for (const id of Object.keys(GAMES)) games[id].nextIssue = next[id] || null; } catch { /* Never reuse a stale future issue as fresh. */ }
  const status = { schemaVersion: 1, fetchedAt: startedAt, status: Object.values(games).every(g => g.status === 'ok' && g.nextIssue) ? 'ok' : 'degraded', results: statuses, corrections: corrections.length };
  for (const game of Object.values(games)) atomicJson(path.join(dataDir, `${game.gameId}.json`), game);
  if (corrections.length) atomicJson(path.join(dataDir, 'corrections', `${startedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`), corrections);
  atomicJson(path.join(dataDir, 'sources-status.json'), status);
  for (const game of Object.values(games)) game.sourceStatus = { status: game.status, lastAttemptAt: startedAt, detailsOk: game.detailsOk, detailTarget: game.detailTarget };
  atomicJson(path.join(dataDir, 'sources.json'), { generatedAt: startedAt, status, games });
  atomicJson(path.join(dataDir, 'runs', `${startedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`), { status, counts: Object.fromEntries(Object.entries(games).map(([id, g]) => [id, g.draws.length])) });
  return { games, status };
}
module.exports = { syncNumberSources, parseHistory, parseDltDetail, parseSsqDetail, parseNextIssues, validate, issueId };
