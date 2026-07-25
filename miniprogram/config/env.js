// 上线前把这里替换为微信云开发控制台里的环境 ID，例如 "prod-xxxxxx"。
// 未配置时会进入本地预览模式，方便先在微信开发者工具里跑通页面流程。
const CLOUD_ENV_ID = 'cloud1-d0g1blfsde474b168';
// 云托管 text-card-renderer 部署完成后，填写其 HTTPS 访问地址（不带末尾 /）。
// 留空时编辑页仍可预览排版，但不会生成最终手写 PNG，避免绕过云端内容审核。
const TEXT_CARD_RENDERER_URL = '';

module.exports = {
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  ENABLE_LOCAL_MOCK: !CLOUD_ENV_ID,
  TEXT_CARD_RENDERER_URL: TEXT_CARD_RENDERER_URL
};
