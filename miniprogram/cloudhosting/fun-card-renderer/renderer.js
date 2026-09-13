'use strict';

const path = require('node:path');
const { drawProceduralAsset } = require('./drawAssets');
const ink = require('./funStrokes');

const SCENE_SIZE = 1080;
const PREVIEW_SIZE = 360;
const FINAL_SIZE = 1080;
const FONT_REGISTRY = Object.freeze({
  marker: { family: 'LXGWMarkerGothic', file: 'LXGWMarkerGothic-Regular.ttf' },
  playful: { family: 'SmileySans', file: 'SmileySans-Oblique.ttf' },
  headline: { family: 'MaShanZheng', file: 'MaShanZheng-Regular.ttf' }
});
const registeredFontCollections = new WeakSet();

function registerLicensedFonts(GlobalFonts) {
  if (!GlobalFonts || typeof GlobalFonts.registerFromPath !== 'function') {
    throw new Error('font registry is unavailable');
  }
  if (registeredFontCollections.has(GlobalFonts)) return;
  Object.values(FONT_REGISTRY).forEach((font) => {
    const fontPath = path.join(__dirname, 'assets', 'fonts', font.file);
    if (!GlobalFonts.registerFromPath(fontPath, font.family)) {
      throw new Error('licensed font registration failed: ' + font.family);
    }
  });
  registeredFontCollections.add(GlobalFonts);
}

function paintText(context, layer, ratio) {
  const lines = layer.lines;
  const effectKey = layer.effectKey;
  if (!['marker-bold', 'chalk-rough', 'collage-cutout', 'stamp-shadow'].includes(effectKey)) {
    throw new Error('unsupported text effect');
  }
  context.save();
  context.translate(layer.x * ratio, layer.y * ratio);
  context.rotate((layer.rotation || 0) * Math.PI / 180);
  context.scale(layer.scale || 1, layer.scale || 1);
  const font = FONT_REGISTRY[layer.fontKey || 'marker'];
  if (!font || (layer.fontFamily && layer.fontFamily !== font.family)) {
    throw new Error('unsupported font');
  }
  context.font = String(layer.fontSize * ratio) + 'px ' + font.family;
  context.textAlign = layer.align;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineCap = 'round';
  const offset = (lines.length - 1) * layer.lineHeight * ratio / 2;
  lines.forEach((line, index) => {
    const y = index * layer.lineHeight * ratio - offset;
    if (effectKey === 'marker-bold') {
      context.strokeStyle = layer.color;
      context.lineWidth = Math.max(2, layer.fontSize * ratio * 0.075);
      context.strokeText(line, 0, y);
      context.fillStyle = layer.color;
      context.fillText(line, 0, y);
    } else if (effectKey === 'chalk-rough') {
      context.fillStyle = layer.color;
      context.fillText(line, -1.5 * ratio, y + ratio);
      context.fillText(line, 1.5 * ratio, y - ratio);
      context.fillText(line, 0, y);
    } else if (effectKey === 'collage-cutout') {
      const width = Math.max(layer.fontSize * ratio, Array.from(line).length * layer.fontSize * ratio * 1.08);
      const height = layer.lineHeight * ratio * 0.78;
      context.fillStyle = '#FFFDF7';
      context.fillRect(-width / 2, y - height / 2, width, height);
      context.fillStyle = layer.color;
      context.fillText(line, 0, y);
    } else if (effectKey === 'stamp-shadow') {
      context.fillStyle = '#8F4562';
      context.fillText(line, 5 * ratio, y + 5 * ratio);
      context.fillStyle = layer.color;
      context.fillText(line, 0, y);
    }
  });
  context.restore();
}

function paintAsset(context, layer, ratio) {
  context.save();
  context.translate(layer.x * ratio, layer.y * ratio);
  context.rotate((layer.rotation || 0) * Math.PI / 180);
  context.scale((layer.scale || 1) * ratio, (layer.scale || 1) * ratio);
  drawProceduralAsset(context, layer);
  context.restore();
}

function createPngMaker(canvasModule) {
  const { createCanvas, GlobalFonts } = canvasModule || require('@napi-rs/canvas');
  registerLicensedFonts(GlobalFonts);
  return async function makePng(scene, size) {
    if (size !== PREVIEW_SIZE && size !== FINAL_SIZE) throw new Error('unsupported render size');
    const ratio = size / SCENE_SIZE;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext('2d');
    context.fillStyle = scene.background.color;
    context.fillRect(0, 0, size, size);
    scene.layers.forEach((layer) => {
      if (layer.type === 'text') paintText(context, layer, ratio);
      else paintAsset(context, layer, ratio);
    });
    if (!ink.valid(scene.strokes || [])) throw new Error('invalid strokes');
    ink.paint(context, scene.strokes || [], size);
    return canvas.toBuffer('image/png');
  };
}

function createSceneRenderer(dependencies) {
  const deps = dependencies || {};
  const rollbackCards = createCardRollback(deps.deleteFile);
  return async function renderScenes(scenes, job) {
    const expectedSize = job && job.kind === 'preview' ? PREVIEW_SIZE : FINAL_SIZE;
    if (!job || !['preview', 'final'].includes(job.kind) || job.size !== expectedSize) {
      throw new Error('invalid render job');
    }
    const uploaded = [];
    try {
      for (const scene of scenes) {
        const buffer = await deps.makePng(scene, job.size);
        if (!Buffer.isBuffer(buffer)) throw new Error('PNG renderer returned no buffer');
        if (scene.strokes && scene.strokes.length) {
          const audit=typeof deps.checkImage==='function' ? await deps.checkImage(buffer, { traceId: job.traceId }) : null;
          if(!audit || audit.ok!==true) {
            const error=new Error('image audit blocked');
            error.code=audit && audit.code==='CONTENT_UNSAFE' ? 'CONTENT_UNSAFE' : 'IMAGE_SAFETY_UNAVAILABLE';
            throw error;
          }
        }
        const cloudPath = [
          'funtext', job.projectId, job.candidateId, job.kind,
          (job.revision ? job.revision + '-' : '') + scene.order + '.png'
        ].join('/');
        const stored = await deps.uploadBuffer(buffer, cloudPath, { scene, job });
        if (!stored || typeof stored.fileId !== 'string' || !stored.fileId || typeof stored.url !== 'string' || !stored.url) {
          throw new Error('storage returned no file URL');
        }
        uploaded.push({
          sceneId: scene.sceneId,
          order: scene.order,
          fileId: stored.fileId,
          url: stored.url
        });
      }
      return uploaded;
    } catch (error) {
      await rollbackCards(uploaded);
      throw error;
    }
  };
}

function createCardRollback(deleteFile) {
  return async function rollbackCards(cards) {
    if (typeof deleteFile !== 'function' || !Array.isArray(cards)) return;
    await Promise.allSettled(cards.filter((card) => card && card.fileId).map((card) => {
      return Promise.resolve().then(() => deleteFile(card.fileId));
    }));
  };
}

module.exports = {
  SCENE_SIZE,
  PREVIEW_SIZE,
  FINAL_SIZE,
  FONT_REGISTRY,
  registerLicensedFonts,
  createPngMaker,
  createSceneRenderer,
  createCardRollback
};
