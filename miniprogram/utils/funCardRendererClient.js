var env = require('../config/env');

function makeError(message, code) {
  var error = new Error(message);
  if (code) error.code = code;
  return error;
}

function resolveWxApi(wxApi) {
  if (wxApi && typeof wxApi.request === 'function') return wxApi;
  if (typeof wx !== 'undefined' && typeof wx.request === 'function') return wx;
  throw makeError('微信 API 实例不可用', 'WX_API_UNAVAILABLE');
}

function requestRenderer(wxApi, path, payload, options) {
  var opts = options || {};
  var baseUrl = typeof opts.baseUrl === 'string'
    ? opts.baseUrl
    : (env && env.FUN_CARD_RENDERER_URL ? env.FUN_CARD_RENDERER_URL : '');

  if (!baseUrl) {
    return Promise.reject(makeError('手写预览服务尚未配置', 'FUN_RENDERER_NOT_CONFIGURED'));
  }

  var targetWx = resolveWxApi(wxApi);
  var targetUrl = baseUrl.replace(/\/+$/, '') + path;

  return new Promise(function (resolve, reject) {
    targetWx.request({
      url: targetUrl,
      method: 'POST',
      data: payload,
      header: {
        'content-type': 'application/json'
      },
      success: function (res) {
        var statusCode = res.statusCode;
        var data = res.data || {};

        if (statusCode === 403 || data.code === 'CONTENT_UNSAFE') {
          return reject(makeError('内容审核未通过', 'CONTENT_UNSAFE'));
        }
        if (statusCode === 503 || data.code === 'SAFETY_UNAVAILABLE') {
          return reject(makeError('安全服务暂不可用', 'SAFETY_UNAVAILABLE'));
        }
        if (statusCode !== 200 || !data || data.ok !== true) {
          return reject(makeError((data && data.code) || '服务端渲染响应异常', (data && data.code) || 'INVALID_RENDER_RESPONSE'));
        }

        resolve(data);
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '网络请求失败';
        reject(makeError(msg, 'NETWORK_ERROR'));
      }
    });
  });
}

function validateCards(cards, scenes) {
  if (!Array.isArray(cards) || cards.length !== scenes.length) return false;
  return scenes.every(function (scene, index) {
    var card = cards[index];
    return card && card.sceneId === scene.sceneId && card.order === scene.order
      && typeof card.url === 'string' && card.url.length > 0;
  });
}

function requestPreviewStack(wxApi, payload, options) {
  return requestRenderer(wxApi, '/preview-stack', payload, options).then(function (data) {
    if (!data || data.projectId !== payload.projectId || !Array.isArray(data.candidates)) {
      throw makeError('预览响应缺少匹配的项目数据', 'INVALID_RENDER_RESPONSE');
    }
    if (data.candidates.length !== payload.candidates.length) {
      throw makeError('预览候选套数不一致', 'INVALID_RENDER_RESPONSE');
    }

    var valid = payload.candidates.every(function (expectedCandidate) {
      var candidate = data.candidates.find(function (item) {
        return item && item.candidateId === expectedCandidate.candidateId;
      });
      if (!candidate) return false;
      return validateCards(candidate.cards, expectedCandidate.scenes);
    });

    if (!valid) {
      throw makeError('预览卡片与场景定义不一致', 'INVALID_RENDER_RESPONSE');
    }

    return data;
  });
}

function requestRenderStack(wxApi, payload, options) {
  return requestRenderer(wxApi, '/render-stack', payload, options).then(function (data) {
    if (!data || data.projectId !== payload.projectId || data.candidateId !== payload.candidateId) {
      throw makeError('渲染响应缺少匹配的候选数据', 'INVALID_RENDER_RESPONSE');
    }
    if (!validateCards(data.cards, payload.scenes)) {
      throw makeError('渲染卡片与场景定义不一致', 'INVALID_RENDER_RESPONSE');
    }
    return data;
  });
}

module.exports = {
  requestPreviewStack: requestPreviewStack,
  requestRenderStack: requestRenderStack
};
