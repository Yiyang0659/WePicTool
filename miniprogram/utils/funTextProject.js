var creativeBrief = require('./creativeBrief');
var planner = require('./candidatePlanner');
var matcher = require('./styleMatcher');
var composer = require('./sceneComposer');
var stylePacks = require('../config/stylePacks');
var candidateValidator = require('./candidateValidator');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function composeEditedScenes(candidate, stylePackId, textOverrides) {
  return composer.composeCandidate(Object.assign({}, candidate, {
    cards: cardsFromEditedScenes(candidate, textOverrides)
  }), stylePackId);
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
    var stylePackIds = matcher.matchStylePacks(planned.candidates, brief.variant);
    generationMode = planned.generationMode;
    candidates = planned.candidates.map(function (candidate, index) {
      return createCandidate(candidate, stylePackIds[index]);
    });
  }

  return {
    projectId: value.projectId || ('funtext_' + now),
    playId: 'fun-text-stack',
    version: 1,
    sourceText: brief.sourceText,
    brief: {
      expressionKey: brief.expressionKey,
      variant: brief.variant
    },
    generationMode: generationMode,
    candidates: candidates,
    selectedCandidateId: '',
    renderStatus: 'draft',
    renderedCards: [],
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
  var next = clone(project);
  var candidate = requireCandidate(next, candidateId);
  var scene = (candidate.editedScenes || []).find(function (item) {
    return item.sceneId === sceneId;
  });
  if (!scene) throw new Error('未找到该卡片');
  if (typeof text !== 'string') throw new Error('卡片文字必须是字符串');
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
    var recomposed = composeEditedScenes(candidate, candidate.stylePackId, textOverrides);
    var recomposedScene = recomposed.find(function (item) { return item.sceneId === sceneId; });
    var recomposedText = recomposedScene && recomposedScene.layers.find(function (layer) {
      return layer.type === 'text';
    });
    if (!recomposedText) throw new Error('该卡片没有可编辑文字');
    scene.layers.unshift(recomposedText);
  }

  return resetRenderState(next);
}

function switchCandidateStyle(project, candidateId, stylePackId) {
  if (!stylePacks.getStylePack(stylePackId)) throw new Error('未知视觉包：' + stylePackId);
  var next = clone(project);
  var candidate = requireCandidate(next, candidateId);
  candidate.stylePackId = stylePackId;
  candidate.originalScenes = clone(composer.composeCandidate(candidate, stylePackId));
  candidate.editedScenes = clone(composeEditedScenes(candidate, stylePackId));
  return resetRenderState(next);
}

function moveCard(project, candidateId, fromIndex, toIndex) {
  var candidate = requireCandidate(project, candidateId);
  var scenes = candidate.editedScenes || [];
  var from = Number(fromIndex);
  var to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= scenes.length || to < 0 || to >= scenes.length || from === to) {
    return project;
  }
  var next = clone(project);
  candidate = requireCandidate(next, candidateId);
  scenes = candidate.editedScenes;
  var moved = scenes.splice(from, 1)[0];
  scenes.splice(to, 0, moved);
  scenes.forEach(function (scene, index) {
    scene.order = index + 1;
  });
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

function buildPreviewGroups(project, renderedCards) {
  if (!project || !project.selectedCandidateId) return [];
  var candidate = requireCandidate(project, project.selectedCandidateId);
  var cards = Array.isArray(renderedCards) ? renderedCards : [];
  return [{
    key: candidate.candidateId,
    name: candidate.title,
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
  buildPreviewPayload: buildPreviewPayload,
  buildRenderPayload: buildRenderPayload,
  buildPreviewGroups: buildPreviewGroups
};
