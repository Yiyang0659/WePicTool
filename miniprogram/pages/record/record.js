// pages/record/record.js
const { normalizeTaskGroups, buildSendability, createMockTask } = require('../../utils/task');

const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

Page({
  data: {
    records: [],
    groupedRecords: [],
    isEmpty: true,
    totalRecords: 0,
    totalImages: 0,
    showClearConfirm: false
  },

  onShow: function () {
    this.loadRecords();
  },

  // 加载本地记录
  loadRecords: function () {
    try {
      const records = wx.getStorageSync(RECORDS_KEY) || [];
      const processedRecords = this.processRecords(records);
      const groupedRecords = this.groupByDate(processedRecords);
      const totalImages = processedRecords.reduce((sum, record) => sum + (record.totalCount || 0), 0);

      this.setData({
        records: processedRecords,
        groupedRecords: groupedRecords,
        isEmpty: processedRecords.length === 0,
        totalRecords: processedRecords.length,
        totalImages: totalImages
      });
    } catch (err) {
      console.error('加载记录失败:', err);
      this.setData({
        records: [],
        groupedRecords: [],
        isEmpty: true,
        totalRecords: 0,
        totalImages: 0
      });
    }
  },

  // 处理记录数据，生成展示需要的字段
  processRecords: function (records) {
    return records.map(record => {
      const date = new Date(record.createdAt);
      const groupSummaryList = this.buildGroupSummaryList(record.groupSummary);
      return Object.assign({}, record, {
        dateLabel: this.getDateLabel(record.createdAt),
        time: this.formatTime(record.createdAt),
        groupSummaryList: groupSummaryList
      });
    });
  },

  buildGroupSummaryList: function (groupSummary) {
    if (!groupSummary) return [];
    const map = {
      tops: '上衣',
      bottoms: '下衣',
      shoes: '鞋子',
      others: '未处理'
    };
    return Object.keys(groupSummary)
      .filter(key => groupSummary[key] > 0)
      .map(key => `${map[key] || key}${groupSummary[key]}张`);
  },

  groupByDate: function (records) {
    const groups = {};
    records.forEach(record => {
      const label = record.dateLabel;
      if (!groups[label]) {
        groups[label] = {
          date: label,
          records: []
        };
      }
      groups[label].records.push(record);
    });
    return Object.values(groups);
  },

  getDateLabel: function (timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((nowDate - targetDate) / (24 * 60 * 60 * 1000));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;

    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}月${day}日`;
  },

  formatTime: function (timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 查看记录详情
  onViewRecord: function (e) {
    const recordId = e.currentTarget.dataset.recordid;
    const record = this.data.records.find(r => r.recordId === recordId);
    if (!record || !record.taskSnapshot) {
      wx.showToast({ title: '记录数据不完整', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/result/result?taskId=${record.taskSnapshot.taskId}`,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', {
          task: record.taskSnapshot
        });
      }
    });
  },

  // 再次生成
  onRegenerate: function (e) {
    const recordId = e.currentTarget.dataset.recordid;
    const record = this.data.records.find(r => r.recordId === recordId);
    if (!record || !record.sourceImages || record.sourceImages.length === 0) {
      wx.showToast({ title: '原图信息已丢失', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/result/result?taskId=${record.taskSnapshot.taskId || 'regenerate'}`,
      success: function (navRes) {
        // 使用原始图片重新生成 mock 任务
        const task = createMockTask(record.sourceImages);
        navRes.eventChannel.emit('acceptTaskData', {
          task: task
        });
      }
    });
  },

  // 删除单条记录
  onDeleteRecord: function (e) {
    const recordId = e.currentTarget.dataset.recordid;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          this.deleteRecordById(recordId);
        }
      }
    });
  },

  deleteRecordById: function (recordId) {
    const records = this.data.records.filter(r => r.recordId !== recordId);
    this.saveRecords(records);
    this.loadRecords();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  // 显示清空确认
  onShowClearConfirm: function () {
    this.setData({ showClearConfirm: true });
  },

  onCancelClear: function () {
    this.setData({ showClearConfirm: false });
  },

  onDialogTap: function () {
    // 阻止冒泡
  },

  onConfirmClear: function () {
    this.setData({ showClearConfirm: false });
    this.saveRecords([]);
    this.loadRecords();
    wx.showToast({ title: '已清空', icon: 'success' });
  },

  // 保存记录到本地
  saveRecords: function (records) {
    try {
      wx.setStorageSync(RECORDS_KEY, records);
    } catch (err) {
      console.error('保存记录失败:', err);
    }
  },

  // 返回首页
  onGoHome: function () {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 添加新记录（供结果页调用）
  addRecord: function (task, sourceImages, thumbnails) {
    try {
      const records = wx.getStorageSync(RECORDS_KEY) || [];
      const groupSummary = this.buildGroupSummary(task.groups || {});

      const newRecord = {
        recordId: `record_${Date.now()}`,
        createdAt: Date.now(),
        totalCount: this.calculateTotalCount(task.groups || {}),
        groupSummary: groupSummary,
        thumbnails: (thumbnails || []).slice(0, 4),
        taskSnapshot: task,
        sourceImages: sourceImages || []
      };

      records.unshift(newRecord);

      // 限制最大记录数
      if (records.length > MAX_RECORDS) {
        records.length = MAX_RECORDS;
      }

      wx.setStorageSync(RECORDS_KEY, records);
    } catch (err) {
      console.error('添加记录失败:', err);
    }
  },

  buildGroupSummary: function (groups) {
    const summary = {};
    Object.keys(groups || {}).forEach(key => {
      summary[key] = (groups[key] || []).length;
    });
    return summary;
  },

  calculateTotalCount: function (groups) {
    return Object.keys(groups || {}).reduce((sum, key) => {
      return sum + (groups[key] || []).length;
    }, 0);
  }
});
