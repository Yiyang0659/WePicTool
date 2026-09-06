# 分层云换装首版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有小程序中交付一个可运行的「分层云换装」首版，支持内置素材直接试玩、用户按部位上传、系统/用户素材混用、删除排序、四叠独立预览、按组保存和微信发送引导。

**Architecture:** 新增独立的 `layered-dressup` 项目模型与玩法注册表，不扩展当前三组 `outfit` 任务契约。新页面负责本地素材编辑与项目持久化，现有 `preview` 页面继续作为多叠独立滑动预览，现有 AI 穿搭处理入口保留为首页次级能力。

**Tech Stack:** 原生微信小程序、CommonJS 纯函数模块、Node.js `node:test`、本地 Storage、现有微信相册与文件系统 API。

**Spec:** `docs/superpowers/specs/2026-08-31-layered-dressup-template-system-design.md`

## Global Constraints

- 固定四组：`head`、`tops`、`bottoms`、`shoes`；每组最多 12 张。
- 微信叠图阈值固定为每组至少 3 张；不足时只能补图、补系统素材或跳过，不加入封面/教程/空白卡。
- 支持 `demo`、`upload`、`mixed` 三种项目来源；AI 不是完成路径的前置条件。
- 不做真实 AI 试穿、复杂画布编辑器、账号、付费或云端长期同步。
- 小程序不承诺多图直发微信，只提供按组保存和发送顺序引导。
- 内置素材只使用项目已有素材和本次自制的抽象头像素材，并记录 `project-owned` 来源。
- 所有生产代码遵循测试先行；每次测试先观察预期失败，再写最小实现。

---

### Task 1: 玩法和素材包注册表

**Files:**
- Create: `miniprogram/config/playRegistry.js`
- Create: `tests/layered-dressup.test.cjs`

**Interfaces:**
- Produces: `GROUP_DEFINITIONS: Array<{key,title,emoji,maxCount}>`
- Produces: `PLAY_REGISTRY: Array<PlayDefinition>`
- Produces: `ASSET_PACKS: Array<AssetPack>`
- Produces: `getPlayDefinition(playId): PlayDefinition|null`
- Produces: `getAssetPack(packId): AssetPack|null`
- Produces: `validateAssetPack(pack): {valid:boolean, errors:string[]}`

- [ ] **Step 1: Write the failing registry tests**

Add tests that load `playRegistry.js` in a VM and assert literal behavior:

```js
test('registers layered dressup with the four ordered groups', () => {
  const play = registry.getPlayDefinition('layered-dressup');
  assert.deepEqual(plain(play.groupSchema), ['head', 'tops', 'bottoms', 'shoes']);
  assert.deepEqual(plain(play.entryModes), ['demo', 'upload', 'mixed']);
});

test('rejects an asset pack with a group below the WeChat stack threshold', () => {
  const pack = plain(registry.getAssetPack('funny-paper-doll-v1'));
  pack.groups.head = pack.groups.head.slice(0, 2);
  const result = registry.validateAssetPack(pack);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /head.*3/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: FAIL because `miniprogram/config/playRegistry.js` does not exist.

- [ ] **Step 3: Implement the registry**

Define the four ordered groups, one available play, and `funny-paper-doll-v1`. The pack uses `/assets/samples/head1.png` through `head3.png` plus the existing `top1..3.jpg`, `bottom1..3.jpg`, and `shoe1..3.jpg`. Each asset has `id`, `groupKey`, `title`, `url`, `width`, `height`, and `license: 'project-owned'`.

`validateAssetPack` must reject missing groups, groups below 3, groups above 12, duplicate asset IDs, or assets whose `groupKey` does not match the group bucket.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: all registry tests PASS.

- [ ] **Step 5: Commit the registry**

```bash
git add miniprogram/config/playRegistry.js tests/layered-dressup.test.cjs
git commit -m "feat: add layered dressup registry"
```

### Task 2: 分层换装项目模型与编辑规则

**Files:**
- Create: `miniprogram/utils/layeredDressup.js`
- Modify: `tests/layered-dressup.test.cjs`

**Interfaces:**
- Consumes: `getAssetPack(packId)` and `GROUP_DEFINITIONS` from `playRegistry.js`
- Produces: `createProject(options): LayeredProject`
- Produces: `addItems(project, groupKey, items, source): LayeredProject`
- Produces: `removeItem(project, groupKey, itemId): LayeredProject`
- Produces: `moveItem(project, groupKey, fromIndex, toIndex): LayeredProject`
- Produces: `buildSendability(project): {groups, validGroupCount, canExport}`
- Produces: `buildPreviewGroups(project): Array<{key,name,cards}>`
- Produces: `serializeProject(project): LayeredProject`

- [ ] **Step 1: Write failing project behavior tests**

Cover these independent, literal behaviors:

```js
test('creates a complete demo project from the built-in pack', () => {
  const project = dressup.createProject({ sourceMode: 'demo', templateId: 'funny-paper-doll-v1', now: 1000 });
  assert.equal(project.playId, 'layered-dressup');
  assert.equal(project.groups.head.length, 3);
  assert.equal(project.groups.tops.length, 3);
  assert.equal(project.groups.bottoms.length, 3);
  assert.equal(project.groups.shoes.length, 3);
  assert.equal(dressup.buildSendability(project).validGroupCount, 4);
});

test('adding user material changes demo source to mixed and caps a group at twelve', () => {
  const project = dressup.createProject({ sourceMode: 'demo', templateId: 'funny-paper-doll-v1', now: 1000 });
  const additions = Array.from({ length: 12 }, (_, i) => ({ id: `user_${i}`, url: `/tmp/${i}.jpg` }));
  const next = dressup.addItems(project, 'tops', additions, 'user');
  assert.equal(next.sourceMode, 'mixed');
  assert.equal(next.groups.tops.length, 12);
});

test('removing the third card makes that group non-stackable without padding it', () => {
  const project = dressup.createProject({ sourceMode: 'demo', templateId: 'funny-paper-doll-v1', now: 1000 });
  const next = dressup.removeItem(project, 'head', project.groups.head[2].id);
  assert.equal(next.groups.head.length, 2);
  assert.equal(dressup.buildSendability(next).groups.head.mode, 'normal');
});

test('moving an item changes the first card used by preview', () => {
  const project = dressup.createProject({ sourceMode: 'demo', templateId: 'funny-paper-doll-v1', now: 1000 });
  const expected = project.groups.shoes[2].url;
  const next = dressup.moveItem(project, 'shoes', 2, 0);
  assert.equal(dressup.buildPreviewGroups(next)[3].cards[0].url, expected);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: FAIL because `layeredDressup.js` is missing.

- [ ] **Step 3: Implement immutable project operations**

All editing functions return a fresh project and group arrays. Normalize user items to:

```js
{
  id: 'user_<timestamp>_<index>',
  groupKey: 'tops',
  source: 'user',
  title: '上衣 1',
  url: '/tmp/1.jpg',
  localPath: '/tmp/1.jpg',
  width: 0,
  height: 0,
  order: 1
}
```

`buildPreviewGroups` excludes empty groups but retains groups with 1–2 cards so the preview can state the real content; page export filters using `buildSendability`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: all registry and project tests PASS.

- [ ] **Step 5: Commit the model**

```bash
git add miniprogram/utils/layeredDressup.js tests/layered-dressup.test.cjs
git commit -m "feat: add layered dressup project model"
```

### Task 3: 自制头像示例素材与素材完整性

**Files:**
- Create: `miniprogram/assets/samples/head1.png`
- Create: `miniprogram/assets/samples/head2.png`
- Create: `miniprogram/assets/samples/head3.png`
- Modify: `tests/layered-dressup.test.cjs`

**Interfaces:**
- Consumes: exact local paths declared by `funny-paper-doll-v1`
- Produces: three 640×640 PNG files with simple project-owned abstract head/hairstyle illustrations

- [ ] **Step 1: Write the failing asset integrity test**

For every URL in the registered pack, resolve it under `miniprogram/`, assert the file exists and has non-zero size. For the three head files, assert the PNG signature and dimensions are 640×640 by reading the IHDR bytes.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: FAIL listing the missing `head1.png`, `head2.png`, and `head3.png`.

- [ ] **Step 3: Create the head assets**

Generate three original, flat, abstract paper-doll heads on a plain off-white square background. Each varies only in hair silhouette and accent color; no brand, celebrity, copyrighted character, text, or copied reference composition. Store the generation provenance in the iteration log.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: the pack integrity and dimension tests PASS.

- [ ] **Step 5: Commit the assets**

```bash
git add miniprogram/assets/samples/head1.png miniprogram/assets/samples/head2.png miniprogram/assets/samples/head3.png tests/layered-dressup.test.cjs
git commit -m "feat: add paper doll head samples"
```

### Task 4: 分层换装编辑页

**Files:**
- Create: `miniprogram/pages/dressup/dressup.js`
- Create: `miniprogram/pages/dressup/dressup.json`
- Create: `miniprogram/pages/dressup/dressup.wxml`
- Create: `miniprogram/pages/dressup/dressup.wxss`
- Modify: `miniprogram/app.json`
- Modify: `package.json`
- Modify: `tests/layered-dressup.test.cjs`

**Interfaces:**
- Consumes: registry and project operations from Tasks 1–2
- Emits to preview page: `{groups: buildPreviewGroups(project), ratio: '4:5'}` through `eventChannel`
- Persists: key `wepictool_layered_dressup_draft_v1`

- [ ] **Step 1: Write failing page contract tests**

Assert that `app.json` declares `pages/dressup/dressup`; all four page files exist; WXML exposes `onAddUserItems`, `onAddSystemItems`, `onRemoveItem`, `onMoveItem`, `onPreview`, `onSaveGroup`, and `onSaveAll`; `package.json` syntax checks include the new page and two new modules.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: FAIL because the page and route do not exist.

- [ ] **Step 3: Implement page state and initialization**

On `onLoad`, read `options.mode`:

- `demo`: create the built-in project.
- `upload`: restore a saved upload/mixed draft when present, otherwise create an empty project.

Copy package assets to `${wx.env.USER_DATA_PATH}/layered-dressup/<filename>` before saving them; update the project item URL to the copied path. Persist only project metadata and local paths after each edit.

- [ ] **Step 4: Implement editing actions**

- `onAddUserItems`: call `wx.chooseMedia({count: remaining, mediaType:['image'], sourceType:['album','camera']})`, normalize selected files, call `addItems`.
- `onAddSystemItems`: append only pack items not already present in that group.
- `onRemoveItem`: delete by stable item ID.
- `onMoveItem`: move one position left/right based on `data-direction`; disable at boundaries.
- Show “首图” on index 0 and “还差 N 张可形成叠图” for 1–2 items.

- [ ] **Step 5: Implement preview, save, and guide**

- `onPreview`: navigate to `/pages/preview/preview` and emit the group contract.
- `onSaveGroup`: reject groups below 3; sequentially save each real item URL.
- `onSaveAll`: flatten only groups whose mode is `stackable` in `head → tops → bottoms → shoes` order.
- Resolve package, HTTP, cloud, and user-local paths before `wx.saveImageToPhotosAlbum`.
- After successful group/all save, show an in-page guide with the four exact sending steps from the spec.

- [ ] **Step 6: Style the editor**

Use a white page, purple/indigo flagship accents, four stacked group cards, horizontal thumbnails, visible first-card badge, compact reorder/delete controls, sticky bottom actions, and no complex canvas controls.

- [ ] **Step 7: Run focused and structural checks**

Run: `node --test tests/layered-dressup.test.cjs && npm run check:syntax && npm run check:miniprogram`
Expected: all commands PASS.

- [ ] **Step 8: Commit the editor page**

```bash
git add miniprogram/pages/dressup miniprogram/app.json package.json tests/layered-dressup.test.cjs
git commit -m "feat: add layered dressup editor"
```

### Task 5: 首页升级与入口兼容

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `tests/layered-dressup.test.cjs`

**Interfaces:**
- Produces: `onTryLayeredDemo()` → `/pages/dressup/dressup?mode=demo`
- Produces: `onCreateLayeredDressup()` → `/pages/dressup/dressup?mode=upload`
- Preserves: existing `onChooseMedia()` AI 穿搭链路 as a secondary tool entry

- [ ] **Step 1: Write failing home behavior contract tests**

Assert the homepage markup contains the two flagship actions, a visible “四个部位独立滑动” explanation, a hot-template card for “抽象搞怪”, and the existing AI upload action remains bound. Assert the old `suit` and `dressup` coming-soon keys are absent from `comingModules`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/layered-dressup.test.cjs`
Expected: FAIL because the new flagship entry is missing.

- [ ] **Step 3: Implement homepage behavior and layout**

Replace the current hero wording with “分层云换装”，add「直接试玩」and「上传自己的素材」buttons, show four compact demo rows, move existing AI穿搭整理 into a secondary tool card, and reduce coming-soon entries to the approved future categories without duplicate suit/dressup entries.

- [ ] **Step 4: Run focused and syntax checks**

Run: `node --test tests/layered-dressup.test.cjs && npm run check:syntax`
Expected: PASS.

- [ ] **Step 5: Commit the homepage**

```bash
git add miniprogram/pages/index tests/layered-dressup.test.cjs
git commit -m "feat: make layered dressup the flagship entry"
```

### Task 6: 治理文档、回归和最终验证

**Files:**
- Modify: `README.md`
- Modify: `docs/current.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/decisions.md`
- Modify: `docs/product/PRD.md`
- Modify: `docs/product/PLAYBOOK.md`
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/changelog.md`
- Create: `docs/iterations/2026-08-31.md`

**Interfaces:**
- Documents the feature branch as implemented but not deployed or device-accepted.
- Records that “成套搭配/滑滑换装” are unified as “分层云换装” and that templates/manual grouping precede AI enhancement.

- [ ] **Step 1: Update product and governance documents**

Write exact branch facts: local implementation and automated verification results, no deployment, no iOS/Android or real WeChat send acceptance yet. Update the roadmap so this feature is the active build priority without claiming the earlier compliance blocker is resolved.

- [ ] **Step 2: Update README**

Add the new flagship flow, the direct-demo/upload entry distinction, the new page path, and local preview instructions. Do not describe the feature as released.

- [ ] **Step 3: Run the full verification gate**

Run:

```bash
npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs && git diff --check
```

Expected: all automated tests and checks PASS with no diff whitespace errors. Any environment warnings must be copied verbatim into the iteration log.

- [ ] **Step 4: Review requirements against the spec**

Confirm with code and tests that demo/upload/mixed sources, four groups, 3-card threshold, no padding, delete, reorder, independent preview groups, valid-group export, sending guide, and preserved AI entry are present. Record real-device verification as outstanding.

- [ ] **Step 5: Commit documentation and final verification record**

```bash
git add README.md docs package.json miniprogram tests
git commit -m "docs: record layered dressup mvp"
```
