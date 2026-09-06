// 微信预览页的图片消息通道与比例计算：纯函数，供页面和 Node 测试共同使用。
var RATIO_ASPECT = {
  '1:1': 1,
  '4:5': 0.8,
  '3:4': 0.75
};

var STACK_POSES = {
  'pos-front': { x: 0, rotate: 0, scale: 1 },
  'pos-g1': { x: -8, rotate: -0.7, scale: 0.97 },
  'pos-g2': { x: 10, rotate: 1, scale: 0.94 }
};

var ROTATE_LEFT = { 'pos-front': 'pos-g2', 'pos-g1': 'pos-front', 'pos-g2': 'pos-g1' };
var ROTATE_RIGHT = { 'pos-front': 'pos-g1', 'pos-g1': 'pos-g2', 'pos-g2': 'pos-front' };

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
  // 预留：页面左右边距 20、头像 36、头像间距 8、展开胶囊 58、胶囊间距 10、牌堆露边 10。
  // 微信真实叠图的正面卡约占屏宽 38%，而不是上一版的 60%；窄屏仍优先保证整行完整。
  var messageLaneWidth = Math.max(120, Math.round(safeWindowWidth - 142));
  var stageWidth = Math.min(164, Math.round(safeWindowWidth * 0.38), messageLaneWidth);
  var ratio = resolvePreviewRatio(card, fallbackRatio);
  var aspect = getAspect(card, ratio, fallbackRatio);
  // 微信折叠叠图中的穿搭缩略卡使用更接近 3:4 的展示框；大图预览仍展示完整原图。
  if (ratio === '4:5') aspect = 0.75;
  if (!(aspect > 0) || !isFinite(aspect)) aspect = 1;
  var maxHeight = Math.min(219, Math.round(safeWindowWidth * 0.51));
  var width = stageWidth;
  var height = Math.round(width / aspect);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * aspect);
  }

  var stageHeight = height;

  return {
    ratio: ratio,
    stageWidth: stageWidth,
    stageHeight: stageHeight,
    cardWidth: width,
    cardHeight: height,
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMotion(value) {
  return Math.round(value * 100) / 100;
}

function resolveGestureAxis(dx, dy, lockPx) {
  var threshold = Number(lockPx) > 0 ? Number(lockPx) : 8;
  var ax = Math.abs(Number(dx) || 0);
  var ay = Math.abs(Number(dy) || 0);
  if (ax <= threshold && ay <= threshold) return null;
  if (ax > ay * 1.15) return 'h';
  if (ay > ax * 1.05) return 'v';
  return null;
}

function resolveSwipeDecision(dx, velocity, stageWidth) {
  var distance = Number(dx) || 0;
  var speed = Number(velocity) || 0;
  var width = Number(stageWidth) > 0 ? Number(stageWidth) : 143;
  var passedDistance = Math.abs(distance) > width * 0.2;
  var deliberateFlick = Math.abs(distance) >= 10 && Math.abs(speed) > 0.32;
  if (!passedDistance && !deliberateFlick) return 0;
  var projected = distance + speed * 90;
  if (Math.abs(projected) < 1) projected = distance;
  return projected < 0 ? -1 : 1;
}

function targetPosition(pos, dir, nodeCount) {
  if (nodeCount === 2) return pos === 'pos-front' ? 'pos-g1' : 'pos-front';
  var map = dir < 0 ? ROTATE_LEFT : ROTATE_RIGHT;
  return map[pos] || pos;
}

function motionStyle(x, rotate, scale, opacity) {
  return 'transform: translateX(' + roundMotion(x) + 'px) rotate(' + roundMotion(rotate) + 'deg) scale(' + roundMotion(scale) + '); opacity: ' + opacity + ';';
}

function buildStackPositionStyle(pos, opacity) {
  var pose = STACK_POSES[pos] || STACK_POSES['pos-front'];
  return motionStyle(pose.x, pose.rotate, pose.scale, opacity == null ? 1 : opacity);
}

function buildStackMotionStyles(nodes, frontIdx, dx, stageWidth, settling) {
  var source = Array.isArray(nodes) ? nodes : [];
  var width = Number(stageWidth) > 0 ? Number(stageWidth) : 143;
  var rawDistance = Number(dx) || 0;
  var dir = rawDistance < 0 ? -1 : 1;
  var distance = clamp(rawDistance, -width * 1.15, width * 1.15);
  var progress = settling ? 1 : clamp(Math.abs(distance) / (width * 0.75), 0, 1);

  return source.map(function (node, index) {
    var pos = node && node.pos ? node.pos : 'pos-front';
    if (index === frontIdx || pos === 'pos-front') {
      if (settling) {
        return motionStyle(Math.round(dir * width * 1.12), dir * 9, 1, 0);
      }
      return motionStyle(distance, clamp(distance * 0.025, -5, 5), 1, 1);
    }

    var from = STACK_POSES[pos] || STACK_POSES['pos-front'];
    var nextPos = targetPosition(pos, dir, source.length);
    var to = STACK_POSES[nextPos] || from;
    return motionStyle(
      from.x + (to.x - from.x) * progress,
      from.rotate + (to.rotate - from.rotate) * progress,
      from.scale + (to.scale - from.scale) * progress,
      1
    );
  });
}

module.exports = {
  resolvePreviewRatio: resolvePreviewRatio,
  buildPreviewStage: buildPreviewStage,
  orderCardsFromFront: orderCardsFromFront,
  resolveGestureAxis: resolveGestureAxis,
  resolveSwipeDecision: resolveSwipeDecision,
  buildStackPositionStyle: buildStackPositionStyle,
  buildStackMotionStyles: buildStackMotionStyles
};
