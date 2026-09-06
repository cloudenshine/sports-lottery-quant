(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./number-settlement"));
  else root.NumberRuleContext = factory(root.NumberSettlement);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Settlement) {
  "use strict";
  const VERSION = "1.0.0";
  const RULE = Object.freeze({ sourceUrl: "https://www.scflcp.com.cn/yxgz/823145252.jhtml", article: 18,
    bodySha256: "8f405091246d5fac8569da5b3800bb8300df414aa2fc9bbf2c51b5ec09b082ef", rawRef: "rule-evidence/8f405091246d5fac8569da5b3800bb8300df414aa2fc9bbf2c51b5ec09b082ef.body", access: "archived_http_200", reviewedAt: "2026-09-06" });
  const ANCHORS = Object.freeze({
    "2026014": Object.freeze({ active: true, sourceUrl: "https://www.hbfcw.cn/csyw/cszx/202602/t20260203_404677.shtml",
      bodySha256: "f7920c31e8c00c645b19ae21bc3a9e5b7968bf33f211fd7ab755abc2c6dfcdd3", rawRef: "rule-evidence/f7920c31e8c00c645b19ae21bc3a9e5b7968bf33f211fd7ab755abc2c6dfcdd3.body", access: "archived_http_200", reviewedAt: "2026-09-06", finding: "Official report explicitly identifies issue 2026014 as executing the special provision" }),
    "2026076": Object.freeze({ active: false, sourceUrl: "https://www.gdfc.org.cn/datas/content/content_284502.html?subjectID=14",
      access: "official_indexed_text_read_live_http_405", reviewedAt: "2026-09-06", finding: "Official article dated 2026-07-03 identifies issue 2026076 as the first issue after suspension; indexed text is readable but direct raw retrieval returned HTTP 405" })
  });
  const clone = x => JSON.parse(JSON.stringify(x));
  function sourceEvidence(draw) {
    const s = draw.source;
    if (!s || !/^https?:\/\//.test(s.sourceUrl || "") || !/^[a-f\d]{64}$/i.test(s.bodySha256 || "")) return null;
    return { sourceUrl: s.sourceUrl, bodySha256: s.bodySha256, rawRef: s.rawRef || null, fetchedAt: s.fetchedAt || null };
  }
  function enrichDraws({ gameId, draws }) {
    if (!["ssq", "dlt"].includes(gameId) || !Array.isArray(draws)) throw new TypeError("gameId and draws array required");
    const rows = draws.map(d => { Settlement.validateDraw(gameId, d); return { draw: clone(d), issue: Settlement.normalizeIssue(d.issue) }; });
    rows.sort((a, b) => a.issue.localeCompare(b.issue));
    for (let i = 1; i < rows.length; i++) if (rows[i].issue === rows[i - 1].issue) throw new RangeError("Duplicate normalized issue " + rows[i].issue);
    const summary = { total: rows.length, active: 0, inactive: 0, unknown: 0, derived: 0, gaps: [], conflicts: [] };
    if (gameId === "dlt") return { gameId, draws: rows.map(r => r.draw), summary: { ...summary, notApplicable: true } };
    let previous = null;
    for (const row of rows) {
      const draw = row.draw, source = sourceEvidence(draw), prior = previous?.draw;
      const inputActive = Object.hasOwn(draw, "specialPrizeInputActive") ? draw.specialPrizeInputActive : draw.specialPrizeActive ?? null;
      if (inputActive !== null && typeof inputActive !== "boolean") throw new TypeError("Invalid original special-prize state");
      draw.specialPrizeInputActive = inputActive;
      let active = null, basis = "unidentified", anchorIssue = null, evidence = { rule: RULE, inputSource: source };
      if (Number(row.issue) < 2026014) { active = false; basis = "before_rule_effective_issue"; }
      else {
        const adjacent = previous && previous.issue.slice(0, 4) === row.issue.slice(0, 4) && Number(previous.issue) + 1 === Number(row.issue);
        if (previous && !adjacent) summary.gaps.push({ previousIssue: previous.issue, issue: row.issue });
        const previousSource = prior && sourceEvidence(prior), validPool = prior && Number.isSafeInteger(prior.poolYuan) && prior.poolYuan >= 0;
        if (adjacent && previousSource && validPool) {
          const p = prior.poolYuan;
          active = p >= 1500000000 ? true : p < 300000000 ? false : prior.specialPrizeActive ?? null;
          if (active !== null) {
            basis = "derived_from_previous_issue_pool_and_hysteresis";
            anchorIssue = prior.specialPrizeEvidence?.anchorIssue || previous.issue;
            evidence.previousIssue = previous.issue; evidence.previousPoolAfterDrawYuan = p;
            evidence.previousPoolSource = previousSource; evidence.previousActive = prior.specialPrizeActive;
          }
        }
        const anchor = ANCHORS[row.issue];
        const observedFortune = source && Number.isFinite(draw.payouts?.base?.fortune) && draw.payouts.base.fortune > 0;
        const reference = anchor ? anchor.active : observedFortune ? true : null;
        if (reference !== null) {
          if (active !== null && active !== reference) {
            summary.conflicts.push({ issue: row.issue, derived: active, reference }); active = null; basis = "conflicting_rule_context";
          } else { active = reference; basis = anchor ? "official_issue_anchor" : "published_fortune_prize_row"; anchorIssue = row.issue; }
          if (anchor) evidence.officialAnchor = anchor;
        }
        if (typeof inputActive === "boolean" && active !== null && inputActive !== active) {
          summary.conflicts.push({ issue: row.issue, derived: active, input: inputActive }); active = null; basis = "conflicting_rule_context";
        }
      }
      draw.specialPrizeActive = active;
      draw.specialPrizeEvidence = { version: VERSION, basis, anchorIssue, ...evidence, prizeAmountsNotImputed: true };
      if (basis.startsWith("derived_")) summary.derived++;
      summary[active === true ? "active" : active === false ? "inactive" : "unknown"]++;
      previous = row;
    }
    return { gameId, draws: rows.map(row => row.draw), summary };
  }
  return Object.freeze({ VERSION, RULE, ANCHORS, enrichDraws });
});
