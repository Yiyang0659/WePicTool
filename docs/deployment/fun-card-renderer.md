# 趣味字画云托管服务部署指南（fun-card-renderer）

本文是 `fun-card-renderer` 的可重复部署与回滚手册，不是已部署证明。当前功能分支只完成代码和自动化验证；Docker 镜像、CloudBase 服务、线上端点、微信开发者工具、iOS、Android 和真实微信聊天均仍未验证。生产状态为 **NOT READY**：尤其是服务公网关闭设置尚未核验；代码检查通过不解除该阻塞。

## 1. 固定交付物与本地门禁

- 服务名：`fun-card-renderer`
- 构建目录：`miniprogram/cloudhosting/fun-card-renderer`
- 基础镜像：`node:20-bookworm-slim`，不得切换为 Alpine；原生 `@napi-rs/canvas` 必须在最终 Linux 镜像中重新验证。
- HTTP 实现：Node.js 内置 `node:http`，入口为 `index.js`，监听平台注入的 `PORT`。
- 字体：`fonts/LXGWMarkerGothic-Regular.ttf`
- 许可：`LICENSES/OFL-LXGWMarkerGothic.txt`（SIL OFL 1.1）

从仓库根目录运行：

```bash
npm test
npm run check:syntax
npm run check:miniprogram
npm run lint
npm run check:docs
npm --prefix miniprogram/cloudhosting/fun-card-renderer test
docker build -t wepictool-fun-card-renderer miniprogram/cloudhosting/fun-card-renderer
```

`docker build` 必须在有 Docker 的机器或 CI 中真实成功后才能记录为通过。不要用宿主机上的 Node 测试替代 Linux 镜像验证。

## 2. 创建服务、构建版本与切流

1. 在与目标小程序已关联的 CloudBase 环境进入「云托管」，创建服务 `fun-card-renderer`。
2. 选择 Dockerfile/源码构建，构建上下文填写 `miniprogram/cloudhosting/fun-card-renderer`，容器端口填写 `8080`。Dockerfile 会执行 `npm ci --omit=dev` 并以 `node index.js` 启动。
3. 创建不可变版本，建议版本名包含日期和 Git 短 SHA，例如 `renderer-20260903-8183e3f`；保存构建日志和对应提交号。
4. 在版本环境变量中设置：

   ```text
   NODE_ENV=production
   CLOUDBASE_ENV_ID=<真实 CloudBase 环境 ID>
   FUN_CARD_RENDERER_ACCESS_MODE=call-container-only
   ```

   `PORT` 由平台注入。生产版本不得设置 `FUN_CARD_RENDERER_DEV_MODE`；本地离线模拟只接受精确的 `NODE_ENV=development FUN_CARD_RENDERER_DEV_MODE=1`，NODE_ENV 缺失、staging 或 production 均不允许模拟。本地模拟仅供独立 renderer 工具/测试调用，小程序 POST 仍只走 `callContainer`。非模拟运行必须声明 `FUN_CARD_RENDERER_ACCESS_MODE=call-container-only`，缺失或不同值会在监听前拒绝启动；这只是部署意图声明，不会操作或验证 CloudBase 公网开关。缺少环境 ID、审核或存储能力也会关闭式失败。
5. 新版本构建完成后先保持旧版本 100% 流量；在控制台允许的情况下让新版本从 0% 或最小灰度流量开始，检查启动日志和下文冒烟，再逐步切到 100%。每次调整前记录旧/新版本流量比例和时间。

CloudBase 的资源模型是「服务 → 不可变版本 → 实例」，版本可按比例切流并回切。参见 [CloudBase 云托管资源模型](https://docs.cloudbase.net/run/introduction)。

## 3. 身份、权限与入口限制

### 3.1 服务运行身份

为运行身份按最小权限授予：

1. 调用微信 `security.msgSecCheck`；
2. 向当前环境云存储的 `funtext/` 前缀上传文件；
3. 删除同一前缀文件，用于失败回滚和过期补偿。

不得把 AppSecret、SecretId、SecretKey、OpenID 或任何服务端密钥写入 `miniprogram/config/env.js`、请求体或客户端请求头。服务端要求同时存在非空 `x-cloudbase-context` 和 `x-wx-openid`，缺失返回 `403 CALLER_UNAUTHORIZED`，不记录或回显 context。**头部存在性检查不是独立的公网鉴权，也不能从密码学上证明请求经过 callContainer。** 只有下节的私有访问边界经核验成立后，才能依赖平台注入身份；公网若误开放，攻击者仍可能伪造头部或轮换身份，必须阻止上线。

每 OpenID、每实例限制 30 次/分钟；过期身份在后续请求时清理，实例最多保留 10000 个活跃身份，满额时拒绝新身份而不重置既有配额。多实例的全局流量保护还应在 CloudBase 网关配置 QPS/告警，不能把进程内计数器当成全局配额。

### 3.2 私密 POST 与公开字体分离

以下均为上线硬前置条件，不是建议。发布负责人须填写结果并保存截图/配置导出和外部请求证据；任一未核验均保持 NOT READY：

- [ ] 「服务详情 → 服务设置」的“允许公网通过服务域名访问服务”开关已关闭。实际服务/版本：待填写；开关结果：**未验证**；核验人/时间/截图：待填写。
- [ ] 已盘点默认服务域名、自定义服务域名及 HTTP 网关所有绑定，两个 POST 端点均不对公网开放。实际结果：**未验证**。
- [ ] 外部网络对上述每个入口分别尝试 `/preview-stack`、`/render-stack`，包括无身份和人工测试头部请求，均在平台访问边界被拒绝、没有进入业务渲染/审核/上传。不能仅凭无头部请求收到应用层 403 就判通过。实际结果：**未验证**。
- [ ] 关联小程序通过 `callContainer` 成功、字体 GET 成功，且没有为此重新打开服务公网。实际结果：**未验证**。

配置步骤：

- 在「服务详情 → 服务设置 → 网络访问」关闭通过服务域名的公网入向访问；小程序的 `/preview-stack` 与 `/render-stack` 只通过 `wx.cloud.callContainer` 调用。
- 在 HTTP 网关绑定备案 HTTPS 域名，只新建精确触发路径 `/font/LXGWMarkerGothic-Regular.ttf`，关联 `fun-card-renderer` 并开启路径透传。不要为 `/`、`/preview-stack` 或 `/render-stack` 建公网路由。
- 按微信公众平台当前规则把该字体 HTTPS 域名加入小程序允许的网络域名；生产 POST 走 `callContainer`，不应为了 POST 再开放普通 request 域名。
- 服务本身只对字体路径接受 `GET`/`HEAD`，其他未注册方法/路径返回 404。上线后还要用公网请求确认两个 POST 路径不可达。

官方说明 `callContainer` 走私有链路，服务设置可关闭公网且默认公网不提供鉴权。参见 [小程序访问云托管](https://docs.cloudbase.net/run/develop/access/mini)、[公网访问与关闭位置](https://docs.cloudbase.net/run/deploy/networking/public) 和 [服务网络设置](https://docs.cloudbase.net/run/deploy/service-setting)。注意关闭服务域名公网并不关闭 HTTP 网关绑定，必须另行限制精确字体路径，参见 [CloudBase HTTP 配置说明](https://docs.cloudbase.net/run/related)。

### 3.3 小程序发布配置

```js
const CLOUD_ENV_ID = '<真实 CloudBase 环境 ID>';
const FUN_CARD_RENDERER_SERVICE = 'fun-card-renderer';
const FUN_CARD_RENDERER_URL = 'https://<仅公开字体路径的备案域名>';
const ENABLE_FUN_TEXT_STACK_ENTRY = true;
```

`FUN_CARD_RENDERER_URL` 只供 `wx.loadFontFace` 拼接字体 URL；生产 POST 不使用它，而是通过 `CLOUD_ENV_ID`、`FUN_CARD_RENDERER_SERVICE` 和 `X-WX-SERVICE` 调用容器。发布前运行：

```bash
FUN_CARD_RENDERER_ACCESS_MODE=call-container-only npm run check:miniprogram:release
```

入口为 `true` 时，环境 ID、服务名或 HTTPS 字体域名为空/占位/loopback（包括 IPv6 `::1`、IPv4 127/8、localhost 及规范化变体），或运行预检的发布环境未设置该 access mode，均非零退出。CI 与 CloudBase 版本必须使用同一发布配置，并单独核对平台实际环境变量；本地命令不是远端配置证明。入口开关必须是 `true`/`false` 布尔字面量。入口为 `false` 的静态回滚包不要求 renderer URL、服务名和 access mode，但仍检查通用 CloudBase 配置及源码/字体/许可完整性；预检成功不代表服务已可生产使用。

## 4. 可复制冒烟

先在 HTTP 网关验证唯一公开资源：

```bash
export WEPIC_FONT_BASE='https://<字体域名>'
curl --fail-with-body --silent --show-error \
  --output /tmp/wepictool-LXGWMarkerGothic-Regular.ttf \
  --write-out 'font HTTP %{http_code}\n' \
  "$WEPIC_FONT_BASE/font/LXGWMarkerGothic-Regular.ttf"
curl --silent --show-error --output /dev/null --write-out 'public render HTTP %{http_code}\n' \
  --request POST "$WEPIC_FONT_BASE/render-stack"
```

字体必须是 200。公网 POST 必须在平台访问边界被拒绝；上述 curl 只做初筛，业务层 `CALLER_UNAUTHORIZED` 的 403 本身不能证明公网已关闭。必须完成 3.2 中全部域名、两个 POST 路径及测试头部的核验，并确认未触发业务处理；绝不能把携带头部可调用的公网接口当作通过。

再把下面整段复制到已关联目标环境的微信开发者工具 Console。它只使用 `callContainer`，不会由客户端构造 OpenID：

```js
const WEPIC_ENV = '<真实 CloudBase 环境 ID>';
const WEPIC_SERVICE = 'fun-card-renderer';
const WEPIC_STYLES = [
  ['pink-note-v1', 'pink-note-01', '#FCE4EC'],
  ['chalk-chaos-v1', 'chalk-board-01', '#24303A'],
  ['paper-collage-v1', 'paper-collage-01', '#F4EAD7']
];
function wepicScene(prefix, order, text, background, color) {
  return {
    sceneId: `scene_${prefix}_${order}`,
    order,
    width: 1080,
    height: 1080,
    background: { assetKey: background, color },
    layers: [{
      id: 'text_main', type: 'text', text, lines: [text],
      effectKey: 'marker-bold', fontSize: 180, lineHeight: 210,
      x: 540, y: 520, rotation: 0, scale: 1,
      color: '#171717', align: 'center'
    }]
  };
}
function wepicRenderPayload(text = '上线冒烟测试') {
  return {
    projectId: 'funtext_smoke_20260903',
    candidateId: 'candidate_smoke_render',
    sourceText: text,
    stylePackId: WEPIC_STYLES[0][0],
    scenes: [1, 2, 3].map((order) =>
      wepicScene('render', order, text, WEPIC_STYLES[0][1], WEPIC_STYLES[0][2]))
  };
}
function wepicPreviewPayload(text = '上线冒烟测试') {
  return {
    projectId: 'funtext_smoke_20260903',
    sourceText: text,
    candidates: WEPIC_STYLES.map((style, index) => ({
      candidateId: `candidate_smoke_${index + 1}`,
      stylePackId: style[0],
      scenes: [1, 2, 3].map((order) =>
        wepicScene(`preview_${index + 1}`, order, text, style[1], style[2]))
    }))
  };
}
async function wepicCall(path, data, service = WEPIC_SERVICE) {
  const response = await wx.cloud.callContainer({
    config: { env: WEPIC_ENV },
    path,
    method: 'POST',
    header: { 'X-WX-SERVICE': service, 'content-type': 'application/json' },
    data
  });
  console.log(path, response.statusCode, response.data);
  return response;
}
```

依次执行并保存 Console 输出：

```js
const preview200 = await wepicCall('/preview-stack', wepicPreviewPayload());
console.assert(preview200.statusCode === 200 && preview200.data.ok === true);
const render200 = await wepicCall('/render-stack', wepicRenderPayload());
console.assert(render200.statusCode === 200 && render200.data.ok === true);
console.assert(render200.data.cards.every((card) => /^cloud:\/\//.test(card.url)));
```

200 响应的 `cards[].url`/`fileId` 是 `cloud://` fileID，不是永久公网 URL；客户端通过云文件 API 下载，不能把临时 HTTPS URL 持久化成历史记录。

403 和 503 只在隔离的预发布环境验证：

```js
const REVIEWED_UNSAFE_TEXT = '<替换为团队审批过的微信内容安全违规测试样例>';
const unsafe403 = await wepicCall('/render-stack', wepicRenderPayload(REVIEWED_UNSAFE_TEXT));
console.assert(unsafe403.statusCode === 403 && unsafe403.data.code === 'CONTENT_UNSAFE');

// 先让隔离预发布服务的运行身份暂时无权调用 msgSecCheck；严禁在生产服务上做此故障注入。
const unavailable503 = await wepicCall(
  '/render-stack',
  wepicRenderPayload('审核故障注入'),
  'fun-card-renderer-safety-denied'
);
console.assert(unavailable503.statusCode === 503 && unavailable503.data.code === 'SAFETY_UNAVAILABLE');
```

503 验证后立即恢复预发布权限并重新验证 200。若没有隔离环境或审批过的违规样例，应明确记录 403/503「未验证」，不得拿单元测试冒充线上冒烟。

## 5. 48 小时生命周期与残留补偿

云存储路径固定为：

```text
funtext/<projectId>/<candidateId>/preview/<order>.png
funtext/<projectId>/<candidateId>/final/<order>.png
```

在承载 CloudBase 云存储的 COS 存储桶配置一条启用的生命周期规则：作用前缀 `funtext/`，当前版本对象在 2 天后过期删除，即本项目统一的 48 小时目标保留期；不要使用 24–72 小时浮动口径。COS 按日扫描并异步执行，48 小时是策略目标而非分钟级删除承诺，参见 [COS 生命周期说明](https://cloud.tencent.com/document/product/436/17031)。

上传批次任一绘制、上传或响应一致性检查失败时，代码会对本批已得到的 fileID 调用 `deleteFile`；该回滚是 best-effort，删除失败不会覆盖原始 `RENDER_FAILED`。因此还必须配置独立补偿：

- 每日检查生命周期规则仍启用且前缀、2 天过期条件未漂移；
- 监控 `funtext/` 中超过 48 小时的对象数量/字节数，并在持续两个扫描周期仍未下降时告警；
- 由独立定时清理任务列出超期 fileID，先输出 dry-run 清单，再批量删除；清理身份只授予 `funtext/` 前缀权限；
- 对回滚删除错误、超期残留量和清理失败数建立日志指标，保留 project/candidate/path 和 CloudBase request ID，禁止记录用户原文或密钥。

## 6. 回切与入口紧急关闭

### 6.1 服务版本回切

1. 停止继续放量，把上一已知稳定版本恢复为 100%，问题版本降到 0%。
2. 用字体、preview、render、403/503 矩阵重新冒烟；同时检查 5xx、429、审核异常和存储回滚告警。
3. 保留问题版本及构建日志用于排查，不要先删除证据。确认稳定后再决定修复或下线。

### 6.2 小程序入口紧急关闭

若服务无法安全提供但仍需发布小程序，把：

```js
const ENABLE_FUN_TEXT_STACK_ENTRY = false;
```

提交并重新构建/上传小程序。关闭后首页仍展示包内五张静态示例，点击也不会导航；输入/候选/编辑直链不生成、不恢复项目，记录页不打开或再次生成 funtext/旧 bigtext，结果页不恢复卡片、不渲染/重试/编辑/预览/保存，原记录不删除。分层云换装等其他能力不受影响。

静态回滚包运行 `npm run check:miniprogram:release` 即可，不需要 renderer HTTPS、服务名或 access mode。它只关闭新发布小程序包的趣味字画能力，不会追溯关闭旧客户端，也不是服务停用开关；紧急事件仍须通过平台关闭受影响服务访问/回切版本。恢复 `true` 前先补齐发布环境声明，验证 3.2 私网边界与线上冒烟，再发布新版本。

仅清空 `FUN_CARD_RENDERER_URL` 不是完整应急方案：它只会让字体加载失败，不能保证所有趣味字画入口关闭。入口 flag 与云托管版本回切可以独立使用。

## 7. 发布证据清单

每次发布在当天迭代日志记录：Git SHA、镜像/版本名、构建结果、环境变量键名（不记秘密值）、access mode 值、3.2 公网开关核验人/时间/结果及截图、服务权限、网络入口、流量变化、字体/preview/render/403/503 实际状态码、返回的 `cloud://` 形态、48 小时规则截图或导出、回切目标版本，以及微信开发者工具/iOS/Android/真实聊天中哪些已验证或未验证。当前这些平台证据均未取得，生产仍为 NOT READY。
