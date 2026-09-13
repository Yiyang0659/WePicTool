const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadFunction(auditResponses) {
  const fileId = 'cloud://test/outfits/source.jpg';
  const files = new Map([[fileId, Buffer.from('source-image')]]);
  let aiCalls = 0;
  const cloud = {
    init() {},
    async downloadFile({ fileID }) {
      if (!files.has(fileID)) throw new Error('FILE_NOT_FOUND');
      return { fileContent: files.get(fileID) };
    },
    async deleteFile({ fileList }) {
      fileList.forEach(id => files.delete(id));
    },
    openapi: { security: { async imgSecCheck() {
      const response = auditResponses.shift();
      if (response instanceof Error) throw response;
      return response;
    } } }
  };
  const axios = { async post() {
    aiCalls++;
    return { data: { choices: [{ message: { content: '{"type":"head","confidence":0.95}' } }] } };
  } };
  const file = path.resolve(__dirname, '../miniprogram/cloudfunctions/processOutfit/index.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, Buffer, setTimeout,
    process: { env: { DASHSCOPE_API_KEY: 'test-key' } },
    console: { log() {}, error() {} },
    require(name) {
      if (name === 'wx-server-sdk') return cloud;
      if (name === 'axios') return axios;
      return require(path.resolve(path.dirname(file), name));
    }
  }, { filename: file });
  return {
    run: () => module.exports.main({ images: [{ imageId: 'source', fileId }] }),
    sourceExists: () => files.has(fileId),
    aiCalls: () => aiCalls
  };
}

for (const failure of [{ errCode: 45009 }, new Error('audit timeout')]) {
  test(`audit outage ${failure.errCode || 'timeout'} retains source for an explicit retry`, async () => {
    const fn = loadFunction([failure, { errCode: 0 }]);
    const blocked = await fn.run();
    assert.equal(blocked.error.code, 'SAFETY_UNAVAILABLE');
    assert.equal(fn.aiCalls(), 0);
    assert.equal(fn.sourceExists(), true);
    const retried = await fn.run();
    assert.equal(retried.status, 'done');
    assert.equal(retried.groups.head.length, 1);
    assert.equal(fn.aiCalls(), 1);
  });
}

test('unsafe image is deleted and never reaches AI', async () => {
  const fn = loadFunction([{ errCode: 87014 }]);
  const blocked = await fn.run();
  assert.equal(blocked.error.code, 'CONTENT_UNSAFE');
  assert.equal(fn.sourceExists(), false);
  assert.equal(fn.aiCalls(), 0);
});
