'use strict';

const SUPPORTED_ASSET_KEYS = Object.freeze([
  'sticker_0', 'sticker_1', 'sticker_2', 'sticker_3', 'sticker_4', 'sticker_5',
  'sticker_6', 'sticker_7', 'sticker_8', 'sticker_9', 'sticker_10', 'sticker_11',
  'arrow-curve', 'heart-outline', 'circle-mark', 'underline-rough', 'scribble-cross', 'burst-lines'
]);
const SUPPORTED_EFFECT_KEYS = Object.freeze([
  'marker-bold', 'chalk-rough', 'collage-cutout', 'stamp-shadow'
]);
const SUPPORTED_STYLE_PACK_KEYS = Object.freeze([
  'pink-note-v1', 'chalk-chaos-v1', 'paper-collage-v1'
]);
const SUPPORTED_BACKGROUND_KEYS = Object.freeze([
  'pink-note-01', 'chalk-board-01', 'paper-collage-01'
]);
const ALLOWED_ROLES = Object.freeze(['hook', 'build', 'misdirect', 'pause', 'reveal', 'ending']);
const STICKER_KEYS = new Set(SUPPORTED_ASSET_KEYS.filter((key) => key.startsWith('sticker_')));
const DOODLE_KEYS = new Set(SUPPORTED_ASSET_KEYS.filter((key) => !key.startsWith('sticker_')));
const EFFECT_KEYS = new Set(SUPPORTED_EFFECT_KEYS);
const STYLE_PACK_KEYS = new Set(SUPPORTED_STYLE_PACK_KEYS);
const BACKGROUND_KEYS = new Set(SUPPORTED_BACKGROUND_KEYS);
const BACKGROUND_BY_STYLE_PACK = Object.freeze({
  'pink-note-v1': 'pink-note-01',
  'chalk-chaos-v1': 'chalk-board-01',
  'paper-collage-v1': 'paper-collage-01'
});
const PROJECT_ID = /^funtext_[A-Za-z0-9_-]+$/;
const CANDIDATE_ID = /^candidate_[A-Za-z0-9_-]+$/;
const SCENE_ID = /^scene_[A-Za-z0-9_-]+$/;
const LAYER_ID = /^[A-Za-z0-9_-]+$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasBoundedId(value, pattern, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && pattern.test(value);
}

function push(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateTextLayer(layer, errors) {
  push(errors, typeof layer.text === 'string' && layer.text.length > 0 && Array.from(layer.text).length <= 40, '文字图层文本不合法');
  push(errors, Array.isArray(layer.lines) && layer.lines.length >= 1 && layer.lines.length <= 4, '文字图层换行不合法');
  if (Array.isArray(layer.lines)) {
    push(errors, layer.lines.every((line) => typeof line === 'string' && line.length > 0 && Array.from(line).length <= 40), '文字图层行不合法');
    if (typeof layer.text === 'string') {
      push(errors, layer.lines.join('') === layer.text, '文字图层换行与文本不一致');
    }
  }
  if (layer.effectKey !== undefined) push(errors, EFFECT_KEYS.has(layer.effectKey), '文字效果不在白名单');
  if (layer.fontFamily !== undefined) push(errors, layer.fontFamily === 'LXGWMarkerGothic', '字体不在白名单');
  push(errors, isFiniteNumber(layer.fontSize) && layer.fontSize > 0 && layer.fontSize <= 600, '字号不合法');
  push(errors, isFiniteNumber(layer.lineHeight) && layer.lineHeight > 0 && layer.lineHeight <= 720, '行高不合法');
  push(errors, HEX_COLOR.test(layer.color || ''), '文字颜色不合法');
  push(errors, ['left', 'center', 'right'].includes(layer.align), '文字对齐不合法');
}

function validateDecoration(layer, errors) {
  const expectedKeys = layer.type === 'sticker' ? STICKER_KEYS : DOODLE_KEYS;
  push(errors, expectedKeys.has(layer.assetKey), '装饰素材或类型不在白名单');
}

function validateScene(scene, expectedOrder) {
  const errors = [];
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    return { valid: false, errors: ['场景必须是对象'] };
  }
  push(errors, hasBoundedId(scene.sceneId, SCENE_ID, 100), 'sceneId 不合法');
  push(errors, scene.order === expectedOrder, '场景序号必须连续');
  push(errors, scene.width === 1080 && scene.height === 1080, '场景必须为 1080 方图');
  if (scene.role !== undefined) push(errors, ALLOWED_ROLES.includes(scene.role), '卡片角色不合法');
  push(errors, scene.background && typeof scene.background === 'object' && !Array.isArray(scene.background), '场景背景不合法');
  if (scene.background && typeof scene.background === 'object') {
    push(errors, HEX_COLOR.test(scene.background.color || ''), '背景颜色不合法');
    if (scene.background.assetKey !== undefined) {
      push(errors, BACKGROUND_KEYS.has(scene.background.assetKey), '背景素材不在白名单');
    }
  }
  if (!Array.isArray(scene.layers)) {
    errors.push('场景图层不合法');
    return { valid: false, errors };
  }
  push(errors, scene.layers.length <= 8, '图层总数超过上限');
  const ids = new Set();
  let textCount = 0;
  let mainTextCount = 0;
  let auxiliaryTextCount = 0;
  let decorationCount = 0;
  scene.layers.forEach((layer) => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
      errors.push('图层必须是对象');
      return;
    }
    push(errors, hasBoundedId(layer.id, LAYER_ID, 80), '图层 id 不合法');
    if (typeof layer.id === 'string') {
      push(errors, !ids.has(layer.id), '图层 id 必须唯一');
      ids.add(layer.id);
    }
    push(errors, ['text', 'sticker', 'doodle'].includes(layer.type), '图层类型不合法');
    push(errors, isFiniteNumber(layer.x) && layer.x >= 0 && layer.x <= 1080, '图层 x 坐标不合法');
    push(errors, isFiniteNumber(layer.y) && layer.y >= 0 && layer.y <= 1080, '图层 y 坐标不合法');
    push(errors, layer.rotation === undefined || (isFiniteNumber(layer.rotation) && Math.abs(layer.rotation) <= 360), '图层旋转不合法');
    push(errors, layer.scale === undefined || (isFiniteNumber(layer.scale) && layer.scale > 0 && layer.scale <= 10), '图层缩放不合法');
    if (layer.type === 'text') {
      textCount += 1;
      if (layer.id === 'text_main') mainTextCount += 1;
      else auxiliaryTextCount += 1;
      validateTextLayer(layer, errors);
    } else if (layer.type === 'sticker' || layer.type === 'doodle') {
      decorationCount += 1;
      validateDecoration(layer, errors);
    }
  });
  push(errors, textCount <= 2, '文字图层不能超过两层');
  push(errors, mainTextCount <= 1, '主文字图层不能超过一层');
  push(errors, auxiliaryTextCount <= 1, '辅助文字图层不能超过一层');
  push(errors, decorationCount <= 6, '装饰图层不能超过六层');
  return { valid: errors.length === 0, errors };
}

function validateCommonPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['请求必须是对象'] };
  }
  push(errors, hasBoundedId(payload.projectId, PROJECT_ID, 100), 'projectId 不合法');
  push(errors, typeof payload.sourceText === 'string' && payload.sourceText.trim().length > 0 && Array.from(payload.sourceText).length <= 40, 'sourceText 不合法');
  return errors;
}

function validateCandidate(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['候选必须是对象'] };
  }
  push(errors, hasBoundedId(candidate.candidateId, CANDIDATE_ID, 110), 'candidateId 不合法');
  push(errors, STYLE_PACK_KEYS.has(candidate.stylePackId), '视觉包不在白名单');
  if (!Array.isArray(candidate.scenes) || candidate.scenes.length < 3 || candidate.scenes.length > 8) {
    errors.push('场景数量必须在 3 到 8 张之间');
    return { valid: false, errors };
  }
  const sceneIds = new Set();
  candidate.scenes.forEach((scene, index) => {
    const result = validateScene(scene, index + 1);
    result.errors.forEach((error) => errors.push('场景 ' + (index + 1) + ': ' + error));
    if (scene && scene.background && scene.background.assetKey !== undefined) {
      push(
        errors,
        scene.background.assetKey === BACKGROUND_BY_STYLE_PACK[candidate.stylePackId],
        '场景背景与视觉包不匹配'
      );
    }
    if (scene && typeof scene.sceneId === 'string') {
      push(errors, !sceneIds.has(scene.sceneId), 'sceneId 必须唯一');
      sceneIds.add(scene.sceneId);
    }
  });
  return { valid: errors.length === 0, errors };
}

function validateRenderPayload(payload) {
  const errors = validateCommonPayload(payload);
  if (!Array.isArray(errors)) return errors;
  const candidate = validateCandidate(payload);
  candidate.errors.forEach((error) => errors.push(error));
  return { valid: errors.length === 0, errors };
}

function validatePreviewPayload(payload) {
  const errors = validateCommonPayload(payload);
  if (!Array.isArray(errors)) return errors;
  if (!Array.isArray(payload.candidates) || payload.candidates.length < 1 || payload.candidates.length > 3) {
    errors.push('候选数量必须在 1 到 3 套之间');
    return { valid: false, errors };
  }
  const candidateIds = new Set();
  payload.candidates.forEach((candidate, index) => {
    const result = validateCandidate(candidate);
    result.errors.forEach((error) => errors.push('候选 ' + (index + 1) + ': ' + error));
    if (candidate && typeof candidate.candidateId === 'string') {
      push(errors, !candidateIds.has(candidate.candidateId), 'candidateId 必须唯一');
      candidateIds.add(candidate.candidateId);
    }
  });
  return { valid: errors.length === 0, errors };
}

function collectScenes(payload) {
  if (Array.isArray(payload && payload.scenes)) return payload.scenes;
  if (Array.isArray(payload && payload.candidates)) {
    return payload.candidates.flatMap((candidate) => Array.isArray(candidate && candidate.scenes) ? candidate.scenes : []);
  }
  return [];
}

function collectAuditText(payload) {
  const values = [];
  if (payload && typeof payload.sourceText === 'string' && payload.sourceText.trim()) values.push(payload.sourceText);
  collectScenes(payload).forEach((scene) => {
    (scene.layers || []).forEach((layer) => {
      if (layer && layer.type === 'text' && typeof layer.text === 'string' && layer.text.trim()) {
        values.push(layer.text);
      }
    });
  });
  return values.join('\n');
}

module.exports = {
  SUPPORTED_ASSET_KEYS,
  SUPPORTED_EFFECT_KEYS,
  SUPPORTED_STYLE_PACK_KEYS,
  SUPPORTED_BACKGROUND_KEYS,
  validateScene,
  validateRenderPayload,
  validatePreviewPayload,
  collectAuditText
};
