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

  var savedCount = 0;
  for (var i = startIndex; i < items.length; i++) {
    if (onProgress) {
      onProgress(i + 1, items.length);
    }
    try {
      var filePath = await resolveImagePath(wxApi, items[i]);
      await saveSingleImage(wxApi, filePath);
      savedCount += 1;
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

module.exports = {
  resolveImagePath: resolveImagePath,
  saveImagesSequentially: saveImagesSequentially
};
