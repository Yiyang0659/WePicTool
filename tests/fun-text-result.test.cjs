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
  const mockRenderedCards = project.candidates[0].editedScenes.map((s) => ({
    sceneId: s.sceneId,
    order: s.order,
    url: `cloud://test/final/${s.sceneId}.png`
  }));

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

test('template-result fails closed without local fallback or history for safety and response errors', async () => {
  const project = createSampleProject();
  const failClosedCodes = [
    'CONTENT_UNSAFE',
    'SAFETY_UNAVAILABLE',
    'INVALID_RENDER_RESPONSE',
    'WX_API_UNAVAILABLE',
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
