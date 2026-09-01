// utils/contentGuardClient.js
// 文本内容安全客户端：调用既有 contentGuard 云函数，只接受 result.ok === true。
// 审核拒绝或任何服务异常都按 fail-closed 处理，不放行后续生成。
function createError(message, code) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function checkTextContent(wxApi, text) {
  var cloud = wxApi && wxApi.cloud;
  if (!cloud || typeof cloud.callFunction !== 'function') {
    return Promise.reject(createError('安全服务暂不可用，请稍后重试', 'SAFETY_UNAVAILABLE'));
  }
  var content = String(text || '').trim();
  return cloud.callFunction({
    name: 'contentGuard',
    data: { content: content }
  }).then(function (response) {
    var result = response && response.result;
    if (result && result.ok === true) {
      return { ok: true, code: result.code || 'OK' };
    }
    if (result && result.code === 'CONTENT_UNSAFE') {
      throw createError('内容不符合平台规范，请换一句话试试', 'CONTENT_UNSAFE');
    }
    throw createError('安全服务暂不可用，请稍后重试', 'SAFETY_UNAVAILABLE');
  }).catch(function (err) {
    if (err && err.code === 'CONTENT_UNSAFE') throw err;
    throw createError('安全服务暂不可用，请稍后重试', 'SAFETY_UNAVAILABLE');
  });
}

module.exports = {
  checkTextContent: checkTextContent
};