const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMiniProgramModule(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console
  };

  vm.runInNewContext(code, sandbox, { filename: filePath });
  return module.exports;
}

const {
  calculateTargetSize,
  createMockTask,
  buildSendability,
  normalizeTaskGroups,
  isCloudPermissionError
} = loadMiniProgramModule('miniprogram/utils/task.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('calculateTargetSize keeps images within the max side without upscaling', () => {
  assert.deepEqual(plain(calculateTargetSize(800, 600, 1600)), {
    width: 800,
    height: 600,
    scale: 1
  });

  assert.deepEqual(plain(calculateTargetSize(4000, 3000, 1600)), {
    width: 1600,
    height: 1200,
    scale: 0.4
  });

  assert.deepEqual(plain(calculateTargetSize(1200, 3000, 1600)), {
    width: 640,
    height: 1600,
    scale: 0.5333333333333333
  });
});

test('createMockTask groups first 3 images as tops, next 3 as bottoms, next 3 as shoes', () => {
  const images = Array.from({ length: 9 }, (_, index) => ({
    imageId: `image_${index + 1}`,
    localPath: `/tmp/image_${index + 1}.jpg`,
    fileId: `cloud://image_${index + 1}.jpg`,
    width: 1200,
    height: 1600
  }));

  const task = createMockTask(images, 1720000000000);

  assert.equal(task.taskId, 'mock_1720000000000');
  assert.equal(task.status, 'done');
  assert.equal(task.results.length, 9);
  assert.equal(task.groups.tops.length, 3);
  assert.equal(task.groups.bottoms.length, 3);
  assert.equal(task.groups.shoes.length, 3);
  assert.equal(task.groups.others.length, 0);
  assert.equal(task.groups.tops[0].label, '上衣 1');
  assert.equal(task.groups.bottoms[0].label, '下装 1');
  assert.equal(task.groups.shoes[0].label, '鞋子 1');
  assert.equal(task.sendability.groups.tops.mode, 'stackable');
  assert.equal(task.sendability.groups.bottoms.mode, 'stackable');
  assert.equal(task.sendability.groups.shoes.mode, 'stackable');
});

test('buildSendability flags total-enough uploads whose classified groups are all below stack threshold', () => {
  const groups = {
    tops: [{ resultId: 't1' }, { resultId: 't2' }],
    bottoms: [{ resultId: 'b1' }, { resultId: 'b2' }],
    shoes: [{ resultId: 's1' }, { resultId: 's2' }],
    others: []
  };

  const sendability = buildSendability(groups);

  assert.equal(sendability.groups.tops.mode, 'normal');
  assert.equal(sendability.groups.bottoms.mode, 'normal');
  assert.equal(sendability.groups.shoes.mode, 'normal');
  assert.equal(sendability.summary.totalProcessableCount, 6);
  assert.equal(sendability.summary.hasStackableGroup, false);
  assert.equal(sendability.summary.allFilledGroupsBelowThreshold, true);
  assert.match(sendability.summary.message, /每组补到 3 张以上/);
});

test('normalizeTaskGroups supports string arrays, object arrays, and unprocessed alias', () => {
  const groups = normalizeTaskGroups({
    tops: ['cloud://top.jpg'],
    bottoms: [{ url: 'cloud://bottom.jpg', resultId: 'existing' }],
    shoes: [],
    unprocessed: ['cloud://other.jpg']
  });

  assert.equal(groups.tops[0].url, 'cloud://top.jpg');
  assert.equal(groups.tops[0].label, '上衣 1');
  assert.equal(groups.bottoms[0].resultId, 'existing');
  assert.equal(groups.bottoms[0].label, '下装 1');
  assert.equal(groups.others[0].url, 'cloud://other.jpg');
  assert.equal(groups.others[0].label, '素材 1');
});

test('isCloudPermissionError detects unopened CloudBase permission failures', () => {
  assert.equal(
    isCloudPermissionError({ errMsg: 'cloud.uploadFile:fail 没有权限，请先开通云开发或者云托管' }),
    true
  );
  assert.equal(isCloudPermissionError(new Error('当前项目未启用云开发')), true);
  assert.equal(isCloudPermissionError(new Error('network timeout')), false);
});
