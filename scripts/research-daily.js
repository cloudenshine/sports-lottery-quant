"use strict";
const { runDaily } = require("../research-daily");
if (require.main === module) runDaily().then(d => {
  console.log(JSON.stringify({ status: d.daily.status, generatedAt: d.generatedAt, data: d.data, daily: d.daily, ledger: { predictions: d.ledger.predictionCount, resultVersions: d.ledger.resultVersionCount, settlements: d.ledger.settlementVersionCount }, promotion: d.promotion }, null, 2));
  process.exitCode = d.daily.errors.length ? 1 : d.daily.status === "degraded" ? 2 : 0;
}).catch(e => { console.error(e.stack); process.exitCode = 1; });
