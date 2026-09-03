const fs = require("fs");
const path = require("path");

const ssq = JSON.parse(fs.readFileSync(path.join(__dirname, "data/ssq_history.json"), "utf8"));
const dlt = JSON.parse(fs.readFileSync(path.join(__dirname, "data/dlt_history.json"), "utf8"));

const ssqRows = ssq.draws.map((d) => [...d.redBalls, d.blueBall]);
const dltRows = dlt.draws.map((d) => [...d.frontBalls, ...d.backBalls]);

const ssqJs = `window.SSQ_META = ${JSON.stringify({
  lottery: "ssq",
  name: "双色球",
  source: ssq.metadata.source,
  generatedAt: ssq.metadata.generatedAt,
  total: ssq.metadata.totalCount,
  firstIssue: ssq.metadata.firstIssue,
  latestIssue: ssq.metadata.latestIssue,
  latestDate: ssq.metadata.latestDate,
})};
window.SSQ_DRAWS = ${JSON.stringify(ssqRows)};
`;

const dltJs = `window.DLT_META = ${JSON.stringify({
  lottery: "dlt",
  name: "超级大乐透",
  source: dlt.source,
  generatedAt: dlt.generatedAt,
  total: dlt.totalCount,
  firstIssue: dlt.firstIssue,
  latestIssue: dlt.latestIssue,
  latestDate: dlt.latestDate,
})};
window.DLT_DRAWS = ${JSON.stringify(dltRows)};
`;

fs.writeFileSync(path.join(__dirname, "data/ssq-compact.js"), ssqJs);
fs.writeFileSync(path.join(__dirname, "data/dlt-compact.js"), dltJs);
console.log("ssq", ssqRows.length, "dlt", dltRows.length);
