# WePicTool 技术架构

## 总体结构

```text
微信小程序前端
  -> 选图、压缩、上传、任务创建、结果展示、保存授权、发送引导

CloudBase 云函数
  -> 阶段一 mock 分组
  -> 阶段二图片部件识别（DashScope qwen-vl-plus）
  -> 阶段三抠图与白底卡片生成

AI / 图像服务
  -> 多模态分类、抠图 API、主体检测、质量检测

云存储
  -> 原图临时文件、结果图临时文件、后续任务记录
```

## 当前目录职责

| 目录 | 职责 |
| --- | --- |
| `miniprogram/pages/index/` | 首页 Tab：选图、压缩、上传、创建任务 |
| `miniprogram/pages/record/` | 记录 Tab：本地历史任务列表、查看、再次生成 |
| `miniprogram/pages/profile/` | 我的 Tab：相册权限、反馈、分享、缓存清理 |
| `miniprogram/pages/result/` | 结果页（非 Tab）：微信聊天预览风格，分组展示、保存、改分类、发送引导 |
| `miniprogram/app.json` | 全局页面路由与底部 Tab（首页 / 记录 / 我的）配置 |
| `miniprogram/config/env.js` | CloudBase 环境 ID 和本地预览开关 |
| `miniprogram/utils/task.js` | 阶段一任务规则、mock 分组、发送能力判断 |
| `miniprogram/cloudfunctions/processOutfit/` | 云函数：阶段一 mock 处理 + 阶段二 DashScope AI 分类，后续承接抠图 |
| `docs/product/` | 产品定义、阶段路线、开发手册、技术架构 |
| `docs/ai-workflows/` | 后续 AI 提示词、服务评估、工作流积累 |

## 任务契约

阶段一到阶段三都围绕同一个任务结构演进：

```js
{
  taskId: 'task_xxx',
  mode: 'outfit',
  status: 'done',
  progress: 100,
  groups: {
    tops: [],
    bottoms: [],
    shoes: [],
    others: []
  },
  results: [],
  sendability: {},
  createdAt: 0,
  expiredAt: 0,
  error: null
}
```

## 结果项结构

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

## 分组与发送能力

可处理主链路分组固定为：

```text
tops
bottoms
shoes
```

未处理素材统一进入：

```text
others
```

每组发送能力规则：

| 数量 | mode | 文案 |
| --- | --- | --- |
| 0 | `empty` | 暂无素材 |
| 1-2 | `normal` | 可保存，但可能按普通图片展示 |
| >= 3 | `stackable` | 可形成微信叠图效果 |

如果总素材数不少于 3，但所有有内容的主链路分组都少于 3 张，结果页必须提示：

```text
当前更适合普通发送；想要叠图效果，建议每组补到 3 张以上
```

## 状态规划

阶段一当前直接返回 `done`。后续阶段使用以下状态：

```text
queued
uploading
classifying
waitingUserChoice
processing
rendering
done
partialFailed
failed
```

`partialFailed` 表示部分图片失败，成功图片仍可预览和保存。
