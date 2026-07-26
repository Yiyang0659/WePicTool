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
    const requested = path.resolve(path.dirname(filePath), request);
    const target = path.extname(requested) ? requested : `${requested}.js`;
    return loadMiniProgramModule(path.relative(path.join(__dirname, '..'), target));
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire }, { filename: filePath });
  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const markerCard = loadMiniProgramModule('miniprogram/utils/markerCard.js');

test('marker style remains stable for the same task and card', () => {
  assert.equal(typeof markerCard.buildMarkerCardStyle, 'function');
  const input = { taskId: 'text_20260726_abcdef', order: 2, role: 'content', text: '今' };
  assert.deepEqual(plain(markerCard.buildMarkerCardStyle(input)), plain(markerCard.buildMarkerCardStyle(input)));
});

test('marker style keeps irregularity inside the readable limits', () => {
  const style = markerCard.buildMarkerCardStyle({
    taskId: 'text_20260726_abcdef', order: 3, role: 'content', text: '心'
  });
  assert.ok(style.rotation >= -3 && style.rotation <= 3);
  assert.ok(style.scale >= 0.94 && style.scale <= 1.06);
  assert.ok(Math.abs(style.offsetX) <= 42 && Math.abs(style.offsetY) <= 42);
  assert.ok(['top-right', 'bottom-right'].includes(style.stickerCorner));
  assert.match(style.stickerKey, /^sticker_(?:[0-9]|1[01])$/);
});

test('preview cards keep their text and receive a CSS-safe transform', () => {
  assert.equal(typeof markerCard.buildMarkerPreviewCards, 'function');
  const cards = markerCard.buildMarkerPreviewCards({
    taskId: 'draft_marker_preview',
    cards: [{ text: '今', role: 'content', order: 1 }]
  });
  assert.equal(cards[0].text, '今');
  assert.match(cards[0].previewStyle, /^transform: translate\(-?\d+(?:\.\d+)?rpx, -?\d+(?:\.\d+)?rpx\) rotate\(-?\d+(?:\.\d+)?deg\) scale\(\d+(?:\.\d+)?\);$/);
});
