const fs = require("fs");
const path = require("path");

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function maxConsecutive(nums) {
  let max = 1;
  let cur = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1] + 1) {
      cur += 1;
      if (cur > max) max = cur;
    } else cur = 1;
  }
  return max;
}

function consecutiveGroups(nums) {
  const groups = [];
  let start = nums[0];
  let len = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1] + 1) len += 1;
    else {
      if (len >= 2) groups.push(len);
      start = nums[i];
      len = 1;
    }
  }
  if (len >= 2) groups.push(len);
  return groups;
}

function oddCount(nums) {
  return nums.filter((n) => n % 2 === 1).length;
}

function acValue(nums) {
  const diffs = new Set();
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) diffs.add(nums[j] - nums[i]);
  }
  return diffs.size - (nums.length - 1);
}

function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}

function span(nums) {
  return nums[nums.length - 1] - nums[0];
}

function zoneCounts(nums, zones) {
  return zones.map(([lo, hi]) => nums.filter((n) => n >= lo && n <= hi).length);
}

function endings(nums) {
  const m = new Map();
  for (const n of nums) {
    const e = n % 10;
    m.set(e, (m.get(e) || 0) + 1);
  }
  return m;
}

function maxSameEnding(nums) {
  return Math.max(...endings(nums).values());
}

function isArithmetic(nums) {
  if (nums.length < 3) return false;
  const d = nums[1] - nums[0];
  if (d === 0) return false;
  for (let i = 2; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] !== d) return false;
  }
  return true;
}

function overlap(a, b) {
  const set = new Set(b);
  return a.filter((n) => set.has(n)).length;
}

function pct(n, total) {
  return ((100 * n) / total).toFixed(2) + "%";
}

function histogram(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

function quantile(sorted, q) {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function analyzeSSQ(draws) {
  const total = draws.length;
  const reds = draws.map((d) => [...d.redBalls].sort((a, b) => a - b));
  const blues = draws.map((d) => d.blueBall);
  const redKeys = reds.map((r) => r.join(","));
  const fullKeys = draws.map((d) => [...d.redBalls].sort((a, b) => a - b).join(",") + "+" + d.blueBall);

  const maxRun = reds.map(maxConsecutive);
  const groups = reds.map(consecutiveGroups);
  const odds = reds.map(oddCount);
  const small = reds.map((r) => r.filter((n) => n <= 16).length);
  const sums = reds.map(sum);
  const spans = reds.map(span);
  const acs = reds.map(acValue);
  const zones = reds.map((r) => zoneCounts(r, [[1, 11], [12, 22], [23, 33]]));
  const sameEnd = reds.map(maxSameEnding);
  const arith = reds.filter(isArithmetic).length;
  const allBirthday = reds.filter((r) => r.every((n) => n <= 31)).length;
  const allLe31 = allBirthday;
  const has01or02or03start = reds.filter((r) => r[0] <= 3).length;

  const runHist = Object.fromEntries(histogram(maxRun));
  const oddHist = Object.fromEntries(histogram(odds));
  const smallHist = Object.fromEntries(histogram(small));
  const acHist = Object.fromEntries(histogram(acs));
  const endHist = Object.fromEntries(histogram(sameEnd));
  const blueHist = Object.fromEntries(histogram(blues));

  const sortedSums = [...sums].sort((a, b) => a - b);
  const sortedSpans = [...spans].sort((a, b) => a - b);

  let twoPlusTwo = 0;
  let threePlus = 0;
  let fourPlus = 0;
  let fivePlus = 0;
  let sixRun = 0;
  let noConsecutive = 0;
  let onePair = 0;
  for (const g of groups) {
    const maxG = g.length ? Math.max(...g) : 1;
    if (g.length === 0) noConsecutive += 1;
    if (g.filter((x) => x === 2).length >= 1 && maxG === 2) onePair += 1;
    if (g.filter((x) => x === 2).length >= 2) twoPlusTwo += 1;
    if (maxG >= 3) threePlus += 1;
    if (maxG >= 4) fourPlus += 1;
    if (maxG >= 5) fivePlus += 1;
    if (maxG >= 6) sixRun += 1;
  }

  const redKeyCount = new Map();
  for (const k of redKeys) redKeyCount.set(k, (redKeyCount.get(k) || 0) + 1);
  const repeatedReds = [...redKeyCount.entries()].filter(([, c]) => c > 1);
  const fullKeyCount = new Map();
  for (const k of fullKeys) fullKeyCount.set(k, (fullKeyCount.get(k) || 0) + 1);
  const repeatedFull = [...fullKeyCount.entries()].filter(([, c]) => c > 1);

  let overlapPrev = Array(7).fill(0);
  let overlapLast5 = Array(7).fill(0);
  let overlapLast20 = Array(7).fill(0);
  let fiveFromLast20 = 0;
  let sixFromLast20 = 0;
  let fourFromLast20 = 0;
  for (let i = 0; i < reds.length - 1; i++) {
    const prev = reds[i + 1];
    overlapPrev[overlap(reds[i], prev)] += 1;
  }
  for (let i = 0; i < reds.length - 20; i++) {
    const pool5 = new Set(reds.slice(i + 1, i + 6).flat());
    const pool20 = new Set(reds.slice(i + 1, i + 21).flat());
    const o5 = reds[i].filter((n) => pool5.has(n)).length;
    const o20 = reds[i].filter((n) => pool20.has(n)).length;
    overlapLast5[o5] += 1;
    overlapLast20[o20] += 1;
    if (o20 >= 4) fourFromLast20 += 1;
    if (o20 >= 5) fiveFromLast20 += 1;
    if (o20 >= 6) sixFromLast20 += 1;
  }

  const zoneAllOne = zones.filter((z) => z.some((c) => c === 6)).length;
  const zoneZero = zones.filter((z) => z.some((c) => c === 0)).length;
  const zoneExtreme = zones.filter((z) => Math.max(...z) >= 5).length;

  const sumBuckets = {
    "<=70": sums.filter((s) => s <= 70).length,
    "71-80": sums.filter((s) => s >= 71 && s <= 80).length,
    "81-100": sums.filter((s) => s >= 81 && s <= 100).length,
    "101-120": sums.filter((s) => s >= 101 && s <= 120).length,
    "121-140": sums.filter((s) => s >= 121 && s <= 140).length,
    "141-150": sums.filter((s) => s >= 141 && s <= 150).length,
    ">=151": sums.filter((s) => s >= 151).length,
  };

  return {
    game: "ssq",
    total,
    universe: { red: comb(33, 6), full: comb(33, 6) * 16 },
    consecutive: {
      maxRunHist: runHist,
      noConsecutive: [noConsecutive, pct(noConsecutive, total)],
      onePairOnly: [onePair, pct(onePair, total)],
      twoPairs: [twoPlusTwo, pct(twoPlusTwo, total)],
      threePlus: [threePlus, pct(threePlus, total)],
      fourPlus: [fourPlus, pct(fourPlus, total)],
      fivePlus: [fivePlus, pct(fivePlus, total)],
      sixRun: [sixRun, pct(sixRun, total)],
    },
    oddEven: oddHist,
    smallLarge: smallHist,
    ac: acHist,
    sameEnding: endHist,
    arithmeticProgression: [arith, pct(arith, total)],
    allBirthday1to31: [allLe31, pct(allLe31, total)],
    startsWith1to3: [has01or02or03start, pct(has01or02or03start, total)],
    sum: {
      min: sortedSums[0],
      p05: quantile(sortedSums, 0.05),
      p10: quantile(sortedSums, 0.1),
      p25: quantile(sortedSums, 0.25),
      p50: quantile(sortedSums, 0.5),
      p75: quantile(sortedSums, 0.75),
      p90: quantile(sortedSums, 0.9),
      p95: quantile(sortedSums, 0.95),
      max: sortedSums[sortedSums.length - 1],
      buckets: sumBuckets,
    },
    span: {
      min: sortedSpans[0],
      p10: quantile(sortedSpans, 0.1),
      p50: quantile(sortedSpans, 0.5),
      p90: quantile(sortedSpans, 0.9),
      max: sortedSpans[sortedSpans.length - 1],
    },
    zones: {
      allInOneZone: [zoneAllOne, pct(zoneAllOne, total)],
      missingOneZone: [zoneZero, pct(zoneZero, total)],
      fiveOrMoreInOneZone: [zoneExtreme, pct(zoneExtreme, total)],
    },
    historyCollision: {
      repeatedExactRed6: repeatedReds.length,
      repeatedExactFull: repeatedFull.length,
      examplesRed: repeatedReds.slice(0, 5),
    },
    recency: {
      overlapPreviousDraw: overlapPrev,
      overlapLast5DrawPool: overlapLast5,
      overlapLast20DrawPool: overlapLast20,
      fourPlusFromLast20: [fourFromLast20, pct(fourFromLast20, Math.max(1, total - 20))],
      fivePlusFromLast20: [fiveFromLast20, pct(fiveFromLast20, Math.max(1, total - 20))],
      sixFromLast20: [sixFromLast20, pct(sixFromLast20, Math.max(1, total - 20))],
    },
    blue: blueHist,
  };
}

function analyzeDLT(draws) {
  const total = draws.length;
  const fronts = draws.map((d) => [...d.frontBalls].sort((a, b) => a - b));
  const backs = draws.map((d) => [...d.backBalls].sort((a, b) => a - b));
  const fullKeys = draws.map(
    (d) =>
      [...d.frontBalls].sort((a, b) => a - b).join(",") +
      "+" +
      [...d.backBalls].sort((a, b) => a - b).join(",")
  );
  const frontKeys = fronts.map((r) => r.join(","));

  const maxRun = fronts.map(maxConsecutive);
  const groups = fronts.map(consecutiveGroups);
  const odds = fronts.map(oddCount);
  const small = fronts.map((r) => r.filter((n) => n <= 17).length);
  const sums = fronts.map(sum);
  const spans = fronts.map(span);
  const acs = fronts.map(acValue);
  const sameEnd = fronts.map(maxSameEnding);
  const arith = fronts.filter(isArithmetic).length;
  const backConsecutive = backs.filter((b) => b[1] === b[0] + 1).length;
  const sortedSums = [...sums].sort((a, b) => a - b);
  const sortedSpans = [...spans].sort((a, b) => a - b);

  let noConsecutive = 0;
  let onePair = 0;
  let twoPairs = 0;
  let threePlus = 0;
  let fourPlus = 0;
  let fiveRun = 0;
  for (const g of groups) {
    const maxG = g.length ? Math.max(...g) : 1;
    if (g.length === 0) noConsecutive += 1;
    if (g.filter((x) => x === 2).length >= 1 && maxG === 2) onePair += 1;
    if (g.filter((x) => x === 2).length >= 2) twoPairs += 1;
    if (maxG >= 3) threePlus += 1;
    if (maxG >= 4) fourPlus += 1;
    if (maxG >= 5) fiveRun += 1;
  }

  const frontKeyCount = new Map();
  for (const k of frontKeys) frontKeyCount.set(k, (frontKeyCount.get(k) || 0) + 1);
  const repeatedFront = [...frontKeyCount.entries()].filter(([, c]) => c > 1);
  const fullKeyCount = new Map();
  for (const k of fullKeys) fullKeyCount.set(k, (fullKeyCount.get(k) || 0) + 1);
  const repeatedFull = [...fullKeyCount.entries()].filter(([, c]) => c > 1);

  let overlapPrev = Array(6).fill(0);
  let overlapLast20 = Array(6).fill(0);
  let fourFromLast20 = 0;
  let fiveFromLast20 = 0;
  for (let i = 0; i < fronts.length - 1; i++) overlapPrev[overlap(fronts[i], fronts[i + 1])] += 1;
  for (let i = 0; i < fronts.length - 20; i++) {
    const pool20 = new Set(fronts.slice(i + 1, i + 21).flat());
    const o20 = fronts[i].filter((n) => pool20.has(n)).length;
    overlapLast20[o20] += 1;
    if (o20 >= 4) fourFromLast20 += 1;
    if (o20 >= 5) fiveFromLast20 += 1;
  }

  const sumBuckets = {
    "<=60": sums.filter((s) => s <= 60).length,
    "61-75": sums.filter((s) => s >= 61 && s <= 75).length,
    "76-90": sums.filter((s) => s >= 76 && s <= 90).length,
    "91-105": sums.filter((s) => s >= 91 && s <= 105).length,
    "106-120": sums.filter((s) => s >= 106 && s <= 120).length,
    ">=121": sums.filter((s) => s >= 121).length,
  };

  return {
    game: "dlt",
    total,
    universe: { front: comb(35, 5), back: comb(12, 2), full: comb(35, 5) * comb(12, 2) },
    consecutive: {
      maxRunHist: Object.fromEntries(histogram(maxRun)),
      noConsecutive: [noConsecutive, pct(noConsecutive, total)],
      onePairOnly: [onePair, pct(onePair, total)],
      twoPairs: [twoPairs, pct(twoPairs, total)],
      threePlus: [threePlus, pct(threePlus, total)],
      fourPlus: [fourPlus, pct(fourPlus, total)],
      fiveRun: [fiveRun, pct(fiveRun, total)],
      backConsecutive: [backConsecutive, pct(backConsecutive, total)],
    },
    oddEven: Object.fromEntries(histogram(odds)),
    smallLarge: Object.fromEntries(histogram(small)),
    ac: Object.fromEntries(histogram(acs)),
    sameEnding: Object.fromEntries(histogram(sameEnd)),
    arithmeticProgression: [arith, pct(arith, total)],
    sum: {
      min: sortedSums[0],
      p05: quantile(sortedSums, 0.05),
      p10: quantile(sortedSums, 0.1),
      p25: quantile(sortedSums, 0.25),
      p50: quantile(sortedSums, 0.5),
      p75: quantile(sortedSums, 0.75),
      p90: quantile(sortedSums, 0.9),
      p95: quantile(sortedSums, 0.95),
      max: sortedSums[sortedSums.length - 1],
      buckets: sumBuckets,
    },
    span: {
      min: sortedSpans[0],
      p10: quantile(sortedSpans, 0.1),
      p50: quantile(sortedSpans, 0.5),
      p90: quantile(sortedSpans, 0.9),
      max: sortedSpans[sortedSpans.length - 1],
    },
    historyCollision: {
      repeatedExactFront5: repeatedFront.length,
      repeatedExactFull: repeatedFull.length,
    },
    recency: {
      overlapPreviousDraw: overlapPrev,
      overlapLast20DrawPool: overlapLast20,
      fourPlusFromLast20: [fourFromLast20, pct(fourFromLast20, Math.max(1, total - 20))],
      fiveFromLast20: [fiveFromLast20, pct(fiveFromLast20, Math.max(1, total - 20))],
    },
  };
}

const ssq = JSON.parse(fs.readFileSync(path.join(__dirname, "data/ssq_history.json"), "utf8"));
const dlt = JSON.parse(fs.readFileSync(path.join(__dirname, "data/dlt_history.json"), "utf8"));
const ssqStats = analyzeSSQ(ssq.draws);
const dltStats = analyzeDLT(dlt.draws);
const out = { ssq: ssqStats, dlt: dltStats };
fs.writeFileSync(path.join(__dirname, "data/stats.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
