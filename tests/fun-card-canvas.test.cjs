const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const assets = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
const stylePacks = loadMiniProgramModule('miniprogram/config/stylePacks.js');
const painter = loadMiniProgramModule('miniprogram/utils/scenePainter.js', {
  '../config/assetRegistry': assets,
  '../config/stylePacks': stylePacks
});
const font = loadMiniProgramModule('miniprogram/utils/funTextFont.js');

function recordingContext(operations) {
  return {
    save() { operations.push(['save']); },
    restore() { operations.push(['restore']); },
    scale(x, y) { operations.push(['scale', x, y]); },
    translate(x, y) { operations.push(['translate', x, y]); },
    rotate(value) { operations.push(['rotate', value]); },
    fillRect(x, y, w, h) { operations.push(['fillRect', x, y, w, h]); },
    fillText(text, x, y) { operations.push(['fillText', text, x, y]); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {}
  };
}

function fixtureScene() {
  return {
    sceneId: 'scene_1', order: 1, width: 1080, height: 1080,
    background: { color: '#FCE4EC', assetKey: 'pink-note-01' },
    layers: [
      {
        id: 'text_main', type: 'text', text: '我今天', lines: ['我今天'],
        effectKey: 'marker-bold', fontFamily: 'LXGWMarkerGothic', fontSize: 220,
        lineHeight: 250, x: 540, y: 520, rotation: 0, scale: 1,
        color: '#171717', align: 'center'
      },
      { id: 'sticker_1', type: 'sticker', assetKey: 'sticker_0', x: 820, y: 180, rotation: 0, scale: 1 }
    ]
  };
}

function loadComponent(dependencies) {
  const filePath = path.join(__dirname, '..', 'miniprogram/components/fun-card-canvas/fun-card-canvas.js');
  const code = fs.readFileSync(filePath, 'utf8');
  let definition = null;
  vm.runInNewContext(code, {
    Component(value) { definition = value; },
    require(request) {
      if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
      return require(request);
    },
    wx: {},
    Promise,
    console
  }, { filename: filePath });
  return definition;
}

test('paints background before ordered layers at preview scale', () => {
  const operations = [];
  const ctx = recordingContext(operations);
  painter.paintScene(ctx, fixtureScene(), 360, {
    drawAsset(context, layer) { operations.push(['sticker', layer.assetKey]); }
  });

  const background = operations.findIndex((operation) => operation[0] === 'fillRect');
  const text = operations.findIndex((operation) => operation[0] === 'fillText' && operation[1] === '我今天');
  const sticker = operations.findIndex((operation) => operation[0] === 'sticker');

  assert.equal(background, 0);
  assert.ok(text > background);
  assert.ok(sticker > text);
  const textPosition = operations.find((operation) => operation[0] === 'translate');
  assert.equal(textPosition[1], 180);
  assert.ok(Math.abs(textPosition[2] - (520 / 3)) < 0.000001);
});

test('does not send asset drawing requests for keys outside the registry', () => {
  const operations = [];
  const scene = fixtureScene();
  scene.layers[1].assetKey = 'not-registered';

  painter.paintScene(recordingContext(operations), scene, 360, {
    drawAsset(context, layer) { operations.push(['asset', layer.assetKey]); }
  });

  assert.equal(operations.some((operation) => operation[0] === 'asset'), false);
});

test('font loader rejects when the renderer URL is absent without asking wx to load a font', async () => {
  let calls = 0;
  await assert.rejects(() => font.loadFunTextFont({
    loadFontFace() { calls += 1; }
  }, ''), /手写预览服务尚未配置/);
  assert.equal(calls, 0);
});

test('font loader asks wx to load the licensed font from the renderer URL', async () => {
  let request;
  await font.loadFunTextFont({
    loadFontFace(options) {
      request = options;
      options.success();
    }
  }, 'https://renderer.example/');

  assert.equal(request.global, true);
  assert.equal(request.family, 'LXGWMarkerGothic');
  assert.equal(request.source, 'url("https://renderer.example/font/LXGWMarkerGothic-Regular.ttf")');
  assert.equal(typeof request.success, 'function');
  assert.equal(typeof request.fail, 'function');
});

test('component reports a font loading failure instead of attempting canvas painting', async () => {
  let paintCalls = 0;
  const component = loadComponent({
    '../../utils/funTextFont': { loadFunTextFont: () => Promise.reject(new Error('字体不可用')) },
    '../../utils/scenePainter': { paintScene() { paintCalls += 1; } },
    '../../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.example' }
  });
  const events = [];
  const instance = {
    properties: { scene: fixtureScene(), size: 360, revision: 0 },
    triggerEvent(name, detail) { events.push([name, detail]); }
  };
  Object.assign(instance, component.methods);

  component.lifetimes.attached.call(instance);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(JSON.parse(JSON.stringify(events)), [['rendererror', { message: '字体不可用' }]]);
  assert.equal(paintCalls, 0);
});

test('canvas component declares its data inputs and a 2d canvas without system font fallbacks', () => {
  const component = loadComponent({
    '../../utils/funTextFont': { loadFunTextFont: () => Promise.resolve() },
    '../../utils/scenePainter': { paintScene() {} },
    '../../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.example' }
  });
  const componentPath = path.join(__dirname, '..', 'miniprogram/components/fun-card-canvas');
  const wxml = fs.readFileSync(path.join(componentPath, 'fun-card-canvas.wxml'), 'utf8');
  const source = [
    fs.readFileSync(path.join(componentPath, 'fun-card-canvas.js'), 'utf8'),
    wxml,
    fs.readFileSync(path.join(componentPath, 'fun-card-canvas.wxss'), 'utf8')
  ].join('\n');

  assert.deepEqual(Object.keys(component.properties).sort(), ['revision', 'scene', 'size']);
  assert.match(wxml, /<canvas[^>]*type=["']2d["']/);
  assert.doesNotMatch(source, /(sans-serif|system-ui|Arial|Helvetica|serif)/i);
});
