# Task 11 修复报告

日期：2026-09-02
工作树：`/Users/Zhuanz/Desktop/WePicTool/.worktrees/fun-text-stack-phase1`

## 根因

1. `template-result` 只写入 `wepic_history_tasks`，记录页实际读取的 `wepictool_records` 没有趣味字画记录。
2. 恢复时只要缓存卡片数组非空就复用，未核对当前所选场景、顺序、角色和 URL。
3. `record` 页对同一趣味字画记录同时发送 `funTextProject` 与 `acceptTaskData`，使结果页重复初始化。
4. 记录页把未明确支持的类型落入通用穿搭结果页；旧大字提示还宣称“全面升级”。

## TDD 证据

```text
node --test tests/fun-text-result.test.cjs tests/fun-text-record.test.cjs
RED：14 项中 8 项通过、6 项失败。
结果页失败：未写 wepictool_records、projectId 未 upsert、残缺/错配缓存未重渲染、version 2 仍继续渲染。

node --test tests/fun-text-record.test.cjs
RED：5 项中 1 项通过、4 项失败。
记录页失败：funtext 发出 2 个 event、bigtext 提示不精确、layered-dressup 进入通用结果页、未知类型仍导航。

node --test tests/fun-text-result.test.cjs tests/fun-text-record.test.cjs
GREEN：14 项通过，0 项失败。
```

## 修复结果

- 结果页写入真实 `wepictool_records`，以 `projectId`（并兼容旧 taskId）去重、保留原记录时间、最多保留 20 条。
- 仅在缓存卡片与选中 `editedScenes` 的 sceneId、role、order 完整一致且 URL 非空时复用；否则重新请求渲染。
- `funtext` 只接受 version 1；其他版本不渲染、不写任何历史或记录，并显示“该记录版本暂不支持”。
- 重开趣味字画记录只发一个 event；`outfit`、`dressup`、`layered-dressup`、`funtext`、`bigtext` 均有明确路径。未知类型只提示“该记录版本暂不支持”，不导航、不删除。
- 旧大字提示固定为“旧大字滑卡记录暂不支持直接打开，请重新制作”，不宣称已发布。

## 完整验证

```text
npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs && git diff --check
PASS：167 项测试通过，0 失败；全部治理检查通过。
```

## Round 2：审查探针修复

### 新发现根因

1. 第一轮缓存判断只比较 sceneId、role、order 和非空 URL，没有证明卡片来自当前项目、当前候选与当前场景内容；`wxfile://`、本地路径及脚本/内联 URL 也会被误当成可跨会话复用的地址。
2. 记录恢复优先采用 `taskSnapshot.projectSnapshot`，未核对它与记录顶层 `projectSnapshot` 是否一致，也未验证 task 的 funtext 类型与 canonical projectId。
3. 第一轮 upsert 会把任意类型的同名 `projectId` / `taskId` 当作趣味字画记录删除；funtext 记录自身字段冲突时也会直接覆盖旧数据。
4. 结果页没有 request generation。旧远端成功、旧远端失败和已进入 Canvas callback/导出循环的旧本地请求，都能在新项目或新重试成功后改写页面与本地记录。

### Round 2 TDD 证据

```text
node --test tests/fun-text-result.test.cjs tests/fun-text-record.test.cjs
RED：22 项中 11 项通过、11 项失败；四类审查缺口均被独立行为测试稳定复现。

node --test --test-name-pattern='retry taps' tests/fun-text-result.test.cjs
RED：1 项失败；pending 状态下重试会发起第二个请求。

node --test --test-name-pattern='render fingerprint is deterministic' tests/fun-text-project.test.cjs
RED：1 项失败；未排序的对象键会产生不同指纹。

node --test --test-name-pattern='malformed present funtext identity' tests/fun-text-result.test.cjs
RED：1 项失败；非字符串的显式 projectId 被静默忽略并错误覆盖旧记录。

代码审查增量 RED：旧记录缺失 record/task/card 指纹时仍发送 `acceptTaskData`；多个相同 canonical funtext 记录只移除首项。两项各 1 项失败。

node --test tests/fun-text-project.test.cjs tests/fun-text-result.test.cjs tests/fun-text-record.test.cjs
GREEN：41 项通过，0 项失败。
```

### Round 2 修复结果

- `funTextProject.createRenderFingerprint` 对实际高清渲染输入（项目/版本、sourceText、所选候选、视觉包与完整 scenes）做确定性键序序列化，并生成带版本与长度的稳定内容指纹。成功任务、记录和每张卡片均写入该指纹；缓存只有在 task/project/card 指纹全部与当前项目一致时才可复用。
- 可复用 URL 先 trim，且仅接受 `https://`、`http://`、`cloud://`；旧记录无指纹、`wxfile://`、本地路径、`javascript:`、`data:`、空值与空白值均强制重新渲染。
- 记录页以顶层 `projectSnapshot` 为恢复基准：只有有效 funtext task 内的项目与顶层渲染指纹一致时才单次发送 `acceptTaskData`，否则顶层项目有效时只发送 `funTextProject`。
- upsert 只认 `type === 'funtext'` 且所有显式身份字段均为非空字符串、值完全一致的 canonical identity；outfit/其他类型碰撞、funtext 内部冲突及畸形身份一律保留旧记录并新增当前结果。
- 结果页为每次初始化分配 generation；远端 success/catch、本地 Canvas callback、每次导出 await 前后和最终落库均验证当前 generation。pending 时忽略重试点击，旧请求不能覆盖页面或写历史/记录。

### Round 2 完整验证

```text
npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs && git diff --check
PASS：180 项测试通过，0 失败；全部治理检查通过。
```
