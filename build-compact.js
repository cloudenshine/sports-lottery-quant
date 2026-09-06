'use strict';
const fs = require('fs');
const path = require('path');
const { validateDraws } = require('./update-all-history');
const { writeFileSet } = require('./sync-sports-live');

function buildCompact({ dataDir = path.join(__dirname, 'data'), now = new Date() } = {}) {
  const files = [];
  const result = {};
  for (const game of ['ssq', 'dlt']) {
    const draws = validateDraws(JSON.parse(fs.readFileSync(path.join(dataDir, `${game}_history.json`), 'utf8')), game, { now });
    const meta = { lottery: game, name: game === 'ssq' ? '双色球' : '超级大乐透', source: 'local validated history',
      generatedAt: now.toISOString(), total: draws.length, firstIssue: draws.at(-1).issue,
      latestIssue: draws[0].issue, latestDate: draws[0].date, latestDraw: draws[0] };
    const name = game.toUpperCase();
    const rows = draws.map(draw => [...draw.main, ...draw.special]);
    files.push([path.join(dataDir, `${game}-compact.js`), `window.${name}_META = ${JSON.stringify(meta)};\nwindow.${name}_DRAWS = ${JSON.stringify(rows)};\n`]);
    result[game] = meta;
  }
  writeFileSet(files);
  return result;
}
if (require.main === module) {
  try { console.log(JSON.stringify(buildCompact(), null, 2)); }
  catch (error) { console.error('Compact build failed:', error.message); process.exitCode = 1; }
}
module.exports = { buildCompact };
