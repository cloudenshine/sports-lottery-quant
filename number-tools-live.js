"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NumberToolsLive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const GAMES = ["ssq", "dlt"];

  function issueNumber(value) {
    const parsed = Number.parseInt(String(value || "").replace(/\D/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  }

  function normalizeDraw(draw, gameId) {
    const mainCount = gameId === "ssq" ? 6 : 5;
    const specialCount = gameId === "ssq" ? 1 : 2;
    if (!draw || !Array.isArray(draw.main) || !Array.isArray(draw.special)) return null;
    if (draw.main.length !== mainCount || draw.special.length !== specialCount) return null;
    return {
      issue: String(draw.issue || ""),
      date: String(draw.date || ""),
      main: draw.main.map(Number),
      special: draw.special.map(Number),
      source: draw.source || null
    };
  }

  function sourceTime(dashboard, game) {
    return game && game.fetchedAt || dashboard && dashboard.sourceGeneratedAt || dashboard && dashboard.generatedAt || null;
  }

  function timestamp(value) {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : -Infinity;
  }

  function applyDashboard(dashboard, target) {
    const runtime = target || (typeof globalThis !== "undefined" ? globalThis : {});
    if (!dashboard || !dashboard.games || !runtime.LotteryEngine) throw new Error("开奖源数据或引擎不可用");
    const result = { generatedAt: dashboard.generatedAt || null, games: {} };

    for (const gameId of GAMES) {
      const game = dashboard.games[gameId];
      if (!game) continue;
      const metaKey = gameId === "ssq" ? "SSQ_META" : "DLT_META";
      const drawKey = gameId === "ssq" ? "SSQ_DRAWS" : "DLT_DRAWS";
      const currentMeta = runtime[metaKey] || {};
      const incomingFetchedAt = sourceTime(dashboard, game);
      const incomingIsNewer = timestamp(incomingFetchedAt) >= timestamp(currentMeta.fetchedAt || currentMeta.generatedAt);
      const previousIssue = issueNumber(currentMeta.latestIssue);
      const candidates = (game.draws || [])
        .map(draw => normalizeDraw(draw, gameId))
        .filter(Boolean)
        .filter(draw => issueNumber(draw.issue) > previousIssue)
        .sort((a, b) => issueNumber(a.issue) - issueNumber(b.issue));
      let added = 0;
      for (const draw of candidates) {
        const injected = runtime.LotteryEngine.injectNewDraw(gameId, draw);
        if (injected && injected.success) added += 1;
      }
      const newest = (game.draws || [])
        .map(draw => normalizeDraw(draw, gameId))
        .filter(Boolean)
        .sort((a, b) => issueNumber(b.issue) - issueNumber(a.issue))[0] || null;
      const incomingNextIssue = game.nextIssue && game.nextIssue.issue ? game.nextIssue : null;
      const nextIssue = incomingIsNewer ? incomingNextIssue : currentMeta.nextIssue || incomingNextIssue;
      const fetchedAt = incomingIsNewer ? incomingFetchedAt : currentMeta.fetchedAt || currentMeta.generatedAt || incomingFetchedAt;
      const effectiveNewest = incomingIsNewer ? newest : currentMeta.latestDraw || newest;
      runtime[metaKey] = Object.assign({}, runtime[metaKey] || currentMeta, {
        source: effectiveNewest && effectiveNewest.source && (effectiveNewest.source.sourceUrl || effectiveNewest.source.sourceId) || currentMeta.source || "云端公开开奖源",
        sourceId: effectiveNewest && effectiveNewest.source && effectiveNewest.source.sourceId || currentMeta.sourceId || null,
        fetchedAt,
        generatedAt: incomingIsNewer ? dashboard.generatedAt || fetchedAt : currentMeta.generatedAt || fetchedAt,
        latestDraw: effectiveNewest,
        nextIssue
      });
      result.games[gameId] = {
        status: game.status || game.sourceStatus && game.sourceStatus.status || dashboard.status && dashboard.status.status || "unknown",
        added,
        total: (runtime[drawKey] || []).length,
        latestIssue: runtime[metaKey].latestIssue || newest && newest.issue || null,
        latestDate: runtime[metaKey].latestDate || newest && newest.date || null,
        nextIssue,
        fetchedAt,
        source: runtime[metaKey].source,
        retainedNewerSnapshot: !incomingIsNewer
      };
    }
    return result;
  }

  async function fetchLatest(options) {
    const settings = options || {};
    const fetchImpl = settings.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error("当前浏览器不支持在线刷新");
    const separator = (settings.url || "data/numbers/public-snapshot.json").includes("?") ? "&" : "?";
    const url = `${settings.url || "data/numbers/public-snapshot.json"}${separator}t=${Date.now()}`;
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response || !response.ok) throw new Error(`开奖源请求失败 (${response && response.status || "network"})`);
    const dashboard = await response.json();
    return applyDashboard(dashboard, settings.target);
  }

  function freshnessLabel(gameState, now) {
    if (!gameState || !gameState.fetchedAt) return { level: "error", text: "开奖源没有同步时间" };
    const at = Date.parse(gameState.fetchedAt);
    if (!Number.isFinite(at)) return { level: "error", text: "开奖源时间无效" };
    const ageMinutes = Math.max(0, Math.floor(((now || Date.now()) - at) / 60000));
    const time = new Date(at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    if (ageMinutes <= 20) return { level: "live", text: `云端开奖源已同步 ${time}（${ageMinutes} 分钟前）` };
    if (ageMinutes <= 360) return { level: "stale", text: `云端开奖源最近同步 ${time}（${ageMinutes} 分钟前）` };
    return { level: "error", text: `开奖源快照已过期：${time}` };
  }

  function start(options) {
    const settings = options || {};
    const runtime = settings.target || (typeof globalThis !== "undefined" ? globalThis : {});
    let state = null;
    try {
      state = applyDashboard(runtime.NUMBER_DASHBOARD, runtime);
      if (settings.onUpdate) settings.onUpdate(state, null);
    } catch (error) {
      if (settings.onUpdate) settings.onUpdate(null, error);
    }
    const refresh = async () => {
      try {
        state = await fetchLatest(Object.assign({}, settings, { target: runtime }));
        if (settings.onUpdate) settings.onUpdate(state, null);
        return state;
      } catch (error) {
        if (settings.onUpdate) settings.onUpdate(state, error);
        return state;
      }
    };
    const intervalMs = Math.max(60000, Number(settings.intervalMs) || 300000);
    const timer = settings.setIntervalImpl === null ? null : (settings.setIntervalImpl || setInterval)(refresh, intervalMs);
    return { refresh, stop: () => timer !== null && (settings.clearIntervalImpl || clearInterval)(timer), getState: () => state };
  }

  return { applyDashboard, fetchLatest, freshnessLabel, issueNumber, normalizeDraw, start, timestamp };
});
