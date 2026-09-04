# 统一叠图导出与顺序识别 Implementation Plan

**日期：** 2026-09-04  
**状态：** 待用户确认；确认前不修改业务代码

**Goal:** 让穿搭叠图、分层云换装和趣味字画通过同一导出清单生成带可见 `01…N` 角标的最终图片，并让预览、单张/按叠/全部保存、失败续存和发送引导消费同一顺序事实。

**Architecture:** 新增纯数据 `stackExportManifest` 作为所有玩法的顺序事实源；新增 `sequenceBadgeComposer` 串行解析并在本地 Canvas 上写入序号；扩展 `imageExporter` 只按已物化 manifest 保存并返回带叠身份的续存游标。三个结果页面只负责把各自项目映射为 manifest、提供独立隐藏 Canvas，并把物化后的同一 manifest 交给预览和保存。`pages/preview` 新增 manifest 输入，同时保留旧 task/groups 契约一版兼容。

**Tech Stack:** 原生微信小程序、Canvas 2D、CommonJS、Node 内置测试运行器。

## Global Constraints

- 不依赖或承诺系统相册文件名、相册排序和微信选择器排序；`wx.saveImageToPhotosAlbum` 只接收本地 `filePath`。
- 每叠从 `01` 独立编号，`01` 是唯一封面；单叠最多 99 张。
- 角标是操作信息，不写品牌名、不加水印、不改变玩法内容。
- 预览、单图保存、按叠保存和保存全部只能使用同一 manifest 中的 `exportUrl`。
- 趣味字画内容安全失败、响应校验失败或入口关闭时，不允许本地角标合成成为绕过路径。
- 图片解析、角标合成与保存均串行，避免 iOS/Android Canvas 内存峰值。
- 任何卡片身份、源图、顺序、比例或角标样式变化都使旧缓存和保存游标失效。
- 当前任务不实现回流卡、埋点、穿搭删除/排序、素材包和趣味字画视觉增强。
- 每个任务必须先运行聚焦测试，再运行相关回归；最终执行治理要求的全量检查。

## Execution Baseline Check

编码前必须确认：

```bash
git branch --show-current
git status --short
npm test
npm run check:syntax
npm run check:miniprogram
npm run lint
npm run check:docs
git diff --check
```

预期分支为 `codex/unified-stack-export`，除已确认设计、计划和治理文档外没有未知改动。记录实际测试数量，不沿用历史数字。

---

### Task 1: 建立统一导出清单、三玩法适配器和稳定指纹

**Files:**

- Create: `miniprogram/utils/stackExportManifest.js`
- Create: `tests/stack-export-manifest.test.cjs`
- Modify: `scripts/check-miniprogram.mjs` only if the new first-party module is not already covered recursively
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Produces `formatSequenceLabel(sequence)`。
- Produces `buildOutfitManifest(taskId, groups, ratio)`。
- Produces `buildDressupManifest(project, groupDefinitions)`。
- Produces `buildFunTextManifest(project, renderedCards)`。
- Produces `validateManifest(manifest)`、`flattenManifest(manifest, stackIds)`。
- Produces `manifestFingerprint(manifestInput)`；fingerprint 不包含临时 `exportUrl`，但覆盖玩法/项目版本、叠顺序、卡片身份、源图、比例和 `badgeStyleVersion`。

- [ ] **Step 1: 写失败测试**

覆盖：

- 三条玩法转换为 version 1 manifest；
- 穿搭三组、分层换装四组、趣味字画单组的固定叠顺序；
- 每叠序号独立从 `01` 开始，只有第一张 `isCover=true`；
- `others` 不进入穿搭 manifest；
- 空组保留元数据但不进入可保存队列；
- 重复 `stackId`/`cardId`、断号、错误封面、超过 99 张、空 URL、非白名单 URL 协议全部拒绝；
- 源图、比例、顺序或角标版本变化会改变 fingerprint，单纯填入 `exportUrl` 不改变 fingerprint；
- `flattenManifest` 保持叠顺序和组内顺序。

- [ ] **Step 2: 运行测试并确认 RED**

```bash
node --test tests/stack-export-manifest.test.cjs
```

Expected: FAIL，因为模块不存在。

- [ ] **Step 3: 实现纯函数和严格校验**

不得引用全局 `wx`、页面实例或当前时间；所有适配器返回可 JSON 序列化数据。卡片 URL 只接受 `cloud://`、`https://`、受控 development `http://`、`wxfile://`、包内 `/` 路径和 `USER_DATA_PATH` 形态。若现有项目缺少稳定 cardId，适配器只能从已有 `resultId`/`sceneId`/素材 id 建立，不得以数组序号伪造长期身份。

- [ ] **Step 4: 聚焦与回归**

```bash
node --test tests/stack-export-manifest.test.cjs tests/layered-dressup.test.cjs tests/fun-text-project.test.cjs
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/stackExportManifest.js tests/stack-export-manifest.test.cjs docs/iterations/2026-09-04.md
git commit -m "feat: define stack export manifests"
```

---

### Task 2: 实现可测试的序号角标布局与 Canvas 物化器

**Files:**

- Create: `miniprogram/utils/sequenceBadgeComposer.js`
- Create: `tests/sequence-badge-composer.test.cjs`
- Modify: `miniprogram/utils/imageExporter.js` only to reuse `resolveImagePath`
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Produces `getSequenceBadgeLayout(width, height, label, styleVersion)`。
- Produces `paintSequenceBadge(ctx, layout, label)`。
- Produces `materializeCard(wxApi, canvas, card, options)`。
- Produces `materializeManifest(wxApi, canvas, manifest, options)`，返回新对象，不修改输入。

- [ ] **Step 1: 写失败测试**

使用 recording canvas/context 和假的 `getImageInfo`、`canvasToTempFilePath`，覆盖：

- `01`、`09`、`10`、`99` 的补零和布局；
- 1:1、4:5、3:4、横图、竖图的右上安全边距；
- 胶囊背景、白字、投影和最小/最大字号契约；
- 先绘原图、后绘角标，导出尺寸与源图一致；
- PNG 源保留 PNG，JPEG 源导出高质量 JPEG；
- cloud/HTTPS/本地路径先经 `resolveImagePath`；
- 多张卡严格串行，前一张完成后才开始下一张；
- 第 N 张解析、解码或导出失败时停止，返回 `BADGE_COMPOSE_FAILED`、`stackId`、`sequenceLabel`；
- 输入 manifest 保持不变，输出只填充匹配卡片的 `exportUrl`/宽高；
- generation token 失效时不返回陈旧结果。

- [ ] **Step 2: 运行测试并确认 RED**

```bash
node --test tests/sequence-badge-composer.test.cjs
```

- [ ] **Step 3: 实现最小合成器**

采用单个可复用 Canvas 串行绘制，不创建并行图片节点。图片短边决定边距、胶囊高和字号，并施加固定上下限。使用 `roundRect` 时提供路径降级，避免低版本 Canvas 无方法时报错。每次绘制前重置 transform、alpha、shadow 和 canvas 尺寸，禁止上一张状态泄漏。

- [ ] **Step 4: 聚焦与回归**

```bash
node --test tests/sequence-badge-composer.test.cjs tests/image-exporter.test.cjs tests/fun-card-canvas.test.cjs
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/sequenceBadgeComposer.js tests/sequence-badge-composer.test.cjs docs/iterations/2026-09-04.md
git commit -m "feat: compose visible stack sequence badges"
```

---

### Task 3: 收敛 manifest 保存、进度和断点续存语义

**Files:**

- Modify: `miniprogram/utils/imageExporter.js`
- Modify: `tests/image-exporter.test.cjs`
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Preserve `resolveImagePath(wxApi, url)`、`saveImagesSequentially(wxApi, urls, options)` for compatibility。
- Add `saveExportManifest(wxApi, manifest, options)`。
- `options` supports `stackIds`、`startIndex`、`expectedFingerprint`、`onProgress(entry, current, total)`。
- Failure includes `code`、`nextIndex`、`savedCount`、`stackId`、`sequenceLabel`、`manifestFingerprint`、`cause`。

- [ ] **Step 1: 扩展失败测试**

覆盖：

- 只保存已经存在本地 `exportUrl` 的卡片；缺失时在调用相册 API 前拒绝；
- 保存一个叠、多个指定叠和全部可保存叠；
- `onProgress` 收到叠名、`03` 等可展示信息；
- 第二张失败返回全局 `nextIndex=1`，健康重试只保存后续图片；
- manifest fingerprint 与页面保存会话不一致时返回 `STALE_EXPORT_SESSION`；
- 授权拒绝保留游标并返回 `AUTH_DENIED`；
- 重复点击的并发隔离由调用方 token 测试锁定；
- 旧 URL 数组 API 行为不回归。

- [ ] **Step 2: 运行并确认 RED**

```bash
node --test tests/image-exporter.test.cjs
```

- [ ] **Step 3: 实现 manifest 保存入口**

内部先验证 manifest 和 fingerprint，再构造只含 `exportUrl` 的扁平队列。不得在保存阶段重新下载 `sourceUrl` 或重新绘制角标；物化和保存职责保持分离。

- [ ] **Step 4: 回归**

```bash
node --test tests/image-exporter.test.cjs tests/fun-text-result.test.cjs tests/layered-dressup.test.cjs
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/utils/imageExporter.js tests/image-exporter.test.cjs docs/iterations/2026-09-04.md
git commit -m "feat: save materialized stack manifests"
```

---

### Task 4: 接入穿搭结果页

**Files:**

- Modify: `miniprogram/pages/result/result.js`
- Modify: `miniprogram/pages/result/result.wxml`
- Modify: `miniprogram/pages/result/result.wxss`
- Modify: `tests/task.test.cjs`
- Create: `tests/outfit-stack-export.test.cjs`
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Page creates an outfit manifest from current groups and ratio after card composition settles。
- Adds a dedicated hidden `sequenceBadgeCanvas`; it must not share the existing white-card composer canvas。
- Produces page state `exportPreparing`、`exportManifest`、`exportFingerprint`、`saveCursor`、`saveSessionFingerprint`、`exportError`。

- [ ] **Step 1: 写页面失败测试**

覆盖：

- tops/bottoms/shoes 分别从 `01` 编号，others 不进入；
- 页面等待白底卡合成完成后才物化编号图；
- 编号图生成后缩略图不再叠加 CSS 数字，显示图片内角标；
- 微信预览、保存单图、保存一组、保存全部使用同一 `exportUrl`；
- 改分类、切比例、原图/白底切换或重做成功后旧 fingerprint、缓存和游标全部失效；
- 保存失败显示具体编号并从该项继续；
- 内容仍在生成、角标失败或不足 3 张时不得误导为可叠图保存；
- 快速连续点击只启动一次准备/保存任务，旧 generation 不覆盖新状态。

- [ ] **Step 2: 运行并确认 RED**

```bash
node --test tests/outfit-stack-export.test.cjs tests/task.test.cjs
```

- [ ] **Step 3: 接入独立 Canvas 与共享模块**

在现有 compose queue 完成后异步准备 manifest。单图保存允许保存当前带组内序号的最终图；组和全部保存继续遵守发送门槛。错误文案必须区分白底卡生成失败、顺序图生成失败、相册授权失败和相册保存失败。

- [ ] **Step 4: 回归**

```bash
node --test tests/outfit-stack-export.test.cjs tests/task.test.cjs tests/preview-layout.test.cjs tests/image-exporter.test.cjs
npm run check:miniprogram
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/result tests/outfit-stack-export.test.cjs tests/task.test.cjs docs/iterations/2026-09-04.md
git commit -m "feat: export numbered outfit stacks"
```

---

### Task 5: 接入分层云换装的四叠预览与保存

**Files:**

- Modify: `miniprogram/pages/dressup/dressup.js`
- Modify: `miniprogram/pages/dressup/dressup.wxml`
- Modify: `miniprogram/pages/dressup/dressup.wxss`
- Modify: `tests/layered-dressup.test.cjs`
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Page builds a four-stack manifest in registry order。
- Adds an independent hidden `sequenceBadgeCanvas`。
- Preview and save consume the same materialized manifest。

- [ ] **Step 1: 写失败测试**

覆盖：

- 头像/发型、上衣、下装、鞋子各自从 `01` 开始；
- 内置、用户和 mixed 素材走同一角标路径；
- 加入、删除、左右移动素材后 fingerprint 改变并清空游标；
- 少于 3 张仍能看到带编号预览，但保存此组禁用；
- 保存全部按四组固定顺序，只包含满足门槛的组；
- 某组第 N 张失败后提示组名与编号，重试不重复前项；
- 预览收到的 URL 与保存调用完全相同；
- 页面卸载或新项目加载后旧物化结果不能写回。

- [ ] **Step 2: 运行并确认 RED**

```bash
node --test tests/layered-dressup.test.cjs tests/stack-export-manifest.test.cjs
```

- [ ] **Step 3: 实现页面适配**

把当前 `saveItemsSequentially` 的 URL 推导迁移到 manifest/session；保留现有用户文案、草稿和 sendability 规则。`onPreview` 在物化完成前展示 loading，失败则停留当前页并允许重试。

- [ ] **Step 4: 回归**

```bash
node --test tests/layered-dressup.test.cjs tests/image-exporter.test.cjs tests/preview-layout.test.cjs
npm run check:miniprogram
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/dressup tests/layered-dressup.test.cjs docs/iterations/2026-09-04.md
git commit -m "feat: export numbered layered dressup stacks"
```

---

### Task 6: 接入趣味字画结果页并保持安全边界

**Files:**

- Modify: `miniprogram/pages/template-result/template-result.js`
- Modify: `miniprogram/pages/template-result/template-result.wxml`
- Modify: `miniprogram/pages/template-result/template-result.wxss`
- Modify: `tests/fun-text-result.test.cjs`
- Modify: `tests/fun-text-emergency.test.cjs`
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Builds a single-stack manifest only after validated remote/local render success。
- Reuses the page's existing hidden exporter Canvas only if it is idle; otherwise adds a dedicated sequence Canvas so local emergency rendering and badge composition cannot overlap。
- Record cache continues storing original rendered cards and render fingerprint; numbered export cache is reconstructed from project/rendered cards and is not trusted across incompatible versions。

- [ ] **Step 1: 写失败测试**

覆盖：

- 完整故事从 `01` 连续编号，scene/card identity 与渲染响应严格匹配；
- “先滑着看看”和“按顺序保存”使用同一 `exportUrl`；
- 改文字、换风格、排序、重新生成或重新渲染后旧 export session 失效；
- renderer 内容安全、响应错误和入口关闭不触发角标 Canvas、预览或保存；
- 明确的网络连接错误走既有本地 Canvas 降级后，才允许对成功本地图继续加角标；
- 旧异步渲染/物化结果不覆盖较新项目；
- 保存失败按钮显示“从 03 继续保存”而不是只显示剩余张数；
- 旧记录重开会重建编号图，错误版本不重建。

- [ ] **Step 2: 运行并确认 RED**

```bash
node --test tests/fun-text-result.test.cjs tests/fun-text-emergency.test.cjs
```

- [ ] **Step 3: 实现适配与缓存边界**

确保角标属于导出层，不写入 scene JSON 或远端 render fingerprint。物化失败不写本地历史成功记录；已经存在的合法原始渲染记录不得被删除。

- [ ] **Step 4: 回归**

```bash
node --test tests/fun-text-result.test.cjs tests/fun-text-emergency.test.cjs tests/fun-text-record.test.cjs tests/image-exporter.test.cjs
npm run check:miniprogram
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/template-result tests/fun-text-result.test.cjs tests/fun-text-emergency.test.cjs docs/iterations/2026-09-04.md
git commit -m "feat: export numbered fun text stacks"
```

---

### Task 7: 迁移微信预览契约和三页发送引导

**Files:**

- Modify: `miniprogram/pages/preview/preview.js`
- Modify: `miniprogram/pages/preview/preview.wxml` only if the manifest needs visible stack metadata
- Modify: `tests/preview-layout.test.cjs`
- Modify: `miniprogram/pages/result/result.wxml`
- Modify: `miniprogram/pages/dressup/dressup.wxml`
- Modify: `miniprogram/pages/template-result/template-result.wxml`
- Create: `tests/stack-send-guide.test.cjs`
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/iterations/2026-09-04.md`

**Interfaces:**

- Preview accepts `{ manifest, selectedStackIds, ratio }`。
- Keeps legacy `{ task }` and `{ groups, ratio }` for one compatibility cycle, but converts them into internal named groups and never claims they are numbered final exports。
- All new callers send materialized manifest only。

- [ ] **Step 1: 写失败测试**

覆盖：

- manifest 输入只使用 `exportUrl`，缺失 `exportUrl` 时 fail closed；
- manifest 的叠顺序、组内顺序和 `01` 封面进入预览后不变；
- 旧 task/groups 输入仍能打开，不影响既有记录；
- 三个结果页的新调用不再发送裸 `groups`；
- 三处引导都包含“每次只发送一叠”“按图片角标 01…勾选”“勾选发送后合并展示”“确认 01 在第一位”；
- 文案不包含文件名保证、系统自动排序或一键直发承诺；
- 预览页长按保存使用当前 manifest 的编号图。

- [ ] **Step 2: 运行并确认 RED**

```bash
node --test tests/preview-layout.test.cjs tests/stack-send-guide.test.cjs
```

- [ ] **Step 3: 实现契约迁移与文案统一**

保持既有滑动、展开/收起、稳定图片节点和长按行为；只替换输入归一化和保存数据源。技术规格必须删除“文件名控制顺序”的保证，记录 manifest 版本、角标层和兼容周期。

- [ ] **Step 4: 回归**

```bash
node --test tests/preview-layout.test.cjs tests/stack-send-guide.test.cjs tests/outfit-stack-export.test.cjs tests/layered-dressup.test.cjs tests/fun-text-result.test.cjs
npm run check:miniprogram
npm run check:syntax
```

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/preview miniprogram/pages/result/result.wxml miniprogram/pages/dressup/dressup.wxml miniprogram/pages/template-result/template-result.wxml tests/preview-layout.test.cjs tests/stack-send-guide.test.cjs docs/product/TECHNICAL_SPEC.md docs/iterations/2026-09-04.md
git commit -m "feat: preview and guide numbered stack exports"
```

---

### Task 8: 视觉样例、全量验证、真机矩阵和治理收口

**Files:**

- Create: `tests/fixtures/stack-export/` only if deterministic PNG fixtures are required
- Modify: `tests/sequence-badge-composer.test.cjs`
- Modify: `README.md`
- Modify: `docs/current.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/changelog.md` only after behavior is ready to merge/release
- Modify: `docs/product/PLAYBOOK.md`
- Modify: `docs/product/PRD.md`
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/iterations/2026-09-04.md` or the actual execution date log

**Interfaces:**

- Produces deterministic visual QA output for `01`、`09`、`10`、`99` over white, light, dark and photo backgrounds。
- Produces actual acceptance evidence; unexecuted external checks remain `未验证`。

- [ ] **Step 1: 生成并检查视觉样例**

覆盖 1:1、4:5、3:4、横图、竖图、白衣白底、黑板风格、复杂照片背景。检查数字可读、右上安全边距、画质、透明 PNG 和主体遮挡。视觉样例只在确实用于回归时入库，否则记录生成命令与人工结论，不提交临时文件。

- [ ] **Step 2: 运行完整自动化检查**

```bash
npm test
npm run check:syntax
npm run check:miniprogram
npm run lint
npm run check:docs
git diff --check
```

记录实际测试数、退出码和任何环境限制。

- [ ] **Step 3: 微信开发者工具验证**

逐条验证三种玩法：生成/物化、编号预览、单图保存、按叠保存、全部保存、模拟失败续存、修改顺序后会话重置。检查 375px 和常见 Android 屏宽。

- [ ] **Step 4: iOS、Android 与真实微信聊天验证**

每端至少对三种玩法各验证一叠：

- 相册最近项目的实际保存排列；
- 按可见角标选择后 `01` 是否成为封面；
- 左右滑动和展开顺序；
- 中途拒绝授权、保存失败后续存；
- 图片画质和角标遮挡。

系统相册若与保存调用顺序不一致，产品仍以角标选择引导为唯一可靠路径，并把设备差异写入帮助文案。无法执行的项目必须标记 `未验证`。

- [ ] **Step 5: 同步治理和长期文档**

修正 PRD 功能状态；PLAYBOOK 改为“图片可见编号 + 串行保存 + 用户按编号选择”，不再声称文件名控制顺序；README、current、roadmap 只描述真实完成状态。只有合并或发布后才把用户可感知变化写入 changelog。

- [ ] **Step 6: 最终审查与提交**

```bash
git status --short
git diff --check
git diff --stat main...HEAD
```

检查没有临时图片、密钥、云环境值或无关分支文件。提交最终文档和测试结果；在真机矩阵未完成前，不声明 P0 完成或生产 READY。

## Plan Completion Gate

只有同时满足以下条件才能把本计划标记为完成：

1. 三个玩法都通过统一 manifest 生成编号最终图；
2. 预览、保存和长按保存使用同一 `exportUrl`；
3. 保存失败续存不会重复成功项，manifest 变化会清空游标；
4. 旧记录与旧 preview 输入仍能安全打开；
5. 内容安全和紧急关闭边界没有回归；
6. 自动化和治理完整检查全部通过；
7. 微信开发者工具、iOS、Android 和真实微信聊天有实际记录；
8. 文档不再承诺文件名或系统相册排序能力；
9. 未验证项明确保留，生产状态与证据一致。
