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
  vm.runInNewContext(code, { module, exports: module.exports, require, console }, { filename: filePath });
  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const textCard = loadMiniProgramModule('miniprogram/utils/textCard.js');

test('one character gets fixed intro and outro cards', () => {
  assert.equal(typeof textCard.buildCardSpecs, 'function');
  assert.deepEqual(plain(textCard.buildCardSpecs('好')), [
    { text: '滑一下', role: 'intro', order: 1 },
    { text: '好', role: 'content', order: 2 },
    { text: '就这一个字', role: 'outro', order: 3 }
  ]);
});

test('two characters get a final swipe guide', () => {
  assert.deepEqual(plain(textCard.buildCardSpecs('生日')), [
    { text: '生', role: 'content', order: 1 },
    { text: '日', role: 'content', order: 2 },
    { text: '继续滑 →', role: 'outro', order: 3 }
  ]);
});

test('source text is trimmed, limited by Array.from, and falls back to the default theme', () => {
  assert.equal(textCard.normalizeSourceText('  好  '), '好');
  assert.equal(Array.from(textCard.normalizeSourceText('😀生日')).length, 3);
  assert.throws(() => textCard.normalizeSourceText(''), /请输入/);
  assert.throws(() => textCard.normalizeSourceText('一二三四五六七八九十一二三四五六七八九十一'), /20/);
  assert.equal(textCard.getTheme('missing').key, 'handwrite-paper');
});

test('default bigtext theme keeps its API key and uses the marker-card label', () => {
  const theme = textCard.getTheme('handwrite-paper');
  assert.equal(theme.key, 'handwrite-paper');
  assert.equal(theme.label, '马克笔白卡');
});

test('bigtext task accepts only renderer cards matching the requested stack', () => {
  assert.throws(() => textCard.buildBigtextTask({
    sourceText: '生日',
    renderedCards: [{ text: '生', order: 1, url: 'cloud://1.png' }]
  }), /不完整/);
});
