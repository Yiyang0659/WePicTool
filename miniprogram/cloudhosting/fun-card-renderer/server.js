'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  validateRenderPayload,
  validatePreviewPayload,
  validateScene,
  collectAuditText
} = require('./sceneValidator');

const BUNDLED_FONT_ROOT = path.join(__dirname, 'assets', 'fonts');
const DEFAULT_FONT_PATH = path.join(BUNDLED_FONT_ROOT, 'LXGWMarkerGothic-Regular.ttf');
const DEFAULT_FONT_PATHS = Object.freeze({
  'LXGWMarkerGothic-Regular.ttf': DEFAULT_FONT_PATH,
  'SmileySans-Oblique.ttf': path.join(BUNDLED_FONT_ROOT, 'SmileySans-Oblique.ttf'),
  'MaShanZheng-Regular.ttf': path.join(BUNDLED_FONT_ROOT, 'MaShanZheng-Regular.ttf')
});
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_RATE_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_CALLERS = 10000;
const DEFAULT_AUDIT_TIMEOUT_MS = 6000;
const DEFAULT_RENDER_TIMEOUT_MS = 20000;

function failure(statusCode, code) {
  return { statusCode, body: { ok: false, code } };
}

function hasUnverifiedInk(scene) {
  return scene && scene.strokes !== undefined && (!Array.isArray(scene.strokes) || scene.strokes.length > 0);
}

function withDeadline(operation, timeoutMs, fallbackMs, timeoutCode) {
  const deadline = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : fallbackMs;
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(timeoutCode);
        error.code = timeoutCode;
        reject(error);
      }, deadline);
    })
  ]).finally(() => clearTimeout(timer));
}

function assessSecurityResponse(response) {
  const errCode = response && typeof response === 'object'
    && Object.prototype.hasOwnProperty.call(response, 'errCode')
    ? response.errCode
    : undefined;
  if (errCode === 0) return { ok: true, code: 'OK' };
  if (errCode === 87014) return { ok: false, code: 'CONTENT_UNSAFE' };
  return { ok: false, code: 'SAFETY_UNAVAILABLE' };
}

function createContentChecker(msgSecCheck, onError) {
  return async function checkContent(content) {
    try {
      return assessSecurityResponse(await msgSecCheck({ content }));
    } catch (error) {
      if (typeof onError === 'function') onError(error);
      return { ok: false, code: 'SAFETY_UNAVAILABLE' };
    }
  };
}

async function auditPayload(checkContent, payload, timeoutMs, context) {
  if (typeof checkContent !== 'function') return failure(503, 'SAFETY_UNAVAILABLE');
  let audit;
  try {
    audit = await withDeadline(
      () => checkContent(collectAuditText(payload), context),
      timeoutMs,
      DEFAULT_AUDIT_TIMEOUT_MS,
      'AUDIT_TIMEOUT'
    );
  } catch (error) {
    return failure(503, 'SAFETY_UNAVAILABLE');
  }
  if (!audit || !audit.ok) {
    return audit && audit.code === 'CONTENT_UNSAFE'
      ? failure(403, 'CONTENT_UNSAFE')
      : failure(503, 'SAFETY_UNAVAILABLE');
  }
  return null;
}

function cardsMatchScenes(cards, scenes) {
  return Array.isArray(cards) && cards.length === scenes.length && cards.every((card, index) => {
    const scene = scenes[index];
    return card && card.sceneId === scene.sceneId && card.order === scene.order
      && typeof card.url === 'string' && card.url.length > 0;
  });
}

async function rollbackRequestCards(rollbackCards, cards) {
  if (typeof rollbackCards !== 'function') return;
  try {
    await rollbackCards(cards);
  } catch (error) {
    // Preserve the original render failure even when best-effort cleanup fails.
  }
}

function createRenderStackHandler(dependencies) {
  const deps = dependencies || {};
  return async function renderStack(input, context) {
    if (!validateRenderPayload(input).valid) return failure(400, 'INVALID_REQUEST');
    if (input.scenes.some(hasUnverifiedInk) && !deps.imageSafetyEnabled) return failure(503, 'IMAGE_SAFETY_UNAVAILABLE');
    const startedAt = Date.now();
    if (typeof deps.logStage === 'function') deps.logStage('audit-start', 'kind=final');
    const blocked = await auditPayload(deps.checkContent, input, deps.auditTimeoutMs, context);
    if (blocked) {
      if (typeof deps.logStage === 'function') {
        deps.logStage('audit-end', 'kind=final status=' + blocked.statusCode + ' elapsedMs=' + (Date.now() - startedAt));
      }
      return blocked;
    }
    if (typeof deps.logStage === 'function') {
      deps.logStage('render-start', 'kind=final elapsedMs=' + (Date.now() - startedAt));
    }
    try {
      const cards = await withDeadline(
        () => deps.renderScenes(input.scenes, {
          projectId: input.projectId,
          candidateId: input.candidateId,
          kind: 'final',
          size: 1080
        }),
        deps.renderTimeoutMs,
        DEFAULT_RENDER_TIMEOUT_MS,
        'RENDER_TIMEOUT'
      );
      if (!cardsMatchScenes(cards, input.scenes)) return failure(500, 'RENDER_FAILED');
      if (typeof deps.logStage === 'function') {
        deps.logStage('render-end', 'kind=final status=200 elapsedMs=' + (Date.now() - startedAt));
      }
      return {
        statusCode: 200,
        body: {
          ok: true,
          projectId: input.projectId,
          candidateId: input.candidateId,
          cards
        }
      };
    } catch (error) {
      if (typeof deps.logStage === 'function') {
        const code = error && error.code ? error.code : 'RENDER_FAILED';
        deps.logStage('render-end', 'kind=final status=error code=' + code + ' elapsedMs=' + (Date.now() - startedAt));
      }
      if (error && error.code==='CONTENT_UNSAFE') return failure(403,'CONTENT_UNSAFE');
      if (error && error.code==='IMAGE_SAFETY_UNAVAILABLE') return failure(503,'IMAGE_SAFETY_UNAVAILABLE');
      return error && error.code === 'RENDER_TIMEOUT'
        ? failure(504, 'RENDER_TIMEOUT')
        : failure(500, 'RENDER_FAILED');
    }
  };
}

function createPreviewStackHandler(dependencies) {
  const deps = dependencies || {};
  return async function previewStack(input, context) {
    if (!validatePreviewPayload(input).valid) return failure(400, 'INVALID_REQUEST');
    if (input.candidates.some(candidate => candidate.scenes.some(hasUnverifiedInk))) return failure(503, 'IMAGE_SAFETY_UNAVAILABLE');
    const blocked = await auditPayload(deps.checkContent, input, deps.auditTimeoutMs, context);
    if (blocked) return blocked;
    const requestCards = [];
    try {
      const candidates = [];
      for (const candidate of input.candidates) {
        const cards = await deps.renderScenes(candidate.scenes, {
          projectId: input.projectId,
          candidateId: candidate.candidateId,
          kind: 'preview',
          size: 360
        });
        if (Array.isArray(cards)) requestCards.push(...cards);
        if (!cardsMatchScenes(cards, candidate.scenes)) {
          await rollbackRequestCards(deps.rollbackCards, requestCards);
          return failure(500, 'RENDER_FAILED');
        }
        candidates.push({
          candidateId: candidate.candidateId,
          stylePackId: candidate.stylePackId,
          cards
        });
      }
      return {
        statusCode: 200,
        body: { ok: true, projectId: input.projectId, candidates }
      };
    } catch (error) {
      await rollbackRequestCards(deps.rollbackCards, requestCards);
      return failure(500, 'RENDER_FAILED');
    }
  };
}

function createPreviewSceneHandler(dependencies) {
  const deps = dependencies || {};
  return async function previewScene(input, context) {
    if (!input || !/^funtext_[A-Za-z0-9_-]{1,90}$/.test(input.projectId || '') ||
        !/^candidate_[A-Za-z0-9_-]{1,90}$/.test(input.candidateId || '') ||
        !input.scene || !Number.isInteger(input.scene.order) || input.scene.order < 1 || input.scene.order > 8 ||
        !validateScene(input.scene, input.scene.order).valid) return failure(400, 'INVALID_REQUEST');
    const blocked = await auditPayload(deps.checkContent, { scenes: [input.scene] }, deps.auditTimeoutMs, context);
    if (blocked) return blocked;
    const scene = Object.assign({}, input.scene, {
      layers: input.scene.layers.filter(layer => layer.type === 'text')
    });
    delete scene.strokes;
    try {
      const cards = await withDeadline(() => deps.renderScenes([scene], {
        projectId: input.projectId, candidateId: input.candidateId,
        kind: 'preview', size: 360, revision: randomUUID()
      }), deps.renderTimeoutMs, DEFAULT_RENDER_TIMEOUT_MS, 'RENDER_TIMEOUT');
      if (!cardsMatchScenes(cards, [scene])) return failure(500, 'RENDER_FAILED');
      return { statusCode: 200, body: { ok: true, projectId: input.projectId,
        candidateId: input.candidateId, card: cards[0] } };
    } catch (error) {
      return failure(error && error.code === 'RENDER_TIMEOUT' ? 504 : 500, 'RENDER_FAILED');
    }
  };
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function normalizeCallerId(value) {
  if (typeof value !== 'string') return '';
  const callerId = value.trim();
  return callerId && callerId.length <= 128 ? callerId : '';
}

function normalizeTraceId(value) {
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== 'string') return '';
  const traceId = value.trim().split('/')[0];
  return /^[A-Za-z0-9._:-]{1,128}$/.test(traceId) ? traceId : '';
}

function requestTraceId(request) {
  const headers = request && request.headers || {};
  return normalizeTraceId(headers['x-request-id'])
    || normalizeTraceId(headers['x-cloud-trace-context'])
    || normalizeTraceId(headers.traceparent)
    || randomUUID();
}

function createCallerRateLimiter(options) {
  const config = options || {};
  const maxRequests = Number.isInteger(config.maxRequests) && config.maxRequests > 0
    ? config.maxRequests
    : DEFAULT_RATE_LIMIT;
  const windowMs = Number.isInteger(config.windowMs) && config.windowMs > 0
    ? config.windowMs
    : DEFAULT_RATE_WINDOW_MS;
  const now = typeof config.now === 'function' ? config.now : Date.now;
  const maxCallers = Number.isInteger(config.maxCallers) && config.maxCallers > 0
    ? config.maxCallers
    : DEFAULT_MAX_CALLERS;
  const callers = new Map();

  return function allowCaller(callerId) {
    const currentTime = now();
    // Entries are inserted in window-start order; active calls never move them.
    for (const [id, entry] of callers) {
      if (currentTime - entry.startedAt < windowMs) break;
      callers.delete(id);
    }
    const existing = callers.get(callerId);
    if (!existing) {
      if (callers.size >= maxCallers) return false;
      callers.set(callerId, { startedAt: currentTime, count: 1 });
      return true;
    }
    if (existing.count >= maxRequests) return false;
    existing.count += 1;
    return true;
  };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    let tooLarge = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true;
        raw = '';
        return;
      }
      if (!tooLarge) raw += chunk;
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(new Error('request body too large'));
        return;
      }
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function createHttpServer(options) {
  const config = options || {};
  const fontPaths = Object.assign({}, DEFAULT_FONT_PATHS, config.fontPaths || {});
  if (config.fontPath) fontPaths['LXGWMarkerGothic-Regular.ttf'] = config.fontPath;
  const devMode = config.devMode === true;
  const rateLimiter = typeof config.rateLimiter === 'function'
    ? config.rateLimiter
    : createCallerRateLimiter();
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const fontFileName = url.pathname.indexOf('/font/') === 0 ? url.pathname.slice('/font/'.length) : '';
    if ((request.method === 'GET' || request.method === 'HEAD') && fontPaths[fontFileName]) {
      try {
        const fontPath = fontPaths[fontFileName];
        const stat = fs.statSync(fontPath);
        response.writeHead(200, {
          'content-type': 'font/ttf',
          'content-length': stat.size,
          'cache-control': 'public, max-age=31536000, immutable',
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin'
        });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        fs.createReadStream(fontPath).pipe(response);
      } catch (error) {
        writeJson(response, 500, { ok: false, code: 'FONT_UNAVAILABLE' });
      }
      return;
    }
    const handlers = {
      '/render-stack': config.renderStackHandler,
      '/preview-stack': config.previewStackHandler,
      '/preview-scene': config.previewSceneHandler
    };
    if (request.method === 'POST' && handlers[url.pathname]) {
      const traceId = requestTraceId(request);
      let callerId = normalizeCallerId(request.headers['x-wx-openid']);
      if (!devMode) {
        if (config.verifyCaller) {
          let identity;
          try {
            identity = await config.verifyCaller(request.headers['x-wepic-login-code']);
          } catch (_) {
            identity = { statusCode: 503, code: 'CALLER_AUTH_UNAVAILABLE' };
          }
          callerId = normalizeCallerId(identity && identity.openid);
          if (!callerId) {
            writeJson(response, identity && identity.statusCode || 403,
              { ok: false, code: identity && identity.code || 'CALLER_UNAUTHORIZED' });
            return;
          }
        } else {
        const cloudContext = request.headers['x-cloudbase-context'];
        // Presence checks only: headers are NOT public-endpoint authentication.
        // Deployment must disable public service access and expose only the font gateway path.
        if (!callerId || typeof cloudContext !== 'string' || !cloudContext.trim()) {
          writeJson(response, 403, { ok: false, code: 'CALLER_UNAUTHORIZED' });
          return;
        }
        }
        if (!rateLimiter(callerId)) {
          writeJson(response, 429, { ok: false, code: 'RATE_LIMITED' });
          return;
        }
      }
      let input;
      try {
        input = await readJson(request);
      } catch (error) {
        if (!response.writableEnded) writeJson(response, 400, { ok: false, code: 'INVALID_REQUEST' });
        return;
      }
      try {
        const result = await handlers[url.pathname](input, {
          openid: callerId,
          traceId,
          requestPath: url.pathname
        });
        writeJson(response, result.statusCode, result.body);
      } catch (error) {
        if (!response.writableEnded) writeJson(response, 500, { ok: false, code: 'INTERNAL_ERROR' });
      }
      return;
    }
    writeJson(response, 404, { ok: false, code: 'NOT_FOUND' });
  });
}

module.exports = {
  assessSecurityResponse,
  createCallerRateLimiter,
  createContentChecker,
  createRenderStackHandler,
  createPreviewStackHandler,
  createPreviewSceneHandler,
  createHttpServer
};
