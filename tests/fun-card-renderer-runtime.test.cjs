'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const serviceRoot = path.join(
  __dirname,
  '..',
  'miniprogram',
  'cloudhosting',
  'fun-card-renderer'
);

test('runtime enables offline simulation only for explicit non-production development', () => {
  const runtime = require(path.join(serviceRoot, 'runtimeConfig.js'));

  assert.deepEqual(runtime.resolveRuntimeMode({
    NODE_ENV: 'development',
    FUN_CARD_RENDERER_DEV_MODE: '1'
  }), { devMode: true, cloudEnvId: '' });

  for (const env of [
    {},
    { NODE_ENV: 'development' },
    { NODE_ENV: 'test', FUN_CARD_RENDERER_DEV_MODE: 'true' },
    { NODE_ENV: 'production', FUN_CARD_RENDERER_DEV_MODE: '1' }
  ]) {
    assert.throws(() => runtime.resolveRuntimeMode(env), /CLOUDBASE_ENV_ID|production/i);
  }

  assert.deepEqual(runtime.resolveRuntimeMode({
    NODE_ENV: 'production',
    CLOUDBASE_ENV_ID: 'prod-env-123'
  }), { devMode: false, cloudEnvId: 'prod-env-123' });
});

test('production runtime refuses to start without audit and storage capabilities', () => {
  const runtime = require(path.join(serviceRoot, 'runtimeConfig.js'));
  const completeCloud = {
    openapi: { security: { msgSecCheck() {} } },
    uploadFile() {},
    deleteFile() {}
  };

  assert.doesNotThrow(() => runtime.assertCloudCapabilities(completeCloud));
  assert.throws(
    () => runtime.assertCloudCapabilities({ openapi: {}, uploadFile() {}, deleteFile() {} }),
    /msgSecCheck/
  );
  assert.throws(
    () => runtime.assertCloudCapabilities({
      openapi: { security: { msgSecCheck() {} } },
      uploadFile() {}
    }),
    /deleteFile/
  );
});

test('production entry process fails closed when CloudBase environment is absent', () => {
  const result = spawnSync(process.execPath, ['index.js'], {
    cwd: serviceRoot,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0' },
    encoding: 'utf8',
    timeout: 1500
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLOUDBASE_ENV_ID/);
  assert.doesNotMatch(result.stdout, /listening/);
});
