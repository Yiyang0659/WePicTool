const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');
const taskUtils = require('../miniprogram/utils/task.js');
const manifestUtils = require('../miniprogram/utils/stackExportManifest.js');

function groupsOf(count) {
  const make = (key, size) => Array.from({ length: size }, (_, index) => ({
    resultId: `${key}-${index + 1}`,
    composedUrl: `/composed/${key}-${index + 1}.png`,
    displayUrl: `/composed/${key}-${index + 1}.png`,
    composedRatio: '4:5',
    composeStatus: 'done',
    showMode: 'composed'
  }));
  return {
    tops: make('tops', count),
    bottoms: make('bottoms', count),
    shoes: make('shoes', count),
    others: make('others', 1)
  };
}

function numbered(manifest) {
  const output = JSON.parse(JSON.stringify(manifest));
  output.stacks.forEach((stack) => {
    stack.cards.forEach((card) => {
      card.exportUrl = `/numbered/${stack.stackId}-${card.sequenceLabel}.png`;
    });
  });
  return output;
}

function setup(overrides = {}) {
  const calls = { materialize: [], saveManifest: [], saveUrls: [], previews: [], payloads: [], toasts: [], modals: [] };
  const sequenceBadgeComposer = {
    materializeManifest(wxApi, canvas, manifest, options) {
      calls.materialize.push({ canvas, manifest, options });
      return overrides.materialize
        ? overrides.materialize(manifest, options)
        : Promise.resolve(numbered(manifest));
    }
  };
  const imageExporter = {
    saveExportManifest(wxApi, manifest, options) {
      calls.saveManifest.push({ manifest, options });
      return overrides.saveManifest
        ? overrides.saveManifest(manifest, options)
        : Promise.resolve({ ok: true, savedCount: 3 });
    },
    saveImagesSequentially(wxApi, urls, options) {
      calls.saveUrls.push({ urls, options });
      return Promise.resolve({ ok: true, savedCount: urls.length });
    }
  };
  const wxApi = {
    showToast(options) { calls.toasts.push(options); },
    showLoading() {},
    hideLoading() {},
    showModal(options) { calls.modals.push(options); },
    previewImage(options) { calls.previews.push(options); },
    navigateTo(options) {
      const channel = { emit(name, payload) { calls.payloads.push({ name, payload }); } };
      options.success({ eventChannel: channel });
    },
    getStorageSync() { return []; },
    setStorageSync() {}
  };
  const definition = loadMiniProgramPage('miniprogram/pages/result/result.js', {
    '../../utils/task': taskUtils,
    '../../utils/cardComposer': { composeCard: () => Promise.reject(new Error('unexpected compose')), DEFAULT_OPTIONS: {} },
    '../../utils/imageExporter': imageExporter,
    '../../utils/stackExportManifest': manifestUtils,
    '../../utils/sequenceBadgeComposer': sequenceBadgeComposer
  }, wxApi);
  const page = instantiatePage(definition);
  const baseSetData = page.setData;
  page.setData = function (updates, callback) {
    baseSetData(updates);
    if (typeof callback === 'function') callback();
  };
  page._sequenceCanvas = { id: 'sequence-only' };
  page._sequenceReady = true;
  page.setData({ taskId: 'task-outfit-1', ratio: '4:5', groups: groupsOf(3) });
  return { page, calls };
}

test('outfit result prepares three independently numbered stacks and excludes others', async () => {
  const { page, calls } = setup();

  const manifest = await page.prepareExportManifest();

  assert.equal(calls.materialize.length, 1);
  assert.equal(calls.materialize[0].canvas.id, 'sequence-only');
  assert.deepEqual(manifest.stacks.map((stack) => stack.stackId), ['tops', 'bottoms', 'shoes']);
  assert.deepEqual(manifest.stacks.map((stack) => stack.cards.map((card) => card.sequenceLabel)), [
    ['01', '02', '03'], ['01', '02', '03'], ['01', '02', '03']
  ]);
  assert.equal(page.data.groups.tops[0].exportUrl, '/numbered/tops-01.png');
  assert.equal(page.data.groups.others[0].exportUrl, undefined);
  assert.equal(page.data.exportFingerprint, manifest.fingerprint);
});

test('outfit preview, single save and stack save reuse materialized export urls', async () => {
  const { page, calls } = setup();
  await page.prepareExportManifest();

  await page.onWechatPreview();
  await page.onSaveSingleItem({ currentTarget: { dataset: { group: 'tops', index: 1 } } });
  await page.onSaveGroupByKey({ currentTarget: { dataset: { group: 'tops' } } });

  const payloadManifest = calls.payloads[0].payload.manifest;
  assert.equal(payloadManifest.stacks[0].cards[1].exportUrl, '/numbered/tops-02.png');
  assert.equal(Array.from(calls.saveUrls[0].urls).join(','), '/numbered/tops-02.png');
  assert.equal(Array.from(calls.saveManifest[0].options.stackIds).join(','), 'tops');
  assert.equal(calls.saveManifest[0].manifest.stacks[0].cards[1].exportUrl, '/numbered/tops-02.png');
});

test('outfit export invalidation clears numbered images, fingerprint and resume cursor', async () => {
  const { page } = setup();
  await page.prepareExportManifest();
  page.setData({ saveCursor: 2, saveSessionFingerprint: page.data.exportFingerprint });

  page.invalidateExportState();

  assert.equal(page.data.exportManifest, null);
  assert.equal(page.data.exportFingerprint, '');
  assert.equal(page.data.saveCursor, 0);
  assert.equal(page.data.saveSessionFingerprint, '');
  assert.equal(page.data.groups.tops[0].exportUrl, undefined);
});

test('outfit manifest save keeps the failed numbered cursor for a no-duplicate retry', async () => {
  let attempt = 0;
  const { page, calls } = setup({
    saveManifest(manifest, options) {
      attempt += 1;
      if (attempt === 1) {
        const error = new Error('album failed');
        Object.assign(error, { code: 'SAVE_FAILED', nextIndex: 1, stackTitle: '上衣组', sequenceLabel: '02' });
        return Promise.reject(error);
      }
      return Promise.resolve({ ok: true, savedCount: 2 });
    }
  });
  await page.prepareExportManifest();

  await page.onSaveGroupByKey({ currentTarget: { dataset: { group: 'tops' } } });
  assert.equal(page.data.saveCursor, 1);
  assert.match(calls.modals[0].content, /上衣组.*02/);

  await page.onSaveGroupByKey({ currentTarget: { dataset: { group: 'tops' } } });
  assert.equal(calls.saveManifest[1].options.startIndex, 1);
  assert.equal(page.data.saveCursor, 0);
});

test('outfit export waits for white-card completion and blocks stacks below three cards', async () => {
  const { page, calls } = setup();
  page.setData({ composing: true });
  await assert.rejects(page.prepareExportManifest(), { code: 'WHITE_CARD_COMPOSING' });
  assert.equal(calls.materialize.length, 0);

  const shortGroups = groupsOf(3);
  shortGroups.tops = shortGroups.tops.slice(0, 2);
  page.setData({ composing: false, groups: shortGroups });
  await page.onSaveGroupByKey({ currentTarget: { dataset: { group: 'tops' } } });
  assert.equal(calls.saveManifest.length, 0);
  assert.match(calls.toasts.at(-1).title, /不足 3 张/);
});

test('outfit export deduplicates preparation and ignores an invalidated generation', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { page, calls } = setup({ materialize: () => pending });

  const first = page.prepareExportManifest();
  const second = page.prepareExportManifest();
  assert.equal(calls.materialize.length, 1);
  page.invalidateExportState();
  release(numbered(calls.materialize[0].manifest));
  const settled = await Promise.allSettled([first, second]);

  assert.equal(settled[0].status, 'rejected');
  assert.equal(settled[0].reason.code, 'STALE_EXPORT_GENERATION');
  assert.equal(page.data.exportManifest, null);
  assert.equal(page.data.exportFingerprint, '');
});

test('outfit result uses separate canvases and removes the CSS badge after materialization', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/result/result.wxml'), 'utf8');
  assert.match(wxml, /id="cardComposer"/);
  assert.match(wxml, /id="sequenceBadgeCanvas"/);
  assert.match(wxml, /wx:if="\{\{g\.key !== 'others' && !it\.exportUrl\}\}"/);
  assert.match(wxml, /src="\{\{it\.exportUrl \|\| it\.displayUrl\}\}"/);
});
