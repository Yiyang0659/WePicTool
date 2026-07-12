# 抠图提示词

**阶段：** 阶段三  
**用途：** 对穿搭主链路图片（上衣、下装、鞋子）进行抠图，去除背景，生成白底图。  
**当前状态：** 已接入 DashScope `qwen-image-2.0`，通过多模态端点调用。  
**⚠️ 注意：本文档仅供参考。实际运行时调用的提示词在 `miniprogram/cloudfunctions/processOutfit/index.js` 的 `MATTING_PROMPT` 变量中。修改提示词请改代码，本文档同步更新即可。**

## 当前提示词

```text
对这张图片进行抠图，去除原背景，将背景替换为纯白色，保留主体的完整轮廓，确保边缘干净
```

## 调用方式

- 端点：`https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- 模型：`qwen-image-2.0`
- 输入格式：多模态（图片 base64 + 提示词）
- 输出格式：返回抠图后的 PNG 图片 URL

```json
{
  "model": "qwen-image-2.0",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          { "image": "data:image/jpeg;base64,xxx" },
          { "text": "对这张图片进行抠图，去除原背景，将背景替换为纯白色，保留主体的完整轮廓，确保边缘干净" }
        ]
      }
    ]
  }
}
```

## 处理规则

- 只对 `tops`、`bottoms`、`shoes` 分类成功的图片做抠图。
- `others`（other_product / daily / unsupported / uncertain）不进入抠图链路。
- 抠图失败的图片保留原图，不影响整批结果。
- 抠图结果上传到云存储 `matted/` 目录。
- 结果项中保留 `originalUrl`，方便用户查看原图。

## 验收标准

| 维度 | 要求 |
|------|------|
| 边缘干净程度 | 毛边、蕾丝、鞋带不能大面积残缺 |
| 浅色衣物可见性 | 白色衣服在白底上仍可辨认（需轻阴影或描边兜底） |
| 单张耗时 | 平均 <= 5 秒 |
| 失败率 | 失败必须明确返回，保留原图冒充成功 |
| 单张失败 | 不阻断整批结果展示 |

## 测试素材

| 素材 | 数量 | 重点 |
|------|------|------|
| 上衣 | 5 | 白色、黑色、条纹、蕾丝/毛边、宽松版型 |
| 下装 | 5 | 牛仔裤、黑裤、半裙、短裤、浅色裙 |
| 鞋子 | 5 | 运动鞋、高跟鞋、靴子、浅色鞋、复杂鞋带 |
