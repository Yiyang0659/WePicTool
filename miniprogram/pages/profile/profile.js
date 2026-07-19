// pages/profile/profile.js
Page({
  data: {
    userId: '',
    cacheSize: '0 KB',
    version: '1.0.0',
    recordCount: 0,
    showFeedback: false,
    feedbackContent: '',
    showAbout: false
  },

  onLoad: function () {
    this.setData({
      userId: this.generateUserId()
    });
    this.updateCacheSize();
    this.updateRecordCount();
  },

  onShow: function () {
    this.updateCacheSize();
    this.updateRecordCount();
  },

  // 统计已生成次数（读取本地记录数组长度，容错为 0）
  updateRecordCount: function () {
    let count = 0;
    try {
      const records = wx.getStorageSync('wepictool_records');
      if (Array.isArray(records)) {
        count = records.length;
      }
    } catch (err) {
      count = 0;
    }
    this.setData({ recordCount: count });
  },

  // 生成匿名用户 ID
  generateUserId: function () {
    let userId = wx.getStorageSync('wepictool_user_id');
    if (!userId) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      userId = result;
      wx.setStorageSync('wepictool_user_id', userId);
    }
    return userId;
  },

  // 复制用户 ID
  onCopyId: function () {
    wx.setClipboardData({
      data: this.data.userId,
      success: () => {
        wx.showToast({
          title: 'ID 已复制',
          icon: 'success'
        });
      }
    });
  },

  // 联系客服
  onContactService: function () {
    wx.openCustomerServiceChat({
      extInfo: { url: '' },
      corpId: '',
      success: () => {},
      fail: () => {
        wx.showModal({
          title: '联系客服',
          content: '客服功能需要在小程序后台配置企业微信客服。',
          showCancel: false
        });
      }
    });
  },

  // 打开反馈弹窗
  onFeedback: function () {
    this.setData({ showFeedback: true });
  },

  onCloseFeedback: function () {
    this.setData({ showFeedback: false });
  },

  onFeedbackPanelTap: function () {
    // 阻止冒泡
  },

  onFeedbackInput: function (e) {
    this.setData({
      feedbackContent: e.detail.value
    });
  },

  onSubmitFeedback: function () {
    const content = this.data.feedbackContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }

    // 保存到本地，后续可接入客服系统
    const feedbacks = wx.getStorageSync('wepictool_feedbacks') || [];
    feedbacks.unshift({
      content: content,
      createdAt: Date.now(),
      userId: this.data.userId
    });
    wx.setStorageSync('wepictool_feedbacks', feedbacks.slice(0, 50));

    this.setData({
      showFeedback: false,
      feedbackContent: ''
    });

    wx.showToast({
      title: '反馈已提交',
      icon: 'success'
    });
  },

  // 推荐给好友
  onRecommend: function () {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
    wx.showToast({
      title: '点击右上角转发',
      icon: 'none'
    });
  },

  // 打开相册权限设置
  onOpenAlbumSetting: function () {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting['scope.writePhotosAlbum']) {
          wx.showToast({ title: '相册权限已开启', icon: 'success' });
        } else {
          wx.showToast({ title: '请开启相册权限', icon: 'none' });
        }
      }
    });
  },

  // 清空缓存
  onClearCache: function () {
    wx.showModal({
      title: '清空缓存',
      content: '清空后将删除本地临时文件和历史记录缩略图，是否继续？',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          this.doClearCache();
        }
      }
    });
  },

  doClearCache: function () {
    try {
      // 清理本地存储中的记录和反馈
      wx.removeStorageSync('wepictool_records');
      wx.removeStorageSync('wepictool_feedbacks');

      // 清理临时文件
      wx.getSavedFileList({
        success: (res) => {
          res.fileList.forEach(file => {
            wx.removeSavedFile({ filePath: file.filePath });
          });
        }
      });

      this.updateCacheSize();
      wx.showToast({ title: '缓存已清空', icon: 'success' });
    } catch (err) {
      console.error('清空缓存失败:', err);
      wx.showToast({ title: '清空失败', icon: 'none' });
    }
  },

  // 计算缓存大小
  updateCacheSize: function () {
    try {
      const keys = wx.getStorageInfoSync().keys;
      let totalSize = 0;
      keys.forEach(key => {
        const value = wx.getStorageSync(key);
        totalSize += JSON.stringify(value).length;
      });

      const sizeText = totalSize < 1024
        ? `${totalSize} B`
        : totalSize < 1024 * 1024
          ? `${(totalSize / 1024).toFixed(1)} KB`
          : `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;

      this.setData({ cacheSize: sizeText });
    } catch (err) {
      this.setData({ cacheSize: '未知' });
    }
  },

  // 关于
  onAbout: function () {
    this.setData({ showAbout: true });
  },

  onCloseAbout: function () {
    this.setData({ showAbout: false });
  },

  onAboutPanelTap: function () {
    // 阻止冒泡
  },

  // 隐私说明
  onPrivacy: function () {
    wx.showModal({
      title: '隐私说明',
      content: '滑一叠重视您的隐私。我们仅在本地处理您选择的图片，不上传个人身份信息。图片处理需要您授权相册访问权限。历史记录仅保存在本地设备中，不会同步到云端。',
      showCancel: false
    });
  },

  onShareAppMessage: function () {
    return {
      title: '滑一叠 - 做一叠图，发给朋友滑着挑',
      path: '/pages/index/index'
    };
  }
});
