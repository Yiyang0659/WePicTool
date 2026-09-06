'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMiniProgramModule, plain } = require('./helpers/miniprogram-loader.cjs');

const cases = loadMiniProgramModule('miniprogram/config/funTextCases.js');

test('registers twelve editable cases across six user scenarios', () => {
  const all = cases.listFunTextCases();
  assert.equal(all.length, 12);
  assert.equal(new Set(all.map((item) => item.caseId)).size, 12);
  assert.equal(new Set(all.map((item) => item.categoryKey)).size, 6);
  all.forEach((item) => {
    assert.match(item.caseId, /^[a-z0-9-]+$/);
    assert.ok(Array.from(item.sourceText).length >= 1 && Array.from(item.sourceText).length <= 40);
    assert.ok(['random-fun', 'funny-reversal', 'cute-direct', 'tough-soft'].includes(item.expressionKey));
    assert.equal(typeof item.preferredStrategyId, 'string');
    assert.equal(typeof item.preferredStylePackId, 'string');
  });
});

test('case reads are cloned and unknown ids do not escape the whitelist', () => {
  const selected = cases.getFunTextCase('miss-you-today');
  assert.equal(selected.sourceText, '我今天想见你');
  selected.sourceText = '被修改';
  assert.equal(cases.getFunTextCase('miss-you-today').sourceText, '我今天想见你');
  assert.equal(cases.getFunTextCase('not-registered'), null);
  assert.deepEqual(plain(cases.listFunTextCategories().map((item) => item.key)), [
    'love', 'birthday', 'reconcile', 'prank', 'group-chat', 'reminder'
  ]);
});
