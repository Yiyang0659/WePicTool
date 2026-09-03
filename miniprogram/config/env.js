// 上线前把这里替换为微信云开发控制台里的环境 ID，例如 "prod-xxxxxx"。
// 未配置时会进入本地预览模式，方便先在微信开发者工具里跑通页面流程。
const CLOUD_ENV_ID = 'cloud1-d0g1blfsde474b168';
// POST 生产请求通过 wx.cloud.callContainer 调用该服务名，不在客户端保存任何服务端秘密。
const FUN_CARD_RENDERER_SERVICE = 'fun-card-renderer';
// 字体公开 HTTPS 地址；只有明确的本机 loopback 地址会让 POST 在开发时改走 wx.request。
const FUN_CARD_RENDERER_URL = 'http://127.0.0.1:8080';
// 紧急发布回滚开关：false 时保留首页五张静态示例，但关闭趣味字画交互入口。
const ENABLE_FUN_TEXT_STACK_ENTRY = true;

module.exports = {
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  ENABLE_LOCAL_MOCK: !CLOUD_ENV_ID,
  ENABLE_FUN_TEXT_STACK_ENTRY: ENABLE_FUN_TEXT_STACK_ENTRY,
  FUN_CARD_RENDERER_SERVICE: FUN_CARD_RENDERER_SERVICE,
  FUN_CARD_RENDERER_URL: FUN_CARD_RENDERER_URL
};
