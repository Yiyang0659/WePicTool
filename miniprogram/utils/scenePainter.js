var assetRegistry = require('../config/assetRegistry');
var stylePacks = require('../config/stylePacks');
var fontFeels = require('../config/fontFeels');
var decorationColors = require('../config/decorationColors');

var CANVAS_SIZE = 1080;

function assetIsRegistered(layer) {
  var asset = assetRegistry.getAsset(layer.assetKey);
  var colorIsRegistered = !layer.decorationColorKey || decorationColors.getDecorationColor(layer.decorationColorKey);
  return asset && asset.type === layer.type && colorIsRegistered;
}

function effectIsRegistered(layer) {
  return stylePacks.TEXT_EFFECT_KEYS.indexOf(layer.effectKey) >= 0;
}

function fontIsRegistered(layer) {
  var feel = fontFeels.getFontFeel(layer.fontKey || 'marker');
  return feel && (!layer.fontFamily || layer.fontFamily === feel.fontFamily);
}

function drawHeart(context, paint) {
  context.beginPath();
  context.moveTo(0, 18);
  context.bezierCurveTo(-32, -8, -20, -35, 0, -14);
  context.bezierCurveTo(20, -35, 32, -8, 0, 18);
  context.closePath();
  if (paint === 'fill') context.fill();
  else context.stroke();
}

function drawPolygon(context, points) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(function (point) {
    context.lineTo(point[0], point[1]);
  });
  context.closePath();
}

function drawStickerHeart(context) {
  drawHeart(context, 'fill');
}

function drawStickerFlower(context) {
  context.beginPath();
  [[0, -19], [18, -6], [11, 15], [-11, 15], [-18, -6]].forEach(function (point) {
    context.arc(point[0], point[1], 15, 0, Math.PI * 2);
  });
  context.fill();
}

function drawStickerStar(context) {
  var points = [];
  for (var index = 0; index < 10; index += 1) {
    var angle = -Math.PI / 2 + index * Math.PI / 5;
    var radius = index % 2 === 0 ? 38 : 17;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  drawPolygon(context, points);
  context.fill();
}

function drawStickerFace(context) {
  context.beginPath();
  context.arc(0, 0, 36, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(-12, -5, 3, 0, Math.PI * 2);
  context.arc(12, -5, 3, 0, Math.PI * 2);
  context.stroke();
}

function drawStickerSparkle(context) {
  drawPolygon(context, [[0, -42], [9, -10], [38, 0], [9, 10], [0, 42], [-9, 10], [-38, 0], [-9, -10]]);
  context.fill();
}

function drawStickerRibbon(context) {
  drawPolygon(context, [[-30, -22], [30, -22], [22, 28], [-22, 28]]);
  context.fill();
  context.beginPath();
  context.moveTo(-25, 0);
  context.lineTo(25, 0);
  context.stroke();
}

function drawStickerLightning(context) {
  drawPolygon(context, [[-12, -42], [28, -42], [3, -4], [26, -4], [-28, 42]]);
  context.fill();
}

function drawStickerCloud(context) {
  context.beginPath();
  context.arc(-22, 7, 18, 0, Math.PI * 2);
  context.arc(0, -4, 25, 0, Math.PI * 2);
  context.arc(24, 8, 17, 0, Math.PI * 2);
  context.fill();
}

function drawStickerExclamation(context) {
  context.beginPath();
  context.moveTo(0, -34);
  context.lineTo(0, 12);
  context.stroke();
  context.beginPath();
  context.arc(0, 29, 5, 0, Math.PI * 2);
  context.fill();
}

function drawStickerSun(context) {
  context.beginPath();
  context.arc(0, 0, 19, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  [[0, -42, 0, -29], [42, 0, 29, 0], [0, 42, 0, 29], [-42, 0, -29, 0]].forEach(function (ray) {
    context.moveTo(ray[0], ray[1]);
    context.lineTo(ray[2], ray[3]);
  });
  context.stroke();
}

function drawStickerBalloon(context) {
  context.beginPath();
  context.bezierCurveTo(-30, -36, 30, -36, 24, 2);
  context.bezierCurveTo(18, 35, -18, 35, -24, 2);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(0, 34);
  context.lineTo(-8, 62);
  context.stroke();
}

function drawStickerGift(context) {
  context.fillRect(-35, -20, 70, 55);
  context.fillRect(-4, -20, 8, 55);
  context.fillRect(-40, -29, 80, 12);
  context.fillRect(-28, -40, 56, 12);
  drawPolygon(context, [[0, -29], [22, -48], [28, -27]]);
  context.fill();
}

var STICKER_DRAWERS = {
  sticker_0: drawStickerHeart,
  sticker_1: drawStickerFlower,
  sticker_2: drawStickerStar,
  sticker_3: drawStickerFace,
  sticker_4: drawStickerSparkle,
  sticker_5: drawStickerRibbon,
  sticker_6: drawStickerLightning,
  sticker_7: drawStickerCloud,
  sticker_8: drawStickerExclamation,
  sticker_9: drawStickerSun,
  sticker_10: drawStickerBalloon,
  sticker_11: drawStickerGift
};

function drawProceduralAsset(context, layer) {
  var paint = decorationColors.getDecorationPaint(layer);
  context.save();
  context.strokeStyle = paint.stroke;
  context.fillStyle = paint.fill;
  context.lineWidth = 8;
  if (STICKER_DRAWERS[layer.assetKey]) {
    STICKER_DRAWERS[layer.assetKey](context);
  } else if (layer.assetKey === 'heart-outline') {
    drawHeart(context);
  } else if (layer.assetKey === 'arrow-curve') {
    context.beginPath();
    context.moveTo(-44, 24);
    context.bezierCurveTo(-10, -35, 34, -30, 32, 5);
    context.lineTo(15, -8);
    context.moveTo(32, 5);
    context.lineTo(11, 11);
    context.stroke();
  } else if (layer.assetKey === 'circle-mark') {
    context.beginPath();
    context.bezierCurveTo(-42, -25, 30, -42, 45, 2);
    context.bezierCurveTo(22, 44, -50, 34, -42, -25);
    context.stroke();
  } else if (layer.assetKey === 'underline-rough') {
    context.beginPath();
    context.moveTo(-54, 0);
    context.bezierCurveTo(-12, 10, 15, -9, 56, 1);
    context.stroke();
  } else if (layer.assetKey === 'scribble-cross') {
    context.beginPath();
    context.moveTo(-36, -36);
    context.lineTo(36, 36);
    context.moveTo(36, -36);
    context.lineTo(-36, 36);
    context.stroke();
  } else if (layer.assetKey === 'burst-lines') {
    for (var index = 0; index < 12; index += 1) {
      var angle = Math.PI * 2 * index / 12;
      context.beginPath();
      context.moveTo(Math.cos(angle) * 38, Math.sin(angle) * 38);
      context.lineTo(Math.cos(angle) * 72, Math.sin(angle) * 72);
      context.stroke();
    }
  }
  context.restore();
}

function paintText(context, layer, ratio) {
  if (!effectIsRegistered(layer) || !fontIsRegistered(layer)) return;
  var lines = Array.isArray(layer.lines) ? layer.lines : [];
  if (!lines.length) return;
  context.save();
  context.translate(layer.x * ratio, layer.y * ratio);
  context.rotate((layer.rotation || 0) * Math.PI / 180);
  context.scale(layer.scale || 1, layer.scale || 1);
  var feel = fontFeels.getFontFeel(layer.fontKey || 'marker');
  context.font = String(layer.fontSize * ratio) + 'px ' + feel.fontFamily;
  context.textAlign = layer.align || 'center';
  context.textBaseline = 'middle';
  var offset = (lines.length - 1) * layer.lineHeight * ratio / 2;
  lines.forEach(function (line, index) {
    var y = index * layer.lineHeight * ratio - offset;
    if (layer.effectKey === 'marker-bold') {
      context.strokeStyle = layer.color;
      context.lineWidth = Math.max(2, layer.fontSize * ratio * 0.075);
      context.strokeText(line, 0, y);
      context.fillStyle = layer.color;
      context.fillText(line, 0, y);
    } else if (layer.effectKey === 'chalk-rough') {
      context.fillStyle = layer.color;
      context.fillText(line, -1.5 * ratio, y + ratio);
      context.fillText(line, 1.5 * ratio, y - ratio);
      context.fillText(line, 0, y);
    } else if (layer.effectKey === 'collage-cutout') {
      var width = Math.max(layer.fontSize * ratio, Array.from(line).length * layer.fontSize * ratio * 1.08);
      var height = layer.lineHeight * ratio * 0.78;
      context.fillStyle = '#FFFDF7';
      context.fillRect(-width / 2, y - height / 2, width, height);
      context.fillStyle = layer.color;
      context.fillText(line, 0, y);
    } else if (layer.effectKey === 'stamp-shadow') {
      context.fillStyle = '#8F4562';
      context.fillText(line, 5 * ratio, y + 5 * ratio);
      context.fillStyle = layer.color;
      context.fillText(line, 0, y);
    }
  });
  context.restore();
}

function paintAsset(context, layer, ratio, drawAsset) {
  if (!assetIsRegistered(layer)) return;
  context.save();
  context.translate(layer.x * ratio, layer.y * ratio);
  context.rotate((layer.rotation || 0) * Math.PI / 180);
  context.scale((layer.scale || 1) * ratio, (layer.scale || 1) * ratio);
  (drawAsset || drawProceduralAsset)(context, layer);
  context.restore();
}

function paintScene(context, scene, size, dependencies) {
  if (!context || !scene || scene.width !== CANVAS_SIZE || scene.height !== CANVAS_SIZE) {
    throw new Error('场景必须为 1080 方图');
  }
  var previewSize = Number(size);
  if (!Number.isFinite(previewSize) || previewSize <= 0) throw new Error('预览尺寸必须大于 0');
  var ratio = previewSize / CANVAS_SIZE;
  context.fillStyle = scene.background && scene.background.color;
  context.fillRect(0, 0, previewSize, previewSize);
  (scene.layers || []).forEach(function (layer) {
    if (layer.type === 'text') {
      paintText(context, layer, ratio);
    } else if (layer.type === 'sticker' || layer.type === 'doodle') {
      paintAsset(context, layer, ratio, dependencies && dependencies.drawAsset);
    }
  });
}

module.exports = {
  paintScene: paintScene
};
