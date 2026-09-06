var FONT_FEELS = [
  {
    key: 'marker',
    name: '随手写',
    description: '亲近、自然',
    fontFamily: 'LXGWMarkerGothic',
    fontPath: '/font/LXGWMarkerGothic-Regular.ttf',
    sizeScale: 1,
    defaultEffectKey: 'marker-bold'
  },
  {
    key: 'playful',
    name: '开心体',
    description: '轻松、有趣',
    fontFamily: 'SmileySans',
    fontPath: '/font/SmileySans-Oblique.ttf',
    sizeScale: 0.9,
    defaultEffectKey: 'marker-bold'
  },
  {
    key: 'headline',
    name: '醒目体',
    description: '直接、有冲击力',
    fontFamily: 'MaShanZheng',
    fontPath: '/font/MaShanZheng-Regular.ttf',
    sizeScale: 1.04,
    defaultEffectKey: 'stamp-shadow'
  }
];

function getFontFeel(key) {
  return FONT_FEELS.find(function (item) { return item.key === key; }) || null;
}

module.exports = {
  FONT_FEELS: FONT_FEELS,
  FONT_KEYS: FONT_FEELS.map(function (item) { return item.key; }),
  getFontFeel: getFontFeel
};
