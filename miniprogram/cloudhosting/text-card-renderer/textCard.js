const THEMES = {
  'handwrite-paper': { key: 'handwrite-paper', background: '#FFFDF8', foreground: '#1D1A17', accent: '#B6252D' },
  'night-write': { key: 'night-write', background: '#171717', foreground: '#FFFFFF', accent: '#FFFFFF' },
  'violet-write': { key: 'violet-write', background: '#6A5AE0', foreground: '#FFFFFF', accent: '#FFF3A6' }
};

function normalizeSourceText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const count = Array.from(text).length;
  if (!count) throw new Error('请输入一句话');
  if (count > 20) throw new Error('最多输入 20 个字');
  return text;
}

function buildCardSpecs(value) {
  const chars = Array.from(normalizeSourceText(value));
  let cards;
  if (chars.length === 1) {
    cards = [{ text: '滑一下', role: 'intro' }, { text: chars[0], role: 'content' }, { text: '就这一个字', role: 'outro' }];
  } else if (chars.length === 2) {
    cards = [{ text: chars[0], role: 'content' }, { text: chars[1], role: 'content' }, { text: '继续滑 →', role: 'outro' }];
  } else {
    cards = chars.map((text) => ({ text, role: 'content' }));
  }
  return cards.map((card, index) => Object.assign({}, card, { order: index + 1 }));
}

function getTheme(key) {
  return THEMES[key] || THEMES['handwrite-paper'];
}

module.exports = { buildCardSpecs, getTheme, normalizeSourceText };
