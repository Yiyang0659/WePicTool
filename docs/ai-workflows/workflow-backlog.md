# AI 工作流 Backlog

当前只维护工作流计划，不接入真实 AI 服务。

## 优先级

| 顺序 | 工作流 | 阶段 | 目标 |
| --- | --- | --- | --- |
| 1 | 图片部件识别 | 阶段二 | ✅ 已完成：DashScope `qwen-vl-plus` 真实分类，结果页支持改分类 |
| 2 | 抠图 API 调用 | 阶段三 | ✅ 已完成：DashScope `qwen-image-2.0` 抠图，结果存储在云存储 `matted/` 目录 |
| 3 | 白底卡片合成 | 阶段三 | 🔧 待实现：前端 Canvas 合成白底卡片（CloudBase 不支持 sharp） |
| 4 | 质量检测 | 阶段三/五 | 判断主体过小、边缘异常、浅色不可见 |
| 5 | 单张重做 | 阶段五 | 对失败或不满意图片重新分类、抠图、合成 |
| 6 | 埋点分析 | 阶段五 | 追踪 task_created、group_saved、share_guide_clicked 等事件 |

## 工作流接入原则

1. 每个工作流都必须有输入、输出、失败状态和验收标准。
2. 每个工作流都必须允许单张失败，不阻断整批任务。
3. 每个工作流接入前先在文档中记录测试素材和测试结果。
4. 不把模型输出直接当最终真相；分类结果必须可被用户修改。
5. 不用真实 AI 工作流替代阶段一 mock 流程，mock 流程保留用于本地开发和页面调试。

## 建议埋点

```text
task_created
classification_completed
category_changed
task_completed
group_saved
result_saved
share_guide_clicked
retry_triggered
```
