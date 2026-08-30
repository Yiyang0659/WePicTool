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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const registry = loadMiniProgramModule('miniprogram/config/playRegistry.js');
const dressup = loadMiniProgramModule('miniprogram/utils/layeredDressup.js', {
  '../config/playRegistry': registry
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
