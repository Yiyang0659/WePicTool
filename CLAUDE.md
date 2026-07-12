# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

WePicTool 是一个微信小程序，用于帮助用户生成穿搭参考图。用户选择 1–9 张衣服/鞋子图片后，小程序会进行压缩并上传到微信云开发（CloudBase），云函数返回分组结果（上衣组/下装组/鞋子组/未处理素材区），用户可以保存到相册并回微信发送给朋友参考。

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
  - 结果页采用**微信聊天窗口预览风格**：上衣 / 下装 / 鞋子 / 未处理素材各以一个“合并发图”气泡卡片展示。
  - 点击卡片“展开 N”可在当前页展开横向滚动的缩略图列表，左右滑动查看该组全部图片。
  - 展开后支持原图 / 白底图切换、改分类、预览大图。
  - 底部操作栏支持“一键合并发送”（分享 / 保存全部 / 按分组保存）、“编辑分组”（复用改分类）、“调整顺序”（二期）、“保存长图”（二期）。
  - 处理完成后自动把任务快照写入本地记录，供记录页查看与再次生成。

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

- `miniprogram/cloudfunctions/processOutfit/index.js`
  - 云函数入口。当前按图片索引做 mock 分组：1–3 上衣、4–6 下装、7–9 鞋子、其余未处理。
  - 代码中已标注阶段二扩展点（AI 分类）和阶段三扩展点（抠图 + 白底卡片合成）。

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
- `docs/product/PRD.md` — 产品需求、MVP 范围、开发红线。
- `docs/product/stage-roadmap.md` — 阶段零到阶段五的路线和进入条件。
- `docs/product/development-playbook.md` — 开发者/AI 助手任务口径，按阶段拆分。
- `docs/product/iteration-handoff-2026-07-08.md` — 最新迭代交接日志和下一步建议。
- `docs/product/technical-architecture.md` — 目录职责、任务契约、结果结构、状态规划。
- `docs/ai-workflows/classification-prompt.md` — 阶段二 AI 分类提示词。
- `docs/ai-workflows/matting-prompt.md` — 阶段三抠图提示词。
- `docs/ai-workflows/matting-api-evaluation.md` — 阶段三抠图 API 评估标准。

## 重要约束

- MVP 不做登录、历史记录、付费、账号体系。
  - 注：当前已加入**本地轻量记录**（`pages/record`），数据仅存设备本地、不同步、不上云、不关联账号，属于体验增强而非历史账号体系。
- 不把表情包、心情状态图、日常合集放入主入口。
- 不构建复杂画布编辑器。
- 不承诺多图一键直发微信聊天。
- 单张图片失败不能阻断整批任务。
- 阶段二分类标签只包含：`tops`、`bottoms`、`shoes`、`other_product`、`daily`、`unsupported`、`uncertain`。
- 完整人物试穿图默认 `daily`，不进入白底人像链路。
- 白底卡片合成必须在后端（云函数）完成，不能依赖前端 Canvas 处理大图。

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

项目当前处于阶段二和阶段三之间：阶段二 AI 分类已接入（DashScope `qwen-vl-plus`），结果页支持改分类，下一步进入阶段三（抠图 + 白底卡片生成）。同时，小程序 UI 已升级为底部三 Tab（首页 / 记录 / 我的），结果页采用微信聊天窗口预览风格，突出“合并发图”体验。详细交接内容见 `docs/product/iteration-handoff-2026-07-08.md`。

默认的继续推进口径：

> 继续 WePicTool 阶段三迭代：选型并接入抠图 API，对 tops/bottoms/shoes 生成白底卡片。
