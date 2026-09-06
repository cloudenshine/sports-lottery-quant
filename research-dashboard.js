(function (scope) {
  'use strict';
  const modelNames = { uniform: '均匀随机', historical: '历史基准', poisson: '泊松进球', elo: 'Elo 强度', market: '市场去水', 'market-power': '市场幂校准', ensemble: '组合模型', hot_shrink: '热号收缩', cold_shrink: '冷号收缩', coverage: '组合覆盖' };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const array = value => Array.isArray(value) ? value : [];
  const number = (value, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const model = value => escape(modelNames[value] || value || '未知模型');
  const date = value => value && Number.isFinite(Date.parse(value)) ? escape(new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })) : '—';
  const interval = value => Array.isArray(value) && value.length === 2 ? `[${number(value[0], 4)}, ${number(value[1], 4)}]` : '样本不足';
  const empty = message => `<p class="empty">${escape(message)}</p>`;
  const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const stat = (value, label) => `<div class="stat"><strong>${number(value)}</strong><span>${escape(label)}</span></div>`;
  const list = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
  const statusNames = { ok: '采集成功', success: '采集成功', fresh: '采集成功', cached: '已保存快照', degraded: '降级 / 保留历史', stale: '历史缓存', failed: '采集失败', error: '采集失败', blocked: '来源拒绝访问', unavailable: '不可用', awaiting_result: '等待赛果', pending_settlement: '等待结算', pending_rule_verification: '规则待核验', scored_no_trade: '已评分 / 无纸面投注', settled_paper: '已按核验规则纸面结算', settled_paper_assumption: '已按数学假设纸面结算' };
  function promotionExplanation(promotion) {
    const collecting = promotion.status === 'COLLECTING_PROSPECTIVE_EVIDENCE';
    const complete = promotion.status === 'FIXED_HORIZON_RESEARCH_REVIEW_COMPLETE';
    const statusText = collecting ? '观察期仍在进行，按固定截止时间检验，不因每日结果改变结论。' : complete ? '固定观察期的研究评审已完成；结论保持锁定，新的实验需要另行登记。' : '等待完整观察期及预先约定的检验。';
    return list([statusText, '每个来源、每个模型独立计算同场样本，不把不同模型或来源的数量相加。', promotion.researchEvidenceEligible === true ? '部分研究检验出现正向证据，仍需核实实际执行与结算条件。' : '尚未确立可执行的收益优势；纸面结果不能作为实际可兑奖收益。']) + (array(promotion.reasons).length ? `<details class="note"><summary>查看审计原因原文</summary>${list(promotion.reasons)}</details>` : '');
  }
  function ruleWatchSection(watch) {
    const rows = array(watch && watch.results);
    if (!watch || !rows.length) return `<section><h2>官方规则原文监控</h2>${empty('尚无官方原文监控快照。')}</section>`;
    const available = Number.isFinite(watch.sourceCount) && Number.isFinite(watch.failedCount) ? Math.max(0, watch.sourceCount - watch.failedCount) : undefined;
    return `<section><h2>官方规则原文监控</h2><p>可用官方原文 <strong>${number(available)}</strong> 份 · 采集失败 <strong>${number(watch.failedCount)}</strong> 份 · 待复核 <strong>${number(watch.reviewRequiredCount)}</strong> 份</p><p class="note">原文可用与完整结算合同已核验分别记录。原文内容变化后需要复核；已复核的原文版本不会自动补齐尚待核验的合同条款。</p>${table(['官方来源', '采集状态', '原文版本复核', '最近成功采集（北京）', '规则原文'], rows.map(row => {
      let link = '链接不可用';
      try { const url = new URL(row.url); if (['http:', 'https:'].includes(url.protocol)) link = `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">查看官方原文</a>`; } catch {}
      return [escape(row.publisher || row.sourceId), escape(statusNames[row.status] || row.status || '未知'), `<span class="status ${row.reviewRequired === false ? '' : 'warn'}">${row.reviewRequired === true ? '待复核' : row.reviewRequired === false ? '该版本已复核' : '尚无复核结论'}</span>`, date(row.lastSuccessfulFetchAt), link];
    }))}</section>`;
  }
  function returnRows(rows) {
    return rows.map(row => {
      const market = row.returnAgainstMarket || {}, cash = row.netAgainstCash || {}, fullBudget = row.fullBudgetRandomBaseline || {};
      const evidence = array(row.evidence);
      const assumed = evidence.includes('paper_assumption') || !!row.paperRuleAssumption;
      const basis = assumed ? '固定赔率数学假设' : evidence.includes('verified_rule_hypothetical') ? '核验规则下的纸面模拟' : '报告原有收益情景';
      const policy = row.decisionPolicy === 'ev-threshold' ? `预期回报阈值 > ${number(row.evThreshold, 2)}` : row.decisionPolicy === 'argmax' ? '每场选最高概率' : row.decisionPolicy || '报告原有策略';
      const net = value => row.matchedEvents > 0 ? number(value, 2) : '—';
      return [`${escape(row.sourceId || '报告来源')}<br>${model(row.modelId)}`, escape(policy), `${number(row.matchedEvents)} / ${number(row.noBetCount)}`, `${number(row.actualStake === undefined ? row.strategyStake : row.actualStake)} / ${number(row.exposureBudget)}`, row.matchedEvents > 0 ? number(row.totalNet, 2) : '未满足结算条件', `${net(row.baselineExpectedNet)} / ${net(market.net)}`, interval(cash.interval), interval((row.uncertainty || {}).interval), interval((market.uncertainty || {}).interval), interval((fullBudget.uncertainty || {}).interval), `<span class="status warn">${escape(basis)}</span>${row.paperRuleAssumption ? `<br><span class="muted">${escape(row.paperRuleAssumption)}</span>` : ''}`];
    });
  }
  function progress(value, target, label) {
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    const percent = target > 0 ? Math.max(0, Math.min(100, 100 * safeValue / target)) : 0;
    return `<div>${escape(label)} <strong>${number(value)} / ${number(target)}</strong></div><div class="progress" role="progressbar" aria-label="${escape(label)}" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></div>`;
  }
  function renderDashboard(input) {
    const d = input && input.schemaVersion === 1 ? input : {};
    const p = d.protocol || {}, promotion = d.promotion || {}, ledger = d.ledger || {}, data = d.data || {}, daily = d.daily || {};
    const minEvents = promotion.minimumSettledEvents || (p.promotion || {}).minimumSettledEvents || 500;
    const minDays = promotion.minimumCalendarDays || (p.promotion || {}).minimumCalendarDays || 90;
    const sources = array((d.sources || {}).results);
    const prospective = array(ledger.byModel);
    const tournament = d.sportsTournament || {};
    const comparisons = array(tournament.comparisons).length ? tournament.comparisons : array(tournament.tournaments).flatMap(group => array(group.comparisons).map(row => ({ ...row, sourceId: group.sourceId })));
    const returns = array(tournament.returns).length ? tournament.returns : array(tournament.tournaments).flatMap(group => array(group.returns).map(row => ({ ...row, sourceId: group.sourceId })));
    let html = `<section><div class="section-head"><div><span class="status">纸面研究</span><h2>前瞻证据进度</h2><p class="note">快照时间（北京时间）：${date(d.generatedAt)} · ${escape(p.protocolId || '尚未建立研究快照')}</p></div><button type="button" id="refresh-research">重新读取快照</button></div><div class="stats">${stat(data.historyCount, '历史赛果记录')}${stat(data.fixtureCount, '赛程与状态记录')}${stat(ledger.predictionCount, '赛前预测档案（按模型）')}${stat(ledger.settledPaperCount, '核验规则纸面结算（按模型）')}</div><div class="split"><div>${progress(promotion.settledEvents, minEvents, '独立已结算赛事')}${progress(promotion.calendarDays, minDays, '前瞻观察天数')}</div><div><strong>${promotion.eligible === true ? '到达人工评审条件' : promotion.locked === true ? '固定观察期评审已锁定' : '正在积累前瞻证据'}</strong><p class="note">样本门槛之外，还需同时检验相对市场的概率改进、收益下界与多模型比较。达到样本门槛不会自动证明盈利。</p>${promotionExplanation(promotion)}</div></div></section>`;
    html += `<section><h2>来源与采集状态</h2><p class="note">成功时间与失败记录共同保留；历史缓存不代表当前可用。不同来源分别研究。</p>${sources.length ? table(['来源', '状态', '历史 / 赛程', '采集时间（北京）', '说明'], sources.map(source => [`<span class="source-id">${escape(source.sourceId)}</span>`, `<span class="status ${['ok', 'success', 'fresh'].includes(source.status) ? '' : 'warn'}">${escape(statusNames[source.status] || source.status || '未知')}</span>`, `${number(source.recordCount == null ? source.records : source.recordCount)} / ${number(source.fixtureCount == null ? source.fixtures : source.fixtureCount)}`, date(source.fetchedAt || source.lastSuccessAt), `<span class="error">${escape(source.error || source.message || '')}</span>`])) : empty('首次采集尚未完成；不会用演示数据填充研究记录。')}<p class="note">本次新增：${number(daily.createdPredictions)} 条预测 · ${number(daily.createdResults)} 条赛果 · ${number(daily.createdSettlements)} 条结算。</p></section>`;
    html += ruleWatchSection(d.ruleWatch);
    html += `<section><h2>赛前登记 · 赛后评分</h2><p class="note">主胜 / 平局 / 客胜为模型概率。只有开赛前已保存的预测进入此前瞻档案。概率评分与纸面净额分别展示，概率改善不等于净盈利。</p><p class="note">数学假设下已结算 ${number(ledger.assumedPaperCount)} 条，假设净额 ${ledger.assumedPaperCount > 0 ? number((ledger.assumedPaperTotals || {}).profit, 2) : '尚未结算'} 元；适用规则已核验的纸面结算 ${number(ledger.settledPaperCount)} 条。两类均无真实下单或可兑奖收益。</p>${prospective.length ? table(['模型', '预测 / 已评分', '概率：对数损失 ↓', '概率：Brier ↓', '核验规则纸面净额', '数学假设纸面净额 / 条数', '待完成'], prospective.map(row => { const scores = row.properScores || {}, paper = row.paper || {}, assumed = row.assumedPaper || {}; return [model(row.modelId), `${number(row.predictionCount)} / ${number(row.scoredCount)}`, scores.logLossStatus === 'infinite' ? '∞（实际结果被赋零概率）' : number(scores.meanLogLoss, 4), number(scores.meanBrier, 4), row.settledPaperCount > 0 ? number(paper.profit, 2) : '尚未结算', `${row.assumedPaperCount > 0 ? number(assumed.profit, 2) : '尚未结算'} / ${number(row.assumedPaperCount)}`, number(row.pendingCount)]; })) : empty('尚无已登记的赛前预测。历史比赛不会补写成前瞻预测。')}`;
    const predictions = array(d.recentPredictions).slice(0, 20);
    if (predictions.length) html += `<h3>近期赛前档案</h3>${table(['赛事 / 来源', '开赛时间（北京）', '模型', '主 / 平 / 客', '登记时间（北京）'], predictions.map(record => { const payload = record.payload || {}, match = payload.match || {}, prediction = payload.prediction || {}; return [`${escape(match.homeTeam)} — ${escape(match.awayTeam)}<br><span class="muted">${escape((payload.source || {}).sourceId)}</span>`, date(match.kickoffAt), model(prediction.modelId), `<span class="probability">${array(prediction.probabilities).map(q => typeof q === 'number' && Number.isFinite(q) ? number(q * 100, 1) + '%' : '—').join(' / ')}</span>`, date(record.recordedAt)]; }))}`;
    const settlements = array(d.recentSettlements).slice(0, 10);
    if (settlements.length) html += `<h3>近期评分与结算</h3>${table(['登记时间（北京）', '状态', '赛果', '对数损失', '纸面净收益'], settlements.map(record => { const row = record.payload || {}, scoring = row.scoring || {}; return [date(record.recordedAt), escape(statusNames[row.status] || row.status), escape({ H: '主胜', D: '平局', A: '客胜' }[scoring.outcome] || '—'), scoring.logLossStatus === 'infinite' ? '∞' : number(scoring.logLoss, 4), row.paper ? number(row.paper.profit, 2) : '规则未满足或未投注']; }))}`;
    html += '</section>';
    html += `<section><span class="status warn">历史探索 · 非前瞻证据</span><h2>概率质量：模型与基线的配对比较</h2><p class="note">正差值表示候选模型优于基线；区间采用报告中预先指定的多重比较修正。对数损失及 Brier 分数衡量概率质量，不等同于投注收益。</p>${comparisons.length ? table(['来源', '候选 / 基线', '概率指标', '同场样本', '平均改进', '修正区间'], comparisons.map(row => [`<span class="source-id">${escape(row.sourceId || '报告来源')}</span>`, `${model(row.candidate)} / ${model(row.baseline)}`, escape(row.metric === 'logLoss' ? '对数损失' : row.metric === 'brier' ? 'Brier' : row.metric), number(row.matchedEvents), number((row.uncertainty || {}).meanDifference, 4), interval((row.uncertainty || {}).interval)])) : empty('历史模型比较尚未生成，或没有足够的同场样本。')}</section>`;
    html += `<section><span class="status warn">历史纸面模拟 · 非实际收益</span><h2>收益质量：选注决策与保留预算</h2><p class="note">每个模型分别比较每场选最高概率、仅在预期回报严格大于阈值时选注两种策略。每场预留 1 单位预算，未选注的预算保留为现金，收益按 0 计。</p><p class="note">固定赔率数学假设按所报十进制赔率计算纸面净额，尚不代表官方规则核验；没有真实下单、成交、兑奖证据，也未计入手续费、税、赔率变动、作废与限额。缺少赔率或适用假设的记录不会填入收益。</p><p class="note">净额是总和；区间按比赛日等权汇总并作多重比较修正。净收益区间检验是否优于持有现金；随机和市场对照仅用策略实际选注的同场、同预算记录；全预算随机对照另行展示。优于随机仍可能亏损。</p>${returns.length ? table(['来源 / 模型', '决策策略', '可比较 / 不选注场次', '模拟投入 / 预留预算', '策略净额', '同场随机 / 市场净额', '净收益区间', '相对同场随机区间', '相对同场市场区间', '相对全预算随机区间', '收益证据'], returnRows(returns)) : empty('尚无符合已声明结算条件的收益比较。')}</section>`;
    const games = array((d.numberTournament || {}).reports);
    html += `<section><span class="status warn">同预算 · 历史奖金情景</span><h2>数字彩策略实验</h2><p class="note">均匀选号、冷热收缩与组合覆盖使用相同预算及固定随机种子。历史差异需要通过修正区间检验；选号评分不会改变公平独立开奖下单注的先验概率。</p>${games.length ? games.map(game => `<h3>${game.gameId === 'ssq' ? '双色球' : game.gameId === 'dlt' ? '大乐透' : escape(game.gameId)}</h3>${table(['策略', '净收益差值（每期）', '多重比较修正区间'], array(game.reports).map(row => { const comparison = row.familyAdjustedNetDifference || {}; return [model(row.strategyId), number(comparison.meanDifference, 4), interval(comparison.interval)]; }))}`).join('') : empty('数字彩同预算实验报告尚未生成。')}</section>`;
    return html;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderDashboard, escape };
  if (scope.document) {
    const root = scope.document.getElementById('research-root');
    if (root) { root.innerHTML = renderDashboard(scope.RESEARCH_DASHBOARD); const button = scope.document.getElementById('refresh-research'); if (button) button.addEventListener('click', () => scope.location.reload()); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
