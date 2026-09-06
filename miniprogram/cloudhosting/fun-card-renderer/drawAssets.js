'use strict';

const decorationColors = require('./decorationColors');

function drawHeart(context, fill) {
  context.beginPath();
  context.moveTo(0, 18);
  context.bezierCurveTo(-32, -8, -20, -35, 0, -14);
  context.bezierCurveTo(20, -35, 32, -8, 0, 18);
  context.closePath();
  if (fill) context.fill();
  else context.stroke();
}

function drawPolygon(context, points) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach((point) => context.lineTo(point[0], point[1]));
  context.closePath();
}

const STICKER_DRAWERS = {
  sticker_0(context) {
    drawHeart(context, true);
  },
  sticker_1(context) {
    context.beginPath();
    [[0, -19], [18, -6], [11, 15], [-11, 15], [-18, -6]].forEach((point) => {
      context.arc(point[0], point[1], 15, 0, Math.PI * 2);
    });
    context.fill();
  },
  sticker_2(context) {
    const points = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 === 0 ? 38 : 17;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    drawPolygon(context, points);
    context.fill();
  },
  sticker_3(context) {
    context.beginPath();
    context.arc(0, 0, 36, 0, Math.PI * 2);
    context.fill();
    // Separate eye paths avoid the known connector stroke between two arcs.
    [-12, 12].forEach((x) => {
      context.beginPath();
      context.arc(x, -5, 3, 0, Math.PI * 2);
      context.stroke();
    });
  },
  sticker_4(context) {
    drawPolygon(context, [[0, -42], [9, -10], [38, 0], [9, 10], [0, 42], [-9, 10], [-38, 0], [-9, -10]]);
    context.fill();
  },
  sticker_5(context) {
    drawPolygon(context, [[-30, -22], [30, -22], [22, 28], [-22, 28]]);
    context.fill();
    context.beginPath();
    context.moveTo(-25, 0);
    context.lineTo(25, 0);
    context.stroke();
  },
  sticker_6(context) {
    drawPolygon(context, [[-12, -42], [28, -42], [3, -4], [26, -4], [-28, 42]]);
    context.fill();
  },
  sticker_7(context) {
    context.beginPath();
    context.arc(-22, 7, 18, 0, Math.PI * 2);
    context.arc(0, -4, 25, 0, Math.PI * 2);
    context.arc(24, 8, 17, 0, Math.PI * 2);
    context.fill();
  },
  sticker_8(context) {
    context.beginPath();
    context.moveTo(0, -34);
    context.lineTo(0, 12);
    context.stroke();
    context.beginPath();
    context.arc(0, 29, 5, 0, Math.PI * 2);
    context.fill();
  },
  sticker_9(context) {
    context.beginPath();
    context.arc(0, 0, 19, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    [[0, -42, 0, -29], [42, 0, 29, 0], [0, 42, 0, 29], [-42, 0, -29, 0]].forEach((ray) => {
      context.moveTo(ray[0], ray[1]);
      context.lineTo(ray[2], ray[3]);
    });
    context.stroke();
  },
  sticker_10(context) {
    context.beginPath();
    context.bezierCurveTo(-30, -36, 30, -36, 24, 2);
    context.bezierCurveTo(18, 35, -18, 35, -24, 2);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(0, 34);
    context.lineTo(-8, 62);
    context.stroke();
  },
  sticker_11(context) {
    context.fillRect(-35, -20, 70, 55);
    context.fillRect(-4, -20, 8, 55);
    context.fillRect(-40, -29, 80, 12);
    context.fillRect(-28, -40, 56, 12);
    drawPolygon(context, [[0, -29], [22, -48], [28, -27]]);
    context.fill();
  }
};

function drawProceduralAsset(context, layer) {
  const paint = decorationColors.getDecorationPaint(layer);
  context.save();
  context.strokeStyle = paint.stroke;
  context.fillStyle = paint.fill;
  context.lineWidth = 8;
  const sticker = STICKER_DRAWERS[layer.assetKey];
  if (sticker) {
    sticker(context);
  } else if (layer.assetKey === 'heart-outline') {
    drawHeart(context, false);
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
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI * 2 * index / 12;
      context.beginPath();
      context.moveTo(Math.cos(angle) * 38, Math.sin(angle) * 38);
      context.lineTo(Math.cos(angle) * 72, Math.sin(angle) * 72);
      context.stroke();
    }
  }
  context.restore();
}

module.exports = { drawProceduralAsset };
