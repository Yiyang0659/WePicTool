'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const clientColors = require('../miniprogram/config/decorationColors');
const cloudColors = require('../miniprogram/cloudhosting/fun-card-renderer/decorationColors');
const model = require('../miniprogram/utils/funTextProject');
const composer = require('../miniprogram/utils/sceneComposer');
const painter = require('../miniprogram/utils/scenePainter');
const cloudAssets = require('../miniprogram/cloudhosting/fun-card-renderer/drawAssets');
const cloudValidator = require('../miniprogram/cloudhosting/fun-card-renderer/sceneValidator');

function createSelectedProject() {
  let project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  project = model.selectCandidate(project, project.candidates[0].candidateId);
  return project;
}

function colorSignature(registry) {
  return registry.COLOR_GROUPS.flatMap((group) => group.colors.map((color) => {
    if (Array.isArray(color)) return [group.key, color[0], color[1], color[2]];
    return [group.key, color.key, color.color, color.detailColor];
  }));
}

function paintingContext(operations) {
  return {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {},
    closePath() {}, fill() {}, stroke() {}, arc() {},
    set fillStyle(value) { operations.push(['fillStyle', value]); },
    set strokeStyle(value) { operations.push(['strokeStyle', value]); },
    set lineWidth(value) { operations.push(['lineWidth', value]); }
  };
}

test('decoration palette exposes eight vivid, light and transparent choices with cloud parity', () => {
  assert.deepEqual(clientColors.COLOR_GROUPS.map((group) => [group.key, group.colors.length]), [
    ['vivid', 8], ['light', 8], ['transparent', 8]
  ]);
  assert.deepEqual(colorSignature(clientColors), colorSignature(cloudColors));
  assert.ok(clientColors.COLOR_GROUPS.find((group) => group.key === 'transparent').colors.every((color) => color.transparent));
});

test('changing one decoration color is immutable, undoable and resettable', () => {
  const source = createSelectedProject();
  const candidateId = source.selectedCandidateId;
  const sceneId = source.candidates[0].editedScenes[0].sceneId;
  let project = model.addDecoration(source, candidateId, sceneId, 'sticker_11');
  const layerId = project.candidates[0].editedScenes[0].layers.find((layer) => layer.userAdded).id;

  project = model.setDecorationColor(project, candidateId, sceneId, layerId, 'transparent-purple');
  assert.equal(project.candidates[0].editedScenes[0].layers.find((layer) => layer.id === layerId).decorationColorKey, 'transparent-purple');
  assert.equal(source.candidates[0].editedScenes[0].layers.some((layer) => layer.decorationColorKey), false);
  assert.equal(model.undoEdit(project).candidates[0].editedScenes[0].layers.find((layer) => layer.id === layerId).decorationColorKey, undefined);

  project = model.setDecorationColor(project, candidateId, sceneId, layerId, 'default');
  assert.equal(project.candidates[0].editedScenes[0].layers.find((layer) => layer.id === layerId).decorationColorKey, undefined);
  assert.throws(() => model.setDecorationColor(project, candidateId, sceneId, layerId, 'custom-rgb'), /白名单/);
});

test('client and cloud procedural drawers apply the selected decoration paint', () => {
  const layer = {
    id: 'sticker_color', type: 'sticker', assetKey: 'sticker_0',
    x: 540, y: 540, rotation: 0, scale: 1, decorationColorKey: 'light-mint'
  };
  const scene = {
    sceneId: 'scene_color', order: 1, width: 1080, height: 1080,
    background: { color: '#FCE4EC', assetKey: 'pink-note-01' }, layers: [layer]
  };
  const clientOperations = [];
  painter.paintScene(paintingContext(clientOperations), scene, 1080);
  const cloudOperations = [];
  cloudAssets.drawProceduralAsset(paintingContext(cloudOperations), layer);

  assert.ok(clientOperations.some((entry) => entry[0] === 'fillStyle' && entry[1] === '#8FD8D2'));
  assert.ok(clientOperations.some((entry) => entry[0] === 'strokeStyle' && entry[1] === '#256B66'));
  assert.ok(cloudOperations.some((entry) => entry[0] === 'fillStyle' && entry[1] === '#8FD8D2'));
  assert.ok(cloudOperations.some((entry) => entry[0] === 'strokeStyle' && entry[1] === '#256B66'));
});

test('scene validators accept registered decoration colors and reject unknown keys', () => {
  let project = createSelectedProject();
  const candidateId = project.selectedCandidateId;
  const sceneId = project.candidates[0].editedScenes[0].sceneId;
  const originalLayer = project.candidates[0].editedScenes[0].layers.find((layer) => layer.type !== 'text');
  project = model.setDecorationColor(project, candidateId, sceneId, originalLayer.id, 'vivid-blue');
  const payload = model.buildRenderPayload(project);
  assert.equal(composer.validateScene(payload.scenes[0]).valid, true);
  assert.equal(cloudValidator.validateRenderPayload(payload).valid, true);

  payload.scenes[0].layers.find((layer) => layer.type !== 'text').decorationColorKey = 'not-registered';
  assert.equal(composer.validateScene(payload.scenes[0]).valid, false);
  assert.equal(cloudValidator.validateRenderPayload(payload).valid, false);
});
