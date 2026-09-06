const registry = require('../config/playRegistry');

const GROUP_DEFINITIONS = registry.GROUP_DEFINITIONS;
const STACK_THRESHOLD = registry.STACK_THRESHOLD;
const GROUP_KEYS = GROUP_DEFINITIONS.map(function (group) { return group.key; });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyGroups() {
  var groups = {};
  GROUP_KEYS.forEach(function (key) { groups[key] = []; });
  return groups;
}

function getGroupDefinition(groupKey) {
  for (var i = 0; i < GROUP_DEFINITIONS.length; i++) {
    if (GROUP_DEFINITIONS[i].key === groupKey) return GROUP_DEFINITIONS[i];
  }
  return null;
}

function reindex(items, groupKey) {
  var definition = getGroupDefinition(groupKey);
  var title = definition ? definition.title : groupKey;
  return (items || []).map(function (item, index) {
    return Object.assign({}, item, {
      groupKey: groupKey,
      order: index + 1,
      label: title + ' ' + (index + 1)
    });
  });
}

function normalizeItem(item, groupKey, source, index, seed) {
  var input = item || {};
  var url = input.url || input.localPath || input.tempFilePath || input.fileId || '';
  return {
    id: input.id || input.assetId || (source + '_' + seed + '_' + index),
    assetId: input.assetId || (source === 'system' ? input.id || '' : ''),
    groupKey: groupKey,
    source: source,
    title: input.title || '',
    url: url,
    localPath: input.localPath || input.tempFilePath || url,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    size: Number(input.size) || 0,
    license: input.license || (source === 'system' ? 'project-owned' : 'user-owned'),
    order: index + 1
  };
}

function resolveSourceMode(currentMode, addedSource) {
  if (addedSource === 'user') {
    return currentMode === 'demo' || currentMode === 'mixed' ? 'mixed' : 'upload';
  }
  if (addedSource === 'system') {
    return currentMode === 'upload' || currentMode === 'mixed' ? 'mixed' : 'demo';
  }
  return currentMode;
}

function createProject(options) {
  var input = options || {};
  var now = Number(input.now) || Date.now();
  var sourceMode = input.sourceMode === 'demo' ? 'demo' : 'upload';
  var templateId = sourceMode === 'demo'
    ? (input.templateId || 'funny-paper-doll-v1')
    : (input.templateId || '');
  var groups = emptyGroups();

  if (sourceMode === 'demo') {
    var pack = registry.getAssetPack(templateId);
    if (!pack || !registry.validateAssetPack(pack).valid) {
      throw new Error('内置素材包不可用: ' + templateId);
    }
    GROUP_KEYS.forEach(function (groupKey) {
      groups[groupKey] = reindex(pack.groups[groupKey].map(function (item, index) {
        return normalizeItem(item, groupKey, 'system', index, now);
      }), groupKey);
    });
  }

  return {
    projectId: input.projectId || ('layered_' + now),
    playId: 'layered-dressup',
    sourceMode: sourceMode,
    templateId: templateId,
    ratio: input.ratio || '4:5',
    labelMode: input.labelMode || 'clean',
    groups: groups,
    createdAt: now,
    updatedAt: now
  };
}

function addItems(project, groupKey, items, source) {
  var definition = getGroupDefinition(groupKey);
  if (!definition) throw new Error('未知分组: ' + groupKey);
  var next = clone(project);
  var current = Array.isArray(next.groups[groupKey]) ? next.groups[groupKey] : [];
  var candidates = Array.isArray(items) ? items : [];
  var remaining = Math.max(0, definition.maxCount - current.length);
  var seed = Number(next.updatedAt) || Date.now();
  var normalized = candidates.slice(0, remaining)
    .map(function (item, index) {
      return normalizeItem(item, groupKey, source, index, seed);
    })
    .filter(function (item) { return Boolean(item.url); });

  next.groups[groupKey] = reindex(current.concat(normalized), groupKey);
  next.sourceMode = resolveSourceMode(next.sourceMode, source);
  next.updatedAt = Date.now();
  return next;
}

function removeItem(project, groupKey, itemId) {
  var definition = getGroupDefinition(groupKey);
  if (!definition) throw new Error('未知分组: ' + groupKey);
  var next = clone(project);
  next.groups[groupKey] = reindex((next.groups[groupKey] || []).filter(function (item) {
    return item.id !== itemId;
  }), groupKey);
  next.updatedAt = Date.now();
  return next;
}

function moveItem(project, groupKey, fromIndex, toIndex) {
  var definition = getGroupDefinition(groupKey);
  if (!definition) throw new Error('未知分组: ' + groupKey);
  var next = clone(project);
  var items = (next.groups[groupKey] || []).slice();
  var from = Number(fromIndex);
  var to = Number(toIndex);
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) {
    return next;
  }
  var moved = items.splice(from, 1)[0];
  items.splice(to, 0, moved);
  next.groups[groupKey] = reindex(items, groupKey);
  next.updatedAt = Date.now();
  return next;
}

function buildSendability(project) {
  var groups = {};
  var validGroupCount = 0;
  var totalExportCount = 0;

  GROUP_DEFINITIONS.forEach(function (definition) {
    var count = project && project.groups && Array.isArray(project.groups[definition.key])
      ? project.groups[definition.key].length
      : 0;
    var mode = count === 0 ? 'empty' : (count >= STACK_THRESHOLD ? 'stackable' : 'normal');
    if (mode === 'stackable') {
      validGroupCount += 1;
      totalExportCount += count;
    }
    groups[definition.key] = {
      count: count,
      mode: mode,
      missing: Math.max(0, STACK_THRESHOLD - count),
      canExport: mode === 'stackable'
    };
  });

  return {
    threshold: STACK_THRESHOLD,
    groups: groups,
    validGroupCount: validGroupCount,
    totalExportCount: totalExportCount,
    canExport: validGroupCount > 0
  };
}

function buildPreviewGroups(project) {
  var groups = [];
  GROUP_DEFINITIONS.forEach(function (definition) {
    var items = project && project.groups && Array.isArray(project.groups[definition.key])
      ? project.groups[definition.key]
      : [];
    var cards = items.filter(function (item) { return Boolean(item.url); }).map(function (item, index) {
      return {
        id: item.id,
        url: item.url,
        num: ('0' + (index + 1)).slice(-2),
        width: item.width || 0,
        height: item.height || 0,
        ratio: project.ratio || '4:5'
      };
    });
    if (cards.length > 0) {
      groups.push({
        key: definition.key,
        name: definition.emoji + ' ' + definition.title,
        cards: cards
      });
    }
  });
  return groups;
}

function serializeProject(project) {
  return clone(project);
}

module.exports = {
  GROUP_KEYS: GROUP_KEYS,
  createProject: createProject,
  addItems: addItems,
  removeItem: removeItem,
  moveItem: moveItem,
  buildSendability: buildSendability,
  buildPreviewGroups: buildPreviewGroups,
  serializeProject: serializeProject
};
