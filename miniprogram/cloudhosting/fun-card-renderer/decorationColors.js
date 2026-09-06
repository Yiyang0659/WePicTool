'use strict';

const COLOR_GROUPS = Object.freeze([
  {
    key: 'vivid',
    colors: [
      ['vivid-blue', '#3561E8', '#17347F'],
      ['vivid-purple', '#7C32EE', '#3F187F'],
      ['vivid-teal', '#139B90', '#075A54'],
      ['vivid-orange', '#F25C05', '#8C3100'],
      ['vivid-red', '#E71D45', '#851028'],
      ['vivid-pink', '#D92C79', '#7B1644'],
      ['vivid-amber', '#DC7900', '#774100'],
      ['vivid-ink', '#202124', '#FFFFFF']
    ]
  },
  {
    key: 'light',
    colors: [
      ['light-blue', '#9CB5FF', '#3452A4'],
      ['light-purple', '#C7ABFF', '#6246A2'],
      ['light-mint', '#8FD8D2', '#256B66'],
      ['light-peach', '#FFB985', '#9A5524'],
      ['light-red', '#FF9EB0', '#9C4052'],
      ['light-pink', '#F4A3C7', '#8E4264'],
      ['light-butter', '#FFD38A', '#8C6422'],
      ['light-cloud', '#F4F4F6', '#777A82']
    ]
  },
  {
    key: 'transparent',
    colors: [
      ['transparent-blue', 'rgba(53, 97, 232, 0.42)', 'rgba(23, 52, 127, 0.68)'],
      ['transparent-purple', 'rgba(124, 50, 238, 0.42)', 'rgba(63, 24, 127, 0.68)'],
      ['transparent-teal', 'rgba(19, 155, 144, 0.42)', 'rgba(7, 90, 84, 0.68)'],
      ['transparent-orange', 'rgba(242, 92, 5, 0.42)', 'rgba(140, 49, 0, 0.68)'],
      ['transparent-red', 'rgba(231, 29, 69, 0.42)', 'rgba(133, 16, 40, 0.68)'],
      ['transparent-pink', 'rgba(217, 44, 121, 0.42)', 'rgba(123, 22, 68, 0.68)'],
      ['transparent-amber', 'rgba(220, 121, 0, 0.42)', 'rgba(119, 65, 0, 0.68)'],
      ['transparent-ink', 'rgba(32, 33, 36, 0.42)', 'rgba(255, 255, 255, 0.72)']
    ]
  }
]);

const COLORS = new Map();
COLOR_GROUPS.forEach((group) => {
  group.colors.forEach((entry) => {
    COLORS.set(entry[0], { key: entry[0], groupKey: group.key, color: entry[1], detailColor: entry[2] });
  });
});

const COLOR_KEYS = Object.freeze(Array.from(COLORS.keys()));

function getDecorationColor(key) {
  return COLORS.get(key) || null;
}

function getDecorationPaint(layer) {
  const selected = getDecorationColor(layer && layer.decorationColorKey);
  if (!selected) return { fill: '#F35C8C', stroke: '#171717' };
  return {
    fill: selected.color,
    stroke: layer && layer.type === 'doodle' ? selected.color : selected.detailColor
  };
}

module.exports = { COLOR_GROUPS, COLOR_KEYS, getDecorationColor, getDecorationPaint };
