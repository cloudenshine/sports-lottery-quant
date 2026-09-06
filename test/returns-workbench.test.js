'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = require('../returns-workbench');
const policy = require('../sports-return-policy');

test('manual return calculations cannot grant trusted probability or sale evidence', () => {
  const input = app.sportsInput(null, {market:'jingcai', probabilities:'0.5,0.3,0.2', odds:'2.5,3.2,4.5', budget:'200'});
  const result = policy.evaluateDecision(input);
  assert.equal(result.risk.selectedStakeYuan, 0);
  assert.equal(input.calibrated, false);
  assert.equal(input.officialSale, null);
  assert.match(app.sportsResult(result), /当前决策金额：0.00/);
  assert.match(app.sportsResult(result), /同投入随机/);
  assert.match(app.sportsResult({...result, reasons:['<img src=x onerror=alert(1)>']}), /&lt;img/);
  assert.throws(() => app.values('0.5,NaN,0.5'));
  assert.throws(() => policy.evaluateDecision({...input, probabilities:app.values('0.5,0.5,0.5')}), /sum/);
});

test('public new workbench and modules load without Node globals', () => {
  const context = vm.createContext({});
  for (const name of ['sports-return-policy.js','number-crowd-model.js','returns-workbench.js']) vm.runInContext(fs.readFileSync(name,'utf8'),context);
  assert.equal(typeof context.SportsReturnPolicy.evaluateDecision, 'function');
  assert.equal(typeof context.NumberCrowdModel.createPortfolio, 'function');
  for (const [file, kind] of [['sports.html','sports'],['index.html','numbers']]) {
    assert.match(fs.readFileSync(file,'utf8'),new RegExp(`data-returns-workbench="${kind}"`));
  }
});
