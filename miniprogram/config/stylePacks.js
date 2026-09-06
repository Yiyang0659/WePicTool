function roleMap(value, ending) {
  return {
    hook: value,
    build: value,
    misdirect: ending || value,
    pause: value,
    reveal: value,
    ending: ending || value
  };
}

function decorations(stickerOffset) {
  return {
    stickersByRole: {
      hook: ['sticker_' + (stickerOffset % 12)],
      build: ['sticker_' + ((stickerOffset + 1) % 12)],
      misdirect: ['sticker_' + ((stickerOffset + 2) % 12)],
      pause: ['sticker_' + ((stickerOffset + 3) % 12)],
      reveal: ['sticker_' + ((stickerOffset + 4) % 12)],
      ending: ['sticker_' + ((stickerOffset + 5) % 12)]
    },
    doodlesByRole: {
      hook: ['heart-outline'],
      build: ['underline-rough'],
      misdirect: ['scribble-cross'],
      pause: ['circle-mark'],
      reveal: ['burst-lines'],
      ending: ['arrow-curve']
    }
  };
}

function createPack(config) {
  var extra = decorations(config.stickerOffset || 0);
  var defaultBackground = config.backgroundVariants.find(function (item) {
    return item.key === config.defaultBackgroundVariantKey;
  });
  var defaultPalette = config.palettes.find(function (item) {
    return item.key === config.defaultPaletteKey;
  });
  return Object.assign({}, config, extra, {
    background: { assetKey: defaultBackground.assetKey, color: defaultBackground.color },
    palette: Object.assign({}, defaultPalette.colors)
  });
}

var STYLE_PACKS = [
  createPack({
    id: 'pink-note-v1', name: '粉色便签', defaultBackgroundVariantKey: 'pink-note-soft', defaultPaletteKey: 'pink-note-rose', defaultFontFeelKey: 'marker', stickerOffset: 0,
    backgroundVariants: [
      { key: 'pink-note-soft', name: '柔粉', assetKey: 'pink-note-01', color: '#FCE4EC' },
      { key: 'pink-note-cream', name: '奶油', assetKey: 'pink-note-02', color: '#FFF3E8' },
      { key: 'pink-note-lilac', name: '浅紫', assetKey: 'pink-note-03', color: '#F1EAFF' }
    ],
    palettes: [
      { key: 'pink-note-rose', name: '莓果粉', colors: { primary: '#F35C8C', secondary: '#8F4562', accent: '#FFD166', paper: '#FFF8FA' } },
      { key: 'pink-note-coral', name: '珊瑚橙', colors: { primary: '#EF6A62', secondary: '#7C403C', accent: '#F7C85E', paper: '#FFF9F4' } },
      { key: 'pink-note-grape', name: '葡萄紫', colors: { primary: '#8A63D2', secondary: '#5D467F', accent: '#F59CC3', paper: '#FBF8FF' } }
    ],
    textEffectsByRole: roleMap('marker-bold', 'stamp-shadow')
  }),
  createPack({
    id: 'chalk-chaos-v1', name: '黑板乱写', defaultBackgroundVariantKey: 'chalk-board-dark', defaultPaletteKey: 'chalk-mint', defaultFontFeelKey: 'marker', stickerOffset: 6,
    backgroundVariants: [
      { key: 'chalk-board-dark', name: '墨黑', assetKey: 'chalk-board-01', color: '#24303A' },
      { key: 'chalk-board-green', name: '墨绿', assetKey: 'chalk-board-02', color: '#1F3B35' },
      { key: 'chalk-board-blue', name: '夜蓝', assetKey: 'chalk-board-03', color: '#24314F' }
    ],
    palettes: [
      { key: 'chalk-mint', name: '薄荷粉笔', colors: { primary: '#F9F4D0', secondary: '#A3D9C9', accent: '#FFB86B', paper: '#32414B' } },
      { key: 'chalk-candy', name: '糖果粉笔', colors: { primary: '#FFD4E5', secondary: '#B4D9FF', accent: '#FFE071', paper: '#2D3740' } }
    ],
    textEffectsByRole: roleMap('chalk-rough', 'stamp-shadow')
  }),
  createPack({
    id: 'paper-collage-v1', name: '剪贴报纸', defaultBackgroundVariantKey: 'paper-collage-cream', defaultPaletteKey: 'paper-ink', defaultFontFeelKey: 'headline', stickerOffset: 2,
    backgroundVariants: [
      { key: 'paper-collage-cream', name: '旧纸', assetKey: 'paper-collage-01', color: '#F4EAD7' },
      { key: 'paper-collage-white', name: '白报', assetKey: 'paper-collage-02', color: '#F8F6EF' },
      { key: 'paper-collage-gray', name: '灰报', assetKey: 'paper-collage-03', color: '#E4E2DB' }
    ],
    palettes: [
      { key: 'paper-ink', name: '蓝红油墨', colors: { primary: '#245D8C', secondary: '#D9594C', accent: '#E9C46A', paper: '#FFFDF7' } },
      { key: 'paper-forest', name: '森林油墨', colors: { primary: '#2F5B46', secondary: '#A94F3D', accent: '#D6A84B', paper: '#FFFDF7' } }
    ],
    textEffectsByRole: roleMap('collage-cutout', 'stamp-shadow')
  }),
  createPack({
    id: 'crazy-grid-v1', name: '发疯方格', defaultBackgroundVariantKey: 'crazy-grid-lemon', defaultPaletteKey: 'crazy-grid-pop', defaultFontFeelKey: 'playful', stickerOffset: 4,
    backgroundVariants: [
      { key: 'crazy-grid-lemon', name: '柠檬格', assetKey: 'crazy-grid-01', color: '#FFF36D' },
      { key: 'crazy-grid-orange', name: '橘子格', assetKey: 'crazy-grid-02', color: '#FFB15C' },
      { key: 'crazy-grid-lime', name: '青柠格', assetKey: 'crazy-grid-03', color: '#D8F36A' }
    ],
    palettes: [
      { key: 'crazy-grid-pop', name: '黑橙撞色', colors: { primary: '#171717', secondary: '#F04D23', accent: '#7657FF', paper: '#FFFCE2' } },
      { key: 'crazy-grid-violet', name: '紫蓝撞色', colors: { primary: '#4723A8', secondary: '#1267D6', accent: '#F84E8C', paper: '#FFFCE2' } }
    ],
    textEffectsByRole: roleMap('marker-bold', 'stamp-shadow')
  }),
  createPack({
    id: 'gentle-journal-v1', name: '温柔手账', defaultBackgroundVariantKey: 'gentle-journal-cream', defaultPaletteKey: 'gentle-journal-sage', defaultFontFeelKey: 'marker', stickerOffset: 1,
    backgroundVariants: [
      { key: 'gentle-journal-cream', name: '奶油纸', assetKey: 'gentle-journal-01', color: '#FFF7E8' },
      { key: 'gentle-journal-lilac', name: '淡紫纸', assetKey: 'gentle-journal-02', color: '#F2EDFF' },
      { key: 'gentle-journal-mint', name: '薄荷纸', assetKey: 'gentle-journal-03', color: '#EDF7EF' }
    ],
    palettes: [
      { key: 'gentle-journal-sage', name: '鼠尾草', colors: { primary: '#587467', secondary: '#9A7184', accent: '#E9A6B6', paper: '#FFFBF4' } },
      { key: 'gentle-journal-lilac', name: '柔紫粉', colors: { primary: '#7A68A6', secondary: '#A4677D', accent: '#E5A6CB', paper: '#FFFBF4' } }
    ],
    textEffectsByRole: roleMap('marker-bold', 'stamp-shadow')
  }),
  createPack({
    id: 'blue-soda-v1', name: '蓝色汽水', defaultBackgroundVariantKey: 'blue-soda-clear', defaultPaletteKey: 'blue-soda-fresh', defaultFontFeelKey: 'playful', stickerOffset: 7,
    backgroundVariants: [
      { key: 'blue-soda-clear', name: '晴空', assetKey: 'blue-soda-01', color: '#E8F7FF' },
      { key: 'blue-soda-wave', name: '海浪', assetKey: 'blue-soda-02', color: '#D7EEFF' },
      { key: 'blue-soda-night', name: '蓝夜', assetKey: 'blue-soda-03', color: '#243A6B' }
    ],
    palettes: [
      { key: 'blue-soda-fresh', name: '清爽蓝', colors: { primary: '#2077D4', secondary: '#195183', accent: '#35C6C0', paper: '#F4FCFF' } },
      { key: 'blue-soda-deep', name: '深海蓝', colors: { primary: '#163D8C', secondary: '#4569B2', accent: '#FF7E9D', paper: '#F4FCFF' } }
    ],
    textEffectsByRole: roleMap('marker-bold', 'stamp-shadow')
  }),
  createPack({
    id: 'retro-ticket-v1', name: '复古票根', defaultBackgroundVariantKey: 'retro-ticket-cream', defaultPaletteKey: 'retro-ticket-rust', defaultFontFeelKey: 'headline', stickerOffset: 9,
    backgroundVariants: [
      { key: 'retro-ticket-cream', name: '旧票根', assetKey: 'retro-ticket-01', color: '#F2E4C8' },
      { key: 'retro-ticket-sage', name: '绿票根', assetKey: 'retro-ticket-02', color: '#DCE2C8' },
      { key: 'retro-ticket-pink', name: '粉票根', assetKey: 'retro-ticket-03', color: '#EED5CB' }
    ],
    palettes: [
      { key: 'retro-ticket-rust', name: '铁锈绿', colors: { primary: '#8D3C2F', secondary: '#294F43', accent: '#D39B45', paper: '#FAF2DE' } },
      { key: 'retro-ticket-ink', name: '旧墨蓝', colors: { primary: '#314E67', secondary: '#74443A', accent: '#B9894F', paper: '#FAF2DE' } }
    ],
    textEffectsByRole: roleMap('collage-cutout', 'stamp-shadow')
  })
];

var TEXT_EFFECT_KEYS = ['marker-bold', 'chalk-rough', 'collage-cutout', 'stamp-shadow'];

function getStylePack(id) {
  return STYLE_PACKS.find(function (pack) { return pack.id === id; }) || null;
}

function getBackgroundVariant(pack, key) {
  return pack && pack.backgroundVariants.find(function (item) { return item.key === key; }) || null;
}

function getPalette(pack, key) {
  return pack && pack.palettes.find(function (item) { return item.key === key; }) || null;
}

module.exports = {
  STYLE_PACKS: STYLE_PACKS,
  TEXT_EFFECT_KEYS: TEXT_EFFECT_KEYS,
  getStylePack: getStylePack,
  getBackgroundVariant: getBackgroundVariant,
  getPalette: getPalette
};
