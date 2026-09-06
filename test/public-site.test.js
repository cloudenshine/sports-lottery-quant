'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildPublicSite, mergePublicNumberSnapshot, PUBLIC_FILES } = require('../scripts/build-public-site');

const root = path.resolve(__dirname, '..');

function dashboard(outFile) {
  const source = fs.readFileSync(outFile, 'utf8');
  const start = source.indexOf('{');
  return JSON.parse(source.slice(start, source.lastIndexOf('}') + 1));
}

test('public build contains only the explicit site allowlist', () => {
  const outDir = path.join(root, '.tmp-public-site-test');
  try {
    const result = buildPublicSite({ rootDir: root, outDir });
    const allowed = new Set(PUBLIC_FILES.filter(file => fs.existsSync(path.join(root, file))));
    allowed.add('data/numbers/dashboard.js');
    allowed.add('data/research/dashboard.js');
    for (const file of ['data/returns/crowd-report.js', 'data/returns/crowd-report.json']) {
      if (fs.existsSync(path.join(root, file))) allowed.add(file);
    }
    assert.deepEqual(new Set(result.files), allowed);
    assert.ok(result.files.includes('index.html'));
    assert.ok(result.files.includes('sports.html'));
    assert.ok(result.files.includes('research.html'));
    assert.match(fs.readFileSync(path.join(outDir, 'index.html'), 'utf8'), /NUMBER_APP_OFFLINE\s*=\s*true/);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('public dashboards retain evidence useful to readers without private archive references', () => {
  const outDir = path.join(root, '.tmp-public-site-test');
  try {
    buildPublicSite({ rootDir: root, outDir });
    const files = [];
    function walk(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full); else files.push(full);
      }
    }
    walk(outDir);
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /rawRef|rawArchive|bodyHashes|codeHashes|inputSha256|runtimeInputHash|(?<![A-Za-z])[A-Za-z]:[\\/][^\n"']*/i, file);
    }
    const numbers = dashboard(path.join(outDir, 'data/numbers/dashboard.js'));
    const research = dashboard(path.join(outDir, 'data/research/dashboard.js'));
    assert.ok(numbers.sources.results.some(source => typeof source.sourceUrl === 'string' && /^https?:\/\//.test(source.sourceUrl)));
    assert.ok(numbers.ledger.batches.some(batch => batch.predictions?.some(prediction => Array.isArray(prediction.tickets))));
    assert.equal(numbers.games.ssq.report.byModel.length, 7);
    assert.equal(numbers.games.dlt.report.byModel.length, 7);
    assert.ok(research.recentPredictions.some(row => /^https?:\/\//.test(row.payload?.source?.sourceUrl || '')));
    assert.ok(research.rules.rules.some(rule => rule.sources?.length));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('cloud number snapshots update the public dashboard while preserving the ledger fields', () => {
  const fixture = path.join(root, '.tmp-public-site-test');
  try {
    fs.mkdirSync(path.join(fixture, 'data/numbers'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'data/numbers/public-snapshot.json'), JSON.stringify({
      generatedAt: '2026-09-06T00:00:00.000Z', status: { status: 'ok' }, evidence: 'source snapshot',
      games: { ssq: { draws: [{ issue: '99999', date: '2026-09-06' }], nextIssue: { issue: '10000' } } }
    }));
    const before = { games: { ssq: { draws: [{ issue: '99998', date: '2026-09-05' }], registration: { status: 'frozen' } } }, ledger: { batchCount: 1 } };
    const after = mergePublicNumberSnapshot(fixture, before);
    assert.equal(after.cloudRefresh.generatedAt, '2026-09-06T00:00:00.000Z');
    assert.equal(after.games.ssq.registration.status, 'frozen');
    assert.deepEqual(after.games.ssq.draws.map(draw => draw.issue), ['99998', '99999']);
    assert.equal(after.ledger.batchCount, 1);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('cloud refresh exposes partial sources, preserves ledgers and archives collected raw bytes', async () => {
  const { refresh } = require('../scripts/cloud-refresh');
  const fixture = path.join(root, '.tmp-cloud-refresh-test');
  fs.mkdirSync(path.join(fixture, 'data/numbers/ledger'), { recursive: true });
  const ledger = path.join(fixture, 'data/numbers/ledger/untouched.json');
  fs.writeFileSync(ledger, '{"frozen":true}');
  const now = new Date('2026-09-06T00:00:00Z');
  try {
    const status = await refresh({root:fixture, now,
      syncSportsImpl:async options => {
        assert.equal(options.archiveEvidence, true);
        return {jingcaiCount:26,sfcCount:0,sourceStatus:{status:'partial'},sourceErrors:{sfc:'Missing odds'}};
      },
      syncNumbersImpl:async ({dataDir}) => {
        fs.mkdirSync(path.join(dataDir,'raw'),{recursive:true});
        fs.writeFileSync(path.join(dataDir,'raw/sample.body'),'public source fixture');
        return {status:{status:'ok'},games:{ssq:{draws:[],status:'ok'}}};
      }
    });
    assert.equal(status.status,'degraded');
    assert.equal(status.steps[0].status,'degraded');
    assert.deepEqual(status.ledgerWrites,[]);
    assert.equal(fs.readFileSync(ledger,'utf8'),'{"frozen":true}');
    assert.equal(fs.readFileSync(path.join(fixture,'data/research/raw/cloud-refresh/2026-09-06T00-00-00-000Z/sample.body'),'utf8'),'public source fixture');
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
});
