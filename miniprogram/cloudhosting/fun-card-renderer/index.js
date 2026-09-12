'use strict';

const { createPngMaker, createSceneRenderer, createCardRollback } = require('./renderer');
const {
  createContentChecker,
  createRenderStackHandler,
  createPreviewStackHandler,
  createPreviewSceneHandler,
  createHttpServer
} = require('./server');
const { resolveRuntimeMode, assertCloudCapabilities } = require('./runtimeConfig');
const { createWechatSafety } = require('./wechatSafety');
const { createWechatCaller } = require('./wechatCaller');

function logWechatAuditError(detail) {
  const item = detail || {};
  // Keep diagnostics useful without ever logging credentials, identity or content.
  const safe = {
    code: typeof item.code === 'string' ? item.code : 'WECHAT_UNKNOWN_ERROR',
    api: typeof item.api === 'string' ? item.api : null,
    errcode: Number.isInteger(item.errcode) ? item.errcode : null,
    errmsg: typeof item.errmsg === 'string' ? item.errmsg.slice(0, 256) : null,
    rid: typeof item.rid === 'string' ? item.rid : null,
    httpStatus: Number.isInteger(item.httpStatus) ? item.httpStatus : null,
    time: typeof item.time === 'string' ? item.time : new Date().toISOString(),
    contentHash: typeof item.contentHash === 'string' ? item.contentHash : null,
    traceId: typeof item.traceId === 'string' ? item.traceId : null
  };
  console.error('[fun-card-renderer] content audit failed ' + JSON.stringify(safe));
}

function start(environment) {
  const env = environment || process.env;
  const runtime = resolveRuntimeMode(env);
  const safetyMode = env.FUN_CARD_SAFETY_MODE || 'cloud-sdk';
  if (!['cloud-sdk', 'wechat-https'].includes(safetyMode)) {
    throw new Error('Invalid FUN_CARD_SAFETY_MODE');
  }
  const httpsChecker = !runtime.devMode && safetyMode === 'wechat-https'
    ? createWechatSafety({
      appId: env.WECHAT_APP_ID,
      appSecret: env.WECHAT_APP_SECRET,
      onError: logWechatAuditError
    }) : null;
  const cloud = runtime.devMode ? null : require('wx-server-sdk');
  const logStage = (stage, detail) => {
    console.log('[fun-card-renderer] stage=' + stage + ' ' + detail);
  };

  if (!runtime.devMode) {
    cloud.init({ env: runtime.cloudEnvId });
    assertCloudCapabilities(cloud);
  }

  const checkContent = runtime.devMode
    ? async () => ({ ok: true, code: 'OK' })
    : httpsChecker || createContentChecker(
      ({ content }) => cloud.openapi.security.msgSecCheck({ content }),
      (error) => {
        console.error('[fun-card-renderer] content audit failed:', error && (error.errMsg || error.message || error));
      }
    );

  async function uploadBuffer(buffer, cloudPath) {
    if (runtime.devMode) {
      return { fileId: cloudPath, url: 'data:image/png;base64,' + buffer.toString('base64') };
    }
    const result = await cloud.uploadFile({ cloudPath, fileContent: buffer });
    return { fileId: result.fileID, url: result.fileID };
  }

  async function deleteFile(fileId) {
    if (runtime.devMode) return;
    await cloud.deleteFile({ fileList: [fileId] });
  }

  const renderScenes = createSceneRenderer({
    checkImage: httpsChecker && httpsChecker.checkImage,
    makePng: createPngMaker(),
    uploadBuffer,
    deleteFile
  });
  const rollbackCards = createCardRollback(deleteFile);
  const dependencies = { checkContent, renderScenes, rollbackCards, logStage,
    imageSafetyEnabled: Boolean(httpsChecker && httpsChecker.checkImage) };
  const httpServer = createHttpServer({
    devMode: runtime.devMode,
    verifyCaller: httpsChecker ? createWechatCaller({
      appId: env.WECHAT_APP_ID, appSecret: env.WECHAT_APP_SECRET,
      onError: ({ code }) => console.error('[fun-card-renderer] caller auth failed: ' + code)
    }) : null,
    renderStackHandler: createRenderStackHandler(dependencies),
    previewStackHandler: createPreviewStackHandler(dependencies),
    previewSceneHandler: createPreviewSceneHandler(dependencies)
  });
  const port = Number(env.PORT || 8080);

  httpServer.listen(port, () => {
    console.log('[fun-card-renderer] listening on ' + port);
  });
  return httpServer;
}

if (require.main === module) {
  try {
    start(process.env);
  } catch (error) {
    console.error('[fun-card-renderer] startup refused:', error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { start };
