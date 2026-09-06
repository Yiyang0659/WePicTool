var fontFeels = require('../config/fontFeels');
var loadingByKey = {};

function rendererBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function requireFontFeel(fontKey) {
  var fontFeel = fontFeels.getFontFeel(fontKey || 'marker');
  if (!fontFeel) throw new Error('未知字感：' + fontKey);
  return fontFeel;
}

function loadFunTextFont(wxApi, baseUrl, fontKey) {
  var url = rendererBaseUrl(baseUrl);
  if (!url) return Promise.reject(new Error('字画预览服务尚未配置'));
  if (!wxApi || typeof wxApi.loadFontFace !== 'function') {
    return Promise.reject(new Error('当前环境不支持字体加载'));
  }
  var fontFeel;
  try {
    fontFeel = requireFontFeel(fontKey);
  } catch (error) {
    return Promise.reject(error);
  }
  if (loadingByKey[fontFeel.key]) return loadingByKey[fontFeel.key];
  loadingByKey[fontFeel.key] = new Promise(function (resolve, reject) {
    wxApi.loadFontFace({
      global: true,
      family: fontFeel.fontFamily,
      source: 'url("' + url + fontFeel.fontPath + '")',
      success: function (result) { resolve(result); },
      fail: function (err) {
        delete loadingByKey[fontFeel.key];
        reject(new Error((err && err.errMsg) || fontFeel.name + '加载失败'));
      }
    });
  });
  return loadingByKey[fontFeel.key];
}

function resetFontLoadCache() {
  loadingByKey = {};
}

module.exports = {
  FONT_FAMILY: 'LXGWMarkerGothic',
  loadFunTextFont: loadFunTextFont,
  resetFontLoadCache: resetFontLoadCache
};
