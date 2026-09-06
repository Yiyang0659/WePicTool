# 趣味字画内容扩展与聚焦编辑 Implementation Plan

> 状态：代码实施完成；开发者工具、双端与生产链路外部验收中
>
> 日期：2026-09-05

> 2026-09-06 验证补充：开发者工具已恢复登录并确认输入页、三套候选、候选独立滑动、三编辑面板、代表性风格/背景/配色/字感、文字修改、撤销/重做、装饰添加/拖动、重新渲染和预览入口；本地 renderer 三款字体路由均返回 200、`font/ttf` 与 CORS `*`。用户截图指出的可视缩略、排序补位和文字弹窗 Canvas 遮挡已修正；375 px、真实双指、iOS/Android 与线上渲染仍为外部验收项。

**Goal:** 在不增加主包大图、不引入通用修图器的前提下，交付 12 个可套用案例、4 种新增规则玩法、4 套新增风格、3 种授权字感，以及支持背景/配色/字感/装饰与撤销恢复的聚焦编辑器。

**Architecture:** 案例、策略、视觉包、字感和装饰继续使用 CommonJS 白名单注册表；案例只引用结构化配置。场景 JSON 增加稳定的风格元数据，所有编辑通过不可变项目模型修改，并清除旧渲染状态。小程序 Canvas 与云端 renderer 使用同一场景和字体键。交互编辑只允许当前卡片的受控变更，不增加通用图层协议。

**Tech Stack:** 微信原生小程序、CommonJS、Canvas 2D、`wx.loadFontFace`、CloudBase 云托管、Node.js 20、`@napi-rs/canvas`、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-05-fun-text-content-editor-expansion.md`

## 全局约束

- 继续在 `.worktrees/fun-text-stack-phase1` 的 `codex/unified-stack-export` 上工作，保留所有已有未提交改动。
- 阶段 C 的用户照片导入、裁切和安全审核不在本计划实施范围。
- 不开放任意 RGB、任意字体上传、无限图层、滤镜、抠图或自由画笔。
- 所有案例使用结构化数据；不得为 12 个案例加入大尺寸截图。
- 新字体只从官方仓库固定版本引入，并随 renderer 分发对应 OFL 文本；小程序只经 HTTPS renderer 字体端点加载，不放入主包。
- 编辑后必须使 `renderedCards`、render fingerprint、manifest 与失败续存状态失效。
- 每张场景最多 2 个文字层、6 个装饰层；坐标、缩放和旋转必须通过双端白名单校验。
- 每个任务先补失败测试，再写最小实现，再运行相关回归。
- 发布结论保持 NOT READY；本计划完成不代替 iOS、Android、真实微信和云端生产门禁。

## 字体资产决定

- `marker`：现有 LXGW Marker Gothic，随手写字感；
- `playful`：Smiley Sans / 得意黑官方未修改字体，轻松醒目字感；
- `headline`：Ma Shan Zheng 官方未修改字体，标题书写字感；
- 三者均使用 SIL OFL 1.1；保留原字体名称和许可证，不制作改名字体；
- 若固定版本下载、注册或中文字符覆盖验证失败，该字体不得以系统字体替代，界面显示不可用并保留另外两项。

---

### Task 1：案例注册表与输入页案例选择

**Files:**

- Create: `miniprogram/config/funTextCases.js`
- Modify: `miniprogram/pages/fun-text/fun-text.js`
- Modify: `miniprogram/pages/fun-text/fun-text.wxml`
- Modify: `miniprogram/pages/fun-text/fun-text.wxss`
- Create: `tests/fun-text-cases.test.cjs`
- Modify: `tests/fun-text-entry.test.cjs`

- [x] 定义 6 个场景、12 个案例，锁定唯一 `caseId`、默认文案、表达标签、玩法偏好和推荐风格。
- [x] 实现 `getFunTextCase`、`listFunTextCases` 和字段白名单校验。
- [x] 输入页增加“找个灵感”横向案例区；点击案例只填充输入和推荐项，不立即跳页。
- [x] 案例选择不新增文本埋点；项目案例元数据只记录 `caseId` 与注册表偏好键。
- [x] 运行 `node --test tests/fun-text-cases.test.cjs tests/fun-text-entry.test.cjs`。

### Task 2：四种新增规则玩法与候选选择

**Files:**

- Modify: `miniprogram/config/funTextStrategies.js`
- Modify: `miniprogram/utils/strategySelector.js`
- Modify: `miniprogram/utils/candidatePlanner.js`
- Modify: `miniprogram/utils/candidateValidator.js`
- Modify: `tests/fun-text-candidates.test.cjs`

- [x] 新增 `repeat_escalate`、`soft_direct`、`countdown_reveal`、`question_answer`。
- [x] 每种玩法提供确定性短句变体，并完整保留唯一 reveal 原句。
- [x] 根据案例偏好与表达标签从 8 种玩法中选择 3 种，保证同批不重复。
- [x] 扩展校验但保持 3–8 张、角色白名单和长度限制不变。
- [x] 运行候选、AI 校验和场景回归。

### Task 3：四套新增风格、背景变体与配色

**Files:**

- Modify: `miniprogram/config/stylePacks.js`
- Modify: `miniprogram/utils/styleMatcher.js`
- Modify: `miniprogram/utils/sceneComposer.js`
- Modify: `miniprogram/cloudhosting/fun-card-renderer/sceneValidator.js`
- Modify: `tests/fun-text-scenes.test.cjs`
- Modify: `tests/fun-card-renderer.test.cjs`

- [x] 增加发疯方格、温柔手账、蓝色汽水、复古票根四套风格。
- [x] 每套定义 3 个背景变体和 2–3 套兼容配色，所有键进入双端白名单。
- [x] 场景记录 `stylePackId`、`backgroundVariantKey`、`paletteKey`，合成仍保持确定性。
- [x] 云端 validator 接受合法变体并拒绝跨风格背景与任意颜色。
- [x] 运行场景与 renderer 校验回归。

### Task 4：三种字体字感与双端一致渲染

**Files:**

- Create: `miniprogram/config/fontFeels.js`
- Modify: `miniprogram/utils/funTextFont.js`
- Modify: `miniprogram/utils/sceneComposer.js`
- Modify: `miniprogram/components/fun-card-canvas/fun-card-canvas.js`
- Modify: `miniprogram/cloudhosting/fun-card-renderer/renderer.js`
- Modify: `miniprogram/cloudhosting/fun-card-renderer/server.js`
- Add: `miniprogram/cloudhosting/fun-card-renderer/fonts/*`
- Add: `miniprogram/cloudhosting/fun-card-renderer/LICENSES/*`
- Modify: renderer and font tests

- [x] 固定字体版本、文件校验值和许可证来源。
- [x] 字感注册表定义 `fontKey`、`fontFamily`、字体路径和效果配方。
- [x] 小程序按当前场景字体加载并缓存状态；失败时不静默替换。
- [x] renderer 按 `fontKey` 注册并使用对应字体，字体路由仅暴露白名单文件。
- [x] 使用同一中文样例校验三款字体均成功注册并生成非空 PNG。

### Task 5：不可变编辑 API、历史与渲染失效

**Files:**

- Modify: `miniprogram/utils/funTextProject.js`
- Modify: `tests/fun-text-project.test.cjs`
- Modify: unified export/result tests as required

- [x] 增加单卡/整组背景、配色、字感编辑 API。
- [x] 增加装饰添加、删除、位置、缩放、旋转和层级 API。
- [x] 增加字号档位与恢复当前卡/整组 API。
- [x] 增加最多 20 步的 undo/redo 历史，历史不递归保存自身。
- [x] 所有有效变更统一调用渲染失效逻辑；无效操作不制造历史。
- [x] 运行项目、结果、记录和导出回归。

### Task 6：三入口聚焦编辑界面

**Files:**

- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.js`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxml`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxss`
- Modify: `tests/fun-text-editor-page.test.cjs`

- [x] 一级入口固定为内容、样式、装饰。
- [x] 内容面板复用文字与顺序，增加字号档位和恢复操作。
- [x] 样式面板提供风格、背景、配色、字感与“当前卡/整组”作用范围。
- [x] 装饰面板提供推荐素材、删除、层级和变换入口。
- [x] 顶部提供撤销/重做状态，底部完成按钮保持单一主操作。
- [ ] 375/390 宽度下预览和工具区不发生横向页面溢出。

### Task 7：装饰拖动、缩放和旋转手势

**Files:**

- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.js`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxml`
- Create: `miniprogram/utils/funTextTransform.js`
- Create: `tests/fun-text-transform.test.cjs`
- Modify: `tests/fun-text-editor-page.test.cjs`

- [x] 单指命中装饰后拖动，双指计算中心、距离和角度。
- [x] 坐标限制在 0–1080，缩放限制在 0.35–2.5，旋转归一化到 ±180°。
- [x] 手势期间 `catchtouchmove` 阻止页面误滚，结束时只提交一次历史记录。
- [x] 文字层不可被装饰手势误选；展开面板与缩略图排序互不抢手势。
- [x] 运行手势纯函数和页面事件测试。

### Task 8：云端协议、记录兼容与降级

**Files:**

- Modify: `miniprogram/cloudhosting/fun-card-renderer/sceneValidator.js`
- Modify: `miniprogram/cloudhosting/fun-card-renderer/renderer.js`
- Modify: project/result/record modules as required
- Modify: renderer/runtime/result/record tests

- [x] 新场景字段在预览和最终渲染协议中严格校验。
- [x] 旧 version 1 项目可读取；新字段作为兼容附加字段继续使用 version 1，避免现有结果页错误拒绝可兼容记录。
- [x] 字体或云服务失败时保留项目和重试入口，不输出伪一致成图。
- [x] 修改后的 fingerprint、manifest 和失败续存游标均重新生成。
- [x] 运行 renderer、记录与统一导出回归。

### Task 9：文档、包体与完整验证

**Files:**

- Modify: `README.md` if user-visible scope is complete
- Modify: `docs/current.md`
- Modify: `docs/product/PRD.md`
- Modify: `docs/product/PLAYBOOK.md`
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/decisions.md`
- Modify: `docs/iterations/2026-09-05.md`

- [x] 同步实际完成范围、字体来源、未验证项和阶段 C 延后结论。
- [x] 执行 `npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs`。
- [x] 执行 `git diff --check` 和主包 2 MiB 预检，记录真实结果。
- [ ] 在微信开发者工具回归案例套用、8 种玩法、7 套风格、3 字感、三编辑面板、装饰手势、撤销/重做和重新渲染。
- [x] 明确 iOS、Android、真实微信与生产 CloudBase 仍需外部验收，不以模拟器代替。

### Task 10：编辑缩略预览、跟手排序与弹窗层级修正

**Files:**

- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.js`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxml`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxss`
- Modify: `tests/fun-text-editor-page.test.cjs`

- [x] 卡片顺序项显示当前场景的背景、文字色、文字和装饰概貌；风格、背景、配色和装饰项显示可辨识视觉样本。
- [x] 拖动跨过相邻卡片时，其他卡片按目标落点即时补位并带过渡动画，松手仅提交一次模型排序。
- [x] 打开文字弹窗时卸载底层 Canvas，并提高遮罩与弹窗层级，关闭后恢复预览。
- [x] 把装饰层级文案改成“往前显示 / 往后显示”，补充重叠关系说明和不可移动状态。
- [x] 补充页面结构、排序预览、选中态和弹窗隔离测试，再执行治理规定的完整检查。

该补充由用户基于 2026-09-06 开发者工具截图明确提出并确认实施，不改变阶段 B 的产品边界。

### Task 11：贴纸与涂鸦独立颜色选择

**Files:**

- Create: `miniprogram/config/decorationColors.js`
- Create: `miniprogram/cloudhosting/fun-card-renderer/decorationColors.js`
- Modify: `miniprogram/utils/funTextProject.js`
- Modify: `miniprogram/utils/sceneComposer.js`
- Modify: `miniprogram/utils/scenePainter.js`
- Modify: `miniprogram/cloudhosting/fun-card-renderer/sceneValidator.js`
- Modify: `miniprogram/cloudhosting/fun-card-renderer/drawAssets.js`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.js`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxml`
- Modify: `miniprogram/pages/fun-text-editor/fun-text-editor.wxss`
- Modify: `tests/fun-text-project.test.cjs`
- Modify: `tests/fun-text-scenes.test.cjs`
- Modify: `tests/fun-card-canvas.test.cjs`
- Modify: `tests/fun-card-renderer.test.cjs`
- Modify: `tests/fun-text-editor-page.test.cjs`
- Create: `tests/decoration-colors.test.cjs`
- Modify: `tests/helpers/miniprogram-loader.cjs`

- [x] 建立鲜明、浅色、透明三组白名单色板，每组 8 色，并校验小程序与 renderer 注册表完全一致。
- [x] 项目模型增加当前装饰改色和恢复原色 API，保持不可变、历史与渲染失效契约。
- [x] 本地 Canvas 与云端 renderer 使用同一 `decorationColorKey` 解析结果，贴纸保留对比线条，涂鸦使用所选描边，透明度一致。
- [x] 云端与本地场景校验允许缺省旧项目并拒绝未知颜色键。
- [x] 装饰面板增加圆角色板框、三分类横向色点、透明棋盘底、选中态和恢复原色。
- [x] 补充模型、场景、绘制、云端协议和页面测试，运行完整治理检查并在开发者工具普通编译回归。

该任务由用户提供色板参考并确认鲜明色、浅色和透明色方向后进入实施。
