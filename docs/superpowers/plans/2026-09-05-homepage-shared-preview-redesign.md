# 首页双玩法共享预览改版实施计划

**日期：** 2026-09-05
**状态：** 已按用户确认实施；自动化通过，待双端真机验收
**设计依据：** `docs/superpowers/specs/2026-09-05-homepage-shared-preview-redesign.md`

## 目标

按用户确认的参考图重排小程序首页：两种主玩法并排选择、共用一个主预览面板、删除空白叠卡和重复区块、让当前玩法的两个开始入口在首屏可见，并保留现有真实路由、安全开关和 AI 穿搭流程。

## 范围与约束

- 只修改首页及其测试，不改分层换装、趣味字画、预览、保存和记录页内部流程。
- 不新增“风格滤镜、图片编辑、拼图排版”等尚未实现的能力。
- 不新增位图素材；复用当前头像、衣物、鞋子和趣味字画示例。
- 首页组合摘要不构成 AI 试穿，只展示当前四项选择。
- 保留 `ENABLE_FUN_TEXT_STACK_ENTRY` 的关闭式门禁。
- 生产代码按测试先行实施；先观察新增测试失败，再写最小实现。

## Task 1：锁定首页信息架构与交互状态

**文件：**

- 修改 `tests/layered-dressup.test.cjs`
- 修改 `tests/fun-text-entry.test.cjs`

新增失败测试，断言：

- 初始 `activeHomePlay` 为 `layered-dressup`；
- 点击两个玩法选择卡会切换共享面板；
- WXML 只存在一个共享主预览容器；
- 旧 `.layered-stack-edge`、独立大号趣味字画区、旗舰主卡、热门模板和首页长教程不再存在；
- 四个换装部位各自维护索引，切换上衣不改变头像、下装和鞋子；
- 趣味字画索引在玩法切换后保持；
- 现有四条主入口和 AI 选图入口仍然绑定。

运行：

```bash
node --test tests/layered-dressup.test.cjs tests/fun-text-entry.test.cjs
```

预期：新增用例失败，证明旧首页尚未满足共享预览契约。

## Task 2：实现首页状态与导航行为

**文件：**

- 修改 `miniprogram/pages/index/index.js`

实施内容：

1. 增加 `activeHomePlay` 和四组独立的 `layeredDemoIndices`；
2. 增加 `onSelectHomePlay`，只切换共享面板，不重置两种玩法状态；
3. 增加 `onSelectLayeredDemoItem` 或等价的每组切换方法，按 `groupKey` 更新单一索引；
4. 从四组索引派生当前组合素材，保证引用现有真实资源；
5. 保留 `onTryLayeredDemo`、`onCreateLayeredDressup` 和 `onTryFunTextDemo`；
6. 新增 `onCreateFunText` 导航 `/pages/fun-text/fun-text`，并复用趣味字画开关；
7. `onChooseMedia`、确认页和后续处理逻辑不改行为。

运行 Task 1 聚焦测试，预期 JS 行为用例通过，结构用例仍失败。

## Task 3：重写首页主视图与样式

**文件：**

- 修改 `miniprogram/pages/index/index.wxml`
- 修改 `miniprogram/pages/index/index.wxss`

实施内容：

1. 移除首页独立品牌卡、四叠大演示、趣味字画大演示、旗舰主卡、热门模板和长教程；
2. 添加“今天想做什么？”标题和两张等宽玩法选择卡；
3. 添加唯一共享主预览，根据 `activeHomePlay` 渲染换装或字画状态；
4. 换装预览使用四行真实三缩略图、当前描边、`1 / 3` 和组合摘要，删除所有空白叠卡；
5. 字画预览复用五张真实 PNG 和现有手动 swiper；
6. 两种模式分别显示对应双按钮，并保持共享面板整体高度稳定；
7. 更多工具改成紧凑四列：AI 穿搭整理可用，其余明确显示“即将上线”；
8. 复用现有底部 Tab，不实现参考图中的设备边框或系统状态栏。

样式基准：背景 `#F7F8FC`，蓝紫主色 `#6670F6`，粉色点缀 `#ED65B5`，一级文字 `#151728`，次级文字 `#8B90A6`。实际 rpx 以常见 375×667、390×844 和 Android 高屏真机不遮挡为准。

运行：

```bash
node --test tests/layered-dressup.test.cjs tests/fun-text-entry.test.cjs
npm run check:syntax
npm run check:miniprogram
```

预期：聚焦行为和结构测试通过。

## Task 4：真机尺寸与回归验证

检查以下状态：

- iOS/Android 常见尺寸首屏能看到玩法选择、完整当前预览和双按钮；
- 点击不同部位缩略图只更新该部位与组合摘要；
- 切换玩法后滚动位置不产生明显跳变；
- 趣味字画关闭时仍能看静态示例，但不能进入创作；
- AI 穿搭整理仍进入原选图确认流程；
- 首页不再出现白色模糊占位。

自动化执行：

```bash
npm test
npm run check:syntax
npm run check:miniprogram
npm run lint
npm run check:docs
git diff --check
```

## Task 5：同步治理文档

**文件：**

- 修改 `README.md`
- 修改 `docs/current.md`
- 修改 `docs/decisions.md`
- 修改 `docs/iterations/2026-09-05.md`

记录首页用户旅程改变、实际自动化结果、仍待完成的真机尺寸验证和回滚范围。README 更新首页描述，但不得写成已发布；如果真机尚未完成，必须明确只完成分支实现与自动化。

## 回滚边界

改版只涉及首页三文件和对应测试/文档。若真机出现布局或性能问题，可整体回退首页共享预览提交，不影响分层换装编辑、趣味字画生成、统一导出、记录和云端服务。
