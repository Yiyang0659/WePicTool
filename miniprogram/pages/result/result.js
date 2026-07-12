// pages/result/result.js
const { normalizeTaskGroups, buildSendability, GROUP_META, createMockTask } = require('../../utils/task');

const CHANGE_CATEGORY_OPTIONS = [
  { key: 'tops', label: '上衣组' },
  { key: 'bottoms', label: '下装组' },
  { key: 'shoes', label: '鞋子组' },
  { key: 'others', label: '未处理素材区' }
];

const GROUP_INFO = {
  tops: { title: '上衣', emoji: '👕' },
  bottoms: { title: '下衣', emoji: '👖' },
  shoes: { title: '鞋子', emoji: '👟' },
  others: { title: '未处理素材', emoji: '📦' }
};

const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

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
    availableGroups: []
  },

  onLoad: function (options) {
    const that = this;
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
    }

    this.setData({ chatTime: this.formatChatTime(new Date()) });

    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        if (data && data.task) {
          that.parseTaskResult(data.task);
        }
      });
    }
  },

  parseTaskResult: function (task) {
    const groups = normalizeTaskGroups(task.groups || {});
    const totalCount = this.calculateTotalCount(groups);
    const isEmpty = totalCount === 0;

    this.setData({ groups, totalCount, isEmpty });

    if (!this.hasSavedRecord && task && totalCount > 0) {
      this.hasSavedRecord = true;
      this.saveRecordToStorage(task);
    }
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
    if (!item) return '';
    if (item.matted) {
      var mode = item.showMode || 'matted';
      if (mode === 'original' && item.originalUrl) return item.originalUrl;
      return item.mattedUrl || item.url || item.originalUrl || '';
    }
    return item.url || item.fileId || item.localPath || '';
  },

  onToggleExpand: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    this.setData({ [`expanded.${groupKey}`]: !this.data.expanded[groupKey] });
  },

  onToggleOriginal: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = this.data.groups[groupKey][index];
    if (!item || !item.matted) return;
    var current = item.showMode || 'matted';
    var next = current === 'matted' ? 'original' : 'matted';
    this.setData({ [`groups.${groupKey}[${index}].showMode`]: next });
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
    groups[targetGroupKey].push(item);

    const normalizedGroups = normalizeTaskGroups(groups);
    const totalCount = this.calculateTotalCount(normalizedGroups);
    this.setData({ groups: normalizedGroups, totalCount, isEmpty: totalCount === 0 });

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
            groups: that.data.groups
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
    this.saveImagesSequentially(urls, `${GROUP_INFO[groupKey].title}保存完成`);
  },

  getAllImageUrls: function () {
    const urls = [];
    Object.keys(this.data.groups).forEach(key => urls.push(...this.getGroupUrls(key)));
    return urls;
  },

  getGroupUrls: function (groupName) {
    return (this.data.groups[groupName] || []).map(item => this.getDisplayUrl(item)).filter(Boolean);
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
