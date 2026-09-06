const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const assets = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
const stylePacks = loadMiniProgramModule('miniprogram/config/stylePacks.js');
const fontFeels = loadMiniProgramModule('miniprogram/config/fontFeels.js');
const painter = loadMiniProgramModule('miniprogram/utils/scenePainter.js', {
  '../config/assetRegistry': assets,
  '../config/stylePacks': stylePacks,
  '../config/fontFeels': fontFeels
});
const font = loadMiniProgramModule('miniprogram/utils/funTextFont.js', {
  '../config/fontFeels': fontFeels
});

function recordingContext(operations) {
  return {
    save() { operations.push(['save']); },
    restore() { operations.push(['restore']); },
    scale(x, y) { operations.push(['scale', x, y]); },
    translate(x, y) { operations.push(['translate', x, y]); },
    rotate(value) { operations.push(['rotate', value]); },
    fillRect(x, y, w, h) { operations.push(['fillRect', x, y, w, h]); },
    fillText(text, x, y) { operations.push(['fillText', text, x, y]); },
    strokeText(text, x, y) { operations.push(['strokeText', text, x, y]); },
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
    fontFeelKey: 'marker',
    background: { color: '#FCE4EC', assetKey: 'pink-note-01' },
    layers: [
      {
        id: 'text_main', type: 'text', text: '我今天', lines: ['我今天'],
        effectKey: 'marker-bold', fontKey: 'marker', fontFamily: 'LXGWMarkerGothic', fontSize: 220,
        lineHeight: 250, x: 540, y: 520, rotation: 0, scale: 1,
        color: '#171717', align: 'center'
      },
      { id: 'sticker_1', type: 'sticker', assetKey: 'sticker_0', x: 820, y: 180, rotation: 0, scale: 1 }
    ]
  };
}

function loadComponent(dependencies, wxApi = {}) {
  const filePath = path.join(__dirname, '..', 'miniprogram/components/fun-card-canvas/fun-card-canvas.js');
  const code = fs.readFileSync(filePath, 'utf8');
  let definition = null;
  vm.runInNewContext(code, {
    Component(value) { definition = value; },
    require(request) {
      if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
      return require(request);
    },
    wx: wxApi,
    Promise,
    console
  }, { filename: filePath });
  return definition;
}

function recipeContext(operations) {
  return {
    save() { operations.push(['save']); },
    restore() { operations.push(['restore']); },
    scale(x, y) { operations.push(['scale', x, y]); },
    translate(x, y) { operations.push(['translate', x, y]); },
    rotate(value) { operations.push(['rotate', value]); },
    fillRect(x, y, w, h) { operations.push(['fillRect', x, y, w, h]); },
    fillText(text, x, y) { operations.push(['fillText', text, x, y]); },
    strokeText(text, x, y) { operations.push(['strokeText', text, x, y]); },
    beginPath() { operations.push(['beginPath']); },
    moveTo(x, y) { operations.push(['moveTo', x, y]); },
    lineTo(x, y) { operations.push(['lineTo', x, y]); },
    bezierCurveTo() { operations.push(['bezierCurveTo']); },
    quadraticCurveTo() { operations.push(['quadraticCurveTo']); },
    arc() { operations.push(['arc']); },
    closePath() { operations.push(['closePath']); },
    fill() { operations.push(['fill']); },
    stroke() { operations.push(['stroke']); },
    set fillStyle(value) { operations.push(['fillStyle', value]); },
    set strokeStyle(value) { operations.push(['strokeStyle', value]); },
    set lineWidth(value) { operations.push(['lineWidth', value]); },
    set font(value) { operations.push(['font', value]); },
    set textAlign(value) { operations.push(['textAlign', value]); },
    set textBaseline(value) { operations.push(['textBaseline', value]); }
  };
}

function visualSignature(operations, startAt) {
  return operations.slice(startAt).filter((operation) => [
    'fillRect', 'fillText', 'strokeText', 'beginPath', 'moveTo', 'lineTo',
    'bezierCurveTo', 'quadraticCurveTo', 'arc', 'closePath', 'fill', 'stroke'
  ].includes(operation[0])).map((operation) => operation[0]).join('>');
}

function sceneWithOneLayer(layer) {
  const scene = fixtureScene();
  scene.layers = [layer];
  return scene;
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

test('uses four deterministic and visibly distinct registered text effect recipes', () => {
  const expectedSignatures = {
    'marker-bold': 'strokeText>fillText',
    'chalk-rough': 'fillText>fillText>fillText',
    'collage-cutout': 'fillRect>fillText',
    'stamp-shadow': 'fillText>fillText'
  };
  const signatures = {};

  Object.entries(expectedSignatures).forEach(([effectKey, expected]) => {
    const operations = [];
    const layer = fixtureScene().layers[0];
    layer.effectKey = effectKey;
    painter.paintScene(recipeContext(operations), sceneWithOneLayer(layer), 1080);
    const textStart = operations.findIndex((operation) => operation[0] === 'translate');
    signatures[effectKey] = visualSignature(operations, textStart + 1);
    assert.equal(signatures[effectKey], expected);
  });

  assert.equal(new Set(Object.values(signatures)).size, 4);
});

test('rejects an unregistered text effect without drawing its text', () => {
  const operations = [];
  const layer = fixtureScene().layers[0];
  layer.effectKey = 'not-registered';

  painter.paintScene(recipeContext(operations), sceneWithOneLayer(layer), 1080);

  assert.equal(operations.some((operation) => operation[0] === 'fillText' || operation[0] === 'strokeText'), false);
});

test('uses a deterministic, distinct production recipe for every registered sticker', () => {
  const expectedSignatures = {
    sticker_0: 'beginPath>moveTo>bezierCurveTo>bezierCurveTo>closePath>fill',
    sticker_1: 'beginPath>arc>arc>arc>arc>arc>fill',
    sticker_2: 'beginPath>moveTo>lineTo>lineTo>lineTo>lineTo>lineTo>lineTo>lineTo>lineTo>lineTo>closePath>fill',
    sticker_3: 'beginPath>arc>fill>beginPath>arc>arc>stroke',
    sticker_4: 'beginPath>moveTo>lineTo>lineTo>lineTo>lineTo>lineTo>lineTo>lineTo>closePath>fill',
    sticker_5: 'beginPath>moveTo>lineTo>lineTo>lineTo>closePath>fill>beginPath>moveTo>lineTo>stroke',
    sticker_6: 'beginPath>moveTo>lineTo>lineTo>lineTo>lineTo>closePath>fill',
    sticker_7: 'beginPath>arc>arc>arc>fill',
    sticker_8: 'beginPath>moveTo>lineTo>stroke>beginPath>arc>fill',
    sticker_9: 'beginPath>arc>fill>beginPath>moveTo>lineTo>moveTo>lineTo>moveTo>lineTo>moveTo>lineTo>stroke',
    sticker_10: 'beginPath>bezierCurveTo>bezierCurveTo>closePath>fill>beginPath>moveTo>lineTo>stroke',
    sticker_11: 'fillRect>fillRect>fillRect>fillRect>beginPath>moveTo>lineTo>lineTo>closePath>fill'
  };
  const signatures = {};

  Object.entries(expectedSignatures).forEach(([assetKey, expected]) => {
    const operations = [];
    painter.paintScene(recipeContext(operations), sceneWithOneLayer({
      id: assetKey, type: 'sticker', assetKey, x: 540, y: 540, rotation: 0, scale: 1
    }), 1080);
    const assetStart = operations.findIndex((operation) => operation[0] === 'translate');
    signatures[assetKey] = visualSignature(operations, assetStart + 1);
    assert.equal(signatures[assetKey], expected);
  });

  assert.equal(new Set(Object.values(signatures)).size, 12);
});

test('font loader rejects when the renderer URL is absent without asking wx to load a font', async () => {
  font.resetFontLoadCache();
  let calls = 0;
  await assert.rejects(() => font.loadFunTextFont({
    loadFontFace() { calls += 1; }
  }, ''), /字画预览服务尚未配置/);
  assert.equal(calls, 0);
});

test('font loader asks wx to load the licensed font from the renderer URL', async () => {
  font.resetFontLoadCache();
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

test('font loader selects the requested licensed font and rejects unknown keys', async () => {
  font.resetFontLoadCache();
  let request;
  await font.loadFunTextFont({
    loadFontFace(options) { request = options; options.success(); }
  }, 'https://renderer.example', 'headline');
  assert.equal(request.family, 'MaShanZheng');
  assert.equal(request.source, 'url("https://renderer.example/font/MaShanZheng-Regular.ttf")');
  await assert.rejects(() => font.loadFunTextFont({ loadFontFace() {} }, 'https://renderer.example', 'unknown'), /未知字感/);
});

test('component reports an unavailable font without drawing a false fallback', async () => {
  let paintCalls = 0;
  const wxApi = {
    getSystemInfoSync() { return { pixelRatio: 1 }; },
    createSelectorQuery() {
      return {
        in() { return this; },
        select() { return this; },
        fields() { return this; },
        exec(cb) { cb([{ node: { width: 0, height: 0, getContext: () => ({ scale() {} }) } }]); }
      };
    }
  };
  const component = loadComponent({
    '../../utils/funTextFont': { loadFunTextFont: () => Promise.reject(new Error('字体不可用')) },
    '../../utils/scenePainter': { paintScene() { paintCalls += 1; } },
    '../../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.example' }
  }, wxApi);
  const events = [];
  const instance = {
    properties: { scene: fixtureScene(), size: 360, revision: 0 },
    triggerEvent(name, detail) { events.push([name, detail]); }
  };
  Object.assign(instance, component.methods);

  component.lifetimes.attached.call(instance);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(paintCalls, 0);
  assert.equal(events.filter(([name]) => name === 'fontunavailable').length, 1);
});

test('component paints at DPR dimensions, emits ready, and repaints after revision changes', async () => {
  const operations = [];
  const context = recipeContext(operations);
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      assert.equal(type, '2d');
      return context;
    }
  };
  let queries = 0;
  const wxApi = {
    getSystemInfoSync() { return { pixelRatio: 2 }; },
    createSelectorQuery() {
      return {
        in(component) { assert.ok(component); return this; },
        select(selector) { assert.equal(selector, '#cardCanvas'); return this; },
        fields(options) { assert.deepEqual(JSON.parse(JSON.stringify(options)), { node: true, size: true }); return this; },
        exec(callback) { queries += 1; callback([{ node: canvas, width: 360, height: 360 }]); }
      };
    }
  };
  const component = loadComponent({
    '../../utils/funTextFont': { loadFunTextFont: () => Promise.resolve() },
    '../../utils/scenePainter': painter,
    '../../config/env': { FUN_CARD_RENDERER_URL: 'https://renderer.example' }
  }, wxApi);
  const events = [];
  const instance = {
    properties: { scene: fixtureScene(), size: 360, revision: 0 },
    triggerEvent(name, detail) { events.push([name, detail]); }
  };
  Object.assign(instance, component.methods);

  component.lifetimes.attached.call(instance);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(instance._readyFontKey, 'marker');
  assert.equal(canvas.width, 720);
  assert.equal(canvas.height, 720);
  assert.deepEqual(operations[0], ['scale', 2, 2]);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [['ready', { sceneId: 'scene_1' }]]);
  assert.equal(operations.filter((operation) => operation[0] === 'fillRect').length, 1);

  instance.properties.revision = 1;
  component.observers['scene, size, revision'].call(instance);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(queries, 2);
  assert.equal(operations.filter((operation) => operation[0] === 'fillRect').length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ['ready', { sceneId: 'scene_1' }],
    ['ready', { sceneId: 'scene_1' }]
  ]);
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
