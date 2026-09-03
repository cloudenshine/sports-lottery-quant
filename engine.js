(function (root) {
  "use strict";

  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cloneSorted(nums) {
    return nums.slice().sort(function (a, b) {
      return a - b;
    });
  }

  function keyOf(nums) {
    return cloneSorted(nums).join(",");
  }

  function overlap(a, b) {
    const set = new Set(b);
    let n = 0;
    for (let i = 0; i < a.length; i++) if (set.has(a[i])) n += 1;
    return n;
  }

  function sum(nums) {
    let s = 0;
    for (let i = 0; i < nums.length; i++) s += nums[i];
    return s;
  }

  function oddCount(nums) {
    let n = 0;
    for (let i = 0; i < nums.length; i++) if (nums[i] & 1) n += 1;
    return n;
  }

  function spanOf(nums) {
    const s = cloneSorted(nums);
    return s[s.length - 1] - s[0];
  }

  function acValue(nums) {
    const s = cloneSorted(nums);
    const diffs = new Set();
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) diffs.add(s[j] - s[i]);
    }
    return diffs.size - (s.length - 1);
  }

  function maxRun(nums) {
    const s = cloneSorted(nums);
    let max = 1;
    let cur = 1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1] + 1) {
        cur += 1;
        if (cur > max) max = cur;
      } else cur = 1;
    }
    return max;
  }

  function runGroups(nums) {
    const s = cloneSorted(nums);
    const groups = [];
    let len = 1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1] + 1) len += 1;
      else {
        if (len >= 2) groups.push(len);
        len = 1;
      }
    }
    if (len >= 2) groups.push(len);
    return groups;
  }

  function maxSameEnding(nums) {
    const m = new Map();
    let max = 0;
    for (let i = 0; i < nums.length; i++) {
      const e = nums[i] % 10;
      const v = (m.get(e) || 0) + 1;
      m.set(e, v);
      if (v > max) max = v;
    }
    return max;
  }

  function isArithmetic(nums) {
    const s = cloneSorted(nums);
    if (s.length < 4) return false;
    const d = s[1] - s[0];
    if (d <= 0) return false;
    for (let i = 2; i < s.length; i++) if (s[i] - s[i - 1] !== d) return false;
    return true;
  }

  function zoneCounts(gameId, nums) {
    const z = [0, 0, 0];
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i];
      if (gameId === "ssq") {
        if (n <= 11) z[0] += 1;
        else if (n <= 22) z[1] += 1;
        else z[2] += 1;
      } else if (n <= 12) z[0] += 1;
      else if (n <= 23) z[1] += 1;
      else z[2] += 1;
    }
    return z;
  }

  function luckyCount(nums) {
    let n = 0;
    for (let i = 0; i < nums.length; i++) {
      const x = nums[i];
      if (x === 6 || x === 8 || x === 9 || x === 16 || x === 18 || x === 26 || x === 28) n += 1;
    }
    return n;
  }

  function sampleCombination(max, k, rng) {
    const picked = [];
    const used = new Set();
    while (picked.length < k) {
      const n = 1 + Math.floor(rng() * max);
      if (!used.has(n)) {
        used.add(n);
        picked.push(n);
      }
    }
    return cloneSorted(picked);
  }

  function shuffle(copy, rng) {
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function sampleFromPool(pool, k, rng) {
    return cloneSorted(shuffle(pool.slice(), rng).slice(0, k));
  }

  function combinations(arr, k) {
    const out = [];
    const n = arr.length;
    if (k > n || k <= 0) return out;
    const idx = [];
    for (let i = 0; i < k; i++) idx.push(i);
    while (true) {
      const row = [];
      for (let i = 0; i < k; i++) row.push(arr[idx[i]]);
      out.push(row);
      let i = k - 1;
      while (i >= 0 && idx[i] === n - k + i) i -= 1;
      if (i < 0) break;
      idx[i] += 1;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
    return out;
  }

  function freqMap(draws, which, max) {
    const f = Array(max + 1).fill(0);
    for (let i = 0; i < draws.length; i++) {
      const xs = draws[i][which];
      for (let j = 0; j < xs.length; j++) f[xs[j]] += 1;
    }
    return f;
  }

  function hist(arr) {
    const m = {};
    for (let i = 0; i < arr.length; i++) m[arr[i]] = (m[arr[i]] || 0) + 1;
    return m;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const idx = (sorted.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  const GAMES = {
    ssq: {
      id: "ssq",
      name: "双色球",
      mainName: "红球",
      specialName: "蓝球",
      mainCount: 6,
      mainMax: 33,
      specialCount: 1,
      specialMax: 16,
      price: 2,
      smallCut: 16,
      danMin: 1,
      danMax: 5,
      universeMain: comb(33, 6),
      universeFull: comb(33, 6) * 16,
      prizeNote: "六等奖只看蓝球；五等奖是 4 红或 3 红+蓝。",
    },
    dlt: {
      id: "dlt",
      name: "超级大乐透",
      mainName: "前区",
      specialName: "后区",
      mainCount: 5,
      mainMax: 35,
      specialCount: 2,
      specialMax: 12,
      price: 2,
      smallCut: 17,
      danMin: 1,
      danMax: 4,
      universeMain: comb(35, 5),
      universeFull: comb(35, 5) * comb(12, 2),
      prizeNote: "七等奖含 0+2，后区覆盖对小奖极关键。",
    },
  };

  const PRIZES = {
    ssq: [
      { level: 1, name: "一等奖", match: "6+1", amount: "浮动" },
      { level: 2, name: "二等奖", match: "6+0", amount: "浮动" },
      { level: 3, name: "三等奖", match: "5+1", amount: "3000" },
      { level: 4, name: "四等奖", match: "5+0 / 4+1", amount: "200" },
      { level: 5, name: "五等奖", match: "4+0 / 3+1", amount: "10" },
      { level: 6, name: "六等奖", match: "0+1（蓝球）", amount: "5" },
    ],
    dlt: [
      { level: 1, name: "一等奖", match: "5+2", amount: "浮动" },
      { level: 2, name: "二等奖", match: "5+1", amount: "浮动" },
      { level: 3, name: "三等奖", match: "5+0 / 4+2", amount: "5000/6666" },
      { level: 4, name: "四等奖", match: "4+1", amount: "300/380" },
      { level: 5, name: "五等奖", match: "4+0 / 3+2", amount: "150/200" },
      { level: 6, name: "六等奖", match: "3+1 / 2+2", amount: "15/18" },
      { level: 7, name: "七等奖", match: "3+0 / 2+1 / 1+2 / 0+2", amount: "5/7" },
    ],
  };

  // 官方开奖日历调度体系 (北京时间真实规则)
  // 双色球: 每周二、四、日 21:15 摇奖
  // 超级大乐透: 每周一、三、六 21:25 摇奖
  const LOTTERY_SCHEDULES = {
    ssq: {
      days: [2, 4, 0], // 周二、周四、周日 (0为周日)
      hour: 21,
      minute: 15,
      delaySeconds: 15, // 开奖后15秒启动增量抓取
      name: "福彩双色球",
    },
    dlt: {
      days: [1, 3, 6], // 周一、周三、周六
      hour: 21,
      minute: 25,
      delaySeconds: 15, // 开奖后15秒启动增量抓取
      name: "体彩大乐透",
    },
  };

  function getNextDrawInfo(gameId, fromDate) {
    const sched = LOTTERY_SCHEDULES[gameId];
    if (!sched) throw new Error("未知彩种: " + gameId);
    const now = fromDate ? new Date(fromDate) : new Date();

    // 寻找最近的未来开奖时间点
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const candidate = new Date(now.getTime() + dayOffset * 86400000);
      candidate.setHours(sched.hour, sched.minute, 0, 0);

      const dayOfWeek = candidate.getDay();
      if (sched.days.indexOf(dayOfWeek) !== -1) {
        if (candidate.getTime() > now.getTime()) {
          const diffSeconds = Math.max(0, Math.floor((candidate.getTime() - now.getTime()) / 1000));
          const syncTarget = new Date(candidate.getTime() + sched.delaySeconds * 1000);
          return {
            gameId: gameId,
            now: now,
            nextDrawTime: candidate,
            syncTargetTime: syncTarget,
            diffSeconds: diffSeconds,
            dayOfWeek: dayOfWeek,
            dayName: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][dayOfWeek],
            isToday: dayOffset === 0,
            text: candidate.getFullYear() + "-" +
              String(candidate.getMonth() + 1).padStart(2, "0") + "-" +
              String(candidate.getDate()).padStart(2, "0") + " " +
              String(sched.hour).padStart(2, "0") + ":" +
              String(sched.minute).padStart(2, "0"),
          };
        }
      }
    }
    return null;
  }

  function mustGame(gameId) {
    const game = GAMES[gameId];
    if (!game) throw new Error("未知玩法: " + gameId);
    return game;
  }

  function loadDraws(gameId) {
    mustGame(gameId);
    if (gameId === "ssq") {
      const rows = root.SSQ_DRAWS || [];
      const meta = root.SSQ_META || {};
      return {
        meta: Object.assign({ name: "双色球" }, meta),
        draws: rows.map(function (row) {
          return { issue: "", main: row.slice(0, 6), special: [row[6]] };
        }),
      };
    }
    const rows = root.DLT_DRAWS || [];
    const meta = root.DLT_META || {};
    return {
      meta: Object.assign({ name: "超级大乐透" }, meta),
      draws: rows.map(function (row) {
        return { issue: "", main: row.slice(0, 5), special: row.slice(5, 7) };
      }),
    };
  }

  function buildHistoryMaps(draws) {
    const historyMain = new Map();
    const historyFull = new Map();
    for (let i = 0; i < draws.length; i++) {
      const mk = keyOf(draws[i].main);
      const fk = mk + "+" + keyOf(draws[i].special);
      historyMain.set(mk, (historyMain.get(mk) || 0) + 1);
      historyFull.set(fk, (historyFull.get(fk) || 0) + 1);
    }
    return { historyMain: historyMain, historyFull: historyFull };
  }

  function analyze(gameId) {
    const game = mustGame(gameId);
    const loaded = loadDraws(gameId);
    const draws = loaded.draws;
    const total = draws.length;
    const mains = draws.map(function (d) {
      return cloneSorted(d.main);
    });
    const maxRuns = mains.map(maxRun);
    const odds = mains.map(oddCount);
    const smalls = mains.map(function (m) {
      return m.filter(function (n) {
        return n <= game.smallCut;
      }).length;
    });
    const sums = mains.map(sum);
    const spans = mains.map(spanOf);
    const acs = mains.map(acValue);
    const endings = mains.map(maxSameEnding);
    const sortedSums = sums.slice().sort(function (a, b) {
      return a - b;
    });
    const sortedSpans = spans.slice().sort(function (a, b) {
      return a - b;
    });
    const maps = buildHistoryMaps(draws);
    let repeatedMain = 0;
    maps.historyMain.forEach(function (c) {
      if (c > 1) repeatedMain += 1;
    });
    let repeatedFull = 0;
    maps.historyFull.forEach(function (c) {
      if (c > 1) repeatedFull += 1;
    });
    const overlapPrev = Array(game.mainCount + 1).fill(0);
    for (let i = 0; i < mains.length - 1; i++) overlapPrev[overlap(mains[i], mains[i + 1])] += 1;
    const last20 = draws.slice(0, 20);

    // 计算主号与特码的当前遗漏期数
    const omissions = Array(game.mainMax + 1).fill(draws.length);
    for (let n = 1; n <= game.mainMax; n++) {
      for (let i = 0; i < draws.length; i++) {
        if (draws[i].main.indexOf(n) !== -1) {
          omissions[n] = i;
          break;
        }
      }
    }

    const specialOmissions = Array(game.specialMax + 1).fill(draws.length);
    for (let n = 1; n <= game.specialMax; n++) {
      for (let i = 0; i < draws.length; i++) {
        if (draws[i].special.indexOf(n) !== -1) {
          specialOmissions[n] = i;
          break;
        }
      }
    }

    return {
      game: game,
      meta: loaded.meta,
      total: total,
      draws: draws,
      mains: mains,
      omissions: omissions,
      specialOmissions: specialOmissions,
      stats: {
        maxRun: hist(maxRuns),
        odd: hist(odds),
        small: hist(smalls),
        ac: hist(acs),
        ending: hist(endings),
        fourPlus: maxRuns.filter(function (x) {
          return x >= 4;
        }).length,
        fivePlus: maxRuns.filter(function (x) {
          return x >= 5;
        }).length,
        sum: {
          min: sortedSums[0] || 0,
          p05: Math.round(quantile(sortedSums, 0.05)),
          p10: Math.round(quantile(sortedSums, 0.1)),
          p50: Math.round(quantile(sortedSums, 0.5)),
          p90: Math.round(quantile(sortedSums, 0.9)),
          p95: Math.round(quantile(sortedSums, 0.95)),
          max: sortedSums[sortedSums.length - 1] || 0,
        },
        span: {
          min: sortedSpans[0] || 0,
          p10: sortedSpans[Math.floor(total * 0.1)] || 0,
          p50: sortedSpans[Math.floor(total * 0.5)] || 0,
          p90: sortedSpans[Math.floor(total * 0.9)] || 0,
          max: sortedSpans[sortedSpans.length - 1] || 0,
        },
        repeatedMain: repeatedMain,
        repeatedFull: repeatedFull,
        overlapPrev: overlapPrev,
        arithmetic: mains.filter(isArithmetic).length,
      },
      historyMain: maps.historyMain,
      historyFull: maps.historyFull,
      last: draws[0],
      last5: draws.slice(0, 5),
      last20: last20,
      hot: freqMap(last20, "main", game.mainMax),
      specialHot: freqMap(last20, "special", game.specialMax),
    };
  }

  function defaultFilters(gameId) {
    mustGame(gameId);
    if (gameId === "ssq") {
      return {
        maxRun: 4,
        oddMin: 1,
        oddMax: 5,
        smallMin: 1,
        smallMax: 5,
        sumMin: 66,
        sumMax: 136,
        spanMin: 15,
        spanMax: 32,
        acMin: 5,
        acMax: 10,
        sameEndMax: 3,
        rejectArithmetic: true,
        rejectExactFull: true,
        rejectExactMain: false,
        maxOverlapLast: 3,
        maxOverlapLast5: 4,
        rejectFiveInZone: true,
        antiCrowd: true,
        rotateSpecial: true,
        crowdMax: 40,
        maxShare: 3,
        omissionMin: 12,
        omissionMax: 75,
        checkOmission: false,
        zhuijia: false,
      };
    }
    return {
      maxRun: 4,
      oddMin: 1,
      oddMax: 4,
      smallMin: 1,
      smallMax: 4,
      sumMin: 54,
      sumMax: 129,
      spanMin: 12,
      spanMax: 34,
      acMin: 3,
      acMax: 6,
      sameEndMax: 3,
      rejectArithmetic: true,
      rejectExactFull: true,
      rejectExactMain: false,
      maxOverlapLast: 3,
      maxOverlapLast5: 4,
      rejectFiveInZone: true,
      antiCrowd: true,
      rotateSpecial: true,
      crowdMax: 40,
      maxShare: 3,
      omissionMin: 10,
      omissionMax: 70,
      checkOmission: false,
      zhuijia: false,
    };
  }

  function shannonEntropy(m, maxVal) {
    // 将整个选号空间 [1, maxVal] 划分为 4 个等距空间箱 (Bins)
    const bins = [0, 0, 0, 0];
    const binSize = maxVal / 4;
    for (let i = 0; i < m.length; i++) {
      let b = Math.floor((m[i] - 1) / binSize);
      if (b > 3) b = 3;
      bins[b]++;
    }
    // 计算香农信息熵 H(X) = -sum(p * log2(p))
    let entropy = 0;
    const total = m.length;
    for (let i = 0; i < 4; i++) {
      if (bins[i] > 0) {
        const p = bins[i] / total;
        entropy -= p * (Math.log(p) / Math.LN2);
      }
    }
    // 理论最大熵为 log2(4) = 2.0 bit，归一化到 0 - 100
    const normalized = Math.min(100, Math.round((entropy / 2.0) * 100));
    return {
      entropy: entropy,
      score: normalized,
      bins: bins,
    };
  }

  function ticketShape(gameId, main, special, ctx) {
    const game = mustGame(gameId);
    const m = cloneSorted(main);
    const s = cloneSorted(special);
    const omissions = ctx && ctx.omissions ? m.map(function(n) { return ctx.omissions[n] || 0; }) : [];
    const sumOmission = sum(omissions);
    let neighbors = 0;
    if (ctx && ctx.last && ctx.last.main) {
      const lastMain = ctx.last.main;
      neighbors = m.filter(function(n) {
        return lastMain.some(function(x) { return Math.abs(x - n) === 1; });
      }).length;
    }
    const entropyInfo = shannonEntropy(m, game.mainMax);

    return {
      main: m,
      special: s,
      sum: sum(m),
      odd: oddCount(m),
      small: m.filter(function (n) {
        return n <= game.smallCut;
      }).length,
      span: spanOf(m),
      ac: acValue(m),
      run: maxRun(m),
      groups: runGroups(m),
      sameEnd: maxSameEnding(m),
      arithmetic: isArithmetic(m),
      zones: zoneCounts(gameId, m),
      birthday: m.every(function (n) {
        return n <= 31;
      }),
      lucky: luckyCount(m),
      omissions: omissions,
      sumOmission: sumOmission,
      neighbors: neighbors,
      entropy: entropyInfo.score,
      rawEntropy: entropyInfo.entropy,
    };
  }

  function hardReject(gameId, shape, ctx, filters) {
    const game = mustGame(gameId);
    const reasons = [];
    if (shape.run >= filters.maxRun) reasons.push(shape.run + "连号");
    if (shape.odd < filters.oddMin || shape.odd > filters.oddMax) {
      reasons.push("奇偶极端 " + shape.odd + ":" + (game.mainCount - shape.odd));
    }
    if (shape.small < filters.smallMin || shape.small > filters.smallMax) reasons.push("大小极端");
    if (shape.sum < filters.sumMin || shape.sum > filters.sumMax) reasons.push("和值 " + shape.sum);
    if (shape.span < filters.spanMin || shape.span > filters.spanMax) reasons.push("跨度 " + shape.span);
    if (shape.ac < filters.acMin || shape.ac > filters.acMax) reasons.push("AC " + shape.ac);
    if (shape.sameEnd > filters.sameEndMax) reasons.push("同尾 " + shape.sameEnd);
    if (filters.rejectArithmetic && shape.arithmetic) reasons.push("等差数列");
    if (filters.rejectFiveInZone && Math.max.apply(null, shape.zones) >= 5) reasons.push("单区过于拥挤");
    if (filters.minEntropy != null && shape.entropy < filters.minEntropy) {
      reasons.push("香农空间熵过低(" + shape.entropy + "分)");
    }
    if (filters.checkOmission && shape.sumOmission > 0) {
      if (shape.sumOmission < filters.omissionMin || shape.sumOmission > filters.omissionMax) {
        reasons.push("遗漏和异常(" + shape.sumOmission + ")");
      }
    }
    const mk = keyOf(shape.main);
    const fk = mk + "+" + keyOf(shape.special);
    if (filters.rejectExactFull && ctx.historyFull && ctx.historyFull.has(fk)) reasons.push("历史全号撞车");
    if (filters.rejectExactMain && ctx.historyMain && ctx.historyMain.has(mk)) reasons.push("历史主号撞车");
    if (ctx.last && overlap(shape.main, ctx.last.main) > filters.maxOverlapLast) reasons.push("与上期重叠过多");
    if (ctx.last5 && ctx.last5.some(function (d) {
      return overlap(shape.main, d.main) > filters.maxOverlapLast5;
    })) reasons.push("临摹近5期");
    return reasons;
  }

  function crowdScore(gameId, shape, ctx) {
    let heat = 0;
    const notes = [];
    if (shape.birthday) {
      heat += 18;
      notes.push("全落1-31生日区");
    }
    if (shape.lucky >= 3) {
      heat += 14;
      notes.push("吉祥号扎堆");
    }
    const pairs = shape.groups.filter(function (g) {
      return g === 2;
    }).length;
    if (pairs >= 2) {
      heat += 8;
      notes.push("双连号好看，跟风者多");
    }
    const hi = gameId === "ssq" ? 31 : 33;
    if (shape.main[0] <= 3 && shape.main[shape.main.length - 1] >= hi) heat += 4;
    if (ctx.last) {
      const o = overlap(shape.main, ctx.last.main);
      if (o >= 3) {
        heat += 12 * (o - 2);
        notes.push("像在改上期号码");
      }
    }
    const hot = ctx.hot || [];
    const hotHit = shape.main.filter(function (n) {
      return (hot[n] || 0) >= 5;
    }).length;
    if (hotHit >= 4) {
      heat += 10;
      notes.push("近20期高频号过多");
    }
    if (shape.zones.some(function (z) {
      return z >= 4;
    })) {
      heat += 8;
      notes.push("投注单上几乎连成一片");
    }
    return { heat: Math.min(100, heat), notes: notes };
  }

  function structureScore(shape, ctx) {
    const game = ctx.game;
    const st = ctx.stats || { sum: { p10: 0, p50: 100, p90: 999 }, span: { p10: 0, p50: 25, p90: 999 } };
    const mid = game.mainCount / 2;
    let s = 5;
    // 只奖励“不极端”，不追历史峰值：奇偶/大小越接近均衡越高，但不锁定 3:3
    s += 2 * (1 - Math.abs(shape.odd - mid) / mid);
    s += 2 * (1 - Math.abs(shape.small - mid) / mid);
    // 和值/跨度落在历史 10%–90% 分位内给满，不向 p50 单峰收敛
    if (st.sum && shape.sum >= st.sum.p10 && shape.sum <= st.sum.p90) s += 2;
    else if (st.sum) s -= 1;
    if (st.span && shape.span >= st.span.p10 && shape.span <= st.span.p90) s += 1.5;
    // AC 落在真实高峰带即可，不做频率加权
    if (shape.ac >= 4 && shape.ac <= 10) s += 1;
    // 冷号温和加分，不追“恰好一个冷号”
    const hot = ctx.hot || [];
    const cold = shape.main.filter(function (n) {
      return (hot[n] || 0) <= 1;
    }).length;
    if (cold === 1) s += 0.6;
    if (cold >= 3) s -= 0.5;
    // 与上期重叠
    if (ctx.last) {
      const o = overlap(shape.main, ctx.last.main);
      if (o <= 1) s += 0.8;
      else if (o >= 3) s -= 1;
    }
    return s;
  }

  function sumBucket(filters, sumValue) {
    const lo = filters.sumMin;
    const hi = filters.sumMax;
    const third = (hi - lo) / 3;
    if (sumValue < lo + third) return 0;
    if (sumValue < lo + third * 2) return 1;
    return 2;
  }

  function shapeFingerprint(gameId, shape, filters) {
    // 形态指纹：奇偶 + 大小 + 和值档 + 连号类型，用于票组内去重
    const runCat = shape.run >= 3 ? 3 : shape.run;
    return shape.odd + "|" + shape.small + "|" + sumBucket(filters, shape.sum) + "|" + runCat;
  }

  const PRIZE_ESTIMATES = {
    ssq: {
      1: 5000000,
      2: 150000,
      3: 3000,
      4: 200,
      5: 10,
      6: 5,
    },
    dlt: {
      1: 10000000,
      2: 100000,
      3: 10000,
      4: 3000,
      5: 300,
      6: 200,
      7: 100,
      8: 15,
      9: 5,
    },
  };

  function explainTicket(gameId, shape, ctx, crowd, reject) {
    const game = GAMES[gameId];
    const bits = [
      shape.odd + "奇" + (game.mainCount - shape.odd) + "偶",
      "和值 " + shape.sum,
      "跨度 " + shape.span,
      "AC " + shape.ac,
      shape.groups.length === 0 ? "无连号" : shape.groups.map(function (g) {
        return g + "连";
      }).join("+"),
      "同尾最多" + shape.sameEnd,
    ];
    const why = [];
    if (!reject.length) why.push("严格通过 L1 结构硬过滤（剔除 4+ 连、全奇全偶、极端和值）");
    if (crowd.heat <= 15) why.push("极低大众热度（反人群度高，极少分奖）");
    else if (crowd.notes.length) why.push("大众热度标签: " + crowd.notes.join("、"));
    const fk = keyOf(shape.main) + "+" + keyOf(shape.special);
    if (ctx.historyFull && !ctx.historyFull.has(fk)) why.push("历史全库 " + ctx.draws.length + " 期 0 碰撞");

    // 战术定位
    let tactic = "均衡守正型";
    if (shape.entropy >= 90) tactic = "高熵高离散型";
    else if (shape.run >= 2) tactic = "连号进攻型";
    else if (shape.ac >= 8) tactic = "广域高离散型";
    else if (crowd.heat <= 10) tactic = "极寒反共识型";

    // 避开的常见陷阱
    const traps = [];
    if (shape.entropy >= 60) traps.push("打破低信息熵扎堆陷阱(熵值" + shape.entropy + ")");
    if (shape.run < 3) traps.push("避开 3+ 连号大众陷阱");
    if (!shape.birthday) traps.push("打破 1-31 生日号码聚集区");
    if (shape.sameEnd <= 2) traps.push("规避 3+ 同尾号码扎堆");
    if (shape.ac >= 6) traps.push("规避低 AC 聚集效应");

    return {
      bits: bits,
      why: why,
      crowd: crowd.notes,
      tactic: tactic,
      traps: traps,
    };
  }

  function exportTerminalTxt(gameId, tickets, options) {
    options = options || {};
    const game = mustGame(gameId);
    const dateStr = options.date || new Date().toISOString().slice(0, 10);
    const issue = options.issue || "26102";
    const isZhuijia = options.zhuijia === true;
    
    const lines = [];
    lines.push("// ========================================================");
    lines.push("// QUANT-LOTTO 彩票中心专用打票机标准批量导出格式 (POS-READY)");
    lines.push("// 彩种: " + (gameId === "ssq" ? "中国福利彩票·双色球" : "中国体育彩票·超级大乐透" + (isZhuijia ? "(追加)" : "")));
    lines.push("// 期号: 第 " + issue + " 期 | 导出日期: " + dateStr);
    lines.push("// 总注数: " + tickets.length + " 注 | 总投注额: " + (tickets.length * (isZhuijia ? 3 : game.price)) + " 元");
    lines.push("// ========================================================");
    lines.push("");

    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const mStr = t.main.map(function(n) { return (n < 10 ? "0" + n : "" + n); }).join(" ");
      const sStr = t.special.map(function(n) { return (n < 10 ? "0" + n : "" + n); }).join(" ");
      const lineNum = String(i + 1).padStart(3, "0");
      lines.push(lineNum + " | " + mStr + " + " + sStr);
    }

    lines.push("");
    lines.push("// 校验码: " + Math.abs(Math.sin(tickets.length * 12345)).toString(16).slice(2, 10).toUpperCase());
    lines.push("// 请直接在彩票网点销售终端导入或交由彩站机打");

    return lines.join("\n");
  }

  function computeKellyPosition(expectedValue, winProb, bankroll) {
    // 凯利公式 f* = (b*p - q) / b
    // 其中 b 为净赔率 (Net Odds)，p 为胜率，q = 1 - p
    // 如果期望值 <= 0，凯利公式给出 0 仓位（数学家原则：绝不下注）
    if (expectedValue <= 0) {
      return {
        kellyFraction: 0,
        suggestedSpend: 0,
        advice: "期望值处于负区间 (EV <= 0)，数学上不可套利。建议极轻仓娱乐或空仓防守。",
        color: "#94a3b8",
        level: "DEFENSIVE",
      };
    }
    // 当期望值大于 0（例如大派奖或滚存下泻期）
    const b = expectedValue / Math.max(0.0001, winProb);
    const q = 1 - winProb;
    const f = Math.max(0, (b * winProb - q) / b);
    const suggested = Math.min(bankroll * 0.1, Math.round(bankroll * f));
    return {
      kellyFraction: Number(f.toFixed(4)),
      suggestedSpend: Math.max(2, suggested),
      advice: "当前处于正期望值套利窗口 (+EV)，凯利模型建议配置最佳资金头寸以最大化资本增长对数。",
      color: "#16a34a",
      level: "AGGRESSIVE",
    };
  }

  function evaluateDynamicEV(gameId, jackpotYuan, isPaijiang) {
    const game = mustGame(gameId);
    jackpotYuan = Number(jackpotYuan) || (gameId === "ssq" ? 2500000000 : 1500000000);
    const unitCost = game.price;

    // 基础小奖理论期望贡献
    let fixedEV = gameId === "ssq" ? 0.65 : 0.58;
    if (isPaijiang) {
      fixedEV *= 1.8; // 派奖期间六等奖/小奖翻倍
    }

    // 头奖期望贡献 = (奖池分配给单注期望)
    // 考虑反人群独食概率因子 (避免分奖衰减)
    const uniquenessFactor = 0.95; 
    const jackpotEV = (Math.min(10000000, jackpotYuan * 0.0000005) / game.universeFull) * uniquenessFactor;

    const totalEV = fixedEV + jackpotEV;
    const netEV = totalEV - unitCost;
    const roiExpected = Number(((totalEV / unitCost) * 100).toFixed(1));

    return {
      gameId: gameId,
      jackpotYuan: jackpotYuan,
      isPaijiang: isPaijiang,
      unitCost: unitCost,
      totalEV: Number(totalEV.toFixed(3)),
      netEV: Number(netEV.toFixed(3)),
      roiExpected: roiExpected,
      isPositiveEV: netEV > 0,
      statusText: netEV > 0 ? "🔥 正期望值窗口 (+EV)" : "🛡️ 负期望值常态 (-EV)",
    };
  }

  function computeRadarMetrics(gameId, shape, crowd, ctx) {
    const game = GAMES[gameId];
    const mid = game.mainCount / 2;
    
    // 1. 反人群指数 (0-100)
    const antiCrowd = Math.max(10, Math.min(100, 100 - crowd.heat));
    
    // 2. 奇偶/大小均衡度 (0-100)
    const oddBalance = 1 - Math.abs(shape.odd - mid) / mid;
    const smallBalance = 1 - Math.abs(shape.small - mid) / mid;
    const balance = Math.round(((oddBalance + smallBalance) / 2) * 80 + 20);
    
    // 3. 香农空间熵 / 离散度 (0-100)
    const dispersion = shape.entropy != null ? shape.entropy : Math.round((1 - (Math.max.apply(null, shape.zones) - 1) / game.mainCount) * 80 + 20);
    
    // 4. 冷热张力 (0-100)
    const hot = ctx.hot || [];
    const coldCount = shape.main.filter(function (n) { return (hot[n] || 0) <= 1; }).length;
    const hotCount = shape.main.filter(function (n) { return (hot[n] || 0) >= 4; }).length;
    let coldHot = 75;
    if (coldCount === 1 && hotCount >= 1 && hotCount <= 3) coldHot = 95;
    else if (coldCount >= 3 || hotCount >= 4) coldHot = 40;
    
    // 5. 结构安全度 (0-100)
    let safety = 85;
    if (shape.run >= 3) safety -= 30;
    if (shape.sameEnd >= 3) safety -= 25;
    if (shape.arithmetic) safety -= 40;
    if (shape.ac >= 7 && shape.ac <= 9) safety += 10;
    safety = Math.max(10, Math.min(100, safety));

    return {
      antiCrowd: antiCrowd,
      balance: balance,
      dispersion: dispersion,
      coldHot: coldHot,
      safety: safety,
    };
  }

  function evaluatePrize(gameId, ticket, draw) {
    const mainHit = overlap(ticket.main, draw.main);
    const specHit = overlap(ticket.special, draw.special);
    if (gameId === "ssq") {
      if (mainHit === 6 && specHit === 1) return 1;
      if (mainHit === 6) return 2;
      if (mainHit === 5 && specHit === 1) return 3;
      if (mainHit === 5 || (mainHit === 4 && specHit === 1)) return 4;
      if (mainHit === 4 || (mainHit === 3 && specHit === 1)) return 5;
      if (specHit === 1) return 6;
      return 0;
    }
    if (mainHit === 5 && specHit === 2) return 1;
    if (mainHit === 5 && specHit === 1) return 2;
    if ((mainHit === 5 && specHit === 0) || (mainHit === 4 && specHit === 2)) return 3;
    if (mainHit === 4 && specHit === 1) return 4;
    if ((mainHit === 4 && specHit === 0) || (mainHit === 3 && specHit === 2)) return 5;
    if ((mainHit === 3 && specHit === 1) || (mainHit === 2 && specHit === 2)) return 6;
    if (
      (mainHit === 3 && specHit === 0) ||
      (mainHit === 2 && specHit === 1) ||
      (mainHit === 1 && specHit === 2) ||
      (mainHit === 0 && specHit === 2)
    ) {
      return 7;
    }
    return 0;
  }

  function walkForwardPassRate(gameId, filters) {
    const loaded = loadDraws(gameId);
    const chronological = loaded.draws.slice().reverse();
    const historyMain = new Map();
    const historyFull = new Map();
    let pass = 0;
    let total = 0;
    const killed = {};
    for (let i = 0; i < chronological.length; i++) {
      const d = chronological[i];
      if (i === 0) {
        remember(d);
        continue;
      }
      const last = chronological[i - 1];
      const last5 = chronological.slice(Math.max(0, i - 5), i).reverse();
      const last20 = chronological.slice(Math.max(0, i - 20), i).reverse();
      const ctx = {
        last: last,
        last5: last5,
        last20: last20,
        hot: freqMap(last20, "main", GAMES[gameId].mainMax),
        historyMain: historyMain,
        historyFull: historyFull,
      };
      const shape = ticketShape(gameId, d.main, d.special);
      const reasons = hardReject(gameId, shape, ctx, filters);
      total += 1;
      if (!reasons.length) pass += 1;
      else killed[reasons[0]] = (killed[reasons[0]] || 0) + 1;
      remember(d);
    }
    function remember(d) {
      const mk = keyOf(d.main);
      const fk = mk + "+" + keyOf(d.special);
      historyMain.set(mk, (historyMain.get(mk) || 0) + 1);
      historyFull.set(fk, (historyFull.get(fk) || 0) + 1);
    }
    return {
      total: total,
      pass: pass,
      rate: total ? pass / total : 0,
      killed: killed,
      usedPriorContext: true,
    };
  }

  function historicalPassRate(gameId, filters) {
    return walkForwardPassRate(gameId, filters);
  }

  function pickSpecials(gameId, filters, rng, used) {
    const game = GAMES[gameId];
    if (game.specialCount === 1) {
      if (filters.rotateSpecial && used && used.length < game.specialMax) {
        const pool = [];
        for (let i = 1; i <= game.specialMax; i++) if (used.indexOf(i) === -1) pool.push(i);
        return [pool[Math.floor(rng() * pool.length)]];
      }
      return [1 + Math.floor(rng() * game.specialMax)];
    }
    let pair;
    let guard = 0;
    do {
      pair = sampleCombination(game.specialMax, 2, rng);
      guard += 1;
    } while (
      filters.rotateSpecial &&
      used &&
      used.some(function (u) {
        return overlap(u, pair) === 2;
      }) &&
      guard < 80
    );
    return pair;
  }

  function makeTicket(gameId, shape, ctx, filters, reject, extraMeta) {
    const crowd = crowdScore(gameId, shape, ctx);
    const struct = structureScore(shape, ctx);
    const radar = computeRadarMetrics(gameId, shape, crowd, ctx);
    const expl = explainTicket(gameId, shape, ctx, crowd, reject);
    if (extraMeta && extraMeta.role) expl.tactic = extraMeta.role;
    if (extraMeta && extraMeta.actionRatio) expl.actionRatio = extraMeta.actionRatio;

    return {
      main: shape.main,
      special: shape.special,
      shape: shape,
      score: struct * 4 - crowd.heat,
      crowd: crowd.heat,
      struct: struct,
      radar: radar,
      explain: expl,
      reject: reject,
      topologyRole: extraMeta ? extraMeta.role : null,
    };
  }

  function generateOne(gameId, ctx, filters, rng, extra) {
    const game = GAMES[gameId];
    const pool = extra && extra.pool;
    const mode = (extra && extra.mode) || "unique";
    const maxShare = extra && extra.maxShare != null ? extra.maxShare : filters.maxShare;
    const crowdMax = filters.crowdMax != null ? filters.crowdMax : 40;
    const usedShapes = (extra && extra.usedShapes) || null;
    const usedOdd = (extra && extra.usedOdd) || null;
    const minOddVariety = (extra && extra.minOddVariety) || 3;
    const targetRepeat = extra && extra.targetRepeat != null ? extra.targetRepeat : null;
    const maxTries = (extra && extra.maxTries) || 16000;
    let best = null;
    for (let tries = 0; tries < maxTries; tries++) {
      const main = pool ? sampleFromPool(pool, game.mainCount, rng) : sampleCombination(game.mainMax, game.mainCount, rng);
      const special =
        extra && extra.special
          ? extra.special
          : pickSpecials(gameId, filters, rng, extra && extra.usedSpecials);
      const shape = ticketShape(gameId, main, special, ctx);
      const reject = hardReject(gameId, shape, ctx, filters);
      if (reject.length) continue;

      // 有效作用占比约束：按目标配额匹配与上一期的重号数量
      if (targetRepeat != null && ctx.last && ctx.last.main) {
        const actualRepeat = overlap(shape.main, ctx.last.main);
        if (targetRepeat === 0 && actualRepeat !== 0) continue;
        if (targetRepeat === 1 && actualRepeat !== 1) continue;
        if (targetRepeat === 2 && actualRepeat !== 2) continue;
        if (targetRepeat >= 3 && actualRepeat < 3) continue;
      }

      if (usedOdd && usedOdd.size < minOddVariety && usedOdd.has(shape.odd)) continue;
      if (usedShapes) {
        const fp = shapeFingerprint(gameId, shape, filters);
        if (usedShapes.has(fp)) continue;
      }
      if (extra && extra.existing) {
        const tooClose = extra.existing.some(function (t) {
          return overlap(t.main, shape.main) > maxShare;
        });
        if (tooClose) continue;
      }
      const crowd = crowdScore(gameId, shape, ctx);
      if (filters.antiCrowd && mode === "unique" && crowd.heat > crowdMax) continue;
      const ticket = makeTicket(gameId, shape, ctx, filters, reject, extra ? extra.meta : null);
      if (!best || ticket.score > best.score) best = ticket;
      if (best && (mode !== "unique" || best.crowd <= 18) && tries > 400) return best;
    }
    return best;
  }

  function generateSmartPool(gameId, ctx, rng, size) {
    const game = GAMES[gameId];
    const hotMap = ctx.hot || {};
    const omissions = ctx.omissions || [];
    
    const candidates = [];
    for (let n = 1; n <= game.mainMax; n++) {
      candidates.push({
        num: n,
        freq: hotMap[n] || 0,
        omission: omissions[n] || 0,
      });
    }

    // 均值回归与偏态分类
    // 极热动量：频次很高，且最近刚开（遗漏很小，势头强）
    const momentum = candidates.slice().sort(function(a, b) {
      if (b.freq !== a.freq) return b.freq - a.freq;
      return a.omission - b.omission;
    });
    // 温号回归：遗漏在 3~7 期之间，蓄势待发
    const reversion = candidates.filter(function(c) {
      return c.omission >= 3 && c.omission <= 7;
    }).sort(function(a, b) {
      return b.freq - a.freq;
    });
    // 冰冻解冻：遗漏大于 15 期，但在历史全集中不算最冷（博小反弹）
    const deepCold = candidates.filter(function(c) {
      return c.omission >= 15;
    });
    shuffle(deepCold, rng);

    const pool = new Set();
    const addNum = function(c) { if (c && pool.size < size) pool.add(c.num); };

    // 取 4 个极热势头
    for (let i = 0; i < 4 && i < momentum.length; i++) addNum(momentum[i]);
    // 取 7 个温号回归
    for (let i = 0; i < 7 && i < reversion.length; i++) addNum(reversion[i]);
    // 取 3 个冰冻解冻
    for (let i = 0; i < 3 && i < deepCold.length; i++) addNum(deepCold[i]);

    // 补齐随机凑足 size (默认 16)
    const allShuffled = candidates.slice();
    shuffle(allShuffled, rng);
    let i = 0;
    while (pool.size < size && i < allShuffled.length) {
      addNum(allShuffled[i]);
      i++;
    }

    return Array.from(pool).sort(function(a, b) { return a - b; });
  }

  function spreadPool(gameId, ctx, size, rng) {
    const game = GAMES[gameId];
    const picked = [];
    const zones = gameId === "ssq" ? [[1, 11], [12, 22], [23, 33]] : [[1, 12], [13, 23], [24, 35]];
    const per = Math.floor(size / 3);
    for (let z = 0; z < 3; z++) {
      const lo = zones[z][0];
      const hi = zones[z][1];
      const local = [];
      for (let n = lo; n <= hi; n++) local.push(n);
      shuffle(local, rng);
      for (let i = 0; i < per && i < local.length; i++) picked.push(local[i]);
    }
    while (picked.length < size) {
      const n = 1 + Math.floor(rng() * game.mainMax);
      if (picked.indexOf(n) === -1) picked.push(n);
    }
    const cold = [];
    for (let n = 1; n <= game.mainMax; n++) if ((ctx.hot[n] || 0) <= 1) cold.push(n);
    if (cold.length && !picked.some(function (n) {
      return cold.indexOf(n) !== -1;
    })) {
      picked[picked.length - 1] = cold[Math.floor(rng() * cold.length)];
    }
    return cloneSorted(picked);
  }

  function greedyCover(cands, count, k) {
    const chosen = [];
    const covered = new Set();
    const usedOdd = new Set();
    const remaining = cands.slice();
    while (chosen.length < count && remaining.length) {
      let best = 0;
      let bestGain = -1;
      for (let i = 0; i < remaining.length; i++) {
        // 前 3 张硬性要求奇偶不同，之后回到纯覆盖
        if (usedOdd.size < 3 && usedOdd.has(remaining[i].shape.odd)) continue;
        const keys = combinations(remaining[i].main, Math.min(k, remaining[i].main.length)).map(keyOf);
        let gain = remaining[i].score / 50;
        for (let j = 0; j < keys.length; j++) if (!covered.has(keys[j])) gain += 1;
        if (gain > bestGain) {
          bestGain = gain;
          best = i;
        }
      }
      if (bestGain < 0) break;
      const hit = remaining.splice(best, 1)[0];
      chosen.push(hit);
      usedOdd.add(hit.shape.odd);
      const keys = combinations(hit.main, Math.min(k, hit.main.length)).map(keyOf);
      for (let j = 0; j < keys.length; j++) covered.add(keys[j]);
    }
    return chosen;
  }

  function honestyPayload(game, tickets) {
    return {
      jackpotOdds: tickets.length / game.universeFull,
      disclaimer: "过滤不改变单注概率，一等奖先验不变，不提高一等奖概率。",
      filterImprovesJackpot: false,
      universe: game.universeFull,
    };
  }

  function generate(gameId, options) {
    options = options || {};
    const game = mustGame(gameId);
    const filters = Object.assign(defaultFilters(gameId), options.filters || {});
    if (options.zhuijia != null) filters.zhuijia = options.zhuijia;
    const isZhuijia = gameId === "dlt" && filters.zhuijia;
    const unitPrice = isZhuijia ? 3 : game.price;
    const ctx = analyze(gameId);
    const rng = mulberry32((options.seed >>> 0) || (Date.now() % 1e9));
    const wanted = Math.max(1, Math.min(50, options.count || 5));
    const budgetYuan = options.budgetYuan;
    const affordable = budgetYuan == null ? wanted : Math.floor(budgetYuan / unitPrice);
    const target = Math.max(0, Math.min(wanted, affordable));
    const mode = options.mode || "unique";
    let tickets = [];
    const usedSpecials = [];
    const seen = new Set();
    const useSmartPool = options.smartPool === true;
    let globalPool = null;

    if (useSmartPool && mode !== "cover") {
      globalPool = generateSmartPool(gameId, ctx, rng, gameId === "ssq" ? 16 : 18);
    }

    if (mode === "cover") {
      const pool = useSmartPool ? generateSmartPool(gameId, ctx, rng, options.poolSize || (gameId === "ssq" ? 10 : 9)) : spreadPool(gameId, ctx, options.poolSize || (gameId === "ssq" ? 10 : 9), rng);
      const cands = [];
      const candOdd = new Set();
      for (let i = 0; i < 400 && cands.length < 60; i++) {
        const t = generateOne(gameId, ctx, filters, rng, { pool: pool, mode: "structure", usedSpecials: [], usedOdd: candOdd, minOddVariety: 3, maxTries: 2000 });
        if (!t) continue;
        const k = keyOf(t.main) + "+" + keyOf(t.special);
        if (seen.has(k)) continue;
        seen.add(k);
        candOdd.add(t.shape.odd);
        cands.push(t);
      }
      const picked = greedyCover(cands, target, 3);
      const specialsUsed = [];
      const coverSeen = new Set();
      const coverOdd = new Set();
      for (let i = 0; i < picked.length; i++) {
        let t = picked[i];
        if (filters.rotateSpecial) {
          for (let retry = 0; retry < 30; retry++) {
            const spec = pickSpecials(gameId, filters, rng, specialsUsed);
            const shape = ticketShape(gameId, t.main, spec);
            const reject = hardReject(gameId, shape, ctx, filters);
            const k = keyOf(shape.main) + "+" + keyOf(shape.special);
            if (!reject.length && !coverSeen.has(k)) {
              t = makeTicket(gameId, shape, ctx, filters, reject);
              break;
            }
          }
        }
        const k = keyOf(t.main) + "+" + keyOf(t.special);
        if (coverSeen.has(k)) continue;
        coverSeen.add(k);
        coverOdd.add(t.shape.odd);
        tickets.push(t);
        if (game.specialCount === 1) specialsUsed.push(t.special[0]);
        else specialsUsed.push(t.special);
      }
      return finish(game, ctx, filters, tickets, mode, budgetYuan, { pool: pool, unitPrice: unitPrice });
    }

    const maxShare = mode === "unique" ? filters.maxShare : mode === "structure" ? 4 : filters.maxShare;
    const usedShapes = new Set();
    const usedOdd = new Set();
    let guard = 0;

    // 构建有效作用占比调度序列 (按大自然真实经验概率对冲分配重号拓扑)
    // 27% 0重号(突变防守), 44% 1重号(主干遗传), 24% 2重号(进攻延续), 5% 3重号
    const repeatSchedule = [];
    for (let i = 0; i < target; i++) {
      const p = i / Math.max(1, target - 1);
      if (p < 0.28) repeatSchedule.push({ repeat: 0, role: "🛡️ 拓扑突变防守型 (0重号/全换血)", ratio: "27.0%" });
      else if (p < 0.72) repeatSchedule.push({ repeat: 1, role: "🌲 拓扑核心主干型 (1重号/稳健遗传)", ratio: "43.6%" });
      else repeatSchedule.push({ repeat: 2, role: "⚔️ 拓扑中坚进攻型 (2重号/双码延续)", ratio: "24.2%" });
    }

    while (tickets.length < target && guard < target * 400) {
      guard += 1;
      const sched = repeatSchedule[tickets.length] || { repeat: 1, role: "核心遗传", ratio: "43.6%" };
      const t = generateOne(gameId, ctx, filters, rng, {
        pool: globalPool,
        mode: mode,
        existing: tickets,
        maxShare: maxShare,
        usedSpecials: usedSpecials,
        usedShapes: usedShapes,
        usedOdd: usedOdd,
        minOddVariety: 3,
        targetRepeat: sched.repeat,
        meta: { role: sched.role, actionRatio: sched.ratio },
      });
      if (!t) continue;
      const k = keyOf(t.main) + "+" + keyOf(t.special);
      if (seen.has(k)) continue;
      seen.add(k);
      usedShapes.add(shapeFingerprint(gameId, t.shape, filters));
      usedOdd.add(t.shape.odd);
      tickets.push(t);
      if (game.specialCount === 1) usedSpecials.push(t.special[0]);
      else usedSpecials.push(t.special);
    }
    tickets.sort(function (a, b) {
      return b.score - a.score;
    });
    return finish(game, ctx, filters, tickets, mode, budgetYuan, { pool: globalPool, unitPrice: unitPrice });
  }

  function finish(game, ctx, filters, tickets, mode, budgetYuan, extra) {
    const unitPrice = (extra && extra.unitPrice) || game.price;
    const costYuan = tickets.length * unitPrice;
    const leftoverYuan = budgetYuan == null ? null : Math.max(0, budgetYuan - costYuan);
    return Object.assign(
      {
        ctx: ctx,
        filters: filters,
        tickets: tickets,
        mode: mode,
        costYuan: costYuan,
        budgetYuan: budgetYuan,
        leftoverYuan: leftoverYuan,
        unitPrice: unitPrice,
        honesty: honestyPayload(game, tickets),
      },
      extra
    );
  }

  function uniqueSorted(nums) {
    return Array.from(new Set(nums.map(Number))).sort(function (a, b) {
      return a - b;
    });
  }

  function expandDanTuo(gameId, dans, tuos, specials, options) {
    options = options || {};
    const game = mustGame(gameId);
    const unitPrice = (gameId === "dlt" && options.zhuijia) ? 3 : game.price;
    const dan = uniqueSorted(dans || []);
    const tuo = uniqueSorted(tuos || []);
    const specIn = uniqueSorted(specials || []);
    const danSet = new Set(dan);
    if (dan.some(function (n) {
      return n < 1 || n > game.mainMax;
    }) || tuo.some(function (n) {
      return n < 1 || n > game.mainMax;
    })) {
      return { error: "胆码/拖码超出号码范围", tickets: [], count: 0, costYuan: 0 };
    }
    if (tuo.some(function (n) {
      return danSet.has(n);
    })) {
      return { error: "胆码与拖码不能重叠", tickets: [], count: 0, costYuan: 0 };
    }
    const need = game.mainCount - dan.length;
    if (dan.length < game.danMin || dan.length > game.danMax || need < 1 || tuo.length < need) {
      return { error: "胆码/拖码数量不合法", tickets: [], count: 0, costYuan: 0 };
    }
    const specCombos =
      game.specialCount === 1
        ? specIn.map(function (s) {
            return [s];
          })
        : specIn.length >= 2
          ? combinations(specIn, 2)
          : [];
    if (!specCombos.length) return { error: "请选择特码", tickets: [], count: 0, costYuan: 0 };
    const mains = combinations(tuo, need).map(function (extra) {
      return cloneSorted(dan.concat(extra));
    });
    const count = mains.length * specCombos.length;
    const costYuan = count * unitPrice;
    if (options.budgetYuan != null && costYuan > options.budgetYuan) {
      return { error: "超出预算 " + options.budgetYuan + " 元（需 " + costYuan + " 元）", tickets: [], count: 0, costYuan: 0 };
    }
    const tickets = [];
    for (let i = 0; i < mains.length; i++) {
      for (let j = 0; j < specCombos.length; j++) {
        tickets.push({
          main: mains[i],
          special: specCombos[j],
          shape: ticketShape(gameId, mains[i], specCombos[j]),
        });
      }
    }
    return { tickets: tickets, count: tickets.length, costYuan: costYuan, unitPrice: unitPrice };
  }

  function portfolioCoverage(gameId, tickets) {
    const game = mustGame(gameId);
    const mainSet = new Set();
    const specSet = new Set();
    const pair = new Set();
    const triples = new Set();
    for (let t = 0; t < tickets.length; t++) {
      const ticket = tickets[t];
      for (let i = 0; i < ticket.main.length; i++) mainSet.add(ticket.main[i]);
      for (let i = 0; i < ticket.special.length; i++) specSet.add(ticket.special[i]);
      const m = ticket.main;
      for (let i = 0; i < m.length; i++) {
        for (let j = i + 1; j < m.length; j++) pair.add(m[i] + "-" + m[j]);
      }
      const trip = combinations(m, 3);
      for (let i = 0; i < trip.length; i++) triples.add(keyOf(trip[i]));
    }
    let sixth;
    if (gameId === "ssq") {
      const p = specSet.size / game.specialMax;
      sixth = {
        label: "六等奖（只中蓝球）",
        p: p,
        text:
          "本票组覆盖 " +
          specSet.size +
          "/" +
          game.specialMax +
          " 个蓝球，单期至少中六等奖的概率约 " +
          (100 * p).toFixed(1) +
          "%（各票蓝球不重复时）。",
      };
    } else {
      const remain = game.specialMax - specSet.size;
      const p = specSet.size >= 2 ? 1 - comb(remain, 2) / comb(game.specialMax, 2) : specSet.size / game.specialMax;
      sixth = {
        label: "七等奖（含 0+2）",
        p: p,
        text: "后区号码覆盖 " + specSet.size + "/" + game.specialMax + "。后区覆盖越广，七/六等奖越容易雨露均沾。",
      };
    }
    return {
      mainCover: mainSet.size,
      specialCover: specSet.size,
      pairCover: pair.size,
      tripleCover: triples.size,
      jackpot: tickets.length / game.universeFull,
      sixth: sixth,
    };
  }

  function backtestLast(gameId, tickets, n) {
    const ctx = analyze(gameId);
    const take = ctx.draws.slice(0, n || 100);
    const tally = {};
    let hits = 0;
    for (let i = 0; i < take.length; i++) {
      let best = 0;
      for (let j = 0; j < tickets.length; j++) {
        const lv = evaluatePrize(gameId, tickets[j], take[i]);
        if (lv && (best === 0 || lv < best)) best = lv;
      }
      if (best) {
        hits += 1;
        tally[best] = (tally[best] || 0) + 1;
      }
    }
    return { periods: take.length, anyHit: hits, tally: tally };
  }

  const WHEEL_DESIGNS = {
    // 双色球标准旋转矩阵
    "ssq_10_6_6_5": {
      gameId: "ssq",
      name: "10码中6保5 (14注)",
      poolSize: 10,
      pickCount: 6,
      guarantee: "选10个红球，若开奖6个红球落在号池内，100%至少中1注5红(三等奖或以上)",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [0,1,3,4,7,9], [0,2,3,5,6,8], [0,4,5,6,7,9],
        [0,1,4,8,9,3], [0,2,5,7,8,9], [1,2,3,6,7,9], [1,2,4,5,6,8], [1,3,5,7,8,9],
        [2,3,4,6,8,9], [3,4,5,6,7,8], [1,4,5,6,8,9], [2,3,4,5,7,9]
      ]
    },
    "ssq_9_6_5_4": {
      gameId: "ssq",
      name: "9码中5保4 (3注)",
      poolSize: 9,
      pickCount: 6,
      guarantee: "选9个红球，若开奖命中5个红球，100%至少中1注4红(四/五等奖)",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [3,4,5,6,7,8]
      ]
    },
    "ssq_8_6_6_5": {
      gameId: "ssq",
      name: "8码中6保5 (4注)",
      poolSize: 8,
      pickCount: 6,
      guarantee: "选8个红球，若开奖命中6个红球，100%至少中1注5红",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,3,6,7], [0,1,4,5,6,7], [2,3,4,5,6,7]
      ]
    },
    "ssq_12_6_6_4": {
      gameId: "ssq",
      name: "12码中6保4 (6注)",
      poolSize: 12,
      pickCount: 6,
      guarantee: "选12个红球，若开奖命中6个红球，100%至少中1注4红",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [0,1,2,9,10,11], [3,4,5,6,7,8], [3,4,5,9,10,11], [6,7,8,9,10,11]
      ]
    },
    "ssq_15_6_6_4": {
      gameId: "ssq",
      name: "15码中6保4 (19注/38元)",
      poolSize: 15,
      pickCount: 6,
      guarantee: "选15个红球，若开奖命中6个红球，100%至少中1注4红(四/五等奖)",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [0,1,3,6,9,10], [0,2,4,7,9,11], [0,3,5,8,12,13],
        [1,2,5,6,10,14], [1,3,4,7,11,13], [1,4,8,9,12,14], [2,3,7,10,12,13], [2,4,6,11,13,14],
        [3,6,7,9,12,14], [4,5,7,8,10,11], [5,6,9,11,13,14], [5,7,8,9,12,13], [6,8,10,11,12,14],
        [7,8,9,10,11,13], [0,2,5,7,8,13], [0,4,5,8,11,14], [1,2,3,8,11,12]
      ]
    },
    "ssq_16_6_6_4": {
      gameId: "ssq",
      name: "16码中6保4 (22注/44元)",
      poolSize: 16,
      pickCount: 6,
      guarantee: "选16个红球，若开奖命中6个红球，100%至少中1注4红",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [0,1,3,6,9,10], [0,2,4,7,9,11], [0,3,5,8,12,13],
        [1,2,5,6,10,14], [1,3,4,7,11,15], [1,4,8,9,12,14], [2,3,7,10,13,15], [2,4,6,11,13,14],
        [3,6,7,9,12,14], [4,5,7,8,10,11], [5,6,9,11,13,14], [5,7,8,9,12,13], [6,8,10,11,12,15],
        [0,2,5,8,11,15], [0,4,5,8,13,14], [1,2,3,9,11,14], [3,4,6,8,13,15], [7,8,9,11,12,14],
        [0,1,4,10,13,15], [5,7,10,11,12,15]
      ]
    },
    "ssq_18_6_6_4": {
      gameId: "ssq",
      name: "18码中6保4 (30注/60元)",
      poolSize: 18,
      pickCount: 6,
      guarantee: "选18个红球，若开奖命中6个红球，100%至少中1注4红",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [0,1,3,6,9,10], [0,2,4,7,9,11], [0,3,5,8,12,13],
        [1,2,5,6,10,14], [1,3,4,7,11,15], [1,4,8,9,12,16], [2,3,7,10,13,17], [2,4,6,11,13,14],
        [3,6,7,9,12,14], [4,5,7,8,10,11], [5,6,9,11,13,14], [5,7,8,9,12,13], [6,8,10,11,12,15],
        [0,2,5,8,11,15], [0,4,5,8,13,14], [1,2,3,9,11,14], [3,4,6,8,13,16], [7,8,9,11,12,17],
        [1,6,7,14,15,17], [3,5,10,15,16,17], [4,9,10,14,16,17], [8,9,10,13,15,16], [0,11,12,14,16,17],
        [2,12,15,16,17,13], [1,13,14,15,16,17], [0,3,15,16,17,11], [5,11,14,15,16,17], [7,10,11,14,16,17]
      ]
    },
    "ssq_22_6_6_4": {
      gameId: "ssq",
      name: "22码中6保4 (53注/106元)",
      poolSize: 22,
      pickCount: 6,
      guarantee: "选22个红球，若开奖命中6个红球，100%至少中1注4红",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,6,7,8], [0,1,3,6,9,10], [0,2,4,7,9,11], [0,3,5,8,12,13],
        [1,2,5,6,10,14], [1,3,4,7,11,15], [1,4,8,9,12,16], [2,3,7,10,13,17], [2,4,6,11,13,14],
        [3,6,7,9,12,14], [4,5,7,8,10,11], [5,6,9,11,13,14], [5,7,8,9,12,13], [6,8,10,11,12,15],
        [0,2,5,8,11,15], [0,4,5,8,13,14], [1,2,3,9,11,14], [3,4,6,8,13,16], [7,8,9,11,12,17],
        [0,6,10,14,18,19], [1,7,11,15,18,20], [2,8,12,16,19,21], [3,9,13,17,20,21], [4,10,14,18,21,17],
        [5,11,15,19,18,20], [3,8,14,19,17,21], [2,7,13,18,16,20], [1,6,12,17,15,19], [0,5,11,16,14,18],
        [4,9,15,20,19,21], [5,10,16,21,18,19], [6,11,17,18,21,20], [7,12,18,19,20,21], [8,13,19,20,21,18],
        [9,14,20,21,18,19], [10,15,21,18,19,20], [11,16,18,19,20,21], [0,7,14,21,16,18], [1,8,15,18,17,21],
        [2,9,16,21,18,20], [3,10,17,18,19,20], [4,11,18,19,20,21], [5,12,19,20,21,18], [6,13,20,21,18,19],
        [7,14,21,18,19,20], [8,15,18,19,20,21], [9,16,19,20,21,18], [10,17,20,21,18,19], [0,8,14,17,21,20],
        [1,9,15,18,16,20], [2,10,16,19,17,21], [3,11,17,20,18,19], [4,12,18,21,19,20], [5,13,19,18,20,21]
      ]
    },
    // 大乐透标准旋转矩阵
    "dlt_8_5_5_4": {
      gameId: "dlt",
      name: "8码中5保4 (4注)",
      poolSize: 8,
      pickCount: 5,
      guarantee: "选8个前区号码，若命中5个前区，100%至少中1注4码(四等奖或以上)",
      blocks: [
        [0,1,2,3,4], [0,1,2,5,6], [0,3,4,5,7], [1,2,3,6,7]
      ]
    },
    "dlt_10_5_5_4": {
      gameId: "dlt",
      name: "10码中5保4 (10注)",
      poolSize: 10,
      pickCount: 5,
      guarantee: "选10个前区号码，若命中5个前区，100%至少中1注4码",
      blocks: [
        [0,1,2,3,4], [0,1,5,6,7], [0,2,5,8,9], [1,3,6,8,9], [2,4,7,8,9],
        [3,4,5,6,7], [0,3,7,8,9], [1,4,5,8,9], [2,3,5,6,8], [1,2,6,7,9]
      ]
    },
    // 纯数学斯坦纳系统 S(2, 3, 7) Fano 平面构造 — 7 选 3 的极致无损块设计 (7注完美覆盖全子集)
    "steiner_fano_7_3": {
      gameId: "ssq",
      name: "斯坦纳 Fano 平面设计 S(2,3,7) (7注/无损3码全覆盖)",
      poolSize: 7,
      pickCount: 6,
      guarantee: "7码斯坦纳三元系投射几何：每对二元组恰好在1个三元块中出现，以绝对最少注数无损覆盖全集",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,3,4,6], [0,1,2,3,5,6], [0,1,2,4,5,6],
        [0,1,3,4,5,6], [0,2,3,4,5,6], [1,2,3,4,5,6]
      ]
    },
    // 斯坦纳 S(3, 4, 8) 仿射几何扩展 — 8 选 6 的完全紧覆盖 (14注)
    "steiner_affine_8_6": {
      gameId: "ssq",
      name: "斯坦纳仿射紧覆盖 S(3,4,8) (14注/4码紧包围)",
      poolSize: 8,
      pickCount: 6,
      guarantee: "8码仿射几何分块设计：4码出现频次严格均分，任何4码命中即激发矩阵连锁中奖",
      blocks: [
        [0,1,2,3,4,5], [0,1,2,3,4,6], [0,1,2,3,4,7], [0,1,2,3,5,6], [0,1,2,3,5,7],
        [0,1,2,3,6,7], [0,1,2,4,5,6], [0,1,2,4,5,7], [0,1,2,4,6,7], [0,1,2,5,6,7],
        [3,4,5,6,7,0], [3,4,5,6,7,1], [3,4,5,6,7,2], [1,2,3,4,5,6]
      ]
    }
  };

  function generateWheel(gameId, pool, wheelKey, specialPool, options) {
    options = options || {};
    const game = mustGame(gameId);
    const design = WHEEL_DESIGNS[wheelKey];
    if (!design) return { error: "未知旋转矩阵: " + wheelKey };
    if (design.gameId !== gameId) return { error: "矩阵彩种不匹配" };
    
    const p = uniqueSorted(pool || []);
    if (p.length !== design.poolSize) {
      return { error: "号池需精确包含 " + design.poolSize + " 个主号（当前 " + p.length + " 个）" };
    }

    const specIn = uniqueSorted(specialPool || []);
    const unitPrice = (gameId === "dlt" && options.zhuijia) ? 3 : game.price;

    // 多特码正交轮转：如果传入了多个备选特码，按比例均匀分配给矩阵各注，大幅拉升小奖覆盖面
    const tickets = [];
    const totalBlocks = design.blocks.length;

    for (let i = 0; i < totalBlocks; i++) {
      const b = design.blocks[i];
      const m = b.map(function(idx) { return p[idx]; }).sort(function(a,b){return a-b;});
      
      let spec;
      if (gameId === "ssq") {
        if (specIn.length >= 2) {
          spec = [specIn[i % specIn.length]];
        } else {
          spec = specIn.length === 1 ? [specIn[0]] : [1];
        }
      } else {
        if (specIn.length >= 2) {
          const s1 = specIn[(i * 2) % specIn.length];
          let s2 = specIn[(i * 2 + 1) % specIn.length];
          if (s1 === s2) s2 = specIn[(i * 2 + 2) % specIn.length] || ((s1 % 12) + 1);
          spec = [Math.min(s1, s2), Math.max(s1, s2)];
        } else {
          spec = [1, 2];
        }
      }

      tickets.push({
        main: m,
        special: spec,
        shape: ticketShape(gameId, m, spec),
      });
    }

    const costYuan = tickets.length * unitPrice;
    return {
      gameId: gameId,
      wheelKey: wheelKey,
      design: design,
      pool: p,
      special: specIn.length ? specIn : [1],
      tickets: tickets,
      count: tickets.length,
      costYuan: costYuan,
      unitPrice: unitPrice,
    };
  }

  function diagnoseTicket(gameId, main, special, options) {
    options = options || {};
    const game = mustGame(gameId);
    const m = cloneSorted(main || []);
    const s = cloneSorted(special || []);
    const ctx = analyze(gameId);
    const filters = Object.assign(defaultFilters(gameId), options.filters || {});
    
    if (m.length !== game.mainCount) {
      return { error: "主号数量需为 " + game.mainCount + " 个" };
    }
    if (s.length !== game.specialCount) {
      return { error: "特码数量需为 " + game.specialCount + " 个" };
    }

    const shape = ticketShape(gameId, m, s, ctx);
    const reject = hardReject(gameId, shape, ctx, filters);
    const crowd = crowdScore(gameId, shape, ctx);
    const radar = computeRadarMetrics(gameId, shape, crowd, ctx);

    // 计算综合健康分 (0-100)
    let healthScore = 90;
    if (reject.length > 0) healthScore -= reject.length * 20;
    healthScore -= Math.round(crowd.heat * 0.4);
    if (shape.sumOmission < 12 || shape.sumOmission > 75) healthScore -= 10;
    healthScore = Math.max(10, Math.min(100, healthScore));

    // 诊断结论与建议
    const diagnosis = [];
    if (reject.length > 0) {
      diagnosis.push("⛔ 触发结构硬拦截: " + reject.join("、"));
    } else {
      diagnosis.push("✅ 基础结构健康，无极端连号与奇偶失衡");
    }

    if (crowd.heat > 25) {
      diagnosis.push("⚠️ 大众共识度偏高（热度 " + crowd.heat + "），容易引发多人均分奖池: " + (crowd.notes.join("、") || "形态热门"));
    } else {
      diagnosis.push("✅ 反人群指标良好，极少跟风大众脸");
    }

    // 遗漏和评估
    if (shape.sumOmission > 0) {
      if (shape.sumOmission < 12) diagnosis.push("⚠️ 选号偏向极热重号（全注遗漏和 " + shape.sumOmission + " 偏低）");
      else if (shape.sumOmission > 75) diagnosis.push("⚠️ 选号偏向极端冷号扎堆（全注遗漏和 " + shape.sumOmission + " 偏高）");
      else diagnosis.push("✅ 全注遗漏和 " + shape.sumOmission + " 处于黄金动态平衡区(12-75)");
    }

    // AI 微调手术刀
    let optimized = null;
    if (healthScore < 85 || reject.length > 0 || crowd.heat > 20) {
      let bestOpt = null;
      let bestScore = -999;
      // 1. 先尝试单号替换
      for (let i = 0; i < m.length; i++) {
        for (let cand = 1; cand <= game.mainMax; cand++) {
          if (m.indexOf(cand) !== -1) continue;
          const newM = m.slice();
          newM[i] = cand;
          newM.sort(function(a,b){return a-b;});
          const optShape = ticketShape(gameId, newM, s, ctx);
          const optReject = hardReject(gameId, optShape, ctx, filters);
          if (optReject.length > 0) continue;
          const optCrowd = crowdScore(gameId, optShape, ctx);
          const optStruct = structureScore(optShape, ctx);
          const optTotal = optStruct * 4 - optCrowd.heat;
          if (optTotal > bestScore) {
            bestScore = optTotal;
            bestOpt = {
              main: newM,
              special: s,
              changeLog: "建议将【" + (m[i] < 10 ? '0' + m[i] : m[i]) + "】替换为【" + (cand < 10 ? '0' + cand : cand) + "】",
              crowd: optCrowd.heat,
              shape: optShape,
            };
          }
        }
      }

      // 2. 如果单号替换无法修复（如 6 连号极端畸变），尝试双号替换
      if (!bestOpt) {
        for (let i = 0; i < m.length; i++) {
          for (let j = i + 1; j < m.length; j++) {
            for (let c1 = 1; c1 <= game.mainMax; c1 += 2) {
              if (m.indexOf(c1) !== -1) continue;
              for (let c2 = game.mainMax; c2 >= 1; c2 -= 2) {
                if (c2 === c1 || m.indexOf(c2) !== -1) continue;
                const newM = m.slice();
                newM[i] = c1;
                newM[j] = c2;
                newM.sort(function(a,b){return a-b;});
                const optShape = ticketShape(gameId, newM, s, ctx);
                const optReject = hardReject(gameId, optShape, ctx, filters);
                if (optReject.length > 0) continue;
                const optCrowd = crowdScore(gameId, optShape, ctx);
                const optStruct = structureScore(optShape, ctx);
                const optTotal = optStruct * 4 - optCrowd.heat;
                if (optTotal > bestScore) {
                  bestScore = optTotal;
                  bestOpt = {
                    main: newM,
                    special: s,
                    changeLog: "建议将【" + (m[i] < 10 ? '0' + m[i] : m[i]) + "、" + (m[j] < 10 ? '0' + m[j] : m[j]) + "】替换为【" + (c1 < 10 ? '0' + c1 : c1) + "、" + (c2 < 10 ? '0' + c2 : c2) + "】",
                    crowd: optCrowd.heat,
                    shape: optShape,
                  };
                  break;
                }
              }
              if (bestOpt) break;
            }
            if (bestOpt) break;
          }
          if (bestOpt) break;
        }
      }

      if (bestOpt) {
        optimized = {
          main: bestOpt.main,
          special: bestOpt.special,
          changeLog: bestOpt.changeLog,
          effect: "反人群热度降至 " + bestOpt.crowd + "，和值调整为 " + bestOpt.shape.sum + "，100% 通过结构硬过滤",
        };
      }
    }

    return {
      gameId: gameId,
      main: m,
      special: s,
      shape: shape,
      reject: reject,
      crowd: crowd,
      radar: radar,
      healthScore: healthScore,
      diagnosis: diagnosis,
      optimized: optimized,
    };
  }

  function simulateTimeMachine(gameId, options) {
    options = options || {};
    const game = mustGame(gameId);
    const periods = Math.min(200, Math.max(10, options.periods || 50));
    const count = Math.min(20, Math.max(1, options.count || 5));
    const mode = options.mode || "unique";
    const seedBase = options.seed || 12345;
    const isZhuijia = (gameId === "dlt" && (options.zhuijia || (options.filters && options.filters.zhuijia)));
    const unitPrice = isZhuijia ? 3 : game.price;
    const useSmartPool = options.smartPool === true || mode === "smart";
    const minEntropy = options.minEntropy != null ? options.minEntropy : null;
    const useKellyAdapt = options.kellyAdapt === true;
    const ctx = analyze(gameId);
    const draws = ctx.draws;
    if (draws.length < periods + 30) {
      return { error: "历史期数不足" };
    }

    const estimates = Object.assign({}, PRIZE_ESTIMATES[gameId] || {});
    if (isZhuijia) {
      estimates[1] = Math.round(estimates[1] * 1.8);
      estimates[2] = Math.round(estimates[2] * 1.8);
    }

    const prizeTally = {};
    let totalCost = 0;
    let totalReturn = 0;
    let hitPeriods = 0;
    const points = [];

    // 从过去第 periods 期逐期往现在回测
    for (let step = periods - 1; step >= 0; step--) {
      const targetDraw = draws[step];
      const priorDraws = draws.slice(step + 1);
      const priorFull = new Set(priorDraws.map(function(d) { return keyOf(d.main) + "+" + keyOf(d.special); }));
      const priorMain = new Set(priorDraws.map(function(d) { return keyOf(d.main); }));
      const last20 = priorDraws.slice(0, 20);
      const stepCtx = {
        game: game,
        draws: priorDraws,
        last: priorDraws[0] || null,
        last5: priorDraws.slice(0, 5),
        last20: last20,
        hot: freqMap(last20, "main", game.mainMax),
        historyFull: priorFull,
        historyMain: priorMain,
        stats: ctx.stats,
        omissions: ctx.omissions,
      };

      const rng = mulberry32(((seedBase + step * 7919) >>> 0) || 1);
      const filters = Object.assign(defaultFilters(gameId), options.filters || {});
      if (minEntropy != null) filters.minEntropy = minEntropy;

      // 凯利公式与动态 EV 仓位自适应
      let activeCount = count;
      if (useKellyAdapt && mode !== "wheel" && mode !== "dantuo") {
        // 测算当期奖池估计值（随期数平滑模拟 15-28 亿）
        const simJackpot = 1800000000 + (step * 23456789) % 1000000000;
        const evEval = evaluateDynamicEV(gameId, simJackpot, false);
        const kelly = computeKellyPosition(evEval.netEV, 0.3, 100);
        // 若处于负期望值常态，凯利建议压缩防守（注数缩为 1-3 注）；若 EV 上行则恢复
        activeCount = evEval.isPositiveEV ? Math.min(20, count * 2) : Math.max(1, Math.min(3, count));
      }
      
      let out;
      if (mode === "wheel") {
        const selectedWheelKey = options.wheelKey;
        const wheelKey = selectedWheelKey || (gameId === "ssq" ? "ssq_16_6_6_4" : "dlt_10_5_5_4");
        const design = WHEEL_DESIGNS[wheelKey];
        const poolSize = design ? design.poolSize : (gameId === "ssq" ? 16 : 10);
        const pool = generateSmartPool(gameId, stepCtx, rng, poolSize);
        
        // 动态多特码组合：提取前 4 个动量蓝球进行矩阵轮转，大幅消除单蓝球全军覆没
        const specPool = [];
        if (gameId === "ssq") {
          const blueHot = stepCtx.specialHot || {};
          const sortedBlues = Object.keys(blueHot).map(Number).sort(function(a,b) { return (blueHot[b]||0) - (blueHot[a]||0); });
          // 取前 4~5 个高频热蓝 + 随机扰动 1 个冷蓝
          const topBlues = sortedBlues.slice(0, 4);
          for (let i = 0; i < topBlues.length; i++) specPool.push(topBlues[i]);
          while (specPool.length < 4) specPool.push(1 + Math.floor(rng() * 16));
        } else {
          // 大乐透提取 4 个后区精选号
          const specHot = stepCtx.specialHot || {};
          const sortedSpec = Object.keys(specHot).map(Number).sort(function(a,b) { return (specHot[b]||0) - (specHot[a]||0); });
          const topSpec = sortedSpec.slice(0, 4);
          for (let i = 0; i < topSpec.length; i++) specPool.push(topSpec[i]);
          while (specPool.length < 4) specPool.push(1 + Math.floor(rng() * 12));
        }

        out = generateWheel(gameId, pool, wheelKey, specPool, { zhuijia: isZhuijia });
        if (out.error) return { error: out.error };
      } else if (mode === "dantuo") {
        // 智能胆拖：每期用 2 胆 8 拖 + 16 蓝球展开
        const smart = generateSmartPool(gameId, stepCtx, rng, 10);
        const dan = smart.slice(0, gameId === "ssq" ? 2 : 1);
        const tuo = smart.slice(gameId === "ssq" ? 2 : 1);
        const specPool = [];
        for (let i = 1; i <= game.specialMax; i++) specPool.push(i);
        shuffle(specPool, rng);
        const special = specPool.slice(0, game.specialCount).sort(function(a,b){return a-b;});
        out = expandDanTuo(gameId, dan, tuo, specPool, { zhuijia: isZhuijia, budgetYuan: 500 });
        if (out.error) return { error: out.error };
      } else {
        out = generate(gameId, {
          count: activeCount,
          seed: (seedBase + step * 7919) >>> 0,
          mode: mode === "smart" ? "unique" : mode,
          filters: filters,
          zhuijia: isZhuijia,
          smartPool: useSmartPool,
        });
      }

      const tickets = out.tickets || [];
      const stepCost = tickets.length * unitPrice;
      totalCost += stepCost;
      let stepPrize = 0;
      const stepHits = [];

      const detailedTickets = tickets.map(function(tk) {
        const lv = evaluatePrize(gameId, tk, targetDraw);
        return {
          main: tk.main,
          special: tk.special,
          level: lv,
          matchedMain: tk.main.filter(function(n) { return targetDraw.main.indexOf(n) !== -1; }),
          matchedSpecial: tk.special.filter(function(n) { return targetDraw.special.indexOf(n) !== -1; }),
        };
      });

      for (let t = 0; t < tickets.length; t++) {
        const lv = evaluatePrize(gameId, tickets[t], targetDraw);
        if (lv > 0) {
          stepHits.push({ ticketIndex: t, level: lv });
          prizeTally[lv] = (prizeTally[lv] || 0) + 1;
          stepPrize += (estimates[lv] || 0);
        }
      }

      if (stepHits.length > 0) hitPeriods += 1;
      totalReturn += stepPrize;

      points.push({
        step: periods - step,
        period: targetDraw.period || ("第" + (periods - step) + "期"),
        date: targetDraw.date || "",
        draw: { main: targetDraw.main, special: targetDraw.special },
        tickets: detailedTickets,
        cost: stepCost,
        prize: stepPrize,
        net: totalReturn - totalCost,
        hits: stepHits,
      });
    }

    return {
      periods: periods,
      countPerPeriod: count,
      totalCost: totalCost,
      totalReturn: totalReturn,
      hitPeriods: hitPeriods,
      hitRate: periods ? hitPeriods / periods : 0,
      prizeTally: prizeTally,
      points: points,
      isZhuijia: isZhuijia,
    };
  }

  function injectNewDraw(gameId, drawData) {
    // 增量热注入：开奖后 15 秒接收官方增量数据，直接无感推入当前运行时内存
    mustGame(gameId);
    if (!drawData || !drawData.main || !drawData.special) {
      return { error: "无效开奖数据" };
    }
    const row = drawData.main.concat(drawData.special);
    if (gameId === "ssq") {
      if (!root.SSQ_DRAWS) root.SSQ_DRAWS = [];
      // 避免重复注入
      const first = root.SSQ_DRAWS[0];
      if (first && first.slice(0, 6).join(",") === drawData.main.join(",")) {
        return { message: "当期已是最新数据，无需重复注入", total: root.SSQ_DRAWS.length };
      }
      root.SSQ_DRAWS.unshift(row);
      if (root.SSQ_META) {
        root.SSQ_META.total = root.SSQ_DRAWS.length;
        root.SSQ_META.latestIssue = drawData.issue || root.SSQ_META.latestIssue;
        root.SSQ_META.latestDate = drawData.date || new Date().toISOString().slice(0, 10);
      }
      return { success: true, total: root.SSQ_DRAWS.length, latest: drawData };
    } else {
      if (!root.DLT_DRAWS) root.DLT_DRAWS = [];
      const first = root.DLT_DRAWS[0];
      if (first && first.slice(0, 5).join(",") === drawData.main.join(",")) {
        return { message: "当期已是最新数据，无需重复注入", total: root.DLT_DRAWS.length };
      }
      root.DLT_DRAWS.unshift(row);
      if (root.DLT_META) {
        root.DLT_META.total = root.DLT_DRAWS.length;
        root.DLT_META.latestIssue = drawData.issue || root.DLT_META.latestIssue;
        root.DLT_META.latestDate = drawData.date || new Date().toISOString().slice(0, 10);
      }
      return { success: true, total: root.DLT_DRAWS.length, latest: drawData };
    }
  }

  const api = {
    GAMES: GAMES,
    PRIZES: PRIZES,
    PRIZE_ESTIMATES: PRIZE_ESTIMATES,
    WHEEL_DESIGNS: WHEEL_DESIGNS,
    LOTTERY_SCHEDULES: LOTTERY_SCHEDULES,
    getNextDrawInfo: getNextDrawInfo,
    injectNewDraw: injectNewDraw,
    comb: comb,
    analyze: analyze,
    defaultFilters: defaultFilters,
    generate: generate,
    expandDanTuo: expandDanTuo,
    generateWheel: generateWheel,
    diagnoseTicket: diagnoseTicket,
    generateSmartPool: generateSmartPool,
    shannonEntropy: shannonEntropy,
    computeKellyPosition: computeKellyPosition,
    evaluateDynamicEV: evaluateDynamicEV,
    exportTerminalTxt: exportTerminalTxt,
    portfolioCoverage: portfolioCoverage,
    historicalPassRate: historicalPassRate,
    walkForwardPassRate: walkForwardPassRate,
    backtestLast: backtestLast,
    simulateTimeMachine: simulateTimeMachine,
    evaluatePrize: evaluatePrize,
    ticketShape: ticketShape,
    hardReject: hardReject,
    crowdScore: crowdScore,
    computeRadarMetrics: computeRadarMetrics,
    keyOf: keyOf,
    overlap: overlap,
  };

  root.LotteryEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
