const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMiniProgramModule(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(filePath)) return {};
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  const localRequire = function (request) {
    if (!request.startsWith('.')) return require(request);
    const requestedPath = path.resolve(path.dirname(filePath), request);
    const withExtension = path.extname(requestedPath) ? requestedPath : `${requestedPath}.js`;
    return loadMiniProgramModule(path.relative(path.join(__dirname, '..'), withExtension));
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, console }, { filename: filePath });
  return module.exports;
}

const response = loadMiniProgramModule('miniprogram/utils/bigtextResponse.js');

test('renderer response must exactly match the requested three-card stack', () => {
  assert.equal(typeof response.validateRenderedCards, 'function');
  const cards = response.validateRenderedCards('生日', [
    { text: '生', role: 'content', order: 1, url: 'cloud://bigtext/1.png' },
    { text: '日', role: 'content', order: 2, url: 'cloud://bigtext/2.png' },
    { text: '继续滑 →', role: 'outro', order: 3, url: 'cloud://bigtext/3.png' }
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(cards.map((card) => [card.text, card.order]))), [
    ['生', 1],
    ['日', 2],
    ['继续滑 →', 3]
  ]);
});

test('renderer response rejects a card with the wrong character or missing URL', () => {
  assert.throws(() => response.validateRenderedCards('生日', [
    { text: '生', role: 'content', order: 1, url: 'cloud://bigtext/1.png' },
    { text: '错', role: 'content', order: 2, url: 'cloud://bigtext/2.png' },
    { text: '继续滑 →', role: 'outro', order: 3, url: '' }
  ]), /生成卡片不完整/);
});
