'use strict';

// Login codes and session keys must never be logged or persisted.
function createWechatCaller(options) {
  const { appId, appSecret } = options;
  if (!/^wx[0-9a-f]{16}$/i.test(appId || '') || !appSecret) {
    throw new Error('WeChat caller credentials missing');
  }
  const request = options.fetch || globalThis.fetch;
  let active = 0;
  let windowStart = Date.now();
  let attempts = 0;
  return async function verifyCaller(code) {
    if (typeof code !== 'string' || !/^[\w-]{1,256}$/.test(code)) {
      return { statusCode: 403, code: 'CALLER_UNAUTHORIZED' };
    }
    if (active >= 8) return { statusCode: 429, code: 'RATE_LIMITED' };
    if (Date.now() - windowStart >= 60000) {
      windowStart = Date.now();
      attempts = 0;
    }
    if (attempts >= 120) return { statusCode: 429, code: 'RATE_LIMITED' };
    attempts += 1;
    active += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
    try {
      const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
      url.search = new URLSearchParams({ appid: appId, secret: appSecret,
        js_code: code, grant_type: 'authorization_code' }).toString();
      const response = await request(url, { redirect: 'error', signal: controller.signal });
      if (!response.ok) {
        if (options.onError) options.onError({code:'WECHAT_LOGIN_HTTP_ERROR'});
        return { statusCode: 503, code: 'CALLER_AUTH_UNAVAILABLE' };
      }
      const data = await response.json();
      if (data && (!data.errcode || data.errcode === 0) &&
          typeof data.openid === 'string' && /^[\w-]{1,128}$/.test(data.openid)) {
        return { openid: data.openid };
      }
      const invalidCode = data && [40029, 40163, 40226].includes(data.errcode);
      if (options.onError) options.onError({ code: Number.isInteger(data && data.errcode)
        ? 'WECHAT_LOGIN_' + data.errcode : 'WECHAT_LOGIN_INVALID_RESPONSE' });
      return { statusCode: invalidCode ? 403 : 503,
        code: invalidCode ? 'CALLER_UNAUTHORIZED' : 'CALLER_AUTH_UNAVAILABLE' };
    } catch (_) {
      if (options.onError) options.onError({code:controller.signal.aborted
        ? 'WECHAT_LOGIN_TIMEOUT' : 'WECHAT_LOGIN_CONNECTION_OR_RESPONSE_ERROR'});
      return { statusCode: 503, code: 'CALLER_AUTH_UNAVAILABLE' };
    } finally {
      clearTimeout(timer);
      active -= 1;
    }
  };
}

module.exports = { createWechatCaller };
