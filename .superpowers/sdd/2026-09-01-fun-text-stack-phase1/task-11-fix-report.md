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
