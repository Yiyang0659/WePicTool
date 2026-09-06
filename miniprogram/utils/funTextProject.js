var creativeBrief = require('./creativeBrief');
var planner = require('./candidatePlanner');
var matcher = require('./styleMatcher');
var composer = require('./sceneComposer');
var stylePacks = require('../config/stylePacks');
var assets = require('../config/assetRegistry');
var fontFeels = require('../config/fontFeels');
var decorationColors = require('../config/decorationColors');
var candidateValidator = require('./candidateValidator');

var HISTORY_LIMIT = 20;
var SIZE_PRESET_SCALE = { small: 0.84, standard: 1, large: 1.16 };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(function (item) {
      return typeof item === 'undefined' ? 'null' : stableSerialize(item);
    }).join(',') + ']';
  }
  return '{' + Object.keys(value).sort().filter(function (key) {
    return typeof value[key] !== 'undefined';
  }).map(function (key) {
    return JSON.stringify(key) + ':' + stableSerialize(value[key]);
  }).join(',') + '}';
}

function hashFingerprint(serialized) {
  var first = 2166136261;
  var second = 2246822507;
  for (var index = 0; index < serialized.length; index++) {
    var code = serialized.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code + index;
    second = Math.imul(second, 3266489909);
  }
  return [first, second].map(function (value) {
    return ('00000000' + (value >>> 0).toString(16)).slice(-8);
  }).join('');
}

function timestamp(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function createCandidate(plan, stylePackId) {
  var originalScenes = composer.composeCandidate(plan, stylePackId);
  return {
    candidateId: plan.candidateId,
    strategyId: plan.strategyId,
    title: plan.title,
    seed: plan.seed,
    cards: clone(plan.cards),
    stylePackId: stylePackId,
    originalScenes: clone(originalScenes),
    editedScenes: clone(originalScenes)
  };
}

function resetRenderState(project) {
  project.renderStatus = 'draft';
  project.renderedCards = [];
  project.updatedAt = Date.now();
  return project;
}

function ensureHistory(project) {
  if (!project.editHistory || !Array.isArray(project.editHistory.past) || !Array.isArray(project.editHistory.future)) {
    project.editHistory = { past: [], future: [] };
  }
  return project.editHistory;
}

function historySnapshot(project) {
  return {
    candidates: clone(project.candidates),
    selectedCandidateId: project.selectedCandidateId
  };
}

function commitEdit(project, mutate) {
  var next = clone(project);
  var before = stableSerialize(next.candidates);
  mutate(next);
  if (stableSerialize(next.candidates) === before) return project;
  var existing = project.editHistory && Array.isArray(project.editHistory.past)
    ? clone(project.editHistory.past)
    : [];
  ensureHistory(next);
  next.editHistory.past = existing.concat([historySnapshot(project)]).slice(-HISTORY_LIMIT);
  next.editHistory.future = [];
  return resetRenderState(next);
}

function findCandidate(project, candidateId) {
  var candidates = project && Array.isArray(project.candidates) ? project.candidates : [];
  return candidates.find(function (candidate) {
    return candidate.candidateId === candidateId;
  }) || null;
}

function requireCandidate(project, candidateId) {
  var candidate = findCandidate(project, candidateId);
  if (!candidate) throw new Error('未找到该方案');
  return candidate;
}

function requireScene(candidate, sceneId) {
  var scene = (candidate.editedScenes || []).find(function (item) {
    return item.sceneId === sceneId;
  });
  if (!scene) throw new Error('未找到该卡片');
  return scene;
}

function textFromScene(scene) {
  var layer = (scene.layers || []).find(function (item) { return item.type === 'text'; });
  return layer ? layer.text : '';
}

function splitText(text, role) {
  var characters = Array.from(text || '');
  if (!characters.length) return [];
  var lineCount = role === 'reveal'
    ? (characters.length <= 4 ? 1 : characters.length <= 12 ? 2 : 3)
    : Math.max(1, Math.ceil(characters.length / 6));
  var lineSize = Math.ceil(characters.length / lineCount);
  var lines = [];
  for (var index = 0; index < characters.length; index += lineSize) {
    lines.push(characters.slice(index, index + lineSize).join(''));
  }
  return lines;
}

function textLength(text) {
  return Array.from(text || '').length;
}

function validateEditedText(role, text) {
  if (!text && role !== 'pause' && role !== 'ending') {
    throw new Error('只有 pause 或 ending 可以留空');
  }
  if (role === 'reveal' && textLength(text) > 40) {
    throw new Error('reveal 文案不能超过 40 字');
  }
  if (role !== 'reveal' && textLength(text) > 12) {
    throw new Error('非 reveal 文案不能超过 12 字');
  }
}

function logicalCardIndex(sceneId) {
  var match = typeof sceneId === 'string' && /^scene_(\d{2})$/.exec(sceneId);
  return match ? Number(match[1]) - 1 : -1;
}

function cardsFromEditedScenes(candidate, textOverrides) {
  return candidate.editedScenes.map(function (scene, index) {
    var sourceCard = candidate.cards[logicalCardIndex(scene.sceneId)] || candidate.cards[index];
    var hasTextOverride = textOverrides && Object.prototype.hasOwnProperty.call(textOverrides, scene.sceneId);
    return Object.assign({}, sourceCard || {}, {
      sceneId: scene.sceneId,
      order: index + 1,
      role: scene.role,
      text: hasTextOverride ? textOverrides[scene.sceneId] : textFromScene(scene)
    });
  });
}

function composeEditedScenes(candidate, stylePackId, textOverrides, options) {
  return composer.composeCandidate(Object.assign({}, candidate, {
    cards: cardsFromEditedScenes(candidate, textOverrides)
  }), stylePackId, options);
}

function createFunTextProject(input) {
  var value = input || {};
  var now = timestamp(value.now);
  var brief = creativeBrief.normalizeCreativeBrief(value);
  var plannedCandidates = Array.isArray(value.candidates) && value.candidates.length === 3
    ? value.candidates
    : null;
  var generationMode = value.generationMode || (plannedCandidates ? 'ai' : 'rules');
  var candidates;

  if (plannedCandidates) {
    candidates = plannedCandidates.map(function (cand) {
      if (cand.editedScenes && cand.stylePackId) return clone(cand);
      var stylePackId = cand.stylePackId || 'pink-note-v1';
      return createCandidate(cand, stylePackId);
    });
  } else {
    var planned = planner.planRuleCandidates(brief);
    var stylePackIds = matcher.matchStylePacks(planned.candidates, brief.variant, brief.preferredStylePackId);
    generationMode = planned.generationMode;
    candidates = planned.candidates.map(function (candidate, index) {
      return createCandidate(candidate, stylePackIds[index]);
    });
  }

  var projectBrief = {
    expressionKey: brief.expressionKey,
    variant: brief.variant
  };
  if (brief.caseId) projectBrief.caseId = brief.caseId;
  if (brief.preferredStrategyId) projectBrief.preferredStrategyId = brief.preferredStrategyId;
  if (brief.preferredStylePackId) projectBrief.preferredStylePackId = brief.preferredStylePackId;

  return {
    projectId: value.projectId || ('funtext_' + now),
    playId: 'fun-text-stack',
    version: 1,
    sourceText: brief.sourceText,
    brief: projectBrief,
    generationMode: generationMode,
    candidates: candidates,
    selectedCandidateId: '',
    renderStatus: 'draft',
    renderedCards: [],
    editHistory: { past: [], future: [] },
    createdAt: now,
    updatedAt: now
  };
}

function replanProject(project) {
  if (!project) throw new Error('项目不存在');
  var next = createFunTextProject({
    projectId: project.projectId,
    sourceText: project.sourceText,
    expressionKey: project.brief && project.brief.expressionKey,
    variant: Number(project.brief && project.brief.variant) + 1,
    caseId: project.brief && project.brief.caseId,
    preferredStrategyId: project.brief && project.brief.preferredStrategyId,
    preferredStylePackId: project.brief && project.brief.preferredStylePackId,
    now: Date.now()
  });
  next.createdAt = project.createdAt;
  return next;
}

function selectCandidate(project, candidateId) {
  requireCandidate(project, candidateId);
  var next = clone(project);
  next.selectedCandidateId = candidateId;
  return resetRenderState(next);
}

function updateCardText(project, candidateId, sceneId, text) {
  if (typeof text !== 'string') throw new Error('卡片文字必须是字符串');
  var sourceCandidate = requireCandidate(project, candidateId);
  var sourceScene = requireScene(sourceCandidate, sceneId);
  validateEditedText(sourceScene.role, text);
  return commitEdit(project, function (next) {
  var candidate = requireCandidate(next, candidateId);
  var scene = requireScene(candidate, sceneId);
  validateEditedText(scene.role, text);

  var textLayer = (scene.layers || []).find(function (layer) { return layer.type === 'text'; });
  if (!text) {
    scene.layers = scene.layers.filter(function (layer) { return layer.type !== 'text'; });
  } else if (textLayer) {
    textLayer.text = text;
    textLayer.lines = splitText(text, scene.role);
  } else {
    var textOverrides = {};
    textOverrides[sceneId] = text;
    var recomposed = composeEditedScenes(candidate, candidate.stylePackId, textOverrides, {
      backgroundVariantKey: scene.backgroundVariantKey,
      paletteKey: scene.paletteKey,
      fontFeelKey: scene.fontFeelKey
    });
    var recomposedScene = recomposed.find(function (item) { return item.sceneId === sceneId; });
    var recomposedText = recomposedScene && recomposedScene.layers.find(function (layer) {
      return layer.type === 'text';
    });
    if (!recomposedText) throw new Error('该卡片没有可编辑文字');
    scene.layers.unshift(recomposedText);
  }

  });
}

function switchCandidateStyle(project, candidateId, stylePackId) {
  if (!stylePacks.getStylePack(stylePackId)) throw new Error('未知视觉包：' + stylePackId);
  requireCandidate(project, candidateId);
  return commitEdit(project, function (next) {
  var candidate = requireCandidate(next, candidateId);
  candidate.stylePackId = stylePackId;
  candidate.originalScenes = clone(composer.composeCandidate(candidate, stylePackId));
  candidate.editedScenes = clone(composeEditedScenes(candidate, stylePackId));
  });
}

function moveCard(project, candidateId, fromIndex, toIndex) {
  var candidate = requireCandidate(project, candidateId);
  var scenes = candidate.editedScenes || [];
  var from = Number(fromIndex);
  var to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= scenes.length || to < 0 || to >= scenes.length || from === to) {
    return project;
  }
  return commitEdit(project, function (next) {
  candidate = requireCandidate(next, candidateId);
  scenes = candidate.editedScenes;
  var moved = scenes.splice(from, 1)[0];
  scenes.splice(to, 0, moved);
  scenes.forEach(function (scene, index) {
    scene.order = index + 1;
  });
  });
}

function updateSceneStyle(scene, pack, changes) {
  var value = changes || {};
  if (value.backgroundVariantKey) {
    var variant = stylePacks.getBackgroundVariant(pack, value.backgroundVariantKey);
    if (!variant) throw new Error('背景不属于当前风格');
    scene.backgroundVariantKey = variant.key;
    scene.background = { assetKey: variant.assetKey, color: variant.color };
  }
  if (value.paletteKey) {
    var palette = stylePacks.getPalette(pack, value.paletteKey);
    if (!palette) throw new Error('配色不属于当前风格');
    scene.paletteKey = palette.key;
    (scene.layers || []).forEach(function (layer) {
      if (layer.type === 'text') layer.color = palette.colors.primary;
    });
  }
  if (value.fontFeelKey) {
    var nextFeel = fontFeels.getFontFeel(value.fontFeelKey);
    if (!nextFeel) throw new Error('字感不在白名单');
    var previousFeel = fontFeels.getFontFeel(scene.fontFeelKey || 'marker') || fontFeels.getFontFeel('marker');
    var ratio = nextFeel.sizeScale / previousFeel.sizeScale;
    scene.fontFeelKey = nextFeel.key;
    (scene.layers || []).forEach(function (layer) {
      if (layer.type !== 'text') return;
      layer.fontKey = nextFeel.key;
      layer.fontFamily = nextFeel.fontFamily;
      layer.fontSize = Math.max(40, Math.min(600, Math.round(layer.fontSize * ratio)));
      layer.lineHeight = Math.max(48, Math.min(720, Math.round(layer.lineHeight * ratio)));
    });
  }
}

function updateCardStyle(project, candidateId, sceneId, changes, scope) {
  var sourceCandidate = requireCandidate(project, candidateId);
  requireScene(sourceCandidate, sceneId);
  var pack = stylePacks.getStylePack(sourceCandidate.stylePackId);
  if (!pack) throw new Error('当前视觉包不可用');
  return commitEdit(project, function (next) {
    var candidate = requireCandidate(next, candidateId);
    var targets = scope === 'stack' ? candidate.editedScenes : [requireScene(candidate, sceneId)];
    targets.forEach(function (scene) { updateSceneStyle(scene, pack, changes); });
  });
}

function setTextSizePreset(project, candidateId, sceneId, preset) {
  if (!SIZE_PRESET_SCALE[preset]) throw new Error('字号档位不合法');
  requireScene(requireCandidate(project, candidateId), sceneId);
  return commitEdit(project, function (next) {
    var scene = requireScene(requireCandidate(next, candidateId), sceneId);
    var layer = (scene.layers || []).find(function (item) { return item.type === 'text'; });
    if (!layer) throw new Error('该卡片没有文字');
    var previous = SIZE_PRESET_SCALE[layer.sizePreset || 'standard'];
    var ratio = SIZE_PRESET_SCALE[preset] / previous;
    layer.fontSize = Math.max(40, Math.min(600, Math.round(layer.fontSize * ratio)));
    layer.lineHeight = Math.max(48, Math.min(720, Math.round(layer.lineHeight * ratio)));
    layer.sizePreset = preset;
  });
}

function addDecoration(project, candidateId, sceneId, assetKey) {
  var asset = assets.getAsset(assetKey);
  if (!asset) throw new Error('装饰素材不在白名单');
  requireScene(requireCandidate(project, candidateId), sceneId);
  return commitEdit(project, function (next) {
    var scene = requireScene(requireCandidate(next, candidateId), sceneId);
    var decorations = scene.layers.filter(function (layer) { return layer.type !== 'text'; });
    if (decorations.length >= 6) throw new Error('每张卡片最多添加 6 个装饰');
    var suffix = 1;
    var id;
    do {
      id = 'user_' + assetKey.replace(/[^A-Za-z0-9_-]/g, '') + '_' + suffix;
      suffix += 1;
    } while (scene.layers.some(function (layer) { return layer.id === id; }));
    scene.layers.push({
      id: id,
      type: asset.type,
      assetKey: asset.key,
      x: 820,
      y: 220,
      rotation: 0,
      scale: 0.8,
      userAdded: true
    });
  });
}

function normalizeRotation(value) {
  var result = Number(value) || 0;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return Math.round(result * 10) / 10;
}

function updateDecorationTransform(project, candidateId, sceneId, layerId, transform) {
  requireScene(requireCandidate(project, candidateId), sceneId);
  return commitEdit(project, function (next) {
    var scene = requireScene(requireCandidate(next, candidateId), sceneId);
    var layer = scene.layers.find(function (item) { return item.id === layerId && item.type !== 'text'; });
    if (!layer) throw new Error('未找到该装饰');
    var value = transform || {};
    if (value.x !== undefined) layer.x = Math.max(0, Math.min(1080, Math.round(Number(value.x) || 0)));
    if (value.y !== undefined) layer.y = Math.max(0, Math.min(1080, Math.round(Number(value.y) || 0)));
    if (value.scale !== undefined) layer.scale = Math.max(0.35, Math.min(2.5, Math.round((Number(value.scale) || 0.35) * 100) / 100));
    if (value.rotation !== undefined) layer.rotation = normalizeRotation(value.rotation);
  });
}

function setDecorationColor(project, candidateId, sceneId, layerId, colorKey) {
  var normalizedKey = colorKey === 'default' || colorKey === '' || colorKey === null ? '' : colorKey;
  if (normalizedKey && !decorationColors.getDecorationColor(normalizedKey)) {
    throw new Error('装饰颜色不在白名单');
  }
  requireScene(requireCandidate(project, candidateId), sceneId);
  return commitEdit(project, function (next) {
    var scene = requireScene(requireCandidate(next, candidateId), sceneId);
    var layer = scene.layers.find(function (item) { return item.id === layerId && item.type !== 'text'; });
    if (!layer) throw new Error('未找到该装饰');
    if (normalizedKey) layer.decorationColorKey = normalizedKey;
    else delete layer.decorationColorKey;
  });
}

function removeDecoration(project, candidateId, sceneId, layerId) {
  requireScene(requireCandidate(project, candidateId), sceneId);
  return commitEdit(project, function (next) {
    var scene = requireScene(requireCandidate(next, candidateId), sceneId);
    var index = scene.layers.findIndex(function (item) { return item.id === layerId && item.type !== 'text'; });
    if (index < 0) throw new Error('未找到该装饰');
    scene.layers.splice(index, 1);
  });
}

function moveDecorationLayer(project, candidateId, sceneId, layerId, direction) {
  if (direction !== 'forward' && direction !== 'backward') throw new Error('层级方向不合法');
  requireScene(requireCandidate(project, candidateId), sceneId);
  return commitEdit(project, function (next) {
    var scene = requireScene(requireCandidate(next, candidateId), sceneId);
    var index = scene.layers.findIndex(function (item) { return item.id === layerId && item.type !== 'text'; });
    if (index < 0) throw new Error('未找到该装饰');
    var target = direction === 'forward' ? index + 1 : index - 1;
    while (target >= 0 && target < scene.layers.length && scene.layers[target].type === 'text') {
      target += direction === 'forward' ? 1 : -1;
    }
    if (target < 0 || target >= scene.layers.length) return;
    var moved = scene.layers.splice(index, 1)[0];
    scene.layers.splice(target, 0, moved);
  });
}

function restoreCard(project, candidateId, sceneId) {
  var sourceCandidate = requireCandidate(project, candidateId);
  requireScene(sourceCandidate, sceneId);
  return commitEdit(project, function (next) {
    var candidate = requireCandidate(next, candidateId);
    var index = candidate.editedScenes.findIndex(function (scene) { return scene.sceneId === sceneId; });
    var original = candidate.originalScenes.find(function (scene) { return scene.sceneId === sceneId; });
    if (!original) throw new Error('未找到原始卡片');
    var restored = clone(original);
    restored.order = candidate.editedScenes[index].order;
    candidate.editedScenes[index] = restored;
  });
}

function restoreCandidate(project, candidateId) {
  requireCandidate(project, candidateId);
  return commitEdit(project, function (next) {
    var candidate = requireCandidate(next, candidateId);
    candidate.editedScenes = clone(candidate.originalScenes);
  });
}

function undoEdit(project) {
  var next = clone(project);
  var history = ensureHistory(next);
  if (!history.past.length) return project;
  var target = history.past.pop();
  history.future = history.future.concat([historySnapshot(project)]).slice(-HISTORY_LIMIT);
  next.candidates = clone(target.candidates);
  next.selectedCandidateId = target.selectedCandidateId;
  return resetRenderState(next);
}

function redoEdit(project) {
  var next = clone(project);
  var history = ensureHistory(next);
  if (!history.future.length) return project;
  var target = history.future.pop();
  history.past = history.past.concat([historySnapshot(project)]).slice(-HISTORY_LIMIT);
  next.candidates = clone(target.candidates);
  next.selectedCandidateId = target.selectedCandidateId;
  return resetRenderState(next);
}

function buildPreviewPayload(project) {
  return {
    projectId: project.projectId,
    sourceText: project.sourceText,
    candidates: project.candidates.map(function (candidate) {
      return {
        candidateId: candidate.candidateId,
        stylePackId: candidate.stylePackId,
        scenes: clone(candidate.editedScenes)
      };
    })
  };
}

function validateCandidateCards(candidate) {
  if (!candidate || !Array.isArray(candidate.cards) || candidate.cards.length < 3 || candidate.cards.length > 8) {
    throw new Error('候选卡片数量必须在 3 到 8 张之间');
  }
  candidate.cards.forEach(function (card, index) {
    if (!card || card.order !== index + 1) throw new Error('候选卡片序号必须连续');
    if (candidateValidator.ALLOWED_ROLES.indexOf(card.role) < 0) {
      throw new Error('候选卡片角色无效');
    }
    if (typeof card.text !== 'string') throw new Error('候选卡片文字必须是字符串');
  });
}

function validateRenderScenes(candidate) {
  if (!Array.isArray(candidate.editedScenes) || candidate.editedScenes.length < 3 || candidate.editedScenes.length > 8) {
    throw new Error('渲染卡片数量必须在 3 到 8 张之间');
  }
  if (candidate.editedScenes.length !== candidate.cards.length) {
    throw new Error('场景数量必须与候选卡片一致');
  }
  var sceneIds = new Set();
  candidate.editedScenes.forEach(function (scene, index) {
    if (!scene || scene.order !== index + 1) throw new Error('场景顺序不合法');
    if (typeof scene.sceneId !== 'string' || sceneIds.has(scene.sceneId)) {
      throw new Error('场景 sceneId 必须唯一');
    }
    sceneIds.add(scene.sceneId);
    var logicalIndex = logicalCardIndex(scene.sceneId);
    var logicalCard = candidate.cards[logicalIndex];
    if (!logicalCard || scene.role !== logicalCard.role) {
      throw new Error('场景与逻辑卡片不一致');
    }
    var validation = composer.validateScene(scene);
    if (!validation.valid) throw new Error('场景不合法：' + validation.errors.join('；'));
  });
}

function buildRenderPayload(project) {
  if (!project || !project.selectedCandidateId) throw new Error('请先选择一套方案');
  var candidate = requireCandidate(project, project.selectedCandidateId);
  validateCandidateCards(candidate);
  validateRenderScenes(candidate);
  return {
    projectId: project.projectId,
    sourceText: project.sourceText,
    candidateId: candidate.candidateId,
    stylePackId: candidate.stylePackId,
    scenes: clone(candidate.editedScenes)
  };
}

function createRenderFingerprint(project) {
  var payload = buildRenderPayload(project);
  var serialized = stableSerialize({
    projectId: payload.projectId,
    playId: project.playId,
    version: project.version,
    sourceText: payload.sourceText,
    selectedCandidateId: project.selectedCandidateId,
    candidateId: payload.candidateId,
    stylePackId: payload.stylePackId,
    scenes: payload.scenes
  });
  return 'funtext-render-v1:' + serialized.length.toString(16) + ':' + hashFingerprint(serialized);
}

function buildPreviewGroups(project, renderedCards) {
  if (!project || !project.selectedCandidateId) return [];
  var candidate = requireCandidate(project, project.selectedCandidateId);
  var cards = Array.isArray(renderedCards) ? renderedCards : [];
  return [{
    key: candidate.candidateId,
    name: '趣味字画',
    cards: cards.map(function (card, index) {
      return Object.assign({}, card, {
        id: card.sceneId || card.id || ('card_' + (index + 1)),
        num: ('0' + (index + 1)).slice(-2),
        ratio: '1:1'
      });
    })
  }];
}

module.exports = {
  createFunTextProject: createFunTextProject,
  replanProject: replanProject,
  selectCandidate: selectCandidate,
  updateCardText: updateCardText,
  switchCandidateStyle: switchCandidateStyle,
  moveCard: moveCard,
  updateCardStyle: updateCardStyle,
  setTextSizePreset: setTextSizePreset,
  addDecoration: addDecoration,
  updateDecorationTransform: updateDecorationTransform,
  setDecorationColor: setDecorationColor,
  removeDecoration: removeDecoration,
  moveDecorationLayer: moveDecorationLayer,
  restoreCard: restoreCard,
  restoreCandidate: restoreCandidate,
  undoEdit: undoEdit,
  redoEdit: redoEdit,
  buildPreviewPayload: buildPreviewPayload,
  buildRenderPayload: buildRenderPayload,
  createRenderFingerprint: createRenderFingerprint,
  buildPreviewGroups: buildPreviewGroups
};
