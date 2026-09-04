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
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/preview/preview.js', {
    '../../utils/task': taskUtils,
    '../../utils/previewLayout': previewLayout,
    '../../utils/stackExportManifest': manifestUtils
  }, {
    showToast(options) { toasts.push(options); }
  }));
  page._windowWidth = 375;
  return { page, toasts };
}

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

test('preview long-press group save uses the currently materialized numbered urls', () => {
  const { page } = previewPage();
  page._acceptInput({ manifest: materializedManifest(), selectedStackIds: ['tops'], ratio: '4:5' });
  let saved;
  page._saveImagesSequentially = function (urls) { saved = urls; };

  page._saveGroup(0);

  assert.equal(Array.from(saved).join(','), '/numbered/tops-01.png,/numbered/tops-02.png,/numbered/tops-03.png');
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
