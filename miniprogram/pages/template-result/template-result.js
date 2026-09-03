// pages/template-result/template-result.js
// 趣味字画/通用模板结果页：高清云端渲染、微信牌堆全屏预演、顺序编号保存及四步发送引导。
const funTextProject = require('../../utils/funTextProject');
const funCardRendererClient = require('../../utils/funCardRendererClient');
const imageExporter = require('../../utils/imageExporter');
const painter = require('../../utils/scenePainter');
const { ENABLE_FUN_TEXT_STACK_ENTRY } = require('../../config/env');

const LOCAL_RENDER_FALLBACK_CODES = {
  FUN_RENDERER_NOT_CONFIGURED: true,
  NETWORK_ERROR: true
};
const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

function canRenderLocally(error) {
  return Boolean(
    error
    && typeof error.code === 'string'
    && Object.prototype.hasOwnProperty.call(LOCAL_RENDER_FALLBACK_CODES, error.code)
  );
}

function isSupportedProject(project) {
  return Boolean(project && project.version === 1);
}

function selectedScenes(project) {
  const candidate = (project && Array.isArray(project.candidates))
    ? project.candidates.find(function (item) { return item.candidateId === project.selectedCandidateId; })
    : null;
  return candidate && Array.isArray(candidate.editedScenes) ? candidate.editedScenes : [];
}

function normalizedPersistentUrl(url) {
  if (typeof url !== 'string') return '';
  const normalized = url.trim();
  return /^(?:https?|cloud):\/\/\S+$/i.test(normalized) ? normalized : '';
}

function renderFingerprint(project) {
  try {
    return funTextProject.createRenderFingerprint(project);
  } catch (error) {
    return '';
  }
}

function normalizeReusableCards(project, cards, taskSnapshot) {
  const scenes = selectedScenes(project);
  const fingerprint = renderFingerprint(project);
  if (
    !fingerprint
    || !taskSnapshot
    || taskSnapshot.type !== 'funtext'
    || taskSnapshot.taskId !== project.projectId
    || taskSnapshot.renderFingerprint !== fingerprint
    || renderFingerprint(taskSnapshot.projectSnapshot) !== fingerprint
    || !Array.isArray(cards)
    || cards.length !== scenes.length
    || scenes.length === 0
  ) return null;

  const normalizedCards = [];
  const valid = cards.every(function (card, index) {
    const scene = scenes[index];
    const url = card && normalizedPersistentUrl(card.url);
    if (!(
      card
      && scene
      && card.sceneId === scene.sceneId
      && card.role === scene.role
      && card.order === scene.order
      && card.renderFingerprint === fingerprint
      && url
    )) return false;
    normalizedCards.push(Object.assign({}, card, { url: url }));
    return true;
  });
  return valid ? normalizedCards : null;
}

function canonicalFunTextRecordId(record) {
  if (!record || record.type !== 'funtext') return '';
  if (record.taskSnapshot && record.taskSnapshot.type !== 'funtext') return '';
  const identityFields = [];
  if (Object.prototype.hasOwnProperty.call(record, 'projectId')) {
    identityFields.push(record.projectId);
  }
  if (record.projectSnapshot) {
    identityFields.push(record.projectSnapshot.projectId);
  }
  if (record.taskSnapshot) {
    identityFields.push(record.taskSnapshot.taskId);
    if (record.taskSnapshot.projectSnapshot) {
      identityFields.push(record.taskSnapshot.projectSnapshot.projectId);
    }
  }
  if (identityFields.some(function (id) { return typeof id !== 'string' || id.length === 0; })) return '';
  const ids = identityFields;
  if (!ids.length || ids.some(function (id) { return id !== ids[0]; })) return '';
  return ids[0];
}

function canonicalFunTextTaskId(task) {
  if (!task || task.type !== 'funtext' || typeof task.taskId !== 'string' || !task.taskId) return '';
  const snapshotId = task.projectSnapshot && task.projectSnapshot.projectId;
  return snapshotId === task.taskId ? task.taskId : '';
}

Page({
  data: {
    funTextEntryEnabled: ENABLE_FUN_TEXT_STACK_ENTRY === true,
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
    if (!this.ensureEnabled()) return;
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
          that.initProject(data.task.projectSnapshot, data.task.cards, data.task);
        }
      });
    }
  },

  nextRenderGeneration: function () {
    this._renderGeneration = (this._renderGeneration || 0) + 1;
    return this._renderGeneration;
  },

  isCurrentRenderGeneration: function (generation) {
    return ENABLE_FUN_TEXT_STACK_ENTRY === true && this._renderGeneration === generation;
  },

  ensureEnabled: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY === true) return true;
    this.nextRenderGeneration();
    this.setData({ project: null, task: null, renderedCards: [], rendering: false,
      renderFailed: true, renderErrorMessage: '趣味字画暂不可用', saving: false,
      saveCursor: 0, showGuide: false, currentIndex: 0 });
    return false;
  },

  initProject: async function (project, existingCards, taskSnapshot) {
    if (!this.ensureEnabled()) return;
    const generation = this.nextRenderGeneration();
    if (!project || !project.selectedCandidateId) return;

    if (!isSupportedProject(project)) {
      this.setData({
        project: null,
        task: null,
        renderedCards: [],
        rendering: false,
        renderFailed: true,
        renderErrorMessage: '该记录版本暂不支持',
        saveCursor: 0,
        showGuide: false,
        currentIndex: 0
      });
      return;
    }

    const reusableCards = normalizeReusableCards(project, existingCards, taskSnapshot);

    this.setData({
      project: project,
      task: null,
      renderedCards: [],
      rendering: !reusableCards,
      renderFailed: false,
      renderErrorMessage: '',
      saveCursor: 0,
      showGuide: false,
      currentIndex: 0
    });

    if (reusableCards) {
      this.applyRenderSuccess(project, reusableCards, generation);
      return;
    }

    try {
      const payload = funTextProject.buildRenderPayload(project);
      const res = await funCardRendererClient.requestRenderStack(wx, payload);
      if (!this.isCurrentRenderGeneration(generation)) return;
      this.applyRenderSuccess(project, res.cards, generation);
    } catch (err) {
      if (!this.isCurrentRenderGeneration(generation)) return;
      if (canRenderLocally(err)) {
        this.renderLocalCanvasStack(project, generation);
        return;
      }
      this.setData({
        rendering: false,
        renderFailed: true,
        renderErrorMessage: (err && err.message) || '高清渲染失败，请重试'
      });
    }
  },

  renderLocalCanvasStack: function (project, generation) {
    const that = this;
    if (!that.isCurrentRenderGeneration(generation)) return;
    const candidate = (project.candidates || []).find(function (c) {
      return c.candidateId === project.selectedCandidateId;
    });
    const scenes = (candidate && candidate.editedScenes) || [];
    if (!scenes.length) {
      that.setData({
        rendering: false,
        renderFailed: true,
        renderErrorMessage: '未找到选中的场景数据'
      });
      return;
    }

    const query = wx.createSelectorQuery();
    query.select('#funTextExporterCanvas').fields({ node: true, size: true }).exec(async function (res) {
      if (!that.isCurrentRenderGeneration(generation)) return;
      const canvasNode = res && res[0] && res[0].node;
      if (!canvasNode) {
        that.setData({
          rendering: false,
          renderFailed: true,
          renderErrorMessage: '高清画布初始化失败，请重试'
        });
        return;
      }

      try {
        canvasNode.width = 1080;
        canvasNode.height = 1080;
        const ctx = canvasNode.getContext('2d');
        const renderedCards = [];

        for (let i = 0; i < scenes.length; i++) {
          if (!that.isCurrentRenderGeneration(generation)) return;
          const scene = scenes[i];
          ctx.clearRect(0, 0, 1080, 1080);
          painter.paintScene(ctx, scene, 1080);

          const tempFilePath = await new Promise(function (resolve, reject) {
            wx.canvasToTempFilePath({
              canvas: canvasNode,
              width: 1080,
              height: 1080,
              destWidth: 1080,
              destHeight: 1080,
              fileType: 'png',
              success: function (r) { resolve(r.tempFilePath); },
              fail: reject
            });
          });

          if (!that.isCurrentRenderGeneration(generation)) return;

          renderedCards.push({
            sceneId: scene.sceneId,
            role: scene.role,
            order: i + 1,
            url: tempFilePath
          });
        }

        if (!that.isCurrentRenderGeneration(generation)) return;
        that.applyRenderSuccess(project, renderedCards, generation);
      } catch (error) {
        if (!that.isCurrentRenderGeneration(generation)) return;
        that.setData({
          rendering: false,
          renderFailed: true,
          renderErrorMessage: '本地生成失败: ' + ((error && error.message) || error)
        });
      }
    });
  },

  applyRenderSuccess: function (project, cards, generation) {
    if (!this.isCurrentRenderGeneration(generation)) return;
    const fingerprint = renderFingerprint(project);
    if (!fingerprint) return;
    const fingerprintedCards = cards.map(function (card) {
      return Object.assign({}, card, {
        url: typeof card.url === 'string' ? card.url.trim() : card.url,
        renderFingerprint: fingerprint
      });
    });
    const task = {
      taskId: project.projectId,
      mode: 'funtext',
      type: 'funtext',
      sourceText: project.sourceText,
      projectSnapshot: project,
      cards: fingerprintedCards,
      renderFingerprint: fingerprint,
      createdAt: project.createdAt || Date.now()
    };

    // 记录到本地存储
    try {
      const history = wx.getStorageSync('wepic_history_tasks') || [];
      const filtered = Array.isArray(history) ? history.filter(function (t) {
        return canonicalFunTextTaskId(t) !== task.taskId;
      }) : [];
      filtered.unshift(task);
      wx.setStorageSync('wepic_history_tasks', filtered.slice(0, 20));
    } catch (e) {
      console.warn('保存历史任务失败:', e);
    }

    try {
      const savedRecords = wx.getStorageSync(RECORDS_KEY);
      const records = Array.isArray(savedRecords) ? savedRecords : [];
      const originalIndex = records.findIndex(function (record) {
        return canonicalFunTextRecordId(record) === task.taskId;
      });
      const original = originalIndex >= 0 ? records[originalIndex] : null;
      const filtered = records.filter(function (storedRecord) {
        return canonicalFunTextRecordId(storedRecord) !== task.taskId;
      });
      const record = {
        recordId: original && original.recordId ? original.recordId : 'record_' + Date.now(),
        projectId: task.taskId,
        createdAt: original && typeof original.createdAt === 'number' ? original.createdAt : task.createdAt,
        type: 'funtext',
        projectSnapshot: project,
        renderFingerprint: fingerprint,
        text: task.sourceText,
        totalCount: fingerprintedCards.length,
        thumbnails: fingerprintedCards.slice(0, 4).map(function (card) { return card.url; }),
        taskSnapshot: task
      };
      wx.setStorageSync(RECORDS_KEY, [record].concat(filtered).slice(0, MAX_RECORDS));
    } catch (e) {
      console.warn('保存趣味字画记录失败:', e);
    }

    this.setData({
      project: project,
      task: task,
      renderedCards: fingerprintedCards,
      rendering: false,
      renderFailed: false,
      saveCursor: 0
    });
  },

  onRetryRender: function () {
    if (!this.ensureEnabled()) return;
    if (this.data.project && !this.data.rendering) {
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
    if (!this.ensureEnabled()) return;
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
    if (!this.ensureEnabled()) return;
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
    if (!this.ensureEnabled()) return;
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
