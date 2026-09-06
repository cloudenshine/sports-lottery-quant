"use strict";

// Detect publisher-byte changes; this module never grants or edits rule verification.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const DAY_MS = 24 * 60 * 60 * 1000;
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(temporary, file);
}
async function watchRules(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, "data", "research");
  const instant = new Date(options.now || new Date());
  if (!Number.isFinite(+instant)) throw new Error("Invalid rule-watch timestamp");
  const generatedAt = instant.toISOString();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const registry = readJson(path.join(dataDir, "rules-registry.json"), null);
  if (!registry || !Array.isArray(registry.sources) || !registry.sources.length) throw new Error("Rule registry sources missing");
  const ids = new Set();
  for (const source of registry.sources) {
    if (!source.id || !/^[\w-]+$/.test(source.id) || ids.has(source.id)) throw new Error("Invalid or duplicate rule source id");
    if (new URL(source.url).protocol !== "https:") throw new Error("Rule source must use HTTPS");
    ids.add(source.id);
  }
  const baseDir = path.join(dataDir, "rules");
  for (const folder of ["raw", "metadata", "observations"]) fs.mkdirSync(path.join(baseDir, folder), { recursive: true });
  const results = new Array(registry.sources.length);
  let cursor = 0;
  async function inspect(source) {
    const file = path.join(baseDir, "metadata", source.id + ".json");
    const previous = readJson(file, null);
    const age = previous ? +instant - +new Date(previous.lastAttemptAt) : Infinity;
    if (!options.force && previous?.url === source.url && age >= 0 && age < DAY_MS) {
      return { ...previous, status: previous.status === "failed" ? "failed" : "cached", cached: true };
    }
    const attemptedAt = options.now ? generatedAt : new Date().toISOString();
    const sameSource = previous?.url === source.url;
    let result = {
      sourceId: source.id, url: source.url, publisher: source.publisher || null,
      status: "failed", cached: false, lastAttemptAt: attemptedAt,
      lastSuccessfulFetchAt: sameSource ? previous.lastSuccessfulFetchAt : null,
      lastSuccessfulBodySha256: sameSource ? previous.lastSuccessfulBodySha256 : null,
      initialBodySha256: sameSource ? previous.initialBodySha256 : null,
      previousBodySha256: sameSource ? previous.previousBodySha256 : null,
      changeStatus: sameSource ? previous.changeStatus : "not_archived",
      reviewRequired: sameSource ? !!previous.reviewRequired : false,
      error: null
    };
    try {
      const response = await fetchImpl(source.url, { method: "GET", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "LotteryResearchWorkbench/1.0 (public rule-change monitoring)" } });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 20000000) throw new Error("Rule response exceeds 20MB limit");
      const bodySha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      fs.writeFileSync(path.join(baseDir, "raw", bodySha256 + ".bin"), bytes);
      result = { ...result, observedBodySha256: bodySha256, httpStatus: response.status, finalUrl: response.url || source.url, contentType: response.headers?.get("content-type") || null, bodyBytes: bytes.length };
      if (!response.ok) throw new Error(`HTTP ${response.status} ${source.url}`);
      if (!bytes.length) throw new Error("Empty rule response body");
      const priorHash = result.lastSuccessfulBodySha256;
      const changed = !!priorHash && priorHash !== bodySha256;
      result = {
        ...result, status: "ok", error: null,
        lastSuccessfulFetchAt: attemptedAt, lastSuccessfulBodySha256: bodySha256,
        initialBodySha256: result.initialBodySha256 || bodySha256,
        previousBodySha256: priorHash,
        comparisonStatus: !priorHash ? "initial_archive" : changed ? "body_changed" : "unchanged",
        changeStatus: !priorHash ? "initial_archive_needs_review" : changed ? "needs_review" : result.changeStatus,
        reviewRequired: !priorHash || changed || result.reviewRequired,
        // Byte identity is intentionally conservative: navigation/scripts can cause false alarms.
        changeCaveat: "Raw-byte differences may be navigation, timestamps or scripts; human review is required before changing registered rules."
      };
    } catch (error) {
      result.error = error.message;
      result.stale = !!result.lastSuccessfulFetchAt;
    }
    writeJson(file, result);
    const observationDir = path.join(baseDir, "observations", source.id);
    fs.mkdirSync(observationDir, { recursive: true });
    // Preserve every attempt, including failures; raw body storage is content-addressed.
    const receiptId = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
    writeJson(path.join(observationDir, receiptId + ".json"), result);
    return result;
  }
  async function worker() {
    while (cursor < registry.sources.length) {
      const index = cursor++;
      results[index] = await inspect(registry.sources[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, registry.sources.length) }, worker));
  // A fetched page is not automatically a verified rule. A separate review
  // receipt can acknowledge only its exact URL and raw bytes; any new body
  // still requires review, and pending rule contracts remain pending.
  const reviews = readJson(path.join(baseDir, "live-review.json"), { reviews: [] }).reviews || [];
  for (const result of results) {
    const review = reviews.find(r => r.sourceId === result.sourceId && r.url === result.url && r.status === "reviewed" && r.hashVerified === true && r.bodySha256 === result.lastSuccessfulBodySha256 && Number.isFinite(Date.parse(r.reviewedAt)) && Date.parse(r.reviewedAt) <= +instant);
    if (review) {
      result.reviewRequired = false;
      result.changeStatus = "reviewed_exact_body";
      result.reviewedAt = review.reviewedAt;
      result.reviewScope = "Exact archived source bytes only; pending contracts are not promoted";
    }
  }
  const summary = {
    schemaVersion: 1, generatedAt,
    status: results.some(result => result.status === "failed") ? "degraded" : results.some(result => result.reviewRequired) ? "needs_review" : "ok",
    sourceCount: results.length, failedCount: results.filter(result => result.status === "failed").length,
    reviewRequiredCount: results.filter(result => result.reviewRequired).length,
    registryMutated: false, intervalHours: 24, results
  };
  writeJson(path.join(dataDir, "rule-watch-status.json"), summary);
  return summary;
}

module.exports = { watchRules };
if (require.main === module) watchRules({ force: process.argv.includes("--force") }).then(summary => {
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "degraded") process.exitCode = 2;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
