const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Sports Lottery UI Contract & Layout Suite', async (t) => {
  const htmlPath = path.join(__dirname, '..', 'sports.html');
  assert.ok(fs.existsSync(htmlPath), 'sports.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  await t.test('1. Must contain header matching user screenshot: ⚽ 竞技彩票', () => {
    assert.match(html, /竞技彩票/i);
    assert.match(html, /⚽/);
  });

  await t.test('2. Must contain the exact four tabs: 胜负彩对阵表, 竞彩, 北单, 篮彩', () => {
    assert.match(html, /胜负彩对阵表/);
    assert.match(html, /竞彩/);
    assert.match(html, /北单/);
    assert.match(html, /篮彩/);
  });

  await t.test('3. Must contain L0 honesty warning (抽水衰减与拒绝预测神单)', () => {
    assert.match(html, /返还率|抽水/);
    assert.doesNotMatch(html, /稳赚|包中|必红|带单/);
  });

  await t.test('4. Must contain team form analytics indicators (近况走势, 主客场, 泊松xG, 价值注)', () => {
    assert.match(html, /近况走势|近6场/);
    assert.match(html, /预期进球|xG|泊松/);
    assert.match(html, /价值注|EV/);
  });

  await t.test('5. Must contain Jingcai mixed parlay and ILP bonus optimizer controls', () => {
    assert.match(html, /混合过关/);
    assert.match(html, /奖金优化/);
    assert.match(html, /平均优化/);
    assert.match(html, /博冷优化/);
    assert.match(html, /保本优化/);
  });

  await t.test('6. Must contain SFC 14 and RX9 bet panels', () => {
    assert.match(html, /14场胜负彩/);
    assert.match(html, /任选九/);
    assert.match(html, /火锅奖/);
  });

  await t.test('7. Must contain Beidan and Lancai modules', () => {
    assert.match(html, /北京单场|浮动SP/);
    assert.match(html, /竞彩篮球|让分胜负|大小分/);
  });

  await t.test('8. Must contain Quant Model strategy action buttons (稳健对冲型 / 价值博冷型 / 方案量化体检)', () => {
    assert.match(html, /稳健对冲/);
    assert.match(html, /价值博冷/);
    assert.match(html, /量化体检/);
  });

  await t.test('9. Must contain Batch Ticket Generator & POS Terminal Export buttons (批量出票 / 彩店机打代码 / 下载TXT)', () => {
    assert.match(html, /批量生成实体票单|批量出单|批量出票/);
    assert.match(html, /机打单|打票机|终端代码/);
    assert.match(html, /复制|下载/);
  });

  await t.test('10. Must contain real-time match fixture date status & live sync controls', () => {
    assert.match(html, /实时|在售|比赛日/);
    assert.match(html, /刷新|同步/);
  });

  await t.test('11. SFC / RX9 must support quant model selection and batch ticket generation', () => {
    assert.match(html, /SFC 量化模型选单|量化稳胆/);
    assert.match(html, /RX9 量化模型选单|黄金任九/);
    assert.match(html, /btn-sfc-batch/);
  });

  await t.test('12. Beidan must support quant model selection and batch ticket generation', () => {
    assert.match(html, /北单量化模型选单/);
    assert.match(html, /btn-beidan-batch/);
  });

  await t.test('13. Lancai must support quant model selection and batch ticket generation', () => {
    assert.match(html, /篮彩量化模型选单/);
    assert.match(html, /btn-lancai-batch/);
  });

  await t.test('14. Mobile optimization: PWA meta tags and viewport fit cover', () => {
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(html, /manifest\.json/);
  });

  await t.test('15. Mobile optimization: Mobile sticky bottom bar and QR code modal', () => {
    assert.match(html, /mobile-bottom-bar|mobile-cart/i);
    assert.match(html, /mobile-qr-modal|qr-modal/i);
  });
});
