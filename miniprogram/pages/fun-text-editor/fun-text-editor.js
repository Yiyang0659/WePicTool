// pages/fun-text-editor/fun-text-editor.js
// 趣味字画聚焦编辑页：内容、样式、装饰三个一级入口。
const funTextProject = require('../../utils/funTextProject');
const stylePacks = require('../../config/stylePacks');
const fontFeels = require('../../config/fontFeels');
const assetRegistry = require('../../config/assetRegistry');
const decorationColors = require('../../config/decorationColors');
const funCardRendererClient = require('../../utils/funCardRendererClient');
const transformMath = require('../../utils/funTextTransform');
const { ENABLE_FUN_TEXT_STACK_ENTRY } = require('../../config/env');

const EDITOR_TABS = [
  { key: 'content', label: '内容' },
  { key: 'style', label: '样式' },
  { key: 'decoration', label: '装饰' }
];

const DECORATION_META = {
  sticker_0: { name: '爱心', glyph: '♥' },
  sticker_1: { name: '小花', glyph: '✿' },
  sticker_2: { name: '星星', glyph: '★' },
  sticker_3: { name: '笑脸', glyph: '☺' },
  sticker_4: { name: '闪光', glyph: '✦' },
  sticker_5: { name: '丝带', glyph: '⌁' },
  sticker_6: { name: '闪电', glyph: 'ϟ' },
  sticker_7: { name: '云朵', glyph: '☁' },
  sticker_8: { name: '惊叹', glyph: '！' },
  sticker_9: { name: '太阳', glyph: '☀' },
  sticker_10: { name: '气球', glyph: '●' },
  sticker_11: { name: '礼物', glyph: '▣' },
  'arrow-curve': { name: '弯箭头', glyph: '↝' },
  'heart-outline': { name: '线稿爱心', glyph: '♡' },
  'circle-mark': { name: '手绘圈', glyph: '◯' },
  'underline-rough': { name: '手绘线', glyph: '﹏' },
  'scribble-cross': { name: '涂鸦叉', glyph: '×' },
  'burst-lines': { name: '放射线', glyph: '✺' }
};

function patternClass(assetKey) {
  const key = String(assetKey || '');
  if (key.indexOf('chalk') === 0) return 'preview-pattern-chalk';
  if (key.indexOf('paper-collage') === 0) return 'preview-pattern-paper';
  if (key.indexOf('crazy-grid') === 0) return 'preview-pattern-grid';
  if (key.indexOf('gentle-journal') === 0) return 'preview-pattern-journal';
  if (key.indexOf('blue-soda') === 0) return 'preview-pattern-soda';
  if (key.indexOf('retro-ticket') === 0) return 'preview-pattern-ticket';
  return 'preview-pattern-note';
}

function decorationMeta(assetKey) {
  return DECORATION_META[assetKey] || { name: '装饰', glyph: '✦' };
}

function buildScenePreview(scene) {
  const layers = scene && scene.layers || [];
  const textLayer = layers.find(function (layer) { return layer.type === 'text'; }) || {};
  const previewDecoration = layers.find(function (layer) {
    return layer.type === 'sticker' || layer.type === 'doodle';
  });
  const previewPaint = previewDecoration && decorationColors.getDecorationPaint(previewDecoration);
  return {
    previewText: textLayer.text || '……',
    previewTextColor: textLayer.color || '#26211f',
    previewBackground: scene && scene.background && scene.background.color || '#fff0f5',
    previewPatternClass: patternClass(scene && scene.background && scene.background.assetKey),
    previewDecorationColor: previewPaint
      ? (previewDecoration.type === 'doodle' ? previewPaint.stroke : previewPaint.fill)
      : (textLayer.color || '#26211f'),
    previewDecorations: layers.filter(function (layer) {
      return layer.type === 'sticker' || layer.type === 'doodle';
    }).slice(0, 3).map(function (layer) {
      return decorationMeta(layer.assetKey).glyph;
    }).join(' ')
  };
}

const DECORATION_COLOR_GROUPS = decorationColors.COLOR_GROUPS.map(function (group) {
  return { key: group.key, name: group.name };
});

function findDecorationLayer(scene, selectedId) {
  return (scene && scene.layers || []).find(function (layer) {
    return layer.id === selectedId && layer.type !== 'text';
  }) || null;
}

function colorGroupForSelection(scene, selectedId, fallback) {
  const layer = findDecorationLayer(scene, selectedId);
  const color = layer && decorationColors.getDecorationColor(layer.decorationColorKey);
  return color ? color.groupKey : (fallback || 'vivid');
}

function buildDecorationColorOptions(scene, selectedId, groupKey) {
  const layer = findDecorationLayer(scene, selectedId);
  const activeColorKey = layer && layer.decorationColorKey || '';
  const group = decorationColors.COLOR_GROUPS.find(function (item) { return item.key === groupKey; })
    || decorationColors.COLOR_GROUPS[0];
  return group.colors.map(function (color) {
    return Object.assign({}, color, {
      selected: color.key === activeColorKey,
      swatchStyle: 'background-color: ' + color.color + ';'
    });
  });
}

function buildDecorationAssets(scene, selectedId) {
  const layers = scene && scene.layers || [];
  const selectedLayer = layers.find(function (layer) { return layer.id === selectedId; });
  return assetRegistry.listAssets().map(function (asset) {
    const meta = decorationMeta(asset.key);
    const count = layers.filter(function (layer) { return layer.assetKey === asset.key; }).length;
    return Object.assign({}, asset, meta, {
      typeLabel: asset.type === 'sticker' ? '贴纸' : '涂鸦',
      addedCount: count,
      inScene: count > 0,
      selected: Boolean(selectedLayer && selectedLayer.assetKey === asset.key)
    });
  });
}

function buildDecorationLayerState(scene, selectedId) {
  const decorations = (scene && scene.layers || []).filter(function (layer) {
    return layer.type === 'sticker' || layer.type === 'doodle';
  });
  const index = decorations.findIndex(function (layer) { return layer.id === selectedId; });
  return {
    canMoveBackward: index > 0,
    canMoveForward: index >= 0 && index < decorations.length - 1
  };
}

function getSortItemWidth() {
  try {
    const systemInfo = typeof wx !== 'undefined' && wx.getWindowInfo
      ? wx.getWindowInfo()
      : (typeof wx !== 'undefined' && wx.getSystemInfoSync ? wx.getSystemInfoSync() : null);
    const windowWidth = systemInfo && Number(systemInfo.windowWidth);
    if (Number.isFinite(windowWidth) && windowWidth > 0) {
      return Math.round(windowWidth * 140 / 750);
    }
  } catch (err) {
    // 预览或测试环境可能没有系统信息，使用 375px 宽屏幕下的等比例尺寸。
  }
  return 70;
}

function buildSortItems(scenes) {
  const width = getSortItemWidth();
  const gap = Math.round(width * 16 / 140);
  const items = (scenes || []).map(function (scene, index) {
    const x = index * (width + gap);
    return Object.assign({}, scene, buildScenePreview(scene), {
      x: x,
      positionX: x,
      centerX: x + width / 2,
      label: index === 0 ? '微信封面' : String(index + 1),
      thumbText: ((scene.layers || []).find(function (layer) { return layer.type === 'text'; }) || {}).text || '……'
    });
  });
  return {
    items: items,
    width: width,
    areaWidth: items.length ? items[items.length - 1].x + width : 0
  };
}

function previewSortPositions(items, fromIndex, toIndex, dragX) {
  if (!Array.isArray(items) || fromIndex < 0 || toIndex < 0) return items || [];
  const step = items.length > 1 ? items[1].x - items[0].x : 0;
  return items.map(function (item, index) {
    let positionX = item.x;
    if (index === fromIndex) {
      positionX = dragX;
    } else if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
      positionX = item.x - step;
    } else if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
      positionX = item.x + step;
    }
    return Object.assign({}, item, {
      positionX: positionX,
      isDropTarget: index === toIndex && index !== fromIndex
    });
  });
}

function buildStyleControls(candidate, scene) {
  const pack = stylePacks.getStylePack(candidate && candidate.stylePackId);
  const activePalette = pack && stylePacks.getPalette(pack, scene && scene.paletteKey);
  return {
    backgrounds: pack ? pack.backgroundVariants.map(function (item) {
      return Object.assign({}, item, {
        selected: item.key === scene.backgroundVariantKey,
        patternClass: patternClass(item.assetKey),
        previewTextColor: activePalette && activePalette.colors.primary || '#26211f'
      });
    }) : [],
    palettes: pack ? pack.palettes.map(function (item) {
      return {
        key: item.key,
        name: item.name,
        color: item.colors.primary,
        accent: item.colors.accent,
        selected: item.key === scene.paletteKey
      };
    }) : [],
    fonts: fontFeels.FONT_FEELS.map(function (item) {
      return Object.assign({}, item, { selected: item.key === scene.fontFeelKey });
    })
  };
}

function buildDecorationHandles(scene, selectedId) {
  return (scene && scene.layers || []).filter(function (layer) {
    return layer.type === 'sticker' || layer.type === 'doodle';
  }).map(function (layer) {
    const size = Math.max(34, Math.min(76, 44 * (Number(layer.scale) || 1)));
    const paint = decorationColors.getDecorationPaint(layer);
    return {
      id: layer.id,
      label: decorationMeta(layer.assetKey).glyph,
      selected: layer.id === selectedId,
      left: Math.round((layer.x || 0) / 1080 * 320 - size / 2),
      top: Math.round((layer.y || 0) / 1080 * 320 - size / 2),
      size: Math.round(size),
      rotation: Number(layer.rotation) || 0,
      color: layer.type === 'doodle' ? paint.stroke : paint.fill
    };
  });
}

function sceneText(scene) {
  return ((scene && scene.layers || []).find(function (layer) { return layer.type === 'text'; }) || {}).text || '';
}

Page({
  data: {
    project: null,
    selectedCandidate: null,
    scenes: [],
    currentCardIndex: 0,
    currentScene: null,
    currentText: '',
    stylePacks: [],
    editorTabs: EDITOR_TABS,
    activeEditorTab: 'content',
    editScope: 'card',
    styleControls: { backgrounds: [], palettes: [], fonts: [] },
    decorationAssets: buildDecorationAssets(null, ''),
    decorationLayerState: { canMoveBackward: false, canMoveForward: false },
    selectedDecorationId: '',
    decorationColorGroups: DECORATION_COLOR_GROUPS,
    activeDecorationColorGroup: 'vivid',
    decorationColorOptions: buildDecorationColorOptions(null, '', 'vivid'),
    decorationColorIsDefault: true,
    decorationHandles: [],
    fallbackImages: [],
    currentFallbackImage: '',
    serverPreviewLoading: false,
    serverPreviewFailed: false,
    canUndo: false,
    canRedo: false,
    editingTextModalVisible: false,
    editingText: '',
    editingCharCount: 0,
    maxCharCount: 12,
    canvasRevision: 0,
    draggingIndex: -1,
    sortFromIndex: -1,
    sortToIndex: -1,
    sortItems: [],
    sortItemWidth: 70,
    sortAreaWidth: 0
  },

  onLoad: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    const that = this;
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('funTextProject', function (data) {
        if (data && data.project) {
          that.initProject(data.project);
        }
      });
    }
  },

  initProject: function (project) {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (!project) return;
    const selectedCandidateId = project.selectedCandidateId || (project.candidates[0] && project.candidates[0].candidateId);
    let selectedCandidate = project.candidates.find(function (c) {
      return c.candidateId === selectedCandidateId;
    }) || project.candidates[0];

    if (!project.selectedCandidateId) {
      project = funTextProject.selectCandidate(project, selectedCandidate.candidateId);
      selectedCandidate = project.candidates.find(function (c) {
        return c.candidateId === selectedCandidate.candidateId;
      }) || project.candidates[0];
    }

    const scenes = selectedCandidate.editedScenes || [];
    this._editorPreviewFallback = {
      projectId: project.projectId,
      attempted: false,
      loading: false,
      succeeded: false
    };
    const packList = (stylePacks.STYLE_PACKS || []).map(function (pack) {
      const background = stylePacks.getBackgroundVariant(pack, pack.defaultBackgroundVariantKey);
      const palette = stylePacks.getPalette(pack, pack.defaultPaletteKey);
      return {
        id: pack.id,
        name: pack.name || pack.id,
        color: background && background.color,
        textColor: palette && palette.colors.primary,
        accentColor: palette && palette.colors.accent,
        patternClass: patternClass(background && background.assetKey)
      };
    });

    const sortGeometry = buildSortItems(scenes);
    this.setData({
      project: project,
      selectedCandidate: selectedCandidate,
      scenes: scenes,
      currentCardIndex: 0,
      currentScene: scenes[0] || null,
      currentText: sceneText(scenes[0]),
      stylePacks: packList,
      styleControls: scenes[0] ? buildStyleControls(selectedCandidate, scenes[0]) : { backgrounds: [], palettes: [], fonts: [] },
      selectedDecorationId: '',
      decorationHandles: buildDecorationHandles(scenes[0], ''),
      decorationAssets: buildDecorationAssets(scenes[0], ''),
      decorationLayerState: buildDecorationLayerState(scenes[0], ''),
      activeDecorationColorGroup: 'vivid',
      decorationColorOptions: buildDecorationColorOptions(scenes[0], '', 'vivid'),
      decorationColorIsDefault: true,
      fallbackImages: [],
      currentFallbackImage: '',
      serverPreviewLoading: false,
      serverPreviewFailed: false,
      canUndo: Boolean(project.editHistory && project.editHistory.past && project.editHistory.past.length),
      canRedo: Boolean(project.editHistory && project.editHistory.future && project.editHistory.future.length),
      editingTextModalVisible: false,
      editingText: '',
      editingCharCount: 0,
      maxCharCount: (scenes[0] && scenes[0].role === 'reveal') ? 40 : 12,
      canvasRevision: 0,
      draggingIndex: -1,
      sortFromIndex: -1,
      sortToIndex: -1,
      sortItems: sortGeometry.items,
      sortItemWidth: sortGeometry.width,
      sortAreaWidth: sortGeometry.areaWidth
    });
  },

  onSelectCard: function (event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isFinite(index) || index < 0 || index >= this.data.scenes.length) return;
    const scene = this.data.scenes[index];
    this.setData({
      currentCardIndex: index,
      currentScene: scene,
      currentText: sceneText(scene),
      maxCharCount: (scene && scene.role === 'reveal') ? 40 : 12,
      selectedDecorationId: '',
      decorationHandles: buildDecorationHandles(scene, ''),
      decorationAssets: buildDecorationAssets(scene, ''),
      decorationLayerState: buildDecorationLayerState(scene, ''),
      activeDecorationColorGroup: 'vivid',
      decorationColorOptions: buildDecorationColorOptions(scene, '', 'vivid'),
      decorationColorIsDefault: true,
      currentFallbackImage: this.data.fallbackImages[index] || '',
      styleControls: buildStyleControls(this.data.selectedCandidate, scene)
    });
  },

  syncProject: function (project, cardIndex, selectedDecorationId) {
    const candidate = project.candidates.find(function (item) {
      return item.candidateId === project.selectedCandidateId;
    });
    const scenes = candidate.editedScenes;
    const index = Math.max(0, Math.min(scenes.length - 1, Number(cardIndex) || 0));
    const scene = scenes[index];
    const selectedId = selectedDecorationId && (scene.layers || []).some(function (layer) {
      return layer.id === selectedDecorationId && layer.type !== 'text';
    }) ? selectedDecorationId : '';
    const activeColorGroup = colorGroupForSelection(scene, selectedId, this.data.activeDecorationColorGroup);
    const selectedLayer = findDecorationLayer(scene, selectedId);
    const sortGeometry = buildSortItems(scenes);
    this._editorPreviewFallback = {
      projectId: project.projectId,
      attempted: false,
      loading: false,
      succeeded: false
    };
    this.setData({
      project: project,
      selectedCandidate: candidate,
      scenes: scenes,
      currentCardIndex: index,
      currentScene: scene,
      currentText: sceneText(scene),
      sortItems: sortGeometry.items,
      sortItemWidth: sortGeometry.width,
      sortAreaWidth: sortGeometry.areaWidth,
      selectedDecorationId: selectedId,
      decorationHandles: buildDecorationHandles(scene, selectedId),
      decorationAssets: buildDecorationAssets(scene, selectedId),
      decorationLayerState: buildDecorationLayerState(scene, selectedId),
      activeDecorationColorGroup: activeColorGroup,
      decorationColorOptions: buildDecorationColorOptions(scene, selectedId, activeColorGroup),
      decorationColorIsDefault: Boolean(selectedLayer && !selectedLayer.decorationColorKey),
      fallbackImages: [],
      currentFallbackImage: '',
      serverPreviewLoading: false,
      serverPreviewFailed: false,
      styleControls: buildStyleControls(candidate, scene),
      canUndo: Boolean(project.editHistory && project.editHistory.past && project.editHistory.past.length),
      canRedo: Boolean(project.editHistory && project.editHistory.future && project.editHistory.future.length),
      canvasRevision: this.data.canvasRevision + 1
    });
  },

  onSelectEditorTab: function (event) {
    const key = event.currentTarget.dataset.key;
    if (EDITOR_TABS.some(function (item) { return item.key === key; })) {
      this.setData({ activeEditorTab: key });
    }
  },

  onSetEditScope: function (event) {
    const scope = event.currentTarget.dataset.scope;
    if (scope === 'card' || scope === 'stack') this.setData({ editScope: scope });
  },

  // 1. 改当前卡文字
  onEditText: function () {
    const scene = this.data.scenes[this.data.currentCardIndex];
    if (!scene) return;
    const textLayer = (scene.layers || []).find(function (layer) { return layer.type === 'text'; });
    const text = textLayer ? textLayer.text : '';
    const max = scene.role === 'reveal' ? 40 : 12;

    this.setData({
      editingTextModalVisible: true,
      editingText: text,
      editingCharCount: Array.from(text).length,
      maxCharCount: max
    });
  },

  onInputEditText: function (event) {
    const value = (event.detail && event.detail.value) || '';
    this.setData({
      editingText: value,
      editingCharCount: Array.from(value).length
    });
  },

  onCancelEditText: function () {
    this.setData({ editingTextModalVisible: false });
  },

  onConfirmText: function () {
    const scene = this.data.scenes[this.data.currentCardIndex];
    if (!scene || !this.data.project || !this.data.selectedCandidate) return;

    const text = this.data.editingText;
    const charCount = Array.from(text).length;

    if (scene.role === 'reveal' && charCount > 40) {
      wx.showToast({ title: '核心揭晓句最多 40 字', icon: 'none' });
      return;
    }
    if (scene.role !== 'reveal' && charCount > 12) {
      wx.showToast({ title: '单卡文字不能超过 12 字', icon: 'none' });
      return;
    }
    if (!charCount && scene.role !== 'pause' && scene.role !== 'ending') {
      wx.showToast({ title: '只有停顿卡或末卡可以留空', icon: 'none' });
      return;
    }

    try {
      const updatedProject = funTextProject.updateCardText(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        scene.sceneId,
        text
      );

      this.syncProject(updatedProject, this.data.currentCardIndex, this.data.selectedDecorationId);
      this.setData({ editingTextModalVisible: false });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '修改文字失败', icon: 'none' });
    }
  },

  // 2. 换整叠风格
  onSelectStylePack: function (event) {
    const stylePackId = event.currentTarget.dataset.stylePackId;
    if (!stylePackId || !this.data.project || !this.data.selectedCandidate) return;
    if (stylePackId === this.data.selectedCandidate.stylePackId) return;

    try {
      const updatedProject = funTextProject.switchCandidateStyle(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        stylePackId
      );

      this.syncProject(updatedProject, this.data.currentCardIndex, '');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '切换风格失败', icon: 'none' });
    }
  },

  onSelectBackground: function (event) {
    this.applyStyleChange({ backgroundVariantKey: event.currentTarget.dataset.key });
  },

  onSelectPalette: function (event) {
    this.applyStyleChange({ paletteKey: event.currentTarget.dataset.key });
  },

  onSelectFontFeel: function (event) {
    this.applyStyleChange({ fontFeelKey: event.currentTarget.dataset.key });
  },

  applyStyleChange: function (changes) {
    if (!this.data.project || !this.data.currentScene) return;
    try {
      const updated = funTextProject.updateCardStyle(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        changes,
        this.data.editScope
      );
      this.syncProject(updated, this.data.currentCardIndex, this.data.selectedDecorationId);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '修改样式失败', icon: 'none' });
    }
  },

  onSetTextSize: function (event) {
    try {
      const updated = funTextProject.setTextSizePreset(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        event.currentTarget.dataset.preset
      );
      this.syncProject(updated, this.data.currentCardIndex, this.data.selectedDecorationId);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '修改字号失败', icon: 'none' });
    }
  },

  onAddDecoration: function (event) {
    try {
      const updated = funTextProject.addDecoration(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        event.currentTarget.dataset.assetKey
      );
      const scene = updated.candidates.find(function (candidate) {
        return candidate.candidateId === updated.selectedCandidateId;
      }).editedScenes[this.data.currentCardIndex];
      const added = (scene.layers || []).filter(function (layer) { return layer.userAdded; }).slice(-1)[0];
      this.syncProject(updated, this.data.currentCardIndex, added && added.id);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '添加装饰失败', icon: 'none' });
    }
  },

  onSelectDecoration: function (event) {
    const layerId = event.currentTarget.dataset.layerId;
    const activeColorGroup = colorGroupForSelection(this.data.currentScene, layerId, this.data.activeDecorationColorGroup);
    const layer = findDecorationLayer(this.data.currentScene, layerId);
    this.setData({
      selectedDecorationId: layerId,
      decorationHandles: buildDecorationHandles(this.data.currentScene, layerId),
      decorationAssets: buildDecorationAssets(this.data.currentScene, layerId),
      decorationLayerState: buildDecorationLayerState(this.data.currentScene, layerId),
      activeDecorationColorGroup: activeColorGroup,
      decorationColorOptions: buildDecorationColorOptions(this.data.currentScene, layerId, activeColorGroup),
      decorationColorIsDefault: Boolean(layer && !layer.decorationColorKey)
    });
  },

  onSelectDecorationColorGroup: function (event) {
    const groupKey = event.currentTarget.dataset.groupKey;
    if (!decorationColors.COLOR_GROUPS.some(function (group) { return group.key === groupKey; })) return;
    this.setData({
      activeDecorationColorGroup: groupKey,
      decorationColorOptions: buildDecorationColorOptions(this.data.currentScene, this.data.selectedDecorationId, groupKey)
    });
  },

  onSetDecorationColor: function (event) {
    if (!this.data.selectedDecorationId) {
      wx.showToast({ title: '请先选择画面里的装饰', icon: 'none' });
      return;
    }
    try {
      const updated = funTextProject.setDecorationColor(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        this.data.selectedDecorationId,
        event.currentTarget.dataset.colorKey
      );
      this.syncProject(updated, this.data.currentCardIndex, this.data.selectedDecorationId);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '修改颜色失败', icon: 'none' });
    }
  },

  onResetDecorationColor: function () {
    if (!this.data.selectedDecorationId) return;
    try {
      const updated = funTextProject.setDecorationColor(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        this.data.selectedDecorationId,
        'default'
      );
      this.syncProject(updated, this.data.currentCardIndex, this.data.selectedDecorationId);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '恢复颜色失败', icon: 'none' });
    }
  },

  onDeleteDecoration: function () {
    if (!this.data.selectedDecorationId) return;
    try {
      const updated = funTextProject.removeDecoration(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        this.data.selectedDecorationId
      );
      this.syncProject(updated, this.data.currentCardIndex, '');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '删除装饰失败', icon: 'none' });
    }
  },

  onMoveDecorationLayer: function (event) {
    if (!this.data.selectedDecorationId) return;
    const direction = event.currentTarget.dataset.direction;
    if (direction === 'forward' && !this.data.decorationLayerState.canMoveForward) {
      wx.showToast({ title: '已经显示在最前面', icon: 'none' });
      return;
    }
    if (direction === 'backward' && !this.data.decorationLayerState.canMoveBackward) {
      wx.showToast({ title: '已经显示在最后面', icon: 'none' });
      return;
    }
    try {
      const updated = funTextProject.moveDecorationLayer(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        this.data.selectedDecorationId,
        direction
      );
      this.syncProject(updated, this.data.currentCardIndex, this.data.selectedDecorationId);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '调整层级失败', icon: 'none' });
    }
  },

  onDecorationTouchStart: function (event) {
    const layerId = event.currentTarget.dataset.layerId;
    const layer = (this.data.currentScene.layers || []).find(function (item) { return item.id === layerId; });
    if (!layer || layer.type === 'text') return;
    this._transformLayerId = layerId;
    this._transformSession = transformMath.beginTransform(event.touches, layer, 320);
    this._transformDraft = null;
    this.onSelectDecoration(event);
  },

  onDecorationTouchMove: function (event) {
    if (!this._transformSession || !this._transformLayerId) return;
    const nextTransform = transformMath.updateTransform(this._transformSession, event.touches);
    const scenes = JSON.parse(JSON.stringify(this.data.scenes));
    const scene = scenes[this.data.currentCardIndex];
    const layer = (scene.layers || []).find((item) => item.id === this._transformLayerId);
    if (!layer) return;
    Object.assign(layer, nextTransform);
    this._transformDraft = nextTransform;
    this.setData({
      scenes: scenes,
      currentScene: scene,
      decorationHandles: buildDecorationHandles(scene, this._transformLayerId),
      canvasRevision: this.data.canvasRevision + 1
    });
  },

  onDecorationTouchEnd: function () {
    if (!this._transformDraft || !this._transformLayerId) {
      this._transformSession = null;
      return;
    }
    try {
      const updated = funTextProject.updateDecorationTransform(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,
        this._transformLayerId,
        this._transformDraft
      );
      this.syncProject(updated, this.data.currentCardIndex, this._transformLayerId);
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '移动装饰失败', icon: 'none' });
    }
    this._transformSession = null;
    this._transformDraft = null;
    this._transformLayerId = '';
  },

  onUndo: function () {
    const updated = funTextProject.undoEdit(this.data.project);
    this.syncProject(updated, this.data.currentCardIndex, '');
  },

  onRedo: function () {
    const updated = funTextProject.redoEdit(this.data.project);
    this.syncProject(updated, this.data.currentCardIndex, '');
  },

  onRestoreCard: function () {
    try {
      const updated = funTextProject.restoreCard(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId
      );
      this.syncProject(updated, this.data.currentCardIndex, '');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '恢复失败', icon: 'none' });
    }
  },

  onRestoreStack: function () {
    try {
      const updated = funTextProject.restoreCandidate(this.data.project, this.data.selectedCandidate.candidateId);
      this.syncProject(updated, 0, '');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '恢复失败', icon: 'none' });
    }
  },

  onFontUnavailable: async function () {
    if (!this.data.project || !this.data.selectedCandidate) return;
    const projectId = this.data.project.projectId;
    let fallback = this._editorPreviewFallback;
    if (!fallback || fallback.projectId !== projectId) {
      fallback = {
        projectId: projectId,
        attempted: false,
        loading: false,
        succeeded: false
      };
      this._editorPreviewFallback = fallback;
    }
    if (fallback.loading || fallback.attempted || fallback.succeeded) return;
    fallback.attempted = true;
    fallback.loading = true;
    this.setData({ serverPreviewLoading: true, serverPreviewFailed: false });

    try {
      const payload = funTextProject.buildPreviewPayload(this.data.project);
      const response = await funCardRendererClient.requestPreviewStack(wx, payload);
      if (this._editorPreviewFallback !== fallback || !this.data.project || this.data.project.projectId !== projectId) return;
      const selectedCandidateId = this.data.selectedCandidate.candidateId;
      const renderedCandidate = response.candidates.find(function (candidate) {
        return candidate && candidate.candidateId === selectedCandidateId;
      });
      if (!renderedCandidate || !Array.isArray(renderedCandidate.cards)) {
        throw new Error('预览图片不完整');
      }
      const fallbackImages = renderedCandidate.cards.map(function (card) { return card.url; });
      fallback.loading = false;
      fallback.succeeded = true;
      this.setData({
        fallbackImages: fallbackImages,
        currentFallbackImage: fallbackImages[this.data.currentCardIndex] || '',
        serverPreviewLoading: false,
        serverPreviewFailed: false
      });
    } catch (error) {
      if (this._editorPreviewFallback !== fallback || !this.data.project || this.data.project.projectId !== projectId) return;
      fallback.loading = false;
      this.setData({
        serverPreviewLoading: false,
        serverPreviewFailed: true,
        currentFallbackImage: ''
      });
    }
  },

  onRetryEditorPreview: function () {
    if (!this.data.project) return;
    this._editorPreviewFallback = {
      projectId: this.data.project.projectId,
      attempted: false,
      loading: false,
      succeeded: false
    };
    this.setData({
      fallbackImages: [],
      currentFallbackImage: '',
      serverPreviewLoading: false,
      serverPreviewFailed: false,
      canvasRevision: this.data.canvasRevision + 1
    });
  },

  // 3. 调整顺序：移动过程中只计算落点，触摸结束时再提交一次排序。
  onSortStart: function (event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.sortItems.length) return;
    this.setData({
      draggingIndex: index,
      sortFromIndex: index,
      sortToIndex: index
    });
  },

  onSortMove: function (event) {
    if (this.data.sortFromIndex < 0) return;
    const eventIndex = Number(event && event.currentTarget && event.currentTarget.dataset.index);
    if (Number.isInteger(eventIndex) && eventIndex !== this.data.sortFromIndex) return;
    const x = Number(event && event.detail && event.detail.x);
    if (!Number.isFinite(x)) return;
    const dragCenterX = x + this.data.sortItemWidth / 2;
    let nearestIndex = this.data.sortFromIndex;
    let nearestDistance = Infinity;
    this.data.sortItems.forEach(function (item, index) {
      const distance = Math.abs(dragCenterX - item.centerX);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    const maxX = this.data.sortItems.length
      ? this.data.sortItems[this.data.sortItems.length - 1].x
      : 0;
    const boundedX = Math.max(0, Math.min(maxX, x));
    this.setData({
      sortToIndex: nearestIndex,
      sortItems: previewSortPositions(this.data.sortItems, this.data.sortFromIndex, nearestIndex, boundedX)
    });
  },

  onSortEnd: function () {
    const fromIndex = this.data.sortFromIndex;
    const toIndex = this.data.sortToIndex;
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0) return;

    // 先清空生命周期状态，避免 bindchange 与重复 touchend 造成第二次移动。
    this.setData({ draggingIndex: -1, sortFromIndex: -1, sortToIndex: -1 });
    if (fromIndex === toIndex || !this.data.project || !this.data.selectedCandidate) {
      const resetGeometry = buildSortItems(this.data.scenes);
      this.setData({
        sortItems: resetGeometry.items,
        sortItemWidth: resetGeometry.width,
        sortAreaWidth: resetGeometry.areaWidth
      });
      return;
    }

    try {
      const updatedProject = funTextProject.moveCard(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        fromIndex,
        toIndex
      );
      this.syncProject(updatedProject, toIndex, '');
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '调整顺序失败', icon: 'none' });
    }
  },

  // 4. 确认编辑并进入结果页
  onConfirmEdits: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (!this.data.project) return;
    const project = this.data.project;
    wx.navigateTo({
      url: '/pages/template-result/template-result',
      success: function (navRes) {
        navRes.eventChannel.emit('funTextProject', { project: project });
      }
    });
  }
});
