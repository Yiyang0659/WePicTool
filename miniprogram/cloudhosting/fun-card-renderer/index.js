'use strict';

const cloud = require('wx-server-sdk');
const { createPngMaker, createSceneRenderer } = require('./renderer');
const {
  createRenderStackHandler,
  createPreviewStackHandler,
  createHttpServer
} = require('./server');

cloud.init(process.env.CLOUDBASE_ENV_ID ? { env: process.env.CLOUDBASE_ENV_ID } : {});

async function checkContent(content) {
  try {
    const response = await cloud.openapi.security.msgSecCheck({ content });
    return response && Number(response.errCode) === 0
      ? { ok: true, code: 'OK' }
      : { ok: false, code: 'CONTENT_UNSAFE' };
  } catch (error) {
    console.error('[fun-card-renderer] content audit failed:', error && (error.errMsg || error.message || error));
    return { ok: false, code: 'SAFETY_UNAVAILABLE' };
  }
}

async function uploadBuffer(buffer, cloudPath) {
  const result = await cloud.uploadFile({ cloudPath, fileContent: buffer });
  return { fileId: result.fileID, url: result.fileID };
}

async function deleteFile(fileId) {
  await cloud.deleteFile({ fileList: [fileId] });
}

const renderScenes = createSceneRenderer({
  makePng: createPngMaker(),
  uploadBuffer,
  deleteFile
});
const dependencies = { checkContent, renderScenes };
const httpServer = createHttpServer({
  renderStackHandler: createRenderStackHandler(dependencies),
  previewStackHandler: createPreviewStackHandler(dependencies)
});
const port = Number(process.env.PORT || 8080);

httpServer.listen(port, () => {
  console.log('[fun-card-renderer] listening on ' + port);
});
