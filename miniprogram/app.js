const { CLOUD_ENV_ID, ENABLE_LOCAL_MOCK } = require('./config/env');

App({
  onLaunch: function () {
    const cloudReady = Boolean(wx.cloud && CLOUD_ENV_ID);

    if (cloudReady) {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: false
      });
    } else if (!wx.cloud) {
      console.warn('当前基础库不支持云能力，请使用 2.2.3 或以上版本。');
    } else {
      console.warn('未配置 CloudBase 云环境 ID，已启用本地预览模式。');
    }

    this.globalData = {
      cloudReady: cloudReady,
      localMock: ENABLE_LOCAL_MOCK || !cloudReady
    };
  }
});
