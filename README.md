# WePicTool 微信小程序

WePicTool 是微信里的穿搭参考图生成工具。当前项目以微信小程序为实际主线，目标是跑通“选图 -> 分组预览 -> 按组保存 -> 回微信发送参考”的阶段一闭环，再逐步接入 AI 分类、抠图和白底卡片生成。

当前版本在阶段二能力基础上，小程序 UI 已升级为底部三 Tab（首页 / 记录 / 我的），结果页采用微信聊天窗口预览风格，让用户提前看到“合并发图”后的真实效果。

## 当前阶段

**阶段二 AI 分类已接入，阶段三待接入抠图与白底卡片生成。**

当前版本包含：

- 首页选择 1-9 张图片。
- 上传前基础压缩。
- 未配置云环境时进入本地预览模式。
- `processOutfit` 云函数支持阶段一 mock 分组和阶段二 AI 分类（DashScope `qwen-vl-plus`）。
- 结果页采用微信聊天窗口预览风格：上衣 / 下装 / 鞋子 / 未处理素材以“合并发图”气泡卡片展示。
- 点击卡片“展开 N”可在当前页展开横向滚动缩略图，左右滑动查看该组全部图片。
- 展开后支持原图 / 白底图切换、改分类、预览大图。
- 底部“一键合并发送”支持分享给朋友、保存全部图片、按分组保存。
- 单张保存、按组保存、相册授权失败引导。
- 结果页「改分类」能力，低置信度图片显示「待确认」角标。
- 处理完成后自动写入本地轻量记录，可在“记录”Tab 查看历史、再次生成。
- “我的”Tab 提供相册权限、反馈、分享、缓存清理等入口。
- 底部三 Tab 导航：首页 / 记录 / 我的。

当前版本不包含：

- 真实抠图 API。
- Sharp/Pillow 白底卡片合成。
- 账号、付费、表情包、心情状态图、日常合集主入口。
- 云端同步的历史记录（本地记录仅保存在当前设备）。

## 文档入口

- [PRD](docs/product/PRD.md)
- [阶段路线](docs/product/stage-roadmap.md)
- [开发行动手册](docs/product/development-playbook.md)
- [技术架构](docs/product/technical-architecture.md)
- [AI 工作流入口](docs/ai-workflows/README.md)
- [阶段化工程整理规格](docs/superpowers/specs/2026-07-07-wepictool-stage-structure-design.md)
- [阶段化工程整理实施计划](docs/superpowers/plans/2026-07-07-wepictool-stage-structure.md)

## 本地测试

1. 用微信开发者工具导入项目根目录：`/Users/Zhuanz/Desktop/WePicTool`
2. 如果还没有真实 AppID，可以先保持占位配置，项目会启用本地预览模式。
3. 点击“编译”，在首页选择 1-9 张图片。
4. 未配置云环境时，小程序会直接使用本地临时图片生成预览分组，方便检查页面流程。

本地预检：

```bash
npm run check:miniprogram
```

纯规则测试：

```bash
npm test
```

语法检查：

```bash
npm run check:syntax
```

## 接入真实云开发

上线或真机完整测试前需要完成这些配置：

1. 在微信公众平台创建小程序并获取真实 AppID。
2. 替换 `project.config.json` 和 `miniprogram/project.config.json` 里的 `appid`。
3. 在微信开发者工具中开通云开发，复制环境 ID。
4. 在 `miniprogram/config/env.js` 中填写 `CLOUD_ENV_ID`。
5. 右键 `miniprogram/cloudfunctions/processOutfit`，选择“上传并部署：云端安装依赖”。
6. 重新编译，选择图片后会走云存储上传和 `processOutfit` 云函数链路。

## 阶段一验收

- 开发者工具“详情”里确认 AppID、基础库版本和云开发环境正确。
- 运行 `npm run check:miniprogram`，确保没有结构性错误。
- 在真机预览中测试选图、上传、结果页展示和保存到相册授权。
- 拒绝相册授权后，确认能引导用户进入设置页。
- 每组少于 3 张时，结果页必须展示降级提醒。
- 在微信公众平台补齐用户隐私保护指引，说明会处理用户选择的图片。

## 目录说明

```text
WePicTool/
├── miniprogram/                    # 微信小程序源码（微信开发者工具编译入口）
│   ├── app.js / app.json / app.wxss / sitemap.json
│   │                                 # 小程序全局入口、页面路由、Tab 配置、全局样式、搜索配置
│   ├── pages/
│   │   ├── index/                    # 首页 Tab：选图入口，调用 wx.chooseMedia
│   │   ├── record/                   # 记录 Tab：本地历史任务列表、查看、再次生成
│   │   ├── profile/                  # 我的 Tab：相册权限、反馈、分享、缓存清理
│   │   └── result/                   # 结果页（非 Tab）：微信聊天预览风格，分组展示与保存
│   ├── assets/
│   │   └── tabbar/                   # 底部 Tab 图标
│   ├── utils/
│   │   └── task.js                   # 阶段一任务规则、mock 分组、发送能力判断
│   ├── cloudfunctions/
│   │   └── processOutfit/            # 云函数：处理穿搭任务，目前返回 mock 分组
│   └── config/
│       └── env.js                    # CloudBase 环境 ID 和本地预览开关
├── src/                              # 原 AI Studio / Vite 演示代码（React + Tailwind）
│                                     # 不是小程序上传必需内容，已被 project.config.json 忽略
├── dist/                             # Vite 构建产物（被小程序上传忽略）
├── docs/                             # 产品文档和 AI 工作流设计
│   ├── product/                      # 产品定义、阶段路线、开发手册、技术架构
│   ├── ai-workflows/                 # AI 提示词、抠图 API 评估、工作流计划
│   └── superpowers/                  # 阶段化工程整理规格与实施计划
│       ├── plans/
│       └── specs/
├── scripts/
│   └── check-miniprogram.mjs         # 小程序上线前本地预检脚本
├── tests/
│   └── task.test.cjs                 # Node 纯规则测试
├── assets/
│   └── .aistudio/                    # AI Studio 相关资源/配置
├── package.json                      # 项目脚本和依赖
├── tsconfig.json / vite.config.ts    # TypeScript 和 Vite 配置
├── project.config.json               # 微信小程序项目根配置（AppID、小程序根目录等）
└── metadata.json                     # AI Studio 项目元数据
```
