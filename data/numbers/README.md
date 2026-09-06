# 数字彩公开观测归档

入口：`node scripts/sync-number-sources.js`。正式快照为 `sources.json`，同时保留 `ssq.json`、`dlt.json`、`sources-status.json`。`raw/` 内容按 SHA-256 去重；`runs/` 保留每次采集状态，`corrections/` 保留奖表更正或号码冲突。官方中央接口本次分别返回 403 / 567，原始证据在 `discovery/`；未绕过访问限制。

已核实的来源：

- `datachart.500star.com/{ssq,dlt}/history/newinc/history.php`：两彩历史号码、实际前两奖奖金及注数、销售额、奖池（部分金额取整）。
- `gdlottery.cn/f_html/kjgg/P085_YYNNN.html`：广东体彩官方逐期完整大乐透奖表，包括基本、追加及活动派奖分栏，奖池可精确到分。
- `vipc.cn/result/ssq/YYYYNNN`：双色球逐期奖表；缺表时使用已核验结构的 `yc.16788.cn/kaijiang/ssq/YYYYNNN.html` 作为明确标记的第二来源。
- `tifucai.com/index.php`：公开下期期号和预计开奖时间。该来源是二手预告，`salesCloseAt` 保持 null，不冒充官方销售截止。

期号统一为五位 `YYNNN`；draws 按日期升序。`drawAt` 为已公布开奖日的北京时间 23:59:59，`drawAtPrecision: day`，是保守日期边界而非精确摇奖时刻。`source.fetchedAt` 是实际采集时刻，历史观测不能据此回填赛前预测。

默认取近 300 期完整基础奖表，较老期保留部分实际数据；未发表奖金不填估计值。双色球 26014 以后缺少福运奖行不代表未启用：`specialPrizeActive: null`，需要单独规则状态证据。派奖奖项保存在 `promotion`，其资格未核验，不混入基础奖金。零中奖时发表的零元或破折号仍需由结算模块区分未知浮动奖金。

每日重验最近 10 期详情；较老详情复用哈希核验过的原始缓存。需要全面复核历史修订可调用 `syncNumberSources({ refreshDetails: true })`。失败保留最后有效历史并标记 stale/degraded；下期预告失败时置 null，避免把旧预告标为新鲜。号码冲突隔离并保留证据，不静默覆盖。每次失败和回退源仍在 results 中可见，即使完整数据目标最终得到满足。
