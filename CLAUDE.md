# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

WePicTool 是一个微信小程序，定位为**微信「合并发送 / 叠图」玩法生成器**——穿搭白底卡是旗舰功能，玩法模板库是长期资产（2026-07-18 定位升级，详见 `docs/product/PLAYBOOK.md`）。穿搭主链路：用户选择 1–9 张衣服/鞋子图片后，小程序会进行压缩并上传到微信云开发（CloudBase），云函数返回分组结果（上衣组/下装组/鞋子组/未处理素材区），前端 Canvas 合成白底卡片，用户可以保存到相册并回微信发送给朋友参考。

本仓库同时包含一个 AI Studio / Vite 演示应用（位于 `src/` 和 `dist/`），但真正交付的产品是 `miniprogram/` 下的微信小程序。`src/` 和 `dist/` 不是小程序上传的必需内容，已被 `project.config.json` 忽略。

## 技术栈

- 微信小程序原生开发（未使用 Taro / UniApp 等框架）
- 微信云开发 CloudBase（云存储 + 云函数）
- Node.js 脚本用于上线前预检和纯规则测试
- `src/` 目录为 Vite + React + Tailwind 的演示应用

## 常用命令

在项目根目录 `/Users/Zhuanz/Desktop/WePicTool` 下运行：

```bash
# 启动 Vite 演示应用（开发模式）
npm run dev

# 构建 Vite 演示应用
npm run build

# 运行纯规则测试（Node 内置 test runner）
npm test

# 运行单个测试文件
node --test tests/task.test.cjs

# 小程序上线前预检：检查 JSON / AppID / 页面文件 / WXML 等
npm run check:miniprogram

# 语法检查小程序核心 JS 文件
npm run check:syntax

# TypeScript 类型检查（覆盖 src/ 和 scripts/）
npm run lint
```

## 高层架构

### 小程序页面与流程

- `miniprogram/pages/index/index.js`
  - 首页入口（Tab 首页）。调用 `wx.chooseMedia` 选择 1–9 张图片。
  - 对每张图片进行基础压缩，最长边不超过 1600px。
  - 如果已配置 CloudBase，则上传图片到云存储并调用 `processOutfit` 云函数。
  - 如果未配置 CloudBase，则进入本地预览模式，直接生成 mock 任务。
  - 通过 `eventChannel.emit('acceptTaskData', { task })` 将任务数据传递到结果页。

- `miniprogram/pages/result/result.js`
  - 通过 opener event channel 接收任务数据。
  - 结果页采用**白色微信聊天风格**：上衣 / 下装 / 鞋子 / 未处理素材各以气泡卡片展示。
  - 点击卡片”展开 N”可在当前页展开横向滚动的缩略图列表，左右滑动查看该组全部图片。
  - 展开后支持原图 / 白底图切换、改分类、预览大图。
  - 底部新增「📱 微信发送预览」按钮，点击跳转到深色微信聊天预览页。
  - 底部操作栏支持”一键合并发送”（分享 / 保存全部 / 按分组保存）、”编辑分组”（复用改分类）、”调整顺序”（二期）、”保存长图”（二期）。
  - 处理完成后自动把任务快照写入本地记录，供记录页查看与再次生成。

- `miniprogram/pages/preview/preview.js`
  - 深色微信聊天预览页，全屏还原微信深色模式发送预览效果。
  - 收起态：扑克牌堆叠卡片，左侧毛玻璃胶囊按钮（展开/收起），顶层卡片支持左右滑动切换。
  - 展开态：纵向列表排列，每张右侧头像，底部操作浮层。
  - 底部模拟微信输入栏（语音、输入框、表情、加号）。
  - 从结果页通过 `eventChannel` 接收任务数据。

- `miniprogram/pages/record/record.js`
  - 记录页（Tab 记录）：展示历史处理任务，按相对日期分组（当日 / 前一日 / N 天前 / 具体日期）。
  - 每条记录显示缩略图堆叠、时间、分组摘要。
  - 支持查看结果、再次生成、删除单条、清空全部。
  - 数据仅保存在本地 `wx.setStorageSync('wepictool_records')`，最多保留 20 条。

- `miniprogram/pages/profile/profile.js`
  - 我的页（Tab 我的）：匿名用户信息、联系客服、反馈意见、推荐给好友、相册权限、清空缓存、关于、隐私说明。
  - 不做登录、付费、订单、历史账号体系。

- `miniprogram/utils/task.js`
  - 前后端共享的纯工具函数，同时被测试引用。
  - 包含 `createMockTask`、`buildSendability`、`normalizeTaskGroups`、`calculateTargetSize`、`isCloudPermissionError`。
  - `buildSendability` 判断每组是否能形成微信叠图效果，阈值为 3 张。当每组都不足 3 张但总素材数不少于 3 张时，会展示降级提示。

- `miniprogram/utils/cardComposer.js`
  - 前端 Canvas 白底卡片合成工具：1:1 / 4:5 / 3:4 三种比例、分组视觉锚点（上衣偏中上 / 下装偏中下 / 鞋子居中偏下）、主体最长边占画布 78%-86%、浅色衣物轻阴影 + 细描边兜底。
  - 结果页通过串行合成队列调用（避免共享 canvas 污染和内存风险）。

- `miniprogram/cloudfunctions/processOutfit/index.js`
  - 云函数入口。已完成阶段二 AI 分类（DashScope `qwen-vl-plus`）和阶段三抠图（DashScope `qwen-image-2.0`）。
  - 抠图结果上传到云存储 `matted/` 目录，返回 `mattedUrl` 供前端展示。
  - 白底卡片合成在前端通过 Canvas 完成（CloudBase 不支持 `sharp` 等原生模块）。
  - 抠图失败的图片保留原图，不影响整批结果。

- `miniprogram/config/env.js`
  - 集中管理 CloudBase 环境 ID 和本地预览开关。
  - `CLOUD_ENV_ID` 为空时启用本地预览模式。

### 数据结构

任务结构（随阶段演进）：

```js
{
  taskId: 'task_xxx',
  mode: 'outfit',
  status: 'done',
  progress: 100,
  groups: { tops: [], bottoms: [], shoes: [], others: [] },
  results: [],
  sendability: {},
  createdAt: 0,
  expiredAt: 0,
  error: null
}
```

结果项结构：

```js
{
  resultId: 'result_1',
  sourceImageId: 'image_1',
  category: 'tops',
  type: 'mockOriginal',
  status: 'done',
  url: 'cloud://xxx',
  fileId: 'cloud://xxx',
  localPath: '',
  width: 0,
  height: 0,
  size: 0,
  order: 1,
  label: '上衣 1',
  error: null
}
```

### 演示应用

- `src/App.tsx` 是一个自包含的小程序 UI 模拟器，并内嵌了小程序源码的展示副本。
- `src/main.tsx` 和 `src/index.css` 是标准的 Vite + React + Tailwind 入口文件。
- 演示应用不属于微信小程序本体，处理小程序本体任务时不应修改它。

### 文档索引

- `README.md` — 项目总览、目录结构、本地测试、CloudBase 接入和阶段一验收。
- `docs/product/PRD.md` — 产品需求、用户画像、MVP 定义、功能需求（F-01~F-55）、开发红线。
- `docs/product/PLAYBOOK.md` — 叠图玩法实现手册：平台事实、统一叠图管线、9 个模块实现卡（对标效果/输入输出/技术路径/验收标准）、阶段六~九上线节奏、埋点方案。
- `docs/product/PROJECT_STATUS.md` — 当前阶段、已完成功能、待完成功能、历史更新。
- `docs/product/TECHNICAL_SPEC.md` — 技术选型、系统架构、数据模型、接口定义、处理流程、状态机、错误处理。
- `docs/product/DEVELOPMENT_GUIDE.md` — 开发任务模板、当前阶段任务口径、验收标准、环境配置。
- `docs/product/ARCHIVED.md` — 历史决策、已过时内容、迭代日志、归档 RESTful 接口设计。
- `docs/ai-workflows/classification-prompt.md` — 阶段二 AI 分类提示词。
- `docs/ai-workflows/matting-prompt.md` — 阶段三抠图提示词。
- `docs/ai-workflows/matting-api-evaluation.md` — 阶段三抠图 API 评估标准。

## 重要约束

- MVP 不做登录、历史记录、付费、账号体系。
  - 注：当前已加入**本地轻量记录**（`pages/record`），数据仅存设备本地、不同步、不上云、不关联账号，属于体验增强而非历史账号体系。
- 新玩法红线（2026-07-18 起，详见 PLAYBOOK 第 2 章）：所有新玩法必须走统一叠图管线；整蛊只做可爱反转；用户输入文字必须过 msgSecCheck；不加水印；每叠最少 3 张卡。旧的"不把表情包、心情状态图、日常合集放入主入口"限制已随定位升级解除，但这些形态必须作为叠图玩法模板实现，不做独立功能。
- 不构建复杂画布编辑器。
- 不承诺多图一键直发微信聊天。
- 单张图片失败不能阻断整批任务。
- 阶段二分类标签只包含：`tops`、`bottoms`、`shoes`、`other_product`、`daily`、`unsupported`、`uncertain`。
- 完整人物试穿图默认 `daily`，不进入白底人像链路。
- 白底卡片合成在前端通过 Canvas 完成（CloudBase 云函数不支持 `sharp` 等原生 C++ 模块）。

## CloudBase 配置

- AppID 配置在 `project.config.json` 和 `miniprogram/project.config.json` 中。
- CloudBase 环境 ID 配置在 `miniprogram/config/env.js` 中。
- `miniprogram/app.js` 中 `traceUser` 已关闭，项目不做登录和用户追踪。
- 真机测试或上线前需要完成：
  1. 确认 AppID 不是占位值。
  2. 确认 `miniprogram/config/env.js` 中 `CLOUD_ENV_ID` 已填写真实环境 ID。
  3. 在微信开发者工具中右键 `miniprogram/cloudfunctions/processOutfit`，选择“上传并部署：云端安装依赖”。
  4. 运行 `npm run check:miniprogram` 并修复所有错误。

## 当前迭代方向

项目定位已升级为**微信叠图玩法生成器**（2026-07-18），穿搭白底卡是旗舰功能。当前处于阶段三收尾：阶段二 AI 分类已完成（DashScope `qwen-vl-plus`），阶段三抠图已接入（DashScope `qwen-image-2.0`），前端 Canvas 白底卡片合成已实现（cardComposer.js + 结果页比例切换 + 失败重做），**待真机验收**。详细状态见 `docs/product/PROJECT_STATUS.md`，玩法规划见 `docs/product/PLAYBOOK.md`，历史决策见 `docs/product/ARCHIVED.md`。

默认的继续推进口径：

> 先完成阶段三真机验收（保存相册、比例切换、浅色衣物可辨认度、iOS+Android 内存），通过后按 PLAYBOOK.md 进入阶段六（大字滑卡 + 剧情滑卡模板引擎）。

## 文档同步规范

每次实现阶段性功能后，必须同步更新相关文档，确保文档与代码状态一致。

### 触发时机

以下情况必须执行文档同步：
1. 一个阶段的里程碑功能完成后（如抠图接入、Canvas 合成完成）。
2. 迭代交接前（写交接笔记时同步更新其他文档）。
3. 发现文档与代码不一致时。

### 变更类型 → 对应文档映射

| 变更类型 | 必须更新的文档 |
|----------|---------------|
| 阶段里程碑完成 | `docs/product/PRD.md`（功能需求状态列）、`docs/product/PROJECT_STATUS.md`（已完成功能、待完成功能）、`README.md`（当前阶段、版本包含/不包含、目录说明） |
| AI 工作流接入或变更 | `docs/ai-workflows/` 下对应提示词文档、`matting-api-evaluation.md`、`workflow-backlog.md`（更新状态）、`docs/ai-workflows/README.md`（当前文件列表）、`docs/product/DEVELOPMENT_GUIDE.md`（当前阶段说明） |
| 新页面或重大 UI 变更 | `docs/product/TECHNICAL_SPEC.md`（目录职责）、`CLAUDE.md`（高层架构）、`README.md`（目录说明） |
| 新增或删除文件/目录 | `README.md`（目录说明）+ `docs/product/TECHNICAL_SPEC.md`（如涉及小程序核心模块） |
| 迭代交接 | `docs/product/ARCHIVED.md`（迭代日志追加），同时同步上述所有文档 |
| 技术决策变更（如 API 选型、架构调整） | `docs/product/TECHNICAL_SPEC.md` + `docs/product/DEVELOPMENT_GUIDE.md` 任务口径 + `docs/product/ARCHIVED.md`（历史决策记录） |

### 提交前 Checklist

每次提交代码前，对照检查：

- [ ] PRD「功能需求」表的状态列是否反映最新代码能力。
- [ ] PROJECT_STATUS.md「已完成功能」和「待完成功能」是否准确。
- [ ] README「当前阶段」和「当前版本包含/不包含」是否准确。
- [ ] README「目录说明」是否与实际目录结构一致（新增/删除的文件和目录）。
- [ ] DEVELOPMENT_GUIDE.md「当前阶段说明」是否准确。
- [ ] 相关 AI 工作流文档的状态标注是否与实际一致。
- [ ] `docs/ai-workflows/README.md` 的「当前文件」列表是否完整。
- [ ] `docs/ai-workflows/workflow-backlog.md` 各工作流的状态标注是否准确。

### 同步操作边界（重要）

文档同步必须遵循**最小改动原则**：

**允许的操作：**
- 更新状态标记（如 F-21 的状态从"进行中"改为"已完成"）。
- 在列表末尾追加新条目（如 ARCHIVED.md 的迭代日志、PROJECT_STATUS.md 的待完成功能）。
- 更新版本号和日期。
- 新增一行目录说明（当有新文件/目录时）。

**禁止的操作：**
- 不得重写、重组或删除文档中的分析性内容（用户画像、第一性原理、技术取舍分析、设计决策说明等）。
- 不得修改功能需求的编号体系、章节结构或行文措辞。
- 不得合并、拆分或重命名文档章节标题。
- 不得删除已标注为"未开始"的功能条目。
- 不得擅自修改验收标准、性能指标或开发红线的具体数值。

**如果发现文档内容与代码有实质性矛盾（而非仅状态过时）：**
1. 先在对话中告知用户矛盾点。
2. 等用户确认后再修改，不要自行决定。

每份文档头部统一使用：

```markdown
**版本：** v{主版本}.{次版本}
**日期：** YYYY-MM-DD
**状态：** 一句话描述当前阶段进展
```

交接文档：历史决策和迭代日志统一记录在 `docs/product/ARCHIVED.md`，按日期追加。

### 迭代上下文记录（新窗口恢复用）

每次迭代完成、文档同步结束后，必须执行以下两步，确保下次新窗口能恢复上下文：

**第一步：更新 `docs/product/PROJECT_STATUS.md` 的「最新更新日志」**

在第 7 节「最新更新日志」顶部插入本次更新条目，格式：

```markdown
### YYYY-MM-DD

- **做了什么：** 一句话概括
- **改了哪些文件：** 列出主要变更文件
- **关键决策：** 本次做出的重要技术/产品决策
- **下一步：** 下次迭代应该做什么
```

**第二步：创建或更新 Claude Memory 文件**

在 memory 目录下写入一条 `project-progress` 记录，内容包含：
- 当前阶段和进度
- 本次迭代做了什么
- 下一步计划
- 关键决策摘要

这样新窗口打开时会自动加载 memory，结合 PROJECT_STATUS.md 的最新更新日志，即可完整恢复上下文。
