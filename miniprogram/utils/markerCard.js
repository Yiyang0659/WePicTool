const STICKER_COUNT = 12;

function hashSeed(value) {
  let hash = 2166136261;
  for (const char of Array.from(String(value || ''))) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function nextRandom(seed, min, max) {
  const nextSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return {
    seed: nextSeed,
    value: min + (nextSeed / 0x100000000) * (max - min)
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function buildMarkerCardStyle(input) {
  const card = input || {};
  let seed = hashSeed(`${card.taskId || 'draft'}:${card.order || 0}:${card.text || ''}`);
  const rotation = nextRandom(seed, -3, 3); seed = rotation.seed;
  const scale = nextRandom(seed, 0.94, 1.06); seed = scale.seed;
  const offsetX = nextRandom(seed, -42, 42); seed = offsetX.seed;
  const offsetY = nextRandom(seed, -42, 42); seed = offsetY.seed;
  const stickerIndex = nextRandom(seed, 0, STICKER_COUNT); seed = stickerIndex.seed;
  const corner = nextRandom(seed, 0, 1);

  return {
    rotation: round(rotation.value),
    scale: round(scale.value),
    offsetX: round(offsetX.value),
    offsetY: round(offsetY.value),
    stickerKey: `sticker_${Math.floor(stickerIndex.value)}`,
    stickerCorner: corner.value < 0.5 ? 'top-right' : 'bottom-right',
    stickerSize: 132
  };
}

function buildMarkerPreviewCards(input) {
  const options = input || {};
  const cards = Array.isArray(options.cards) ? options.cards : [];
  const taskId = options.taskId || 'draft';
  return cards.map((card) => {
    const style = buildMarkerCardStyle(Object.assign({}, card, { taskId }));
    return Object.assign({}, card, style, {
      previewStyle: `transform: translate(${style.offsetX}rpx, ${style.offsetY}rpx) rotate(${style.rotation}deg) scale(${style.scale});`
    });
  });
}

module.exports = { buildMarkerCardStyle, buildMarkerPreviewCards };
