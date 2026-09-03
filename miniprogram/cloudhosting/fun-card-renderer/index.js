'use strict';

const cloud = require('wx-server-sdk');
const { createPngMaker, createSceneRenderer, createCardRollback } = require('./renderer');
const {
  createContentChecker,
  createRenderStackHandler,
  createPreviewStackHandler,
  createHttpServer
} = require('./server');
const { resolveRuntimeMode, assertCloudCapabilities } = require('./runtimeConfig');

function start(environment) {
  const env = environment || process.env;
  const runtime = resolveRuntimeMode(env);

  if (!runtime.devMode) {
    cloud.init({ env: runtime.cloudEnvId });
    assertCloudCapabilities(cloud);
  }

  const checkContent = runtime.devMode
    ? async () => ({ ok: true, code: 'OK' })
    : createContentChecker(
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
    makePng: createPngMaker(),
    uploadBuffer,
    deleteFile
  });
  const rollbackCards = createCardRollback(deleteFile);
  const dependencies = { checkContent, renderScenes, rollbackCards };
  const httpServer = createHttpServer({
    devMode: runtime.devMode,
    renderStackHandler: createRenderStackHandler(dependencies),
    previewStackHandler: createPreviewStackHandler(dependencies)
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
