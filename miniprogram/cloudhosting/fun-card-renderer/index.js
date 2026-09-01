'use strict';

const cloud = require('wx-server-sdk');
const { createPngMaker, createSceneRenderer, createCardRollback } = require('./renderer');
const {
  createContentChecker,
  createRenderStackHandler,
  createPreviewStackHandler,
  createHttpServer
} = require('./server');

const isLocalDev = !process.env.CLOUDBASE_ENV_ID;

if (!isLocalDev) {
  cloud.init({ env: process.env.CLOUDBASE_ENV_ID });
}

const checkContent = isLocalDev
  ? async () => ({ ok: true, code: 'OK' })
  : createContentChecker(
    ({ content }) => cloud.openapi.security.msgSecCheck({ content }),
    (error) => {
      console.error('[fun-card-renderer] content audit failed:', error && (error.errMsg || error.message || error));
    }
  );

async function uploadBuffer(buffer, cloudPath) {
  if (isLocalDev) {
    return { fileId: cloudPath, url: 'data:image/png;base64,' + buffer.toString('base64') };
  }
  const result = await cloud.uploadFile({ cloudPath, fileContent: buffer });
  return { fileId: result.fileID, url: result.fileID };
}

async function deleteFile(fileId) {
  if (isLocalDev) return;
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
  renderStackHandler: createRenderStackHandler(dependencies),
  previewStackHandler: createPreviewStackHandler(dependencies)
});
const port = Number(process.env.PORT || 8080);

httpServer.listen(port, () => {
  console.log('[fun-card-renderer] listening on ' + port);
});
