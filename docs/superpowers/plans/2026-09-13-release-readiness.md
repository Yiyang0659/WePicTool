# 现有功能微信上线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让现有穿搭叠图和趣味字画完成真实保存、生产部署与微信提审验收，而非继续增加功能。

**Architecture:** 保留小程序、processOutfit、fun-card-renderer现有分工。先核验主体与发布范围，再冻结候选源码，更新兼容保存服务并定向验收，最后切生产及提交审核。本文是待确认的上线统筹计划，不授权云端切流或购买资源。

**Tech Stack:** 微信小程序、CloudBase云函数/云托管/存储、混元I2I、百炼分类、Node Canvas。

**Spec:** docs/roadmap.md；docs/superpowers/specs/2026-09-13-empty-outfit-scoped-style.md；docs/deployment/fun-card-renderer.md。

## Global Constraints

- 不新增玩法；不清空用户草稿；不绕过内容审核；不以自动化代替真机。
- 不自行修改网络、购买常驻实例或切默认流量。部署/回滚范围经确认后执行。
- 现有439项测试是最近一次本地结果，本轮未重跑；云端版本依据历史记录，执行前重新只读核验。
- 首页图标破图仍未复现定位，不能标为已修复。

## Task 1：明确首发范围与账号资质

**Files:** 核对 docs/current.md；确认后更新 docs/roadmap.md。

- [ ] 在微信后台核验主体类型、认证、小程序备案、服务类目；记录实际状态，不从CloudBase“个人版”推断主体类型。
- [ ] 核对AI图片生成所需深度合成类目和对应供应商材料。混元与百炼分别列明，不能假定一份材料覆盖所有调用。
- [ ] 默认目标是保留当前两大功能；若AI资质不能满足，由用户选择延后完整上线，或先发明确移除AI入口的非AI版，不做审核期间隐藏上线后开启。
- [ ] 实验性AI故事规划不自动纳入；确认首发实际入口清单。

**验收：** 有首发清单、主体与类目凭据、未获批功能处置决定。

## Task 2：冻结唯一候选与部署差异

**Files:** miniprogram/config/env.js、miniprogram/project.config.json、docs/current.md。

- [ ] 运行 git status --short 与 git diff，梳理当前未提交改动，保留用户工作；不混用桌面旧副本。
- [ ] 冻结本工作树候选快照，分别列小程序、processOutfit、renderer待部署文件。
- [ ] 只读核对云端版本/路由/配置；历史012默认与015定向不能作为当前事实直接操作。
- [ ] 检查旧部署脚本：当前脚本会调整审核变量且默认FULL发布，不直接用于此次定向升级。

**验收：** 可复现源码版本、云端版本对照及可回滚方案。

## Task 3：打通自由卡和混合风格保存（首要技术阻塞）

**Files:** miniprogram/utils/funCardRendererClient.js、miniprogram/config/env.js、miniprogram/cloudhosting/fun-card-renderer/{sceneValidator,renderer,server}.js；tests/scoped-style.test.cjs、tests/fun-card-renderer.test.cjs。

- [ ] 复核纯背景空卡、首次加字、手写、单卡换风格、整组换风格与1～8张顺序协议；缺陷先补失败回归，再作最小修复。
- [ ] 按确认范围发布原服务新候选版本，保留稳定版本及默认流量；不变更网络/密钥/实例规格。
- [ ] 定向验证“5张模板+2张空卡→改字/背景/手写→重排→保存当前页/整组”，核对最终审核、返回数量、内容更新及图片顺序。
- [ ] 仅对已验证的新服务启用自由卡支持，验证正常模板无回归；不能只把全局false改true并继续请求旧服务。
- [ ] 生产流量确认后再同步正式客户端能力声明，移除开发灰度依赖；保留故障回滚步骤。

**验收：** iOS/Android实际相册图与最新编辑一致；失败不丢内容、不误显示成功。

## Task 4：穿搭AI与基础交互验收

**Files:** miniprogram/cloudfunctions/processOutfit/、miniprogram/pages/outfit-import/、miniprogram/pages/dressup/、miniprogram/app.json、miniprogram/assets/tabbar/。

- [ ] 更新processOutfit候选后核对实际模型、Key、footnote与额度抵扣；不得用模型调用成功推断免费。
- [ ] 真机验证1张、3张、9张：逐图进度、失败仅重试失败项、取消、审核拒绝、不重复导入。
- [ ] 从上衣组发起AI但上传鞋图，确认进鞋组；手动添加留在所点组；风景进其他组；已有素材不清空。
- [ ] 检查新生成水印实际外观、主体比例及保存编号重排；旧图不追溯改写。
- [ ] 复现底栏图标破图，检查实际包内容与资源请求，再修复证实原因；验证三个Tab切换、记录恢复和“我的”。

**验收：** 实际预览/体验包完成链路，不使用旧二维码或仅模拟数据。

## Task 5：安全、隐私与费用边界

**Files:** docs/deployment/fun-card-renderer.md、miniprogram/cloudhosting/fun-card-renderer/wechatSafety.js、miniprogram/cloudfunctions/processOutfit/contentSafety.js、miniprogram/pages/profile/。

- [ ] 核验上传照片、文本、生成结果、手写合成各自审核覆盖；拒绝/异常均关闭式失败，不以空文字跳过图片审核。
- [ ] 核验调用身份、存储权限、下载范围、限流和日志脱敏；已暴露密钥确认轮换，不打印内容。
- [ ] 对公网入口风险提出独立审批范围；当前暂停网络操作，不擅自恢复。生产前必须取得有效访问控制证据。
- [ ] 微信后台隐私指引与实际照片上传、第三方处理、相册保存、保存期限一致；核验授权拒绝及删除/到期说明。
- [ ] 核验存储生命周期，区分本机记录与到期云文件；过期有明确提示。
- [ ] 设置已确认的费用告警/调用限制及额度到期策略；没有免费额度时不自动转付费模型。常驻实例与扩容预算另行确认。

**验收：** 安全、隐私、费用清单有实证；免费模型额度不被描述为整个服务永久免费。

## Task 6：发布包、体验验收与微信审核

**Files:** README.md、docs/current.md、docs/iterations/2026-09-13.md、docs/changelog.md。

- [ ] 运行 npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs，以及git diff --check。
- [ ] 生产环境运行 FUN_CARD_RENDERER_ACCESS_MODE=call-container-only npm run check:miniprogram:release；该变量不替代真实网络核验。
- [ ] 验证Linux镜像构建/字体、包大小、域名、云环境、正式版路由；体验版不能依赖develop专用gray015。
- [ ] iOS/Android体验包覆盖保存授权拒绝、弱网、重复点击、退出再进、1/7/8张、重排、图标、记录与过期结果。
- [ ] 准备名称、简介、图标、类目、隐私指引、截图、审核操作路径及所需测试身份，确保审核可访问真实功能。
- [ ] 确认候选后提交/合并，上传正式提审包；审核通过后由用户确认发布。记录发布版本与可回滚版本，观察错误率和费用。

**验收：** 微信审核通过且实际发布，再以正式版复验核心保存；此前不得标记已上线。

## 依据与待用户提供的信息

- CloudBase资质指南：https://docs.cloudbase.net/en/ai/release/algorithm-filing
- CloudBase官方主体说明：https://tcb.cloud.tencent.com/blog/2026/07/07/wx-ai-miniapp-plan
- 隐私适配说明：https://cloud.tencent.cn/document/product/1301/97930
- 首个需要确认的信息：微信小程序后台登记主体是个人、个体工商户还是企业，以及小程序备案/深度合成类目当前状态。其余技术盘点可独立推进。
