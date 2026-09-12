'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { loadMiniProgramModule, loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');

const ROOT = path.join(__dirname, '..');

const model = require('../miniprogram/utils/funTextProject');

function readMiniProgramFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function createSampleProject() {
  const project = model.createFunTextProject({
    sourceText: '我今天想见你',
    expressionKey: 'funny-reversal',
    now: 1000
  });
  return model.selectCandidate(project, project.candidates[0].candidateId);
}

function cardsForProject(project, prefix) {
  const candidate = project.candidates.find((item) => item.candidateId === project.selectedCandidateId);
  return candidate.editedScenes.map((scene) => ({
    sceneId: scene.sceneId,
    role: scene.role,
    order: scene.order,
    url: `${prefix || 'cloud://test/final'}/${scene.sceneId}.png`
  }));
}

function recordingWx(overrides) {
  const calls = {
    toasts: [],
    modals: [],
    navigations: [],
    emitted: [],
    requests: [],
    storage: {}
  };
  const wxApi = Object.assign({
    login(options) { options.success({ code: 'test-login-code' }); },
    navigateTo(options) {
      calls.navigations.push(options.url);
      if (typeof options.success === 'function') {
        options.success({
          eventChannel: {
            emit(name, payload) {
              calls.emitted.push({ name, payload });
            }
          }
        });
      }
    },
    showToast(options) {
      calls.toasts.push(options);
    },
    showModal(options) {
      calls.modals.push(options);
    },
    showLoading() {},
    hideLoading() {},
    getStorageSync(key) {
      return calls.storage[key] || null;
    },
    setStorageSync(key, value) {
      calls.storage[key] = value;
    },
    saveImageToPhotosAlbum(options) {
      if (typeof options.success === 'function') options.success({});
    }
  }, overrides || {});
  wxApi.cloud = { callContainer: wxApi.callContainer };
  delete wxApi.callContainer;
  return { wxApi, calls };
}

function loadResultPage(wxApi, customDeps) {
  const client = loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js', {
    '../config/env': { CLOUD_ENV_ID: 'prod-env-123', FUN_CARD_RENDERER_SERVICE: 'fun-card-renderer' }
  });
  let exporter;
  let manifest;
  try {
    manifest = loadMiniProgramModule('miniprogram/utils/stackExportManifest.js');
    exporter = loadMiniProgramModule('miniprogram/utils/imageExporter.js', {
      './stackExportManifest': manifest
    });
  } catch (e) {
    exporter = {};
    manifest = {};
  }

  const assetRegistry = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
  const stylePacks = loadMiniProgramModule('miniprogram/config/stylePacks.js');
  const fontFeels = loadMiniProgramModule('miniprogram/config/fontFeels.js');
  const painter = loadMiniProgramModule('miniprogram/utils/scenePainter.js', {
    '../config/assetRegistry': assetRegistry,
    '../config/stylePacks': stylePacks,
    '../config/fontFeels': fontFeels
  });

  const defaultSequenceComposer = {
    async materializeManifest(wxArg, canvas, inputManifest) {
      const output = JSON.parse(JSON.stringify(inputManifest));
      output.stacks.forEach((stack) => stack.cards.forEach((card) => { card.exportUrl = card.sourceUrl; }));
      return output;
    }
  };
  const deps = Object.assign({
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/funTextProject': model,
    '../../utils/funCardRendererClient': client,
    '../../utils/imageExporter': exporter,
    '../../utils/stackExportManifest': manifest,
    '../../utils/sequenceBadgeComposer': defaultSequenceComposer,
    '../../utils/scenePainter': painter
  }, customDeps || {});

  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/template-result/template-result.js', deps, wxApi));
  page._sequenceCanvas = { id: 'test-sequence-canvas' };
  page._sequenceReady = true;
  return page;
}

function codedError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('template-result renders 1080 stack, saves record locally and provides preview and edit actions', async () => {
  const project = createSampleProject();
  const mockRenderedCards = cardsForProject(project);

  const { wxApi, calls } = recordingWx({
    callContainer(options) {
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          projectId: project.projectId,
          candidateId: project.selectedCandidateId,
          cards: mockRenderedCards
        }
      });
    }
  });

  const page = loadResultPage(wxApi);
  await page.initProject(project);

  assert.equal(page.data.rendering, false);
  assert.equal(page.data.renderedCards.length, mockRenderedCards.length);
  assert.equal(page.data.task.type, 'funtext');
  assert.equal(page.data.task.taskId, project.projectId);

  // Check that history task was recorded
  const history = calls.storage['wepic_history_tasks'] || [];
  assert.ok(history.some(t => t.taskId === project.projectId && t.type === 'funtext'));

  // The record tab reads wepictool_records, so a real result must be visible there.
  const records = calls.storage.wepictool_records || [];
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'funtext');
  assert.equal(records[0].text, project.sourceText);
  assert.equal(records[0].totalCount, mockRenderedCards.length);
  assert.deepEqual(Array.from(records[0].thumbnails), mockRenderedCards.slice(0, 4).map(card => card.url));
  assert.equal(records[0].taskSnapshot.taskId, project.projectId);
  assert.equal(records[0].taskSnapshot.projectSnapshot.projectId, project.projectId);
  assert.equal(records[0].projectSnapshot, project);
  assert.equal(typeof records[0].renderFingerprint, 'string');
  assert.ok(records[0].renderFingerprint.length > 0);
  assert.equal(records[0].taskSnapshot.renderFingerprint, records[0].renderFingerprint);
  assert.ok(records[0].taskSnapshot.cards.every(card => card.renderFingerprint === records[0].renderFingerprint));

  const recordPage = instantiatePage(loadMiniProgramPage('miniprogram/pages/record/record.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': require('../miniprogram/utils/task.js'),
    '../../utils/funTextProject': model
  }, wxApi));
  recordPage.onShow();
  assert.equal(recordPage.data.records.length, 1);
  assert.equal(recordPage.data.records[0].recordType, 'funtext');

  // Tap "先滑着看看" (onPreviewStack)
  await page.onPreviewStack();
  assert.equal(calls.navigations.join(','), '/pages/preview/preview');
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'acceptTaskData');
  const previewData = calls.emitted[0].payload;
  assert.equal(previewData.ratio, '1:1');
  assert.equal(previewData.manifest.playId, 'fun-text-stack');
  assert.equal(previewData.manifest.stacks[0].cards.length, mockRenderedCards.length);

  // Tap "自己改改" (onEditStack)
  page.onEditStack();
  assert.ok(calls.navigations.includes('/pages/fun-text-editor/fun-text-editor'));
});

test('template-result upserts one record per project while preserving its original creation time and 20 item limit', async () => {
  const project = createSampleProject();
  const oldTask = {
    taskId: project.projectId,
    mode: 'funtext',
    type: 'funtext',
    projectSnapshot: project,
    cards: [{ sceneId: 'stale', order: 1, url: 'cloud://test/stale.png' }]
  };
  const oldRecord = {
    recordId: 'record_keep_me',
    createdAt: 321,
    type: 'funtext',
    text: '旧文字',
    totalCount: 1,
    thumbnails: ['cloud://test/stale.png'],
    taskSnapshot: oldTask
  };
  const unrelated = Array.from({ length: 19 }, (_, index) => ({
    recordId: `other_${index}`,
    createdAt: 100 - index,
    type: 'outfit',
    taskSnapshot: { taskId: `other_task_${index}` }
  }));
  const refreshedCards = cardsForProject(project, 'cloud://test/refreshed');
  const { wxApi, calls } = recordingWx();
  calls.storage.wepictool_records = unrelated.slice(0, 5).concat(oldRecord, unrelated.slice(5));
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: refreshedCards });
      }
    }
  });

  await page.initProject(project);
  await page.initProject(project, refreshedCards);

  const records = calls.storage.wepictool_records;
  const matches = records.filter(record => record.taskSnapshot && record.taskSnapshot.taskId === project.projectId);
  assert.equal(records.length, 20);
  assert.equal(matches.length, 1);
  assert.equal(records[0].recordId, 'record_keep_me');
  assert.equal(records[0].createdAt, 321);
  assert.equal(records[0].text, project.sourceText);
  assert.equal(records[0].totalCount, refreshedCards.length);
  assert.deepEqual(Array.from(records[0].thumbnails), refreshedCards.slice(0, 4).map(card => card.url));
});

test('template-result never replaces an outfit record whose projectId collides with funtext', async () => {
  const project = createSampleProject();
  const collidingOutfit = {
    recordId: 'outfit_collision',
    projectId: project.projectId,
    createdAt: 111,
    type: 'outfit',
    taskSnapshot: { taskId: project.projectId, type: 'outfit' }
  };
  const { wxApi, calls } = recordingWx();
  calls.storage.wepictool_records = [collidingOutfit];
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: cardsForProject(project) });
      }
    }
  });

  await page.initProject(project);

  assert.equal(calls.storage.wepictool_records.length, 2);
  assert.equal(calls.storage.wepictool_records[1], collidingOutfit);
  assert.equal(calls.storage.wepictool_records[0].type, 'funtext');
});

test('template-result preserves a funtext record with conflicting internal identities and safely adds the new result', async () => {
  const project = createSampleProject();
  const conflicting = {
    recordId: 'funtext_conflict',
    projectId: project.projectId,
    createdAt: 222,
    type: 'funtext',
    projectSnapshot: Object.assign({}, project, { projectId: 'different_project' }),
    taskSnapshot: {
      taskId: 'different_project',
      type: 'funtext',
      projectSnapshot: Object.assign({}, project, { projectId: 'different_project' })
    }
  };
  const { wxApi, calls } = recordingWx();
  calls.storage.wepictool_records = [conflicting];
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: cardsForProject(project) });
      }
    }
  });

  await page.initProject(project);

  assert.equal(calls.storage.wepictool_records.length, 2);
  assert.equal(calls.storage.wepictool_records[1], conflicting);
  assert.notEqual(calls.storage.wepictool_records[0].recordId, conflicting.recordId);
  assert.equal(calls.storage.wepictool_records[0].projectId, project.projectId);
});

test('template-result treats a malformed present funtext identity field as a conflict instead of ignoring it', async () => {
  const project = createSampleProject();
  const malformed = {
    recordId: 'funtext_malformed_identity',
    projectId: 123,
    createdAt: 333,
    type: 'funtext',
    taskSnapshot: {
      taskId: project.projectId,
      type: 'funtext',
      projectSnapshot: project
    }
  };
  const { wxApi, calls } = recordingWx();
  calls.storage.wepictool_records = [malformed];
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: cardsForProject(project) });
      }
    }
  });

  await page.initProject(project);

  assert.equal(calls.storage.wepictool_records.length, 2);
  assert.equal(calls.storage.wepictool_records[1], malformed);
  assert.equal(calls.storage.wepictool_records[0].projectId, project.projectId);
});

test('template-result collapses every record with the same valid canonical funtext identity', async () => {
  const project = createSampleProject();
  const duplicate = (recordId, createdAt) => ({
    recordId,
    projectId: project.projectId,
    createdAt,
    type: 'funtext',
    projectSnapshot: project,
    taskSnapshot: {
      taskId: project.projectId,
      type: 'funtext',
      projectSnapshot: project
    }
  });
  const first = duplicate('canonical_first', 111);
  const second = duplicate('canonical_second', 222);
  const { wxApi, calls } = recordingWx();
  calls.storage.wepictool_records = [first, second];
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: cardsForProject(project) });
      }
    }
  });

  await page.initProject(project);

  const matching = calls.storage.wepictool_records.filter(record => record.type === 'funtext' && record.projectId === project.projectId);
  assert.equal(matching.length, 1);
  assert.equal(matching[0].recordId, first.recordId);
  assert.equal(matching[0].createdAt, first.createdAt);
});

test('template-result rerenders legacy caches and cards with non-persistent URL schemes', async () => {
  const project = createSampleProject();
  const completeCards = cardsForProject(project);
  const seedWx = recordingWx();
  const seedPage = loadResultPage(seedWx.wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: completeCards });
      }
    }
  });
  await seedPage.initProject(project);
  const persistedTask = seedPage.data.task;
  const invalidUrls = [
    'wxfile://tmp/render.png',
    '/tmp/render.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '',
    '   '
  ];

  const invalidCaches = [
    { cards: completeCards, task: null, label: 'legacy cache without fingerprint' },
    { cards: completeCards.slice(0, -1), task: persistedTask, label: 'incomplete cache' },
    { cards: completeCards.map((card, index) => index === 0 ? Object.assign({}, card, { sceneId: 'wrong-scene' }) : card), task: persistedTask, label: 'wrong scene' },
    { cards: completeCards.map((card, index) => index === 0 ? Object.assign({}, card, { order: 99 }) : card), task: persistedTask, label: 'wrong order' }
  ].concat(invalidUrls.map(url => ({
    cards: persistedTask.cards.map((card, index) => index === 0 ? Object.assign({}, card, { url }) : card),
    task: persistedTask,
    label: url || 'empty URL'
  })));

  for (const cache of invalidCaches) {
    let requests = 0;
    const freshCards = cardsForProject(project, `cloud://test/fresh-${invalidCaches.indexOf(cache)}`);
    const { wxApi } = recordingWx();
    const page = loadResultPage(wxApi, {
      '../../utils/funCardRendererClient': {
        requestRenderStack() {
          requests += 1;
          return Promise.resolve({ cards: freshCards });
        }
      }
    });

    await page.initProject(project, cache.cards, cache.task);

    assert.equal(requests, 1, cache.label);
    assert.deepEqual(Array.from(page.data.renderedCards, card => card.url), freshCards.map(card => card.url));
  }
});

test('template-result reuses only fingerprinted persistent cards and trims their URLs', async () => {
  const project = createSampleProject();
  const completeCards = cardsForProject(project);
  const seedWx = recordingWx();
  const seedPage = loadResultPage(seedWx.wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: completeCards });
      }
    }
  });
  await seedPage.initProject(project);
  const persistedTask = JSON.parse(JSON.stringify(seedPage.data.task));
  persistedTask.cards[0].url = `  ${persistedTask.cards[0].url}  `;
  let requests = 0;
  const { wxApi } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requests += 1;
        return Promise.reject(new Error('valid cache must not render'));
      }
    }
  });

  await page.initProject(project, persistedTask.cards, persistedTask);

  assert.equal(requests, 0);
  assert.deepEqual(Array.from(page.data.renderedCards, card => card.url), completeCards.map(card => card.url));
});

test('template-result rejects a cache when nested selected-scene content changed but ids and order stayed equal', async () => {
  const project = createSampleProject();
  const completeCards = cardsForProject(project);
  const seedWx = recordingWx();
  const seedPage = loadResultPage(seedWx.wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.resolve({ cards: completeCards });
      }
    }
  });
  await seedPage.initProject(project);

  const changedProject = JSON.parse(JSON.stringify(project));
  const selected = changedProject.candidates.find(candidate => candidate.candidateId === changedProject.selectedCandidateId);
  selected.editedScenes[0].layers[0].text = '渲染内容已经变化';
  selected.editedScenes[0].layers[0].lines = ['渲染内容', '已经变化'];
  const freshCards = cardsForProject(changedProject, 'cloud://test/content-changed');
  let requests = 0;
  const { wxApi } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requests += 1;
        return Promise.resolve({ cards: freshCards });
      }
    }
  });

  await page.initProject(changedProject, seedPage.data.task.cards, seedPage.data.task);

  assert.equal(requests, 1);
  assert.deepEqual(Array.from(page.data.renderedCards, card => card.url), freshCards.map(card => card.url));
});

test('template-result ignores a stale remote success after a newer project succeeds', async () => {
  const firstProject = createSampleProject();
  const secondProject = Object.assign({}, createSampleProject(), {
    projectId: 'funtext_second',
    sourceText: '第二个项目'
  });
  const firstRequest = deferred();
  const secondRequest = deferred();
  let requestCount = 0;
  const { wxApi, calls } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requestCount += 1;
        return requestCount === 1 ? firstRequest.promise : secondRequest.promise;
      }
    }
  });

  const firstInit = page.initProject(firstProject);
  const secondInit = page.initProject(secondProject);
  secondRequest.resolve({ cards: cardsForProject(secondProject, 'cloud://test/second') });
  await secondInit;
  firstRequest.resolve({ cards: cardsForProject(firstProject, 'cloud://test/first') });
  await firstInit;

  assert.equal(page.data.project.projectId, secondProject.projectId);
  assert.equal(page.data.task.taskId, secondProject.projectId);
  assert.deepEqual(Array.from(calls.storage.wepictool_records, record => record.projectId), [secondProject.projectId]);
  assert.deepEqual(Array.from(calls.storage.wepic_history_tasks, task => task.taskId), [secondProject.projectId]);
});

test('template-result ignores an older failure when the same project retry already succeeded', async () => {
  const project = createSampleProject();
  const firstRequest = deferred();
  const secondRequest = deferred();
  let requestCount = 0;
  const { wxApi, calls } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requestCount += 1;
        return requestCount === 1 ? firstRequest.promise : secondRequest.promise;
      }
    }
  });

  const firstInit = page.initProject(project);
  const secondInit = page.initProject(project);
  secondRequest.resolve({ cards: cardsForProject(project, 'cloud://test/retry-success') });
  await secondInit;
  firstRequest.reject(codedError('CONTENT_UNSAFE', 'stale failure'));
  await firstInit;

  assert.equal(page.data.renderFailed, false, page.data.renderErrorMessage);
  assert.equal(page.data.task.taskId, project.projectId);
  assert.equal(calls.storage.wepictool_records.length, 1);
  assert.match(page.data.renderedCards[0].url, /retry-success/);
});

test('template-result ignores retry taps while a render request is still pending', async () => {
  const project = createSampleProject();
  const pendingRequest = deferred();
  let requestCount = 0;
  const { wxApi } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requestCount += 1;
        return pendingRequest.promise;
      }
    }
  });

  const init = page.initProject(project);
  page.onRetryRender();

  assert.equal(requestCount, 1);
  pendingRequest.resolve({ cards: cardsForProject(project) });
  await init;
});

test('template-result stops a stale local Canvas export after a newer project succeeds', async () => {
  const firstProject = createSampleProject();
  const secondProject = Object.assign({}, createSampleProject(), {
    projectId: 'funtext_canvas_newer',
    sourceText: '新的项目'
  });
  const firstExport = deferred();
  let selectorCallback;
  let exportCalls = 0;
  let requestCount = 0;
  const canvasNode = {
    getContext() {
      return { clearRect() {} };
    }
  };
  const { wxApi, calls } = recordingWx({
    createSelectorQuery() {
      return {
        select() { return this; },
        fields() { return this; },
        exec(callback) { selectorCallback = callback; }
      };
    },
    canvasToTempFilePath(options) {
      exportCalls += 1;
      firstExport.promise.then(() => options.success({ tempFilePath: 'wxfile://stale.png' }));
    }
  });
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requestCount += 1;
        if (requestCount === 1) return Promise.reject(codedError('NETWORK_ERROR'));
        return Promise.resolve({ cards: cardsForProject(secondProject, 'cloud://test/canvas-newer') });
      }
    },
    '../../utils/scenePainter': { paintScene() {} }
  });

  await page.initProject(firstProject);
  selectorCallback([{ node: canvasNode }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(exportCalls, 1);

  await page.initProject(secondProject);
  firstExport.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(exportCalls, 1);
  assert.equal(page.data.task.taskId, secondProject.projectId);
  assert.equal(page.data.renderFailed, false);
  assert.deepEqual(Array.from(calls.storage.wepictool_records, record => record.projectId), [secondProject.projectId]);
});

test('template-result rejects unsupported funtext project versions without rendering or recording', async () => {
  const project = Object.assign({}, createSampleProject(), { version: 2 });
  let requests = 0;
  let canvasQueries = 0;
  const { wxApi, calls } = recordingWx({
    createSelectorQuery() {
      canvasQueries += 1;
      throw new Error('unsupported versions must not reach Canvas');
    }
  });
  const page = loadResultPage(wxApi, {
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        requests += 1;
        return Promise.reject(new Error('unsupported versions must not render'));
      }
    }
  });

  await page.initProject(project, cardsForProject(project));

  assert.equal(requests, 0);
  assert.equal(canvasQueries, 0);
  assert.equal(page.data.renderFailed, true);
  assert.equal(page.data.renderErrorMessage, '该记录版本暂不支持');
  assert.equal(page.data.task, null);
  assert.equal(calls.storage.wepic_history_tasks, undefined);
  assert.equal(calls.storage.wepictool_records, undefined);
});

test('template-result fails closed without local fallback or history for safety and response errors', async () => {
  const project = createSampleProject();
  const failClosedCodes = [
    'CONTENT_UNSAFE',
    'SAFETY_UNAVAILABLE',
    'INVALID_RENDER_RESPONSE',
    'WX_API_UNAVAILABLE',
    'constructor',
    'toString',
    '__proto__',
    undefined
  ];

  for (const code of failClosedCodes) {
    let canvasQueries = 0;
    const { wxApi, calls } = recordingWx({
      createSelectorQuery() {
        canvasQueries += 1;
        return {
          select() { return this; },
          fields() { return this; },
          exec(callback) { callback([]); }
        };
      }
    });
    const page = loadResultPage(wxApi, {
      '../../utils/funCardRendererClient': {
        requestRenderStack() {
          return Promise.reject(codedError(code));
        }
      }
    });

    await page.initProject(project);

    assert.equal(canvasQueries, 0, `${code} must not start local Canvas export`);
    assert.equal(page.data.renderFailed, true, `${code} must leave the page failed`);
    assert.equal(page.data.task, null, `${code} must not create a task`);
    assert.equal(calls.storage.wepic_history_tasks, undefined, `${code} must not write history`);
  }
});

test('template-result uses local Canvas only for explicit renderer connection errors', async () => {
  const project = createSampleProject();
  for (const code of ['FUN_RENDERER_NOT_CONFIGURED', 'NETWORK_ERROR']) {
    let exported = 0;
    const canvasNode = {
      getContext() {
        return { clearRect() {} };
      }
    };
    const { wxApi, calls } = recordingWx({
      createSelectorQuery() {
        return {
          select() { return this; },
          fields() { return this; },
          exec(callback) { callback([{ node: canvasNode }]); }
        };
      },
      canvasToTempFilePath(options) {
        exported += 1;
        options.success({ tempFilePath: `wxfile://local-${exported}.png` });
      }
    });
    const page = loadResultPage(wxApi, {
      '../../utils/funCardRendererClient': {
        requestRenderStack() {
          return Promise.reject(codedError(code));
        }
      },
      '../../utils/scenePainter': {
        paintScene() {}
      }
    });

    await page.initProject(project);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(page.data.renderFailed, false, code);
    assert.equal(page.data.renderedCards.length, project.candidates[0].editedScenes.length, code);
    assert.equal((calls.storage.wepic_history_tasks || []).length, 1, code);
  }
});

test('template-result falls back locally for an invalid cloud response only with loopback renderer config', async () => {
  const project = createSampleProject();
  let exported = 0;
  const canvasNode = {
    getContext() {
      return { clearRect() {} };
    }
  };
  const { wxApi, calls } = recordingWx({
    createSelectorQuery() {
      return {
        select() { return this; },
        fields() { return this; },
        exec(callback) { callback([{ node: canvasNode }]); }
      };
    },
    canvasToTempFilePath(options) {
      exported += 1;
      options.success({ tempFilePath: `wxfile://loopback-${exported}.png` });
    }
  });
  const page = loadResultPage(wxApi, {
    '../../config/env': {
      ENABLE_FUN_TEXT_STACK_ENTRY: true,
      FUN_CARD_RENDERER_URL: 'http://127.0.0.1:8080'
    },
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.reject(codedError('INVALID_RENDER_RESPONSE', '服务端渲染响应异常'));
      }
    },
    '../../utils/scenePainter': { paintScene() {} }
  });

  await page.initProject(project);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(page.data.renderFailed, false);
  assert.equal(page.data.renderedCards.length, project.candidates[0].editedScenes.length);
  assert.equal((calls.storage.wepic_history_tasks || []).length, 1);
});

test('template-result keeps invalid renderer responses fail-closed with an HTTPS production config', async () => {
  const project = createSampleProject();
  let canvasQueries = 0;
  const { wxApi, calls } = recordingWx({
    createSelectorQuery() {
      canvasQueries += 1;
      return {
        select() { return this; },
        fields() { return this; },
        exec(callback) { callback([]); }
      };
    }
  });
  const page = loadResultPage(wxApi, {
    '../../config/env': {
      ENABLE_FUN_TEXT_STACK_ENTRY: true,
      FUN_CARD_RENDERER_URL: 'https://renderer.example.com'
    },
    '../../utils/funCardRendererClient': {
      requestRenderStack() {
        return Promise.reject(codedError('INVALID_RENDER_RESPONSE', '服务端渲染响应异常'));
      }
    }
  });

  await page.initProject(project);

  assert.equal(canvasQueries, 0);
  assert.equal(page.data.renderFailed, true);
  assert.equal(page.data.task, null);
  assert.equal(calls.storage.wepic_history_tasks, undefined);
});

test('saving sequentially guides the user through WeChat four-step flow and supports resume on error', async () => {
  const project = createSampleProject();
  const mockRenderedCards = project.candidates[0].editedScenes.map((s) => ({
    sceneId: s.sceneId,
    order: s.order,
    url: `http://127.0.0.1:8080/local/${s.sceneId}.png`
  }));

  let failOnce = true;
  const savedList = [];
  const { wxApi } = recordingWx({
    callContainer(options) {
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          projectId: project.projectId,
          candidateId: project.selectedCandidateId,
          cards: mockRenderedCards
        }
      });
    },
    downloadFile(options) {
      options.success({ tempFilePath: '/local/downloaded-card.png' });
    },
    saveImageToPhotosAlbum(options) {
      if (failOnce && savedList.length === 1) {
        failOnce = false;
        options.fail({ errMsg: 'saveImageToPhotosAlbum:fail test' });
        return;
      }
      savedList.push(options.filePath);
      options.success({});
    }
  });

  const page = loadResultPage(wxApi);
  await page.initProject(project);

  // First save fails at index 1 (1 card saved)
  await page.onSaveStack();
  assert.equal(page.data.showGuide, false);
  assert.equal(page.data.saveCursor, 1);

  // Second save resumes from index 1 to end
  await page.onSaveStack();
  assert.equal(page.data.showGuide, true);
  assert.equal(page.data.saveCursor, 0);
  assert.equal(savedList.length, mockRenderedCards.length);
});

test('template-result page template contains WeChat four-step guide and no direct-send promises', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/template-result/template-result.wxml');
  const js = readMiniProgramFile('miniprogram/pages/template-result/template-result.js');
  const wxss = readMiniProgramFile('miniprogram/pages/template-result/template-result.wxss');
  const combined = [wxml, js, wxss].join('\n');

  assert.match(wxml, /先滑着看看/);
  assert.match(wxml, /自己改改/);
  assert.match(wxml, /按顺序保存/);
  assert.match(wxml, /发送后合并展示/);

  // Prohibit fake direct send claims
  assert.doesNotMatch(combined, /(一键发送到微信|直接发给好友|自动合并发送)/);
});

test('funtext result materializes one identity-matched stack with visible sequence urls', async () => {
  const project = createSampleProject();
  const rendered = cardsForProject(project, 'cloud://test/rendered');
  const materialized = [];
  const { wxApi } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/sequenceBadgeComposer': {
      async materializeManifest(wxArg, canvas, manifest) {
        materialized.push({ canvas, manifest });
        const output = JSON.parse(JSON.stringify(manifest));
        output.stacks[0].cards.forEach((card) => { card.exportUrl = `/numbered/${card.sequenceLabel}.png`; });
        return output;
      }
    }
  });
  page._sequenceCanvas = { id: 'funtext-sequence' };
  page._sequenceReady = true;
  page.setData({ project, renderedCards: rendered, rendering: false, renderFailed: false });

  const manifest = await page.prepareExportManifest();

  assert.equal(materialized[0].canvas.id, 'funtext-sequence');
  assert.equal(manifest.stacks.length, 1);
  assert.equal(
    manifest.stacks[0].cards.map((card) => card.sequenceLabel).join(','),
    rendered.map((card, index) => String(index + 1).padStart(2, '0')).join(',')
  );
  assert.equal(manifest.stacks[0].cards[0].cardId, rendered[0].sceneId);
  assert.equal(page.data.renderedCards[0].exportUrl, '/numbered/01.png');
});

test('funtext preview and resumable save reuse the same numbered manifest', async () => {
  const project = createSampleProject();
  const rendered = cardsForProject(project, 'cloud://test/rendered');
  const saveCalls = [];
  let attempt = 0;
  const { wxApi, calls } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/sequenceBadgeComposer': {
      async materializeManifest(wxArg, canvas, manifest) {
        const output = JSON.parse(JSON.stringify(manifest));
        output.stacks[0].cards.forEach((card) => { card.exportUrl = `/numbered/${card.sequenceLabel}.png`; });
        return output;
      }
    },
    '../../utils/imageExporter': {
      async saveExportManifest(wxArg, manifest, options) {
        saveCalls.push({ manifest, options });
        attempt += 1;
        if (attempt === 1) {
          const error = new Error('save failed');
          Object.assign(error, { code: 'SAVE_FAILED', nextIndex: 2, stackTitle: '趣味字画', sequenceLabel: '03' });
          throw error;
        }
        return { ok: true, savedCount: 2 };
      }
    }
  });
  page._sequenceCanvas = {};
  page._sequenceReady = true;
  page.setData({ project, renderedCards: rendered, rendering: false, renderFailed: false });
  await page.prepareExportManifest();

  await page.onPreviewStack();
  await page.onSaveStack();
  assert.equal(page.data.saveCursor, 2);
  assert.equal(page.data.saveNextSequenceLabel, '03');
  await page.onSaveStack();

  assert.equal(calls.emitted[0].payload.manifest.stacks[0].cards[2].exportUrl, '/numbered/03.png');
  assert.equal(saveCalls[0].manifest.stacks[0].cards[2].exportUrl, '/numbered/03.png');
  assert.equal(saveCalls[1].options.startIndex, 2);
  assert.equal(page.data.saveCursor, 0);
});

test('funtext ignores an older save failure after a newer project starts', async () => {
  const project = createSampleProject();
  const rendered = cardsForProject(project, 'cloud://test/rendered');
  const pendingSave = deferred();
  const { wxApi, calls } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/imageExporter': {
      saveExportManifest() {
        return pendingSave.promise;
      }
    }
  });
  page.setData({ project, renderedCards: rendered, rendering: false, renderFailed: false });
  await page.prepareExportManifest();

  const saving = page.onSaveStack();
  await Promise.resolve();
  const newerProject = createSampleProject();
  page.nextRenderGeneration();
  page.invalidateExportState();
  page.setData({ project: newerProject });
  const staleError = codedError('SAVE_FAILED', 'old save failed');
  staleError.nextIndex = 2;
  staleError.sequenceLabel = '03';
  pendingSave.reject(staleError);
  await saving;

  assert.equal(page.data.showGuide, false);
  assert.equal(page.data.exportManifest, null);
  assert.equal(page.data.saveCursor, 0);
  assert.equal(page.data.saveNextSequenceLabel, '');
  assert.equal(page.data.saveSessionFingerprint, '');
  assert.equal(page.data.exportError, '');
  assert.equal(calls.toasts.length, 0);
  assert.equal(calls.modals.length, 0);
});

test('funtext rejects mismatched rendered identities before badge composition', async () => {
  const project = createSampleProject();
  const rendered = cardsForProject(project, 'cloud://test/rendered');
  rendered[0].sceneId = 'wrong-scene';
  let materializeCount = 0;
  const { wxApi } = recordingWx();
  const page = loadResultPage(wxApi, {
    '../../utils/sequenceBadgeComposer': {
      async materializeManifest() { materializeCount += 1; return {}; }
    }
  });
  page._sequenceCanvas = {};
  page._sequenceReady = true;
  page.setData({ project, renderedCards: rendered, rendering: false, renderFailed: false });

  await assert.rejects(page.prepareExportManifest(), /不匹配/);
  assert.equal(materializeCount, 0);
  assert.equal(page.data.exportManifest, null);
});

test('funtext badge failure does not create a successful history record or delete an older one', async () => {
  const project = createSampleProject();
  const rendered = cardsForProject(project, 'cloud://test/rendered');
  const { wxApi, calls } = recordingWx();
  const existing = { recordId: 'older-outfit', type: 'outfit', projectId: project.projectId };
  calls.storage.wepictool_records = [existing];
  const page = loadResultPage(wxApi, {
    '../../utils/sequenceBadgeComposer': {
      async materializeManifest() {
        const error = new Error('badge failed');
        error.code = 'BADGE_COMPOSE_FAILED';
        throw error;
      }
    }
  });
  const generation = page.nextRenderGeneration();

  await page.applyRenderSuccess(project, rendered, generation);

  assert.equal(calls.storage.wepic_history_tasks, undefined);
  assert.equal(calls.storage.wepictool_records.length, 1);
  assert.equal(calls.storage.wepictool_records[0], existing);
  assert.equal(page.data.renderFailed, false);
  assert.match(page.data.exportError, /顺序图生成失败/);
});

test('template-result declares a second canvas and shows the failed sequence on resume', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/template-result/template-result.wxml');
  assert.match(wxml, /id="funTextExporterCanvas"/);
  assert.match(wxml, /id="funTextSequenceBadgeCanvas"/);
  assert.match(wxml, /从.*saveNextSequenceLabel.*继续保存/);
  assert.match(wxml, /item\.exportUrl \|\| item\.url/);
});
