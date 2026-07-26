const http = require('node:http');
const { buildCardSpecs, getTheme, normalizeSourceText } = require('./textCard');

function failure(statusCode, code) {
  return { statusCode, body: { ok: false, code } };
}

function resolveTaskId(value) {
  if (typeof value === 'string' && /^text_[A-Za-z0-9_-]{6,80}$/.test(value)) return value;
  return `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createRenderHandler(dependencies) {
  const deps = dependencies || {};
  const checkContent = deps.checkContent;
  const renderCards = deps.renderCards;

  return async function render(input) {
    let sourceText;
    try {
      sourceText = normalizeSourceText(input && input.sourceText);
    } catch (err) {
      return failure(400, 'INVALID_TEXT');
    }

    const audit = await checkContent(sourceText);
    if (!audit || !audit.ok) {
      return audit && audit.code === 'CONTENT_UNSAFE'
        ? failure(403, 'CONTENT_UNSAFE')
        : failure(503, 'SAFETY_UNAVAILABLE');
    }

    const specs = buildCardSpecs(sourceText);
    const theme = getTheme(input && input.themeKey);
    const taskId = resolveTaskId(input && input.taskId);
    try {
      const cards = await renderCards(specs, theme, taskId);
      if (!Array.isArray(cards) || cards.length !== specs.length || cards.some((card, index) => {
        const spec = specs[index];
        return !card || !card.url || card.text !== spec.text || card.order !== spec.order;
      })) {
        return failure(500, 'RENDER_FAILED');
      }
      return {
        statusCode: 200,
        body: { ok: true, taskId, themeKey: theme.key, cards }
      };
    } catch (err) {
      console.error('[text-card-renderer] render failed:', err && (err.message || err));
      return failure(500, 'RENDER_FAILED');
    }
  };
}

function createHttpServer(handler) {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/render') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND' }));
      return;
    }
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      let input;
      try {
        input = JSON.parse(raw || '{}');
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, code: 'INVALID_TEXT' }));
        return;
      }
      const result = await handler(input);
      res.writeHead(result.statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
    });
  });
}

module.exports = { createRenderHandler, createHttpServer, resolveTaskId };
