const registry = require('../../config/playRegistry');
const dressup = require('../../utils/layeredDressup');
const imageExporter = require('../../utils/imageExporter');
const stackExportManifest = require('../../utils/stackExportManifest');
const sequenceBadgeComposer = require('../../utils/sequenceBadgeComposer');
const { ENABLE_OUTFIT_AI_ASSIST } = require('../../config/env');

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
    pendingList: [],
    aiAssistEnabled: ENABLE_OUTFIT_AI_ASSIST === true,
    sourceLabel: '',
    packTitle: '四套基础穿搭',
    validGroupCount: 0,
    canExport: false,
    saving: false,
    showGuide: false,
    guideTitle: '保存完成',
    exportPreparing: false,
    exportManifest: null,
    exportFingerprint: '',
    saveCursor: 0,
    saveSessionFingerprint: '',
    exportError: ''
  },

  _sequenceCanvas: null,
  _sequenceReady: false,
  _exportGeneration: 0,
  _exportPreparePromise: null,
  _savePromise: null,
  _saveSelectionKey: '',

  onLoad: function (options) {
    this.initSequenceCanvas();
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

  onReady: function () {
    if (!this._sequenceReady) this.initSequenceCanvas();
  },

  onUnload: function () {
    this._exportGeneration += 1;
    this._exportPreparePromise = null;
    this._savePromise = null;
  },

  initSequenceCanvas: function (retryCount) {
    var that = this;
    var attempt = retryCount || 0;
    if (typeof wx.createSelectorQuery !== 'function') {
      this.setData({ exportError: '顺序图生成器未就绪，请稍后重试' });
      return;
    }
    var query = wx.createSelectorQuery();
    query.select('#sequenceBadgeCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        if (attempt < 2) setTimeout(function () { that.initSequenceCanvas(attempt + 1); }, 300);
        else that.setData({ exportError: '顺序图生成器未就绪，请稍后重试' });
        return;
      }
      that._sequenceCanvas = res[0].node;
      that._sequenceReady = true;
      if (that.data.project) that.prepareExportManifest().catch(function () {});
    });
  },

  invalidateExportState: function () {
    this._exportGeneration += 1;
    this._exportPreparePromise = null;
    this._savePromise = null;
    this._saveSelectionKey = '';
    var groupList = (this.data.groupList || []).map(function (group) {
      return Object.assign({}, group, {
        items: (group.items || []).map(function (item) {
          var next = Object.assign({}, item);
          delete next.exportUrl;
          return next;
        })
      });
    });
    this.setData({
      groupList: groupList,
      exportPreparing: false,
      exportManifest: null,
      exportFingerprint: '',
      saveCursor: 0,
      saveSessionFingerprint: '',
      exportError: '',
      saving: false
    });
  },

  refreshProject: function (project, persist) {
    this.invalidateExportState();
    var sendability = dressup.buildSendability(project);
    var groupList = registry.GROUP_DEFINITIONS.map(function (definition) {
      var items = (project.groups[definition.key] || []).map(function (item, index, all) {
        return Object.assign({}, item, {
          displayUrl: getItemUrl(item),
          exportUrl: '',
          isFirst: index === 0,
          canLeft: index > 0,
          canRight: index < all.length - 1,
          sourceText: item.source === 'system' ? '系统' : (item.source === 'ai' ? 'AI 整理' : '我的')
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
    var pendingList = (project.pendingItems || []).map(function (item) {
      return Object.assign({}, item, {
        displayUrl: getItemUrl(item),
        sourceText: item.source === 'ai' ? 'AI 整理' : '我的'
      });
    });

    var that = this;
    this.setData({
      project: project,
      groupList: groupList,
      pendingList: pendingList,
      sourceLabel: sourceLabels[project.sourceMode] || '我的素材',
      packTitle: pack ? pack.title : '四套基础穿搭',
      validGroupCount: sendability.validGroupCount,
      canExport: sendability.canExport
    }, function () {
      if (that._sequenceReady) that.prepareExportManifest().catch(function () {});
    });

    if (persist !== false) this.persistDraft(project);
  },

  applyMaterializedManifest: function (manifest) {
    var byStack = {};
    manifest.stacks.forEach(function (stack) { byStack[stack.stackId] = stack; });
    var groupList = this.data.groupList.map(function (group) {
      var stack = byStack[group.key];
      return Object.assign({}, group, {
        items: group.items.map(function (item, index) {
          return Object.assign({}, item, {
            exportUrl: stack && stack.cards[index] ? stack.cards[index].exportUrl : ''
          });
        })
      });
    });
    this.setData({
      groupList: groupList,
      exportPreparing: false,
      exportManifest: manifest,
      exportFingerprint: manifest.fingerprint,
      exportError: ''
    });
  },

  prepareExportManifest: function () {
    var that = this;
    if (!this.data.project) return Promise.reject(Object.assign(new Error('换装项目尚未加载'), { code: 'PROJECT_NOT_READY' }));
    if (!this._sequenceReady || !this._sequenceCanvas) {
      return Promise.reject(Object.assign(new Error('顺序图生成器未就绪'), { code: 'SEQUENCE_CANVAS_UNAVAILABLE' }));
    }
    var sourceManifest;
    try {
      sourceManifest = stackExportManifest.buildDressupManifest(this.data.project, registry.GROUP_DEFINITIONS);
    } catch (error) {
      this.setData({ exportError: (error && error.message) || '顺序图准备失败' });
      return Promise.reject(error);
    }
    if (this.data.exportManifest && this.data.exportFingerprint === sourceManifest.fingerprint) {
      return Promise.resolve(this.data.exportManifest);
    }
    if (this._exportPreparePromise) return this._exportPreparePromise;
    var generation = ++this._exportGeneration;
    this.setData({ exportPreparing: true, exportError: '' });
    var materializing = sequenceBadgeComposer.materializeManifest(wx, this._sequenceCanvas, sourceManifest, {
      isCurrent: function () { return that._exportGeneration === generation; },
      resolvePath: function (wxApi, sourceUrl) {
        return that.resolveSequenceImagePath(sourceUrl);
      }
    }).then(function (manifest) {
      if (that._exportGeneration !== generation) {
        throw Object.assign(new Error('顺序图任务已过期'), { code: 'STALE_EXPORT_GENERATION' });
      }
      that.applyMaterializedManifest(manifest);
      return manifest;
    }).catch(function (error) {
      if (error && error.code === 'STALE_EXPORT_GENERATION') throw error;
      var detail = error && error.sequenceLabel ? '（' + (error.stackTitle || '当前组') + ' ' + error.sequenceLabel + '）' : '';
      that.setData({ exportPreparing: false, exportError: '顺序图生成失败' + detail + '，请重试' });
      throw error;
    });
    var tracked;
    tracked = materializing.then(function (manifest) {
      if (that._exportPreparePromise === tracked) that._exportPreparePromise = null;
      return manifest;
    }, function (error) {
      if (that._exportPreparePromise === tracked) that._exportPreparePromise = null;
      throw error;
    });
    this._exportPreparePromise = tracked;
    return tracked;
  },

  showExportError: function (error) {
    var title = error && error.code === 'SEQUENCE_CANVAS_UNAVAILABLE'
      ? '顺序图生成器未就绪，请稍后重试'
      : '顺序图生成失败，请重试';
    wx.showToast({ title: title, icon: 'none', duration: 2200 });
  },

  persistDraft: function (project) {
    try {
      wx.setStorageSync(DRAFT_KEY, dressup.serializeProject(project));
    } catch (err) {
      console.warn('保存分层换装草稿失败:', err);
    }
  },

  onOpenManualGroupPicker: function () {
    var that = this;
    wx.showActionSheet({
      itemList: registry.GROUP_DEFINITIONS.map(function (group) {
        return group.emoji + ' ' + group.title;
      }),
      success: function (result) {
        var definition = registry.GROUP_DEFINITIONS[result.tapIndex];
        if (definition) that.chooseUserItemsForGroup(definition.key);
      }
    });
  },

  onOpenAiImporter: function () {
    if (!this.data.aiAssistEnabled) {
      wx.showToast({ title: 'AI 整理暂未开放', icon: 'none' });
      return;
    }
    var that = this;
    wx.navigateTo({
      url: '/pages/outfit-import/outfit-import',
      success: function (result) {
        if (!result.eventChannel || typeof result.eventChannel.on !== 'function') return;
        result.eventChannel.on('acceptAiImport', function (payload) {
          that.onAcceptAiImport(payload || {});
        });
      }
    });
  },

  onAcceptAiImport: function (payload) {
    var result = dressup.mergeImportedItems(
      this.data.project,
      payload.groups || {},
      payload.pendingItems || [],
      'ai'
    );
    if (payload.ratio) result.project.ratio = payload.ratio;
    this.refreshProject(result.project);
    var title = result.addedCount > 0
      ? '已加入 ' + result.addedCount + ' 张'
      : (result.duplicateCount > 0 ? '这些图片已在工作台' : '没有可加入的图片');
    wx.showToast({ title: title, icon: 'none' });
  },

  onAddUserItems: function (event) {
    this.chooseUserItemsForGroup(event.currentTarget.dataset.group);
  },

  chooseUserItemsForGroup: function (groupKey) {
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

  onPreviewPendingItem: function (event) {
    var current = event.currentTarget.dataset.url;
    var urls = (this.data.pendingList || []).map(function (item) {
      return item.displayUrl;
    }).filter(Boolean);
    if (urls.length > 0) wx.previewImage({ current: current || urls[0], urls: urls });
  },

  onAssignPendingItem: function (event) {
    var itemId = event.currentTarget.dataset.id;
    if (!itemId) return;
    var that = this;
    wx.showActionSheet({
      itemList: registry.GROUP_DEFINITIONS.map(function (group) {
        return group.emoji + ' ' + group.title;
      }),
      success: function (sheetResult) {
        var definition = registry.GROUP_DEFINITIONS[sheetResult.tapIndex];
        if (!definition) return;
        var moveResult = dressup.assignPendingItem(that.data.project, itemId, definition.key);
        if (!moveResult.assigned) {
          wx.showToast({ title: moveResult.reason === 'group-full' ? '这一组已满 12 张' : '素材归类失败', icon: 'none' });
          return;
        }
        that.refreshProject(moveResult.project);
        wx.showToast({ title: '已放入' + definition.title, icon: 'success' });
      }
    });
  },

  onRemovePendingItem: function (event) {
    var itemId = event.currentTarget.dataset.id;
    if (!itemId) return;
    this.refreshProject(dressup.removePendingItem(this.data.project, itemId));
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
    var group = this.data.groupList.find(function (entry) { return entry.key === groupKey; });
    var items = group ? group.items : [];
    var urls = items.map(function (item) { return item.exportUrl || item.displayUrl; }).filter(Boolean);
    if (urls.length > 0) wx.previewImage({ current: current || urls[0], urls: urls });
  },

  onPreview: function () {
    var legacyGroups = dressup.buildPreviewGroups(this.data.project);
    if (legacyGroups.length === 0) {
      wx.showToast({ title: '先给任意部位添加素材', icon: 'none' });
      return Promise.resolve(null);
    }
    var that = this;
    var project = this.data.project;
    return this.prepareExportManifest().then(function (manifest) {
      wx.navigateTo({
        url: '/pages/preview/preview',
        success: function (res) {
          res.eventChannel.emit('acceptTaskData', {
            manifest: manifest,
            selectedStackIds: manifest.stacks.filter(function (stack) { return stack.cards.length > 0; }).map(function (stack) { return stack.stackId; }),
            ratio: project.ratio || '4:5'
          });
        }
      });
      return manifest;
    }).catch(function (error) {
      if (!error || error.code !== 'STALE_EXPORT_GENERATION') that.showExportError(error);
      return null;
    });
  },

  onSaveGroup: function (event) {
    if (this.data.saving) return this._savePromise || Promise.resolve(null);
    var groupKey = event.currentTarget.dataset.group;
    var status = dressup.buildSendability(this.data.project).groups[groupKey];
    if (!status || !status.canExport) {
      wx.showToast({ title: '这一组至少需要 3 张素材', icon: 'none' });
      return Promise.resolve(null);
    }
    var definition = registry.GROUP_DEFINITIONS.find(function (group) {
      return group.key === groupKey;
    });
    return this.saveManifestSelection([groupKey], '已保存' + definition.title + '组');
  },

  onSaveAll: function () {
    if (this.data.saving) return this._savePromise || Promise.resolve(null);
    var project = this.data.project;
    var sendability = dressup.buildSendability(project);
    if (!sendability.canExport) {
      wx.showToast({ title: '至少补齐一个 3 张以上的部位组', icon: 'none' });
      return Promise.resolve(null);
    }
    return this.saveManifestSelection(null, '有效部位组已全部保存');
  },

  saveManifestSelection: function (stackIds, successTitle) {
    var that = this;
    if (this._savePromise) return this._savePromise;
    var selectionKey = Array.isArray(stackIds) ? stackIds.join(',') : 'all';
    var run = this.prepareExportManifest().then(function (manifest) {
      var saveGeneration = that._exportGeneration;
      var canResume = that.data.saveSessionFingerprint === manifest.fingerprint && that._saveSelectionKey === selectionKey;
      var startIndex = canResume ? that.data.saveCursor : 0;
      that._saveSelectionKey = selectionKey;
      that.setData({ saving: true, saveCursor: startIndex, saveSessionFingerprint: manifest.fingerprint });
      return imageExporter.saveExportManifest(wx, manifest, {
        stackIds: stackIds || undefined,
        startIndex: startIndex,
        expectedFingerprint: manifest.fingerprint,
        onProgress: function (entry, current, total) {
          wx.showLoading({ title: (entry.stackTitle || '当前组') + ' ' + entry.sequenceLabel + ' · ' + current + '/' + total, mask: true });
        }
      }).then(function (result) {
        wx.hideLoading();
        if (that._exportGeneration !== saveGeneration) return result;
        that._saveSelectionKey = '';
        that.setData({
          saving: false,
          saveCursor: 0,
          saveSessionFingerprint: '',
          exportError: '',
          showGuide: true,
          guideTitle: successTitle + '（' + result.savedCount + ' 张）'
        });
        return result;
      }).catch(function (error) {
        wx.hideLoading();
        if (that._exportGeneration !== saveGeneration) return null;
        that.setData({
          saving: false,
          saveCursor: Math.max(0, Number(error && error.nextIndex) || 0),
          saveSessionFingerprint: manifest.fingerprint,
          exportError: (error && error.message) || '保存失败'
        });
        that.handleManifestSaveError(error, stackIds, successTitle);
        return null;
      });
    }).catch(function (error) {
      that.setData({ saving: false });
      that.showExportError(error);
      return null;
    });
    var tracked;
    tracked = run.then(function (result) {
      if (that._savePromise === tracked) that._savePromise = null;
      return result;
    }, function (error) {
      if (that._savePromise === tracked) that._savePromise = null;
      throw error;
    });
    this._savePromise = tracked;
    return tracked;
  },

  handleManifestSaveError: function (error, stackIds, successTitle) {
    var that = this;
    if (error && error.code === 'AUTH_DENIED') {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中允许保存到相册，然后从当前编号继续。',
        confirmText: '去设置',
        cancelText: '取消',
        success: function (result) { if (result.confirm && wx.openSetting) wx.openSetting({}); }
      });
      return;
    }
    var location = error && error.sequenceLabel
      ? (error.stackTitle || '当前组') + ' 的 ' + error.sequenceLabel
      : '当前图片';
    wx.showModal({
      title: '保存中断',
      content: location + ' 保存失败；重试会从这张继续，不会重复前面的图片。',
      confirmText: '继续保存',
      cancelText: '稍后再说',
      success: function (result) {
        if (result.confirm) that.saveManifestSelection(stackIds, successTitle);
      }
    });
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

  resolveSequenceImagePath: function (url) {
    if (!url) return Promise.reject(new Error('图片地址为空'));
    // Canvas 2D resolves a leading-slash package path against the current page
    // in DevTools/real-device rendering. Use an explicit path from dressup.js
    // to the mini-program package root instead of copying the bundled asset.
    if (url.indexOf('/assets/') === 0) return Promise.resolve('../..' + url);
    return this.resolveImageFilePath(url);
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
      title: '四个部位随便滑，来玩穿搭叠图',
      path: '/pages/index/index'
    };
  }
});
