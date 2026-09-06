# 体育收益决策策略

`sports-return-policy.js` 是固定赔率体育市场的独立决策层。它不会把体育模型的分数、赔率去水或“命中率”当成可兑现收益证明，也不会为北单或传统足彩套用固定赔率公式。

## 输入合同

调用 `evaluateDecision({ ... })`：

```js
{
  market: 'jczq' | 'jclq',
  odds: { home: 1.95, draw: 3.4, away: 3.8 },
  probabilities: [0.55, 0.25, 0.20],
  probabilityLowerBounds: [0.45, 0.15, 0.10], // 可选；没有它不能通过最坏风险门槛
  budgetYuan: 200,
  stakeUnitYuan: 2,
  kickoffAt: '2026-09-10T12:00:00.000Z',
  oddsObservedAt: '2026-09-10T11:30:00.000Z',
  now: '2026-09-10T11:40:00.000Z', // 测试/回放可固定；生产默认 Date.now()
  officialSale: true,
  settlementRuleVerified: true,
  settlementTerms: { verified: true, feeRate: 0, taxRate: 0, maxPayoutYuan: null },
  calibrated: true,
  source: { sourceId: '...', sourceUrl: 'https://...' }
}
```

`probabilities` 与 `odds` 必须一一对应并且概率和为 1。`probabilityLowerBounds` 是每个结果的赛前概率下界；被选结果的最坏净期望是 `lowerBound × decimalOdds - 1`，不能只用点估计的 EV 通过风险门槛。默认期望总回报门槛为 `1.05`，默认最大 Kelly 投入比例为 `0.25`。整数投注单位不能超过 `floor(budget / stakeUnit) × min(Kelly, cap)`；不足一注时保留现金。

结果包含：

- `status`: `supported_trade`、`hold_cash` 或 `research_only`。
- `renderable`: `candidateStakeYuan` 是数学候选暴露，`actualActionStakeYuan` 是只有 `supported_trade` 才能执行的金额；研究或保留现金时后者为 0。
- `expectationProof`: 同候选暴露随机选项、同预算随机选项（包括闲置现金）的期望净收益及差值。差值是输入概率成立时的代数期望，不是已实现利润。
- `reasonCodes` / `reasons`: 缺赔率时间、赔率过期、销售状态未知、规则未核验、概率未校准、固定 EV 不足和最坏区间不利等阻断原因。

只有明确 `officialSale: true`、赛前新鲜赔率、已核验固定结算规则、可追溯源、已核验 `settlementTerms` 和 `calibrated: true`，并且概率下界、EV、Kelly 和预算门槛全部满足时，普通 EV 路径才会返回 `supported_trade`。期望值和 Kelly 使用扣除 `feeRate`/`taxRate`、并应用 `maxPayoutYuan` 后的 `effectiveOdds`。若提供有限奖金封顶，普通单场接口会等待逐票分配而返回研究状态，避免把总封顶错误地乘到整笔预算；有限封顶可在套利路径的整数计划中精确处理。`officialSale` 缺失会返回 `research_only`。`beidan`/`dc`/`sfc`/`rx9` 明确返回 `research_only`，因为它们是浮动 SP 或浮动奖池，不能冒充固定赔率收益。

## 条件套利

可选 `arbitrageQuotes` 为同场同玩法（含盘口）、同结算期间的完整互斥结果报价。每项必须带 `eventId`、`marketVariant`、`settlementPeriod`、`sourceId`、赛前捕获时间、`officialSale: true` 和 `settlementRuleVerified: true`；不同来源可以并列，但每个来源都必须有自己的标识和证据。还必须提供：

```js
settlementTerms: {
  verified: true,
  feeRate: 0,
  taxRate: 0,
  maxPayoutYuan: null
}
```

模块以扣除费税后的净赔率计算 `sum(1 / netOdds) < 1`，并在小预算内穷举整数投注单位。`arbitrage.status === 'conditional_guarantee'` 只表示该完整同场报价集合及已核验合同下的条件保证；缺少任一结果、同时性、净赔合同或整数正收益方案时不会作保证。默认穷举计划数上限为 1,000,000，三结果市场可覆盖到 1,000 个投注单位；超过上限会报告证书缺失。

## 真实快照离线复核（2026-09-06）

复核输入来自 `data/research/dashboard.json` 的第一条 `recentPredictions`，事件 `500:1362496`（维多利亚–格雷米奥），赔率捕获于 `2026-09-05T18:48:45.225Z`，开赛时间 `2026-09-07T23:00:00Z`。使用记录中的 ensemble 概率 `[0.4570122212, 0.2860011965, 0.2569865823]`、相同赔率 `{home:1.94, draw:3.10, away:3.45}`、预算 200 元、单注 2 元，并以 `2026-09-05T19:00:00Z` 作为回放当前时刻。结果可由以下命令重现：

```text
node -e "const d=require('./data/research/dashboard.json'),{evaluateDecision}=require('./sports-return-policy');const p=d.recentPredictions[0].payload;const r=evaluateDecision({market:'jczq',odds:p.match.odds,probabilities:p.prediction.probabilities,budgetYuan:200,stakeUnitYuan:2,kickoffAt:p.match.kickoffAt,oddsObservedAt:p.oddsObservedAt,now:'2026-09-05T19:00:00.000Z',source:p.source,officialSale:undefined,settlementRuleVerified:false});console.log(JSON.stringify({eventId:p.match.eventId,expected:r.expected,risk:r.risk,status:r.status,candidate:r.expectationProof.candidate,baseline:r.baseline,blockers:r.reasonCodes},null,2))"
```

票面数学结果：三个 `p × odds` 贡献均约 `0.8866037091`，最高单项期望毛回报 `0.8866037091`，单注期望净收益 `-0.1133962909`；Kelly 为 0，候选投注 0 元，200 元全部保留。若把 200 元全部给同一预算的均匀随机选择，按该概率和赔率的期望净收益为 `-22.67925818` 元；这是基线计算，不是本次建议的可兑现收益。阻断原因为 `official_sale_unknown`、`settlement_rule_unverified`、`probability_uncalibrated`、`ev_below_threshold` 和 `worst_case_unknown`。当前前瞻账本 `settledEvents=0`，因此没有该事件的 actual paper realized 可填。

作为历史对照，既有 `docs/testing/model-tournament.json` 在独立的 football-data-mirror 历史快照上报告：`elo + ev-threshold` 的 300 场回放实际投入 237 个纸面单位，纸面净额 `+9.37` 个单位；该文件明确标为 `PENDING_PROSPECTIVE_CONFIRMATION`，赔率是未核验时间的历史报价、结算是纸面固定赔率假设，不能升级为实际收益或未来优势。该对照没有使用未来赛果选择本模块策略；它只说明为何必须保留“研究结果”和“可支持交易”两个状态。
