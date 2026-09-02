const registry = require('../../config/playRegistry');
const dressup = require('../../utils/layeredDressup');
const imageExporter = require('../../utils/imageExporter');

const DRAFT_KEY = 'wepictool_layered_dressup_draft_v1';
const DEFAULT_PACK_ID = 'funny-paper-doll-v1';
const ASSET_DIR_NAME = 'layered-dressup';

function getItemUrl(item) {
  if (!item) return '';
  return item.localPath || item.url || item.fileId || '';
}

function fileExtension(filePath) {
  var match = String(filePath || '').match(/\.(png|jpe?g|webp)(?:\?|$)/i);
  return match ? '.' + match[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg';
}

Page({
  data: {
    project: null,
    groupList: [],
    sourceLabel: '',
    packTitle: '抽象搞怪',
    validGroupCount: 0,
    canExport: false,
    saving: false,
    showGuide: false,
    guideTitle: '保存完成'
  },

  onLoad: function (options) {
    var mode = options && options.mode === 'demo' ? 'demo' : 'upload';
    var project = null;

    if (mode === 'upload') {
      try {
        var saved = wx.getStorageSync(DRAFT_KEY);
        if (
          saved &&
          saved.playId === 'layered-dressup' &&
          saved.groups &&
          (saved.sourceMode === 'upload' || saved.sourceMode === 'mixed')
        ) {
          project = saved;
        }
      } catch (err) {
        console.warn('读取分层换装草稿失败:', err);
      }
    }

    if (!project) {
      project = dressup.createProject({
        sourceMode: mode,
        templateId: mode === 'demo' ? DEFAULT_PACK_ID : '',
        now: Date.now()
      });
    }

    this.refreshProject(project, false);
  },

  refreshProject: function (project, persist) {
    var sendability = dressup.buildSendability(project);
    var groupList = registry.GROUP_DEFINITIONS.map(function (definition) {
      var items = (project.groups[definition.key] || []).map(function (item, index, all) {
        return Object.assign({}, item, {
          displayUrl: getItemUrl(item),
          isFirst: index === 0,
          canLeft: index > 0,
          canRight: index < all.length - 1,
          sourceText: item.source === 'system' ? '系统' : '我的'
        });
      });
      var status = sendability.groups[definition.key];
      return {
        key: definition.key,
        title: definition.title,
        emoji: definition.emoji,
        count: items.length,
        maxCount: definition.maxCount,
        items: items,
        mode: status.mode,
        missing: status.missing,
        canExport: status.canExport,
        badgeText: status.mode === 'stackable'
          ? '可形成叠图'
          : (status.mode === 'empty' ? '等待添加素材' : '还差 ' + status.missing + ' 张'),
        badgeClass: status.mode === 'stackable' ? 'ready' : 'waiting'
      };
    });

    var sourceLabels = {
      demo: '内置示例',
      upload: '我的素材',
      mixed: '混合素材'
    };
    var pack = registry.getAssetPack(project.templateId || DEFAULT_PACK_ID);

    this.setData({
      project: project,
      groupList: groupList,
      sourceLabel: sourceLabels[project.sourceMode] || '我的素材',
      packTitle: pack ? pack.title : '抽象搞怪',
      validGroupCount: sendability.validGroupCount,
      canExport: sendability.canExport
    });

    if (persist !== false) this.persistDraft(project);
  },

  persistDraft: function (project) {
    try {
      wx.setStorageSync(DRAFT_KEY, dressup.serializeProject(project));
    } catch (err) {
      console.warn('保存分层换装草稿失败:', err);
    }
  },

  onAddUserItems: function (event) {
    var groupKey = event.currentTarget.dataset.group;
    var definition = registry.GROUP_DEFINITIONS.find(function (group) {
      return group.key === groupKey;
    });
    if (!definition) return;

    var currentCount = (this.data.project.groups[groupKey] || []).length;
    var remaining = definition.maxCount - currentCount;
    if (remaining <= 0) {
      wx.showToast({ title: '每组最多 12 张', icon: 'none' });
      return;
    }

    var that = this;
    wx.chooseMedia({
      count: Math.min(9, remaining),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var files = res.tempFiles || [];
        if (files.length === 0) return;
        wx.showLoading({ title: '正在整理素材…', mask: true });
        that.prepareUserFiles(files, groupKey)
          .then(function (items) {
            wx.hideLoading();
            var next = dressup.addItems(that.data.project, groupKey, items, 'user');
            that.refreshProject(next);
          })
          .catch(function (err) {
            wx.hideLoading();
            console.error('保存用户素材失败:', err);
            wx.showToast({ title: '素材读取失败，请重试', icon: 'none' });
          });
      },
      fail: function (err) {
        if (!err || String(err.errMsg || '').indexOf('cancel') === -1) {
          console.warn('选择素材失败:', err);
        }
      }
    });
  },

  onAddSystemItems: function (event) {
    var groupKey = event.currentTarget.dataset.group;
    var pack = registry.getAssetPack(DEFAULT_PACK_ID);
    if (!pack || !pack.groups[groupKey]) return;
    var current = this.data.project.groups[groupKey] || [];
    var existing = {};
    current.forEach(function (item) {
      if (item.assetId) existing[item.assetId] = true;
      if (item.source === 'system') existing[item.id] = true;
    });
    var additions = pack.groups[groupKey].filter(function (item) {
      return !existing[item.id];
    });
    if (additions.length === 0) {
      wx.showToast({ title: '这一组的系统素材已全部加入', icon: 'none' });
      return;
    }
    this.refreshProject(dressup.addItems(this.data.project, groupKey, additions, 'system'));
    wx.showToast({ title: '已加入系统素材', icon: 'success' });
  },

  onRemoveItem: function (event) {
    var groupKey = event.currentTarget.dataset.group;
    var itemId = event.currentTarget.dataset.id;
    if (!groupKey || !itemId) return;
    this.refreshProject(dressup.removeItem(this.data.project, groupKey, itemId));
  },

  onMoveItem: function (event) {
    var groupKey = event.currentTarget.dataset.group;
    var index = Number(event.currentTarget.dataset.index);
    var direction = Number(event.currentTarget.dataset.direction);
    if (!groupKey || !direction) return;
    var target = index + direction;
    var items = this.data.project.groups[groupKey] || [];
    if (target < 0 || target >= items.length) return;
    this.refreshProject(dressup.moveItem(this.data.project, groupKey, index, target));
  },

  onPreviewItem: function (event) {
    var groupKey = event.currentTarget.dataset.group;
    var current = event.currentTarget.dataset.url;
    var items = this.data.project.groups[groupKey] || [];
    var urls = items.map(getItemUrl).filter(Boolean);
    if (urls.length > 0) wx.previewImage({ current: current || urls[0], urls: urls });
  },

  onPreview: function () {
    var groups = dressup.buildPreviewGroups(this.data.project);
    if (groups.length === 0) {
      wx.showToast({ title: '先给任意部位添加素材', icon: 'none' });
      return;
    }
    var project = this.data.project;
    wx.navigateTo({
      url: '/pages/preview/preview',
      success: function (res) {
        res.eventChannel.emit('acceptTaskData', {
          groups: groups,
          ratio: project.ratio || '4:5'
        });
      }
    });
  },

  onSaveGroup: function (event) {
    if (this.data.saving) return;
    var groupKey = event.currentTarget.dataset.group;
    var status = dressup.buildSendability(this.data.project).groups[groupKey];
    if (!status || !status.canExport) {
      wx.showToast({ title: '这一组至少需要 3 张素材', icon: 'none' });
      return;
    }
    var definition = registry.GROUP_DEFINITIONS.find(function (group) {
      return group.key === groupKey;
    });
    this.saveItemsSequentially(this.data.project.groups[groupKey], '已保存' + definition.title + '组');
  },

  onSaveAll: function () {
    if (this.data.saving) return;
    var project = this.data.project;
    var sendability = dressup.buildSendability(project);
    if (!sendability.canExport) {
      wx.showToast({ title: '至少补齐一个 3 张以上的部位组', icon: 'none' });
      return;
    }
    var items = [];
    registry.GROUP_DEFINITIONS.forEach(function (definition) {
      if (sendability.groups[definition.key].canExport) {
        items = items.concat(project.groups[definition.key]);
      }
    });
    this.saveItemsSequentially(items, '有效部位组已全部保存');
  },

  saveItemsSequentially: async function (items, successTitle) {
    this.setData({ saving: true });
    var urls = items.map(getItemUrl).filter(Boolean);
    var that = this;
    try {
      var res = await imageExporter.saveImagesSequentially(wx, urls, {
        onProgress: function (current, total) {
          wx.showLoading({ title: '保存 ' + current + '/' + total, mask: true });
        },
        resolvePath: function (wxApi, url) {
          return that.resolveImageFilePath(url);
        }
      });
      wx.hideLoading();
      this.setData({
        saving: false,
        showGuide: true,
        guideTitle: successTitle + '（' + res.savedCount + ' 张）'
      });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      this.handleSaveError(err.cause || err, err.savedCount || 0, items.length);
    }
  },

  prepareUserFiles: function (files, groupKey) {
    var that = this;
    return this.ensureAssetDirectory().then(function (dir) {
      return Promise.all(files.map(function (file, index) {
        var sourcePath = file.tempFilePath;
        var targetPath = dir + '/user_' + groupKey + '_' + Date.now() + '_' + index + fileExtension(sourcePath);
        return that.copyFileToUserPath(sourcePath, targetPath).then(function () {
          return {
            id: 'user_' + groupKey + '_' + Date.now() + '_' + index,
            url: targetPath,
            localPath: targetPath,
            width: file.width || 0,
            height: file.height || 0,
            size: file.size || 0
          };
        });
      }));
    });
  },

  ensureAssetDirectory: function () {
    var fsm = wx.getFileSystemManager();
    var dir = wx.env.USER_DATA_PATH + '/' + ASSET_DIR_NAME;
    return new Promise(function (resolve, reject) {
      fsm.mkdir({
        dirPath: dir,
        recursive: true,
        success: function () { resolve(dir); },
        fail: function (err) {
          if (err && String(err.errMsg || '').indexOf('already exists') !== -1) resolve(dir);
          else reject(err);
        }
      });
    });
  },

  copyFileToUserPath: function (sourcePath, targetPath) {
    var fsm = wx.getFileSystemManager();
    return new Promise(function (resolve, reject) {
      fsm.access({
        path: targetPath,
        success: function () { resolve(targetPath); },
        fail: function () {
          fsm.readFile({
            filePath: sourcePath,
            success: function (readResult) {
              fsm.writeFile({
                filePath: targetPath,
                data: readResult.data,
                success: function () { resolve(targetPath); },
                fail: reject
              });
            },
            fail: reject
          });
        }
      });
    });
  },

  resolveImageFilePath: function (url) {
    var that = this;
    if (!url) return Promise.reject(new Error('图片地址为空'));
    if (url.indexOf('/assets/') === 0) {
      var name = url.split('/').pop();
      return this.ensureAssetDirectory().then(function (dir) {
        return that.copyFileToUserPath(url, dir + '/system_' + name);
      });
    }
    if (url.indexOf('cloud://') === 0) {
      return new Promise(function (resolve, reject) {
        if (!wx.cloud) {
          reject(new Error('当前环境不支持云文件下载'));
          return;
        }
        wx.cloud.downloadFile({
          fileID: url,
          success: function (res) { resolve(res.tempFilePath); },
          fail: reject
        });
      });
    }
    if (/^https?:\/\//.test(url)) {
      return new Promise(function (resolve, reject) {
        wx.downloadFile({
          url: url,
          success: function (res) {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.tempFilePath);
            else reject(new Error('图片下载失败 HTTP ' + res.statusCode));
          },
          fail: reject
        });
      });
    }
    return Promise.resolve(url);
  },

  saveToAlbum: function (filePath) {
    return new Promise(function (resolve, reject) {
      wx.saveImageToPhotosAlbum({ filePath: filePath, success: resolve, fail: reject });
    });
  },

  handleSaveError: function (err, saved, total) {
    var message = String((err && err.errMsg) || (err && err.message) || err || '未知错误');
    var denied = message.indexOf('auth deny') !== -1 || message.indexOf('authorize:fail') !== -1;
    wx.showModal({
      title: denied ? '需要相册权限' : '保存未完成',
      content: denied
        ? '请在设置中允许保存到相册，当前项目不会丢失。'
        : '已保存 ' + saved + '/' + total + ' 张，可稍后重新保存。',
      confirmText: denied ? '去设置' : '知道了',
      showCancel: denied,
      success: function (res) {
        if (denied && res.confirm) wx.openSetting({});
      }
    });
  },

  onCloseGuide: function () {
    this.setData({ showGuide: false });
  },

  onGuidePanelTap: function () {},

  onGuidePreview: function () {
    this.setData({ showGuide: false });
    this.onPreview();
  },

  onShareAppMessage: function () {
    return {
      title: '四个部位随便滑，来玩分层云换装',
      path: '/pages/index/index'
    };
  }
});
