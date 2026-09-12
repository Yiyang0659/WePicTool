const test = require('node:test');
const assert = require('node:assert/strict');
const { createWechatSafety } = require('../miniprogram/cloudhosting/fun-card-renderer/wechatSafety');
const { createHttpServer } = require('../miniprogram/cloudhosting/fun-card-renderer/server');
const credentials = { appId: 'wx1234567890abcdef', appSecret: 'test-secret' };
const context = { openid: 'test-openid' };
const reply = body => ({ ok: true, json: async () => body });

test('credentials required before network use', () => {
  assert.throws(() => createWechatSafety({ appId: credentials.appId }), /WECHAT_CREDENTIALS_REQUIRED/);
});

test('stable token cache and concurrent refresh; v2 params and fixed HTTPS endpoint', async () => {
  let time = 0, tokens = 0;
  const check = createWechatSafety({ ...credentials, now: () => time, fetch: async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(opts.redirect, 'error');
    if (url.endsWith('/stable_token')) {
      tokens++;
      assert.equal(body.force_refresh, false);
      assert.equal(body.appid, credentials.appId);
      return reply({ access_token: 'token', expires_in: 120 });
    }
    assert.equal(url, 'https://api.weixin.qq.com/wxa/msg_sec_check?access_token=token');
    assert.deepEqual(body, { content: '你好', openid: context.openid, version: 2, scene: 4 });
    return reply({ errcode: 0, result: { suggest: 'pass' } });
  }});
  const results = await Promise.all([check('你好', context), check('你好', context)]);
  assert.ok(results.every(r => r.ok));
  assert.equal(tokens, 1);
  await check('你好', context);
  assert.equal(tokens, 1);
  time = 61000;
  await Promise.all([check('你好', context), check('你好', context)]);
  assert.equal(tokens, 2);
});

for (const [result, code] of [
  [{ errcode: 0, result: { suggest: 'risky' } }, 'CONTENT_UNSAFE'],
  [{ errcode: 0, result: { suggest: 'review' } }, 'CONTENT_UNSAFE'],
  [{ errcode: 0 }, 'SAFETY_UNAVAILABLE'],
  [{ errcode: 0, result: { suggest: 'unknown' } }, 'SAFETY_UNAVAILABLE'],
  [{ errcode: 43104 }, 'SAFETY_UNAVAILABLE'],
  [null, 'SAFETY_UNAVAILABLE']
]) test('fail closed for ' + JSON.stringify(result), async () => {
  const check = createWechatSafety({ ...credentials, fetch: async url => reply(
    url.endsWith('/stable_token') ? { access_token: 'token', expires_in: 7200 } : result
  ) });
  assert.deepEqual(await check('你好', context), { ok: false, code });
});

test('missing identity and overlong content rejected without network', async () => {
  let calls = 0;
  const check = createWechatSafety({ ...credentials, fetch: () => { calls++; } });
  assert.equal((await check('你好')).ok, false);
  assert.equal((await check('中'.repeat(2501), context)).ok, false);
  assert.equal(calls, 0);
});

test('invalid token retries only once without forced refresh', async () => {
  let calls = 0, tokens = 0;
  const check = createWechatSafety({ ...credentials, fetch: async (url, opts) => {
    if (url.endsWith('/stable_token')) {
      tokens++;
      assert.equal(JSON.parse(opts.body).force_refresh, false);
      return reply({ access_token: 'token' + tokens, expires_in: 7200 });
    }
    calls++;
    return reply({ errcode: 40001 });
  }});
  assert.equal((await check('你好', context)).code, 'SAFETY_UNAVAILABLE');
  assert.equal(tokens, 2);
  assert.equal(calls, 2);
});

test('IP whitelist error includes bounded API diagnostics without credentials', async () => {
  const errors = [];
  const check = createWechatSafety({ ...credentials, onError: e => errors.push(e),
    fetch: async () => reply({ errcode: 40164, errmsg: 'sensitive details' }) });
  assert.equal((await check('你好', context)).ok, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'WECHAT_TOKEN_40164');
  assert.equal(errors[0].api, '/cgi-bin/stable_token');
  assert.equal(errors[0].errcode, 40164);
  assert.equal(errors[0].errmsg, 'sensitive details');
  assert.equal(errors[0].contentHash, null);
  assert.doesNotMatch(JSON.stringify(errors[0]), /test-secret|test-openid|access_token/);
});

test('timeout aborts request and cannot leak native error or secret', async () => {
  const errors = [];
  const check = createWechatSafety({ ...credentials, timeoutMs: 15, onError: e => errors.push(e),
    fetch: (_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('SECRET token URL user text')));
    }) });
  assert.equal((await check('你好', context)).ok, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'WECHAT_TIMEOUT');
  assert.equal(errors[0].api, '/cgi-bin/stable_token');
  assert.equal(errors[0].errmsg, null);
  assert.doesNotMatch(JSON.stringify(errors[0]), /SECRET|token URL|user text|test-openid/);
});

test('45009 diagnostics preserve API, raw response fields, hash and trace without content', async () => {
  const errors = [];
  const check = createWechatSafety({ ...credentials, onError: e => errors.push(e),
    fetch: async (url) => url.endsWith('/stable_token')
      ? reply({ access_token: 'token', expires_in: 7200 })
      : reply({ errcode: 45009, errmsg: 'api freq out of limit', rid: 'rid-45009' }) });
  const content = '你好，世界';
  const result = await check(content, { openid: 'test-openid', traceId: 'trace-123' });
  assert.deepEqual(result, { ok: false, code: 'SAFETY_UNAVAILABLE' });
  assert.equal(errors.length, 1);
  assert.deepEqual({
    code: errors[0].code,
    api: errors[0].api,
    errcode: errors[0].errcode,
    errmsg: errors[0].errmsg,
    rid: errors[0].rid,
    httpStatus: errors[0].httpStatus,
    traceId: errors[0].traceId
  }, {
    code: 'WECHAT_AUDIT_45009', api: '/wxa/msg_sec_check', errcode: 45009,
    errmsg: 'api freq out of limit', rid: 'rid-45009', httpStatus: 200, traceId: 'trace-123'
  });
  assert.equal(errors[0].contentHash,
    '46932f1e6ea5216e77f58b1908d72ec9322ed129318c6d4bd4450b5eaab9d7e7');
  assert.doesNotMatch(JSON.stringify(errors[0]), /你好|世界|test-openid|token|test-secret/);
});

test('HTTP context takes OpenID from header, never request body', async () => {
  let received;
  const server = createHttpServer({ renderStackHandler: async (body, ctx) => {
    received = ctx;
    return { statusCode: 200, body: { ok: true } };
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + server.address().port + '/render-stack', {
      method: 'POST', headers: { 'x-wx-openid': 'header-openid', 'x-cloudbase-context': 'test-context' },
      body: JSON.stringify({ openid: 'forged-body' })
    });
    assert.equal(res.status, 200);
    assert.equal(received.openid, 'header-openid');
    assert.equal(received.requestPath, '/render-stack');
    assert.match(received.traceId, /^[a-f0-9-]{36}$/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
