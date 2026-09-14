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
const bundledFontRoot = path.join(serviceRoot, 'assets', 'fonts');

test('final stages share a trace with text and image audit without logging content', async () => {
  const logs=[];const traces=[];
  const render=renderer.createSceneRenderer({
    makePng:async()=>Buffer.from('image'),
    checkImage:async(buffer,context)=>{traces.push(context.traceId);return {ok:true};},
    uploadBuffer:async(buffer,cloudPath)=>({fileId:cloudPath,url:'https://example.com/card.png'})
  });
  const handler=server.createRenderStackHandler({
    checkContent:async(text,context)=>{traces.push(context.traceId);return {ok:true};},
    renderScenes:async(scenes,job)=>render(scenes.map(scene=>({...scene,strokes:[{}]})),job),
    logStage:(stage,detail)=>logs.push(stage+' '+detail)
  });
  assert.equal((await handler(validPayload(),{traceId:'trace-final-1',openid:'private-openid'})).statusCode,200);
  assert.equal(traces.length,4);assert.ok(traces.every(id=>id==='trace-final-1'));
  assert.equal(logs.filter(line=>line.startsWith('audit-start')).length,1);
  assert.ok(logs.every(line=>line.includes('traceId=trace-final-1')));
  assert.ok(!logs.join('').includes('private-openid'));assert.ok(!logs.join('').includes('我今天想见你'));
});

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
    fontKey: 'marker',
    fontFamily: 'LXGWMarkerGothic',
    fontSize: 180,
    lineHeight: 210,
    x: 540,
    y: 520,
    rotation: 0,
    scale: 1,
    color: '#F35C8C',
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
      stylePackId: 'pink-note-v1',
      backgroundVariantKey: 'pink-note-soft',
      paletteKey: 'pink-note-rose',
      fontFeelKey: 'marker',
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
      const metadata = {
        'pink-note-v1': ['pink-note-soft', 'pink-note-rose', 'marker', '#F35C8C'],
        'chalk-chaos-v1': ['chalk-board-dark', 'chalk-mint', 'marker', '#F9F4D0'],
        'paper-collage-v1': ['paper-collage-cream', 'paper-ink', 'headline', '#245D8C']
      };
      return {
        candidateId,
        stylePackId,
        scenes: base.scenes.map((scene) => Object.assign({}, clone(scene), {
          sceneId: 'scene_' + (candidateIndex + 1) + '_' + scene.order,
          stylePackId,
          backgroundVariantKey: metadata[stylePackId][0],
          paletteKey: metadata[stylePackId][1],
          fontFeelKey: metadata[stylePackId][2],
          background: clone(backgrounds[stylePackId]),
          layers: scene.layers.map((layer) => layer.type === 'text'
            ? Object.assign({}, layer, {
              fontKey: metadata[stylePackId][2],
              fontFamily: metadata[stylePackId][2] === 'headline' ? 'MaShanZheng' : 'LXGWMarkerGothic',
              color: metadata[stylePackId][3]
            })
            : layer)
        }))
      };
    })
  };
}

test('editing a saved card creates immutable PNG URLs with the latest decoration and two ink colors', async () => {
  const canvas = require(path.join(serviceRoot, 'node_modules/@napi-rs/canvas'));
  const makePng = renderer.createPngMaker(canvas);
  const stored = new Map(), downloaded = new Map();
  const render = renderer.createSceneRenderer({
    makePng,
    checkImage: async () => ({ok:true}),
    uploadBuffer: async (buffer, cloudPath) => {
      const url='cloud://test/'+cloudPath;
      stored.set(url, buffer);
      return {fileId:url,url};
    }
  });
  const handler=server.createRenderStackHandler({checkContent:async()=>({ok:true}),imageSafetyEnabled:true,renderScenes:render});
  const payload=validPayload();
  const first=await handler(payload,{traceId:'same-trace'});
  assert.equal(first.statusCode,200);
  const firstUrl=first.body.cards[0].url;
  downloaded.set(firstUrl,stored.get(firstUrl));
  const before=Buffer.from(stored.get(firstUrl));
  payload.scenes[0].layers.push({id:'added_star',type:'sticker',assetKey:'sticker_2',x:540,y:220,scale:1,rotation:0});
  payload.scenes[0].strokes=['purple','blue'].map((colorKey,i)=>({
    id:'stroke_'+i,brushKey:'pen',colorKey,width:28,
    points:[{x:300,y:760+i*100},{x:700,y:760+i*100}]
  }));
  const second=await handler(payload,{traceId:'same-trace'});
  assert.equal(second.statusCode,200,JSON.stringify(second.body));
  const secondUrl=second.body.cards[0].url;
  assert.notEqual(secondUrl,firstUrl);
  assert.deepEqual(stored.get(firstUrl),before,'previous image must not be overwritten');
  const latest=downloaded.get(secondUrl)||stored.get(secondUrl);
  assert.notDeepEqual(latest,before);
  const png=await canvas.loadImage(latest), old=await canvas.loadImage(before);
  const surface=canvas.createCanvas(1080,1080), ctx=surface.getContext('2d');
  ctx.drawImage(png,0,0);
  assert.deepEqual(Array.from(ctx.getImageData(500,760,1,1).data),[118,87,255,255]);
  assert.deepEqual(Array.from(ctx.getImageData(500,860,1,1).data),[32,119,212,255]);
  const star=Buffer.from(ctx.getImageData(470,150,140,140).data);
  ctx.drawImage(old,0,0);
  assert.notDeepEqual(star,Buffer.from(ctx.getImageData(470,150,140,140).data));
});

test('both handlers pass separate caller context to content auditing', async () => {
  const caller = { openid: 'header-only-openid' };
  for (const [factory, payload] of [
    [server.createRenderStackHandler, validPayload()],
    [server.createPreviewStackHandler, validPreviewPayload()]
  ]) {
    let received;
    payload.openid = 'untrusted-body';
    const handler = factory({ checkContent: async (_text, context) => {
      received = context;
      return { ok: false, code: 'SAFETY_UNAVAILABLE' };
    }});
    assert.equal((await handler(payload, caller)).statusCode, 503);
    assert.equal(received.openid, caller.openid);
    if (factory === server.createRenderStackHandler) assert.match(received.traceId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(caller, { openid: 'header-only-openid' });
  }
});

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

test('renderer bundles all licensed fonts under assets/fonts for container-local use', () => {
  const dockerfile = fs.readFileSync(path.join(serviceRoot, 'Dockerfile'), 'utf8');
  for (const font of Object.values(renderer.FONT_REGISTRY)) {
    const fontPath = path.join(bundledFontRoot, font.file);
    assert.equal(fs.existsSync(fontPath), true, font.file + ' must exist in assets/fonts');
    assert.ok(fs.statSync(fontPath).size > 100000, font.file + ' must not be a placeholder');
    assert.match(dockerfile, new RegExp('assets/fonts/' + font.file.replaceAll('.', '\\.')));
  }
});

test('renderer registers bundled fonts once when multiple PNG makers are created', () => {
  const registrations = [];
  const fakeCanvasModule = {
    createCanvas() { throw new Error('not used'); },
    GlobalFonts: {
      registerFromPath(fontPath, family) {
        registrations.push({ fontPath, family });
        return true;
      }
    }
  };

  renderer.createPngMaker(fakeCanvasModule);
  renderer.createPngMaker(fakeCanvasModule);

  assert.equal(registrations.length, 3);
  assert.deepEqual(registrations.map((item) => path.dirname(item.fontPath)), [
    bundledFontRoot,
    bundledFontRoot,
    bundledFontRoot
  ]);
});

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
  assert.deepEqual(
    [...validator.SUPPORTED_STYLE_PACK_KEYS].sort(),
    Array.from(clientStyles.STYLE_PACKS, (pack) => pack.id).sort()
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
    ['text color outside selected palette', (payload) => { payload.scenes[0].layers[0].color = '#123456'; }],
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
  assert.deepEqual(server.assessSecurityResponse({ errCode: 0 }), { ok: true, code: 'OK' });
  const cases = [
    [{ errCode: 87014 }, 403, 'CONTENT_UNSAFE'],
    [{ errCode: 44991 }, 503, 'SAFETY_UNAVAILABLE'],
    [{ errCode: 40001 }, 503, 'SAFETY_UNAVAILABLE'],
    [{ errCode: null }, 503, 'SAFETY_UNAVAILABLE'],
    [{ errCode: '' }, 503, 'SAFETY_UNAVAILABLE'],
    [{ errCode: '0' }, 503, 'SAFETY_UNAVAILABLE'],
    [{}, 503, 'SAFETY_UNAVAILABLE'],
    [{ errCode: 'not-a-number' }, 503, 'SAFETY_UNAVAILABLE'],
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
    traceId: jobs[0].traceId,
    revision: jobs[0].revision,
    size: 1080
  }]);
  assert.match(jobs[0].traceId, /^[a-f0-9-]{36}$/);
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

test('all three licensed Chinese font keys produce non-empty PNG output', async () => {
  const makePng = renderer.createPngMaker();
  const fonts = [
    ['marker', 'LXGWMarkerGothic'],
    ['playful', 'SmileySans'],
    ['headline', 'MaShanZheng']
  ];

  for (const [fontKey, fontFamily] of fonts) {
    const scene = validPayload().scenes[0];
    scene.fontFeelKey = fontKey;
    scene.layers[0].fontKey = fontKey;
    scene.layers[0].fontFamily = fontFamily;
    scene.layers[0].text = '今天真开心';
    scene.layers[0].lines = ['今天真开心'];
    const png = await makePng(scene, 360);
    assert.deepEqual(pngDimensions(png), { width: 360, height: 360 });
    assert.ok(png.length > 1000, fontKey + ' should render visible PNG data');
  }
});

test('real PNG rendering rejects a text layer without an explicit registered effect', async () => {
  const scene = validPayload().scenes[0];
  delete scene.layers[0].effectKey;
  const makePng = renderer.createPngMaker();

  await assert.rejects(() => makePng(scene, 360), /effect/i);
});

test('HTTP routes expose both handlers and all licensed fonts with CORS headers', async (t) => {
  const fontPath = path.join(bundledFontRoot, 'LXGWMarkerGothic-Regular.ttf');
  const httpServer = server.createHttpServer({
    devMode: true,
    renderStackHandler: async () => ({ statusCode: 200, body: { ok: true, route: 'render' } }),
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true, route: 'preview' } }),
    fontPath
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());
  const address = httpServer.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;

  for (const fileName of ['LXGWMarkerGothic-Regular.ttf', 'SmileySans-Oblique.ttf', 'MaShanZheng-Regular.ttf']) {
    const font = await request(baseUrl, '/font/' + fileName);
    assert.equal(font.status, 200);
    assert.match(font.headers.get('content-type') || '', /font\/ttf/);
    assert.equal(font.headers.get('access-control-allow-origin'), '*');
    assert.equal(font.body.equals(fs.readFileSync(path.join(bundledFontRoot, fileName))), true);
  }

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
    devMode: true,
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

test('render handler fails closed when content audit exceeds its deadline', async () => {
  const handler = server.createRenderStackHandler({
    checkContent: async () => new Promise(() => {}),
    renderScenes: async () => {
      throw new Error('render must not start before audit completes');
    },
    auditTimeoutMs: 10
  });

  const result = await handler(validPayload());

  assert.deepEqual(result, { statusCode: 503, body: { ok: false, code: 'SAFETY_UNAVAILABLE' } });
});

test('render handler returns an explicit timeout when rendering exceeds its deadline', async () => {
  const handler = server.createRenderStackHandler({
    checkContent: async () => ({ ok: true, code: 'OK' }),
    renderScenes: async () => new Promise(() => {}),
    renderTimeoutMs: 10
  });

  const result = await handler(validPayload());

  assert.deepEqual(result, { statusCode: 504, body: { ok: false, code: 'RENDER_TIMEOUT' } });
});

test('HTTP routes convert unexpected handler rejection into a JSON failure', async (t) => {
  const httpServer = server.createHttpServer({
    devMode: true,
    renderStackHandler: async () => {
      throw new Error('unexpected failure');
    },
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true } })
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());

  const response = await request('http://127.0.0.1:' + httpServer.address().port, '/render-stack', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validPayload())
  });

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { ok: false, code: 'INTERNAL_ERROR' });
});

test('production HTTP routes require both CloudBase context and caller identity', async (t) => {
  let handled = false;
  const httpServer = server.createHttpServer({
    renderStackHandler: async () => {
      handled = true;
      return { statusCode: 200, body: { ok: true } };
    },
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true } })
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());
  const baseUrl = 'http://127.0.0.1:' + httpServer.address().port;

  for (const [openid, context] of [[undefined, 'context'], ['', 'context'], ['   ', 'context'], ['openid', undefined], ['openid', '   ']]) {
    const headers = { 'content-type': 'application/json' };
    if (openid !== undefined) headers['x-wx-openid'] = openid;
    if (context !== undefined) headers['x-cloudbase-context'] = context;
    const response = await request(baseUrl, '/render-stack', {
      method: 'POST',
      headers,
      body: '{}'
    });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { ok: false, code: 'CALLER_UNAUTHORIZED' });
  }
  assert.equal(handled, false);
});

test('production HTTP routes rate-limit each non-empty CloudBase caller identity', async (t) => {
  const httpServer = server.createHttpServer({
    renderStackHandler: async () => ({ statusCode: 200, body: { ok: true } }),
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true } }),
    rateLimiter: server.createCallerRateLimiter({ maxRequests: 2, windowMs: 60000, now: () => 1000 })
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());
  const baseUrl = 'http://127.0.0.1:' + httpServer.address().port;
  const postAs = (openid) => request(baseUrl, '/render-stack', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wx-openid': openid, 'x-cloudbase-context': 'platform-context' },
    body: '{}'
  });

  assert.equal((await postAs('openid-a')).status, 200);
  assert.equal((await postAs('openid-a')).status, 200);
  const limited = await postAs('openid-a');
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.body, { ok: false, code: 'RATE_LIMITED' });
  assert.equal((await postAs('openid-b')).status, 200);
});

test('default caller limiter permits 30 requests per minute and resets at the next window', () => {
  let currentTime = 1000;
  const allowCaller = server.createCallerRateLimiter({ now: () => currentTime });

  for (let index = 0; index < 30; index += 1) {
    assert.equal(allowCaller('openid-default-limit'), true);
  }
  assert.equal(allowCaller('openid-default-limit'), false);

  currentTime += 60000;
  assert.equal(allowCaller('openid-default-limit'), true);
});

test('caller limiter bounds distinct callers and frees expired capacity without resetting active quotas', () => {
  let now = 0;
  const allow = server.createCallerRateLimiter({ maxCallers: 2, maxRequests: 1, windowMs: 100, now: () => now });
  assert.equal(allow('old'), true);
  now = 50;
  assert.equal(allow('active'), true);
  assert.equal(allow('overflow'), false);
  now = 100;
  assert.equal(allow('new'), true);
  assert.equal(allow('active'), false);
  assert.equal(allow('overflow'), false);
  now = 200;
  assert.equal(allow('later'), true);
  assert.equal(allow('another'), true);
});

test('explicit development HTTP mode permits local POST requests without CloudBase headers', async (t) => {
  const httpServer = server.createHttpServer({
    devMode: true,
    renderStackHandler: async () => ({ statusCode: 200, body: { ok: true } }),
    previewStackHandler: async () => ({ statusCode: 200, body: { ok: true } })
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  t.after(() => httpServer.close());
  const response = await request(
    'http://127.0.0.1:' + httpServer.address().port,
    '/render-stack',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});
