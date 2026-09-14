const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');

function loadMiniProgramModule(relativePath, dependencies = {}) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) {
      return dependencies[request];
    }
    if (request.startsWith('.')) return require(path.resolve(path.dirname(filePath), request));
    return require(request);
  };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: localRequire,
    console
  }, { filename: filePath });
  return module.exports;
}

function loadMiniProgramPage(relativePath, dependencies = {}, wxOverrides = {}) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  let definition = null;
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) {
      return dependencies[request];
    }
    if (request.startsWith('.')) return require(path.resolve(path.dirname(filePath), request));
    return require(request);
  };
  vm.runInNewContext(code, {
    Page(value) { definition = value; },
    require: localRequire,
    wx: wxOverrides,
    getApp() { return { globalData: {} }; },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise
  }, { filename: filePath });
  return definition;
}

function instantiatePage(definition) {
  const instance = Object.assign({}, definition);
  instance.data = plain(definition.data || {});
  instance.setData = function (updates, callback) {
    Object.keys(updates || {}).forEach((key) => {
      instance.data[key] = updates[key];
    });
    if (typeof callback === 'function') callback();
  };
  return instance;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const registry = loadMiniProgramModule('miniprogram/config/playRegistry.js');
const dressup = loadMiniProgramModule('miniprogram/utils/layeredDressup.js', {
  '../config/playRegistry': registry
});

test('exposes the play registry through Node CommonJS for the shared baseline gate', () => {
  const directRegistry = require('../miniprogram/config/playRegistry.js');

  assert.equal(typeof directRegistry.getPlayDefinition, 'function');
  assert.equal(directRegistry.getPlayDefinition('layered-dressup').id, 'layered-dressup');
});

test('registers layered dressup with the four ordered groups', () => {
  const play = registry.getPlayDefinition('layered-dressup');

  assert.deepEqual(plain(play.groupSchema), ['head', 'tops', 'bottoms', 'shoes']);
  assert.deepEqual(plain(play.entryModes), ['demo', 'upload', 'mixed']);
  assert.equal(play.title, '穿搭叠图');
  assert.equal(play.status, 'available');
});

test('ships a valid complete built-in paper doll pack', () => {
  const pack = registry.getAssetPack('funny-paper-doll-v1');
  const result = registry.validateAssetPack(pack);

  assert.equal(result.valid, true);
  assert.deepEqual(plain(Object.keys(pack.groups)), ['head', 'tops', 'bottoms', 'shoes']);
  assert.equal(pack.version, 2);
  assert.equal(pack.title, '四套基础穿搭');
  assert.equal(pack.groups.head.length, 4);
  assert.equal(pack.groups.tops.length, 4);
  assert.equal(pack.groups.bottoms.length, 4);
  assert.equal(pack.groups.shoes.length, 4);
  assert.deepEqual(plain(pack.groups.head.map(item => item.url)), [
    '/assets/samples/head1.jpg',
    '/assets/samples/head2.jpg',
    '/assets/samples/head3.jpg',
    '/assets/samples/head4.jpg'
  ]);
});

test('rejects an asset pack with a group below the WeChat stack threshold', () => {
  const pack = plain(registry.getAssetPack('funny-paper-doll-v1'));
  pack.groups.head = pack.groups.head.slice(0, 2);

  const result = registry.validateAssetPack(pack);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /head.*3/);
});

test('rejects duplicate ids and assets placed in the wrong group', () => {
  const pack = plain(registry.getAssetPack('funny-paper-doll-v1'));
  pack.groups.bottoms[0].id = pack.groups.tops[0].id;
  pack.groups.shoes[0].groupKey = 'tops';

  const result = registry.validateAssetPack(pack);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /重复/);
  assert.match(result.errors.join('\n'), /shoes.*groupKey/);
});

test('creates a complete demo project from the built-in pack', () => {
  const project = dressup.createProject({
    sourceMode: 'demo',
    templateId: 'funny-paper-doll-v1',
    now: 1000
  });

  assert.equal(project.projectId, 'layered_1000');
  assert.equal(project.playId, 'layered-dressup');
  assert.equal(project.groups.head.length, 4);
  assert.equal(project.groups.tops.length, 4);
  assert.equal(project.groups.bottoms.length, 4);
  assert.equal(project.groups.shoes.length, 4);
  assert.equal(dressup.buildSendability(project).validGroupCount, 4);
});

test('creates an empty upload project without adding filler cards', () => {
  const project = dressup.createProject({ sourceMode: 'upload', now: 2000 });

  assert.deepEqual(plain(project.groups), {
    head: [],
    tops: [],
    bottoms: [],
    shoes: [],
    others: []
  });
  assert.deepEqual(plain(project.pendingItems), []);
  assert.equal(dressup.buildSendability(project).canExport, false);
});

test('AI imports append to existing groups, keep uncertain images pending and ignore duplicates', () => {
  const project = dressup.addItems(
    dressup.createProject({ sourceMode: 'upload', now: 2100 }),
    'tops',
    [{ id: 'manual-top', sourceImageId: 'manual-source', url: '/tmp/manual-top.jpg' }],
    'user'
  );
  const first = dressup.mergeImportedItems(project, {
    tops: [{ resultId: 'ai-top', sourceImageId: 'ai-source-1', mattedUrl: 'cloud://ai-top.png', originalUrl: 'cloud://ai-top.jpg' }]
  }, [
    { resultId: 'ai-pending', sourceImageId: 'ai-source-2', url: 'cloud://unknown.jpg', classification: { needsConfirmation: true } }
  ], 'ai');

  assert.equal(first.addedCount, 2);
  assert.equal(first.project.groups.tops.length, 2);
  assert.equal(first.project.groups.tops[1].source, 'ai');
  assert.equal(first.project.groups.tops[1].url, 'cloud://ai-top.png');
  assert.equal(first.project.pendingItems.length, 1);
  assert.equal(first.project.pendingItems[0].sourceImageId, 'ai-source-2');

  const repeated = dressup.mergeImportedItems(first.project, {
    tops: [{ resultId: 'ai-top-again', sourceImageId: 'ai-source-1', url: 'cloud://ai-top.png' }]
  }, [], 'ai');
  assert.equal(repeated.addedCount, 0);
  assert.equal(repeated.duplicateCount, 1);
  assert.equal(repeated.project.groups.tops.length, 2);
});

test('pending AI material can be assigned to a selected outfit group or removed', () => {
  const project = dressup.createProject({ sourceMode: 'upload', now: 2200 });
  const imported = dressup.mergeImportedItems(project, {}, [
    { resultId: 'pending-one', sourceImageId: 'pending-source', url: '/tmp/pending.jpg' }
  ], 'ai').project;

  const assigned = dressup.assignPendingItem(imported, imported.pendingItems[0].id, 'head');
  assert.equal(assigned.assigned, true);
  assert.equal(assigned.project.pendingItems.length, 0);
  assert.equal(assigned.project.groups.head.length, 1);

  const importedAgain = dressup.mergeImportedItems(project, {}, [
    { resultId: 'pending-two', sourceImageId: 'pending-source-two', url: '/tmp/pending-two.jpg' }
  ], 'ai').project;
  const removed = dressup.removePendingItem(importedAgain, importedAgain.pendingItems[0].id);
  assert.equal(removed.pendingItems.length, 0);
});

test('adding user material changes demo source to mixed and caps a group at twelve', () => {
  const project = dressup.createProject({
    sourceMode: 'demo',
    templateId: 'funny-paper-doll-v1',
    now: 1000
  });
  const additions = Array.from({ length: 12 }, (_, index) => ({
    id: `user_${index}`,
    url: `/tmp/${index}.jpg`
  }));

  const next = dressup.addItems(project, 'tops', additions, 'user');

  assert.equal(next.sourceMode, 'mixed');
  assert.equal(next.groups.tops.length, 12);
  assert.equal(next.groups.tops[4].source, 'user');
  assert.equal(project.groups.tops.length, 4);
});

test('removing cards until only two remain makes that group non-stackable without padding it', () => {
  const project = dressup.createProject({
    sourceMode: 'demo',
    templateId: 'funny-paper-doll-v1',
    now: 1000
  });

  const afterFirstRemoval = dressup.removeItem(project, 'head', project.groups.head[2].id);
  const next = dressup.removeItem(afterFirstRemoval, 'head', project.groups.head[3].id);

  assert.equal(next.groups.head.length, 2);
  assert.equal(dressup.buildSendability(next).groups.head.mode, 'normal');
  assert.equal(dressup.buildSendability(next).groups.head.missing, 1);
});

test('moving an item changes the first card used by preview', () => {
  const project = dressup.createProject({
    sourceMode: 'demo',
    templateId: 'funny-paper-doll-v1',
    now: 1000
  });
  const expected = project.groups.shoes[2].url;

  const next = dressup.moveItem(project, 'shoes', 2, 0);
  const preview = dressup.buildPreviewGroups(next);

  assert.equal(preview[3].key, 'shoes');
  assert.equal(preview[3].cards[0].url, expected);
  assert.deepEqual(plain(next.groups.shoes.map(item => item.order)), [1, 2, 3, 4]);
});

test('preview excludes empty groups but keeps real groups below three cards', () => {
  const project = dressup.createProject({ sourceMode: 'upload', now: 2000 });
  const next = dressup.addItems(project, 'head', [
    { id: 'one', url: '/tmp/one.jpg' },
    { id: 'two', url: '/tmp/two.jpg' }
  ], 'user');

  const preview = dressup.buildPreviewGroups(next);

  assert.equal(preview.length, 1);
  assert.equal(preview[0].key, 'head');
  assert.equal(preview[0].cards.length, 2);
});

function readJpegDimensions(data) {
  assert.equal(data[0], 0xff);
  assert.equal(data[1], 0xd8);

  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + segmentLength;
  }
  throw new Error('JPEG dimensions not found');
}

test('every built-in asset exists and all four coordinated cases stay compact', () => {
  const pack = registry.getAssetPack('funny-paper-doll-v1');
  const allItems = Object.values(pack.groups).flat();

  allItems.forEach((item) => {
    const assetPath = path.join(__dirname, '..', 'miniprogram', item.url.replace(/^\//, ''));
    assert.equal(fs.existsSync(assetPath), true, `missing asset: ${item.url}`);
    assert.ok(fs.statSync(assetPath).size > 0, `empty asset: ${item.url}`);
  });

  pack.groups.head.forEach((item) => {
    const assetPath = path.join(__dirname, '..', 'miniprogram', item.url.replace(/^\//, ''));
    const data = fs.readFileSync(assetPath);
    assert.match(item.url, /\.jpg$/);
    assert.deepEqual(Array.from(data.subarray(0, 2)), [0xff, 0xd8]);
    assert.deepEqual(readJpegDimensions(data), { width: 640, height: 640 });
    assert.ok(data.length < 150 * 1024, `head asset is too large: ${item.url}`);
  });

  ['tops', 'bottoms', 'shoes'].forEach((groupKey) => {
    pack.groups[groupKey].forEach((item) => {
      const assetPath = path.join(__dirname, '..', 'miniprogram', item.url.replace(/^\//, ''));
      const data = fs.readFileSync(assetPath);
      assert.deepEqual(readJpegDimensions(data), { width: 480, height: 640 });
      assert.ok(data.length < 80 * 1024, `outfit asset is too large: ${item.url}`);
    });
  });
});

test('declares a complete layered dressup page and its editing actions', () => {
  const root = path.join(__dirname, '..');
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
  assert.ok(appConfig.pages.includes('pages/dressup/dressup'));

  ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
    assert.equal(
      fs.existsSync(path.join(root, `miniprogram/pages/dressup/dressup.${extension}`)),
      true,
      `missing dressup.${extension}`
    );
  });

  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/dressup/dressup.wxml'), 'utf8');
  [
    'onOpenManualGroupPicker',
    'onOpenAiImporter',
    'onAddUserItems',
    'onAddSystemItems',
    'onAssignPendingItem',
    'onRemovePendingItem',
    'onRemoveItem',
    'onMoveItem',
    'onPreview',
    'onSaveGroup',
    'onSaveAll'
  ].forEach((handler) => assert.match(markup, new RegExp(`bindtap="${handler}"`)));
  assert.match(markup, /自己分层/);
  assert.match(markup, /AI 帮我整理/);
  assert.match(markup, /待确认素材/);
  assert.match(markup, /class="empty-group"[^>]*bindtap="onAddUserItems"[^>]*data-group="\{\{g\.key\}\}"/);
  assert.match(markup, /首图/);
  assert.match(markup, /还差 \{\{g\.missing\}\} 张可形成叠图/);
});

test('syntax checks include the layered dressup page and both shared modules', () => {
  const root = path.join(__dirname, '..');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-syntax.mjs'), '--root', root], {
    cwd: root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('homepage flagship actions navigate to demo and upload dressup modes', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const urls = [];
  const page = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {
    navigateTo(options) { urls.push(options.url); }
  });

  page.onTryLayeredDemo();
  page.onCreateLayeredDressup();

  assert.deepEqual(urls, [
    '/pages/dressup/dressup?mode=demo',
    '/pages/dressup/dressup?mode=upload'
  ]);
  assert.equal(page.data.homeTools.some(item => item.key === 'ai-outfit'), false);
  assert.equal(page.data.homeTools.length, 3);
  assert.equal(page.data.homeTools.some(item => item.key === 'suit' || item.key === 'dressup'), false);
});

test('homepage uses one shared two-play preview and one unified outfit entry', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(markup, /今天想做什么/);
  assert.equal((markup.match(/class="home-shared-preview"/g) || []).length, 1);
  assert.match(markup, /activeHomePlay === 'layered-dressup'/);
  assert.match(markup, /activeHomePlay === 'fun-text-stack'/);
  assert.match(markup, /bindtap="onTryLayeredDemo"/);
  assert.match(markup, /bindtap="onCreateLayeredDressup"/);
  assert.match(markup, /穿搭叠图/);
  assert.match(markup, /用我的图片制作/);
  assert.match(markup, /先试玩示例/);
  assert.doesNotMatch(markup, /bindtap="onOpenOutfitPicker"/);
  assert.match(markup, /好友滑着搭配/);
  assert.doesNotMatch(markup, /layered-stack-edge|hero-card|hot-template-card|guide-card|fun-text-demo-card/);
});

test('AI importer starts empty, adds images and resets without opening another flow', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  let chooseCount = 0;
  const picked = [{ tempFilePath: 'wxfile://picked-one.jpg' }];
  const definition = loadMiniProgramPage('miniprogram/pages/outfit-import/outfit-import.js', {
    '../../utils/task': taskUtils
  }, {
    chooseMedia(options) {
      chooseCount += 1;
      options.success({ tempFiles: picked });
    }
  });
  const page = instantiatePage(definition);

  page.onAddMedia();
  assert.equal(chooseCount, 1);
  assert.deepEqual(plain(page.data.pickedImages), picked);

  page.onResetPickedImages();
  assert.equal(page.data.phase, 'select');
  assert.deepEqual(plain(page.data.pickedImages), []);
  assert.equal(chooseCount, 1);

  page.data.pickedImages = picked.slice();
  page.onRemovePickedImage({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(page.data.phase, 'select');
  assert.deepEqual(plain(page.data.pickedImages), []);
});

test('AI importer renders empty selection, review controls and a manual fallback', () => {
  const root = path.join(__dirname, '..');
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/outfit-import/outfit-import.wxml'), 'utf8');

  assert.ok(appConfig.pages.includes('pages/outfit-import/outfit-import'));
  assert.match(markup, /wx:if="\{\{pickedImages\.length === 0\}\}"/);
  assert.match(markup, /class="picked-empty"/);
  assert.match(markup, /添加混合图片/);
  assert.match(markup, /bindtap="onResetPickedImages"/);
  assert.match(markup, /bindtap="onChangeReviewGroup"/);
  assert.match(markup, /bindtap="onToggleReviewVersion"/);
  assert.match(markup, /bindtap="onUseManual"/);
  assert.match(markup, /加入穿搭叠图/);
});

test('AI importer keeps low-confidence items pending and emits reviewed groups back to the workbench', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const emitted = [];
  let navigatedBack = 0;
  const definition = loadMiniProgramPage('miniprogram/pages/outfit-import/outfit-import.js', {
    '../../utils/task': taskUtils
  }, {
    navigateBack() { navigatedBack += 1; },
    showToast() {}
  });
  const page = instantiatePage(definition);
  page._openerEventChannel = {
    emit(name, payload) { emitted.push({ name, payload }); }
  };
  page.showReviewTask({
    groups: {
      tops: [
        { resultId: 'top-ok', sourceImageId: 'top-source', url: 'cloud://top.jpg', classification: { needsConfirmation: false } },
        { resultId: 'top-low', sourceImageId: 'low-source', url: 'cloud://low.jpg', classification: { needsConfirmation: true } }
      ],
      others: [{ resultId: 'other', sourceImageId: 'other-source', url: 'cloud://other.jpg' }]
    }
  });

  assert.equal(page.data.reviewItems.filter(item => item.groupKey === 'tops').length, 1);
  assert.equal(page.data.reviewItems.filter(item => item.groupKey === 'pending').length, 2);
  page.onApplyImport();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].name, 'acceptAiImport');
  assert.equal(emitted[0].payload.groups.tops.length, 1);
  assert.equal(emitted[0].payload.pendingItems.length, 2);
  assert.equal(navigatedBack, 1);
});

test('AI importer normalizes before returning and retains original-versus-white-background choice', async () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const definition = loadMiniProgramPage('miniprogram/pages/outfit-import/outfit-import.js', {
    '../../utils/task': taskUtils,
    '../../utils/cardComposer': {composeCard:async()=>({tempFilePath:'wxfile://normalized',width:1024,height:1365})}
  }, {createOffscreenCanvas:()=>({}),getFileSystemManager:()=>({saveFile:o=>o.success({savedFilePath:'wxfile://saved'})}),navigateBack(){},showToast(){}});
  const page = instantiatePage(definition);
  let returned;
  page._openerEventChannel={emit:(name,payload)=>{returned=payload;}};
  await page.showReviewTask({
    groups: {
      shoes: [{
        resultId: 'shoe-one',
        sourceImageId: 'shoe-source',
        url: 'cloud://shoe-white.png',
        mattedUrl: 'cloud://shoe-white.png',
        mattedFileId: 'cloud://shoe-white.png',
        originalUrl: 'cloud://shoe-original.jpg',
        originalFileId: 'cloud://shoe-original.jpg'
      }]
    }
  });

  assert.equal(page.data.phase,'select');
  assert.equal(returned.groups.shoes[0].processedUrl,'wxfile://saved');

  page.onToggleReviewVersion({ currentTarget: { dataset: { id: 'shoe-source' } } });
  const payload = page.buildImportPayload(false);
  assert.equal(payload.groups.shoes[0].url, 'cloud://shoe-original.jpg');
  assert.equal(payload.groups.shoes[0].processedUrl, '');
  assert.equal(payload.groups.shoes[0].matted, false);
});

test('homepage keeps four layered choices independent and updates the current combination', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {});
  const page = instantiatePage(definition);

  assert.equal(page.data.activeHomePlay, 'layered-dressup');
  assert.deepEqual(plain(page.data.layeredDemoIndices), {
    head: 0,
    tops: 0,
    bottoms: 0,
    shoes: 0
  });

  page.onSelectLayeredDemoItem({
    currentTarget: { dataset: { groupKey: 'tops', index: 2 } }
  });

  assert.equal(page.data.layeredDemoIndices.tops, 2);
  assert.equal(page.data.layeredDemoIndices.head, 0);
  assert.equal(page.data.layeredDemoIndices.bottoms, 0);
  assert.equal(page.data.layeredDemoIndices.shoes, 0);
  assert.match(page.data.layeredCurrentItems.find(item => item.key === 'tops').src, /top3\.jpg$/);
});

test('homepage layered rows respond to native swiper changes without resetting other groups', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {});
  const page = instantiatePage(definition);

  page.onLayeredDemoSwiperChange({
    currentTarget: { dataset: { groupKey: 'bottoms' } },
    detail: { current: 2 }
  });

  assert.equal(page.data.layeredDemoIndices.bottoms, 2);
  assert.equal(page.data.layeredDemoIndices.head, 0);
  assert.equal(page.data.layeredDemoIndices.tops, 0);
  assert.equal(page.data.layeredDemoIndices.shoes, 0);
  assert.deepEqual(plain(page.data.layeredCurrentItems.map(item => item.key)), ['head', 'tops', 'bottoms', 'shoes']);
});

test('homepage idle demo advances only one randomly selected outfit group', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {});
  const page = instantiatePage(definition);
  const before = plain(page.data.layeredDemoIndices);

  const advanced = page.advanceLayeredDemoAutoplay(0.3);

  assert.deepEqual(plain(advanced), { groupKey: 'tops', index: 1 });
  assert.equal(page.data.layeredDemoIndices.tops, 1);
  assert.equal(page.data.layeredDemoIndices.head, before.head);
  assert.equal(page.data.layeredDemoIndices.bottoms, before.bottoms);
  assert.equal(page.data.layeredDemoIndices.shoes, before.shoes);
  assert.equal(page._layeredDemoAutoTarget, 'tops:1');
});

test('homepage manual arrows and touch gestures pause idle outfit motion', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {});
  const page = instantiatePage(definition);
  let pauseCount = 0;
  page.pauseLayeredDemoAutoplay = function () { pauseCount += 1; };

  page.onShiftLayeredDemoItem({ currentTarget: { dataset: { groupKey: 'shoes', direction: 1 } } });
  page.onLayeredDemoTouchStart();

  assert.equal(pauseCount, 2);
  assert.equal(page.data.layeredDemoIndices.shoes, 1);
});

test('homepage stops idle outfit motion when switching away or hiding', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {});
  const page = instantiatePage(definition);
  const calls = [];
  page.startLayeredDemoAutoplay = function () { calls.push('start'); };
  page.stopLayeredDemoAutoplay = function (includeResume) { calls.push('stop:' + includeResume); };
  page._layeredDemoPageVisible = true;

  page.onSelectHomePlay({ currentTarget: { dataset: { playId: 'fun-text-stack' } } });
  page.onHide();

  assert.deepEqual(calls, ['stop:true', 'stop:true']);
  assert.equal(page._layeredDemoPageVisible, false);
});

test('homepage layered preview uses one circular swiper per group and a vertical current list', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(markup, /class="layered-single-swiper"/);
  assert.match(markup, /circular="true"/);
  assert.match(markup, /duration="360"/);
  assert.match(markup, /easing-function="easeOutCubic"/);
  assert.match(markup, /bindtouchstart="onLayeredDemoTouchStart"/);
  assert.match(markup, /bindchange="onLayeredDemoSwiperChange"/);
  assert.match(markup, /class="layered-current-list"/);
  assert.doesNotMatch(markup, /class="layered-thumb-strip"/);
  assert.doesNotMatch(markup, /class="layered-current-grid"/);
});

test('upload entry ignores a saved demo-only draft', () => {
  const demoDraft = dressup.createProject({
    sourceMode: 'demo',
    templateId: 'funny-paper-doll-v1',
    now: 3000
  });
  const definition = loadMiniProgramPage('miniprogram/pages/dressup/dressup.js', {
    '../../config/playRegistry': registry,
    '../../utils/layeredDressup': dressup,
    '../../utils/imageExporter': require('../miniprogram/utils/imageExporter.js'),
    '../../utils/stackExportManifest': require('../miniprogram/utils/stackExportManifest.js'),
    '../../utils/sequenceBadgeComposer': require('../miniprogram/utils/sequenceBadgeComposer.js')
  }, {
    getStorageSync() { return demoDraft; }
  });
  const page = instantiatePage(definition);

  page.onLoad({ mode: 'upload' });

  assert.equal(page.data.project.sourceMode, 'upload');
  assert.equal(page.data.groupList.every(group => group.count === 0), true);
});

test('upload mode can add user images independently to every dressup group', async () => {
  const groupKeys = ['head', 'tops', 'bottoms', 'shoes'];

  for (const groupKey of groupKeys) {
    const definition = loadMiniProgramPage('miniprogram/pages/dressup/dressup.js', {
      '../../config/playRegistry': registry,
      '../../utils/layeredDressup': dressup,
      '../../utils/imageExporter': require('../miniprogram/utils/imageExporter.js'),
      '../../utils/stackExportManifest': require('../miniprogram/utils/stackExportManifest.js'),
      '../../utils/sequenceBadgeComposer': require('../miniprogram/utils/sequenceBadgeComposer.js')
    }, {
      chooseMedia(options) {
        options.success({ tempFiles: [{ tempFilePath: `wxfile://${groupKey}.jpg` }] });
      },
      showLoading() {},
      hideLoading() {},
      setStorageSync() {},
      showToast() {}
    });
    const page = instantiatePage(definition);
    page.data.project = dressup.createProject({ sourceMode: 'upload', now: 4000 });
    page.prepareUserFiles = function () {
      return Promise.resolve([{
        id: `user_${groupKey}`,
        localPath: `wxfile://${groupKey}.jpg`,
        url: `wxfile://${groupKey}.jpg`
      }]);
    };

    page.onAddUserItems({ currentTarget: { dataset: { group: groupKey } } });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(page.data.project.groups[groupKey].length, 1, `${groupKey} should receive its image`);
    groupKeys.filter(key => key !== groupKey).forEach((otherKey) => {
      assert.equal(page.data.project.groups[otherKey].length, 0, `${otherKey} should stay unchanged`);
    });
  }
});

test('dressup workbench opens AI review and appends its confirmed payload into the same project', () => {
  let registeredHandler = null;
  const urls = [];
  const definition = loadMiniProgramPage('miniprogram/pages/dressup/dressup.js', {
    '../../config/playRegistry': registry,
    '../../utils/layeredDressup': dressup,
    '../../utils/imageExporter': require('../miniprogram/utils/imageExporter.js'),
    '../../utils/stackExportManifest': require('../miniprogram/utils/stackExportManifest.js'),
    '../../utils/sequenceBadgeComposer': require('../miniprogram/utils/sequenceBadgeComposer.js'),
    '../../config/env': { ENABLE_OUTFIT_AI_ASSIST: true }
  }, {
    navigateTo(options) {
      urls.push(options.url);
      options.success({
        eventChannel: {
          on(name, handler) {
            assert.equal(name, 'acceptAiImport');
            registeredHandler = handler;
          }
        }
      });
    },
    setStorageSync() {},
    showToast() {}
  });
  const page = instantiatePage(definition);
  page.data.project = dressup.createProject({ sourceMode: 'upload', now: 5000 });

  page.onOpenAiImporter();
  assert.deepEqual(urls, ['/pages/outfit-import/outfit-import']);
  assert.equal(typeof registeredHandler, 'function');
  registeredHandler({
    groups: { shoes: [{ resultId: 'ai-shoe', sourceImageId: 'ai-shoe-source', url: 'cloud://shoe.png' }] },
    pendingItems: [],
    ratio: '3:4'
  });

  assert.equal(page.data.project.groups.shoes.length, 1);
  assert.equal(page.data.project.groups.shoes[0].source, 'ai');
  assert.equal(page.data.project.ratio, '3:4');
});

test('saving a built-in dressup asset copies it into USER_DATA_PATH before album save', async () => {
  const sourceItem = registry.getAssetPack('funny-paper-doll-v1').groups.head[0];
  const writes = [];
  const saved = [];
  const wxApi = {
    env: { USER_DATA_PATH: 'wxfile://user-data' },
    getFileSystemManager() {
      return {
        mkdir(options) { options.success(); },
        access(options) { options.fail({ errMsg: 'not found' }); },
        readFile(options) { options.success({ data: new Uint8Array([1, 2, 3]) }); },
        writeFile(options) {
          writes.push(options.filePath);
          options.success();
        }
      };
    },
    showLoading() {},
    hideLoading() {},
    saveImageToPhotosAlbum(options) {
      saved.push(options.filePath);
      options.success({});
    }
  };
  const definition = loadMiniProgramPage('miniprogram/pages/dressup/dressup.js', {
    '../../config/playRegistry': registry,
    '../../utils/layeredDressup': dressup,
    '../../utils/imageExporter': require('../miniprogram/utils/imageExporter.js'),
    '../../utils/stackExportManifest': require('../miniprogram/utils/stackExportManifest.js'),
    '../../utils/sequenceBadgeComposer': require('../miniprogram/utils/sequenceBadgeComposer.js')
  }, wxApi);
  const page = instantiatePage(definition);

  await page.saveItemsSequentially([sourceItem], '已保存头像与发型组');

  const expected = 'wxfile://user-data/layered-dressup/system_' + sourceItem.url.split('/').pop();
  assert.deepEqual(writes, [expected]);
  assert.deepEqual(saved, [expected]);
  assert.equal(saved.includes(sourceItem.url), false);
});
