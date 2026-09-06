# WePicTool 开发与文档同步规则

## 规则层级

1. 用户当前指令优先。
2. `AGENTS.md` 与 `CLAUDE.md` 是完全一致的入口；它们要求先阅读本文件、当前状态和路线图。
3. `docs/current.md` 是当前阶段、活跃分支、阻塞项和下一步的唯一状态来源。
4. 代码和自动化测试是运行行为的最终事实来源。发现文档与代码不一致时，先在当天迭代日志记录差异，再修正文档或代码。
5. PRD、玩法手册、技术规格、功能设计和实施计划分别保存长期范围、路线、架构与单项实施依据，不复制当前状态。
6. `docs/README.md` 是文档导航入口，`docs/product/DESIGN_SYSTEM.md` 是页面外壳与视觉契约；两者都不能替代 `docs/current.md` 的阶段事实。

## 文档职责

| 文档 | 用途 | 何时更新 |
| --- | --- | --- |
| `docs/README.md` | 文档地图、接手顺序、统一状态词 | 文档入口、职责或开发基线改变时 |
| `docs/current.md` | 当前阶段、分支、阻塞项、下一步 | 阶段、分支、部署或用户行为状态变化后 |
| `docs/roadmap.md` | 后续优先级、进入条件、暂缓项 | 优先级或阶段顺序改变时 |
| `docs/decisions.md` | 关键产品、技术、合规与范围取舍 | 作出代码无法解释的取舍时 |
| `docs/changelog.md` | 已完成或已发布的用户可感知更新 | 合并完成或发布时 |
| `docs/product/DESIGN_SYSTEM.md` | 页面骨架、导航、令牌、组件和变更边界 | 已确认的全局视觉或页面模板改变时 |
| `docs/iterations/YYYY-MM-DD.md` | 当日完成项、验证、遗留风险、下一步 | 当天有产品代码、配置、测试、部署或产品文档改动时 |
| `docs/superpowers/specs/` | 单项功能设计说明 | 新功能或重大行为变化确认后 |
| `docs/superpowers/plans/` | 单项功能实施计划 | 设计确认后、编码前 |

## 开发前

1. 按 `docs/README.md` 的顺序阅读 `docs/current.md`、`docs/roadmap.md` 和任务直接相关的 PRD、技术规格、设计或计划；页面工作还必须阅读设计系统。
2. 明确本次只解决一个目标，并确认是否会影响用户行为、产品规则、架构、部署或合规。
3. 新功能、产品规则变化、用户流程变化或架构变化：先写设计说明，获得用户确认后再写实施计划。
4. 纯 bug 修复、文案修正、测试补充或格式调整可跳过设计说明；若影响用户行为、阶段或取舍，仍须更新对应治理文档。
5. 在功能分支工作。功能分支的文档只能描述该分支事实，不得写成已上线或已在 `main` 完成。

## 开发后

1. 为行为变化补充或更新自动化测试。
2. 运行完整检查：

```bash
npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs
```

3. 更新 `docs/current.md` 和当天 `docs/iterations/YYYY-MM-DD.md`；日志必须写实际执行的验证结果，不得写预计结果。
4. 合并用户可感知的新功能、改变项目目录入口、运行方式、部署方式或当前功能范围时，必须更新 `README.md`；若无需更新，必须在当天迭代日志写明“README 无需更新：原因”。
5. 有关键取舍时更新 `docs/decisions.md`；功能已合并或发布且用户可感知时更新 `docs/changelog.md`。
6. 代码、测试和相关文档在同一功能分支提交。未更新必要文档或未记录验证结果时，不得声明任务完成。

## 合并前

1. 确认 `docs/current.md`、`docs/roadmap.md`、`docs/changelog.md` 与待合并代码一致。
2. 记录部署步骤、未验证项目、风险和回滚条件。
3. 重新运行完整检查和 `git diff --check`。
4. 合并后更新 `docs/current.md` 与当天迭代日志；若能力已完成或发布，再更新变更摘要。

## 文档检查

`npm run check:docs` 会检查治理文档存在、两个入口文件完全一致、当前状态的四个固定章节，以及产品或文档结构变动是否在当天日志说明 README 已更新或无需更新；若标注已更新，也会检查 README 随提交暂存。它不会自动改写文档。

产品改动包括 `miniprogram/`、`scripts/`、`tests/`、`package.json`、`project.config.json` 和 `miniprogram/project.config.json`；纯文档提交不强制创建当天迭代日志。
