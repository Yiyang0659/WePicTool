'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');
const model = require('../miniprogram/utils/funTextProject');
const task = require('../miniprogram/utils/task');
const styles = require('../miniprogram/config/stylePacks');
const cases = require('../miniprogram/config/funTextCases');
const assets = require('../miniprogram/config/assetRegistry');
const fontFeels = require('../miniprogram/config/fontFeels');
const transforms = require('../miniprogram/utils/funTextTransform');

function fixture(pageName) {
  const effects = [];
  const toasts = [];
  const page = instantiatePage(loadMiniProgramPage(`miniprogram/pages/${pageName}/${pageName}.js`, {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: false },
    '../../utils/task': task,
    '../../utils/funTextProject': model,
    '../../config/stylePacks': styles,
    '../../config/funTextCases': cases,
    '../../config/assetRegistry': assets,
    '../../config/fontFeels': fontFeels,
    '../../utils/funTextTransform': transforms,
    '../../utils/contentGuardClient': { async checkTextContent() { effects.push('audit'); } },
    '../../utils/creativePlannerClient': { async planCandidates() { effects.push('plan'); return {}; } },
    '../../utils/funCardRendererClient': {
      async requestRenderStack() { effects.push('render'); throw new Error('disabled'); },
      async requestPreviewStack() { effects.push('preview'); throw new Error('disabled'); }
    },
    '../../utils/imageExporter': { async saveImagesSequentially() { effects.push('save'); } },
    '../../utils/stackExportManifest': { buildFunTextManifest() { effects.push('manifest'); return {}; } },
    '../../utils/sequenceBadgeComposer': { async materializeManifest() { effects.push('badge'); return {}; } },
    '../../utils/scenePainter': { paintScene() { effects.push('paint'); } }
  }, {
    navigateTo() { effects.push('navigate'); },
    showToast(value) { toasts.push(value); },
    showModal() {},
    showLoading() {},
    hideLoading() {},
    getStorageSync() { return []; },
    setStorageSync() { effects.push('store'); },
    createSelectorQuery() { effects.push('canvas'); throw new Error('disabled'); }
  }));
  const draft = model.createFunTextProject({ sourceText: '今天想见你', expressionKey: 'funny-reversal', now: 1 });
  return { page, effects, toasts, project: model.selectCandidate(draft, draft.candidates[0].candidateId) };
}

test('emergency flag blocks direct input generation, demo and navigation without cloud effects', async () => {
  const { page, project, effects, toasts } = fixture('fun-text');
  page.setData({ inputText: '今天想见你' });
  await page.onGenerate();
  page.onTryDemo();
  page.navigateToCandidates(project);
  assert.deepEqual(effects, []);
  assert.match(toasts[0].title, /暂不可用/);
  assert.equal(page.data.inputText, '今天想见你');
});

test('emergency flag preserves funtext and legacy records but blocks open and regenerate', () => {
  const { page, project, effects } = fixture('record');
  const records = ['funtext', 'bigtext'].map((recordType) => ({ recordId: recordType, recordType, projectSnapshot: project }));
  page.setData({ records });
  for (const record of records) {
    const event = { currentTarget: { dataset: { recordid: record.recordId } } };
    page.onViewRecord(event);
    page.onRegenerate(event);
  }
  assert.deepEqual(effects, []);
  assert.equal(page.data.records, records);
  page.setData({ records: [{ recordId: 'dress', recordType: 'layered-dressup' }] });
  page.onViewRecord({ currentTarget: { dataset: { recordid: 'dress' } } });
  assert.deepEqual(effects, ['navigate']);
});

test('emergency flag blocks result restoration, remote/local render, retry, saving and navigation', async () => {
  const { page, project, effects } = fixture('template-result');
  const fingerprint = model.createRenderFingerprint(project);
  const cards = project.candidates[0].editedScenes.map(scene => ({
    sceneId: scene.sceneId, order: scene.order, role: scene.role,
    url: 'cloud://test/' + scene.sceneId, renderFingerprint: fingerprint
  }));
  const snapshot = { type: 'funtext', taskId: project.projectId, projectSnapshot: project, renderFingerprint: fingerprint, cards };
  await page.initProject(project, cards, snapshot);
  assert.equal(page.data.project, null);
  assert.equal(page.data.renderedCards.length, 0);
  assert.equal(page.data.rendering, false);
  assert.match(page.data.renderErrorMessage, /暂不可用/);
  // Persisted page state must not unlock action handlers or completion callbacks.
  page.setData({ project, renderedCards: cards, rendering: false });
  const generation = page.nextRenderGeneration();
  page.applyRenderSuccess(project, cards, generation);
  await page.initProject(project);
  page.onRetryRender();
  page.onPreviewStack();
  page.onEditStack();
  await page.onSaveStack();
  assert.deepEqual(effects, []);
});

test('emergency flag blocks candidate/editor deep-link recovery and downstream actions', async () => {
  for (const name of ['fun-text-candidates', 'fun-text-editor']) {
    const { page, project, effects } = fixture(name);
    page.initProject(project);
    assert.equal(page.data.project, null);
    if (name === 'fun-text-candidates') {
      page.setData({ project, candidates: project.candidates });
      const event = { currentTarget: { dataset: { candidateId: project.selectedCandidateId } } };
      page.onUseCandidate(event);
      page.onEditCandidate(event);
      page.onRegenerate();
      await page.onCanvasError();
    } else {
      page.setData({ project });
      page.onConfirmEdits();
    }
    assert.deepEqual(effects, []);
  }
});
