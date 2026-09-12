const test = require('node:test');
const assert = require('node:assert/strict');
const { createWechatCaller } = require('../miniprogram/cloudhosting/fun-card-renderer/wechatCaller');
const { createHttpServer } = require('../miniprogram/cloudhosting/fun-card-renderer/server');
const client = require('../miniprogram/utils/funCardRendererClient');
const credentials = { appId: 'wx1234567890abcdef', appSecret: 'test-secret' };
test('client login failure and missing code never invoke renderer', async () => {
  for (const login of [opts => opts.fail({ errMsg: 'private' }), opts => opts.success({})]) {
    let calls = 0;
    await assert.rejects(client.requestRenderStack({ login,
      cloud: { callContainer() { calls++; } } }, {}, {
      serviceName: 'renderer', cloudEnvId: 'test'
    }), /微信登录暂不可用/);
    assert.equal(calls, 0);
  }
});
test('caller validates code with fixed WeChat endpoint and only returns verified identity', async () => {
  let calls = 0;
  const verify = createWechatCaller({ ...credentials, fetch: async (url, opts) => {
    calls++;
    assert.equal(url.origin + url.pathname, 'https://api.weixin.qq.com/sns/jscode2session');
    assert.equal(url.searchParams.get('js_code'), 'fresh-code');
    assert.equal(opts.redirect, 'error');
    return { ok: true, json: async () => ({ openid: 'verified-user', session_key: 'never-return' }) };
  }});
  assert.equal((await verify()).code, 'CALLER_UNAUTHORIZED');
  assert.equal(calls, 0);
  assert.deepEqual(await verify('fresh-code'), { openid: 'verified-user' });
});
test('invalid/reused codes and upstream failures fail closed', async () => {
  for (const errcode of [40029, 40163, 40013]) {
    const verify = createWechatCaller({ ...credentials, fetch: async () => ({
      ok: true, json: async () => ({ errcode, errmsg: 'secret detail' })
    }) });
    const result = await verify('code');
    assert.equal(result.statusCode, errcode === 40013 ? 503 : 403);
    assert.equal(result.openid, undefined);
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('caller aborts timeout', async () => {
  const verify = createWechatCaller({ ...credentials, timeoutMs: 10,
    fetch: (_, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('sensitive')));
    }) });
  assert.equal((await verify('code')).code, 'CALLER_AUTH_UNAVAILABLE');
});
test('forged headers cannot reach handler; verified identity overrides headers and body', async t => {
  let calls = 0;
  const server = createHttpServer({ verifyCaller: async code => code === 'valid'
    ? { openid: 'verified' } : { statusCode: 403, code: 'CALLER_UNAUTHORIZED' },
    renderStackHandler: async (_, context) => {
      calls++; assert.equal(context.openid, 'verified');
      return { statusCode: 200, body: { ok: true } };
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/render-stack`;
  const headers = { 'x-wx-openid': 'forged', 'x-cloudbase-context': 'forged' };
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{}' })).status, 403);
  assert.equal(calls, 0);
  headers['x-wepic-login-code'] = 'valid';
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{"openid":"forged"}' })).status, 200);
  assert.equal(calls, 1);
});
