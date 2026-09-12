var manifestUtils = require('./stackExportManifest');

function makeError(message, code, extra) {
  var err = new Error(message);
  if (code) err.code = code;
  if (extra) Object.assign(err, extra);
  return err;
}

function resolveImagePath(wxApi, url) {
  if (!url || typeof url !== 'string') {
    return Promise.reject(makeError('图片路径无效', 'INVALID_URL'));
  }

  // cloud:// fileID
  if (url.startsWith('cloud://')) {
    if (!wxApi.cloud || typeof wxApi.cloud.downloadFile !== 'function') {
      return Promise.reject(makeError('云开发实例不可用', 'CLOUD_UNAVAILABLE'));
    }
    return new Promise(function (resolve, reject) {
      wxApi.cloud.downloadFile({
        fileID: url,
        success: function (res) {
          if (res && res.tempFilePath) {
            resolve(res.tempFilePath);
          } else {
            reject(makeError('云存储图片下载未返回路径', 'DOWNLOAD_FAILED'));
          }
        },
        fail: function (err) {
          reject(makeError((err && err.errMsg) || '云存储图片下载失败', 'DOWNLOAD_FAILED', { cause: err }));
        }
      });
    });
  }

  // HTTPS or HTTP URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (typeof wxApi.downloadFile !== 'function') {
      return Promise.reject(makeError('网络下载 API 不可用', 'DOWNLOAD_UNAVAILABLE'));
    }
    return new Promise(function (resolve, reject) {
      wxApi.downloadFile({
        url: url,
        success: function (res) {
          if (
            res &&
            res.statusCode !== undefined &&
            res.statusCode !== null &&
            (!Number.isFinite(Number(res.statusCode)) || Number(res.statusCode) < 200 || Number(res.statusCode) >= 300)
          ) {
            reject(makeError('网络图片下载失败 HTTP ' + res.statusCode, 'DOWNLOAD_FAILED', { cause: res }));
            return;
          }
          if (res && res.tempFilePath) {
            resolve(res.tempFilePath);
          } else {
            reject(makeError('网络图片下载未返回路径', 'DOWNLOAD_FAILED'));
          }
        },
        fail: function (err) {
          reject(makeError((err && err.errMsg) || '网络图片下载失败', 'DOWNLOAD_FAILED', { cause: err }));
        }
      });
    });
  }

  // Local file path
  return Promise.resolve(url);
}

function saveSingleImage(wxApi, filePath) {
  return new Promise(function (resolve, reject) {
    wxApi.saveImageToPhotosAlbum({
      filePath: filePath,
      success: function (res) {
        resolve(res);
      },
      fail: function (err) {
        var errMsg = (err && err.errMsg) || '';
        var isAuth = errMsg.indexOf('auth') !== -1 || errMsg.indexOf('deny') !== -1;
        var code = isAuth ? 'AUTH_DENIED' : 'SAVE_FAILED';
        reject(makeError(errMsg || '保存图片失败', code, { cause: err }));
      }
    });
  });
}

async function saveImagesSequentially(wxApi, urls, options) {
  var opts = options || {};
  var items = Array.isArray(urls) ? urls : [];
  var startIndex = Math.max(0, Number(opts.startIndex) || 0);
  var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  var pathResolver = typeof opts.resolvePath === 'function' ? opts.resolvePath : resolveImagePath;

  var savedCount = 0;
  for (var i = startIndex; i < items.length; i++) {
    if (onProgress) {
      onProgress(i + 1, items.length);
    }
    try {
      var filePath = await pathResolver(wxApi, items[i], i);
      await saveSingleImage(wxApi, filePath);
      savedCount += 1;
      if (typeof opts.onSaved === 'function') opts.onSaved(i + 1, items.length);
    } catch (err) {
      var error = makeError((err && err.message) || '保存相册失败', (err && err.code) || 'SAVE_FAILED', {
        nextIndex: i,
        savedCount: savedCount,
        cause: err
      });
      throw error;
    }
  }

  return {
    ok: true,
    savedCount: savedCount,
    total: items.length
  };
}

async function saveExportManifest(wxApi, manifest, options) {
  var opts = options || {};
  manifestUtils.validateManifest(manifest);
  var expectedFingerprint = opts.expectedFingerprint || manifest.fingerprint;
  if (!expectedFingerprint || expectedFingerprint !== manifest.fingerprint) {
    throw makeError('导出内容已经变化，请重新准备顺序图', 'STALE_EXPORT_SESSION', {
      manifestFingerprint: manifest.fingerprint || ''
    });
  }

  var entries = manifestUtils.flattenManifest(manifest, opts.stackIds).filter(function (entry) {
    return opts.allowNonStackable === true || entry.canExport;
  });
  if (!entries.length) {
    throw makeError('没有可保存的叠图', 'NO_EXPORTABLE_CARDS', {
      manifestFingerprint: manifest.fingerprint
    });
  }
  for (var checkIndex = 0; checkIndex < entries.length; checkIndex++) {
    if (!entries[checkIndex].exportUrl) {
      throw makeError('顺序图尚未生成: ' + entries[checkIndex].sequenceLabel, 'EXPORT_NOT_READY', {
        stackId: entries[checkIndex].stackId,
        stackTitle: entries[checkIndex].stackTitle,
        sequenceLabel: entries[checkIndex].sequenceLabel,
        nextIndex: checkIndex,
        savedCount: 0,
        manifestFingerprint: manifest.fingerprint
      });
    }
  }

  var startIndex = Math.max(0, Number(opts.startIndex) || 0);
  if (startIndex > entries.length) {
    throw makeError('保存续存位置无效', 'INVALID_SAVE_CURSOR', {
      nextIndex: 0,
      manifestFingerprint: manifest.fingerprint
    });
  }
  var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  var savedCount = 0;
  for (var index = startIndex; index < entries.length; index++) {
    var entry = entries[index];
    if (onProgress) onProgress(entry, index + 1, entries.length);
    try {
      await saveSingleImage(wxApi, entry.exportUrl);
      savedCount += 1;
    } catch (error) {
      throw makeError((error && error.message) || '保存相册失败', (error && error.code) || 'SAVE_FAILED', {
        nextIndex: index,
        savedCount: savedCount,
        stackId: entry.stackId,
        stackTitle: entry.stackTitle,
        sequenceLabel: entry.sequenceLabel,
        manifestFingerprint: manifest.fingerprint,
        cause: error
      });
    }
  }
  return {
    ok: true,
    savedCount: savedCount,
    total: entries.length,
    manifestFingerprint: manifest.fingerprint
  };
}

module.exports = {
  resolveImagePath: resolveImagePath,
  saveImagesSequentially: saveImagesSequentially,
  saveExportManifest: saveExportManifest
};
