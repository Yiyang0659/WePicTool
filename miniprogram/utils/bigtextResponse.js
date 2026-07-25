const { buildCardSpecs } = require('./textCard');

function validateRenderedCards(sourceText, renderedCards) {
  const specs = buildCardSpecs(sourceText);
  const cards = Array.isArray(renderedCards) ? renderedCards : [];
  const matches = cards.length === specs.length && cards.every((card, index) => {
    const spec = specs[index];
    return card && card.text === spec.text && card.role === spec.role && card.order === spec.order && card.url;
  });

  if (!matches) {
    throw new Error('生成卡片不完整，请重试');
  }

  return cards.map((card, index) => Object.assign({}, specs[index], card));
}

module.exports = { validateRenderedCards };
