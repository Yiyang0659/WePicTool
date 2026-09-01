# 趣味字画云托管服务部署指南 (fun-card-renderer)

本文档说明趣味字画（`fun-text-stack`）后端云托管渲染服务 `fun-card-renderer` 的构建、部署、权限配置、健康检查与运维清理规则。

---

## 1. 服务概览与构建信息

- **服务名称**：`fun-card-renderer`
- **构建目录**：`miniprogram/cloudhosting/fun-card-renderer`
- **运行时环境**：Node.js 20（Alpine / Debian Linux）
- **核心依赖**：`@napi-rs/canvas`（Linux x86_64 / arm64 确定性画笔）、`wx-server-sdk`（云存储与内容安全）、`express`
- **内置字体与许可**：`fonts/LXGWMarkerGothic-Regular.ttf`（基于 SIL Open Font License 1.1 许可分发，随服务保存于 `LICENSES/OFL-LXGWMarkerGothic.txt`）

---

## 2. 权限与环境变量配置

### 2.1 服务账号与云开发权限
部署在微信云托管（CloudBase）环境时，确保服务绑定对应的云开发环境，并具备以下权限：
1. **内容安全接口**：调用 `security.msgSecCheck` 进行单次聚合文字二次审核；
2. **云存储写入与删除**：写入 `funtext/<projectId>/<candidateId>/...` 路径并具备失败回滚删除权限。

### 2.2 小程序端配置
在小程序代码 `miniprogram/config/env.js` 中填写云托管分配的公网 HTTPS 域名：

```js
const FUN_CARD_RENDERER_URL = 'https://fun-card-renderer-xxxxxx.service.tcloudbase.com';
```

若留空，小程序端在无法加载本地字体时会显示明确未配置提醒，避免静默使用系统字体冒充。

---

## 3. 端点契约与冒烟验证

### 3.1 字体分发端点 (GET)
- **URL**：`GET /font/LXGWMarkerGothic-Regular.ttf`
- **响应头**：`Access-Control-Allow-Origin: *`, `Content-Type: font/ttf`
- **冒烟命令**：
  ```bash
  curl -I https://<FUN_CARD_RENDERER_URL>/font/LXGWMarkerGothic-Regular.ttf
  ```
- **预期**：HTTP 200，支持跨域加载供小程序的 `wx.loadFontFace` 下载。

### 3.2 低清三候选预览端点 (POST)
- **URL**：`POST /preview-stack`
- **输入**：`{ projectId, sourceText, candidates: [{ candidateId, stylePackId, scenes }] }`
- **输出**：360×360 PNG 临时访问链接集合。
- **作用**：当小程序端 Canvas 字体加载失败时，批量降级获取三套候选的真实手写低清图。

### 3.3 高清 1080 渲染端点 (POST)
- **URL**：`POST /render-stack`
- **输入**：`{ projectId, candidateId, sourceText, stylePackId, scenes }`
- **输出**：1080×1080 高清 PNG 文件链接。

### 3.4 审核门禁与状态码规范
| 场景 | 状态码 | 响应报文特征 | 说明 |
| :--- | :--- | :--- | :--- |
| 合规场景渲染 | `200 OK` | `{ ok: true, projectId, candidateId, cards: [...] }` | 渲染成功并返回顺序卡片 |
| 参数或图层超限 | `400 Bad Request` | `{ ok: false, code: 'INVALID_REQUEST' }` | 场景结构或白名单校验不合法 |
| 包含敏感文字 | `403 Forbidden` | `{ ok: false, code: 'CONTENT_UNSAFE' }` | 二次审核拦截，禁止绘制与上传 |
| 安全审核服务异常 | `503 Service Unavailable` | `{ ok: false, code: 'SAFETY_UNAVAILABLE' }` | Fail-Closed 门禁拒绝渲染 |
| 渲染/上传异常 | `500 Internal Error` | `{ ok: false, code: 'RENDER_FAILED' }` | 服务异常，自动回滚已上传文件 |

---

## 4. 云存储管理与自动清理策略

1. **存储路径规范**：
   - 预览图：`funtext/<projectId>/<candidateId>/preview/<order>.png`
   - 高清成品：`funtext/<projectId>/<candidateId>/final/<order>.png`
2. **生命周期规则**：
   - 在 CloudBase 云存储控制台配置对象生命周期规则；
   - 对 `funtext/` 前缀对象设置 **24 ~ 72 小时自动过期删除**，避免长期存储占用。
3. **事务回滚机制**：
   - 当多张卡片上传过程中任一张失败，服务端会自动调用 `deleteFile` 清理该批次已写入的所有云存储文件。

---

## 5. 离线降级与应急回滚

1. **离线静态示例保证**：
   - 首页内置 5 张由 `scripts/render-demo.js` 预渲染的真实 PNG 示例，不依赖云托管运行状态，冷启动即展示；
2. **端侧优先渲染**：
   - 候选卡与轻编辑页优先通过小程序原生 2D Canvas 绘制，不产生云端算力消耗；
3. **紧急降级预案**：
   - 若云托管出现区域网络故障，清空 `FUN_CARD_RENDERER_URL`，小程序将平稳进入“手写字体服务未配置”友好提示，保留项目数据供用户稍后重试。
