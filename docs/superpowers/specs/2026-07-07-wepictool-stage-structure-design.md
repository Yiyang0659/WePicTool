# WePicTool 阶段化工程整理设计规格

**日期：** 2026-07-07  
**目标项目：** `/Users/Zhuanz/Desktop/WePicTool`  
**参考资料：** 原始 PRD、产品定义文档、开发行动手册、技术流程图与阶段一计划  
**当前决策：** 以当前项目为实际改造对象，先整理到“阶段一可验收 + 阶段二/三可扩展”的工程状态。

## 1. 背景与当前状态

当前项目已经具备阶段一最小闭环雏形：

- 首页支持选择 1-9 张图片。
- 前端做基础压缩和 CloudBase 上传。
- 未配置云环境时会进入本地预览模式。
- `processOutfit` 云函数会按索引返回 mock 分组。
- 结果页按上衣、下装、鞋子、未处理素材区展示。
- 支持保存单张和按组保存，并处理相册授权失败。
- 结果页已提示每组少于 3 张时可能无法形成微信叠图效果。

参考文档仍以“完整 MVP 待开发”为主要口径。为了让代码、文档和后续 AI 工作流一致，本次先把项目整理为阶段化工程，而不是直接接入真实 AI 分类、抠图 API 或 Sharp 白底合成。

## 2. 本次范围

本次做：

1. 在当前项目内新增/整理文档目录。
2. 将参考项目中的 PRD、阶段路线、开发手册内容转化为当前项目可执行说明。
3. 抽出任务分组、发送能力判断、mock 任务等纯逻辑，避免页面和云函数各自散落规则。
4. 为后续 AI 分类、抠图、提示词和工作流预留目录。
5. 更新 README，让项目使用者知道当前阶段、如何运行、如何验收、下一阶段做什么。
6. 增加轻量测试或检查，覆盖关键纯规则。

本次不做：

- 不接入真实多模态分类模型。
- 不接入真实抠图 API。
- 不实现 Sharp/Pillow 白底合成。
- 不做复杂画布编辑器。
- 不增加账号、历史记录、付费、表情包、心情状态图、日常合集主入口。
- 不承诺微信多图一键直发聊天。

## 3. 推荐目录结构

目标结构：

```text
WePicTool/
  README.md
  docs/
    product/
      PRD.md
      stage-roadmap.md
      development-playbook.md
      technical-architecture.md
    ai-workflows/
      README.md
      classification-prompt.md
      matting-api-evaluation.md
      workflow-backlog.md
    superpowers/
      specs/
        2026-07-07-wepictool-stage-structure-design.md
  miniprogram/
    config/
      env.js
    utils/
      task.js
    cloudfunctions/
      processOutfit/
        index.js
        package.json
    pages/
      index/
      result/
  tests/
    task.test.js
  scripts/
    check-miniprogram.mjs
```

说明：

- `docs/product/` 放面向产品与开发的阶段化说明。
- `docs/ai-workflows/` 放后续 AI 分类、抠图、提示词、工作流实验记录。
- `miniprogram/utils/task.js` 放可被前端、测试、云函数参考的任务规则。
- `tests/task.test.js` 覆盖阶段一必须稳定的纯规则。

## 4. 文档设计

### 4.1 PRD

从参考 PRD 中迁移核心内容，但调整状态口径：

- 产品定位仍是“微信里最快的穿搭参考图生成工具”。
- 当前状态改为“阶段一工程骨架已完成，待云开发与真机验收；阶段二待接入图片部件识别”。
- 明确 MVP 主线仍只处理上衣、下装、鞋子。
- 保留不做项和开发红线。

### 4.2 阶段路线

新增阶段路线文档，按当前项目状态标注：

- 阶段零：抠图 API、分类方案、CloudBase 环境选型与验证。
- 阶段一：选图、压缩、上传、mock 分组、结果页、保存。当前为“工程骨架完成，待真机验收”。
- 阶段二：接入图片部件识别。
- 阶段三：接入抠图与白底卡片生成。
- 阶段四：完善微信叠图预览与保存引导。
- 阶段五：轻编辑、失败兜底、埋点。

### 4.3 开发手册

开发手册应改成“每次给 AI 或开发者开工时怎么描述任务”的工作手册：

- 固定包含背景、本次阶段、技术栈、约束、验收标准。
- 明确一次只推进一个阶段。
- 明确阶段一可本地 mock，但正式验收必须走 CloudBase 与真机保存。

### 4.4 技术架构

技术架构文档保留流程图思想，但落到当前项目结构：

- 前端：选图、压缩、上传、结果页、保存授权、发送提示。
- 云函数：阶段一 mock 任务；阶段二分类；阶段三抠图与合成。
- 数据契约：`task`、`groups`、`results`、`sendability`。
- 状态：`queued`、`uploading`、`classifying`、`waitingUserChoice`、`processing`、`rendering`、`done`、`partialFailed`、`failed`。

## 5. 代码设计

### 5.1 任务规则工具

新增 `miniprogram/utils/task.js`，至少包含：

- `PROCESSABLE_GROUPS`
- `GROUP_META`
- `calculateTargetSize(width, height, maxLongSide)`
- `createEmptyGroups()`
- `createMockTask(images, now)`
- `buildSendability(groups, threshold)`
- `isCloudPermissionError(error)`

这些规则不依赖微信运行时，方便 Node 测试。

### 5.2 云函数整理

`processOutfit` 仍保持阶段一 mock 能力，但返回结构应更接近最终任务契约：

```js
{
  taskId,
  mode: 'outfit',
  status: 'done',
  progress: 100,
  groups,
  results,
  sendability,
  createdAt,
  expiredAt,
  error: null
}
```

云函数中保留阶段二、阶段三扩展点，但用清晰函数边界表达：

- 创建 mock 任务。
- 后续分类。
- 后续抠图。
- 后续白底合成。

### 5.3 结果页数据兼容

结果页应兼容两种数据形态：

- 当前项目已有的 `groups.tops = ['path']`。
- 后续推荐的 `groups.tops = [{ resultId, url, label, status }]`。

本次可以只做低风险兼容，不强行大改 UI。

### 5.4 检查和测试

新增或更新：

- `npm test`：运行纯规则测试。
- `npm run check:miniprogram`：保留当前结构检查。
- 可增加 `npm run check:syntax`：检查关键 JS 文件语法。

测试覆盖：

- 图片最长边压缩尺寸计算。
- mock 任务按 1-3、4-6、7-9 分组。
- 每组少于 3 张的 sendability 提示。
- 总图数不少但各组都不足 3 张时的降级提示。
- CloudBase 权限错误识别。

## 6. AI 工作流预留

新增 `docs/ai-workflows/`，先放文档，不接服务：

- `classification-prompt.md`：分类标签、返回 JSON 格式、置信度规则、测试集要求。
- `matting-api-evaluation.md`：抠图 API 候选、测试素材、选型维度、验收标准。
- `workflow-backlog.md`：后续 AI 工作流计划，例如分类、抠图、白底合成、质量检测、单张重做提示词。

分类标签固定为：

```text
tops
bottoms
shoes
other_product
daily
unsupported
uncertain
```

阶段二分类规则：

- `confidence >= 0.8` 自动分组。
- `confidence < 0.8` 进入用户确认。
- 完整人物试穿图默认 `daily`。
- 头像、包、帽子、腰带、项链、眼镜等非 MVP 素材默认 `unsupported` 或 `uncertain`。

## 7. 验收标准

本次改造完成后应满足：

1. README 能说明当前项目阶段、运行方式、云开发接入、验收流程。
2. `docs/product/` 能承接参考项目中的 PRD、阶段路线、开发手册和技术架构内容。
3. `docs/ai-workflows/` 能作为后续提示词和 AI 工作流沉淀入口。
4. 任务规则有独立工具文件和测试。
5. `npm test` 通过。
6. `npm run check:miniprogram` 通过或只输出合理上线前提醒。
7. 不破坏当前本地预览和阶段一小程序流程。

## 8. 风险与处理

- 当前项目不是 git 仓库，无法按常规流程提交设计规格。处理方式：只落文档和代码，最终汇总变更。
- 微信小程序真机能力无法仅靠 Node 测试验证。处理方式：文档明确真机验收项。
- 结果页当前模板重复较多。处理方式：本次只做必要兼容和规则抽取，避免 UI 大改。
- 后续 AI 模型和抠图服务未选型。处理方式：只预留文档和接口边界，不提前绑定供应商。

## 9. 推荐实施顺序

1. 新增产品与 AI 工作流文档目录。
2. 迁移并精简参考文档内容。
3. 新增任务规则工具和测试。
4. 调整云函数返回结构和扩展点说明。
5. 小幅兼容结果页数据结构。
6. 更新 README 和检查脚本。
7. 运行测试与预检。
