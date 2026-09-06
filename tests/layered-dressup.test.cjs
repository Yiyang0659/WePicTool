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
  instance.setData = function (updates) {
    Object.keys(updates || {}).forEach((key) => {
      instance.data[key] = updates[key];
    });
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
  assert.equal(play.status, 'available');
});

test('ships a valid complete built-in paper doll pack', () => {
  const pack = registry.getAssetPack('funny-paper-doll-v1');
  const result = registry.validateAssetPack(pack);

  assert.equal(result.valid, true);
  assert.deepEqual(plain(Object.keys(pack.groups)), ['head', 'tops', 'bottoms', 'shoes']);
  assert.equal(pack.groups.head.length, 3);
  assert.equal(pack.groups.tops.length, 3);
  assert.equal(pack.groups.bottoms.length, 3);
  assert.equal(pack.groups.shoes.length, 3);
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
  assert.equal(project.groups.head.length, 3);
  assert.equal(project.groups.tops.length, 3);
  assert.equal(project.groups.bottoms.length, 3);
  assert.equal(project.groups.shoes.length, 3);
  assert.equal(dressup.buildSendability(project).validGroupCount, 4);
});

test('creates an empty upload project without adding filler cards', () => {
  const project = dressup.createProject({ sourceMode: 'upload', now: 2000 });

  assert.deepEqual(plain(project.groups), {
    head: [],
    tops: [],
    bottoms: [],
    shoes: []
  });
  assert.equal(dressup.buildSendability(project).canExport, false);
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
  assert.equal(next.groups.tops[3].source, 'user');
  assert.equal(project.groups.tops.length, 3);
});

test('removing the third card makes that group non-stackable without padding it', () => {
  const project = dressup.createProject({
    sourceMode: 'demo',
    templateId: 'funny-paper-doll-v1',
    now: 1000
  });

  const next = dressup.removeItem(project, 'head', project.groups.head[2].id);

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
  assert.deepEqual(plain(next.groups.shoes.map(item => item.order)), [1, 2, 3]);
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

test('every built-in asset exists and the project-owned head cards are compact 640 square JPEGs', () => {
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
    'onAddUserItems',
    'onAddSystemItems',
    'onRemoveItem',
    'onMoveItem',
    'onPreview',
    'onSaveGroup',
    'onSaveAll'
  ].forEach((handler) => assert.match(markup, new RegExp(`bindtap="${handler}"`)));
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
  assert.equal(page.data.homeTools.find(item => item.key === 'ai-outfit').status, 'available');
  assert.equal(page.data.homeTools.some(item => item.key === 'suit' || item.key === 'dressup'), false);
});

test('homepage uses one shared two-play preview and keeps the AI outfit picker entry', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(markup, /今天想做什么/);
  assert.equal((markup.match(/class="home-shared-preview"/g) || []).length, 1);
  assert.match(markup, /activeHomePlay === 'layered-dressup'/);
  assert.match(markup, /activeHomePlay === 'fun-text-stack'/);
  assert.match(markup, /bindtap="onTryLayeredDemo"/);
  assert.match(markup, /bindtap="onCreateLayeredDressup"/);
  assert.match(markup, /bindtap="onOpenOutfitPicker"/);
  assert.doesNotMatch(markup, /layered-stack-edge|hero-card|hot-template-card|guide-card|fun-text-demo-card/);
});

test('AI outfit entry opens an empty picker before requesting media', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  let chooseCount = 0;
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {
    chooseMedia() { chooseCount += 1; }
  });
  const page = instantiatePage(definition);

  page.onOpenOutfitPicker();

  assert.equal(page.data.step, 'confirm');
  assert.deepEqual(plain(page.data.pickedImages), []);
  assert.equal(chooseCount, 0);
});

test('AI outfit picker adds, resets and exits without mixing those actions', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  let chooseCount = 0;
  const picked = [{ tempFilePath: 'wxfile://picked-one.jpg' }];
  const definition = loadMiniProgramPage('miniprogram/pages/index/index.js', {
    '../../config/env': { ENABLE_FUN_TEXT_STACK_ENTRY: true },
    '../../utils/task': taskUtils,
    '../../utils/funTextProject': require('../miniprogram/utils/funTextProject.js')
  }, {
    chooseMedia(options) {
      chooseCount += 1;
      options.success({ tempFiles: picked });
    }
  });
  const page = instantiatePage(definition);

  page.onOpenOutfitPicker();
  page.onAddMedia();
  assert.equal(chooseCount, 1);
  assert.deepEqual(plain(page.data.pickedImages), picked);

  page.onResetPickedImages();
  assert.equal(page.data.step, 'confirm');
  assert.deepEqual(plain(page.data.pickedImages), []);
  assert.equal(chooseCount, 1);

  page.data.pickedImages = picked.slice();
  page.onRemoveImage({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(page.data.step, 'confirm');
  assert.deepEqual(plain(page.data.pickedImages), []);

  page.data.pickedImages = picked.slice();
  page.onBackToHome();
  assert.equal(page.data.step, 'home');
  assert.deepEqual(plain(page.data.pickedImages), []);
});

test('AI outfit picker renders a centered empty state and disables processing without images', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(markup, /class="confirm-back"[^>]*bindtap="onBackToHome"/);
  assert.match(markup, /wx:if="\{\{pickedImages\.length === 0\}\}"/);
  assert.match(markup, /class="picked-empty"/);
  assert.match(markup, /添加图片/);
  assert.match(markup, /bindtap="onResetPickedImages"/);
  assert.match(markup, /pickedImages\.length === 0 \? 'confirm-cta-disabled'/);
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

test('homepage layered preview uses one circular swiper per group and a vertical current list', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(markup, /class="layered-single-swiper"/);
  assert.match(markup, /circular="true"/);
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
