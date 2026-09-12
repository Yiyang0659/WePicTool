// pages/fun-text-candidates/fun-text-candidates.js
// 趣味字画三套候选页：纵向展示三套独立可滑牌堆，支持用这套、自己改改、再来三套与服务端低清降级。
const funTextProject = require('../../utils/funTextProject');
const { ENABLE_FUN_TEXT_STACK_ENTRY, ENABLE_FUN_LOCAL_EDITOR, ENABLE_FUN_OFFLINE_PREVIEW } = require('../../config/env');
const funCardRendererClient = require('../../utils/funCardRendererClient');
const previewPreloader = require('../../utils/funPreviewPreloader');

Page({
  data: {
    localEditorEnabled: ENABLE_FUN_LOCAL_EDITOR === true || ENABLE_FUN_OFFLINE_PREVIEW === true,
    project: null,
    candidates: [],
    serverPreviewLoading: false,
    serverPreviewFailed: false,
    regenerating: false
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

  onShow: function () { this._openingEditor = false; },

  onCardTouchStart: function (event) {
    this._cardTouch = event.touches && event.touches[0];
    this._cardMoved = false;
  },

  onCardTouchMove: function (event) {
    const point = event.touches && event.touches[0];
    if (!point || !this._cardTouch) return;
    if (Math.abs(point.clientX - this._cardTouch.clientX) > 10 ||
        Math.abs(point.clientY - this._cardTouch.clientY) > 10) this._cardMoved = true;
  },

  onCardTouchCancel: function () { this._cardMoved = true; },

  onCardTap: function (event) {
    if (this._cardMoved) return;
    this.onEditCandidate(event);
  },

  initProject: function (project) {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (!project) return;
    this._previewFallback = {
      projectId: project.projectId,
      attempted: false,
      succeeded: false,
      loading: false
    };

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
    if(this.data.localEditorEnabled)previewPreloader.warm(wx,project);
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
    if (ENABLE_FUN_OFFLINE_PREVIEW === true) return this.onEditCandidate(event);
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (this._openingEditor) return;
    const dataset = event.currentTarget.dataset || {};
    const candidateId = dataset.candidateId || (this.data.candidates[dataset.index] && this.data.candidates[dataset.index].candidateId);
    if (!candidateId || !this.data.project) return;

    try {
      const selectedProject = funTextProject.selectCandidate(this.data.project, candidateId);
      const that = this;
      this._openingEditor = true;
      wx.navigateTo({
        url: '/pages/template-result/template-result',
        success: function (navRes) {
          navRes.eventChannel.emit('funTextProject', { project: selectedProject });
        },
        fail: function () { that._openingEditor = false; }
      });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '选择方案失败', icon: 'none' });
    }
  },

  onEditCandidate: function (event) {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (this._openingEditor) return;
    const dataset = event.currentTarget.dataset || {};
    const candidateId = dataset.candidateId || (this.data.candidates[dataset.index] && this.data.candidates[dataset.index].candidateId);
    if (!candidateId || !this.data.project) return;

    try {
      const selectedProject = funTextProject.selectCandidate(this.data.project, candidateId);
      const previewCandidate = this.data.candidates.find(function (item) { return item.candidateId === candidateId; });
      const that = this;
      this._openingEditor = true;
      wx.navigateTo({
        url: '/pages/fun-text-editor/fun-text-editor',
        success: function (navRes) {
          navRes.eventChannel.emit('funTextProject', {
            project: selectedProject,
            currentCardIndex: previewCandidate ? previewCandidate.currentIndex : 0
          });
        },
        fail: function () {
          that._openingEditor = false;
          wx.showToast({ title: '进入编辑失败，请重试', icon: 'none' });
        }
      });
    } catch (err) {
      this._openingEditor = false;
      wx.showToast({ title: (err && err.message) || '进入编辑失败', icon: 'none' });
    }
  },

  onRegenerate: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
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
    if (ENABLE_FUN_OFFLINE_PREVIEW === true) return;
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) return;
    if (!this.data.project) {
      return;
    }
    const projectId = this.data.project.projectId;
    const fallback = this._previewFallback;
    if (!fallback || fallback.projectId !== projectId || fallback.loading || fallback.attempted || fallback.succeeded) {
      return;
    }
    fallback.attempted = true;
    fallback.loading = true;
    this.setData({ serverPreviewLoading: true });

    try {
      const payload = funTextProject.buildPreviewPayload(this.data.project);
      const res = await funCardRendererClient.requestPreviewStack(wx, payload);
      if (this._previewFallback !== fallback || !this.data.project || this.data.project.projectId !== projectId) {
        return;
      }

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

      fallback.loading = false;
      fallback.succeeded = true;
      this.setData({
        candidates: candidates,
        serverPreviewLoading: false,
        serverPreviewFailed: false
      });
    } catch (err) {
      if (this._previewFallback !== fallback || !this.data.project || this.data.project.projectId !== projectId) {
        return;
      }
      fallback.loading = false;
      this.setData({
        serverPreviewLoading: false,
        serverPreviewFailed: true
      });
    }
  },

  onRetryPreview: function () {
    if (!this.data.project) return;
    this._previewFallback = {
      projectId: this.data.project.projectId,
      attempted: false,
      succeeded: false,
      loading: false
    };
    this.setData({ serverPreviewFailed: false });
    this.onCanvasError();
  }
});
