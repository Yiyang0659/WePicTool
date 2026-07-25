const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMiniProgramModule(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports }, { filename: filePath });
  return module.exports;
}

const previewLayout = loadMiniProgramModule('miniprogram/utils/previewLayout.js');

test('bigtext preview maps valid cards into one square card group', () => {
  assert.equal(typeof previewLayout.buildBigtextPreviewGroups, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(previewLayout.buildBigtextPreviewGroups({
    mode: 'bigtext',
    cards: [{ url: 'cloud://one.png' }, { url: 'cloud://two.png' }, { url: 'cloud://three.png' }]
  }))), [{
    name: '大字滑卡',
    cards: [{ url: 'cloud://one.png' }, { url: 'cloud://two.png' }, { url: 'cloud://three.png' }]
  }]);
});

test('bigtext preview drops cards with no usable URL', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(previewLayout.buildBigtextPreviewGroups({
    mode: 'bigtext',
    cards: [{ url: '' }, {}, { url: 'cloud://three.png' }]
  }))), [{
    name: '大字滑卡',
    cards: [{ url: 'cloud://three.png' }]
  }]);
});
