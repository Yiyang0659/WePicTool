const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../miniprogram/utils/outfitProgress');
const {loadMiniProgramPage, instantiatePage} = require('./helpers/miniprogram-loader.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function result(image, key = 'tops', status = 'done') {
  return { status: 'done', groups: { [key]: [{sourceImageId: image.imageId, status, matted: key === 'tops', url: 'cloud://output'}] } };
}

test('nine images: concurrency two, true completion and upload order despite out-of-order replies', async () => {
  const rows = p.createSession(Array.from({length:9}, (_, i) => ({imageId: String(i)})));
  const releases = {};
  let active = 0, max = 0;
  const run = p.runSession(rows, image => new Promise(resolve => {
    active++; max = Math.max(active, max);
    releases[image.imageId] = () => { active--; resolve(result(image)); };
  }), () => true, () => {});
  assert.equal(rows.filter(r => r.status === 'done').length, 0);
  releases['1'](); await tick();
  assert.equal(rows.filter(r => r.status === 'done').length, 1);
  for (const i of [0,3,2,5,4,7,6,8]) { releases[i](); await tick(); }
  await run;
  assert.equal(max, 2);
  assert.deepEqual(p.mergeResults(rows).groups.tops.map(i => i.sourceImageId), rows.map(r => r.image.imageId));
});

test('generation failure is not success; manual retry calls only failed image, no duplicates', async () => {
  const rows = p.createSession([{imageId:'a'}, {imageId:'b'}, {imageId:'c'}]);
  const calls = [];
  await p.runSession(rows, async image => { calls.push(image.imageId); return result(image, image.imageId === 'c' ? 'others' : 'tops', image.imageId === 'b' ? 'processing_failed' : 'done'); }, () => true, () => {});
  assert.deepEqual(rows.map(r => r.status), ['done','failed','done']);
  assert.equal(p.mergeResults(rows).groups.others.length, 1);
  p.retryFailed(rows);
  await p.runSession(rows, async image => { calls.push(image.imageId); return result(image); }, () => true, () => {});
  assert.deepEqual(calls, ['a','b','c','b']);
  assert.equal(p.mergeResults(rows).groups.tops.length, 2);
});

test('cancel stops queued work and discards late results', async () => {
  let current = true;
  const releases = [], rows = p.createSession([1,2,3].map(imageId => ({imageId})));
  const run = p.runSession(rows, image => new Promise(resolve => releases.push(() => resolve(result(image)))), () => current, () => {});
  current = false; releases.forEach(release => release()); await run;
  assert.equal(releases.length, 2);
  assert.equal(rows[2].status, 'waiting');
  assert.equal(p.mergeResults(rows).groups.tops.length, 0);
});

test('audit rejection cannot retry deleted source; server errors and malformed success are failures', async () => {
  const rows = p.createSession([1,2,3].map(imageId => ({imageId})));
  await p.runSession(rows, async image => image.imageId === 1 ? {error:{code:'CONTENT_UNSAFE'}} : image.imageId === 2 ? {error:{code:'AI_KEY_MISSING'}} : {status:'done', groups:{}}, () => true, () => {});
  assert.ok(rows.every(r => r.status === 'failed'));
  p.retryFailed(rows);
  assert.deepEqual(rows.map(r => r.status), ['failed','waiting','waiting']);
});

test('callFunction prefix is not a permission error; timeout message warns about duplicate consumption', () => {
  assert.match(p.describeError({errMsg:'cloud.callFunction:fail timeout'}).message, /超时.*后台/);
  assert.doesNotMatch(p.describeError({errMsg:'cloud.callFunction:fail network'}).message, /权限|配置/);
  assert.match(p.describeError({errMsg:'cloud.callFunction:fail permission denied'}).message, /权限/);
});

test('page keeps successes and exposes failures, retries only failed entry then imports ordered results', async () => {
  const calls = [], dialogs = [], imported = [];
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/outfit-import/outfit-import.js', {}, {
    cloud: {callFunction: opts => calls.push(opts)}, showModal: opts => dialogs.push(opts)
  }));
  page.showReviewTask = task => imported.push(task);
  const run = page.createProcessingTask([{fileId:'cloud://a'}, {fileId:'cloud://b'}]);
  calls[0].success({result:result(calls[0].data.images[0])});
  calls[1].fail({errMsg:'cloud.callFunction:fail timeout'});
  await run;
  assert.equal(page.data.progressDone, 1);
  assert.equal(page.data.progressFailed, 1);
  assert.equal(page.data.batchFinished, true);
  assert.equal(imported.length, 0);
  page.onRetryFailed(); dialogs[0].success({confirm:true});
  assert.equal(calls.length, 3);
  assert.equal(calls[2].data.images[0].imageId, calls[1].data.images[0].imageId);
  calls[2].success({result:result(calls[2].data.images[0])}); await tick();
  assert.equal(imported.length, 1);
  assert.equal(imported[0].groups.tops.length, 2);
  page.onUnload();
});
