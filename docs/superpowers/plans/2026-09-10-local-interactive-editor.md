# 本地交互与自由手写实施计划

> 执行方式：superpowers:executing-plans，在当前会话逐项执行；不使用子代理。

**Goal:** 连续编辑不依赖每次云端成图，同时保持最终审核与导出一致。

**Architecture:** 云端单卡文字底图，本地独立装饰与笔迹。本机草稿保留可编辑数据，最终成图使用受限笔迹协议与图片审核门禁。

**Tech Stack:** 微信小程序 Canvas 2D、CommonJS、Node HTTP、@napi-rs/canvas、node:test。

**Spec:** `docs/superpowers/specs/2026-09-10-local-interactive-editor-design.md`（2026-09-10 用户已确认）。

## 执行进度（2026-09-10 22:47）

- Task 1–3 核心代码已加入功能分支并有回归；缓存为共享内存LRU，不另传图片快照；本机草稿为独立存储键且仅最近一份。已完成笔迹用独立Canvas缓存。真实触摸、导航反馈和慢网仍待验收，以下清单不视为全部通过。
- Task 4 真实本机img_sec_check成功，renderer增加受限笔迹及上传前审核，单元测试覆盖失败关闭；服务器011已部署，云端新接口与手绘图片尚未验证。
- Task 5 当前卡在开发者工具wx.login失效；等待重新扫码后只做轻量真实调用/图片核验，再启用客户端。开关false，手绘导出暂时阻断。未合并、推送或改网络配置。

## Global Constraints

- 在已有 `codex/ai-outfit-picker-flow` 工作目录继续，保留未提交改动；不合并或推送。
- 不改网络/CDN/存储资源，不创建资源，不绕过身份或审核。
- 每项先添加实际行为失败测试，再实现；不能把自动化当真机通过。
- 笔迹逻辑坐标1080；每卡100笔、每笔1000点、每卡20000点；20步撤销历史。
- 跨设备同步、照片导入、压感与字体生成不纳入本期。

## Task 1：候选点击与上下文交接

Files: `pages/fun-text-candidates/*`、`pages/fun-text-editor/fun-text-editor.js`、`tests/fun-text-candidates-page.test.cjs`、`tests/fun-text-editor-page.test.cjs`（页面路径位于miniprogram）。

- [ ] 新增失败测试：候选当前索引2，点击交接 currentCardIndex=2；连续点击只产生一次导航；手势移动30px不导航；导航失败后允许重试。
- [ ] 执行 `node --test tests/fun-text-candidates-page.test.cjs tests/fun-text-editor-page.test.cjs` 确认新增断言失败。
- [ ] 大框绑定点击/触摸跟踪，子按钮catchtap，hover-class反馈；onShow重置导航锁，fail释放；eventChannel交接当前场景和预览快照。
- [ ] 编辑器验证快照项目/候选/场景后复用；没有快照维持旧行为。重复运行上述测试。

## Task 2：单卡底图协议和缓存

Files: 新增 `miniprogram/utils/funPreviewCache.js`；修改 `funCardRendererClient.js`、renderer的`server.js/index.js/sceneValidator.js/renderer.js`；新增对应node:test。

- [ ] 用两个仅装饰位置不同的场景断言底图key相同，文字不同key不同；失效图片重新请求；过期结果不覆盖。
- [ ] 新增单卡请求接口 `/preview-scene`，校验一个完整场景，保留可信调用、文本审核、限流；渲染时只去除交互装饰，保留文字背景。
- [ ] 用 HTTP 请求验证400/403/503/200边界；最终接口保持原规则；存储路径加请求版本避免覆盖。
- [ ] 页面使用独立预览组件，缓存最多30项，相同请求合并；400ms合并文字/样式刷新，更新不白屏。

## Task 3：本地装饰与手写

Files: 新增笔迹模型与Canvas组件；修改`funTextProject.js`、编辑页三文件；复用scenePainter程序化绘制。

- [ ] 失败测试覆盖单点、坐标边界、非法笔宽/笔型/颜色、点数上限、线段擦除、撤销重做及旧项目空笔迹。
- [ ] 采用结构 `{id, brushKey, colorKey, width, points:[{x,y}]}`，仅接受白名单和有限数值；所有修改清除旧导出结果。
- [ ] Canvas按实际矩形换算坐标和DPR，实例保存活动笔迹，按帧绘制；落笔一次提交历史，touchcancel丢弃；不触发云端底图请求。
- [ ] 装饰二级面板增加手写工具；实线/荧光笔、颜色、粗细、整笔擦除和确认清空；活动操作禁止误触页面滚动/文字弹窗。
- [ ] 本机草稿使用现有存储入口，错误提示不吞；标注本机保存，不宣称云同步。

## Task 4：最终绘制与图片审核

Files: renderer笔迹校验/绘制/审核依赖及测试；部署脚本仅在验证后使用。

- [ ] 先只读核实官方图片审核接口与当前环境能力，不输出凭据；若缺权限立即告知用户。
- [ ] 补测试：含笔迹且图片审核未配置/拒绝/超时不能返回最终图片；允许结果仅来自真实审核适配器。
- [ ] 前后端共享同值笔刷规则，服务端生成待审buffer，审核通过才上传返回；若必须通过待审文件调用，先确认已有存储的私密边界，否则停止开放手绘导出。
- [ ] 不带笔迹的既有文字流程回归；禁止通过旧接口绕过新增笔迹校验。

## Task 5：验证与交付

- [ ] 执行 `npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs`，记录真实结果和既有失败，不宣称全绿。
- [ ] 执行声明式发布预检和`git diff --check`；最小真实请求核验字体/装饰/笔迹及审核上传。
- [ ] 先兼容部署服务端再启用客户端；保持正式开关在图片审核未通过时关闭；不改变云资源配置。
- [ ] 更新current、iteration、decisions与README必要内容；给出真机剩余验收项。
