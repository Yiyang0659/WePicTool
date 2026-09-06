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

const {
  resolvePreviewRatio,
  buildPreviewStage,
  orderCardsFromFront,
  resolveGestureAxis,
  resolveSwipeDecision,
  buildStackMotionStyles
} = loadMiniProgramModule('miniprogram/utils/previewLayout.js');

test('prefers a card composed ratio over the task fallback', () => {
  assert.equal(resolvePreviewRatio({ composedRatio: '3:4' }, '4:5'), '3:4');
});

test('keeps a landscape source image at WeChat message width without cropping', () => {
  assert.deepEqual(plain(buildPreviewStage({ width: 3000, height: 1000 }, '4:5', 375)), {
    ratio: 'source',
    stageWidth: 143,
    stageHeight: 48,
    cardWidth: 143,
    cardHeight: 48,
    cardStyle: 'width: 143px; height: 48px;'
  });
});

test('uses the compact real-WeChat stack footprint instead of the oversized 60vw stage', () => {
  assert.deepEqual(plain(buildPreviewStage({ composedRatio: '1:1' }, '4:5', 375)), {
    ratio: '1:1',
    stageWidth: 143,
    stageHeight: 143,
    cardWidth: 143,
    cardHeight: 143,
    cardStyle: 'width: 143px; height: 143px;'
  });
  assert.deepEqual(plain(buildPreviewStage({ composedRatio: '4:5' }, '4:5', 375)), {
    ratio: '4:5',
    stageWidth: 143,
    stageHeight: 191,
    cardWidth: 143,
    cardHeight: 191,
    cardStyle: 'width: 143px; height: 191px;'
  });
  assert.deepEqual(plain(buildPreviewStage({ composedRatio: '3:4' }, '4:5', 375)), {
    ratio: '3:4',
    stageWidth: 143,
    stageHeight: 191,
    cardWidth: 143,
    cardHeight: 191,
    cardStyle: 'width: 143px; height: 191px;'
  });
});

test('shrinks the image lane on a narrow device so the avatar and expand control still fit', () => {
  const stage = buildPreviewStage({ composedRatio: '4:5' }, '4:5', 320);
  assert.equal(stage.stageWidth, 122);
  assert.equal(stage.cardWidth, 122);
  assert.equal(stage.cardHeight, 163);
  assert.ok(stage.stageHeight <= 163);
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

test('locks a diagonal gesture only after horizontal or vertical intent is clear', () => {
  assert.equal(resolveGestureAxis(7, 1, 8), null);
  assert.equal(resolveGestureAxis(10, 9, 8), null);
  assert.equal(resolveGestureAxis(14, 8, 8), 'h');
  assert.equal(resolveGestureAxis(7, 14, 8), 'v');
});

test('commits a stack turn by distance or a deliberate flick and ignores a tiny fast touch', () => {
  assert.equal(resolveSwipeDecision(-31, 0.05, 143), -1);
  assert.equal(resolveSwipeDecision(31, 0.05, 143), 1);
  assert.equal(resolveSwipeDecision(-16, -0.4, 143), -1);
  assert.equal(resolveSwipeDecision(5, 0.8, 143), 0);
  assert.equal(resolveSwipeDecision(18, 0.1, 143), 0);
});

test('moves only the front card with the finger while rear cards progressively fill its place', () => {
  const nodes = [
    { pos: 'pos-front' },
    { pos: 'pos-g1' },
    { pos: 'pos-g2' }
  ];
  const motion = buildStackMotionStyles(nodes, 0, -46, 143, false);

  assert.match(motion[0], /translateX\(-46px\)/);
  assert.match(motion[0], /rotate\(-1\.15deg\)/);
  assert.match(motion[1], /translateX\(-4\.57px\)/);
  assert.match(motion[1], /scale\(0\.98\)/);
  assert.match(motion[2], /translateX\(2\.28px\)/);
});

test('settles the outgoing front card and both rear cards into their next fixed slots', () => {
  const nodes = [
    { pos: 'pos-front' },
    { pos: 'pos-g1' },
    { pos: 'pos-g2' }
  ];
  const motion = buildStackMotionStyles(nodes, 0, 1, 143, true);

  assert.match(motion[0], /translateX\(160px\).*rotate\(9deg\).*opacity: 0/);
  assert.match(motion[1], /translateX\(10px\).*scale\(0\.94\)/);
  assert.match(motion[2], /translateX\(0px\).*scale\(1\)/);
});

test('preview markup has one fixed WeChat shell, one scroll region and one combined theme control', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxss'), 'utf8');
  assert.match(wxml, /class="wx \{\{themeClass\}\}"/);
  assert.match(wxml, /class="theme-toggle"/);
  assert.equal((wxml.match(/bindtap="onToggleTheme"/g) || []).length, 1);
  assert.match(wxml, /普通模式/);
  assert.match(wxml, /深色模式/);
  assert.match(wxml, /class="wx-body"/);
  assert.match(wxml, /预览模式/);
  assert.equal((wxml.match(/mode="aspectFill"/g) || []).length, 3);
  assert.match(wxml, /class="vimg"[^>]+mode="aspectFit"/);
  assert.match(wxml, />好友</);
  assert.doesNotMatch(wxml, /wx-status|class="dots"|group-label|分享给好友/);
  assert.match(wxss, /position:\s*fixed;[\s\S]*inset:\s*0;/);
  assert.match(wxss, /\.wx-body\s*\{[\s\S]*height:\s*0;/);
  assert.match(wxss, /\.theme-dark/);
});

test('keeps preview images mounted while toggling a group', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxml'), 'utf8');
  assert.match(wxml, /hidden="\{\{g\.expanded\}\}"/);
  assert.match(wxml, /hidden="\{\{!g\.expanded\}\}"/);
  assert.doesNotMatch(wxml, /<view wx:else class="xcard"/);
  assert.doesNotMatch(wxml, /<block wx:if="\{\{g\.expanded\}\}"/);
  assert.doesNotMatch(wxml, /lazy-load="\{\{true\}\}"/);
});
