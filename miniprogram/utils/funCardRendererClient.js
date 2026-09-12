var env = require('../config/env');
// An unavailable safety service must not be hammered by switching export buttons.
var safetyCooldowns = new WeakMap();

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

function requestRenderer(wxApi, path, payload, options) {
  var opts = options || {};
  var serviceName = configuredValue(opts, 'serviceName', 'FUN_CARD_RENDERER_SERVICE');
  var cloudEnvId = configuredValue(opts, 'cloudEnvId', 'CLOUD_ENV_ID');
  if (!serviceName || !cloudEnvId) {
    return Promise.reject(makeError('手写预览服务尚未配置', 'FUN_RENDERER_NOT_CONFIGURED'));
  }

  var targetWx = resolveWxApi(wxApi);
  var cooldown = safetyCooldowns.get(targetWx);
  if (cooldown && cooldown.until > Date.now()) {
    return Promise.reject(makeError('云端审核暂不可用，请稍等30秒再试；可以继续本机编辑', 'SAFETY_UNAVAILABLE'));
  }

  return new Promise(function (resolvePromise, rejectPromise) {
    var settled = false, task;
    var startedAt = new Date().toISOString();
    var timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? Math.min(opts.timeoutMs, 45000) : 45000;
    var timer = setTimeout(function () {
      reject(makeError('生成等待超时，编辑内容仍保留，请稍后重试', 'RENDER_TIMEOUT'));
      if (task && typeof task.abort === 'function') task.abort();
    }, timeoutMs);
    function resolve(value) { if (settled) return; settled = true; clearTimeout(timer); resolvePromise(value); }
    function reject(error) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      error.requestPath = path; error.serviceName = serviceName; error.startedAt = startedAt;
      rejectPromise(error);
    }
    var requestOptions = {
      method: 'POST',
      data: payload,
      header: {
        'content-type': 'application/json'
      },
      success: function (res) {
        if (settled) return;
        var statusCode = res.statusCode;
        var data = res.data || {};
        if(statusCode === 429 || data.code === 'RATE_LIMITED') {
          return reject(makeError('请求较多，请稍后重试', 'RATE_LIMITED'));
        }
        if (data.code === 'IMAGE_SAFETY_UNAVAILABLE') {
          return reject(makeError('手绘图片审核尚未接通，笔迹已保留在本机，请稍后生成', 'IMAGE_SAFETY_UNAVAILABLE'));
        }

        if (data && data.code === 'CONTENT_UNSAFE') {
          return reject(makeError('内容审核未通过', 'CONTENT_UNSAFE'));
        }
        if (data && data.code === 'SAFETY_UNAVAILABLE') {
          safetyCooldowns.set(targetWx, {until:Date.now()+30000});
          var error = makeError('云端内容审核暂不可用，未生成成品；编辑内容仍保留，请稍后重试', 'SAFETY_UNAVAILABLE');
          error.statusCode = statusCode;
          var id = res.requestId || (res.header && (res.header['x-request-id'] || res.header['X-Request-Id']));
          if (typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)) error.requestId = id;
          return reject(error);
        }
        if (data.code === 'CALLER_UNAUTHORIZED' || data.code === 'CALLER_AUTH_UNAVAILABLE') {
          return reject(makeError('微信身份验证暂不可用，请重试', data.code));
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

    if (!targetWx.cloud || typeof targetWx.cloud.callContainer !== 'function') {
      reject(makeError('微信云托管调用 API 不可用', 'WX_API_UNAVAILABLE'));
      return;
    }
    requestOptions.config = { env: cloudEnvId };
    requestOptions.path = path;
    requestOptions.header['X-WX-SERVICE'] = serviceName;
    if (typeof targetWx.login !== 'function') {
      reject(makeError('微信登录 API 不可用', 'WX_API_UNAVAILABLE'));
      return;
    }
    targetWx.login({
      timeout: 8000,
      success: function (result) {
        if (settled) return;
        if (!result || !result.code) {
          reject(makeError('微信登录暂不可用，请重试', 'CALLER_UNAUTHORIZED'));
          return;
        }
        requestOptions.header['X-Wepic-Login-Code'] = result.code;
        try { task = targetWx.cloud.callContainer(requestOptions); }
        catch (_) { reject(makeError('云端连接失败，请稍后重试', 'NETWORK_ERROR')); }
      },
      fail: function () {
        reject(makeError('微信登录暂不可用，请重试', 'CALLER_AUTH_UNAVAILABLE'));
      }
    });
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
  requestPreviewScene: function (wxApi, payload, options) {
    return requestRenderer(wxApi, '/preview-scene', payload, options).then(function (data) {
      if (data.projectId !== payload.projectId || data.candidateId !== payload.candidateId ||
          !validateCards([data.card], [payload.scene])) {
        throw makeError('单卡预览响应不匹配', 'INVALID_RENDER_RESPONSE');
      }
      return data.card.url;
    });
  },
  requestPreviewStack: requestPreviewStack,
  requestRenderStack: requestRenderStack
};
