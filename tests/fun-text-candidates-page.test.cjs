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
  return model.createFunTextProject({
    sourceText: '我今天想见你',
    expressionKey: 'funny-reversal',
    now: 1000
  });
}

function recordingWx(overrides) {
  const calls = {
    toasts: [],
    modals: [],
    navigations: [],
    emitted: [],
    requests: []
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
    request(options) {
      calls.requests.push(options);
      if (typeof options.success === 'function') {
        options.success({ statusCode: 200, data: { ok: true } });
      }
    }
  }, overrides || {});
  return { wxApi, calls };
}

// ---------------------------------------------------------------------------
// 1. funCardRendererClient Tests
// ---------------------------------------------------------------------------

test('renderer client rejects when renderer URL is not configured', async () => {
  let client;
  try {
    client = require('../miniprogram/utils/funCardRendererClient');
  } catch (err) {
    // Expected before file creation
    assert.match(err.message, /Cannot find module/);
    return;
  }

  const { wxApi } = recordingWx({});
  const project = createSampleProject();
  const previewPayload = model.buildPreviewPayload(project);

  await assert.rejects(
    () => client.requestPreviewStack(wxApi, previewPayload, { baseUrl: '' }),
    (err) => err.code === 'FUN_RENDERER_NOT_CONFIGURED' || /尚未配置/.test(err.message)
  );

  const selected = model.selectCandidate(project, project.candidates[0].candidateId);
  const renderPayload = model.buildRenderPayload(selected);

  await assert.rejects(
    () => client.requestRenderStack(wxApi, renderPayload, { baseUrl: '' }),
    (err) => err.code === 'FUN_RENDERER_NOT_CONFIGURED' || /尚未配置/.test(err.message)
  );
});

test('requestPreviewStack sends POST request and validates complete matching response', async () => {
  const client = require('../miniprogram/utils/funCardRendererClient');
  const project = createSampleProject();
  const previewPayload = model.buildPreviewPayload(project);

  const mockCandidates = previewPayload.candidates.map((c) => ({
    candidateId: c.candidateId,
    stylePackId: c.stylePackId,
    cards: c.scenes.map((s) => ({
      sceneId: s.sceneId,
      order: s.order,
      url: `cloud://test/preview/${s.sceneId}.png`
    }))
  }));

  const { wxApi, calls } = recordingWx({
    request(options) {
      calls.requests.push(options);
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          projectId: previewPayload.projectId,
          candidates: mockCandidates
        }
      });
    }
  });

  const res = await client.requestPreviewStack(wxApi, previewPayload, { baseUrl: 'https://renderer.test' });
  assert.equal(res.ok, true);
  assert.equal(res.projectId, previewPayload.projectId);
  assert.equal(res.candidates.length, 3);
  assert.equal(calls.requests[0].url, 'https://renderer.test/preview-stack');
  assert.equal(calls.requests[0].method, 'POST');
});

test('requestPreviewStack rejects partial, mismatched or corrupt responses', async () => {
  const client = require('../miniprogram/utils/funCardRendererClient');
  const project = createSampleProject();
  const previewPayload = model.buildPreviewPayload(project);

  // Mismatched projectId
  const { wxApi: badProjWx } = recordingWx({
    request(options) {
      options.success({
        statusCode: 200,
        data: { ok: true, projectId: 'wrong_id', candidates: [] }
      });
    }
  });
  await assert.rejects(
    () => client.requestPreviewStack(badProjWx, previewPayload, { baseUrl: 'https://renderer.test' }),
    (err) => err.code === 'INVALID_RENDER_RESPONSE'
  );

  // Missing candidate in response (only 2 returned)
  const { wxApi: partialWx } = recordingWx({
    request(options) {
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          projectId: previewPayload.projectId,
          candidates: [
            {
              candidateId: previewPayload.candidates[0].candidateId,
              stylePackId: previewPayload.candidates[0].stylePackId,
              cards: previewPayload.candidates[0].scenes.map((s) => ({ sceneId: s.sceneId, order: s.order, url: 'http://a.png' }))
            }
          ]
        }
      });
    }
  });
  await assert.rejects(
    () => client.requestPreviewStack(partialWx, previewPayload, { baseUrl: 'https://renderer.test' }),
    (err) => err.code === 'INVALID_RENDER_RESPONSE'
  );

  // Unsafe content code 403
  const { wxApi: unsafeWx } = recordingWx({
    request(options) {
      options.success({
        statusCode: 403,
        data: { ok: false, code: 'CONTENT_UNSAFE' }
      });
    }
  });
  await assert.rejects(
    () => client.requestPreviewStack(unsafeWx, previewPayload, { baseUrl: 'https://renderer.test' }),
    (err) => err.code === 'CONTENT_UNSAFE'
  );
});

test('requestRenderStack sends POST request and validates complete response', async () => {
  const client = require('../miniprogram/utils/funCardRendererClient');
  const project = createSampleProject();
  const selected = model.selectCandidate(project, project.candidates[0].candidateId);
  const renderPayload = model.buildRenderPayload(selected);

  const mockCards = renderPayload.scenes.map((s) => ({
    sceneId: s.sceneId,
    order: s.order,
    url: `cloud://test/final/${s.sceneId}.png`
  }));

  const { wxApi, calls } = recordingWx({
    request(options) {
      calls.requests.push(options);
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          projectId: renderPayload.projectId,
          candidateId: renderPayload.candidateId,
          cards: mockCards
        }
      });
    }
  });

  const res = await client.requestRenderStack(wxApi, renderPayload, { baseUrl: 'https://renderer.test' });
  assert.equal(res.ok, true);
  assert.equal(res.projectId, renderPayload.projectId);
  assert.equal(res.candidateId, renderPayload.candidateId);
  assert.equal(res.cards.length, mockCards.length);
  assert.equal(calls.requests[0].url, 'https://renderer.test/render-stack');
});

// ---------------------------------------------------------------------------
// 2. fun-text-candidates Page Tests
// ---------------------------------------------------------------------------

function loadCandidatesPage(wxApi, customDeps) {
  const client = loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js', {
    '../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.test' }
  });
  const deps = Object.assign({
    '../../utils/funTextProject': model,
    '../../utils/funCardRendererClient': client,
    '../../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.test' }
  }, customDeps || {});

  return instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text-candidates/fun-text-candidates.js', deps, wxApi));
}

test('candidates page initializes three independent stacks with independent indices', () => {
  const { wxApi } = recordingWx({});
  const page = loadCandidatesPage(wxApi);
  const project = createSampleProject();

  page.initProject(project);

  assert.equal(page.data.candidates.length, 3);
  assert.equal(page.data.candidates[0].currentIndex, 0);
  assert.equal(page.data.candidates[1].currentIndex, 0);
  assert.equal(page.data.candidates[2].currentIndex, 0);
  assert.equal(page.data.candidates[0].title, project.candidates[0].title);
});

test('swiping candidate A changes its index without altering B or C', () => {
  const { wxApi } = recordingWx({});
  const page = loadCandidatesPage(wxApi);
  const project = createSampleProject();

  page.initProject(project);

  // Swipe candidate at index 0 to card 2
  page.onSwipeCandidate({
    currentTarget: { dataset: { index: 0, candidateId: project.candidates[0].candidateId } },
    detail: { current: 2 }
  });

  assert.equal(page.data.candidates[0].currentIndex, 2);
  assert.equal(page.data.candidates[1].currentIndex, 0);
  assert.equal(page.data.candidates[2].currentIndex, 0);
});

test('onRegenerate rebuilds project with variant incremented and resets indices', () => {
  const { wxApi } = recordingWx({});
  const page = loadCandidatesPage(wxApi);
  const project = createSampleProject();

  page.initProject(project);

  // Swipe first candidate to index 2
  page.onSwipeCandidate({
    currentTarget: { dataset: { index: 0 } },
    detail: { current: 2 }
  });
  assert.equal(page.data.candidates[0].currentIndex, 2);

  const oldCandidateIds = page.data.candidates.map((c) => c.candidateId);
  const oldVariant = page.data.project.brief.variant;

  page.onRegenerate();

  assert.equal(page.data.project.brief.variant, oldVariant + 1);
  assert.equal(page.data.candidates.length, 3);
  assert.equal(page.data.candidates[0].currentIndex, 0);
  assert.equal(page.data.candidates[1].currentIndex, 0);
  assert.equal(page.data.candidates[2].currentIndex, 0);

  const newCandidateIds = page.data.candidates.map((c) => c.candidateId);
  assert.notDeepEqual(newCandidateIds, oldCandidateIds);
});

test('onUseCandidate selects candidate and navigates to template-result', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadCandidatesPage(wxApi);
  const project = createSampleProject();
  page.initProject(project);

  const chosenCandidateId = project.candidates[1].candidateId;
  page.onUseCandidate({
    currentTarget: { dataset: { candidateId: chosenCandidateId, index: 1 } }
  });

  assert.deepEqual(calls.navigations, ['/pages/template-result/template-result']);
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'funTextProject');
  const emittedProject = calls.emitted[0].payload.project;
  assert.equal(emittedProject.selectedCandidateId, chosenCandidateId);
});

test('onEditCandidate selects candidate and navigates to fun-text-editor', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadCandidatesPage(wxApi);
  const project = createSampleProject();
  page.initProject(project);

  const chosenCandidateId = project.candidates[2].candidateId;
  page.onEditCandidate({
    currentTarget: { dataset: { candidateId: chosenCandidateId, index: 2 } }
  });

  assert.deepEqual(calls.navigations, ['/pages/fun-text-editor/fun-text-editor']);
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'funTextProject');
  const emittedProject = calls.emitted[0].payload.project;
  assert.equal(emittedProject.selectedCandidateId, chosenCandidateId);
});

test('onCanvasError triggers server preview fallback batch request only once and fills images', async () => {
  const project = createSampleProject();
  const previewPayload = model.buildPreviewPayload(project);
  let requestCount = 0;

  const { wxApi } = recordingWx({
    request(options) {
      requestCount += 1;
      options.success({
        statusCode: 200,
        data: {
          ok: true,
          projectId: previewPayload.projectId,
          candidates: previewPayload.candidates.map((c) => ({
            candidateId: c.candidateId,
            stylePackId: c.stylePackId,
            cards: c.scenes.map((s) => ({
              sceneId: s.sceneId,
              order: s.order,
              url: `https://cdn.example/preview/${c.candidateId}_${s.order}.png`
            }))
          }))
        }
      });
    }
  });

  const page = loadCandidatesPage(wxApi);
  page.initProject(project);

  // Trigger error from multiple canvases
  await Promise.all([
    page.onCanvasError({ detail: { message: 'font load failed' } }),
    page.onCanvasError({ detail: { message: 'font load failed' } })
  ]);

  // Only one server batch preview request is sent
  assert.equal(requestCount, 1);
  assert.equal(page.data.serverPreviewFailed, false);
  assert.ok(page.data.candidates[0].fallbackImages);
  assert.equal(page.data.candidates[0].fallbackImages.length, project.candidates[0].cards.length);
  assert.match(page.data.candidates[0].fallbackImages[0], /https:\/\/cdn\.example\/preview\//);
});

test('server preview failure sets retry state without losing project data', async () => {
  const project = createSampleProject();
  const { wxApi } = recordingWx({
    request(options) {
      options.fail({ errMsg: 'request:fail network error' });
    }
  });

  const page = loadCandidatesPage(wxApi);
  page.initProject(project);

  await page.onCanvasError({ detail: { message: 'font failed' } });

  assert.equal(page.data.serverPreviewFailed, true);
  assert.equal(page.data.candidates.length, 3);
  assert.equal(page.data.project.projectId, project.projectId);
});

test('candidates page template declares 3 stacks, swiper cards, and no system font fallback', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text-candidates/fun-text-candidates.wxml');
  const js = readMiniProgramFile('miniprogram/pages/fun-text-candidates/fun-text-candidates.js');
  const wxss = readMiniProgramFile('miniprogram/pages/fun-text-candidates/fun-text-candidates.wxss');
  const combined = [wxml, js, wxss].join('\n');

  assert.match(wxml, /fun-card-canvas/);
  assert.match(wxml, /用这套/);
  assert.match(wxml, /自己改改/);
  assert.match(wxml, /再来三套/);
  assert.doesNotMatch(combined, /(sans-serif|system-ui|Arial|Helvetica|serif)/i);
});
