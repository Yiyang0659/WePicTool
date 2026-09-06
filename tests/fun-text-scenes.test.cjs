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
const fontFeels = loadMiniProgramModule('miniprogram/config/fontFeels.js');
const matcher = loadMiniProgramModule('miniprogram/utils/styleMatcher.js', {
  '../config/stylePacks': stylePacks
});
const composer = loadMiniProgramModule('miniprogram/utils/sceneComposer.js', {
  '../config/stylePacks': stylePacks,
  '../config/assetRegistry': assets,
  '../config/fontFeels': fontFeels,
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

test('style matching honors a valid case preference without duplicates', () => {
  const ids = matcher.matchStylePacks([
    { candidateId: 'a' }, { candidateId: 'b' }, { candidateId: 'c' }
  ], 0, 'gentle-journal-v1');
  assert.equal(ids[0], 'gentle-journal-v1');
  assert.equal(new Set(ids).size, 3);
});

test('exposes seven style packs and the procedural asset inventories', () => {
  const registered = assets.listAssets();
  const stickers = registered.filter((asset) => asset.type === 'sticker');
  const doodles = registered.filter((asset) => asset.type === 'doodle');

  assert.deepEqual(plain(stylePacks.STYLE_PACKS.map((pack) => pack.id)), [
    'pink-note-v1', 'chalk-chaos-v1', 'paper-collage-v1', 'crazy-grid-v1',
    'gentle-journal-v1', 'blue-soda-v1', 'retro-ticket-v1'
  ]);
  assert.deepEqual(plain(stylePacks.TEXT_EFFECT_KEYS), [
    'marker-bold', 'chalk-rough', 'collage-cutout', 'stamp-shadow'
  ]);
  assert.deepEqual(plain(stickers.map((asset) => asset.key)), [
    'sticker_0', 'sticker_1', 'sticker_2', 'sticker_3', 'sticker_4', 'sticker_5',
    'sticker_6', 'sticker_7', 'sticker_8', 'sticker_9', 'sticker_10', 'sticker_11'
  ]);
  assert.deepEqual(plain(doodles.map((asset) => asset.key)), [
    'arrow-curve', 'heart-outline', 'circle-mark', 'underline-rough', 'scribble-cross', 'burst-lines'
  ]);
  registered.forEach((asset) => {
    assert.equal(asset.source, 'project-owned');
    assert.equal(asset.renderer, 'procedural-v1');
  });
});

test('each style exposes validated background, palette and font-feel choices', () => {
  stylePacks.STYLE_PACKS.forEach((pack) => {
    assert.equal(pack.backgroundVariants.length, 3, pack.id);
    assert.ok(pack.palettes.length >= 2, pack.id);
    assert.ok(pack.backgroundVariants.some((item) => item.key === pack.defaultBackgroundVariantKey));
    assert.ok(pack.palettes.some((item) => item.key === pack.defaultPaletteKey));
    assert.ok(['marker', 'playful', 'headline'].includes(pack.defaultFontFeelKey));
  });
});

function makeValidScene() {
  const candidate = planner.planRuleCandidates(
    normalizeCreativeBrief({ sourceText: '我今天想见你' })
  ).candidates[0];
  return plain(composer.composeCandidate(candidate, 'pink-note-v1')[0]);
}

test('rejects a text layer with an unknown effect key', () => {
  const scene = makeValidScene();
  scene.layers.find((layer) => layer.type === 'text').effectKey = 'unknown-effect';

  assert.equal(composer.validateScene(scene).valid, false);
});

test('rejects a background asset outside the style-pack whitelist', () => {
  const scene = makeValidScene();
  scene.background.assetKey = 'unknown-background';

  assert.equal(composer.validateScene(scene).valid, false);
});

test('rejects a decoration whose layer type differs from its registry type', () => {
  const scene = makeValidScene();
  scene.layers.find((layer) => layer.type === 'doodle').type = 'sticker';

  assert.equal(composer.validateScene(scene).valid, false);
});

test('rejects two text main layers even when the total text layer limit is met', () => {
  const scene = makeValidScene();
  const main = scene.layers.find((layer) => layer.id === 'text_main');
  scene.layers.push(Object.assign({}, main));

  assert.equal(composer.validateScene(scene).valid, false);
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
    assert.equal(scene.stylePackId, 'pink-note-v1');
    assert.equal(typeof scene.backgroundVariantKey, 'string');
    assert.equal(typeof scene.paletteKey, 'string');
    assert.equal(typeof scene.fontFeelKey, 'string');
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

test('composes a requested valid background, palette and font feel', () => {
  const candidate = planner.planRuleCandidates(
    normalizeCreativeBrief({ sourceText: '我今天想见你' })
  ).candidates[0];
  const scenes = composer.composeCandidate(candidate, 'blue-soda-v1', {
    backgroundVariantKey: 'blue-soda-wave',
    paletteKey: 'blue-soda-deep',
    fontFeelKey: 'headline'
  });
  scenes.forEach((scene) => {
    assert.equal(scene.backgroundVariantKey, 'blue-soda-wave');
    assert.equal(scene.paletteKey, 'blue-soda-deep');
    assert.equal(scene.fontFeelKey, 'headline');
    assert.equal(scene.layers.find((layer) => layer.type === 'text').fontKey, 'headline');
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
