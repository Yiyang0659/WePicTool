// pages/template-result/template-result.js
// 趣味字画/通用模板结果页：高清云端渲染、微信牌堆全屏预演、顺序编号保存及四步发送引导。
const funTextProject = require('../../utils/funTextProject');
const localPreview = require('../../utils/funLocalPreview');
const funCardRendererClient = require('../../utils/funCardRendererClient');
const imageExporter = require('../../utils/imageExporter');
const stackExportManifest = require('../../utils/stackExportManifest');
const sequenceBadgeComposer = require('../../utils/sequenceBadgeComposer');
const funTextEnv = require('../../config/env');
const { ENABLE_FUN_TEXT_STACK_ENTRY } = funTextEnv;

const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

function isSupportedProject(project) {
  return Boolean(project && project.version === 1);
}

function renderFingerprint(project) {
  try {
    return funTextProject.createRenderFingerprint(project);
  } catch (error) {
    return '';
  }
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
    saveNextSequenceLabel: '',
    showGuide: false,
    currentIndex: 0,
    exportPreparing: false,
    exportManifest: null,
    exportFingerprint: '',
    saveSessionFingerprint: '',
    exportError: ''
  },

  _sequenceCanvas: null,
  _sequenceReady: false,
  _exportGeneration: 0,
  _exportPreparePromise: null,
  _savePromise: null,
  _pendingRenderRecord: null,

  onLoad: function () {
    if (!this.ensureEnabled()) return;
    this.initSequenceCanvas();
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

  onReady: function () {
    if (this.ensureEnabled() && !this._sequenceReady) this.initSequenceCanvas();
  },

  onUnload: function () {
    this.nextRenderGeneration();
    this._exportGeneration += 1;
    this._exportPreparePromise = null;
    this._savePromise = null;
    this._pendingRenderRecord = null;
  },

  initSequenceCanvas: function (retryCount) {
    const that = this;
    const attempt = retryCount || 0;
    if (typeof wx.createSelectorQuery !== 'function') {
      this.setData({ exportError: '顺序图生成器未就绪，请稍后重试' });
      return;
    }
    const query = wx.createSelectorQuery();
    query.select('#funTextSequenceBadgeCanvas').fields({ node: true, size: true }).exec(function (res) {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) {
        if (attempt < 2) setTimeout(function () { that.initSequenceCanvas(attempt + 1); }, 300);
        else that.setData({ exportError: '顺序图生成器未就绪，请稍后重试' });
        return;
      }
      that._sequenceCanvas = canvas;
      that._sequenceReady = true;
      if (!that.data.rendering && !that.data.renderFailed && that.data.renderedCards.length) {
        that.prepareExportManifest().catch(function () {});
      }
    });
  },

  invalidateExportState: function () {
    this._auditedFingerprint = '';
    this._exportGeneration += 1;
    this._exportPreparePromise = null;
    this._savePromise = null;
    this._pendingRenderRecord = null;
    const cards = (this.data.renderedCards || []).map(function (card) {
      const next = Object.assign({}, card);
      delete next.exportUrl;
      return next;
    });
    this.setData({
      renderedCards: cards,
      exportPreparing: false,
      exportManifest: null,
      exportFingerprint: '',
      exportError: '',
      saving: false,
      saveCursor: 0,
      saveNextSequenceLabel: '',
      saveSessionFingerprint: ''
    });
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
      saveCursor: 0, saveNextSequenceLabel: '', showGuide: false, currentIndex: 0,
      exportPreparing: false, exportManifest: null, exportFingerprint: '',
      saveSessionFingerprint: '', exportError: '' });
    return false;
  },

  initProject: async function (project) {
    if (!this.ensureEnabled()) return;
    const generation = this.nextRenderGeneration();
    this.invalidateExportState();
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
        saveNextSequenceLabel: '',
        showGuide: false,
        currentIndex: 0
      });
      return;
    }

    // History files are not proof of an audit in this session. Rebuild local previews.

    this.setData({
      project: project,
      task: null,
      renderedCards: [],
      rendering: true,
      renderFailed: false,
      renderErrorMessage: '',
      saveCursor: 0,
      saveNextSequenceLabel: '',
      showGuide: false,
      currentIndex: 0
    });

    try {
      const canvas = await new Promise((resolve,reject)=>wx.createSelectorQuery().select('#funTextExporterCanvas').fields({node:true,size:true}).exec(r=>r&&r[0]&&r[0].node?resolve(r[0].node):reject(Error('预览画布尚未就绪，请重试'))));
      const cards = await localPreview.renderCards(wx,canvas,project,()=>this.isCurrentRenderGeneration(generation));
      if (!this.isCurrentRenderGeneration(generation)) return;
      await this.applyRenderSuccess(project, cards, generation);
    } catch (err) {
      if (!this.isCurrentRenderGeneration(generation)) return;
      this.setData({
        rendering: false,
        renderFailed: true,
        renderErrorMessage: (err && err.message) || '高清渲染失败，请重试'
      });
    }
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

    this._pendingRenderRecord = { task: task, project: project, cards: fingerprintedCards, fingerprint: fingerprint };
    this.setData({
      project: project,
      task: task,
      renderedCards: fingerprintedCards,
      rendering: false,
      renderFailed: false,
      saveCursor: 0,
      saveNextSequenceLabel: ''
    });
    if (this._sequenceReady) {
      return this.prepareExportManifest().catch(function () { return null; });
    }
    return Promise.resolve(null);
  },

  persistPendingRenderRecord: function () {
    const pending = this._pendingRenderRecord;
    if (!pending || !this.data.exportManifest || pending.task.taskId !== this.data.project.projectId) return;
    const task = pending.task;
    const project = pending.project;
    const fingerprintedCards = pending.cards;
    const fingerprint = pending.fingerprint;
    this._pendingRenderRecord = null;

    try {
      const history = wx.getStorageSync('wepic_history_tasks') || [];
      const filteredHistory = Array.isArray(history) ? history.filter(function (storedTask) {
        return canonicalFunTextTaskId(storedTask) !== task.taskId;
      }) : [];
      filteredHistory.unshift(task);
      wx.setStorageSync('wepic_history_tasks', filteredHistory.slice(0, 20));
    } catch (error) {
      console.warn('保存历史任务失败:', error);
    }

    try {
      const savedRecords = wx.getStorageSync(RECORDS_KEY);
      const records = Array.isArray(savedRecords) ? savedRecords : [];
      const originalIndex = records.findIndex(function (record) {
        return canonicalFunTextRecordId(record) === task.taskId;
      });
      const original = originalIndex >= 0 ? records[originalIndex] : null;
      const filteredRecords = records.filter(function (storedRecord) {
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
      wx.setStorageSync(RECORDS_KEY, [record].concat(filteredRecords).slice(0, MAX_RECORDS));
    } catch (error) {
      console.warn('保存趣味字画记录失败:', error);
    }
  },

  applyMaterializedManifest: function (manifest) {
    const stack = manifest.stacks[0];
    const byScene = {};
    (stack && stack.cards || []).forEach(function (card) { byScene[card.cardId] = card.exportUrl; });
    const cards = this.data.renderedCards.map(function (card) {
      return Object.assign({}, card, { exportUrl: byScene[card.sceneId] || '' });
    });
    this.setData({
      renderedCards: cards,
      exportPreparing: false,
      exportManifest: manifest,
      exportFingerprint: manifest.fingerprint,
      exportError: ''
    });
  },

  prepareExportManifest: function () {
    const that = this;
    if (!this.ensureEnabled()) return Promise.reject(Object.assign(new Error('趣味字画暂不可用'), { code: 'FUN_TEXT_DISABLED' }));
    if (this.data.rendering || this.data.renderFailed || !this.data.project || !this.data.renderedCards.length) {
      return Promise.reject(Object.assign(new Error('高清卡片尚未生成完成'), { code: 'RENDER_NOT_READY' }));
    }
    if (!this._sequenceReady || !this._sequenceCanvas) {
      return Promise.reject(Object.assign(new Error('顺序图生成器未就绪'), { code: 'SEQUENCE_CANVAS_UNAVAILABLE' }));
    }
    let sourceManifest;
    try {
      sourceManifest = stackExportManifest.buildFunTextManifest(this.data.project, this.data.renderedCards);
    } catch (error) {
      this.setData({ exportError: (error && error.message) || '顺序图准备失败' });
      return Promise.reject(error);
    }
    if (this.data.exportManifest && this.data.exportFingerprint === sourceManifest.fingerprint) {
      return Promise.resolve(this.data.exportManifest);
    }
    if (this._exportPreparePromise) return this._exportPreparePromise;
    const generation = ++this._exportGeneration;
    const renderGeneration = this._renderGeneration;
    this.setData({ exportPreparing: true, exportError: '' });
    const materializing = sequenceBadgeComposer.materializeManifest(wx, this._sequenceCanvas, sourceManifest, {
      isCurrent: function () {
        return that._exportGeneration === generation && that.isCurrentRenderGeneration(renderGeneration);
      }
    }).then(function (manifest) {
      if (that._exportGeneration !== generation) {
        throw Object.assign(new Error('顺序图任务已过期'), { code: 'STALE_EXPORT_GENERATION' });
      }
      that.applyMaterializedManifest(manifest);
      that.persistPendingRenderRecord();
      return manifest;
    }).catch(function (error) {
      if (error && error.code === 'STALE_EXPORT_GENERATION') throw error;
      const detail = error && error.sequenceLabel ? '（' + error.sequenceLabel + '）' : '';
      that.setData({ exportPreparing: false, exportError: '顺序图生成失败' + detail + '，请重试' });
      throw error;
    });
    let tracked;
    tracked = materializing.then(function (manifest) {
      if (that._exportPreparePromise === tracked) that._exportPreparePromise = null;
      return manifest;
    }, function (error) {
      if (that._exportPreparePromise === tracked) that._exportPreparePromise = null;
      throw error;
    });
    this._exportPreparePromise = tracked;
    return tracked;
  },

  showExportPrepareError: function (error) {
    let title = '顺序图生成失败，请重试';
    if (error && error.code === 'RENDER_NOT_READY') title = '高清卡片尚未生成完成';
    if (error && error.code === 'SEQUENCE_CANVAS_UNAVAILABLE') title = '顺序图生成器未就绪，请稍后重试';
    wx.showToast({ title: title, icon: 'none', duration: 2200 });
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
    if(this.data.saving || this._savePromise)return;
    if (!this.ensureEnabled()) return;
    if (!this.data.project || !this.data.renderedCards.length) return;
    const that = this;
    return this.prepareExportManifest().then(function (manifest) {
      wx.navigateTo({
        url: '/pages/preview/preview',
        success: function (res) {
          res.eventChannel.emit('acceptTaskData', {
            manifest: manifest,
            selectedStackIds: [manifest.stacks[0].stackId],
            ratio: '1:1'
            ,previewOnly: true, funProject: JSON.parse(JSON.stringify(that.data.project))
          });
        }
      });
      return manifest;
    }).catch(function (error) {
      if (!error || error.code !== 'STALE_EXPORT_GENERATION') that.showExportPrepareError(error);
      return null;
    });
  },

  // 2. 自己改改（回退到轻编辑页）
  onEditStack: function () {
    if(this.data.saving || this._savePromise)return;
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
  prepareAuditedManifest: async function () {
    const generation=this._renderGeneration, project=this.data.project;
    const fingerprint=renderFingerprint(project);
    if(this._auditedFingerprint!==fingerprint){
      this.setData({saving:true});
      wx.showLoading({title:'正在审核并生成',mask:true});
      try {
        if(this._exportPreparePromise)await this._exportPreparePromise;
        if(!this.isCurrentRenderGeneration(generation))throw Object.assign(Error('保存任务已过期'),{code:'STALE_EXPORT_GENERATION'});
        const result=await funCardRendererClient.requestRenderStack(wx,funTextProject.buildRenderPayload(project));
        if(!this.isCurrentRenderGeneration(generation))throw Object.assign(Error('保存任务已过期'),{code:'STALE_EXPORT_GENERATION'});
        this.setData({exportManifest:null,exportFingerprint:''});
        await this.applyRenderSuccess(project,result.cards,generation);
        if(!this.isCurrentRenderGeneration(generation))throw Object.assign(Error('保存任务已过期'),{code:'STALE_EXPORT_GENERATION'});
        this._auditedFingerprint=fingerprint;
      } finally { wx.hideLoading(); }
    }
    return this.prepareExportManifest();
  },
  onSaveStack: async function () {
    if (!this.ensureEnabled()) return;
    if (this.data.saving || this._savePromise) return this._savePromise;
    if (!this.data.renderedCards.length) return;
    const that = this;
    const renderGeneration=this._renderGeneration;
    const run = this.prepareAuditedManifest().then(function (manifest) {
      if(!that.isCurrentRenderGeneration(renderGeneration))return null;
      const saveGeneration = that._exportGeneration;
      const startIndex = that.data.saveSessionFingerprint === manifest.fingerprint ? that.data.saveCursor : 0;
      that.setData({ saving: true, saveCursor: startIndex, saveSessionFingerprint: manifest.fingerprint });
      return imageExporter.saveExportManifest(wx, manifest, {
        allowNonStackable: true,
        startIndex: startIndex,
        expectedFingerprint: manifest.fingerprint,
        onProgress: function (entry, current, total) {
          wx.showLoading({ title: entry.sequenceLabel + ' · ' + current + '/' + total, mask: true });
        }
      }).then(function (result) {
        wx.hideLoading();
        if (that._exportGeneration !== saveGeneration) return result;
        that.setData({
          saving: false,
          saveCursor: 0,
          saveNextSequenceLabel: '',
          saveSessionFingerprint: '',
          showGuide: true,
          exportError: ''
        });
        return result;
      }).catch(function (error) {
        wx.hideLoading();
        if (that._exportGeneration !== saveGeneration) return null;
        const nextCursor = error && typeof error.nextIndex === 'number' ? error.nextIndex : startIndex;
        const stack = manifest.stacks[0];
        const nextCard = stack && stack.cards[nextCursor];
        const sequenceLabel = (error && error.sequenceLabel) || (nextCard && nextCard.sequenceLabel) || '';
        that.setData({
          saving: false,
          saveCursor: nextCursor,
          saveNextSequenceLabel: sequenceLabel,
          saveSessionFingerprint: manifest.fingerprint,
          exportError: (error && error.message) || '保存失败'
        });
        if (error && error.code === 'AUTH_DENIED') {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册，以从 ' + (sequenceLabel || '当前图片') + ' 继续保存。',
            confirmText: '去设置',
            success: function (modalRes) {
              if (modalRes.confirm && typeof wx.openSetting === 'function') wx.openSetting();
            }
          });
        } else {
          wx.showToast({
            title: sequenceLabel ? '保存中断，可从 ' + sequenceLabel + ' 继续' : ((error && error.message) || '保存中断，点击可继续保存'),
            icon: 'none'
          });
        }
        return null;
      });
    }).catch(function (error) {
      if(!that.isCurrentRenderGeneration(renderGeneration))return null;
      that.setData({ saving: false });
      wx.showToast({title:error.message || '审核或成图失败，请重试',icon:'none'});
      return null;
    });
    let tracked;
    tracked = run.then(function (result) {
      if (that._savePromise === tracked) that._savePromise = null;
      return result;
    }, function (error) {
      if (that._savePromise === tracked) that._savePromise = null;
      throw error;
    });
    this._savePromise = tracked;
    return tracked;
  },

  onCloseGuide: function () {
    this.setData({ showGuide: false });
  },
  onGoWechat: function () {
    if (this.data.showGuide) require('../../utils/wechatSendGuide').goToWechat(wx);
  }
});
