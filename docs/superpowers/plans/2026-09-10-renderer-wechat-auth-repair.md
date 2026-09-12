# 微信审核鉴权实施计划

用户已确认2026-09-10-renderer-wechat-auth-repair设计。

补充实施顺序：先增加wechatCaller.js的一次性code核验；index.js仅HTTPS模式强制接入；server.js使用核验身份；共享funCardRendererClient在每次请求前wx.login。补伪造header/无code/过期code/超时/真实身份传递与客户端失败测试，再做轻量检查和原服务部署。AppSecret已填并本机验证通过，不再等待填写。

1. 新增wechatSafety.js：固定HTTPS端点、stable_token非强制刷新、并发合并与内存缓存、可取消超时、严格2.0结果判定、脱敏诊断。
2. server.js只通过独立上下文向两种handler传递请求头OpenID，不从body取；index.js通过显式审核模式选择新实现，默认保留SDK回滚模式。
3. 根目录忽略文件.env.renderer.local作为用户填写入口；不被小程序或Docker打包、不自动注入线上；补Docker忽略规则。
4. 补充定向测试，执行语法/预检/TypeScript/文档检查，按用户轻量要求不重复全套耗时测试；记录实际结果。
5. 未取得AppSecret、未核对入口可信性前不启用/部署HTTPS模式。遇到IP白名单/平台限制停止并报告。无网络、云资源、主分支或GitHub变更。
