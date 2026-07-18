# WePicTool 项目状态

**更新日期：** 2026-07-18

---

## 1. 当前阶段

**阶段三：白底卡片生成** — 进行中

> 产品定位已于 2026-07-18 升级为"微信叠图玩法生成器"，玩法实现口径见 `PLAYBOOK.md`。

- 阶段一工程骨架：已完成
- 阶段二 AI 分类：已完成
- 阶段三抠图：已接入（DashScope qwen-image-2.0）
- 阶段三白底卡片合成：前端已实现（Canvas），待真机验收

---

## 2. 阶段进度

| 阶段 | 状态 | 关键交付物 | 验收重点 |
| --- | --- | --- | --- |
| 阶段零：开发前准备 | 已完成 | CloudBase 环境、DashScope API 密钥 | 云函数可调用、真机可保存相册 |
| 阶段一：最小闭环 | 已完成 | 选图/压缩/上传/mock 分组/结果页/保存 | 选 1-9 张图可进入结果页，单张保存和按组保存可用 |
| 阶段二：图片部件识别 | 已完成 | DashScope qwen-vl-plus 分类，用户可手动修改分类 | 高置信度自动分组，低置信度可人工确认 |
| 阶段三：白底卡片生成 | 进行中 | DashScope qwen-image-2.0 抠图已接入，前端 Canvas 白底合成已实现（待真机验收） | 白底结果可保存，浅色衣物可辨认，单张失败不阻断 |
| 阶段四：结果页增强 | 未开始 | 微信叠图效果预览、单组滑动、保存引导增强 | 每组不足 3 张时清晰降级提示 |
| 阶段五：轻编辑与兜底 | 未开始 | 改分类（已完成）、删除、重做、排序、切比例、埋点 | 用户不用重新开始即可修正错误 |

---

## 3. 当前阻塞

| 阻塞项 | 原因 | 解决方向 |
|--------|------|---------|
| 阶段三真机验收 | 前端 Canvas 白底合成已实现，尚未真机验证 | 按 DEVELOPMENT_GUIDE 阶段三验收标准真机过一遍（iOS + Android） |

---

## 4. 已完成功能

### 阶段一（最小闭环）

- [x] 未配置 CloudBase 时，本地预览模式能进入结果页
- [x] 配置 CloudBase 后，图片能上传到云存储
- [x] `processOutfit` 云函数能返回 mock 分组
- [x] 结果页能展示上衣组、下装组、鞋子组和未处理素材区
- [x] 每组少于 3 张时展示降级提醒
- [x] 保存单张图片成功（需真机验证）
- [x] 保存当前组成功（需真机验证）
- [x] 拒绝相册授权后能引导到设置页（需真机验证）

### 阶段二（AI 分类）

- [x] 云函数接入 DashScope `qwen-vl-plus` 多模态模型进行真实分类
- [x] `confidence >= 0.8` 自动分组，`confidence < 0.8` 前端显示「待确认」角标
- [x] 结果页支持「改分类」，用户可手动将图片移至其他分组
- [x] 低置信度图片点击「改分类」时提示 AI 置信度较低
- [x] 分类提示词已优化，增加 few-shot 示例，减少商品图误判为 `daily`
- [x] 图片从云存储下载后转 base64 传给 DashScope，解决 `url error` 400 问题

### 阶段三（抠图 + UI 改版）

- [x] 云函数接入 DashScope `qwen-image-2.0` 做抠图，去除背景替换为纯白
- [x] 抠图结果上传到云存储 `matted/` 目录，前端可切换查看原图/白底图
- [x] 抠图失败的图片保留原图，不影响整批结果
- [x] 确认 CloudBase 不支持 `sharp` 等原生模块（错误码 145），白底卡片合成改为前端 Canvas 方案
- [x] UI 改版：底部三 Tab（首页 / 记录 / 我的）
- [x] 结果页 `pages/result` 恢复为白色微信聊天风格
- [x] 新增 `pages/preview`：深色全屏微信聊天预览页，堆叠卡片 + 展开/收起 + 滑动切换
- [x] 本地轻量记录（`pages/record`）支持查看历史、再次生成

---

## 5. 待完成功能

### 阶段三剩余

- [x] 前端 Canvas 实现白底卡片合成（比例统一、主体居中、浅色衣物兜底）— 已实现，待真机验收
- [ ] 白底卡片保存到相册验证（真机）
- [x] 支持 1:1 / 4:5 / 3:4 比例切换 — 已实现，待真机验收

### 阶段四（结果页增强）

- [ ] 编号标注（给同组图片加轻量角标，方便朋友反馈"上衣 1 + 下装 2"）
- [ ] 保存引导增强

### 阶段五（轻编辑与兜底）

- [ ] 删除单张
- [ ] 单张重做
- [ ] 组内排序
- [ ] 切换比例（1:1 / 4:5 / 3:4）
- [ ] 切换底色与可见性
- [ ] 埋点（task_created、classification_completed、category_changed、task_completed、group_saved、result_saved、share_guide_clicked、retry_triggered）

---

## 6. 历史更新

| 日期 | 更新内容 |
|------|---------|
| 2026-07-08 | 阶段一闭环完成：AppID、CloudBase 环境配置，基础上传/保存链路跑通 |
| 2026-07-09 | 阶段二 AI 分类接入：DashScope qwen-vl-plus，支持改分类，本地测试脚本 `scripts/test-dashscope.cjs` |
| 2026-07-12 | 阶段三抠图接入 + UI 改版：qwen-image-2.0 抠图，白色结果页 + 深色预览页，确认 CloudBase 不支持 sharp |

---

## 7. 最新更新日志

> 本区块记录每次迭代的上下文，供新窗口快速了解上次做了什么。

### 2026-07-18（定位升级）

- **做了什么：** 产品定位升级为"微信叠图玩法生成器"——穿搭白底卡是旗舰功能，玩法模板库是长期资产。新增 `docs/product/PLAYBOOK.md`（平台事实、统一 6 段叠图管线、9 个模块实现卡、阶段六~九上线节奏）；PRD 定位章节最小改写并替换红线；TECHNICAL_SPEC 新增第 12 节叠图玩法管线技术规格；README 文档入口更新；删除 `docs/WePicTool_功能模块规划.md`（内容已全部并入 PLAYBOOK，避免双份真相源）。
- **改了哪些文件：** docs/product/PLAYBOOK.md（新增）、docs/product/PRD.md、docs/product/TECHNICAL_SPEC.md、docs/product/PROJECT_STATUS.md、README.md、docs/WePicTool_功能模块规划.md（删除）。
- **关键决策：** 翻页动画采纳"素材库先行 + 云托管 ffmpeg 自定义抽帧"双路线（云托管为容器制可跑 ffmpeg，绕开 CloudBase 云函数原生模块限制；路线②上线前需做抽帧验证）；回流引导卡进入统一底座（末卡"用 WePicTool 做同款"，可开关，埋点单独统计）；≥3 张硬约束（不足自动补封面卡/引导卡）；资料打包"按时间分组"降级（`wx.chooseMedia` 拿不到可靠拍摄时间，v1 只做手动分组，时间分组标记待验证）；保存文件名编号（01、02……）+ 发送引导教用户按编号勾选，是控制叠图顺序的唯一手段。
- **下一步：** 阶段三真机验收（iOS + Android），通过后按 `PLAYBOOK.md` 进入阶段六（大字滑卡 + 剧情滑卡）。

### 2026-07-18

- **做了什么：** 完成阶段三前端 Canvas 白底卡片合成开发。结果页接入 cardComposer（串行合成队列 + 取消机制），支持 1:1 / 4:5 / 3:4 比例切换并整批重合成，白底卡片接入单张/按组保存链路，抠图失败图显示「重做」按钮（单图重调 processOutfit），浅色衣物轻阴影+细描边兜底生效；修复 WXML 函数调用绑定不渲染的关键 bug，preview 页优先展示合成卡片。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/utils/cardComposer.js（新增）、pages/result/result.js/.wxml/.wxss、pages/preview/preview.js、docs/product/PROJECT_STATUS.md。
- **关键决策：** 合成采用串行队列避免共享 canvas 污染和内存风险；重做抠图复用 processOutfit 不新增云函数接口；细描边沿包围盒绘制，真机观感不佳时再去掉。
- **下一步：** 真机验收阶段三（保存相册、比例切换耗时、浅色衣物可辨认度、iOS+Android 内存），通过后进入阶段四。

### 2026-07-13

- **做了什么：** 全面同步文档状态（旧 7 份文档替换为新 5 份文档体系），建立文档同步规范和保护规则，删除 superpowers 一次性文档，新增迭代上下文记录机制（PROJECT_STATUS 最新更新日志 + Claude Memory），新增提示词工程化方案文档。
- **改了哪些文件：** docs/product/ 全部替换，README.md、CLAUDE.md 更新引用，docs/superpowers/ 删除，docs/ai-workflows/prompt-engineering-plan.md 新建。
- **关键决策：** 文档同步采用最小改动原则，禁止重写分析性内容，实质性矛盾需用户确认。提示词工程化方案确认可行，待实施。
- **下一步：** 继续阶段三前端 Canvas 白底卡片合成。口径见 DEVELOPMENT_GUIDE.md。

---

## 8. 下次迭代入口

阶段三真机验收（iOS + Android，口径见 `DEVELOPMENT_GUIDE.md` 阶段三验收标准）→ 通过后按 `PLAYBOOK.md` 阶段六执行（大字滑卡 + 剧情滑卡）。
