var assetRegistry = require('../config/assetRegistry');
var stylePacks = require('../config/stylePacks');

var CANVAS_SIZE = 1080;
var FONT_FAMILY = 'LXGWMarkerGothic';

function assetIsRegistered(layer) {
  var asset = assetRegistry.getAsset(layer.assetKey);
  return asset && asset.type === layer.type;
}

function effectIsRegistered(layer) {
  return stylePacks.TEXT_EFFECT_KEYS.indexOf(layer.effectKey) >= 0;
}

function drawHeart(context) {
  context.beginPath();
  context.moveTo(0, 18);
  context.bezierCurveTo(-32, -8, -20, -35, 0, -14);
  context.bezierCurveTo(20, -35, 32, -8, 0, 18);
  context.closePath();
  context.stroke();
}

function drawProceduralAsset(context, layer) {
  context.save();
  context.strokeStyle = '#171717';
  context.fillStyle = '#F35C8C';
  context.lineWidth = 8;
  if (layer.assetKey === 'heart-outline') {
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
  } else {
    context.beginPath();
    context.moveTo(-20, -20);
    context.lineTo(20, -20);
    context.lineTo(26, 12);
    context.lineTo(0, 30);
    context.lineTo(-26, 12);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function paintText(context, layer, ratio) {
  if (!effectIsRegistered(layer)) return;
  var lines = Array.isArray(layer.lines) ? layer.lines : [];
  if (!lines.length) return;
  context.save();
  context.translate(layer.x * ratio, layer.y * ratio);
  context.rotate((layer.rotation || 0) * Math.PI / 180);
  context.scale(layer.scale || 1, layer.scale || 1);
  context.fillStyle = layer.color;
  context.font = String(layer.fontSize * ratio) + 'px ' + FONT_FAMILY;
  context.textAlign = layer.align || 'center';
  context.textBaseline = 'middle';
  var offset = (lines.length - 1) * layer.lineHeight * ratio / 2;
  lines.forEach(function (line, index) {
    context.fillText(line, 0, index * layer.lineHeight * ratio - offset);
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
