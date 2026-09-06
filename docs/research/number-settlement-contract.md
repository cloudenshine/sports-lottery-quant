# 数字彩逐期结算合同

`number-settlement.js` 是 Node/browser 共用的纯函数模块，浏览器导出 `NumberSettlement`。金额均为人民币元；`netYuan = grossYuan - costYuan` 是税前纸面净额。不会自动扣税，不代表实际兑奖或税后收入。

## 规则证据与适用范围

2026-09-06 阅读了以下官方机构原文；这是规则审阅日期，网页缓存不代表实时开奖抓取。

- [江苏体彩 2019 完整规则](https://www.jslottery.vip/pages/playArea/dltDetail2.html)：第19019期开始使用9奖级；追加仅参加前两级，按基本奖额80%，浮动奖按元取整。前两级之外的基本奖级依次对应5+0、4+2、4+1、3+2、4+0、3+1或2+2，末级对应3+0、2+1、1+2、0+2。
- [江苏体彩 2026 完整规则](https://www.js-lottery.com/wfzq/dlt/wfjs/cms/post-146354.html)：新7级合并部分中奖条件，固定奖由开奖前奖池档位决定；追加仍仅参加前两级。模块读取逐期公布奖额，不以当前奖池或通用表倒填历史奖额。
- [浙江体彩2026生效公告](https://www.zjlottery.com/Notice/202601/95567.html)：大乐透第26014期起切换，即使较早售出的预售票也按对应开奖期新规处理。
- [四川福彩 2026 完整规则](https://www.scflcp.com.cn/yxgz/823145252.jhtml)：核心六级外，特别规定期间增设福运奖；奖池15亿元开启、低于3亿元停止，具有状态延续性。3红0蓝对应福运奖，3红1蓝仍取五等奖，不叠加福运奖。限额赔付可能调整固定奖金，因此也不回填缺失固定奖。
- [上海福彩生效公告](https://www.swlc.net.cn/shsflcpfxzx/tzgg/content/403a79b8-ae7b-4e38-9b17-c98f454c03d1.html)：双色球新规则从2026014期执行。
- [内蒙古体彩2019生效公告](https://www.nmtc.com.cn/zxdt/14121.html)：确认19019期切换。更早大乐透不套用9级或7级；返回 `unsupported_rules`。历史早期展示中的追加行不是独立基本奖级。

## 输入

`draw` 必须有 `issue`（YYNNN 或 YYYYNNN）、`main`、`special`；可选 `gameId` 必须匹配。号码严格整数、范围合法、不重复。若提供 `status`，必须为 `drawn/published/final/completed/official`。

奖金结构：`payouts: {base: {'1': amount, ...}, additional: {'1': amount, ...}}`；中奖注数同样为 `winners.base/additional`。未知金额保留 `null` 或缺键；不能用 `PRIZE_ESTIMATES` 填入。`fortune` 是双色球福运奖键。2026014及以后必须使用逐期公告或经验证的连续状态提供 `specialPrizeActive: true/false/null`。不能根据单独一期开奖后奖池判断当期状态。

`evaluateTicket({gameId,ticket,draw,additional:false})` 返回命中奖级、基本/追加/总奖金、成本、税前净额、`status`、`reason` 和 `ruleId`。仅支持展开后的单注；追加为3元，其余2元。未中奖可确定0元；中奖但缺公告奖金为 `pending_payout`。浮动奖“0注0元”是占位，不是新增假想中奖者所得0元。

追加有已公布金额时优先使用；仅缺少整个对应追加键且基本浮动奖额为整数时，以整数算术 `floor(base * 4 / 5)` 推导并返回 `additionalBasis`。明确 `null` 或0注占位不推导覆盖。派奖与风险控制元数据原样暴露；独立营销特别奖未核验资格时排除，不悄悄计入。

`settlePortfolio({gameId,tickets,draw,additional,budgetYuan})` 检查预算。每一显式单注均计成本，重复单注也收费。任何一注未知，组合 `closed:false` 且总净额为null；`knownGrossYuan` 只是已知部分。

## 随机对照与反事实边界

`uniformExpectedGross({gameId,draw,additional,count})` 穷尽所有命中模式，采用

`C(k,h) C(N-k,k-h) C(s,b) C(M-s,s-b) / [C(N,k) C(M,s)]`

给出精确组合权重。双色球样本空间17,721,088，大乐透21,425,712。`publishedPrizeTableExpectedGrossYuan` 是固定该期公告奖表后的情景期望。奖表不完整时为null，`identifiedBounds` 给出这个情景的已识别下界及未知上界。

浮动奖金依赖其他购彩者、奖金分配与总额上限。新增假想赢家可能改变奖额，所以即使奖表完整，`counterfactualExpectedGrossYuan` 也为null，不能称为真实新增下注的精确期望。结果始终标注 `counterfactualRecomputed:false`。投注是否存在收益优势需要同成本对照与独立前瞻数据，本模块不作晋级判断。

## 逐期福运状态补全

`number-rule-context.js` 的 `enrichDraws({gameId,draws})` 返回 `{gameId,draws,summary}`；输入不变，输出按规范化期号排序。保留 `specialPrizeInputActive`，并新增 `specialPrizeEvidence`。原始奖金表完全不变。

状态依据官方第18条与逐期池余额：本期开奖后的余额只影响下一期。达到15亿元开启，低于3亿元关闭，中间区间继承；恰好3亿元不会关闭。期号缺失、跨年但无法证明相邻、缺有效奖池或来源哈希会中断推导，直到明确当期状态或阈值重新确定。来源显式状态与推导冲突时保留unknown并列出conflict。

[湖北福彩2026年2月3日原文](https://www.hbfcw.cn/csyw/cszx/202602/t20260203_404677.shtml) 明确2026014期执行特别规定。该页以GB18030解码，原始响应和规则全文均以HTTP200归档在 `data/numbers/rule-evidence/`。

[广东福彩2026年7月3日原文索引](https://www.gdfc.org.cn/datas/content/content_284502.html?subjectID=14) 明确2026076期停止特别规定；已阅读官方索引全文，但本次直连返回405，不能把失败响应标成原文。模块证据字段明确区分这种访问状态。该公告也与实际26075期池余额283,183,968元一致，连续池序列按规则独立算出同一停用点。

本次只读验证本地555条SSQ记录：2026014至2026102连续89期，62期福运开启、后27期关闭；全数据没有缺期或状态冲突。此统计是本次数据快照结果，不是未来有效区间硬编码。规则上下文也不把5元推算填进公告奖表。

大乐透独立派奖记录 `draw.promotion` 保留在 `promotions` 输出；`promotionDisclosure` 和中奖 `reason` 明确排除未验证资格的活动奖金。基础税前纸面结算不冒充含活动全部回报。
