const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'miniprogram/cloudhosting/text-card-renderer/server.js');
const rendererServer = fs.existsSync(serverPath) ? require(serverPath) : {};
const rendererPath = path.join(__dirname, '..', 'miniprogram/cloudhosting/text-card-renderer/renderer.js');
const rendererModule = fs.existsSync(rendererPath) ? require(rendererPath) : {};

test('renderer rejects unsafe content before drawing cards', async () => {
  assert.equal(typeof rendererServer.createRenderHandler, 'function');
  const handler = rendererServer.createRenderHandler({
    checkContent: async () => ({ ok: false, code: 'CONTENT_UNSAFE' }),
    renderCards: async () => { throw new Error('cards must not render'); }
  });

  const response = await handler({ sourceText: '测试', themeKey: 'handwrite-paper' });
  assert.deepEqual(response, {
    statusCode: 403,
    body: { ok: false, code: 'CONTENT_UNSAFE' }
  });
});

test('renderer returns an all-or-nothing ordered stack for safe text', async () => {
  const handler = rendererServer.createRenderHandler({
    checkContent: async () => ({ ok: true, code: 'OK' }),
    renderCards: async (specs) => specs.map((spec) => Object.assign({}, spec, {
      cardId: `card_${spec.order}`,
      fileId: `cloud://${spec.order}.png`,
      url: `https://example.test/${spec.order}.png`
    }))
  });

  const response = await handler({ sourceText: '生日', themeKey: 'missing' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.cards.map((card) => [card.text, card.order, card.role]), [
    ['生', 1, 'content'],
    ['日', 2, 'content'],
    ['继续滑 →', 3, 'outro']
  ]);
  assert.equal(response.body.themeKey, 'handwrite-paper');
});

test('renderer maps an unavailable audit service to a retryable response', async () => {
  const handler = rendererServer.createRenderHandler({
    checkContent: async () => ({ ok: false, code: 'SAFETY_UNAVAILABLE' }),
    renderCards: async () => []
  });
  const response = await handler({ sourceText: '测试', themeKey: 'handwrite-paper' });
  assert.deepEqual(response, {
    statusCode: 503,
    body: { ok: false, code: 'SAFETY_UNAVAILABLE' }
  });
});

test('renderer keeps a valid client task id in its response and render call', async () => {
  let seenTaskId = '';
  const handler = rendererServer.createRenderHandler({
    checkContent: async () => ({ ok: true, code: 'OK' }),
    renderCards: async (specs, theme, taskId) => {
      seenTaskId = taskId;
      return specs.map((spec) => Object.assign({}, spec, {
        cardId: `card_${spec.order}`,
        fileId: `cloud://${spec.order}.png`,
        url: `https://example.test/${spec.order}.png`
      }));
    }
  });

  const response = await handler({
    taskId: 'text_20260726_abcdef', sourceText: '今', themeKey: 'handwrite-paper'
  });
  assert.equal(seenTaskId, 'text_20260726_abcdef');
  assert.equal(response.body.taskId, 'text_20260726_abcdef');
});

test('card uploads roll back earlier files if a later upload fails', async () => {
  assert.equal(typeof rendererModule.createCardRenderer, 'function');
  const deleted = [];
  const renderCards = rendererModule.createCardRenderer({
    makePng: (spec) => Buffer.from(spec.text),
    uploadBuffer: async (buffer, spec) => {
      if (spec.order === 2) throw new Error('storage failed');
      return { fileId: `cloud://${spec.order}.png`, url: `https://example.test/${spec.order}.png` };
    },
    deleteFile: async (fileId) => { deleted.push(fileId); }
  });

  await assert.rejects(() => renderCards([
    { text: '生', role: 'content', order: 1 },
    { text: '日', role: 'content', order: 2 }
  ], { key: 'handwrite-paper' }), /storage failed/);
  assert.deepEqual(deleted, ['cloud://1.png']);
});

test('card renderer gives every PNG and upload call the stable task id', async () => {
  const pngTaskIds = [];
  const uploadTaskIds = [];
  const renderCards = rendererModule.createCardRenderer({
    makePng: async (spec, theme, taskId) => {
      pngTaskIds.push(`${taskId}:${spec.order}`);
      return Buffer.from(spec.text);
    },
    uploadBuffer: async (buffer, spec, taskId) => {
      uploadTaskIds.push(`${taskId}:${spec.order}`);
      return { fileId: `cloud://${spec.order}.png`, url: `https://example.test/${spec.order}.png` };
    },
    deleteFile: async () => undefined
  });

  await renderCards([
    { text: '今', role: 'content', order: 1 },
    { text: '心', role: 'content', order: 2 }
  ], { key: 'handwrite-paper' }, 'text_20260726_abcdef');

  assert.deepEqual(pngTaskIds, ['text_20260726_abcdef:1', 'text_20260726_abcdef:2']);
  assert.deepEqual(uploadTaskIds, ['text_20260726_abcdef:1', 'text_20260726_abcdef:2']);
});

test('marker PNG maker is stable per task and varies card layout across tasks', async () => {
  assert.equal(typeof rendererModule.createMarkerPngMaker, 'function');
  const makePng = rendererModule.createMarkerPngMaker();
  const spec = { text: '今', role: 'content', order: 1, total: 4 };
  const theme = { key: 'handwrite-paper', background: '#FFFFFF', foreground: '#171717', accent: '#171717' };
  const sameFirst = await makePng(spec, theme, 'text_20260726_abcdef');
  const sameSecond = await makePng(spec, theme, 'text_20260726_abcdef');
  const different = await makePng(spec, theme, 'text_20260726_uvwxyz');

  assert.equal(sameFirst.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual(sameFirst, sameSecond);
  assert.notDeepEqual(sameFirst, different);
});
