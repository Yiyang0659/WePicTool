'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  validateRenderPayload,
  validatePreviewPayload,
  collectAuditText
} = require('./sceneValidator');

const DEFAULT_FONT_PATH = path.join(__dirname, 'fonts', 'LXGWMarkerGothic-Regular.ttf');
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function failure(statusCode, code) {
  return { statusCode, body: { ok: false, code } };
}

function assessSecurityResponse(response) {
  const errCode = response && Number(response.errCode);
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

async function auditPayload(checkContent, payload) {
  if (typeof checkContent !== 'function') return failure(503, 'SAFETY_UNAVAILABLE');
  let audit;
  try {
    audit = await checkContent(collectAuditText(payload));
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
  return async function renderStack(input) {
    if (!validateRenderPayload(input).valid) return failure(400, 'INVALID_REQUEST');
    const blocked = await auditPayload(deps.checkContent, input);
    if (blocked) return blocked;
    try {
      const cards = await deps.renderScenes(input.scenes, {
        projectId: input.projectId,
        candidateId: input.candidateId,
        kind: 'final',
        size: 1080
      });
      if (!cardsMatchScenes(cards, input.scenes)) return failure(500, 'RENDER_FAILED');
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
      return failure(500, 'RENDER_FAILED');
    }
  };
}

function createPreviewStackHandler(dependencies) {
  const deps = dependencies || {};
  return async function previewStack(input) {
    if (!validatePreviewPayload(input).valid) return failure(400, 'INVALID_REQUEST');
    const blocked = await auditPayload(deps.checkContent, input);
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

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
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
  const fontPath = config.fontPath || DEFAULT_FONT_PATH;
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/font/LXGWMarkerGothic-Regular.ttf') {
      try {
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
      '/preview-stack': config.previewStackHandler
    };
    if (request.method === 'POST' && handlers[url.pathname]) {
      let input;
      try {
        input = await readJson(request);
      } catch (error) {
        if (!response.writableEnded) writeJson(response, 400, { ok: false, code: 'INVALID_REQUEST' });
        return;
      }
      const result = await handlers[url.pathname](input);
      writeJson(response, result.statusCode, result.body);
      return;
    }
    writeJson(response, 404, { ok: false, code: 'NOT_FOUND' });
  });
}

module.exports = {
  assessSecurityResponse,
  createContentChecker,
  createRenderStackHandler,
  createPreviewStackHandler,
  createHttpServer
};
