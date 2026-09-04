'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

function loadExporter() {
  const manifest = loadMiniProgramModule('miniprogram/utils/stackExportManifest.js');
  return loadMiniProgramModule('miniprogram/utils/imageExporter.js', {
    './stackExportManifest': manifest
  });
}

test('resolveImagePath handles cloud, https and local paths', async () => {
  let exporter;
  try {
    exporter = loadExporter();
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
  const exporter = loadExporter();
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
  const exporter = loadExporter();
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

function materializedManifest(exporterModule) {
  const manifestModule = loadMiniProgramModule('miniprogram/utils/stackExportManifest.js');
  const manifest = manifestModule.buildDressupManifest({
    projectId: 'layered_save', ratio: '4:5', groups: {
      head: [1, 2, 3].map(index => ({ id: 'h' + index, url: '/h' + index + '.png' })),
      tops: [1, 2, 3].map(index => ({ id: 't' + index, url: '/t' + index + '.png' })),
      bottoms: [], shoes: []
    }
  }, [
    { key: 'head', title: '头像' }, { key: 'tops', title: '上衣' },
    { key: 'bottoms', title: '下装' }, { key: 'shoes', title: '鞋子' }
  ]);
  manifest.stacks.forEach(stack => stack.cards.forEach(card => {
    card.exportUrl = 'wxfile://' + card.cardId + '-numbered.png';
  }));
  return manifest;
}

test('saveExportManifest saves materialized stacks in manifest order with rich progress', async () => {
  const exporter = loadExporter();
  const manifest = materializedManifest(exporter);
  const saved = [];
  const progress = [];
  const result = await exporter.saveExportManifest(fakeWxThatFailsAt(-1, saved), manifest, {
    stackIds: ['tops', 'head'],
    expectedFingerprint: manifest.fingerprint,
    onProgress(entry, current, total) {
      progress.push([entry.stackId, entry.sequenceLabel, current, total]);
    }
  });
  assert.deepEqual(saved, [
    'wxfile://h1-numbered.png', 'wxfile://h2-numbered.png', 'wxfile://h3-numbered.png',
    'wxfile://t1-numbered.png', 'wxfile://t2-numbered.png', 'wxfile://t3-numbered.png'
  ]);
  assert.deepEqual(progress[0], ['head', '01', 1, 6]);
  assert.equal(result.savedCount, 6);
  assert.equal(result.manifestFingerprint, manifest.fingerprint);
});

test('saveExportManifest rejects stale sessions and missing materialized urls before saving', async () => {
  const exporter = loadExporter();
  const manifest = materializedManifest(exporter);
  let calls = 0;
  const wxApi = { saveImageToPhotosAlbum() { calls += 1; } };
  await assert.rejects(
    () => exporter.saveExportManifest(wxApi, manifest, { expectedFingerprint: 'stale' }),
    error => error.code === 'STALE_EXPORT_SESSION'
  );
  manifest.stacks[0].cards[1].exportUrl = '';
  await assert.rejects(
    () => exporter.saveExportManifest(wxApi, manifest, { expectedFingerprint: manifest.fingerprint }),
    error => error.code === 'EXPORT_NOT_READY' && error.stackId === 'head' && error.sequenceLabel === '02'
  );
  assert.equal(calls, 0);
});

test('saveExportManifest reports stack sequence and resumes without duplicate saves', async () => {
  const exporter = loadExporter();
  const manifest = materializedManifest(exporter);
  const firstSaved = [];
  await assert.rejects(
    () => exporter.saveExportManifest(fakeWxThatFailsAt(2, firstSaved), manifest, {
      expectedFingerprint: manifest.fingerprint
    }),
    error => error.code === 'SAVE_FAILED'
      && error.nextIndex === 2
      && error.savedCount === 2
      && error.stackId === 'head'
      && error.sequenceLabel === '03'
      && error.manifestFingerprint === manifest.fingerprint
  );
  assert.deepEqual(firstSaved, ['wxfile://h1-numbered.png', 'wxfile://h2-numbered.png']);

  const resumed = [];
  await exporter.saveExportManifest(fakeWxThatFailsAt(-1, resumed), manifest, {
    startIndex: 2,
    expectedFingerprint: manifest.fingerprint
  });
  assert.deepEqual(resumed, [
    'wxfile://h3-numbered.png',
    'wxfile://t1-numbered.png', 'wxfile://t2-numbered.png', 'wxfile://t3-numbered.png'
  ]);
});
