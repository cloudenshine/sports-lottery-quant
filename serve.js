/**
 * serve.js
 * 零依赖轻量级局域网 Web 服务器
 * 自动识别本机 Wi-Fi / 局域网 IPv4 地址，支持手机扫码或浏览器秒开访问。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // 优先获取真实的局域网 IPv4 地址（排除 loopback 和虚拟网卡）
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
          return net.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const localIp = getLocalIp();

  // API: 获取服务器与局域网网络信息
  if (req.url === '/api/server-info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      ip: localIp,
      port: PORT,
      sportsUrl: `http://${localIp}:${PORT}/sports.html`,
      lottoUrl: `http://${localIp}:${PORT}/index.html`
    }));
    return;
  }

  // 静态文件服务
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/sports.html'; // 默认进入竞技彩票工作台
  }

  const filePath = path.join(__dirname, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

const localIp = getLocalIp();
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n================================================================');
  console.log('       ⚽ 量子竞技彩票 & 数字彩票 局域网服务已启动        ');
  console.log('================================================================');
  console.log(`\n💻 本机电脑端访问:`);
  console.log(`   - 竞技彩票工作台: http://localhost:${PORT}/sports.html`);
  console.log(`   - 双色球/大乐透 : http://localhost:${PORT}/index.html`);
  console.log(`\n📱 手机端直接访问 (确保手机与电脑连接同一 Wi-Fi):`);
  console.log(`   - 竞技彩票工作台: http://${localIp}:${PORT}/sports.html`);
  console.log(`   - 双色球/大乐透 : http://${localIp}:${PORT}/index.html`);
  console.log('\n💡 提示：在电脑网页顶部点击【📱 手机扫码使用】可直接弹出二维码，用手机微信/浏览器扫码即可秒开！');
  console.log('================================================================\n');
});
