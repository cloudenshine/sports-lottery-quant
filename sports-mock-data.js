/**
 * sports-mock-data.js
 * 演示赛事与独立实时快照入口；演示数据不能用于预测能力验证。
 * 包含：竞彩足球 (JCZQ)、14场胜负彩与任九 (SFC)、北京单场 (DC)、竞彩篮球 (JCLQ)。
 * 手工构造的队伍资料和赔率仅用于界面与算法演示。
 */

const JINGCAI_MATCHES = [
  {
    id: 'JC001',
    matchNum: '周六001',
    league: '英超',
    leagueColor: '#38003c',
    kickoffTime: '19:30',
    status: '未开赛',
    homeTeam: {
      name: '阿森纳',
      rank: 2,
      homeMatches: 14,
      homeGF: 36,
      homeGA: 11,
      homeWins: 11, homeDraws: 2, homeLosses: 1,
      recentResults: ['W', 'W', 'W', 'D', 'W', 'W'],
      restDays: 6,
      keyInjuries: []
    },
    awayTeam: {
      name: '切尔西',
      rank: 6,
      awayMatches: 14,
      awayGF: 21,
      awayGA: 20,
      awayWins: 5, awayDraws: 4, awayLosses: 5,
      recentResults: ['W', 'D', 'L', 'W', 'D', 'L'],
      restDays: 3,
      keyInjuries: ['恩昆库(伤停)']
    },
    h2h: [
      { home: '阿森纳', away: '切尔西', score: '5-0', winner: 'home' },
      { home: '切尔西', away: '阿森纳', score: '2-2', winner: 'draw' },
      { home: '阿森纳', away: '切尔西', score: '3-1', winner: 'home' }
    ],
    isSingle: true,
    odds: {
      SPF: { '3': 1.62, '1': 3.85, '0': 4.60 },
      RQSPF: { handicap: -1, '3': 2.75, '1': 3.50, '0': 2.15 },
      CRS: { '1:0': 7.50, '2:0': 8.00, '2:1': 7.50, '3:0': 12.0, '3:1': 11.0, '0:0': 12.0, '1:1': 7.00, '0:1': 14.0, '1:2': 13.0, 'win_other': 18.0, 'draw_other': 22.0, 'loss_other': 35.0 },
      TTG: { '0': 11.0, '1': 4.80, '2': 3.60, '3': 3.75, '4': 5.20, '5': 9.00, '6': 16.0, '7+': 22.0 },
      HFT: { 'WW': 2.45, 'WD': 14.0, 'WL': 34.0, 'DW': 4.60, 'DD': 6.00, 'DL': 10.0, 'LW': 22.0, 'LD': 14.0, 'LL': 8.00 }
    }
  },
  {
    id: 'JC002',
    matchNum: '周六002',
    league: '德甲',
    leagueColor: '#d3010c',
    kickoffTime: '21:30',
    status: '未开赛',
    homeTeam: {
      name: '多特蒙德',
      rank: 4,
      homeMatches: 13,
      homeGF: 31,
      homeGA: 14,
      homeWins: 9, homeDraws: 2, homeLosses: 2,
      recentResults: ['W', 'L', 'W', 'W', 'D', 'W'],
      restDays: 7,
      keyInjuries: []
    },
    awayTeam: {
      name: '勒沃库森',
      rank: 1,
      awayMatches: 13,
      awayGF: 34,
      awayGA: 12,
      awayWins: 10, awayDraws: 3, awayLosses: 0,
      recentResults: ['W', 'W', 'W', 'W', 'D', 'W'],
      restDays: 4,
      keyInjuries: ['博尼费斯(疑伤)']
    },
    h2h: [
      { home: '多特蒙德', away: '勒沃库森', score: '1-1', winner: 'draw' },
      { home: '勒沃库森', away: '多特蒙德', score: '1-1', winner: 'draw' },
      { home: '勒沃库森', away: '多特蒙德', score: '0-2', winner: 'away' }
    ],
    isSingle: false,
    odds: {
      SPF: { '3': 2.45, '1': 3.65, '0': 2.38 },
      RQSPF: { handicap: 1, '3': 1.48, '1': 4.25, '0': 4.60 },
      CRS: { '1:1': 6.80, '2:1': 9.50, '1:2': 9.20, '2:2': 10.5, '1:0': 11.0, '0:1': 11.0, 'win_other': 18.0, 'draw_other': 16.0, 'loss_other': 18.0 },
      TTG: { '0': 14.0, '1': 5.80, '2': 4.10, '3': 3.80, '4': 4.80, '5': 7.50, '6': 12.0, '7+': 16.0 },
      HFT: { 'WW': 4.00, 'WD': 13.0, 'WL': 24.0, 'DW': 6.50, 'DD': 6.20, 'DL': 6.20, 'LW': 24.0, 'LD': 13.0, 'LL': 3.85 }
    }
  },
  {
    id: 'JC003',
    matchNum: '周六003',
    league: '西甲',
    leagueColor: '#ee1c25',
    kickoffTime: '22:15',
    status: '未开赛',
    homeTeam: {
      name: '皇家马德里',
      rank: 1,
      homeMatches: 14,
      homeGF: 38,
      homeGA: 9,
      homeWins: 12, homeDraws: 2, homeLosses: 0,
      recentResults: ['W', 'W', 'W', 'W', 'W', 'D'],
      restDays: 6,
      keyInjuries: []
    },
    awayTeam: {
      name: '赫塔费',
      rank: 12,
      awayMatches: 14,
      awayGF: 12,
      awayGA: 22,
      awayWins: 2, awayDraws: 5, awayLosses: 7,
      recentResults: ['L', 'D', 'L', 'W', 'L', 'D'],
      restDays: 7,
      keyInjuries: ['马约拉尔(伤)']
    },
    h2h: [
      { home: '皇家马德里', away: '赫塔费', score: '2-1', winner: 'home' },
      { home: '赫塔费', away: '皇家马德里', score: '0-2', winner: 'away' },
      { home: '皇家马德里', away: '赫塔费', score: '1-0', winner: 'home' }
    ],
    isSingle: true,
    odds: {
      SPF: { '3': 1.18, '1': 5.80, '0': 11.5 },
      RQSPF: { handicap: -1, '3': 1.62, '1': 3.75, '0': 3.90 },
      CRS: { '2:0': 5.50, '1:0': 6.00, '3:0': 6.80, '2:1': 8.50, '3:1': 11.0, '0:0': 16.0, '1:1': 12.0, 'win_other': 12.0, 'draw_other': 30.0, 'loss_other': 50.0 },
      TTG: { '0': 12.0, '1': 5.00, '2': 3.80, '3': 3.80, '4': 5.00, '5': 8.00, '6': 15.0, '7+': 20.0 },
      HFT: { 'WW': 1.65, 'WD': 22.0, 'WL': 50.0, 'DW': 3.80, 'DD': 8.50, 'DL': 25.0, 'LW': 28.0, 'LD': 25.0, 'LL': 22.0 }
    }
  },
  {
    id: 'JC004',
    matchNum: '周六004',
    league: '意甲',
    leagueColor: '#008fd7',
    kickoffTime: '00:00',
    status: '未开赛',
    homeTeam: {
      name: '国际米兰',
      rank: 1,
      homeMatches: 14,
      homeGF: 35,
      homeGA: 10,
      homeWins: 11, homeDraws: 2, homeLosses: 1,
      recentResults: ['W', 'W', 'D', 'W', 'W', 'W'],
      restDays: 5,
      keyInjuries: []
    },
    awayTeam: {
      name: '尤文图斯',
      rank: 3,
      awayMatches: 14,
      awayGF: 20,
      awayGA: 12,
      awayWins: 7, awayDraws: 5, awayLosses: 2,
      recentResults: ['D', 'W', 'D', 'L', 'W', 'D'],
      restDays: 6,
      keyInjuries: ['布雷默(伤)']
    },
    h2h: [
      { home: '国际米兰', away: '尤文图斯', score: '1-0', winner: 'home' },
      { home: '尤文图斯', away: '国际米兰', score: '1-1', winner: 'draw' },
      { home: '国际米兰', away: '尤文图斯', score: '1-0', winner: 'home' }
    ],
    isSingle: false,
    odds: {
      SPF: { '3': 1.82, '1': 3.25, '0': 4.00 },
      RQSPF: { handicap: -1, '3': 3.45, '1': 3.40, '0': 1.85 },
      CRS: { '1:0': 5.80, '2:0': 7.50, '1:1': 6.00, '2:1': 8.00, '0:0': 8.00, '0:1': 9.50, '1:2': 13.0, 'win_other': 22.0, 'draw_other': 25.0, 'loss_other': 35.0 },
      TTG: { '0': 8.00, '1': 3.90, '2': 3.30, '3': 4.00, '4': 6.20, '5': 12.0, '6': 22.0, '7+': 30.0 },
      HFT: { 'WW': 2.85, 'WD': 14.0, 'WL': 35.0, 'DW': 4.50, 'DD': 4.80, 'DL': 9.00, 'LW': 26.0, 'LD': 14.0, 'LL': 7.20 }
    }
  }
];

// 胜负彩 14 场对阵（足彩经典期次模型）
const SFC_MATCHES = [
  { matchIdx: 1, home: '阿森纳', away: '切尔西', league: '英超', odds: { '3': 1.62, '1': 3.85, '0': 4.60 } },
  { matchIdx: 2, home: '曼城', away: '狼队', league: '英超', odds: { '3': 1.15, '1': 6.50, '0': 13.0 } },
  { matchIdx: 3, home: '利物浦', away: '热刺', league: '英超', odds: { '3': 1.45, '1': 4.50, '0': 5.50 } },
  { matchIdx: 4, home: '纽卡斯尔', away: '布莱顿', league: '英超', odds: { '3': 1.75, '1': 3.80, '0': 3.85 } },
  { matchIdx: 5, home: '多特蒙德', away: '勒沃库森', league: '德甲', odds: { '3': 2.45, '1': 3.65, '0': 2.38 } },
  { matchIdx: 6, home: '拜仁慕尼黑', away: '沃尔夫斯堡', league: '德甲', odds: { '3': 1.28, '1': 5.50, '0': 8.50 } },
  { matchIdx: 7, home: '莱比锡红牛', away: '不莱梅', league: '德甲', odds: { '3': 1.35, '1': 5.00, '0': 7.00 } },
  { matchIdx: 8, home: '法兰克福', away: '门兴', league: '德甲', odds: { '3': 1.85, '1': 3.60, '0': 3.65 } },
  { matchIdx: 9, home: '皇家马德里', away: '赫塔费', league: '西甲', odds: { '3': 1.18, '1': 5.80, '0': 11.5 } },
  { matchIdx: 10, home: '马德里竞技', away: '塞尔塔', league: '西甲', odds: { '3': 1.38, '1': 4.60, '0': 7.00 } },
  { matchIdx: 11, home: '巴塞罗那', away: '皇家社会', league: '西甲', odds: { '3': 1.68, '1': 3.80, '0': 4.40 } },
  { matchIdx: 12, home: '国际米兰', away: '尤文图斯', league: '意甲', odds: { '3': 1.82, '1': 3.25, '0': 4.00 } },
  { matchIdx: 13, home: 'AC米兰', away: '卡利亚里', league: '意甲', odds: { '3': 1.40, '1': 4.50, '0': 6.80 } },
  { matchIdx: 14, home: '罗马', away: '博洛尼亚', league: '意甲', odds: { '3': 2.25, '1': 3.10, '0': 3.15 } }
];

// 北京单场对阵（DC）
const BEIDAN_MATCHES = [
  {
    id: 'DC001',
    matchNum: '北单001',
    league: '法甲',
    homeTeam: '巴黎圣日耳曼',
    awayTeam: '摩纳哥',
    handicap: -1.5,
    spOdds: { '3': 2.12, '1': 3.68, '0': 2.85 }
  },
  {
    id: 'DC002',
    matchNum: '北单002',
    league: '荷甲',
    homeTeam: '埃因霍温',
    awayTeam: '费耶诺德',
    handicap: -0.5,
    spOdds: { '3': 1.88, '1': 3.55, '0': 3.42 }
  },
  {
    id: 'DC003',
    matchNum: '北单003',
    league: '葡超',
    homeTeam: '里斯本竞技',
    awayTeam: '波尔图',
    handicap: -0.5,
    spOdds: { '3': 1.95, '1': 3.40, '0': 3.35 }
  }
];

// 竞彩篮球对阵 (JCLQ - NBA)
const LANCAI_MATCHES = [
  {
    id: 'LQ001',
    matchNum: '周六301',
    league: 'NBA',
    kickoffTime: '08:30',
    homeTeam: {
      name: '金州勇士',
      pace: 102.8,
      offRtg: 116.5,
      defRtg: 112.4,
      isBackToBack: false,
      recentResults: ['W', 'W', 'L', 'W', 'W']
    },
    awayTeam: {
      name: '洛杉矶湖人',
      pace: 101.2,
      offRtg: 115.0,
      defRtg: 114.2,
      isBackToBack: true,
      recentResults: ['W', 'L', 'W', 'L', 'W']
    },
    odds: {
      MNL: { 'home': 1.58, 'away': 2.25 },
      HDC: { handicap: -4.5, 'rq_home': 1.82, 'rq_away': 1.82 },
      HILO: { totalLine: 226.5, 'over': 1.78, 'under': 1.86 },
      WNM: {
        'home_1_5': 4.80, 'home_6_10': 4.50, 'home_11_15': 6.20, 'home_16_20': 10.5, 'home_21_25': 18.0, 'home_26_plus': 22.0,
        'away_1_5': 5.60, 'away_6_10': 5.80, 'away_11_15': 8.50, 'away_16_20': 15.0, 'away_21_25': 26.0, 'away_26_plus': 32.0
      }
    }
  },
  {
    id: 'LQ002',
    matchNum: '周六302',
    league: 'NBA',
    kickoffTime: '10:30',
    homeTeam: {
      name: '波士顿凯尔特人',
      pace: 99.5,
      offRtg: 121.2,
      defRtg: 109.8,
      isBackToBack: false,
      recentResults: ['W', 'W', 'W', 'W', 'L']
    },
    awayTeam: {
      name: '密尔沃基雄鹿',
      pace: 101.8,
      offRtg: 117.8,
      defRtg: 113.5,
      isBackToBack: false,
      recentResults: ['W', 'L', 'W', 'W', 'W']
    },
    odds: {
      MNL: { 'home': 1.32, 'away': 3.15 },
      HDC: { handicap: -7.5, 'rq_home': 1.80, 'rq_away': 1.84 },
      HILO: { totalLine: 228.5, 'over': 1.82, 'under': 1.82 },
      WNM: {
        'home_1_5': 5.00, 'home_6_10': 3.85, 'home_11_15': 4.80, 'home_16_20': 7.50, 'home_21_25': 12.0, 'home_26_plus': 15.0,
        'away_1_5': 7.00, 'away_6_10': 8.00, 'away_11_15': 13.0, 'away_16_20': 25.0, 'away_21_25': 45.0, 'away_26_plus': 60.0
      }
    }
  }
];

let LIVE_PAYLOAD = null;
if (typeof window !== 'undefined' && window.SPORTS_LIVE) {
  LIVE_PAYLOAD = window.SPORTS_LIVE;
} else if (typeof require !== 'undefined') {
  try {
    const fs = require('fs');
    const path = require('path');
    const liveFile = path.join(__dirname, 'data', 'sports_live.json');
    if (fs.existsSync(liveFile)) {
      LIVE_PAYLOAD = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
}

// Schema version alone does not establish provenance. Validate the complete
// source-snapshot contract, including the absence of unobserved team statistics.
function snapshotRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function snapshotKeys(value, keys) {
  return snapshotRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function snapshotRequiredKeys(value, keys) {
  return snapshotRecord(value) && keys.every(key => Object.hasOwn(value, key));
}
function snapshotText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[<>\x00-\x1f\x7f]/.test(value);
}
function snapshotIso(value) {
  const stamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) && new Date(stamp).toISOString() === value;
}
function snapshotTeam(team) {
  return snapshotKeys(team, ['name', 'rank', 'recentResults']) && snapshotText(team.name) && team.rank === null && Array.isArray(team.recentResults) && team.recentResults.length === 0;
}
function snapshotOdds(odds, handicap = false) {
  return snapshotKeys(odds, handicap ? ['3', '1', '0', 'handicap'] : ['3', '1', '0']) &&
    ['3', '1', '0'].every(key => typeof odds[key] === 'number' && Number.isFinite(odds[key]) && odds[key] > 1) &&
    (!handicap || Number.isSafeInteger(odds.handicap));
}
function snapshotJingcai(match, syncedAt) {
  if (!snapshotKeys(match, ['id', 'matchNum', 'matchDate', 'kickoffTime', 'kickoffAt', 'league', 'leagueColor', 'status', 'homeTeam', 'awayTeam', 'h2h', 'odds', 'dataQuality'])) return false;
  if (typeof match.id !== 'string' || !/^LIVE_\d+$/.test(match.id) || !snapshotText(match.matchNum) || !snapshotText(match.league) || match.leagueColor !== '#3b82f6' || match.status !== '来源快照，销售状态未核验') return false;
  if (!snapshotTeam(match.homeTeam) || !snapshotTeam(match.awayTeam) || !Array.isArray(match.h2h) || match.h2h.length !== 0) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match.matchDate || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(match.kickoffTime || '') || !snapshotIso(match.kickoffAt)) return false;
  const kickoff = Date.parse(`${match.matchDate}T${match.kickoffTime}:00+08:00`);
  if (kickoff !== Date.parse(match.kickoffAt) || kickoff <= syncedAt || new Date(kickoff + 8 * 3600000).toISOString().slice(0, 10) !== match.matchDate) return false;
  if (!snapshotRecord(match.odds)) return false;
  const markets = Object.keys(match.odds);
  if (!markets.length || markets.some(key => !['SPF', 'RQSPF'].includes(key) || !snapshotOdds(match.odds[key], key === 'RQSPF'))) return false;
  const quality = match.dataQuality;
  return snapshotKeys(quality, ['source', 'teamStatistics', 'salesStatus', 'quotedMarkets']) && quality.source === 'trade.500.com/jczq/' &&
    quality.teamStatistics === 'unavailable' && quality.salesStatus === 'unverified' && Array.isArray(quality.quotedMarkets) &&
    quality.quotedMarkets.length === markets.length && new Set(quality.quotedMarkets).size === markets.length && markets.every(key => quality.quotedMarkets.includes(key));
}
function snapshotSfc(match, index) {
  if (!snapshotKeys(match, ['matchIdx', 'home', 'away', 'league', 'odds', 'dataQuality']) || match.matchIdx !== index + 1 || !snapshotText(match.home) || !snapshotText(match.away) || match.league !== '未知' || !snapshotOdds(match.odds)) return false;
  const quality = match.dataQuality;
  return snapshotKeys(quality, ['source', 'kickoff', 'issue', 'salesStatus']) && quality.source === 'trade.500.com/sfc/' && quality.kickoff === 'unavailable' && quality.issue === 'unavailable' && quality.salesStatus === 'unverified';
}
function snapshotSourceStatus(value) {
  if (value === undefined) return true;
  if (!snapshotRequiredKeys(value, ['status', 'markets']) || !['ok', 'partial'].includes(value.status) || !snapshotRecord(value.markets)) return false;
  return ['jingcai', 'sfc'].every(key => snapshotKeys(value.markets[key], ['status', 'error']) &&
    ['ok', 'failed'].includes(value.markets[key].status) && (value.markets[key].error === null || snapshotText(value.markets[key].error)) &&
    (value[key] === undefined || (snapshotKeys(value[key], ['status', 'error']) && value[key].status === value.markets[key].status && value[key].error === value.markets[key].error)));
}
function snapshotSourceErrors(value) {
  if (value === undefined) return true;
  return snapshotKeys(value, ['jingcai', 'sfc']) && ['jingcai', 'sfc'].every(key => value[key] === null || snapshotText(value[key]));
}
function validateSportsSnapshot(payload, now = Date.now()) {
  if (!snapshotRequiredKeys(payload, ['schemaVersion', 'dataKind', 'salesStatus', 'syncedAt', 'displayTime', 'jingcaiCount', 'sfcCount', 'jingcai', 'sfc']) || payload.schemaVersion !== 2 || payload.dataKind !== 'source-snapshot' || payload.salesStatus !== 'unverified' || !snapshotIso(payload.syncedAt) || !snapshotText(payload.displayTime) || !snapshotSourceStatus(payload.sourceStatus) || !snapshotSourceErrors(payload.sourceErrors)) return { valid: false, stale: false };
  const observed = Date.parse(payload.syncedAt);
  if (observed > now) return { valid: false, stale: false };
  if (now - observed > 24 * 3600000) return { valid: false, stale: true };
  if (!Array.isArray(payload.jingcai) || !Array.isArray(payload.sfc) || payload.jingcaiCount !== payload.jingcai.length || payload.sfcCount !== payload.sfc.length || ![0, 14].includes(payload.sfc.length)) return { valid: false, stale: false };
  const valid = payload.jingcai.every(match => snapshotJingcai(match, observed)) && payload.sfc.every(snapshotSfc) &&
    new Set(payload.jingcai.map(match => match.id)).size === payload.jingcai.length &&
    new Set(payload.sfc.map(match => JSON.stringify([match.home, match.away]))).size === payload.sfc.length;
  return { valid, stale: false };
}
const snapshotCheck = validateSportsSnapshot(LIVE_PAYLOAD);
const validLive = snapshotCheck.valid;
const staleLive = snapshotCheck.stale;
const LIVE_JINGCAI = validLive ? LIVE_PAYLOAD.jingcai.filter(match => Date.parse(match.kickoffAt) > Date.now()) : [];
const LIVE_SFC = validLive ? LIVE_PAYLOAD.sfc : [];

const unavailableSourceStatus = { status: 'partial', jingcai: { status: 'failed', error: '实时快照不可用' }, sfc: { status: 'failed', error: '实时快照不可用' }, markets: { jingcai: { status: 'failed', error: '实时快照不可用' }, sfc: { status: 'failed', error: '实时快照不可用' } } };
const unavailableSourceErrors = { jingcai: '实时快照不可用', sfc: '实时快照不可用' };
const exposedSourceStatus = validLive ? LIVE_PAYLOAD.sourceStatus : unavailableSourceStatus;
const exposedSourceErrors = validLive ? (LIVE_PAYLOAD.sourceErrors || { jingcai: null, sfc: null }) : unavailableSourceErrors;

const MockData = {
  JINGCAI_MATCHES: LIVE_JINGCAI,
  CLASSIC_JINGCAI_MATCHES: JINGCAI_MATCHES,
  SFC_MATCHES: LIVE_SFC,
  CLASSIC_SFC_MATCHES: SFC_MATCHES,
  BEIDAN_MATCHES,
  LANCAI_MATCHES,
  sourceStatus: exposedSourceStatus,
  sourceErrors: exposedSourceErrors,
  META: {
    isRealTime: false,
    validSnapshot: validLive,
    stale: staleLive,
    syncedAt: validLive ? LIVE_PAYLOAD.syncedAt : null,
    displayTime: validLive ? LIVE_PAYLOAD.syncedAt : '未载入合格快照',
    sourceStatus: exposedSourceStatus,
    sourceErrors: exposedSourceErrors,
    dateScope: staleLive ? '快照已过期；请重新同步' : (validLive ? '已载入来源快照；在售状态未实时确认' : '实时数据不可用；快照缺失或未通过完整性校验，已隔离'),
    matchCount: LIVE_JINGCAI.length
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MockData;
}
if (typeof window !== 'undefined') {
  window.MockData = MockData;
}
