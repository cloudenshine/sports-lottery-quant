"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseSsq(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const rows = clean.match(/<tr class="t_tr1">[\s\S]*?<\/tr>/g) || [];
  const results = [];
  for (const r of rows) {
    const tds = (r.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(td => td.replace(/<[^>]+>/g, "").trim());
    if (tds.length >= 8 && /^\d{5}$/.test(tds[0])) {
      const issue = tds[0];
      const r1 = Number(tds[1]), r2 = Number(tds[2]), r3 = Number(tds[3]), r4 = Number(tds[4]), r5 = Number(tds[5]), r6 = Number(tds[6]);
      const b = Number(tds[7]);
      const dateMatch = r.match(/\d{4}-\d{2}-\d{2}/);
      const date = dateMatch ? dateMatch[0] : (tds[tds.length - 1] || "");
      if (!isNaN(r1) && !isNaN(b)) {
        results.push({
          issue: issue,
          date: date,
          main: [r1, r2, r3, r4, r5, r6].sort((a, b) => a - b),
          special: [b],
        });
      }
    }
  }
  return results;
}

function parseDlt(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const rows = clean.match(/<tr class="t_tr1">[\s\S]*?<\/tr>/g) || [];
  const results = [];
  for (const r of rows) {
    const tds = (r.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(td => td.replace(/<[^>]+>/g, "").trim());
    if (tds.length >= 8 && /^\d{5}$/.test(tds[0])) {
      const issue = tds[0];
      const r1 = Number(tds[1]), r2 = Number(tds[2]), r3 = Number(tds[3]), r4 = Number(tds[4]), r5 = Number(tds[5]);
      const b1 = Number(tds[6]), b2 = Number(tds[7]);
      const dateMatch = r.match(/\d{4}-\d{2}-\d{2}/);
      const date = dateMatch ? dateMatch[0] : (tds[tds.length - 1] || "");
      if (!isNaN(r1) && !isNaN(b1) && !isNaN(b2)) {
        results.push({
          issue: issue,
          date: date,
          main: [r1, r2, r3, r4, r5].sort((a, b) => a - b),
          special: [b1, b2].sort((a, b) => a - b),
        });
      }
    }
  }
  return results;
}

async function update() {
  console.log("1. Fetching all SSQ history (from 03001 to 2026-09)...");
  const ssqHtml = await fetchUrl("https://datachart.500.com/ssq/history/newinc/history.php?start=03001");
  const ssqDraws = parseSsq(ssqHtml);
  console.log(`Parsed ${ssqDraws.length} SSQ draws. Latest: Issue ${ssqDraws[0].issue} (${ssqDraws[0].date}) -> ${ssqDraws[0].main.join(" ")} + ${ssqDraws[0].special.join(" ")}`);

  console.log("\n2. Fetching all DLT history (from 07001 to 2026-09)...");
  const dltHtml = await fetchUrl("https://datachart.500.com/dlt/history/newinc/history.php?start=07001");
  const dltDraws = parseDlt(dltHtml);
  console.log(`Parsed ${dltDraws.length} DLT draws. Latest: Issue ${dltDraws[0].issue} (${dltDraws[0].date}) -> ${dltDraws[0].main.join(" ")} + ${dltDraws[0].special.join(" ")}`);

  if (ssqDraws.length < 3000 || dltDraws.length < 2500) {
    throw new Error("Draws count unexpectedly low!");
  }

  const dataDir = path.join(__dirname, "data");
  fs.writeFileSync(path.join(dataDir, "ssq_history.json"), JSON.stringify(ssqDraws, null, 2));
  fs.writeFileSync(path.join(dataDir, "dlt_history.json"), JSON.stringify(dltDraws, null, 2));

  const ssqCompact = ssqDraws.map(d => [...d.main, ...d.special]);
  const ssqMeta = {
    lottery: "ssq",
    name: "双色球",
    source: "datachart.500.com",
    generatedAt: new Date().toISOString(),
    total: ssqDraws.length,
    firstIssue: ssqDraws[ssqDraws.length - 1].issue,
    latestIssue: ssqDraws[0].issue,
    latestDate: ssqDraws[0].date,
    latestDraw: ssqDraws[0],
  };
  fs.writeFileSync(
    path.join(dataDir, "ssq-compact.js"),
    `window.SSQ_META = ${JSON.stringify(ssqMeta)};\nwindow.SSQ_DRAWS = ${JSON.stringify(ssqCompact)};\n`
  );

  const dltCompact = dltDraws.map(d => [...d.main, ...d.special]);
  const dltMeta = {
    lottery: "dlt",
    name: "超级大乐透",
    source: "datachart.500.com",
    generatedAt: new Date().toISOString(),
    total: dltDraws.length,
    firstIssue: dltDraws[dltDraws.length - 1].issue,
    latestIssue: dltDraws[0].issue,
    latestDate: dltDraws[0].date,
    latestDraw: dltDraws[0],
  };
  fs.writeFileSync(
    path.join(dataDir, "dlt-compact.js"),
    `window.DLT_META = ${JSON.stringify(dltMeta)};\nwindow.DLT_DRAWS = ${JSON.stringify(dltCompact)};\n`
  );

  console.log("\n✅ All history files and compact bundles updated successfully to 2026-09-02!");
}

update().catch(console.error);
