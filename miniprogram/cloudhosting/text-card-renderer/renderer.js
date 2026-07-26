const path = require('node:path');
const { buildMarkerCardStyle } = require('./markerCard');
const { drawSticker } = require('./stickers');

const CARD_SIZE = 1080;

function createCardRenderer(dependencies) {
  const deps = dependencies || {};
  const makePng = deps.makePng;
  const uploadBuffer = deps.uploadBuffer;
  const deleteFile = deps.deleteFile;

  return async function renderCards(specs, theme, taskId) {
    const uploaded = [];
    try {
      for (let index = 0; index < specs.length; index += 1) {
        const spec = Object.assign({}, specs[index], { total: specs.length });
        const buffer = await makePng(spec, theme, taskId);
        const stored = await uploadBuffer(buffer, spec, taskId);
        if (!stored || !stored.fileId || !stored.url) throw new Error('storage returned no file URL');
        uploaded.push(Object.assign({}, spec, { cardId: `card_${spec.order}`, fileId: stored.fileId, url: stored.url }));
      }
      return uploaded;
    } catch (err) {
      await Promise.all(uploaded.map((card) => deleteFile(card.fileId).catch(() => undefined)));
      throw err;
    }
  };
}

function drawRoundedCard(ctx) {
  const radius = 56;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(CARD_SIZE - radius, 0);
  ctx.quadraticCurveTo(CARD_SIZE, 0, CARD_SIZE, radius);
  ctx.lineTo(CARD_SIZE, CARD_SIZE - radius);
  ctx.quadraticCurveTo(CARD_SIZE, CARD_SIZE, CARD_SIZE - radius, CARD_SIZE);
  ctx.lineTo(radius, CARD_SIZE);
  ctx.quadraticCurveTo(0, CARD_SIZE, 0, CARD_SIZE - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function grainValue(taskId, order, x, y) {
  let value = 2166136261;
  const source = `${taskId}:${order}:${x}:${y}`;
  for (const char of Array.from(source)) {
    value ^= char.codePointAt(0);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value / 0x100000000;
}

function roughenGlyph(ctx, taskId, order) {
  const pixels = ctx.getImageData(0, 0, CARD_SIZE, CARD_SIZE);
  for (let y = 0; y < CARD_SIZE; y += 2) {
    for (let x = 0; x < CARD_SIZE; x += 2) {
      const index = (y * CARD_SIZE + x) * 4;
      if (pixels.data[index + 3] === 0) continue;
      const value = grainValue(taskId, order, x, y);
      if (value < 0.028) {
        pixels.data[index + 3] = 0;
      } else if (value < 0.1) {
        pixels.data[index + 3] = Math.round(pixels.data[index + 3] * (0.9 + value));
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

function createMarkerPngMaker() {
  const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
  const fontPath = path.join(__dirname, 'fonts', 'LXGWMarkerGothic-Regular.ttf');
  if (!GlobalFonts.registerFromPath(fontPath, 'LXGWMarkerGothic')) {
    throw new Error('marker font registration failed');
  }

  return async function makePng(spec, theme, taskId) {
    const canvas = createCanvas(CARD_SIZE, CARD_SIZE);
    const ctx = canvas.getContext('2d');
    drawRoundedCard(ctx);

    const glyphCanvas = createCanvas(CARD_SIZE, CARD_SIZE);
    const glyph = glyphCanvas.getContext('2d');
    const style = buildMarkerCardStyle({ taskId, order: spec.order, role: spec.role, text: spec.text });
    const fontSize = spec.role === 'content' ? 650 : 170;
    glyph.save();
    glyph.translate(CARD_SIZE / 2 + style.offsetX, CARD_SIZE / 2 + style.offsetY);
    glyph.rotate(style.rotation * Math.PI / 180);
    glyph.scale(style.scale, style.scale);
    glyph.font = `${fontSize}px LXGWMarkerGothic`;
    glyph.textAlign = 'center';
    glyph.textBaseline = 'middle';
    glyph.lineJoin = 'round';
    glyph.lineCap = 'round';
    glyph.strokeStyle = '#171717';
    glyph.fillStyle = '#171717';
    glyph.lineWidth = spec.role === 'content' ? 26 : 10;
    glyph.strokeText(spec.text, 0, 0);
    glyph.fillText(spec.text, 0, 0);
    glyph.restore();
    roughenGlyph(glyph, taskId, spec.order);
    ctx.drawImage(glyphCanvas, 0, 0);

    const stickerSize = style.stickerSize;
    const stickerX = CARD_SIZE - stickerSize - 44;
    const stickerY = style.stickerCorner === 'top-right' ? 44 : CARD_SIZE - stickerSize - 44;
    drawSticker(ctx, style.stickerKey, stickerX, stickerY, stickerSize, style.rotation * 2);
    return canvas.toBuffer('image/png');
  };
}

module.exports = { createCardRenderer, createMarkerPngMaker };
