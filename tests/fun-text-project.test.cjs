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
const brief = loadMiniProgramModule('miniprogram/utils/creativeBrief.js');
const model = loadMiniProgramModule('miniprogram/utils/funTextProject.js', {
  './creativeBrief': brief,
  './candidatePlanner': planner,
  './styleMatcher': matcher,
  './sceneComposer': composer,
  './candidateValidator': validator,
  '../config/stylePacks': stylePacks,
  '../config/assetRegistry': assets,
  '../config/fontFeels': fontFeels
});

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).reverse().reduce((result, key) => {
    result[key] = reverseObjectKeys(value[key]);
    return result;
  }, {});
}

test('creates a three-candidate local project with independent scene snapshots', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });

  assert.equal(project.projectId, 'funtext_1000');
  assert.equal(project.playId, 'fun-text-stack');
  assert.equal(project.generationMode, 'rules');
  assert.equal(project.candidates.length, 3);
  assert.equal(project.renderStatus, 'draft');
  assert.deepEqual(plain(project.brief), { expressionKey: 'random-fun', variant: 0 });
  project.candidates.forEach((candidate) => {
    assert.deepEqual(Object.keys(candidate).sort(), [
      'candidateId', 'cards', 'editedScenes', 'originalScenes', 'seed', 'strategyId', 'stylePackId', 'title'
    ]);
    assert.notEqual(candidate.originalScenes, candidate.editedScenes);
    assert.notEqual(candidate.originalScenes[0], candidate.editedScenes[0]);
  });
});

test('editing a card keeps the source project immutable and recalculates its lines', () => {
  const project = model.createFunTextProject({ sourceText: '生日快乐', now: 1000 });
  const candidate = project.candidates[0];
  const scene = candidate.editedScenes[0];
  const sourceText = scene.layers[0].text;
  const next = model.updateCardText(project, candidate.candidateId, scene.sceneId, '先等等再说吧呀');
  const editedLayer = next.candidates[0].editedScenes[0].layers[0];

  assert.notEqual(next, project);
  assert.equal(project.candidates[0].editedScenes[0].layers[0].text, sourceText);
  assert.equal(next.candidates[0].editedScenes[0].layers[0].text, '先等等再说吧呀');
  assert.deepEqual(plain(editedLayer.lines), ['先等等再', '说吧呀']);
  assert.equal(next.renderStatus, 'draft');
  assert.deepEqual(plain(next.renderedCards), []);
});

test('switching a candidate style preserves its edited text and current scene order', () => {
  const project = model.createFunTextProject({ sourceText: '生日快乐', now: 1000 });
  const candidate = project.candidates[0];
  const edited = model.updateCardText(
    project,
    candidate.candidateId,
    candidate.editedScenes[1].sceneId,
    '等一下'
  );
  const reordered = model.moveCard(edited, candidate.candidateId, 1, 0);
  const next = model.switchCandidateStyle(reordered, candidate.candidateId, 'chalk-chaos-v1');
  const nextCandidate = next.candidates[0];

  assert.equal(nextCandidate.stylePackId, 'chalk-chaos-v1');
  assert.equal(nextCandidate.editedScenes[0].order, 1);
  assert.equal(nextCandidate.editedScenes[0].layers[0].text, '等一下');
  assert.equal(nextCandidate.editedScenes[0].background.assetKey, 'chalk-board-01');
  assert.equal(reordered.candidates[0].stylePackId, 'pink-note-v1');
  assert.equal(reordered.candidates[0].editedScenes[0].background.assetKey, 'pink-note-01');
});

test('replanning advances the variant while retaining the project identity', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const next = model.replanProject(project);

  assert.notEqual(next, project);
  assert.equal(next.projectId, project.projectId);
  assert.equal(next.createdAt, 1000);
  assert.equal(next.brief.variant, 1);
  assert.equal(next.selectedCandidateId, '');
  assert.notDeepEqual(
    plain(next.candidates.map((candidate) => candidate.candidateId)),
    plain(project.candidates.map((candidate) => candidate.candidateId))
  );
});

test('render payload contains only the explicitly selected candidate', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const selected = project.candidates[1];
  const next = model.selectCandidate(project, selected.candidateId);
  const preview = model.buildPreviewPayload(next);
  const render = model.buildRenderPayload(next);

  assert.equal(next.selectedCandidateId, selected.candidateId);
  assert.equal(preview.candidates.length, 3);
  assert.deepEqual(plain(preview.candidates.map((candidate) => candidate.candidateId)), plain(project.candidates.map((candidate) => candidate.candidateId)));
  assert.equal(render.candidateId, selected.candidateId);
  assert.equal(render.stylePackId, selected.stylePackId);
  assert.equal(Array.isArray(render.candidates), false);
  assert.deepEqual(plain(render.scenes), plain(next.candidates[1].editedScenes));
});

test('render fingerprint is deterministic when object insertion order changes', () => {
  const draft = model.createFunTextProject({
    sourceText: '稳定指纹',
    expressionKey: 'funny-reversal',
    now: 1000
  });
  const project = model.selectCandidate(draft, draft.candidates[0].candidateId);

  assert.equal(
    model.createRenderFingerprint(project),
    model.createRenderFingerprint(reverseObjectKeys(project))
  );
});

test('preview groups expose rendered selected cards in their stable order', () => {
  const draft = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const project = model.selectCandidate(draft, draft.candidates[1].candidateId);
  const candidate = project.candidates.find((item) => item.candidateId === project.selectedCandidateId);
  const renderedCards = candidate.editedScenes.map((scene) => ({
    sceneId: scene.sceneId,
    url: 'https://example.test/' + scene.sceneId + '.png'
  }));
  const groups = model.buildPreviewGroups(project, renderedCards);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, candidate.candidateId);
  assert.equal(groups[0].name, '趣味字画');
  assert.equal(groups[0].cards[0].id, candidate.editedScenes[0].sceneId);
  assert.equal(groups[0].cards[0].url, 'https://example.test/scene_01.png');
  assert.equal(groups[0].cards[0].ratio, '1:1');
});

test('rejects card text outside the phase-one role limits', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidate = project.candidates[0];
  const hook = candidate.editedScenes.find((scene) => scene.role === 'hook');
  const reveal = candidate.editedScenes.find((scene) => scene.role === 'reveal');
  const pause = candidate.editedScenes.find((scene) => scene.role === 'pause');

  assert.throws(
    () => model.updateCardText(project, candidate.candidateId, hook.sceneId, '字'.repeat(13)),
    /12/
  );
  assert.throws(
    () => model.updateCardText(project, candidate.candidateId, reveal.sceneId, '字'.repeat(41)),
    /40/
  );
  assert.throws(
    () => model.updateCardText(project, candidate.candidateId, hook.sceneId, ''),
    /pause.*ending/
  );

  const next = model.updateCardText(project, candidate.candidateId, pause.sceneId, '');
  assert.equal(next.candidates[0].editedScenes.find((scene) => scene.sceneId === pause.sceneId).layers.some((layer) => layer.type === 'text'), false);
});

test('restores a cleared pause card with a recomposed text layer', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidate = project.candidates[0];
  const pause = candidate.editedScenes.find((scene) => scene.role === 'pause');
  const cleared = model.updateCardText(project, candidate.candidateId, pause.sceneId, '');
  const restored = model.updateCardText(cleared, candidate.candidateId, pause.sceneId, '再等等我一下呀');
  const scene = restored.candidates[0].editedScenes.find((item) => item.sceneId === pause.sceneId);
  const textLayer = scene.layers.find((layer) => layer.type === 'text');

  assert.equal(textLayer.text, '再等等我一下呀');
  assert.deepEqual(plain(textLayer.lines), ['再等等我', '一下呀']);
  assert.equal(composer.validateScene(scene).valid, true);
});

test('restored text inherits the card palette and font selected while it was empty', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidate = project.candidates[0];
  const pause = candidate.editedScenes.find((scene) => scene.role === 'pause');
  let next = model.updateCardText(project, candidate.candidateId, pause.sceneId, '');
  next = model.updateCardStyle(next, candidate.candidateId, pause.sceneId, {
    paletteKey: 'pink-note-coral',
    fontFeelKey: 'headline'
  }, 'card');
  next = model.updateCardText(next, candidate.candidateId, pause.sceneId, '现在揭晓');
  const scene = next.candidates[0].editedScenes.find((item) => item.sceneId === pause.sceneId);
  const textLayer = scene.layers.find((layer) => layer.type === 'text');
  const palette = stylePacks.getPalette(stylePacks.getStylePack(candidate.stylePackId), 'pink-note-coral');

  assert.equal(textLayer.fontKey, 'headline');
  assert.equal(textLayer.fontFamily, 'MaShanZheng');
  assert.equal(textLayer.color, palette.colors.primary);
});

test('rejects an unknown style pack without changing the source project', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });

  assert.throws(
    () => model.switchCandidateStyle(project, project.candidates[0].candidateId, 'unknown-style'),
    /未知视觉包/
  );
  assert.equal(project.candidates[0].stylePackId, 'pink-note-v1');
});

test('an out-of-range card move is a no-op', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const next = model.moveCard(project, project.candidates[0].candidateId, -1, 0);

  assert.equal(next, project);
});

test('render payload rejects missing, invalid, and undersized selected scenes', () => {
  const draft = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  assert.throws(() => model.buildRenderPayload(draft), /选择/);

  const selected = model.selectCandidate(draft, draft.candidates[0].candidateId);
  const undersized = plain(selected);
  undersized.candidates[0].editedScenes = undersized.candidates[0].editedScenes.slice(0, 2);
  assert.throws(() => model.buildRenderPayload(undersized), /3.*8/);

  const invalid = plain(selected);
  invalid.candidates[0].editedScenes[0].width = 360;
  assert.throws(() => model.buildRenderPayload(invalid), /场景不合法/);
});

test('render payload rejects duplicate scene identities and invalid card roles', () => {
  const draft = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const selected = model.selectCandidate(draft, draft.candidates[0].candidateId);
  const duplicate = plain(selected);
  duplicate.candidates[0].editedScenes[1].sceneId = duplicate.candidates[0].editedScenes[0].sceneId;
  assert.throws(() => model.buildRenderPayload(duplicate), /sceneId/);

  const invalidRole = plain(selected);
  invalidRole.candidates[0].cards[0].role = 'unknown-role';
  assert.throws(() => model.buildRenderPayload(invalidRole), /卡片角色/);
});

test('render payload rejects a scene whose role no longer matches its logical card', () => {
  const draft = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const selected = model.selectCandidate(draft, draft.candidates[0].candidateId);
  const invalid = plain(selected);
  invalid.candidates[0].editedScenes[0].role = 'pause';

  assert.throws(() => model.buildRenderPayload(invalid), /逻辑卡片/);
});

test('switching style preserves moved scene identity for later text edits', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidate = project.candidates[0];
  const moved = model.moveCard(project, candidate.candidateId, 1, 0);
  const switched = model.switchCandidateStyle(moved, candidate.candidateId, 'chalk-chaos-v1');
  const switchedCandidate = switched.candidates[0];
  const edited = model.updateCardText(switched, candidate.candidateId, 'scene_02', '等一下呀');
  const editedScene = edited.candidates[0].editedScenes.find((scene) => scene.sceneId === 'scene_02');

  assert.deepEqual(plain(switchedCandidate.editedScenes.map((scene) => scene.sceneId)), [
    'scene_02', 'scene_01', 'scene_03', 'scene_04', 'scene_05'
  ]);
  assert.deepEqual(plain(switchedCandidate.editedScenes.map((scene) => scene.order)), [1, 2, 3, 4, 5]);
  assert.equal(editedScene.layers.find((layer) => layer.type === 'text').text, '等一下呀');
});

test('edits current-card background, palette and font feel without mutating the source', () => {
  let project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidate = project.candidates[0];
  const sceneId = candidate.editedScenes[0].sceneId;
  const source = plain(project);
  project = model.updateCardStyle(project, candidate.candidateId, sceneId, {
    backgroundVariantKey: 'pink-note-lilac',
    paletteKey: 'pink-note-grape',
    fontFeelKey: 'playful'
  }, 'card');
  const scene = project.candidates[0].editedScenes[0];
  assert.equal(scene.backgroundVariantKey, 'pink-note-lilac');
  assert.equal(scene.paletteKey, 'pink-note-grape');
  assert.equal(scene.fontFeelKey, 'playful');
  assert.equal(scene.layers.find((layer) => layer.type === 'text').fontFamily, 'SmileySans');
  assert.deepEqual(plain(source.candidates[0].editedScenes[0]), plain(model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 }).candidates[0].editedScenes[0]));
  assert.equal(project.editHistory.past.length, 1);
});

test('applies a style choice to the whole stack and supports twenty-step undo/redo history', () => {
  let project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidateId = project.candidates[0].candidateId;
  const sceneId = project.candidates[0].editedScenes[0].sceneId;
  project = model.updateCardStyle(project, candidateId, sceneId, { fontFeelKey: 'headline' }, 'stack');
  assert.ok(project.candidates[0].editedScenes.every((scene) => scene.fontFeelKey === 'headline'));
  for (let index = 0; index < 22; index += 1) {
    project = model.setTextSizePreset(project, candidateId, sceneId, index % 2 ? 'small' : 'large');
  }
  assert.equal(project.editHistory.past.length, 20);
  const beforeUndo = project.candidates[0].editedScenes[0].layers.find((layer) => layer.type === 'text').fontSize;
  project = model.undoEdit(project);
  const afterUndo = project.candidates[0].editedScenes[0].layers.find((layer) => layer.type === 'text').fontSize;
  assert.notEqual(afterUndo, beforeUndo);
  assert.equal(project.editHistory.future.length, 1);
  project = model.redoEdit(project);
  assert.equal(project.candidates[0].editedScenes[0].layers.find((layer) => layer.type === 'text').fontSize, beforeUndo);
});

test('adds, transforms, reorders and removes a whitelisted decoration', () => {
  let project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidateId = project.candidates[0].candidateId;
  const sceneId = project.candidates[0].editedScenes[0].sceneId;
  project = model.addDecoration(project, candidateId, sceneId, 'sticker_11');
  let scene = project.candidates[0].editedScenes[0];
  const added = scene.layers.find((layer) => layer.userAdded === true);
  assert.ok(added);
  project = model.updateDecorationTransform(project, candidateId, sceneId, added.id, {
    x: 900, y: 120, scale: 2.2, rotation: 175
  });
  scene = project.candidates[0].editedScenes[0];
  assert.deepEqual(
    Object.fromEntries(['x', 'y', 'scale', 'rotation'].map((key) => [key, scene.layers.find((layer) => layer.id === added.id)[key]])),
    { x: 900, y: 120, scale: 2.2, rotation: 175 }
  );
  project = model.moveDecorationLayer(project, candidateId, sceneId, added.id, 'backward');
  project = model.removeDecoration(project, candidateId, sceneId, added.id);
  assert.equal(project.candidates[0].editedScenes[0].layers.some((layer) => layer.id === added.id), false);
});

test('restores one card or the full stack to the current style baseline', () => {
  let project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  const candidateId = project.candidates[0].candidateId;
  const first = project.candidates[0].editedScenes[0].sceneId;
  const second = project.candidates[0].editedScenes[1].sceneId;
  project = model.updateCardText(project, candidateId, first, '先等等');
  project = model.updateCardText(project, candidateId, second, '再等等');
  project = model.restoreCard(project, candidateId, first);
  assert.notEqual(project.candidates[0].editedScenes[0].layers.find((layer) => layer.type === 'text').text, '先等等');
  assert.equal(project.candidates[0].editedScenes[1].layers.find((layer) => layer.type === 'text').text, '再等等');
  project = model.restoreCandidate(project, candidateId);
  assert.notEqual(project.candidates[0].editedScenes[1].layers.find((layer) => layer.type === 'text').text, '再等等');
});
