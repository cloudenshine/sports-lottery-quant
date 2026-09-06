'use strict';
const { syncNumberSources } = require('../numbers-sources');
async function main() { const result = await syncNumberSources(); console.log(JSON.stringify({ status: result.status.status, games: Object.fromEntries(Object.entries(result.games).map(([id, game]) => [id, { status: game.status, draws: game.draws.length, details: game.detailsOk, nextIssue: game.nextIssue?.issue || null }])) }, null, 2)); return result; }
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
