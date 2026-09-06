(function (global) {
/**
 * Return and risk policy for fixed-odds sports markets.
 *
 * This module is deliberately independent from the ticket builders.  It answers
 * a narrower question: given a complete, time-valid price and an explicitly
 * calibrated probability distribution, is there a positive expected-value
 * decision after an integer stake and a Kelly cap?  Unknown settlement or sale
 * evidence remains research-only.
 */

const FIXED_MARKETS = new Set([
  'jczq', 'jingcai', '竞彩足球', '竞彩足球混合过关', 'football-fixed', 'spf', 'fixed-decimal-1x2', 'fixed-decimal-1x2-v1',
  'jclq', 'lancai', '竞彩篮球', '竞彩篮球混合过关', 'basketball-fixed', 'lq', 'fixed-decimal'
]);
const FLOATING_MARKETS = new Set([
  'beidan', 'dc', '北京单场', 'north-single', 'sfc', 'traditional-football',
  '胜负彩', '任选九', 'rx9'
]);
const EPSILON = 1e-12;

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number`);
  return value;
}

function finiteNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
}

function asMarket(value) {
  return String(value ?? '').trim().toLowerCase();
}

function parseTime(value, name) {
  const time = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(time)) throw new RangeError(`${name} must be a valid timestamp`);
  return time;
}

function normaliseQuotes(input) {
  if (Array.isArray(input)) {
    if (!input.length) throw new RangeError('odds must not be empty');
    return input.map((value, index) => ({ label: String(index), odds: finitePositive(value, `odds[${index}]`) }));
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('odds must be an array or object');
  const labels = Object.keys(input);
  if (!labels.length) throw new RangeError('odds must not be empty');
  return labels.map(label => ({ label, odds: finitePositive(input[label], `odds.${label}`) }));
}

function normaliseProbabilities(input, labels) {
  const values = Array.isArray(input)
    ? input.slice()
    : input && typeof input === 'object' ? labels.map(label => input[label]) : null;
  if (!values || values.length !== labels.length || values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('probabilities must contain one finite nonnegative value per quoted outcome');
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) throw new RangeError('probabilities must sum to 1');
  return values;
}

function normaliseLowerBounds(input, labels) {
  if (input === undefined || input === null) return null;
  const values = Array.isArray(input)
    ? input.slice()
    : input && typeof input === 'object' ? labels.map(label => input[label]) : null;
  if (!values || values.length !== labels.length || values.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError('probabilityLowerBounds must contain one value in [0,1] per outcome');
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total > 1 + EPSILON) throw new RangeError('probabilityLowerBounds cannot sum above 1');
  return values;
}

function sourceEvidence(input) {
  const source = input.source && typeof input.source === 'object' ? input.source : {};
  const reasonCodes = [];
  const reasons = [];
  const kickoffValue = input.kickoffAt ?? source.kickoffAt;
  const observedValue = input.oddsObservedAt ?? input.capturedAt ?? input.observedAt ?? source.oddsObservedAt ?? source.capturedAt ?? source.fetchedAt;
  let kickoffAt = null;
  let observedAt = null;
  if (!kickoffValue) {
    reasonCodes.push('missing_kickoff'); reasons.push('缺少开赛时间，不能证明赔率为赛前报价');
  } else {
    try { kickoffAt = parseTime(kickoffValue, 'kickoffAt'); } catch (_) { reasonCodes.push('invalid_kickoff'); reasons.push('开赛时间无效'); }
  }
  if (!observedValue) {
    reasonCodes.push('missing_odds_timestamp'); reasons.push('缺少赔率捕获时间');
  } else {
    try { observedAt = parseTime(observedValue, 'oddsObservedAt'); } catch (_) { reasonCodes.push('invalid_odds_timestamp'); reasons.push('赔率捕获时间无效'); }
  }
  if (kickoffAt !== null && observedAt !== null && observedAt >= kickoffAt) {
    reasonCodes.push('odds_not_pre_match'); reasons.push('赔率捕获时间不早于开赛时间');
  }
  const nowValue = input.now ?? source.now;
  const now = nowValue === undefined ? Date.now() : Date.parse(nowValue);
  if (!Number.isFinite(now)) { reasonCodes.push('invalid_now'); reasons.push('当前时间无效'); }
  else {
    if (kickoffAt !== null && kickoffAt <= now) { reasonCodes.push('kickoff_elapsed'); reasons.push('开赛时间已到或已过，不能生成赛前交易'); }
    if (observedAt !== null && observedAt > now) { reasonCodes.push('odds_timestamp_future'); reasons.push('赔率捕获时间晚于当前时间'); }
    const maxAgeMinutes = input.maxOddsAgeMinutes ?? 30;
    if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) throw new RangeError('maxOddsAgeMinutes must be positive');
    if (observedAt !== null && observedAt < now - maxAgeMinutes * 60000) { reasonCodes.push('stale_odds'); reasons.push(`赔率捕获已超过 ${maxAgeMinutes} 分钟，不能确认仍可买入`); }
  }
  if (input.officialSale !== true) {
    reasonCodes.push(input.officialSale === false ? 'official_sale_closed' : 'official_sale_unknown');
    reasons.push(input.officialSale === false ? '官方销售状态明确关闭' : '官方销售状态未知；不能生成可兑现交易');
  }
  if (input.settlementRuleVerified !== true && source.settlementRuleVerified !== true) {
    reasonCodes.push('settlement_rule_unverified'); reasons.push('固定赔率结算规则未以可核验合同确认');
  }
  if (input.calibrated !== true && input.probabilityStatus !== 'calibrated' && input.probabilityStatus !== 'validated') {
    reasonCodes.push('probability_uncalibrated'); reasons.push('概率未明确标为已校准/已验证');
  }
  if (!input.source || typeof input.source !== 'object' || !String(input.source.sourceId ?? input.source.id ?? '').trim()) {
    reasonCodes.push('source_unidentified'); reasons.push('缺少可追溯数据源标识');
  }
  return {
    validPreMatch: reasonCodes.every(code => !['missing_kickoff', 'invalid_kickoff', 'missing_odds_timestamp', 'invalid_odds_timestamp', 'odds_not_pre_match', 'kickoff_elapsed', 'odds_timestamp_future', 'stale_odds'].includes(code)),
    officialSale: input.officialSale === true,
    settlementRuleVerified: input.settlementRuleVerified === true || source.settlementRuleVerified === true,
    calibrated: input.calibrated === true || input.probabilityStatus === 'calibrated' || input.probabilityStatus === 'validated',
    kickoffAt, observedAt, reasonCodes, reasons
  };
}

function expectedValues(probabilities, quotes, prices = quotes.map(quote => quote.odds)) {
  const contributions = probabilities.map((probability, i) => probability * prices[i]);
  const gross = contributions.reduce((sum, value) => sum + value, 0);
  const inverseSum = prices.reduce((sum, price) => sum + 1 / price, 0);
  const bestIndex = contributions.reduce((best, value, i) => value > contributions[best] + EPSILON ? i : best, 0);
  return { contributions, edgePerOutcome: contributions.map(value => value - 1), gross, net: gross - 1, marketImpliedProbabilities: prices.map(price => (1 / price) / inverseSum), overround: inverseSum - 1, bestIndex, bestGross: contributions[bestIndex], bestNet: contributions[bestIndex] - 1 };
}

function worstCase(probabilityLowerBounds, quotes, selectedIndex, prices = quotes.map(quote => quote.odds)) {
  if (!probabilityLowerBounds) return { status: 'unknown', gross: null, net: null, remainder: null };
  const floor = probabilityLowerBounds.reduce((sum, probability, i) => sum + probability * prices[i], 0);
  const remainder = Math.max(0, 1 - probabilityLowerBounds.reduce((sum, value) => sum + value, 0));
  const minimumOdds = Math.min(...prices);
  const gross = floor + remainder * minimumOdds;
  const selectedGross = probabilityLowerBounds[selectedIndex] * prices[selectedIndex];
  return { status: 'bounded', gross, net: selectedGross - 1, selectedGross, portfolioGross: gross, remainder, minimumOutcomeOdds: minimumOdds };
}

function kellyFraction(probability, odds) {
  const edge = probability * odds - 1;
  return odds > 1 && edge > 0 ? edge / (odds - 1) : 0;
}

function randomBaseline(probabilities, quotes, budgetYuan, stakeYuan, stakeYuanActual, prices = quotes.map(quote => quote.odds)) {
  const unitGross = probabilities.reduce((sum, p, i) => sum + p * prices[i], 0) / quotes.length;
  const budgetUnits = Math.floor(budgetYuan / stakeYuan);
  const actualStakeUnits = Math.round(stakeYuanActual / stakeYuan);
  return {
    expectedGrossPerUnit: unitGross,
    expectedNetPerUnit: unitGross - 1,
    sameExposure: { stakeYuan: stakeYuanActual, expectedNetYuan: stakeYuanActual * (unitGross - 1) },
    fullBudget: { stakeYuan: budgetUnits * stakeYuan, unusedYuan: budgetYuan - budgetUnits * stakeYuan, expectedNetYuan: budgetUnits * stakeYuan * (unitGross - 1) },
    actualUnits: actualStakeUnits
  };
}

function validateArbitrage(input, labels, market) {
  const quotes = input.arbitrageQuotes ?? input.quotes;
  const result = { status: 'not_evaluated', reasonCodes: [], reasons: [], inverseSum: null, plan: null, conditionalGuarantee: false };
  if (!Array.isArray(quotes)) {
    result.status = 'unavailable'; result.reasonCodes.push('no_complete_quote_set'); result.reasons.push('未提供同一市场全部互斥结果的同时赔率'); return result;
  }
  const canonical = quotes.map((quote, i) => {
    if (!quote || typeof quote !== 'object') throw new TypeError(`arbitrageQuotes[${i}] must be an object`);
    const label = String(quote.selection ?? quote.outcome ?? quote.label ?? '');
    const sourceId = String(quote.sourceId ?? (quote.source && quote.source.sourceId) ?? '');
    if (!sourceId.trim()) throw new RangeError(`arbitrageQuotes[${i}].sourceId is required`);
    return { label, odds: finitePositive(quote.odds, `arbitrageQuotes[${i}].odds`), netOdds: quote.netOdds === undefined ? null : finitePositive(quote.netOdds, `arbitrageQuotes[${i}].netOdds`), sourceId, quote };
  });
  const labelSet = new Set(labels);
  if (canonical.length !== labels.length || canonical.some(item => !labelSet.has(item.label)) || new Set(canonical.map(item => item.label)).size !== labels.length) {
    result.status = 'invalid'; result.reasonCodes.push('incomplete_or_duplicate_outcomes'); result.reasons.push('套利报价没有覆盖同一市场全部且仅一次的互斥结果'); return result;
  }
  const marketKeys = canonical.map(item => asMarket(item.quote.market ?? market));
  const eventIds = canonical.map(item => String(item.quote.eventId ?? input.eventId ?? ''));
  const variants = canonical.map(item => String(item.quote.marketVariant ?? item.quote.play ?? input.marketVariant ?? ''));
  const linePresent = canonical.map(item => item.quote.line !== undefined || item.quote.handicap !== undefined || item.quote.totalLine !== undefined || input.line !== undefined);
  const lines = canonical.map(item => String(item.quote.line ?? item.quote.handicap ?? item.quote.totalLine ?? input.line ?? 'null'));
  const periods = canonical.map(item => String(item.quote.settlementPeriod ?? item.quote.period ?? input.settlementPeriod ?? ''));
  const kickoffs = canonical.map(item => item.quote.kickoffAt ?? input.kickoffAt);
  const captures = canonical.map(item => item.quote.oddsObservedAt ?? item.quote.capturedAt ?? item.quote.observedAt);
  if (marketKeys.some(key => key !== market) || eventIds.some(id => !id || id !== eventIds[0]) || variants.some(value => !value || value !== variants[0]) || linePresent.some(value => !value) || lines.some(value => value !== lines[0]) || periods.some(value => !value || value !== periods[0]) || canonical.some(item => item.quote.officialSale !== true || item.quote.settlementRuleVerified !== true)) {
    result.status = 'invalid'; result.reasonCodes.push('quote_contract_mismatch'); result.reasons.push('套利报价必须来自同一固定赔率市场且每项销售/结算合同均已核验'); return result;
  }
  const terms = input.settlementTerms;
  if (!terms || terms.verified !== true || !Number.isFinite(terms.feeRate) || terms.feeRate < 0 || terms.feeRate >= 1 || !Number.isFinite(terms.taxRate) || terms.taxRate < 0 || terms.taxRate >= 1 || (terms.maxPayoutYuan !== null && terms.maxPayoutYuan !== undefined && (!Number.isFinite(terms.maxPayoutYuan) || terms.maxPayoutYuan <= 0))) {
    result.status = 'invalid'; result.reasonCodes.push('net_payout_contract_missing'); result.reasons.push('套利必须有已核验的净赔率、费税和封顶合同'); return result;
  }
  if (captures.some(value => !value) || kickoffs.some(value => !value)) {
    result.status = 'invalid'; result.reasonCodes.push('quote_timing_missing'); result.reasons.push('套利报价缺少同时性或开赛时间证据'); return result;
  }
  const kickoffTimes = kickoffs.map(value => parseTime(value, 'arbitrage kickoffAt'));
  const captureTimes = captures.map(value => parseTime(value, 'arbitrage oddsObservedAt'));
  const now = input.now === undefined ? Date.now() : parseTime(input.now, 'now');
  const maxAgeMinutes = input.maxOddsAgeMinutes ?? 30;
  if (kickoffTimes.some(time => time !== kickoffTimes[0]) || kickoffTimes[0] <= now || captureTimes.some(time => time >= kickoffTimes[0]) || captureTimes.some(time => time > now) || captureTimes.some(time => time < now - maxAgeMinutes * 60000) || Math.max(...captureTimes) - Math.min(...captureTimes) > (input.arbitrageMaxAgeSeconds ?? 60) * 1000) {
    result.status = 'invalid'; result.reasonCodes.push('quotes_not_simultaneous_pre_match'); result.reasons.push('套利报价并非同一赛前同时窗口'); return result;
  }
  const netOdds = canonical.map(item => item.netOdds ?? item.odds * (1 - terms.feeRate) * (1 - terms.taxRate));
  result.inverseSum = netOdds.reduce((sum, odds) => sum + 1 / odds, 0);
  if (!(result.inverseSum < 1 - EPSILON)) {
    result.status = 'no_arbitrage'; result.reasonCodes.push('overround_nonnegative'); result.reasons.push('全部互斥报价的倒数和不小于1，没有无风险套利'); return result;
  }
  const budget = finiteNonnegative(input.budgetYuan, 'budgetYuan');
  const stakeUnit = finitePositive(input.stakeUnitYuan ?? 2, 'stakeUnitYuan');
  const units = Math.floor(budget / stakeUnit);
  const choose = (n, k) => {
    let value = 1;
    for (let i = 1; i <= k; i++) value = value * (n - k + i) / i;
    return value;
  };
  // For n outcomes, compositions with at most `units` integer stakes are
  // C(units,n).  The 3-way solver below reduces the third dimension exactly by
  // checking the only breakpoints of min(payout)-cost, so it remains usable at
  // the UI's 1,000-unit ceiling without pretending to enumerate 166 million
  // indistinguishable interior points.
  const planCount = units >= canonical.length ? choose(units, canonical.length) : 0;
  const maxPlans = input.maxArbitragePlans ?? 1000000;
  let best = null;
  function scoreAllocation(allocation) {
    const totalUnits = allocation.reduce((sum, value) => sum + value, 0);
    const cost = totalUnits * stakeUnit;
    const payoutCap = terms.maxPayoutYuan;
    const guaranteedGross = Math.min(...allocation.map((unit, i) => {
      const gross = unit * stakeUnit * netOdds[i];
      return payoutCap === null || payoutCap === undefined ? gross : Math.min(gross, payoutCap);
    }));
    const guaranteedProfit = guaranteedGross - cost;
    const candidate = { allocation: allocation.slice(), totalCostYuan: cost, guaranteedGrossYuan: guaranteedGross, guaranteedProfitYuan: guaranteedProfit };
    if (!best || candidate.guaranteedProfitYuan > best.guaranteedProfitYuan + EPSILON || (Math.abs(candidate.guaranteedProfitYuan - best.guaranteedProfitYuan) <= EPSILON && candidate.totalCostYuan < best.totalCostYuan)) best = candidate;
  }
  function visit(index, allocation, totalUnits) {
    if (index === canonical.length) {
      if (allocation.some(value => value < 1)) return;
      scoreAllocation(allocation);
      return;
    }
    for (let unitsAtOutcome = 1; unitsAtOutcome <= units - totalUnits - (canonical.length - index - 1); unitsAtOutcome++) visit(index + 1, [...allocation, unitsAtOutcome], totalUnits + unitsAtOutcome);
  }
  if (!Number.isFinite(maxPlans) || maxPlans < 1) throw new RangeError('maxArbitragePlans must be positive');
  const exactThreeWay = canonical.length === 3 && units <= 1000;
  if (planCount > maxPlans && !exactThreeWay) {
    result.status = 'budget_too_large_for_exhaustive_certificate'; result.reasonCodes.push('integer_search_bound'); result.reasons.push(`整数方案数 ${Math.ceil(planCount)} 超过穷举证书上限 ${maxPlans}，未声称套利保证`); return result;
  }
  if (units >= canonical.length) {
    if (exactThreeWay) {
      // Holding an unused unit can be optimal (for example when all three
      // payouts tie).  For each first two allocations, the objective as a
      // function of the third is piecewise linear; its maximum is at 1, the
      // budget boundary, or the payout-balancing breakpoint.
      for (let first = 1; first <= units - 2; first++) {
        for (let second = 1; second <= units - first - 1; second++) {
          const maxThird = units - first - second;
          const base = Math.min(first * netOdds[0], second * netOdds[1]);
          const balance = base / netOdds[2];
          const candidates = new Set([1, maxThird, Math.floor(balance), Math.ceil(balance)]);
          if (terms.maxPayoutYuan !== null && terms.maxPayoutYuan !== undefined) {
            const capBalance = terms.maxPayoutYuan / (stakeUnit * netOdds[2]);
            candidates.add(Math.floor(capBalance)); candidates.add(Math.ceil(capBalance));
          }
          for (const third of candidates) if (Number.isInteger(third) && third >= 1 && third <= maxThird) scoreAllocation([first, second, third]);
        }
      }
    } else visit(0, [], 0);
  }
  result.plan = best;
  result.status = best && best.guaranteedProfitYuan > EPSILON ? 'conditional_guarantee' : 'integer_plan_not_profitable';
  result.conditionalGuarantee = result.status === 'conditional_guarantee';
  if (!result.conditionalGuarantee) { result.reasonCodes.push('no_positive_integer_plan'); result.reasons.push('连续套利条件成立，但给定最小投注单位和预算没有正保证收益的整数方案'); }
  return result;
}

function evaluateDecision(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('evaluateDecision input must be an object');
  const market = asMarket(input.market);
  const quotes = normaliseQuotes(input.odds);
  const labels = quotes.map(quote => quote.label);
  const probabilities = normaliseProbabilities(input.probabilities, labels);
  const lowerBounds = normaliseLowerBounds(input.probabilityLowerBounds, labels);
  const budgetYuan = finiteNonnegative(input.budgetYuan, 'budgetYuan');
  const stakeUnitYuan = finitePositive(input.stakeUnitYuan ?? 2, 'stakeUnitYuan');
  const budgetUnits = Math.floor(budgetYuan / stakeUnitYuan);
  const evThreshold = input.minimumExpectedGrossReturn ?? input.evThreshold ?? 1.05;
  if (!Number.isFinite(evThreshold) || evThreshold < 1) throw new RangeError('minimumExpectedGrossReturn must be at least 1');
  const maxKellyFraction = input.maxKellyFraction ?? input.kellyCap ?? 0.25;
  if (!Number.isFinite(maxKellyFraction) || maxKellyFraction < 0 || maxKellyFraction > 1) throw new RangeError('maxKellyFraction must be in [0,1]');
  const terms = input.settlementTerms;
  const termsVerified = Boolean(terms && terms.verified === true && Number.isFinite(terms.feeRate) && terms.feeRate >= 0 && terms.feeRate < 1 && Number.isFinite(terms.taxRate) && terms.taxRate >= 0 && terms.taxRate < 1 && (terms.maxPayoutYuan === null || terms.maxPayoutYuan === undefined || (Number.isFinite(terms.maxPayoutYuan) && terms.maxPayoutYuan > 0)));
  const prices = quotes.map(quote => {
    const net = termsVerified ? quote.odds * (1 - terms.feeRate) * (1 - terms.taxRate) : quote.odds;
    return termsVerified && terms.maxPayoutYuan !== null && terms.maxPayoutYuan !== undefined ? Math.min(net, terms.maxPayoutYuan / stakeUnitYuan) : net;
  });
  const values = expectedValues(probabilities, quotes, prices);
  const worst = worstCase(lowerBounds, quotes, values.bestIndex, prices);
  const evidence = sourceEvidence(input);
  const reasons = [...evidence.reasons];
  const reasonCodes = [...evidence.reasonCodes];
  if (!FIXED_MARKETS.has(market)) {
    reasonCodes.push(FLOATING_MARKETS.has(market) ? 'floating_market_not_supported' : 'unknown_market');
    reasons.push(FLOATING_MARKETS.has(market) ? '北单/胜负彩为浮动返奖，不能套用固定赔率收益公式' : '市场类型未纳入固定赔率结算策略');
  }
  if (FIXED_MARKETS.has(market) && !termsVerified) { reasonCodes.push('net_payout_contract_missing'); reasons.push('固定赔率交易必须有已核验的净赔率、费税和封顶合同'); }
  if (FIXED_MARKETS.has(market) && termsVerified && terms.maxPayoutYuan !== null && terms.maxPayoutYuan !== undefined) { reasonCodes.push('aggregate_payout_cap_requires_allocation'); reasons.push('普通单场决策无法在未知出票分配下正确应用总奖金封顶'); }
  const arbitrage = validateArbitrage(input, labels, market);
  const bestQuote = quotes[values.bestIndex];
  const bestKelly = kellyFraction(probabilities[values.bestIndex], prices[values.bestIndex]);
  const allowedFraction = Math.min(maxKellyFraction, bestKelly);
  const proposedUnits = Math.min(budgetUnits, Math.floor(budgetUnits * allowedFraction + EPSILON));
  const gateCodes = [];
  if (values.bestGross < evThreshold - EPSILON) { gateCodes.push('ev_below_threshold'); reasons.push(`最高选项赔率收益 ${values.bestGross.toFixed(4)} 未达到门槛 ${evThreshold.toFixed(4)}`); }
  const randomExpectedGross = values.gross / quotes.length;
  if (values.bestGross <= randomExpectedGross + EPSILON) { gateCodes.push('no_improvement_over_random'); reasons.push('最高选项的点期望没有严格超过同赔率均匀随机选择'); }
  if (worst.status !== 'bounded') { gateCodes.push('worst_case_unknown'); reasons.push('未提供概率下界，无法证明最坏概率区间下不亏'); }
  else if (worst.net < -EPSILON) { gateCodes.push('worst_case_negative'); reasons.push(`概率下界最坏期望净收益为 ${worst.net.toFixed(4)}`); }
  if (proposedUnits < 1 && values.bestNet > EPSILON) { gateCodes.push('kelly_below_minimum_unit'); reasons.push('Kelly上限在当前最小投注单位下不允许投入一注'); }
  if (proposedUnits < 1 && values.bestGross >= evThreshold - EPSILON) { gateCodes.push('budget_no_eligible_unit'); reasons.push('预算不足以形成满足Kelly上限的一注'); }
  const evidenceGate = evidence.reasonCodes.length > 0;
  // A complete, simultaneous, contract-verified arbitrage set does not need a
  // calibrated forecast: its guarantee is an algebraic price statement.  The
  // ordinary EV path does require explicit calibration and probability bounds.
  const arbitrageTrade = FIXED_MARKETS.has(market) && arbitrage.conditionalGuarantee;
  const canSupportTrade = arbitrageTrade || (FIXED_MARKETS.has(market) && !evidenceGate && reasonCodes.length === 0 && gateCodes.length === 0 && values.bestNet > EPSILON && proposedUnits >= 1);
  if (arbitrage.conditionalGuarantee) reasons.push('同一固定市场全部互斥结果的同时赔率构成整数套利保证');
  const status = canSupportTrade ? 'supported_trade' : evidenceGate || !FIXED_MARKETS.has(market) ? 'research_only' : 'hold_cash';
  if (status === 'hold_cash' && !reasons.length) reasons.push('期望值或风险门槛未满足，保留现金');
  const selectedUnits = canSupportTrade && !arbitrageTrade ? proposedUnits : 0;
  const selectedStakeYuan = selectedUnits * stakeUnitYuan;
  const candidateStakeYuan = proposedUnits * stakeUnitYuan;
  const baseline = randomBaseline(probabilities, quotes, budgetYuan, stakeUnitYuan, candidateStakeYuan, prices);
  const candidateExpectedNetYuan = candidateStakeYuan * values.bestNet;
  const candidateWorstCaseNetYuan = worst.net === null ? null : candidateStakeYuan * worst.net;
  const actualActionStakeYuan = status === 'supported_trade' ? arbitrageTrade ? arbitrage.plan.totalCostYuan : selectedStakeYuan : 0;
  const proof = {
    candidate: { selectedOutcome: bestQuote.label, expectedGrossPerUnit: values.bestGross, expectedNetPerUnit: values.bestNet, stakeYuan: candidateStakeYuan, expectedNetYuan: candidateExpectedNetYuan, worstCaseNetYuan: candidateWorstCaseNetYuan },
    random: baseline,
    improvementAtSameExposureYuan: candidateExpectedNetYuan - baseline.sameExposure.expectedNetYuan,
    improvementAtFullBudgetYuan: candidateExpectedNetYuan - baseline.fullBudget.expectedNetYuan,
    condition: `p(${bestQuote.label})*odds(${bestQuote.label}) > (sum_i[p(i)*odds(i)]/N) and selected stake obeys Kelly cap; cash earns 0`,
    expectationOnly: true
  };
  return {
    version: '1.0.0', market, status, action: status === 'supported_trade' ? 'trade' : 'hold_cash', supportableTrade: canSupportTrade,
    decision: { status, action: status === 'supported_trade' ? 'trade' : 'hold_cash', selectedOutcome: bestQuote.label, candidateStakeYuan, actualActionStakeYuan, heldCashYuan: budgetYuan - actualActionStakeYuan },
    labels, probabilities, odds: quotes.map(quote => quote.odds), effectiveOdds: prices, expected: { ...values, worstCase: worst, threshold: evThreshold },
    risk: { bestKellyFraction: bestKelly, maxKellyFraction, appliedFraction: allowedFraction, budgetUnits, proposedUnits, proposedStakeYuan: candidateStakeYuan, selectedUnits: actualActionStakeYuan / stakeUnitYuan, selectedStakeYuan: actualActionStakeYuan, heldCashYuan: budgetYuan - actualActionStakeYuan },
    baseline, expectationProof: proof, arbitrage, evidence: { ...evidence, source: input.source ?? null },
    reasonCodes: [...new Set([...reasonCodes, ...gateCodes])], reasons: [...new Set(reasons)],
    renderable: { headline: status === 'supported_trade' ? arbitrageTrade ? '支持交易：条件套利' : `支持交易：${bestQuote.label}` : status === 'hold_cash' ? '保留现金' : '仅研究：不可兑现', action: status === 'supported_trade' ? 'trade' : 'hold_cash', candidateStakeYuan, actualActionStakeYuan, stakeYuan: actualActionStakeYuan, heldCashYuan: budgetYuan - actualActionStakeYuan, reasons: [...new Set(reasons)] }
  };
}

const api = { evaluateDecision, FIXED_MARKETS, FLOATING_MARKETS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (global && typeof global === 'object') global.SportsReturnPolicy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
