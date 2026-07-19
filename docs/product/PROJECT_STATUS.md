# WePicTool 项目状态

**更新日期：** 2026-07-18

---

## 1. 当前阶段

**阶段三：白底卡片生成** — 进行中

> 产品定位已于 2026-07-18 升级为"微信叠图玩法生成器"，玩法实现口径见 `PLAYBOOK.md`。

- 阶段一工程骨架：已完成
- 阶段二 AI 分类：已完成
- 阶段三抠图：已接入（DashScope qwen-image-2.0）
- 阶段三白底卡片合成：前端已实现（Canvas），待真机验收

---

## 2. 阶段进度

| 阶段 | 状态 | 关键交付物 | 验收重点 |
| --- | --- | --- | --- |
| 阶段零：开发前准备 | 已完成 | CloudBase 环境、DashScope API 密钥 | 云函数可调用、真机可保存相册 |
| 阶段一：最小闭环 | 已完成 | 选图/压缩/上传/mock 分组/结果页/保存 | 选 1-9 张图可进入结果页，单张保存和按组保存可用 |
| 阶段二：图片部件识别 | 已完成 | DashScope qwen-vl-plus 分类，用户可手动修改分类 | 高置信度自动分组，低置信度可人工确认 |
| 阶段三：白底卡片生成 | 进行中 | DashScope qwen-image-2.0 抠图已接入，前端 Canvas 白底合成已实现（待真机验收） | 白底结果可保存，浅色衣物可辨认，单张失败不阻断 |
| 阶段四：结果页增强 | 未开始 | 微信叠图效果预览、单组滑动、保存引导增强 | 每组不足 3 张时清晰降级提示 |
| 阶段五：轻编辑与兜底 | 未开始 | 改分类（已完成）、删除、重做、排序、切比例、埋点 | 用户不用重新开始即可修正错误 |

---

## 3. 当前阻塞

| 阻塞项 | 原因 | 解决方向 |
|--------|------|---------|
| 阶段三真机验收 | 前端 Canvas 白底合成已实现，尚未真机验证 | 按 DEVELOPMENT_GUIDE 阶段三验收标准真机过一遍（iOS + Android） |

---

## 4. 已完成功能

### 阶段一（最小闭环）

- [x] 未配置 CloudBase 时，本地预览模式能进入结果页
- [x] 配置 CloudBase 后，图片能上传到云存储
- [x] `processOutfit` 云函数能返回 mock 分组
- [x] 结果页能展示上衣组、下装组、鞋子组和未处理素材区
- [x] 每组少于 3 张时展示降级提醒
- [x] 保存单张图片成功（需真机验证）
- [x] 保存当前组成功（需真机验证）
- [x] 拒绝相册授权后能引导到设置页（需真机验证）

### 阶段二（AI 分类）

- [x] 云函数接入 DashScope `qwen-vl-plus` 多模态模型进行真实分类
- [x] `confidence >= 0.8` 自动分组，`confidence < 0.8` 前端显示「待确认」角标
- [x] 结果页支持「改分类」，用户可手动将图片移至其他分组
- [x] 低置信度图片点击「改分类」时提示 AI 置信度较低
- [x] 分类提示词已优化，增加 few-shot 示例，减少商品图误判为 `daily`
- [x] 图片从云存储下载后转 base64 传给 DashScope，解决 `url error` 400 问题

### 阶段三（抠图 + UI 改版）

- [x] 云函数接入 DashScope `qwen-image-2.0` 做抠图，去除背景替换为纯白
- [x] 抠图结果上传到云存储 `matted/` 目录，前端可切换查看原图/白底图
- [x] 抠图失败的图片保留原图，不影响整批结果
- [x] 确认 CloudBase 不支持 `sharp` 等原生模块（错误码 145），白底卡片合成改为前端 Canvas 方案
- [x] UI 改版：底部三 Tab（首页 / 记录 / 我的）
- [x] 结果页 `pages/result` 恢复为白色微信聊天风格
- [x] 新增 `pages/preview`：深色全屏微信聊天预览页，堆叠卡片 + 展开/收起 + 滑动切换
- [x] 本地轻量记录（`pages/record`）支持查看历史、再次生成

---

## 5. 待完成功能

### 阶段三剩余

- [x] 前端 Canvas 实现白底卡片合成（比例统一、主体居中、浅色衣物兜底）— 已实现，待真机验收
- [ ] 白底卡片保存到相册验证（真机）
- [x] 支持 1:1 / 4:5 / 3:4 比例切换 — 已实现，待真机验收

### 阶段四（结果页增强）

- [ ] 编号标注（给同组图片加轻量角标，方便朋友反馈"上衣 1 + 下装 2"）
- [ ] 保存引导增强

### 阶段五（轻编辑与兜底）

- [ ] 删除单张
- [ ] 单张重做
- [ ] 组内排序
- [ ] 切换比例（1:1 / 4:5 / 3:4）
- [ ] 切换底色与可见性
- [ ] 埋点（task_created、classification_completed、category_changed、task_completed、group_saved、result_saved、share_guide_clicked、retry_triggered）

---

## 6. 历史更新

| 日期 | 更新内容 |
|------|---------|
| 2026-07-08 | 阶段一闭环完成：AppID、CloudBase 环境配置，基础上传/保存链路跑通 |
| 2026-07-09 | 阶段二 AI 分类接入：DashScope qwen-vl-plus，支持改分类，本地测试脚本 `scripts/test-dashscope.cjs` |
| 2026-07-12 | 阶段三抠图接入 + UI 改版：qwen-image-2.0 抠图，白色结果页 + 深色预览页，确认 CloudBase 不支持 sharp |

---

## 7. 最新更新日志

> 本区块记录每次迭代的上下文，供新窗口快速了解上次做了什么。

### 2026-07-19（微信预览白底动效 + 比例安全适配）

- **做了什么：** 按用户提供的真实微信聊天视频和确认的交互原型，重做 `pages/preview` 的外壳与动效口径：会话名改为「分享给好友」、状态栏/消息时间固定为 12:00、聊天背景/导航/输入栏统一白色，移除提示条、主题切换与模拟对话气泡。牌堆手势舞台收至屏宽 50% 且固定高度，三组折叠态可在典型手机一屏中同时看到；后两张卡改为左右露角。新增 `utils/previewLayout.js` 和 Node 测试：优先读取合成比例、回退到任务比例或源图尺寸，所有卡片在固定舞台内 `aspectFit`，不同生成比例或原图兜底均不裁切、不拉伸、不挤压聊天流。滑动阈值降至 20% 卡宽或 0.28px/ms，回弹/补位使用 240ms 更柔和曲线，展开改为 220ms + 45ms stagger。
- **改了哪些文件：** `miniprogram/utils/previewLayout.js`（新增）、`tests/preview-layout.test.cjs`（新增）、`pages/preview/preview.js/.wxml/.wxss`、`docs/product/TECHNICAL_SPEC.md`、本文件。
- **关键决策：** 卡片图片比例与手势舞台解耦：每组消息行尺寸稳定，单张卡在舞台内等比居中，翻页不因图片比例变化发生布局跳动；展开以当前已滑到的顶层卡为首张，固定三节点与原有 eventChannel、保存、长按、viewer 契约保持不变。
- **下一步：** 微信开发者工具与 iOS/Android 真机对照用户视频验收三组同屏、不同图片比例、慢拖回弹、快速飞出、连续循环与展开/收起手感；阶段三真机验收仍是阻塞项。

### 2026-07-19（微信预览卡片放大 + 展开无白屏）

- **做了什么：** 按验收反馈将 `pages/preview` 的稳定舞台由 50vw/112px 提升至 54vw/150px，消息行同步增至 164px，卡片在 375px 屏幕的最大视觉尺寸约提升三分之一，并允许第三组在小屏首屏自然露出后继续滚动。展开胶囊移动至更贴近卡组的位置。
- **关键修复：** 展开/收起前的白底闪烁根因是 `wx:if` / `wx:else` 在两种状态间销毁、重建 `<image>`；现在折叠牌堆、展开首卡与其余卡片在页面首次渲染时均保留节点，切换只改变 `hidden` 和动画 class，同时关闭预览图懒加载，避免用户点击后重新解码图片。
- **验证范围：** Node 回归测试覆盖放大后的舞台尺寸及 WXML 节点常驻约束；仍需在微信开发者工具和 iOS/Android 真机中检查实际图片量较大时的内存与首次预加载耗时。

### 2026-07-19（品牌定名「滑一叠」+ 新手引导方案调研）

- **做了什么：** ① 小程序定名「滑一叠」（经四轮命名 swarm 交叉查重确定，发音 huá-yī-dié 有记忆点，"一叠图滑着看"即产品本身）。用户可见文案全部替换：app.json/index.json 导航标题、首页品牌区、结果页自定义导航、我的页「关于」菜单/页脚/关于弹窗（描述重写为叠图玩法口径）、隐私说明、三处分享标题（统一为"我刚用滑一叠做了一叠穿搭卡片，快来滑着帮我挑！"）、sitemap 描述、云函数 package.json。仅 `project.config.json` 的 `projectname: "WePicTool"` 保留（开发者工具本地项目标识，不影响用户）。check:syntax、check:miniprogram 均通过。② 完成新手引导市场调研（剪映剪同款/美图配方/妙鸭/多多果园/群接龙等案例），核心结论：把"朋友滑着看"的瞬间搬到小程序内（首屏仿真演示 + 示例一键体验 + 结果页朋友视角预览 + 保存后发送引导气泡）。
- **改了哪些文件：** miniprogram/app.json、sitemap.json、pages/index/index.json/.wxml、pages/result/result.wxml/.js、pages/preview/preview.js、pages/profile/profile.js/.wxml、cloudfunctions/processOutfit/package.json；本文件。
- **关键决策：** 中文主名「滑一叠」，WePicTool 仅作开发代号；分享话术全部围绕"滑着挑"强化接收端动作。
- **下一步：** ① 微信认证提交名称「滑一叠」（备选：画一叠 → 发一叠）；② 按调研结论排期新手引导优化（首屏演示 GIF / 示例体验入口 / 发送引导气泡）；③ 阶段三真机验收仍是阻塞项。

### 2026-07-19（抠图模型切换 wanx-v1 试用）

- **做了什么：** 应用户要求，云函数 `processOutfit` 抠图模型由 `qwen-image-2.0` 改为 `wanx-v1`，并支持环境变量 `DASHSCOPE_MATTING_MODEL` 覆盖（不改代码即可换模型/回退）。新增 `scripts/test-wanx.cjs`：与云函数 mattingImageWithDashScope 完全一致的请求形态（multimodal-generation 端点 + base64 图 + 抠图提示词），用于本地验证连通性。分类模型 qwen-vl-plus 未动。语法检查通过；本地无 DASHSCOPE_API_KEY（仅存于云函数环境变量），实际 API 验证待用户配合。
- **改了哪些文件：** miniprogram/cloudfunctions/processOutfit/index.js、scripts/test-wanx.cjs（新增）；本文件。
- **关键决策 / 风险：** wanx-v1（通义万相文生图）官方口径走 text2image image-synthesis 异步任务 API，与当前 multimodal-generation 同步端点可能不兼容——若测试报 InvalidModel 类错误，需改用万相专用端点或回退 qwen-image-2.0（设 `DASHSCOPE_MATTING_MODEL=qwen-image-2.0` 即可，无需改代码）。
- **下一步：** ① 本地：`DASHSCOPE_API_KEY=sk-xxx node scripts/test-wanx.cjs` 验证；② 云端：开发者工具重新「上传并部署」processOutfit 后跑全链路真机验收。

### 2026-07-19（验收修复：👗图标 / 记录重复 / 预览页交互）

- **做了什么：** 按用户验收反馈修三处。① 裙子 emoji 全清：record.js TYPE_META outfit 👗→👕（与结果页上衣组一致）、profile.wxml 关于弹窗 logo 👗→🖼️。② 记录重复 bug：result.js `saveRecordToStorage` 写入前按 taskId 去重（已存在同 taskId 的 taskSnapshot 直接跳过，不新增不挪位；「再次生成」走 createMockTask 新 taskId 不受影响），根因是 `hasSavedRecord` 仅页实例级防抖，从记录页打开旧快照被当成新任务重写一条。③ 预览页三问题：默认主题 dark→light（白色背景，暗色保留为可切换）；返回键失灵根因是 `.wx-nav .name` 的 `margin-left:-18px` 视觉居中 hack 盖住 20px 宽返回键——改为 back/dots 对称定宽 44px + 标题 flex:1 居中 + 返回键热区扩至 44px×全高，JS 加页面栈兜底；主题切换胶囊被系统胶囊（···⊙）压住右半——改为锚定提示条左缘绝对定位；另修展开态长按后补发 tap 误开大图（长按后 500ms 内吞掉 tap）。§12.6 手势/视觉契约（58% 卡宽、扇形露边、跟手旋转、阈值飞出、stagger、方向锁动态 scroll-y）全部保留。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/pages/result/result.js、pages/record/record.js、pages/profile/profile.wxml、pages/preview/preview.js/.wxss；本文件。
- **关键决策：** 记录去重以 taskId 为唯一键而非 recordId/时间戳；预览页亮色为默认（用户口径"背景改为白色"），暗色不删仅作切换项。
- **下一步：** 真机核对：记录页查看往返不再重复、预览页返回/主题切换/长按手势；阶段三真机验收仍是阻塞项。

### 2026-07-19（抠图模型批量实测：默认切 qwen-image-edit-plus）

- **背景：** 用户反馈生图仍全是「已用原图」。排查确认代码默认已是 `qwen-image-edit`，但线上疑似未重新部署，或云函数环境变量 `DASHSCOPE_MATTING_MODEL` 仍残留 `wanx-v1`（该变量优先级高于代码默认值）。
- **实测（新增 `scripts/test-matting-models.cjs` 批量对比，真实 API Key、与云函数同请求形态、浅色 T 恤商品图）：** `qwen-image-edit` ✅(17.5s)、`qwen-image-edit-plus` ✅(7.0s)、`qwen-image-2.0-pro` ✅(14.8s)、`qwen-image-2.0` ✅(5.1s)、`qwen-image-edit-plus-2025-11-25` ❌(400 Model not exist)。四张结果图目检均去背干净、纯白底、浅色衣物轮廓完整。
- **默认模型切换：** `qwen-image-edit` → `qwen-image-edit-plus`——速度快 2.5 倍（7s vs 17.5s，9 张批量时显著降低云函数超时风险）、免费额度满额 100/100、质量相当。
- **改了哪些文件：** `miniprogram/cloudfunctions/processOutfit/index.js`（默认模型 + 注释强调环境变量优先级陷阱）、`scripts/test-matting-models.cjs`（新增批量测试脚本）、`scripts/test-wanx.cjs`（默认模型对齐）、`.gitignore`（忽略测试输出目录）、`docs/product/TECHNICAL_SPEC.md`（新增附录 B「抠图模型备选清单」，含各模型耗时/额度/切换方法，供额度不足时换模型参考）；本文件。
- **下一步：** ① 开发者工具检查 processOutfit 环境变量，若 `DASHSCOPE_MATTING_MODEL=wanx-v1` 则删除；② 重新「上传并部署」processOutfit；③ 真机全链路验收（阶段三阻塞项）。

### 2026-07-19（抠图模型修复：wanx-v1 → qwen-image-edit）

- **背景：** 真机验收发现所有卡片均显示「已用原图」——分类正常（分组正确），抠图全部失败走兜底。
- **根因：** 当日早些时候应用户要求把抠图模型切换为 `wanx-v1`，但 wanx-v1 是文生图模型，官方走 text2image image-synthesis 异步任务 API，与云函数使用的 multimodal-generation 同步端点不兼容。本地 `scripts/test-wanx.cjs` 实测：wanx-v1 报 400 `InvalidParameter: url error`。
- **实测结论（同请求形态、真实 API Key）：** `qwen-image-edit` ✅、`qwen-image-edit-plus` ✅、`qwen-image-2.0` ✅、`qwen-image-2.0-pro` ✅、`wanx-v1` ❌。结果图已下载目检，去背干净、纯白底。
- **额度考量：** 百炼免费额度页显示 `qwen-image-2.0` 仅剩 10/100（账号开了 FreeTierOnly，耗尽即 403）；`qwen-image-edit` 剩 99/100，`qwen-image-edit-plus` 剩 100/100，故默认选 `qwen-image-edit`。
- **改了哪些文件：** `miniprogram/cloudfunctions/processOutfit/index.js`（默认模型改 qwen-image-edit + 抠图失败日志补齐 DashScope 状态码/响应体，与分类阶段对齐）、`scripts/test-wanx.cjs`（默认模型与文案对齐）；本文件。
- **下一步：** 开发者工具重新「上传并部署」processOutfit 后真机全链路验收；额度告警时可用环境变量 `DASHSCOPE_MATTING_MODEL=qwen-image-edit-plus` 无部署切换。

### 2026-07-19（品牌图标 + tabBar 图标 + 确认页可编辑）

- **做了什么：** 按用户验收反馈做三处修正。① 首页品牌区图标由 👗（电商衣橱感）改为 CSS 绘制的三卡扇形叠图小图标（淡主色底卡 ×2 + 渐变顶卡），贴合"微信叠图"定位。② tabBar 三 tab 补齐真实图标：脚本 `scripts/gen-tabbar-icons.py`（PIL 4x 超采样）生成 home/record/profile 线条图标各两套（#999 常态 + #4f6bf5 选中），替换原纯色占位方块；`app.json` 的 `selectedColor` 由微信绿 `#07C160` 改为主色 `#4f6bf5` 与新设计统一。③ 确认页缩略图网格新增「添加图片」虚线卡（未满 9 张显示，点击 `onAddMedia` 追加选图，count 动态 = 9 − 已选数）+ 每张缩略图右上角 × 移除角标（`onRemoveImage`，删空自动回退 home 步骤），确认阶段可直接增删编辑已选图片。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/pages/index/index.js/.wxml/.wxss、miniprogram/app.json、miniprogram/assets/tabbar/*.png（6 枚重新生成）、scripts/gen-tabbar-icons.py（新增）；本文件。
- **关键决策：** 品牌图标用 CSS 形状而非 emoji——现有 emoji 无"叠图"语义，CSS 三卡叠放与结果页牌堆语言一致且零素材依赖；tabBar 图标自制线条风（房子/叠卡/人像），避免外部素材版权与风格不统一。
- **下一步：** 开发者工具核对品牌图标、tabBar 图标与确认页增删交互；阶段三真机验收仍是阻塞项。

### 2026-07-19（三 Tab 页重设计：首页/记录/我的）

- **做了什么：** 依据 `ui-reference` 参考图与结果页设计语言，完成三个 tab 页 UI 重设计。统一设计 token：页面底 `#f6f6f8`、白卡圆角 24rpx、唯一渐变 `#4f6bf5→#6a3df0` 仅用于主 CTA、徽标胶囊、emoji 图标。① 首页：品牌区 + 渐变旗舰主卡「穿搭叠图」（接原 onChooseMedia）+ 玩法模板 2 列宫格 ×7（大字滑卡/剧情滑卡/盲盒抽卡/拼图揭秘/翻页动画/成套搭配/滑滑换装，灰态「即将上线」占位，data.comingModules 数据驱动，点击 toast 敬请期待）+ 工具位「资料打包」+「怎么玩」说明卡；confirm 步骤逻辑原样保留仅套 token。② 记录页：新增按功能类型分类架构——TYPE_META 九类映射、分类 tab 数据驱动（全部 + 记录中实际出现的类型，随新玩法上线自动点亮）、记录卡按类型展示不同摘要（outfit 分组 tag / 其他回退「一叠 N 张」+ 摘要容错）、补回「清空」入口、空态改圆图标 + 渐变 CTA。③ 我的页：用户白卡（渐变头像 + 复制 ID + 「已生成 N 次」徽标，N 读 wepictool_records）+ 玩法预告提示卡 + 「功能」「设置与支持」两组菜单行卡。全部逻辑契约（eventChannel、storage key、跳转路径、方法名、比例/分组 key）逐条保留。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/pages/index/index.js/.wxml/.wxss、pages/record/record.js/.wxml/.wxss、pages/profile/profile.js/.wxml/.wxss/.json（index.json、record.json 未动）；新增 plan.md；本文件。
- **关键决策：** 首页宫格一次搭满 7 玩法 + 1 工具位，后续版本只做「点亮」状态不做改版；记录分类 tab 只展示数据中实际存在的类型，未上线玩法不占位；旧记录无 type 字段默认归 outfit，写入侧（result.js）暂未加 type 字段，待阶段六新玩法接入时补充。
- **下一步：** 开发者工具本地预览核对三页视觉（首页宫格/记录分类 tab/我的徽标）；阶段三真机验收仍是阻塞项。

### 2026-07-18（叠图预览 1:1 规格标定）

- **做了什么：** 依据真机暗色模式录屏（`ui-reference/wx-merge-real-demo.mp4`）完成微信折叠卡 1:1 还原规格标定，并产出可交互高保真原型（Blueprint Widget「WePicTool 三屏原型」widget_7a0db4d4：确认页选比例 → 分组结果页 → 1:1 微信预览，默认暗色可切亮色）。规格已写入 PLAYBOOK §3.4（产品口径）与 TECHNICAL_SPEC §12.6（技术契约：状态机、结构/手势/动画参数表、主题配色、小程序实现口径、真机验收对照清单）；PLAYBOOK §4.1 补充确认页比例前置（处理前选、默认 4:5、结果页可补救切换不重抠）与「其他素材」组规则。
- **改了哪些文件：** docs/product/PLAYBOOK.md、docs/product/TECHNICAL_SPEC.md、docs/product/PROJECT_STATUS.md；原型 Widget index.html（widget workspace，不进仓库）。
- **关键决策：** 纠正早期原型 4 处与真微信不符的结构——「展开 N」胶囊悬浮在卡片左侧聊天背景区（非卡片上）、牌堆向右扇形露边（+8/+16px、scale .97/.94）、删除层叠角标与页码、卡宽 58% 圆角 12px；手势定为方向锁 + 跟手旋转 ±6°、阈值 25% 卡宽或 0.3px/ms、飞出 220ms ease-in 循环入尾；三张牌堆卡为固定节点只轮转位置 class（内容不变，天然循环）。
- **下一步：** ~~按 §12.6 重写 `pages/preview`~~（已于当日完成，见下条）；真机并排对照 §12.6 验收清单逐项过；阶段三真机验收仍是阻塞项。

### 2026-07-18（确认页 + 分组结果页实现完成）

- **做了什么：** 编码代理按三屏原型（`ui-reference/wx-stack-prototype.html`，用户已验收）实现小程序的 ①② 两屏。① 确认页：index 页内步骤切换（step: home/confirm），选图后、上传前展示 4 列缩略图 + 比例分段控件（1:1/4:5/3:4 默认 4:5）+「开始处理」，比例随 task 经 eventChannel 流入结果页首次合成（历史快照兜底 4:5），并加「重新选择」退路。② 结果页：整体从白色聊天风格改为分组卡片布局——顶部提示卡、四组卡片（组名+张数+徽标：≥3 绿标「适合微信叠图」/不足 3 灰标/其他素材固定灰标「不进入穿搭叠图」）、横向缩略图带 01/02 编号角标、穿搭组整组保存、其他素材组仅说明+单图保存、底部固定栏（比例 chip + 微信预览 + 保存全部）。既有逻辑全部保留（cardComposer 串行+取消、displayUrl 模式、比例切换重合成、重做、改分类、编号保存、eventChannel 契约）；保存后发送引导从 toast 升级为 modal（教勾选「发送后合并展示」）。移除聊天气泡布局、旧 action sheet 和三个「开发中」占位按钮。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/pages/index/index.js/.wxml/.wxss、pages/result/result.js/.wxml/.wxss（preview、cloudfunctions、cardComposer 未动）。
- **关键决策 / 偏差：** 确认页「其他素材」提示为静态文案（分类在上传后发生，无法预知数量）；缩略图保留「原图/改分类/重做」小字入口（原型只有保存单图）；缩略图画框固定 4:5，比例切换只影响合成卡内容。
- **下一步：** 开发者工具本地预览模式跑「选图 → 确认比例 → 分组卡片 → 微信预览」全链路核对视觉；然后连同 §12.6 清单一起做真机验收（阶段三阻塞项）。

### 2026-07-18（pages/preview 1:1 重写完成）

- **做了什么：** 编码代理按 TECHNICAL_SPEC §12.6 全量重写 `miniprogram/pages/preview/`（js/wxml/wxss）：固定三节点牌堆位置轮转、方向锁手势（动态切换 scroll-view scroll-y 替代 catchtouchmove，行为等价）、跟手旋转 ±6°、阈值 25% 卡宽或 0.3px/ms、飞出循环入尾无限翻、左侧悬浮「展开 N / 收起」胶囊、展开独立消息行 stagger 40ms、黑底 viewer、两态长按 wx.showActionSheet（保存全部走队列下载 + 授权引导）、默认暗色可切亮色。eventChannel 契约对 result.js 零破坏（兼容原 `{ task: { taskId, groups, ratio } }`，并新增 §12.6 直连形态识别）。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/pages/preview/preview.js/.wxml/.wxss（其他文件未动）。
- **关键决策 / 偏差：** ① 方向锁后用动态 scroll-y 锁定纵向滚动（WXML 事件绑定类型静态，无法中途切 catch）；② N>3 的组折叠态只在前 3 张循环，第 4~N 张走「展开 N」；③ 单位用 px 与 58vw 卡宽精确组合；④ 清理旧版非契约元素（底部返回条、展开态改分类浮层、折叠态点击 previewImage）。
- **下一步：** 开发者工具 + 真机对照 §12.6 验收清单逐项过（58% 右对齐、扇形只露右边、胶囊不跟卡动、跟手旋转、阈值回弹、循环翻页、展开 stagger、亮暗两套）；阶段三真机验收仍是阻塞项。

### 2026-07-18（定位升级）

- **做了什么：** 产品定位升级为"微信叠图玩法生成器"——穿搭白底卡是旗舰功能，玩法模板库是长期资产。新增 `docs/product/PLAYBOOK.md`（平台事实、统一 6 段叠图管线、9 个模块实现卡、阶段六~九上线节奏）；PRD 定位章节最小改写并替换红线；TECHNICAL_SPEC 新增第 12 节叠图玩法管线技术规格；README 文档入口更新；删除 `docs/WePicTool_功能模块规划.md`（内容已全部并入 PLAYBOOK，避免双份真相源）。
- **改了哪些文件：** docs/product/PLAYBOOK.md（新增）、docs/product/PRD.md、docs/product/TECHNICAL_SPEC.md、docs/product/PROJECT_STATUS.md、README.md、docs/WePicTool_功能模块规划.md（删除）。
- **关键决策：** 翻页动画采纳"素材库先行 + 云托管 ffmpeg 自定义抽帧"双路线（云托管为容器制可跑 ffmpeg，绕开 CloudBase 云函数原生模块限制；路线②上线前需做抽帧验证）；回流引导卡进入统一底座（末卡"用 WePicTool 做同款"，可开关，埋点单独统计）；≥3 张硬约束（不足自动补封面卡/引导卡）；资料打包"按时间分组"降级（`wx.chooseMedia` 拿不到可靠拍摄时间，v1 只做手动分组，时间分组标记待验证）；保存文件名编号（01、02……）+ 发送引导教用户按编号勾选，是控制叠图顺序的唯一手段。
- **下一步：** 阶段三真机验收（iOS + Android），通过后按 `PLAYBOOK.md` 进入阶段六（大字滑卡 + 剧情滑卡）。

### 2026-07-18

- **做了什么：** 完成阶段三前端 Canvas 白底卡片合成开发。结果页接入 cardComposer（串行合成队列 + 取消机制），支持 1:1 / 4:5 / 3:4 比例切换并整批重合成，白底卡片接入单张/按组保存链路，抠图失败图显示「重做」按钮（单图重调 processOutfit），浅色衣物轻阴影+细描边兜底生效；修复 WXML 函数调用绑定不渲染的关键 bug，preview 页优先展示合成卡片。check:syntax、check:miniprogram 均通过。
- **改了哪些文件：** miniprogram/utils/cardComposer.js（新增）、pages/result/result.js/.wxml/.wxss、pages/preview/preview.js、docs/product/PROJECT_STATUS.md。
- **关键决策：** 合成采用串行队列避免共享 canvas 污染和内存风险；重做抠图复用 processOutfit 不新增云函数接口；细描边沿包围盒绘制，真机观感不佳时再去掉。
- **下一步：** 真机验收阶段三（保存相册、比例切换耗时、浅色衣物可辨认度、iOS+Android 内存），通过后进入阶段四。

### 2026-07-13

- **做了什么：** 全面同步文档状态（旧 7 份文档替换为新 5 份文档体系），建立文档同步规范和保护规则，删除 superpowers 一次性文档，新增迭代上下文记录机制（PROJECT_STATUS 最新更新日志 + Claude Memory），新增提示词工程化方案文档。
- **改了哪些文件：** docs/product/ 全部替换，README.md、CLAUDE.md 更新引用，docs/superpowers/ 删除，docs/ai-workflows/prompt-engineering-plan.md 新建。
- **关键决策：** 文档同步采用最小改动原则，禁止重写分析性内容，实质性矛盾需用户确认。提示词工程化方案确认可行，待实施。
- **下一步：** 继续阶段三前端 Canvas 白底卡片合成。口径见 DEVELOPMENT_GUIDE.md。

---

## 8. 下次迭代入口

阶段三真机验收（iOS + Android，口径见 `DEVELOPMENT_GUIDE.md` 阶段三验收标准）→ 通过后按 `PLAYBOOK.md` 阶段六执行（大字滑卡 + 剧情滑卡）。
