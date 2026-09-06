var imageExporter = require('./imageExporter');
var manifestUtils = require('./stackExportManifest');

function makeError(message, code, extra) {
  var error = new Error(message);
  error.code = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getSequenceBadgeLayout(width, height, label, styleVersion) {
  var imageWidth = Number(width);
  var imageHeight = Number(height);
  if (!Number.isFinite(imageWidth) || imageWidth <= 0 || !Number.isFinite(imageHeight) || imageHeight <= 0) {
    throw makeError('顺序图尺寸无效', 'INVALID_IMAGE_SIZE');
  }
  if (!/^\d{2}$/.test(String(label || ''))) {
    throw makeError('顺序角标必须是两位数字', 'INVALID_SEQUENCE_LABEL');
  }
  if (styleVersion !== manifestUtils.BADGE_STYLE_VERSION) {
    throw makeError('顺序角标样式版本不支持', 'UNSUPPORTED_BADGE_STYLE');
  }
  var shortSide = Math.min(imageWidth, imageHeight);
  var badgeHeight = Math.round(clamp(shortSide * 0.08, 36, 84));
  var fontSize = Math.round(clamp(badgeHeight * 0.52, 20, 56));
  var horizontalPadding = Math.round(badgeHeight * 0.34);
  var badgeWidth = Math.max(Math.round(badgeHeight * 1.45), Math.round(fontSize * 1.3 + horizontalPadding * 2));
  var margin = Math.round(clamp(shortSide * 0.04, 18, 56));
  return {
    x: Math.round(imageWidth - margin - badgeWidth),
    y: margin,
    width: badgeWidth,
    height: badgeHeight,
    radius: Math.round(badgeHeight / 2),
    fontSize: fontSize,
    shadowBlur: Math.round(clamp(shortSide * 0.012, 4, 14)),
    shadowOffsetY: Math.round(clamp(shortSide * 0.004, 2, 6))
  };
}

function roundedRectPath(ctx, layout) {
  var x = layout.x;
  var y = layout.y;
  var width = layout.width;
  var height = layout.height;
  var radius = Math.min(layout.radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function paintSequenceBadge(ctx, layout, label) {
  if (!ctx) throw makeError('顺序角标画布不可用', 'CANVAS_UNAVAILABLE');
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = layout.shadowBlur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = layout.shadowOffsetY;
  ctx.fillStyle = 'rgba(18, 18, 20, 0.78)';
  roundedRectPath(ctx, layout);
  ctx.fill();
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 ' + layout.fontSize + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, layout.x + layout.width / 2, layout.y + layout.height / 2 + 1);
  ctx.restore();
}

function getImageInfo(wxApi, path) {
  return new Promise(function (resolve, reject) {
    if (!wxApi || typeof wxApi.getImageInfo !== 'function') {
      reject(makeError('图片信息 API 不可用', 'IMAGE_INFO_UNAVAILABLE'));
      return;
    }
    wxApi.getImageInfo({
      src: path,
      success: function (result) {
        if (!result || !(Number(result.width) > 0) || !(Number(result.height) > 0)) {
          reject(makeError('图片尺寸无效', 'INVALID_IMAGE_SIZE'));
          return;
        }
        resolve({
          width: Number(result.width),
          height: Number(result.height),
          path: result.path || path
        });
      },
      fail: function (error) {
        reject(makeError((error && error.errMsg) || (error && error.message) || '读取图片失败', 'IMAGE_INFO_FAILED', { cause: error }));
      }
    });
  });
}

function loadCanvasImage(canvas, path) {
  return new Promise(function (resolve, reject) {
    if (!canvas || typeof canvas.createImage !== 'function') {
      reject(makeError('Canvas 图片能力不可用', 'CANVAS_UNAVAILABLE'));
      return;
    }
    var image = canvas.createImage();
    image.onload = function () { resolve(image); };
    image.onerror = function (error) {
      reject(makeError('顺序图图片解码失败', 'IMAGE_DECODE_FAILED', { cause: error }));
    };
    image.src = path;
  });
}

function exportCanvas(wxApi, canvas, width, height, fileType) {
  return new Promise(function (resolve, reject) {
    if (!wxApi || typeof wxApi.canvasToTempFilePath !== 'function') {
      reject(makeError('Canvas 导出 API 不可用', 'CANVAS_EXPORT_UNAVAILABLE'));
      return;
    }
    wxApi.canvasToTempFilePath({
      canvas: canvas,
      x: 0,
      y: 0,
      width: width,
      height: height,
      destWidth: width,
      destHeight: height,
      fileType: fileType,
      quality: fileType === 'jpg' ? 0.94 : undefined,
      success: function (result) {
        if (result && result.tempFilePath) resolve(result.tempFilePath);
        else reject(makeError('Canvas 导出未返回图片路径', 'CANVAS_EXPORT_FAILED'));
      },
      fail: function (error) {
        reject(makeError((error && error.errMsg) || 'Canvas 导出失败', 'CANVAS_EXPORT_FAILED', { cause: error }));
      }
    });
  });
}

function sourceFileType(sourceUrl) {
  var value = String(sourceUrl || '').split(/[?#]/)[0].toLowerCase();
  return value.endsWith('.jpg') || value.endsWith('.jpeg') ? 'jpg' : 'png';
}

function canvasImagePath(requestPath, infoPath) {
  var requested = String(requestPath || '');
  var resolved = String(infoPath || '');
  if (/^(wxfile|https?):\/\//.test(resolved) || /^data:image\//.test(resolved) || resolved.indexOf('blob:') === 0) {
    return resolved;
  }
  // DevTools may rewrite ../../assets/... back to /assets/...; Canvas 2D then
  // incorrectly resolves that value beneath pages/dressup. Keep the explicit
  // page-relative path only for that package-asset case.
  if (/^\.\.?(\/|\\)/.test(requested)) return requested;
  return resolved || requested;
}

async function materializeCard(wxApi, canvas, card, options) {
  var input = card || {};
  var opts = options || {};
  if (typeof opts.isCurrent === 'function' && !opts.isCurrent()) {
    throw makeError('顺序图任务已过期', 'STALE_EXPORT_GENERATION');
  }
  var pathResolver = typeof opts.resolvePath === 'function'
    ? opts.resolvePath
    : imageExporter.resolveImagePath;
  var localPath = await pathResolver(wxApi, input.sourceUrl, input);
  var info = await getImageInfo(wxApi, localPath);
  var image = await loadCanvasImage(canvas, canvasImagePath(localPath, info.path));
  if (typeof opts.isCurrent === 'function' && !opts.isCurrent()) {
    throw makeError('顺序图任务已过期', 'STALE_EXPORT_GENERATION');
  }
  canvas.width = info.width;
  canvas.height = info.height;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) throw makeError('顺序图 Canvas 2D 上下文不可用', 'CANVAS_UNAVAILABLE');
  if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (typeof ctx.clearRect === 'function') ctx.clearRect(0, 0, info.width, info.height);
  ctx.drawImage(image, 0, 0, info.width, info.height);
  paintSequenceBadge(ctx, getSequenceBadgeLayout(info.width, info.height, input.sequenceLabel, opts.badgeStyleVersion || manifestUtils.BADGE_STYLE_VERSION), input.sequenceLabel);
  var fileType = sourceFileType(input.sourceUrl);
  var exportUrl = await exportCanvas(wxApi, canvas, info.width, info.height, fileType);
  return Object.assign({}, input, {
    exportUrl: exportUrl,
    width: info.width,
    height: info.height
  });
}

async function materializeManifest(wxApi, canvas, manifest, options) {
  manifestUtils.validateManifest(manifest);
  var opts = options || {};
  var output = JSON.parse(JSON.stringify(manifest));
  for (var stackIndex = 0; stackIndex < output.stacks.length; stackIndex++) {
    var stack = output.stacks[stackIndex];
    for (var cardIndex = 0; cardIndex < stack.cards.length; cardIndex++) {
      if (typeof opts.isCurrent === 'function' && !opts.isCurrent()) {
        throw makeError('顺序图任务已过期', 'STALE_EXPORT_GENERATION');
      }
      try {
        stack.cards[cardIndex] = await materializeCard(wxApi, canvas, Object.assign({ stackId: stack.stackId }, stack.cards[cardIndex]), {
          badgeStyleVersion: output.badgeStyleVersion,
          isCurrent: opts.isCurrent,
          resolvePath: opts.resolvePath
        });
        delete stack.cards[cardIndex].stackId;
      } catch (error) {
        if (error && error.code === 'STALE_EXPORT_GENERATION') throw error;
        throw makeError((error && error.message) || '顺序图生成失败', 'BADGE_COMPOSE_FAILED', {
          stackId: stack.stackId,
          stackTitle: stack.title,
          sequenceLabel: stack.cards[cardIndex].sequenceLabel,
          cause: error
        });
      }
    }
  }
  if (typeof opts.isCurrent === 'function' && !opts.isCurrent()) {
    throw makeError('顺序图任务已过期', 'STALE_EXPORT_GENERATION');
  }
  manifestUtils.validateManifest(output);
  return output;
}

module.exports = {
  getSequenceBadgeLayout: getSequenceBadgeLayout,
  paintSequenceBadge: paintSequenceBadge,
  materializeCard: materializeCard,
  materializeManifest: materializeManifest
};
