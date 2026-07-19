// 微信预览页的稳定舞台与图片比例计算：纯函数，供页面和 Node 测试共同使用。
var RATIO_ASPECT = {
  '1:1': 1,
  '4:5': 0.8,
  '3:4': 0.75
};

function resolvePreviewRatio(card, fallbackRatio) {
  if (card && RATIO_ASPECT[card.composedRatio]) return card.composedRatio;
  if (card && RATIO_ASPECT[card.ratio]) return card.ratio;
  if (card && card.width > 0 && card.height > 0) return 'source';
  if (RATIO_ASPECT[fallbackRatio]) return fallbackRatio;
  return 'source';
}

function getAspect(card, ratio, fallbackRatio) {
  if (RATIO_ASPECT[ratio]) return RATIO_ASPECT[ratio];
  if (card && card.width > 0 && card.height > 0) return card.width / card.height;
  return RATIO_ASPECT[fallbackRatio] || 1;
}

function buildPreviewStage(card, fallbackRatio, windowWidth) {
  var safeWindowWidth = Number(windowWidth) > 0 ? Number(windowWidth) : 375;
  var stageWidth = Math.round(safeWindowWidth * 0.54);
  var stageHeight = Math.min(150, Math.round(stageWidth * 0.74));
  var ratio = resolvePreviewRatio(card, fallbackRatio);
  var aspect = getAspect(card, ratio, fallbackRatio);
  var width = stageWidth;
  var height = Math.round(width / aspect);

  if (height > stageHeight) {
    height = stageHeight;
    width = Math.round(height * aspect);
  }

  return {
    ratio: ratio,
    stageWidth: stageWidth,
    stageHeight: stageHeight,
    cardStyle: 'width: ' + width + 'px; height: ' + height + 'px;'
  };
}

function orderCardsFromFront(cards, nodes, frontIdx) {
  var sourceCards = Array.isArray(cards) ? cards : [];
  var sourceNodes = Array.isArray(nodes) ? nodes : [];
  var frontNode = sourceNodes[frontIdx];
  if (!frontNode || !frontNode.num) return sourceCards.slice();
  var start = sourceCards.findIndex(function (card) { return card && card.num === frontNode.num; });
  if (start < 0) return sourceCards.slice();
  return sourceCards.slice(start).concat(sourceCards.slice(0, start));
}

module.exports = {
  resolvePreviewRatio: resolvePreviewRatio,
  buildPreviewStage: buildPreviewStage,
  orderCardsFromFront: orderCardsFromFront
};
