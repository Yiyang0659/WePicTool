# 穿搭叠图统一创作流程实施计划

**日期：** 2026-09-06
**状态：** 已实施，等待真机与真实 AI 验收
**设计依据：** `../specs/2026-09-06-unified-outfit-stack-flow-design.md`

## 1. 实施目标

把首页“分层换装”和“更多工具 / AI 穿搭整理”收敛为一个“穿搭叠图”入口。在同一个分层工作台中提供“自己分层”和“AI 帮我整理”两种可混用的添加方式，AI 结果经确认后追加到四部位项目；预览、编号、保存和记录继续复用已有分层换装管线。

## 2. 文件与步骤

### 步骤一：首页入口收敛

修改：

- `miniprogram/pages/index/index.wxml`
- `miniprogram/pages/index/index.js`
- `miniprogram/pages/index/index.wxss`
- `tests/layered-dressup.test.cjs`

工作：

1. 展示名从“分层换装”调整为“穿搭叠图”；
2. 主按钮改为“用我的图片制作”，次按钮改为“先试玩示例”；
3. 从“更多工具”删除独立 AI 穿搭入口，并把工具网格调整为三列；
4. 删除首页内嵌 AI 选图视图的可达入口，自动化断言首页只有一个穿搭入口。

### 步骤二：统一项目模型支持 AI 追加与待确认素材

修改：

- `miniprogram/utils/layeredDressup.js`
- `tests/layered-dressup.test.cjs`

工作：

1. 项目增加向后兼容的 `pendingItems`；
2. 增加 AI 结果批量追加、容量溢出、重复检测和待确认逻辑；
3. 增加待确认素材移动到部位、删除能力；
4. 保留原图、处理图、分类置信度和来源字段；
5. 任意合并或调整继续触发既有 manifest 失效。

### 步骤三：AI 导入与确认子页面

新增：

- `miniprogram/pages/outfit-import/outfit-import.json`
- `miniprogram/pages/outfit-import/outfit-import.wxml`
- `miniprogram/pages/outfit-import/outfit-import.wxss`
- `miniprogram/pages/outfit-import/outfit-import.js`

修改：

- `miniprogram/app.json`
- `miniprogram/config/env.js`
- `tests/layered-dressup.test.cjs`

工作：

1. 复用现有 1–9 张选图、追加、删除、清空、比例、压缩、上传、安全审核、AI 分类和本地 mock；
2. 把返回结果分成头像/发型、上衣、下装、鞋子和待确认五区；
3. 支持改单张分类、删除、原图/白底切换；
4. 点击“加入穿搭叠图”通过 eventChannel 把确认数据返回工作台；
5. AI 关闭、失败或取消时不影响工作台既有项目。

### 步骤四：工作台双入口与混合素材

修改：

- `miniprogram/pages/dressup/dressup.json`
- `miniprogram/pages/dressup/dressup.wxml`
- `miniprogram/pages/dressup/dressup.wxss`
- `miniprogram/pages/dressup/dressup.js`
- `tests/layered-dressup.test.cjs`

工作：

1. 页面标题和介绍统一为“穿搭叠图”；
2. 增加“自己分层 / AI 帮我整理”双入口；
3. “自己分层”先选部位，再调用现有单组上传；
4. AI 导入成功后追加到项目并显示来源；
5. 增加待确认素材条，允许选择部位或删除；
6. 保持四组上传、系统补充、排序、预览和保存行为不回归。

### 步骤五：文档与完整验证

修改：

- `README.md`
- `docs/current.md`
- `docs/roadmap.md`
- `docs/decisions.md`
- `docs/product/PRD.md`
- `docs/product/TECHNICAL_SPEC.md`
- `docs/product/PLAYBOOK.md`
- `docs/product/DESIGN_SYSTEM.md`
- `docs/iterations/2026-09-06.md`

检查：

```text
node --test tests/layered-dressup.test.cjs
npm test
npm run check:syntax
npm run check:miniprogram
npm run lint
npm run check:docs
git diff --check
```

开发者工具验证首页单入口、工作台双添加方式、AI 空选图、结果确认回填、待确认归类和混合素材静态布局；真实 AI、相册授权、iOS、Android 与微信聊天仍按 G1/G2 单独记录。

## 3. 风险与回滚

- 当前 `processOutfit` 主要分类上衣、下装和鞋子；头像/发型在服务端扩展完成前必须进入待确认，不能误分；
- eventChannel 丢失时不得写入半成品项目；
- 老草稿没有 `pendingItems` 时按空数组读取；
- AI 发布开关关闭时隐藏 AI 入口，手动工作台完整可用；
- 回滚时恢复首页入口和移除 AI 子页面即可，分层项目已有四组结构、manifest 和历史记录不需要回滚。
