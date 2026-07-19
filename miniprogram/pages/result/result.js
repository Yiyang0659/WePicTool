// pages/result/result.js
const { normalizeTaskGroups, GROUP_META, createMockTask } = require('../../utils/task');
const { composeCard, DEFAULT_OPTIONS } = require('../../utils/cardComposer');

const CHANGE_CATEGORY_OPTIONS = [
  { key: 'tops', label: '上衣组' },
  { key: 'bottoms', label: '下装组' },
  { key: 'shoes', label: '鞋子组' },
  { key: 'others', label: '其他素材' }
];

const RATIO_OPTIONS = [
  { key: '1:1', label: '1:1', icon: '⬜', desc: '正方形，适合头像/商品' },
  { key: '4:5', label: '4:5', icon: '📱', desc: '竖版，适合朋友圈/小红书' },
  { key: '3:4', label: '3:4', icon: '📷', desc: '竖版，通用穿搭展示' }
];

// 分组卡片头部展示信息（对齐高保真原型 #screen-result）
const GROUP_CARD_META = {
  tops: { emoji: '👕', title: '上衣组' },
  bottoms: { emoji: '👖', title: '下装组' },
  shoes: { emoji: '👟', title: '鞋子组' },
  others: { emoji: '🖼', title: '其他素材' }
};

const GROUP_ORDER = ['tops', 'bottoms', 'shoes', 'others'];
const DEFAULT_RATIO = '4:5';

const RECORDS_KEY = 'wepictool_records';
const MAX_RECORDS = 20;

// 计算单条结果的展示图（WXML 不支持调用 Page 方法，必须落到数据字段上）
function computeDisplayUrl(item) {
  if (!item) return '';
  // 用户显式切换到原图
  if (item.showMode === 'original') {
    return item.originalUrl || item.url || item.fileId || item.localPath || '';
  }
  // 合成后的白底卡片优先
  if (item.composedUrl) return item.composedUrl;
  // 其次是云存储的抠图结果
  if (item.mattedUrl) return item.mattedUrl;
  return item.url || item.fileId || item.localPath || '';
}

// 给分组内每条结果补充 displayUrl / composeStatus / numLabel 视图字段
function decorateGroups(groups) {
  const decorated = {};
  Object.keys(groups || {}).forEach((key) => {
    decorated[key] = (groups[key] || []).map((item, index) => Object.assign({}, item, {
      displayUrl: computeDisplayUrl(item),
      composeStatus: item.composeStatus || '',
      numLabel: index < 9 ? `0${index + 1}` : `${index + 1}`
    }));
  });
  return decorated;
}

// 用 path-based setData 更新深层嵌套数组属性时，如果属性不存在于原数据项中，
// 框架可能静默失败导致视图不更新。此函数通过替换整个分组数组来保证视图刷新。
function updateGroupItem(page, groupKey, index, updates) {
  var groups = page.data.groups;
  var items = groups[groupKey] || [];
  var oldItem = items[index];
  if (!oldItem) return;
  var newItem = Object.assign({}, oldItem, updates);
  newItem.displayUrl = computeDisplayUrl(newItem);
  var newItems = items.slice();
  newItems[index] = newItem;
  page.setData({ ['groups.' + groupKey]: newItems });
}

Page({
  data: {
    taskId: '',
    groups: {
      tops: [],
      bottoms: [],
      shoes: [],
      others: []
    },
    groupList: [],
    totalCount: 0,
    isEmpty: false,
    changeCategoryOptions: CHANGE_CATEGORY_OPTIONS.map(item => item.label),
    ratio: DEFAULT_RATIO,
    ratioOptions: RATIO_OPTIONS,
    showRatioSheet: false,
    composing: false,
    // Canvas 合成进度：{ done: N, total: M }
    composeProgress: null,
    // 「朋友视角」引导卡缩略图（取第一个非空分组的前 3 张 displayUrl）
    friendPreviewThumbs: [],
    // 保存完成后的发送引导半屏浮层
    showSendGuide: false,
    // 跨组降级提示：所有有图的穿搭组均不足 3 张时展示
    crossGroupHint: ''
  },

  _composerCanvas: null,
  _composerReady: false,
  _composeToken: 0,
  _composeChain: null,
  _pendingTask: null,

  onLoad: function (options) {
    const that = this;
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
    }

    this.initComposerCanvas();

    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        if (data && data.task) {
          that.parseTaskResult(data.task);
        }
      });
    }
  },

  onReady: function () {
    // onLoad 时页面可能尚未渲染完成，canvas 节点拿不到则在这里补一次
    if (!this._composerReady) {
      this.initComposerCanvas();
    }
  },

  initComposerCanvas: function (retryCount) {
    const that = this;
    const attempt = retryCount || 0;
    const query = wx.createSelectorQuery();
    query.select('#cardComposer').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        if (attempt < 2) {
          setTimeout(() => that.initComposerCanvas(attempt + 1), 300);
        } else {
          console.warn('cardComposer canvas 初始化失败');
        }
        return;
      }
      that._composerCanvas = res[0].node;
      that._composerReady = true;

      // 如果初始化时任务数据已经到达，补执行合成
      if (that._pendingTask) {
        that._pendingTask = null;
        that.composeAllCards(that.data.groups);
      }
    });
  },

  parseTaskResult: function (task) {
    const groups = decorateGroups(normalizeTaskGroups(task.groups || {}));
    const totalCount = this.calculateTotalCount(groups);
    const isEmpty = totalCount === 0;
    // 初始合成比例：确认页随任务传入；历史记录等无 ratio 的场景回退到产品默认 4:5
    const ratio = this.isValidRatio(task && task.ratio) ? task.ratio : DEFAULT_RATIO;

    this.setData({
      groups,
      totalCount,
      isEmpty,
      ratio,
      groupList: this.buildGroupList(groups),
      friendPreviewThumbs: this.buildFriendPreviewThumbs(groups),
      crossGroupHint: this.computeCrossGroupHint(groups)
    });

    if (!this.hasSavedRecord && task && totalCount > 0) {
      this.hasSavedRecord = true;
      this.saveRecordToStorage(task);
    }

    // 触发白底卡片合成
    if (this._composerReady) {
      this.composeAllCards(this.data.groups);
    } else {
      this._pendingTask = this.data.groups;
    }
  },

  isValidRatio: function (ratio) {
    return RATIO_OPTIONS.some(option => option.key === ratio);
  },

  // 分组卡片头部视图模型：组名 + 张数 + 状态徽标（WXML 禁止函数调用，需预计算）
  buildGroupList: function (groups) {
    const list = [];
    GROUP_ORDER.forEach((key) => {
      const count = (groups[key] || []).length;
      if (count === 0) return;
      const meta = GROUP_CARD_META[key];
      let badgeText;
      let badgeClass;
      if (key === 'others') {
        badgeText = '不进入穿搭叠图';
        badgeClass = 'warn';
      } else if (count >= 3) {
        badgeText = '适合微信叠图';
        badgeClass = 'ok';
      } else {
        badgeText = '不足 3 张 · 建议普通发送';
        badgeClass = 'warn';
      }
      list.push({
        key,
        emoji: meta.emoji,
        title: meta.title,
        count,
        badgeText,
        badgeClass,
        saveText: `保存 ${meta.title}（${count} 张）`
      });
    });
    return list;
  },

  // 「朋友视角」引导卡缩略图：按分组顺序取第一个非空组的前 3 张展示图
  buildFriendPreviewThumbs: function (groups) {
    for (let i = 0; i < GROUP_ORDER.length; i++) {
      const items = groups[GROUP_ORDER[i]] || [];
      if (items.length === 0) continue;
      return items.slice(0, 3)
        .map(item => item.displayUrl || computeDisplayUrl(item))
        .filter(Boolean);
    }
    return [];
  },

  // 跨组降级提示：遍历 tops/bottoms/shoes 三个穿搭组，
  // 若所有有图的穿搭组（count > 0）的图片数都 < 3，返回降级提示文案；否则返回空字符串。
  computeCrossGroupHint: function (groups) {
    var outfitKeys = ['tops', 'bottoms', 'shoes'];
    var hasAny = false;
    var allBelowThree = true;
    for (var i = 0; i < outfitKeys.length; i++) {
      var count = (groups[outfitKeys[i]] || []).length;
      if (count > 0) {
        hasAny = true;
        if (count >= 3) {
          allBelowThree = false;
        }
      }
    }
    if (hasAny && allBelowThree) {
      return '当前各组均不足 3 张，建议普通发送；如需叠图效果，建议每组补充到 3 张以上';
    }
    return '';
  },

  // 所有合成任务都经过这个串行队列：
  // 1) 共享同一个 canvas，并行绘制会互相污染
  // 2) 避免 iOS/Android 同时处理多张 1024px 大图导致内存峰值
  _enqueueCompose: function (taskFn) {
    const chain = this._composeChain || Promise.resolve();
    const run = chain.then(() => taskFn());
    this._composeChain = run.then(() => undefined, () => undefined);
    return run;
  },

  _updateComposeProgress: function () {
    var progress = this.data.composeProgress;
    if (!progress) return;
    var next = { done: progress.done + 1, total: progress.total };
    this.setData({ composeProgress: next });
  },

  composeAllCards: function (groups) {
    if (!groups || !this._composerReady) return;
    const that = this;
    const ratio = this.data.ratio;
    const token = ++this._composeToken;
    const processable = ['tops', 'bottoms', 'shoes'];

    const jobs = [];
    processable.forEach((groupKey) => {
      (groups[groupKey] || []).forEach((item, index) => {
        // 已按当前比例合成成功的跳过，避免移动分类等场景重复合成
        if (item.composeStatus === 'done' && item.composedRatio === ratio && item.composedUrl) return;
        jobs.push({ groupKey, index, item });
      });
    });

    if (jobs.length === 0) {
      this.setData({ composing: false, composeProgress: null });
      return;
    }

    this.setData({ composing: true, composeProgress: { done: 0, total: jobs.length } });

    const runNext = (cursor) => {
      if (that._composeToken !== token) return; // 已被更新的合成任务（如切换比例）取代
      if (cursor >= jobs.length) {
        that.setData({ composing: false, composeProgress: null });
        return;
      }
      const job = jobs[cursor];
      updateGroupItem(that, job.groupKey, job.index, { composeStatus: 'composing' });
      that._enqueueCompose(() => that.composeItem(job.groupKey, job.index, job.item, ratio))
        .then((res) => {
          if (that._composeToken !== token) return;
          that.applyComposeSuccess(res.groupKey, res.index, res);
        })
        .catch((err) => {
          if (that._composeToken !== token) return;
          that.applyComposeFailure(job.groupKey, job.index, err);
        })
        .then(() => runNext(cursor + 1));
    };

    runNext(0);
  },

  composeItem: function (groupKey, index, item, ratio) {
    if (!item) return Promise.reject(new Error('item 为空'));

    // 优先用抠图结果（matted/ 透明主体图）合成；抠图失败的图用原图兜底，不影响整批
    const sourceUrl = item.mattedUrl || item.url || item.fileId || item.localPath;
    if (!sourceUrl) return Promise.reject(new Error('无可用图片源'));

    return composeCard(this._composerCanvas, {
      sourceUrl: sourceUrl,
      category: groupKey,
      ratio: ratio,
      background: '#FFFFFF',
      enhanceLightColor: true,
      canvasSize: 1024,
      isMatted: !!item.mattedUrl
    }).then((result) => ({
      groupKey,
      index,
      tempFilePath: result.tempFilePath,
      ratio: result.ratio,
      width: result.width,
      height: result.height
    }));
  },

  applyComposeSuccess: function (groupKey, index, res) {
    updateGroupItem(this, groupKey, index, {
      composedUrl: res.tempFilePath,
      composedRatio: res.ratio,
      composeStatus: 'done',
      composeError: ''
    });
    this._updateComposeProgress();
  },

  applyComposeFailure: function (groupKey, index, err) {
    console.warn(`白底卡片合成失败 ${groupKey}[${index}]:`, err);
    updateGroupItem(this, groupKey, index, {
      composeStatus: 'fail',
      composeError: (err && err.message) || '合成失败'
    });
    this._updateComposeProgress();
  },

  // 失败图「重做」入口
  onRetryItem: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = (this.data.groups[groupKey] || [])[index];
    if (!item) return;

    // 抠图失败且存在云端原图：先重走一次云端抠图，再重新合成
    const cloudSource = this.getCloudSource(item);
    if (item.matted === false && cloudSource && wx.cloud) {
      this.retryMatting(groupKey, index, item, cloudSource);
      return;
    }
    // 否则仅重新合成（合成失败重试 / 本地预览图无云端源）
    this.retryCompose(groupKey, index, item);
  },

  getCloudSource: function (item) {
    if (!item) return '';
    if (item.originalFileId && item.originalFileId.indexOf('cloud://') === 0) return item.originalFileId;
    if (item.originalUrl && item.originalUrl.indexOf('cloud://') === 0) return item.originalUrl;
    if (item.fileId && item.fileId.indexOf('cloud://') === 0) return item.fileId;
    return '';
  },

  retryCompose: function (groupKey, index, item) {
    const that = this;
    if (!this._composerReady) {
      wx.showToast({ title: '合成器未就绪，请稍后重试', icon: 'none' });
      return;
    }
    updateGroupItem(this, groupKey, index, { composeStatus: 'composing' });
    this._enqueueCompose(() => that.composeItem(groupKey, index, item, that.data.ratio))
      .then((res) => that.applyComposeSuccess(groupKey, index, res))
      .catch((err) => that.applyComposeFailure(groupKey, index, err));
  },

  // 单图重调 processOutfit 做一次真实抠图重做；仍失败则原图合成兜底
  retryMatting: function (groupKey, index, item, cloudSource) {
    const that = this;
    const base = `groups.${groupKey}[${index}]`;
    updateGroupItem(this, groupKey, index, { composeStatus: 'composing' });
    wx.showLoading({ title: '正在重做抠图...', mask: true });
    wx.cloud.callFunction({
      name: 'processOutfit',
      data: {
        images: [{
          imageId: item.sourceImageId || 'retry_image_1',
          fileId: cloudSource,
          url: cloudSource
        }]
      },
      success: (res) => {
        wx.hideLoading();
        const result = res && res.result && res.result.results && res.result.results[0];
        const latest = (that.data.groups[groupKey] || [])[index] || item;
        if (result && result.matted && result.mattedUrl) {
          const merged = Object.assign({}, latest, {
            matted: true,
            type: 'matted',
            mattedUrl: result.mattedUrl,
            mattedFileId: result.mattedFileId || result.mattedUrl
          });
          that.setData({
            [`${base}.matted`]: true,
            [`${base}.type`]: 'matted',
            [`${base}.mattedUrl`]: result.mattedUrl,
            [`${base}.mattedFileId`]: result.mattedFileId || result.mattedUrl
          }, () => that.retryCompose(groupKey, index, merged));
          return;
        }
        // 抠图仍失败：保留原图合成兜底，不阻断其他结果
        wx.showToast({ title: '抠图仍失败，已用原图合成', icon: 'none' });
        that.retryCompose(groupKey, index, latest);
      },
      fail: (err) => {
        wx.hideLoading();
        console.warn('重做抠图失败:', err);
        const latest = (that.data.groups[groupKey] || [])[index] || item;
        wx.showToast({ title: '抠图重做失败，已用原图合成', icon: 'none' });
        that.retryCompose(groupKey, index, latest);
      }
    });
  },

  calculateTotalCount: function (groups) {
    return Object.keys(groups).reduce((sum, key) => sum + (groups[key] || []).length, 0);
  },

  getDisplayUrl: function (item) {
    return computeDisplayUrl(item);
  },

  getSaveUrl: function (item) {
    if (!item) return '';
    // 如果用户切换到原图模式，保存用户看到的（所见即所得）
    if (item.showMode === 'original') {
      return item.originalUrl || item.url || item.fileId || item.localPath || '';
    }
    // 合成模式下，优先合成图
    return item.composedUrl || item.displayUrl || item.url || item.fileId || item.localPath || '';
  },

  // 比例切换
  onChangeRatio: function () {
    this.setData({ showRatioSheet: true });
  },

  onCloseRatioSheet: function () {
    this.setData({ showRatioSheet: false });
  },

  // 弹层面板点击拦截（防止穿透关闭）
  onActionPanelTap: function () {},

  onSelectRatio: function (e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const selected = RATIO_OPTIONS[index];
    if (!selected || selected.key === this.data.ratio) {
      this.setData({ showRatioSheet: false });
      return;
    }

    this.setData({ ratio: selected.key, showRatioSheet: false }, () => {
      // 切换比例后整批重新合成（旧任务通过 token 自动作废）
      this.composeAllCards(this.data.groups);
    });
  },

  onToggleOriginal: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = this.data.groups[groupKey][index];
    if (!item) return;
    var current = item.showMode || 'composed';
    var next = current === 'composed' ? 'original' : 'composed';
    var merged = Object.assign({}, item, { showMode: next });
    this.setData({
      [`groups.${groupKey}[${index}].showMode`]: next,
      [`groups.${groupKey}[${index}].displayUrl`]: computeDisplayUrl(merged)
    });
  },

  onChangeCategory: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = this.data.groups[groupKey][index];
    if (!item) return;

    const aiType = item.classification && item.classification.type;
    const aiConfidence = item.classification && typeof item.classification.confidence === 'number'
      ? item.classification.confidence : null;

    let title = '修改分类';
    if (aiConfidence !== null && aiConfidence < 0.8) {
      title = 'AI 置信度较低，请确认分类';
    } else if (aiType && aiType !== 'others') {
      title = `AI 判断为 ${this.getCategoryLabel(aiType)}，可修改`;
    }

    wx.showActionSheet({
      itemList: this.data.changeCategoryOptions,
      title,
      success: (res) => {
        const targetKey = CHANGE_CATEGORY_OPTIONS[res.tapIndex].key;
        if (targetKey === groupKey) return;
        this.moveItemToGroup(groupKey, index, targetKey);
      }
    });
  },

  getCategoryLabel: function (key) {
    const meta = GROUP_CARD_META[key];
    return meta ? meta.title : '其他素材';
  },

  moveItemToGroup: function (sourceGroupKey, sourceIndex, targetGroupKey) {
    const groups = this.data.groups;
    const item = groups[sourceGroupKey][sourceIndex];
    if (!item) return;

    groups[sourceGroupKey].splice(sourceIndex, 1);
    item.category = targetGroupKey;
    if (item.classification) {
      item.classification = Object.assign({}, item.classification, {
        userChanged: true,
        originalType: item.classification.originalType || item.classification.type,
        type: targetGroupKey
      });
    }
    // 分组锚点变化，旧的合成结果不再适用
    item.composedUrl = '';
    item.composedRatio = '';
    item.composeStatus = '';
    groups[targetGroupKey].push(item);

    // 取消进行中的整批合成：移动后各组索引已变化，旧任务的写入位置会错位
    this._composeToken += 1;
    ['tops', 'bottoms', 'shoes'].forEach((key) => {
      (groups[key] || []).forEach((groupItem) => {
        if (groupItem.composeStatus === 'composing') groupItem.composeStatus = '';
      });
    });

    const normalizedGroups = decorateGroups(normalizeTaskGroups(groups));
    const totalCount = this.calculateTotalCount(normalizedGroups);
    this.setData({
      groups: normalizedGroups,
      totalCount,
      isEmpty: totalCount === 0,
      groupList: this.buildGroupList(normalizedGroups),
      friendPreviewThumbs: this.buildFriendPreviewThumbs(normalizedGroups),
      crossGroupHint: this.computeCrossGroupHint(normalizedGroups)
    });

    // 按新分组锚点重新合成未完成项（已按当前比例合成好的会被跳过）
    if (this._composerReady) {
      this.composeAllCards(this.data.groups);
    }

    wx.showToast({ title: `已移到${this.getCategoryLabel(targetGroupKey)}`, icon: 'none' });
  },

  onPreviewGroupImage: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const groupItems = this.data.groups[groupKey] || [];
    const urls = groupItems.map(item => this.getDisplayUrl(item));
    wx.previewImage({ urls, current: this.getDisplayUrl(groupItems[index]) });
  },

  onBackHome: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  },

  // 跳转微信发送预览页（eventChannel 契约保持不变）
  onWechatPreview: function () {
    // 合成未完成时提示用户，避免预览页看到混合状态
    var hasComposing = GROUP_ORDER.some(function (key) {
      return (this.data.groups[key] || []).some(function (item) {
        return item.composeStatus === 'composing';
      });
    }.bind(this));
    if (hasComposing) {
      wx.showToast({ title: '部分卡片仍在生成中', icon: 'none', duration: 2000 });
    }

    const that = this;
    wx.navigateTo({
      url: '/pages/preview/preview?taskId=' + this.data.taskId,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', {
          task: {
            taskId: that.data.taskId,
            groups: that.data.groups,
            ratio: that.data.ratio
          }
        });
      }
    });
  },

  // 发送引导浮层：仅关闭（「我知道了」）
  onCloseSendGuide: function () {
    this.setData({ showSendGuide: false });
  },

  // 发送引导浮层：关闭并跳转现有微信预览页（「去看看朋友视角」）
  onSendGuidePreview: function () {
    this.setData({ showSendGuide: false });
    this.onWechatPreview();
  },

  // 保存单图（每组缩略图下方的「保存单图」按钮）
  onSaveSingleItem: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const index = parseInt(e.currentTarget.dataset.index, 10);
    const item = (this.data.groups[groupKey] || [])[index];
    if (!item) return;
    const url = this.getSaveUrl(item);
    if (!url) {
      wx.showToast({ title: '图片还在生成中，请稍候', icon: 'none' });
      return;
    }
    this.saveImagesSequentially([url], '已保存到相册');
  },

  // 底部「保存全部」：按分组顺序编号 01-N 依次保存
  onSaveAllImages: function () {
    const allUrls = this.getAllImageUrls();
    if (allUrls.length === 0) return;
    if (this.data.composing) {
      wx.showToast({ title: '白底卡片生成中，已生成的优先保存', icon: 'none' });
    }
    this.saveImagesSequentially(allUrls, '全部图片保存完成', true);
  },

  // 穿搭组整组保存（「其他素材」组不提供整组保存入口）
  onSaveGroupByKey: function (e) {
    const groupKey = e.currentTarget.dataset.group;
    const urls = this.getGroupUrls(groupKey);
    if (urls.length === 0) return;
    if (this.data.composing) {
      wx.showToast({ title: '白底卡片生成中，已生成的优先保存', icon: 'none' });
    }
    this.saveImagesSequentially(urls, `${GROUP_CARD_META[groupKey].title}保存完成`, true);
  },

  getAllImageUrls: function () {
    const urls = [];
    GROUP_ORDER.forEach(key => urls.push(...this.getGroupUrls(key)));
    return urls;
  },

  getGroupUrls: function (groupName) {
    return (this.data.groups[groupName] || []).map(item => this.getSaveUrl(item)).filter(Boolean);
  },

  saveImagesSequentially: function (urls, successTitle, showGuide) {
    if (!urls || urls.length === 0) return;
    const that = this;
    wx.showLoading({ title: `正在保存 1/${urls.length} 张...`, mask: true });
    const saveNext = (index) => {
      if (index >= urls.length) {
        wx.hideLoading();
        if (showGuide) {
          // 保存后发送引导：改为自定义半屏浮层，引导回微信勾选「发送后合并展示」
          that.setData({ showSendGuide: true });
        } else {
          wx.showToast({ title: successTitle || '保存完成', icon: 'success', duration: 2000 });
        }
        return;
      }
      wx.showLoading({ title: `正在保存 ${index + 1}/${urls.length} 张...`, mask: true });
      that.downloadAndSaveToAlbum(urls[index])
        .then(() => { saveNext(index + 1); })
        .catch((err) => { wx.hideLoading(); that.handleSaveError(err, urls.slice(index)); });
    };
    saveNext(0);
  },

  downloadAndSaveToAlbum: function (url) {
    return this.resolveImageFilePath(url).then(filePath => {
      return new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: () => resolve(),
          fail: (err) => reject({ type: 'save_fail', error: err, filePath })
        });
      });
    });
  },

  resolveImageFilePath: function (url) {
    return new Promise((resolve, reject) => {
      if (!url || typeof url !== 'string') {
        reject({ type: 'invalid_url', error: new Error('图片地址无效') });
        return;
      }
      if (url.startsWith('cloud://')) {
        if (!wx.cloud) {
          reject({ type: 'download_fail', error: new Error('当前环境不支持云文件下载') });
          return;
        }
        wx.cloud.downloadFile({
          fileID: url,
          success: (res) => resolve(res.tempFilePath),
          fail: (err) => reject({ type: 'download_fail', error: err })
        });
        return;
      }
      if (/^https?:\/\//.test(url)) {
        wx.downloadFile({
          url,
          success: (res) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              reject({ type: 'download_fail', error: new Error(`HTTP ${res.statusCode}`) });
              return;
            }
            resolve(res.tempFilePath);
          },
          fail: (err) => reject({ type: 'download_fail', error: err })
        });
        return;
      }
      resolve(url);
    });
  },

  handleSaveError: function (errInfo, urlsToRetry) {
    const errMsg = errInfo.error ? errInfo.error.errMsg : '';
    console.error('保存失败详情:', errInfo);
    if (errMsg && (errMsg.indexOf('auth deny') !== -1 || errMsg.indexOf('authorize:fail') !== -1)) {
      wx.showModal({
        title: '需要相册授权',
        content: '保存参考图需要将图片写入您的相册。请点击下方"前往设置"，在权限设置中开启"保存到相册"或"照片"权限，然后重试。',
        confirmText: '前往设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                if (settingRes.authSetting['scope.writePhotosAlbum']) {
                  wx.showToast({ title: '授权成功，请重试', icon: 'none' });
                }
              }
            });
          }
        }
      });
    } else {
      wx.showModal({
        title: '保存失败',
        content: '保存图片到相册遇到问题，请检查系统相册权限，或尝试截图保存。',
        confirmText: '重新尝试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm && urlsToRetry) {
            this.saveImagesSequentially(urlsToRetry, '保存完成');
          }
        }
      });
    }
  },

  saveRecordToStorage: function (task) {
    try {
      const records = wx.getStorageSync(RECORDS_KEY) || [];
      // 按 taskId 去重：同一任务（如从记录页「查看」再次打开旧 taskSnapshot）只保留首次写入的记录，
      // 命中已存在记录时直接跳过（不新增、不挪动位置），避免列表出现同组重复记录。
      // 去重口径：优先比对 r.taskSnapshot.taskId，兼容历史可能存在的 r.taskId 直存形态；
      // 记录页「再次生成」会 createMockTask 产生新 taskId，视为新任务，不在去重拦截范围内。
      const taskId = task && task.taskId;
      if (taskId && records.some(r => (r.taskSnapshot && r.taskSnapshot.taskId === taskId) || r.taskId === taskId)) {
        return;
      }
      const thumbnails = this.extractThumbnails(task.groups || {});
      const groupSummary = {};
      Object.keys(task.groups || {}).forEach(key => { groupSummary[key] = (task.groups[key] || []).length; });
      const sourceImages = (task.results || []).map(item => ({
        imageId: item.sourceImageId || item.imageId || '',
        fileId: item.fileId || '',
        localPath: item.localPath || '',
        url: item.url || item.fileId || item.localPath || ''
      })).filter(item => item.url);

      records.unshift({
        recordId: `record_${Date.now()}`,
        createdAt: Date.now(),
        totalCount: this.calculateTotalCount(task.groups || {}),
        groupSummary,
        thumbnails,
        taskSnapshot: task,
        sourceImages
      });
      if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
      wx.setStorageSync(RECORDS_KEY, records);
    } catch (err) {
      console.error('保存记录失败:', err);
    }
  },

  extractThumbnails: function (groups) {
    const thumbs = [];
    for (const key of ['tops', 'bottoms', 'shoes', 'others']) {
      for (const item of (groups[key] || [])) {
        const url = this.getDisplayUrl(item);
        if (url) { thumbs.push(url); if (thumbs.length >= 4) return thumbs; }
      }
    }
    return thumbs;
  },

  onShareAppMessage: function () {
    return {
      title: '我刚用滑一叠做了一叠穿搭卡片，快来滑着帮我挑！',
      path: '/pages/index/index'
    };
  }
});
