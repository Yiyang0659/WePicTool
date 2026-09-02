# Task 10 Fix Report

## Scope

Fix the Task 10 review findings from base `8660870` without deploying, publishing, changing external services, or expanding the editor/result feature set.

## Root Cause

- `template-result.initProject` caught every renderer exception and unconditionally invoked local Canvas export. This erased the distinction already defined by `funCardRendererClient`: `CONTENT_UNSAFE`, `SAFETY_UNAVAILABLE`, and `INVALID_RENDER_RESPONSE` are fail-closed outcomes, while only `FUN_RENDERER_NOT_CONFIGURED` and `NETWORK_ERROR` describe an unavailable renderer connection suitable for offline fallback.
- The shared HTTP exporter validated only `tempFilePath`, not `statusCode`.
- The Task 10 dressup migration called the shared exporter directly and left the page's existing `/assets/` copy routine outside the new save loop.
- `buildPreviewGroups` used the selected candidate title as the group name even though the product name is fixed.

## RED

Before production edits:

```text
node --test tests/image-exporter.test.cjs tests/fun-text-result.test.cjs tests/fun-text-project.test.cjs tests/layered-dressup.test.cjs
40 tests: 35 passed, 5 failed
```

The five failures proved the intended breaks:

- both preview assertions received candidate titles instead of `趣味字画`;
- `CONTENT_UNSAFE` started a local Canvas query;
- an HTTP 404 with a temporary path resolved successfully;
- a built-in dressup asset was sent directly to album save without a `USER_DATA_PATH` write.

## GREEN

- Added an exact local-fallback allowlist for `FUN_RENDERER_NOT_CONFIGURED` and `NETWORK_ERROR`. Safety, response, runtime, and unknown errors now leave the result page failed and cannot create a history task.
- Rejected present, malformed, or non-2xx HTTP status codes before consuming `tempFilePath`.
- Added an optional per-item resolver to the shared sequential exporter; dressup supplies its existing `resolveImageFilePath`, preserving sequential copy/download/save behavior and existing messages.
- Fixed fun-text preview group name to `趣味字画`; card and payload ratio remain `1:1`.
- Kept the optional `result.js` dead-code cleanup out of scope.

Focused evidence:

```text
node --test tests/image-exporter.test.cjs tests/fun-text-result.test.cjs tests/fun-text-project.test.cjs tests/layered-dressup.test.cjs
40 passed, 0 failed

node --test tests/image-exporter.test.cjs tests/fun-text-result.test.cjs tests/layered-dressup.test.cjs && npm run check:miniprogram
26 passed, 0 failed; mini-program preflight passed
```

## Full Verification

```text
npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs && git diff --check
161 passed, 0 failed; all listed checks exited 0
```

README does not need an update because this is a compatibility and fail-closed correction to existing flows; routes, run commands, deployment instructions, and external feature scope are unchanged.
