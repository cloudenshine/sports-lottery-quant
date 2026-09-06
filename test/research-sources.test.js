"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseCsv, parseEspn, parse500, parseMirror, syncResearchSources } = require("../research-sources");
const source = { sourceId: "test", sourceUrl: "https://example.test/scoreboard", fetchedAt: "2026-09-06T00:00:00Z", bodySha256: "a".repeat(64) };
function espn(state = "pre", name = "STATUS_SCHEDULED", score = "0") {
  return JSON.stringify({ leagues: [{ slug: "eng.1" }], events: [{ id: "123", date: "2026-09-07T13:00Z", competitions: [{ date: "2026-09-07T13:00Z", status: { type: { state, name, completed: state === "post" } }, competitors: [{ homeAway: "away", team: { displayName: "Away" }, score: "1" }, { homeAway: "home", team: { displayName: "Home" }, score }] }] }] });
}
test("CSV handles quoted delimiters, UTF BOM and rejects unterminated records", () => {
  assert.deepEqual(parseCsv('\uFEFFid,name\r\n1,"Team, A"\r\n'), [{ id: "1", name: "Team, A" }]);
  assert.throws(() => parseCsv('id,name\n1,"A'), /Unterminated/);
});
test("ESPN aligns home/away using identity and never treats live/abandoned scores as results", () => {
  assert.equal(parseEspn(espn(), source).fixtures[0].homeTeam, "Home");
  assert.equal(parseEspn(espn("in", "STATUS_IN_PROGRESS"), source).records.length, 0);
  assert.equal(parseEspn(espn("post", "STATUS_ABANDONED"), source).records.length, 0);
  const final = parseEspn(espn("post", "STATUS_FULL_TIME", "2"), source).records[0];
  assert.equal(final.homeGoals, 2); assert.equal(final.eventId, "espn:123"); assert.equal(final.odds, null);
  assert.equal(final.source.bodySha256, source.bodySha256);
  assert.throws(() => parseEspn(espn("post", "STATUS_FULL_TIME", "bad"), source), /invalid goals/);
});
test("500 parses only non-handicap prices, Beijing time, and sales limits", () => {
  const html = '<tr data-fixtureid="10" data-homesxname="主队" data-awaysxname="客队" data-matchdate="2026-09-07" data-matchtime="21:00" data-isend="0" data-isactive="1" data-subactive="nspfdg:1,nspfgg:1" data-buyendtime="2026-09-07 20:55:00"><p data-type="spf" data-value="3" data-sp="99"></p><p data-type="nspf" data-value="3" data-sp="2"></p><p data-type="nspf" data-value="1" data-sp="3"></p><p data-type="nspf" data-value="0" data-sp="4"></p></tr>';
  const fixture = parse500(html, source).fixtures[0];
  assert.deepEqual(fixture.odds, { home: 2, draw: 3, away: 4 }); assert.equal(fixture.kickoffAt, "2026-09-07T13:00:00.000Z");
  assert.equal(fixture.singleBetAvailable, true); assert.equal(fixture.salesOpen, true); assert.equal(fixture.oddsObservedAt, source.fetchedAt);
  assert.throws(() => parse500("<html>unavailable</html>", source), /rows missing/);
});
test("historical mirror exact joins opening odds and states unknown prematch observation time", () => {
  const result = 'match_id,season,date,home_team,away_team,fthg,ftag\n1,2025-26,2026-01-01,H,A,2,1\n';
  const prices = 'match_id,date,home_team,away_team,bet365_1x2_home,bet365_1x2_draw,bet365_1x2_away\n1,2026-01-01,H,A,2,3,4\n';
  const record = parseMirror([result, prices], [source, source], 2024).records[0];
  assert.equal(record.oddsObservedAt, null); assert.equal(record.kickoffPrecision, "day"); assert.equal(record.odds.home, 2);
  assert.throws(() => parseMirror([result, prices.replace(",H,A,2", ",WRONG,A,2")], [source, source], 2024), /join conflicts/);
});
test("500 settlement requires score and matching settled 90-minute market, preserving fixture ID", () => {
  const row = '<tr data-fixtureid="10" data-homesxname="H" data-awaysxname="A" data-matchdate="2026-09-05" data-matchtime="21:00"><a class="score" href="/">2:2</a><p class="betbtn betbtn-ok" data-type="nspf" data-value="1" data-sp="3"></p></tr>';
  const completed = parse500(row, source).records[0];
  assert.equal(completed.eventId, "500:10"); assert.equal(completed.homeGoals, 2); assert.equal(completed.awayGoals, 2);
  assert.equal(completed.oddsObservedAt, null); assert.equal(completed.resultBasis, "90-minutes-including-stoppage");
  assert.equal(parse500(row.replace("betbtn betbtn-ok", "betbtn"), source).records.length, 0);
  assert.throws(() => parse500(row.replace('data-value="1"', 'data-value="3"'), source), /conflicts/);
  assert.equal(parse500(row.replace(">2:2</a>", ">延期</a>"), source).records.length, 0);
});
test("daily sync is idempotent, preserves raw-byte hash, and isolates source failure with stale cache", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-sources-")); t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const sources = [{ id: "one", kind: "espn", urls: ["https://example.test/one"], ttlHours: 0 }, { id: "two", kind: "espn", urls: ["https://example.test/two"], ttlHours: 0 }];
  const body = espn(); const fetchImpl = async () => new Response(body);
  const first = await syncResearchSources({ dataDir, sources, fetchImpl, now: "2026-09-06T00:00:00Z" });
  const second = await syncResearchSources({ dataDir, sources, fetchImpl, now: "2026-09-06T00:00:00Z" });
  assert.equal(first.fixtures.length, second.fixtures.length); assert.equal(first.fixtures.length, 1);
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  assert.equal(fs.readFileSync(path.join(dataDir, "raw", digest + ".bin"), "utf8"), body);
  const failed = await syncResearchSources({ dataDir, sources, now: "2026-09-07T00:00:00Z", fetchImpl: async url => url.endsWith("one") ? new Response("blocked", { status: 503 }) : new Response(espn("post", "STATUS_FULL_TIME", "2")) });
  assert.equal(failed.status.status, "degraded"); assert.equal(failed.status.results[0].stale, true);
  assert.equal(failed.records.length, 1); assert.equal(failed.fixtures.length, 0);
  assert.equal(failed.status.results[1].status, "ok");
});
test("cached source failure retains pre-match quote timestamp instead of advancing it", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-stale-")); t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const sources = [{ id: "one", kind: "espn", urls: ["https://example.test/one"], ttlHours: 0 }];
  await syncResearchSources({ dataDir, sources, now: "2026-09-06T00:00:00Z", fetchImpl: async () => new Response(espn()) });
  const failed = await syncResearchSources({ dataDir, sources, now: "2026-09-07T00:00:00Z", fetchImpl: async () => { throw new Error("network unavailable"); } });
  assert.equal(failed.fixtures[0].source.fetchedAt, "2026-09-06T00:00:00.000Z"); assert.equal(failed.fixtures[0].stale, true);
});
test("explicit upstream result retraction removes cached final and keeps a source-backed pending snapshot", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-retraction-")); t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const sources = [{ id: "one", kind: "espn", urls: ["https://example.test/one"], ttlHours: 0 }];
  const first = await syncResearchSources({ dataDir, sources, now: "2026-09-08T00:00:00Z", fetchImpl: async () => new Response(espn("post", "STATUS_FULL_TIME", "2")) });
  assert.equal(first.records.length, 1);
  const retracted = await syncResearchSources({ dataDir, sources, now: "2026-09-09T00:00:00Z", fetchImpl: async () => new Response(espn("pre", "STATUS_POSTPONED")) });
  assert.equal(retracted.records.length, 0); assert.equal(retracted.fixtures.length, 1);
  assert.equal(retracted.fixtures[0].status, "STATUS_POSTPONED"); assert.equal(retracted.fixtures[0].salesOpen, false);
  assert.equal(retracted.fixtures[0].source.fetchedAt, "2026-09-09T00:00:00.000Z");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "cache", "one.json"))).records.length, 0);
  assert.equal(fs.readdirSync(path.join(dataDir, "raw")).length, 2);
});
