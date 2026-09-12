const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../miniprogram/utils/funTextProject');
const server = require('../miniprogram/cloudhosting/fun-card-renderer/server');

test('existing render and preview endpoints cannot silently drop unaudited strokes', async () => {
  const p = model.createFunTextProject({sourceText:'今天真开心',now:1000});
  const selected = model.selectCandidate(p,p.candidates[0].candidateId);
  selected.candidates[0].editedScenes[0].strokes = [{id:'stroke_test',brushKey:'pen',colorKey:'black',width:8,points:[{x:10,y:10}]}];
  const deps = { checkContent:async()=>({ok:true}), renderScenes:async()=>[] };
  assert.equal((await server.createRenderStackHandler(deps)(model.buildRenderPayload(selected))).body.code, 'IMAGE_SAFETY_UNAVAILABLE');
  assert.equal((await server.createPreviewStackHandler(deps)(model.buildPreviewPayload(selected))).body.code, 'IMAGE_SAFETY_UNAVAILABLE');
});

test('single scene preview audits text and renders only one decoration-free scene', async () => {
  assert.equal(typeof server.createPreviewSceneHandler, 'function');
  const project = model.createFunTextProject({ sourceText: '今天真开心', now: 1000 });
  const candidate = project.candidates[0];
  const scene = candidate.editedScenes[0];
  let audited = '', rendered;
  const handler = server.createPreviewSceneHandler({
    checkContent: async text => { audited = text; return { ok: true }; },
    renderScenes: async (scenes, job) => {
      rendered = { scenes, job };
      return [{ sceneId: scene.sceneId, order: scene.order, url: 'cloud://test/image.png' }];
    }
  });
  const result = await handler({ projectId: project.projectId, candidateId: candidate.candidateId, scene });
  assert.equal(result.statusCode, 200);
  assert.ok(audited.includes(scene.layers.find(l => l.type === 'text').text));
  assert.equal(rendered.scenes.length, 1);
  assert.ok(rendered.scenes[0].layers.every(l => l.type === 'text'));
  assert.equal(rendered.job.kind, 'preview');
  assert.equal(result.body.card.sceneId, scene.sceneId);
});

test('single scene preview rejects invalid data and refuses missing audit', async () => {
  assert.equal(typeof server.createPreviewSceneHandler, 'function');
  const handler = server.createPreviewSceneHandler({ renderScenes() { throw new Error('must not render'); } });
  assert.equal((await handler({})).statusCode, 400);
  const p = model.createFunTextProject({ sourceText: '今天真开心', now: 1000 });
  assert.equal((await handler({ projectId:p.projectId, candidateId:p.candidates[0].candidateId, scene:p.candidates[0].editedScenes[0] })).statusCode, 503);
});
