// pages/fun-text-editor/fun-text-editor.js
// 趣味字画轻编辑页：只提供改当前卡文字、换整叠风格、缩略图调整顺序三个聚焦动作。
const funTextProject = require('../../utils/funTextProject');
const stylePacks = require('../../config/stylePacks');

const STYLE_PACK_NAMES = {
  'pink-note-v1': '粉色便签',
  'chalk-chaos-v1': '黑板乱写',
  'paper-collage-v1': '剪贴报纸'
};

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
    draggingIndex: -1
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
      canvasRevision: 0
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
  onStartEditText: function () {
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

  onConfirmEditText: function () {
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

  // 3. 调整顺序
  onMoveCard: function (eventOrParams) {
    const params = eventOrParams || {};
    const dataset = (params.currentTarget && params.currentTarget.dataset) || {};
    const fromIndex = typeof params.fromIndex === 'number' ? params.fromIndex : Number(dataset.fromIndex);
    const toIndex = typeof params.toIndex === 'number' ? params.toIndex : Number(dataset.toIndex);

    if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex === toIndex) return;

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
      const newCurrentIndex = toIndex;
      const currentScene = scenes[newCurrentIndex];

      this.setData({
        project: updatedProject,
        selectedCandidate: candidate,
        scenes: scenes,
        currentCardIndex: newCurrentIndex,
        currentScene: currentScene,
        canvasRevision: this.data.canvasRevision + 1
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '调整顺序失败', icon: 'none' });
    }
  },

  // 拖动排序触发：点击前移 / 后移
  onMoveCardLeft: function (event) {
    const index = Number(event.currentTarget.dataset.index);
    if (index > 0) {
      this.onMoveCard({ fromIndex: index, toIndex: index - 1 });
    }
  },

  onMoveCardRight: function (event) {
    const index = Number(event.currentTarget.dataset.index);
    if (index < this.data.scenes.length - 1) {
      this.onMoveCard({ fromIndex: index, toIndex: index + 1 });
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
