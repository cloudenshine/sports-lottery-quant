'use strict';

const fs = require('fs');
const path = require('path');
const { fetchBuffer, writeFileSet } = require('./sync-sports-live');
const RULES = { ssq: { main: 6, mainMax: 33, special: 1, specialMax: 16, start: '03001', minimum: 3000, name: '双色球' },
  dlt: { main: 5, mainMax: 35, special: 2, specialMax: 12, start: '07001', minimum: 2500, name: '超级大乐透' } };

function validateDraws(draws, game, { now = new Date() } = {}) {
  const rule = RULES[game];
  if (!rule || !Array.isArray(draws) || !draws.length) throw new Error(`Empty or invalid ${game} history`);
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const issues = new Set();
  const dates = new Set();
  for (const draw of draws) {
    if (!draw || !/^\d{5}$/.test(draw.issue) || Number(draw.issue.slice(2)) === 0 || issues.has(draw.issue)) throw new Error('Invalid or duplicate issue');
    issues.add(draw.issue);
    const stamp = Date.parse(`${draw.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draw.date || '') || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== draw.date || draw.date > today) throw new Error(`Invalid or future draw date: ${draw.issue}`);
    if (draw.issue.slice(0, 2) !== draw.date.slice(2, 4) || dates.has(draw.date)) throw new Error(`Issue/date conflict: ${draw.issue}`);
    dates.add(draw.date);
    for (const [field, count, max] of [['main', rule.main, rule.mainMax], ['special', rule.special, rule.specialMax]]) {
      if (!Array.isArray(draw[field]) || draw[field].length !== count || new Set(draw[field]).size !== count || draw[field].some(n => !Number.isInteger(n) || n < 1 || n > max)) throw new Error(`Invalid ${field} numbers: ${draw.issue}`);
    }
  }
  const sorted = draws.map(draw => ({ issue: draw.issue, date: draw.date, main: [...draw.main].sort((a, b) => a - b), special: [...draw.special].sort((a, b) => a - b) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (let i = 1; i < sorted.length; i++) {
    const newer = sorted[i - 1], older = sorted[i];
    if (newer.date.slice(0, 4) === older.date.slice(0, 4) && Number(newer.issue.slice(2)) !== Number(older.issue.slice(2)) + 1) throw new Error(`Missing or misordered issues between ${older.issue} and ${newer.issue}`);
    if (newer.date.slice(0, 4) !== older.date.slice(0, 4) && (Number(newer.date.slice(0, 4)) !== Number(older.date.slice(0, 4)) + 1 || Number(newer.issue.slice(2)) !== 1)) throw new Error(`Missing history at year boundary ${older.issue}/${newer.issue}`);
  }
  return sorted;
}
function parseHistory(html, game, options = {}) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const rows = (clean.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []).filter(r => /class\s*=\s*["'][^"']*\bt_tr1\b[^"']*["']/i.test(r));
  const draws = rows.map(row => {
    const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || []).map(td => td.replace(/<[^>]+>/g, '').trim());
    const rule = RULES[game];
    if (cells.length < 1 + rule.main + rule.special) throw new Error('Incomplete draw row');
    const numbers = cells.slice(1, 1 + rule.main + rule.special);
    if (numbers.some(v => !/^\d{1,2}$/.test(v))) throw new Error(`Malformed numbers: ${cells[0]}`);
    return { issue: cells[0], date: row.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '',
      main: numbers.slice(0, rule.main).map(Number), special: numbers.slice(rule.main).map(Number) };
  });
  return validateDraws(draws, game, options);
}
const parseSsq = (html, options) => parseHistory(html, 'ssq', options);
const parseDlt = (html, options) => parseHistory(html, 'dlt', options);

function assertPreservesHistory(previous, incoming, game, options) {
  const old = validateDraws(previous, game, options);
  const byIssue = new Map(incoming.map(draw => [draw.issue, draw]));
  for (const draw of old) {
    const replacement = byIssue.get(draw.issue);
    if (!replacement || JSON.stringify(replacement) !== JSON.stringify(draw)) throw new Error(`Refusing missing or changed historical draw ${game}/${draw.issue}; investigate source correction separately`);
  }
}
async function update({ dataDir = path.join(__dirname, 'data'), fetch = fetchBuffer, now = new Date(), minimumCounts = {} } = {}) {
  const files = [];
  const results = {};
  for (const game of ['ssq', 'dlt']) {
    const rule = RULES[game];
    const buffer = await fetch(`https://datachart.500.com/${game}/history/newinc/history.php?start=${rule.start}`);
    const draws = parseHistory(new TextDecoder('gbk').decode(buffer), game, { now });
    if (draws.length < (minimumCounts[game] ?? rule.minimum)) throw new Error(`${game} history unexpectedly short: ${draws.length}`);
    const jsonPath = path.join(dataDir, `${game}_history.json`);
    if (fs.existsSync(jsonPath)) assertPreservesHistory(JSON.parse(fs.readFileSync(jsonPath, 'utf8')), draws, game, { now });
    const meta = { lottery: game, name: rule.name, source: 'datachart.500.com', generatedAt: now.toISOString(),
      total: draws.length, firstIssue: draws.at(-1).issue, latestIssue: draws[0].issue, latestDate: draws[0].date, latestDraw: draws[0] };
    files.push([jsonPath, JSON.stringify(draws, null, 2)],
      [path.join(dataDir, `${game}-compact.js`), `window.${game.toUpperCase()}_META = ${JSON.stringify(meta)};\nwindow.${game.toUpperCase()}_DRAWS = ${JSON.stringify(draws.map(d => [...d.main, ...d.special]))};\n`]);
    results[game] = meta;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  writeFileSet(files);
  console.log(`History updated: SSQ ${results.ssq.latestIssue}, DLT ${results.dlt.latestIssue}.`);
  return results;
}
if (require.main === module) update().catch(error => { console.error('History update failed:', error.message); process.exitCode = 1; });
module.exports = { parseSsq, parseDlt, parseHistory, validateDraws, assertPreservesHistory, update };
