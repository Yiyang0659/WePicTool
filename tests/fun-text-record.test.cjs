'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');

const model = require('../miniprogram/utils/funTextProject');

function recordingWx(storage) {
  const calls = {
    toasts: [],
    modals: [],
    navigations: [],
    emitted: [],
    storage: Object.assign({}, storage || {})
  };

  const wxApi = {
    getStorageSync(key) {
      return calls.storage[key] || null;
    },
    setStorageSync(key, value) {
      calls.storage[key] = value;
    },
    removeStorageSync(key) {
      delete calls.storage[key];
    },
    getStorageInfoSync() {
      return { keys: Object.keys(calls.storage) };
    },
    getSavedFileList(opts) {
      if (opts.success) opts.success({ fileList: [] });
    },
    removeSavedFile() {},
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
      if (options.success) {
        options.success({ confirm: true });
      }
    }
  };

  return { wxApi, calls };
}

test('record page categorizes funtext tasks and routes to template-result', () => {
  const sampleProject = model.createFunTextProject({
    sourceText: '今天想见你',
    expressionKey: 'funny-reversal',
    now: 1000
  });

  const storage = {
    wepictool_records: [
      {
        recordId: 'rec_fun_1',
        type: 'funtext',
        createdAt: 1000,
        totalCount: 4,
        title: '今天想见你',
        summary: '今天想见你',
        thumbnails: ['cloud://test/c1.png'],
        taskSnapshot: {
          taskId: 'proj_1',
          mode: 'funtext',
          type: 'funtext',
          projectSnapshot: sampleProject,
          cards: [{ sceneId: 's1', order: 1, url: 'cloud://test/c1.png' }]
        }
      }
    ]
  };

  const { wxApi, calls } = recordingWx(storage);
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/record/record.js', {
    '../../utils/task': require('../miniprogram/utils/task.js')
  }, wxApi));

  page.onShow();

  assert.equal(page.data.records.length, 1);
  assert.equal(page.data.records[0].recordType, 'funtext');
  assert.ok(page.data.typeTabs.some(tab => tab.type === 'funtext'));

  // Tap to view funtext record
  page.onViewRecord({ currentTarget: { dataset: { recordid: 'rec_fun_1' } } });

  assert.ok(calls.navigations.some(url => url.includes('/pages/template-result/template-result')));
  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].name, 'acceptTaskData');
  assert.equal(calls.emitted[0].payload.task, storage.wepictool_records[0].taskSnapshot);
});

test('record page shows upgrade prompt on legacy bigtext records and offers recreation', () => {
  const storage = {
    wepictool_records: [
      {
        recordId: 'rec_big_1',
        type: 'bigtext',
        createdAt: 500,
        totalCount: 3,
        title: '旧大字记录',
        taskSnapshot: { taskId: 'old_1', type: 'bigtext' }
      }
    ]
  };

  const { wxApi, calls } = recordingWx(storage);
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/record/record.js', {
    '../../utils/task': require('../miniprogram/utils/task.js')
  }, wxApi));

  page.onShow();

  assert.equal(page.data.records.length, 1);
  assert.equal(page.data.records[0].recordType, 'bigtext');

  // Tap view legacy record
  page.onViewRecord({ currentTarget: { dataset: { recordid: 'rec_big_1' } } });

  assert.equal(calls.modals[0].content, '旧大字滑卡记录暂不支持直接打开，请重新制作');
  assert.ok(calls.navigations.includes('/pages/fun-text/fun-text'));
});

test('record page reopens layered-dressup with its P1 editor route', () => {
  const storage = {
    wepictool_records: [{
      recordId: 'rec_layered_1',
      type: 'layered-dressup',
      createdAt: 1000,
      taskSnapshot: { taskId: 'layered_1', type: 'layered-dressup' }
    }]
  };
  const { wxApi, calls } = recordingWx(storage);
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/record/record.js', {
    '../../utils/task': require('../miniprogram/utils/task.js')
  }, wxApi));

  page.onShow();
  page.onViewRecord({ currentTarget: { dataset: { recordid: 'rec_layered_1' } } });

  assert.deepEqual(calls.navigations, ['/pages/dressup/dressup?mode=edit']);
});

test('record page preserves unsupported records and does not navigate them', () => {
  const unsupported = {
    recordId: 'rec_future_1',
    type: 'future-stack',
    createdAt: 1000,
    taskSnapshot: { taskId: 'future_1', type: 'future-stack' }
  };
  const storage = { wepictool_records: [unsupported] };
  const { wxApi, calls } = recordingWx(storage);
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/record/record.js', {
    '../../utils/task': require('../miniprogram/utils/task.js')
  }, wxApi));

  page.onShow();
  page.onViewRecord({ currentTarget: { dataset: { recordid: 'rec_future_1' } } });

  assert.equal(calls.navigations.length, 0);
  assert.equal(calls.toasts[0].title, '该记录版本暂不支持');
  assert.equal(calls.storage.wepictool_records[0], unsupported);
});

test('profile page clears history records and task cache', () => {
  const storage = {
    wepictool_records: [{ recordId: 'r1' }],
    wepic_history_tasks: [{ taskId: 't1' }],
    wepictool_feedbacks: [{ id: 'f1' }]
  };

  const { wxApi, calls } = recordingWx(storage);
  const page = instantiatePage(loadMiniProgramPage('miniprogram/pages/profile/profile.js', {}, wxApi));

  page.onShow();
  assert.equal(page.data.recordCount, 1);

  page.doClearCache();

  assert.equal(calls.storage.wepictool_records, undefined);
  assert.equal(calls.storage.wepic_history_tasks, undefined);
  assert.equal(calls.storage.wepictool_feedbacks, undefined);
});
