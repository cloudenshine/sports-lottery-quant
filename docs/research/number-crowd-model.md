# 人群选号偏好与条件分奖代理

## 目的与边界

`number-crowd-model.js` 使用每期开奖的一等奖中奖注数和销售额，学习“某种号码组合被多人同时选中”的条件强度。它研究的是同样命中事件下的潜在平分人数，不能改变公平开奖的号码概率，也不是实际 SSQ/DLT 浮动奖池收益模型。销售额包含追加等不同票种，无法还原确切投注注数；实现把 `log(salesYuan / 训练销售中位数)` 作为系数固定为 1 的 offset，并由截距吸收未知单位换算。

## 模型

对历史中的实际开奖号码组合 `S_t` 和一等奖中奖注数 `y_t`（大乐透将 base 与 additional 的一等奖注数相加），模型为：

```text
y_t ~ Poisson(lambda_t)
log(lambda_t) = intercept + log(sales_t / medianSales) + x(S_t) * beta
```

`x(S)` 包含每个号码的指示变量，以及主区/特别区的生日区号码数（`<=31`）、连号对数、同尾对数、奇数数、低区数和号码和。所有这些特征的权重都从中奖人数估计，使用 L2 正则化；生日区和连号没有人工加分或固定收益假设。模型会保留迭代是否收敛、系数大小和训练样本相对参数量的 `overfitFlag`。

候选组合只在有限候选集内按预测 `lambda` 从低到高排序。`expectedShare` 使用 Poisson 条件分奖代理：

```text
E[1/(1+N)] = (1 - exp(-lambda)) / lambda,  N ~ Poisson(lambda)
```

`lambda=0` 时定义为 1。`headprobuniform` 是合法单注在公平开奖下的头奖概率，`selectionDensity`/`expectedShare` 只是排序或相对份额代理，均不是号码生成概率。

## 严格评估

`evaluate` 固定最后 120 期为 holdout，要求至少 200 期此前训练数据；每个 holdout 期只用此前记录重新拟合，不用 holdout 选择超参数。模型与只使用销售 offset 的 Poisson 基线在相同的一等奖中奖人数目标上比较平均 Poisson deviance 和 logscore。没有双指标样本外改善时状态为 `unsupported`；有改善也只标记 `exploratory_signal_requires_prospective_validation`，不能写成可靠收益优势。

真实快照运行：

```powershell
node scripts/evaluate-number-crowd.js
```

命令读取 `data/numbers/sources.json` 的 `games.ssq.draws`（555 期）和 `games.dlt.draws`（553 期），核验每期 source 的 `sourceId/sourceUrl/fetchedAt/bodySha256/rawRef` 字段，并写入：

- `data/returns/crowd-report.json`：可复现输入哈希、模型参数、训练诊断、120 期 holdout 指标和候选组合；
- `data/returns/crowd-report.js`：浏览器可加载的 `window.NUMBER_CROWD_REPORT` 快照。

API 最小示例：

```js
const Crowd = require('./number-crowd-model');
const model = Crowd.fit({ gameId: 'ssq', history: draws });
const portfolio = Crowd.createPortfolio({ model, count: 5, seed: 0, budgetYuan: 10 });
const score = Crowd.predict(model, { main: [1, 2, 8, 19, 27, 33], special: [6] });
```

当前报告若为 `unsupported`，应用应展示“无样本外支持”，继续保留模型用于前瞻记录，不能生成“可靠收益优势”宣称。SSQ 大小池封顶、DLT 浮动分奖、追加资格和税费没有在此代理中重算。
