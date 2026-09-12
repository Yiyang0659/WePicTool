# renderer 微信审核鉴权修复（已确认，分支实施中）

## 已确认的可信身份补充

用户确认继续修复入口：客户端每次preview/render前wx.login取得一次性code，随callContainer头部发送；HTTPS模式服务端仅以固定微信code2session接口核验得到的OpenID作为审核及限流身份，忽略自报body/header身份。5秒可取消超时、每实例最多8个并发核验，失败不生成。code/session_key不记录、不缓存、不持久化；无需新存储或网络资源。旧SDK模式仅显式回滚保留，不在登录失败时自动降级。

## 证据与边界

- 原环境cloud1-d0g1blfsde474b168的009容器缺少SDK微信令牌来源；腾讯云凭据独立上传/删除成功。
- 用户截图中的微信云托管prod为不同环境且服务为空。不得在那里新增服务来冒充修复原环境。
- 本次只读服务配置未发现AppID/AppSecret或WX/WECHAT相关环境变量键。现有index.js:28只传content；server.js:46仅按errCode判断，不能直接用于2.0审核。
- 沿用现有服务、字体、存储和客户端callContainer；不改VPC/子网/NAT/CDN，不合并或推送。以下为方案，不是已实现或已部署。

## 最小方案

1. 增加明确可回滚的审核模式：既有SDK模式保留；显式启用微信HTTPS模式时，使用仅服务端保存的WECHAT_APP_ID和WECHAT_APP_SECRET。
2. POST https://api.weixin.qq.com/cgi-bin/stable_token，force_refresh=false；按expires_in缓存，合并并发获取，临近过期重新获取。鉴权失效仅受控重试一次，不强制刷新影响其他实例，不落盘token。
3. 将请求上下文中的OpenID显式传到审核层（不能信任请求body自报身份），请求2.0接口并传version=2、scene=4和content。文本长度满足2500字上限，超限不得静默截断漏审。
4. 仅errcode=0且result.suggest=pass放行；risky/review阻止生成；未知结果、超时、鉴权失败关闭式返回审核不可用。不得用HTTP200或errcode=0代替审核通过。
5. HTTP请求设置可取消的超时；日志只记阶段、错误码和安全的trace_id，不记正文、openid、密钥、token或带token的URL。
6. 小范围回归覆盖缓存/并发、过期、失败、pass/risky/review和OpenID传递。用户配置后先验证一次token获取和固定短文本审核，再决定部署到原服务并验证三字体成图与存储。

## 配置和停止条件

- 需要用户配置小程序AppSecret，而不是腾讯云SecretKey；不能把它放入小程序env.js或Git。
- stable_token官方列出40164（IP不在白名单）及管理员确认类错误。若出现，立即报告；不得自行新建固定IP/NAT或放宽白名单，也不承诺当前动态出站能永久满足要求。
- 现有公网入口仅检查头部存在，尚未建立可信身份边界；不得因审核成功就宣称可上线。启用前必须核对实际入口身份可信性，若需变更鉴权或网络，另行确认，不能扩大凭据使用面。
- 新审核接入方式需用户确认后写实施计划和改代码；目前不部署。

## 官方依据

- https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-access-token/api_getstableaccesstoken.html
- https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html
