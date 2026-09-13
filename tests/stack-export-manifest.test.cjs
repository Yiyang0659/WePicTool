'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadMiniProgramModule, plain } = require('./helpers/miniprogram-loader.cjs');

function load() {
  return loadMiniProgramModule('miniprogram/utils/stackExportManifest.js');
}

test('formats only valid stack sequence labels', () => {
  const manifest = load();
  assert.equal(manifest.formatSequenceLabel(1), '01');
  assert.equal(manifest.formatSequenceLabel(9), '09');
  assert.equal(manifest.formatSequenceLabel(10), '10');
  assert.equal(manifest.formatSequenceLabel(99), '99');
  assert.throws(() => manifest.formatSequenceLabel(0), /1 到 99/);
  assert.throws(() => manifest.formatSequenceLabel(100), /1 到 99/);
});

test('builds ordered outfit stacks and excludes others', () => {
  const manifest = load();
  const result = manifest.buildOutfitManifest('task_1', {
    tops: [
      { resultId: 'top_a', composedUrl: 'wxfile://top-a.jpg', width: 1024, height: 1280 },
      { resultId: 'top_b', composedUrl: 'wxfile://top-b.jpg', width: 1024, height: 1280 }
    ],
    bottoms: [{ resultId: 'bottom_a', url: 'cloud://env/bottom.png' }],
    shoes: [],
    others: [{ resultId: 'other_a', url: '/other.jpg' }]
  }, '4:5');

  assert.deepEqual(plain(result.stacks.map(stack => stack.stackId)), ['tops', 'bottoms', 'shoes']);
  assert.deepEqual(plain(result.stacks[0].cards.map(card => [card.sequenceLabel, card.isCover])), [
    ['01', true], ['02', false]
  ]);
  assert.equal(result.stacks[0].cards[0].sourceUrl, 'wxfile://top-a.jpg');
  assert.equal(result.stacks[0].canExport, false);
  assert.equal(result.stacks[2].cards.length, 0);
  assert.equal(result.fingerprint, manifest.manifestFingerprint(result));
});

test('builds layered dressup groups in registry order with independent numbering', () => {
  const manifest = load();
  const definitions = [
    { key: 'head', title: '头像 / 发型' },
    { key: 'tops', title: '上衣' },
    { key: 'bottoms', title: '下装' },
    { key: 'shoes', title: '鞋子' }
  ];
  const project = {
    projectId: 'layered_1', playId: 'layered-dressup', ratio: '4:5',
    groups: {
      head: [1, 2, 3].map(index => ({ id: 'head_' + index, url: '/head' + index + '.png' })),
      tops: [1, 2, 3].map(index => ({ id: 'top_' + index, url: '/top' + index + '.png' })),
      bottoms: [], shoes: []
    }
  };
  const result = manifest.buildDressupManifest(project, definitions);
  assert.deepEqual(plain(result.stacks.map(stack => stack.stackId)), ['head', 'tops', 'bottoms', 'shoes']);
  assert.equal(result.stacks[0].cards[0].sequenceLabel, '01');
  assert.equal(result.stacks[1].cards[0].sequenceLabel, '01');
  assert.equal(result.stacks[0].canExport, true);
});

test('builds a selected fun text stack from rendered cards', () => {
  const manifest = load();
  const project = {
    projectId: 'fun_1', playId: 'fun-text-stack', version: 1,
    selectedCandidateId: 'candidate_a',
    candidates: [{
      candidateId: 'candidate_a',
      editedScenes: [{ sceneId: 'scene_01' }, { sceneId: 'scene_02' }, { sceneId: 'scene_03' }]
    }]
  };
  const rendered = [1, 2, 3].map(index => ({
    sceneId: 'scene_0' + index,
    url: 'https://example.com/' + index + '.png', width: 1080, height: 1080
  }));
  const result = manifest.buildFunTextManifest(project, rendered);
  assert.equal(result.stacks.length, 1);
  assert.equal(result.stacks[0].stackId, 'candidate_a');
  assert.deepEqual(plain(result.stacks[0].cards.map(card => card.cardId)), ['scene_01', 'scene_02', 'scene_03']);
  assert.equal(result.stacks[0].cards[0].sequenceLabel, '01');
});

test('rejects malformed manifests and unsupported sources', () => {
  const manifest = load();
  const valid = manifest.buildOutfitManifest('task_2', {
    tops: [1, 2, 3].map(index => ({ resultId: 'top_' + index, url: '/top' + index + '.png' })),
    bottoms: [], shoes: []
  }, '1:1');
  const duplicate = plain(valid);
  duplicate.stacks[0].cards[1].cardId = duplicate.stacks[0].cards[0].cardId;
  assert.throws(() => manifest.validateManifest(duplicate), /cardId 重复/);

  const brokenOrder = plain(valid);
  brokenOrder.stacks[0].cards[1].sequence = 3;
  assert.throws(() => manifest.validateManifest(brokenOrder), /序号不连续/);

  const unsupported = plain(valid);
  unsupported.stacks[0].cards[0].sourceUrl = 'ftp://example.com/a.png';
  assert.throws(() => manifest.validateManifest(unsupported), /图片路径协议不支持/);
});

test('accepts the WeChat DevTools temp-file host without allowing arbitrary HTTP', () => {
  const manifest = load();
  assert.equal(manifest.isSupportedSourceUrl('http://tmp/numbered-card.jpg'), true);
  assert.equal(manifest.isSupportedSourceUrl('http://tmp'), true);
  assert.equal(manifest.isSupportedSourceUrl('http://tmp.evil.example/numbered-card.jpg'), false);
  assert.equal(manifest.isSupportedSourceUrl('http://example.com/numbered-card.jpg'), false);
});

test('fingerprint tracks source, ratio, order and badge version but ignores export urls', () => {
  const manifest = load();
  const base = manifest.buildOutfitManifest('task_3', {
    tops: [1, 2, 3].map(index => ({ resultId: 'top_' + index, url: '/top' + index + '.png' })),
    bottoms: [], shoes: []
  }, '4:5');
  const withExports = plain(base);
  withExports.stacks[0].cards.forEach((card, index) => { card.exportUrl = 'wxfile://numbered-' + index + '.png'; });
  assert.equal(manifest.manifestFingerprint(base), manifest.manifestFingerprint(withExports));

  const changedRatio = plain(base);
  changedRatio.ratio = '1:1';
  assert.notEqual(manifest.manifestFingerprint(base), manifest.manifestFingerprint(changedRatio));

  const moved = plain(base);
  moved.stacks[0].cards.reverse();
  moved.stacks[0].cards.forEach((card, index) => {
    card.sequence = index + 1;
    card.sequenceLabel = manifest.formatSequenceLabel(index + 1);
    card.isCover = index === 0;
  });
  assert.notEqual(manifest.manifestFingerprint(base), manifest.manifestFingerprint(moved));

  const changedStyle = plain(base);
  changedStyle.badgeStyleVersion = base.badgeStyleVersion + 1;
  assert.notEqual(manifest.manifestFingerprint(base), manifest.manifestFingerprint(changedStyle));
});

test('flattens selected stacks without losing stack or card order', () => {
  const manifest = load();
  const result = manifest.buildDressupManifest({
    projectId: 'layered_2', ratio: '4:5', groups: {
      head: [1, 2, 3].map(index => ({ id: 'h' + index, url: '/h' + index + '.png' })),
      tops: [1, 2, 3].map(index => ({ id: 't' + index, url: '/t' + index + '.png' })),
      bottoms: [], shoes: []
    }
  }, [
    { key: 'head', title: '头像' }, { key: 'tops', title: '上衣' },
    { key: 'bottoms', title: '下装' }, { key: 'shoes', title: '鞋子' }
  ]);
  const entries = manifest.flattenManifest(result, ['tops', 'head']);
  assert.deepEqual(plain(entries.map(entry => entry.stackId + ':' + entry.sequenceLabel)), [
    'head:01', 'head:02', 'head:03', 'tops:01', 'tops:02', 'tops:03'
  ]);
});
