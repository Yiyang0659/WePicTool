'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { loadMiniProgramModule, loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');

const ROOT = path.join(__dirname, '..');

const model = require('../miniprogram/utils/funTextProject');
const stylePacks = require('../miniprogram/config/stylePacks');

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
    emitted: []
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
    }
  }, overrides || {});
  return { wxApi, calls };
}

function loadEditorPage(wxApi, customDeps) {
  const deps = Object.assign({
    '../../utils/funTextProject': model,
    '../../config/stylePacks': stylePacks
  }, customDeps || {});

  return instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text-editor/fun-text-editor.js', deps, wxApi));
}

function handlerBoundToElement(wxml, className, binding) {
  const matcher = new RegExp('<[^>]*class="[^\"]*' + className + '[^\"]*"[^>]*' + binding + '="([^\"]+)"', 's');
  const match = wxml.match(matcher);
  assert.ok(match, className + ' must bind ' + binding);
  return match[1];
}

function handlerBoundToMovableView(wxml, binding) {
  const matcher = new RegExp('<movable-view[\\s\\S]*?' + binding + '="([^\"]+)"');
  const match = wxml.match(matcher);
  assert.ok(match, 'movable-view must bind ' + binding);
  return match[1];
}

test('editor page initializes with selected candidate and exposes only the three approved editing areas', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();

  page.initProject(project);

  assert.equal(page.data.project.projectId, project.projectId);
  assert.equal(page.data.selectedCandidate.candidateId, project.selectedCandidateId);
  assert.equal(page.data.currentCardIndex, 0);
  assert.equal(page.data.scenes.length, project.candidates[0].editedScenes.length);
  assert.equal(page.data.stylePacks.length, 3);
  assert.deepEqual(page.data.stylePacks.map(p => p.id), ['pink-note-v1', 'chalk-chaos-v1', 'paper-collage-v1']);
});

test('editor WXML binds the declared text handlers and they update the current card', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxml');
  page.initProject(project);

  const initialText = page.data.scenes[0].layers.find(l => l.type === 'text').text;
  const editHandler = handlerBoundToElement(wxml, 'edit-text-row', 'bindtap');
  const confirmHandler = handlerBoundToElement(wxml, 'btn-modal-confirm', 'bindtap');
  assert.equal(editHandler, 'onEditText');
  assert.equal(confirmHandler, 'onConfirmText');

  page[editHandler]();
  assert.equal(page.data.editingTextModalVisible, true);
  assert.equal(page.data.editingText, initialText);

  page.onInputEditText({ detail: { value: '先等等' } });
  assert.equal(page.data.editingText, '先等等');
  assert.equal(page.data.editingCharCount, 3);

  page[confirmHandler]();
  assert.equal(page.data.editingTextModalVisible, false);
  const updatedText = page.data.scenes[0].layers.find(l => l.type === 'text').text;
  assert.equal(updatedText, '先等等');
  assert.equal(page.data.project.candidates[0].editedScenes[0].layers.find(l => l.type === 'text').text, '先等等');
});

test('editing card text enforces phase-one role length limits', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();
  page.initProject(project);

  // Card 0 is a hook (non-reveal, max 12 chars)
  page.onEditText();
  page.onInputEditText({ detail: { value: '字'.repeat(13) } });
  page.onConfirmText();

  assert.ok(calls.toasts.some(t => /12/.test(t.title) || /超过/.test(t.title)));
  assert.notEqual(page.data.scenes[0].layers.find(l => l.type === 'text').text, '字'.repeat(13));
});

test('switching style pack recomposes the entire stack with current text and order', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();
  page.initProject(project);

  // Edit card 0 text first
  page.onEditText();
  page.onInputEditText({ detail: { value: '先等等' } });
  page.onConfirmText();

  page.onSelectStylePack({ currentTarget: { dataset: { stylePackId: 'chalk-chaos-v1' } } });

  assert.equal(page.data.selectedCandidate.stylePackId, 'chalk-chaos-v1');
  assert.equal(page.data.scenes[0].layers.find(l => l.type === 'text').text, '先等等');
  assert.equal(page.data.project.candidates[0].stylePackId, 'chalk-chaos-v1');
});

test('movable thumbnail lifecycle moves third card to first exactly once and retains the cover label', () => {
  const { wxApi } = recordingWx({});
  const calls = [];
  const page = loadEditorPage(wxApi, {
    '../../utils/funTextProject': Object.assign({}, model, {
      moveCard(project, candidateId, fromIndex, toIndex) {
        calls.push({ projectId: project.projectId, candidateId, fromIndex, toIndex });
        return model.moveCard(project, candidateId, fromIndex, toIndex);
      }
    })
  });
  const project = createSampleProject();
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxml');
  page.initProject(project);

  const initialScenes = page.data.scenes.slice();
  const movingSceneId = initialScenes[2].sceneId;
  const startHandler = handlerBoundToMovableView(wxml, 'bindtouchstart');
  const moveHandler = handlerBoundToMovableView(wxml, 'bindchange');
  const endHandler = handlerBoundToMovableView(wxml, 'bindtouchend');
  assert.equal(startHandler, 'onSortStart');
  assert.equal(moveHandler, 'onSortMove');
  assert.equal(endHandler, 'onSortEnd');
  assert.match(wxml, /<movable-area/);
  assert.match(wxml, /<movable-view/);

  page[startHandler]({ currentTarget: { dataset: { index: 2 } } });
  page[moveHandler]({ detail: { x: page.data.sortItems[0].x } });
  page[moveHandler]({ detail: { x: page.data.sortItems[0].x } });
  assert.equal(calls.length, 0, 'moving only updates the destination preview');
  page[endHandler]();
  page[endHandler]();

  assert.deepEqual(calls, [{
    projectId: project.projectId,
    candidateId: project.selectedCandidateId,
    fromIndex: 2,
    toIndex: 0
  }]);
  assert.equal(page.data.scenes[0].sceneId, movingSceneId);
  assert.equal(page.data.scenes[0].order, 1);
  assert.equal(page.data.scenes[1].order, 2);
  assert.equal(page.data.scenes[2].order, 3);
  assert.deepEqual(page.data.scenes.map(s => s.order), page.data.scenes.map((_, i) => i + 1));
  assert.equal(page.data.sortItems[0].label, '微信封面');
});

test('onConfirmEdits emits full updated project and navigates to template-result', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();
  page.initProject(project);

  page.onConfirmEdits();

  assert.deepEqual(calls.navigations, ['/pages/template-result/template-result']);
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'funTextProject');
  assert.equal(calls.emitted[0].payload.project.projectId, project.projectId);
});

test('editor markup and code contain only approved actions and no forbidden editor tools', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxml');
  const js = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.js');
  const wxss = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxss');
  const combined = [wxml, js, wxss].join('\n');

  assert.match(wxml, /改文字/);
  assert.match(wxml, /换整叠风格|整叠风格/);
  assert.match(wxml, /调整顺序|拖动排序|排序/);
  assert.match(wxml, /微信封面/);
  assert.match(wxml, /fun-card-canvas/);

  // Prohibit forbidden freeform editor tools
  assert.doesNotMatch(combined, /(自由画笔|画笔工具|添加贴纸|图层管理|图层面板|撤销|重做|AI改款|AI改写)/);
});
