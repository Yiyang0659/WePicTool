# 提示词工程化：抽取可复用 Block 与工作流封装

**日期：** 2026-07-13
**状态：** 待实施（方案已确认，等排期执行）

---

## 问题

能不能将固定的规则抽成可复用 block，将整个提示词的逻辑封装成一个工作流？

## 答案：能

---

## 为什么能

当前提示词是一整块硬编码字符串，揉在一起但实际由 4 个独立部分组成：

| 部分 | 内容 | 可复用 |
|------|------|--------|
| 角色定义 | "你是一名穿搭商品分类助手" | ✅ 可固定 |
| 标签定义 | 7 种标签 + 含义 + 是否 MVP | ✅ 可复用到前端显示、文档、测试 |
| 判断规则 | 6 条规则 | ✅ 可固定 |
| 输出格式 + 示例 | JSON 格式 + 5 个 few-shot | ✅ 可独立维护 |

拆开后每块都能单独维护和复用，拼在一起就是完整提示词，AI 效果不变。

---

## 具体改什么

### 改动 1：抽取标签定义为共享常量

**现状：** 标签定义在 3 个地方重复存在：
- `processOutfit/index.js` 的 `CLASSIFICATION_PROMPT` 里
- `docs/ai-workflows/classification-prompt.md` 里
- `miniprogram/utils/task.js` 的 `GROUP_META` 里（只有 4 个）

**改法：** 在 `miniprogram/utils/task.js` 新增 `CLASSIFICATION_LABELS` 常量，包含全部 7 种标签的元数据：

```js
const CLASSIFICATION_LABELS = {
  tops:           { label: '上衣', description: '上衣、T恤、衬衫、外套、卫衣等穿在上半身的衣物', mvp: true,  group: 'tops' },
  bottoms:        { label: '下装', description: '裤子、牛仔裤、休闲裤、裙子、半身裙、短裤等', mvp: true,  group: 'bottoms' },
  shoes:          { label: '鞋子', description: '鞋、运动鞋、皮鞋、靴子、凉鞋、高跟鞋等', mvp: true,  group: 'shoes' },
  other_product:  { label: '其他商品', description: '其他商品或小物件（手表、手机、化妆品等）', mvp: false, group: 'others' },
  daily:          { label: '日常/试穿图', description: '完整人物试穿图、真人上身照、生活场景照', mvp: false, group: 'others' },
  unsupported:    { label: '非支持配饰', description: '头像、包、帽子、腰带、项链、眼镜等', mvp: false, group: 'others' },
  uncertain:      { label: '不确定', description: '图片模糊、主体无法辨认、无法归入以上类别', mvp: false, group: 'others' }
};
```

**复用点：**
- 云函数拼接提示词时从这里读标签定义
- 前端显示「待确认」角标时从这里读标签含义
- 测试脚本从这里读期望标签列表

### 改动 2：提示词组装函数

把提示词从一个大字符串改成由函数组装：

```js
function buildClassificationPrompt() {
  const labelBlock = Object.entries(CLASSIFICATION_LABELS)
    .map(([key, v]) => `- ${key}：${v.description}`)
    .join('\n');

  return [
    ROLE_PROMPT,           // "你是一名穿搭商品分类助手..."
    LABEL_SECTION,         // "可选标签：\n" + labelBlock
    RULES_SECTION,         // "判断规则：\n1. ... 6. ..."
    OUTPUT_FORMAT,         // "输出格式必须是纯 JSON..."
    EXAMPLES_SECTION       // few-shot 示例
  ].join('\n\n');
}
```

### 改动 3：提示词拆分为独立文件

把提示词各部分存到独立的 `.js` 模块里：

```text
miniprogram/
├── prompts/
│   ├── classification.js    # 分类提示词的 4 个 block
│   └── matting.js           # 抠图提示词
```

云函数里改为 require 引用：

```js
const { buildClassificationPrompt } = require('../../prompts/classification');
const { MATTING_PROMPT } = require('../../prompts/matting');
```

---

## 需要改的文件清单

| 文件 | 改动 |
|------|------|
| `miniprogram/utils/task.js` | 新增 `CLASSIFICATION_LABELS` 常量 |
| `miniprogram/prompts/classification.js` | 新建，抽取提示词 4 个 block + 组装函数 |
| `miniprogram/prompts/matting.js` | 新建，抠图提示词 |
| `miniprogram/cloudfunctions/processOutfit/index.js` | 删掉硬编码提示词，改为 require 引用 |

**不会改的：**
- 前端页面（调用方式不变）
- 云函数的处理逻辑（只是提示词来源变了）
- 提示词的实际内容（拆分前后文本一致，AI 效果不变）

---

## 改后的好处

| 场景 | 现在 | 改后 |
|------|------|------|
| 换一个分类模型 | 改整个大字符串，容易出错 | 只改 `ROLE_PROMPT` 或 `OUTPUT_FORMAT` |
| 加一种标签 | 改大字符串 + 改 task.js + 改文档 | 只改 `CLASSIFICATION_LABELS`，提示词自动更新 |
| A/B 测试不同提示词 | 不可能 | 写两个 prompt 文件，切换引用 |
| 前端显示标签中文名 | 硬编码 | 从 `CLASSIFICATION_LABELS` 读 |
| 提示词版本管理 | 整个字符串无法 diff | 每个 block 独立变更，diff 清晰 |

---

## 注意事项

1. CloudBase 云函数支持 CommonJS `require`，不需要额外配置。
2. 云函数上传时需要包含 `prompts/` 目录和 `utils/task.js`，确认 `project.config.json` 的 `ignoreUploadUnusedFiles` 不会排除它们。
3. 拆分前后提示词文本必须完全一致，建议拆完后用测试脚本对比验证输出不变。
