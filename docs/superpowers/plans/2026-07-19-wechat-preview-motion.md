# 微信预览页动效与比例兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native mini-program preview render a white WeChat-style three-group card stack with smooth swipe/expand motion and safe mixed-image-ratio presentation.

**Architecture:** Extract deterministic preview-frame calculations into a CommonJS helper so Node tests cover the ratio and geometry rules. `pages/preview` consumes that helper to build fixed-size per-group stages; WXML receives precomputed styles and WXSS owns transform-only motion. The existing eventChannel, save, long-press, and viewer contracts remain intact.

**Tech Stack:** Native WeChat Mini Program (WXML/WXSS/JavaScript), Node built-in test runner, CommonJS.

## Global Constraints

- Preview always renders the user-approved white chat surface, with the title `分享给好友` and time `12:00` / `中午12:00`.
- Each group has a stable 50vw interaction stage, capped at 112px visual height; source images use `aspectFit` and never alter group row height while swiping.
- Static stacks expose the two back cards from opposite sides; all swipe and stack motion uses only `transform` and `opacity`.
- Preserve existing eventChannel task input, long-press action sheet, viewer, saving, and horizontal-vs-vertical gesture arbitration.

---

### Task 1: Add tested preview geometry helpers

**Files:**
- Create: `miniprogram/utils/previewLayout.js`
- Create: `tests/preview-layout.test.cjs`

**Interfaces:**
- Produces `resolvePreviewRatio(card, fallbackRatio)`, returning one of `1:1`, `4:5`, `3:4`, or `source`.
- Produces `buildPreviewStage(card, fallbackRatio, windowWidth)`, returning `{ ratio, stageWidth, stageHeight, cardStyle }`.

- [ ] **Step 1: Write the failing tests**

```js
const { resolvePreviewRatio, buildPreviewStage } = loadMiniProgramModule('miniprogram/utils/previewLayout.js');

test('prefers a card composed ratio over the task fallback', () => {
  assert.equal(resolvePreviewRatio({ composedRatio: '3:4' }, '4:5'), '3:4');
});

test('keeps an unknown source image inside the stable preview stage', () => {
  assert.deepEqual(plain(buildPreviewStage({ width: 3000, height: 1000 }, '4:5', 375)), {
    ratio: 'source', stageWidth: 188, stageHeight: 112,
    cardStyle: 'width: 188px; height: 63px;'
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/preview-layout.test.cjs`

Expected: FAIL because `miniprogram/utils/previewLayout.js` does not exist.

- [ ] **Step 3: Implement the smallest pure helper**

```js
var RATIO_MAP = { '1:1': 1, '4:5': 0.8, '3:4': 0.75 };

function resolvePreviewRatio(card, fallbackRatio) {
  if (card && RATIO_MAP[card.composedRatio]) return card.composedRatio;
  if (card && RATIO_MAP[card.ratio]) return card.ratio;
  if (RATIO_MAP[fallbackRatio]) return fallbackRatio;
  return 'source';
}

function buildPreviewStage(card, fallbackRatio, windowWidth) {
  var stageWidth = Math.round(windowWidth * 0.5);
  var stageHeight = Math.min(112, Math.round(stageWidth * 0.61));
  var ratio = resolvePreviewRatio(card, fallbackRatio);
  var aspect = RATIO_MAP[ratio] || ((card && card.width && card.height) ? card.width / card.height : 1);
  var width = stageWidth;
  var height = Math.round(width / aspect);
  if (height > stageHeight) { height = stageHeight; width = Math.round(height * aspect); }
  return { ratio: ratio, stageWidth: stageWidth, stageHeight: stageHeight, cardStyle: 'width: ' + width + 'px; height: ' + height + 'px;' };
}

module.exports = { resolvePreviewRatio: resolvePreviewRatio, buildPreviewStage: buildPreviewStage };
```

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run: `node --test tests/preview-layout.test.cjs`

Expected: PASS with the composed-ratio, source-ratio, and height-cap assertions.

### Task 2: Connect preview data to stable ratio-aware stages

**Files:**
- Modify: `miniprogram/pages/preview/preview.js:1-360`
- Modify: `miniprogram/pages/preview/preview.wxml:3-170`

**Interfaces:**
- Consumes `buildPreviewStage(card, ratio, windowWidth)` from Task 1.
- Produces `g.stageStyle`, node `cardStyle`, and each expanded-card `cardStyle` for WXML.

- [ ] **Step 1: Write a failing page-contract test**

```js
test('preview stage helper keeps 3:4, 4:5 and source cards within the same 50vw stage', () => {
  ['3:4', '4:5', '1:1'].forEach((ratio) => {
    const stage = buildPreviewStage({ composedRatio: ratio }, '4:5', 375);
    assert.equal(stage.stageWidth, 188);
    assert.ok(Number(stage.cardStyle.match(/height: (\d+)px/)[1]) <= 112);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/preview-layout.test.cjs`

Expected: FAIL because the three-ratio case is not yet covered.

- [ ] **Step 3: Update preview data construction and markup**

Require the helper, capture `windowWidth` in `onLoad`, and pass each original card object through `_renderGroups`. For each card, attach the helper result; set the group stage to the fixed stage size and use each result’s `cardStyle` on the fixed card node. Replace `ratioClass` sizing with stage/card inline styles, set every `<image>` to `mode="aspectFit"`, and keep fixed node identities unchanged when positions rotate.

- [ ] **Step 4: Run the test and syntax checks**

Run: `node --test tests/preview-layout.test.cjs && npm run check:syntax`

Expected: PASS; syntax check exits 0.

### Task 3: Apply the approved white layout and smoother interaction constants

**Files:**
- Modify: `miniprogram/pages/preview/preview.wxml:3-170`
- Modify: `miniprogram/pages/preview/preview.wxss:1-460`
- Modify: `miniprogram/pages/preview/preview.js:12-320`
- Modify: `docs/product/TECHNICAL_SPEC.md:617-684`

**Interfaces:**
- Consumes Task 2’s `stageStyle` and `cardStyle` fields.
- Keeps `onStackTouchStart`, `onStackTouchMove`, `_releaseStack`, `_flyOut`, and `onToggleCapsule` as their existing page event interface.

- [ ] **Step 1: Write the failing static contract checks**

```js
test('preview markup is the approved white 分享给好友 chat shell', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/preview/preview.wxml'), 'utf8');
  assert.match(wxml, /分享给好友/);
  assert.doesNotMatch(wxml, /theme-toggle|模拟预览/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/preview-layout.test.cjs`

Expected: FAIL because the previous preview still has the old navigation title and disclaimer.

- [ ] **Step 3: Implement the approved motion and presentation shell**

Remove the disclaimer/theme controls and scripted friend bubbles. Render title `分享给好友`, display `12:00` and `中午12:00`, use white chat/nav/input surfaces, set rows to 122px, set stage width to 50vw, set back-card transforms to `translateX(-8px) rotate(-.7deg) scale(.97)` and `translateX(13px) rotate(1.1deg) scale(.94)`, move the capsule close to the stage, and use the approval constants: 20% distance threshold, `0.28px/ms` flick threshold, 240ms `cubic-bezier(.18,.82,.2,1)` return/bump, 220ms fly-out, and 220ms/45ms expand stagger. Preserve long-press behavior and the viewer.

- [ ] **Step 4: Update the technical contract**

Replace §12.6’s old 58vw/right-only/dark-theme wording with the accepted 50vw, dual-side, white, ratio-safe contract and its updated timing values.

- [ ] **Step 5: Run all automated checks**

Run: `npm test && npm run check:syntax && npm run check:miniprogram`

Expected: all commands exit 0.

### Task 4: Manual interaction verification and documentation sync

**Files:**
- Modify: `docs/product/PROJECT_STATUS.md`

**Interfaces:**
- Consumes the completed preview page from Tasks 1-3.
- Produces a dated status entry naming this preview improvement and its remaining iOS/Android verification.

- [ ] **Step 1: Verify in WeChat Developer Tools at 375px width**

Open the local sample task, navigate to 微信预览, and confirm three folded groups plus input bar appear together. Repeat with 1:1, 4:5, 3:4 and an original-image fallback; confirm no crop, no stretch, no layout jump.

- [ ] **Step 2: Verify each interaction**

Slow-drag a card below 20% and confirm return. Fast-flick in each direction and confirm fly-out/cyclic replacement. Repeat while vertically scrolling. Expand and collapse every group, long-press one folded and one expanded card, then open/close the full-screen viewer.

- [ ] **Step 3: Record the completed implementation state**

Append a dated `PROJECT_STATUS.md` update stating the white `分享给好友` shell, 12:00, stable ratio-safe stage, dual-sided stack, and revised swipe/expand motion are implemented; leave iOS/Android device acceptance explicitly pending.

- [ ] **Step 4: Commit implementation and docs**

Run: `git add miniprogram/utils/previewLayout.js tests/preview-layout.test.cjs miniprogram/pages/preview/preview.js miniprogram/pages/preview/preview.wxml miniprogram/pages/preview/preview.wxss docs/product/TECHNICAL_SPEC.md docs/product/PROJECT_STATUS.md docs/superpowers/plans/2026-07-19-wechat-preview-motion.md && git commit -m "feat: refine wechat preview motion"`

Expected: one implementation commit; `.superpowers/` remains untracked and excluded.
