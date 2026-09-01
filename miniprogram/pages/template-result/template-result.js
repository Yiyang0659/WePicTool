// pages/template-result/template-result.js
// 趣味字画/通用模板结果页：高清云端渲染、微信牌堆全屏预演、顺序编号保存及四步发送引导。
const funTextProject = require('../../utils/funTextProject');
const funCardRendererClient = require('../../utils/funCardRendererClient');
const imageExporter = require('../../utils/imageExporter');

Page({
  data: {
    project: null,
    task: null,
    renderedCards: [],
    rendering: true,
    renderFailed: false,
    renderErrorMessage: '',
    saving: false,
    saveCursor: 0,
    showGuide: false,
    currentIndex: 0
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
      eventChannel.on('acceptTaskData', function (data) {
        if (data && data.task && data.task.projectSnapshot) {
          that.initProject(data.task.projectSnapshot, data.task.cards);
        }
      });
    }
  },

  initProject: async function (project, existingCards) {
    if (!project || !project.selectedCandidateId) return;

    this.setData({
      project: project,
      rendering: !existingCards || !existingCards.length,
      renderFailed: false,
      renderErrorMessage: '',
      saveCursor: 0,
      showGuide: false,
      currentIndex: 0
    });

    if (existingCards && existingCards.length) {
      this.applyRenderSuccess(project, existingCards);
      return;
    }

    try {
      const payload = funTextProject.buildRenderPayload(project);
      const res = await funCardRendererClient.requestRenderStack(wx, payload);
      this.applyRenderSuccess(project, res.cards);
    } catch (err) {
      this.setData({
        rendering: false,
        renderFailed: true,
        renderErrorMessage: (err && err.message) || '高清渲染失败，请重试'
      });
    }
  },

  applyRenderSuccess: function (project, cards) {
    const task = {
      taskId: project.projectId,
      mode: 'funtext',
      type: 'funtext',
      sourceText: project.sourceText,
      projectSnapshot: project,
      cards: cards,
      createdAt: project.createdAt || Date.now()
    };

    // 记录到本地存储
    try {
      const history = wx.getStorageSync('wepic_history_tasks') || [];
      const filtered = Array.isArray(history) ? history.filter(function (t) { return t.taskId !== task.taskId; }) : [];
      filtered.unshift(task);
      wx.setStorageSync('wepic_history_tasks', filtered.slice(0, 20));
    } catch (e) {
      console.warn('保存历史任务失败:', e);
    }

    this.setData({
      project: project,
      task: task,
      renderedCards: cards,
      rendering: false,
      renderFailed: false,
      saveCursor: 0
    });
  },

  onRetryRender: function () {
    if (this.data.project) {
      this.initProject(this.data.project);
    }
  },

  onSwiperChange: function (event) {
    const current = Number(event.detail && event.detail.current);
    if (Number.isFinite(current)) {
      this.setData({ currentIndex: current });
    }
  },

  // 1. 先滑着看看（进入深色微信牌堆全屏预演）
  onPreviewStack: function () {
    if (!this.data.project || !this.data.renderedCards.length) return;
    const groups = funTextProject.buildPreviewGroups(this.data.project, this.data.renderedCards);
    wx.navigateTo({
      url: '/pages/preview/preview',
      success: function (res) {
        res.eventChannel.emit('acceptTaskData', {
          groups: groups,
          ratio: '1:1'
        });
      }
    });
  },

  // 2. 自己改改（回退到轻编辑页）
  onEditStack: function () {
    if (!this.data.project) return;
    const project = this.data.project;
    wx.navigateTo({
      url: '/pages/fun-text-editor/fun-text-editor',
      success: function (res) {
        res.eventChannel.emit('funTextProject', { project: project });
      }
    });
  },

  // 3. 按顺序保存（支持断点续存）
  onSaveStack: async function () {
    if (this.data.saving || !this.data.renderedCards.length) return;
    this.setData({ saving: true });

    const urls = this.data.renderedCards.map(function (c) { return c.url; });
    const startIndex = this.data.saveCursor;
    const that = this;

    try {
      await imageExporter.saveImagesSequentially(wx, urls, {
        startIndex: startIndex,
        onProgress: function (cur, total) {
          wx.showLoading({ title: '保存 ' + cur + '/' + total + ' 张...', mask: true });
        }
      });
      wx.hideLoading();
      that.setData({
        saving: false,
        saveCursor: 0,
        showGuide: true
      });
    } catch (err) {
      wx.hideLoading();
      const nextCursor = (err && typeof err.nextIndex === 'number') ? err.nextIndex : startIndex;
      that.setData({
        saving: false,
        saveCursor: nextCursor
      });

      if (err && err.code === 'AUTH_DENIED') {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许访问相册，以保存趣味字画卡片。',
          confirmText: '去设置',
          success: function (modalRes) {
            if (modalRes.confirm && typeof wx.openSetting === 'function') {
              wx.openSetting();
            }
          }
        });
      } else {
        wx.showToast({
          title: (err && err.message) || '保存中断，点击可继续保存',
          icon: 'none'
        });
      }
    }
  },

  onCloseGuide: function () {
    this.setData({ showGuide: false });
  }
});
