# 文档结构清理实施计划

> 状态：已获用户确认，执行分支 `codex/documentation-cleanup`。

**目标：** 让日常开发只需要阅读少量当前文档；保留历史资料且不把它们误当成当前事实。

## 任务 1：建立“当前 / 历史”边界

1. 新建 `docs/history/README.md` 和 `docs/history/ai-research/README.md`，说明历史资料仅作追溯，不代表当前状态。
2. 将旧的项目状态、旧归档和三份已过期的 AI 调研文档移动到 `docs/history/`。
3. 删除内容重复、链接已失效的 `docs/product/DEVELOPMENT_GUIDE.md`；Git 历史仍保留其可恢复记录。
4. 新建 `docs/superpowers/README.md`，说明 specs/plans 是功能设计与实施历史，当前状态以 `docs/current.md` 为准。

## 任务 2：同步仍在使用的文档

1. 更新根目录 README 的文档入口和当前阶段描述。
2. 更新 PRD、玩法手册、技术规格和 AI 工作流入口中失效链接、旧阶段描述及相互矛盾的默认模型说明。
3. 保持长期产品范围与技术设计，不把分支中的未合并能力写成已上线。

## 任务 3：记录与验证

1. 在 `docs/decisions.md` 和当天迭代日志中记录这次文档层级调整及发现的非文档一致性风险。
2. 搜索活跃文档中的旧路径与过时模型名称，修正可确认的问题。
3. 运行 `npm test`、`npm run check:syntax`、`npm run check:miniprogram`、`npm run lint`、`npm run check:docs` 与 `git diff --check`。
