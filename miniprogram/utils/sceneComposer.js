var stylePacks = require('../config/stylePacks');
var assets = require('../config/assetRegistry');
var planner = require('./candidatePlanner');

var ROLE_LAYOUTS = {
  hook: { x: 540, y: 355, fontSize: 190, lineHeight: 225, align: 'center' },
  build: { x: 310, y: 430, fontSize: 160, lineHeight: 195, align: 'left' },
  misdirect: { x: 540, y: 505, fontSize: 185, lineHeight: 220, align: 'center' },
  pause: { x: 540, y: 540, fontSize: 112, lineHeight: 140, align: 'center' },
  reveal: { x: 540, y: 530, fontSize: 280, lineHeight: 315, align: 'center' },
  ending: { x: 540, y: 660, fontSize: 132, lineHeight: 160, align: 'center' }
};

function numberSeed(candidate, order, layerId) {
  return planner.hashSeed(String(candidate.seed) + '|' + order + '|' + layerId);
}

function jitter(candidate, order, layerId, amount) {
  return ((numberSeed(candidate, order, layerId) % 2001) / 1000 - 1) * amount;
}

function textLength(value) {
  return Array.from(value || '').length;
}

function splitText(text, role) {
  var characters = Array.from(text || '');
  if (!characters.length) return [];
  var lineCount;
  if (role === 'reveal') {
    lineCount = characters.length <= 4 ? 1 : characters.length <= 12 ? 2 : 3;
  } else {
    lineCount = Math.max(1, Math.ceil(characters.length / 6));
  }
  var lineSize = Math.ceil(characters.length / lineCount);
  var lines = [];
  for (var index = 0; index < characters.length; index += lineSize) {
    lines.push(characters.slice(index, index + lineSize).join(''));
  }
  return lines;
}

function fontSizeFor(card, layout) {
  if (card.role !== 'reveal') return layout.fontSize;
  var longestLine = splitText(card.text, card.role).reduce(function (longest, line) {
    return Math.max(longest, textLength(line));
  }, 0);
  return Math.max(170, layout.fontSize - Math.max(0, longestLine - 3) * 14);
}

function chooseAsset(stylePack, role, kind) {
  var keys = kind === 'sticker' ? stylePack.stickersByRole[role] : stylePack.doodlesByRole[role];
  var key = keys && keys[0];
  return key && assets.getAsset(key) ? key : null;
}

function decoration(candidate, card, id, type, assetKey, x, y, rotation, scale) {
  return {
    id: id,
    type: type,
    assetKey: assetKey,
    x: Math.round(x + jitter(candidate, card.order, id, 18)),
    y: Math.round(y + jitter(candidate, card.order, id + '_y', 18)),
    rotation: Math.round((rotation + jitter(candidate, card.order, id + '_r', 5)) * 10) / 10,
    scale: Math.round((scale + jitter(candidate, card.order, id + '_s', 0.08)) * 100) / 100
  };
}

function roleDecorations(candidate, card, stylePack) {
  var doodleKey = chooseAsset(stylePack, card.role, 'doodle');
  var stickerKey = chooseAsset(stylePack, card.role, 'sticker');
  var layers = [];

  if (card.role === 'misdirect') {
    layers.push(decoration(candidate, card, 'doodle_cross', 'doodle', 'scribble-cross', 540, 500, -6, 1.2));
  } else if (card.role === 'pause') {
    layers.push(decoration(candidate, card, 'doodle_pause', 'doodle', doodleKey, 800, 760, 12, 0.82));
  } else if (card.role === 'reveal') {
    layers.push(decoration(candidate, card, 'doodle_burst', 'doodle', 'burst-lines', 540, 500, 0, 1.22));
    layers.push(decoration(candidate, card, 'sticker_reveal', 'sticker', stickerKey, 850, 250, 8, 0.7));
  } else if (card.role === 'ending') {
    layers.push(decoration(candidate, card, 'doodle_ending', 'doodle', doodleKey, 540, 440, 0, 1.7));
    layers.push(decoration(candidate, card, 'sticker_ending', 'sticker', stickerKey, 790, 690, -9, 0.82));
  } else {
    layers.push(decoration(candidate, card, 'doodle_' + card.role, 'doodle', doodleKey, 820, 225, 10, 0.72));
  }
  return layers;
}

function composeScene(candidate, card, stylePack) {
  var layout = ROLE_LAYOUTS[card.role];
  if (!layout) throw new Error('不支持的卡片角色：' + card.role);
  var lines = splitText(card.text, card.role);
  var textLayer = {
    id: 'text_main',
    type: 'text',
    text: card.text,
    lines: lines,
    effectKey: stylePack.textEffectsByRole[card.role],
    fontFamily: 'LXGWMarkerGothic',
    fontSize: fontSizeFor(card, layout),
    lineHeight: layout.lineHeight,
    x: Math.round(layout.x + jitter(candidate, card.order, 'text_main', 14)),
    y: Math.round(layout.y + jitter(candidate, card.order, 'text_main_y', 14)),
    rotation: Math.round(jitter(candidate, card.order, 'text_main_r', 3) * 10) / 10,
    scale: Math.round((1 + jitter(candidate, card.order, 'text_main_s', 0.04)) * 100) / 100,
    color: stylePack.palette.primary,
    align: layout.align
  };
  var layers = card.text ? [textLayer] : [];
  return {
    sceneId: 'scene_' + String(card.order).padStart(2, '0'),
    order: card.order,
    role: card.role,
    width: 1080,
    height: 1080,
    background: Object.assign({}, stylePack.background),
    layers: layers.concat(roleDecorations(candidate, card, stylePack))
  };
}

function composeCandidate(candidate, stylePackId) {
  if (!candidate || !Array.isArray(candidate.cards)) throw new Error('候选缺少 cards');
  var stylePack = stylePacks.getStylePack(stylePackId);
  if (!stylePack) throw new Error('未知视觉包：' + stylePackId);
  return candidate.cards.map(function (card) {
    return composeScene(candidate, card, stylePack);
  });
}

function validateScene(scene) {
  var errors = [];
  if (!scene || scene.width !== 1080 || scene.height !== 1080) errors.push('场景必须为 1080 方图');
  if (!scene || !scene.background || typeof scene.background.color !== 'string') errors.push('场景缺少背景');
  if (scene && scene.background && !stylePacks.STYLE_PACKS.some(function (pack) {
    return pack.background.assetKey === scene.background.assetKey;
  })) {
    errors.push('背景素材不在视觉包白名单');
  }
  if (!scene || !Array.isArray(scene.layers)) {
    errors.push('场景缺少图层');
    return { valid: false, errors: errors };
  }
  var textLayers = scene.layers.filter(function (layer) { return layer.type === 'text'; });
  var decorations = scene.layers.filter(function (layer) { return layer.type !== 'text'; });
  if (textLayers.length > 2) errors.push('文字图层不能超过两层');
  if (textLayers.filter(function (layer) { return layer.id === 'text_main'; }).length > 1) {
    errors.push('主文字图层不能超过一层');
  }
  if (textLayers.filter(function (layer) { return layer.id !== 'text_main'; }).length > 1) {
    errors.push('辅助文字图层不能超过一层');
  }
  if (decorations.length > 6) errors.push('装饰图层不能超过六层');
  scene.layers.forEach(function (layer) {
    if (!layer || typeof layer.id !== 'string') errors.push('图层缺少 id');
    if (!layer || typeof layer.x !== 'number' || layer.x < 0 || layer.x > 1080 || typeof layer.y !== 'number' || layer.y < 0 || layer.y > 1080) {
      errors.push('图层坐标超出画布');
    }
    if (layer && layer.type === 'text' && (!Array.isArray(layer.lines) || !layer.lines.length)) {
      errors.push('文字图层缺少预计算换行');
    }
    if (layer && layer.type === 'text' && stylePacks.TEXT_EFFECT_KEYS.indexOf(layer.effectKey) < 0) {
      errors.push('文字效果不在白名单');
    }
    if (layer && layer.type !== 'text') {
      var asset = assets.getAsset(layer.assetKey);
      if (!asset) {
        errors.push('装饰素材不在白名单');
      } else if (asset.type !== layer.type) {
        errors.push('装饰素材类型不匹配');
      }
    }
  });
  return { valid: errors.length === 0, errors: errors };
}

module.exports = {
  composeCandidate: composeCandidate,
  validateScene: validateScene
};
