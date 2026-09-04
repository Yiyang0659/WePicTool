var MANIFEST_VERSION = 1;
var BADGE_STYLE_VERSION = 1;
var STACK_THRESHOLD = 3;
var MAX_STACK_CARDS = 99;

var OUTFIT_STACKS = [
  { key: 'tops', title: '上衣组' },
  { key: 'bottoms', title: '下装组' },
  { key: 'shoes', title: '鞋子组' }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
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

function formatSequenceLabel(sequence) {
  var number = Number(sequence);
  if (!Number.isInteger(number) || number < 1 || number > MAX_STACK_CARDS) {
    throw new Error('叠图序号必须在 1 到 99 之间');
  }
  return number < 10 ? '0' + number : String(number);
}

function isSupportedSourceUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  var value = url.trim();
  if (/^(cloud|wxfile):\/\//.test(value)) return true;
  if (/^https:\/\//.test(value)) return true;
  if (/^(\/|[A-Za-z]:[\\/])/.test(value)) return true;
  if (/^http:\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/.test(value)) return true;
  return false;
}

function sourceUrlFor(item) {
  var input = item || {};
  return input.exportUrl || input.composedUrl || input.displayUrl || input.mattedUrl || input.url || input.fileId || input.localPath || input.tempFilePath || '';
}

function identityFor(item) {
  var input = item || {};
  return input.cardId || input.sceneId || input.resultId || input.id || input.sourceImageId || input.assetId || '';
}

function cardFromItem(item, index, ratio) {
  var cardId = identityFor(item);
  if (!cardId) throw new Error('导出卡片缺少稳定 cardId');
  var sourceUrl = sourceUrlFor(item);
  if (!isSupportedSourceUrl(sourceUrl)) throw new Error('图片路径协议不支持: ' + sourceUrl);
  var sequence = index + 1;
  return {
    cardId: String(cardId),
    sequence: sequence,
    sequenceLabel: formatSequenceLabel(sequence),
    isCover: sequence === 1,
    sourceUrl: sourceUrl.trim(),
    exportUrl: typeof item.exportUrl === 'string' ? item.exportUrl.trim() : '',
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    ratio: item.composedRatio || item.ratio || ratio || ''
  };
}

function stackFromItems(definition, items, ratio) {
  var cards = (Array.isArray(items) ? items : []).map(function (item, index) {
    return cardFromItem(item, index, ratio);
  });
  return {
    stackId: definition.key,
    title: definition.title,
    minCards: STACK_THRESHOLD,
    canExport: cards.length >= STACK_THRESHOLD,
    cards: cards
  };
}

function stripRuntimeFields(value) {
  if (Array.isArray(value)) return value.map(stripRuntimeFields);
  if (!value || typeof value !== 'object') return value;
  var result = {};
  Object.keys(value).forEach(function (key) {
    if (key === 'fingerprint' || key === 'exportUrl') return;
    result[key] = stripRuntimeFields(value[key]);
  });
  return result;
}

function manifestFingerprint(manifest) {
  return hashFingerprint(stableSerialize(stripRuntimeFields(manifest)));
}

function finalizeManifest(input) {
  var manifest = Object.assign({
    version: MANIFEST_VERSION,
    badgeStyleVersion: BADGE_STYLE_VERSION
  }, input);
  manifest.fingerprint = manifestFingerprint(manifest);
  validateManifest(manifest);
  return manifest;
}

function buildOutfitManifest(taskId, groups, ratio) {
  var sourceGroups = groups || {};
  return finalizeManifest({
    playId: 'outfit',
    projectId: String(taskId || ''),
    ratio: ratio || '4:5',
    stacks: OUTFIT_STACKS.map(function (definition) {
      return stackFromItems(definition, sourceGroups[definition.key], ratio || '4:5');
    })
  });
}

function buildDressupManifest(project, groupDefinitions) {
  var input = project || {};
  var definitions = Array.isArray(groupDefinitions) ? groupDefinitions : [];
  return finalizeManifest({
    playId: 'layered-dressup',
    projectId: String(input.projectId || ''),
    ratio: input.ratio || '4:5',
    stacks: definitions.map(function (definition) {
      return stackFromItems(definition, input.groups && input.groups[definition.key], input.ratio || '4:5');
    })
  });
}

function findSelectedCandidate(project) {
  var candidates = project && Array.isArray(project.candidates) ? project.candidates : [];
  for (var index = 0; index < candidates.length; index++) {
    if (candidates[index].candidateId === project.selectedCandidateId) return candidates[index];
  }
  return null;
}

function buildFunTextManifest(project, renderedCards) {
  var input = project || {};
  var selected = findSelectedCandidate(input);
  if (!selected) throw new Error('趣味字画缺少已选择方案');
  var rendered = Array.isArray(renderedCards) ? renderedCards : [];
  var byId = {};
  rendered.forEach(function (card) {
    var id = identityFor(card);
    if (!id || byId[id]) throw new Error('趣味字画渲染卡片身份无效');
    byId[id] = card;
  });
  var scenes = Array.isArray(selected.editedScenes) ? selected.editedScenes : [];
  var ordered = scenes.map(function (scene) {
    var card = byId[scene.sceneId];
    if (!card) throw new Error('趣味字画渲染卡片与场景不匹配: ' + scene.sceneId);
    return Object.assign({}, card, { cardId: scene.sceneId });
  });
  if (ordered.length !== rendered.length) throw new Error('趣味字画渲染卡片数量不匹配');
  return finalizeManifest({
    playId: 'fun-text-stack',
    projectId: String(input.projectId || ''),
    projectVersion: Number(input.version) || 1,
    ratio: '1:1',
    stacks: [stackFromItems({ key: selected.candidateId, title: selected.title || '趣味字画' }, ordered, '1:1')]
  });
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('导出 manifest 不存在');
  if (manifest.version !== MANIFEST_VERSION) throw new Error('导出 manifest 版本不支持');
  if (!manifest.playId || !manifest.projectId) throw new Error('导出 manifest 缺少玩法或项目身份');
  if (!Number.isInteger(manifest.badgeStyleVersion) || manifest.badgeStyleVersion < 1) {
    throw new Error('导出角标版本无效');
  }
  if (!Array.isArray(manifest.stacks) || !manifest.stacks.length) throw new Error('导出 manifest 没有叠图分组');

  var stackIds = {};
  manifest.stacks.forEach(function (stack) {
    if (!stack || !stack.stackId) throw new Error('导出叠缺少 stackId');
    if (stackIds[stack.stackId]) throw new Error('stackId 重复: ' + stack.stackId);
    stackIds[stack.stackId] = true;
    if (!Array.isArray(stack.cards)) throw new Error('导出叠 cards 无效');
    if (stack.cards.length > MAX_STACK_CARDS) throw new Error('单叠不能超过 99 张');
    var cardIds = {};
    stack.cards.forEach(function (card, index) {
      if (!card || !card.cardId) throw new Error('导出卡片缺少 cardId');
      if (cardIds[card.cardId]) throw new Error('cardId 重复: ' + card.cardId);
      cardIds[card.cardId] = true;
      var expected = index + 1;
      if (card.sequence !== expected || card.sequenceLabel !== formatSequenceLabel(expected)) {
        throw new Error('导出卡片序号不连续');
      }
      if (card.isCover !== (expected === 1)) throw new Error('导出叠封面标记无效');
      if (!isSupportedSourceUrl(card.sourceUrl)) throw new Error('图片路径协议不支持: ' + card.sourceUrl);
      if (card.exportUrl && !isSupportedSourceUrl(card.exportUrl)) throw new Error('导出图片路径协议不支持: ' + card.exportUrl);
    });
  });
  return true;
}

function flattenManifest(manifest, stackIds) {
  validateManifest(manifest);
  var allowed = Array.isArray(stackIds) && stackIds.length ? {} : null;
  if (allowed) stackIds.forEach(function (id) { allowed[id] = true; });
  var result = [];
  manifest.stacks.forEach(function (stack) {
    if (allowed && !allowed[stack.stackId]) return;
    stack.cards.forEach(function (card) {
      result.push(Object.assign({
        stackId: stack.stackId,
        stackTitle: stack.title,
        canExport: stack.canExport
      }, clone(card)));
    });
  });
  return result;
}

module.exports = {
  MANIFEST_VERSION: MANIFEST_VERSION,
  BADGE_STYLE_VERSION: BADGE_STYLE_VERSION,
  MAX_STACK_CARDS: MAX_STACK_CARDS,
  formatSequenceLabel: formatSequenceLabel,
  isSupportedSourceUrl: isSupportedSourceUrl,
  manifestFingerprint: manifestFingerprint,
  buildOutfitManifest: buildOutfitManifest,
  buildDressupManifest: buildDressupManifest,
  buildFunTextManifest: buildFunTextManifest,
  validateManifest: validateManifest,
  flattenManifest: flattenManifest
};
