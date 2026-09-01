// 上线前把这里替换为微信云开发控制台里的环境 ID，例如 "prod-xxxxxx"。
// 未配置时会进入本地预览模式，方便先在微信开发者工具里跑通页面流程。
const CLOUD_ENV_ID = 'cloud1-d0g1blfsde474b168';
// 云托管的 HTTPS 地址；留空时趣味字画预览会明确提示字体服务未配置。
const FUN_CARD_RENDERER_URL = '';

module.exports = {
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  ENABLE_LOCAL_MOCK: !CLOUD_ENV_ID,
  FUN_CARD_RENDERER_URL: FUN_CARD_RENDERER_URL
};
