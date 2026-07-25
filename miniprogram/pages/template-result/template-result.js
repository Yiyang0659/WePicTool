const { buildBigtextPreviewGroups } = require('../../utils/previewLayout');

const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

function isValidTask(task) {
  return task && task.mode === 'bigtext' && Array.isArray(task.cards) && task.cards.length > 0 && task.cards.every((card) => card && card.url && card.text);
}

Page({
  data: {
    task: null,
    cards: [],
    totalCount: 0,
    isEmpty: true,
    errorText: ''
  },

  onLoad: function () {
    const that = this;
    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        that.acceptTask(data && data.task);
      });
    }
  },

  acceptTask: function (task) {
    if (!isValidTask(task)) {
      this.setData({ errorText: '卡片数据不完整，请返回重新生成。', isEmpty: true, cards: [] });
      return;
    }
    const cards = task.cards.map((card, index) => Object.assign({}, card, { numLabel: index + 1 }));
    this.setData({ task, cards, totalCount: cards.length, isEmpty: false, errorText: '' });
    this.saveRecordOnce(task);
  },

  onPreviewCard: function (event) {
    const index = Number(event.currentTarget.dataset.index) || 0;
    const urls = this.data.cards.map((card) => card.url);
    if (urls.length) wx.previewImage({ current: urls[index] || urls[0], urls });
  },

  onWechatPreview: function () {
    const task = this.data.task;
    if (!isValidTask(task)) return;
    wx.navigateTo({
      url: `/pages/preview/preview?taskId=${task.taskId}`,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', {
          groups: buildBigtextPreviewGroups(task),
          ratio: '1:1'
        });
      }
    });
  },

  onSaveAll: function () {
    const urls = this.data.cards.map((card) => card.url).filter(Boolean);
    if (urls.length === 0) return;
    this.saveSequentially(urls, 0);
  },

  saveSequentially: function (urls, index) {
    const that = this;
    if (index >= urls.length) {
      wx.hideLoading();
      wx.showToast({ title: `已保存 ${urls.length} 张`, icon: 'success' });
      return;
    }
    wx.showLoading({ title: `保存 ${index + 1}/${urls.length}`, mask: true });
    this.resolveFilePath(urls[index]).then((filePath) => new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject });
    })).then(() => that.saveSequentially(urls, index + 1)).catch((err) => {
      wx.hideLoading();
      const message = err && err.errMsg && err.errMsg.indexOf('auth deny') !== -1
        ? '请在设置中允许保存到相册后重试。'
        : '保存失败，请检查相册权限后重试。';
      wx.showModal({ title: '无法保存', content: message, showCancel: false });
    });
  },

  resolveFilePath: function (url) {
    if (url.indexOf('cloud://') === 0) {
      return new Promise((resolve, reject) => wx.cloud.downloadFile({ fileID: url, success: (res) => resolve(res.tempFilePath), fail: reject }));
    }
    if (/^https?:\/\//.test(url)) {
      return new Promise((resolve, reject) => wx.downloadFile({ url, success: (res) => resolve(res.tempFilePath), fail: reject }));
    }
    return Promise.resolve(url);
  },

  saveRecordOnce: function (task) {
    try {
      const records = wx.getStorageSync(RECORDS_KEY) || [];
      if (records.some((record) => record.taskSnapshot && record.taskSnapshot.taskId === task.taskId)) return;
      records.unshift({
        recordId: `record_${Date.now()}`,
        createdAt: Date.now(),
        type: 'bigtext',
        text: task.sourceText,
        totalCount: task.cards.length,
        thumbnails: task.cards.slice(0, 4).map((card) => card.url),
        taskSnapshot: task,
        sourceImages: []
      });
      if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
      wx.setStorageSync(RECORDS_KEY, records);
    } catch (err) {
      console.error('保存大字滑卡记录失败:', err);
    }
  },

  onBackHome: function () {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
