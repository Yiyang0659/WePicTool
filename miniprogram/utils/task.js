const PROCESSABLE_GROUPS = ['tops', 'bottoms', 'shoes'];
const OTHER_GROUP = 'others';
const GROUP_KEYS = PROCESSABLE_GROUPS.concat(OTHER_GROUP);

const GROUP_META = {
  tops: {
    title: '上衣组',
    itemLabel: '上衣',
    saveLabel: '保存上衣组'
  },
  bottoms: {
    title: '下装组',
    itemLabel: '下装',
    saveLabel: '保存下装组'
  },
  shoes: {
    title: '鞋子组',
    itemLabel: '鞋子',
    saveLabel: '保存鞋子组'
  },
  others: {
    title: '未处理素材区',
    itemLabel: '素材',
    saveLabel: '保存素材'
  }
};

function calculateTargetSize(width, height, maxLongSide) {
  const maxSide = maxLongSide || 1600;
  const longSide = Math.max(width, height);

  if (!width || !height || longSide <= maxSide) {
    return {
      width,
      height,
      scale: 1
    };
  }

  const scale = maxSide / longSide;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale
  };
}

function createEmptyGroups() {
  return {
    tops: [],
    bottoms: [],
    shoes: [],
    others: []
  };
}

function normalizeGroupKey(groupKey) {
  if (groupKey === 'unprocessed') return OTHER_GROUP;
  if (GROUP_KEYS.indexOf(groupKey) !== -1) return groupKey;
  return OTHER_GROUP;
}

function getMockCategory(index) {
  if (index < 3) return 'tops';
  if (index < 6) return 'bottoms';
  if (index < 9) return 'shoes';
  return OTHER_GROUP;
}

function getItemUrl(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.url || item.fileId || item.localPath || item.tempFilePath || item.path || '';
}

function normalizeResultItem(item, groupKey, index) {
  const meta = GROUP_META[groupKey] || GROUP_META[OTHER_GROUP];
  const url = getItemUrl(item);
  const base = typeof item === 'string' ? {} : Object.assign({}, item);

  return Object.assign(base, {
    resultId: base.resultId || `${groupKey}_${index + 1}`,
    sourceImageId: base.sourceImageId || base.imageId || `${groupKey}_image_${index + 1}`,
    category: normalizeGroupKey(base.category || groupKey),
    type: base.type || 'mockOriginal',
    status: base.status || 'done',
    url,
    fileId: base.fileId || (url.indexOf('cloud://') === 0 ? url : ''),
    localPath: base.localPath || (!/^cloud:\/\//.test(url) && !/^https?:\/\//.test(url) ? url : ''),
    width: base.width || 0,
    height: base.height || 0,
    size: base.size || 0,
    order: index + 1,
    label: `${meta.itemLabel} ${index + 1}`,
    error: base.error || null
  });
}

function labelGroupItems(groups) {
  Object.keys(groups).forEach((key) => {
    const groupKey = normalizeGroupKey(key);
    groups[groupKey] = (groups[groupKey] || []).map((item, index) => {
      return normalizeResultItem(item, groupKey, index);
    });
  });

  return groups;
}

function normalizeTaskGroups(rawGroups) {
  const groups = createEmptyGroups();
  const sourceGroups = rawGroups || {};

  Object.keys(sourceGroups).forEach((key) => {
    const groupKey = normalizeGroupKey(key);
    const items = Array.isArray(sourceGroups[key]) ? sourceGroups[key] : [];
    groups[groupKey] = groups[groupKey].concat(items);
  });

  return labelGroupItems(groups);
}

function buildSendability(groups, threshold) {
  const stackThreshold = threshold || 3;
  const normalizedGroups = groups || createEmptyGroups();
  const result = {};
  let totalProcessableCount = 0;
  let filledProcessableGroupCount = 0;
  let stackableGroupCount = 0;

  PROCESSABLE_GROUPS.forEach((groupKey) => {
    const count = (normalizedGroups[groupKey] || []).length;
    totalProcessableCount += count;

    if (count > 0) {
      filledProcessableGroupCount += 1;
    }

    if (count >= stackThreshold) {
      stackableGroupCount += 1;
      result[groupKey] = {
        count,
        mode: 'stackable',
        message: '可形成微信叠图效果'
      };
      return;
    }

    if (count > 0) {
      result[groupKey] = {
        count,
        mode: 'normal',
        message: '可保存，但可能按普通图片展示'
      };
      return;
    }

    result[groupKey] = {
      count,
      mode: 'empty',
      message: '暂无素材'
    };
  });

  const allFilledGroupsBelowThreshold =
    totalProcessableCount >= stackThreshold &&
    filledProcessableGroupCount > 0 &&
    stackableGroupCount === 0;

  return {
    threshold: stackThreshold,
    groups: result,
    summary: {
      totalProcessableCount,
      hasStackableGroup: stackableGroupCount > 0,
      allFilledGroupsBelowThreshold,
      message: allFilledGroupsBelowThreshold
        ? '当前更适合普通发送；想要叠图效果，建议每组补到 3 张以上'
        : ''
    }
  };
}

function normalizeImageInput(image, index) {
  if (typeof image === 'string') {
    return {
      imageId: `image_${index + 1}`,
      fileId: image.indexOf('cloud://') === 0 ? image : '',
      localPath: image.indexOf('cloud://') === 0 ? '' : image,
      url: image,
      width: 0,
      height: 0,
      size: 0
    };
  }

  const url = getItemUrl(image);

  return {
    imageId: image.imageId || `image_${index + 1}`,
    fileId: image.fileId || (url.indexOf('cloud://') === 0 ? url : ''),
    localPath: image.localPath || image.tempFilePath || image.path || '',
    url,
    width: image.width || 0,
    height: image.height || 0,
    size: image.size || 0
  };
}

function createMockTask(images, now) {
  const timestamp = now || Date.now();
  const groups = createEmptyGroups();
  const sourceImages = Array.isArray(images) ? images.slice(0, 9) : [];
  const results = sourceImages.map((image, index) => {
    const normalizedImage = normalizeImageInput(image, index);
    const category = getMockCategory(index);
    const result = {
      resultId: `result_${index + 1}`,
      sourceImageId: normalizedImage.imageId,
      category,
      type: 'mockOriginal',
      status: 'done',
      localPath: normalizedImage.localPath,
      fileId: normalizedImage.fileId,
      url: normalizedImage.url,
      width: normalizedImage.width,
      height: normalizedImage.height,
      size: normalizedImage.size,
      error: null
    };

    groups[category].push(result);
    return result;
  });

  labelGroupItems(groups);

  return {
    taskId: `mock_${timestamp}`,
    mode: 'outfit',
    status: sourceImages.length > 0 ? 'done' : 'failed',
    progress: sourceImages.length > 0 ? 100 : 0,
    groups,
    results,
    sendability: buildSendability(groups),
    localPreview: true,
    createdAt: timestamp,
    expiredAt: timestamp + 72 * 60 * 60 * 1000,
    error: sourceImages.length > 0
      ? null
      : {
          code: 'NO_IMAGES',
          message: '没有收到图片'
        }
  };
}

function isCloudPermissionError(error) {
  const message = error && error.errMsg
    ? error.errMsg
    : error && error.message
      ? error.message
      : String(error || '');

  return /云开发|云托管|cloud\.uploadFile|cloud\.callFunction|permission|权限|未启用云开发|开通云开发/i.test(message);
}

module.exports = {
  PROCESSABLE_GROUPS,
  OTHER_GROUP,
  GROUP_META,
  calculateTargetSize,
  createEmptyGroups,
  normalizeGroupKey,
  normalizeTaskGroups,
  buildSendability,
  createMockTask,
  isCloudPermissionError
};
