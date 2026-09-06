'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');

const SOURCE_URLS = {
  jingcai: 'https://trade.500.com/jczq/',
  sfc: 'https://trade.500.com/sfc/'
};

function fetchBuffer(url, { timeoutMs = 15000, maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) res.destroy(new Error(`Response exceeds ${maxBytes} bytes`));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error(`Incomplete response from ${url}`)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timed out: ${url}`)));
    req.on('error', reject);
  });
}

// Stage every file before replacing any. Roll back completed replacements on a
// normal write failure. A process/power failure still requires resynchronization.
function writeFileSet(files) {
  const staged = [];
  const replaced = [];
  try {
    for (const [target, content] of files) {
      const temp = `${target}.${randomUUID()}.tmp`;
      const previous = fs.existsSync(target) ? fs.readFileSync(target) : null;
      staged.push({ target, temp, previous });
      fs.writeFileSync(temp, content, { flag: 'wx' });
    }
    for (const item of staged) {
      fs.renameSync(item.temp, item.target);
      replaced.push(item);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const item of replaced.reverse()) {
      try {
        if (item.previous === null) fs.unlinkSync(item.target);
        else fs.writeFileSync(item.target, item.previous);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], 'Write and rollback failed');
    throw error;
  } finally {
    for (const item of staged) if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp);
  }
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) result[match[1].toLowerCase()] = match[3];
  return result;
}
function decimalOdd(value) {
  return typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 1 ? Number(value) : null;
}
function sourceText(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[<>\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid source text: ${field}`);
  return value.trim();
}

function evidenceStamp(value = new Date()) {
  return value.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}
function archiveSourceBody(evidenceDir, sourceId, sourceUrl, body, fetchedAt = new Date()) {
  if (!evidenceDir) return null;
  if (!Buffer.isBuffer(body)) throw new TypeError('Source body must be a Buffer');
  const bodySha256 = createHash('sha256').update(body).digest('hex');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const stem = `${sourceId}-${evidenceStamp(fetchedAt)}-${bodySha256.slice(0, 12)}`;
  const bodyPath = path.join(evidenceDir, `${stem}.body`);
  const metaPath = path.join(evidenceDir, `${stem}.meta.json`);
  if (!fs.existsSync(bodyPath)) fs.writeFileSync(bodyPath, body, { flag: 'wx' });
  if (!fs.existsSync(metaPath)) fs.writeFileSync(metaPath, JSON.stringify({
    sourceId, sourceUrl, fetchedAt: fetchedAt.toISOString(), httpStatus: 200,
    bodyBytes: body.length, bodySha256, rawBody: path.basename(bodyPath)
  }, null, 2) + '\n', { flag: 'wx' });
  return { sourceId, sourceUrl, fetchedAt: fetchedAt.toISOString(), bodyBytes: body.length, bodySha256, rawBody: path.basename(bodyPath) };
}
async function sourceBuffer(url, options = {}) {
  const body = await (options.fetch || fetchBuffer)(url);
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (options.evidenceDir) archiveSourceBody(options.evidenceDir, options.sourceId, url, buffer, options.fetchedAt);
  return buffer;
}
function marketOdds(row, type) {
  const odds = {};
  for (const tag of row.match(/<[^>]+>/g) || []) {
    const attrs = attributes(tag);
    if (attrs['data-type'] !== type || !['3', '1', '0'].includes(attrs['data-value'])) continue;
    const value = decimalOdd(attrs['data-sp']);
    if (value !== null) odds[attrs['data-value']] = value;
  }
  return Object.keys(odds).length === 3 ? odds : null;
}
function matchRows(html) {
  const rows = (html.replace(/<!--[\s\S]*?-->/g, '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [])
    .filter(row => (attributes(row.match(/^<tr\b[^>]*>/i)[0]).class || '').split(/\s+/).includes('bet-tb-tr'));
  if (!rows.length) throw new Error('No recognized match rows; preserve the last snapshot');
  return rows;
}
function parseJingcai(html, { now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid observation time');
  const matches = [];
  const ids = new Set();
  for (const row of matchRows(html)) {
    const a = attributes(row.match(/^<tr\b[^>]*>/i)[0]);
    const id = a['data-fixtureid'];
    const date = a['data-matchdate'];
    const time = a['data-matchtime'];
    if (!id || !/^\d+$/.test(id) || !a['data-matchnum'] || !a['data-homesxname'] || !a['data-awaysxname']) throw new Error('Incomplete fixture identity');
    if (ids.has(id)) throw new Error(`Duplicate fixture ${id}`);
    ids.add(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error(`Invalid kickoff for ${id}`);
    const kickoffAt = new Date(`${date}T${time}:00+08:00`);
    if (!Number.isFinite(kickoffAt.getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Invalid kickoff for ${id}`);
    if (kickoffAt <= now) continue;
    const odds = {};
    const spf = marketOdds(row, 'nspf');
    const rqspf = marketOdds(row, 'spf');
    if (spf) odds.SPF = spf;
    if (rqspf && /^-?\d+$/.test(a['data-rangqiu'] || '')) odds.RQSPF = { handicap: Number(a['data-rangqiu']), ...rqspf };
    if (!Object.keys(odds).length) throw new Error(`No complete quoted market for ${id}`);
    matches.push({
      id: `LIVE_${id}`, matchNum: sourceText(a['data-matchnum'], 'matchNum'), matchDate: date, kickoffTime: time,
      kickoffAt: kickoffAt.toISOString(), league: sourceText(a['data-simpleleague'] || '未知', 'league'), leagueColor: '#3b82f6',
      status: '来源快照，销售状态未核验',
      homeTeam: { name: sourceText(a['data-homesxname'], 'home'), rank: null, recentResults: [] },
      awayTeam: { name: sourceText(a['data-awaysxname'], 'away'), rank: null, recentResults: [] },
      h2h: [], odds,
      dataQuality: { source: 'trade.500.com/jczq/', teamStatistics: 'unavailable', salesStatus: 'unverified', quotedMarkets: Object.keys(odds) }
    });
  }
  if (!matches.length) throw new Error('No upcoming fixtures; preserve the last snapshot');
  return matches;
}
function parseSFC(html) {
  const matches = matchRows(html).map((row, index) => {
    const a = attributes(row.match(/^<tr\b[^>]*>/i)[0]);
    const teams = (a['data-vs'] || '').split(/\s+vs\s+|vs/i).map(s => s.trim());
    const odds = (a['data-bjpl'] || '').split(',').map(decimalOdd);
    if (teams.length !== 2 || teams.some(s => !s) || odds.length !== 3 || odds.some(v => v === null)) throw new Error(`Invalid SFC fixture ${index + 1}`);
    return { matchIdx: index + 1, home: sourceText(teams[0], 'home'), away: sourceText(teams[1], 'away'), league: '未知',
      odds: { '3': odds[0], '1': odds[1], '0': odds[2] },
      dataQuality: { source: 'trade.500.com/sfc/', kickoff: 'unavailable', issue: 'unavailable', salesStatus: 'unverified' } };
  });
  if (matches.length !== 14) throw new Error(`Expected 14 SFC fixtures, received ${matches.length}`);
  if (new Set(matches.map(m => JSON.stringify([m.home, m.away]))).size !== matches.length) throw new Error('Duplicate SFC fixtures');
  return matches;
}
async function syncJingcai(options = {}) {
  const body = await sourceBuffer(SOURCE_URLS.jingcai, { ...options, sourceId: 'jczq' });
  return parseJingcai(new TextDecoder('gbk').decode(body), options);
}
async function syncSFC(options = {}) {
  const body = await sourceBuffer(SOURCE_URLS.sfc, { ...options, sourceId: 'sfc' });
  return parseSFC(new TextDecoder('gbk').decode(body));
}
async function main({ dataDir = path.join(__dirname, 'data'), fetch = fetchBuffer, now = new Date(), archiveEvidence = false } = {}) {
  const evidenceDir = archiveEvidence ? path.join(dataDir, 'sports-source-evidence') : null;
  const markets = {
    jingcai: { status: 'failed', error: null },
    sfc: { status: 'failed', error: null }
  };
  const sourceErrors = { jingcai: null, sfc: null };
  let jc = [];
  let sfc = [];
  try {
    jc = await syncJingcai({ fetch, now, evidenceDir, fetchedAt: now });
    markets.jingcai = { status: 'ok', error: null };
  } catch (error) {
    sourceErrors.jingcai = error.message || String(error);
    markets.jingcai.error = sourceErrors.jingcai;
  }
  try {
    sfc = await syncSFC({ fetch, evidenceDir, fetchedAt: now });
    markets.sfc = { status: 'ok', error: null };
  } catch (error) {
    sourceErrors.sfc = error.message || String(error);
    markets.sfc.error = sourceErrors.sfc;
  }
  if (!jc.length && !sfc.length) {
    const error = new Error(`All sports sources failed: ${sourceErrors.jingcai || sourceErrors.sfc || 'no fixtures'}`);
    error.sourceStatus = markets;
    error.sourceErrors = sourceErrors;
    throw error;
  }
  const overallStatus = markets.jingcai.status === 'ok' && markets.sfc.status === 'ok' ? 'ok' : 'partial';
  const payload = { schemaVersion: 2, dataKind: 'source-snapshot', salesStatus: 'unverified',
    syncedAt: now.toISOString(), displayTime: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    jingcaiCount: jc.length, sfcCount: sfc.length, jingcai: jc, sfc,
    sourceStatus: { status: overallStatus, jingcai: markets.jingcai, sfc: markets.sfc, markets }, sourceErrors };
  fs.mkdirSync(dataDir, { recursive: true });
  // Escaping '<' also keeps generated bundles safe when embedded in standalone HTML.
  const json = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c');
  writeFileSet([[path.join(dataDir, 'sports_live.json'), json], [path.join(dataDir, 'sports-live-data.js'), `window.SPORTS_LIVE = ${json};\n`]]);
  return payload;
}
if (require.main === module) main({ archiveEvidence: true }).then(payload => {
  console.log(`Saved source snapshot: ${payload.jingcaiCount} JCZQ, ${payload.sfcCount} SFC; source status is ${payload.sourceStatus.status}.`);
}).catch(error => { console.error('Sync failed:', error.message); process.exitCode = 1; });
module.exports = { fetchBuffer, writeFileSet, archiveSourceBody, parseJingcai, parseSFC, syncJingcai, syncSFC, main };
