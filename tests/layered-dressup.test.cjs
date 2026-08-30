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
