var FONT_FAMILY = 'LXGWMarkerGothic';
var FONT_PATH = '/font/LXGWMarkerGothic-Regular.ttf';

function rendererBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function loadFunTextFont(wxApi, baseUrl) {
  var url = rendererBaseUrl(baseUrl);
  if (!url) return Promise.reject(new Error('手写预览服务尚未配置'));
  if (!wxApi || typeof wxApi.loadFontFace !== 'function') {
    return Promise.reject(new Error('当前环境不支持手写字体加载'));
  }
  return new Promise(function (resolve, reject) {
    wxApi.loadFontFace({
      global: true,
      family: FONT_FAMILY,
      source: 'url("' + url + FONT_PATH + '")',
      success: resolve,
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '手写字体加载失败'));
      }
    });
  });
}

module.exports = {
  FONT_FAMILY: FONT_FAMILY,
  loadFunTextFont: loadFunTextFont
};
