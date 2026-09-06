(function (scope) {
  'use strict';
  const names = { uniform: '均匀随机', frequency_shrink: '频率收缩', recency_shrink: '近期收缩', omission_reversal: '遗漏反转', transition_shrink: '转移收缩', mixture: '混合模型', coverage: '组合覆盖' };
  const descriptions = {
    uniform: '所有合法完整组合等概率。它同时是每个模型必须面对的同成本基线。',
    frequency_shrink: '从此前已公布的历史开奖估计频率，并向均匀先验收缩，限制有限样本的偶然波动。',
    recency_shrink: '对较近的历史观察赋予更高权重，再向均匀先验收缩。时间变化假设由向前回测检验。',
    omission_reversal: '将遗漏与反转作为待检验的模型假设；参数固定，不能把遗漏期数解释成必然补出的规律。',
    transition_shrink: '根据此前开奖构造条件转移估计，并进行收缩。只使用目标时间之前可获得的观察。',
    mixture: '在完整组合概率空间混合候选模型，使用引擎固定的模型参数与权重。',
    coverage: '在相同注数下减少票组重叠，优化组合覆盖。它改变票组结构，单注均匀开奖概率保持不变。'
  };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const array = value => Array.isArray(value) ? value : [];
  const number = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
  const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未提供';
  const scientific = value => Number.isFinite(value) ? value.toExponential(7) : '—';
  const empty = message => `<p class="empty">${escape(message)}</p>`;
  const detail = (title, value) => `<details><summary>${escape(title)}</summary><pre>${escape(JSON.stringify(value || {}, null, 2))}</pre></details>`;
  const stat = (value, label) => `<div class="stat"><strong>${escape(value)}</strong><span>${escape(label)}</span></div>`;
  const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(v => `<th>${escape(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  function inputNumber(value, label, min, max, integer) {
    if (value === '' || value == null || (typeof value !== 'string' && typeof value !== 'number')) throw new Error(`${label}不能为空。`);
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`${label}须为 ${min} 至 ${max} 的${integer ? '整数' : '数值'}。`);
    return n;
  }
  function validateSelection(input) {
    if (!input || !['ssq', 'dlt'].includes(input.gameId)) throw new Error('彩种无效。');
    if (!Object.prototype.hasOwnProperty.call(names, input.modelId)) throw new Error('模型无效。');
    const count = inputNumber(input.count, '注数', 1, 100, true);
    const budget = inputNumber(input.budget, '预算', 2, 100000, false);
    const seed = inputNumber(input.seed, '种子', 0, 4294967295, true);
    const additional = input.gameId === 'dlt' && (input.additional === true || input.additional === 'true');
    const unitCost = additional ? 3 : 2;
    if (count * unitCost > budget) throw new Error(`预算不足：${count} 注需要 ${count * unitCost} 元。请调整注数或预算。`);
    return { gameId: input.gameId, modelId: input.modelId, count, budget, seed, additional, unitCost, costYuan: count * unitCost };
  }
  // Exploration is a read-only calculation. It must not depend on whether the
  // local ledger is currently open for a formal prospective registration.
  // Keeping this gate separate also means a public snapshot can remain useful
  // after registration has closed, while the registration button stays
  // correctly disabled.
  function explorationReadiness(game, now) {
    const draws = array(game && game.draws);
    if (!draws.length) return { ready: false, prospective: false, reason: '缺少历史开奖记录，暂不能生成研究组合。' };
    const latest = draws.reduce((a, b) => Date.parse(a.drawAt || a.date) > Date.parse(b.drawAt || b.date) ? a : b);
    const target = game && game.nextIssue;
    let targetProblem = '';
    if (!target || typeof target.issue !== 'string' || !target.issue.trim() || !Number.isFinite(Date.parse(target.drawAt))) targetProblem = '缺少来源确认的未来目标期';
    else if (Date.parse(target.drawAt) <= now) targetProblem = '目标期已过预计开奖时间';
    else if (target.salesCloseAt && (!Number.isFinite(Date.parse(target.salesCloseAt)) || Date.parse(target.salesCloseAt) <= now)) targetProblem = '目标期销售已截止';
    else if (!target.source) targetProblem = '目标期缺少来源凭据';
    else {
      const fetchedAt = Date.parse(target.source.fetchedAt);
      const sourceAge = now - fetchedAt;
      if (!Number.isFinite(fetchedAt) || sourceAge < 0 || sourceAge > 24 * 60 * 60 * 1000) targetProblem = '目标期来源时间无效或已超过 24 小时';
    }
    if (!targetProblem) return { ready: true, prospective: true, target, reason: '目标期有效，可生成本期探索组合；生成只读，不会自动登记。' };
    return {
      ready: true,
      prospective: false,
      target: { issue: null, drawAt: null, snapshotAfterIssue: latest.issue || null, unavailableTargetIssue: target && target.issue || null },
      reason: `${targetProblem}。仍可基于截至 ${latest.issue || '最近一期'} 的历史快照生成无目标期探索组合；该结果不能登记或作为赛前预测。`
    };
  }
  function issueReadiness(game, now) {
    const exploration = explorationReadiness(game, now);
    if (!exploration.ready) return exploration;
    if (!exploration.prospective) return { ready: false, reason: `正式登记需要来源有效且尚未截止的未来目标期。${exploration.reason}` };
    const registration = game.registration;
    if (!registration || registration.eligible !== true) return { ready: false, reason: registration && registration.reason || '服务端尚未确认本期来源与登记条件，请更新数字彩数据。' };
    if (!Number.isFinite(Date.parse(registration.cutoff)) || Date.parse(registration.cutoff) <= now) return { ready: false, reason: '本期研究登记窗口已关闭，请更新数据。' };
    return exploration;
  }
  function generateSelection(models, game, input, now = Date.now()) {
    const selection = validateSelection(input);
    const readiness = explorationReadiness(game, now);
    if (!readiness.ready) throw new Error(readiness.reason);
    if (!models || typeof models.generate !== 'function' || typeof models.logProbability !== 'function') throw new Error('概率引擎未加载，请检查本机资源并刷新。');
    const asOf = new Date(now).toISOString();
    const generated = models.generate({ gameId: selection.gameId, modelId: selection.modelId, history: game.draws, asOf, count: selection.count, seed: selection.seed });
    if (!generated || !Array.isArray(generated.tickets) || generated.tickets.length !== selection.count) throw new Error('引擎返回的组合数量与请求不一致。');
    const uniformModel = models.fit({ gameId: selection.gameId, modelId: 'uniform', history: game.draws, asOf });
    const tickets = generated.tickets.map(ticket => {
      const logProbability = models.logProbability(generated.model, ticket);
      const baselineLogProbability = models.logProbability(uniformModel, ticket);
      if (!Number.isFinite(logProbability) || !Number.isFinite(baselineLogProbability) || logProbability > 0 || baselineLogProbability > 0) throw new Error('模型返回了无效的完整组合概率。');
      return { main: ticket.main, special: ticket.special, logProbability, probability: Math.exp(logProbability), baselineProbability: Math.exp(baselineLogProbability), probabilityRatio: Math.exp(logProbability - baselineLogProbability) };
    });
    return { schemaVersion: 1, purpose: readiness.prospective ? 'prospective_exploratory_paper_only' : 'historical_snapshot_exploration_only', prospectiveTarget: readiness.prospective, generatedAt: asOf, target: readiness.target, readinessNote: readiness.reason, selection, model: generated.model, portfolio: { ...generated.portfolio, costYuan: selection.costYuan, additional: selection.additional }, tickets };
  }
  function csv(result) {
    const quote = value => { let text = String(value == null ? '' : value); if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text; return `"${text.replace(/"/g, '""')}"`; };
    const cells = ['game', 'issue', 'model', 'seed', 'main', 'special', 'unitCostYuan', 'probability', 'logProbability', 'uniformProbability', 'purpose'];
    const rows = result.tickets.map(ticket => [result.selection.gameId, result.target.issue, result.selection.modelId, result.selection.seed, ticket.main.join(' '), ticket.special.join(' '), result.selection.unitCost, ticket.probability, ticket.logProbability, ticket.baselineProbability, result.purpose]);
    return '\uFEFF' + [cells, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
  }
  function renderTickets(result) {
    const balls = (values, special) => values.map(v => `<span class="ball${special ? ' special' : ''}">${escape(String(v).padStart(2, '0'))}</span>`).join('');
    const targetLabel = result.prospectiveTarget ? `第 ${escape(result.target.issue)} 期` : `历史快照探索（最近开奖 ${escape(result.target.snapshotAfterIssue || '未标注')}）`;
    return `<p class="note">${targetLabel} · ${escape(names[result.selection.modelId])} · ${result.selection.count} 注 / ${result.selection.costYuan} 元 · 探索性纸面组合</p><p class="notice">${escape(result.readinessNote)}</p>` + table(['组合', '模型完整概率 / 对数概率', '均匀基线 / 概率比'], result.tickets.map(ticket => [`<div class="balls">${balls(ticket.main, false)}<span class="plus">+</span>${balls(ticket.special, true)}</div>`, `${scientific(ticket.probability)}<small>log P = ${number(ticket.logProbability, 10)}</small>`, `${scientific(ticket.baselineProbability)}<small>${number(ticket.probabilityRatio, 4)} 倍 · 模型估计比</small>`])) + `<p class="note">概率比表示模型相对均匀先验的估计差异，不能单独证明实际命中率或收益提升。</p>` + detail('查看训练参数、时间截断与组合目标', { targetMode: result.prospectiveTarget ? 'prospective' : 'historical_snapshot', model: result.model, portfolio: result.portfolio });
  }

  function mount(document, environment = scope) {
    const get = id => document.getElementById(id);
    let dashboard = environment.NUMBER_DASHBOARD || {};
    let gameId = 'ssq';
    let result = null;
    let registering = false;
    let refreshState = 'snapshot';
    let refreshMessage = '';
    const canRegister = () => !environment.NUMBER_APP_OFFLINE && environment.location && /^https?:$/.test(environment.location.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(environment.location.hostname);
    const game = () => (dashboard.games || {})[gameId] || {};
    const message = (id, value, error = false) => { get(id).textContent = value; get(id).className = `status-line${error ? ' error' : ''}`; };
    const invalidate = () => { result = null; get('generated').innerHTML = ''; get('export-json').disabled = true; get('export-csv').disabled = true; message('generation-status', '参数变更后请重新生成，旧导出已失效。'); };
    function renderEvidence() {
      const summary = game().ledgerSummary || {};
      const ledgerRows = Array.isArray(summary.byModel) ? summary.byModel : Object.values(summary.byModel || {});
      get('ledger-summary').innerHTML = `<div class="stats">${stat(number(summary.batchCount), '登记期次')}${stat(number(summary.settledCount), '已结算期次')}${stat(number(summary.pendingCount), '待结算期次')}</div><p class="note">共 ${number(summary.predictionCount)} 个模型票组。</p>` + (ledgerRows.length ? table(['模型', '已结算 / 待结算', '已结算净额 / 元'], ledgerRows.map(row => [escape(names[row.modelId] || row.modelId || '未知'), `${number(row.settledCount)} / ${number(row.pendingCount)}`, row.settledCount > 0 ? number(row.settledNetYuan, 2) : '—'])) : empty('本彩种还没有开奖前锁定的模型记录。')) + `<p class="note">按公告奖表纸面核算，未重新分配奖池且未扣税。已结算净额不包含待结算记录，不代表实际可兑奖收益。</p>` + detail('查看本彩种登记与结算明细', summary);
      const report = game().report || {};
      const rows = array(report.byModel || report.models || report.comparisons || report.reports);
      get('evaluation-summary').innerHTML = rows.length ? table(['模型', '奖金完整配对期数', '全窗口净额 / 元', '平均净收益差 / 元', 'log E / 分布检验', '收益优势结论'], rows.map(row => [escape(names[row.modelId || row.strategyId] || row.modelId || row.strategyId || '未知'), number(row.actualPrizeSamples), number(row.netYuan, 2), number(row.meanNetDifference, 3), number(row.logE, 3), row.decision === 'not_proven' ? '尚未证明' : '待复核'])) : empty('尚无可展示的完整收益比较。采集逐期奖金后，使用统一预算进行向前评估。');
      get('evaluation-summary').innerHTML += `<p class="note">按公告奖表纸面核算，未重新分配奖池且未扣税。全窗口净额包含全部期次成本；奖金未知时显示 —。log E 检验模型对开奖分布的解释，不是收益证据。</p>` + detail('完整评估与收益优势判定', { report, evaluation: dashboard.evaluation || {}, status: dashboard.status });
    }
    function render() {
      const current = game();
      const draws = array(current.draws);
      const latest = draws.length ? draws.reduce((a, b) => Date.parse(a.drawAt || a.date) > Date.parse(b.drawAt || b.date) ? a : b) : null;
      const exploration = explorationReadiness(current, Date.now());
      const registration = issueReadiness(current, Date.now());
      get('game-heading').textContent = gameId === 'ssq' ? '双色球' : '大乐透';
      for (const id of ['ssq', 'dlt']) get(`game-${id}`).setAttribute('aria-selected', String(gameId === id));
      get('additional-control').hidden = gameId !== 'dlt';
      const registrationMessage = registration.ready ? '本机已满足正式登记条件。' : `正式登记：${registration.reason}`;
      get('data-summary').innerHTML = `<div class="stats">${stat(number(draws.length), '历史记录')}${stat(latest ? latest.issue : '—', '最近开奖期号')}${stat(current.nextIssue ? current.nextIssue.issue : '—', '数据中的目标期')}</div><p class="note">目标开奖（北京）：${escape(date(current.nextIssue && current.nextIssue.drawAt))}<br>研究登记截止：${escape(date(current.registration && current.registration.cutoff))}（仅影响正式登记）<br>官方销售截止：${escape(date(current.nextIssue && current.nextIssue.salesCloseAt))}</p><p class="notice">${escape(exploration.reason)}</p><p class="note">${escape(registrationMessage)}</p>`;
      get('source-details').innerHTML = `<p class="note">最近开奖日期：${escape(latest && latest.date || '未提供')}<br>本期来源时效：${current.registration?.sourceFresh === true ? '服务端已确认' : '待确认'}</p>` + detail('数据来源记录', { sourceStatus: current.sourceStatus || '未提供', nextIssue: current.nextIssue || null, sources: dashboard.sources || [] });
      get('model-description').textContent = descriptions[get('model').value] || '';
      get('generate').textContent = exploration.prospective ? '生成本期探索组合' : '生成历史快照探索组合';
      get('generate').disabled = !exploration.ready || refreshState === 'loading';
      const local = canRegister();
      get('register').disabled = registering || !registration.ready || !local || refreshState === 'loading';
      if (!local) message('registration-status', '当前为只读快照。请运行 npm run serve，并在 http://127.0.0.1:8080/index.html 登记实验。');
      const protocol = dashboard.protocol || {};
      get('protocol-summary').textContent = `协议：${protocol.protocolId || protocol.id || '等待载入'} · 固定每模型 ${number(protocol.ticketCount)} 注 / ${number(protocol.costYuan)} 元（基本投注）。`;
      get('global-status').textContent = refreshState === 'live' ? '已读取本机最新数据' : refreshState === 'loading' ? '正在核对本机最新数据' : refreshState === 'failed' ? '本机刷新失败 · 保留快照' : dashboard.generatedAt ? '已载入研究快照' : '等待数字彩数据';
      message('data-refresh-status', refreshMessage, refreshState === 'failed');
      get('snapshot-footer').textContent = `快照时间（北京）：${date(dashboard.generatedAt)}。离线页面展示构建时数据；本机服务提供最新登记与结算记录。`;
      renderEvidence();
    }
    for (const id of ['ssq', 'dlt']) get(`game-${id}`).addEventListener('click', () => { gameId = id; invalidate(); message('registration-status', ''); render(); });
    for (const id of ['model', 'count', 'budget', 'seed', 'additional']) {
      get(id).addEventListener('input', () => { invalidate(); get('model-description').textContent = descriptions[get('model').value] || ''; });
      get(id).addEventListener('change', () => { invalidate(); get('model-description').textContent = descriptions[get('model').value] || ''; });
    }
    get('generate').addEventListener('click', () => {
      if (refreshState === 'loading') { message('generation-status', '正在核对本机最新数据，请稍候。'); return; }
      invalidate();
      try {
        result = generateSelection(environment.NumberModels, game(), { gameId, modelId: get('model').value, count: get('count').value, budget: get('budget').value, seed: get('seed').value, additional: get('additional').value });
        get('generated').innerHTML = renderTickets(result);
        get('export-json').disabled = false; get('export-csv').disabled = false;
        message('generation-status', result.prospectiveTarget ? `已生成 ${result.selection.count} 注可复现组合。种子 ${result.selection.seed}，尚未登记为前瞻实验。` : `已生成 ${result.selection.count} 注历史快照探索组合。种子 ${result.selection.seed}；没有有效未来目标期，不能登记为赛前预测。`);
      } catch (error) { result = null; message('generation-status', error.message, true); }
    });
    function download(kind) {
      if (!result) return;
      if (!explorationReadiness(game(), Date.now()).ready) { invalidate(); message('generation-status', '历史开奖数据已不可用，请更新数据后重新生成。', true); return; }
      const content = kind === 'json' ? JSON.stringify(result, null, 2) : csv(result);
      const blob = new environment.Blob([content], { type: kind === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
      const url = environment.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const targetName = result.prospectiveTarget ? result.target.issue : `snapshot-after-${result.target.snapshotAfterIssue || 'latest'}`;
      link.href = url; link.download = `number-${gameId}-${String(targetName).replace(/[^a-zA-Z0-9_-]/g, '')}-exploratory.${kind}`;
      document.body.appendChild(link); link.click(); link.remove();
      environment.setTimeout(() => environment.URL.revokeObjectURL(url), 1000);
    }
    get('export-json').addEventListener('click', () => download('json'));
    get('export-csv').addEventListener('click', () => download('csv'));
    get('register').addEventListener('click', async () => {
      if (registering) return;
      if (refreshState === 'loading') { message('registration-status', '正在核对本机最新数据，请稍候。'); return; }
      const ready = issueReadiness(game(), Date.now());
      if (!ready.ready) { message('registration-status', ready.reason, true); return; }
      if (!canRegister()) { message('registration-status', '只读页面不能登记，请打开本机服务。', true); return; }
      const selectedGame = gameId;
      registering = true; get('register').disabled = true; message('registration-status', '正在保存固定协议的全模型记录…');
      try {
        const response = await environment.fetch('/api/numbers/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: selectedGame }) });
        const payload = await response.json();
        if (!response.ok || payload.error || payload.ok === false) throw new Error(payload.error?.message || payload.error || '本机服务未完成登记。');
        const refreshed = await environment.fetch('/api/numbers/dashboard', { cache: 'no-store' });
        if (!refreshed.ok) throw new Error('登记请求已完成，但读取最新快照失败；请刷新查看，勿把此状态视为未登记。');
        const next = await refreshed.json();
        if (!next || typeof next.games !== 'object' || !next.games || Array.isArray(next.games)) throw new Error('本机快照格式无效，已保留当前记录。');
        dashboard = next;
        refreshState = 'live'; refreshMessage = '已从本机服务读取最新资格与台账。';
        invalidate(); render();
        message('registration-status', `${selectedGame === 'ssq' ? '双色球' : '大乐透'}登记请求完成，已读取最新台账。相同期次重复请求不会追加相同实验。`);
      } catch (error) { message('registration-status', error.message || '登记失败，请检查本机服务后重试。', true); }
      finally { registering = false; render(); }
    });
    render();
    const ready = canRegister() ? (async () => {
      refreshState = 'loading'; refreshMessage = '当前显示已保存快照，正在读取本机最新资格与台账。'; render();
      try {
        const response = await environment.fetch('/api/numbers/dashboard', { cache: 'no-store' });
        if (!response.ok) throw new Error(`本机服务返回 ${response.status || '失败状态'}`);
        const next = await response.json();
        if (!next || typeof next.games !== 'object' || !next.games || Array.isArray(next.games)) throw new Error('本机快照格式无效');
        dashboard = next; result = null;
        refreshState = 'live'; refreshMessage = '已从本机服务读取最新资格与台账。';
      } catch (error) {
        refreshState = 'failed'; refreshMessage = `本机数据源刷新失败：${error.message || '无法连接服务'}。已保留原快照，未视为最新数据。`;
      }
      render();
    })() : Promise.resolve();
    return { render, ready, getResult: () => result, getDashboard: () => dashboard };
  }
  const api = { names, descriptions, escape, validateSelection, explorationReadiness, issueReadiness, generateSelection, csv, renderTickets, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { scope.NumberApp = api; if (scope.document) mount(scope.document, scope); }
})(typeof window !== 'undefined' ? window : globalThis);
