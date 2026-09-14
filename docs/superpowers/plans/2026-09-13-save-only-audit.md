# 保存审核与显式排序 Implementation Plan

> 使用 executing-plans 在当前用户指定工作树逐项执行，不委派，不切流。

**Goal:** 实现已确认的按钮排序与保存才审核。
**Architecture:** 共用本地场景合成器产生仅预览用图片；结果页保存入口单独获取已审核云端成品。模型删除沿用commitEdit撤销，列表用固定定位与CSS过渡代替可拖动控件。
**Tech Stack:** 小程序Canvas2D、现有opentype/scenePainter、Node test。
**Spec:** docs/superpowers/specs/2026-09-13-save-only-audit.md

## 约束
保留当前工作树；不修改云端、安全策略、密钥或其他玩法；未审核图不得进入相册保存链路。

## 1 模型和排序
- [x] tests/fun-text-editor-page.test.cjs增加前移、后移、边界、删除最后一张、撤销的行为断言，先运行观察失败。
- [x] funTextProject.js新增removeCard(project,candidateId,index)，commitEdit内splice并重编号；editor JS按sceneId维持选择。
- [x] editor WXML普通绝对定位view替换movable-view，移除拖动绑定，三按钮catchtap；WXSS transform 200ms过渡，增加列表高度。
- [x] 重跑编辑页测试。

## 2 本地预览与保存隔离
- [x] tests/save-only-audit.test.cjs测试本地场景合成包含笔迹/字形、编辑预览不请求云端、结果页进入不审核、保存请求失败不写相册；先观察失败。
- [x] utils/funLocalPreview.js提供renderCards(wx,canvas,project,isCurrent)，依次ensureScene、paintScene(drawText)、canvasToTempFilePath；inkStickers.renderScene展开手写。
- [x] 编辑页preview分支先本地合成+编号+导航，不写_editorManifest缓存。
- [x] 结果页initProject本地合成，保存入口单独审核成图并物化，内存指纹复用；generation阻止过期操作，失败可重试。
- [x] 更新旧云端进入页面测试为当前边界，保留网络、安全与相册回归。

## 3 验证和交接
- [x] npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs；git diff --check。
- [x] 更新README/current/当日迭代实际证据，明确真机动画与相册尚需人工验收；不提交上线。

执行补充：允许最终成图1～8张的客户端及服务器校验已改，候选预览仍3～8张；未部署。395/395及全部检查通过，真机效果待验。
