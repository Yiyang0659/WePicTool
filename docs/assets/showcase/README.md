# README 展示素材

## 来源与证据边界

- `outfit-workbench.jpg`：用户提供的穿搭工作台实测截图，原始文件直接复制，未重绘。
- `text-editor.jpg`：用户提供的趣味字画编辑实测截图，原始文件直接复制，未重绘。
- `overview.png`：2026-09-15 使用内置 image_gen 工具，以以上两张图片为合成参考生成的项目介绍图。已人工目检主要标题、双玩法布局和文案；生成图包含展示排版，不用于证明像素级界面或新一轮真机验收。

截图来自本项目开发测试交流，生成图不新增产品能力或发布承诺。原截图中的设备状态栏是测试时状态，不是产品界面的一部分。素材公开展示不代表授予其他用途的独立许可。

## 生成提示词

工具模式：内置 image_gen；类型：compositing；输入：穿搭工作台、趣味字画编辑两张实测截图。

```text
Use case: compositing. Asset type: GitHub README project showcase, landscape 3:2.
Create a polished restrained product presentation for WePicTool, a WeChat mini-program with outfit image grouping and playful typography cards, BASED ON the two supplied real user testing screenshots.
Input image 1 is the actual outfit workbench screenshot, supporting compositing input. Image 2 is the actual typography editor screenshot, supporting compositing input.
Layout: warm off-white very pale lavender backdrop; two large upright flat screen panels side by side, rounded corners, gentle shadows, generous margin. Keep the screenshots' core UI faithful, not redesigning it. Strip phone status bars and dynamic-island overlays from the displayed panels only. Preserve purple outfit workbench groups, avatars and controls in left panel. Preserve pink typography card with exact phrase “我本来想说”, card order thumbnails and controls in right panel. No invented features, no fake user reviews or metrics, no QR code, no device branding.
Top headline exact text “WePicTool”, smaller subtitle “把图片和文字，整理成一叠表达”. Above panels small labels “穿搭叠图” and “趣味字画”. Footer small exact text “基于实测截图制作的展示图”.
Screens must dominate visual with crisp readable Chinese primary text; realistic faithful screen presentation rather than fancy futuristic mockup. Keep natural proportions. This is a marketing composition, not evidence of new testing.
```
