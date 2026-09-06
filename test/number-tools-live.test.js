"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Live = require("../number-tools-live");

function runtime() {
  const root = {
    SSQ_META: { latestIssue: "26101", latestDate: "2026-09-01", total: 10 },
    DLT_META: { latestIssue: "26100", latestDate: "2026-09-02", total: 10 },
    SSQ_DRAWS: [[5, 6, 8, 9, 24, 25, 12]],
    DLT_DRAWS: [[2, 6, 11, 15, 31, 7, 8]]
  };
  root.LotteryEngine = {
    injectNewDraw(gameId, draw) {
      const metaKey = gameId === "ssq" ? "SSQ_META" : "DLT_META";
      const drawKey = gameId === "ssq" ? "SSQ_DRAWS" : "DLT_DRAWS";
      root[drawKey].unshift(draw.main.concat(draw.special));
      root[metaKey] = { ...root[metaKey], latestIssue: draw.issue, latestDate: draw.date, total: root[drawKey].length };
      return { success: true };
    }
  };
  return root;
}

function dashboard() {
  return {
    generatedAt: "2026-09-06T15:34:47.785Z",
    games: {
      ssq: {
        status: "ok", fetchedAt: "2026-09-06T15:34:04.327Z",
        draws: [
          { issue: "26101", date: "2026-09-01", main: [5, 6, 8, 9, 24, 25], special: [12] },
          { issue: "26102", date: "2026-09-03", main: [1, 5, 12, 18, 24, 30], special: [9] },
          { issue: "26103", date: "2026-09-06", main: [6, 11, 16, 23, 27, 31], special: [10], source: { sourceId: "public", sourceUrl: "https://example.test/26103" } }
        ],
        nextIssue: { issue: "26104", drawAt: "2026-09-08T21:15:00+08:00" }
      }
    }
  };
}

test("applies every newer cloud draw oldest-first and exposes provenance", () => {
  const root = runtime();
  const state = Live.applyDashboard(dashboard(), root);
  assert.equal(state.games.ssq.added, 2);
  assert.equal(root.SSQ_META.latestIssue, "26103");
  assert.equal(root.SSQ_META.nextIssue.issue, "26104");
  assert.deepEqual(root.SSQ_DRAWS[0], [6, 11, 16, 23, 27, 31, 10]);
  assert.equal(state.games.ssq.source, "https://example.test/26103");
});

test("reapplying the same snapshot never duplicates a draw", () => {
  const root = runtime();
  Live.applyDashboard(dashboard(), root);
  const before = root.SSQ_DRAWS.length;
  const state = Live.applyDashboard(dashboard(), root);
  assert.equal(state.games.ssq.added, 0);
  assert.equal(root.SSQ_DRAWS.length, before);
});

test("an older refresh cannot downgrade the latest source time or next issue", () => {
  const root = runtime();
  Live.applyDashboard(dashboard(), root);
  const older = dashboard();
  older.generatedAt = "2026-09-06T12:43:01.070Z";
  older.games.ssq.fetchedAt = older.generatedAt;
  older.games.ssq.nextIssue = { issue: "26103", drawAt: "2026-09-06T21:15:00+08:00" };
  older.games.ssq.draws = older.games.ssq.draws.slice(0, 2);
  const state = Live.applyDashboard(older, root);
  assert.equal(root.SSQ_META.nextIssue.issue, "26104");
  assert.equal(root.SSQ_META.fetchedAt, "2026-09-06T15:34:04.327Z");
  assert.equal(state.games.ssq.retainedNewerSnapshot, true);
});

test("fetchLatest bypasses caches and applies the response", async () => {
  const root = runtime();
  let request;
  const state = await Live.fetchLatest({
    target: root,
    url: "data/numbers/public-snapshot.json",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => dashboard() };
    }
  });
  assert.match(request.url, /\?t=\d+$/);
  assert.equal(request.options.cache, "no-store");
  assert.equal(state.games.ssq.latestIssue, "26103");
});

test("freshness label reports live, stale and expired source age", () => {
  const fetchedAt = "2026-09-06T15:30:00Z";
  assert.equal(Live.freshnessLabel({ fetchedAt }, Date.parse("2026-09-06T15:40:00Z")).level, "live");
  assert.equal(Live.freshnessLabel({ fetchedAt }, Date.parse("2026-09-06T17:30:00Z")).level, "stale");
  assert.equal(Live.freshnessLabel({ fetchedAt }, Date.parse("2026-09-07T00:00:00Z")).level, "error");
});
