# WePicTool 当前状态

**最后更新：** 2026-09-04

## 当前阶段

P1 共享底座与趣味字画 P2.1 阶段一在 `codex/fun-text-stack-phase1` 中已完成代码实施和自动化验证：规则三候选、确定性场景、Canvas/云托管渲染适配、聚焦轻编辑、顺序保存、本地记录恢复、内容安全关闭式门禁、`callContainer` 生产调用、发布预检与入口紧急关闭均有测试覆盖。这里的“完成”只指分支代码和自动化，不代表已合并、部署或发布。

P2.2 AI 智能故事规划器是阶段一计划之外的实验代码：分支内已有 Prompt/JSON 解析、候选严校验、单次修复、`planFunTextStory`、客户端规则降级和本地模拟自动化，但其发布范围尚未确认。部署该云函数、配置服务端模型 API key、配置线上域名以及真机验证都仍待办。

`codex/unified-stack-export` 已完成统一导出的分支代码与自动化：穿搭、分层云换装和趣味字画共用 manifest 顺序事实源、独立 Canvas 可见 `01…N` 角标、同一 `exportUrl` 预览/保存、按叠门槛、失败续存和过期 generation 隔离；预览页已优先接收 materialized manifest，并保留旧 task/groups 输入一个兼容周期。三处引导统一要求每次只发送一叠、按图片角标勾选并确认 `01` 在第一位。微信保存接口不能指定目标文件名或系统相册排序，因此仍待开发者工具、双端真机与真实微信聊天验证，不能声明系统相册顺序可控。

本分支于 2026-09-04 完整自动化检查通过：251/251 测试、首方 JS 语法、小程序预检、TypeScript 与文档治理均通过。Docker 构建、CloudBase 云托管部署、线上字体/preview/render/403/503 冒烟、微信开发者工具中的统一导出流程、iOS、Android 和真实微信聊天仍未验证。

## 分支状态

- `main`：包含穿搭叠图主链路、既有内容安全能力和项目治理检查器；README 同步检查已启用。
- `codex/fun-text-stack-phase1`：包含 P1、趣味字画 P2.1 阶段一以及计划外 P2.2 实验代码。小程序 renderer POST 始终只走 `wx.cloud.callContainer`；服务端检查 `x-cloudbase-context` + `x-wx-openid`，按身份限制每实例 30 次/分钟并清理过期身份（最多 10000 个活跃身份）。头部检查不构成独立公网鉴权；非模拟启动及启用入口的发布预检要求 `FUN_CARD_RENDERER_ACCESS_MODE=call-container-only`，但仍必须独立验证平台公网关闭。离线模拟仅接受精确的 development + DEV_MODE=1。入口 flag=false 已关闭输入、候选/编辑、记录恢复、结果渲染/保存，静态回滚包不要求 renderer URL/服务/access mode。当前 flag=true、URL 为 HTTP loopback，且本地未设置 access mode，严格发布预检按设计退出 1。
- `codex/unified-stack-export`：统一 manifest、可见序号物化、三玩法页面接入、预览契约、续存和发送引导已完成分支代码与自动化；251/251 测试及全部治理检查通过。开发者工具、iOS、Android、真实相册/微信聊天和生产部署仍待验证，尚未合并到 `main`。
- `codex/layered-dressup-mvp`：保留分层云换装 MVP 的来源提交；实现已集成至当前功能分支，但尚未完成微信开发者工具、iOS、Android、真实聊天验收或主线合并。
- `codex/bigtext-handwrite`：保留旧大字滑卡、授权字体、马克笔渲染和贴纸技术实验；产品方向已由趣味字画替代，不再计划整体合并。

## 阻塞项

- 个人主体小程序的 AI/深度合成相关审核范围尚未确定；在决定企业主体或不含相关能力的发布版本前，P2.2 不能进入确认发布范围。
- `fun-card-renderer` 生产 **NOT READY**：尚未完成 Docker/Linux 构建、CloudBase 服务/权限、服务公网关闭开关及所有域名/网关 POST 不可达核验、公开字体、48 小时生命周期和线上冒烟。环境变量声明与 HTTP 头部不能替代部署手册的公网开关证据清单。
- 共享底座、分层云换装和趣味字画尚未完成微信开发者工具、iOS、Android 与真实微信聊天验收，也尚未合并到 `main`。

## 下一步

1. 在微信开发者工具分别验证穿搭、分层云换装和趣味字画的编号物化、同图预览/保存、门槛、修改失效与失败续存。
2. 在 iOS、Android 和真实微信聊天按角标验证 `01` 封面、滑动/展开顺序、授权拒绝、画质与遮挡；记录系统相册实际排列差异。
3. 决定上线主体、P2.2 是否纳入发布，以及入口 flag 的发布默认值。
4. 在有 Docker 的环境构建 `node:20-bookworm-slim` 镜像；按部署手册创建 `fun-card-renderer` 服务、权限、网络入口和 48 小时清理规则，再完成线上冒烟。
5. 完成外部验收后进行最终代码审查与主线合并决策；合并或发布后再更新 changelog。
