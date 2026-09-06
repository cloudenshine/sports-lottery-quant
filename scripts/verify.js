"use strict";
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const dir of ['.', 'scripts', 'test']) {
  for (const file of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js'))) {
    new vm.Script(fs.readFileSync(path.join(root, dir, file), 'utf8'), { filename: path.join(dir, file) });
  }
}
for (const name of ['index.html', 'number-tools.html', 'number-tools-standalone.html', 'sports.html', 'research.html', 'lotto-standalone.html', 'sports-standalone.html', 'research-standalone.html']) {
  let index = 0;
  for (const match of fs.readFileSync(path.join(root, name), 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1], { filename: name + ':' + ++index });
  }
}
run(['--test', '--test-reporter=spec', ...fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.js')).map(f => 'test/' + f)]);
run(['scripts/evaluate-science.js']);
run(['scripts/evaluate-number-strategies.js']);
console.log('READY_FOR_JUDGMENT: deterministic gates passed; predictive advantage is not established.');
