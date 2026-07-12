# WePicTool Stage Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整理 `/Users/Zhuanz/Desktop/WePicTool` 为“阶段一可验收 + 阶段二/三可扩展”的微信小程序工程。

**Architecture:** 产品文档进入 `docs/product/`，AI 提示词和工作流预留进入 `docs/ai-workflows/`。小程序阶段一公共规则进入 `miniprogram/utils/task.js`，页面和云函数围绕同一任务契约输出 `groups`、`results`、`sendability`，并用 Node 测试锁住关键规则。

**Tech Stack:** 原生微信小程序、CloudBase 云函数、CommonJS 小程序模块、Node built-in test runner、Vite/React 演示工程保留但不作为小程序主线。

## Global Constraints

- 实际改造项目是 `/Users/Zhuanz/Desktop/WePicTool`。
- 本次不接入真实多模态分类模型。
- 本次不接入真实抠图 API。
- 本次不实现 Sharp/Pillow 白底合成。
- MVP 主线只处理 `tops`、`bottoms`、`shoes`，其他素材进入 `others`。
- 每组少于 3 张必须提示可能无法形成微信合并滑动效果。
- 保留本地预览模式，未配置 CloudBase 环境时不能阻断页面流程。
- 当前目录不是 git 仓库，实施中不执行 `git commit`。

---

### Task 1: Product Documentation Structure

**Files:**
- Create: `docs/product/PRD.md`
- Create: `docs/product/stage-roadmap.md`
- Create: `docs/product/development-playbook.md`
- Create: `docs/product/technical-architecture.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-07-wepictool-stage-structure-design.md`
- Produces: project-level product and stage documentation for future development tasks.

- [ ] **Step 1: Create product docs directory**

Run: `mkdir -p docs/product`

Expected: directory exists.

- [ ] **Step 2: Write `docs/product/PRD.md`**

Use this structure:

```markdown
# WePicTool PRD

**版本：** v1.3-stage  
**日期：** 2026-07-07  
**状态：** 阶段一工程骨架已完成，等待 CloudBase 与真机验收；阶段二待接入图片部件识别。

## 产品定位

WePicTool 是微信里的穿搭参考图生成工具。用户选择上衣、下装、鞋子等图片，小程序自动整理为分组素材，方便保存后回微信按组发送，让朋友滑动对比并给出搭配建议。

## MVP 主线

MVP 只做“上衣 / 下装 / 鞋子穿搭求建议素材包”主链路。通用商品白底能力作为底座保留，头像、包、配饰、日常合集、表情包、心情状态图、历史记录和付费能力不进入首版主入口。

## 当前工程状态

- 首页支持选择 1-9 张图片。
- 未配置 CloudBase 时支持本地预览模式。
- 已有 `processOutfit` 云函数返回阶段一 mock 分组。
- 结果页支持上衣组、下装组、鞋子组、未处理素材区展示。
- 结果页支持单张保存和按组保存。
- 每组不足 3 张时会降级提醒。

## 成功指标

| 指标 | MVP 目标 |
| --- | --- |
| 穿搭素材包完成率 | >= 85% |
| 按组保存率 | >= 50% |
| 分享意愿率 | >= 25% |
| 商品白底可用率 | >= 70% |

## 开发红线

1. 不做复杂画布编辑器。
2. 不承诺多图一键直发聊天。
3. 不把日常合集、表情包、心情状态图放进 MVP 主入口。
4. 不让单张失败阻断整批任务。
5. 不提前引入账号、历史记录、付费体系。
6. 用户上传图片仅用于本次处理，正式版本需补齐 24-72 小时清理说明。
```

- [ ] **Step 3: Write `docs/product/stage-roadmap.md`**

Use a six-stage table: 阶段零, 阶段一, 阶段二, 阶段三, 阶段四, 阶段五. Mark 阶段一 as `工程骨架完成，待真机验收`.

- [ ] **Step 4: Write `docs/product/development-playbook.md`**

Include the fixed AI task template:

```text
1. 【背景】当前处于哪个阶段，已有能力是什么
2. 【本次任务】只实现本阶段目标
3. 【技术栈】原生微信小程序 + CloudBase
4. 【约束】引用 PRD 开发红线
5. 【验收标准】列出真机要验证的动作
```

- [ ] **Step 5: Write `docs/product/technical-architecture.md`**

Document the task contract with exact keys:

```js
{
  taskId: 'task_xxx',
  mode: 'outfit',
  status: 'done',
  progress: 100,
  groups: { tops: [], bottoms: [], shoes: [], others: [] },
  results: [],
  sendability: {},
  error: null
}
```

- [ ] **Step 6: Update README doc links**

Add links to the four new product docs and keep the existing local testing and CloudBase setup instructions.

### Task 2: AI Workflow Documentation

**Files:**
- Create: `docs/ai-workflows/README.md`
- Create: `docs/ai-workflows/classification-prompt.md`
- Create: `docs/ai-workflows/matting-api-evaluation.md`
- Create: `docs/ai-workflows/workflow-backlog.md`

**Interfaces:**
- Consumes: product stage roadmap from Task 1.
- Produces: stable location for later prompts, AI workflow experiments, and API evaluation notes.

- [ ] **Step 1: Create AI docs directory**

Run: `mkdir -p docs/ai-workflows`

Expected: directory exists.

- [ ] **Step 2: Write `docs/ai-workflows/README.md`**

State that this directory only stores workflow specs and prompts in this phase; it does not mean the app currently calls real AI services.

- [ ] **Step 3: Write `classification-prompt.md` with fixed labels**

Use this exact label set:

```text
tops
bottoms
shoes
other_product
daily
unsupported
uncertain
```

The required model response shape is:

```json
{"type":"tops","confidence":0.92}
```

- [ ] **Step 4: Write `matting-api-evaluation.md`**

Include candidate services: Remove.bg, 稿定科技抠图 API, 阿里云图像分割, 腾讯云图像能力. Include criteria: edge quality, light-color visibility, shoe lace handling, latency, failure rate, pricing.

- [ ] **Step 5: Write `workflow-backlog.md`**

List future workflows in order: classification, matting, white-background rendering, quality detection, single-image retry, analytics prompts.

### Task 3: Pure Task Rules And Tests

**Files:**
- Create: `miniprogram/utils/task.js`
- Create: `tests/task.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `calculateTargetSize(width: number, height: number, maxLongSide?: number): { width: number, height: number, scale: number }`
  - `createEmptyGroups(): { tops: [], bottoms: [], shoes: [], others: [] }`
  - `createMockTask(images: Array<object|string>, now?: number): Task`
  - `buildSendability(groups: object, threshold?: number): Sendability`
  - `normalizeTaskGroups(groups: object): object`
  - `isCloudPermissionError(error: unknown): boolean`

- [ ] **Step 1: Write failing tests**

Create `tests/task.test.cjs` with Node's built-in test runner. Load `miniprogram/utils/task.js` through `vm.runInNewContext` so the CommonJS mini program module can be tested while root `package.json` remains `"type": "module"`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/task.test.cjs`

Expected: FAIL because `miniprogram/utils/task.js` does not exist.

- [ ] **Step 3: Implement `miniprogram/utils/task.js`**

Implement constants and functions listed in **Interfaces**. Use `others` as the canonical unprocessed group key and treat `unprocessed` as a legacy alias in `normalizeTaskGroups`.

- [ ] **Step 4: Add npm scripts**

Modify `package.json` scripts:

```json
{
  "test": "node --test tests/*.test.cjs",
  "check:syntax": "node --check miniprogram/utils/task.js && node --check miniprogram/pages/index/index.js && node --check miniprogram/pages/result/result.js && node --check miniprogram/cloudfunctions/processOutfit/index.js"
}
```

- [ ] **Step 5: Run rule tests**

Run: `npm test`

Expected: PASS.

### Task 4: Mini Program Flow Compatibility

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/result/result.js`
- Modify: `miniprogram/pages/result/result.wxml`

**Interfaces:**
- Consumes: `createMockTask`, `normalizeTaskGroups`, `buildSendability`, `isCloudPermissionError` from `miniprogram/utils/task.js`.
- Produces: result page compatibility with both string image arrays and task result object arrays.

- [ ] **Step 1: Update local preview in index page**

Import task utilities with:

```js
const { createMockTask, isCloudPermissionError } = require('../../utils/task');
```

Use `createMockTask()` inside `createLocalPreviewTask`.

- [ ] **Step 2: Pass richer uploaded images to cloud function**

In `createProcessingTask`, send:

```js
data: {
  images: images.map((image, index) => ({
    imageId: `image_${index + 1}`,
    fileId: image.fileId,
    url: image.fileId,
    sourcePath: image.sourcePath || ''
  }))
}
```

- [ ] **Step 3: Normalize result page task data**

Import:

```js
const { normalizeTaskGroups, buildSendability } = require('../../utils/task');
```

In `parseTaskResult`, set `groups` to normalized object arrays and `sendability` to `task.sendability || buildSendability(groups)`.

- [ ] **Step 4: Update WXML item bindings**

Change image and save bindings from string item usage to object-aware usage:

```xml
<image class="card-img" src="{{item.url}}" mode="aspectFit"></image>
<view class="card-index">{{item.order || index + 1}}</view>
<button class="save-btn" bindtap="onSaveSingle" data-url="{{item.url}}">保存单图</button>
```

- [ ] **Step 5: Keep save logic compatible**

Add `getGroupUrls(groupName)` in `result.js`, mapping each item to `item.url || item`.

### Task 5: Cloud Function Contract Alignment

**Files:**
- Modify: `miniprogram/cloudfunctions/processOutfit/index.js`

**Interfaces:**
- Consumes: `event.images` as an array of strings or objects.
- Produces: direct task object with `groups`, `results`, and `sendability`.

- [ ] **Step 1: Normalize image inputs**

Add `normalizeImageInput(image, index)` that returns `{ imageId, fileId, url, width, height, size }`.

- [ ] **Step 2: Return task-shaped mock response**

Keep stage-one category rule:

```js
if (index < 3) return 'tops';
if (index < 6) return 'bottoms';
if (index < 9) return 'shoes';
return 'others';
```

Return direct task object, not a nested `{ task }` wrapper.

- [ ] **Step 3: Add sendability to response**

Use the same threshold rule: count >= 3 is `stackable`, count 1-2 is `normal`, count 0 is `empty`.

- [ ] **Step 4: Preserve future extension comments**

Keep explicit comments for stage two classification and stage three matting/rendering.

### Task 6: Verification

**Files:**
- Read: all created and modified files.

**Interfaces:**
- Consumes: outputs from Tasks 1-5.
- Produces: verification result for final response.

- [ ] **Step 1: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run syntax check**

Run: `npm run check:syntax`

Expected: PASS.

- [ ] **Step 3: Run mini program check**

Run: `npm run check:miniprogram`

Expected: PASS with possible reminders about placeholder AppID or missing CloudBase environment ID.

- [ ] **Step 4: Inspect changed files**

Run: `find docs -maxdepth 3 -type f | sort` and `rg -n "真实 AI|真实抠图|阶段一|sendability|classification" README.md docs miniprogram tests`.

Expected: documents and code reflect the stage-one boundary and future AI workflow placeholders.
