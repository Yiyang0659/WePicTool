# 项目文档治理与持续迭代机制设计

## 目标

在不修改产品功能、不合并功能分支、不搬动既有产品文档的前提下，为 WePicTool 建立一套可持续执行的“规划 → 开发 → 验证 → 文档同步 → 提交”机制。Codex 与 Claude Code 的新会话都应从内容完全一致的入口规则和当前状态开始，即可理解项目现状、下一步和已知风险。

## 问题与边界

当前仓库已有 PRD、玩法手册、技术规格、项目状态、归档、功能设计和实施计划，但它们存在三个问题：当前状态分散、功能分支与 `main` 的事实暂时分离、没有对每日记录和文档同步的自动检查。

本次只建立治理层：不修改 `miniprogram/` 产品代码，不处理 `project.config.json` 的既有本地改动，不合并 `codex/bigtext-handwrite` 分支，也不迁移或删除已有历史文档。允许更新根目录的 `AGENTS.md` 与 `CLAUDE.md`，使 Codex 和 Claude Code 使用同一治理规则。

## 文档职责

新增文档如下：

| 文件 | 唯一职责 | 更新时机 |
| --- | --- | --- |
| `docs/current.md` | 当前阶段、主分支与功能分支事实、阻塞项、下一步 | 每次影响产品行为、阶段、分支状态或部署状态的开发完成后 |
| `docs/roadmap.md` | 后续阶段的优先级、进入条件和暂缓事项 | 优先级或阶段顺序改变时 |
| `docs/decisions.md` | 关键产品、技术、合规或范围取舍及其理由 | 作出不可凭代码推断的取舍时 |
| `docs/changelog.md` | 面向使用者的已完成能力摘要 | 功能完成、合并到主分支或发布时 |
| `docs/iterations/YYYY-MM-DD.md` | 当天完成项、验证证据、遗留项和下一步 | 有产品代码、配置、测试、部署或产品文档改动的当天 |
| `docs/governance.md` | Codex 与 Claude Code 共用的开发和文档同步规则 | 工作流规则改变时 |

既有文档保留其长期职责：`docs/product/PRD.md` 定义产品范围，`docs/product/PLAYBOOK.md` 定义玩法路线，`docs/product/TECHNICAL_SPEC.md` 定义技术事实，`docs/product/ARCHIVED.md` 保存旧历史；`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 分别保存单项功能的设计和实施计划。

`docs/current.md` 是当前状态的唯一事实来源。代码和自动化测试是运行行为的最终事实来源；二者不一致时，必须在当天迭代日志中记录差异，并修正 `current.md` 或代码。

## Codex 与 Claude Code 入口规则

- `AGENTS.md` 是 Codex 的仓库入口文件；`CLAUDE.md` 是 Claude Code 的仓库入口文件。
- 两个文件必须逐字一致（忽略末尾换行），并且不包含任何工具专属、过期阶段、重复架构说明或旧规则。
- 两个入口文件只保留同一份简短的执行清单：先读 `docs/governance.md`、`docs/current.md`、`docs/roadmap.md`，遵守文档同步与验证要求，完成前运行规定检查。
- `docs/governance.md` 是唯一的流程规则正文，包含开发前、开发后、合并前规则，及新功能与纯修复的区分。
- 项目架构、技术栈、命令和产品约束不再放入两个入口文件，分别以 `docs/product/TECHNICAL_SPEC.md`、`README.md`、`package.json`、`docs/product/PRD.md` 和 `docs/product/PLAYBOOK.md` 为准。

## 分支事实规则

- `main` 文档只陈述已经合并到 `main` 的能力。
- 功能分支中的文档只陈述该分支的能力，不能称为已上线或已在主分支完成。
- `docs/current.md` 必须列出活跃功能分支、包含的功能、验证状态、合并决定和部署前置条件。
- 功能合并后，合并提交必须同时更新 `current.md`、当天迭代日志；若用户可感知的能力已完成，再更新 `changelog.md`。

## 开发工作流

1. Codex 读取 `AGENTS.md`，Claude Code 读取 `CLAUDE.md`；两者内容完全一致，并要求继续读取 `docs/governance.md`、`docs/current.md`、`docs/roadmap.md` 和任务相关技术文档。
2. 确认本次任务只解决一个明确目标。
3. 新功能、产品规则变化、用户流程变化或架构变化：先写 `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`，经用户确认后写实施计划。
4. 纯 bug 修复、文案修正、测试补充或格式调整：可跳过设计说明；若影响用户行为、当前阶段或技术取舍，仍须更新对应治理文档。
5. 开发中为行为变化补充或修改自动化测试；完成后运行项目完整检查。
6. 更新 `docs/current.md`、当天迭代日志；有关键取舍时更新 `docs/decisions.md`；满足发布条件时更新 `docs/changelog.md`。
7. 代码、测试和相关文档在同一功能分支提交。未更新必要文档不得声明任务完成。

## 自动检查

新增 `scripts/check-documentation.mjs` 与 `npm run check:docs`：

1. 验证治理文档及 `docs/iterations/` 存在，验证 `AGENTS.md`、`CLAUDE.md` 内容一致，并验证它们共同引用 `docs/governance.md`、`docs/current.md` 和 `docs/roadmap.md`。
2. 验证 `docs/current.md` 包含“当前阶段”“分支状态”“阻塞项”“下一步”四个固定章节。
3. 当 Git 暂存区包含 `miniprogram/`、`scripts/`、`tests/`、`package.json` 或根项目配置的改动时，要求暂存区同时包含当天的 `docs/iterations/YYYY-MM-DD.md`。
4. 该检查纳入日常完成命令和合并前清单；它不强行改写文档，也不要求没有产品行为变化的纯文档提交创建日记。

Git hook 不作为首版强制条件：不同开发环境的 hook 配置不稳定，首版通过 `AGENTS.md` 和显式 `npm run check:docs` 约束。后续团队协作扩大后，再评估统一 hook 或 CI 门禁。

## 初始事实迁移

首次创建治理文档时，`docs/current.md` 如实记录：

- `main` 当前仍保留旧阶段文档；
- `codex/bigtext-handwrite` 分支包含大字滑卡及马克笔视觉实验，已通过自动化检查但尚未合并、部署和真机验收；
- 小程序个人主体的 AI/深度合成相关审核限制仍是上线决策项；
- `project.config.json` 与 `miniprogram/project.config.json` 的未提交本地修改不属于本次治理改动。

`docs/roadmap.md` 以“先解决上线范围与真机验收，再建设模板入口和非 AI 照片滑卡，最后恢复或扩展 AI 穿搭能力”为近期路线。字体定制字库与大字滑卡视觉升级记录为后续迭代，不作为当前阻塞项。

## 验收标准

1. 新会话只阅读 `AGENTS.md`、`docs/current.md`、`docs/roadmap.md`，能说明当前阶段、活跃分支、上线阻塞和下一步。
2. 每个新增治理文档只有一个明确职责，且不复制 PRD、玩法手册或技术规格的全文。
3. `npm run check:docs` 在文档完整且无未记录产品改动时通过；缺失关键章节或暂存产品改动未写当天日志时失败并说明原因。
4. 治理文档创建不会改动产品代码、项目配置或未合并功能分支。
5. 完整检查和文档检查命令会被列入 `docs/governance.md`，并由 `AGENTS.md` 和 `CLAUDE.md` 同时引用。
