const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const {
  assessSecurityResponse,
  inferImageMimeType,
  mapWithConcurrency
} = require(path.join(__dirname, '..', 'miniprogram/cloudfunctions/processOutfit/contentSafety.js'));
const root = path.join(__dirname, '..');

test('maps WeChat security responses to stable product codes', () => {
  assert.deepEqual(plain(assessSecurityResponse({ errCode: 0 })), { ok: true, code: 'OK' });
  assert.deepEqual(plain(assessSecurityResponse({ errCode: 87014 })), { ok: false, code: 'CONTENT_UNSAFE' });
  assert.deepEqual(plain(assessSecurityResponse({ errCode: 44991 })), { ok: false, code: 'SAFETY_UNAVAILABLE' });
  assert.deepEqual(plain(assessSecurityResponse(null)), { ok: false, code: 'SAFETY_UNAVAILABLE' });
});

test('infers an allowed image MIME type from the cloud file name', () => {
  assert.equal(inferImageMimeType('cloud://demo/outfit.png'), 'image/png');
  assert.equal(inferImageMimeType('cloud://demo/outfit.webp'), 'image/webp');
  assert.equal(inferImageMimeType('cloud://demo/outfit.unknown'), 'image/jpeg');
});

test('limits image audit work to two concurrent calls and preserves order', async () => {
  let active = 0;
  let peak = 0;
  const output = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
    return item * 2;
  });

  assert.equal(peak, 2);
  assert.deepEqual(plain(output), [2, 4, 6, 8, 10]);
});

test('processOutfit declares image safety permission and gates AI after auditing images', () => {
  const source = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/processOutfit/index.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/processOutfit/config.json'), 'utf8');
  assert.match(config, /security\.imgSecCheck/);
  assert.ok(source.indexOf('await auditImages(normalizedImages)') < source.indexOf('await classifyImages(normalizedImages, apiKey)'));
});

test('feedback and image processing route unsafe responses through cloud content checks', () => {
  const guard = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/contentGuard/index.js'), 'utf8');
  const guardConfig = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/contentGuard/config.json'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8');
  const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  assert.match(guard, /cloud\.openapi\.security\.msgSecCheck/);
  assert.match(guardConfig, /security\.msgSecCheck/);
  assert.doesNotMatch(guard, /require\(['"]\.\.\/processOutfit/);
  assert.match(profile, /name:\s*'contentGuard'/);
  assert.match(index, /CONTENT_UNSAFE/);
  assert.match(packageJson, /cloudfunctions\/contentGuard\/index\.js/);
  assert.match(packageJson, /cloudfunctions\/processOutfit\/contentSafety\.js/);
});
