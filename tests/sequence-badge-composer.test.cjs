'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadMiniProgramModule, plain } = require('./helpers/miniprogram-loader.cjs');

function loadModules() {
  const exporter = loadMiniProgramModule('miniprogram/utils/imageExporter.js');
  const manifest = loadMiniProgramModule('miniprogram/utils/stackExportManifest.js');
  const composer = loadMiniProgramModule('miniprogram/utils/sequenceBadgeComposer.js', {
    './imageExporter': exporter,
    './stackExportManifest': manifest
  });
  return { exporter, manifest, composer };
}

function recordingCanvas(log) {
  const context = {
    save() { log.push(['save']); },
    restore() { log.push(['restore']); },
    setTransform(...args) { log.push(['setTransform', ...args]); },
    clearRect(...args) { log.push(['clearRect', ...args]); },
    drawImage(...args) { log.push(['drawImage', ...args.slice(1)]); },
    beginPath() { log.push(['beginPath']); },
    moveTo(...args) { log.push(['moveTo', ...args]); },
    lineTo(...args) { log.push(['lineTo', ...args]); },
    quadraticCurveTo(...args) { log.push(['quadraticCurveTo', ...args]); },
    closePath() { log.push(['closePath']); },
    fill() { log.push(['fill']); },
    fillText(...args) { log.push(['fillText', ...args]); }
  };
  return {
    width: 0,
    height: 0,
    getContext() { return context; },
    createImage() {
      const image = {};
      Object.defineProperty(image, 'src', {
        set() { queueMicrotask(() => image.onload && image.onload()); }
      });
      return image;
    }
  };
}

function fakeWx(dimensions, outputs, activity) {
  return {
    getImageInfo(options) {
      activity.push('info:' + options.src);
      const size = dimensions[options.src];
      if (!size) return options.fail(new Error('missing image'));
      options.success({ width: size.width, height: size.height, path: options.src });
    },
    canvasToTempFilePath(options) {
      activity.push('export:' + options.fileType);
      const path = 'wxfile://numbered-' + (outputs.length + 1) + '.' + options.fileType;
      outputs.push({ path, width: options.destWidth, height: options.destHeight, fileType: options.fileType });
      options.success({ tempFilePath: path });
    }
  };
}

test('lays out two-digit badges inside square, portrait and landscape safe areas', () => {
  const { composer } = loadModules();
  [
    [1080, 1080], [1080, 1350], [1600, 900]
  ].forEach(([width, height]) => {
    ['01', '09', '10', '99'].forEach(label => {
      const layout = composer.getSequenceBadgeLayout(width, height, label, 1);
      assert.ok(layout.x >= 0 && layout.y >= 0);
      assert.ok(layout.x + layout.width <= width);
      assert.ok(layout.y + layout.height <= height);
      assert.ok(layout.fontSize >= 20 && layout.fontSize <= 56);
      assert.ok(layout.height >= 36 && layout.height <= 84);
    });
  });
});

test('paints a dark rounded capsule and centered white sequence text', () => {
  const { composer } = loadModules();
  const log = [];
  const canvas = recordingCanvas(log);
  const ctx = canvas.getContext('2d');
  composer.paintSequenceBadge(ctx, composer.getSequenceBadgeLayout(1080, 1080, '01', 1), '01');
  assert.ok(log.some(entry => entry[0] === 'fill'));
  assert.ok(log.some(entry => entry[0] === 'fillText' && entry[1] === '01'));
  assert.deepEqual(log[0], ['save']);
  assert.deepEqual(log.at(-1), ['restore']);
});

test('materializes cards at source dimensions and preserves png versus jpeg output', async () => {
  const { composer } = loadModules();
  const log = [];
  const outputs = [];
  const activity = [];
  const canvas = recordingCanvas(log);
  const wxApi = fakeWx({
    '/asset/a.png': { width: 640, height: 640 },
    '/asset/b.jpg': { width: 800, height: 1000 }
  }, outputs, activity);

  const png = await composer.materializeCard(wxApi, canvas, {
    cardId: 'a', stackId: 'tops', sourceUrl: '/asset/a.png', sequence: 1, sequenceLabel: '01'
  });
  const jpeg = await composer.materializeCard(wxApi, canvas, {
    cardId: 'b', stackId: 'tops', sourceUrl: '/asset/b.jpg', sequence: 2, sequenceLabel: '02'
  });

  assert.deepEqual(plain(outputs), [
    { path: 'wxfile://numbered-1.png', width: 640, height: 640, fileType: 'png' },
    { path: 'wxfile://numbered-2.jpg', width: 800, height: 1000, fileType: 'jpg' }
  ]);
  assert.equal(png.exportUrl, 'wxfile://numbered-1.png');
  assert.equal(jpeg.exportUrl, 'wxfile://numbered-2.jpg');
  assert.ok(log.some(entry => entry[0] === 'drawImage' && entry[3] === 640 && entry[4] === 640));
});

test('materializes a manifest strictly one card at a time without mutating input', async () => {
  const { manifest, composer } = loadModules();
  const input = manifest.buildOutfitManifest('task_1', {
    tops: [1, 2, 3].map(index => ({ resultId: 't' + index, url: '/asset/' + index + '.png' })),
    bottoms: [], shoes: []
  }, '1:1');
  const before = JSON.stringify(input);
  const outputs = [];
  const activity = [];
  const wxApi = fakeWx({
    '/asset/1.png': { width: 100, height: 100 },
    '/asset/2.png': { width: 100, height: 100 },
    '/asset/3.png': { width: 100, height: 100 }
  }, outputs, activity);
  const result = await composer.materializeManifest(wxApi, recordingCanvas([]), input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(activity, [
    'info:/asset/1.png', 'export:png',
    'info:/asset/2.png', 'export:png',
    'info:/asset/3.png', 'export:png'
  ]);
  assert.equal(result.stacks[0].cards[2].exportUrl, 'wxfile://numbered-3.png');
  assert.equal(result.fingerprint, input.fingerprint);
});

test('stops on the failing card and reports its stack sequence', async () => {
  const { manifest, composer } = loadModules();
  const input = manifest.buildOutfitManifest('task_2', {
    tops: [1, 2, 3].map(index => ({ resultId: 't' + index, url: '/asset/' + index + '.png' })),
    bottoms: [], shoes: []
  }, '1:1');
  const outputs = [];
  const activity = [];
  const wxApi = fakeWx({
    '/asset/1.png': { width: 100, height: 100 },
    '/asset/3.png': { width: 100, height: 100 }
  }, outputs, activity);
  await assert.rejects(
    () => composer.materializeManifest(wxApi, recordingCanvas([]), input),
    error => error.code === 'BADGE_COMPOSE_FAILED' && error.stackId === 'tops' && error.sequenceLabel === '02'
  );
  assert.deepEqual(activity, ['info:/asset/1.png', 'export:png', 'info:/asset/2.png']);
});

test('rejects a stale generation before publishing materialized results', async () => {
  const { manifest, composer } = loadModules();
  const input = manifest.buildOutfitManifest('task_3', {
    tops: [1, 2, 3].map(index => ({ resultId: 't' + index, url: '/asset/' + index + '.png' })),
    bottoms: [], shoes: []
  }, '1:1');
  const dimensions = {};
  input.stacks[0].cards.forEach(card => { dimensions[card.sourceUrl] = { width: 100, height: 100 }; });
  await assert.rejects(
    () => composer.materializeManifest(fakeWx(dimensions, [], []), recordingCanvas([]), input, { isCurrent: () => false }),
    error => error.code === 'STALE_EXPORT_GENERATION'
  );
});
