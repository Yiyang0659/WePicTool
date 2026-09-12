'use strict';

const { createHash } = require('node:crypto');

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token';
const CHECK_URL = 'https://api.weixin.qq.com/wxa/msg_sec_check';
const IMAGE_CHECK_URL = 'https://api.weixin.qq.com/wxa/img_sec_check';
const INVALID_TOKEN_CODES = new Set([40001, 40014, 42001]);

function safeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeText(value, maxLength = 256) {
  if (typeof value !== 'string') return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength);
}

function safeId(value) {
  const normalized = safeText(value, 128);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function responseHeader(response, name) {
  if (!response || !response.headers) return null;
  if (typeof response.headers.get === 'function') return response.headers.get(name) || null;
  return response.headers[name] || response.headers[name.toLowerCase()] || null;
}

function responseRid(response, body) {
  return safeId(body && (body.rid || body.request_id))
    || safeId(responseHeader(response, 'x-request-id'))
    || safeId(responseHeader(response, 'x-wx-request-id'));
}

function contentHash(content) {
  return typeof content === 'string'
    ? createHash('sha256').update(content, 'utf8').digest('hex')
    : null;
}

function auditMeta(api, packet, result, context, content) {
  const body = result && typeof result === 'object' ? result : {};
  return {
    api,
    errcode: Number.isInteger(body.errcode) ? body.errcode : null,
    errmsg: safeText(body.errmsg),
    rid: safeId(packet && packet.rid),
    httpStatus: Number.isInteger(packet && packet.httpStatus) ? packet.httpStatus : null,
    time: new Date().toISOString(),
    contentHash: contentHash(content),
    traceId: safeId(context && context.traceId)
  };
}

function createWechatSafety(options) {
  const { appId, appSecret } = options;
  if (!/^wx[a-f0-9]{16}$/i.test(appId || '') || !appSecret || !appSecret.trim()) {
    throw safeError('WECHAT_CREDENTIALS_REQUIRED');
  }
  const fetchImpl = options.fetch || globalThis.fetch;
  const now = options.now || Date.now;
  const timeoutMs = options.timeoutMs || 5500;
  let cached;
  let pending;

  // Never propagate native fetch errors: their messages may contain URLs/tokens.
  async function post(url, data, signal) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST', redirect: 'error', signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      });
      const httpStatus = Number.isInteger(response.status) ? response.status : (response.ok ? 200 : null);
      const body = await response.json();
      const packet = { body, httpStatus, rid: responseRid(response, body) };
      if (!response.ok) {
        const error = safeError('WECHAT_HTTP_ERROR');
        error.meta = {
          httpStatus,
          rid: packet.rid,
          errmsg: safeText(body && body.errmsg),
          errcode: Number.isInteger(body && body.errcode) ? body.errcode : null
        };
        throw error;
      }
      return packet;
    } catch (error) {
      if (error && error.meta) throw error;
      throw safeError(signal.aborted ? 'WECHAT_TIMEOUT' : 'WECHAT_REQUEST_FAILED');
    }
  }

  async function token(traceId) {
    if (cached && now() < cached.refreshAt) return cached.value;
    if (!pending) {
      pending = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 3000));
        try {
          let packet;
          try {
            packet = await post(TOKEN_URL, {
              grant_type: 'client_credential', appid: appId,
              secret: appSecret, force_refresh: false
            }, controller.signal);
          } catch (error) {
            error.meta = Object.assign({
              api: '/cgi-bin/stable_token', errcode: null, errmsg: null, rid: null,
              httpStatus: null, time: new Date().toISOString(), contentHash: null, traceId: safeId(traceId)
            }, error.meta || {});
            throw error;
          }
          const result = packet.body;
          if (!result || typeof result.access_token !== 'string' || !result.access_token.trim()
              || !Number.isFinite(result.expires_in) || result.expires_in <= 0
              || (result.errcode !== undefined && result.errcode !== 0)) {
            const code = result && Number.isInteger(result.errcode) ? result.errcode : 'INVALID_RESPONSE';
            const error = safeError('WECHAT_TOKEN_' + code);
            error.meta = auditMeta('/cgi-bin/stable_token', packet, result, { traceId });
            throw error;
          }
          const ttl = result.expires_in * 1000;
          cached = { value: result.access_token, refreshAt: now() + ttl - Math.min(60000, ttl / 2) };
          return cached.value;
        } finally {
          clearTimeout(timer);
        }
      })().finally(() => { pending = null; });
    }
    return pending;
  }

  const checkContent = async function (content, context = {}) {
    const unavailable = { ok: false, code: 'SAFETY_UNAVAILABLE' };
    if (typeof context.openid !== 'string' || !context.openid.trim()
        || typeof content !== 'string' || !content.trim() || [...content].length > 2500) {
      return unavailable;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const accessToken = await token(context.traceId);
        if (controller.signal.aborted) throw safeError('WECHAT_TIMEOUT');
        const packet = await post(CHECK_URL + '?access_token=' + encodeURIComponent(accessToken), {
          content, openid: context.openid, version: 2, scene: 4
        }, controller.signal);
        const result = packet.body;
        if (result && INVALID_TOKEN_CODES.has(result.errcode) && attempt === 0) {
          if (cached && cached.value === accessToken) cached = null;
          continue;
        }
        if (!result || result.errcode !== 0) {
          const code = result && Number.isInteger(result.errcode) ? result.errcode : 'INVALID_RESPONSE';
          const error = safeError('WECHAT_AUDIT_' + code);
          error.meta = auditMeta('/wxa/msg_sec_check', packet, result, context, content);
          throw error;
        }
        const suggest = result.result && result.result.suggest;
        if (suggest === 'pass') return { ok: true, code: 'OK' };
        if (suggest === 'risky' || suggest === 'review') return { ok: false, code: 'CONTENT_UNSAFE' };
        throw safeError('WECHAT_AUDIT_INVALID_RESULT');
      }
      return unavailable;
    } catch (error) {
      if (typeof options.onError === 'function') {
        const code = /^WECHAT_[A-Z0-9_-]+$/.test(error.code || '') ? error.code : 'WECHAT_UNKNOWN_ERROR';
        const meta = Object.assign(
          auditMeta('/wxa/msg_sec_check', null, null, context, content),
          error.meta || {}
        );
        try {
          options.onError(Object.assign({ code }, meta));
        } catch (_) { /* Logging must not change the audit result. */ }
      }
      return unavailable;
    } finally {
      clearTimeout(timer);
    }
  };
  checkContent.checkImage = async function (buffer) {
    const unavailable = {ok:false,code:'IMAGE_SAFETY_UNAVAILABLE'};
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 1024*1024) return unavailable;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      for(let attempt=0;attempt<2;attempt++) {
        const accessToken=await token();
        if(controller.signal.aborted) return unavailable;
        const form=new FormData();form.append('media',new Blob([buffer],{type:'image/png'}),'image.png');
        const response=await fetchImpl(IMAGE_CHECK_URL+'?access_token='+encodeURIComponent(accessToken),
          {method:'POST',body:form,redirect:'error',signal:controller.signal});
        const httpStatus = Number.isInteger(response.status) ? response.status : (response.ok ? 200 : null);
        if(!response.ok) {
          if (typeof options.onError === 'function') {
            try { options.onError({ code: 'WECHAT_IMAGE_HTTP_ERROR', api: '/wxa/img_sec_check', errcode: null, errmsg: null, rid: safeId(responseHeader(response, 'x-request-id')), httpStatus, time: new Date().toISOString(), contentHash: null, traceId: null }); } catch (_) { /* Ignore diagnostics failures. */ }
          }
          return unavailable;
        }
        const result=await response.json();
        if(result && INVALID_TOKEN_CODES.has(result.errcode) && attempt===0) {
          if(cached && cached.value===accessToken) cached=null;
          continue;
        }
        if(result && result.errcode===0) return {ok:true,code:'OK'};
        if(result && result.errcode===87014) return {ok:false,code:'CONTENT_UNSAFE'};
        if (typeof options.onError === 'function') {
          try { options.onError({ code: 'WECHAT_IMAGE_' + (Number.isInteger(result && result.errcode) ? result.errcode : 'INVALID_RESPONSE'), api: '/wxa/img_sec_check', errcode: Number.isInteger(result && result.errcode) ? result.errcode : null, errmsg: safeText(result && result.errmsg), rid: responseRid(response, result), httpStatus, time: new Date().toISOString(), contentHash: null, traceId: null }); } catch (_) { /* Ignore diagnostics failures. */ }
        }
        return unavailable;
      }
      return unavailable;
    } catch(_) { return unavailable; }
    finally { clearTimeout(timer); }
  };
  return checkContent;
}

module.exports = { createWechatSafety };
