# WePicTool 当前状态

**最后更新：** 2026-09-04

## 当前阶段

P1 共享底座与趣味字画 P2.1 阶段一在 `codex/fun-text-stack-phase1` 中已完成代码实施和自动化验证：规则三候选、确定性场景、Canvas/云托管渲染适配、聚焦轻编辑、顺序保存、本地记录恢复、内容安全关闭式门禁、`callContainer` 生产调用、发布预检与入口紧急关闭均有测试覆盖。这里的“完成”只指分支代码和自动化，不代表已合并、部署或发布。

P2.2 AI 智能故事规划器是阶段一计划之外的实验代码：分支内已有 Prompt/JSON 解析、候选严校验、单次修复、`planFunTextStory`、客户端规则降级和本地模拟自动化，但其发布范围尚未确认。部署该云函数、配置服务端模型 API key、配置线上域名以及真机验证都仍待办。

`codex/unified-stack-export` 已从上述共同基线建立，只新增《统一叠图导出与顺序识别设计说明》，当前等待用户确认。设计纠正了旧文档中“以 01/02 文件名保证相册顺序”的不可实现承诺：微信保存接口不能指定目标文件名或系统相册排序；拟改为最终图片可见序号角标、串行保存和按角标选择引导。确认前尚未编写实施计划，也没有业务代码变化。

本分支最新全量测试数以 `docs/iterations/2026-09-03.md` 的最终实跑记录为准。Docker 构建、CloudBase 云托管部署、线上字体/preview/render/403/503 冒烟、微信开发者工具、iOS、Android 和真实微信聊天均未验证。

## 分支状态

- `main`：包含穿搭叠图主链路、既有内容安全能力和项目治理检查器；README 同步检查已启用。
- `codex/fun-text-stack-phase1`：包含 P1、趣味字画 P2.1 阶段一以及计划外 P2.2 实验代码。小程序 renderer POST 始终只走 `wx.cloud.callContainer`；服务端检查 `x-cloudbase-context` + `x-wx-openid`，按身份限制每实例 30 次/分钟并清理过期身份（最多 10000 个活跃身份）。头部检查不构成独立公网鉴权；非模拟启动及启用入口的发布预检要求 `FUN_CARD_RENDERER_ACCESS_MODE=call-container-only`，但仍必须独立验证平台公网关闭。离线模拟仅接受精确的 development + DEV_MODE=1。入口 flag=false 已关闭输入、候选/编辑、记录恢复、结果渲染/保存，静态回滚包不要求 renderer URL/服务/access mode。当前 flag=true、URL 为 HTTP loopback，且本地未设置 access mode，严格发布预检按设计退出 1。
- `codex/unified-stack-export`：基于趣味字画共同基线建立；当前只有待确认的统一导出设计文档，无业务代码或实施计划。
- `codex/layered-dressup-mvp`：保留分层云换装 MVP 的来源提交；实现已集成至当前功能分支，但尚未完成微信开发者工具、iOS、Android、真实聊天验收或主线合并。
- `codex/bigtext-handwrite`：保留旧大字滑卡、授权字体、马克笔渲染和贴纸技术实验；产品方向已由趣味字画替代，不再计划整体合并。

## 阻塞项

- 个人主体小程序的 AI/深度合成相关审核范围尚未确定；在决定企业主体或不含相关能力的发布版本前，P2.2 不能进入确认发布范围。
- `fun-card-renderer` 生产 **NOT READY**：尚未完成 Docker/Linux 构建、CloudBase 服务/权限、服务公网关闭开关及所有域名/网关 POST 不可达核验、公开字体、48 小时生命周期和线上冒烟。环境变量声明与 HTTP 头部不能替代部署手册的公网开关证据清单。
- 共享底座、分层云换装和趣味字画尚未完成微信开发者工具、iOS、Android 与真实微信聊天验收，也尚未合并到 `main`。

## 下一步

1. 用户审阅并确认 `docs/superpowers/specs/2026-09-04-unified-stack-export-design.md`；确认后再编写逐文件实施计划。
2. 决定上线主体、P2.2 是否纳入发布，以及入口 flag 的发布默认值。
3. 在有 Docker 的环境构建 `node:20-bookworm-slim` 镜像；按部署手册创建 `fun-card-renderer` 服务、权限、网络入口和 48 小时清理规则，再完成线上冒烟。
4. 若确认验证 P2.2，部署 `planFunTextStory` 并配置服务端模型 API key；否则发布包保持规则闭环并关闭/移除实验入口。
5. 完成微信开发者工具、iOS、Android 和真实微信聊天验收，再进行最终代码审查与主线合并决策。
