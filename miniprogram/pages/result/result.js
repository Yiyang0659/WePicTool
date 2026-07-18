// pages/result/result.js
const { normalizeTaskGroups, buildSendability, GROUP_META, createMockTask } = require('../../utils/task');
const { composeCard, DEFAULT_OPTIONS } = require('../../utils/cardComposer');

const CHANGE_CATEGORY_OPTIONS = [
  { key: 'tops', label: '上衣组' },
  { key: 'bottoms', label: '下装组' },
  { key: 'shoes', label: '鞋子组' },
  { key: 'others', label: '未处理素材区' }
];

const RATIO_OPTIONS = [
  { key: '1:1', label: '1:1', icon: '⬜', desc: '正方形，适合头像/商品' },
  { key: '4:5', label: '4:5', icon: '📱', desc: '竖版，适合朋友圈/小红书' },
  { key: '3:4', label: '3:4', icon: '📷', desc: '竖版，通用穿搭展示' }
];

const GROUP_INFO = {
  tops: { title: '上衣', emoji: '👕' },
  bottoms: { title: '下衣', emoji: '👖' },
  shoes: { title: '鞋子', emoji: '👟' },
  others: { title: '未处理素材', emoji: '📦' }
};

const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

// 计算单条结果的展示图（WXML 不支持调用 Page 方法，必须落到数据字段上）
function computeDisplayUrl(item) {
  if (!item) return '';
  // 用户显式切换到原图
  if (item.showMode === 'original') {
    return item.originalUrl || item.url || item.fileId || item.localPath || '';
  }
  // 合成后的白底卡片优先
  if (item.composedUrl) return item.composedUrl;
  // 其次是云存储的抠图结果
  if (item.mattedUrl) return item.mattedUrl;
  return item.url || item.fileId || item.localPath || '';
}

// 给分组内每条结果补充 displayUrl / composeStatus 视图字段
function decorateGroups(groups) {
  const decorated = {};
  Object.keys(groups || {}).forEach((key) => {
    decorated[key] = (groups[key] || []).map((item) => Object.assign({}, item, {
      displayUrl: computeDisplayUrl(item),
      composeStatus: item.composeStatus || ''
    }));
  });
  return decorated;
}

Page({
  data: {
    taskId: '',
    chatTime: '',
    groups: {
      tops: [],
      bottoms: [],
      shoes: [],
      others: []
    },
    expanded: {
      tops: false,
      bottoms: false,
      shoes: false,
      others: false
    },
    totalCount: 0,
    isEmpty: false,
    changeCategoryOptions: CHANGE_CATEGORY_OPTIONS.map(item => item.label),
    showActionSheet: false,
    showGroupSaveSheet: false,
    availableGroups: [],
    ratio: DEFAULT_OPTIONS.ratio,
    ratioOptions: RATIO_OPTIONS,
    showRatioSheet: false,
    composing: false
  },

  _composerCanvas: null,
  _composerReady: false,
  _composeToken: 0,
  _composeChain: null,
  _pendingTask: null,

  onLoad: function (options) {
    const that = this;
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
    }

    this.setData({ chatTime: this.formatChatTime(new Date()) });

    this.initComposerCanvas();

    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        if (data && data.task) {
          that.parseTaskResult(data.task);
        }
      });
    }
  },

  onReady: function () {
    // onLoad 时页面可能尚未渲染完成，canvas 节点拿不到则在这里补一次
    if (!this._composerReady) {
      this.initComposerCanvas();
    }
  },

  initComposerCanvas: function (retryCount) {
    const that = this;
    const attempt = retryCount || 0;
    const query = wx.createSelectorQuery();
    query.select('#cardComposer').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        if (attempt < 2) {
          setTimeout(() => that.initComposerCanvas(attempt + 1), 300);
        } else {
          console.warn('cardComposer canvas 初始化失败');
        }
        return;
      }
      that._composerCanvas = res[0].node;
      that._composerReady = true;

      // 如果初始化时任务数据已经到达，补执行合成
      if (that._pendingTask) {
        that._pendingTask = null;
        that.composeAllCards(that.data.groups);
      }
    });
  },

  parseTaskResult: function (task) {
    const groups = decorateGroups(normalizeTaskGroups(task.groups || {}));
    const totalCount = this.calculateTotalCount(groups);
    const isEmpty = totalCount === 0;

    this.setData({ groups, totalCount, isEmpty });

    if (!this.hasSavedRecord && task && totalCount > 0) {
      this.hasSavedRecord = true;
      this.saveRecordToStorage(task);
    }

    // 触发白底卡片合成
    if (this._composerReady) {
      this.composeAllCards(this.data.groups);
    } else {
      this._pendingTask = this.data.groups;
    }
  },

  // 所有合成任务都经过这个串行队列：
  // 1) 共享同一个 canvas，并行绘制会互相污染
  // 2) 避免 iOS/Android 同时处理多张 1024px 大图导致内存峰值
  _enqueueCompose: function (taskFn) {
    const chain = this._composeChain || Promise.resolve();
    const run = chain.then(() => taskFn());
    this._composeChain = run.then(() => undefined, () => undefined);
    return run;
  },

  composeAllCards: function (groups) {
    if (!groups || !this._composerReady) return;
    const that = this;
    const ratio = this.data.ratio;
    const token = ++this._composeToken;
    const processable = ['tops', 'bottoms', 'shoes'];

    const jobs = [];
    processable.forEach((groupKey) => {
      (groups[groupKey] || []).forEach((item, index) => {
        // 已按当前比例合成成功的跳过，避免移动分类等场景重复合成
        if (item.composeStatus === 'done' && item.composedRatio === ratio && item.composedUrl) return;
        jobs.push({ groupKey, index, item });
      });
    });

    if (jobs.length === 0) {
      this.setData({ composing: false });
      return;
    }

    this.setData({ composing: true });

    const runNext = (cursor) => {
      if (that._composeToken !== token) return; // 已被更新的合成任务（如切换比例）取代
      if (cursor >= jobs.length) {
        that.setData({ composing: false });
        return;
      }
      const job = jobs[cursor];
      that.setData({ [`groups.${job.groupKey}[${job.index}].composeStatus`]: 'composing' });
      that._enqueueCompose(() => that.composeItem(job.groupKey, job.index, job.item, ratio))
        .then((res) => {
          if (that._composeToken !== token) return;
          that.applyComposeSuccess(res.groupKey, res.index, res);
        })
        .catch((err) => {
          if (that._composeToken !== token) return;
          that.applyComposeFailure(job.groupKey, job.index, err);
        })
        .then(() => runNext(cursor + 1));
    };

    runNext(0);
  },

  composeItem: function (groupKey, index, item, ratio) {
    if (!item) return Promise.reject(new Error('item 为空'));

    // 优先用抠图结果（matted/ 透明主体图）合成；抠图失败的图用原图兜底，不影响整批
    const sourceUrl = item.mattedUrl || item.url || item.fileId || item.localPath;
    if (!sourceUrl) return Promise.reject(new Error('无可用图片源'));

    return composeCard(this._composerCanvas, {
      sourceUrl: sourceUrl,
      category: groupKey,
      ratio: ratio,
      background: '#FFFFFF',
      enhanceLightColor: true,
      canvasSize: 1024
    }).then((result) => ({
      groupKey,
      index,
      tempFilePath: result.tempFilePath,
      ratio: result.ratio,
      width: result.width,
      height: result.height
    }));
  },

  applyComposeSuccess: function (groupKey, index, res) {
    const base = `groups.${groupKey}[${index}]`;
    const current = (this.data.groups[groupKey] || [])[index];
    const merged = Object.assign({}, current, {
      composedUrl: res.tempFilePath,
      composedRatio: res.ratio,
      composeStatus: 'done'
    });
    this.setData({
      [`${base}.composedUrl`]: res.tempFilePath,
      [`${base}.composedRatio`]: res.ratio,
      [`${base}.composeStatus`]: 'done',
      [`${base}.composeError`]: '',
      [`${base}.displayUrl`]: computeDisplayUrl(merged)
    });
  },

  applyComposeFailure: function (groupKey, index, err) {
    console.warn(`白底卡片合成失败 ${groupKey}[${index}]:`, err);
    const base = `groups.${groupKey}[${index}]`;
    this.setData({
      [`${base}.composeStatus`]: 'fail',
      [`${base}.composeError`]: (err && err.message) || '合成失败'
    });
  },

  // 失败图「重做」入口
  onRetryItem: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = (this.data.groups[groupKey] || [])[index];
    if (!item) return;

    // 抠图失败且存在云端原图：先重走一次云端抠图，再重新合成
    const cloudSource = this.getCloudSource(item);
    if (item.matted === false && cloudSource && wx.cloud) {
      this.retryMatting(groupKey, index, item, cloudSource);
      return;
    }
    // 否则仅重新合成（合成失败重试 / 本地预览图无云端源）
    this.retryCompose(groupKey, index, item);
  },

  getCloudSource: function (item) {
    if (!item) return '';
    if (item.originalFileId && item.originalFileId.indexOf('cloud://') === 0) return item.originalFileId;
    if (item.originalUrl && item.originalUrl.indexOf('cloud://') === 0) return item.originalUrl;
    if (item.fileId && item.fileId.indexOf('cloud://') === 0) return item.fileId;
    return '';
  },

  retryCompose: function (groupKey, index, item) {
    const that = this;
    if (!this._composerReady) {
      wx.showToast({ title: '合成器未就绪，请稍后重试', icon: 'none' });
      return;
    }
    const base = `groups.${groupKey}[${index}]`;
    this.setData({ [`${base}.composeStatus`]: 'composing' });
    this._enqueueCompose(() => that.composeItem(groupKey, index, item, that.data.ratio))
      .then((res) => that.applyComposeSuccess(groupKey, index, res))
      .catch((err) => that.applyComposeFailure(groupKey, index, err));
  },

  // 单图重调 processOutfit 做一次真实抠图重做；仍失败则原图合成兜底
  retryMatting: function (groupKey, index, item, cloudSource) {
    const that = this;
    const base = `groups.${groupKey}[${index}]`;
    this.setData({ [`${base}.composeStatus`]: 'composing' });
    wx.showLoading({ title: '正在重做抠图...', mask: true });
    wx.cloud.callFunction({
      name: 'processOutfit',
      data: {
        images: [{
          imageId: item.sourceImageId || 'retry_image_1',
          fileId: cloudSource,
          url: cloudSource
        }]
      },
      success: (res) => {
        wx.hideLoading();
        const result = res && res.result && res.result.results && res.result.results[0];
        const latest = (that.data.groups[groupKey] || [])[index] || item;
        if (result && result.matted && result.mattedUrl) {
          const merged = Object.assign({}, latest, {
            matted: true,
            type: 'matted',
            mattedUrl: result.mattedUrl,
            mattedFileId: result.mattedFileId || result.mattedUrl
          });
          that.setData({
            [`${base}.matted`]: true,
            [`${base}.type`]: 'matted',
            [`${base}.mattedUrl`]: result.mattedUrl,
            [`${base}.mattedFileId`]: result.mattedFileId || result.mattedUrl
          }, () => that.retryCompose(groupKey, index, merged));
          return;
        }
        // 抠图仍失败：保留原图合成兜底，不阻断其他结果
        wx.showToast({ title: '抠图仍失败，已用原图合成', icon: 'none' });
        that.retryCompose(groupKey, index, latest);
      },
      fail: (err) => {
        wx.hideLoading();
        console.warn('重做抠图失败:', err);
        const latest = (that.data.groups[groupKey] || [])[index] || item;
        wx.showToast({ title: '抠图重做失败，已用原图合成', icon: 'none' });
        that.retryCompose(groupKey, index, latest);
      }
    });
  },

  calculateTotalCount: function (groups) {
    return Object.keys(groups).reduce((sum, key) => sum + (groups[key] || []).length, 0);
  },

  formatChatTime: function (date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  getDisplayUrl: function (item) {
    return computeDisplayUrl(item);
  },

  getSaveUrl: function (item) {
    if (!item) return '';
    // 保存时优先用合成后的白底卡片
    if (item.composedUrl) return item.composedUrl;
    return this.getDisplayUrl(item);
  },

  // 比例切换
  onChangeRatio: function () {
    this.setData({ showRatioSheet: true });
  },

  onCloseRatioSheet: function () {
    this.setData({ showRatioSheet: false });
  },

  onSelectRatio: function (e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const selected = RATIO_OPTIONS[index];
    if (!selected || selected.key === this.data.ratio) {
      this.setData({ showRatioSheet: false });
      return;
    }

    this.setData({ ratio: selected.key, showRatioSheet: false }, () => {
      // 切换比例后整批重新合成（旧任务通过 token 自动作废）
      this.composeAllCards(this.data.groups);
    });
  },

  onToggleExpand: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    this.setData({ [`expanded.${groupKey}`]: !this.data.expanded[groupKey] });
  },

  onToggleOriginal: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = this.data.groups[groupKey][index];
    if (!item) return;
    var current = item.showMode || 'composed';
    var next = current === 'composed' ? 'original' : 'composed';
    var merged = Object.assign({}, item, { showMode: next });
    this.setData({
      [`groups.${groupKey}[${index}].showMode`]: next,
      [`groups.${groupKey}[${index}].displayUrl`]: computeDisplayUrl(merged)
    });
  },

  onChangeCategory: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = this.data.groups[groupKey][index];
    if (!item) return;

    const aiType = item.classification && item.classification.type;
    const aiConfidence = item.classification && typeof item.classification.confidence === 'number'
      ? item.classification.confidence : null;

    let title = '修改分类';
    if (aiConfidence !== null && aiConfidence < 0.8) {
      title = 'AI 置信度较低，请确认分类';
    } else if (aiType && aiType !== 'others') {
      title = `AI 判断为 ${this.getCategoryLabel(aiType)}，可修改`;
    }

    wx.showActionSheet({
      itemList: this.data.changeCategoryOptions,
      title,
      success: (res) => {
        const targetKey = CHANGE_CATEGORY_OPTIONS[res.tapIndex].key;
        if (targetKey === groupKey) return;
        this.moveItemToGroup(groupKey, index, targetKey);
      }
    });
  },

  getCategoryLabel: function (key) {
    const meta = GROUP_META[key];
    return meta ? meta.title : '未处理素材区';
  },

  moveItemToGroup: function (sourceGroupKey, sourceIndex, targetGroupKey) {
    const groups = this.data.groups;
    const item = groups[sourceGroupKey][sourceIndex];
    if (!item) return;

    groups[sourceGroupKey].splice(sourceIndex, 1);
    item.category = targetGroupKey;
    if (item.classification) {
      item.classification = Object.assign({}, item.classification, {
        userChanged: true,
        originalType: item.classification.originalType || item.classification.type,
        type: targetGroupKey
      });
    }
    // 分组锚点变化，旧的合成结果不再适用
    item.composedUrl = '';
    item.composedRatio = '';
    item.composeStatus = '';
    groups[targetGroupKey].push(item);

    // 取消进行中的整批合成：移动后各组索引已变化，旧任务的写入位置会错位
    this._composeToken += 1;
    ['tops', 'bottoms', 'shoes'].forEach((key) => {
      (groups[key] || []).forEach((groupItem) => {
        if (groupItem.composeStatus === 'composing') groupItem.composeStatus = '';
      });
    });

    const normalizedGroups = decorateGroups(normalizeTaskGroups(groups));
    const totalCount = this.calculateTotalCount(normalizedGroups);
    this.setData({ groups: normalizedGroups, totalCount, isEmpty: totalCount === 0 });

    // 按新分组锚点重新合成未完成项（已按当前比例合成好的会被跳过）
    if (this._composerReady) {
      this.composeAllCards(this.data.groups);
    }

    wx.showToast({ title: `已移到${this.getCategoryLabel(targetGroupKey)}`, icon: 'none' });
  },

  onPreviewGroupImage: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const groupItems = this.data.groups[groupKey] || [];
    const urls = groupItems.map(item => this.getDisplayUrl(item));
    wx.previewImage({ urls, current: this.getDisplayUrl(groupItems[index]) });
  },

  onBackHome: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  },

  // ★ 新增：跳转微信发送预览页
  onWechatPreview: function () {
    const that = this;
    wx.navigateTo({
      url: '/pages/preview/preview?taskId=' + this.data.taskId,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', {
          task: {
            taskId: that.data.taskId,
            groups: that.data.groups,
            ratio: that.data.ratio
          }
        });
      }
    });
  },

  onSendToFriend: function () {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    this.setData({ showActionSheet: true });
  },

  onMergeSend: function () {
    this.setData({ showActionSheet: true });
  },

  onCloseActionSheet: function () {
    this.setData({ showActionSheet: false });
  },

  onActionPanelTap: function () {},

  onShareAppMessageAction: function () {
    this.setData({ showActionSheet: false });
    wx.showToast({ title: '点击右上角转发给朋友', icon: 'none' });
  },

  onSaveAllImages: function () {
    this.setData({ showActionSheet: false });
    const allUrls = this.getAllImageUrls();
    if (allUrls.length === 0) return;
    if (this.data.composing) {
      wx.showToast({ title: '白底卡片生成中，已生成的优先保存', icon: 'none' });
    }
    this.saveImagesSequentially(allUrls, '全部图片保存完成');
  },

  onSaveByGroup: function () {
    this.setData({ showActionSheet: false });
    const availableGroups = Object.keys(this.data.groups)
      .filter(key => this.data.groups[key] && this.data.groups[key].length > 0)
      .map(key => ({
        key,
        title: GROUP_INFO[key].title,
        emoji: GROUP_INFO[key].emoji,
        count: this.data.groups[key].length
      }));
    this.setData({ availableGroups, showGroupSaveSheet: true });
  },

  onCloseGroupSaveSheet: function () {
    this.setData({ showGroupSaveSheet: false });
  },

  onSaveGroupByKey: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    this.setData({ showGroupSaveSheet: false });
    const urls = this.getGroupUrls(groupKey);
    if (urls.length === 0) return;
    if (this.data.composing) {
      wx.showToast({ title: '白底卡片生成中，已生成的优先保存', icon: 'none' });
    }
    this.saveImagesSequentially(urls, `${GROUP_INFO[groupKey].title}保存完成`);
  },

  getAllImageUrls: function () {
    const urls = [];
    Object.keys(this.data.groups).forEach(key => urls.push(...this.getGroupUrls(key)));
    return urls;
  },

  getGroupUrls: function (groupName) {
    return (this.data.groups[groupName] || []).map(item => this.getSaveUrl(item)).filter(Boolean);
  },

  saveImagesSequentially: function (urls, successTitle) {
    if (!urls || urls.length === 0) return;
    wx.showLoading({ title: `正在保存 1/${urls.length} 张...`, mask: true });
    let savedCount = 0;
    const saveNext = (index) => {
      if (index >= urls.length) {
        wx.hideLoading();
        wx.showToast({ title: successTitle || '保存完成', icon: 'success', duration: 2000 });
        return;
      }
      wx.showLoading({ title: `正在保存 ${index + 1}/${urls.length} 张...`, mask: true });
      this.downloadAndSaveToAlbum(urls[index])
        .then(() => { savedCount++; saveNext(index + 1); })
        .catch((err) => { wx.hideLoading(); this.handleSaveError(err, urls.slice(index)); });
    };
    saveNext(0);
  },

  onEditGroup: function () {
    wx.showModal({
      title: '编辑分组',
      content: '点击各分组的"展开"后，每张图片下方都有"改分类"按钮，可以调整图片归属。',
      confirmText: '我知道了',
      showCancel: false
    });
  },

  onReorder: function () {
    wx.showToast({ title: '调整顺序功能开发中', icon: 'none' });
  },

  onSaveLongImage: function () {
    wx.showToast({ title: '保存长图功能开发中', icon: 'none' });
  },

  downloadAndSaveToAlbum: function (url) {
    return this.resolveImageFilePath(url).then(filePath => {
      return new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: () => resolve(),
          fail: (err) => reject({ type: 'save_fail', error: err, filePath })
        });
      });
    });
  },

  resolveImageFilePath: function (url) {
    return new Promise((resolve, reject) => {
      if (!url || typeof url !== 'string') {
        reject({ type: 'invalid_url', error: new Error('图片地址无效') });
        return;
      }
      if (url.startsWith('cloud://')) {
        if (!wx.cloud) {
          reject({ type: 'download_fail', error: new Error('当前环境不支持云文件下载') });
          return;
        }
        wx.cloud.downloadFile({
          fileID: url,
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => reject({ type: 'download_fail', error: err })
        });
        return;
      }
      if (/^https?:\/\//.test(url)) {
        wx.downloadFile({
          url,
          success: (res) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              reject({ type: 'download_fail', error: new Error(`HTTP ${res.statusCode}`) });
              return;
            }
            resolve(res.tempFilePath);
          },
          fail: (err) => reject({ type: 'download_fail', error: err })
        });
        return;
      }
      resolve(url);
    });
  },

  handleSaveError: function (errInfo, urlsToRetry) {
    const errMsg = errInfo.error ? errInfo.error.errMsg : '';
    console.error('保存失败详情:', errInfo);
    if (errMsg && (errMsg.indexOf('auth deny') !== -1 || errMsg.indexOf('authorize:fail') !== -1)) {
      wx.showModal({
        title: '需要相册授权',
        content: '保存参考图需要将图片写入您的相册。请点击下方"前往设置"，在权限设置中开启"保存到相册"或"照片"权限，然后重试。',
        confirmText: '前往设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                if (settingRes.authSetting['scope.writePhotosAlbum']) {
                  wx.showToast({ title: '授权成功，请重试', icon: 'none' });
                }
              }
            });
          }
        }
      });
    } else {
      wx.showModal({
        title: '保存失败',
        content: '保存图片到相册遇到问题，请检查系统相册权限，或尝试截图保存。',
        confirmText: '重新尝试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm && urlsToRetry) {
            this.saveImagesSequentially(urlsToRetry, '保存完成');
          }
        }
      });
    }
  },

  saveRecordToStorage: function (task) {
    try {
      const records = wx.getStorageSync(RECORDS_KEY) || [];
      const thumbnails = this.extractThumbnails(task.groups || {});
      const groupSummary = {};
      Object.keys(task.groups || {}).forEach(key => { groupSummary[key] = (task.groups[key] || []).length; });
      const sourceImages = (task.results || []).map(item => ({
        imageId: item.sourceImageId || item.imageId || '',
        fileId: item.fileId || '',
        localPath: item.localPath || '',
        url: item.url || item.fileId || item.localPath || ''
      })).filter(item => item.url);

      records.unshift({
        recordId: `record_${Date.now()}`,
        createdAt: Date.now(),
        totalCount: this.calculateTotalCount(task.groups || {}),
        groupSummary,
        thumbnails,
        taskSnapshot: task,
        sourceImages
      });
      if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
      wx.setStorageSync(RECORDS_KEY, records);
    } catch (err) {
      console.error('保存记录失败:', err);
    }
  },

  extractThumbnails: function (groups) {
    const thumbs = [];
    for (const key of ['tops', 'bottoms', 'shoes', 'others']) {
      for (const item of (groups[key] || [])) {
        const url = this.getDisplayUrl(item);
        if (url) { thumbs.push(url); if (thumbs.length >= 4) return thumbs; }
      }
    }
    return thumbs;
  },

  onShareAppMessage: function () {
    return {
      title: '我刚用 WePicTool 整理了一组穿搭参考图，快来帮我选选！',
      path: '/pages/index/index'
    };
  }
});
