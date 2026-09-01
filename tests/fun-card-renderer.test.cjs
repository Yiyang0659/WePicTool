const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const serviceRoot = path.join(
  __dirname,
  '..',
  'miniprogram',
  'cloudhosting',
  'fun-card-renderer'
);
const server = require(path.join(serviceRoot, 'server.js'));
const validator = require(path.join(serviceRoot, 'sceneValidator.js'));
const renderer = require(path.join(serviceRoot, 'renderer.js'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function textLayer(text) {
  return {
    id: 'text_main',
    type: 'text',
    text,
    lines: [text],
    effectKey: 'marker-bold',
    fontSize: 180,
    lineHeight: 210,
    x: 540,
    y: 520,
    rotation: 0,
    scale: 1,
    color: '#171717',
    align: 'center'
  };
}

function validPayload() {
  return {
    projectId: 'funtext_1000',
    candidateId: 'candidate_hard_turn_123',
    sourceText: '我今天想见你',
    stylePackId: 'pink-note-v1',
    scenes: [1, 2, 3].map((order) => ({
      sceneId: 'scene_' + order,
      order,
      width: 1080,
      height: 1080,
      background: { assetKey: 'pink-note-01', color: '#FCE4EC' },
      layers: [textLayer(order === 3 ? '我今天想见你' : '再滑一下')]
    }))
  };
}

function validPreviewPayload() {
  const base = validPayload();
  return {
    projectId: base.projectId,
    sourceText: base.sourceText,
    candidates: [
      ['candidate_hard_turn_123', 'pink-note-v1'],
      ['candidate_suspense_reveal_456', 'chalk-chaos-v1'],
      ['candidate_fake_checklist_789', 'paper-collage-v1']
    ].map(([candidateId, stylePackId], candidateIndex) => {
      const backgrounds = {
        'pink-note-v1': { assetKey: 'pink-note-01', color: '#FCE4EC' },
        'chalk-chaos-v1': { assetKey: 'chalk-board-01', color: '#24303A' },
        'paper-collage-v1': { assetKey: 'paper-collage-01', color: '#F4EAD7' }
      };
      return {
        candidateId,
        stylePackId,
        scenes: base.scenes.map((scene) => Object.assign({}, clone(scene), {
          sceneId: 'scene_' + (candidateIndex + 1) + '_' + scene.order,
          background: clone(backgrounds[stylePackId])
        }))
      };
    })
  };
}

function renderedCards(scenes, prefix) {
  return scenes.map((scene) => ({
    sceneId: scene.sceneId,
    order: scene.order,
    fileId: prefix + '_file_' + scene.order,
    url: 'cloud://' + prefix + '/' + scene.order + '.png'
  }));
}

function pngDimensions(buffer) {
  assert.deepEqual(Array.from(buffer.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function request(baseUrl, route, options) {
  const response = await fetch(baseUrl + route, options);
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  };
}

test('server whitelist sets exactly match the client asset and effect registries', () => {
  const clientAssets = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
  const clientStyles = loadMiniProgramModule('miniprogram/config/stylePacks.js');

  assert.deepEqual(
    [...validator.SUPPORTED_ASSET_KEYS].sort(),
    Array.from(clientAssets.ASSETS, (asset) => asset.key).sort()
  );
  assert.deepEqual(
    [...validator.SUPPORTED_EFFECT_KEYS].sort(),
    Array.from(clientStyles.TEXT_EFFECT_KEYS).sort()
  );
});

test('rejects an invalid stack before audit or drawing', async () => {
  let audited = false;
  let rendered = false;
  const handler = server.createRenderStackHandler({
    checkContent: async () => { audited = true; return { ok: true }; },
    renderScenes: async () => { rendered = true; return []; }
  });

  const response = await handler({ projectId: 'bad', scenes: [] }, { preview: false });

  assert.deepEqual(response, { statusCode: 400, body: { ok: false, code: 'INVALID_REQUEST' } });
  assert.equal(audited, false);
  assert.equal(rendered, false);
});

test('rejects malformed, over-layered, or unregistered scenes', () => {
  const mutations = [
    ['non-square dimensions', (payload) => { payload.scenes[0].width = 360; }],
    ['non-contiguous order', (payload) => { payload.scenes[1].order = 3; }],
    ['duplicate scene ID', (payload) => { payload.scenes[1].sceneId = payload.scenes[0].sceneId; }],
    ['unknown style pack', (payload) => { payload.stylePackId = 'unknown-pack'; }],
    ['missing background asset', (payload) => { delete payload.scenes[0].background.assetKey; }],
    ['unknown background asset', (payload) => { payload.scenes[0].background.assetKey = 'unknown-background'; }],
    ['background from another style pack', (payload) => {
      payload.scenes[0].background.assetKey = 'chalk-board-01';
    }],
    ['unsupported background form', (payload) => {
      payload.scenes[0].background.imageUrl = 'https://example.test/background.png';
    }],
    ['missing effect', (payload) => { delete payload.scenes[0].layers[0].effectKey; }],
    ['unknown effect', (payload) => { payload.scenes[0].layers[0].effectKey = 'unknown-effect'; }],
    ['unknown asset', (payload) => {
      payload.scenes[0].layers.push({
        id: 'bad_asset', type: 'sticker', assetKey: 'unknown-asset',
        x: 10, y: 10, rotation: 0, scale: 1
      });
    }],
    ['too many decorations', (payload) => {
      for (let index = 0; index < 7; index += 1) {
        payload.scenes[0].layers.push({
          id: 'sticker_extra_' + index, type: 'sticker', assetKey: 'sticker_0',
          x: 50 + index, y: 50 + index, rotation: 0, scale: 1
        });
      }
    }]
  ];

  mutations.forEach(([name, mutate]) => {
    const payload = validPayload();
    mutate(payload);
    assert.equal(validator.validateRenderPayload(payload).valid, false, name);
  });
});

test('audits all visible text once before rendering and ignores an audit bypass option', async () => {
  const calls = [];
  let rendered = false;
  const handler = server.createRenderStackHandler({
    checkContent: async (text) => { calls.push(text); return { ok: false, code: 'CONTENT_UNSAFE' }; },
    renderScenes: async () => { rendered = true; throw new Error('must not render'); }
  });

  const response = await handler(validPayload(), { skipAudit: true, preview: false });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /我今天想见你/);
  assert.match(calls[0], /再滑一下/);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { ok: false, code: 'CONTENT_UNSAFE' });
  assert.equal(rendered, false);
});

test('fails closed when content safety is unavailable', async () => {
  const outcomes = [
    async () => ({ ok: false, code: 'SAFETY_UNAVAILABLE' }),
    async () => { throw new Error('network unavailable'); }
  ];

  for (const checkContent of outcomes) {
    let rendered = false;
    const handler = server.createRenderStackHandler({
      checkContent,
      renderScenes: async () => { rendered = true; return []; }
    });
    const response = await handler(validPayload());
    assert.deepEqual(response, { statusCode: 503, body: { ok: false, code: 'SAFETY_UNAVAILABLE' } });
    assert.equal(rendered, false);
  }
});

test('maps only the official unsafe errCode to 403 and treats other audit failures as unavailable', async () => {
  assert.equal(typeof server.createContentChecker, 'function');
  const cases = [
    [{ errCode: 87014 }, 403, 'CONTENT_UNSAFE'],
    [{ errCode: 44991 }, 503, 'SAFETY_UNAVAILABLE'],
    [{ errCode: 40001 }, 503, 'SAFETY_UNAVAILABLE'],
    [null, 503, 'SAFETY_UNAVAILABLE']
  ];

  for (const [auditResponse, statusCode, code] of cases) {
    const checkContent = server.createContentChecker(async ({ content }) => {
      assert.match(content, /我今天想见你/);
      return auditResponse;
    });
    const handler = server.createRenderStackHandler({
      checkContent,
      renderScenes: async () => { throw new Error('must not render'); }
    });
    const response = await handler(validPayload());
    assert.deepEqual(response, { statusCode, body: { ok: false, code } });
  }

  const thrownCheck = server.createContentChecker(async () => {
    throw new Error('permission denied');
  });
  const thrownHandler = server.createRenderStackHandler({
    checkContent: thrownCheck,
    renderScenes: async () => { throw new Error('must not render'); }
  });
  assert.deepEqual(await thrownHandler(validPayload()), {
    statusCode: 503,
    body: { ok: false, code: 'SAFETY_UNAVAILABLE' }
  });
});

test('renders the final stack at 1080 and preserves scene order', async () => {
  const jobs = [];
  const payload = validPayload();
  const handler = server.createRenderStackHandler({
    checkContent: async () => ({ ok: true }),
    renderScenes: async (scenes, job) => {
      jobs.push(job);
      return renderedCards(scenes, 'final');
    }
  });

  const response = await handler(payload);

  assert.deepEqual(jobs, [{
    projectId: payload.projectId,
    candidateId: payload.candidateId,
    kind: 'final',
    size: 1080
  }]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.projectId, payload.projectId);
  assert.equal(response.body.candidateId, payload.candidateId);
  assert.deepEqual(response.body.cards.map((card) => [card.sceneId, card.order]), [
    ['scene_1', 1], ['scene_2', 2], ['scene_3', 3]
  ]);
});

test('fails the complete request when rendered output does not match its scenes', async () => {
  const handler = server.createRenderStackHandler({
    checkContent: async () => ({ ok: true }),
    renderScenes: async (scenes) => renderedCards(scenes, 'final').reverse()
  });

  const response = await handler(validPayload());

  assert.deepEqual(response, { statusCode: 500, body: { ok: false, code: 'RENDER_FAILED' } });
});

test('previews at most three candidates at 360 and preserves candidate and card order', async () => {
  const jobs = [];
  const payload = validPreviewPayload();
  const handler = server.createPreviewStackHandler({
    checkContent: async () => ({ ok: true }),
    renderScenes: async (scenes, job) => {
      jobs.push(job);
      return renderedCards(scenes, job.candidateId);
    }
  });

  const response = await handler(payload);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.projectId, payload.projectId);
  assert.deepEqual(
    response.body.candidates.map((candidate) => candidate.candidateId),
    payload.candidates.map((candidate) => candidate.candidateId)
  );
  response.body.candidates.forEach((candidate, index) => {
    assert.equal(candidate.cards.length, payload.candidates[index].scenes.length);
    assert.deepEqual(
      candidate.cards.map((card) => [card.sceneId, card.order]),
      payload.candidates[index].scenes.map((scene) => [scene.sceneId, scene.order])
    );
  });
  assert.deepEqual(jobs.map((job) => [job.candidateId, job.kind, job.size]), [
    ['candidate_hard_turn_123', 'preview', 360],
    ['candidate_suspense_reveal_456', 'preview', 360],
    ['candidate_fake_checklist_789', 'preview', 360]
  ]);

  const tooMany = clone(payload);
  tooMany.candidates.push(clone(tooMany.candidates[0]));
  tooMany.candidates[3].candidateId = 'candidate_visual_pause_999';
  const rejected = await handler(tooMany);
  assert.deepEqual(rejected, { statusCode: 400, body: { ok: false, code: 'INVALID_REQUEST' } });
});

test('preview auditing is a single aggregate gate before any candidate renders', async () => {
  let auditText = '';
  let audits = 0;
  let renders = 0;
  const handler = server.createPreviewStackHandler({
    checkContent: async (text) => {
      audits += 1;
      auditText = text;
      return { ok: false, code: 'CONTENT_UNSAFE' };
    },
    renderScenes: async () => { renders += 1; return []; }
  });

  const response = await handler(validPreviewPayload());

  assert.equal(response.statusCode, 403);
  assert.equal(audits, 1);
  assert.match(auditText, /我今天想见你/);
  assert.match(auditText, /再滑一下/);
  assert.equal(renders, 0);
});

test('preview rollback removes uploads from earlier candidates when a later candidate fails', async () => {
  const payload = validPreviewPayload();
  const scenarios = [
    {
      name: 'candidate 2 render failure',
      failCandidate: payload.candidates[1].candidateId,
      failWithMismatch: false,
      expectedDeleted: 3
    },
    {
      name: 'candidate 3 response mismatch',
      failCandidate: payload.candidates[2].candidateId,
      failWithMismatch: true,
      expectedDeleted: 9
    }
  ];

  for (const scenario of scenarios) {
    const deleted = [];
    const handler = server.createPreviewStackHandler({
      checkContent: async () => ({ ok: true }),
      renderScenes: async (scenes, job) => {
        if (job.candidateId === scenario.failCandidate && !scenario.failWithMismatch) {
          throw new Error('upload failed');
        }
        const cards = renderedCards(scenes, job.candidateId);
        return job.candidateId === scenario.failCandidate ? cards.reverse() : cards;
      },
      rollbackCards: async (cards) => {
        cards.forEach((card) => deleted.push(card.fileId));
      }
    });

    const response = await handler(payload);

    assert.deepEqual(response, { statusCode: 500, body: { ok: false, code: 'RENDER_FAILED' } }, scenario.name);
    assert.equal(deleted.length, scenario.expectedDeleted, scenario.name);
    assert.equal(new Set(deleted).size, scenario.expectedDeleted, scenario.name);
  }
});

test('uploads one PNG at a time to fixed paths and rolls back earlier uploads on failure', async () => {
  const payload = validPayload();
  const made = [];
  const uploaded = [];
  const deleted = [];
  const renderScenes = renderer.createSceneRenderer({
    async makePng(scene, size) {
      made.push([scene.sceneId, size]);
      return Buffer.from('png-' + scene.order);
    },
    async uploadBuffer(buffer, cloudPath) {
      uploaded.push([buffer.toString(), cloudPath]);
      if (uploaded.length === 2) throw new Error('upload failed');
      return { fileId: 'file_1', url: 'cloud://file_1' };
    },
    async deleteFile(fileId) { deleted.push(fileId); }
  });

  await assert.rejects(() => renderScenes(payload.scenes, {
    projectId: payload.projectId,
    candidateId: payload.candidateId,
    kind: 'preview',
    size: 360
  }), /upload failed/);

  assert.deepEqual(made, [['scene_1', 360], ['scene_2', 360]]);
  assert.deepEqual(uploaded.map((item) => item[1]), [
    'funtext/funtext_1000/candidate_hard_turn_123/preview/1.png',
    'funtext/funtext_1000/candidate_hard_turn_123/preview/2.png'
  ]);
  assert.deepEqual(deleted, ['file_1']);
});

test('real PNG rendering is deterministic and uses exact preview/final dimensions', async () => {
  const scene = validPayload().scenes[0];
  scene.background.assetKey = 'pink-note-01';
  scene.layers[0].effectKey = 'marker-bold';
  scene.layers.push({
    id: 'heart', type: 'doodle', assetKey: 'heart-outline',
    x: 800, y: 220, rotation: 8, scale: 0.8
  });
  const makePng = renderer.createPngMaker();

  const lowA = await makePng(scene, 360);
  const lowB = await makePng(scene, 360);
  const high = await makePng(scene, 1080);

  assert.deepEqual(pngDimensions(lowA), { width: 360, height: 360 });
  assert.deepEqual(pngDimensions(high), { width: 1080, height: 1080 });
  assert.equal(lowA.equals(lowB), true);
  assert.equal(high.length > lowA.length, true);
});

test('real PNG rendering rejects a text layer without an explicit registered effect', async () => {
  const scene = validPayload().scenes[0];
  delete scene.layers[0].effectKey;
  const makePng = renderer.createPngMaker();

  await assert.rejects(() => makePng(scene, 360), /effect/i);
});

test('HTTP routes expose both handlers and the licensed font with CORS headers', async (t) => {
  const fontPath = path.join(serviceRoot, 'fonts', 'LXGWMarkerGothic-Regular.ttf');
  const httpServer = server.createHttpServer({
    renderStackHandler: async () => ({ statusCode: 200, body: { ok: true, route: 'render' } }),
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true, route: 'preview' } }),
    fontPath
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());
  const address = httpServer.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;

  const font = await request(baseUrl, '/font/LXGWMarkerGothic-Regular.ttf');
  assert.equal(font.status, 200);
  assert.match(font.headers.get('content-type') || '', /font\/ttf/);
  assert.equal(font.headers.get('access-control-allow-origin'), '*');
  assert.equal(font.body.equals(fs.readFileSync(fontPath)), true);

  const render = await request(baseUrl, '/render-stack', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  const preview = await request(baseUrl, '/preview-stack', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.deepEqual(render.body, { ok: true, route: 'render' });
  assert.deepEqual(preview.body, { ok: true, route: 'preview' });

  const malformed = await request(baseUrl, '/render-stack', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { ok: false, code: 'INVALID_REQUEST' });
  const missing = await request(baseUrl, '/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { ok: false, code: 'NOT_FOUND' });
});

test('oversized HTTP JSON returns INVALID_REQUEST without resetting the connection', async (t) => {
  const httpServer = server.createHttpServer({
    renderStackHandler: async () => ({ statusCode: 200, body: { ok: true } }),
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true } })
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());
  const address = httpServer.address();

  let response;
  await assert.doesNotReject(async () => {
    response = await request(
      'http://127.0.0.1:' + address.port,
      '/render-stack',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) })
      }
    );
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { ok: false, code: 'INVALID_REQUEST' });
});
