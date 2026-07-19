const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMiniProgramModule(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports }, { filename: filePath });
  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const { resolvePreviewRatio, buildPreviewStage, orderCardsFromFront } = loadMiniProgramModule('miniprogram/utils/previewLayout.js');

test('prefers a card composed ratio over the task fallback', () => {
  assert.equal(resolvePreviewRatio({ composedRatio: '3:4' }, '4:5'), '3:4');
});

test('keeps an unknown source image inside the stable preview stage', () => {
  assert.deepEqual(plain(buildPreviewStage({ width: 3000, height: 1000 }, '4:5', 375)), {
    ratio: 'source',
    stageWidth: 203,
    stageHeight: 150,
    cardStyle: 'width: 203px; height: 68px;'
  });
});

test('uses the enlarged 54vw preview stage while preserving ratio safety', () => {
  ['1:1', '4:5', '3:4'].forEach((ratio) => {
    const stage = buildPreviewStage({ composedRatio: ratio }, '4:5', 375);
    const height = Number(stage.cardStyle.match(/height: (\d+)px/)[1]);
    assert.equal(stage.stageWidth, 203);
    assert.equal(stage.stageHeight, 150);
    assert.ok(height <= 150);
  });
});

test('orders an expanded group from the card currently at the front of the stack', () => {
  const cards = [{ num: '01' }, { num: '02' }, { num: '03' }];
  const nodes = [
    { num: '01', pos: 'pos-g1' },
    { num: '02', pos: 'pos-g2' },
    { num: '03', pos: 'pos-front' }
  ];

  assert.deepEqual(plain(orderCardsFromFront(cards, nodes, 2)), [
    { num: '03' }, { num: '01' }, { num: '02' }
  ]);
});

test('preview markup is the approved white 分享给好友 chat shell', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxml'), 'utf8');
  assert.match(wxml, /分享给好友/);
  assert.doesNotMatch(wxml, /theme-toggle|模拟预览/);
});

test('keeps preview images mounted while toggling a group', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxml'), 'utf8');
  assert.match(wxml, /hidden="\{\{g\.expanded\}\}"/);
  assert.match(wxml, /hidden="\{\{!g\.expanded\}\}"/);
  assert.doesNotMatch(wxml, /<view wx:else class="xcard"/);
  assert.doesNotMatch(wxml, /<block wx:if="\{\{g\.expanded\}\}"/);
  assert.doesNotMatch(wxml, /lazy-load="\{\{true\}\}"/);
});
