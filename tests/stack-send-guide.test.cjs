const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');
const taskUtils = require('../miniprogram/utils/task.js');
const previewLayout = require('../miniprogram/utils/previewLayout.js');
const manifestUtils = require('../miniprogram/utils/stackExportManifest.js');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function materializedManifest() {
  const manifest = manifestUtils.buildOutfitManifest('preview-task', {
    tops: [1, 2, 3].map((number) => ({ resultId: `top-${number}`, url: `/source/top-${number}.png` })),
    bottoms: [1, 2].map((number) => ({ resultId: `bottom-${number}`, url: `/source/bottom-${number}.png` })),
    shoes: []
  }, '4:5');
  manifest.stacks.forEach((stack) => stack.cards.forEach((card) => {
    card.exportUrl = `/numbered/${stack.stackId}-${card.sequenceLabel}.png`;
  }));
  return manifest;
}

function previewPage() {
  const toasts = [];
  const storage = { wepic_preview_gesture_seen: true };
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/preview/preview.js', {
    '../../utils/task': taskUtils,
    '../../utils/previewLayout': previewLayout,
    '../../utils/stackExportManifest': manifestUtils
  }, {
    showToast(options) { toasts.push(options); },
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; },
    setNavigationBarColor() {},
    setBackgroundColor() {}
  }));
  page._windowWidth = 375;
  return { page, toasts, storage };
}

test('preview theme uses WeChat names, toggles as one control and persists the choice', () => {
  const { page, storage } = previewPage();
  page._loadTheme('light');
  assert.equal(page.data.themeMode, 'light');
  assert.equal(page.data.themeName, '普通模式');
  assert.equal(page.data.themeToggleLabel, '切换到深色模式');

  page.onToggleTheme();
  assert.equal(page.data.themeMode, 'dark');
  assert.equal(page.data.themeName, '深色模式');
  assert.equal(storage.wepic_preview_theme, 'dark');

  page.onToggleTheme();
  assert.equal(page.data.themeMode, 'light');
  assert.equal(storage.wepic_preview_theme, 'light');
});

test('preview shell uses the rendered viewport instead of a possibly stale numeric window height', () => {
  const { page } = previewPage();
  page._applyViewportMetrics({ windowWidth: 390, windowHeight: 667, statusBarHeight: 47 });
  assert.equal(page.data.viewportStyle, 'height: 100%;');
  assert.match(page.data.navStyle, /padding-top: 47px/);
});

test('preview accepts only materialized export urls while preserving manifest order and labels', () => {
  const { page } = previewPage();
  const manifest = materializedManifest();

  page._acceptInput({ manifest, selectedStackIds: ['bottoms', 'tops'], ratio: '4:5' });

  assert.equal(page.data.inputMode, 'manifest');
  assert.equal(page.data.groupList.map((group) => group.stackId).join(','), 'tops,bottoms');
  assert.equal(page.data.groupList[0].cards.map((card) => card.num).join(','), '01,02,03');
  assert.equal(page.data.groupList[0].cards[0].url, '/numbered/tops-01.png');
  assert.equal(page.data.groupList[0].cards[0].isCover, true);
});

test('preview fails closed when a selected manifest card has no export url', () => {
  const { page, toasts } = previewPage();
  const manifest = materializedManifest();
  manifest.stacks[0].cards[1].exportUrl = '';

  page._acceptInput({ manifest, selectedStackIds: ['tops'], ratio: '4:5' });

  assert.equal(page.data.isEmpty, true);
  assert.equal(page.data.groupList.length, 0);
  assert.match(page.data.inputError, /编号图尚未准备好/);
  assert.match(toasts[0].title, /编号图尚未准备好/);
});

test('preview keeps legacy task and groups inputs for one compatibility cycle', () => {
  const first = previewPage().page;
  first._acceptInput({ groups: [{ name: '旧分组', cards: [{ url: '/legacy/1.png' }] }], ratio: '1:1' });
  assert.equal(first.data.inputMode, 'legacy');
  assert.equal(first.data.groupList[0].cards[0].url, '/legacy/1.png');

  const second = previewPage().page;
  second._acceptInput({ task: { taskId: 'old', groups: { tops: [{ resultId: '1', url: '/legacy/2.png' }] }, ratio: '4:5' } });
  assert.equal(second.data.inputMode, 'legacy');
  assert.equal(second.data.groupList[0].cards[0].url, '/legacy/2.png');
});

test('preview stack follows horizontal intent with all three fixed nodes and returns vertical intent to chat', () => {
  const { page } = previewPage();
  page._acceptInput({ manifest: materializedManifest(), selectedStackIds: ['tops'], ratio: '4:5' });

  page.onStackTouchStart({ currentTarget: { dataset: { gi: '0' } }, touches: [{ clientX: 200, clientY: 200 }], timeStamp: 0 });
  page.onStackTouchMove({ touches: [{ clientX: 190, clientY: 191 }], timeStamp: 16 });
  assert.equal(page.data.scrollLock, false, 'ambiguous diagonal should not steal the chat scroll');
  page.onStackTouchMove({ touches: [{ clientX: 154, clientY: 196 }], timeStamp: 32 });
  assert.equal(page.data.scrollLock, true);
  assert.equal(page.data.groupList[0].dragging, true);
  assert.match(page.data.groupList[0].nodes[0].motionStyle, /translateX\(-46px\)/);
  assert.notEqual(page.data.groupList[0].nodes[1].motionStyle, '');
  assert.notEqual(page.data.groupList[0].nodes[2].motionStyle, '');

  page.onStackTouchCancel();
  assert.equal(page.data.scrollLock, false);
  assert.equal(page.data.groupList[0].dragging, false);
  assert.equal(page.data.groupList[0].nodes[0].motionStyle, '');

  page.onStackTouchStart({ currentTarget: { dataset: { gi: '0' } }, touches: [{ clientX: 200, clientY: 200 }], timeStamp: 40 });
  page.onStackTouchMove({ touches: [{ clientX: 194, clientY: 218 }], timeStamp: 56 });
  assert.equal(page._gesture.decided, 'v');
  assert.equal(page.data.scrollLock, false);
});

test('preview committed swipe rotates only the touched group after the synchronized settle', async () => {
  const { page } = previewPage();
  page._acceptInput({ manifest: materializedManifest(), selectedStackIds: ['tops', 'bottoms'], ratio: '4:5' });
  const untouchedFront = page.data.groupList[1].frontIdx;

  page._settleStack(0, -1);
  assert.equal(page.data.groupList[0].settling, true);
  assert.match(page.data.groupList[0].nodes[0].motionStyle, /opacity: 0/);
  assert.match(page.data.groupList[0].nodes[1].motionStyle, /translateX\(0px\)/);
  assert.equal(page.data.groupList[0].nodes[1].incoming, true);

  await new Promise((resolve) => setTimeout(resolve, 235));
  assert.equal(page.data.groupList[0].frontIdx, 1);
  assert.equal(page.data.groupList[1].frontIdx, untouchedFront);
  assert.equal(page.data.groupList[0].settling, false);
});

test('preview expand shows the current-front order as separate messages and collapse restores the stack', async () => {
  const { page } = previewPage();
  page._acceptInput({ manifest: materializedManifest(), selectedStackIds: ['tops'], ratio: '4:5' });
  page.data.groupList[0].nodes[0].pos = 'pos-g2';
  page.data.groupList[0].nodes[1].pos = 'pos-front';
  page.data.groupList[0].nodes[2].pos = 'pos-g1';
  page.data.groupList[0].frontIdx = 1;

  page.onToggleCapsule({ currentTarget: { dataset: { gi: '0' } } });
  assert.equal(page.data.groupList[0].expanded, true);
  assert.equal(page.data.groupList[0].cards.map((card) => card.num).join(','), '02,03,01');
  assert.equal(page.data.groupList[0].rest.map((card) => card.num).join(','), '03,01');

  page.onToggleCapsule({ currentTarget: { dataset: { gi: '0' } } });
  assert.equal(page.data.groupList[0].leaving, true);
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.equal(page.data.groupList[0].expanded, false);
  assert.equal(page.data.groupList[0].leaving, false);
  assert.equal(page.data.groupList[0].frontIdx, 1);
});

test('preview long-press group save uses the currently materialized numbered urls', () => {
  const { page } = previewPage();
  page._acceptInput({ manifest: materializedManifest(), selectedStackIds: ['tops'], ratio: '4:5' });
  let saved;
  page._saveImagesSequentially = function (urls) { saved = urls; };

  page._saveGroup(0);

  assert.equal(Array.from(saved).join(','), '/numbered/tops-01.png,/numbered/tops-02.png,/numbered/tops-03.png');
});

test('preview long-press actions do not promise an image forwarding capability', () => {
  const source = read('miniprogram/pages/preview/preview.js');
  assert.match(source, /\['保存这张', '保存这一组'\]/);
  assert.doesNotMatch(source, /_forwardGroup|itemList:[^\n]*转发/);
});

test('all result guides teach one-stack selection by visible badges without ordering promises', () => {
  const guides = [
    'miniprogram/pages/result/result.wxml',
    'miniprogram/pages/dressup/dressup.wxml',
    'miniprogram/pages/template-result/template-result.wxml'
  ];
  guides.forEach((file) => {
    const markup = read(file);
    assert.match(markup, /每次只发送一叠/);
    assert.match(markup, /按图片角标 01…勾选/);
    assert.match(markup, /发送后合并展示/);
    assert.match(markup, /确认 01 在第一位/);
    assert.doesNotMatch(markup, /文件名.*保证|系统自动排序|一键直发/);
  });
});

test('new result callers send manifest payloads without raw task or groups compatibility data', () => {
  const callers = [
    read('miniprogram/pages/result/result.js'),
    read('miniprogram/pages/dressup/dressup.js'),
    read('miniprogram/pages/template-result/template-result.js')
  ];
  callers.forEach((source) => {
    const emitBlock = source.match(/eventChannel\.emit\('acceptTaskData',[\s\S]{0,700}?\}\);/);
    assert.ok(emitBlock, 'missing acceptTaskData manifest caller');
    assert.match(emitBlock[0], /manifest:/);
    assert.doesNotMatch(emitBlock[0], /\btask:|\bgroups:/);
  });
});
