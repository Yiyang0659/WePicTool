const path = require('node:path');

function createCardRenderer(dependencies) {
  const deps = dependencies || {};
  const makePng = deps.makePng;
  const uploadBuffer = deps.uploadBuffer;
  const deleteFile = deps.deleteFile;

  return async function renderCards(specs, theme) {
    const uploaded = [];
    try {
      for (let index = 0; index < specs.length; index += 1) {
        const spec = Object.assign({}, specs[index], { total: specs.length });
        const buffer = await makePng(spec, theme);
        const stored = await uploadBuffer(buffer, spec);
        if (!stored || !stored.fileId || !stored.url) throw new Error('storage returned no file URL');
        uploaded.push(Object.assign({}, spec, {
          cardId: `card_${spec.order}`,
          fileId: stored.fileId,
          url: stored.url
        }));
      }
      return uploaded;
    } catch (err) {
      await Promise.all(uploaded.map((card) => deleteFile(card.fileId).catch(() => undefined)));
      throw err;
    }
  };
}

function createPngMaker() {
  const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
  const fontPath = path.join(__dirname, 'fonts', 'MaShanZheng-Regular.ttf');
  if (!GlobalFonts.registerFromPath(fontPath, 'MaShanZheng')) {
    throw new Error('handwritten font registration failed');
  }

  return function makePng(spec, theme) {
    const canvas = createCanvas(1080, 1080);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = theme.key === 'handwrite-paper' ? 'rgba(29,26,23,.14)' : 'rgba(255,255,255,.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(56, 56, 968, 968);
    ctx.fillStyle = spec.order === spec.total ? theme.accent : theme.foreground;
    ctx.font = spec.role === 'content' ? '720px MaShanZheng' : '132px MaShanZheng';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.text, 540, 540);
    return canvas.toBuffer('image/png');
  };
}

module.exports = { createCardRenderer, createPngMaker };
