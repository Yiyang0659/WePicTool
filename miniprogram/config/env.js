// 上线前把这里替换为微信云开发控制台里的环境 ID，例如 "prod-xxxxxx"。
// 未配置时会进入本地预览模式，方便先在微信开发者工具里跑通页面流程。
const CLOUD_ENV_ID = 'cloud1-d0g1blfsde474b168';
// POST 生产请求通过 wx.cloud.callContainer 调用该服务名，不在客户端保存任何服务端秘密。
const FUN_CARD_RENDERER_SERVICE = 'fun-card-renderer';
// 仅用于授权字体加载；小程序 renderer POST 始终走 callContainer，不根据此 URL 改走 wx.request。
// 字体发布到 CloudBase 静态托管，通过 HTTPS/CDN 供开发者工具和真机共用。
const FUN_CARD_RENDERER_URL = 'https://cloud1-d0g1blfsde474b168-1451421513.tcloudbaseapp.com';
// 紧急发布回滚开关：false 保留首页静态示例，关闭输入/候选/编辑/记录恢复/渲染/保存。
const ENABLE_FUN_TEXT_STACK_ENTRY = true;
// 穿搭叠图中的可选 AI 添加方式。关闭后手动分层、系统素材、预览和保存仍完整可用。
const ENABLE_OUTFIT_AI_ASSIST = true;
// 011已通过真实单卡预览与含笔迹审核成图；false可回滚旧编辑入口。
const ENABLE_FUN_LOCAL_EDITOR = true;
// 本机字体轮廓预览：输入、候选与编辑不请求云端；保存仍审核。false回滚云端底图。
const ENABLE_FUN_OFFLINE_PREVIEW = true;

module.exports = {
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  ENABLE_LOCAL_MOCK: !CLOUD_ENV_ID,
  ENABLE_FUN_TEXT_STACK_ENTRY: ENABLE_FUN_TEXT_STACK_ENTRY,
  ENABLE_OUTFIT_AI_ASSIST: ENABLE_OUTFIT_AI_ASSIST,
  ENABLE_FUN_LOCAL_EDITOR: ENABLE_FUN_LOCAL_EDITOR,
  ENABLE_FUN_OFFLINE_PREVIEW: ENABLE_FUN_OFFLINE_PREVIEW,
  FUN_CARD_RENDERER_SERVICE: FUN_CARD_RENDERER_SERVICE,
  FUN_CARD_RENDERER_URL: FUN_CARD_RENDERER_URL
};
