var env = require('../config/env');

function makeError(message, code) {
  var error = new Error(message);
  if (code) error.code = code;
  return error;
}

function resolveWxApi(wxApi) {
  if (wxApi) return wxApi;
  if (typeof wx !== 'undefined') return wx;
  throw makeError('微信 API 实例不可用', 'WX_API_UNAVAILABLE');
}

function configuredValue(options, optionKey, envKey) {
  if (options && Object.prototype.hasOwnProperty.call(options, optionKey)) {
    return typeof options[optionKey] === 'string' ? options[optionKey].trim() : '';
  }
  return env && typeof env[envKey] === 'string' ? env[envKey].trim() : '';
}

function isLoopbackDevelopmentUrl(value) {
  return /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(value.replace(/\/+$/, ''));
}

function requestRenderer(wxApi, path, payload, options) {
  var opts = options || {};
  var baseUrl = configuredValue(opts, 'baseUrl', 'FUN_CARD_RENDERER_URL').replace(/\/+$/, '');
  var serviceName = configuredValue(opts, 'serviceName', 'FUN_CARD_RENDERER_SERVICE');
  var cloudEnvId = configuredValue(opts, 'cloudEnvId', 'CLOUD_ENV_ID');
  var useLocalRequest = isLoopbackDevelopmentUrl(baseUrl);

  if (!useLocalRequest && (!serviceName || !cloudEnvId)) {
    return Promise.reject(makeError('手写预览服务尚未配置', 'FUN_RENDERER_NOT_CONFIGURED'));
  }

  var targetWx = resolveWxApi(wxApi);

  return new Promise(function (resolve, reject) {
    var requestOptions = {
      method: 'POST',
      data: payload,
      header: {
        'content-type': 'application/json'
      },
      success: function (res) {
        var statusCode = res.statusCode;
        var data = res.data || {};

        if (data && data.code === 'CONTENT_UNSAFE') {
          return reject(makeError('内容审核未通过', 'CONTENT_UNSAFE'));
        }
        if (data && data.code === 'SAFETY_UNAVAILABLE') {
          return reject(makeError('安全服务暂不可用', 'SAFETY_UNAVAILABLE'));
        }
        if (statusCode !== 200 || !data || data.ok !== true) {
          return reject(makeError('服务端渲染响应异常', 'INVALID_RENDER_RESPONSE'));
        }

        resolve(data);
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '网络请求失败';
        reject(makeError(msg, 'NETWORK_ERROR'));
      }
    };

    if (useLocalRequest) {
      if (typeof targetWx.request !== 'function') {
        reject(makeError('微信本地请求 API 不可用', 'WX_API_UNAVAILABLE'));
        return;
      }
      requestOptions.url = baseUrl + path;
      targetWx.request(requestOptions);
      return;
    }

    if (!targetWx.cloud || typeof targetWx.cloud.callContainer !== 'function') {
      reject(makeError('微信云托管调用 API 不可用', 'WX_API_UNAVAILABLE'));
      return;
    }
    requestOptions.config = { env: cloudEnvId };
    requestOptions.path = path;
    requestOptions.header['X-WX-SERVICE'] = serviceName;
    targetWx.cloud.callContainer(requestOptions);
  });
}

function normalizeCardUrl(url) {
  if (typeof url !== 'string') return '';
  var normalized = url.trim();
  return /^(?:https?|cloud):\/\/\S+$/.test(normalized) ? normalized : '';
}

function validateCards(cards, scenes) {
  if (!Array.isArray(cards) || cards.length !== scenes.length) return false;
  var normalizedUrls = [];
  var valid = scenes.every(function (scene, index) {
    var card = cards[index];
    var url = card && normalizeCardUrl(card.url);
    normalizedUrls[index] = url;
    return card && card.sceneId === scene.sceneId && card.order === scene.order && url;
  });
  if (!valid) return false;
  cards.forEach(function (card, index) {
    card.url = normalizedUrls[index];
  });
  return true;
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
