var STYLE_PACKS = [
  {
    id: 'pink-note-v1',
    background: { assetKey: 'pink-note-01', color: '#FCE4EC' },
    palette: { primary: '#F35C8C', secondary: '#8F4562', accent: '#FFD166', paper: '#FFF8FA' },
    textEffectsByRole: {
      hook: 'marker-bold', build: 'marker-bold', misdirect: 'stamp-shadow',
      pause: 'marker-bold', reveal: 'marker-bold', ending: 'stamp-shadow'
    },
    stickersByRole: {
      hook: ['sticker_0'], build: ['sticker_1'], misdirect: ['sticker_2'],
      pause: ['sticker_3'], reveal: ['sticker_4'], ending: ['sticker_5']
    },
    doodlesByRole: {
      hook: ['heart-outline'], build: ['underline-rough'], misdirect: ['scribble-cross'],
      pause: ['circle-mark'], reveal: ['burst-lines'], ending: ['heart-outline']
    }
  },
  {
    id: 'chalk-chaos-v1',
    background: { assetKey: 'chalk-board-01', color: '#24303A' },
    palette: { primary: '#F9F4D0', secondary: '#A3D9C9', accent: '#FFB86B', paper: '#32414B' },
    textEffectsByRole: {
      hook: 'chalk-rough', build: 'chalk-rough', misdirect: 'chalk-rough',
      pause: 'chalk-rough', reveal: 'chalk-rough', ending: 'stamp-shadow'
    },
    stickersByRole: {
      hook: ['sticker_6'], build: ['sticker_7'], misdirect: ['sticker_8'],
      pause: ['sticker_9'], reveal: ['sticker_10'], ending: ['sticker_11']
    },
    doodlesByRole: {
      hook: ['arrow-curve'], build: ['underline-rough'], misdirect: ['scribble-cross'],
      pause: ['circle-mark'], reveal: ['burst-lines'], ending: ['heart-outline']
    }
  },
  {
    id: 'paper-collage-v1',
    background: { assetKey: 'paper-collage-01', color: '#F4EAD7' },
    palette: { primary: '#245D8C', secondary: '#D9594C', accent: '#E9C46A', paper: '#FFFDF7' },
    textEffectsByRole: {
      hook: 'collage-cutout', build: 'collage-cutout', misdirect: 'stamp-shadow',
      pause: 'collage-cutout', reveal: 'collage-cutout', ending: 'stamp-shadow'
    },
    stickersByRole: {
      hook: ['sticker_2'], build: ['sticker_4'], misdirect: ['sticker_6'],
      pause: ['sticker_8'], reveal: ['sticker_10'], ending: ['sticker_0']
    },
    doodlesByRole: {
      hook: ['circle-mark'], build: ['arrow-curve'], misdirect: ['scribble-cross'],
      pause: ['underline-rough'], reveal: ['burst-lines'], ending: ['heart-outline']
    }
  }
];

var TEXT_EFFECT_KEYS = ['marker-bold', 'chalk-rough', 'collage-cutout', 'stamp-shadow'];

function getStylePack(id) {
  return STYLE_PACKS.find(function (pack) { return pack.id === id; }) || null;
}

module.exports = {
  STYLE_PACKS: STYLE_PACKS,
  TEXT_EFFECT_KEYS: TEXT_EFFECT_KEYS,
  getStylePack: getStylePack
};
