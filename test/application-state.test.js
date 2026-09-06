'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
// Execute actual UI function bodies with minimal DOM ports, without recreating their logic.
function sourceFunction(file, name) {
  const html = fs.readFileSync(path.join(root,file),'utf8');
  const start = html.indexOf('  function '+name+'(');
  assert.ok(start >= 0);
  const end = html.indexOf('\n  }', start) + 4;
  return html.slice(start,end);
}
function elements() {
  const byId = new Map();
  return id => { if(!byId.has(id)) byId.set(id, {innerHTML:'old',innerText:'old',value:'old',style:{display:'block'}}); return byId.get(id); };
}
test('number inputs and generation failures invalidate print and export state', () => {
  const $ = elements();
  const context = vm.createContext({ $, currentPortfolio: {tickets:[{}]} });
  vm.runInContext(sourceFunction('number-tools.html','invalidatePortfolio')+'\ninvalidatePortfolio();',context);
  assert.equal(context.currentPortfolio,null);
  assert.equal($('thermal-tickets-list').innerHTML,'');
  assert.equal($('copy-text-area').value,'');
});
test('all sports output cards and export state invalidate together', () => {
  const get = elements();
  const context = vm.createContext({document:{getElementById:get}, latestBatchResult:{tickets:[{}]}});
  vm.runInContext(sourceFunction('sports.html','invalidateGeneratedState')+'\ninvalidateGeneratedState();',context);
  assert.equal(context.latestBatchResult,null);
  for(const id of ['opt-result-card','beidan-opt-card','lancai-opt-card','ticket-modal']) assert.equal(get(id).style.display,'none');
});
test('live solving/export rechecks time boundaries even after initial render', () => {
  const now=Date.now(); const notices=[]; let invalidations=0;
  const context = vm.createContext({currentDataset:'live',MockData:{META:{validSnapshot:true,syncedAt:new Date(now-1000).toISOString()}},
    selectedPicks:{x:[{}]}, activeMatches:[{id:'x',kickoffAt:new Date(now-1).toISOString()}],
    invalidateGeneratedState(){invalidations++;},notifyUser(message){notices.push(message);}});
  vm.runInContext(sourceFunction('sports.html','validateCurrentSnapshot'),context);
  assert.equal(vm.runInContext('validateCurrentSnapshot()',context),false);
  assert.equal(invalidations,1); assert.equal(notices.length,1);
  context.activeMatches[0].kickoffAt=new Date(now+3600000).toISOString();
  assert.equal(vm.runInContext('validateCurrentSnapshot()',context),true);
  context.MockData.META.syncedAt=new Date(now-86400001).toISOString();
  assert.equal(vm.runInContext('validateCurrentSnapshot()',context),false);
});
