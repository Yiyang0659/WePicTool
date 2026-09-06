const STACK_THRESHOLD = 3;

const GROUP_DEFINITIONS = [
  { key: 'head', title: '头像 / 发型', emoji: '🙂', maxCount: 12 },
  { key: 'tops', title: '上衣', emoji: '👕', maxCount: 12 },
  { key: 'bottoms', title: '下装', emoji: '👖', maxCount: 12 },
  { key: 'shoes', title: '鞋子', emoji: '👟', maxCount: 12 }
];

const PLAY_REGISTRY = [
  {
    id: 'layered-dressup',
    version: 1,
    title: '穿搭叠图',
    status: 'available',
    entryModes: ['demo', 'upload', 'mixed'],
    groupSchema: GROUP_DEFINITIONS.map(function (group) { return group.key; }),
    renderer: 'layered-card',
    preview: 'multi-stack',
    exporter: 'grouped-sequence'
  },
  {
    id: 'fun-text-stack',
    version: 1,
    title: '趣味字画',
    status: 'available',
    inputType: 'text',
    renderer: 'fun-card-scene',
    preview: 'single-stack',
    exporter: 'ordered-sequence'
  }
];

function asset(id, groupKey, title, url, width, height) {
  return {
    id: id,
    groupKey: groupKey,
    title: title,
    url: url,
    width: width,
    height: height,
    license: 'project-owned'
  };
}

const ASSET_PACKS = [
  {
    id: 'funny-paper-doll-v1',
    playId: 'layered-dressup',
    version: 2,
    title: '四套基础穿搭',
    description: '四套完整造型按相同序号对应，也可以自由滑动混搭。',
    cover: '/assets/samples/head1.jpg',
    license: 'project-owned',
    groups: {
      head: [
        asset('funny_head_1', 'head', '搭配 1 · 男生短发', '/assets/samples/head1.jpg', 640, 640),
        asset('funny_head_2', 'head', '搭配 2 · 女生长发', '/assets/samples/head2.jpg', 640, 640),
        asset('funny_head_3', 'head', '搭配 3 · 男生短发', '/assets/samples/head3.jpg', 640, 640),
        asset('funny_head_4', 'head', '搭配 4 · 女生短发', '/assets/samples/head4.jpg', 640, 640)
      ],
      tops: [
        asset('funny_top_1', 'tops', '搭配 1 · 白色短袖', '/assets/samples/top1.jpg', 480, 640),
        asset('funny_top_2', 'tops', '搭配 2 · 米白针织衫', '/assets/samples/top2.jpg', 480, 640),
        asset('funny_top_3', 'tops', '搭配 3 · 卡其外套', '/assets/samples/top3.jpg', 480, 640),
        asset('funny_top_4', 'tops', '搭配 4 · 浅蓝上衣', '/assets/samples/top4.jpg', 480, 640)
      ],
      bottoms: [
        asset('funny_bottom_1', 'bottoms', '搭配 1 · 蓝色牛仔裤', '/assets/samples/bottom1.jpg', 480, 640),
        asset('funny_bottom_2', 'bottoms', '搭配 2 · 灰色长裙', '/assets/samples/bottom2.jpg', 480, 640),
        asset('funny_bottom_3', 'bottoms', '搭配 3 · 深灰工装裤', '/assets/samples/bottom3.jpg', 480, 640),
        asset('funny_bottom_4', 'bottoms', '搭配 4 · 白色长裙', '/assets/samples/bottom4.jpg', 480, 640)
      ],
      shoes: [
        asset('funny_shoe_1', 'shoes', '搭配 1 · 白色板鞋', '/assets/samples/shoe1.jpg', 480, 640),
        asset('funny_shoe_2', 'shoes', '搭配 2 · 棕色短靴', '/assets/samples/shoe2.jpg', 480, 640),
        asset('funny_shoe_3', 'shoes', '搭配 3 · 灰白运动鞋', '/assets/samples/shoe3.jpg', 480, 640),
        asset('funny_shoe_4', 'shoes', '搭配 4 · 白色凉鞋', '/assets/samples/shoe4.jpg', 480, 640)
      ]
    }
  }
];

function getPlayDefinition(playId) {
  for (var i = 0; i < PLAY_REGISTRY.length; i++) {
    if (PLAY_REGISTRY[i].id === playId) return PLAY_REGISTRY[i];
  }
  return null;
}

function getAssetPack(packId) {
  for (var i = 0; i < ASSET_PACKS.length; i++) {
    if (ASSET_PACKS[i].id === packId) return ASSET_PACKS[i];
  }
  return null;
}

function validateAssetPack(pack) {
  var errors = [];
  if (!pack || typeof pack !== 'object') {
    return { valid: false, errors: ['素材包不存在'] };
  }

  var play = getPlayDefinition(pack.playId);
  if (!play) errors.push('playId 未注册: ' + (pack.playId || 'empty'));
  var ids = {};

  for (var i = 0; i < GROUP_DEFINITIONS.length; i++) {
    var definition = GROUP_DEFINITIONS[i];
    var items = pack.groups && Array.isArray(pack.groups[definition.key])
      ? pack.groups[definition.key]
      : [];

    if (items.length < STACK_THRESHOLD) {
      errors.push(definition.key + ' 至少需要 3 张素材');
    }
    if (items.length > definition.maxCount) {
      errors.push(definition.key + ' 不能超过 ' + definition.maxCount + ' 张素材');
    }

    for (var j = 0; j < items.length; j++) {
      var item = items[j] || {};
      if (!item.id) {
        errors.push(definition.key + ' 第 ' + (j + 1) + ' 张缺少 id');
      } else if (ids[item.id]) {
        errors.push('素材 id 重复: ' + item.id);
      } else {
        ids[item.id] = true;
      }
      if (item.groupKey !== definition.key) {
        errors.push(definition.key + ' 素材 groupKey 不匹配: ' + (item.groupKey || 'empty'));
      }
      if (!item.url) errors.push(definition.key + ' 素材缺少 url: ' + (item.id || j));
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

module.exports = {
  STACK_THRESHOLD: STACK_THRESHOLD,
  GROUP_DEFINITIONS: GROUP_DEFINITIONS,
  PLAY_REGISTRY: PLAY_REGISTRY,
  ASSET_PACKS: ASSET_PACKS,
  getPlayDefinition: getPlayDefinition,
  getAssetPack: getAssetPack,
  validateAssetPack: validateAssetPack
};
