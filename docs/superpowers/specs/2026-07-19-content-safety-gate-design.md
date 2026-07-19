# 上线内容安全审核门禁设计

**日期：** 2026-07-19

## 目标

在不把 AppSecret 暴露给客户端的前提下，对用户上传的图片和提交的反馈文本接入微信云调用内容安全审核；任何图片未通过或审核服务异常时，整组图片不得进入 DashScope 分类/抠图链路。

## 已确认的体验与处理口径

- 图片审核采用“全量门禁”：全部图片上传完成后，云函数以最多 2 张并发审核；只有所有图片通过，才启动既有 Qwen 分类与抠图。
- 任意一张图片判定违规，停止整组任务，不产生可展示的任务结果，不调用 Qwen，并删除本次已上传的源图文件。
- 审核接口超时、限流或发生未知错误时默认不放行（fail closed），提示用户稍后重试；不得回退到 mock 结果或继续 AI 处理。
- 反馈文本在用户点击“提交反馈”时检查一次；通过后沿用当前本地保存逻辑，未通过或安全服务异常时不保存。
- 页面提供阶段明确的等待反馈：图片审核期间显示“正在进行安全检查…”，审核通过后才显示既有“AI 正在识别…”文案。

## 技术设计

### 图片链路

`processOutfit` 在规范化输入图片后、调用 `classifyImages` 或任何 mock 分组前执行 `auditImages`：

1. 使用现有 `cloud.downloadFile` 获取用户已上传的云存储图片 Buffer。
2. 根据文件扩展名生成 MIME 类型，调用 `cloud.openapi.security.imgSecCheck({ media: { contentType, value: buffer } })`。
3. 审核器以 2 张为一批并行；返回 `errCode === 0` 的图片通过，`errCode === 87014` 视为违规，任何其他响应或异常视为安全服务不可用。
4. 审核器完整结束后再做决定：全部通过才调用 `classifyImages`；否则删除本次输入的所有 `cloud://` 源文件，向客户端返回无 `taskId` 的结构化失败结果。

同步 `imgSecCheck` 选择是刻意的：当前 `processOutfit` 是一次请求内返回完整结果的同步任务。较新的 `mediaCheckAsync` 需要保存待审核任务、配置异步结果回调与恢复队列；这超出本次上线门禁范围，后续任务量增加时再升级。

### 文本链路

新增独立 `contentGuard` 云函数，接收单一 `content` 字段，调用 `cloud.openapi.security.msgSecCheck` 并统一返回 `{ ok, code }`：

- 通过：`{ ok: true, code: 'OK' }`
- 违规：`{ ok: false, code: 'CONTENT_UNSAFE' }`
- 接口异常：`{ ok: false, code: 'SAFETY_UNAVAILABLE' }`

个人页在本地写入反馈前调用该云函数，根据固定错误码展示用户可理解的中文提示；客户端不接触微信 OpenAPI 凭据。

### 权限与错误边界

- `processOutfit/config.json` 显式声明 `security.imgSecCheck`。
- `contentGuard/config.json` 显式声明 `security.msgSecCheck`。
- 云函数异常捕获必须保留 `CONTENT_UNSAFE` 与 `SAFETY_UNAVAILABLE` 语义，禁止被通用异常处理转换成 mock 任务。
- 删除文件失败仅记录服务端日志；审核失败仍不得放行给 AI。

## 文件边界

| 文件 | 职责 |
| --- | --- |
| `miniprogram/cloudfunctions/processOutfit/contentSafety.js` | 图片安全结果的纯函数判定与 2 并发批处理；供 Node 测试。 |
| `miniprogram/cloudfunctions/processOutfit/index.js` | 调用微信图片安全 API、全量门禁、清理违规任务源文件、向客户端返回结构化结果。 |
| `miniprogram/cloudfunctions/processOutfit/config.json` | 声明图片安全云调用权限。 |
| `miniprogram/cloudfunctions/contentGuard/` | 反馈文本安全云函数及其 OpenAPI 权限声明。 |
| `miniprogram/pages/index/index.js` | 处理内容审核失败结果，避免跳转到结果页。 |
| `miniprogram/pages/profile/profile.js` | 在写入本地反馈前调用文本审核云函数。 |
| `tests/content-safety.test.cjs` | 覆盖通过、违规、服务异常与并发上限的纯逻辑。 |

## 验收

1. 合规图片在图片审核完成后才进入分类/抠图；审核函数的并发量不超过 2。
2. 任意一张返回 87014 时，分类与抠图均不调用；前端不跳转结果页，并显示合规提示。
3. 图片审核异常、限流或缺少预期响应时同样不进入 AI；前端提示服务暂不可用。
4. 合规反馈文本才写入 `wepictool_feedbacks`；违规/审核异常文本均不会保存。
5. `npm test`、`npm run lint`、`npm run check:syntax`、`npm run check:miniprogram` 通过；云函数部署后在微信开发者工具核对 OpenAPI 权限生效。
