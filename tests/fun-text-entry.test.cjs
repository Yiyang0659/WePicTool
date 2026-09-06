'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');

const ROOT = path.join(__dirname, '..');

// 直接加载小程序 CommonJS 模块（miniprogram/package.json 固定 CommonJS）
const client = require('../miniprogram/utils/contentGuardClient');
const model = require('../miniprogram/utils/funTextProject');
const taskModule = require('../miniprogram/utils/task');

const plannerClient = require('../miniprogram/utils/creativePlannerClient');
const funTextCases = require('../miniprogram/config/funTextCases');

const CANDIDATES_PAGE = '/pages/fun-text-candidates/fun-text-candidates';

function readMiniProgramFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function recordingWx(overrides) {
  const calls = { toasts: [], modals: [], navigations: [], emitted: [] };
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

function loadFunTextPage(wxApi) {
  return instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text/fun-text.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/contentGuardClient': client,
    '../../utils/creativePlannerClient': plannerClient,
    '../../utils/funTextProject': model,
    '../../config/funTextCases': funTextCases
  }, wxApi));
}

function loadIndexPage(wxApi, envConfig) {
  return instantiatePage(loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': envConfig || { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/funTextProject': model,
    '../../utils/task': taskModule
  }, wxApi));
}

test('content guard client fails closed when cloud safety is unavailable', async () => {
  const wxApi = { cloud: { callFunction: async () => { throw new Error('offline'); } } };
  await assert.rejects(() => client.checkTextContent(wxApi, '我今天想见你'), /安全服务暂不可用/);
  const missingCloud = {};
  await assert.rejects(() => client.checkTextContent(missingCloud, '我今天想见你'), /安全服务暂不可用/);
});

test('content guard client accepts clean text and rejects unsafe text', async () => {
  const okWx = { cloud: { callFunction: async () => ({ result: { ok: true, code: 'OK' } }) } };
  assert.deepEqual(await client.checkTextContent(okWx, '我今天想见你'), { ok: true, code: 'OK' });
  const unsafeWx = { cloud: { callFunction: async () => ({ result: { ok: false, code: 'CONTENT_UNSAFE' } }) } };
  await assert.rejects(() => client.checkTextContent(unsafeWx, '不好的话'), (error) => error.code === 'CONTENT_UNSAFE');
});

test('fun text input page exposes only one sentence, tags and the generate action', () => {
  const { wxApi } = recordingWx({
    cloud: { callFunction: async () => ({ result: { ok: true, code: 'OK' } }) }
  });
  const page = loadFunTextPage(wxApi);
  assert.equal(page.data.expressionKey, 'random-fun');
  assert.deepEqual(page.data.expressionOptions.map((item) => item.key),
    ['random-fun', 'funny-reversal', 'cute-direct', 'tough-soft']);
  assert.ok(page.data.expressionOptions.every((item) => typeof item.label === 'string'));
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text/fun-text.wxml');
  assert.match(wxml, /比如：我今天想见你/);
  assert.match(wxml, /帮我变成一叠/);
  assert.ok(!/字体|背景|贴纸/.test(wxml), '输入页不得出现字体/背景/贴纸参数');
});

test('input page exposes structured inspiration cases and selecting one fills editable fields', () => {
  const { wxApi } = recordingWx({});
  const page = loadFunTextPage(wxApi);
  assert.equal(page.data.caseCategories.length, 6);
  assert.equal(page.data.funTextCases.length, 12);
  page.onSelectCase({ currentTarget: { dataset: { caseId: 'birthday-wish' } } });
  assert.equal(page.data.selectedCaseId, 'birthday-wish');
  assert.equal(page.data.inputText, '你的生日愿望会实现');
  assert.equal(page.data.expressionKey, 'cute-direct');
  assert.equal(page.data.preferredStrategyId, 'countdown_reveal');
  assert.equal(page.data.preferredStylePackId, 'gentle-journal-v1');
  assert.equal(page.data.charCount, Array.from(page.data.inputText).length);
  const wxml = readMiniProgramFile('miniprogram/pages/fun-text/fun-text.wxml');
  assert.match(wxml, /找个灵感/);
  assert.match(wxml, /用这个案例/);
});

test('onGenerate trims, audits once, and navigates with a three-candidate rules project', async () => {
  const audited = [];
  const { wxApi, calls } = recordingWx({
    cloud: {
      callFunction: async (options) => {
        if (options && options.name === 'contentGuard' && options.data && options.data.content) {
          audited.push(options.data.content);
          return { result: { ok: true, code: 'OK' } };
        }
        return { result: { ok: true, code: 'OK' } };
      }
    }
  });
  const page = loadFunTextPage(wxApi);
  page.data.inputText = '  我今天想见你  ';
  page.onInput({ detail: { value: '  我今天想见你  ' } });
  assert.equal(page.data.charCount, 10);
  await page.onGenerate();
  assert.deepEqual(audited, ['我今天想见你']);
  assert.deepEqual(calls.navigations, [CANDIDATES_PAGE]);
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'funTextProject');
  const project = calls.emitted[0].payload.project;
  assert.equal(project.sourceText, '我今天想见你');
  assert.ok(['rules', 'rule_fallback', 'ai'].includes(project.generationMode));
  assert.equal(project.brief.expressionKey, 'random-fun');
  assert.equal(project.candidates.length, 3);
  assert.equal(page.data.generating, false);
});

test('unsafe or failing audits keep the input, show a modal and never navigate', async () => {
  const { wxApi, calls } = recordingWx({
    cloud: { callFunction: async () => ({ result: { ok: false, code: 'CONTENT_UNSAFE' } }) }
  });
  const page = loadFunTextPage(wxApi);
  page.data.inputText = '违规内容';
  await page.onGenerate();
  assert.ok(calls.modals.length >= 1);
  assert.match(calls.modals[0].title, /审核/);
  assert.deepEqual(calls.navigations, []);
  assert.equal(page.data.inputText, '违规内容');
  assert.equal(page.data.generating, false);

  const { wxApi: offlineWx, calls: offlineCalls } = recordingWx({
    cloud: { callFunction: async () => { throw new Error('offline'); } }
  });
  const offlinePage = loadFunTextPage(offlineWx);
  offlinePage.data.inputText = '我今天想见你';
  await offlinePage.onGenerate();
  assert.match(offlineCalls.modals[0].title, /安全服务暂不可用/);
  assert.deepEqual(offlineCalls.navigations, []);
  assert.equal(offlinePage.data.inputText, '我今天想见你');
});

test('empty and overlong inputs never call the cloud', async () => {
  let cloudCalled = false;
  const { wxApi, calls } = recordingWx({
    cloud: { callFunction: async () => { cloudCalled = true; return { result: { ok: true, code: 'OK' } }; } }
  });
  const page = loadFunTextPage(wxApi);
  await page.onGenerate();
  assert.equal(cloudCalled, false);
  assert.ok(calls.toasts.length >= 1);
  assert.match(calls.toasts[0].title, /请输入一句话/);
  assert.deepEqual(calls.navigations, []);
  page.data.inputText = '字'.repeat(41);
  page.onInput({ detail: { value: '字'.repeat(41) } });
  await page.onGenerate();
  assert.equal(cloudCalled, false);
  assert.ok(calls.toasts.some((item) => /40/.test(item.title)));
  assert.deepEqual(calls.navigations, []);
});

test('onTryDemo enters candidates with the fixed reviewed demo project without calling the cloud', async () => {
  let cloudCalled = false;
  const { wxApi, calls } = recordingWx({
    cloud: { callFunction: async () => { cloudCalled = true; return { result: { ok: true, code: 'OK' } }; } }
  });
  const page = loadFunTextPage(wxApi);
  page.onTryDemo();
  assert.equal(cloudCalled, false);
  assert.deepEqual(calls.navigations, [CANDIDATES_PAGE]);
  const project = calls.emitted[0].payload.project;
  assert.equal(project.sourceText, '我今天想见你');
  assert.equal(project.brief.expressionKey, 'funny-reversal');
  assert.equal(project.generationMode, 'rules');
  assert.equal(project.candidates.length, 3);
});

test('homepage shows five real swipeable demo cards and the demo CTA', () => {
  const wxml = readMiniProgramFile('miniprogram/pages/index/index.wxml');
  assert.match(wxml, /滑一下看看/);
  assert.match(wxml, /把你的话也变成一叠/);
  assert.match(wxml, /fun-text-demo-swiper/);
  const { wxApi } = recordingWx({});
  const page = loadIndexPage(wxApi);
  assert.equal(page.data.funTextDemoSlides.length, 5);
  page.data.funTextDemoSlides.forEach((slide, index) => {
    assert.equal(slide.src, `/assets/fun-text/demo/0${index + 1}.png`);
  });
  assert.equal(page.data.funTextDemoIndex, 0);
});

test('swiping the demo to the last card reveals the CTA and tapping it enters candidates', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadIndexPage(wxApi);
  page.data.funTextDemoIndex = 0;
  page.onFunTextDemoChange({ detail: { current: 4 } });
  assert.equal(page.data.funTextDemoIndex, 4);
  page.onTryFunTextDemo();
  assert.deepEqual(calls.navigations, [CANDIDATES_PAGE]);
  const project = calls.emitted[0].payload.project;
  assert.equal(project.sourceText, '我今天想见你');
  assert.equal(project.brief.expressionKey, 'funny-reversal');
  assert.equal(project.candidates.length, 3);
});

test('release feature flag keeps the static demo visible but closes its interactive entry', () => {
  const { wxApi, calls } = recordingWx({});
  const page = loadIndexPage(wxApi, { ENABLE_FUN_TEXT_STACK_ENTRY: false });

  assert.equal(page.data.funTextDemoSlides.length, 5);
  assert.equal(page.data.funTextEntryEnabled, false);
  page.onTryFunTextDemo();

  assert.deepEqual(calls.navigations, []);
  assert.match(calls.toasts[0].title, /暂不可用/);
});

test('homepage switches the shared preview without resetting the fun text card', () => {
  const { wxApi } = recordingWx({});
  const page = loadIndexPage(wxApi);

  page.onSelectHomePlay({ currentTarget: { dataset: { playId: 'fun-text-stack' } } });
  page.onFunTextDemoChange({ detail: { current: 3 } });
  page.onSelectHomePlay({ currentTarget: { dataset: { playId: 'layered-dressup' } } });
  page.onSelectHomePlay({ currentTarget: { dataset: { playId: 'fun-text-stack' } } });

  assert.equal(page.data.activeHomePlay, 'fun-text-stack');
  assert.equal(page.data.funTextDemoIndex, 3);
});

test('homepage provides a guarded direct entry to the fun text input page', () => {
  const enabled = recordingWx({});
  const enabledPage = loadIndexPage(enabled.wxApi);
  enabledPage.onCreateFunText();
  assert.deepEqual(enabled.calls.navigations, ['/pages/fun-text/fun-text']);

  const disabled = recordingWx({});
  const disabledPage = loadIndexPage(disabled.wxApi, { ENABLE_FUN_TEXT_STACK_ENTRY: false });
  disabledPage.onCreateFunText();
  assert.deepEqual(disabled.calls.navigations, []);
  assert.match(disabled.calls.toasts[0].title, /暂不可用/);
});
