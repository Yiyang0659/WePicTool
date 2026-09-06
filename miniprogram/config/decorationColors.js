var COLOR_GROUPS = [
  {
    key: 'vivid',
    name: '鲜明色',
    colors: [
      { key: 'vivid-blue', name: '蓝色', color: '#3561E8', detailColor: '#17347F' },
      { key: 'vivid-purple', name: '紫色', color: '#7C32EE', detailColor: '#3F187F' },
      { key: 'vivid-teal', name: '青绿', color: '#139B90', detailColor: '#075A54' },
      { key: 'vivid-orange', name: '橙色', color: '#F25C05', detailColor: '#8C3100' },
      { key: 'vivid-red', name: '红色', color: '#E71D45', detailColor: '#851028' },
      { key: 'vivid-pink', name: '洋红', color: '#D92C79', detailColor: '#7B1644' },
      { key: 'vivid-amber', name: '琥珀', color: '#DC7900', detailColor: '#774100' },
      { key: 'vivid-ink', name: '墨黑', color: '#202124', detailColor: '#FFFFFF' }
    ]
  },
  {
    key: 'light',
    name: '浅色',
    colors: [
      { key: 'light-blue', name: '浅蓝', color: '#9CB5FF', detailColor: '#3452A4' },
      { key: 'light-purple', name: '浅紫', color: '#C7ABFF', detailColor: '#6246A2' },
      { key: 'light-mint', name: '薄荷', color: '#8FD8D2', detailColor: '#256B66' },
      { key: 'light-peach', name: '蜜桃', color: '#FFB985', detailColor: '#9A5524' },
      { key: 'light-red', name: '浅红', color: '#FF9EB0', detailColor: '#9C4052' },
      { key: 'light-pink', name: '浅粉', color: '#F4A3C7', detailColor: '#8E4264' },
      { key: 'light-butter', name: '奶油黄', color: '#FFD38A', detailColor: '#8C6422' },
      { key: 'light-cloud', name: '云朵白', color: '#F4F4F6', detailColor: '#777A82' }
    ]
  },
  {
    key: 'transparent',
    name: '透明色',
    colors: [
      { key: 'transparent-blue', name: '透明蓝', color: 'rgba(53, 97, 232, 0.42)', detailColor: 'rgba(23, 52, 127, 0.68)', transparent: true },
      { key: 'transparent-purple', name: '透明紫', color: 'rgba(124, 50, 238, 0.42)', detailColor: 'rgba(63, 24, 127, 0.68)', transparent: true },
      { key: 'transparent-teal', name: '透明青绿', color: 'rgba(19, 155, 144, 0.42)', detailColor: 'rgba(7, 90, 84, 0.68)', transparent: true },
      { key: 'transparent-orange', name: '透明橙', color: 'rgba(242, 92, 5, 0.42)', detailColor: 'rgba(140, 49, 0, 0.68)', transparent: true },
      { key: 'transparent-red', name: '透明红', color: 'rgba(231, 29, 69, 0.42)', detailColor: 'rgba(133, 16, 40, 0.68)', transparent: true },
      { key: 'transparent-pink', name: '透明粉', color: 'rgba(217, 44, 121, 0.42)', detailColor: 'rgba(123, 22, 68, 0.68)', transparent: true },
      { key: 'transparent-amber', name: '透明黄', color: 'rgba(220, 121, 0, 0.42)', detailColor: 'rgba(119, 65, 0, 0.68)', transparent: true },
      { key: 'transparent-ink', name: '透明黑', color: 'rgba(32, 33, 36, 0.42)', detailColor: 'rgba(255, 255, 255, 0.72)', transparent: true }
    ]
  }
];

var COLORS = COLOR_GROUPS.reduce(function (map, group) {
  group.colors.forEach(function (color) {
    map[color.key] = Object.assign({ groupKey: group.key, transparent: false }, color);
  });
  return map;
}, {});

var COLOR_KEYS = Object.freeze(Object.keys(COLORS));

function getDecorationColor(key) {
  return COLORS[key] || null;
}

function getDecorationPaint(layer) {
  var selected = getDecorationColor(layer && layer.decorationColorKey);
  if (!selected) return { fill: '#F35C8C', stroke: '#171717' };
  return {
    fill: selected.color,
    stroke: layer && layer.type === 'doodle' ? selected.color : selected.detailColor
  };
}

module.exports = {
  COLOR_GROUPS: COLOR_GROUPS,
  COLOR_KEYS: COLOR_KEYS,
  getDecorationColor: getDecorationColor,
  getDecorationPaint: getDecorationPaint
};
