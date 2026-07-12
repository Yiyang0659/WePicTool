// pages/preview/preview.js
var taskUtils = require('../../utils/task');
var normalizeTaskGroups = taskUtils.normalizeTaskGroups;

var GROUP_ORDER = ['tops', 'bottoms', 'shoes', 'others'];

var RECORDS_KEY = 'wepictool_records';

var STACK_OFFSET_Y = 14;
var STACK_SCALE_STEP = 0.06;
var STACK_OPACITY_STEP = 0.25;

Page({
  data: {
    taskId: '',
    chatTime: '',
    groups: { tops: [], bottoms: [], shoes: [], others: [] },
    groupList: [],
    expanded: { tops: false, bottoms: false, shoes: false, others: false },
    stackIndex: { tops: 0, bottoms: 0, shoes: 0, others: 0 },
    slideOffset: { tops: 0, bottoms: 0, shoes: 0, others: 0 },
    pillAnimating: { tops: false, bottoms: false, shoes: false, others: false },
    totalCount: 0,
    isEmpty: false
  },

  _touchStartX: 0,
  _touchGroupKey: '',

  onLoad: function (options) {
    var that = this;
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
    }
    this.setData({ chatTime: this._formatTime(new Date()) });

    var eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        if (data && data.task) {
          that._parseTask(data.task);
        }
      });
    }
  },

  _parseTask: function (task) {
    var groups = normalizeTaskGroups(task.groups || {});
    var groupList = this._buildGroupList(groups);
    var totalCount = this._countAll(groups);
    this.setData({ groups: groups, groupList: groupList, totalCount: totalCount, isEmpty: totalCount === 0 });
  },

  _buildGroupList: function (groups) {
    var result = [];
    for (var i = 0; i < GROUP_ORDER.length; i++) {
      var key = GROUP_ORDER[i];
      var items = groups[key] || [];
      var urls = [];
      for (var j = 0; j < items.length; j++) {
        var url = this._getUrl(items[j]);
        if (url) urls.push(url);
      }
      if (urls.length > 0) result.push({ key: key, items: urls });
    }
    return result;
  },

  _countAll: function (groups) {
    var t = 0;
    Object.keys(groups).forEach(function (k) { t += (groups[k] || []).length; });
    return t;
  },

  _formatTime: function (d) {
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  },

  _getUrl: function (item) {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.url || item.fileId || item.localPath || '';
  },

  // 堆叠样式计算
  getStackTranslateY: function (groupKey, imgIdx, total) {
    var currentIdx = this.data.stackIndex[groupKey] || 0;
    var relPos = (imgIdx - currentIdx + total) % total;
    return relPos * STACK_OFFSET_Y;
  },

  getStackScale: function (groupKey, imgIdx, total) {
    var currentIdx = this.data.stackIndex[groupKey] || 0;
    var relPos = (imgIdx - currentIdx + total) % total;
    return 1 - relPos * STACK_SCALE_STEP;
  },

  getStackOpacity: function (groupKey, imgIdx, total) {
    var currentIdx = this.data.stackIndex[groupKey] || 0;
    var relPos = (imgIdx - currentIdx + total) % total;
    if (relPos >= 3) return 0;
    return 1 - relPos * STACK_OPACITY_STEP;
  },

  getStackZIndex: function (groupKey, imgIdx, total) {
    var currentIdx = this.data.stackIndex[groupKey] || 0;
    var relPos = (imgIdx - currentIdx + total) % total;
    return total - relPos;
  },

  // 展开/收起
  onToggleExpand: function (e) {
    var groupKey = e.currentTarget.dataset.group;
    var willExpand = !this.data.expanded[groupKey];
    this.setData({ ['pillAnimating.' + groupKey]: true });
    var that = this;
    setTimeout(function () { that.setData({ ['pillAnimating.' + groupKey]: false }); }, 120);
    this.setData({ ['expanded.' + groupKey]: willExpand });
  },

  // 滑动
  onTouchStart: function (e) {
    this._touchStartX = e.touches[0].clientX;
    this._touchGroupKey = e.currentTarget.dataset.group;
  },

  onTouchMove: function (e) {
    if (!this._touchStartX) return;
    var groupKey = e.currentTarget.dataset.group;
    if (groupKey !== this._touchGroupKey) return;
    this.setData({ ['slideOffset.' + groupKey]: e.touches[0].clientX - this._touchStartX });
  },

  onTouchEnd: function (e) {
    var groupKey = e.currentTarget.dataset.group;
    var delta = this.data.slideOffset[groupKey] || 0;
    var threshold = 50;
    var itemCount = 0;
    var groupList = this.data.groupList;
    for (var i = 0; i < groupList.length; i++) {
      if (groupList[i].key === groupKey) { itemCount = groupList[i].items.length; break; }
    }
    if (Math.abs(delta) >= threshold && itemCount > 1) {
      var direction = delta > 0 ? -1 : 1;
      var currentIdx = this.data.stackIndex[groupKey] || 0;
      var nextIdx = (currentIdx + direction + itemCount) % itemCount;
      this.setData({ ['slideOffset.' + groupKey]: direction * 180 });
      var that = this;
      setTimeout(function () {
        that.setData({ ['stackIndex.' + groupKey]: nextIdx, ['slideOffset.' + groupKey]: 0 });
      }, 250);
    } else {
      this.setData({ ['slideOffset.' + groupKey]: 0 });
    }
    this._touchStartX = 0;
    this._touchGroupKey = '';
  },

  // 图片预览
  onPreviewGroupImage: function (e) {
    var groupKey = e.currentTarget.dataset.group;
    var index = parseInt(e.currentTarget.dataset.index, 10);
    var urls = [];
    for (var i = 0; i < this.data.groupList.length; i++) {
      if (this.data.groupList[i].key === groupKey) { urls = this.data.groupList[i].items; break; }
    }
    if (urls.length === 0) return;
    wx.previewImage({ urls: urls, current: urls[index] || urls[0] });
  },

  // 改分类
  onChangeCategory: function (e) {
    var groupKey = e.currentTarget.dataset.group;
    var index = parseInt(e.currentTarget.dataset.index, 10);
    var that = this;
    wx.showActionSheet({
      itemList: ['上衣组', '下装组', '鞋子组', '未处理素材区'],
      success: function (res) {
        var keys = ['tops', 'bottoms', 'shoes', 'others'];
        var targetKey = keys[res.tapIndex];
        if (targetKey === groupKey) return;
        var groups = that.data.groups;
        var items = groups[groupKey] || [];
        if (index < 0 || index >= items.length) return;
        groups[targetKey].push(items[groupKey].splice(index, 1)[0]);
        var normalized = normalizeTaskGroups(groups);
        that.setData({
          groups: normalized,
          groupList: that._buildGroupList(normalized),
          totalCount: that._countAll(normalized),
          isEmpty: that._countAll(normalized) === 0
        });
        wx.showToast({ title: '已移动', icon: 'none' });
      }
    });
  },

  onBack: function () {
    wx.navigateBack({ delta: 1 });
  }
});
