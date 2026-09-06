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

  sportsStandalone = sportsStandalone.replace(/<script src="(data\/research\/dashboard\.js|sports-return-policy\.js|returns-workbench\.js)"><\/script>/g, (_, name) => `<script>\n${fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
  const sportsOut = path.join(__dirname, 'sports-standalone.html');
  fs.writeFileSync(sportsOut, sportsStandalone, 'utf8');
  console.log('Successfully created:', sportsOut, `(${Math.round(sportsStandalone.length / 1024)} KB)`);

  // 2. Build lotto-standalone.html (双色球/大乐透)
  const lottoBase = fs.readFileSync(path.join(__dirname, 'number-tools.html'), 'utf8');
  const ssqCompactJs = fs.readFileSync(path.join(__dirname, 'data', 'ssq-compact.js'), 'utf8');
  const dltCompactJs = fs.readFileSync(path.join(__dirname, 'data', 'dlt-compact.js'), 'utf8');
  const numberPublicSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'numbers', 'public-snapshot.json'), 'utf8'));
  const numberDashboardJs = `window.NUMBER_DASHBOARD = ${JSON.stringify(numberPublicSnapshot).replace(/</g, '\\u003c')};`;
  const engineJs = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
  const numberToolsLiveJs = fs.readFileSync(path.join(__dirname, 'number-tools-live.js'), 'utf8');

  let lottoStandalone = lottoBase.replace(
    /<script src="data\/ssq-compact\.js"><\/script>[\s\S]*?<script src="number-tools-live\.js"><\/script>/,
    `<!-- Inlined Scripts for Standalone Mobile Running -->
<script>
${ssqCompactJs}
${dltCompactJs}
${numberDashboardJs}
${engineJs}
${numberToolsLiveJs}
</script>`
  );

  const lottoOut = path.join(__dirname, 'number-tools-standalone.html');
  if (/<script[^>]+src=/.test(lottoStandalone)) throw new Error('Number tools standalone has unresolved scripts');
  fs.writeFileSync(lottoOut, lottoStandalone, 'utf8');
  console.log('Successfully created:', lottoOut, `(${Math.round(lottoStandalone.length / 1024)} KB)`);

  const numberBase = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('<head>', '<head>\n<script>window.NUMBER_APP_OFFLINE = true;</script>');
  const numberStandalone = numberBase.replace(/<script src="(number-models\.js|number-settlement\.js|number-app\.js|data\/numbers\/dashboard\.js|number-crowd-model\.js|data\/returns\/crowd-report\.js|returns-workbench\.js)"><\/script>/g, (_, name) => {
    const filename = path.join(__dirname, name);
    const code = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : name === 'data/numbers/dashboard.js' ? 'window.NUMBER_DASHBOARD = null;' : (() => { throw new Error('Missing module: ' + name); })();
    return `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });
  if (/<script[^>]+src=/.test(numberStandalone)) throw new Error('Number standalone has unresolved scripts');
  fs.writeFileSync(path.join(__dirname, 'lotto-standalone.html'), numberStandalone, 'utf8');
  console.log('Successfully created: lotto-standalone.html');

  // 3. Research: embed the last saved snapshot; the page never collects data itself.
  const researchBase = fs.readFileSync(path.join(__dirname, 'research.html'), 'utf8');
  const dashboardPath = path.join(__dirname, 'data', 'research', 'dashboard.js');
  const dashboardJs = fs.existsSync(dashboardPath) ? fs.readFileSync(dashboardPath, 'utf8') : 'window.RESEARCH_DASHBOARD = null;';
  const rendererJs = fs.readFileSync(path.join(__dirname, 'research-dashboard.js'), 'utf8');
  const researchStandalone = researchBase.replace(
    /<script src="data\/research\/dashboard\.js"><\/script>\s*<script src="research-dashboard\.js"><\/script>/,
    () => `<script>\n${dashboardJs.replace(/<\/script/gi, '<\\/script')}\n${rendererJs.replace(/<\/script/gi, '<\\/script')}\n</script>`
  );
  const researchOut = path.join(__dirname, 'research-standalone.html');
  fs.writeFileSync(researchOut, researchStandalone, 'utf8');
  console.log('Successfully created:', researchOut, `(${Math.round(researchStandalone.length / 1024)} KB)`);
}

buildStandalone();
