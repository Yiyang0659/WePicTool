const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../miniprogram/utils/funTextProject');

test('audit outage stops speculative queue and new preloads but allows a manual recovery probe',async()=>{
  const cache=require('../miniprogram/utils/funPreviewCache').createPreviewCache();
  const p=id=>({projectId:'p',candidateId:'c',scene:{sceneId:id,layers:[]}});
  let calls=0;
  const request=async()=>{calls++;throw Object.assign(Error('unavailable'),{code:'SAFETY_UNAVAILABLE'});};
  await Promise.allSettled([cache.get(p('a'),request,true),cache.get(p('b'),request,true),cache.get(p('c'),request,true)]);
  assert.equal(calls,1,'do not drain all speculative jobs after audit outage');
  await assert.rejects(cache.get(p('d'),request,true));assert.equal(calls,1);
  assert.equal(await cache.get(p('a'),async()=>'/tmp/recovered'),'/tmp/recovered');
});

test('preload queue is bounded at two, promotes foreground and exposes ready files synchronously',async()=>{
  const cache=require('../miniprogram/utils/funPreviewCache').createPreviewCache();
  const p=id=>({projectId:'p',candidateId:'c',scene:{sceneId:id,layers:[]}});
  const started=[], done={};
  const request=input=>new Promise(resolve=>{started.push(input.scene.sceneId);done[input.scene.sceneId]=resolve;});
  const a=cache.get(p('a'),request,true),b=cache.get(p('b'),request,true);
  const c=cache.get(p('c'),request,true),d=cache.get(p('d'),request,true);
  assert.equal(cache.get(p('d'),request),d);
  await Promise.resolve();assert.deepEqual(started,['a','d'],'visible request starts without waiting for background');
  done.a('/tmp/a');await a;await Promise.resolve();
  assert.deepEqual(started,['a','d']);assert.equal(cache.peek(p('a')),'/tmp/a');
  const rejected=Promise.all([assert.rejects(c,/替换/),assert.rejects(b,/替换/)]);cache.cancelBackground();await rejected;
  done.d('/tmp/d');await d;
});

test('selected candidate preloads every card and all three font variants with matching keys',()=>{
  const preloader=require('../miniprogram/utils/funPreviewPreloader');
  const {previewKey}=require('../miniprogram/utils/funPreviewCache');
  const fonts=require('../miniprogram/config/fontFeels');
  const project=model.createFunTextProject({sourceText:'今天真开心',now:2}),c=project.candidates[0];
  const all=preloader.payloads(project,c.candidateId,2),keys=new Set(all.map(previewKey));
  assert.equal(all[0].scene.sceneId,c.editedScenes[2].sceneId);
  fonts.FONT_KEYS.forEach(fontFeelKey=>{
    const changed=model.updateCardStyle(project,c.candidateId,c.editedScenes[0].sceneId,{fontFeelKey},'stack');
    changed.candidates[0].editedScenes.forEach(scene=>assert.ok(keys.has(previewKey({projectId:project.projectId,candidateId:c.candidateId,scene}))));
  });
  assert.equal(keys.size,all.length);
});

test('base preview cache excludes decoration transforms but includes text and scopes projects', async () => {
  const { createPreviewCache } = require('../miniprogram/utils/funPreviewCache');
  const cache = createPreviewCache();
  const p = model.createFunTextProject({ sourceText: '今天真开心', now: 1 });
  const payload = { projectId: p.projectId, candidateId: p.candidates[0].candidateId, scene: p.candidates[0].editedScenes[0] };
  let calls = 0;
  const request = async () => { calls++; return 'cloud://test/' + calls; };
  assert.equal(await cache.get(payload, request), 'cloud://test/1');
  const moved = JSON.parse(JSON.stringify(payload));
  moved.scene.layers.filter(l => l.type !== 'text').forEach(l => { l.x += 10; });
  assert.equal(await cache.get(moved, request), 'cloud://test/1');
  moved.scene.layers.find(l => l.type === 'text').text = '更改';
  assert.equal(await cache.get(moved, request), 'cloud://test/2');
  cache.invalidate(payload);
  assert.equal(await cache.get(payload, request), 'cloud://test/3');
  assert.equal(await cache.get({ ...payload, projectId: 'funtext_other' }, request), 'cloud://test/4');
});

test('concurrent base requests coalesce and a rejected request can retry', async () => {
  const { createPreviewCache } = require('../miniprogram/utils/funPreviewCache');
  const cache = createPreviewCache();
  const p = { projectId:'p', candidateId:'c', scene:{ sceneId:'s', layers:[] } };
  let count = 0;
  const request = async () => { count++; throw new Error('offline'); };
  await Promise.allSettled([cache.get(p,request), cache.get(p,request)]);
  assert.equal(count,1);
  assert.equal(await cache.get(p,async () => 'cloud://ok'), 'cloud://ok');
});
