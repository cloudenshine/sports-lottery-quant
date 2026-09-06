'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PUBLIC_FILES = new Set([
  'returns-workbench.js', 'sports-return-policy.js', 'number-crowd-model.js', 'data/returns/crowd-report.js', 'data/returns/crowd-report.json',
  'index.html', 'sports.html', 'research.html', 'lotto-standalone.html', 'sports-standalone.html', 'research-standalone.html', 'manifest.json',
  'research-dashboard.js', 'data/research/dashboard.js', 'data/research/dashboard.json',
  'number-tools.html', 'number-tools-standalone.html', 'number-tools-live.js', 'number-models.js', 'number-settlement.js', 'number-app.js',
  'data/numbers/dashboard.js', 'data/numbers/dashboard.json', 'data/numbers/public-snapshot.json',
  'engine.js', 'sports-form-analyzer.js', 'sports-jingcai-engine.js', 'sports-sfc-engine.js',
  'sports-beidan-engine.js', 'sports-lancai-engine.js', 'sports-mock-data.js',
  'data/ssq-compact.js', 'data/dlt-compact.js', 'data/sports-live-data.js',
  'data/ssq_history.json', 'data/dlt_history.json', 'data/sports_live.json',
  'docs/testing/scientific-evaluation.json'
]);
const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function getLocalIp() {
  for (const nets of Object.values(os.networkInterfaces())) for (const net of nets || []) {
    const octets = net.address.split('.').map(Number);
    if (net.family === 'IPv4' && !net.internal && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31))) return net.address;
  }
  return '127.0.0.1';
}
function resolvePublicPath(root, rawUrl) {
  let requested;
  try { requested = decodeURIComponent(rawUrl.split('?')[0]); } catch { return null; }
  if (!requested.startsWith('/') || requested.includes('\\') || requested.includes('\0')) return null;
  const name = requested === '/' ? 'sports.html' : requested.slice(1);
  if (!PUBLIC_FILES.has(name)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const file = fs.realpathSync(path.join(realRoot, name));
    const relative = path.relative(realRoot, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(file).isFile()) return null;
    return file;
  } catch { return null; }
}
function createServer({ root = __dirname, numbersRuntime } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    const route = req.url.split('?')[0];
    if (route === '/api/numbers/dashboard' || route === '/api/numbers/register') {
      const json = (status, body) => { res.writeHead(status, { 'Content-Type': MIME_TYPES['.json'] }); res.end(JSON.stringify(body)); };
      if (route.endsWith('/dashboard')) {
        if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(405, { error: 'GET required' }); return; }
        try { json(200, (numbersRuntime || require('./numbers-runtime')).dashboard({ dataDir: path.join(root, 'data/numbers'), save: false })); }
        catch (error) { json(503, { error: error.message }); }
        return;
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); json(405, { error: 'POST required' }); return; }
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const host = req.headers.host || '';
      const validHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
      if (!local || !validHost || req.headers.origin !== `http://${host}` || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
        json(403, { error: 'Registration requires the same-origin local research application' }); return;
      }
      try {
        let raw = '', size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4096) { json(413, { error: 'Request body too large' }); return; } raw += chunk.toString('utf8'); }
        let body;
        try { body = JSON.parse(raw); } catch { json(400, { error: 'Invalid JSON' }); return; }
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'gameId') || !['ssq', 'dlt'].includes(body.gameId)) {
          json(400, { error: 'Only a valid gameId is accepted; protocol, clock, source and tickets are server-controlled' }); return;
        }
        json(200, await (numbersRuntime || require('./numbers-runtime')).registerGame({ dataDir: path.join(root, 'data/numbers'), gameId: body.gameId }));
      } catch (error) { json(409, { error: error.message }); }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    if (req.url.split('?')[0] === '/api/server-info') {
      const address = req.socket.localAddress;
      const localOnly = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
      const bound = req.socket.server.address();
      const lanEnabled = bound.address === '0.0.0.0' || bound.address === '::' || !localOnly;
      const ip = lanEnabled ? getLocalIp() : '127.0.0.1';
      const port = req.socket.localPort;
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.json'] });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ip, port, lanEnabled, sportsUrl: `http://${ip}:${port}/sports.html`, lottoUrl: `http://${ip}:${port}/index.html`, researchUrl: `http://${ip}:${port}/research.html` }));
      return;
    }
    const file = resolvePublicPath(root, req.url);
    if (!file) { res.writeHead(404); res.end(req.method === 'HEAD' ? undefined : '404 Not Found'); return; }
    const stream = fs.createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream' });
      if (req.method === 'HEAD') { stream.destroy(); res.end(); } else stream.pipe(res);
    });
    res.on('close', () => stream.destroy());
  });
}
function main() {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const server = createServer();
  server.on('error', error => { console.error('Server failed:', error.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`Sports: http://${host === '0.0.0.0' ? getLocalIp() : host}:${port}/sports.html`);
    console.log(`Numbers: http://${host === '0.0.0.0' ? getLocalIp() : host}:${port}/index.html`);
    if (host === '127.0.0.1') console.log('Local access only. Set HOST=0.0.0.0 explicitly to enable LAN access.');
  });
  return server;
}
if (require.main === module) main();
module.exports = { createServer, resolvePublicPath, getLocalIp, main };
