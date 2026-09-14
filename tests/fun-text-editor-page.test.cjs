'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { loadMiniProgramModule, loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');

const ROOT = path.join(__dirname, '..');

const model = require('../miniprogram/utils/funTextProject');
const stylePacks = require('../miniprogram/config/stylePacks');
const fontFeels = require('../miniprogram/config/fontFeels');
const assetRegistry = require('../miniprogram/config/assetRegistry');
const transformMath = require('../miniprogram/utils/funTextTransform');

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
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/funTextProject': model,
    '../../config/stylePacks': stylePacks,
    '../../config/fontFeels': fontFeels,
    '../../config/assetRegistry': assetRegistry,
    '../../utils/funCardRendererClient': {
      requestPreviewStack() {
        return Promise.reject(new Error('preview renderer unavailable in unit test'));
      }
    },
    '../../utils/funTextTransform': transformMath,
    '../../utils/funLocalPreview':{async renderCards(api,canvas,p){return p.candidates.find(c=>c.candidateId===p.selectedCandidateId).editedScenes.map(s=>({sceneId:s.sceneId,role:s.role,order:s.order,url:'wxfile://local/'+s.order}));}}
  }, customDeps || {});

  return instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text-editor/fun-text-editor.js', deps, wxApi));
}

test('explicit card buttons move one position, retain selection, delete and undo', () => {
  const {wxApi}=recordingWx(); const page=loadEditorPage(wxApi);
  page.initProject(createSampleProject(),{currentCardIndex:1});
  const ids=page.data.scenes.map(s=>s.sceneId);
  page.onMoveCard({currentTarget:{dataset:{index:1,delta:-1}}});
  assert.deepEqual(Array.from(page.data.scenes,s=>s.sceneId),[ids[1],ids[0],...ids.slice(2)]);
  assert.equal(page.data.currentScene.sceneId,ids[1]);
  page.onDeleteCard({currentTarget:{dataset:{index:0}}});
  assert.equal(page.data.scenes.length,ids.length-1);
  page.onUndo();
  assert.equal(page.data.scenes[0].sceneId,ids[1]);
  while(page.data.scenes.length>1)page.onDeleteCard({currentTarget:{dataset:{index:0}}});
  page.onDeleteCard({currentTarget:{dataset:{index:0}}});
  page.onMoveCard({currentTarget:{dataset:{index:0,delta:-1}}});
  assert.equal(page.data.scenes.length,1);
});

test('editor opens the card passed by candidate navigation', () => {
  const { wxApi } = recordingWx();
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();
  page.initProject(project, { currentCardIndex: 2 });
  assert.equal(page.data.currentCardIndex, 2);
  assert.equal(page.data.currentScene.sceneId, project.candidates[0].editedScenes[2].sceneId);
});

test('editor invalidates saved output after ink edits and submits the latest snapshot',async()=>{
  const {wxApi}=recordingWx({createSelectorQuery(){return {select(){return this;},fields(){return this;},exec(cb){cb([{node:{}}]);}};}});
  const requests=[],saved=[];
  const page=loadEditorPage(wxApi,{
    '../../config/env':{ENABLE_FUN_TEXT_STACK_ENTRY:true,ENABLE_FUN_LOCAL_EDITOR:true},
    '../../utils/funPreviewPreloader':{warm(){}},
    '../../utils/funCardRendererClient':{async requestRenderStack(api,payload){requests.push(JSON.parse(JSON.stringify(payload)));return {cards:payload.scenes.map(s=>({sceneId:s.sceneId,order:s.order,url:'cloud://test/revision'+requests.length+'/'+s.order+'.png'}))};}},
    '../../utils/sequenceBadgeComposer':{async materializeManifest(api,canvas,manifest){manifest.stacks[0].cards.forEach(c=>{c.exportUrl=c.sourceUrl;});return manifest;}},
    '../../utils/imageExporter':{async saveImagesSequentially(api,urls){saved.push(Array.from(urls));}}
  });
  page.initProject(createSampleProject(),{currentCardIndex:0});
  await page.onSaveCurrentPage();
  const sceneId=page.data.currentScene.sceneId, candidateId=page.data.selectedCandidate.candidateId;
  const ink=[{id:'hw_test',x:540,y:540,scale:1,rotation:0,strokes:[{id:'stroke_test',brushKey:'pen',colorKey:'blue',width:28,points:[{x:300,y:760},{x:700,y:760}]}]}];
  page.syncProject(model.updateInkStickers(page.data.project,candidateId,sceneId,ink),0,'');
  await page.onSaveCurrentPage();
  assert.equal(requests.length,2);
  assert.equal(requests[1].scenes[0].strokes.length,1);
  assert.equal(requests[1].scenes[0].strokes[0].colorKey,'blue');
  assert.notEqual(saved[0][0],saved[1][0]);
  await page.onSaveAllPages();
  await page.onWechatPreview();
  assert.equal(requests.length,2,'unchanged current/all/preview must share the latest manifest');
  assert.equal(saved[2][0],saved[1][0]);
});

test('editor saves selected audited final card and reuses manifest for WeChat preview',async()=>{
  const {wxApi,calls}=recordingWx({showLoading(){},hideLoading(){},createSelectorQuery(){return {select(){return this;},fields(){return this;},exec(cb){cb([{node:{}}]);}};}});
  let renders=0,saved;
  const page=loadEditorPage(wxApi,{
    '../../utils/funCardRendererClient':{async requestRenderStack(){renders++;return {cards:[]};}},
    '../../utils/stackExportManifest':{buildFunTextManifest(){return {}; }},
    '../../utils/sequenceBadgeComposer':{async materializeManifest(){return {stacks:[{stackId:'stack',cards:page.data.scenes.map(s=>({cardId:s.sceneId,exportUrl:'/final/'+s.sceneId}))}]};}},
    '../../utils/imageExporter':{async saveImagesSequentially(api,urls){saved=urls;}}
  });
  page.initProject(createSampleProject(),{currentCardIndex:2});
  await page.onSaveCurrentPage();
  assert.deepEqual(Array.from(saved),['/final/'+page.data.scenes[2].sceneId]);
  await page.onWechatPreview();assert.equal(renders,1);
  assert.equal(calls.emitted.at(-1).name,'acceptTaskData');
  assert.equal(page.data.editorExportBusy,false);
});

test('editor save overlay follows actual audit and album callbacks',async()=>{
  let finishRender, albumCallback, renders=0;
  const {wxApi}=recordingWx({
    showLoading(){throw Error('native loading should not be used');},
    createSelectorQuery(){return {select(){return this;},fields(){return this;},exec(cb){cb([{node:{}}]);}};},
    saveImageToPhotosAlbum(options){albumCallback=options;}
  });
  const page=loadEditorPage(wxApi,{
    '../../utils/funCardRendererClient':{requestRenderStack(){renders++;return new Promise(resolve=>{finishRender=resolve;});}},
    '../../utils/stackExportManifest':{buildFunTextManifest(){return {}; }},
    '../../utils/sequenceBadgeComposer':{async materializeManifest(){return {stacks:[{stackId:'stack',cards:page.data.scenes.map(s=>({cardId:s.sceneId,exportUrl:'/final/'+s.sceneId}))}]};}},
    '../../utils/imageExporter':require('../miniprogram/utils/imageExporter')
  });
  page.initProject(createSampleProject());
  const saving=page.onSaveAllPages();
  assert.equal(page.data.exportProgress.stage,'audit');
  await page.onSaveAllPages();assert.equal(renders,1);
  finishRender({cards:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.data.exportProgress.stage,'saving');
  assert.equal(page.data.exportProgress.current,1);
  assert.equal(page.data.exportProgress.percent,0);
  albumCallback.success({});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.data.exportProgress.current,2);
  assert.equal(page.data.exportProgress.completed,1);
  assert.equal(page.data.exportProgress.percent,20);
  albumCallback.fail({errMsg:'save failed'});
  await saving;
  assert.equal(page.data.exportProgress.visible,false);
  assert.equal(page._editorSaveCursor,1);
  assert.equal(page.data.editorExportBusy,false);
});

test('export modal removes native preview canvases in every stage and restores them afterwards',()=>{
  const markup=readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxml');
  const tags=markup.match(/<(?:fun-live-preview|fun-card-canvas)\b[^>]*>/g);
  assert.ok(tags.length>=3);
  for(const stage of ['audit','preparing','saving']){
    for(const tag of tags){
      const match=tag.match(/wx:(?:if|elif)="\{\{(.*?)\}\}"/);
      assert.ok(match,'every native preview must have a mounting condition');
      const evaluate=new Function('localEditorEnabled','currentScene','editingTextModalVisible','handwritingVisible','exportProgress','return '+match[1]);
      for(const local of [true,false]){
        for(const handwritingVisible of [true,false]){
          assert.equal(Boolean(evaluate(local,{},false,handwritingVisible,{visible:true,stage})),false);
        }
      }
    }
  }
  const main=tags[0].match(/wx:if="\{\{(.*?)\}\}"/)[1];
  const visible=new Function('localEditorEnabled','currentScene','editingTextModalVisible','exportProgress','return '+main);
  assert.equal(Boolean(visible(true,{},false,{visible:false})),true);
  assert.match(markup,/<canvas type="2d" id="editorExportCanvas" class="editor-export-canvas"\s*\/>/);
});

test('editor audit failure cannot save or navigate and releases export lock',async()=>{
  const {wxApi,calls}=recordingWx({showLoading(){},hideLoading(){}});
  const page=loadEditorPage(wxApi,{'../../utils/funCardRendererClient':{async requestRenderStack(){throw Error('审核未通过');}}});
  page.initProject(createSampleProject());await page.onSaveAllPages();
  assert.equal(calls.navigations.length,0);assert.equal(calls.toasts.at(-1).title,'审核未通过');
  assert.equal(page.data.editorExportBusy,false);
  assert.equal(page.data.exportProgress.visible,false);
});

test('ink changes save editable draft and enter audited results, rollback blocks ink export', () => {
  const saved = [];
  const { wxApi,calls } = recordingWx({setStorageSync(key,value) {saved.push({key,value});}});
  const page = loadEditorPage(wxApi, {'../../config/env':{ENABLE_FUN_TEXT_STACK_ENTRY:true,ENABLE_FUN_LOCAL_EDITOR:true}});
  page.initProject(createSampleProject());
  page.onInkChange({detail:{strokes:[{id:'stroke_1',brushKey:'pen',colorKey:'black',width:8,points:[{x:10,y:10}]}]}});
  page.onConfirmEdits();
  assert.equal(calls.navigations.length,1);
  page.data.localEditorEnabled=false;
  page.onConfirmEdits();
  assert.equal(calls.navigations.length,1);
  assert.equal(saved.length,1);
  assert.equal(saved[0].value.project.candidates[0].editedScenes[0].strokes.length,1);
});

test('standalone handwriting saves real drafts, adds editable sticker and cancels without replacing project', () => {
  const store={};
  const {wxApi,calls}=recordingWx({getStorageSync:k=>store[k],setStorageSync:(k,v)=>store[k]=v});
  const page=loadEditorPage(wxApi,{'../../config/env':{ENABLE_FUN_TEXT_STACK_ENTRY:true,ENABLE_FUN_LOCAL_EDITOR:true}});
  page.initProject(createSampleProject());const id=page.data.project.projectId;
  page.onStartHandwriting();
  page.onHandwritingChange({detail:{strokes:[{id:'stroke_h',brushKey:'pen',colorKey:'black',width:8,points:[{x:400,y:400},{x:600,y:600}]}]}});
  page.onSaveHandwriting();assert.equal(page.data.handwritingDrafts.length,1);
  page.onAddHandwritingSticker();assert.equal(page.data.currentScene.inkStickers.length,1);
  assert.equal(model.buildRenderPayload(page.data.project).scenes[0].strokes.length,1);
  page.onEditInkSticker();assert.equal(page.data.handwritingScene.strokes.length,1);
  page.onCancelHandwriting();assert.equal(page.data.project.projectId,id);
  page.onStartHandwriting();page.onCancelHandwriting();assert.equal(page.data.project.projectId,id);
  page.onClearHandwritingDrafts();assert.equal(calls.modals.at(-1).title,'清空本机手写草稿？');
});

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

test('editor page initializes with selected candidate and three grouped editing tabs', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();

  page.initProject(project);

  assert.equal(page.data.project.projectId, project.projectId);
  assert.equal(page.data.selectedCandidate.candidateId, project.selectedCandidateId);
  assert.equal(page.data.currentCardIndex, 0);
  assert.equal(page.data.scenes.length, project.candidates[0].editedScenes.length);
  assert.equal(page.data.stylePacks.length, 7);
  assert.deepEqual(page.data.editorTabs.map((item) => item.key), ['content', 'style', 'decoration']);
  assert.equal(page.data.styleControls.backgrounds.length, 3);
  assert.equal(page.data.styleControls.fonts.length, 3);
  assert.ok(page.data.sortItems.every((item) => item.previewBackground && item.previewTextColor));
  assert.ok(page.data.sortItems.every((item) => item.positionX === item.x));
  assert.equal(new Set(page.data.decorationAssets.slice(0, 6).map((item) => item.glyph)).size, 6);
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

test('confirming text refreshes its thumbnail without changing cover geometry or drag state', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  const project = createSampleProject();
  page.initProject(project);

  page.onSortStart({ currentTarget: { dataset: { index: 2 } } });
  const thumbnailGeometry = page.data.sortItems.map(item => ({
    sceneId: item.sceneId,
    order: item.order,
    x: item.x,
    centerX: item.centerX,
    label: item.label
  }));

  page.onEditText();
  page.onInputEditText({ detail: { value: '先等等' } });
  page.onConfirmText();

  assert.equal(page.data.currentScene.layers.find(layer => layer.type === 'text').text, '先等等');
  assert.equal(page.data.sortItems[0].layers.find(layer => layer.type === 'text').text, '先等等');
  assert.deepEqual(page.data.sortItems.map(item => ({
    sceneId: item.sceneId,
    order: item.order,
    x: item.x,
    centerX: item.centerX,
    label: item.label
  })), thumbnailGeometry);
  assert.equal(page.data.sortItems[0].label, '微信封面');
  assert.equal(page.data.draggingIndex, 2);
  assert.equal(page.data.sortFromIndex, 2);
  assert.equal(page.data.sortToIndex, 2);
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


test('editor exposes visual choice previews, live sort positions and a canvas-safe text modal', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxml');
  const wxss = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxss');

  assert.match(wxml, /previewPatternClass/);
  assert.match(wxml, /style-preview/);
  assert.match(wxml, /item\.glyph/);
  assert.match(wxml, /已添加/);
  assert.match(wxml, /currentScene && !editingTextModalVisible/);
  assert.match(wxml, /置顶/);
  assert.match(wxml, /置底/);
  assert.match(wxml, /只在装饰互相重叠时改变遮挡顺序/);
  assert.match(wxml, /bindfontunavailable="onFontUnavailable"/);
  assert.match(wxml, /currentFallbackImage/);
  assert.match(wxml, /手写预览暂时没连上/);
  assert.match(wxml, /editor-preview-retry/);
  assert.match(wxss, /\.preview-pattern-grid/);
  assert.match(wxss, /z-index:\s*10000/);
});

test('font failure swaps editor canvas to matching server previews without exposing raw network errors', async () => {
  const { wxApi, calls } = recordingWx({});
  const project = createSampleProject();
  let requestCount = 0;
  const page = loadEditorPage(wxApi, {
    '../../utils/funCardRendererClient': {
      async requestPreviewStack(wxArg, payload) {
        requestCount += 1;
        assert.equal(wxArg, wxApi);
        return {
          ok: true,
          projectId: payload.projectId,
          candidates: payload.candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            stylePackId: candidate.stylePackId,
            cards: candidate.scenes.map((scene) => ({
              sceneId: scene.sceneId,
              order: scene.order,
              url: `https://cdn.example/${candidate.candidateId}/${scene.order}.png`
            }))
          }))
        };
      }
    }
  });
  page.initProject(project);

  await page.onFontUnavailable({ detail: { message: 'connect ECONNREFUSED 127.0.0.1:8080' } });

  assert.equal(requestCount, 1);
  assert.equal(page.data.serverPreviewLoading, false);
  assert.equal(page.data.serverPreviewFailed, false);
  assert.equal(page.data.fallbackImages.length, page.data.scenes.length);
  assert.match(page.data.currentFallbackImage, /https:\/\/cdn\.example\//);
  assert.equal(calls.toasts.length, 0);

  page.onSelectCard({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(page.data.currentFallbackImage, page.data.fallbackImages[1]);
});

test('editor keeps project data and offers a canvas retry when both font and server preview fail', async () => {
  const { wxApi, calls } = recordingWx({});
  const project = createSampleProject();
  const page = loadEditorPage(wxApi, {
    '../../utils/funCardRendererClient': {
      async requestPreviewStack() {
        throw new Error('request:fail network error');
      }
    }
  });
  page.initProject(project);

  await page.onFontUnavailable({ detail: { message: 'connect ECONNREFUSED 127.0.0.1:8080' } });

  assert.equal(page.data.serverPreviewFailed, true);
  assert.equal(page.data.project.projectId, project.projectId);
  assert.equal(page.data.currentText, '我本来想说');
  assert.equal(calls.toasts.length, 0);

  const previousRevision = page.data.canvasRevision;
  page.onRetryEditorPreview();
  assert.equal(page.data.serverPreviewFailed, false);
  assert.equal(page.data.canvasRevision, previousRevision + 1);
  assert.equal(page.data.project.projectId, project.projectId);
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

test('onConfirmEdits ignores a rapid duplicate tap until the result page returns', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadEditorPage(wxApi);
  page.initProject(createSampleProject());

  page.onConfirmEdits();
  page.onConfirmEdits();
  assert.equal(calls.navigations.length, 1);
  page.onShow();
  page.onConfirmEdits();
  assert.equal(calls.navigations.length, 2);
});

test('editor markup groups focused actions without exposing a general-purpose image editor', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxml');
  const js = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.js');
  const wxss = readMiniProgramFile('miniprogram/pages/fun-text-editor/fun-text-editor.wxss');
  const colors = readMiniProgramFile('miniprogram/config/decorationColors.js');
  const combined = [wxml, js, wxss, colors].join('\n');

  assert.match(wxml, /改文字/);
  assert.match(wxml, /整组风格/);
  assert.match(wxml, /卡片顺序/);
  assert.match(wxml, /微信封面/);
  assert.match(wxml, /fun-card-canvas/);

  assert.match(wxml, /内容/);
  assert.match(combined, /样式/);
  assert.match(wxml, /装饰/);
  assert.match(wxml, /装饰颜色/);
  assert.match(wxml, /恢复原色/);
  assert.match(colors, /鲜明色/);
  assert.match(colors, /浅色/);
  assert.match(colors, /透明色/);
  assert.match(wxss, /decoration-color-transparent/);
  assert.match(wxml, /撤销/);
  assert.match(wxml, /重做/);
  assert.doesNotMatch(combined, /(自由画笔|画笔工具|图层管理|图层面板|AI改款|AI改写|滤镜|抠图)/);
});

test('style and decoration controls update the selected scene and undo it', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  page.initProject(createSampleProject());

  page.onSelectEditorTab({ currentTarget: { dataset: { key: 'style' } } });
  assert.equal(page.data.activeEditorTab, 'style');
  page.onSelectBackground({ currentTarget: { dataset: { key: 'pink-note-lilac' } } });
  assert.equal(page.data.currentScene.backgroundVariantKey, 'pink-note-lilac');
  assert.equal(page.data.canUndo, true);
  page.onUndo();
  assert.equal(page.data.currentScene.backgroundVariantKey, 'pink-note-soft');
  assert.equal(page.data.canRedo, true);

  page.onSelectEditorTab({ currentTarget: { dataset: { key: 'decoration' } } });
  page.onAddDecoration({ currentTarget: { dataset: { assetKey: 'sticker_11' } } });
  assert.ok(page.data.selectedDecorationId);
  assert.ok(page.data.currentScene.layers.some((layer) => layer.id === page.data.selectedDecorationId));
  assert.equal(page.data.decorationAssets.find((asset) => asset.key === 'sticker_11').inScene, true);
  assert.equal(page.data.decorationAssets.find((asset) => asset.key === 'sticker_11').selected, true);
  assert.equal(page.data.decorationLayerState.canMoveForward, false);
  assert.deepEqual(page.data.decorationColorGroups.map((group) => group.key), ['vivid', 'light', 'transparent']);
  assert.equal(page.data.decorationColorOptions.length, 8);
  page.onSelectDecorationColorGroup({ currentTarget: { dataset: { groupKey: 'transparent' } } });
  assert.equal(page.data.activeDecorationColorGroup, 'transparent');
  page.onSetDecorationColor({ currentTarget: { dataset: { colorKey: 'transparent-blue' } } });
  assert.equal(
    page.data.currentScene.layers.find((layer) => layer.id === page.data.selectedDecorationId).decorationColorKey,
    'transparent-blue'
  );
  assert.equal(page.data.decorationColorOptions.find((color) => color.key === 'transparent-blue').selected, true);
  assert.equal(page.data.decorationColorIsDefault, false);
  page.onResetDecorationColor();
  assert.equal(page.data.currentScene.layers.find((layer) => layer.id === page.data.selectedDecorationId).decorationColorKey, undefined);
  assert.equal(page.data.decorationColorIsDefault, true);
  page.onDeleteDecoration();
  assert.equal(page.data.selectedDecorationId, '');
});

test('decoration drag previews continuously but commits one history entry on touch end', () => {
  const { wxApi } = recordingWx({});
  const page = loadEditorPage(wxApi);
  page.initProject(createSampleProject());
  page.onAddDecoration({ currentTarget: { dataset: { assetKey: 'sticker_11' } } });
  const layerId = page.data.selectedDecorationId;
  const historyBefore = page.data.project.editHistory.past.length;
  const target = { dataset: { layerId } };
  page.onDecorationTouchStart({ currentTarget: target, touches: [{ clientX: 100, clientY: 100 }] });
  page.onDecorationTouchMove({ touches: [{ clientX: 120, clientY: 110 }] });
  page.onDecorationTouchMove({ touches: [{ clientX: 140, clientY: 120 }] });
  assert.equal(page.data.project.editHistory.past.length, historyBefore);
  page.onDecorationTouchEnd();
  assert.equal(page.data.project.editHistory.past.length, historyBefore + 1);
  const moved = page.data.currentScene.layers.find((layer) => layer.id === layerId);
  assert.ok(moved.x > 820);
});
