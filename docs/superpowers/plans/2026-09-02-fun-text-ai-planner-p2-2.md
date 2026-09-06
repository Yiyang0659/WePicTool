# 趣味字画 P2.2 AI 智能故事规划器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付「趣味字画」P2.2 阶段核心能力——接入生成式大语言模型（LLM）作为智能故事规划器（`creativePlanner`）：输入 1~40 字原句和表达标签后，由大模型理解语义并一次性规划出 3 套节奏鲜明、有反转/悬念/留白的结构化故事计划；建立严格输出校验、单次自我修复与无缝规则降级兜底的高可用闭环，并经过内容安全双重拦截。

**Architecture:** 前端归一化 `CreativeBrief` → 服务端/云函数调用 LLM（兼容 OpenAI / DashScope 格式，如 `deepseek-v3` / `qwen-plus`）并传入系统 Prompt 与策略要求 → 大模型输出结构化 JSON → `candidateValidator` 执行卡数、角色、字数、原意保留与素材白名单严格校验 → 校验失败触发一次带错重试，超时或二次失败静默降级为规则规划器 `candidatePlanner` → 全部生成文字过 `contentGuard` 安全门禁 → 前端无缝展示三套可滑候选。

**Tech Stack:** 微信原生小程序、Node.js 20、CloudBase 云函数 / 云托管、OpenAI / DashScope 兼容接口、CommonJS 纯函数、`node:test`。

**Spec:** `docs/superpowers/specs/2026-08-31-fun-text-stack-design.md` §6

---

## Global Constraints

1. **工作树与分支**：在 `codex/fun-text-stack-phase1`（或派生功能分支）下进行，严守红—绿—重构节奏。
2. **三套候选硬约束**：一次调用必须且只能返回 3 套候选；策略 ID（`hard_turn`、`suspense_reveal`、`fake_checklist`、`visual_pause`）互不相同。
3. **卡数与单卡长度**：每套候选卡片数必须在 3–8 张内；普通卡主文案 ≤12 字；`reveal` 卡必须包含用户原句核心语义，最多 40 字并允许折行。
4. **确定性兜底原则**：AI 生成的任何异常（超时 >8s、JSON 损坏、校验失败两次、敏感词拦截）都必须**静默降级为已有规则规划器**，绝对不可向用户弹出技术性报错阻断使用。
5. **内容安全双门禁**：用户输入在规划前必须通过 `contentGuard`；模型输出的新增文案与卡片文案在返回前端前必须做二次聚合内容安全检测。
6. **不生成带字最终图片**：大模型仅输出结构化 JSON 数据（文本、卡片角色、推荐视觉标签），绝对不生成最终图片，所有图片由底层确定性 Canvas/云托管渲染器生成。

---

## 实施任务清单（Tasks 1 ~ 6）

- [x] **Task 1: 大模型 Prompt 模板与结构化输出 JSON Schema 定义**
  - **目标**：设计专门针对微信叠图滑动场景的 System Prompt 与 Few-Shot 样本，约束模型输出严格的 3 套故事候选 JSON。
  - **文件**：
    - Create: `miniprogram/utils/storyPrompt.js`
    - Create: `tests/fun-text-story-prompt.test.cjs`
  - **核心点**：
    - 针对 4 种策略（`hard_turn`, `suspense_reveal`, `fake_checklist`, `visual_pause`）定义清晰的卡片角色编排指南；
    - 明确 `hook`（封面悬念）、`misdirect`（误导铺垫）、`pause`（留白停顿）、`reveal`（真相揭晓）、`ending`（表情收尾）的语义要求；
    - 注入 Few-Shot 真实案例，引导模型生成更接地气、更有反转感的网感文案。

- [x] **Task 2: 增强型候选计划严格校验器与自动修复逻辑**
  - **目标**：增强 `candidateValidator.js`，实现对大模型返回数据的结构、字段、字数、原意完整性进行全方位确定性校验与单次修复构造。
  - **文件**：
    - Modify: `miniprogram/utils/candidateValidator.js`
    - Create: `tests/fun-text-ai-validator.test.cjs`
  - **核心点**：
    - 校验 3 套候选数量、ID 唯一性、每套 3~8 张卡、序号从 1 递增；
    - 校验 `hook` 与 `reveal` 必须存在，且 `reveal` 保留原句核心语义（`preservedMeaning`）；
    - 校验字感、贴纸、涂鸦键是否在支持的白名单内；
    - 构造带明确错误原因的修复请求 Prompt（`buildRepairPrompt`）。

- [x] **Task 3: 云端故事规划接口（LLM API 与安全双门禁集成）**
  - **目标**：在云端实现故事规划调用接口，封装模型请求、超时控制、JSON 提取、一次自动重试与聚合内容安全检测。
  - **文件**：
    - Create: `miniprogram/cloudfunctions/planFunTextStory/index.js`
    - Create: `miniprogram/cloudfunctions/planFunTextStory/package.json`
    - Create: `miniprogram/cloudfunctions/planFunTextStory/config.json`
    - Create: `tests/cloud-plan-story.test.cjs`
  - **核心点**：
    - 支持配置化 API Key、Base URL 与 Model Name（默认支持 DeepSeek / 通义千问等 DashScope 接口）；
    - 设置 8000ms 超时限制，防止客户端长时间等待；
    - 正则/宽松提取 Markdown 代码块中的 JSON 字符串；
    - 规划成功后，将所有卡片的文案提取拼接，调用微信 `msgSecCheck` 做二次聚合审查。

- [x] **Task 4: 客户端 AI 规划调度器与规则静默降级闭环**
  - **目标**：实现小程序端统一的故事规划客户端，负责发起云端请求，并在任何异常时无感降级为本地规则规划器。
  - **文件**：
    - Create: `miniprogram/utils/creativePlannerClient.js`
    - Create: `tests/creative-planner-client.test.cjs`
  - **核心点**：
    - 接口对外提供统一的 `planCandidates(creativeBrief, options)`；
    - 优先调用云端 `planFunTextStory`；若云端未配置、网络异常、返回失败或超时，自动调用 `candidatePlanner.createRuleCandidates(creativeBrief)` 兜底；
    - 在返回的数据中标记来源（`source: 'ai' | 'rule_fallback'`），便于埋点统计。

- [x] **Task 5: 输入页（`pages/fun-text`）体验打通与动态 Loading**
  - **目标**：在输入页接入新的规划器，优化用户等待体验与错误友好提示。
  - **文件**：
    - Modify: `miniprogram/pages/fun-text/fun-text.js`
    - Modify: `miniprogram/pages/fun-text/fun-text.wxml`
    - Modify: `miniprogram/pages/fun-text/fun-text.wxss`
    - Modify: `tests/fun-text-entry.test.cjs`
  - **核心点**：
    - 生成过程中展示动态加载文案（如：“正在理解你的话... 💡” → “正在编排 3 套反转故事... 🎨”）；
    - 生成完成后平滑跳转到 `pages/fun-text-candidates`；
    - 本地与模拟器环境下的离线无感降级保证。

- [x] **Task 6: 全量自动化回归、文档与治理同步**
  - **目标**：运行完整测试套件与治理检查，更新路线图、当前状态与当天迭代日志。
  - **文件**：
    - Modify: `docs/current.md`
    - Modify: `docs/roadmap.md`
    - Create: `docs/iterations/2026-09-02.md`
    - Modify: `README.md`
  - **核心点**：
    - 保证 `npm test`、`npm run check:syntax`、`npm run check:miniprogram`、`npm run check:docs` 全绿通过。
