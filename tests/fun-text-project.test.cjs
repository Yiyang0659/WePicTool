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
const brief = loadMiniProgramModule('miniprogram/utils/creativeBrief.js');
const model = loadMiniProgramModule('miniprogram/utils/funTextProject.js', {
  './creativeBrief': brief,
  './candidatePlanner': planner,
  './styleMatcher': matcher,
  './sceneComposer': composer,
  '../config/stylePacks': stylePacks
});

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
  assert.equal(groups[0].name, candidate.title);
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
