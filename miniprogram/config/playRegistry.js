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
    title: '分层云换装',
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
    version: 1,
    title: '抽象搞怪',
    description: '四个部位随便滑，先用示例感受纸娃娃式换装。',
    cover: '/assets/samples/head1.png',
    license: 'project-owned',
    groups: {
      head: [
        asset('funny_head_1', 'head', '橘色短发', '/assets/samples/head1.png', 640, 640),
        asset('funny_head_2', 'head', '蓝色卷发', '/assets/samples/head2.png', 640, 640),
        asset('funny_head_3', 'head', '紫色双丸子', '/assets/samples/head3.png', 640, 640)
      ],
      tops: [
        asset('funny_top_1', 'tops', '上衣 1', '/assets/samples/top1.jpg', 640, 640),
        asset('funny_top_2', 'tops', '上衣 2', '/assets/samples/top2.jpg', 640, 800),
        asset('funny_top_3', 'tops', '上衣 3', '/assets/samples/top3.jpg', 640, 959)
      ],
      bottoms: [
        asset('funny_bottom_1', 'bottoms', '下装 1', '/assets/samples/bottom1.jpg', 640, 512),
        asset('funny_bottom_2', 'bottoms', '下装 2', '/assets/samples/bottom2.jpg', 640, 960),
        asset('funny_bottom_3', 'bottoms', '下装 3', '/assets/samples/bottom3.jpg', 640, 427)
      ],
      shoes: [
        asset('funny_shoe_1', 'shoes', '鞋子 1', '/assets/samples/shoe1.jpg', 640, 457),
        asset('funny_shoe_2', 'shoes', '鞋子 2', '/assets/samples/shoe2.jpg', 640, 800),
        asset('funny_shoe_3', 'shoes', '鞋子 3', '/assets/samples/shoe3.jpg', 640, 640)
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
