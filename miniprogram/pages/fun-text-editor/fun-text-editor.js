// pages/fun-text-editor/fun-text-editor.js
// 趣味字画聚焦编辑页：内容、样式、装饰三个一级入口。
const funTextProject = require('../../utils/funTextProject');
const stylePacks = require('../../config/stylePacks');
const fontFeels = require('../../config/fontFeels');
const assetRegistry = require('../../config/assetRegistry');
const decorationColors = require('../../config/decorationColors');
const funCardRendererClient = require('../../utils/funCardRendererClient');
const localPreview = require('../../utils/funLocalPreview');
const transformMath = require('../../utils/funTextTransform');
const ink = require('../../utils/funStrokes');
const handwriting = require('../../utils/handwritingLibrary');
const inkStickers = require('../../utils/inkStickers');
const exportManifest = require('../../utils/stackExportManifest');
const badgeComposer = require('../../utils/sequenceBadgeComposer');
const imageExporter = require('../../utils/imageExporter');
const previewPreloader = require('../../utils/funPreviewPreloader');
const { ENABLE_FUN_TEXT_STACK_ENTRY, ENABLE_FUN_LOCAL_EDITOR, ENABLE_FUN_OFFLINE_PREVIEW } = require('../../config/env');

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
  if (key === 'solid') return '';
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
    previewText: textLayer.text || (scene && scene.inkStickers && scene.inkStickers.length ? '手写作品' : '空白卡'),
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
      leftPercent: (layer.x || 0) / 1080 * 100,
      topPercent: (layer.y || 0) / 1080 * 100,
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
    imageViewerVisible:false, imageViewerCards:[], imageViewerLoading:false, imageViewerError:'', cardSlideClass:'',
    exportProgress:{visible:false,stage:'audit',current:0,total:0,completed:0,percent:0},
    handwritingVisible:false, handwritingScene:null, handwritingDrafts:[], handwritingStatus:'',
    handwritingCanUndo:false, handwritingCanRedo:false, selectedInkId:'', handwritingPanMode:false,
    handwritingPurpose:'sticker', handwritingEditing:false, handwritingBackground:'#FFFFFF',
    backgroundColors:['#FFFFFF','#FCE4EC','#FFF3E8','#F1EAFF','#EDF7EF','#E8F7FF','#FFF36D','#24303A'],
    localEditorEnabled: ENABLE_FUN_LOCAL_EDITOR === true || ENABLE_FUN_OFFLINE_PREVIEW === true,
    drawingMode: false,
    brushKey: 'pen',
    penWidth: 8,
    inkColor: 'black',
    inkWidths: ink.WIDTHS,
    inkColors: Object.keys(ink.COLORS).map(function(key){return {key:key,color:ink.COLORS[key]};}),
    draftStatus: '',
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
    serverPreviewDiagnostic: null,
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
    this.loadHandwritingDrafts();
    const that = this;
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('funTextProject', function (data) {
        if (data && data.project) {
          that.initProject(data.project, data);
        }
      });
    }
  },

  initProject: function (project, navigation) {
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
    const requestedIndex = navigation && navigation.currentCardIndex;
    if (this.data.localEditorEnabled) previewPreloader.warm(wx, project, selectedCandidate.candidateId, requestedIndex || 0);
    if (Number.isInteger(requestedIndex) && requestedIndex > 0 && requestedIndex < scenes.length) {
      this.onSelectCard({ currentTarget: { dataset: { index: requestedIndex } } });
    }
  },

  onSelectCard: function (event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isFinite(index) || index < 0 || index >= this.data.scenes.length) return;
    const scene = this.data.scenes[index];
    this.setData({
      selectedInkId:'',
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

  onPreviewGeometry: function (event) {
    if (event.detail && event.detail.width > 0) this._previewWidth = event.detail.width;
  },

  onPreviewTap: async function () {
    if (Date.now() < (this._suppressPreviewTapUntil || 0) || this._editorExportBusy || this.data.drawingMode || this.data.imageViewerVisible || !this.data.project) return;
    const snapshot = handwriting.copy(this.data.project);
    if (!snapshot) return;
    this.setData({imageViewerVisible:true,imageViewerLoading:true,imageViewerCards:[],imageViewerError:''});
    const generation = this._imageViewerGeneration = (this._imageViewerGeneration || 0) + 1;
    const current = () => !this._editorUnloaded && this.data.imageViewerVisible && generation === this._imageViewerGeneration;
    const previous = this._imageViewerPending;
    let finish;
    this._imageViewerPending = new Promise(resolve => { finish = resolve; });
    try {
      if (previous) await previous;
      if (!current()) return;
      const canvas = await new Promise((resolve,reject)=>wx.createSelectorQuery().select('#editorExportCanvas').fields({node:true}).exec(r=>r&&r[0]&&r[0].node?resolve(r[0].node):reject(Error('预览画布未就绪'))));
      const cards = await localPreview.renderCards(wx,canvas,snapshot,current);
      if(current())this.setData({imageViewerCards:cards,imageViewerLoading:false});
    } catch(error) { if(current())this.setData({imageViewerLoading:false,imageViewerError:error.message || '预览失败，请关闭后重试'}); }
    finally { finish(); }
  },
  onCloseImageViewer:function(){this._imageViewerGeneration=(this._imageViewerGeneration || 0)+1;this.setData({imageViewerVisible:false});},
  onImageViewerChange:function(event){this.onSelectCard({currentTarget:{dataset:{index:event.detail.current}}});},
  onStageTouchStart:function(event){
    const touches=event.touches || (event.detail && event.detail.touches) || [];
    this._stageTouch=touches.length===1 && !this.data.drawingMode ? {x:touches[0].clientX ?? touches[0].x,y:touches[0].clientY ?? touches[0].y} : null;
  },
  onStageTouchEnd:function(event){
    const start=this._stageTouch;this._stageTouch=null;
    const end=(event.changedTouches || (event.detail && event.detail.changedTouches) || [])[0];if(!start || !end)return;
    const dx=(end.clientX ?? end.x)-start.x,dy=(end.clientY ?? end.y)-start.y;
    if(Math.abs(dx)<40 || Math.abs(dx)<Math.abs(dy)*1.4)return;
    this._suppressPreviewTapUntil=Date.now()+400;
    const index=this.data.currentCardIndex+(dx<0?1:-1);
    if(index<0 || index>=this.data.scenes.length)return;
    this.setData({cardSlideClass:dx<0?'card-slide-next':'card-slide-prev'});
    this.onSelectCard({currentTarget:{dataset:{index}}});
    setTimeout(()=>{if(!this._editorUnloaded)this.setData({cardSlideClass:''});},250);
  },
  onStageTouchCancel:function(){this._stageTouch=null;},

  loadHandwritingDrafts: function() {
    try { this.setData({handwritingDrafts:handwriting.decorate(handwriting.read(wx))}); }
    catch(error){this.setData({handwritingStatus:error.message || '读取草稿失败'});}
  },
  onHandwritingHelp: function() {
    wx.showModal({title:'自由手写',content:'手写可作为透明贴纸加入当前卡，也可配上背景做成新卡。加入后可拖动、双指缩放旋转、继续改笔迹。草稿仅保存在本机，不会跨设备同步。',showCancel:false});
  },
  onStartHandwriting: function(event) {
    if(!this.data.currentScene || this.data.editorExportBusy)return;
    const id=event && event.currentTarget.dataset.id;
    const draft=(this.data.handwritingDrafts || []).find(item=>item.id===id);
    this._handwritingTarget={candidateId:this.data.selectedCandidate.candidateId,sceneId:this.data.currentScene.sceneId};
    this._handwritingId=draft ? draft.id : 'hw_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    this._editingInkId='';this._handwritingPast=[];this._handwritingFuture=[];
    this._handwritingDirty=false;
    this.setData({handwritingVisible:true,handwritingEditing:false,handwritingPurpose:draft && draft.purpose || 'sticker',handwritingBackground:draft && draft.backgroundColor || '#FFFFFF',handwritingPanMode:false,handwritingScene:handwriting.scene(draft ? draft.strokes : [],draft || {workspaceSize:2160,viewport:{x:540,y:540}}),
      handwritingCanUndo:false,handwritingCanRedo:false,handwritingStatus:''});
  },
  onHandwritingChange: function(event) {
    if(!this.data.handwritingVisible || !ink.valid(event.detail.strokes,this.data.handwritingScene.workspaceSize))return;
    this.pushHandwritingHistory();
    this.setData({handwritingScene:handwriting.scene(event.detail.strokes,this.data.handwritingScene)});
  },
  pushHandwritingHistory: function() {
    this._handwritingPast.push(handwriting.copy(this.data.handwritingScene));
    if(this._handwritingPast.length>20)this._handwritingPast.shift();
    this._handwritingFuture=[];
    this._handwritingDirty=true;
    this.setData({handwritingCanUndo:true,handwritingCanRedo:false,handwritingStatus:'尚未保存'});
  },
  onHandwritingUndo: function() {
    if(!this._handwritingPast.length)return;
    this._handwritingDirty=true;
    this._handwritingFuture.push(handwriting.copy(this.data.handwritingScene));
    const scene=this._handwritingPast.pop();
    this.setData({handwritingScene:scene,handwritingPurpose:scene.purpose,handwritingBackground:scene.backgroundColor,handwritingCanUndo:!!this._handwritingPast.length,handwritingCanRedo:true,handwritingStatus:'尚未保存'});
  },
  onHandwritingRedo: function() {
    if(!this._handwritingFuture.length)return;
    this._handwritingDirty=true;
    this._handwritingPast.push(handwriting.copy(this.data.handwritingScene));
    const scene=this._handwritingFuture.pop();
    this.setData({handwritingScene:scene,handwritingPurpose:scene.purpose,handwritingBackground:scene.backgroundColor,handwritingCanRedo:!!this._handwritingFuture.length,handwritingCanUndo:true,handwritingStatus:'尚未保存'});
  },
  onSaveHandwriting: function() {
    try{
      const items=handwriting.save(wx,{id:this._handwritingId,updatedAt:Date.now(),strokes:this.data.handwritingScene.strokes,workspaceSize:this.data.handwritingScene.workspaceSize,viewport:this.data.handwritingScene.viewport,purpose:this.data.handwritingPurpose,backgroundColor:this.data.handwritingBackground});
      this._handwritingDirty=false;
      this.setData({handwritingDrafts:handwriting.decorate(items),handwritingStatus:'已保存到本机'});
    }catch(error){this.setData({handwritingStatus:error.message || '本机保存失败，请勿退出'});}
  },
  onCancelHandwriting: function() {
    const close=()=>this.setData({handwritingVisible:false});
    if(this._handwritingDirty)wx.showModal({title:'放弃未保存的笔迹？',content:'不会修改当前卡片或已保存草稿。',success:r=>{if(r.confirm)close();}});
    else close();
  },
  onClearHandwritingDrafts: function() {
    wx.showModal({title:'清空本机手写草稿？',content:'仅删除手写素材库，不删除当前卡片和项目草稿，无法撤销。',success:r=>{
      if(!r.confirm)return;
      try{wx.removeStorageSync(handwriting.KEY);this.setData({handwritingDrafts:[],handwritingStatus:'已清空手写草稿'});}
      catch(_){wx.showToast({title:'清空失败，请重试',icon:'none'});}
    }});
  },
  onDeleteHandwritingDraft: function(event) {
    const id=event.currentTarget.dataset.id;
    wx.showModal({title:'删除这份手写草稿？',content:'不影响已添加到卡片的贴纸。',success:r=>{
      if(!r.confirm)return;
      try{wx.setStorageSync(handwriting.KEY,handwriting.read(wx).filter(d=>d.id!==id));this.loadHandwritingDrafts();}
      catch(_){wx.showToast({title:'删除失败',icon:'none'});}
    }});
  },
  onAddHandwritingSticker: function() {
    if (!this.data.handwritingVisible || this.data.editorExportBusy) return;
    const strokes=this.data.handwritingScene.strokes;
    if(!strokes.length){wx.showToast({title:'请先写画',icon:'none'});return;}
    if(!this._handwritingTarget || this._handwritingTarget.sceneId!==this.data.currentScene.sceneId || this._handwritingTarget.candidateId!==this.data.selectedCandidate.candidateId) {
      wx.showToast({title:'目标卡片已变化，请关闭后重新打开草稿',icon:'none'});return;
    }
    try{
      const groups=handwriting.copy(this.data.currentScene.inkStickers || []);
      const existing=groups.find(g=>g.id===this._editingInkId);
      const id=existing ? existing.id : 'hw_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
      const workspaceSize=this.data.handwritingScene.workspaceSize;
      const viewport=handwriting.copy(this.data.handwritingScene.viewport);
      if (this._editingInkId && !existing) throw new Error('原手写已删除，请重新打开');
      if (!existing && this.data.handwritingPurpose === 'card') {
        const project=funTextProject.insertFreeCard(this.data.project,this._handwritingTarget.candidateId,this._handwritingTarget.sceneId,{
          backgroundColor:this.data.handwritingBackground,
          inkSticker:{id,x:540,y:540,scale:0.88,rotation:0,strokes:handwriting.copy(strokes),workspaceSize,viewport}
        });
        this.syncProject(project,this.data.currentCardIndex+1,'');
        this.setData({handwritingVisible:false,selectedInkId:id,activeEditorTab:'content'});
        this.onSaveHandwriting();
        return;
      }
      if(existing)Object.assign(existing,{strokes:handwriting.copy(strokes),workspaceSize,viewport});
      else groups.push({id,x:540,y:540,scale:0.5,rotation:0,strokes:handwriting.copy(strokes),workspaceSize,viewport});
      const project=funTextProject.updateInkStickers(this.data.project,this._handwritingTarget.candidateId,this._handwritingTarget.sceneId,groups);
      this.syncProject(project,this.data.currentCardIndex,'');
      this.setData({handwritingVisible:false,selectedInkId:id});
      this.onSaveHandwriting();
    }catch(error){wx.showToast({title:error.message || '添加失败',icon:'none'});}
  },
  onSelectInkSticker: function(event) {this.setData({selectedInkId:event.currentTarget.dataset.id,selectedDecorationId:''});},
  onEditInkSticker: function() {
    const group=(this.data.currentScene.inkStickers || []).find(g=>g.id===this.data.selectedInkId);
    if(!group)return;
    this.onStartHandwriting();this._editingInkId=group.id;this._handwritingId=group.id;
    this.setData({handwritingEditing:true,handwritingPurpose:'sticker',handwritingScene:handwriting.scene(group.strokes,group)});
  },
  onHandwritingPurpose: function(event) {
    const purpose=event.currentTarget.dataset.purpose;
    if (this._editingInkId || !this.data.handwritingVisible || !['sticker','card'].includes(purpose)) return;
    if (purpose===this.data.handwritingPurpose) return;
    this.pushHandwritingHistory();
    const metadata=Object.assign({},this.data.handwritingScene,{purpose,backgroundColor:this.data.handwritingBackground});
    this.setData({handwritingPurpose:purpose,handwritingScene:handwriting.scene(metadata.strokes,metadata)});
  },
  onHandwritingBackground: function(event) {
    const color=event.currentTarget.dataset.color;
    if (!this.data.backgroundColors.includes(color) || !this.data.handwritingVisible) return;
    if (color===this.data.handwritingBackground) return;
    this.pushHandwritingHistory();
    const metadata=Object.assign({},this.data.handwritingScene,{backgroundColor:color});
    this.setData({handwritingBackground:color,handwritingScene:handwriting.scene(metadata.strokes,metadata)});
  },
  onSelectSolidBackground: function(event) {
    if (!this.data.backgroundColors.includes(event.currentTarget.dataset.color) || this.data.editorExportBusy) return;
    this.applyStyleChange({backgroundColor:event.currentTarget.dataset.color});
  },
  onAddBlankCard: function() {
    if (!this.data.currentScene || this.data.editorExportBusy || this.data.handwritingVisible) return;
    try {
      const project=funTextProject.insertFreeCard(this.data.project,this.data.selectedCandidate.candidateId,this.data.currentScene.sceneId);
      this.syncProject(project,this.data.currentCardIndex+1,'');
      this.setData({activeEditorTab:'content'});
    } catch(error) {wx.showToast({title:error.message,icon:'none'});}
  },
  onDeleteInkSticker: function() {
    try{const groups=(this.data.currentScene.inkStickers || []).filter(g=>g.id!==this.data.selectedInkId);
      this.syncProject(funTextProject.updateInkStickers(this.data.project,this.data.selectedCandidate.candidateId,this.data.currentScene.sceneId,groups),this.data.currentCardIndex,'');
    }catch(error){wx.showToast({title:error.message,icon:'none'});}
  },
  onInkStickerStart: function(event) {
    this.onSelectInkSticker(event);
    const group=(this.data.currentScene.inkStickers || []).find(g=>g.id===this.data.selectedInkId);
    if(!group)return;
    this._inkStickerSession=transformMath.beginTransform(event.touches,group,this._previewWidth || 320);
    this._inkStickerGroups=null;
  },
  onInkStickerMove: function(event) {
    if(!this._inkStickerSession)return;
    const original=this.data.project.candidates.find(c=>c.candidateId===this.data.selectedCandidate.candidateId).editedScenes[this.data.currentCardIndex];
    const scene=handwriting.copy(original), group=scene.inkStickers.find(g=>g.id===this.data.selectedInkId);
    if(!group)return;
    Object.assign(group,transformMath.updateTransform(this._inkStickerSession,event.touches));
    try{inkStickers.flatten(scene);this._inkStickerGroups=scene.inkStickers;this.setData({currentScene:scene});}catch(_){/* Keep last valid position at the canvas boundary. */}
  },
  onInkStickerEnd: function() {
    if(this._inkStickerGroups){const id=this.data.selectedInkId;
      try{this.syncProject(funTextProject.updateInkStickers(this.data.project,this.data.selectedCandidate.candidateId,this.data.currentScene.sceneId,this._inkStickerGroups),this.data.currentCardIndex,'');this.setData({selectedInkId:id});}
      catch(error){wx.showToast({title:error.message,icon:'none'});}}
    this._inkStickerSession=null;this._inkStickerGroups=null;
  },
  onInkStickerCancel: function() {
    this._inkStickerSession=null;this._inkStickerGroups=null;this.onSelectCard({currentTarget:{dataset:{index:this.data.currentCardIndex}}});
  },

  onToggleDrawing: function () { this.setData({drawingMode:!this.data.drawingMode}); },
  onHandwritingMode:function(event) {
    this.setData({handwritingPanMode:event.currentTarget.dataset.mode==='pan'});
  },
  onHandwritingViewport:function(event) {
    if(!this.data.handwritingVisible)return;
    const max=this.data.handwritingScene.workspaceSize-1080, v=event.detail;
    if(![v.x,v.y].every(n=>Number.isFinite(n)&&n>=0&&n<=max))return;
    this._handwritingDirty=true;
    this.setData({handwritingScene:Object.assign({},this.data.handwritingScene,{viewport:{x:v.x,y:v.y}}),handwritingStatus:'尚未保存'});
  },
  onInkBrush: function(event) {
    const key=event.currentTarget.dataset.key;
    if(['pen','highlighter','eraser'].indexOf(key)>=0) this.setData({brushKey:key});
  },
  onInkWidth: function(event) {
    const width=Number(event.currentTarget.dataset.width);
    if(ink.WIDTHS.indexOf(width)>=0) this.setData({penWidth:width});
  },
  onInkColor: function(event) {
    const key=event.currentTarget.dataset.key;
    if(Object.prototype.hasOwnProperty.call(ink.COLORS,key)) this.setData({inkColor:key});
  },
  onInkLimit: function(event) { wx.showToast({title:event && event.detail && event.detail.message || '笔迹达到上限，请撤销或减少笔迹',icon:'none'}); },
  onInkChange: function(event) {
    if(!this.data.localEditorEnabled) return;
    try {
      const project=funTextProject.updateStrokes(this.data.project,this.data.selectedCandidate.candidateId,
        this.data.currentScene.sceneId,event.detail.strokes);
      this.syncProject(project,this.data.currentCardIndex,'');
    } catch(error) { wx.showToast({title:error.message || '笔迹保存失败',icon:'none'}); }
  },
  onClearInk: function() {
    const that=this;
    const sceneId=this.data.currentScene.sceneId;
    wx.showModal({title:'清空当前卡片笔迹？',content:'不会删除文字和贴纸，可撤销。',success:function(result){
      if(result.confirm && that.data.currentScene.sceneId===sceneId) that.onInkChange({detail:{strokes:[]}});
    }});
  },
  saveLocalDraft: function() {
    if(!this.data.localEditorEnabled) return;
    try {
      if(!wx.setStorageSync) throw new Error('storage unavailable');
      const project=JSON.parse(JSON.stringify(this.data.project));
      project.editHistory={past:[],future:[]};
      wx.setStorageSync('wepic_fun_editor_draft_v1',{project:project,currentCardIndex:this.data.currentCardIndex});
      this.setData({draftStatus:'已保存到本机（仅最近一个草稿）'});
    } catch(_) { this.setData({draftStatus:'本机保存失败，请勿退出'}); }
  },
  onRestoreLocalDraft: function() {
    try {
      const draft=wx.getStorageSync('wepic_fun_editor_draft_v1');
      if(!draft || !draft.project || !Array.isArray(draft.project.candidates)) throw new Error('没有本机草稿');
      draft.project.candidates.forEach(function(c){c.editedScenes.forEach(function(s){
        if(!ink.valid(s.strokes || [])) throw new Error('草稿笔迹格式不正确');
        inkStickers.flatten(s);
      });});
      this.initProject(draft.project,draft);
      this.setData({draftStatus:'已恢复本机草稿'});
    } catch(error) { wx.showToast({title:error.message || '草稿无法恢复',icon:'none'}); }
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
      selectedInkId:'',
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
    this.saveLocalDraft();
    if(this.data.localEditorEnabled)previewPreloader.warm(wx,this.data.project,this.data.selectedCandidate.candidateId,this.data.currentCardIndex);
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
      selectedInkId:'',
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
    this._transformSession = transformMath.beginTransform(event.touches, layer, this._previewWidth || 320);
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
    if (ENABLE_FUN_OFFLINE_PREVIEW === true) return;
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
      this.setData({
        serverPreviewDiagnostic: {
          stage: 'buildPreviewPayload',
          message: '开始构建预览参数'
        }
      });

      const payload = funTextProject.buildPreviewPayload(this.data.project);

      this.setData({
        serverPreviewDiagnostic: {
          stage: 'requestPreviewStack',
          message: '开始请求云端预览'
        }
      });

      const response = await funCardRendererClient.requestPreviewStack(wx, payload);
      if (this._editorPreviewFallback !== fallback || !this.data.project || this.data.project.projectId !== projectId) return;
      const selectedCandidateId = this.data.selectedCandidate.candidateId;
      const renderedCandidate = response.candidates.find(function (candidate) {
        return candidate && candidate.candidateId === selectedCandidateId;
      });

      this.setData({
        serverPreviewDiagnostic: {
          stage: 'responseReceived',
          message: '已收到云端返回'
        }
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
      if (
        this._editorPreviewFallback !== fallback ||
        !this.data.project ||
        this.data.project.projectId !== projectId
      ) return;

      fallback.loading = false;

      const diagnostic = {
        stage: 'failed',
        message: error && error.message
          ? String(error.message)
          : String(error || '未知错误'),
        errCode: error && error.errCode !== undefined
          ? error.errCode
          : null,
        errMsg: error && error.errMsg
          ? String(error.errMsg)
          : '',
        name: error && error.name
          ? String(error.name)
          : ''
      };

      this.setData({
        serverPreviewLoading: false,
        serverPreviewFailed: true,
        currentFallbackImage: '',
        serverPreviewDiagnostic: diagnostic
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
  onMoveCard:function(event){
    if(this._editorExportBusy || !this.data.selectedCandidate)return;
    const index=Number(event.currentTarget.dataset.index), delta=Number(event.currentTarget.dataset.delta);
    if(delta!==-1 && delta!==1)return;
    const id=this.data.currentScene.sceneId;
    const next=funTextProject.moveCard(this.data.project,this.data.selectedCandidate.candidateId,index,index+delta);
    const candidate=next.candidates.find(c=>c.candidateId===next.selectedCandidateId);
    this.syncProject(next,candidate.editedScenes.findIndex(s=>s.sceneId===id),'');
  },
  onDeleteCard:function(event){
    if(this._editorExportBusy || !this.data.selectedCandidate)return;
    const index=Number(event.currentTarget.dataset.index), id=this.data.currentScene.sceneId;
    const next=funTextProject.removeCard(this.data.project,this.data.selectedCandidate.candidateId,index);
    if(next===this.data.project)return;
    const scenes=next.candidates.find(c=>c.candidateId===next.selectedCandidateId).editedScenes;
    let selected=scenes.findIndex(s=>s.sceneId===id);
    if(selected<0)selected=Math.min(index,scenes.length-1);
    this.syncProject(next,selected,'');
  },
  onShow:function(){this._openingResult=false;},
  onUnload:function(){this._editorUnloaded=true;this._openingResult=false;},
  onSaveCurrentPage:function(){return this.runEditorExport('current');},
  onSaveAllPages:function(){return this.runEditorExport('all');},
  onWechatPreview:function(){return this.runEditorExport('preview');},
  onExportMaskTouch:function(){},
  updateExportProgress:function(stage,current,total,completed){
    if(this._editorUnloaded)return;
    this.setData({exportProgress:{visible:true,stage,current:current||0,total:total||0,completed:completed||0,
      percent:total ? Math.min(100,Math.round((completed||0)*100/total)) : 0}});
  },
  runEditorExport:async function(action){
    if(this._editorExportBusy || !this.data.project || ENABLE_FUN_TEXT_STACK_ENTRY!==true)return;
    if(!this.data.localEditorEnabled && this.data.scenes.some(s=>(s.strokes||[]).length||(s.inkStickers||[]).length)) {
      wx.showToast({title:'此版本暂不支持手绘导出',icon:'none'});return;
    }
    const snapshot=handwriting.copy(this.data.project), sceneId=this.data.currentScene.sceneId;
    const fingerprint=JSON.stringify(funTextProject.buildRenderPayload(snapshot));
    const isCurrent=()=>!this._editorUnloaded && fingerprint===JSON.stringify(funTextProject.buildRenderPayload(this.data.project));
    this._editorExportBusy=true;this.setData({editorExportBusy:true});
    this.updateExportProgress(action==='preview'?'preview':'audit');
    try {
      if (this._imageViewerPending) await this._imageViewerPending;
      if (!isCurrent()) return;
      if(action==='preview'){
        const canvas=await new Promise((resolve,reject)=>wx.createSelectorQuery().select('#editorExportCanvas').fields({node:true,size:true}).exec(r=>r&&r[0]&&r[0].node?resolve(r[0].node):reject(Error('预览画布未就绪，请重试'))));
        const cards=await localPreview.renderCards(wx,canvas,snapshot,isCurrent);
        const previewManifest=await badgeComposer.materializeManifest(wx,canvas,exportManifest.buildFunTextManifest(snapshot,cards),{isCurrent});
        if(!isCurrent())return;
        wx.navigateTo({url:'/pages/preview/preview',success:r=>r.eventChannel.emit('acceptTaskData',{manifest:previewManifest,selectedStackIds:[previewManifest.stacks[0].stackId],ratio:'1:1',previewOnly:true,funProject:snapshot})});
        return;
      }
      let manifest=this._editorManifestKey===fingerprint && this._editorManifest;
      if(!manifest){
        const result=await funCardRendererClient.requestRenderStack(wx,funTextProject.buildRenderPayload(snapshot));
        if(!isCurrent())throw Error('内容已改变，请重新保存');
        this.updateExportProgress('preparing');
        const canvas=await new Promise((resolve,reject)=>wx.createSelectorQuery().select('#editorExportCanvas').fields({node:true,size:true}).exec(r=>r&&r[0]&&r[0].node?resolve(r[0].node):reject(Error('导出画布未就绪，请重试'))));
        manifest=await badgeComposer.materializeManifest(wx,canvas,exportManifest.buildFunTextManifest(snapshot,result.cards),{isCurrent});
        if(!isCurrent())throw Error('内容已改变，请重新保存');
        this._editorManifest=manifest;this._editorManifestKey=fingerprint;
      }
      if(!isCurrent())return;
      if(action==='preview'){
        wx.navigateTo({url:'/pages/preview/preview',success:r=>r.eventChannel.emit('acceptTaskData',{manifest,selectedStackIds:[manifest.stacks[0].stackId],ratio:'1:1'})});
      }else{
        const cards=manifest.stacks[0].cards;
        const urls=(action==='current'?cards.filter(c=>c.cardId===sceneId):cards).map(c=>c.exportUrl);
        if(!urls.length)throw Error('未找到当前页图片');
        const key=fingerprint+'/'+action+'/'+(action==='current'?sceneId:'');
        const startIndex=this._editorSaveKey===key ? this._editorSaveCursor||0 : 0;
        this._editorSaveKey=key;
        try {
          await imageExporter.saveImagesSequentially(wx,urls,{startIndex,resolvePath:async(api,url)=>{
            if(!isCurrent())throw Error('内容已改变，请重新保存');
            return imageExporter.resolveImagePath(api,url);
          },onProgress:(current,total)=>this.updateExportProgress('saving',current,total,current-1),
          onSaved:(completed,total)=>this.updateExportProgress('saving',completed,total,completed)});
          this._editorSaveCursor=0;
        }catch(error){this._editorSaveCursor=error.nextIndex||0;throw error;}
        require('../../utils/wechatSendGuide').goToWechat(wx);
      }
    }catch(error){
      if(!this._editorUnloaded){
        this.setData({'exportProgress.visible':false});
        if(error.code==='AUTH_DENIED')wx.showModal({title:'需要相册权限',content:'请允许访问相册后再点击保存。',confirmText:'去设置',success:r=>{if(r.confirm)wx.openSetting();}});
        else if(error.code==='SAFETY_UNAVAILABLE' || error.code==='IMAGE_SAFETY_UNAVAILABLE' || error.code==='RENDER_TIMEOUT')wx.showModal({title:'暂未生成成品',content:error.message,showCancel:false,confirmText:'继续编辑'});
        else wx.showToast({title:error.message||'准备失败，请重试',icon:'none'});
      }
    }finally{this._editorExportBusy=false;if(!this._editorUnloaded)this.setData({editorExportBusy:false,'exportProgress.visible':false});}
  },
  onConfirmEdits: function () {
    if(this._editorExportBusy || this._openingResult)return;
    if (!this.data.localEditorEnabled && (this.data.scenes || []).some(function(scene){return (scene.strokes && scene.strokes.length) || (scene.inkStickers && scene.inkStickers.length);} )) {
      wx.showToast({title:'此版本暂不支持手绘导出，已保留草稿',icon:'none'});
      return;
    }
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (!this.data.project) return;
    const project = this.data.project;
    this._openingResult=true;
    wx.navigateTo({
      url: '/pages/template-result/template-result',
      success: function (navRes) {
        navRes.eventChannel.emit('funTextProject', { project: project });
      },
      fail: function () { this._openingResult = false; }.bind(this)
    });
  }
});
