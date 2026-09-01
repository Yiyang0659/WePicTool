// pages/fun-text-candidates/fun-text-candidates.js
// 趣味字画三套候选页：纵向展示三套独立可滑牌堆，支持用这套、自己改改、再来三套与服务端低清降级。
const funTextProject = require('../../utils/funTextProject');
const funCardRendererClient = require('../../utils/funCardRendererClient');

Page({
  data: {
    project: null,
    candidates: [],
    serverPreviewLoading: false,
    serverPreviewFailed: false,
    regenerating: false
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
    this._previewLoading = false;

    const candidates = (project.candidates || []).map(function (item) {
      return {
        candidateId: item.candidateId,
        strategyId: item.strategyId,
        title: item.title,
        stylePackId: item.stylePackId,
        cards: item.cards || [],
        editedScenes: item.editedScenes || [],
        currentIndex: 0,
        cardCount: (item.cards && item.cards.length) || (item.editedScenes && item.editedScenes.length) || 0,
        fallbackImages: null
      };
    });

    this.setData({
      project: project,
      candidates: candidates,
      serverPreviewLoading: false,
      serverPreviewFailed: false,
      regenerating: false
    });
  },

  onSwipeCandidate: function (event) {
    const index = Number(event.currentTarget.dataset.index);
    const current = Number(event.detail && event.detail.current);
    if (!Number.isFinite(index) || !Number.isFinite(current)) return;

    const key = 'candidates[' + index + '].currentIndex';
    this.setData({
      [key]: current
    });
  },

  onUseCandidate: function (event) {
    const dataset = event.currentTarget.dataset || {};
    const candidateId = dataset.candidateId || (this.data.candidates[dataset.index] && this.data.candidates[dataset.index].candidateId);
    if (!candidateId || !this.data.project) return;

    try {
      const selectedProject = funTextProject.selectCandidate(this.data.project, candidateId);
      wx.navigateTo({
        url: '/pages/template-result/template-result',
        success: function (navRes) {
          navRes.eventChannel.emit('funTextProject', { project: selectedProject });
        }
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '选择方案失败', icon: 'none' });
    }
  },

  onEditCandidate: function (event) {
    const dataset = event.currentTarget.dataset || {};
    const candidateId = dataset.candidateId || (this.data.candidates[dataset.index] && this.data.candidates[dataset.index].candidateId);
    if (!candidateId || !this.data.project) return;

    try {
      const selectedProject = funTextProject.selectCandidate(this.data.project, candidateId);
      wx.navigateTo({
        url: '/pages/fun-text-editor/fun-text-editor',
        success: function (navRes) {
          navRes.eventChannel.emit('funTextProject', { project: selectedProject });
        }
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '进入编辑失败', icon: 'none' });
    }
  },

  onRegenerate: function () {
    if (this.data.regenerating || !this.data.project) return;
    this.setData({ regenerating: true });
    try {
      const nextProject = funTextProject.replanProject(this.data.project);
      this.initProject(nextProject);
    } catch (err) {
      this.setData({ regenerating: false });
      wx.showToast({ title: (err && err.message) || '重新规划失败', icon: 'none' });
    }
  },

  onCanvasError: async function () {
    if (this._previewLoading || this.data.serverPreviewFailed || !this.data.project) {
      return;
    }
    this._previewLoading = true;
    this.setData({ serverPreviewLoading: true });

    try {
      const payload = funTextProject.buildPreviewPayload(this.data.project);
      const res = await funCardRendererClient.requestPreviewStack(wx, payload);

      const candidates = this.data.candidates.map(function (c) {
        const respCand = res.candidates.find(function (item) {
          return item && item.candidateId === c.candidateId;
        });
        return Object.assign({}, c, {
          fallbackImages: respCand && Array.isArray(respCand.cards)
            ? respCand.cards.map(function (card) { return card.url; })
            : null
        });
      });

      this._previewLoading = false;
      this.setData({
        candidates: candidates,
        serverPreviewLoading: false,
        serverPreviewFailed: false
      });
    } catch (err) {
      this._previewLoading = false;
      this.setData({
        serverPreviewLoading: false,
        serverPreviewFailed: true
      });
    }
  },

  onRetryPreview: function () {
    this._previewLoading = false;
    this.setData({ serverPreviewFailed: false });
    this.onCanvasError();
  }
});
