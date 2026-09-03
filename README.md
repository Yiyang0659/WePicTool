# WePicTool 微信小程序

WePicTool 是微信「合并发送 / 叠图」玩法生成器——分层云换装是当前功能分支的旗舰玩法，玩法模板库是长期资产（详见 [`docs/product/PLAYBOOK.md`](docs/product/PLAYBOOK.md)）。当前项目以微信小程序为实际主线；源码与自动化已覆盖穿搭「选图 -> 压缩 -> 安全审查 -> AI 分类抠图 -> 前端 Canvas 白底卡片合成 -> 微信折叠预览 -> 按组保存 -> 回微信合并发送」主链路，并在功能分支集成分层云换装的本地编辑和四叠预览底座。

当前证据边界：趣味字画阶段一与 P2.2 实验只有代码和自动化结果；Docker 镜像、CloudBase 部署、线上端点、微信开发者工具、iOS、Android 和真实微信聊天均未验证，功能也尚未合并或发布。

小程序 UI 采用底部三 Tab 架构（首页 / 记录 / 我的），结果页与预览页采用沉浸式微信聊天窗口风格，让用户提前预演多图合并发送后的真实叠图折叠效果。

---

## 当前阶段与产品特性

实时项目状态与近期优先级分别以 [`docs/current.md`](docs/current.md) 和 [`docs/roadmap.md`](docs/roadmap.md) 为准；本说明提供项目全景入口与运行指南。

### 当前已实现特性

- **首页选图与压缩**：支持选择 1–9 张衣物/鞋子图片，上传前自动进行等比压缩（最长边不超过 1600px）。
- **分层云换装（功能分支）**：支持内置纸娃娃素材直接试玩或按部位上传，按头像/发型、上衣、下装、鞋子四组独立排序、预览和保存；真机验收尚未完成。
- **趣味字画输入与三套候选（功能分支代码）**：首页展示五张包内静态示例牌堆；输入页提供一句话与组合表达标签，文案经 `contentGuard` 审核后进入三套独立可滑候选页，支持「用这套」、「自己改改」与「再来三套」；Canvas 失败时调用云托管 `/preview-stack` 降级为服务端低清图，不使用系统字体回退。入口可由 `ENABLE_FUN_TEXT_STACK_ENTRY` 紧急关闭，同时保留首页静态示例。
- **趣味字画轻编辑与高清结果（功能分支）**：轻编辑页聚焦提供「改文字」、「换整叠风格」与「调整顺序」；通用结果页（`pages/template-result`）自动调用云托管输出 1080 高清 PNG、写入本地历史任务、支持深色微信牌堆全屏预演（`pages/preview`）与顺序断点续存，保存完成提供明确的微信四步发送指引。
- **趣味字画本地记录与旧记录兼容（功能分支）**：记录页支持「趣味字画」分类展示与任务重开，历史大字滑卡记录展示友好升级引导与重新制作入口；提供完整的云托管部署指南（`docs/deployment/fun-card-renderer.md`）与自动化配置预检。
- **P2.2 AI 故事规划器（计划外实验代码）**：分支含 `planFunTextStory`、结构化候选校验/单次修复、客户端规则降级与本地模拟测试；它不在已确认的阶段一计划交付范围内，发布范围尚未确认，云函数部署、模型 API key、线上域名和真机链路仍待办。
- **本地/云端双模式**：未配置云环境时自动启用本地 Mock 预览模式；配置后走云存储与云函数链路。
- **内容安全防御门**：集成 `contentGuard` 云函数与微信安全接口，对文本与图片进行合规安全审查。
- **AI 智能分类与抠图**：`processOutfit` 云函数接入阿里云 DashScope，使用 `qwen-vl-plus` 进行品类识别（上衣/下装/鞋子/其他），使用 `qwen-image-edit-plus` 进行主体抠图。
- **前端 Canvas 白底卡合成**：`utils/cardComposer.js` 提供 1:1 / 4:5 / 3:4 多比例合成、品类视觉重心锚点对齐、浅色衣物微阴影与描边兜底。
- **微信聊天风结果页**（`pages/result`）：白色微信聊天气泡展示分组卡片，支持展开横滑缩略图、原图/白底图切换、改分类、大图预览。
- **微信发送效果全屏预览**（`pages/preview`）：深色全屏聊天风格，50% 舞台比例等比适配，支持扑克牌 3D 堆叠手势滑卡切换与纵向展开。
- **微信叠图发送能力判定**：`utils/task.js` 自动判定分组是否达到微信 $\ge 3$ 张叠图阈值，不足时提供降级提示。
- **一键合并发送与保存**：支持一键保存全部、按分组批量保存到系统相册，并附带相册授权引导。
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

# 2.1 发布严格预检（本地 localhost/占位配置会按预期非零退出）
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
│   │   ├── index/                    # 首页 Tab：选图入口 (wx.chooseMedia)、分层云换装与趣味字画示例
│   │   ├── fun-text/                 # 趣味字画输入页：一句话 + 组合表达标签
│   │   ├── fun-text-candidates/      # 趣味字画候选页：三套独立可滑牌堆、用这套、自己改改、再来三套与低清降级
│   │   ├── fun-text-editor/          # 趣味字画轻编辑页：改本卡文字、整叠换风格、调整顺序（首张微信封面）
│   │   ├── template-result/          # 趣味字画/通用模板结果页：高清渲染、微信预演、按序保存与发送引导
│   │   ├── dressup/                  # 分层云换装：素材编辑、排序、分组保存
│   │   ├── result/                   # 结果页：白色聊天气泡、分组卡片、Canvas 合成、改分类
│   │   ├── preview/                  # 预览页：深色微信聊天全屏预演、扑克牌堆叠、滑卡切换
│   │   ├── record/                   # 记录 Tab：本地历史任务列表、相对日期聚合、再次生成
│   │   └── profile/                  # 我的 Tab：相册权限、缓存清理、反馈与隐私说明
│   ├── cloudfunctions/               # 微信云开发云函数
│   │   ├── processOutfit/            # 穿搭 AI 分类 (qwen-vl-plus) 与抠图 (qwen-image-edit-plus)
│   │   ├── contentGuard/             # 内容安全审查云函数 (msgSecCheck)
│   │   └── planFunTextStory/         # P2.2 实验：AI 结构化故事规划与二次审核
│   ├── cloudhosting/
│   │   └── fun-card-renderer/         # Node 20/bookworm-slim + node:http 渲染、字体与二次审核服务
│   └── utils/                        # 前端核心工具库
│       ├── task.js                   # 任务模型、Mock 数据、叠图能力 (buildSendability) 判定
│       ├── layeredDressup.js          # 分层云换装项目模型与编辑规则
│       ├── imageExporter.js          # 共享图片解析与顺序下载/保存相册工具，支持断点续存
│       ├── cardComposer.js           # 前端 Canvas 白底卡排版合成引擎 (1:1/4:5/3:4, 阴影描边)
│       └── previewLayout.js          # 预览页 50% 宽度手势舞台比例计算
├── docs/                             # [项目大脑] 治理体系与知识库
│   ├── current.md                    # 当前阶段、活跃分支、阻塞项与下一步（唯一事实源）
│   ├── roadmap.md                    # 优先级路线图 (P0~P5) 与进入条件
│   ├── decisions.md                  # 架构、技术与产品关键决策库
│   ├── governance.md                 # 开发与文档同步治理规则
│   ├── changelog.md                  # 用户可感知的功能变更日志
│   ├── product/                      # 产品核心文档
│   │   ├── PRD.md                    # 产品需求文档
│   │   ├── PLAYBOOK.md               # 叠图玩法实现手册 (微信平台事实与统一叠图管线)
│   │   └── TECHNICAL_SPEC.md         # 架构与技术规格说明书
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
│   └── layered-dressup-mvp/          # 分层云换装 MVP，待集成与真机验收
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
6. 需要联调趣味字画时，按 [`docs/deployment/fun-card-renderer.md`](docs/deployment/fun-card-renderer.md) 部署云托管服务：生产 POST 只通过 `wx.cloud.callContainer` 和 `X-WX-SERVICE` 调用，关闭服务公网入口；HTTPS HTTP 网关只公开字体精确路径。配置 `FUN_CARD_RENDERER_SERVICE`、字体域名 `FUN_CARD_RENDERER_URL` 和入口 flag，客户端不得传 OpenID 或任何秘密。
7. 如评估后决定验证 P2.2，再单独部署 `planFunTextStory` 并配置服务端模型 API key；当前尚未完成这一步，也未确认它属于发布范围。
8. 运行 `npm run check:miniprogram:release` 后再进入微信开发者工具、iOS、Android 与真实聊天验收。当前分支的页面、渲染、保存和记录链路只有代码/自动化证据，不代表线上或真机已通过。

---

## 核心文档索引

- 📋 **产品需求**：[`docs/product/PRD.md`](docs/product/PRD.md)
- 🎮 **叠图玩法手册**：[`docs/product/PLAYBOOK.md`](docs/product/PLAYBOOK.md)
- 📐 **技术方案设计**：[`docs/product/TECHNICAL_SPEC.md`](docs/product/TECHNICAL_SPEC.md)
- 📍 **当前状态**：[`docs/current.md`](docs/current.md)
- 🗺️ **路线图与优先级**：[`docs/roadmap.md`](docs/roadmap.md)
- ✍️ **趣味字画设计**：[`docs/superpowers/specs/2026-08-31-fun-text-stack-design.md`](docs/superpowers/specs/2026-08-31-fun-text-stack-design.md)
- ⚖️ **关键决策库**：docs/decisions.md
- 📜 **治理与同步规范**：[`docs/governance.md`](docs/governance.md)
