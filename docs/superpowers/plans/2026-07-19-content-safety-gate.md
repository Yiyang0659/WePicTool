# 上线内容安全审核门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户上传图片进入 AI 前完成全量安全审核，并在保存反馈文本前完成文本安全审核。

**Architecture:** 将不依赖微信 SDK 的审核结果映射、MIME 推断和两并发批处理放入 `processOutfit/contentSafety.js`，以 Node 测试覆盖。`processOutfit` 使用该模块封装微信同步图片审核，作为分类/抠图前的全量门禁；新的 `contentGuard` 云函数处理反馈文本，客户端只根据结构化结果展示提示。

**Tech Stack:** 原生微信小程序、微信云开发 `wx-server-sdk`、微信 OpenAPI 内容安全接口、Node 内置测试运行器、CommonJS。

## Global Constraints

- 图片全部上传后以最多 2 张并发完成审核；所有图片通过前，禁止调用 DashScope 分类或抠图。
- `errCode === 0` 视为通过，`errCode === 87014` 视为违规，其他返回与异常均视为安全服务不可用并拦截。
- 图片违规或审核异常时，前端不得跳转结果页；违规任务的源图文件要尽力删除，删除失败只记录日志且不放行。
- 文本反馈只在提交时审核一次；违规或审核服务异常时不得写入 `wepictool_feedbacks`。
- OpenAPI 权限通过云函数目录 `config.json` 声明，客户端不保存 AppSecret。

---

### Task 1: 写入并验证纯审核判定与并发控制

**Files:**
- Create: `tests/content-safety.test.cjs`
- Create: `miniprogram/cloudfunctions/processOutfit/contentSafety.js`

**Interfaces:**
- Produces `assessSecurityResponse(response) -> { ok: boolean, code: 'OK' | 'CONTENT_UNSAFE' | 'SAFETY_UNAVAILABLE' }`.
- Produces `inferImageMimeType(fileId) -> string`.
- Produces `mapWithConcurrency(items, limit, worker) -> Promise<Array>` with at most `limit` active workers.

- [x] **Step 1: Write failing tests**

```js
test('maps WeChat security responses to stable product codes', () => {
  assert.deepEqual(plain(assessSecurityResponse({ errCode: 0 })), { ok: true, code: 'OK' });
  assert.deepEqual(plain(assessSecurityResponse({ errCode: 87014 })), { ok: false, code: 'CONTENT_UNSAFE' });
  assert.deepEqual(plain(assessSecurityResponse({ errCode: 44991 })), { ok: false, code: 'SAFETY_UNAVAILABLE' });
});

test('limits image audit work to two concurrent calls', async () => {
  let active = 0;
  let peak = 0;
  const output = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
    return item * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(plain(output), [2, 4, 6, 8, 10]);
});
```

- [x] **Step 2: Run tests to verify RED**

Run: `node --test tests/content-safety.test.cjs`

Expected: FAIL because `contentSafety.js` does not yet exist.

- [x] **Step 3: Implement minimal pure helpers**

```js
function assessSecurityResponse(response) {
  var errCode = response && Number(response.errCode);
  if (errCode === 0) return { ok: true, code: 'OK' };
  if (errCode === 87014) return { ok: false, code: 'CONTENT_UNSAFE' };
  return { ok: false, code: 'SAFETY_UNAVAILABLE' };
}
```

Implement bounded workers using a shared `nextIndex` counter and `Promise.all` over `Math.min(limit, items.length)` worker loops; preserve output order by writing each worker result into its original index.

- [x] **Step 4: Run tests to verify GREEN**

Run: `node --test tests/content-safety.test.cjs`

Expected: PASS.

### Task 2: 让 processOutfit 在 AI 前执行图片全量门禁

**Files:**
- Modify: `miniprogram/cloudfunctions/processOutfit/index.js:1-656`
- Create: `miniprogram/cloudfunctions/processOutfit/config.json`
- Modify: `tests/content-safety.test.cjs`

**Interfaces:**
- Consumes `assessSecurityResponse`, `inferImageMimeType`, `mapWithConcurrency`.
- Produces `{ status: 'blocked', error: { code: 'CONTENT_UNSAFE' | 'SAFETY_UNAVAILABLE', message: string } }` when the group cannot pass the gate.

- [x] **Step 1: Write failing static contracts**

```js
test('processOutfit declares image safety permission and gates AI after auditing images', () => {
  const source = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/processOutfit/index.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/processOutfit/config.json'), 'utf8');
  assert.match(config, /security\.imgSecCheck/);
  assert.ok(source.indexOf('await auditImages(normalizedImages)') < source.indexOf('await classifyImages(normalizedImages, apiKey)'));
});
```

- [x] **Step 2: Run test to verify RED**

Run: `node --test tests/content-safety.test.cjs`

Expected: FAIL because neither gate nor permission file exists.

- [x] **Step 3: Implement gate and cleanup**

Add `auditSingleImage(image)` that downloads the `cloud://` file and calls `cloud.openapi.security.imgSecCheck({ media: { contentType, value } })`. Add `auditImages(images)` using `mapWithConcurrency(images, 2, auditSingleImage)`, return the first blocked result after all workers settle, and call `cloud.deleteFile({ fileList })` for source IDs if blocked. In `exports.main`, invoke the gate before `classifyImages`; return the structured blocked object rather than throwing into the generic mock fallback.

Create `config.json`:

```json
{
  "permissions": {
    "openapi": ["security.imgSecCheck"]
  }
}
```

- [x] **Step 4: Run targeted checks**

Run: `node --test tests/content-safety.test.cjs && node --check miniprogram/cloudfunctions/processOutfit/index.js`

Expected: PASS.

### Task 3: 审核反馈文本并呈现清晰的客户端失败状态

**Files:**
- Create: `miniprogram/cloudfunctions/contentGuard/index.js`
- Create: `miniprogram/cloudfunctions/contentGuard/package.json`
- Create: `miniprogram/cloudfunctions/contentGuard/config.json`
- Modify: `miniprogram/pages/profile/profile.js:103-129`
- Modify: `miniprogram/pages/index/index.js:440-474`
- Modify: `tests/content-safety.test.cjs`

**Interfaces:**
- `contentGuard` consumes `{ content: string }` and returns `{ ok, code }` using `security.msgSecCheck`.
- `processOutfit` blocked return is consumed by `createProcessingTask` before its `taskId` branch.

- [x] **Step 1: Write failing static contracts**

```js
test('feedback and image processing route unsafe responses through cloud content checks', () => {
  const guard = fs.readFileSync(path.join(root, 'miniprogram/cloudfunctions/contentGuard/index.js'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'miniprogram/pages/profile/profile.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8');
  assert.match(guard, /cloud\.openapi\.security\.msgSecCheck/);
  assert.match(profile, /name:\s*'contentGuard'/);
  assert.match(index, /CONTENT_UNSAFE/);
});
```

- [x] **Step 2: Run test to verify RED**

Run: `node --test tests/content-safety.test.cjs`

Expected: FAIL because the new cloud function and client checks do not exist.

- [x] **Step 3: Implement minimal client and cloud behavior**

Create `contentGuard` with `security.msgSecCheck` permission and normalized `{ ok, code }` result. Make `onSubmitFeedback` asynchronous: call the cloud function first, show a user-safe failure toast when it returns non-OK or fails, and execute the existing local storage code only on `ok === true`. In `createProcessingTask`, detect `CONTENT_UNSAFE` and `SAFETY_UNAVAILABLE` before the normal `taskId` branch and show non-technical modal text without navigating.

- [x] **Step 4: Run targeted checks**

Run: `node --test tests/content-safety.test.cjs && npm run check:syntax && npm run check:miniprogram`

Expected: PASS.

### Task 4: 同步产品契约并完成验证

**Files:**
- Modify: `docs/product/TECHNICAL_SPEC.md`
- Modify: `docs/product/PROJECT_STATUS.md`
- Modify: `docs/superpowers/plans/2026-07-19-content-safety-gate.md`

**Interfaces:**
- Consumes implemented two-concurrent image gate and feedback guard.
- Produces accurate release declaration guidance: image/text UGC uses platform content security APIs.

- [x] **Step 1: Update documents**

Record the image gate before DashScope, the two-concurrent all-pass condition, fail-closed handling, file cleanup, and text feedback gate in `TECHNICAL_SPEC.md`; append a dated `PROJECT_STATUS.md` update.

- [x] **Step 2: Run full verification**

Run: `npm test && npm run lint && npm run check:syntax && npm run check:miniprogram && git diff --check`

Expected: all commands return exit code 0.

- [x] **Step 3: Commit**

```bash
git add miniprogram/cloudfunctions/processOutfit miniprogram/cloudfunctions/contentGuard miniprogram/pages/index/index.js miniprogram/pages/profile/profile.js tests/content-safety.test.cjs docs/product/TECHNICAL_SPEC.md docs/product/PROJECT_STATUS.md docs/superpowers/plans/2026-07-19-content-safety-gate.md
git commit -m "feat: add content safety gate"
```
