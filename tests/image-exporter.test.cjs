'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

test('resolveImagePath handles cloud, https and local paths', async () => {
  let exporter;
  try {
    exporter = loadMiniProgramModule('miniprogram/utils/imageExporter.js');
  } catch (err) {
    assert.match(err.message, /Cannot find module/);
    return;
  }

  const wxApi = {
    cloud: {
      downloadFile(opts) {
        if (opts.fileID === 'cloud://test/a.png') {
          opts.success({ tempFilePath: 'wxfile://tmp_a.png' });
        } else {
          opts.fail(new Error('download cloud failed'));
        }
      }
    },
    downloadFile(opts) {
      if (opts.url === 'https://test.com/b.png') {
        opts.success({ tempFilePath: 'wxfile://tmp_b.png' });
      } else {
        opts.fail(new Error('download http failed'));
      }
    }
  };

  const cloudRes = await exporter.resolveImagePath(wxApi, 'cloud://test/a.png');
  assert.equal(cloudRes, 'wxfile://tmp_a.png');

  const httpRes = await exporter.resolveImagePath(wxApi, 'https://test.com/b.png');
  assert.equal(httpRes, 'wxfile://tmp_b.png');

  const localRes = await exporter.resolveImagePath(wxApi, '/assets/fun-text/demo/01.png');
  assert.equal(localRes, '/assets/fun-text/demo/01.png');
});

test('resolveImagePath rejects a non-2xx HTTP download even when a temp path is returned', async () => {
  const exporter = loadMiniProgramModule('miniprogram/utils/imageExporter.js');
  const wxApi = {
    downloadFile(options) {
      options.success({
        statusCode: 404,
        tempFilePath: 'wxfile://error-response.png'
      });
    }
  };

  await assert.rejects(
    () => exporter.resolveImagePath(wxApi, 'https://test.com/missing.png'),
    (error) => error.code === 'DOWNLOAD_FAILED' && /HTTP 404/.test(error.message)
  );
});

function fakeWxThatFailsAt(failedIndex, saved) {
  let calls = 0;
  return {
    saveImageToPhotosAlbum(options) {
      const current = calls;
      calls += 1;
      if (current === failedIndex) {
        options.fail({ errMsg: 'saveImageToPhotosAlbum:fail test' });
        return;
      }
      saved.push(options.filePath);
      options.success({});
    }
  };
}

test('sequential exporter reports the failed cursor for resume', async () => {
  const exporter = loadMiniProgramModule('miniprogram/utils/imageExporter.js');
  const saved = [];
  const wxApi = fakeWxThatFailsAt(1, saved);

  await assert.rejects(
    () => exporter.saveImagesSequentially(wxApi, ['a.png', 'b.png', 'c.png'], { startIndex: 0 }),
    (error) => error.code === 'SAVE_FAILED' && error.nextIndex === 1 && error.savedCount === 1
  );
  assert.deepEqual(saved, ['a.png']);

  // Resume from index 1 with a healthy wxApi
  const resumeSaved = [];
  const healthyWx = fakeWxThatFailsAt(-1, resumeSaved);
  const result = await exporter.saveImagesSequentially(healthyWx, ['a.png', 'b.png', 'c.png'], { startIndex: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.savedCount, 2);
  assert.deepEqual(resumeSaved, ['b.png', 'c.png']);
});
