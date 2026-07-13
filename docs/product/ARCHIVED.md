# WePicTool 归档文档

**用途：** 存放历史决策、已过时内容、未采纳方案，供参考但不作为当前开发依据

---

## 1. 历史决策记录

### 1.1 为什么放弃后端 Sharp 合成

**日期：** 2026-07-12
**决策：** 放弃 CloudBase 云函数中使用 `sharp` 进行后端白底卡片合成，改为前端 Canvas 方案。

**原因：**
- 尝试引入 `sharp` 做后端白底卡片合成时，CloudBase 云函数返回错误码 145。
- 错误码 145 表示不支持原生 C++ 模块。
- 已确认 CloudBase 不支持 `sharp`、`canvas` 等原生模块。

**替代方案：** 白底卡片合成改为前端 Canvas 实现。

---

### 1.2 为什么用单云函数而非 RESTful API

**日期：** 2026-07-08
**决策：** 采用单云函数 `processOutfit` 架构，而非独立 RESTful 服务。

**原因：**
- CloudBase 云函数天然支持小程序直接调用，无需额外部署服务器。
- 减少运维复杂度，适合 MVP 快速验证。
- 当前处理量可控，单云函数 60s 超时足够覆盖 9 张图处理。

**未来可能：** 如果处理量增大或需要更复杂的任务调度，可迁移到独立 Node.js 服务。

---

### 1.3 为什么分类标签映射到 4 个分组

**日期：** 2026-07-09
**决策：** AI 返回 7 种标签，但前端只展示 4 个分组桶。

**映射规则：**

| AI 原始标签 | 前端分组 | 原因 |
|------------|---------|------|
| tops | tops | MVP 核心链路 |
| bottoms | bottoms | MVP 核心链路 |
| shoes | shoes | MVP 核心链路 |
| other_product | others | 非 MVP 素材，收纳不处理 |
| daily | others | 试穿全身图，不抠整个人 |
| unsupported | others | 非 MVP 素材，收纳不处理 |
| uncertain | others | 低置信度，待用户确认 |

**保留原始标签：** 每个结果项的 `classification.type` 保留 AI 原始 7 种标签，前端可显示「待确认」角标。

---

### 1.4 为什么不做云端历史记录

**日期：** 2026-06-28
**决策：** 设备本地轻量记录（`pages/record`）仅用于快捷查看和再次生成，不上云、不关联账号、不同步。

**原因：**
- MVP 阶段不过早引入账号体系和云端同步。
- 降低隐私合规风险。
- 减少后端复杂度，聚焦核心链路验证。

---

## 2. 已过时内容

### 2.1 阶段二进入前的建议（已过时）

以下建议在 2026-07-09 会话中已完成：

1. ~~准备 50 张真实测试素材。~~
2. ~~先验证 AI 分类效果，不急着接抠图。~~
3. ~~用分类提示词跑分类测试。~~
4. ~~如果分类稳定，再开始接结果页"改分类"。~~
5. ~~然后再进入抠图 API 选型和白底图生成。~~

### 2.2 阶段二完成前的下一步建议（已过时）

以下口径在 2026-07-09 会话中已完成：

```text
继续 WePicTool 下一阶段迭代：先做 AI 分类方案验证和结果页改分类，不急着做复杂 UI。
```

---

## 3. 归档的 RESTful 接口设计

> 以下接口设计在早期方案中提出，但实际实现中已合并为单云函数 `processOutfit`。此处归档供参考。

### 3.1 创建任务

```text
POST /tasks
```

请求：

```json
{
  "mode": "outfit",
  "images": [
    {
      "fileId": "cloud://xxx",
      "width": 1600,
      "height": 1200,
      "size": 456789,
      "format": "jpg"
    }
  ],
  "output": {
    "ratio": "1:1 | 4:5 | 3:4",
    "background": "white",
    "visibilityEnhancement": true
  },
  "client": {
    "platform": "ios",
    "wechatVersion": "x.x.x"
  }
}
```

返回：

```json
{
  "taskId": "task_xxx",
  "status": "queued"
}
```

### 3.2 查询任务

```text
GET /tasks/{taskId}
```

返回：

```json
{
  "taskId": "task_xxx",
  "status": "done",
  "progress": 100,
  "groups": {
    "tops": ["result_1", "result_2", "result_3"],
    "bottoms": ["result_4", "result_5"],
    "shoes": ["result_6"],
    "others": []
  },
  "results": [
    {
      "resultId": "result_2",
      "sourceImageId": "image_2",
      "category": "tops",
      "type": "outfitCard",
      "url": "https://xxx",
      "width": 1200,
      "height": 1500,
      "quality": "ok"
    }
  ]
}
```

### 3.3 修改分类

```text
POST /tasks/{taskId}/images/{imageId}/category
```

请求：

```json
{
  "category": "tops"
}
```

### 3.4 重新渲染

```text
POST /tasks/{taskId}/render
```

请求：

```json
{
  "ratio": "1:1 | 4:5 | 3:4",
  "background": "white",
  "visibilityEnhancement": true,
  "showLabels": true,
  "labelStyle": "number",
  "imageOrder": ["image_1", "image_3", "image_2"]
}
```

### 3.5 单张重做

```text
POST /tasks/{taskId}/images/{imageId}/retry
```

适用场景：
- 抠图失败
- 分类错误
- 主体大小不满意
- 用户切换输出比例或底色

---

## 4. 迭代日志

### 2026-07-12：阶段三抠图接入 + UI 改版

**阶段三抠图接入：**
- 云函数接入 DashScope `qwen-image-2.0` 做抠图，提示词要求去除背景替换为纯白。
- 抠图结果上传到云存储 `matted/` 目录，前端可切换查看原图/白底图。
- 抠图失败的图片保留原图，不影响整批结果。
- 尝试引入 `sharp` 做后端白底卡片合成，但 CloudBase 不支持原生 C++ 模块（错误码 145），已移除。
- 白底卡片合成改为前端 Canvas 方案（待实现）。

**UI 改版：**
- 结果页 `pages/result` 恢复为白色微信聊天风格，底部新增「微信发送预览」按钮。
- 新增 `pages/preview`：深色全屏微信聊天预览页，堆叠卡片 + 展开/收起 + 滑动切换。
- 底部模拟微信输入栏，真实操作栏提供「返回结果页」按钮。

### 2026-07-09：阶段二 AI 分类接入

- AI 分类已接入：云函数调用 DashScope `qwen-vl-plus`，环境变量 `DASHSCOPE_API_KEY` 已配置。
- 低置信度图片（`confidence < 0.8`）在结果页显示「待确认」角标。
- 结果页「改分类」能力已实现，用户可通过 ActionSheet 手动移动图片分组。
- 分类提示词已优化，增加 few-shot 示例，减少商品图误判为 `daily`。
- 图片从云存储下载后转 base64 传给 DashScope，解决 `url error` 400 问题。
- 新增本地测试脚本 `scripts/test-dashscope.cjs`。

### 2026-07-08：阶段一闭环 + 环境配置

- 小程序 AppID 已配置：`wxf16280c0ba5c507d`。
- CloudBase 环境 ID 已配置：`cloud1-d0g1blfsde474b168`。
- 测试环境已可用。
- 当前功能可以上传图片。
- 当前功能可以批量保存/下载结果图。
- 当前版本仍是阶段一能力：使用 mock 分组，没有真实 AI 分类、抠图和白底生成。
- 已关闭 `wx.cloud.init` 的 `traceUser`，当前项目不做登录和用户追踪。
- `private_getBackgroundFetchData:fail` 判断为微信开发者工具/后台拉取相关提示，不是当前业务代码主动调用造成。

---

## 5. 产品名称候选

| 候选名称 | 说明 |
|---------|------|
| WePicTool | 当前暂定名 |
| 轻图发发 | 偏轻量感 |
| 穿搭发发 | 直接点明场景 |
| 搭配发发 | 更口语化 |

> 建议：用户看到入口后，要立刻知道这是为了"让朋友帮我选搭配"。

---

## 6. 首版需确定的关键问题（历史）

| 问题 | 当前状态 |
| --- | --- |
| 主入口叫什么？ | 待定："做穿搭参考图" / "帮我做搭配图" / "发给朋友选一选" |
| 输出比例怎么定？ | 已确定：MVP 提供 1:1 / 4:5 / 3:4，用户预览后选择，后续由真机测试决定默认推荐 |
| 是否做日常合集？ | 已确定：不进入 MVP 主线 |
| 是否做表情包 / 心情状态？ | 已确定：不进入 MVP |
| 衡量产品是否成立的指标 | 已确定：完成率、按组保存率、分享意愿率、复用率、出图耗时 |
