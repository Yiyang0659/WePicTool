# 项目文档治理机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Codex 和 Claude Code 建立完全一致的项目入口规则、单一当前状态文档、每日迭代日志和可执行的文档同步检查。

**Architecture:** `AGENTS.md` 与 `CLAUDE.md` 作为完全相同的薄入口，只指向 `docs/governance.md`、`docs/current.md`、`docs/roadmap.md`。治理规则、当前状态、路线、决策、变更摘要和每日迭代记录分离保存；`scripts/check-documentation.mjs` 只验证结构和暂存改动是否有当天日志，不自动改写任何文档。

**Tech Stack:** Markdown、Node.js ESM、Node 内置 test runner、Git 暂存区检查。

## Global Constraints

- 不修改 `miniprogram/` 产品代码，不处理根目录或 `miniprogram/` 的 `project.config.json` 未提交改动，不合并 `codex/bigtext-handwrite` 分支。
- `AGENTS.md` 与 `CLAUDE.md` 必须逐字一致（忽略末尾换行），且不保留旧的 Claude 专属架构、阶段、命令或产品规则。
- `docs/current.md` 是当前阶段、活跃分支、阻塞项和下一步的唯一状态来源；代码和自动化测试是运行行为的最终事实来源。
- 既有 PRD、玩法手册、技术规格、归档、功能 spec 与 plan 不迁移、不删除。
- 文档检查仅在暂存区含产品代码、测试、脚本、`package.json` 或根项目配置改动时要求当天 `docs/iterations/YYYY-MM-DD.md` 也在暂存区。
- 日期使用 `Asia/Shanghai`，确保团队成员在不同时区运行检查时规则一致。

---

### Task 1: 可测试的文档治理检查器

**Files:**
- Create: `scripts/check-documentation.mjs`
- Create: `tests/check-documentation.test.cjs`
- Create: `docs/iterations/2026-07-26.md`
- Modify: `package.json`

**Interfaces:**
- `collectDocumentationProblems({ rootDir, stagedFiles, today })` 返回字符串数组；空数组表示文档结构和暂存规则通过。
- `getShanghaiDate(now)` 返回 `YYYY-MM-DD`。
- CLI 调用 `collectDocumentationProblems`，成功输出 `文档治理检查通过。`，失败将每项问题输出到 stderr 并以状态码 `1` 退出。
- `npm run check:docs` 直接运行该 CLI。

- [ ] **Step 1: 写入失败测试**

创建 `tests/check-documentation.test.cjs`，通过动态 `import()` 加载尚不存在的 `scripts/check-documentation.mjs`，并覆盖三种行为：

```js
test('governance check accepts complete documents and identical entry files', async () => {
  const rootDir = makeFixture({ identicalEntries: true, completeCurrent: true });
  const { collectDocumentationProblems } = await loadChecker();
  assert.deepEqual(collectDocumentationProblems({
    rootDir,
    stagedFiles: ['docs/iterations/2026-07-26.md'],
    today: '2026-07-26'
  }), []);
});

test('governance check rejects mismatched entry files and missing current sections', async () => {
  const rootDir = makeFixture({ identicalEntries: false, completeCurrent: false });
  const { collectDocumentationProblems } = await loadChecker();
  const problems = collectDocumentationProblems({ rootDir, stagedFiles: [], today: '2026-07-26' });
  assert.ok(problems.some((item) => item.includes('AGENTS.md 与 CLAUDE.md')));
  assert.ok(problems.some((item) => item.includes('分支状态')));
});

test('governance check requires today iteration log for staged product changes', async () => {
  const rootDir = makeFixture({ identicalEntries: true, completeCurrent: true });
  const { collectDocumentationProblems } = await loadChecker();
  const problems = collectDocumentationProblems({
    rootDir,
    stagedFiles: ['miniprogram/pages/index/index.js'],
    today: '2026-07-26'
  });
  assert.ok(problems.some((item) => item.includes('docs/iterations/2026-07-26.md')));
});
```

`makeFixture` 应在 `fs.mkdtempSync(path.join(os.tmpdir(), 'wepic-governance-'))` 下创建所需 Markdown 文件；入口文本固定包含三个引用路径，完整 current 固定包含四个 H2 标题。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/check-documentation.test.cjs`
Expected: FAIL，报错无法导入 `scripts/check-documentation.mjs`。

- [ ] **Step 3: 实现最小检查器**

创建 ESM 脚本，导出下列实现：

```js
export function getShanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isTrackedProductChange(filePath) {
  return /^(miniprogram|scripts|tests)\//.test(filePath)
    || filePath === 'package.json'
    || filePath === 'project.config.json'
    || filePath === 'miniprogram/project.config.json';
}
```

`collectDocumentationProblems` 必须检查以下路径存在：`AGENTS.md`、`CLAUDE.md`、`docs/governance.md`、`docs/current.md`、`docs/roadmap.md`、`docs/decisions.md`、`docs/changelog.md`、`docs/iterations/`。它必须比较两个入口文件去除末尾空白后的文本，并要求共同文本包含 `docs/governance.md`、`docs/current.md`、`docs/roadmap.md`。它必须检查 `docs/current.md` 包含 `## 当前阶段`、`## 分支状态`、`## 阻塞项`、`## 下一步`。若 `stagedFiles` 中存在 `isTrackedProductChange` 为真的文件，则要求其中存在 `docs/iterations/${today}.md`。

CLI 使用 `execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])` 收集暂存文件；不在 Git 仓库时将暂存文件视为空数组，仍检查文档结构。

- [ ] **Step 4: 加入 npm 命令并验证**

在 `package.json` 的 `scripts` 添加：

```json
"check:docs": "node scripts/check-documentation.mjs"
```

Run: `node --test tests/check-documentation.test.cjs`
Expected: PASS。

- [ ] **Step 5: 提交检查器**

先创建 `docs/iterations/2026-07-26.md`，记录“新增文档治理检查器；测试已通过；完整治理文档将在下一任务建立”，使产品脚本改动从第一笔提交起就符合当天日志规则。

```bash
git add scripts/check-documentation.mjs tests/check-documentation.test.cjs package.json docs/iterations/2026-07-26.md
git commit -m "test: add documentation governance checks"
```

### Task 2: 统一入口与治理文档

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Create: `docs/governance.md`
- Create: `docs/current.md`
- Create: `docs/roadmap.md`
- Create: `docs/decisions.md`
- Create: `docs/changelog.md`
- Create: `docs/iterations/2026-07-26.md`
- Modify: `README.md`
- Modify: `docs/product/PROJECT_STATUS.md`

**Interfaces:**
- `AGENTS.md` 与 `CLAUDE.md` 的规范化文本完全相等；它们是同一份入口清单，而不是架构说明。
- `docs/governance.md` 定义开发前、开发后、合并前的完整规则与精确检查命令。
- `docs/current.md` 包含四个固定章节，且如实区分 `main` 和 `codex/bigtext-handwrite` 分支。

- [ ] **Step 1: 创建统一入口文本**

用完全相同的以下内容覆盖 `AGENTS.md` 和 `CLAUDE.md`：

```md
# WePicTool 项目治理入口

开始任何涉及产品行为、代码、配置、测试或部署的任务前，必须依次阅读：

1. `docs/governance.md`
2. `docs/current.md`
3. `docs/roadmap.md`
4. 与任务直接相关的产品、技术、设计或实施文档

新功能、产品规则、用户流程或架构变化必须先完成设计说明和实施计划并获得用户确认；纯 bug 修复、文案修正、测试补充或格式调整按 `docs/governance.md` 的例外执行。

完成前运行 `docs/governance.md` 列出的检查，并同步更新所需文档。不得在未更新必要文档、未记录验证结果时声明任务完成。
```

- [ ] **Step 2: 创建治理正文与当前事实**

`docs/governance.md` 要包含：规则层级、开发前/后/合并前三段清单、文档职责表、完整检查命令 `npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs`、以及“功能分支事实不得写入 main 当前状态”的规则。

`docs/current.md` 固定写入以下真实状态：

```md
## 当前阶段

上线范围决策与真机验收准备。

## 分支状态

- `main`：已包含穿搭叠图主链路与既有内容安全能力；根目录两份 `project.config.json` 有用户未提交修改，本次不处理。
- `codex/bigtext-handwrite`：包含大字滑卡和马克笔视觉实验，35 项自动化测试通过；尚未合并到 `main`、未部署云托管、未真机验收。

## 阻塞项

- 个人主体小程序的 AI/深度合成相关审核范围需要先决定是申请企业主体，还是推出不含相关能力的版本。
- 大字滑卡云托管未部署，不能完成最终生成链路的真机验证。

## 下一步

1. 决定上线主体与 AI 功能范围。
2. 决定大字滑卡功能分支的合并方式；若合并，部署 `text-card-renderer` 并完成真机验收。
3. 上线范围明确后，建设玩法模板入口与非 AI 照片滑卡。
```

- [ ] **Step 3: 创建路线、决策、变更与当天迭代日志**

- `docs/roadmap.md`：按 P0“上线范围/真机验收”、P1“模板入口与非 AI 照片滑卡”、P2“企业主体后评估 AI 穿搭能力”、P3“自有或授权手写字体迭代”排序；每项写目标、进入条件和不做项。
- `docs/decisions.md`：写入三条带日期的初始决策：产品定位为微信叠图玩法生成器；大字滑卡字体暂不接入 AI 且视觉迭代暂停；个人主体 AI 审核限制必须先于新增 AI 能力解决。
- `docs/changelog.md`：创建 `## Unreleased`，记录“建立项目文档治理与持续迭代机制”，并说明大字滑卡仍是未合并功能分支，不能写成已发布能力。
- `docs/iterations/2026-07-26.md`：记录今日的治理设计、Claude/Codex 入口统一决定、已有大字滑卡分支状态、尚未合并/部署的风险，以及下一步为运行文档检查并开始真机/上线范围决策。

- [ ] **Step 4: 让旧入口指向新事实来源**

在 `README.md` 的“当前阶段”段落增加到 `docs/current.md` 和 `docs/roadmap.md` 的链接，并将其表述为当前状态与近期优先级的唯一入口。

在 `docs/product/PROJECT_STATUS.md` 标题下增加显眼说明：该文件是历史阶段记录，实时状态以 `docs/current.md` 为准；不重写其历史正文。

- [ ] **Step 5: 运行文档检查与入口一致性检查**

Run:

```bash
cmp -s AGENTS.md CLAUDE.md
npm run check:docs
```

Expected: 两项命令均以状态码 `0` 退出；若当前暂存区包含脚本、测试或 `package.json` 改动，必须先暂存 `docs/iterations/2026-07-26.md`。

- [ ] **Step 6: 提交治理文档**

```bash
git add AGENTS.md CLAUDE.md README.md docs/governance.md docs/current.md docs/roadmap.md docs/decisions.md docs/changelog.md docs/iterations/2026-07-26.md docs/product/PROJECT_STATUS.md
git commit -m "docs: establish shared project governance"
```

### Task 3: 发布前回归与文档对齐

**Files:**
- Modify: `docs/iterations/2026-07-26.md`

**Interfaces:**
- 当天迭代日志记录本次实际执行的检查结果，而不是预计结果。

- [ ] **Step 1: 执行完整检查**

Run:

```bash
npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs && git diff --check
```

Expected: 所有命令成功退出；文档检查不会因为未处理的 `project.config.json` 本地修改失败，除非这些文件被暂存。

- [ ] **Step 2: 写入真实验证证据**

将实际命令、通过结果、未执行的真机/部署验证，以及“未改动产品代码和两份 project config”的事实写入 `docs/iterations/2026-07-26.md`。

- [ ] **Step 3: 重新运行文档与 Git 结构检查**

Run:

```bash
npm run check:docs && cmp -s AGENTS.md CLAUDE.md && git diff --check
```

Expected: 所有命令以状态码 `0` 退出；在提交 Step 4 后，`git status --short` 仅剩用户原有的 `project.config.json` 修改。

- [ ] **Step 4: 提交验证日志**

```bash
git add docs/iterations/2026-07-26.md
git commit -m "docs: record governance verification"
```

## Plan Self-Review

- Spec coverage: Task 1 提供可测试的检查器与 npm 命令；Task 2 创建单一事实来源、每日记录、完全一致的 Codex/Claude 入口及旧文档跳转；Task 3 写入真实验证证据并确认不触碰产品代码或用户配置。
- Placeholder scan: 所有文件路径、章节名、接口、命令与初始状态均已明确；日期固定为 `2026-07-26`，不依赖未定义的后续工作。
- Type consistency: 测试、检查器、`package.json` 和治理文档都使用 `collectDocumentationProblems`、`check:docs`、`docs/iterations/YYYY-MM-DD.md` 与 `Asia/Shanghai` 日期规则。
