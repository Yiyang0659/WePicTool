// pages/fun-text-editor/fun-text-editor.js
// 趣味字画轻编辑页：只提供改当前卡文字、换整叠风格、缩略图调整顺序三个聚焦动作。
const funTextProject = require('../../utils/funTextProject');
const stylePacks = require('../../config/stylePacks');

const STYLE_PACK_NAMES = {
  'pink-note-v1': '粉色便签',
  'chalk-chaos-v1': '黑板乱写',
  'paper-collage-v1': '剪贴报纸'
};

function getSortItemWidth() {
  try {
    const systemInfo = typeof wx !== 'undefined' && wx.getSystemInfoSync && wx.getSystemInfoSync();
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
    return Object.assign({}, scene, {
      x: x,
      centerX: x + width / 2,
      label: index === 0 ? '微信封面' : String(index + 1)
    });
  });
  return {
    items: items,
    width: width,
    areaWidth: items.length ? items[items.length - 1].x + width : 0
  };
}

Page({
  data: {
    project: null,
    selectedCandidate: null,
    scenes: [],
    currentCardIndex: 0,
    currentScene: null,
    stylePacks: [],
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
    const packList = (stylePacks.STYLE_PACKS || []).map(function (pack) {
      return {
        id: pack.id,
        name: STYLE_PACK_NAMES[pack.id] || pack.id,
        color: pack.background && pack.background.color
      };
    });

    const sortGeometry = buildSortItems(scenes);
    this.setData({
      project: project,
      selectedCandidate: selectedCandidate,
      scenes: scenes,
      currentCardIndex: 0,
      currentScene: scenes[0] || null,
      stylePacks: packList,
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
      maxCharCount: (scene && scene.role === 'reveal') ? 40 : 12
    });
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

      const candidate = updatedProject.candidates.find(function (c) {
        return c.candidateId === updatedProject.selectedCandidateId;
      });
      const scenes = candidate.editedScenes;
      const currentScene = scenes[this.data.currentCardIndex];

      this.setData({
        project: updatedProject,
        selectedCandidate: candidate,
        scenes: scenes,
        currentScene: currentScene,
        editingTextModalVisible: false,
        canvasRevision: this.data.canvasRevision + 1
      });
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

      const candidate = updatedProject.candidates.find(function (c) {
        return c.candidateId === updatedProject.selectedCandidateId;
      });
      const scenes = candidate.editedScenes;
      const currentScene = scenes[this.data.currentCardIndex];

      this.setData({
        project: updatedProject,
        selectedCandidate: candidate,
        scenes: scenes,
        currentScene: currentScene,
        canvasRevision: this.data.canvasRevision + 1
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '切换风格失败', icon: 'none' });
    }
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
    if (nearestIndex !== this.data.sortToIndex) {
      this.setData({ sortToIndex: nearestIndex });
    }
  },

  onSortEnd: function () {
    const fromIndex = this.data.sortFromIndex;
    const toIndex = this.data.sortToIndex;
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0) return;

    // 先清空生命周期状态，避免 bindchange 与重复 touchend 造成第二次移动。
    this.setData({ draggingIndex: -1, sortFromIndex: -1, sortToIndex: -1 });
    if (fromIndex === toIndex || !this.data.project || !this.data.selectedCandidate) return;

    try {
      const updatedProject = funTextProject.moveCard(
        this.data.project,
        this.data.selectedCandidate.candidateId,
        fromIndex,
        toIndex
      );
      const candidate = updatedProject.candidates.find(function (c) {
        return c.candidateId === updatedProject.selectedCandidateId;
      });
      const scenes = candidate.editedScenes;
      const sortGeometry = buildSortItems(scenes);

      this.setData({
        project: updatedProject,
        selectedCandidate: candidate,
        scenes: scenes,
        currentCardIndex: toIndex,
        currentScene: scenes[toIndex],
        sortItems: sortGeometry.items,
        sortItemWidth: sortGeometry.width,
        sortAreaWidth: sortGeometry.areaWidth,
        canvasRevision: this.data.canvasRevision + 1
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '调整顺序失败', icon: 'none' });
    }
  },

  // 4. 确认编辑并进入结果页
  onConfirmEdits: function () {
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
