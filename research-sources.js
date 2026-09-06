"use strict";

// Public, read-only research feeds. Every observation retains its original bytes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const ISO = value => { const d = new Date(value); if (!Number.isFinite(+d)) throw new Error(`Invalid timestamp: ${value}`); return d.toISOString(); };
const goals = value => value !== "" && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
function odds3(home, draw, away) {
  const o = { home: Number(home), draw: Number(draw), away: Number(away) };
  return Object.values(o).every(n => Number.isFinite(n) && n > 1) ? o : null;
}
function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ""; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  row.push(field); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift(); if (!headers || new Set(headers).size !== headers.length) throw new Error("Invalid CSV header");
  return rows.map((values, index) => { if (values.length !== headers.length) throw new Error(`CSV column mismatch on row ${index + 2}`); return Object.fromEntries(headers.map((h, i) => [h, values[i]])); });
}
function parseEspn(text, source) {
  const json = JSON.parse(text); if (!Array.isArray(json.events)) throw new Error("ESPN events array missing");
  const records = [], fixtures = [];
  for (const e of json.events) {
    const c = e.competitions?.[0], home = c?.competitors?.find(x => x.homeAway === "home"), away = c?.competitors?.find(x => x.homeAway === "away");
    if (!e.id || !home?.team?.displayName || !away?.team?.displayName) throw new Error("ESPN event identity missing");
    const status = c.status?.type || e.status?.type;
    const item = { eventId: `espn:${e.id}`, sourceEventId: String(e.id), kickoffAt: ISO(c.date || e.date), kickoffPrecision: "minute", homeTeam: home.team.displayName, awayTeam: away.team.displayName, competition: json.leagues?.[0]?.slug || "eng.1", season: e.season?.year ?? null, odds: null, oddsObservedAt: null, source, sourceId: source.sourceId, sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt, bodySha256: source.bodySha256, observedAt: source.fetchedAt, status: status?.name || "unknown" };
    // EPL full-time only. Do not misclassify abandoned, postponed, shootout or live scores.
    if (status?.completed && status.name === "STATUS_FULL_TIME") {
      item.homeGoals = goals(home.score); item.awayGoals = goals(away.score);
      if (item.homeGoals == null || item.awayGoals == null) throw new Error("Completed ESPN match has invalid goals");
      records.push(item);
    } else {
      item.salesOpen = status?.state === "pre" && status.name === "STATUS_SCHEDULED";
      fixtures.push(item);
    }
  }
  return { records, fixtures };
}
function attributes(tag) { return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1], m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"')])); }
function parse500(text, source) {
  const fixtures = [], records = [];
  for (const match of text.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const a = attributes(match[1]); if (!a["data-fixtureid"]) continue;
    if (!a["data-matchdate"] || !a["data-matchtime"] || !a["data-homesxname"] || !a["data-awaysxname"]) throw new Error("500 fixture identity/time missing");
    const values = {};
    for (const p of match[2].matchAll(/<p\b([^>]*)>/gi)) { const b = attributes(p[1]); if (b["data-type"] === "nspf") values[b["data-value"]] = b["data-sp"]; }
    const odds = odds3(values["3"], values["1"], values["0"]);
    const kickoffAt = ISO(`${a["data-matchdate"]}T${a["data-matchtime"]}:00+08:00`);
    const item = { eventId: `500:${a["data-fixtureid"]}`, sourceEventId: a["data-fixtureid"], kickoffAt, kickoffPrecision: "minute", homeTeam: a["data-homesxname"], awayTeam: a["data-awaysxname"], competition: a["data-simpleleague"], processDate: a["data-processdate"] || null, odds, oddsObservedAt: odds ? source.fetchedAt : null, oddsKind: "china-jingcai-1x2-secondary-publisher", singleBetAvailable: /(?:^|,)nspfdg:1(?:,|$)/.test(a["data-subactive"] || ""), salesOpen: a["data-isend"] === "0" && a["data-isactive"] === "1", stopSellingAt: a["data-buyendtime"] ? ISO(a["data-buyendtime"].replace(" ", "T") + "+08:00") : null, source, ...source, observedAt: source.fetchedAt };
    const score = match[2].match(/<a\b[^>]*class=["']score["'][^>]*>\s*(\d+)\s*:\s*(\d+)\s*<\/a>/);
    const winners = [...match[2].matchAll(/<p\b([^>]*)>/gi)].map(p => attributes(p[1])).filter(b => b["data-type"] === "nspf" && /(?:^|\s)betbtn-ok(?:\s|$)/.test(b.class || ""));
    // A displayed score alone can be live. Require the publisher's settled 1X2 marker too.
    if (score && winners.length === 1) {
      item.homeGoals = Number(score[1]); item.awayGoals = Number(score[2]);
      const expected = item.homeGoals > item.awayGoals ? "3" : item.homeGoals === item.awayGoals ? "1" : "0";
      if (winners[0]["data-value"] !== expected) throw new Error("500 result conflicts with settled outcome");
      item.status = "settled-secondary-publisher"; item.resultBasis = "90-minutes-including-stoppage";
      item.oddsObservedAt = null; item.oddsKind = "retrospective-china-jingcai-1x2";
      records.push(item);
    } else {
      const scoreText = match[2].match(/<i\b[^>]*class=["'][^"']*team-vs[^"']*["'][^>]*>([\s\S]*?)<\/i>/)?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
      item.status = /取消/.test(scoreText) ? "cancelled-unverified-settlement" : /延期|推迟/.test(scoreText) ? "postponed" : score ? "result-awaiting-1x2-settlement" : item.salesOpen ? "scheduled" : "sales-closed-awaiting-result";
      fixtures.push(item);
    }
  }
  if (!fixtures.length && !records.length) throw new Error("500 fixture rows missing; no replacement with demo data");
  return { records, fixtures };
}
function parseMirror(texts, sources, minSeason) {
  const results = parseCsv(texts[0]), prices = new Map(parseCsv(texts[1]).map(x => [x.match_id, x]));
  if (!results.length || !("fthg" in results[0])) throw new Error("Mirror results schema missing");
  const records = [];
  for (const r of results) {
    if (Number(r.season?.slice(0, 4)) < minSeason) continue;
    if (!r.match_id || !r.home_team || !r.away_team) throw new Error("Mirror identity missing");
    const p = prices.get(r.match_id);
    if (p && (p.home_team !== r.home_team || p.away_team !== r.away_team || p.date !== r.date)) throw new Error("Mirror exact match_id join conflicts");
    const homeGoals = goals(r.fthg), awayGoals = goals(r.ftag); if (homeGoals == null || awayGoals == null) continue;
    // Opening Bet365, never best-of-bookmaker or closing odds. Exact collection time absent.
    const odds = p ? odds3(p.bet365_1x2_home, p.bet365_1x2_draw, p.bet365_1x2_away) : null;
    records.push({ eventId: `fd-mirror:${r.match_id}`, sourceEventId: r.match_id, kickoffAt: ISO(`${r.date}T00:00:00Z`), kickoffPrecision: "day", homeTeam: r.home_team, awayTeam: r.away_team, competition: "E0", season: r.season, homeGoals, awayGoals, odds, oddsObservedAt: null, oddsKind: "retrospective-bet365-opening-unverified-time", source: sources[0], ...sources[0], oddsSource: sources[1], observedAt: sources[0].fetchedAt, provenance: "secondary-mirror-football-data.co.uk", attributionUrl: "https://github.com/AnishKhetani/premier-league-data/blob/main/README.md" });
  }
  if (!records.length) throw new Error("Mirror has no completed matches in requested seasons");
  return { records, fixtures: [] };
}
function defaultSources(now = new Date()) {
  const d = new Date(now), y = d.getUTCFullYear(), season = d.getUTCMonth() >= 6 ? y : y - 1;
  const compact = d => d.toISOString().slice(0, 10).replaceAll("-", "");
  const espn = dates => `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${dates}&limit=1000`;
  const mirror = "https://raw.githubusercontent.com/AnishKhetani/premier-league-data/main/data/processed/";
  return [
    ...[season - 2, season - 1].map(start => ({ id: `espn-eng1-${start}`, urls: [espn(`${start}0801-${start + 1}0630`)], kind: "espn", ttlHours: 168 })),
    { id: "espn-eng1-current", urls: [espn(`${compact(new Date(+d - 35 * 86400000))}-${compact(new Date(+d + 21 * 86400000))}`)], kind: "espn", ttlHours: 0 },
    { id: "500-jingcai", urls: ["https://trade.500.com/jczq/"], kind: "500", ttlHours: 0 },
    ...[1, 2, 3, 4, 5, 6, 7].map(days => ({ id: `500-jingcai-results-${days}`, urls: ["https://trade.500.com/jczq/?date=" + new Date(+d + 8 * 3600000 - days * 86400000).toISOString().slice(0, 10)], kind: "500", ttlHours: 0 })),
    { id: "football-data-mirror", urls: [mirror + "results.csv", mirror + "results_with_odds.csv"], kind: "mirror", minSeason: season - 2, ttlHours: 168 },
    { id: "football-data-primary", urls: [`https://www.football-data.co.uk/mmz4281/${String(season - 1).slice(-2)}${String(season).slice(-2)}/E0.csv`], kind: "availability", ttlHours: 24 }
  ];
}
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }
function atomicJson(file, value) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n"); fs.renameSync(tmp, file); }
async function syncResearchSources(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, "data", "research");
  const now = ISO(options.now || new Date()), fetchImpl = options.fetchImpl || globalThis.fetch;
  const definitions = options.sources || defaultSources(now);
  fs.mkdirSync(path.join(dataDir, "raw"), { recursive: true }); fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });
  const results = [], allRecords = [], allFixtures = [];
  for (const definition of definitions) {
    if (!/^[\w-]+$/.test(definition.id)) throw new Error("Unsafe source id");
    const cacheFile = path.join(dataDir, "cache", `${definition.id}.json`), cached = readJson(cacheFile, null);
    let state = cached, stale = false, sourceStatus = "ok", error = null, refs = [];
    try {
      const ageHours = cached ? (+new Date(now) - +new Date(cached.fetchedAt)) / 3600000 : Infinity;
      if (!options.force && cached && ageHours >= 0 && ageHours < definition.ttlHours) { sourceStatus = "cached"; refs = cached.sources; }
      else {
        const texts = [];
        for (const url of definition.urls) {
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(options.timeoutMs || 25000), headers: { "User-Agent": "LotteryResearchWorkbench/1.0 (public research; no betting)" } });
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 20000000) throw new Error("Response exceeds 20MB source limit");
          const bodySha256 = hash(bytes), fetchedAt = options.now ? now : new Date().toISOString();
          const ref = { sourceId: definition.id, sourceUrl: url, fetchedAt, bodySha256 };
          fs.writeFileSync(path.join(dataDir, "raw", bodySha256 + ".bin"), bytes); refs.push(ref);
          if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
          texts.push(new TextDecoder(definition.kind === "500" ? "gb18030" : "utf-8").decode(bytes));
        }
        let parsed;
        if (definition.kind === "espn") parsed = parseEspn(texts[0], refs[0]);
        else if (definition.kind === "500") parsed = parse500(texts[0], refs[0]);
        else if (definition.kind === "mirror") parsed = parseMirror(texts, refs, definition.minSeason);
        else if (definition.kind === "availability") { if (!texts[0].startsWith("Div,")) throw new Error("Primary CSV header invalid"); parsed = { records: [], fixtures: [] }; }
        else throw new Error(`Unsupported source kind ${definition.kind}`);
        // Incremental merge retains past results, while fresh fixture lists replace the old view.
        const merged = new Map((cached?.records || []).map(r => [r.eventId, r]));
        // An explicit upstream retraction supersedes the earlier final result.
        for (const fixture of parsed.fixtures) merged.delete(fixture.eventId);
        for (const r of parsed.records) merged.set(r.eventId, r);
        state = { fetchedAt: refs.at(-1).fetchedAt, sources: refs, records: [...merged.values()], fixtures: parsed.fixtures };
        atomicJson(cacheFile, state);
      }
    } catch (e) { sourceStatus = "failed"; stale = !!cached; error = e.message; }
    const records = (state?.records || []).map(r => ({ ...r, stale }));
    const fixtures = (state?.fixtures || []).map(r => ({ ...r, stale }));
    allRecords.push(...records); allFixtures.push(...fixtures);
    results.push({ sourceId: definition.id, status: sourceStatus, stale, error, fetchedAt: state?.fetchedAt || null, records: records.length, fixtures: fixtures.length, sources: refs });
  }
  const unique = rows => {
    const map = new Map();
    for (const r of rows) {
      const prior = map.get(r.eventId);
      if (!prior || (prior.stale && !r.stale) || (prior.stale === r.stale && r.fetchedAt >= prior.fetchedAt)) map.set(r.eventId, r);
    }
    return [...map.values()].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.eventId.localeCompare(b.eventId));
  };
  // A newer pending/cancelled/live snapshot also retracts finals from another date window.
  const current = unique([...allRecords.map(r => ({ ...r, _snapshotKind: "final" })), ...allFixtures.map(r => ({ ...r, _snapshotKind: "pending" }))]);
  const withoutKind = ({ _snapshotKind, ...row }) => row;
  const records = current.filter(r => r._snapshotKind === "final").map(withoutKind);
  const fixtures = current.filter(r => r._snapshotKind === "pending").map(withoutKind);
  const status = { schemaVersion: 1, runAt: now, status: results.some(s => s.status === "failed") ? "degraded" : "ok", records: records.length, fixtures: fixtures.length, results, limitations: ["Historical odds are retrospective research observations; no fabricated prematch collection timestamp.", "ESPN results and the football-data mirror are separate cohorts; never pool duplicate events.", "500 quotes are a secondary publisher of Chinese Jingcai; basketball and official settlement confirmation remain separate pending sources."] };
  atomicJson(path.join(dataDir, "football-history.json"), { records });
  atomicJson(path.join(dataDir, "football-fixtures.json"), { fixtures });
  atomicJson(path.join(dataDir, "research-sources-status.json"), status);
  return { records, fixtures, status };
}
module.exports = { parseCsv, parseEspn, parse500, parseMirror, defaultSources, syncResearchSources };
