const registry = require('../config/playRegistry');

const GROUP_DEFINITIONS = registry.GROUP_DEFINITIONS;
const STACK_THRESHOLD = registry.STACK_THRESHOLD;
const GROUP_KEYS = GROUP_DEFINITIONS.map(function (group) { return group.key; });
const PENDING_MAX_COUNT = 36;

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

function reindexPending(items) {
  return (items || []).map(function (item, index) {
    return Object.assign({}, item, {
      groupKey: 'pending',
      order: index + 1,
      label: '待确认素材 ' + (index + 1)
    });
  });
}

function itemIdentity(item) {
  var input = item || {};
  return input.sourceImageId || input.originalFileId || input.originalUrl || input.assetId || input.url || input.fileId || input.localPath || input.tempFilePath || input.id || '';
}

function normalizeItem(item, groupKey, source, index, seed) {
  var input = item || {};
  var processedUrl = input.processedUrl || input.mattedUrl || input.mattedFileId || '';
  var originalUrl = input.originalUrl || input.originalFileId || input.localPath || input.tempFilePath || input.url || input.fileId || '';
  var url = processedUrl || input.url || input.localPath || input.tempFilePath || input.fileId || originalUrl;
  return {
    id: input.id || input.resultId || input.assetId || (source + '_' + seed + '_' + index),
    assetId: input.assetId || (source === 'system' ? input.id || '' : ''),
    sourceImageId: input.sourceImageId || input.imageId || '',
    groupKey: groupKey,
    source: source,
    title: input.title || '',
    url: url,
    localPath: input.localPath || input.tempFilePath || url,
    fileId: input.fileId || '',
    originalUrl: originalUrl,
    originalFileId: input.originalFileId || '',
    processedUrl: processedUrl,
    mattedUrl: input.mattedUrl || '',
    mattedFileId: input.mattedFileId || '',
    matted: input.matted === true,
    type: input.type || '',
    classification: input.classification || null,
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    size: Number(input.size) || 0,
    license: input.license || (source === 'system' ? 'project-owned' : 'user-owned'),
    order: index + 1
  };
}

function resolveSourceMode(currentMode, addedSource) {
  if (addedSource === 'user' || addedSource === 'ai') {
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
    pendingItems: [],
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

function mergeImportedItems(project, importedGroups, pendingItems, source) {
  var next = clone(project);
  var addedSource = source || 'ai';
  var groups = importedGroups || {};
  var incomingPending = Array.isArray(pendingItems) ? pendingItems : [];
  var identities = {};
  var addedCount = 0;
  var duplicateCount = 0;
  var overflowCount = 0;
  var seed = Date.now();

  next.pendingItems = Array.isArray(next.pendingItems) ? next.pendingItems : [];
  GROUP_KEYS.forEach(function (groupKey) {
    next.groups[groupKey] = Array.isArray(next.groups[groupKey]) ? next.groups[groupKey] : [];
    next.groups[groupKey].forEach(function (item) {
      var identity = itemIdentity(item);
      if (identity) identities[identity] = true;
    });
  });
  next.pendingItems.forEach(function (item) {
    var identity = itemIdentity(item);
    if (identity) identities[identity] = true;
  });

  function accept(item, preferredGroupKey, index) {
    var identity = itemIdentity(item);
    if (!identity || identities[identity]) {
      duplicateCount += 1;
      return;
    }
    identities[identity] = true;
    var definition = getGroupDefinition(preferredGroupKey);
    var targetHasRoom = definition && next.groups[preferredGroupKey].length < definition.maxCount;
    if (targetHasRoom) {
      next.groups[preferredGroupKey].push(normalizeItem(item, preferredGroupKey, addedSource, index, seed));
      addedCount += 1;
      return;
    }
    if (next.pendingItems.length < PENDING_MAX_COUNT) {
      next.pendingItems.push(normalizeItem(item, 'pending', addedSource, index, seed));
      addedCount += 1;
      if (definition) overflowCount += 1;
    }
  }

  GROUP_KEYS.forEach(function (groupKey) {
    (Array.isArray(groups[groupKey]) ? groups[groupKey] : []).forEach(function (item, index) {
      accept(item, groupKey, index);
    });
  });
  incomingPending.forEach(function (item, index) { accept(item, 'pending', index); });

  GROUP_KEYS.forEach(function (groupKey) {
    next.groups[groupKey] = reindex(next.groups[groupKey], groupKey);
  });
  next.pendingItems = reindexPending(next.pendingItems);
  next.sourceMode = resolveSourceMode(next.sourceMode, addedSource);
  next.updatedAt = Date.now();

  return {
    project: next,
    addedCount: addedCount,
    duplicateCount: duplicateCount,
    overflowCount: overflowCount,
    pendingCount: next.pendingItems.length
  };
}

function assignPendingItem(project, itemId, groupKey) {
  var definition = getGroupDefinition(groupKey);
  if (!definition) return { project: clone(project), assigned: false, reason: 'unknown-group' };
  var next = clone(project);
  next.pendingItems = Array.isArray(next.pendingItems) ? next.pendingItems : [];
  next.groups[groupKey] = Array.isArray(next.groups[groupKey]) ? next.groups[groupKey] : [];
  if (next.groups[groupKey].length >= definition.maxCount) {
    return { project: next, assigned: false, reason: 'group-full' };
  }
  var index = next.pendingItems.findIndex(function (item) { return item.id === itemId; });
  if (index < 0) return { project: next, assigned: false, reason: 'not-found' };
  var item = next.pendingItems.splice(index, 1)[0];
  next.groups[groupKey].push(normalizeItem(item, groupKey, item.source || 'ai', next.groups[groupKey].length, Date.now()));
  next.groups[groupKey] = reindex(next.groups[groupKey], groupKey);
  next.pendingItems = reindexPending(next.pendingItems);
  next.updatedAt = Date.now();
  return { project: next, assigned: true, reason: '' };
}

function removePendingItem(project, itemId) {
  var next = clone(project);
  next.pendingItems = reindexPending((next.pendingItems || []).filter(function (item) {
    return item.id !== itemId;
  }));
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
  mergeImportedItems: mergeImportedItems,
  assignPendingItem: assignPendingItem,
  removePendingItem: removePendingItem,
  buildSendability: buildSendability,
  buildPreviewGroups: buildPreviewGroups,
  serializeProject: serializeProject
};
