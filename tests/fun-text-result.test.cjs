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
  return { wxApi, calls };
}

function loadResultPage(wxApi, customDeps) {
  const client = loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js', {
    '../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.test' }
  });
  let exporter;
  try {
    exporter = loadMiniProgramModule('miniprogram/utils/imageExporter.js');
  } catch (e) {
    exporter = {};
  }

  const assetRegistry = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
  const stylePacks = loadMiniProgramModule('miniprogram/config/stylePacks.js');
  const painter = loadMiniProgramModule('miniprogram/utils/scenePainter.js', {
    '../config/assetRegistry': assetRegistry,
    '../config/stylePacks': stylePacks
  });

  const deps = Object.assign({
    '../../utils/funTextProject': model,
    '../../utils/funCardRendererClient': client,
    '../../utils/imageExporter': exporter,
    '../../utils/scenePainter': painter
  }, customDeps || {});

  return instantiatePage(loadMiniProgramPage('miniprogram/pages/template-result/template-result.js', deps, wxApi));
}

function codedError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

test('template-result renders 1080 stack, saves record locally and provides preview and edit actions', async () => {
  const project = createSampleProject();
  const mockRenderedCards = cardsForProject(project);

  const { wxApi, calls } = recordingWx({
    request(options) {
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

  const recordPage = instantiatePage(loadMiniProgramPage('miniprogram/pages/record/record.js', {
    '../../utils/task': require('../miniprogram/utils/task.js')
  }, wxApi));
  recordPage.onShow();
  assert.equal(recordPage.data.records.length, 1);
  assert.equal(recordPage.data.records[0].recordType, 'funtext');

  // Tap "先滑着看看" (onPreviewStack)
  page.onPreviewStack();
  assert.deepEqual(calls.navigations, ['/pages/preview/preview']);
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'acceptTaskData');
  const previewData = calls.emitted[0].payload;
  assert.equal(previewData.ratio, '1:1');
  assert.equal(previewData.groups[0].name, '趣味字画');
  assert.equal(previewData.groups[0].cards.length, mockRenderedCards.length);

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

test('template-result rerenders instead of reusing incomplete or snapshot-mismatched cached cards', async () => {
  const project = createSampleProject();
  const completeCards = cardsForProject(project);
  const invalidCaches = [
    completeCards.slice(0, -1),
    completeCards.map((card, index) => index === 0 ? Object.assign({}, card, { sceneId: 'wrong-scene' }) : card),
    completeCards.map((card, index) => index === 0 ? Object.assign({}, card, { order: 99 }) : card),
    completeCards.map((card, index) => index === 0 ? Object.assign({}, card, { url: '' }) : card),
    completeCards.map((card, index) => index === 0 ? Object.assign({}, card, { url: '   ' }) : card)
  ];

  for (const cachedCards of invalidCaches) {
    let requests = 0;
    const freshCards = cardsForProject(project, `cloud://test/fresh-${invalidCaches.indexOf(cachedCards)}`);
    const { wxApi } = recordingWx();
    const page = loadResultPage(wxApi, {
      '../../utils/funCardRendererClient': {
        requestRenderStack() {
          requests += 1;
          return Promise.resolve({ cards: freshCards });
        }
      }
    });

    await page.initProject(project, cachedCards);

    assert.equal(requests, 1);
    assert.deepEqual(Array.from(page.data.renderedCards, card => card.url), freshCards.map(card => card.url));
  }
});

test('template-result reuses complete cached cards that exactly match the selected scene snapshot', async () => {
  const project = createSampleProject();
  const completeCards = cardsForProject(project);
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

  await page.initProject(project, completeCards);

  assert.equal(requests, 0);
  assert.deepEqual(Array.from(page.data.renderedCards, card => card.url), completeCards.map(card => card.url));
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
    request(options) {
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
