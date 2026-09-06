(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NumberSettlement = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "1.0.0";
  const GAMES = { ssq: { mainMax: 33, mainCount: 6, specialMax: 16, specialCount: 1 }, dlt: { mainMax: 35, mainCount: 5, specialMax: 12, specialCount: 2 } };
  const DLT9 = { "5+2": 1, "5+1": 2, "5+0": 3, "4+2": 4, "4+1": 5, "3+2": 6, "4+0": 7, "3+1": 8, "2+2": 8, "3+0": 9, "2+1": 9, "1+2": 9, "0+2": 9 };
  const DLT7 = { "5+2": 1, "5+1": 2, "5+0": 3, "4+2": 3, "4+1": 4, "4+0": 5, "3+2": 5, "3+1": 6, "2+2": 6, "3+0": 7, "2+1": 7, "1+2": 7, "0+2": 7 };
  function game(id) { if (!Object.hasOwn(GAMES, id)) throw new RangeError("Unknown gameId"); return GAMES[id]; }
  function normalizeIssue(issue) {
    const s = String(issue);
    if (!/^(?:20\d{5}|\d{5})$/.test(s)) throw new RangeError("Issue must contain YYNNN or YYYYNNN");
    const full = s.length === 5 ? "20" + s : s;
    if (Number(full.slice(4)) < 1 || Number(full.slice(4)) > 366) throw new RangeError("Invalid draw sequence");
    return full;
  }
  function ruleForIssue(gameId, issue) {
    game(gameId);
    const full = normalizeIssue(issue), n = Number(full);
    if (gameId === "dlt") {
      if (n < 2019019) return { supported: false, id: "dlt-pre-19019-unverified", issue: full, reason: "Pre-19019 prize mapping and additional contract are not implemented" };
      return { supported: true, id: n >= 2026014 ? "dlt-2026-seven" : "dlt-2019-nine", issue: full, levels: n >= 2026014 ? 7 : 9, floatingLevels: [1, 2] };
    }
    if (n < 2003001) return { supported: false, id: "ssq-pre-launch", issue: full, reason: "Issue predates SSQ" };
    return { supported: true, id: n >= 2026014 ? "ssq-2026-six-fortune" : "ssq-six-published-table", issue: full, levels: 6, fortunePossible: n >= 2026014, floatingLevels: [1, 2] };
  }
  function numbers(values, count, max, label) {
    if (!Array.isArray(values) || values.length !== count || new Set(values).size !== count || values.some(v => !Number.isInteger(v) || v < 1 || v > max)) throw new RangeError("Invalid " + label);
  }
  function validateNumbers(gameId, entry, label) {
    const g = game(gameId);
    if (!entry || typeof entry !== "object") throw new TypeError(label + " required");
    numbers(entry.main, g.mainCount, g.mainMax, label + ".main");
    numbers(entry.special, g.specialCount, g.specialMax, label + ".special");
  }
  function validateDraw(gameId, draw) {
    validateNumbers(gameId, draw, "draw");
    normalizeIssue(draw.issue);
    if (draw.gameId !== undefined && draw.gameId !== gameId) throw new RangeError("Draw game does not match");
    if (draw.specialPrizeActive !== undefined && draw.specialPrizeActive !== null && typeof draw.specialPrizeActive !== "boolean") throw new TypeError("specialPrizeActive must be boolean or null");
    if (draw.status !== undefined && !["drawn", "published", "final", "completed", "official"].includes(draw.status)) throw new RangeError("Draw must have a final result");
    for (const family of ["payouts", "winners"]) for (const kind of ["base", "additional"]) {
      const entries = draw[family]?.[kind];
      if (entries !== undefined && (entries === null || typeof entries !== "object" || Array.isArray(entries))) throw new TypeError("Invalid " + family);
      for (const [key, value] of Object.entries(entries || {})) {
        if (!/^(?:[1-9]|fortune)$/.test(key)) throw new RangeError("Unknown prize key " + key);
        if (value !== null && (!Number.isFinite(value) || value < 0 || (family === "winners" && !Number.isSafeInteger(value)))) throw new RangeError("Invalid " + family + " value");
      }
    }
    return draw;
  }
  function prizeLevel({ gameId, issue, mainHits, specialHits, specialPrizeActive = null }) {
    const g = game(gameId), rule = ruleForIssue(gameId, issue);
    if (specialPrizeActive !== null && typeof specialPrizeActive !== "boolean") throw new TypeError("specialPrizeActive must be boolean or null");
    if (!Number.isInteger(mainHits) || mainHits < 0 || mainHits > g.mainCount || !Number.isInteger(specialHits) || specialHits < 0 || specialHits > g.specialCount) throw new RangeError("Invalid hit counts");
    if (!rule.supported) return null;
    if (gameId === "dlt") return (rule.levels === 7 ? DLT7 : DLT9)[mainHits + "+" + specialHits] || 0;
    if (mainHits === 6) return specialHits ? 1 : 2;
    if (mainHits === 5) return specialHits ? 3 : 4;
    if (mainHits === 4) return specialHits ? 4 : 5;
    if (mainHits === 3 && specialHits) return 5;
    if (specialHits) return 6;
    if (mainHits === 3 && rule.fortunePossible) return specialPrizeActive === null ? null : specialPrizeActive ? "fortune" : 0;
    return 0;
  }
  function publishedAmount(draw, kind, level) {
    const amount = draw.payouts?.[kind]?.[level];
    if (amount === null || amount === undefined) return null;
    // A zero-winner placeholder is not the prize of an imaginary winner.
    if ((level === 1 || level === 2) && (amount === 0 || draw.winners?.[kind]?.[level] === 0)) return null;
    return amount;
  }
  function context(gameId, draw) {
    const promotion = draw.promotion || draw.promotions || null;
    return { taxTreatment: "before_tax", payoutBasis: "published_prize_table_replay", counterfactualRecomputed: false,
      promotions: promotion, promotionTreatment: "excluded_unless_in_published_base_table",
      payoutScope: draw.payoutScope || "published_base_prizes_excluding_unverified_promotion",
      promotionDisclosure: promotion ? "Standard base/additional prizes only; separately listed promotional prizes are excluded because ticket-level eligibility has not been verified" : "Separate promotional awards are not included",
      riskControl: draw.riskControl || null, riskControlTreatment: "published_amounts_only_not_recomputed", gameId, issue: normalizeIssue(draw.issue) };
  }
  function evaluateTicket({ gameId, ticket, draw, additional = false }) {
    validateDraw(gameId, draw); validateNumbers(gameId, ticket, "ticket");
    if (typeof additional !== "boolean" || (additional && gameId !== "dlt")) throw new RangeError("Additional betting is only available for DLT");
    if (ticket.issue !== undefined && normalizeIssue(ticket.issue) !== normalizeIssue(draw.issue)) throw new RangeError("Ticket issue does not match draw");
    const rule = ruleForIssue(gameId, draw.issue), mainHits = ticket.main.filter(x => draw.main.includes(x)).length, specialHits = ticket.special.filter(x => draw.special.includes(x)).length;
    const result = { ...context(gameId, draw), ruleId: rule.id, mainHits, specialHits, costYuan: additional ? 3 : 2, level: null, basePayoutYuan: null, additionalPayoutYuan: additional ? null : 0, grossYuan: null, netYuan: null, status: "pending_payout", reason: null };
    if (!rule.supported) return { ...result, status: "unsupported_rules", reason: rule.reason };
    const level = prizeLevel({ gameId, issue: draw.issue, mainHits, specialHits, specialPrizeActive: draw.specialPrizeActive ?? null });
    result.level = level;
    if (level === null) return { ...result, reason: "SSQ fortune-prize activation is unknown for this issue" };
    const base = level === 0 ? 0 : publishedAmount(draw, "base", level);
    let extra = 0, additionalBasis = "not_eligible";
    if (additional && (level === 1 || level === 2)) {
      extra = publishedAmount(draw, "additional", level);
      additionalBasis = "published";
      // Only infer when the table has no additional row; an explicit unknown/zero row stays pending.
      if (!Object.hasOwn(draw.payouts?.additional || {}, level) && base !== null && Number.isSafeInteger(base)) {
        extra = Number(BigInt(base) * 4n / 5n);
        additionalBasis = "derived_80_percent_floor_yuan_rule";
      }
    }
    result.basePayoutYuan = base; result.additionalPayoutYuan = extra; result.additionalBasis = additionalBasis;
    if (base === null || extra === null) return { ...result, reason: "Published winning-tier payout is missing or is a zero-winner floating-prize placeholder" };
    return { ...result, grossYuan: base + extra, netYuan: base + extra - result.costYuan, status: "settled_published", reason: (level === 0 ? "No eligible base prize" : "Published base prize-table paper settlement; before tax and without adding a hypothetical winner to the pool") + (result.promotions ? "; separately listed promotional awards excluded, eligibility unverified" : "") };
  }
  function settlePortfolio({ gameId, tickets, draw, additional = false, budgetYuan }) {
    if (!Array.isArray(tickets) || !tickets.length || tickets.length > 10000) throw new RangeError("Portfolio must contain 1 to 10000 explicit single tickets");
    const rows = tickets.map(ticket => evaluateTicket({ gameId, ticket, draw, additional }));
    const costYuan = rows.reduce((s, x) => s + x.costYuan, 0);
    if (budgetYuan !== undefined && (!Number.isFinite(budgetYuan) || budgetYuan < 0 || costYuan > budgetYuan)) throw new RangeError("Portfolio exceeds valid budget");
    const closed = rows.every(x => x.status === "settled_published"), knownGrossYuan = rows.reduce((s, x) => s + (x.grossYuan ?? 0), 0);
    return { ...context(gameId, draw), ruleId: rows[0].ruleId, count: rows.length, costYuan, closed, status: closed ? "settled_published" : rows.some(x => x.status === "unsupported_rules") ? "unsupported_rules" : "pending_payout",
      grossYuan: closed ? knownGrossYuan : null, netYuan: closed ? knownGrossYuan - costYuan : null, knownGrossYuan, pendingCount: rows.filter(x => x.grossYuan === null).length, rows };
  }
  function choose(n, k) { if (k < 0 || k > n) return 0; let v = 1; for (let i = 1; i <= Math.min(k, n - k); i++) v = v * (n - i + 1) / i; return Math.round(v); }
  function uniformExpectedGross({ gameId, draw, additional = false, count = 1 }) {
    validateDraw(gameId, draw);
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new RangeError("Invalid baseline ticket count");
    if (typeof additional !== "boolean" || (additional && gameId !== "dlt")) throw new RangeError("Invalid additional option");
    const g = game(gameId), universe = choose(g.mainMax, g.mainCount) * choose(g.specialMax, g.specialCount), rule = ruleForIssue(gameId, draw.issue);
    if (!rule.supported) return { ruleId: rule.id, status: "unsupported_rules", publishedPrizeTableExpectedGrossYuan: null, counterfactualExpectedGrossYuan: null, identifiedBounds: { lowerYuan: 0, upperYuan: null }, reason: rule.reason };
    const patterns = []; let known = 0, unknownProbability = 0;
    for (let h = 0; h <= g.mainCount; h++) for (let b = 0; b <= g.specialCount; b++) {
      const combinations = choose(g.mainCount, h) * choose(g.mainMax - g.mainCount, g.mainCount - h) * choose(g.specialCount, b) * choose(g.specialMax - g.specialCount, g.specialCount - b);
      const probability = combinations / universe;
      const ticket = { main: draw.main.slice(0, h), special: draw.special.slice(0, b) };
      for (let n = 1; ticket.main.length < g.mainCount; n++) if (!draw.main.includes(n)) ticket.main.push(n);
      for (let n = 1; ticket.special.length < g.specialCount; n++) if (!draw.special.includes(n)) ticket.special.push(n);
      const settlement = evaluateTicket({ gameId, ticket, draw, additional });
      if (settlement.grossYuan === null) unknownProbability += probability; else known += probability * settlement.grossYuan;
      patterns.push({ mainHits: h, specialHits: b, combinations, probability, level: settlement.level, grossYuan: settlement.grossYuan });
    }
    return { ...context(gameId, draw), ruleId: rule.id, count, costYuan: count * (additional ? 3 : 2), universe, patterns, unknownProbability,
      status: unknownProbability > 0 ? "pending_payout" : "identified_published_table_scenario",
      publishedPrizeTableExpectedGrossYuan: unknownProbability > 0 ? null : known * count,
      publishedPrizeTableExpectedNetYuan: unknownProbability > 0 ? null : (known - (additional ? 3 : 2)) * count,
      identifiedBounds: { lowerYuan: known * count, upperYuan: unknownProbability > 0 ? null : known * count, basis: "published_prize_table_scenario" },
      counterfactualExpectedGrossYuan: null, counterfactualBounds: { lowerYuan: 0, upperYuan: null },
      reason: "Exact combinatorial weights applied to the published table; endogenous prize sharing, sales, caps and promotions prevent identifying actual counterfactual return from this table alone" };
  }
  return Object.freeze({ VERSION, normalizeIssue, ruleForIssue, validateDraw, prizeLevel, evaluateTicket, settlePortfolio, uniformExpectedGross, choose });
});
