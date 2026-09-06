# GitHub Pages 公开部署与云端刷新

公开站点发布到 `cloudenshine/sports-lottery-quant` 的 `main` 与 GitHub Pages。站点构建由
`scripts/build-public-site.js` 完成，输出目录固定为 `dist-public/`。它使用源码内的显式文件白名单，
不会把仓库根目录当作 Pages artifact；`data/research/raw/`、`data/numbers/raw/`、cache、运行日志、
`.codex-runtime/`、本机路径和本地账本文件都不进入公开 artifact。

公开 dashboard 是从本地生成的 dashboard 投影出来的轻量 JS。投影保留：

- 已发布的开奖/赛果事实、采集和登记时间、数据状态与失败原因；
- 来源的公开 URL 和用于来源追踪的 body SHA-256；
- 前瞻实验的模型、票组、期号、纸面结算和规则来源链接。

投影删除 `rawRef`、原始响应引用、本机绝对路径、代码/训练输入哈希和逐行回测明细。哈希删除只
影响内部复现索引，不改变页面展示的事实或公开来源 URL。原始证据仍留在受保护的本地归档或
Actions artifact，不作为 GitHub Pages 静态文件。

## Workflow

真实文件名是 `.github/workflows/deploy-pages.yml`（不是 `deploy.yml`）。它在 `main` push 或
`workflow_dispatch` 时执行 Node 24 构建，然后用官方 Pages artifact/deploy actions 发布
`dist-public/`，权限是 `contents: read`、`pages: write` 和 `id-token: write`。

`.github/workflows/sync-live.yml` 在北京时间 10:30、18:30、23:30（UTC cron 分别为
`30 2,10,15 * * *`）以及手动触发时运行。它按以下顺序执行：

1. `scripts/cloud-refresh.js` 抓取公开赛事快照，并在临时目录中抓取有限的数字彩公开来源；
2. 只把可公开的赛事快照、数字彩 source snapshot 和刷新状态写回 allowlist 文件；
3. 重新生成 `dist-public/`；
4. 在同一个 workflow 内直接部署 Pages；
5. 只提交明确列出的刷新输出，提交信息带 `[skip ci]`。

因此 Actions bot 的刷新提交不会再触发一轮普通 Pages 部署。数据源部分失败时保留此前有效快照，
并在 `data/cloud-refresh-status.json` 写入 `degraded`、失败步骤和错误；刷新仍可发布已有有效页面。

## 单写者边界

本机 Codex heartbeat 是冻结前瞻数字彩和足球账本的唯一写者。云端不运行
`npm run research:daily` 或 `npm run numbers:daily`，也不调用足球预测注册入口；否则会产生同一
期号的第二份预测。云端只读取已提交的前瞻副本并展示它们，`cloud-refresh.js` 只写公开 source
snapshot 和赛事快照，`ledgerWrites` 必须为空。

本机日常运行仍按 `docs/research/operations.md` 使用 `research:daily` 和
`numbers:daily`。云端刷新失败可以重试；它不会补造漏掉的预测、开奖时间、销售截止或奖金。

## 本地验证与回退

部署前在仓库根目录运行：

```powershell
npm test -- --test-name-pattern "public build|public dashboards"
node scripts/build-public-site.js
npm run verify
```

检查 `dist-public/` 只包含脚本导出的 allowlist 与两个投影 dashboard；公开文件中不得出现
`rawRef` 或本机绝对路径。部署失败时保留最近一次 Pages artifact；数据刷新提交可以回退到上一条
已验证的 `main` 提交，不能删除或重置本机冻结 ledger。该部署只发布静态研究页面，不创建真实投注、
付费数据订阅或远程账户设置。
