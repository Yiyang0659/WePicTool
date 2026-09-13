// Preview-only files: never use these as proof of a successful content audit.
const fonts = require('./localFontRenderer');
const painter = require('./scenePainter');
const ink = require('./funStrokes');
const projectModel = require('./funTextProject');

async function renderCards(api, canvas, project, isCurrent) {
  const scenes = projectModel.buildRenderPayload(project).scenes;
  const current = () => {
    if (isCurrent && !isCurrent()) throw Object.assign(new Error('预览已过期'), {code:'STALE_EXPORT_GENERATION'});
  };
  if (!canvas) throw new Error('预览画布尚未就绪，请重试');
  const cards = [];
  for (const scene of scenes) {
    current();
    await fonts.ensureScene(api, scene);
    current();
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    painter.paintScene(ctx, scene, 1080, {drawText:fonts.drawText});
    ink.paint(ctx, scene.strokes || [], 1080);
    const url = await new Promise((resolve, reject) => api.canvasToTempFilePath({
      canvas, width:1080, height:1080, destWidth:1080, destHeight:1080, fileType:'png',
      success:r => resolve(r.tempFilePath), fail:reject
    }));
    current();
    cards.push({sceneId:scene.sceneId,role:scene.role,order:scene.order,url});
  }
  return cards;
}
module.exports = {renderCards};
