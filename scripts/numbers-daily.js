'use strict';
const { runDaily } = require('../numbers-runtime');
async function main() {
  const allowed = new Set(['--cached', '--preview', '--skip-evaluation']);
  if (process.argv.slice(2).some(arg => !allowed.has(arg))) throw new Error('Unknown numbers-daily option');
  const result = await runDaily({ collect: !process.argv.includes('--cached'), register: !process.argv.includes('--preview'), evaluate: !process.argv.includes('--skip-evaluation') });
  console.log(JSON.stringify({ generatedAt: result.generatedAt, sourceStatus: result.sourceStatus, registrations: result.registrations,
    settlements: { created: result.settlements.created, revisions: result.settlements.revisions, pending: result.settlements.pending },
    ledger: { batchCount: result.dashboard.ledger.batchCount, predictionCount: result.dashboard.ledger.predictionCount, settledCount: result.dashboard.ledger.settledCount },
    profitAdvantage: result.dashboard.profitAdvantage }, null, 2));
  if (result.sourceStatus !== 'ok') process.exitCode = 2;
  return result;
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { main };
