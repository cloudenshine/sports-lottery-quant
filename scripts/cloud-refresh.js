'use strict';

/**
 * Cloud-only refresh. It collects public source snapshots and never touches
 * either prospective ledger. The local Codex heartbeat remains the sole
 * writer of predictions and settlements.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { main: syncSports } = require('../sync-sports-live');
const { syncNumberSources } = require('../numbers-sources');
const { projectPublic } = require('./build-public-site');

const rootDir = path.resolve(__dirname, '..');

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function refresh({ root = rootDir, now = new Date(), syncSportsImpl = syncSports, syncNumbersImpl = syncNumberSources } = {}) {
  const targetRoot = path.resolve(root);
  const targetStatusFile = path.join(targetRoot, 'data', 'cloud-refresh-status.json');
  const targetNumbersFile = path.join(targetRoot, 'data', 'numbers', 'public-snapshot.json');
  const generatedAt = now.toISOString();
  const steps = [];
  try {
    const sports = await syncSportsImpl({ dataDir: path.join(targetRoot, 'data'), now, archiveEvidence: true });
    steps.push({ id: 'sports', status: sports.sourceStatus && sports.sourceStatus.status !== 'ok' ? 'degraded' : 'ok', sourceStatus: sports.sourceStatus, sourceErrors: sports.sourceErrors, jingcaiCount: sports.jingcaiCount, sfcCount: sports.sfcCount });
  } catch (error) {
    steps.push({ id: 'sports', status: 'failed', error: error.message });
  }

  // Use an isolated temporary data directory: the collector may archive raw
  // responses, but those bytes must never enter Git or the Pages artifact.
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lottery-cloud-refresh-'));
  try {
    try {
      // The history endpoints provide the complete draw list. Limit detail
      // notices during frequent draw-window refreshes to recent prize tables.
      const result = await syncNumbersImpl({ dataDir: temporaryDir, detailLimit: 8, concurrency: 4, now });
      const snapshot = projectPublic({
        schemaVersion: 1,
        generatedAt,
        status: result.status,
        sources: result.status,
        games: result.games,
        evidence: 'public_source_snapshot_only; no prospective registration or settlement'
      });
      writeJson(targetNumbersFile, snapshot);
      steps.push({ id: 'numbers', status: result.status.status === 'ok' ? 'ok' : 'degraded', games: Object.fromEntries(Object.entries(result.games).map(([id, game]) => [id, { draws: game.draws.length, status: game.status }])) });
    } catch (error) {
      steps.push({ id: 'numbers', status: 'failed', error: error.message });
    }
  } finally {
    const raw = path.join(temporaryDir, 'raw');
    if (fs.existsSync(raw)) {
      const archive = path.join(targetRoot, 'data/research/raw/cloud-refresh', generatedAt.replace(/[:.]/g, '-'));
      fs.mkdirSync(archive, { recursive: true });
      fs.cpSync(raw, archive, { recursive: true });
    }
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }

  const status = {
    schemaVersion: 1,
    generatedAt,
    status: steps.every(step => step.status === 'ok') ? 'ok' : 'degraded',
    steps,
    retainedPreviousOnFailure: true,
    writes: ['data/sports_live.json', 'data/sports-live-data.js', 'data/numbers/public-snapshot.json', 'data/cloud-refresh-status.json'],
    ledgerWrites: []
  };
  writeJson(targetStatusFile, status);
  return status;
}

if (require.main === module) {
  refresh().then(status => {
    console.log(JSON.stringify(status, null, 2));
    if (status.status !== 'ok') process.exitCode = 2;
  }).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = { refresh, writeJson };
