# AI 穿搭选图与分层换装预览实施计划

**日期：** 2026-09-06
**状态：** 已按用户确认实施；自动化通过，待视觉和双端真机验收
**设计依据：** `docs/superpowers/specs/2026-09-06-ai-outfit-picker-entry-design.md`

## 目标

在不改变现有 AI 处理、四部位素材管理和统一导出协议的前提下，修正两个首页入口及其首段用户流程：AI 穿搭整理先进入可理解的空选图状态；分层换装首页预览改为四组单图手势切换，并把当前选择按部位顺序纵向汇总。

## 范围与约束

- 修改首页 `pages/index/index` 的状态、结构和样式；
- 保留 `pages/dressup/dressup?mode=upload` 及其四组上传实现，只补行为回归；
- 使用原生 `swiper` 完成跟手滑动、回弹和循环，不编写自定义触摸物理；
- 不做定时自动轮播；图片只在用户手势或点击箭头后变化；
- 不修改 AI 云函数、分类规则、结果页、预览页或导出 manifest；
- 先补失败测试，再写最小实现，并执行治理规定的完整检查。

## Task 1：锁定 AI 选图状态行为

**文件：**

- 修改 `tests/layered-dressup.test.cjs`

新增断言：

1. 点击首页 AI 工具只把 `step` 改为 `confirm`，不调用 `wx.chooseMedia`；
2. 空状态点击添加才调用 `wx.chooseMedia` 并写入图片；
3. “重新选择”清空图片但保持 `step=confirm`；
4. 删除最后一张图片后仍停留在空选图状态；
5. 左上返回清空临时图片并恢复 `step=home`；
6. 无图片时开始处理不执行，主按钮有禁用状态。

## Task 2：实现 AI 选图空状态与导航

**文件：**

- 修改 `miniprogram/pages/index/index.js`
- 修改 `miniprogram/pages/index/index.wxml`
- 修改 `miniprogram/pages/index/index.wxss`

实施内容：

- 将首页 AI 入口从“立即选择图片”改为“进入确认状态”；
- 空状态素材卡中央显示大型添加入口；
- 在选图区顶部增加左侧返回、居中计数、右侧条件显示的“重新选择”；
- 拆分 `onBackToHome` 与 `onResetPickedImages`；
- 删除最后一张时保持确认状态；
- 无图片或处理中时主行动按钮禁用；
- 已选 1–8 张时继续保留追加入口，9 张时隐藏。

## Task 3：锁定分层换装单图切换行为

**文件：**

- 修改 `tests/layered-dressup.test.cjs`

新增断言：

1. 首页四行使用原生循环 `swiper`，每行当前索引独立；
2. `swiper change` 只更新触发的部位；
3. 左右箭头继续循环调用同一状态更新；
4. 右侧当前选择按 `head → tops → bottoms → shoes` 顺序输出；
5. 首页“上传我的素材”继续进入 `mode=upload`；
6. 上传模式页面四组均绑定用户图片添加操作。

## Task 4：实现首页单图预览和竖向摘要

**文件：**

- 修改 `miniprogram/pages/index/index.js`
- 修改 `miniprogram/pages/index/index.wxml`
- 修改 `miniprogram/pages/index/index.wxss`

实施内容：

- 每个部位行将三缩略图改成单图 `swiper`；
- 单图使用 `aspectFit` 并扩大画框；
- 增加 `onLayeredDemoSwiperChange`，把原生滑动索引接入现有四组状态；
- 保留左右箭头并使用循环索引；
- 右侧 2×2 网格改为带部位标签的四项竖向列表；
- 增加共享预览高度，保证图片可辨识；
- 375 px 以下压缩标签和间距，但不恢复三缩略图结构。

## Task 5：验证与文档同步

聚焦验证：

```bash
node --test tests/layered-dressup.test.cjs
npm run check:syntax
npm run check:miniprogram
```

完整验证：

```bash
npm test
npm run check:syntax
npm run check:miniprogram
npm run lint
npm run check:docs
git diff --check
```

同步 `docs/current.md`、`docs/iterations/2026-09-06.md` 和必要的 README/变更摘要。没有真实真机证据时，只记录“分支实现与自动化通过”，不得声称 iOS、Android 或相册授权已经验收。

## 回滚边界

本轮首页变化集中在 `pages/index/index` 三个文件。若真机手势或小屏布局出现阻断回归，可回退首页状态与视图提交，不影响 `pages/dressup/dressup`、AI 云函数、结果页和统一导出数据。四部位素材页本轮原则上不改业务实现。
