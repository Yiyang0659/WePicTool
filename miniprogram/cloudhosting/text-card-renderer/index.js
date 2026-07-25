const cloud = require('wx-server-sdk');
const { createCardRenderer, createPngMaker } = require('./renderer');
const { createHttpServer, createRenderHandler } = require('./server');

cloud.init({ env: process.env.CLOUDBASE_ENV_ID || cloud.DYNAMIC_CURRENT_ENV });

async function checkContent(content) {
  try {
    const response = await cloud.openapi.security.msgSecCheck({ content });
    return response && Number(response.errCode) === 0
      ? { ok: true, code: 'OK' }
      : { ok: false, code: 'CONTENT_UNSAFE' };
  } catch (err) {
    console.error('[text-card-renderer] content audit failed:', err && (err.errMsg || err.message || err));
    return { ok: false, code: 'SAFETY_UNAVAILABLE' };
  }
}

async function uploadBuffer(buffer, spec) {
  const taskPrefix = `bigtext/${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await cloud.uploadFile({
    cloudPath: `${taskPrefix}/${String(spec.order).padStart(2, '0')}.png`,
    fileContent: buffer
  });
  return { fileId: result.fileID, url: result.fileID };
}

async function deleteFile(fileId) {
  await cloud.deleteFile({ fileList: [fileId] });
}

const renderCards = createCardRenderer({
  makePng: createPngMaker(),
  uploadBuffer,
  deleteFile
});
const handler = createRenderHandler({ checkContent, renderCards });
const server = createHttpServer(handler);
const port = Number(process.env.PORT || 8080);

server.listen(port, () => {
  console.log(`[text-card-renderer] listening on ${port}`);
});
