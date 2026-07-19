# 稳定微信预览图片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 放大微信预览中的卡片，并让展开/收起只改变可见性与动效，避免图片节点重建导致白屏。

**Architecture:** `previewLayout.js` 继续作为唯一的比例与舞台尺寸计算入口，将稳定舞台调整为 54vw/150px。预览页在首次渲染时同时保留折叠牌堆、展开首卡及剩余卡片的图片节点；WXML 以 `hidden` 控制可见性，不再以 `wx:if` / `wx:else` 在展开状态切换时创建或销毁卡片。

**Tech Stack:** 原生微信小程序（WXML、WXSS、JavaScript）、Node 内置测试运行器、CommonJS。

## Global Constraints

- 预览页始终为白底聊天界面，标题为 `分享给好友`，时间为 `12:00` / `中午12:00`。
- 稳定舞台宽度为窗口宽度的 54%，最大高度为 150px；所有图片使用 `aspectFit`，且图片比例不得改变消息行高度。
- 展开、收起与卡片滑动不能销毁已有图片节点；所有预览图片关闭懒加载，保证点击前已进入加载队列。
- 维持现有 eventChannel 输入、图片长按、查看大图和横竖手势仲裁能力；不修改结果页或数据结构。

---

### Task 1: 用测试锁定放大后的比例舞台

**Files:**
- Modify: `tests/preview-layout.test.cjs`
- Modify: `miniprogram/utils/previewLayout.js`

**Interfaces:**
- Consumes: `buildPreviewStage(card, fallbackRatio, windowWidth)`。
- Produces: 在 375px 宽窗口中返回 `stageWidth: 203`、`stageHeight: 150`，所有支持比例的卡片高度不超过 150px。

- [x] **Step 1: Write the failing test**

```js
test('uses the enlarged 54vw preview stage while preserving ratio safety', () => {
  ['1:1', '4:5', '3:4'].forEach((ratio) => {
    const stage = buildPreviewStage({ composedRatio: ratio }, '4:5', 375);
    const height = Number(stage.cardStyle.match(/height: (\d+)px/)[1]);
    assert.equal(stage.stageWidth, 203);
    assert.equal(stage.stageHeight, 150);
    assert.ok(height <= 150);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview-layout.test.cjs`

Expected: FAIL because the current 50vw/112px helper cannot return the required enlarged stage.

- [x] **Step 3: Write minimal implementation**

```js
var stageWidth = Math.round(safeWindowWidth * 0.54);
var stageHeight = Math.min(150, Math.round(stageWidth * 0.74));
```

Keep the existing aspect calculation and height cap; only the stable stage geometry changes.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/preview-layout.test.cjs`

Expected: PASS with the new 54vw geometry assertion and all existing ratio tests.

- [x] **Step 5: Commit**

Commit this task together with Task 2 because WXML and WXSS must consume the enlarged stage atomically.

### Task 2: 保留图片节点并以可见性切换展开状态

**Files:**
- Modify: `tests/preview-layout.test.cjs`
- Modify: `miniprogram/pages/preview/preview.wxml`
- Modify: `miniprogram/pages/preview/preview.wxss`

**Interfaces:**
- Consumes: 每个 `g` 的 `expanded`、`leaving`、`nodes`、`cards`、`rest` 和比例样式。
- Produces: 折叠态牌堆使用 `hidden="{{g.expanded}}"`，展开首卡与扩展行使用 `hidden="{{!g.expanded}}"`；所有 `<image>` 都使用 `lazy-load="{{false}}"`。

- [x] **Step 1: Write the failing test**

```js
test('keeps preview images mounted while toggling a group', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxml'), 'utf8');
  assert.match(wxml, /hidden="\{\{g\.expanded\}\}"/);
  assert.match(wxml, /hidden="\{\{!g\.expanded\}\}"/);
  assert.doesNotMatch(wxml, /<view wx:else class="xcard"/);
  assert.doesNotMatch(wxml, /<block wx:if="\{\{g\.expanded\}\}"/);
  assert.doesNotMatch(wxml, /lazy-load="\{\{true\}\}"/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/preview-layout.test.cjs`

Expected: FAIL because the current markup destroys the folded or expanded image branch through `wx:if` / `wx:else` and retains lazy loading.

- [x] **Step 3: Write minimal implementation**

Replace the mutually exclusive folded/expanded branches with sibling elements. Render the stack, expanded front card, and every `g.rest` row for the lifetime of the page. Apply `hidden` to exclude inactive elements from layout while retaining their already-created image nodes. Keep failure placeholders controlled by each card's existing `err` value, and replace each preview image's `lazy-load="{{true}}"` with `lazy-load="{{false}}"`.

Update WXSS to use `min-height: 164px`, move the capsule to `left: 24px; top: 75px`, and retain existing transform/opacity animation styles on visible expanded rows.

- [x] **Step 4: Run tests and syntax validation**

Run: `node --test tests/preview-layout.test.cjs && npm run check:syntax`

Expected: PASS; no syntax errors in the updated preview page.

- [x] **Step 5: Commit**

```bash
git add miniprogram/utils/previewLayout.js miniprogram/pages/preview/preview.wxml miniprogram/pages/preview/preview.wxss tests/preview-layout.test.cjs
git commit -m "fix: keep preview images stable while toggling"
```

### Task 3: 同步契约说明并全量验证

**Files:**
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/product/PROJECT_STATUS.md`
- Modify: `docs/superpowers/plans/2026-07-19-preview-stable-images.md`

**Interfaces:**
- Consumes: Task 1 的尺寸、Task 2 的常驻节点策略。
- Produces: 产品契约和状态记录反映 54vw/150px、164px 行高与无节点重建的展开逻辑。

- [x] **Step 1: Update documents**

In `TECHNICAL_SPEC.md` update the preview geometry to 54vw/max 150px and 164px message rows, and state that expand/collapse uses retained, preloaded nodes rather than conditional node removal. In `PROJECT_STATUS.md`, append a dated status note describing the enlarged card size and white-flash prevention.

- [x] **Step 2: Run full verification**

Run: `npm test && npm run lint && npm run check:syntax && npm run check:miniprogram && git diff --check`

Expected: all commands exit with code 0 and the diff contains no whitespace errors.

- [x] **Step 3: Commit documentation**

```bash
git add docs/product/TECHNICAL_SPEC.md docs/product/PROJECT_STATUS.md docs/superpowers/plans/2026-07-19-preview-stable-images.md
git commit -m "docs: record stable preview image rendering"
```
