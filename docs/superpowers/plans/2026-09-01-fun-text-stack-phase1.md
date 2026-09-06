# 趣味字画阶段一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付不依赖生成式 AI 的「趣味字画」完整闭环：用户输入一句话后得到三套规则候选，选中后可改本卡文字、整叠换视觉包和调整顺序，最终生成高清 PNG、在微信牌堆中预览、按序保存并从本地记录重开。

**Architecture:** 小程序端用纯规则模块生成 `CreativeBrief → CandidatePlan → CardScene → FunTextProject`，三套候选共享确定性种子和绝对场景坐标。低清候选优先由小程序 Canvas 2D 使用远程授权字体绘制，字体加载失败时调用云托管低清预览；选中的方案由独立 `fun-card-renderer` 云托管重新审核全部文字并输出 1080×1080 PNG。阶段一不创建 `creativePlanner`，不调用生成式模型。

**Tech Stack:** 微信原生小程序、CommonJS 纯函数、Canvas 2D、`wx.loadFontFace`、CloudBase 云函数 `contentGuard`、CloudBase 云托管、Node.js 20、`@napi-rs/canvas`、`wx-server-sdk`、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-08-31-fun-text-stack-design.md`

## Global Constraints

- 执行时使用 `superpowers:using-git-worktrees` 创建 `codex/fun-text-stack-phase1` 独立工作树。
- 执行基线必须同时包含设计提交 `be23f01` 和已集成的 P1 分层云换装共享底座；`miniprogram/config/playRegistry.js` 必须已能返回 `layered-dressup`。若不满足，停止本计划，先单独完成 P1 集成。
- 不整体合并或 cherry-pick `codex/bigtext-handwrite`；只迁移本计划逐项列出的字体、许可、渲染、贴纸和失败清理代码。
- 用户名称固定「趣味字画」，玩法 ID 固定 `fun-text-stack`，记录类型固定 `funtext`。
- 输入去除首尾空白，保留句内空格与标点，按 `Array.from` 计 1–40 个 Unicode 字符。
- 每次必须生成正好 3 套候选；每套 3–8 张，策略 ID 互不相同；不得退回“一字一图”。
- 阶段一只开放 `random-fun`、`funny-reversal`、`cute-direct`、`tough-soft` 四个表达标签，以及 `hard_turn`、`suspense_reveal`、`fake_checklist`、`visual_pause` 四个规则策略。
- 阶段一只开放 `pink-note-v1`、`chalk-chaos-v1`、`paper-collage-v1` 三个视觉包。
- 阶段一字感键固定为 `marker-bold`、`chalk-rough`、`collage-cutout`、`stamp-shadow`；自动素材先交付 12 个程序化贴纸和 6 个程序化涂鸦，设计建议的 24/12 完整素材量与手动装饰编辑一起留到阶段三。
- 所有规则候选必须在 `reveal` 卡完整保留用户原句；非 `reveal` 主文字最多 12 字，`reveal` 最多 40 字并允许最多 3 行。
- 用户输入在生成候选前必须调用现有 `contentGuard`；高清/服务端低清渲染前，云托管必须把所有场景文字合并后二次审核。审核拒绝或服务异常均不放行。
- 小程序不得用系统字体冒充最终效果。授权字体未加载时显示明确状态并调用服务端低清预览；服务也不可用时保留项目和重试入口。
- 自动场景每张最多 1 个主文字层、1 个辅助文字层和 6 个装饰层；阶段一不开放手动贴纸变形、自由画笔、撤销/重做或 AI 改款。
- 只对用户最终选中的候选生成 1080×1080 PNG；三候选默认由本地低清 Canvas 绘制。
- 小程序不能直发聊天。用户文案只写“按顺序保存”“回微信勾选发送后合并展示”，不得写“一键发送”。
- 每个任务严格执行红—绿—重构：先新增失败测试，确认失败原因，再写最小实现，再跑目标测试和相关回归，再提交。
- 本计划的首日迭代日志为 `docs/iterations/2026-09-01.md`；若执行跨越自然日，每天另建当天日志并记录当日实际验证，不把多日结果倒填到首日日志。

## Execution Baseline Check

开始 Task 1 前运行：

```bash
git branch --show-current
git log --oneline --all --grep="design fun text stack" -1
node -e "const r=require('./miniprogram/config/playRegistry'); if(!r.getPlayDefinition('layered-dressup')) process.exit(1)"
git status --short
```

预期：位于新的 `codex/fun-text-stack-phase1` 工作树；能看到 `be23f01` 或等价合并提交；注册表检查退出码为 0；工作区为空。任何一项不满足都不得开始 Task 1。

---

### Task 1: 玩法注册、输入契约与测试加载器

**Files:**
- Create: `tests/helpers/miniprogram-loader.cjs`
- Create: `miniprogram/utils/creativeBrief.js`
- Modify: `miniprogram/config/playRegistry.js`
- Create: `tests/fun-text-brief.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: P1 的 `getPlayDefinition(playId)` 与 `PLAY_REGISTRY`。
- Produces: `normalizeCreativeBrief(input)`、`EXPRESSION_KEYS`、注册项 `fun-text-stack`。

- [ ] **Step 1: 写失败测试，锁定注册项和 1–40 字输入规则**

```js
test('registers fun text as a rule-first square stack', () => {
  const play = registry.getPlayDefinition('fun-text-stack');
  assert.equal(play.title, '趣味字画');
  assert.equal(play.inputType, 'text');
  assert.equal(play.renderer, 'fun-card-scene');
  assert.equal(play.preview, 'single-stack');
  assert.equal(play.exporter, 'ordered-sequence');
});

test('normalizes a 1-40 character brief with safe defaults', () => {
  assert.deepEqual(plain(normalizeCreativeBrief({ sourceText: '  我今天想见你  ' })), {
    sourceText: '我今天想见你',
    expressionKey: 'random-fun',
    relationship: 'unspecified',
    intensity: 'medium',
    requestedCandidateCount: 3,
    cardRange: { min: 3, preferred: 5, max: 8 },
    locale: 'zh-CN',
    variant: 0
  });
  assert.throws(() => normalizeCreativeBrief({ sourceText: '' }), /请输入一句话/);
  assert.throws(() => normalizeCreativeBrief({ sourceText: '字'.repeat(41) }), /40/);
});
```

- [ ] **Step 2: 运行测试并确认因模块/注册项缺失而失败**

Run: `node --test tests/fun-text-brief.test.cjs`

Expected: FAIL，错误包含 `creativeBrief.js` 不存在或 `fun-text-stack` 未注册。

- [ ] **Step 3: 提取共享 VM 加载器并实现最小输入模块**

`tests/helpers/miniprogram-loader.cjs` 导出 `loadMiniProgramModule`、`loadMiniProgramPage`、`instantiatePage` 和 `plain`，替代新测试中的重复 VM 样板。`creativeBrief.js` 使用以下公开契约：

```js
var EXPRESSION_KEYS = ['random-fun', 'funny-reversal', 'cute-direct', 'tough-soft'];

function normalizeCreativeBrief(input) {
  var value = input || {};
  var sourceText = typeof value.sourceText === 'string' ? value.sourceText.trim() : '';
  var count = Array.from(sourceText).length;
  if (!count) throw new Error('请输入一句话');
  if (count > 40) throw new Error('最多输入 40 个字');
  var expressionKey = EXPRESSION_KEYS.indexOf(value.expressionKey) >= 0
    ? value.expressionKey
    : 'random-fun';
  return {
    sourceText: sourceText,
    expressionKey: expressionKey,
    relationship: 'unspecified',
    intensity: 'medium',
    requestedCandidateCount: 3,
    cardRange: { min: 3, preferred: 5, max: 8 },
    locale: 'zh-CN',
    variant: Math.max(0, Number(value.variant) || 0)
  };
}

module.exports = { EXPRESSION_KEYS: EXPRESSION_KEYS, normalizeCreativeBrief: normalizeCreativeBrief };
```

在 `PLAY_REGISTRY` 追加版本 1 的 `fun-text-stack`，不要改变 `layered-dressup` 数据。

- [ ] **Step 4: 把新模块加入语法检查并运行目标测试/回归**

Run: `node --test tests/fun-text-brief.test.cjs tests/layered-dressup.test.cjs && npm run check:syntax`

Expected: PASS；原分层云换装注册表测试不变。

- [ ] **Step 5: 提交**

```bash
git add tests/helpers/miniprogram-loader.cjs tests/fun-text-brief.test.cjs miniprogram/utils/creativeBrief.js miniprogram/config/playRegistry.js package.json
git commit -m "feat: register fun text stack"
```

### Task 2: 四种规则策略、三候选选择与结构校验

**Files:**
- Create: `miniprogram/config/funTextStrategies.js`
- Create: `miniprogram/utils/strategySelector.js`
- Create: `miniprogram/utils/candidateValidator.js`
- Create: `miniprogram/utils/candidatePlanner.js`
- Create: `tests/fun-text-candidates.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `normalizeCreativeBrief(input)`。
- Produces: `selectStrategyIds(expressionKey, variant)`、`planRuleCandidates(brief)`、`validateCandidateSet(candidates, brief)`、`hashSeed(value)`。

- [ ] **Step 1: 写失败测试，覆盖三套差异、原句保留与再次生成**

```js
test('plans three distinct valid candidates and preserves the full sentence', () => {
  const brief = normalizeCreativeBrief({ sourceText: '我今天想见你', expressionKey: 'funny-reversal' });
  const result = planner.planRuleCandidates(brief);
  assert.equal(result.generationMode, 'rules');
  assert.equal(result.candidates.length, 3);
  assert.equal(new Set(result.candidates.map(item => item.strategyId)).size, 3);
  result.candidates.forEach((candidate) => {
    assert.ok(candidate.cards.length >= 3 && candidate.cards.length <= 8);
    assert.ok(candidate.cards.some(card => card.role === 'reveal' && card.text === brief.sourceText));
    assert.deepEqual(candidate.cards.map(card => card.order), candidate.cards.map((card, index) => index + 1));
  });
  assert.equal(validator.validateCandidateSet(result.candidates, brief).valid, true);
});

test('variant changes phrase choices while remaining deterministic', () => {
  const first = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '生日快乐', variant: 1 }));
  const again = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '生日快乐', variant: 1 }));
  const next = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '生日快乐', variant: 2 }));
  assert.deepEqual(plain(first), plain(again));
  assert.notDeepEqual(plain(first), plain(next));
});
```

- [ ] **Step 2: 运行测试并确认因规划模块缺失而失败**

Run: `node --test tests/fun-text-candidates.test.cjs`

Expected: FAIL，错误指向 `candidatePlanner.js` 或 `strategySelector.js` 不存在。

- [ ] **Step 3: 实现策略注册表和确定性规划器**

策略映射固定为：

```js
var EXPRESSION_STRATEGIES = {
  'random-fun': ['hard_turn', 'suspense_reveal', 'fake_checklist', 'visual_pause'],
  'funny-reversal': ['hard_turn', 'suspense_reveal', 'fake_checklist', 'visual_pause'],
  'cute-direct': ['suspense_reveal', 'visual_pause', 'fake_checklist', 'hard_turn'],
  'tough-soft': ['hard_turn', 'visual_pause', 'suspense_reveal', 'fake_checklist']
};
```

每个策略提供至少两组内置短语变体，并把完整 `brief.sourceText` 放到唯一 `reveal` 卡：

```js
function buildHardTurn(sourceText, variant) {
  var openings = ['我本来想说', '有句话到嘴边'];
  return [
    { role: 'hook', text: openings[variant % openings.length] },
    { role: 'misdirect', text: '算了' },
    { role: 'pause', text: '……', visualCue: 'scribble-cross' },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: '才不撤回', visualCue: 'heart-small' }
  ];
}
```

另外三个策略分别使用“有件事/再滑一下”“今日待办/吃饭/发呆/已置顶”“先别划走/纯涂鸦停顿/原句”的固定骨架。`hashSeed` 使用 FNV-1a。候选对象统一使用 `candidateId`、`strategyId`、`title`、`seed`、`cards` 五个字段，其中 `candidateId` 为 `candidate_<strategyId>_<seed>`；其他模块不得改用泛化字段 `id`。

- [ ] **Step 4: 实现严格校验并跑目标/全量规则测试**

`validateCandidateSet` 必须拒绝：非 3 套、重复策略、少于 3 或多于 8 张、序号断裂、连续同文、缺少 `hook|build`、缺少 `reveal|ending`、非 reveal 超过 12 字、reveal 不是原句、空文字出现在非 `pause|ending` 角色。

Run: `node --test tests/fun-text-candidates.test.cjs && npm test`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/config/funTextStrategies.js miniprogram/utils/strategySelector.js miniprogram/utils/candidateValidator.js miniprogram/utils/candidatePlanner.js tests/fun-text-candidates.test.cjs package.json
git commit -m "feat: add rule based fun text candidates"
```

### Task 3: 三个视觉包、素材白名单与确定性场景合成

**Files:**
- Create: `miniprogram/config/stylePacks.js`
- Create: `miniprogram/config/assetRegistry.js`
- Create: `miniprogram/utils/styleMatcher.js`
- Create: `miniprogram/utils/sceneComposer.js`
- Create: `tests/fun-text-scenes.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CandidatePlan`、`hashSeed(value)`。
- Produces: `getStylePack(id)`、`matchStylePacks(candidates, variant)`、`composeCandidate(candidate, stylePackId)`、`validateScene(scene)`。

- [ ] **Step 1: 写失败测试，锁定三包差异、角色构图和同 seed 稳定性**

```js
test('matches three different style packs to three candidates', () => {
  const ids = matcher.matchStylePacks([
    { candidateId: 'a' }, { candidateId: 'b' }, { candidateId: 'c' }
  ], 0);
  assert.deepEqual(ids, ['pink-note-v1', 'chalk-chaos-v1', 'paper-collage-v1']);
});

test('composes deterministic editable 1080 square scenes', () => {
  const candidate = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '我今天想见你' })).candidates[0];
  const first = composer.composeCandidate(candidate, 'pink-note-v1');
  const second = composer.composeCandidate(candidate, 'pink-note-v1');
  assert.deepEqual(plain(first), plain(second));
  assert.equal(first.length, candidate.cards.length);
  first.forEach((scene) => {
    assert.equal(scene.width, 1080);
    assert.equal(scene.height, 1080);
    assert.ok(scene.layers.filter(layer => layer.type === 'text').length <= 2);
    assert.ok(scene.layers.filter(layer => layer.type !== 'text').length <= 6);
    assert.equal(composer.validateScene(scene).valid, true);
  });
});
```

- [ ] **Step 2: 运行测试并确认视觉模块缺失**

Run: `node --test tests/fun-text-scenes.test.cjs`

Expected: FAIL，错误指向 `stylePacks.js`、`assetRegistry.js` 或 `sceneComposer.js`。

- [ ] **Step 3: 实现视觉包和程序化素材白名单**

三个视觉包必须分别声明 `background`、`palette`、`textEffectsByRole`、`stickersByRole` 和 `doodlesByRole`。阶段一素材白名单固定为 12 个旧贴纸键 `sticker_0` 到 `sticker_11`，以及 6 个涂鸦键：`arrow-curve`、`heart-outline`、`circle-mark`、`underline-rough`、`scribble-cross`、`burst-lines`。每项记录：

```js
{
  key: 'heart-outline',
  type: 'doodle',
  source: 'project-owned',
  renderer: 'procedural-v1'
}
```

`styleMatcher` 按 `variant` 循环三个视觉包，单批不得重复。

- [ ] **Step 4: 实现场景合成与预计算换行**

`sceneComposer` 输出绝对 1080 坐标，文字层必须包含 `lines`，让小程序与服务端不再各自换行：

```js
{
  id: 'text_main',
  type: 'text',
  text: '我今天想见你',
  lines: ['我今天', '想见你'],
  effectKey: 'marker-bold',
  fontFamily: 'LXGWMarkerGothic',
  fontSize: 210,
  lineHeight: 250,
  x: 540,
  y: 520,
  rotation: -2,
  scale: 1,
  color: '#F35C8C',
  align: 'center'
}
```

`hook` 偏中上、`misdirect` 使用删除/叉号、`pause` 大留白、`reveal` 最大字号、`ending` 图形主导。所有轻微偏移由 `candidate.seed + scene.order + layer.id` 派生，禁止使用 `Math.random()`。

Run: `node --test tests/fun-text-scenes.test.cjs tests/fun-text-candidates.test.cjs && npm run check:syntax`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/config/stylePacks.js miniprogram/config/assetRegistry.js miniprogram/utils/styleMatcher.js miniprogram/utils/sceneComposer.js tests/fun-text-scenes.test.cjs package.json
git commit -m "feat: compose fun text card scenes"
```

### Task 4: 趣味字画项目模型和阶段一三项编辑

**Files:**
- Create: `miniprogram/utils/funTextProject.js`
- Create: `tests/fun-text-project.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `planRuleCandidates(brief)`、`matchStylePacks`、`composeCandidate`。
- Produces: `createFunTextProject(input)`、`replanProject(project)`、`selectCandidate(project, candidateId)`、`updateCardText(project, candidateId, sceneId, text)`、`switchCandidateStyle(project, candidateId, stylePackId)`、`moveCard(project, candidateId, from, to)`、`buildPreviewPayload(project)`、`buildRenderPayload(project)`、`buildPreviewGroups(project, renderedCards)`。

- [ ] **Step 1: 写失败测试，覆盖创建、编辑、换包、排序和不可变性**

```js
test('creates a three-candidate local project', () => {
  const project = model.createFunTextProject({ sourceText: '我今天想见你', now: 1000 });
  assert.equal(project.projectId, 'funtext_1000');
  assert.equal(project.playId, 'fun-text-stack');
  assert.equal(project.generationMode, 'rules');
  assert.equal(project.candidates.length, 3);
  assert.equal(project.renderStatus, 'draft');
});

test('editing a card keeps the source project immutable and resets render state', () => {
  const project = model.createFunTextProject({ sourceText: '生日快乐', now: 1000 });
  const candidate = project.candidates[0];
  const scene = candidate.editedScenes[0];
  const next = model.updateCardText(project, candidate.candidateId, scene.sceneId, '先等等');
  assert.notEqual(next, project);
  assert.equal(project.candidates[0].editedScenes[0].layers[0].text, scene.layers[0].text);
  assert.equal(next.candidates[0].editedScenes[0].layers[0].text, '先等等');
  assert.equal(next.renderStatus, 'draft');
});
```

- [ ] **Step 2: 运行测试并确认项目模块缺失**

Run: `node --test tests/fun-text-project.test.cjs`

Expected: FAIL，错误指向 `funTextProject.js` 不存在。

- [ ] **Step 3: 实现版本 1 项目模型和不可变编辑函数**

每个候选保存 `originalScenes` 与 `editedScenes` 的深拷贝。`updateCardText` 重新计算该文字层的 `lines`；`switchCandidateStyle` 用原候选卡片重新合成整叠但保留当前卡片顺序和已改文字；`moveCard` 重排后重写场景 `order`。`buildRenderPayload` 在未选择候选、场景非法或卡数不合法时抛出中文错误。

项目内候选字段固定为 `candidateId`、`strategyId`、`title`、`seed`、`cards`、`stylePackId`、`originalScenes`、`editedScenes`。`buildPreviewPayload(project)` 输出全部三候选的 `candidateId/stylePackId/scenes`；`buildRenderPayload(project)` 只输出 `selectedCandidateId` 对应的一套。

```js
{
  projectId: 'funtext_1000',
  playId: 'fun-text-stack',
  version: 1,
  sourceText: '我今天想见你',
  brief: { expressionKey: 'random-fun', variant: 0 },
  generationMode: 'rules',
  candidates: [],
  selectedCandidateId: '',
  renderStatus: 'draft',
  renderedCards: [],
  createdAt: 1000,
  updatedAt: 1000
}
```

- [ ] **Step 4: 补非法编辑测试并跑回归**

增加：非 reveal 编辑超过 12 字拒绝、reveal 超过 40 字拒绝、空文字仅允许 pause/ending、未知视觉包拒绝、越界排序不改变项目、`buildRenderPayload` 只包含选中候选。

Run: `node --test tests/fun-text-project.test.cjs tests/fun-text-scenes.test.cjs && npm test`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/funTextProject.js tests/fun-text-project.test.cjs package.json
git commit -m "feat: add fun text project editing"
```

### Task 5: 小程序低清 Canvas 画笔和授权字体加载

**Files:**
- Create: `miniprogram/utils/funTextFont.js`
- Create: `miniprogram/utils/scenePainter.js`
- Create: `miniprogram/components/fun-card-canvas/fun-card-canvas.js`
- Create: `miniprogram/components/fun-card-canvas/fun-card-canvas.json`
- Create: `miniprogram/components/fun-card-canvas/fun-card-canvas.wxml`
- Create: `miniprogram/components/fun-card-canvas/fun-card-canvas.wxss`
- Modify: `miniprogram/config/env.js`
- Create: `tests/fun-card-canvas.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 合法 `CardScene` 和 `FUN_CARD_RENDERER_URL`。
- Produces: `loadFunTextFont(wxApi, baseUrl)`、`paintScene(ctx, scene, size, dependencies)`、组件事件 `ready` / `rendererror`；`dependencies.drawAsset` 仅用于测试注入，生产默认使用内置程序化素材画笔。

- [ ] **Step 1: 写失败测试，锁定坐标缩放、绘制顺序和字体失败事件**

在测试文件中定义最小 recording context 和合法场景，避免依赖真实 Canvas：

```js
function recordingContext(operations) {
  return {
    save() { operations.push(['save']); },
    restore() { operations.push(['restore']); },
    scale(x, y) { operations.push(['scale', x, y]); },
    translate(x, y) { operations.push(['translate', x, y]); },
    rotate(value) { operations.push(['rotate', value]); },
    fillRect(x, y, w, h) { operations.push(['fillRect', x, y, w, h]); },
    fillText(text, x, y) { operations.push(['fillText', text, x, y]); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {}
  };
}

function fixtureScene() {
  return {
    sceneId: 'scene_1', order: 1, width: 1080, height: 1080,
    background: { color: '#FCE4EC' },
    layers: [
      { id: 'text_main', type: 'text', text: '我今天', lines: ['我今天'], fontSize: 220, lineHeight: 250, x: 540, y: 520, rotation: 0, scale: 1, color: '#171717', align: 'center' },
      { id: 'sticker_1', type: 'sticker', assetKey: 'sticker_0', x: 820, y: 180, rotation: 0, scale: 1 }
    ]
  };
}

test('paints background before ordered layers at preview scale', () => {
  const operations = [];
  const ctx = recordingContext(operations);
  painter.paintScene(ctx, fixtureScene(), 360, {
    drawAsset(context, layer) { operations.push(['sticker', layer.assetKey]); }
  });
  assert.equal(operations[0][0], 'fillRect');
  assert.ok(operations.find(op => op[0] === 'fillText' && op[1] === '我今天'));
  assert.ok(operations.find(op => op[0] === 'sticker'));
});

test('font loader rejects when the renderer URL is absent', async () => {
  await assert.rejects(() => font.loadFunTextFont({}, ''), /手写预览服务尚未配置/);
});
```

组件结构测试同时检查 WXML 使用 `<canvas type="2d">`，组件属性包含 `scene`、`size`、`revision`，禁止出现默认系统字体名。

- [ ] **Step 2: 运行测试并确认组件/画笔缺失**

Run: `node --test tests/fun-card-canvas.test.cjs`

Expected: FAIL。

- [ ] **Step 3: 实现字体加载器和纯画笔**

`FUN_CARD_RENDERER_URL` 留空时不得调用 `wx.loadFontFace`。有地址时加载：

```js
wxApi.loadFontFace({
  global: true,
  family: 'LXGWMarkerGothic',
  source: 'url("' + baseUrl + '/font/LXGWMarkerGothic-Regular.ttf")',
  success: resolve,
  fail: function (err) { reject(new Error((err && err.errMsg) || '手写字体加载失败')); }
});
```

`paintScene` 把 1080 坐标统一缩放到 `size`，严格按数组顺序画背景、文字、贴纸和涂鸦；只接受 `assetRegistry` 白名单键。文字直接使用场景的 `lines`、`fontSize` 和 `lineHeight`，不自行重新换行。

- [ ] **Step 4: 实现 Canvas 2D 组件并跑检查**

组件 `attached` 时加载字体，字体成功后用 `createSelectorQuery().in(this).select('#cardCanvas').fields({ node: true, size: true })` 获取节点，按设备像素比设置物理尺寸，再调用 `paintScene`。失败触发 `rendererror`，不得绘制回退字体。

Run: `node --test tests/fun-card-canvas.test.cjs && npm run check:miniprogram && npm run check:syntax`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/funTextFont.js miniprogram/utils/scenePainter.js miniprogram/components/fun-card-canvas miniprogram/config/env.js tests/fun-card-canvas.test.cjs package.json
git commit -m "feat: preview fun text scenes on canvas"
```

### Task 6: 云托管场景校验、二次审核和 PNG 渲染

**Files:**
- Create: `miniprogram/cloudhosting/fun-card-renderer/package.json`
- Create: `miniprogram/cloudhosting/fun-card-renderer/package-lock.json`
- Create: `miniprogram/cloudhosting/fun-card-renderer/Dockerfile`
- Create: `miniprogram/cloudhosting/fun-card-renderer/index.js`
- Create: `miniprogram/cloudhosting/fun-card-renderer/server.js`
- Create: `miniprogram/cloudhosting/fun-card-renderer/sceneValidator.js`
- Create: `miniprogram/cloudhosting/fun-card-renderer/renderer.js`
- Create: `miniprogram/cloudhosting/fun-card-renderer/drawAssets.js`
- Copy: `.worktrees/bigtext-handwrite/miniprogram/cloudhosting/text-card-renderer/fonts/LXGWMarkerGothic-Regular.ttf` → `miniprogram/cloudhosting/fun-card-renderer/fonts/LXGWMarkerGothic-Regular.ttf`
- Copy: `.worktrees/bigtext-handwrite/miniprogram/cloudhosting/text-card-renderer/LICENSES/OFL-LXGWMarkerGothic.txt` → `miniprogram/cloudhosting/fun-card-renderer/LICENSES/OFL-LXGWMarkerGothic.txt`
- Create: `tests/fun-card-renderer.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `POST /render-stack` 或 `POST /preview-stack` 场景负载。
- Produces: `GET /font/LXGWMarkerGothic-Regular.ttf`、`createRenderStackHandler(deps)`、`createPreviewStackHandler(deps)`、顺序稳定的 `{ ok, projectId, candidateId, cards }` 或 `{ ok, projectId, candidates }`。

`/render-stack` 接受 `buildRenderPayload(project)` 生成的单候选负载；`/preview-stack` 接受 `buildPreviewPayload(project)` 生成的 `{ projectId, sourceText, candidates:[{ candidateId, stylePackId, scenes }] }`。预览响应中的三个候选必须逐一回显请求中的 `candidateId`，且每套卡片数量、`sceneId` 和顺序完全匹配。

- [ ] **Step 1: 写失败测试，覆盖非法场景、审核门禁、顺序和回滚**

测试文件定义固定合法负载：

```js
function validPayload() {
  return {
    projectId: 'funtext_1000',
    candidateId: 'candidate_hard_turn_123',
    sourceText: '我今天想见你',
    stylePackId: 'pink-note-v1',
    scenes: [1, 2, 3].map((order) => ({
      sceneId: 'scene_' + order,
      order: order,
      width: 1080,
      height: 1080,
      background: { color: '#FCE4EC' },
      layers: [{
        id: 'text_main',
        type: 'text',
        text: order === 3 ? '我今天想见你' : '再滑一下',
        lines: [order === 3 ? '我今天想见你' : '再滑一下'],
        fontSize: 180,
        lineHeight: 210,
        x: 540,
        y: 520,
        rotation: 0,
        scale: 1,
        color: '#171717',
        align: 'center'
      }]
    }))
  };
}

test('rejects an invalid stack before audit or drawing', async () => {
  let audited = false;
  const handler = server.createRenderStackHandler({
    checkContent: async () => { audited = true; return { ok: true }; },
    renderScenes: async () => []
  });
  const response = await handler({ projectId: 'bad', scenes: [] }, { preview: false });
  assert.equal(response.statusCode, 400);
  assert.equal(audited, false);
});

test('audits all visible text before rendering', async () => {
  let auditedText = '';
  const handler = server.createRenderStackHandler({
    checkContent: async (text) => { auditedText = text; return { ok: false, code: 'CONTENT_UNSAFE' }; },
    renderScenes: async () => { throw new Error('must not render'); }
  });
  const response = await handler(validPayload(), { preview: false });
  assert.match(auditedText, /我今天想见你/);
  assert.equal(response.statusCode, 403);
});
```

再写单张上传失败时删除此前已上传文件、3–8 张输出保持 `order`、预览尺寸固定 360、高清尺寸固定 1080 的测试。服务端导出 `SUPPORTED_ASSET_KEYS` 和 `SUPPORTED_EFFECT_KEYS`，测试读取小程序注册表并断言两侧集合完全一致。

- [ ] **Step 2: 运行测试并确认服务模块缺失**

Run: `node --test tests/fun-card-renderer.test.cjs`

Expected: FAIL。

- [ ] **Step 3: 选择性迁移依赖和实现纯处理器**

`sceneValidator` 重新声明服务端白名单，不 `require` 小程序外部文件。负载必须满足：`projectId /^funtext_[A-Za-z0-9_-]+$/`、候选 ID 合法、3–8 个 1080 方形场景、序号连续、文字/素材/效果键在白名单、图层上限合法。`collectAuditText` 拼接 `sourceText` 和所有非空文字层后只调用一次审核。

处理器错误码固定：`INVALID_REQUEST` 400、`CONTENT_UNSAFE` 403、`SAFETY_UNAVAILABLE` 503、`RENDER_FAILED` 500。生产处理器不得接受跳过审核参数。

- [ ] **Step 4: 实现实际 PNG、字体路由和低清回退路由**

`renderer.js` 注册本地 `LXGWMarkerGothic`，按场景绝对坐标绘制，与小程序画笔支持同一组效果/素材键。`/render-stack` 只接受单候选并输出 1080 PNG；`/preview-stack` 最多接受三候选并输出 360 PNG；字体 GET 路由返回 TTF 和允许小程序加载的响应头。上传路径固定：

```text
funtext/<projectId>/<candidateId>/preview/<order>.png
funtext/<projectId>/<candidateId>/final/<order>.png
```

Run: `npm --prefix miniprogram/cloudhosting/fun-card-renderer install`

Run: `node --test tests/fun-card-renderer.test.cjs`

Run: `docker build -t wepictool-fun-card-renderer miniprogram/cloudhosting/fun-card-renderer`

Expected: 测试 PASS，Docker build 退出码 0。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/cloudhosting/fun-card-renderer tests/fun-card-renderer.test.cjs package.json
git commit -m "feat: render fun text scenes in cloud hosting"
```

### Task 7: 输入页、内容安全客户端和首页真实示例

**Files:**
- Create: `miniprogram/utils/contentGuardClient.js`
- Create: `miniprogram/pages/fun-text/fun-text.js`
- Create: `miniprogram/pages/fun-text/fun-text.json`
- Create: `miniprogram/pages/fun-text/fun-text.wxml`
- Create: `miniprogram/pages/fun-text/fun-text.wxss`
- Create: `miniprogram/assets/fun-text/demo/01.png`
- Create: `miniprogram/assets/fun-text/demo/02.png`
- Create: `miniprogram/assets/fun-text/demo/03.png`
- Create: `miniprogram/assets/fun-text/demo/04.png`
- Create: `miniprogram/assets/fun-text/demo/05.png`
- Create: `miniprogram/cloudhosting/fun-card-renderer/scripts/render-demo.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Create: `tests/fun-text-entry.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `contentGuard` 云函数、`createFunTextProject(input)`。
- Produces: `checkTextContent(wxApi, text)`、页面事件 `onInput`、`onSelectExpression`、`onGenerate`、`onTryDemo`。

- [ ] **Step 1: 写失败测试，锁定短路径和 fail-closed 审核**

测试必须断言：首页存在可滑的 5 张示例和“把你的话也变成一叠”；输入页只出现一句话、组合表达标签和“帮我变成一叠”，不出现字体/背景/贴纸参数；安全返回 `CONTENT_UNSAFE` 或调用失败时不导航且保留输入；通过时创建规则项目并导航候选页。

```js
test('content guard fails closed when cloud safety is unavailable', async () => {
  const wxApi = { cloud: { callFunction: async () => { throw new Error('offline'); } } };
  await assert.rejects(() => client.checkTextContent(wxApi, '我今天想见你'), /安全服务暂不可用/);
});
```

- [ ] **Step 2: 运行测试并确认页面/客户端缺失**

Run: `node --test tests/fun-text-entry.test.cjs`

Expected: FAIL。

- [ ] **Step 3: 实现内容安全客户端和输入页**

`checkTextContent` 调用 `{ name: 'contentGuard', data: { content: text } }`，只接受 `result.ok === true`。`onGenerate` 顺序固定：本地归一化 → `contentGuard` → `createFunTextProject` → 通过 eventChannel 发送 `{ project }`；审核期间按钮禁用，失败保留输入和标签。

内置示例使用固定、已审核文案，不调用云函数；它直接创建 `sourceText: '我今天想见你', expressionKey: 'funny-reversal'` 的项目。

- [ ] **Step 4: 用云端渲染脚本生成并提交首页示例 PNG**

新增 renderer 内部脚本 `scripts/render-demo.js`，从固定示例项目渲染前 5 张 `pink-note-v1` 卡。执行：

Run: `node miniprogram/cloudhosting/fun-card-renderer/scripts/render-demo.js miniprogram/assets/fun-text/demo`

首页使用横向 `swiper` 展示五张真实 PNG，滑到最后一张后展示 CTA。不得手工截图或使用第三方案例素材。

Run: `node --test tests/fun-text-entry.test.cjs && npm run check:miniprogram && npm run check:syntax`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/contentGuardClient.js miniprogram/pages/fun-text miniprogram/assets/fun-text/demo miniprogram/app.json miniprogram/pages/index tests/fun-text-entry.test.cjs miniprogram/cloudhosting/fun-card-renderer/scripts/render-demo.js package.json
git commit -m "feat: add fun text entry and swipe demo"
```

### Task 8: 三套可滑候选页和服务端低清降级

**Files:**
- Create: `miniprogram/utils/funCardRendererClient.js`
- Create: `miniprogram/pages/fun-text-candidates/fun-text-candidates.js`
- Create: `miniprogram/pages/fun-text-candidates/fun-text-candidates.json`
- Create: `miniprogram/pages/fun-text-candidates/fun-text-candidates.wxml`
- Create: `miniprogram/pages/fun-text-candidates/fun-text-candidates.wxss`
- Modify: `miniprogram/app.json`
- Create: `tests/fun-text-candidates-page.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: eventChannel `{ project }`、`fun-card-canvas`、`replanProject(project)`、`buildPreviewPayload(project)`、renderer `/preview-stack`。
- Produces: `requestPreviewStack(payload)`、页面事件 `onSwipeCandidate`、`onUseCandidate`、`onEditCandidate`、`onRegenerate`、`onCanvasError`。

- [ ] **Step 1: 写失败测试，锁定三个独立牌堆和导航契约**

测试断言三套候选各维护 `currentIndex`；滑动 A 不改变 B/C；“再来三套”把 `brief.variant` 加 1 并重建项目；“用这套”选择候选后导航 `template-result`；“自己改改”导航编辑页；字体错误只触发一次服务端 `/preview-stack`，失败时显示重试而不丢项目。

- [ ] **Step 2: 运行测试并确认候选页缺失**

Run: `node --test tests/fun-text-candidates-page.test.cjs`

Expected: FAIL。

- [ ] **Step 3: 实现严格 renderer 客户端**

`requestPreviewStack` 和 `requestRenderStack` 共用 `requestRenderer(path, payload)`；服务地址为空抛 `FUN_RENDERER_NOT_CONFIGURED`；非 200、`ok !== true`、项目/候选 ID 不匹配、卡数或序号不匹配一律抛 `INVALID_RENDER_RESPONSE`。不得接受只返回部分卡片的成功响应。

- [ ] **Step 4: 实现三个可滑小牌堆和降级状态**

每套牌堆只挂载当前卡、前一张和后一张的 Canvas，避免同时创建最多 24 个 Canvas。页面为每套显示方案名、`当前/总数`、“用这套”和“自己改改”。`onCanvasError` 只调用一次 `requestPreviewStack(buildPreviewPayload(project))` 批量请求三套低清图，严格校验响应后按 `candidateId` 回填；成功候选改用 `<image>`，失败显示“手写预览暂不可用，点此重试”，禁止系统字体回退。

Run: `node --test tests/fun-text-candidates-page.test.cjs tests/fun-card-canvas.test.cjs && npm run check:miniprogram`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/funCardRendererClient.js miniprogram/pages/fun-text-candidates miniprogram/app.json tests/fun-text-candidates-page.test.cjs package.json
git commit -m "feat: compare three swipeable fun text candidates"
```

### Task 9: 阶段一轻编辑页

**Files:**
- Create: `miniprogram/pages/fun-text-editor/fun-text-editor.js`
- Create: `miniprogram/pages/fun-text-editor/fun-text-editor.json`
- Create: `miniprogram/pages/fun-text-editor/fun-text-editor.wxml`
- Create: `miniprogram/pages/fun-text-editor/fun-text-editor.wxss`
- Modify: `miniprogram/app.json`
- Create: `tests/fun-text-editor-page.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 已选择或指定候选的 `FunTextProject`。
- Produces: 页面事件 `onEditText`、`onConfirmText`、`onSelectStylePack`、`onSortStart`、`onSortMove`、`onSortEnd`、`onConfirmEdits`。

- [ ] **Step 1: 写失败测试，限制编辑范围并验证封面排序**

测试断言：页面只有“改文字”“换整叠风格”“调整顺序”三个入口；改文字走 `updateCardText` 的长度规则；切视觉包重合成整叠；拖动第三张到第一张后 `order` 连续且首张标记“微信封面”；确认后导航结果页；页面不存在自由画笔、贴纸添加、图层、撤销或 AI 按钮。

- [ ] **Step 2: 运行测试并确认编辑页缺失**

Run: `node --test tests/fun-text-editor-page.test.cjs`

Expected: FAIL。

- [ ] **Step 3: 实现当前卡编辑和整叠换包**

当前卡用 `fun-card-canvas` 显示。文字编辑弹层显示 `Array.from(text).length`；非 reveal 上限 12，reveal 上限 40。视觉包只显示三个注册项，选择后调用 `switchCandidateStyle`，不暴露颜色、字号或字体参数。

- [ ] **Step 4: 实现缩略图拖动排序和确认导航**

使用 `movable-area`/`movable-view`；开始拖动记录 `fromIndex`，移动时按缩略图中心点计算 `toIndex`，结束时只调用一次 `moveCard`。首张缩略图显示“微信封面”。确认时发送完整 `{ project }`，不在 URL 序列化项目。

Run: `node --test tests/fun-text-editor-page.test.cjs tests/fun-text-project.test.cjs && npm run check:miniprogram`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/fun-text-editor miniprogram/app.json tests/fun-text-editor-page.test.cjs package.json
git commit -m "feat: add focused fun text editing"
```

### Task 10: 高清结果、共享顺序保存和微信预览

**Files:**
- Create: `miniprogram/utils/imageExporter.js`
- Create: `miniprogram/pages/template-result/template-result.js`
- Create: `miniprogram/pages/template-result/template-result.json`
- Create: `miniprogram/pages/template-result/template-result.wxml`
- Create: `miniprogram/pages/template-result/template-result.wxss`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/result/result.js`
- Modify: `miniprogram/pages/dressup/dressup.js`
- Create: `tests/image-exporter.test.cjs`
- Create: `tests/fun-text-result.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 选中候选的 `buildRenderPayload(project)`、`requestRenderStack(payload)`、现有 `pages/preview` 数组契约。
- Produces: `resolveImagePath(wxApi, url)`、`saveImagesSequentially(wxApi, urls, options)`、结果任务 `{ mode:'funtext', type:'funtext', projectSnapshot, cards }`。

- [ ] **Step 1: 写失败测试，覆盖高清响应、部分保存续存和预览数据**

```js
function fakeWxThatFailsAt(failedIndex, saved) {
  var calls = 0;
  return {
    saveImageToPhotosAlbum(options) {
      var current = calls;
      calls += 1;
      if (current === failedIndex) {
        options.fail({ errMsg: 'saveImageToPhotosAlbum:fail test' });
        return;
      }
      saved.push(options.filePath);
      options.success({});
    }
  };
}

test('sequential exporter reports the failed cursor for resume', async () => {
  const saved = [];
  const wxApi = fakeWxThatFailsAt(1, saved);
  await assert.rejects(
    () => exporter.saveImagesSequentially(wxApi, ['a.png', 'b.png', 'c.png'], { startIndex: 0 }),
    error => error.code === 'SAVE_FAILED' && error.nextIndex === 1 && error.savedCount === 1
  );
  assert.deepEqual(saved, ['a.png']);
});
```

结果页测试断言：未选择候选不渲染；响应卡数/顺序/sceneId 不一致时不写记录；成功后可打开 `pages/preview/preview` 并发送 `{ groups:[{ name:'趣味字画', cards }] , ratio:'1:1' }`；保存失败后再次点击从 `saveCursor` 继续。

- [ ] **Step 2: 运行测试并确认 exporter/结果页缺失**

Run: `node --test tests/image-exporter.test.cjs tests/fun-text-result.test.cjs`

Expected: FAIL。

- [ ] **Step 3: 提取共享 exporter 并回归现有两条保存链路**

`saveImagesSequentially` 依次解析 `cloud://`、HTTPS、本地路径并保存，错误对象固定包含 `code`、`nextIndex`、`savedCount`、`cause`。把 `result.js` 和 `dressup.js` 的重复下载/保存逻辑改为调用该模块，用户文案和既有行为保持不变。

- [ ] **Step 4: 实现通用模板结果页和微信发送引导**

页面接收项目后调用高清渲染；成功构造：

```js
{
  taskId: project.projectId,
  mode: 'funtext',
  type: 'funtext',
  sourceText: project.sourceText,
  projectSnapshot: project,
  cards: renderedCards,
  createdAt: project.createdAt
}
```

页面按钮固定“先滑着看看”“自己改改”“按顺序保存”。保存完成浮层明确四步：回微信聊天 → 从最近图片按顺序全选 → 勾选“发送后合并展示” → 发送。不得出现直发承诺。

Run: `node --test tests/image-exporter.test.cjs tests/fun-text-result.test.cjs tests/layered-dressup.test.cjs && npm run check:miniprogram`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/imageExporter.js miniprogram/pages/template-result miniprogram/app.json miniprogram/pages/result/result.js miniprogram/pages/dressup/dressup.js tests/image-exporter.test.cjs tests/fun-text-result.test.cjs package.json
git commit -m "feat: render save and preview fun text stacks"
```

### Task 11: 本地记录、再次打开与旧大字记录兼容提示

**Files:**
- Modify: `miniprogram/pages/record/record.js`
- Modify: `miniprogram/pages/record/record.wxml`
- Modify: `miniprogram/pages/profile/profile.wxml`
- Create: `tests/fun-text-record.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 结果任务 `{ type:'funtext', projectSnapshot, cards }`。
- Produces: 记录 `{ type:'funtext', text, totalCount, thumbnails, taskSnapshot }` 和按类型详情路由。

- [ ] **Step 1: 写失败测试，覆盖类型显示、重开和旧记录提示**

测试断言：`TYPE_META.funtext` 显示“趣味字画”；结果只写一次相同 `projectId`；查看 `funtext` 记录导航 `template-result` 并传递任务；临时 URL 为空但存在 `projectSnapshot` 时结果页会重新渲染；历史 `bigtext` 记录不导航穿搭结果页，而提示“旧大字滑卡记录暂不支持直接打开，请重新制作”。

- [ ] **Step 2: 运行测试并确认当前路由错误**

Run: `node --test tests/fun-text-record.test.cjs`

Expected: FAIL，当前 `onViewRecord` 会统一进入 `pages/result/result`。

- [ ] **Step 3: 实现按记录类型路由和防御性数据处理**

`funtext` 进入 `/pages/template-result/template-result`；`outfit` 保持现有路由；`layered-dressup` 保持 P1 路由；`bigtext` 显示兼容提示；未知类型显示“该记录版本暂不支持”。任何分支都不得删除原记录。

- [ ] **Step 4: 更新记录/我的文案并跑回归**

“我的”页把“大字滑卡、剧情滑卡即将上线”替换为“趣味字画：一句话自动变成三套可滑卡片”；不能写成已发布，直到真机验收和合并完成。实现分支内使用“开发中”口径。

Run: `node --test tests/fun-text-record.test.cjs tests/fun-text-result.test.cjs && npm test`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/record miniprogram/pages/profile/profile.wxml tests/fun-text-record.test.cjs package.json
git commit -m "feat: persist fun text projects locally"
```

### Task 12: 配置、部署说明、文档同步和完整验收

**Files:**
- Modify: `miniprogram/config/env.js`
- Modify: `scripts/check-miniprogram.mjs`
- Modify: `package.json`
- Create: `docs/deployment/fun-card-renderer.md`
- Modify: `README.md`
- Modify: `docs/current.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/changelog.md`
- Modify: `docs/product/PLAYBOOK.md`
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/superpowers/README.md`
- Modify: `docs/iterations/2026-09-01.md`
- Create: `tests/check-miniprogram.test.cjs`

**Interfaces:**
- Consumes: 全部阶段一实现。
- Produces: 可重复部署步骤、自动检查、真机验收证据和准确项目状态。

- [ ] **Step 1: 写失败的配置预检测试**

在新建的 `tests/check-miniprogram.test.cjs` 中增加断言：注册趣味字画页面时必须存在 `FUN_CARD_RENDERER_URL` 配置声明；云托管字体、许可、Dockerfile、`/render-stack` 与 `/preview-stack` 路由文件必须存在；`check:syntax` 必须包含全部新增 CommonJS 模块和页面。

Run: `node --test tests/check-miniprogram.test.cjs`

Expected: FAIL，当前预检尚不知道新服务。

- [ ] **Step 2: 实现预检和部署文档**

`docs/deployment/fun-card-renderer.md` 写明：CloudBase 云托管 Node 20 构建目录、服务名、上传字体/许可、服务账户调用 `security.msgSecCheck` 与写云存储权限、HTTPS 地址配置、字体 GET 冒烟、合规文本成功、违规文本 403、审核异常 503、预览和高清端点、24–72 小时对象清理规则、回滚到仅首页静态示例的方法。

- [ ] **Step 3: 运行自动化与 Docker 验证**

Run: `npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs`

Run: `npm --prefix miniprogram/cloudhosting/fun-card-renderer test`

Run: `docker build -t wepictool-fun-card-renderer miniprogram/cloudhosting/fun-card-renderer`

Run: `git diff --check`

Expected: 全部退出码 0。

- [ ] **Step 4: 部署并完成微信开发者工具/双端真机验收**

按部署文档发布服务并配置 HTTPS 地址。验收矩阵必须实际记录：

```text
内置示例：首页滑到反转卡 → 进入三候选 → 不请求相册
自定义输入：1 字 / 40 字 / 含 emoji / 违规文本
表达标签：4 个标签各生成 3 套且策略不重复
卡数：至少覆盖 3、5、8 张
编辑：改普通卡 / 改 reveal / 换三种视觉包 / 拖动首图
降级：字体加载失败 → 服务端低清；服务不可用 → 保留重试
渲染：安全通过 / 违规拒绝 / 审核异常 / 单张上传失败回滚
保存：首次授权 / 拒绝 / 中途失败 / 从失败序号续存
记录：重开 / 临时 URL 失效后重渲染 / 旧 bigtext 提示
微信：iOS 与 Android 核对封面、顺序、滑动、展开、收起
```

未实际执行的项必须写“未验证”，不得写通过。

- [ ] **Step 5: 同步状态文档并提交**

只有自动检查、部署和真机结果真实完成后，才把 `docs/current.md`/`changelog.md` 写为已实现或已发布；否则保持“实现分支待部署/待真机”。当天迭代日志记录所有命令输出、设备/微信版本、失败项和 README 同步决定。

```bash
git add README.md docs miniprogram/config/env.js scripts/check-miniprogram.mjs package.json tests/check-miniprogram.test.cjs
git commit -m "docs: record fun text phase one validation"
```

## Plan Completion Gate

执行者在声明阶段一完成前必须同时满足：

1. 12 个任务均有独立提交且目标测试先失败后通过；
2. 根目录完整检查、renderer 测试、Docker build 和 `git diff --check` 全部通过；
3. `FUN_CARD_RENDERER_URL` 指向已部署服务，字体、低清和高清端点均完成冒烟；
4. iOS、Android 和真实微信聊天验收有实际记录；
5. 规则模式全链路不包含生成式模型调用；
6. 文档只声明真实完成状态，未验证项明确保留；
7. 使用 `superpowers:requesting-code-review` 完成最终代码审查，再用 `superpowers:finishing-a-development-branch` 决定合并方式。
