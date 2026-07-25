# WePicTool 微信小程序

WePicTool 是微信「合并发送 / 叠图」玩法生成器——穿搭白底卡是旗舰功能，玩法模板库是长期资产。当前项目以微信小程序为实际主线，已跑通穿搭"选图 -> AI 分类抠图 -> 白底卡片 -> 按组保存 -> 回微信合并发送"主链路，后续按 PLAYBOOK.md 扩展玩法模板库。

当前版本小程序 UI 为底部三 Tab（首页 / 记录 / 我的），结果页采用微信聊天窗口预览风格，让用户提前看到"合并发图"后的真实效果。

## 当前阶段

**穿搭主链路已验收；阶段六“大字滑卡”代码已完成，待部署云托管手写渲染服务并做真机验收。定位已升级为叠图玩法生成器，玩法路线见 PLAYBOOK.md。**

当前版本包含：

- 首页选择 1-9 张图片。
- 上传前基础压缩（最长边不超过 1600px）。
- 未配置云环境时进入本地预览模式。
- `processOutfit` 云函数支持阶段一 mock 分组、阶段二 AI 分类（DashScope `qwen-vl-plus`）和阶段三抠图（DashScope `qwen-image-2.0`）。
- 结果页采用微信聊天窗口预览风格：上衣 / 下装 / 鞋子 / 未处理素材以”合并发图”气泡卡片展示。
- 点击卡片”展开 N”可在当前页展开横向滚动缩略图，左右滑动查看该组全部图片。
- 展开后支持原图 / 白底图切换、改分类、预览大图。
- 前端 Canvas 白底卡片合成：1:1 / 4:5 / 3:4 比例切换、分组主体锚点、浅色衣物阴影描边兜底（已实现，待真机验收）。
- 底部”一键合并发送”支持分享给朋友、保存全部图片、按分组保存。
- 单张保存、按组保存、相册授权失败引导。
- 结果页「改分类」能力，低置信度图片显示「待确认」角标。
- 白色微信聊天预览页（`pages/preview`）：会话名「分享给好友」、堆叠卡片、展开/收起、滑动切换；不同生成比例在固定手势舞台内等比适配，底部模拟微信输入栏。
- 处理完成后自动写入本地轻量记录，可在”记录”Tab 查看历史、再次生成。
- “我的”Tab 提供相册权限、反馈、分享、缓存清理等入口。
- 底部三 Tab 导航：首页 / 记录 / 我的。
- 大字滑卡：输入 1–20 个字，默认生成米白手写纸卡；1–2 个字自动补足引导卡，支持夜写与蓝紫主题、保存、微信滑动预览和本地记录。

当前版本暂不包含：

- Sharp/Pillow 后端白底合成（CloudBase 不支持原生 C++ 模块）。
- 剧情滑卡、盲盒抽卡、拼图揭秘、资料打包、翻页动画、成套搭配、滑滑换装等后续玩法模板（路线见 PLAYBOOK.md）。
- 账号、付费、通用表情包工具。
- 云端同步的历史记录（本地记录仅保存在当前设备）。

## 文档入口

- [PRD（产品需求文档）](docs/product/PRD.md)
- [PLAYBOOK（叠图玩法实现手册）](docs/product/PLAYBOOK.md)
- [项目状态](docs/product/PROJECT_STATUS.md)
- [技术方案设计](docs/product/TECHNICAL_SPEC.md)
- [开发指南](docs/product/DEVELOPMENT_GUIDE.md)
- [归档文档](docs/product/ARCHIVED.md)
- [AI 工作流入口](docs/ai-workflows/README.md)

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

### 部署大字滑卡手写服务

大字滑卡不使用 AI 生成文字；它在云托管容器里使用内置的授权手写字体绘制 PNG，并在渲染前调用微信文本安全审核。部署步骤：

1. 打开 CloudBase 控制台，进入当前环境的“云托管”，新建服务 `text-card-renderer`。
2. 选择“本地代码部署”，目录选择 `miniprogram/cloudhosting/text-card-renderer/`；控制台会按其中的 `Dockerfile` 远程构建，因此本机无需安装 Docker。
3. 给服务账号开通文本内容安全审核和云存储读写权限；部署后复制服务 HTTPS 地址。
4. 在 `miniprogram/config/env.js` 填入 `TEXT_CARD_RENDERER_URL`（不带结尾 `/`），并在小程序后台把该 HTTPS 域名加到 request 合法域名。
5. 真机分别生成一组正常文字和一组应被拦截的文字：前者应返回完整 PNG 卡片，后者必须停留在编辑页且不写入记录。

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
│   │   ├── bigtext/                  # 大字滑卡编辑页：文字、主题与云托管请求
│   │   ├── template-result/          # 大字滑卡结果页：保存、预览和记录
│   │   ├── record/                   # 记录 Tab：本地历史任务列表、查看、再次生成
│   │   ├── profile/                  # 我的 Tab：相册权限、反馈、分享、缓存清理
│   │   ├── result/                   # 结果页（非 Tab）：白色聊天风格，分组展示、保存、改分类
│   │   └── preview/                  # 微信预览页（非 Tab）：深色微信聊天风格，堆叠卡片、滑动切换
│   ├── assets/
│   │   └── tabbar/                   # 底部 Tab 图标（home/record/profile 各 2 个状态）
│   ├── utils/
│   │   └── task.js                   # 任务规则、mock 分组、发送能力判断、图片尺寸计算
│   ├── cloudfunctions/
│   │   └── processOutfit/            # 云函数：AI 分类（qwen-vl-plus）+ 抠图（qwen-image-2.0）
│   ├── cloudhosting/
│   │   └── text-card-renderer/       # 云托管：内容审核 + 手写字体 PNG 渲染
│   └── config/
│       └── env.js                    # CloudBase 环境 ID 和本地预览开关
├── src/                              # 原 AI Studio / Vite 演示代码（React + Tailwind）
│                                     # 不是小程序上传必需内容，已被 project.config.json 忽略
├── dist/                             # Vite 构建产物（被小程序上传忽略）
├── docs/                             # 产品文档和 AI 工作流设计
│   ├── product/                      # PRD、项目状态、技术方案、开发指南、归档文档
│   └── ai-workflows/                 # AI 提示词、抠图 API 评估、抠图提示词、工作流计划
├── scripts/
│   ├── check-miniprogram.mjs         # 小程序上线前本地预检脚本
│   ├── test-dashscope.cjs            # DashScope 分类 API 本地测试
│   └── test-matting.cjs              # DashScope 抠图 API 本地测试
├── tests/
│   └── task.test.cjs                 # Node 纯规则测试
├── ui-reference/                     # UI 设计参考图（9 张截图，非小程序上传内容）
├── assets/
│   └── .aistudio/                    # AI Studio 相关资源/配置
├── package.json                      # 项目脚本和依赖
├── tsconfig.json / vite.config.ts    # TypeScript 和 Vite 配置
├── project.config.json               # 微信小程序项目根配置（AppID、小程序根目录等）
└── metadata.json                     # AI Studio 项目元数据
```
