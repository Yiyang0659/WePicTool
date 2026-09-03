# WePicTool 当前状态

**最后更新：** 2026-09-03

## 当前阶段

P1 共享底座与趣味字画 P2.1 阶段一在 `codex/fun-text-stack-phase1` 中已完成代码实施和自动化验证：规则三候选、确定性场景、Canvas/云托管渲染适配、聚焦轻编辑、顺序保存、本地记录恢复、内容安全关闭式门禁、`callContainer` 生产调用、发布预检与入口紧急关闭均有测试覆盖。这里的“完成”只指分支代码和自动化，不代表已合并、部署或发布。

P2.2 AI 智能故事规划器是阶段一计划之外的实验代码：分支内已有 Prompt/JSON 解析、候选严校验、单次修复、`planFunTextStory`、客户端规则降级和本地模拟自动化，但其发布范围尚未确认。部署该云函数、配置服务端模型 API key、配置线上域名以及真机验证都仍待办。

本分支最新全量测试数以 `docs/iterations/2026-09-03.md` 的最终实跑记录为准。Docker 构建、CloudBase 云托管部署、线上字体/preview/render/403/503 冒烟、微信开发者工具、iOS、Android 和真实微信聊天均未验证。

## 分支状态

- `main`：包含穿搭叠图主链路、既有内容安全能力和项目治理检查器；README 同步检查已启用。
- `codex/fun-text-stack-phase1`：包含 P1、趣味字画 P2.1 阶段一以及计划外 P2.2 实验代码。生产 renderer POST 只允许 `wx.cloud.callContainer`，服务端要求平台注入的 `x-wx-openid` 并做每身份 30 次/分钟的实例内限流；本地离线 renderer 只在显式 development 模式开放。当前 `FUN_CARD_RENDERER_URL` 仍是 `http://127.0.0.1:8080`，所以严格发布预检按设计非零退出。
- `codex/layered-dressup-mvp`：保留分层云换装 MVP 的来源提交；实现已集成至当前功能分支，但尚未完成微信开发者工具、iOS、Android、真实聊天验收或主线合并。
- `codex/bigtext-handwrite`：保留旧大字滑卡、授权字体、马克笔渲染和贴纸技术实验；产品方向已由趣味字画替代，不再计划整体合并。

## 阻塞项

- 个人主体小程序的 AI/深度合成相关审核范围尚未确定；在决定企业主体或不含相关能力的发布版本前，P2.2 不能进入确认发布范围。
- `fun-card-renderer` 尚未完成 Docker/Linux 原生依赖构建、CloudBase 服务与权限配置、私密 POST/公开字体入口配置、48 小时生命周期规则及线上端点冒烟。
- 共享底座、分层云换装和趣味字画尚未完成微信开发者工具、iOS、Android 与真实微信聊天验收，也尚未合并到 `main`。

## 下一步

1. 决定上线主体、P2.2 是否纳入发布，以及入口 flag 的发布默认值。
2. 在有 Docker 的环境构建 `node:20-bookworm-slim` 镜像；按部署手册创建 `fun-card-renderer` 服务、权限、网络入口和 48 小时清理规则，再完成线上冒烟。
3. 若确认验证 P2.2，部署 `planFunTextStory` 并配置服务端模型 API key；否则发布包保持规则闭环并关闭/移除实验入口。
4. 完成微信开发者工具、iOS、Android 和真实微信聊天验收，再进行最终代码审查与主线合并决策。
