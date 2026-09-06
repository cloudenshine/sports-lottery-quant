(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number.isFinite(value) ? value.toFixed(2) : '待核验';
  function values(text) {
    const parts = String(text).trim().split(/[,，\s]+/);
    if (!parts.length || parts.some(x => !x || !Number.isFinite(Number(x)))) throw new Error('请输入用逗号分隔的数字');
    return parts.map(Number);
  }
  function sportsInput(record, fields) {
    const p = record && record.payload;
    return {
      market: fields.market, probabilities: values(fields.probabilities), odds: values(fields.odds),
      budgetYuan: Number(fields.budget), stakeUnitYuan: 2,
      probabilityLowerBounds: String(fields.lower || '').trim() ? values(fields.lower) : undefined,
      source: p ? p.source : { sourceId: 'manual-unverified' },
      kickoffAt: p && p.match.kickoffAt, oddsObservedAt: p && p.oddsObservedAt,
      calibrated: false, officialSale: null, settlementRuleVerified: false,
      maxKellyFraction: 0.05
    };
  }
  function sportsResult(result) {
    const proof = result.expectationProof, candidate = proof.candidate;
    return `<h3>${escape(result.renderable.headline)}</h3><p>当前决策金额：${money(result.risk.selectedStakeYuan)} 元；保留现金：${money(result.risk.heldCashYuan)} 元。</p>
      <div class="rw-scroll"><table><thead><tr><th>输入成立时的比较</th><th>金额</th><th>模型期望净收益</th></tr></thead><tbody>
      <tr><td>候选方案（尚待验证）</td><td>${money(candidate.stakeYuan)}</td><td>${money(candidate.expectedNetYuan)}</td></tr>
      <tr><td>同投入随机</td><td>${money(result.baseline.sameExposure.stakeYuan)}</td><td>${money(result.baseline.sameExposure.expectedNetYuan)}</td></tr>
      <tr><td>全预算随机</td><td>${money(result.baseline.fullBudget.stakeYuan)}</td><td>${money(result.baseline.fullBudget.expectedNetYuan)}</td></tr>
      </tbody></table></div><p>同投入差额 ${money(proof.improvementAtSameExposureYuan)} 元。这是输入概率下的期望计算，尚非已结算收益。</p>
      <p>${result.reasons.map(escape).join('；')}</p>`;
  }
  function crowdResult(game) {
    const e = game.evaluation;
    return `<p><strong>${e.status === 'unsupported' ? '留出检验未优于基线' : '发现探索性信号，仍待前瞻验证'}</strong> · ${e.model.count} 期逐期向前检验</p>
      <p>平均偏差：模型 ${money(e.model.meanDeviance)}，销量基线 ${money(e.salesOnlyBaseline.meanDeviance)}（越低越好）；改善 ${money(e.improvement.meanDeviance)}。</p>
      <p>训练使用 ${game.model.trainingCount} 期真实一等奖注数与销量。权重由数据拟合；每注公平头奖概率保持为 1 / ${Math.round(1 / root.NumberCrowdModel.headProbabilityUniform(game.model.gameId)).toLocaleString('zh-CN')}。</p>`;
  }
  function mountSports(host) {
    const records = (root.RESEARCH_DASHBOARD && root.RESEARCH_DASHBOARD.recentPredictions || []).filter(r => r.payload && r.payload.match && r.payload.match.odds && r.payload.prediction);
    host.innerHTML = `<h2>收益决策工作台</h2><p>以概率与可买入赔率估算收益，并与同投入随机比较。真实赛前记录可导入；当前概率仍在验证中。</p>
      <div class="rw-controls"><label>赛前研究记录<select data-rw="record"><option value="">手动输入假设</option>${records.map((r,i) => `<option value="${i}">${escape(r.payload.match.homeTeam)} — ${escape(r.payload.match.awayTeam)} · ${escape(r.payload.prediction.modelId)}</option>`).join('')}</select></label>
      <label>市场<select data-rw="market"><option value="jingcai">竞彩足球</option><option value="lancai">竞彩篮球</option><option value="sfc">胜负彩（浮动奖金）</option><option value="beidan">北单（浮动奖金）</option></select></label>
      <label>各结果概率（总和为 1）<input data-rw="probabilities" value="0.5, 0.3, 0.2"></label>
      <label>对应十进制赔率<input data-rw="odds" value="1.8, 3.2, 4.5"></label>
      <label>经验证的概率下界（可留空）<input data-rw="lower" placeholder="留空表示未知"></label>
      <label>研究预算（元）<input data-rw="budget" type="number" min="2" max="20000" step="2" value="200"></label></div>
      <button type="button" data-rw="calculate">计算收益与现金决策</button><p data-rw="provenance"></p><div data-rw="result" role="status" aria-live="polite"></div>`;
    const el = name => host.querySelector(`[data-rw="${name}"]`);
    function calculate() {
      try {
        const record = el('record').value === '' ? null : records[Number(el('record').value)];
        const fields = Object.fromEntries(['market','probabilities','odds','lower','budget'].map(k => [k, el(k).value]));
        const result = root.SportsReturnPolicy.evaluateDecision(sportsInput(record, fields));
        el('result').innerHTML = sportsResult(result);
      } catch (error) { el('result').textContent = '无法计算：' + error.message; }
    }
    el('record').addEventListener('change', () => {
      const record = el('record').value === '' ? null : records[Number(el('record').value)];
      if (record) {
        const p = record.payload;
        el('probabilities').value = p.prediction.probabilities.join(', ');
        el('odds').value = ['home','draw','away'].map(k => p.match.odds[k]).join(', ');
        el('market').value = 'jingcai'; el('lower').value = '';
        el('provenance').textContent = `记录 ${record.id}；报价捕获 ${p.oddsObservedAt}；开赛 ${p.match.kickoffAt}。编辑后仅作为假设计算。`;
      } else el('provenance').textContent = '手动假设：未验证概率、报价或销售状态。';
      calculate();
    });
    el('calculate').addEventListener('click', calculate);
    for (const name of ['market','probabilities','odds','lower','budget']) {
      el(name).addEventListener('input', () => { el('result').textContent = '输入已变更，请重新计算。'; });
    }
    calculate();
  }
  function mountNumbers(host) {
    host.innerHTML = `<h2>分奖收益研究</h2><p>研究“中奖后与多少注共同分奖”，用销量和真实一等奖注数拟合投注偏好。分奖比例是数学代理量，还需核对奖池、封顶和实际奖金。</p>
      <div class="rw-controls"><label>研究彩种<select data-rw="crowd-game"><option value="ssq">双色球</option><option value="dlt">大乐透</option></select></label><label>可复现种子<input data-rw="crowd-seed" type="number" min="0" max="4294967295" value="0"></label></div>
      <div data-rw="crowd-evidence"></div><button type="button" data-rw="crowd-generate">生成 5 注分奖研究组合 · 10 元</button><div data-rw="crowd-result" role="status" aria-live="polite"></div><p>此探索独立于已冻结的七模型实验，不会替换已登记组合。</p>`;
    const el = name => host.querySelector(`[data-rw="${name}"]`);
    function selected() { return root.NUMBER_CROWD_REPORT && root.NUMBER_CROWD_REPORT.games[el('crowd-game').value]; }
    function refresh() {
      const game = selected();
      el('crowd-evidence').innerHTML = game ? crowdResult(game) + `<p>报告生成：${escape(root.NUMBER_CROWD_REPORT.generatedAt)}</p>` : '<p>缺少已验证来源的研究报告。</p>';
      el('crowd-generate').disabled = !game;
      el('crowd-result').textContent = '';
    }
    el('crowd-game').addEventListener('change', refresh);
    el('crowd-seed').addEventListener('input', () => { el('crowd-result').textContent = '种子已变更，请重新生成。'; });
    el('crowd-generate').addEventListener('click', () => {
      try {
        const game = selected(), result = root.NumberCrowdModel.createPortfolio({model:game.model, count:5, budgetYuan:10, seed:Number(el('crowd-seed').value)});
        el('crowd-result').innerHTML = '<p>探索组合，无可靠收益优势结论。以下比例仅在泊松分奖假设下成立。</p><ol>' + result.tickets.map(row => `<li><strong>${escape(row.ticket.main.join(' '))} + ${escape(row.ticket.special.join(' '))}</strong> · 预计共同中奖注数 ${money(row.predictedCoWinners)} · 条件分奖比例 ${(100 * row.expectedShare).toFixed(1)}%</li>`).join('') + '</ol>';
      } catch (error) { el('crowd-result').textContent = '无法生成：' + error.message; }
    });
    refresh();
  }
  function mount() {
    const hosts = root.document.querySelectorAll('[data-returns-workbench]');
    if (!hosts.length) return;
    const style = root.document.createElement('style');
    style.textContent = '.returns-workbench{padding:24px;margin:20px auto;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#172c34;max-width:1240px;box-sizing:border-box}.returns-workbench h2{margin:0 0 12px}.returns-workbench p{line-height:1.65;margin:12px 0}.rw-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:16px 0}.rw-controls label{display:grid;gap:6px;min-width:0}.rw-controls input,.rw-controls select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #94a3b8;border-radius:7px;background:#fff;color:#172c34}.returns-workbench button{border:0;border-radius:8px;padding:12px 16px;background:#166c65;color:#fff;cursor:pointer}.returns-workbench table{width:100%;border-collapse:collapse}.returns-workbench td,.returns-workbench th{padding:10px;text-align:left;border-bottom:1px solid #cbd5e1;white-space:nowrap}.rw-scroll{overflow:auto}.returns-workbench li{line-height:1.9;overflow-wrap:anywhere}';
    root.document.head.appendChild(style);
    for (const host of hosts) {
      try { if (host.dataset.returnsWorkbench === 'sports') mountSports(host); else mountNumbers(host); }
      catch (error) { host.textContent = '收益研究模块暂不可用：' + error.message; }
    }
  }
  const api = { values, sportsInput, sportsResult, crowdResult, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount); else mount(); }
}(typeof globalThis !== 'undefined' ? globalThis : this));
