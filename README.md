# WePicTool 微信小程序

2026-09-15 本地入口统一：今后微信开发者工具只打开 `/Users/Zhuanz/Desktop/WePicTool/miniprogram`，桌面仓库检出 `main`。原4695工作区的miniprogram已整体迁入此路径，旧工作区已备份并移除。迁入后受Git管理的小程序文件与main零差异，459/459及治理检查通过；这次目录迁移不更新微信审核包或云端部署。下文旧路径均为历史记录。

2026-09-14 已原样合入本地`main`：用户确认测试通过的`codex/hunyuan-outfit`代码已快进合并，候选提交`c8f4b72`，业务代码和配置逐文件哈希一致；当前目录不变。合并后仅更新文档，不推送GitHub、不重新部署。此前只读控制台确认renderer 017正常且100%流量；小程序正式发布尚未完成。以下日期条目保留为历史，最新状态见[当前状态](docs/current.md)。

2026-09-13 后续修复：预览牌堆按完整卡片列表循环；自由卡直接请求`/render-stack`并经服务端校验与审核，取消会误拦截的能力预查询。部署历史见[交接清单](docs/deployment/2026-09-13-review-handoff.md)。本地修复需重新编译，功能测试由用户完成。

2026-09-13 分组添加入口（本地候选）：素材横向列表末尾及空组加号提供“继续让 AI 整理 / 自己添加图片”；AI保持自动分类，手动直入所点组，沿用12张限制和保存状态保护。需重新编译预览包。用户确认混元水印设为简短“AI”，请求已配置footnote，编号仍随排序合成；须重新部署processOutfit，仅影响新生成图，实际水印外观待核验。

2026-09-13 AI整理进度（本地候选，未发布）：逐张请求、最多2张并发，显示真实完成数/失败数、每图状态和耗时。成功结果暂存在当前页面，失败后可只重试失败项或仅加入成功项；取消/离页不恢复，已发出的请求可能继续消耗额度。此次客户端改动需重新编译并更新预览/体验包；单图仍可能超时，不能保证后台任务恢复。

2026-09-13 内容区手写（功能分支，本地实现）：自由手写和本机草稿移到文字输入下，支持透明笔迹添加当前卡、配纯色背景插入新卡，以及“＋空白卡”。新卡可继续改背景、文字、贴纸和笔迹，最多8张；旧草稿兼容，副本互不联动。新solid背景协议服务端代码已补，但未部署；`FUN_CARD_RENDERER_SUPPORTS_FREE_CARDS=false` 阻止新卡/纯色卡向旧服务提交保存，提示作品保留，已有模板保存不变。编辑和微信预览不审核；上线启用需先部署并验收兼容服务，不能直接打开能力声明。

2026-09-13 最新修订：趣味字画微信预览“保存到相册”默认审核后按编辑顺序保存整组，滑动/展开不改变保存范围；逐张进度与同会话失败续存，移除当前图片提示。以下单张描述为此前历史，不再代表当前入口行为；未部署/发布。

2026-09-13 微信预览改版（功能分支，未发布）：小鹿标题、猫咪插画、左侧动画明暗开关、紧凑正方形排序按钮；趣味字画预览页新增“保存到相册”，仅点击后审核并保存当前图，独立黑白动态提示。后端仍整组审核、相册只写选中图；真机尚待验收，1～2张成图仍需服务端更新。

2026-09-13 保存审核分离（当前功能分支，未部署/发布）：趣味字画微信预览和结果页进入改为本地完整合成，不提交审核；只有保存当前页、整组和结果页按顺序保存请求审核成图。预览文件与已审核保存缓存隔离，预览页长按提示返回保存入口。卡片条仅横向浏览，前移/后移/删除按钮显式修改顺序，至少保留1张；少于3张是普通图片保存。**1～2张云端成图需要部署本轮sceneValidator变更，线上015尚不包含此改动**。以下为历史过程记录，以docs/current.md为准。

2026-09-13 定向真机验收（功能分支，非正式发布）：`config/env.js` 的 `FUN_CARD_RENDERER_DEV_GRAY='gray015'` 仅在 `wx.getAccountInfoSync().miniProgram.envVersion === 'develop'` 时让最终 `/render-stack` 请求定向015。体验版、正式版、未知环境不加参数，继续默认012；测试结束将该配置清空。测试须从本次开发预览码进入，不能用旧体验码代替；仍需核对015实例日志及相册实物，客户端配置不等于已经验收成功。

2026-09-12 本机编辑（功能分支，未发布）：趣味字画输入、规则候选、改字/字体/背景、贴纸及手写预览改为本机绘制，编辑不调用审核、AI或renderer。字体随异步分包加载，首次下载仍需网络。保存、完成及微信成品预览仍走原云端审核，不代表45009已修复。资源生成：`node scripts/build-local-fonts.mjs`；回滚关闭`ENABLE_FUN_OFFLINE_PREVIEW`。

2026-09-11 编辑导出与预加载（功能分支）：画布下支持保存当前页/整组，底部固定微信预览/完成按钮；保存与微信预览复用审核后的高清成图。候选生成后后台依次预热封面、卡片及三字体变体，编辑页共享本机临时图片缓存（并发2、最多60项、15分钟）；已缓存组合直接显示，新文字/配色/模板仍可能首次等待。未新增云资源，真机相册授权和固定栏效果待验收。

2026-09-11 参考图编辑页（功能分支）：保留大画布，下方重排卡片顺序、三标签、自由手写、本机草稿库、贴纸和配色、完成按钮。独立手写支持作为可移动/缩放/旋转、可继续改笔迹的贴纸添加；草稿库仅本机最多10份/2MiB，长按删除单份，清空不影响当前项目。新增局部线段橡皮擦、横向10档笔宽（4–96）、写画/移动画布切换；新作品2160工作区保存完整内容，旧草稿保留1080尺寸。程序化装饰一键置底/置顶，手写贴纸仍独立上层。最终成图继续审核，新笔宽renderer更新状态以docs/current.md为准；真机手感与严格视觉验收尚未完成，不包含跨设备同步或压感保证。

最新补充（2026-09-10 23:07）：011的真实单卡预览与含手绘审核成图已成功，首张下载目检通过；`ENABLE_FUN_LOCAL_EDITOR` 已启用。客户端需重新编译，CLI登录阻塞导致新界面尚未验证；以下早先“开关关闭”记录为过程状态，最新结论以current.md为准。

2026-09-10 编辑体验实验：功能分支加入云端单卡字体底图缓存、本地装饰与自由笔迹分层（实线笔/荧光笔、颜色/粗细、整笔擦除、撤销），以及最近一个本机可编辑草稿。`ENABLE_FUN_LOCAL_EDITOR` 暂为 `false`，尚未开放：renderer 011已部署，但新接口真实调用被开发者工具登录失效阻断。手绘最终图必须通过图片审核后才能上传；不包含跨设备草稿同步或压感保证。详见设计与当前状态。

2026-09-10 部署补充：已加入 `scripts/deploy-renderer-preserving-network.cjs`，通过现有CLI会话只更新原renderer代码和微信审核变量，不提交网络或实例规格字段。使用方法和真实部署状态见 `docs/deployment/fun-card-renderer.md`、`docs/current.md`；提交成功不等于已恢复成图。

WePicTool 是微信「合并发送 / 叠图」前的素材处理与玩法生成工具——它不替代微信发送，而是先把原始图片或一句话整理成有分组、有封面、有顺序、可预演的一叠图。穿搭叠图与趣味字画是当前两条主玩法；穿搭叠图同时支持“自己分层”和“AI 帮我整理”，两种方式共享一个四部位工作台并可混用（详见 [`docs/product/PLAYBOOK.md`](docs/product/PLAYBOOK.md)）。当前项目以微信小程序为实际主线，并让穿搭叠图和趣味字画共用同一顺序导出契约。

当前证据边界：共同基线已合并到 `main`；`codex/ai-outfit-picker-flow` 又完成了待合并的首页交互改进。趣味字画 renderer v004 已把三款授权字体固定打入镜像、启动期一次注册并完成 100% 切流，正常服务端渲染不再依赖字体 CDN；客户端 CDN 配置暂留跨设备加载和回滚。真实 `callContainer` 三字体中文成图、48 小时清理、iOS、Android、相册授权与真实微信聊天仍未验收。按用户要求，VPC、子网、NAT 与公网关闭操作已暂停；小程序未发布，生产仍为 **NOT READY**。

小程序 UI 采用底部三 Tab 架构（首页 / 记录 / 我的）。首页使用“穿搭叠图 / 趣味字画”双玩法选择和单一共享预览，让用户先选任务、在同一区域试玩或开始创作；结果页与预览页采用沉浸式微信聊天窗口风格，让用户提前预演多图合并发送后的真实叠图折叠效果。

---

## 当前阶段与产品特性

实时项目状态与近期优先级分别以 [`docs/current.md`](docs/current.md) 和 [`docs/roadmap.md`](docs/roadmap.md) 为准；本说明提供项目全景入口与运行指南。

当前正在仓库根目录的 `codex/ai-outfit-picker-flow` 验证首页交互改进；其基线为 `main`，旧 worktree 只保留为历史追溯来源。

### 当前已实现特性

- **双玩法共享首页**：以“今天想做什么？”进入穿搭叠图或趣味字画；两种玩法共用一块主预览并保留各自选择进度。穿搭预览内置 4 套完整基础搭配，四个部位各显示一张放大图片，同一序号对应同一套；空闲时一次随机演示一个部位，用户也可原生跟手滑动或点击左右按钮，操作后自动演示暂停，右侧竖向同步当前选择。
- **统一穿搭工作台**：主入口“用我的图片制作”进入同一个四部位项目。已经分好类时选择“自己分层”；图片混杂时选择“AI 帮我整理”，经分类、去背和人工复核后只追加到已有项目。低置信度、其他类别与容量溢出图片进入待确认区，不覆盖已有素材。
- **AI 选图与复核**：AI 子流程从空选图状态开始，用户主动添加 1–9 张，可追加、单张删除或清空重选；处理后可改单张分类、切换原图/白底、删除，再回填工作台。失败或关闭 AI 时仍可完整使用手动路径。
- **趣味字画输入与三套候选**：首页展示五张包内静态示例牌堆；输入页提供一句话、组合表达标签，以及 6 类共 12 个可继续修改的灵感案例。系统可从 8 种规则叙事玩法中生成三套结构不同的可滑候选，支持「用这套」、「自己改改」与「再来三套」；Canvas 失败时调用云托管 `/preview-stack` 降级为服务端低清图，不使用系统字体回退。入口可由 `ENABLE_FUN_TEXT_STACK_ENTRY` 紧急关闭，同时保留首页静态示例。
- **趣味字画聚焦编辑与高清结果**：编辑页固定为「内容 / 样式 / 装饰」三入口，支持改单卡文字与字号、卡片排序、7 套风格的背景/配色、3 种授权字感、白名单贴纸/涂鸦的拖动/双指缩放/旋转，以及 20 步撤销重做和单卡/整组恢复；编辑会让旧渲染立即失效。通用结果页（`pages/template-result`）调用云托管输出 1080 高清 PNG、写入本地历史任务、支持普通/深色微信牌堆全屏预演（`pages/preview`）与顺序断点续存，保存完成提供明确的微信四步发送指引。
- **趣味字画本地记录与旧记录兼容**：记录页支持「趣味字画」分类展示与任务重开，历史大字滑卡记录展示友好升级引导与重新制作入口；提供完整的云托管部署指南（`docs/deployment/fun-card-renderer.md`）与自动化配置预检。
- **P2.2 AI 故事规划器（计划外实验代码）**：分支含 `planFunTextStory`、结构化候选校验/单次修复、客户端规则降级与本地模拟测试；它不在已确认的阶段一计划交付范围内，发布范围尚未确认，云函数部署、模型 API key、线上域名和真机链路仍待办。
- **本地/云端双模式**：未配置云环境时自动启用本地 Mock 预览模式；配置后走云存储与云函数链路。
- **内容安全防御门**：集成 `contentGuard` 云函数与微信安全接口，对文本与图片进行合规安全审查。
- **AI 智能分类与成图**：本地候选 `processOutfit` 使用阿里云 `qwen3.8-flash` 分类、CloudBase `HY-Image-v3.0-I2I-ToB-v1.0.1` 生成衣服白底图。生成失败不回退付费生图；需要重新部署云函数，真实效果与额度抵扣尚未验收。部署见 [混元接入](docs/ai-workflows/hunyuan-deploy.md)。
- **前端 Canvas 白底卡合成**：`utils/cardComposer.js` 提供 1:1 / 4:5 / 3:4 多比例合成、品类视觉重心锚点对齐、浅色衣物微阴影与描边兜底。
- **统一可见序号导出**：`stackExportManifest.js`、`sequenceBadgeComposer.js` 与 `imageExporter.js` 为三种玩法生成独立叠、把 `01…N` 写入最终图片，并按同一 manifest 串行预览/保存、失败续存。微信 API 不能指定相册文件名或排序，用户仍需按图片角标确认 `01` 在第一位。
- **微信聊天风结果页**（`pages/result`）：白色微信聊天气泡展示分组卡片，支持展开横滑缩略图、原图/白底图切换、改分类、大图预览。
- **微信发送效果全屏预览**（`pages/preview`）：固定一屏的微信聊天壳层，导航和底部预览栏保持原位，只有聊天内容区纵向滚动；图片按微信消息通道与原图比例展示，支持普通/深色模式合并按钮、顶层卡横滑、纵向展开和原生大图查看。
- **微信叠图发送能力判定**：`utils/task.js` 自动判定分组是否达到微信 $\ge 3$ 张叠图阈值，不足时提供降级提示。
- **批量保存与发送引导**：支持保存全部、按分组批量保存到系统相册，并附带相册授权和回微信勾选发送指引；小程序不能直接替用户发送图片，也不承诺系统相册自动排序。
- **本地轻量历史记录**（`pages/record`）：处理完成自动写入设备本地缓存（最多保留 20 条，不上传云端，无账号负担），支持按相对日期（今天/昨天/N天前）聚合查看与再次生成。
- **个人中心**（`pages/profile`）：提供相册权限管理、缓存清理、反馈建议、分享推荐与隐私说明。
- **自动化测试与预检**：内置纯规则单元测试、语法检查、小程序配置预检及文档治理一致性校验。

### 当前不包含范围

- Sharp/Pillow 后端白底合成（CloudBase 云函数不支持 C++ 原生模块，已收敛至前端 Canvas 完成）。
- 账号体系、云端同步历史记录、付费系统。
- 通用表情包制作器（所有玩法必须收敛在微信叠图管线内）。

---

## 常用开发与测试命令

在项目根目录下运行：

```bash
# 1. 运行纯规则自动化测试（Node 内置 test runner）
npm test

# 2. 小程序上线前预检（检查 AppID、JSON、WXML 闭合、文件完整性）
npm run check:miniprogram

# 2.1 启用趣味字画的发布预检（仍需独立核验云端配置/公网关闭）
FUN_CARD_RENDERER_ACCESS_MODE=call-container-only npm run check:miniprogram:release

# 2.2 静态回滚包：先把 ENABLE_FUN_TEXT_STACK_ENTRY 改为 false
npm run check:miniprogram:release

# 3. 语法检查小程序核心 JS / 工具文件
npm run check:syntax

# 4. 文档治理体系一致性检查
npm run check:docs

# 5. TypeScript 类型检查（覆盖 src/ 和 scripts/）
npm run lint

# 6. 启动 Vite Web 演示沙盒（开发模式）
npm run dev

# 7. 构建 Vite 演示应用
npm run build

# 8. 运行趣味字画云托管渲染器测试
npm --prefix miniprogram/cloudhosting/fun-card-renderer test

# 9. 构建趣味字画 Node 20 云托管镜像（需本机 Docker）
docker build -t wepictool-fun-card-renderer miniprogram/cloudhosting/fun-card-renderer
```

---

## 项目目录全景说明

```text
WePicTool/
├── miniprogram/                      # [核心交付物] 微信小程序原生源码
│   ├── app.js / app.json / app.wxss  # 小程序全局入口、页面路由、Tab 配置与全局样式
│   ├── sitemap.json                  # 微信搜索索引配置
│   ├── project.config.json           # 小程序目录内工程配置
│   ├── assets/                       # 静态资源
│   │   └── tabbar/                   # 底部 Tab 图标（首页/记录/我的 各 2 态）
│   ├── config/
│   │   ├── env.js                    # CloudBase 环境、renderer 服务/字体地址与入口开关
│   │   └── playRegistry.js           # 玩法与内置素材包注册表
│   ├── pages/                        # 页面视图层
│   │   ├── index/                    # 首页 Tab：双玩法选择、共享预览与统一穿搭入口
│   │   ├── fun-text/                 # 趣味字画输入页：一句话、表达标签与 12 个结构化案例
│   │   ├── fun-text-candidates/      # 趣味字画候选页：三套独立可滑牌堆、用这套、自己改改、再来三套与低清降级
│   │   ├── fun-text-editor/          # 趣味字画聚焦编辑：内容、样式、装饰、手势与撤销恢复
│   │   ├── template-result/          # 趣味字画/通用模板结果页：高清渲染、微信预演、按序保存与发送引导
│   │   ├── dressup/                  # 穿搭叠图工作台：手动/AI 混合素材、排序、分组保存
│   │   ├── outfit-import/            # AI 添加子流程：选图、处理、复核并回填工作台
│   │   ├── result/                   # 结果页：白色聊天气泡、分组卡片、Canvas 合成、改分类
│   │   ├── preview/                  # 预览页：固定微信外壳、普通/深色切换、聊天区滚动与牌堆滑卡
│   │   ├── record/                   # 记录 Tab：本地历史任务列表、相对日期聚合、再次生成
│   │   └── profile/                  # 我的 Tab：相册权限、缓存清理、反馈与隐私说明
│   ├── cloudfunctions/               # 微信云开发云函数
│   │   ├── processOutfit/            # 千问分类与 CloudBase 混元图生图
│   │   ├── contentGuard/             # 内容安全审查云函数 (msgSecCheck)
│   │   └── planFunTextStory/         # P2.2 实验：AI 结构化故事规划与二次审核
│   ├── cloudhosting/
│   │   └── fun-card-renderer/         # Node 20/bookworm-slim + node:http 渲染、字体与二次审核服务
│   └── utils/                        # 前端核心工具库
│       ├── task.js                   # 任务模型、Mock 数据、叠图能力 (buildSendability) 判定
│       ├── layeredDressup.js          # 穿搭叠图项目模型、AI 追加与编辑规则
│       ├── stackExportManifest.js    # 三玩法统一叠顺序、封面、版本与稳定指纹契约
│       ├── sequenceBadgeComposer.js  # 独立 Canvas 写入 01…N 可见序号并物化最终导出图
│       ├── imageExporter.js          # 按 manifest 串行保存相册，返回组/序号级断点游标
│       ├── cardComposer.js           # 前端 Canvas 白底卡排版合成引擎 (1:1/4:5/3:4, 阴影描边)
│       └── previewLayout.js          # 预览页微信消息通道、38vw 紧凑缩略卡与比例计算
├── docs/                             # [项目大脑] 治理体系与知识库
│   ├── README.md                     # 文档总览、接手顺序、职责地图与统一状态词
│   ├── current.md                    # 当前阶段、活跃分支、阻塞项与下一步（唯一事实源）
│   ├── roadmap.md                    # 交付门禁 G0~G3 与产品能力 P1~P5
│   ├── decisions.md                  # 架构、技术与产品关键决策库
│   ├── governance.md                 # 开发与文档同步治理规则
│   ├── changelog.md                  # 用户可感知的功能变更日志
│   ├── product/                      # 产品核心文档
│   │   ├── PRD.md                    # 产品需求文档
│   │   ├── PLAYBOOK.md               # 叠图玩法实现手册 (微信平台事实与统一叠图管线)
│   │   ├── TECHNICAL_SPEC.md         # 架构与技术规格说明书
│   │   └── DESIGN_SYSTEM.md          # 页面骨架、视觉令牌和组件基线（待确认）
│   ├── ai-workflows/                 # AI 提示词工程与模型评测
│   ├── iterations/                   # 每日敏捷迭代日志 (YYYY-MM-DD.md)
│   ├── superpowers/                  # 单项功能设计说明 (specs/) 与实施计划 (plans/)
│   └── history/                      # 归档的历史状态、早期笔记与调研资料
├── scripts/                          # [工程脚本] 自动化校验与本地联调
│   ├── check-miniprogram.mjs         # 小程序上线前自动化预检
│   ├── check-documentation.mjs       # 文档治理一致性自动化检查
│   ├── gen-tabbar-icons.py           # TabBar 图标生成脚本
│   ├── test-dashscope.cjs            # 阿里云 DashScope 分类连通性测试
│   ├── test-matting.cjs              # 阿里云 DashScope 抠图独立测试
│   ├── test-wanx.cjs                 # 万相图像模型测试
│   └── test-matting-models.cjs       # 抠图模型效果与耗时对比测试
├── tests/                            # [自动化测试] 纯规则单测套件
│   ├── task.test.cjs                 # 任务数据结构与叠图阈值判定测试
│   ├── content-safety.test.cjs       # 内容安全规则测试
│   ├── preview-layout.test.cjs       # 预览页排版计算测试
│   └── check-documentation.test.cjs  # 文档治理机制测试
├── .worktrees/                       # [Git 工作树] 独立功能分支
│   ├── bigtext-handwrite/            # 历史大字滑卡实验，供趣味字画选择性迁移
│   ├── layered-dressup-mvp/          # 分层云换装来源分支，保留历史/差异核对
│   └── fun-text-stack-phase1/        # 已合入 main 的历史集成工作树
├── src/ & dist/                      # [演示沙盒] Vite + React + Tailwind 模拟器（不随小程序上传）
├── ui-reference/                     # 微信真实叠图录屏与视觉参考原型
├── package.json                      # 项目 npm 依赖与 scripts 配置
├── project.config.json               # 微信开发者工具根配置
├── CLAUDE.md / AGENTS.md             # AI 协作规范与上下文索引入口
└── metadata.json                     # 项目元数据
```

---

## 接入真实云开发流程

在上线或真机测试前，需要完成以下云开发配置：

1. 在微信公众平台创建小程序，获取真实 **AppID**。
2. 替换 `project.config.json` 和 `miniprogram/project.config.json` 中的 `appid`。
3. 在微信开发者工具中开通云开发环境，获取 **环境 ID**。
4. 在 `miniprogram/config/env.js` 中填入 `CLOUD_ENV_ID`。
5. 分别右键 `miniprogram/cloudfunctions/` 下的 `processOutfit` 和 `contentGuard`，选择“上传并部署：云端安装依赖”。
6. 需要联调趣味字画时，按 [`docs/deployment/fun-card-renderer.md`](docs/deployment/fun-card-renderer.md) 部署：三款服务端字体必须随 renderer 镜像发布并在启动期注册，现有 CloudBase 字体 CDN 与 `FUN_CARD_RENDERER_URL` 暂留客户端加载和回滚；preview/render POST 始终只通过 `wx.cloud.callContainer`，服务端/发布预检要求 `FUN_CARD_RENDERER_ACCESS_MODE=call-container-only`。context/OpenID 头部不是独立公网鉴权。当前网络资源与公网开关操作暂停，恢复前不得创建可能计费的 VPC、子网或 NAT。
7. renderer 分支新增可选微信 HTTPS 审核模式（未部署）：本地秘密准备入口为根目录 `.env.renderer.local`，只在其中填写小程序 AppSecret，不放入小程序配置或 Git。文件不自动加载/部署；原模式默认保留。新模式由客户端每次 `wx.login`，服务端核验一次性登录凭证后再审核、渲染；本机身份与审核实测通过，云端部署验证未完成。详见部署手册的 2026-09-10 小节。
8. 如评估后决定验证 P2.2，再单独部署 `planFunTextStory` 并配置服务端模型 API key；当前尚未完成这一步，也未确认它属于发布范围。
8. 显式设置 `FUN_CARD_RENDERER_ACCESS_MODE=call-container-only` 后运行 `npm run check:miniprogram:release`，再进入微信开发者工具、iOS、Android 与真实聊天验收。renderer v004 镜像字体与构建运行已通过，但预检和服务在线都不代表三字体中文成图、preview/render 私密链路或双端真机已通过。

---

## 核心文档索引

- 🧭 **文档总览与接手顺序**：[`docs/README.md`](docs/README.md)
- 📋 **产品需求**：[`docs/product/PRD.md`](docs/product/PRD.md)
- 🎮 **叠图玩法手册**：[`docs/product/PLAYBOOK.md`](docs/product/PLAYBOOK.md)
- 📐 **技术方案设计**：[`docs/product/TECHNICAL_SPEC.md`](docs/product/TECHNICAL_SPEC.md)
- 🎨 **界面与页面模板基线（待确认）**：[`docs/product/DESIGN_SYSTEM.md`](docs/product/DESIGN_SYSTEM.md)
- 📍 **当前状态**：[`docs/current.md`](docs/current.md)
- 🗺️ **路线图与优先级**：[`docs/roadmap.md`](docs/roadmap.md)
- ✍️ **趣味字画设计**：[`docs/superpowers/specs/2026-08-31-fun-text-stack-design.md`](docs/superpowers/specs/2026-08-31-fun-text-stack-design.md)
- ⚖️ **关键决策库**：docs/decisions.md
- 📜 **治理与同步规范**：[`docs/governance.md`](docs/governance.md)
# 2026-09-13 本地候选更新

新增空穿搭入口：不自动恢复混合案例草稿，提供显式恢复；其他素材仅有AI归入结果时显示。样式范围置顶，风格/背景/配色/字感支持当前卡或整组，保留自由卡与最新顺序。自由卡及单卡独立风格的保存协议已本地更新，但现有renderer需部署验证后才能启用，不能仅打开客户端开关。

当前功能分支新增：AI整理完成直接回工作台、其他素材分类、分部位衣物提取提示词及生成后92%等比构图；趣味字画主图点击全屏/横滑、浅灰编号和保存成功后“去微信发送”引导。返回微信仍由用户选择聊天和相册图片，不自动发送。

上述云函数提示词尚未部署；侧拍/遮挡尽量保留款式但不保证隐藏细节准确，真实AI画质和双端真机待验收。自由卡服务能力开关仍按已有门禁关闭，不在本轮部署或切流。
