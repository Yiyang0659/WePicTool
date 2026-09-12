'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const checkScript = path.join(root, 'scripts/check-miniprogram.mjs');
const syntaxScript = path.join(root, 'scripts/check-syntax.mjs');

function makeFixture(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wepic-check-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'miniprogram'), path.join(fixtureRoot, 'miniprogram'), {
    recursive: true,
    filter(source) {
      return !source.split(path.sep).includes('node_modules');
    }
  });
  fs.copyFileSync(path.join(root, 'project.config.json'), path.join(fixtureRoot, 'project.config.json'));
  return fixtureRoot;
}

function writeEnv(fixtureRoot, values) {
  const config = Object.assign({
    CLOUD_ENV_ID: 'prod-env-123',
    ENABLE_FUN_TEXT_STACK_ENTRY: true,
    FUN_CARD_RENDERER_SERVICE: 'fun-card-renderer',
    FUN_CARD_RENDERER_URL: 'https://renderer.wepictool.cn'
  }, values || {});
  const entryFlag = typeof config.ENABLE_FUN_TEXT_STACK_ENTRY === 'boolean'
    ? String(config.ENABLE_FUN_TEXT_STACK_ENTRY)
    : `'${config.ENABLE_FUN_TEXT_STACK_ENTRY}'`;
  fs.writeFileSync(path.join(fixtureRoot, 'miniprogram/config/env.js'), [
    `const CLOUD_ENV_ID = '${config.CLOUD_ENV_ID}';`,
    `const ENABLE_FUN_TEXT_STACK_ENTRY = ${entryFlag};`,
    `const FUN_CARD_RENDERER_SERVICE = '${config.FUN_CARD_RENDERER_SERVICE}';`,
    `const FUN_CARD_RENDERER_URL = '${config.FUN_CARD_RENDERER_URL}';`,
    'module.exports = { CLOUD_ENV_ID, ENABLE_FUN_TEXT_STACK_ENTRY, FUN_CARD_RENDERER_SERVICE, FUN_CARD_RENDERER_URL };',
    ''
  ].join('\n'));
}

function runCheck(fixtureRoot, ...args) {
  return spawnSync(process.execPath, [checkScript, '--root', fixtureRoot].concat(args), {
    cwd: root,
    env: Object.assign({}, process.env, { FUN_CARD_RENDERER_ACCESS_MODE: 'call-container-only' }),
    encoding: 'utf8'
  });
}

function combinedOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

test('preflight unconditionally requires the complete renderer service', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot);
  fs.rmSync(path.join(fixtureRoot, 'miniprogram/cloudhosting/fun-card-renderer'), {
    recursive: true,
    force: true
  });

  const result = runCheck(fixtureRoot);

  assert.equal(result.status, 1);
  const output = combinedOutput(result);
  for (const required of [
    'Dockerfile',
    'package-lock.json',
    'package.json',
    'index.js',
    'server.js',
    'renderer.js',
    'sceneValidator.js',
    'drawAssets.js',
    'LXGWMarkerGothic-Regular.ttf',
    'OFL-LXGWMarkerGothic.txt'
  ]) {
    assert.match(output, new RegExp(required.replace('.', '\\.')));
  }
});

test('preflight rejects a fake font and an incomplete OFL license', (t) => {
  const badFontRoot = makeFixture(t);
  writeEnv(badFontRoot);
  fs.writeFileSync(
    path.join(badFontRoot, 'miniprogram/cloudhosting/fun-card-renderer/assets/fonts/LXGWMarkerGothic-Regular.ttf'),
    Buffer.alloc(1024, 0)
  );
  const badFont = runCheck(badFontRoot);
  assert.equal(badFont.status, 1);
  assert.match(combinedOutput(badFont), /字体.*(?:magic|文件头|大小)/i);

  const badLicenseRoot = makeFixture(t);
  writeEnv(badLicenseRoot);
  fs.writeFileSync(
    path.join(badLicenseRoot, 'miniprogram/cloudhosting/fun-card-renderer/LICENSES/OFL-LXGWMarkerGothic.txt'),
    'SIL OPEN FONT LICENSE Version 1.1\n'
  );
  const badLicense = runCheck(badLicenseRoot);
  assert.equal(badLicense.status, 1);
  assert.match(combinedOutput(badLicense), /OFL.*(?:正文|授权|copyright)/i);
});

test('preflight pins the renderer to bookworm-slim and node:http', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot);
  fs.writeFileSync(
    path.join(fixtureRoot, 'miniprogram/cloudhosting/fun-card-renderer/Dockerfile'),
    'FROM node:20-alpine\nCMD ["node", "index.js"]\n'
  );
  const serverPath = path.join(fixtureRoot, 'miniprogram/cloudhosting/fun-card-renderer/server.js');
  fs.writeFileSync(serverPath, fs.readFileSync(serverPath, 'utf8').replace("require('node:http')", "require('express')"));

  const result = runCheck(fixtureRoot, '--release');

  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /node:20-bookworm-slim/);
  assert.match(combinedOutput(result), /node:http/);
});

test('ordinary preflight clearly warns for every non-release renderer configuration', (t) => {
  const cases = [
    [{ FUN_CARD_RENDERER_URL: '' }, /FUN_CARD_RENDERER_URL.*(?:空|未填写)/],
    [{ FUN_CARD_RENDERER_URL: 'http://renderer.example.com' }, /FUN_CARD_RENDERER_URL.*HTTP/],
    [{ FUN_CARD_RENDERER_URL: 'http://localhost:8080' }, /FUN_CARD_RENDERER_URL.*localhost/],
    [{ FUN_CARD_RENDERER_URL: 'https://renderer-xxxxxx.service.tcloudbase.com' }, /FUN_CARD_RENDERER_URL.*占位/],
    [{ FUN_CARD_RENDERER_SERVICE: '' }, /FUN_CARD_RENDERER_SERVICE.*(?:空|未填写)/]
  ];

  for (const [values, expected] of cases) {
    const fixtureRoot = makeFixture(t);
    writeEnv(fixtureRoot, values);
    const result = runCheck(fixtureRoot);
    assert.equal(result.status, 0, combinedOutput(result));
    assert.match(combinedOutput(result), expected);
  }
});

test('release preflight fails closed for placeholder CloudBase and renderer values', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot, {
    CLOUD_ENV_ID: 'wepictool-env-xxx',
    FUN_CARD_RENDERER_SERVICE: '',
    FUN_CARD_RENDERER_URL: 'http://localhost:8080'
  });

  const result = runCheck(fixtureRoot, '--release');

  assert.equal(result.status, 1);
  const output = combinedOutput(result);
  assert.match(output, /发布预检未通过/);
  assert.match(output, /CLOUD_ENV_ID.*占位/);
  assert.match(output, /FUN_CARD_RENDERER_SERVICE.*(?:空|未填写)/);
  assert.match(output, /FUN_CARD_RENDERER_URL.*localhost/);
});

test('release preflight accepts complete production-shaped configuration', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot);

  const result = runCheck(fixtureRoot, '--release');

  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(result.stdout, /发布预检通过/);
});

test('release preflight requires the private renderer production environment declaration', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot);
  for (const mode of ['', 'public']) {
    const result = spawnSync(process.execPath, [checkScript, '--root', fixtureRoot, '--release'], {
      cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, { FUN_CARD_RENDERER_ACCESS_MODE: mode })
    });
    assert.equal(result.status, 1);
    assert.match(combinedOutput(result), /FUN_CARD_RENDERER_ACCESS_MODE/);
  }
});

test('static-only release passes with no renderer URL, service or access declaration', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot, { ENABLE_FUN_TEXT_STACK_ENTRY: false, FUN_CARD_RENDERER_URL: '', FUN_CARD_RENDERER_SERVICE: '' });
  const envPath = path.join(fixtureRoot, 'miniprogram/config/env.js');
  fs.writeFileSync(envPath, fs.readFileSync(envPath, 'utf8')
    .split('\n').filter(line => !line.startsWith('const FUN_CARD_RENDERER_')).join('\n')
    .replace(/module.exports = .*;/, 'module.exports = { CLOUD_ENV_ID, ENABLE_FUN_TEXT_STACK_ENTRY };'));
  const result = spawnSync(process.execPath, [checkScript, '--root', fixtureRoot, '--release'], {
    cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, { FUN_CARD_RENDERER_ACCESS_MODE: '' })
  });
  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(result.stdout, /发布预检通过/);
});

test('release preflight rejects IPv6 and normalized IPv4 loopback font hosts', (t) => {
  const fixtureRoot = makeFixture(t);
  for (const host of ['[::1]', '[0:0:0:0:0:0:0:1]', '[::ffff:127.0.0.1]', '127.0.0.2', '127.1', '2130706433', 'localhost.', 'demo.localhost']) {
    writeEnv(fixtureRoot, { FUN_CARD_RENDERER_URL: `https://${host}:8080` });
    const result = runCheck(fixtureRoot, '--release');
    assert.equal(result.status, 1, host);
    assert.match(combinedOutput(result), /loopback/);
  }
});

test('release preflight rejects non-canonical HTTP renderer URLs after URL parsing', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot, { FUN_CARD_RENDERER_URL: 'http:renderer.wepictool.cn' });

  const result = runCheck(fixtureRoot, '--release');

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(combinedOutput(result), /使用 HTTP/);
});

test('release preflight rejects a non-boolean fun text emergency flag', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot, { ENABLE_FUN_TEXT_STACK_ENTRY: 'false' });

  const result = runCheck(fixtureRoot, '--release');

  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /ENABLE_FUN_TEXT_STACK_ENTRY.*布尔/);
});

test('preflight rejects a main package source tree above the 2 MiB platform limit', (t) => {
  const fixtureRoot = makeFixture(t);
  writeEnv(fixtureRoot);
  fs.writeFileSync(
    path.join(fixtureRoot, 'miniprogram/oversized-main-package.bin'),
    Buffer.alloc(2 * 1024 * 1024)
  );

  const result = runCheck(fixtureRoot);

  assert.equal(result.status, 1);
  assert.match(combinedOutput(result), /主包.*2 MiB/);
});

test('recursive syntax check catches future first-party JS and ignores node_modules', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wepic-syntax-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixtureRoot, 'miniprogram/future'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'miniprogram/node_modules/ignored'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'miniprogram/app.js'), 'App({});\n');
  fs.writeFileSync(path.join(fixtureRoot, 'miniprogram/future/new-module.js'), 'function broken( {\n');
  fs.writeFileSync(path.join(fixtureRoot, 'miniprogram/node_modules/ignored/broken.js'), 'function ignored( {\n');

  const failed = spawnSync(process.execPath, [syntaxScript, '--root', fixtureRoot], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(failed.status, 1);
  assert.match(combinedOutput(failed), /future\/new-module\.js/);
  assert.doesNotMatch(combinedOutput(failed), /node_modules\/ignored/);

  fs.writeFileSync(path.join(fixtureRoot, 'miniprogram/future/new-module.js'), 'module.exports = {};\n');
  const passed = spawnSync(process.execPath, [syntaxScript, '--root', fixtureRoot], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(passed.status, 0, combinedOutput(passed));
});
