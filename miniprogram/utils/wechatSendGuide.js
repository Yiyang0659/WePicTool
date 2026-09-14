function goToWechat(wxApi) {
  wxApi.showModal({ title: '图片已保存',
    content: '返回微信后，进入聊天，从相册按编号选择图片发送。不会自动发送。',
    confirmText: '返回微信', cancelText: '留在这里',
    success: function (result) {
      if (!result.confirm) return;
      const fallback = () => wxApi.showModal({ title: '请手动返回微信', content: '点击右上角关闭小程序，再进入聊天，从相册选择刚保存的图片。', showCancel: false });
      if (typeof wxApi.exitMiniProgram !== 'function') return fallback();
      wxApi.exitMiniProgram({ fail: fallback });
    }
  });
}
module.exports = { goToWechat };
