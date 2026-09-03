/**
 * build-standalone.js
 * 将 sports.html 及其所有外部依赖 (css, js, data) 打包合并成一个 100% 独立的单文件 HTML。
 * 用户只需将这一个单文件传到手机，断网、离线、不需要电脑开机即可在手机浏览器直接独立运行！
 */

const fs = require('fs');
const path = require('path');

function buildStandalone() {
  // 1. Build sports-standalone.html
  const baseHtml = fs.readFileSync(path.join(__dirname, 'sports.html'), 'utf8');
  const liveDataJs = fs.readFileSync(path.join(__dirname, 'data', 'sports-live-data.js'), 'utf8');
  const formAnalyzerJs = fs.readFileSync(path.join(__dirname, 'sports-form-analyzer.js'), 'utf8');
  const jingcaiEngineJs = fs.readFileSync(path.join(__dirname, 'sports-jingcai-engine.js'), 'utf8');
  const sfcEngineJs = fs.readFileSync(path.join(__dirname, 'sports-sfc-engine.js'), 'utf8');
  const beidanEngineJs = fs.readFileSync(path.join(__dirname, 'sports-beidan-engine.js'), 'utf8');
  const lancaiEngineJs = fs.readFileSync(path.join(__dirname, 'sports-lancai-engine.js'), 'utf8');
  const mockDataJs = fs.readFileSync(path.join(__dirname, 'sports-mock-data.js'), 'utf8');

  let sportsStandalone = baseHtml.replace(
    /<!-- Scripts -->[\s\S]*?<script src="sports-mock-data\.js"><\/script>/,
    `<!-- Inlined Scripts for Standalone Mobile Running (100% 离线独立运行，无需任何电脑与服务器) -->
<script>
${liveDataJs}
${formAnalyzerJs}
${jingcaiEngineJs}
${sfcEngineJs}
${beidanEngineJs}
${lancaiEngineJs}
${mockDataJs}
</script>`
  );

  const sportsOut = path.join(__dirname, 'sports-standalone.html');
  fs.writeFileSync(sportsOut, sportsStandalone, 'utf8');
  console.log('Successfully created:', sportsOut, `(${Math.round(sportsStandalone.length / 1024)} KB)`);

  // 2. Build lotto-standalone.html (双色球/大乐透)
  const lottoBase = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const ssqCompactJs = fs.readFileSync(path.join(__dirname, 'data', 'ssq-compact.js'), 'utf8');
  const dltCompactJs = fs.readFileSync(path.join(__dirname, 'data', 'dlt-compact.js'), 'utf8');
  const engineJs = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');

  let lottoStandalone = lottoBase.replace(
    /<script src="data\/ssq-compact\.js"><\/script>[\s\S]*?<script src="engine\.js"><\/script>/,
    `<!-- Inlined Scripts for Standalone Mobile Running -->
<script>
${ssqCompactJs}
${dltCompactJs}
${engineJs}
</script>`
  );

  const lottoOut = path.join(__dirname, 'lotto-standalone.html');
  fs.writeFileSync(lottoOut, lottoStandalone, 'utf8');
  console.log('Successfully created:', lottoOut, `(${Math.round(lottoStandalone.length / 1024)} KB)`);
}

buildStandalone();
