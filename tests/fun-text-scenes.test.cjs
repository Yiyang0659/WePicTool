const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadMiniProgramModule,
  plain
} = require('./helpers/miniprogram-loader.cjs');

const strategies = loadMiniProgramModule('miniprogram/config/funTextStrategies.js');
const selector = loadMiniProgramModule('miniprogram/utils/strategySelector.js', {
  '../config/funTextStrategies': strategies
});
const validator = loadMiniProgramModule('miniprogram/utils/candidateValidator.js');
const planner = loadMiniProgramModule('miniprogram/utils/candidatePlanner.js', {
  '../config/funTextStrategies': strategies,
  './strategySelector': selector,
  './candidateValidator': validator
});
const stylePacks = loadMiniProgramModule('miniprogram/config/stylePacks.js');
const assets = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
const matcher = loadMiniProgramModule('miniprogram/utils/styleMatcher.js', {
  '../config/stylePacks': stylePacks
});
const composer = loadMiniProgramModule('miniprogram/utils/sceneComposer.js', {
  '../config/stylePacks': stylePacks,
  '../config/assetRegistry': assets,
  './candidatePlanner': planner
});
const { normalizeCreativeBrief } = loadMiniProgramModule('miniprogram/utils/creativeBrief.js');

test('matches three different style packs to three candidates', () => {
  const ids = matcher.matchStylePacks([
    { candidateId: 'a' }, { candidateId: 'b' }, { candidateId: 'c' }
  ], 0);

  assert.deepEqual(plain(ids), ['pink-note-v1', 'chalk-chaos-v1', 'paper-collage-v1']);
  assert.equal(new Set(ids).size, 3);
});

test('registers exactly the phase-one procedural asset whitelist', () => {
  const registered = assets.listAssets();
  assert.equal(registered.length, 18);
  assert.deepEqual(plain(registered.map((asset) => asset.key)), [
    'sticker_0', 'sticker_1', 'sticker_2', 'sticker_3', 'sticker_4', 'sticker_5',
    'sticker_6', 'sticker_7', 'sticker_8', 'sticker_9', 'sticker_10', 'sticker_11',
    'arrow-curve', 'heart-outline', 'circle-mark', 'underline-rough', 'scribble-cross', 'burst-lines'
  ]);
  registered.forEach((asset) => {
    assert.equal(asset.source, 'project-owned');
    assert.equal(asset.renderer, 'procedural-v1');
  });
});

test('composes deterministic editable 1080 square scenes', () => {
  const candidate = planner.planRuleCandidates(
    normalizeCreativeBrief({ sourceText: '我今天想见你' })
  ).candidates[0];
  const first = composer.composeCandidate(candidate, 'pink-note-v1');
  const second = composer.composeCandidate(candidate, 'pink-note-v1');

  assert.deepEqual(plain(first), plain(second));
  assert.equal(first.length, candidate.cards.length);
  first.forEach((scene, index) => {
    const card = candidate.cards[index];
    const textLayers = scene.layers.filter((layer) => layer.type === 'text');
    const decorationLayers = scene.layers.filter((layer) => layer.type !== 'text');

    assert.equal(scene.width, 1080);
    assert.equal(scene.height, 1080);
    assert.equal(scene.sceneId, 'scene_' + String(card.order).padStart(2, '0'));
    assert.ok(textLayers.length <= 2);
    assert.ok(decorationLayers.length <= 6);
    textLayers.forEach((layer) => {
      assert.ok(Array.isArray(layer.lines));
      assert.ok(layer.lines.length >= 1);
      assert.ok(layer.x >= 0 && layer.x <= 1080);
      assert.ok(layer.y >= 0 && layer.y <= 1080);
    });
    assert.equal(composer.validateScene(scene).valid, true);
  });
});

test('uses role-driven layouts for a misdirect, pause, reveal, and ending', () => {
  const candidate = planner.planRuleCandidates(
    normalizeCreativeBrief({ sourceText: '我今天想见你' })
  ).candidates[0];
  const scenes = composer.composeCandidate(candidate, 'pink-note-v1');
  const byRole = Object.fromEntries(candidate.cards.map((card, index) => [card.role, scenes[index]]));

  assert.ok(byRole.hook.layers.find((layer) => layer.type === 'text').y < 540);
  assert.ok(byRole.misdirect.layers.some((layer) => layer.assetKey === 'scribble-cross'));
  assert.ok(byRole.pause.layers.filter((layer) => layer.type === 'text').length <= 1);
  assert.ok(byRole.reveal.layers.find((layer) => layer.type === 'text').fontSize > 200);
  assert.ok(byRole.ending.layers.some((layer) => layer.type !== 'text'));
});
