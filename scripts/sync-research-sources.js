"use strict";
const { syncResearchSources } = require("../research-sources");
if (require.main === module) syncResearchSources({ force: process.argv.includes("--force") }).then(({ status }) => {
  console.log(JSON.stringify(status, null, 2));
  if (status.status === "degraded") process.exitCode = 2;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
