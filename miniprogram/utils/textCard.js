const THEMES = {
  'handwrite-paper': {
    key: 'handwrite-paper',
    label: '手写纸卡',
    background: '#FFFDF8',
    foreground: '#1D1A17',
    accent: '#B6252D'
  },
  'night-write': {
    key: 'night-write',
    label: '夜写',
    background: '#171717',
    foreground: '#FFFFFF',
    accent: '#FFFFFF'
  },
  'violet-write': {
    key: 'violet-write',
    label: '蓝紫手写',
    background: '#6A5AE0',
    foreground: '#FFFFFF',
    accent: '#FFF3A6'
  }
};

function normalizeSourceText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!Array.from(text).length) throw new Error('请输入一句话');
  if (Array.from(text).length > 20) throw new Error('最多输入 20 个字');
  return text;
}

function buildCardSpecs(value) {
  const chars = Array.from(normalizeSourceText(value));
  let cards;

  if (chars.length === 1) {
    cards = [
      { text: '滑一下', role: 'intro' },
      { text: chars[0], role: 'content' },
      { text: '就这一个字', role: 'outro' }
    ];
  } else if (chars.length === 2) {
    cards = [
      { text: chars[0], role: 'content' },
      { text: chars[1], role: 'content' },
      { text: '继续滑 →', role: 'outro' }
    ];
  } else {
    cards = chars.map((text) => ({ text, role: 'content' }));
  }

  return cards.map((card, index) => Object.assign({}, card, { order: index + 1 }));
}

function getTheme(key) {
  return THEMES[key] || THEMES['handwrite-paper'];
}

function buildBigtextTask(input) {
  const options = input || {};
  const sourceText = normalizeSourceText(options.sourceText);
  const specs = buildCardSpecs(sourceText);
  const renderedCards = Array.isArray(options.renderedCards) ? options.renderedCards : [];

  if (renderedCards.length !== specs.length || renderedCards.some((card, index) => {
    const spec = specs[index];
    return !card || card.text !== spec.text || card.order !== spec.order || !card.url;
  })) {
    throw new Error('生成卡片不完整，请重试');
  }

  const createdAt = options.createdAt || Date.now();
  return {
    taskId: options.taskId || `text_${createdAt}`,
    mode: 'bigtext',
    type: 'bigtext',
    status: 'done',
    sourceText,
    themeKey: getTheme(options.themeKey).key,
    cards: renderedCards.map((card, index) => Object.assign({}, specs[index], card, {
      cardId: card.cardId || `card_${index + 1}`
    })),
    createdAt
  };
}

module.exports = {
  THEMES,
  normalizeSourceText,
  buildCardSpecs,
  getTheme,
  buildBigtextTask
};
