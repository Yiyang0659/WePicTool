# 大字滑卡粗颗粒马克笔白卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将大字滑卡的最终 PNG 改为带颗粒笔触、轻微不规则排版和原创贴纸的粗马克笔白卡。

**Architecture:** 新增纯 `markerCard` 模块，依据稳定种子计算字位、角度、缩放和贴纸位置；云托管渲染器消费该布局并使用 LXGW WenKai、加粗描边与 alpha 颗粒生成 PNG。编辑页只复用同一布局做排版示意，最终视觉仍仅来自云端 PNG。

**Tech Stack:** 原生微信小程序 JS/WXML/WXSS、CloudBase 云托管 Node.js、`@napi-rs/canvas`、Node 内置测试运行器、SIL OFL 1.1 字体。

## Global Constraints

- 最终字卡为 1080 × 1080 PNG、纯白 `#FFFFFF` 背景、56px 圆角、无边框、无阴影。
- 使用 LXGW WenKai（OFL 1.1）作底字形；不得使用马善政作为最终字卡字体。
- 内容字近黑 `#171717`，加粗描边、圆角连接、2%–4% 内部颗粒、90%–100% 墨色透明度。
- 内容字旋转 -3° 至 3°、缩放 94% 至 106%、X/Y 偏移各不超过 42px；文字不可裁切。
- 每张卡使用一枚原创涂鸦贴纸；不得使用蜡笔小新或任何第三方角色、人物、头像或聊天截图。
- 布局参数必须由 `taskId + order` 稳定生成；同一任务重新打开时视觉不变。
- 保持文本 `msgSecCheck`、输入限制、失败回滚、保存、预览、历史记录的既有行为不变，不引入 AI 生图。
- 当前 `miniprogram/pages/bigtext/` 存在用户未提交改动；实施前先保存其 diff，后续只在人工核对后合并所需改动，绝不覆盖。

---

## File Structure

- `miniprogram/utils/markerCard.js`：纯随机种子、字形布局参数、贴纸选择和编辑页预览数据。
- `miniprogram/cloudhosting/text-card-renderer/markerCard.js`：与小程序纯模块一致的 CommonJS 副本，供容器使用。
- `miniprogram/cloudhosting/text-card-renderer/stickers.js`：12 枚原创贴纸的 Canvas 绘制函数及尺寸元数据。
- `miniprogram/cloudhosting/text-card-renderer/renderer.js`：注册 LXGW WenKai，绘制圆角白卡、粗笔字、颗粒与贴纸。
- `miniprogram/cloudhosting/text-card-renderer/fonts/LXGWWenKai-Regular.ttf`：OFL 字体文件。
- `miniprogram/cloudhosting/text-card-renderer/LICENSES/OFL-LXGWWenKai.txt`：字体许可证文本。
- `miniprogram/pages/bigtext/*`：将默认主题文案和本地排版示意改成马克笔白卡。
- `tests/marker-card.test.cjs`：稳定种子、参数边界、贴纸避让规则。
- `tests/text-card-renderer.test.cjs`：渲染器向每张卡传入稳定布局、保持原子上传回滚。
- `miniprogram/pages/bigtext/bigtext.js`：生成并传入稳定 `taskId`，将服务返回的同一 `taskId` 写入本地任务。

### Task 1: 稳定马克笔布局模型

**Files:**
- Create: `miniprogram/utils/markerCard.js`
- Create: `miniprogram/cloudhosting/text-card-renderer/markerCard.js`
- Create: `tests/marker-card.test.cjs`

**Interfaces:**
- Produces `buildMarkerCardStyle({ taskId, order, role, text })` → `{ rotation, scale, offsetX, offsetY, stickerKey, stickerCorner, stickerSize }`.
- Produces `buildMarkerPreviewCards({ taskId, cards })` → cards enriched with `style` for WXML only.
- `rotation` is `[-3, 3]`, `scale` is `[0.94, 1.06]`, `offsetX/offsetY` are `[-42, 42]`; `stickerCorner` is one of `top-right`, `bottom-right`.

- [ ] **Step 1: Write failing layout tests**

```js
const { buildMarkerCardStyle } = loadMiniProgramModule('miniprogram/utils/markerCard.js');

test('marker style is stable for the same task and card', () => {
  const first = plain(buildMarkerCardStyle({ taskId: 'text_100', order: 2, role: 'content', text: '今' }));
  const second = plain(buildMarkerCardStyle({ taskId: 'text_100', order: 2, role: 'content', text: '今' }));
  assert.deepEqual(first, second);
});

test('marker styles stay inside the approved irregularity limits', () => {
  const style = buildMarkerCardStyle({ taskId: 'text_100', order: 3, role: 'content', text: '心' });
  assert.ok(style.rotation >= -3 && style.rotation <= 3);
  assert.ok(style.scale >= 0.94 && style.scale <= 1.06);
  assert.ok(Math.abs(style.offsetX) <= 42 && Math.abs(style.offsetY) <= 42);
  assert.ok(['top-right', 'bottom-right'].includes(style.stickerCorner));
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/marker-card.test.cjs`  
Expected: FAIL because `markerCard.js` does not exist.

- [ ] **Step 3: Implement a seeded layout generator**

```js
function hashSeed(value) {
  return Array.from(String(value)).reduce((hash, char) => ((hash * 31) + char.codePointAt(0)) >>> 0, 2166136261);
}
function randomBetween(seed, min, max) {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return { seed: next, value: min + (next / 0x100000000) * (max - min) };
}
function buildMarkerCardStyle(input) {
  let seed = hashSeed(`${input.taskId}:${input.order}:${input.text}`);
  const rotation = randomBetween(seed, -3, 3); seed = rotation.seed;
  const scale = randomBetween(seed, 0.94, 1.06); seed = scale.seed;
  const offsetX = randomBetween(seed, -42, 42); seed = offsetX.seed;
  const offsetY = randomBetween(seed, -42, 42); seed = offsetY.seed;
  const stickerIndex = randomBetween(seed, 0, 12); seed = stickerIndex.seed;
  const stickerCorner = randomBetween(seed, 0, 1).value < 0.5 ? 'top-right' : 'bottom-right';
  return { rotation: rotation.value, scale: scale.value, offsetX: offsetX.value, offsetY: offsetY.value, stickerKey: `sticker_${Math.floor(stickerIndex.value)}`, stickerCorner, stickerSize: 132 };
}
```

Copy this same source to the CommonJS cloud-hosting module; do not import mini-program files from the container.

- [ ] **Step 4: Run the focused test and full suite**

Run: `node --test tests/marker-card.test.cjs && npm test`  
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/utils/markerCard.js miniprogram/cloudhosting/text-card-renderer/markerCard.js tests/marker-card.test.cjs
git commit -m "feat: add stable marker card layout"
```

### Task 2: 云端粗笔渲染与原创贴纸

**Files:**
- Modify: `miniprogram/cloudhosting/text-card-renderer/renderer.js`
- Create: `miniprogram/cloudhosting/text-card-renderer/stickers.js`
- Create: `miniprogram/cloudhosting/text-card-renderer/fonts/LXGWWenKai-Regular.ttf`
- Create: `miniprogram/cloudhosting/text-card-renderer/LICENSES/OFL-LXGWWenKai.txt`
- Delete: `miniprogram/cloudhosting/text-card-renderer/fonts/MaShanZheng-Regular.ttf`
- Delete: `miniprogram/cloudhosting/text-card-renderer/LICENSES/OFL-MaShanZheng.txt`
- Modify: `tests/text-card-renderer.test.cjs`

**Interfaces:**
- `POST /render` consumes `{ taskId, sourceText, themeKey }` and returns `{ ok: true, taskId, themeKey, cards }`.
- `createPngMaker()` returns `async function makePng(spec, theme, taskId): Promise<Buffer>`.
- `drawSticker(ctx, style, cardBounds)` draws exactly one original sticker in the selected safe corner.
- `createCardRenderer` passes `taskId` through to `makePng` and `uploadBuffer`, and preserves its existing all-or-nothing upload contract.

- [ ] **Step 1: Add a failing renderer contract test**

```js
test('renderer gives every PNG maker call the stable task id', async () => {
  const taskIds = [];
  const renderCards = rendererModule.createCardRenderer({
    makePng: async (spec, theme, taskId) => { taskIds.push(`${taskId}:${spec.order}`); return Buffer.from(spec.text); },
    uploadBuffer: async (buffer, spec) => ({ fileId: `cloud://${spec.order}.png`, url: `https://example.test/${spec.order}.png` }),
    deleteFile: async () => undefined
  });
  await renderCards([{ text: '今', role: 'content', order: 1 }], { key: 'handwrite-paper' }, 'text_100');
  assert.deepEqual(taskIds, ['text_100:1']);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/text-card-renderer.test.cjs`  
Expected: FAIL because `createCardRenderer` does not accept or forward `taskId`.

- [ ] **Step 3: Make the render task id stable from the request boundary**

Modify the service request path so it accepts the client-generated `taskId` when it matches `/^text_[A-Za-z0-9_-]{6,80}$/`; otherwise it creates `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`. Pass that one value to `renderCards(specs, theme, taskId)`, return it in the 200 response body, and use it for storage path `bigtext/{taskId}/{order}.png`. Do not generate a separate folder prefix inside each upload call.

```js
const safeTaskId = /^text_[A-Za-z0-9_-]{6,80}$/.test(input.taskId)
  ? input.taskId
  : `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const cards = await renderCards(specs, theme, safeTaskId);
return { statusCode: 200, body: { ok: true, taskId: safeTaskId, themeKey: theme.key, cards } };
```

- [ ] **Step 4: Replace the visual renderer**

Register `LXGWWenKai-Regular.ttf` as `LXGWWenKai`. For content cards, draw filled and stroked text inside a saved transform:

```js
ctx.save();
ctx.translate(540 + style.offsetX, 540 + style.offsetY);
ctx.rotate(style.rotation * Math.PI / 180);
ctx.scale(style.scale, style.scale);
ctx.font = '650px LXGWWenKai';
ctx.lineJoin = 'round';
ctx.lineCap = 'round';
ctx.fillStyle = '#171717';
ctx.strokeStyle = '#171717';
ctx.lineWidth = 26;
ctx.strokeText(spec.text, 0, 0);
ctx.fillText(spec.text, 0, 0);
ctx.restore();
```

Render the card background with a rounded clipping path. Build an offscreen glyph alpha mask, punch 2%–4% seeded 1px–3px transparent flecks only where alpha is nonzero, then composite the resulting glyph over the card. Draw an original sticker after the glyph using `drawSticker`; its safe corner is opposite the text’s largest occupied quadrant when the corner would intersect the glyph bounds.

- [ ] **Step 5: Implement twelve original stickers**

In `stickers.js`, expose `drawSticker(ctx, key, x, y, size, rotation)` and implement `sticker_0` through `sticker_11` using Canvas paths only: star, smile, heart, flower, lightning, rainbow, cat face, bear face, cherry, sun, sparkle, speech bubble. Each uses 2–4 flat colors and no external image files.

- [ ] **Step 6: Run the cloud renderer tests**

Run: `node --test tests/text-card-renderer.test.cjs && npm test`  
Expected: safe, unsafe, safety-unavailable, rollback and task-id forwarding tests all pass.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/cloudhosting/text-card-renderer tests/text-card-renderer.test.cjs
git commit -m "feat: render marker-style bigtext cards"
```

### Task 3: 编辑页马克笔白卡示意

**Files:**
- Modify: `miniprogram/utils/textCard.js`
- Modify: `miniprogram/pages/bigtext/bigtext.js`
- Modify: `miniprogram/pages/bigtext/bigtext.wxml`
- Modify: `miniprogram/pages/bigtext/bigtext.wxss`
- Modify: `tests/text-card.test.cjs`

**Interfaces:**
- `THEMES['handwrite-paper'].label` becomes `马克笔白卡` while its key remains `handwrite-paper` for API compatibility.
- `refreshDraft` consumes `buildMarkerPreviewCards({ taskId: 'draft', cards: buildCardSpecs(sourceText) })` and exposes `previewStyle` and `stickerKey` per card.
- `onGenerate` creates `taskId = text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, sends it to the renderer, and passes the returned `taskId` into `buildBigtextTask`.

- [ ] **Step 1: Write a failing theme compatibility test**

```js
test('default bigtext theme keeps its API key and uses the marker-card label', () => {
  assert.equal(textCard.getTheme('handwrite-paper').key, 'handwrite-paper');
  assert.equal(textCard.getTheme('handwrite-paper').label, '马克笔白卡');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/text-card.test.cjs`  
Expected: FAIL because the current label is `手写纸卡`.

- [ ] **Step 3: Preserve and reconcile user edits before editing the page**

Run `git diff -- miniprogram/pages/bigtext/` and save the output in the task notes. Apply only the following changes on top of the existing local modifications: change the default label, use `buildMarkerPreviewCards`, render a small generated CSS doodle badge in each preview card, remove the serif/书法 wording, and update the preview disclaimer to `排版与贴纸预览，最终笔触以生成图为准`.

- [ ] **Step 4: Update WXML/WXSS**

Keep the current input and theme controls. For every `.draft-card`, apply `style="{{item.previewStyle}}"`, use a clean white background and 18rpx radius, set `.draft-content` to a bold generic sans-serif fallback (not `MaShanZheng`), and add a small `<view class="draft-sticker sticker-{{item.stickerKey}}"></view>` in the selected corner. This is a layout cue only; the final cloud PNG owns the actual texture.

Update `requestRenderer` so it resolves `{ taskId, cards }` after validating `body.cards`, rather than resolving only the cards array. In `onGenerate`, create the task id once, call `requestRenderer({ taskId, sourceText, themeKey })`, and call `buildBigtextTask({ taskId: response.taskId, sourceText, themeKey, renderedCards: response.cards, createdAt: Date.now() })`.

- [ ] **Step 5: Run tests and structural checks**

Run: `npm test && npm run check:syntax && npm run check:miniprogram`  
Expected: all commands exit 0 and no WXML function call is introduced.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/utils/textCard.js miniprogram/pages/bigtext tests/text-card.test.cjs
git commit -m "feat: preview marker-style bigtext cards"
```

### Task 4: 部署资产与视觉回归说明

**Files:**
- Modify: `README.md`
- Modify: `docs/product/PROJECT_STATUS.md`
- Modify: `scripts/check-miniprogram.mjs`

**Interfaces:**
- Preflight requires `LXGWWenKai-Regular.ttf`, its OFL file and `stickers.js`.
- Deployment instructions identify the new font and clarify that a cloud-hosting redeploy is required before the visual change appears.

- [ ] **Step 1: Add preflight requirements**

Add these exact paths to the bigtext required paths array:

```js
'miniprogram/cloudhosting/text-card-renderer/markerCard.js',
'miniprogram/cloudhosting/text-card-renderer/stickers.js',
'miniprogram/cloudhosting/text-card-renderer/fonts/LXGWWenKai-Regular.ttf',
'miniprogram/cloudhosting/text-card-renderer/LICENSES/OFL-LXGWWenKai.txt'
```

- [ ] **Step 2: Update deployment and acceptance documentation**

State that `text-card-renderer` must be redeployed after the visual change. Add the fixed acceptance sample `今、你、开、心` and verify: rough black marker texture, different but restrained layout on all four cards, one original sticker per card, readable 375px preview, successful save/preview/history, and no generation for rejected or unavailable safety checks.

- [ ] **Step 3: Run the release checks**

Run: `npm test && npm run check:syntax && npm run check:miniprogram && npm run lint`  
Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/product/PROJECT_STATUS.md scripts/check-miniprogram.mjs
git commit -m "docs: document marker card deployment"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 implement stable irregular layout, rough marker rendering, white cards, original stickers, font licensing, safety-preserving cloud generation and atomic uploads. Task 3 covers the local preview distinction. Task 4 covers deployment and all acceptance checks.
- Placeholder scan: no unassigned font, asset, API, visual range or test command remains.
- Type consistency: both app and container use `buildMarkerCardStyle`; `createCardRenderer(specs, theme, taskId)`, `makePng(spec, theme, taskId)`, storage and the client-created `text_*` task id all use the same stable identifier.
