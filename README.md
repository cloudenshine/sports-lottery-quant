# 数字彩研究台（双色球 / 超级大乐透）

线上入口：[竞技彩票](https://cloudenshine.github.io/sports-lottery-quant/sports.html) · [数字彩票](https://cloudenshine.github.io/sports-lottery-quant/index.html)。体育收益决策引擎比较经验证概率下的净赔率期望、概率下界、整数资金约束与随机基线；数字彩新增从真实销量和一等奖注数拟合的分奖研究。两项实现与原冻结实验分别记录。当前分奖模型的两彩种 120 期留出检验均未优于销量基线，尚无可靠收益优势的实证结论。

`npm run returns:evaluate` 重建分奖报告，`npm run build:public` 构建 Pages 发布目录。GitHub 每日北京时间 10:30、18:30、23:30 刷新公开来源并部署，来源失败单独留痕。前瞻预测与结算由本机日常研究任务独立登记；云端采集不回填预测。部署说明见 [cloud-deployment.md](docs/research/cloud-deployment.md)。

`index.html` 已重构为新概率模型、真实逐期奖表、前瞻登记与随机对照的主应用。运行 `npm run numbers:daily` 更新数据并登记，运行 `npm run serve` 后访问 `http://127.0.0.1:8080/index.html`。完整运行合同见 [数字彩运行说明](docs/research/numbers-operations.md)；本次验收见 [数字彩交付证据](docs/testing/numbers-v2-delivery.md)。当前尚无可靠收益优势的证明。

下文 L0–L4 为保留的旧版组合工具说明，入口已迁移至 `number-tools.html`，不再是主应用使用的概率模型。新旧页面均保留独立测试。

本轮科学修复和验收见 [修复报告](docs/testing/scientific-repair-report.md)。当前工具用于组合覆盖、奖金情景与概率评估；没有已证实的预测优势。

```sh
npm test                 # 自动发现所有回归测试
npm run build            # 重建数字彩、旧工具、赛事和研究离线单文件
npm run verify           # 语法、测试、打包一致性、固定种子科学对照
npm run serve            # 默认仅 127.0.0.1:8080
```

需要手机局域网访问时，可在 PowerShell 显式执行 `$env:HOST='0.0.0.0'; npm run serve`；这会向本地网络开放服务。离线使用可直接复制 standalone HTML。网页刷新只重新加载已保存快照，不会抓取即时赔率。旧赛事快照因含构造战绩而隔离；演示数据须手动选择。

`node build-compact.js` 从现有历史重建浏览器数据，`node analyze.js` 生成描述统计。`node update-all-history.js` 与 `node sync-sports-live.js` 会联网并更新数据。2026-09-06 已执行真实同步；竞彩 26 场有效，胜负彩因第 13 场缺少赔率而隔离，原始公开响应与哈希保存在 `data/sports-source-evidence/`。

回测仅使用过去的数据。奖金按当前规则和明确假设作情景估算，跨规则时期的回测不代表历史真实兑奖。数字彩固定 N 张不同完整票的头奖概率是 N / 全部组合数；筛选形态不改变这个概率。矩阵保证仅适用于规定数量的开奖号落入号池时，准确保证见引擎的穷举证书。

按 L0–L4 完整规划重写，并用对抗测试锁死行为。

旧工具打开 `number-tools.html` 即可用。

```
npm test
```

## 分层

| 层 | 做什么 | 不做什么 |
|---|---|---|
| L0 诚实 | 写出宇宙 17,721,088 / 21,425,712，预算锁死，明确过滤不提高一等奖概率 | 不承诺预测 |
| L1 硬过滤 | 4 连、极端奇偶/大小、历史 5%–95% 和值/跨度、真实 AC 高峰、同尾>3、等差、单区≥5、全号撞车、与上期重叠≥4 | **不**剔除近 20 期热号池 |
| L2 反人群 | 生日区、吉祥号、临摹上期、票面连片 → 降权 | 不把热号物理消失 |
| L3 票组 | 主号两两重叠 ≤3，蓝/后区轮转，cover 模式做 3 码覆盖 | 不买 5 张同一张脸 |
| L4 预算/胆拖 | 先定今晚 N 元；胆拖超预算直接拒绝 | 不偷偷截断展开 |

## 对抗测试锁死的事实

- 四连可杀，三连必须保留
- 全号历史撞车默认杀；主号单独撞车默认不杀
- 近 20 期热号池成员身份不是硬拒绝
- walk-forward（只用当期之前的历史）通过率 ≥ 80%
- 5 注双色球蓝球互不重复时，六等奖覆盖 5/16
- 2 胆 + 8 拖 + 3 蓝 = 210 注 = 420 元；预算 20 元则报错、0 注

## 文件

- `engine.js` 核心漏斗
- `number-tools.html` 旧投注机 / 胆拖 / 规划 / 实证
- `test/adversarial.test.js` L0–L4 对抗
- `test/prizes-and-budget.test.js` 全奖级矩阵
- `docs/testing/funnel-rebuild.tdd.md` RED/GREEN 证据

## 每日概率研究

已接入公开赛前赔率与赛果采集、七模型同批预测、不可覆盖前瞻账本、官方规则原文监控，以及两种选注/持币策略回测。执行 npm run research:daily，查看 research.html 或 research-standalone.html。定时任务已启用，每天北京时间10:30、18:30、23:30运行；本机与Codex需保持可运行。详见 [运行说明](docs/research/operations.md) 与 [本轮交付证据](docs/testing/daily-research-delivery.md)。
