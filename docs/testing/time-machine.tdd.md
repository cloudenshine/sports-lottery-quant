# 完整历史时空回测：104 项全自动化测试 100% 验证

通过 `npm test` 对核心引擎及回测模块进行严密验证，重点覆盖 **4 大策略流派的动态实测与 3498 期数据对接**：

## 1. 验证目标：策略整合入回测引擎
将原来割裂的“选号策略”、“走势缩水”和“数学轮盘”，在底层的时空遍历引擎中融为四套独立的战术路线，并且无需干预自动选胆、展开矩阵、计算金额与验证覆盖率。

## 2. 攻坚突破：时空环境中的 Auto-Dan (自动寻胆) 机制
* 当调用 `E.simulateTimeMachine('ssq', { mode: 'wheel' })` 时，系统在每个时空切片下，调用均值回归动量模型。
* 自动在当时的 16 码高潜池中抓取前 10 个动量最热球。
* 对双色球，直接喂入内置的 `10码中6保5 (14注)` 矩阵。对大乐透则喂入 `8码中5保4` 等矩阵。

## 3. 全策略回归与实测数据
所有测试全绿通过：
```
▶ Advanced Module 3: Lottery Wheels (Mathematical Design Matrix)
  ✔ generates 10-6-6-5 wheel for SSQ (14 tickets) (1.4026ms)
  ✔ generates 8-5-5-4 wheel for DLT (4 tickets) (0.2781ms)

▶ Radar Metrics and Time-Machine Backtest
  ✔ simulateTimeMachine runs walk-forward simulation across historical periods (724.2769ms)
  ✔ simulateTimeMachine works on DLT (375.7875ms)

ℹ tests 104 | pass 104 | fail 0
```

## 4. UI与体验
界面现统一在一个简洁下拉框中支持一键切换四种风格，提供单期全自动定胆+组号功能，实时计算 **资金返还率 (ROI)** 和 **随机基准对比**，一切基于数学统计客观展现，杜绝虚假预测宣传。
