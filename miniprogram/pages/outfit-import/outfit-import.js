const { createMockTask } = require('../../utils/task');
const progress = require('../../utils/outfitProgress');
const { composeCard } = require('../../utils/cardComposer');

const RATIO_OPTIONS = [
  { key: '1:1', label: '1:1' },
  { key: '4:5', label: '4:5' },
  { key: '3:4', label: '3:4' }
];

const REVIEW_GROUP_DEFINITIONS = [
  { key: 'head', title: '头像 / 发型', emoji: '🙂' },
  { key: 'tops', title: '上衣', emoji: '👕' },
  { key: 'bottoms', title: '下装', emoji: '👖' },
  { key: 'shoes', title: '鞋子', emoji: '👟' },
  { key: 'others', title: '其他素材', emoji: '🖼' },
  { key: 'pending', title: '待确认素材', emoji: '❓' }
];

function preferredUrl(item) {
  return item.mattedUrl || item.mattedFileId || item.url || item.fileId || item.localPath || item.originalUrl || item.originalFileId || '';
}

function originalUrl(item) {
  return item.originalUrl || item.originalFileId || item.localPath || item.url || item.fileId || '';
}

function normalizeReviewGroup(groupKey, item) {
  if (item && item.status === 'processing_failed') return 'pending';
  var classification = item && item.classification;
  if (classification && classification.needsConfirmation) return 'pending';
  if (groupKey === 'head' || groupKey === 'heads') return 'head';
  if (groupKey === 'tops' || groupKey === 'bottoms' || groupKey === 'shoes') return groupKey;
  if (groupKey === 'others' && classification && classification.confidence >= 0.8) return 'others';
  return 'pending';
}

function buildReviewItems(task) {
  var result = [];
  var groups = task && task.groups ? task.groups : {};
  Object.keys(groups).forEach(function (groupKey) {
    (Array.isArray(groups[groupKey]) ? groups[groupKey] : []).forEach(function (item, index) {
      var processed = item.mattedUrl || item.mattedFileId || '';
      var original = originalUrl(item);
      var targetKey = normalizeReviewGroup(groupKey, item);
      result.push(Object.assign({}, item, {
        id: item.sourceImageId || item.resultId || item.id || (groupKey + '_' + index),
        source: 'ai',
        groupKey: targetKey,
        processedUrl: processed,
        originalUrl: original,
        displayUrl: processed || preferredUrl(item),
        showMode: processed ? 'processed' : 'original',
        canToggle: Boolean(processed && original && processed !== original),
        needsConfirmation: targetKey === 'pending'
      }));
    });
  });
  return result;
}

function buildReviewGroups(items) {
  return REVIEW_GROUP_DEFINITIONS.map(function (definition) {
    return Object.assign({}, definition, {
      items: (items || []).filter(function (item) { return item.groupKey === definition.key; })
    });
  });
}

function buildSummary(items) {
  var counts = {};
  REVIEW_GROUP_DEFINITIONS.forEach(function (definition) { counts[definition.key] = 0; });
  (items || []).forEach(function (item) { counts[item.groupKey] = (counts[item.groupKey] || 0) + 1; });
  return '头像 ' + counts.head + ' · 上衣 ' + counts.tops + ' · 下装 ' + counts.bottoms + ' · 鞋子 ' + counts.shoes + ' · 待确认 ' + counts.pending;
}

Page({
  data: {
    phase: 'select',
    progressRows: [], progressTotal: 0, progressDone: 0, progressFailed: 0,
    progressPercent: 0, progressActive: '', elapsedSeconds: 0, batchFinished: false, canRetry: false,
    pickedImages: [],
    ratio: '3:4',
    ratioOptions: RATIO_OPTIONS,
    processing: false,
    loading: false,
    loadingText: '正在准备…',
    reviewItems: [],
    reviewGroups: [],
    reviewSummary: ''
  },

  _cancelRequested: false,
  _progressTimer: null,
  _openerEventChannel: null,

  onLoad: function () {
    if (typeof this.getOpenerEventChannel === 'function') {
      this._openerEventChannel = this.getOpenerEventChannel();
    }
  },

  onUnload: function () {
    this._cancelRequested = true;
    this._processingGeneration = (this._processingGeneration || 0) + 1;
    if (this._progressTimer) clearInterval(this._progressTimer);
  },

  onAddMedia: function () {
    if (this.data.processing || this.data.loading) return;
    var that = this;
    var remaining = 9 - this.data.pickedImages.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择 9 张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var files = res.tempFiles || [];
        if (files.length === 0) return;
        that.setData({ pickedImages: that.data.pickedImages.concat(files).slice(0, 9) });
      },
      fail: function (error) {
        if (error && error.errMsg && error.errMsg.indexOf('cancel') !== -1) return;
        wx.showToast({ title: '图片选择失败，请重试', icon: 'none' });
      }
    });
  },

  onPreviewPickedImage: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    var urls = this.data.pickedImages.map(function (item) { return item.tempFilePath; });
    if (urls.length > 0) wx.previewImage({ current: urls[index] || urls[0], urls: urls });
  },

  onRemovePickedImage: function (event) {
    if (this.data.processing || this.data.loading) return;
    var index = Number(event.currentTarget.dataset.index);
    var next = this.data.pickedImages.slice();
    if (index >= 0 && index < next.length) next.splice(index, 1);
    this.setData({ pickedImages: next });
  },

  onResetPickedImages: function () {
    if (this.data.processing || this.data.loading) return;
    this.setData({ pickedImages: [] });
  },

  onSelectRatio: function (event) {
    if (this.data.processing || this.data.loading) return;
    var key = event.currentTarget.dataset.key;
    if (RATIO_OPTIONS.some(function (item) { return item.key === key; })) this.setData({ ratio: key });
  },

  onBackToWorkbench: function () {
    wx.navigateBack();
  },

  onStartProcess: function () {
    if (this.data.processing || this._normalizing || this.data.pickedImages.length === 0) return;
    this._cancelRequested = false;
    this._processingGeneration = (this._processingGeneration || 0) + 1;
    this._batchRows = null;
    this.setData({ processing: true, loading: true, progressTotal: 0, batchFinished: false, loadingText: '正在检查图片…' });
    this.compressAndUploadImages(this.data.pickedImages, this._processingGeneration);
  },

  onCancelProcess: function () {
    this._cancelRequested = true;
    this._processingGeneration = (this._processingGeneration || 0) + 1;
    if (this._progressTimer) clearInterval(this._progressTimer);
    this._progressTimer = null;
    this._batchRows = null;
    this.setData({ processing: false, loading: false, progressTotal: 0, batchFinished: false });
  },

  compressAndUploadImages: async function (tempFiles, generation) {
    const current = () => !this._cancelRequested && generation === this._processingGeneration;
    var app = getApp();
    var useLocalMock = app.globalData && app.globalData.localMock;
    if (useLocalMock) {
      this.createLocalPreviewTask(tempFiles);
      return;
    }
    if (!wx.cloud || !(app.globalData && app.globalData.cloudReady)) {
      this.setData({ loading: false, processing: false });
      wx.showModal({
        title: '需要配置云开发',
        content: 'AI 整理需要可用的 CloudBase 环境和 processOutfit 云函数；你仍可返回工作台自己分层。',
        showCancel: false
      });
      return;
    }

    var uploadTasks = [];
    for (var i = 0; i < tempFiles.length; i++) {
      if (!current()) return;
      this.setData({ loadingText: '正在压缩图片 ' + (i + 1) + ' / ' + tempFiles.length });
      try {
        var compressedPath = await this.compressImage(tempFiles[i].tempFilePath);
        uploadTasks.push({
          filePath: compressedPath,
          sourcePath: tempFiles[i].tempFilePath,
          cloudPath: 'outfits/' + Date.now() + '_' + i + (compressedPath.substring(compressedPath.lastIndexOf('.')).split('?')[0] || '.jpg'),
          error: false,
          fileId: ''
        });
      } catch (error) {
        uploadTasks.push({ sourcePath: tempFiles[i].tempFilePath, error: true, fileId: '' });
      }
    }

    for (var start = 0; start < uploadTasks.length; start += 2) {
      if (!current()) return;
      var batch = uploadTasks.slice(start, start + 2);
      var that = this;
      await Promise.all(batch.map(async function (task, batchIndex) {
        if (task.error) return;
        var displayIndex = start + batchIndex + 1;
        that.setData({ loadingText: '正在上传图片 ' + displayIndex + ' / ' + uploadTasks.length });
        try {
          var response = await wx.cloud.uploadFile({ cloudPath: task.cloudPath, filePath: task.filePath });
          task.fileId = response.fileID;
        } catch (error) {
          task.error = true;
        }
      }));
    }

    if (!current()) return;
    this.createProcessingTask(uploadTasks, generation);
  },

  compressImage: function (filePath) {
    return new Promise(function (resolve) {
      wx.compressImage({
        src: filePath,
        quality: 80,
        success: function (response) { resolve(response.tempFilePath); },
        fail: function () { resolve(filePath); }
      });
    });
  },

  createProcessingTask: function (images, generation) {
    if (generation === undefined) generation = this._processingGeneration;
    const batchId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
    this._batchRows = progress.createSession(images.map((image, index) => Object.assign({}, image, {
      imageId: 'image_' + batchId + '_' + (index + 1), url: image.fileId
    })));
    return this.runProcessingSession(generation);
  },

  updateProcessingProgress: function () {
    const rows = this._batchRows || [];
    const done = rows.filter(row => row.status === 'done').length;
    const failed = rows.filter(row => row.status === 'failed').length;
    const active = rows.filter(row => row.status === 'processing');
    const slow = active.some(row => Date.now() - row.startedAt >= 30000);
    const labels = { waiting: '等待', processing: '处理中', done: '完成', failed: '失败' };
    this.setData({
      progressTotal: rows.length, progressDone: done, progressFailed: failed,
      progressPercent: rows.length ? Math.round(done / rows.length * 100) : 0,
      progressActive: active.length ? '正在处理第 ' + active.map(row => row.index + 1).join('、') + ' 张' : '',
      elapsedSeconds: Math.floor((Date.now() - this._batchStartedAt) / 1000),
      loadingText: slow ? '这张图片处理时间较长，请稍候' : 'AI 正在整理你的图片',
      progressRows: rows.map(row => ({
        index: row.index, src: row.image.sourcePath, status: row.status,
        label: labels[row.status], error: row.error ? row.error.message : ''
      }))
    });
  },

  runProcessingSession: async function (generation) {
    const current = () => !this._cancelRequested && generation === this._processingGeneration;
    const rows = this._batchRows;
    this._batchStartedAt = Date.now();
    this.setData({ processing: true, loading: true, batchFinished: false });
    this.updateProcessingProgress();
    this._progressTimer = setInterval(() => { if (current()) this.updateProcessingProgress(); }, 1000);
    await progress.runSession(rows, async image => {
      if (!image.fileId) {
        try {
          const uploaded = await wx.cloud.uploadFile({ cloudPath: image.cloudPath, filePath: image.filePath });
          image.fileId = uploaded.fileID;
          image.url = uploaded.fileID;
          if (!image.fileId) throw new Error('upload');
        } catch (_) { throw { code: 'UPLOAD_FAILED' }; }
      }
      if (!current()) throw { code: 'CANCELLED' };
      return new Promise((resolve, reject) => {
        wx.cloud.callFunction({
          name: 'processOutfit',
          data: { images: [image] },
          success: response => resolve(response.result),
          fail: reject
        });
      });
    }, current, () => this.updateProcessingProgress());
    if (!current()) return;
    clearInterval(this._progressTimer);
    this._progressTimer = null;
    if (rows.some(row => row.status === 'failed')) {
      this.setData({
        processing: false, batchFinished: true,
        loadingText: '本次整理已结束',
        canRetry: rows.some(row => row.status === 'failed' && row.error.retryable)
      });
      return;
    }
    this.onImportCompleted();
  },

  onRetryFailed: function () {
    if (this.data.processing || !this._batchRows || !this.data.canRetry) return;
    const rows = this._batchRows;
    const generation = this._processingGeneration;
    // Explicit action only; a timed-out server request may still be running.
    wx.showModal({
      title: '只重试失败图片',
      content: '成功图片不会重新生成。超时请求可能仍在后台处理，重试可能再次消耗额度。',
      success: response => {
        if (!response.confirm || this._cancelRequested || this.data.processing || this._batchRows !== rows || this._processingGeneration !== generation) return;
        progress.retryFailed(this._batchRows);
        this.runProcessingSession(this._processingGeneration);
      }
    });
  },

  onImportCompleted: function () {
    if (this.data.processing && this._progressTimer) return;
    if (!this._batchRows || !this._batchRows.some(row => row.status === 'done') || this._normalizing) return;
    this.setData({ processing: true, batchFinished: false, progressTotal: 0, loadingText: '正在准备加入工作台…' });
    this.showReviewTask(progress.mergeResults(this._batchRows), this._processingGeneration);
  },

  createLocalPreviewTask: function (tempFiles) {
    var images = tempFiles.map(function (file, index) {
      return {
        imageId: 'local_image_' + (index + 1),
        localPath: file.tempFilePath,
        url: file.tempFilePath,
        width: file.width || 0,
        height: file.height || 0,
        size: file.size || 0
      };
    }).filter(function (item) { return item.url; });
    if (images.length === 0) {
      this.setData({ loading: false, processing: false });
      wx.showToast({ title: '没有读取到有效图片', icon: 'none' });
      return;
    }
    this.showReviewTask(createMockTask(images));
    wx.showToast({ title: '本地预览模式', icon: 'none' });
  },

  showReviewTask: async function (task, generation) {
    if (generation === undefined) generation = this._processingGeneration;
    const current = () => !this._cancelRequested && generation === this._processingGeneration;
    if (this._returning || this._normalizing) return;
    this._normalizing = true;
    var items = buildReviewItems(task);
    for (var i = 0; i < items.length; i++) {
      if (!current()) { this._normalizing = false; return; }
      var item = items[i];
      if (!item.processedUrl || ['tops', 'bottoms', 'shoes'].indexOf(item.groupKey) < 0) continue;
      this.setData({ loadingText: '正在统一图片尺寸 ' + (i + 1) + ' / ' + items.length });
      try {
        var canvas = wx.createOffscreenCanvas({ type: '2d', width: 1024, height: 1365 });
        var composed = await composeCard(canvas, { sourceUrl: item.processedUrl, category: item.groupKey, ratio: this.data.ratio, isMatted: true });
        const saved = await new Promise((resolve, reject) => wx.getFileSystemManager().saveFile({ tempFilePath: composed.tempFilePath, success: resolve, fail: reject }));
        Object.assign(item, { processedUrl: saved.savedFilePath, displayUrl: saved.savedFilePath, localPath: saved.savedFilePath,
          width: composed.width, height: composed.height, standardized: true });
      } catch (_) {
        Object.assign(item, { groupKey: 'pending', needsConfirmation: true, processingError: '尺寸整理失败，请检查原图',
          displayUrl: item.originalUrl, processedUrl: '', mattedUrl: '', mattedFileId: '', matted: false });
      }
    }
    this._normalizing = false;
    if (!current()) return;
    this.setData({
      phase: 'select',
      reviewItems: items,
      reviewGroups: buildReviewGroups(items),
      reviewSummary: buildSummary(items),
      loading: false,
      processing: false
    });
    this.onApplyImport();
  },

  updateReviewItems: function (items) {
    this.setData({
      reviewItems: items,
      reviewGroups: buildReviewGroups(items),
      reviewSummary: buildSummary(items)
    });
  },

  onChangeReviewGroup: function (event) {
    var itemId = event.currentTarget.dataset.id;
    var that = this;
    wx.showActionSheet({
      itemList: REVIEW_GROUP_DEFINITIONS.map(function (item) { return item.title; }),
      success: function (response) {
        var target = REVIEW_GROUP_DEFINITIONS[response.tapIndex];
        if (!target) return;
        var next = that.data.reviewItems.map(function (item) {
          return item.id === itemId ? Object.assign({}, item, { groupKey: target.key, needsConfirmation: target.key === 'pending' }) : item;
        });
        that.updateReviewItems(next);
      }
    });
  },

  onToggleReviewVersion: function (event) {
    var itemId = event.currentTarget.dataset.id;
    var next = this.data.reviewItems.map(function (item) {
      if (item.id !== itemId || !item.canToggle) return item;
      var showOriginal = item.showMode !== 'original';
      return Object.assign({}, item, {
        showMode: showOriginal ? 'original' : 'processed',
        displayUrl: showOriginal ? item.originalUrl : item.processedUrl,
        url: showOriginal ? item.originalUrl : item.processedUrl
      });
    });
    this.updateReviewItems(next);
  },

  onRemoveReviewItem: function (event) {
    var itemId = event.currentTarget.dataset.id;
    this.updateReviewItems(this.data.reviewItems.filter(function (item) { return item.id !== itemId; }));
  },

  onPreviewReviewImage: function (event) {
    var itemId = event.currentTarget.dataset.id;
    var urls = this.data.reviewItems.map(function (item) { return item.displayUrl; }).filter(Boolean);
    var current = this.data.reviewItems.find(function (item) { return item.id === itemId; });
    if (urls.length > 0) wx.previewImage({ current: current ? current.displayUrl : urls[0], urls: urls });
  },

  buildImportPayload: function (manualOnly) {
    var groups = { head: [], tops: [], bottoms: [], shoes: [], others: [] };
    var pendingItems = [];
    this.data.reviewItems.forEach(function (item) {
      var output = Object.assign({}, item, { url: item.displayUrl, source: 'ai' });
      if (item.showMode === 'original') {
        output.processedUrl = '';
        output.mattedUrl = '';
        output.mattedFileId = '';
        output.matted = false;
        output.localPath = item.originalUrl;
        output.fileId = item.originalFileId || '';
      }
      if (!manualOnly && groups[item.groupKey]) groups[item.groupKey].push(output);
      else pendingItems.push(output);
    });
    return { groups: groups, pendingItems: pendingItems, ratio: this.data.ratio };
  },

  emitAndReturn: function (payload) {
    if (this._returning || this._cancelRequested) return;
    var channel = this._openerEventChannel;
    if (!channel || typeof channel.emit !== 'function') {
      wx.showToast({ title: '工作台连接已失效，请返回重试', icon: 'none' });
      return;
    }
    this._returning = true;
    channel.emit('acceptAiImport', payload);
    wx.navigateBack({ fail: () => { this._returning = false; wx.showToast({ title: '已加入，请手动返回工作台', icon: 'none' }); } });
  },

  onApplyImport: function () {
    if (this.data.reviewItems.length === 0) {
      wx.showToast({ title: '没有可加入的图片', icon: 'none' });
      return;
    }
    this.emitAndReturn(this.buildImportPayload(false));
  },

  onUseManual: function () {
    if (this.data.reviewItems.length === 0) {
      wx.navigateBack();
      return;
    }
    this.emitAndReturn(this.buildImportPayload(true));
  }
});
