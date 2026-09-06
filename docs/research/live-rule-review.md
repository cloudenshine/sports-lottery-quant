# 已归档官方规则逐项复核

复核时间：2026-09-05T18:49:39.951Z；研究任务内部复核，不代表用户验收。

本轮读取 `research-rule-watch.js`、11 个 metadata 与对应 raw 文件，重新计算全部 SHA-256，再将 HTML 正文和本地 PDF 文本与此前登记的条款范围逐项核对。11 个已登记源均为 HTTP 200，11 个哈希全部匹配；没有发现已登记条款的实质变化。第一次保存的 raw 没有更早原文基线，因此只能说与此前已读条款一致，不能声称做过两版原文差分。

机器收据：`data/research/rules/live-review.json`。`reviews` 每项含 `sourceId`、`url`、`bodySha256`、`reviewedAt`、`status: reviewed`、条款范围与局限。只有 URL 与哈希同时相符时才可确认该版本已阅；后续字节变更仍须重新审阅。审阅基线不将 pending 合同自动升级为 verified。

| sourceId | SHA-256 | 已复核范围 |
|---|---|---|
| fj-jc-payout | `19e79564f829f8f0b123daa65929002110cba3200c8cebc0cda8032440572d8f` | 奖金计算一、二（正文61-104行） |
| fj-jc-football | `a08c000892d478b749731d080c6c4952932b231cb3ef0c19feb2e81e0bf3c430` | 第6、7、11、14、15、19、21条 |
| fj-jc-basketball | `0749c56480724d1009e8a36cc75edd388cb0bacbb8e904098ed459ee1a6b5d4e` | 第6、7、11、14、15、19、21条 |
| beijing-sp | `381a76ad1a1a12a683452d0114d0a81dcd2f463876b70231d034455edf1ca500` | 问答正文30行 |
| beijing-return | `29bde3fad3dbf9e4134be78b1e9f0acc10783acae74e24fc82cdea2efec3d796` | 问答正文31行 |
| js-dlt-2026 | `41603e206e91821756a6bad19cb04cc2a15d3ec3c42c93bc45d9bba6c8319726` | 第15、16、25条 |
| js-dlt-effective | `3570782e7f285709b5f22218716bd5f391c8bde196ff5d006d7ba59de53d98d9` | 公告第1、2段 |
| sport-policy-2020 | `050ff38a8693a6d1e2a4d9cbd3e99c2f508d2326898a187ce026c75fadfc0bc0` | 财综〔2020〕42号 第1-2页 |
| sport-policy-2019 | `b8269f1a91d1b1f7bde893d2272fdd7589e925ad96da2155230e71d092f9bef9` | 财综〔2019〕4号 第（六）项 |
| js-sfc-rx9 | `94f9e317a72a0379be67eb914ee3296d25c3bb39fe29c3eaed101b31552a85e0` | 胜负游戏第7-13条、任选9场第7-13条 |
| fj-sfc-cancel | `72aea23ac5f16adc65cbd39237f1df28875732ba174aec1bbae02476b61c0417` | 引用管理办法第13条；该页是规则解读非完整规则 |

## 关键结论

- 竞彩金额：2 元乘固定奖连乘；逐注先按第三位及第二位奇偶规则保留两位；逐注封顶；合计后乘倍数。10 万/20 万/50 万/100 万封顶，与已登记实现合同一致。
- 竞彩旧正文仍保留 2 万元、2-99 倍、73% 等旧条款，但正文附有修订指引；2019 与 2020 两份政策明确覆盖它们。现行登记的 6000 元单票上限、2-50 多倍范围、70% 整体返奖均有正文支持。70% 不再扣在固定赔率上。
- 足球/篮球：场次与玩法资格、出票时固定奖、官方无效认定、退票/剔除腿、36 小时计时基准一致；篮球 35/43 分钟例外必须同时有比赛正式完成裁定。
- 大乐透：26014 期生效、七奖级映射、8 亿元分档、固定奖 5000/300/150/15/5 与 6666/380/200/18/7、追加 80% 仅限浮动奖均一致。实际历史结算仍应使用对应期官方奖金及派奖/限赔证据。

2020 政策不是仅凭 PDF 文件头通过：使用 bundled Python 的 pypdf 直接读取该哈希文件两页，看到第1页 71% 调为70%，第2页 6000元限额与2020-11-01生效日期。

## 保留的未解范围

北单两个问答只能确认原始 SP 定义和 65% 浮动返奖率；完整过关公式、取整、保底、封顶、无效比赛、各玩法让球合同仍缺一手完整条文，`beidan.full-settlement` 继续 pending。乘一次原始 SP 的 65% 不是已证实的重复扣除。

传统足彩奖级与历史奖金口径已核对；`fj-sfc-cancel` 仍然只是刊载中国体育报的部分规则解读。补充定位了 [管理办法原文](https://www.sporttery.cn/help/605536.html) 与 [2026-02-04 当期计奖公告](https://www.sporttery.cn/ctzc/zcgg/20260204/10052294.html)，web 打开超时，获准直接 HTTP 请求均返回 567 访问拦截。失败响应和 discovery receipt 已保存，没有绕过拦截，也没有将搜索摘要算作完整合同。`sfc-rx9.cancellation` 继续 pending。

本轮新增的两个失败 discovery 不在原11源已阅基线内。完整文件分别为 `sport-sfc-management-discovery.json`、`sport-sfc-20260204-discovery.json`，响应 raw 依其 sha256 可定位。

## 验证与变更范围

11/11 source 原文哈希复算相符，live-review.json 可正常解析。只写本复核报告、live-review.json 和两份追加失败请求证据；未改 watch 代码、规则 registry、运行引擎或 metadata 状态。
