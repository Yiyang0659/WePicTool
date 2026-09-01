const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('every built-in asset exists and the project-owned head cards are 640 square PNGs', () => {
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
    assert.deepEqual(Array.from(data.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(data.readUInt32BE(16), 640);
    assert.equal(data.readUInt32BE(20), 640);
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
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const command = packageJson.scripts['check:syntax'];

  assert.match(command, /miniprogram\/config\/playRegistry\.js/);
  assert.match(command, /miniprogram\/utils\/layeredDressup\.js/);
  assert.match(command, /miniprogram\/pages\/dressup\/dressup\.js/);
});

test('homepage flagship actions navigate to demo and upload dressup modes', () => {
  const taskUtils = loadMiniProgramModule('miniprogram/utils/task.js');
  const urls = [];
  const page = loadMiniProgramPage('miniprogram/pages/index/index.js', {
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
  assert.equal(page.data.comingModules.some(item => item.key === 'suit'), false);
  assert.equal(page.data.comingModules.some(item => item.key === 'dressup'), false);
});

test('homepage explains the four-stack effect and keeps the existing AI outfit entry', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/index/index.wxml'), 'utf8');

  assert.match(markup, /四个部位独立滑动/);
  assert.match(markup, /bindtap="onTryLayeredDemo"/);
  assert.match(markup, /bindtap="onCreateLayeredDressup"/);
  assert.match(markup, /抽象搞怪/);
  assert.match(markup, /bindtap="onChooseMedia"/);
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
    '../../utils/imageExporter': require('../miniprogram/utils/imageExporter.js')
  }, {
    getStorageSync() { return demoDraft; }
  });
  const page = instantiatePage(definition);

  page.onLoad({ mode: 'upload' });

  assert.equal(page.data.project.sourceMode, 'upload');
  assert.equal(page.data.groupList.every(group => group.count === 0), true);
});
