const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadMiniProgramPage, instantiatePage } = require('./helpers/miniprogram-loader.cjs');
const registry = require('../miniprogram/config/playRegistry.js');
const dressup = require('../miniprogram/utils/layeredDressup.js');
const manifestUtils = require('../miniprogram/utils/stackExportManifest.js');

function numbered(manifest) {
  const output = JSON.parse(JSON.stringify(manifest));
  output.stacks.forEach((stack) => stack.cards.forEach((card) => {
    card.exportUrl = `/numbered/${stack.stackId}-${card.sequenceLabel}.png`;
  }));
  return output;
}

function setup(overrides = {}) {
  const calls = { materialize: [], saves: [], payloads: [], toasts: [], modals: [] };
  const wxApi = {
    getStorageSync() { return null; },
    setStorageSync() {},
    showToast(options) { calls.toasts.push(options); },
    showLoading() {},
    hideLoading() {},
    showModal(options) { calls.modals.push(options); },
    previewImage() {},
    navigateTo(options) {
      options.success({ eventChannel: { emit(name, payload) { calls.payloads.push({ name, payload }); } } });
    }
  };
  const sequenceBadgeComposer = {
    materializeManifest(wxArg, canvas, manifest, options) {
      calls.materialize.push({ canvas, manifest, options });
      return overrides.materialize ? overrides.materialize(manifest, options) : Promise.resolve(numbered(manifest));
    }
  };
  const imageExporter = {
    saveExportManifest(wxArg, manifest, options) {
      calls.saves.push({ manifest, options });
      return overrides.save ? overrides.save(manifest, options) : Promise.resolve({ ok: true, savedCount: 3 });
    },
    saveImagesSequentially() { return Promise.resolve({ ok: true, savedCount: 1 }); }
  };
  const definition = loadMiniProgramPage('miniprogram/pages/dressup/dressup.js', {
    '../../config/playRegistry': registry,
    '../../utils/layeredDressup': dressup,
    '../../utils/imageExporter': imageExporter,
    '../../utils/stackExportManifest': manifestUtils,
    '../../utils/sequenceBadgeComposer': sequenceBadgeComposer
  }, wxApi);
  const page = instantiatePage(definition);
  const setData = page.setData;
  page.setData = function (updates, callback) {
    setData(updates);
    if (typeof callback === 'function') callback();
  };
  page._sequenceCanvas = { id: 'dressup-sequence' };
  page._sequenceReady = true;
  const project = dressup.createProject({ sourceMode: 'demo', templateId: 'funny-paper-doll-v1', now: 1000 });
  page.refreshProject(project, false);
  return { page, calls, project };
}

test('dressup prepares four independently numbered stacks and shows the same export urls', async () => {
  const { page, calls } = setup();
  const manifest = await page.prepareExportManifest();

  assert.equal(calls.materialize[0].canvas.id, 'dressup-sequence');
  assert.equal(Array.from(manifest.stacks).map((stack) => stack.stackId).join(','), 'head,tops,bottoms,shoes');
  manifest.stacks.forEach((stack) => assert.equal(stack.cards.map((card) => card.sequenceLabel).join(','), '01,02,03'));
  assert.equal(page.data.groupList[0].items[0].exportUrl, '/numbered/head-01.png');
  assert.equal(page.data.exportFingerprint, manifest.fingerprint);
});

test('dressup preview and save consume one materialized manifest in registry order', async () => {
  const { page, calls } = setup();
  await page.prepareExportManifest();
  await page.onPreview();
  await page.onSaveGroup({ currentTarget: { dataset: { group: 'tops' } } });
  await page.onSaveAll();

  assert.equal(calls.payloads[0].payload.manifest.stacks[1].cards[0].exportUrl, '/numbered/tops-01.png');
  assert.equal(Array.from(calls.saves[0].options.stackIds).join(','), 'tops');
  assert.equal(calls.saves[0].manifest.stacks[1].cards[0].exportUrl, '/numbered/tops-01.png');
  assert.equal(calls.saves[1].options.stackIds, undefined);
});

test('dressup project mutations invalidate the cursor and produce a different fingerprint', async () => {
  const { page, project } = setup();
  const first = await page.prepareExportManifest();
  page.setData({ saveCursor: 2, saveSessionFingerprint: first.fingerprint });
  const moved = dressup.moveItem(project, 'head', 0, 1);

  page.refreshProject(moved, false);
  assert.equal(page.data.saveCursor, 0);
  assert.equal(page.data.saveSessionFingerprint, '');
  const second = await page.prepareExportManifest();
  assert.notEqual(second.fingerprint, first.fingerprint);
  assert.equal(second.stacks[0].cards[0].cardId, project.groups.head[1].id);
});

test('dressup previews a short numbered stack but refuses to save it as a WeChat stack', async () => {
  const { page, calls, project } = setup();
  const short = dressup.removeItem(project, 'head', project.groups.head[2].id);
  page.refreshProject(short, false);
  const manifest = await page.prepareExportManifest();
  assert.equal(manifest.stacks[0].cards.length, 2);
  assert.equal(manifest.stacks[0].canExport, false);

  await page.onPreview();
  await page.onSaveGroup({ currentTarget: { dataset: { group: 'head' } } });
  assert.equal(calls.payloads.at(-1).payload.manifest.stacks[0].cards[1].exportUrl, '/numbered/head-02.png');
  assert.match(calls.toasts.at(-1).title, /至少需要 3 张/);
});

test('dressup save resumes at the failed stack sequence without duplicates', async () => {
  let attempt = 0;
  const { page, calls } = setup({
    save() {
      attempt += 1;
      if (attempt === 1) {
        const error = new Error('save failed');
        Object.assign(error, { code: 'SAVE_FAILED', nextIndex: 1, stackTitle: '头像与发型', sequenceLabel: '02' });
        return Promise.reject(error);
      }
      return Promise.resolve({ ok: true, savedCount: 2 });
    }
  });
  await page.prepareExportManifest();

  await page.onSaveGroup({ currentTarget: { dataset: { group: 'head' } } });
  assert.equal(page.data.saveCursor, 1);
  assert.match(calls.modals[0].content, /头像与发型.*02/);
  await page.onSaveGroup({ currentTarget: { dataset: { group: 'head' } } });
  assert.equal(calls.saves[1].options.startIndex, 1);
  assert.equal(page.data.saveCursor, 0);
});

test('dressup unload prevents an older materialization from writing back', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { page, calls } = setup({ materialize: () => pending });
  const preparing = page.prepareExportManifest();
  page.onUnload();
  release(numbered(calls.materialize[0].manifest));

  await assert.rejects(preparing, { code: 'STALE_EXPORT_GENERATION' });
  assert.equal(page.data.exportManifest, null);
});

test('dressup ignores an older save success after the project changes', async () => {
  let finishSave;
  const pendingSave = new Promise((resolve) => { finishSave = resolve; });
  const { page, calls, project } = setup({ save: () => pendingSave });
  const firstManifest = await page.prepareExportManifest();

  const saving = page.onSaveGroup({ currentTarget: { dataset: { group: 'head' } } });
  await Promise.resolve();
  assert.equal(calls.saves.length, 1);

  const moved = dressup.moveItem(project, 'head', 0, 1);
  page.refreshProject(moved, false);
  finishSave({ ok: true, savedCount: 3 });
  await saving;

  assert.equal(page.data.showGuide, false);
  assert.notEqual(page.data.exportManifest.fingerprint, firstManifest.fingerprint);
  assert.equal(page.data.saveCursor, 0);
  assert.equal(page.data.saveSessionFingerprint, '');
});

test('dressup page declares a dedicated sequence canvas and materialized thumbnail source', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/dressup/dressup.wxml'), 'utf8');
  assert.match(wxml, /id="sequenceBadgeCanvas"/);
  assert.match(wxml, /src="\{\{it\.exportUrl \|\| it\.displayUrl\}\}"/);
});
