"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { watchRules } = require("../research-rule-watch");
function setup(t, sources = [{ id: "official", url: "https://official.example/rules" }]) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-watch-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dataDir, "rules-registry.json"), JSON.stringify({ sources, rules: [{ id: "existing", status: "verified" }] }));
  return dataDir;
}
test("first rule body is archived byte-for-byte and requires review without mutating registry", async t => {
  const dataDir = setup(t), registry = fs.readFileSync(path.join(dataDir, "rules-registry.json"));
  const body = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
  const result = await watchRules({ dataDir, now: "2026-09-06T00:00:00Z", fetchImpl: async () => new Response(body) });
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  assert.equal(result.status, "needs_review"); assert.equal(result.results[0].changeStatus, "initial_archive_needs_review");
  assert.deepEqual(fs.readFileSync(path.join(dataDir, "rules", "raw", sha + ".bin")), body);
  assert.deepEqual(fs.readFileSync(path.join(dataDir, "rules-registry.json")), registry);
});
test("24-hour caching avoids extra GETs but does not clear outstanding review", async t => {
  const dataDir = setup(t); let calls = 0;
  const fetchImpl = async () => { calls++; return new Response("rules"); };
  await watchRules({ dataDir, now: "2026-09-06T00:00:00Z", fetchImpl });
  const cached = await watchRules({ dataDir, now: "2026-09-06T23:59:00Z", fetchImpl });
  assert.equal(calls, 1); assert.equal(cached.results[0].status, "cached"); assert.equal(cached.results[0].reviewRequired, true);
  const next = await watchRules({ dataDir, now: "2026-09-07T00:00:00Z", fetchImpl });
  assert.equal(calls, 2); assert.equal(next.results[0].comparisonStatus, "unchanged"); assert.equal(next.status, "needs_review");
});
test("separate exact-body review acknowledges its baseline, but cannot approve changed bytes", async t => {
  const dataDir = setup(t);
  const first = await watchRules({ dataDir, now: "2026-09-06T00:00:00Z", fetchImpl: async () => new Response("old") });
  const row = first.results[0];
  fs.writeFileSync(path.join(dataDir, "rules/live-review.json"), JSON.stringify({ reviews: [{ sourceId: row.sourceId, url: row.url, status: "reviewed", hashVerified: true, bodySha256: row.lastSuccessfulBodySha256, reviewedAt: "2026-09-06T00:01:00Z" }] }));
  const reviewed = await watchRules({ dataDir, now: "2026-09-06T01:00:00Z", fetchImpl: async () => { throw new Error("Must use cache"); } });
  assert.equal(reviewed.status, "ok");
  assert.equal(reviewed.reviewRequiredCount, 0);
  const changed = await watchRules({ dataDir, now: "2026-09-07T00:00:00Z", fetchImpl: async () => new Response("new") });
  assert.equal(changed.status, "needs_review");
  assert.equal(changed.reviewRequiredCount, 1);
  assert.equal(changed.registryMutated, false);
});
test("changed bytes flag review and do not change verified rules", async t => {
  const dataDir = setup(t);
  await watchRules({ dataDir, now: "2026-09-06T00:00:00Z", fetchImpl: async () => new Response("old") });
  const changed = await watchRules({ dataDir, now: "2026-09-07T00:00:00Z", fetchImpl: async () => new Response("new") });
  assert.equal(changed.results[0].changeStatus, "needs_review"); assert.equal(changed.results[0].comparisonStatus, "body_changed");
  assert.equal(fs.readdirSync(path.join(dataDir, "rules", "raw")).length, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "rules-registry.json"))).rules[0].status, "verified");
});
test("one source failing preserves its last success while other sources keep archiving", async t => {
  const dataDir = setup(t, [{ id: "one", url: "https://official.example/one" }, { id: "two", url: "https://official.example/two" }]);
  const first = await watchRules({ dataDir, now: "2026-09-06T00:00:00Z", fetchImpl: async () => new Response("old") });
  const next = await watchRules({ dataDir, now: "2026-09-07T00:00:00Z", fetchImpl: async url => url.endsWith("one") ? new Response("unavailable", { status: 503 }) : new Response("changed") });
  assert.equal(next.status, "degraded"); assert.equal(next.results[0].status, "failed"); assert.equal(next.results[0].stale, true);
  assert.equal(next.results[0].lastSuccessfulFetchAt, first.results[0].lastSuccessfulFetchAt);
  assert.equal(next.results[0].lastSuccessfulBodySha256, first.results[0].lastSuccessfulBodySha256);
  assert.match(next.results[0].error, /HTTP 503/); assert.equal(next.results[1].comparisonStatus, "body_changed");
});
test("public reads use at most four concurrent requests and force bypasses cache", async t => {
  const dataDir = setup(t, Array.from({ length: 11 }, (_, i) => ({ id: `source-${i}`, url: `https://official.example/${i}` })));
  let active = 0, max = 0, calls = 0;
  const fetchImpl = async (_url, opts) => { assert.equal(opts.method, "GET"); assert.ok(opts.signal); calls++; active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return new Response("rules"); };
  await watchRules({ dataDir, now: "2026-09-06T00:00:00Z", fetchImpl });
  await watchRules({ dataDir, now: "2026-09-06T00:01:00Z", fetchImpl, force: true });
  assert.equal(calls, 22); assert.equal(max, 4);
});
