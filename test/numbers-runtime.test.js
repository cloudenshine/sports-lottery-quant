'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Runtime = require('../numbers-runtime');
const Ledger = require('../numbers-ledger');
const { createServer } = require('../serve');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'numbers-runtime-')), dataDir = path.join(root, 'data/numbers');
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); fs.mkdirSync(path.join(dataDir, 'raw'), { recursive: true });
  const body = 'archived fixture', hash = crypto.createHash('sha256').update(body).digest('hex');
  const source = { sourceId: 'fixture', sourceUrl: 'https://example.org/announcement', fetchedAt: '2026-09-05T08:00:00Z', bodySha256: hash, rawRef: 'raw/' + hash + '.body' };
  fs.writeFileSync(path.join(dataDir, source.rawRef), body);
  const games = {};
  for (const gameId of ['ssq', 'dlt']) games[gameId] = { gameId, sourceStatus: { status: 'ok' }, nextIssue: { issue: '26102', drawAt: '2026-09-06T13:15:00Z', source },
    draws: Array.from({ length: 200 }, (_, i) => ({ gameId, issue: '25' + String(i + 1).padStart(3, '0'), date: new Date(Date.parse('2025-01-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10), main: gameId === 'ssq' ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5], special: gameId === 'ssq' ? [1] : [1, 2], source })) };
  fs.writeFileSync(path.join(dataDir, 'sources.json'), JSON.stringify({ generatedAt: source.fetchedAt, status: { status: 'ok' }, games }));
  return { root, dataDir, games, now: '2026-09-05T09:00:00Z' };
}
test('cached preview is read-only for predictions; real daily run freezes and repeat preserves full batches', async t => {
  const args = fixture(t);
  await Runtime.runDaily({ ...args, collect: false, register: false, evaluate: false });
  assert.equal(Ledger.readBatches(args).length, 0); assert.equal(fs.existsSync(path.join(args.dataDir, 'protocol.json')), false);
  const first = await Runtime.runDaily({ ...args, collect: false, evaluate: false });
  assert.equal(first.registrations.filter(r => r.created).length, 2); assert.equal(first.dashboard.ledger.predictionCount, 14);
  const batches = Ledger.readBatches(args), protocol = Runtime.getProtocol(args);
  assert.equal(protocol.status, 'frozen'); assert.ok(protocol.codeHashes['number-models.js']);
  const second = await Runtime.runDaily({ ...args, collect: false, evaluate: false });
  assert.equal(second.registrations.filter(r => r.created).length, 0); assert.deepEqual(Ledger.readBatches(args), batches);
  assert.equal(fs.existsSync(path.join(args.dataDir, 'runtime.lock')), false);
});
test('protocol body and freeze clock tampering cannot pass a copied hash; window closure disables registration', t => {
  const args = fixture(t), filename = path.join(args.dataDir, 'protocol.json'), original = Runtime.getProtocol({ ...args, freeze: true });
  for (const mutation of [p => { p.id = 'changed'; }, p => { p.comparisonFamily = 1; }, p => { p.frozenAt = '2026-01-01T00:00:00.000Z'; p.reviewAt = '2027-01-01T00:00:00.000Z'; }]) {
    const changed = structuredClone(original); mutation(changed); fs.writeFileSync(filename, JSON.stringify(changed));
    assert.throws(() => Runtime.getProtocol(args), /Frozen number protocol/);
  }
  fs.writeFileSync(filename, JSON.stringify(original));
  const end = Runtime.dashboard({ ...args, now: original.reviewAt, save: false });
  assert.equal(end.games.ssq.registration.eligible, false); assert.match(end.games.ssq.registration.reason, /固定观察窗口已结束/);
});
test('live process locks are preserved and failure releases only the owned lock', async t => {
  const args = fixture(t), lock = path.join(args.dataDir, 'runtime.lock');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
  assert.throws(() => Runtime.withLock(args.dataDir, () => null), /already running/); assert.ok(fs.existsSync(lock)); fs.unlinkSync(lock);
  await assert.rejects(Runtime.withLock(args.dataDir, () => { throw new Error('controlled failure'); }), /controlled failure/);
  assert.equal(fs.existsSync(lock), false);
});
test('registration HTTP boundary rejects forgery and permits only server-controlled local game requests', async t => {
  let calls = 0;
  const server = createServer({ numbersRuntime: { dashboard: () => ({ schemaVersion: 2 }), registerGame: async ({ gameId }) => { calls++; return { created: true, gameId }; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port, url = origin + '/api/numbers/register';
  const send = (body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await fetch(origin + '/api/numbers/dashboard')).status, 200);
  assert.equal((await send({ gameId: 'ssq' }, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await send({ gameId: 'ssq', now: '2026-01-01' })).status, 400);
  assert.equal((await send('{')).status, 400);
  assert.equal((await send('x'.repeat(5000))).status, 413);
  assert.equal(calls, 0);
  const response = await send({ gameId: 'dlt' }); assert.equal(response.status, 200); assert.equal((await response.json()).gameId, 'dlt'); assert.equal(calls, 1);
});
