const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadMiniProgramModule,
  plain
} = require('./helpers/miniprogram-loader.cjs');

const registry = loadMiniProgramModule('miniprogram/config/playRegistry.js');
const { normalizeCreativeBrief } = loadMiniProgramModule('miniprogram/utils/creativeBrief.js');

test('registers fun text as a rule-first square stack', () => {
  const play = registry.getPlayDefinition('fun-text-stack');

  assert.equal(play.title, '趣味字画');
  assert.equal(play.inputType, 'text');
  assert.equal(play.renderer, 'fun-card-scene');
  assert.equal(play.preview, 'single-stack');
  assert.equal(play.exporter, 'ordered-sequence');
});

test('normalizes a 1-40 character brief with safe defaults', () => {
  assert.deepEqual(plain(normalizeCreativeBrief({ sourceText: '  我今天想见你  ' })), {
    sourceText: '我今天想见你',
    expressionKey: 'random-fun',
    relationship: 'unspecified',
    intensity: 'medium',
    requestedCandidateCount: 3,
    cardRange: { min: 3, preferred: 5, max: 8 },
    locale: 'zh-CN',
    variant: 0
  });
  assert.throws(() => normalizeCreativeBrief({ sourceText: '' }), /请输入一句话/);
  assert.throws(() => normalizeCreativeBrief({ sourceText: '字'.repeat(41) }), /40/);
});
