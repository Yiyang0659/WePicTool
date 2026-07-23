# 大字滑卡（默认手写体）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在微信小程序中交付可审核、云端渲染、保存和预览的默认手写体大字滑卡。

**Architecture:** 小程序编辑页将文本与主题交给云托管 `text-card-renderer`；该服务重新审核文本、使用内置授权手写字体渲染 PNG，并把卡片上传至 CloudBase 存储。前端将返回的卡片 URL 组织为独立的 `bigtext` 任务，通过模板结果页、既有微信预览页和本地记录完成使用闭环。

**Tech Stack:** 微信小程序原生 JS/WXML/WXSS、CloudBase 云托管 Node.js、`@napi-rs/canvas`、`wx-server-sdk`、Node 内置测试运行器。

## Global Constraints

- 输入必须先通过微信 `msgSecCheck`；审核拒绝或服务不可用时不得生成。
- 用户输入限制为 1–20 个 `Array.from` 字符；少于 3 个字符必须以固定辅助卡补到 3 张。
- 默认主题为米白纸卡、深墨手写字、最后一张红色强调；另提供夜写、蓝紫手写。
- 不使用 AI、抠图、前端 Canvas 或用户设备字体来生成文字卡。
- 云函数不承载原生图形依赖；字体和 PNG 在云托管容器内渲染。
- 单张渲染/上传失败不得写入不完整历史；保留输入与主题供用户重试。
- 保留现有穿搭结果和预览路径的行为不变。

---

## File Structure

- `miniprogram/utils/textCard.js`：纯数据模块；输入校验、字符拆分、补卡、主题配置和模板任务构造。
- `miniprogram/pages/bigtext/*`：输入、主题选择、云托管调用、失败重试。
- `miniprogram/pages/template-result/*`：大字任务缩略图、保存、预览和本地记录写入。
- `miniprogram/pages/preview/preview.js`：新增 `task.mode === 'bigtext'` 的一组卡片适配。
- `miniprogram/pages/record/record.js`：按任务类型路由记录查看和再次生成。
- `miniprogram/config/env.js`：云托管渲染服务 URL。
- `miniprogram/cloudhosting/text-card-renderer/*`：Docker 容器、服务 API、字体和渲染测试。
- `tests/text-card.test.cjs`：纯任务与主题规则测试。
- `tests/text-card-renderer.test.cjs`：容器 API 的审核/渲染/失败映射测试。

### Task 1: 纯文本卡片任务模型

**Files:**
- Create: `miniprogram/utils/textCard.js`
- Create: `tests/text-card.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `normalizeSourceText(text)`, `buildCardSpecs(text)`, `getTheme(themeKey)`, `buildBigtextTask(input)`.
- `buildBigtextTask({ sourceText, themeKey, renderedCards, createdAt })` returns `{ taskId, mode: 'bigtext', type: 'bigtext', sourceText, themeKey, cards, createdAt }`.

- [ ] **Step 1: Write failing rule tests**

```js
const { buildCardSpecs, buildBigtextTask } = loadMiniProgramModule('miniprogram/utils/textCard.js');

test('buildCardSpecs uses one card per character and fixed minimum-card helpers', () => {
  assert.deepEqual(plain(buildCardSpecs('好')), [
    { text: '滑一下', role: 'intro', order: 1 },
    { text: '好', role: 'content', order: 2 },
    { text: '就这一个字', role: 'outro', order: 3 }
  ]);
  assert.deepEqual(plain(buildCardSpecs('生日')), [
    { text: '生', role: 'content', order: 1 },
    { text: '日', role: 'content', order: 2 },
    { text: '继续滑 →', role: 'outro', order: 3 }
  ]);
});

test('buildBigtextTask rejects blank and over-limit text', () => {
  assert.throws(() => buildBigtextTask({ sourceText: '   ' }), /请输入/);
  assert.throws(() => buildBigtextTask({ sourceText: '一二三四五六七八九十一二三四五六七八九十一' }), /20/);
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run: `node --test tests/text-card.test.cjs`  
Expected: `ERR_MODULE_NOT_FOUND` for `miniprogram/utils/textCard.js`.

- [ ] **Step 3: Implement the pure model**

```js
const THEMES = {
  'handwrite-paper': { key: 'handwrite-paper', label: '手写纸卡', background: '#FFFDF8', foreground: '#1D1A17', accent: '#B6252D' },
  'night-write': { key: 'night-write', label: '夜写', background: '#171717', foreground: '#FFFFFF', accent: '#FFFFFF' },
  'violet-write': { key: 'violet-write', label: '蓝紫手写', background: '#6A5AE0', foreground: '#FFFFFF', accent: '#FFF3A6' }
};

function normalizeSourceText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const chars = Array.from(text);
  if (!chars.length) throw new Error('请输入一句话');
  if (chars.length > 20) throw new Error('最多输入 20 个字');
  return text;
}

function buildCardSpecs(value) {
  const chars = Array.from(normalizeSourceText(value));
  const raw = chars.length === 1
    ? [{ text: '滑一下', role: 'intro' }, { text: chars[0], role: 'content' }, { text: '就这一个字', role: 'outro' }]
    : chars.length === 2
      ? [{ text: chars[0], role: 'content' }, { text: chars[1], role: 'content' }, { text: '继续滑 →', role: 'outro' }]
      : chars.map(text => ({ text, role: 'content' }));
  return raw.map((card, index) => Object.assign({}, card, { order: index + 1 }));
}
function getTheme(key) { return THEMES[key] || THEMES['handwrite-paper']; }
function buildBigtextTask(input) {
  const sourceText = normalizeSourceText(input && input.sourceText);
  const specs = buildCardSpecs(sourceText);
  const rendered = Array.isArray(input && input.renderedCards) ? input.renderedCards : [];
  if (rendered.length !== specs.length || rendered.some((card, i) => !card || card.text !== specs[i].text || card.order !== specs[i].order || !card.url)) throw new Error('生成卡片不完整，请重试');
  return { taskId: 'text_' + (input.createdAt || Date.now()), mode: 'bigtext', type: 'bigtext', status: 'done', sourceText, themeKey: getTheme(input.themeKey).key, cards: rendered.map((card, i) => Object.assign({}, specs[i], card, { cardId: card.cardId || 'card_' + (i + 1) })), createdAt: input.createdAt || Date.now() };
}
module.exports = { THEMES, normalizeSourceText, buildCardSpecs, getTheme, buildBigtextTask };
```

- [ ] **Step 4: Expand tests and verify pass**

Add a 20-character test, emoji-safe `Array.from` test, unknown-theme fallback test, and a renderer-card count mismatch test.  
Run: `npm test`  
Expected: all existing tests and `text-card.test.cjs` pass.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/textCard.js tests/text-card.test.cjs package.json
git commit -m "feat: add bigtext task model"
```

### Task 2: 云托管手写 PNG 渲染 API

**Files:**
- Create: `miniprogram/cloudhosting/text-card-renderer/package.json`
- Create: `miniprogram/cloudhosting/text-card-renderer/Dockerfile`
- Create: `miniprogram/cloudhosting/text-card-renderer/server.js`
- Create: `miniprogram/cloudhosting/text-card-renderer/renderer.js`
- Create: `miniprogram/cloudhosting/text-card-renderer/fonts/MaShanZheng-Regular.ttf`
- Create: `miniprogram/cloudhosting/text-card-renderer/LICENSES/OFL-MaShanZheng.txt`
- Create: `tests/text-card-renderer.test.cjs`

**Interfaces:**
- Consumes `POST /render` JSON `{ sourceText, themeKey }`.
- Produces `200 { ok: true, cards: [{ cardId, text, role, order, fileId, url }] }`; failures use `400 INVALID_TEXT`, `403 CONTENT_UNSAFE`, `503 SAFETY_UNAVAILABLE`, `500 RENDER_FAILED`.

- [ ] **Step 1: Write failing service tests**

```js
const { createRenderHandler } = require('../miniprogram/cloudhosting/text-card-renderer/server');

test('renderer never calls canvas when the second safety check rejects text', async () => {
  const handler = createRenderHandler({
    checkContent: async () => ({ ok: false, code: 'CONTENT_UNSAFE' }),
    renderCards: async () => { throw new Error('must not render'); }
  });
  const response = await handler({ sourceText: '测试', themeKey: 'handwrite-paper' });
  assert.deepEqual(response, { statusCode: 403, body: { ok: false, code: 'CONTENT_UNSAFE' } });
});
```

- [ ] **Step 2: Run the service test and verify failure**

Run: `node --test tests/text-card-renderer.test.cjs`  
Expected: module-not-found failure for the cloud-hosting server.

- [ ] **Step 3: Implement the renderer with an explicit font registration**

```js
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts/MaShanZheng-Regular.ttf'), 'MaShanZheng');

function drawCard(spec, theme) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = 'rgba(29,26,23,.14)';
  ctx.strokeRect(56, 56, 968, 968);
  ctx.fillStyle = spec.order === spec.total ? theme.accent : theme.foreground;
  ctx.font = spec.role === 'content' ? '720px MaShanZheng' : '132px MaShanZheng';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.text, 540, 540);
  return canvas.toBuffer('image/png');
}
```

The request handler must invoke CloudBase `msgSecCheck` itself, build cards using the same `textCard.js` module copied into the service or an explicitly shared package, upload every buffer under `bigtext/{taskId}/{order}.png`, delete already-uploaded files if a later upload fails, and return no partial `cards` array.

- [ ] **Step 4: Add passing-path and failure-path tests**

Mock `checkContent`, `renderCards`, `uploadBuffer`, and `deleteFile`. Assert that a safe two-character input returns three ordered cards, an upload failure invokes deletion for prior file IDs, and an unknown theme resolves to `handwrite-paper`.  
Run: `node --test tests/text-card-renderer.test.cjs`  
Expected: all service tests pass without CloudBase credentials.

- [ ] **Step 5: Add container build metadata and smoke check**

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
```

Run: `docker build -t wepictool-text-card-renderer miniprogram/cloudhosting/text-card-renderer`  
Expected: image build succeeds.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/cloudhosting/text-card-renderer tests/text-card-renderer.test.cjs
git commit -m "feat: add handwritten card render service"
```

### Task 3: 大字编辑页与首页入口

**Files:**
- Create: `miniprogram/pages/bigtext/bigtext.js`
- Create: `miniprogram/pages/bigtext/bigtext.json`
- Create: `miniprogram/pages/bigtext/bigtext.wxml`
- Create: `miniprogram/pages/bigtext/bigtext.wxss`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/config/env.js`

**Interfaces:**
- Consumes `TEXT_CARD_RENDERER_URL`, `buildCardSpecs`, `buildBigtextTask` and `POST /render`.
- Produces event-channel payload `{ task }` for `pages/template-result/template-result`.

- [ ] **Step 1: Add page registration and a failing local validation test**

Use `buildCardSpecs` in a test to demonstrate the editor preview will show one helper notice for two-character text. Add `pages/bigtext/bigtext` to `app.json`; before implementing the page, `npm run check:miniprogram` must fail because its four page files are absent.

- [ ] **Step 2: Implement the editor data contract and handlers**

```js
data: { sourceText: '', themeKey: 'handwrite-paper', themes: Object.values(THEMES), cardSpecs: [], loading: false, errorText: '' }

onInput(e) { this._refresh(e.detail.value); }
onSelectTheme(e) { this.setData({ themeKey: e.currentTarget.dataset.key }); }
async onGenerate() {
  const sourceText = normalizeSourceText(this.data.sourceText);
  this.setData({ loading: true, errorText: '' });
  const result = await requestRenderer({ sourceText, themeKey: this.data.themeKey });
  const task = buildBigtextTask({ sourceText, themeKey: this.data.themeKey, renderedCards: result.cards, createdAt: Date.now() });
  this._goToResult(task);
}
```

`requestRenderer` must reject missing `TEXT_CARD_RENDERER_URL`, 403 unsafe text, 503 safety unavailable, invalid JSON, non-200 results, and a card response whose text/order does not match `buildCardSpecs`.

- [ ] **Step 3: Implement the editor WXML/WXSS**

Render a 20-character textarea, a live `{{sourceText.length}}/20` counter, theme chips, text previews using ordinary UI fonts, an explicit “已补 N 张引导卡” notice, a disabled state for blank input, and a primary “生成一叠” button. Do not present the preview as an exact handwrite result; only the returned server PNGs are the final visual.

- [ ] **Step 4: Activate only the bigtext module in the home grid**

Replace the `bigtext` item’s badge with “开始制作”, bind it to `onOpenBigtext`, keep every other module routed to `onComingSoon`, and route to `/pages/bigtext/bigtext`.

- [ ] **Step 5: Run structural checks and commit**

Run: `npm test && npm run check:syntax && npm run check:miniprogram`  
Expected: all commands pass.  

```bash
git add miniprogram/pages/bigtext miniprogram/pages/index miniprogram/app.json miniprogram/config/env.js
git commit -m "feat: add bigtext editor entry"
```

### Task 4: 模板结果、微信预览与本地记录

**Files:**
- Create: `miniprogram/pages/template-result/template-result.js`
- Create: `miniprogram/pages/template-result/template-result.json`
- Create: `miniprogram/pages/template-result/template-result.wxml`
- Create: `miniprogram/pages/template-result/template-result.wxss`
- Modify: `miniprogram/pages/preview/preview.js`
- Modify: `miniprogram/pages/record/record.js`
- Modify: `miniprogram/pages/record/record.wxml`
- Modify: `miniprogram/app.json`

**Interfaces:**
- Consumes a `bigtext` task whose `cards` all contain stable `url` values.
- Produces local record `{ type: 'bigtext', text: task.sourceText, totalCount, thumbnails, taskSnapshot }` and the preview contract `{ groups: [{ name: '大字滑卡', cards }] , ratio: '1:1' }`.

- [ ] **Step 1: Write a failing preview contract test**

Add a `previewLayout`-style pure helper test verifying `{ mode: 'bigtext', cards: [{ url: 'a' }, { url: 'b' }, { url: 'c' }] }` maps to exactly one group with three 1:1 cards. The helper must return empty groups for cards without URLs.

- [ ] **Step 2: Implement template result page**

The page must accept `acceptTaskData`, reject malformed or incomplete cards, display one stack with numbered card thumbnails, provide `wx.previewImage`, sequential `wx.saveImageToPhotosAlbum` saving with existing authorization guidance, and navigate to `/pages/preview/preview?taskId=...` using the contract above. On first valid load it writes exactly one history record; returning from preview must not duplicate it.

- [ ] **Step 3: Add a narrowly scoped preview adapter**

At the start of `preview.js` task handling, add:

```js
if (task.mode === 'bigtext') {
  this.setData({ ratio: '1:1' });
  this._renderGroups([{ name: '大字滑卡', cards: task.cards.map(card => ({ url: card.url })) }], '1:1');
  return;
}
```

Keep `GROUP_ORDER`, `normalizeTaskGroups`, and all existing outfit handling unchanged.

- [ ] **Step 4: Route bigtext history records correctly**

`onViewRecord` must open `template-result` for `record.recordType === 'bigtext'`; `onRegenerate` must open `bigtext` and pass `{ sourceText, themeKey }` through the event channel. Update the empty-state CTA copy to “去做一叠图”.

- [ ] **Step 5: Verify the end-to-end local UI contract and commit**

Run: `npm test && npm run check:syntax && npm run check:miniprogram`  
Expected: all checks pass. Manually use a mocked safe renderer response to verify create → result → preview → record → reopen.

```bash
git add miniprogram/pages/template-result miniprogram/pages/preview miniprogram/pages/record miniprogram/app.json tests
git commit -m "feat: add bigtext result and history flow"
```

### Task 5: 文档同步、部署说明与最终回归

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/product/PROJECT_STATUS.md`
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/product/PRD.md`
- Modify: `docs/product/DEVELOPMENT_GUIDE.md`
- Modify: `scripts/check-miniprogram.mjs`

**Interfaces:**
- Documents the actual CloudBase cloud-hosting deployment command, required service URL config, the `bigtext` task shape, and phase-six acceptance.
- The preflight script asserts the bigtext editor/result page files and cloud-hosting manifest exist.

- [ ] **Step 1: Update status and product requirements with minimal changes**

Mark stage three as complete based on user-reported iOS and Android acceptance. Mark stage six “大字滑卡” as implemented and “剧情滑卡” as not started. Do not alter existing requirement IDs or historical analysis.

- [ ] **Step 2: Add deployment instructions**

Document: deploy `text-card-renderer` to CloudBase 云托管; upload `MaShanZheng-Regular.ttf` and its OFL license in the image; set the HTTPS endpoint in `TEXT_CARD_RENDERER_URL`; confirm the service account can call content security and write `bigtext/` objects; run a real safe-text smoke test and an unsafe-text rejection test.

- [ ] **Step 3: Extend preflight and run all verification**

Add exact required paths to `scripts/check-miniprogram.mjs`.  
Run: `npm test && npm run check:syntax && npm run check:miniprogram && npm run lint`  
Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/product scripts/check-miniprogram.mjs
git commit -m "docs: record bigtext card delivery"
```

## Plan Self-Review

- Spec coverage: Tasks 1–4 cover input limits, helper cards, three themes, cloud safety, cloud font rendering, saving, preview, history and retry. Task 5 covers deployment, documentation and regression.
- Placeholders: all runtime interfaces, error codes, files and verification commands are named; no open implementation decision remains.
- Type consistency: `buildBigtextTask` consumes the renderer `cards`; editor, result, preview and history all use `mode/type === 'bigtext'`; all card URLs are named `url`.
