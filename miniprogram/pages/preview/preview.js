// pages/preview/preview.js
// 微信折叠卡片 1:1 预览（技术契约 docs/product/TECHNICAL_SPEC.md §12.6）
// 参考实现：ui-reference/wx-stack-prototype.html（已验收 H5 高保真原型）
var taskUtils = require('../../utils/task');
var normalizeTaskGroups = taskUtils.normalizeTaskGroups;
var GROUP_META = taskUtils.GROUP_META;

var GROUP_ORDER = ['tops', 'bottoms', 'shoes', 'others'];
var RATIO_CLASS = { '1:1': 'ar11', '4:5': 'ar45', '3:4': 'ar34' };
var POS_CLASSES = ['pos-front', 'pos-g1', 'pos-g2'];
// 位置轮转（固定节点只换位置 class，内容永不变更）
// 左滑：front→g2、g1→front、g2→g1；右滑反向取回
var ROTATE_LEFT = { 'pos-front': 'pos-g2', 'pos-g1': 'pos-front', 'pos-g2': 'pos-g1' };
var ROTATE_RIGHT = { 'pos-front': 'pos-g1', 'pos-g1': 'pos-g2', 'pos-g2': 'pos-front' };

// ---- 手势参数（契约 §12.6）----
var DIR_LOCK_PX = 8;        // 首次位移超 8px 判定方向
var ROTATE_PER_PX = 0.025;  // 跟手旋转系数 dx * 0.025°
var ROTATE_MAX = 6;         // 旋转上限 ±6°
var FLICK_VELOCITY = 0.3;   // 速度阈值 0.3px/ms（最近 120ms 采样）
var VELOCITY_WINDOW = 120;  // 速度采样窗口 ms
var DISTANCE_RATIO = 0.25;  // 位移阈值：卡宽 25%
var FLY_DURATION = 220;     // 飞出 220ms ease-in
var FLY_BUFFER = 30;        // 飞出动画落地缓冲
var ENTER_STAGGER = 40;     // 展开 stagger 40ms
var LEAVE_STAGGER = 30;     // 收起 stagger 30ms 逆序
var LEAVE_DURATION = 180;   // 收起单行动画 180ms ease-in

Page({
  data: {
    taskId: '',
    chatTime: '',
    theme: 'light',         // 默认亮色（#EDEDED 底）；暗色仅作为可切换选项保留
    ratioClass: 'ar11',
    groupList: [],
    totalCount: 0,
    isEmpty: false,
    scrollLock: false,      // 判定为横向滑动后锁定聊天纵向滚动
    viewer: { show: false, url: '' }
  },

  _cardW: 200,              // 卡宽 px（屏宽 58%，onLoad 标定）
  _gesture: null,           // 当前手势（单指单手势）
  _animating: {},           // gi -> 飞出/补位动画进行中
  _collapseTimers: {},
  _suppressGesture: false,  // 长按已触发，吞掉本次手势
  _lastCardLongPressAt: 0,  // 展开态卡片长按时间戳：微信长按松手会补发一次 tap，用来吞掉它

  onLoad: function (options) {
    var that = this;
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
    }
    this.setData({ chatTime: this._formatTime(new Date()) });

    // 卡宽 = 屏宽 58%（与 WXSS 的 58vw 一致）
    var info = null;
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (err) {
      info = null;
    }
    if (info && info.windowWidth) {
      this._cardW = info.windowWidth * 0.58;
    }

    var eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        that._acceptInput(data);
      });
    }
  },

  onUnload: function () {
    var timers = this._collapseTimers || {};
    Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
  },

  // 输入兼容两种形态：
  // 1) 现有调用方 result.js：{ task: { taskId, groups: { tops: [...] }, ratio } }
  // 2) 契约 §12.6 直连形态：{ groups: [{ name, cards: [{ url, num }] }], theme, ratio }
  _acceptInput: function (data) {
    if (!data) return;
    if (Object.prototype.toString.call(data.groups) === '[object Array]') {
      if (data.theme === 'light' || data.theme === 'dark') this.setData({ theme: data.theme });
      if (data.ratio && RATIO_CLASS[data.ratio]) this.setData({ ratioClass: RATIO_CLASS[data.ratio] });
      this._renderGroups(this._normalizeContractGroups(data.groups));
      return;
    }
    if (data.task) {
      var task = data.task;
      if (task.ratio && RATIO_CLASS[task.ratio]) this.setData({ ratioClass: RATIO_CLASS[task.ratio] });
      if (task.theme === 'light' || task.theme === 'dark') this.setData({ theme: task.theme });
      var groups = normalizeTaskGroups(task.groups || {});
      var named = [];
      for (var i = 0; i < GROUP_ORDER.length; i++) {
        var key = GROUP_ORDER[i];
        var items = groups[key] || [];
        var cards = [];
        for (var j = 0; j < items.length; j++) {
          var url = this._getUrl(items[j]);
          if (url) cards.push({ url: url });
        }
        if (cards.length > 0) {
          named.push({ name: (GROUP_META[key] || {}).title || key, cards: cards });
        }
      }
      this._renderGroups(named);
    }
  },

  _normalizeContractGroups: function (arr) {
    var named = [];
    for (var i = 0; i < arr.length; i++) {
      var g = arr[i] || {};
      var rawCards = Array.isArray(g.cards) ? g.cards : [];
      var cards = [];
      for (var j = 0; j < rawCards.length; j++) {
        var url = rawCards[j] && rawCards[j].url;
        if (url) cards.push({ url: url });
      }
      if (cards.length > 0) named.push({ name: g.name || '', cards: cards });
    }
    return named;
  },

  // 每组一份独立状态：固定节点 + 位置轮转 + 手势/展开/收起标记
  _renderGroups: function (namedGroups) {
    var list = [];
    var total = 0;
    for (var i = 0; i < namedGroups.length; i++) {
      var g = namedGroups[i];
      var cards = [];
      for (var j = 0; j < g.cards.length; j++) {
        if (!g.cards[j].url) continue;
        cards.push({
          url: g.cards[j].url,
          num: ('0' + (cards.length + 1)).slice(-2),
          err: false
        });
      }
      if (cards.length === 0) continue;
      total += cards.length;

      // 三张牌堆卡为固定节点（少于 3 张按实际数量），只轮转位置 class
      var nodeCount = Math.min(3, cards.length);
      var nodes = [];
      for (var k = 0; k < nodeCount; k++) {
        nodes.push({ url: cards[k].url, num: cards[k].num, err: false, pos: POS_CLASSES[k] });
      }

      // 展开态第 2~N 张（独立消息行），stagger 延迟预计算（WXML 不能调方法）
      var rest = [];
      for (var r = 1; r < cards.length; r++) {
        rest.push({
          url: cards[r].url,
          num: cards[r].num,
          err: false,
          enterDelay: r * ENTER_STAGGER,
          leaveDelay: (cards.length - 1 - r) * LEAVE_STAGGER
        });
      }

      list.push({
        key: 'group_' + i,
        name: g.name || '',
        n: cards.length,
        cards: cards,
        nodes: nodes,
        frontIdx: 0,
        dragStyle: '',
        dragging: false,
        flying: false,
        noanimIdx: -1,
        expanded: false,
        leaving: false,
        rest: rest
      });
    }
    this._gesture = null;
    this._animating = {};
    this.setData({
      groupList: list,
      totalCount: total,
      isEmpty: total === 0,
      scrollLock: false
    });
  },

  _getUrl: function (item) {
    if (!item) return '';
    if (typeof item === 'string') return item;
    // 优先使用合成后的白底卡片
    if (item.composedUrl) return item.composedUrl;
    return item.url || item.mattedUrl || item.fileId || item.localPath || '';
  },

  _formatTime: function (d) {
    var h = d.getHours();
    var m = d.getMinutes().toString().padStart(2, '0');
    return (h < 12 ? '上午 ' : '下午 ') + h.toString().padStart(2, '0') + ':' + m;
  },

  _gi: function (e) {
    return parseInt(e.currentTarget.dataset.gi, 10);
  },

  _unlockScroll: function () {
    if (this.data.scrollLock) this.setData({ scrollLock: false });
  },

  // ============ 折叠态手势（契约 §12.6 手势参数）============
  onStackTouchStart: function (e) {
    var gi = this._gi(e);
    var g = this.data.groupList[gi];
    if (!g || g.expanded || g.leaving || g.n < 2) return;
    if (this._animating[gi]) return;
    var t = e.touches[0];
    this._gesture = {
      gi: gi,
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      decided: null,   // null -> 'h' | 'v'
      dragging: false,
      samples: [{ x: t.clientX, t: e.timeStamp }]
    };
    this._suppressGesture = false;
  },

  onStackTouchMove: function (e) {
    var gs = this._gesture;
    if (!gs || this._suppressGesture) return;
    if (this._animating[gs.gi]) return;
    var t = e.touches[0];
    var mx = t.clientX - gs.startX;
    var my = t.clientY - gs.startY;

    // 方向锁：首次位移超 8px 判定，仅水平位移 > 垂直才接管
    if (!gs.decided) {
      if (Math.abs(mx) <= DIR_LOCK_PX && Math.abs(my) <= DIR_LOCK_PX) return;
      gs.decided = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      if (gs.decided === 'h') {
        gs.dragging = true;
        var upd = {};
        upd['groupList[' + gs.gi + '].dragging'] = true;
        upd.scrollLock = true; // 判定横向后才禁止聊天纵向滚动（判定前不得锁）
        this.setData(upd);
      } else {
        gs.samples = [];
        return; // 垂直手势：交还聊天滚动
      }
    }
    if (!gs.dragging) return;

    // 跟手 translateX + rotate（±6° 上限），拖动中 .dragging 禁用过渡
    gs.dx = mx;
    var rot = Math.max(-ROTATE_MAX, Math.min(ROTATE_MAX, mx * ROTATE_PER_PX));
    var style = 'transform: translateX(' + mx + 'px) rotate(' + rot + 'deg);';
    if (style !== this.data.groupList[gs.gi].dragStyle) {
      var u = {};
      u['groupList[' + gs.gi + '].dragStyle'] = style;
      this.setData(u);
    }
    gs.samples.push({ x: t.clientX, t: e.timeStamp });
    if (gs.samples.length > 6) gs.samples.shift();
  },

  onStackTouchEnd: function () {
    var gs = this._gesture;
    this._gesture = null;
    this._unlockScroll();
    if (!gs) return;
    if (this._suppressGesture) { this._suppressGesture = false; return; }
    if (!gs.dragging) return;
    this._releaseStack(gs);
  },

  onStackTouchCancel: function () {
    var gs = this._gesture;
    this._gesture = null;
    this._unlockScroll();
    if (!gs || !gs.dragging) { this._suppressGesture = false; return; }
    // 触摸被打断：按未达阈值处理，回弹
    var u = {};
    u['groupList[' + gs.gi + '].dragging'] = false;
    u['groupList[' + gs.gi + '].dragStyle'] = '';
    this.setData(u);
  },

  _releaseStack: function (gs) {
    var gi = gs.gi;
    var W = this._cardW || 200;

    // 速度：取最近 120ms 采样
    var v = 0;
    var samples = gs.samples;
    var last = samples[samples.length - 1];
    if (last) {
      for (var i = samples.length - 1; i >= 0; i--) {
        if (last.t - samples[i].t <= VELOCITY_WINDOW) {
          v = (last.x - samples[i].x) / Math.max(1, last.t - samples[i].t);
        } else {
          break;
        }
      }
    }

    var dir = 0; // -1 左滑，+1 右滑
    if (Math.abs(v) > FLICK_VELOCITY) dir = v < 0 ? -1 : 1;
    else if (Math.abs(gs.dx) > W * DISTANCE_RATIO) dir = gs.dx < 0 ? -1 : 1;

    if (dir !== 0) {
      this._flyOut(gi, dir);
      return;
    }
    // 未达阈值：清除内联样式，交还 CSS 过渡回弹（250ms cubic-bezier(.2,.8,.3,1)）
    var u = {};
    u['groupList[' + gi + '].dragging'] = false;
    u['groupList[' + gi + '].dragStyle'] = '';
    this.setData(u);
  },

  // 飞出 ±1.2×卡宽 + rotate ±6° + 渐隐（220ms ease-in），随后循环入尾
  _flyOut: function (gi, dir) {
    var that = this;
    var g = this.data.groupList[gi];
    if (!g) return;
    this._animating[gi] = true;
    var W = this._cardW || 200;

    var u = {};
    u['groupList[' + gi + '].dragging'] = false;
    u['groupList[' + gi + '].flying'] = true;
    u['groupList[' + gi + '].dragStyle'] =
      'transform: translateX(' + dir * 1.2 * W + 'px) rotate(' + dir * ROTATE_MAX + 'deg); opacity: 0;';
    this.setData(u);

    setTimeout(function () {
      var cur = that.data.groupList[gi];
      if (!cur) { that._animating[gi] = false; return; }
      var map = dir < 0 ? ROTATE_LEFT : ROTATE_RIGHT;
      var two = cur.nodes.length === 2;
      var frontIdx = 0;
      var nodes = cur.nodes.map(function (nd, i) {
        var pos = two
          ? (nd.pos === 'pos-front' ? 'pos-g1' : 'pos-front')
          : (map[nd.pos] || nd.pos);
        if (pos === 'pos-front') frontIdx = i;
        return { url: nd.url, num: nd.num, err: nd.err, pos: pos };
      });

      // 飞出卡瞬移入尾（noanim 关过渡），其余卡由 class 过渡自动补位
      var u2 = {};
      u2['groupList[' + gi + '].nodes'] = nodes;
      u2['groupList[' + gi + '].frontIdx'] = frontIdx;
      u2['groupList[' + gi + '].flying'] = false;
      u2['groupList[' + gi + '].dragStyle'] = '';
      u2['groupList[' + gi + '].noanimIdx'] = cur.frontIdx;
      that.setData(u2, function () {
        setTimeout(function () {
          var u3 = {};
          u3['groupList[' + gi + '].noanimIdx'] = -1;
          that.setData(u3);
          that._animating[gi] = false;
        }, 50);
      });
    }, FLY_DURATION + FLY_BUFFER);
  },

  // ============ 展开 / 收起 ============
  onToggleCapsule: function (e) {
    var gi = this._gi(e);
    var g = this.data.groupList[gi];
    if (!g || g.leaving || this._animating[gi]) return;
    var that = this;

    if (!g.expanded) {
      // 展开：第 1 张留原位，第 2~N 张 wx:if 渲染为独立消息行，stagger 入场
      var u = {};
      u['groupList[' + gi + '].expanded'] = true;
      this.setData(u);
      return;
    }

    // 收起：反向 180ms ease-in，stagger 30ms 逆序，结束后渲染回折叠态
    var u2 = {};
    u2['groupList[' + gi + '].leaving'] = true;
    this.setData(u2);
    var wait = (g.rest.length > 0 ? (g.rest.length - 1) * LEAVE_STAGGER : 0) + LEAVE_DURATION + 30;
    this._collapseTimers[gi] = setTimeout(function () {
      var u3 = {};
      u3['groupList[' + gi + '].expanded'] = false;
      u3['groupList[' + gi + '].leaving'] = false;
      that.setData(u3);
    }, wait);
  },

  // ============ 大图查看（展开态点单张，黑底全屏，点任意处关闭）============
  onOpenViewer: function (e) {
    // 微信长按后松手会补发一次 tap：长按刚触发过时吞掉本次 tap，避免 ActionSheet 之上又弹大图
    if (this._lastCardLongPressAt && Date.now() - this._lastCardLongPressAt < 500) {
      this._lastCardLongPressAt = 0;
      return;
    }
    this._lastCardLongPressAt = 0;
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    this.setData({ viewer: { show: true, url: url } });
  },

  onCloseViewer: function () {
    this.setData({ viewer: { show: false, url: '' } });
  },

  // ============ 长按动作面板（两态：保存全部 / 转发）============
  onStackLongPress: function (e) {
    this._suppressGesture = true;
    var gi = this._gi(e);
    var g = this.data.groupList[gi];
    var frontUrl = '';
    if (g) {
      var fi = g.frontIdx;
      if (g.nodes[fi] && g.nodes[fi].url) frontUrl = g.nodes[fi].url;
    }
    this._openActions(gi, frontUrl);
  },

  onCardLongPress: function (e) {
    this._lastCardLongPressAt = Date.now();
    var singleUrl = e.currentTarget.dataset.url || '';
    this._openActions(this._gi(e), singleUrl);
  },

  _openActions: function (gi, singleUrl) {
    var that = this;
    var g = this.data.groupList[gi];
    if (!g) return;
    var items = singleUrl ? ['保存单张', '保存全部', '转发'] : ['保存全部', '转发'];
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        if (singleUrl && res.tapIndex === 0) {
          that._saveImagesSequentially([singleUrl], '已保存 1 张');
        } else if (singleUrl && res.tapIndex === 1) {
          that._saveGroup(gi);
        } else if (singleUrl && res.tapIndex === 2) {
          that._forwardGroup();
        } else if (!singleUrl && res.tapIndex === 0) {
          that._saveGroup(gi);
        } else if (!singleUrl && res.tapIndex === 1) {
          that._forwardGroup();
        }
      }
    });
  },

  _saveGroup: function (gi) {
    var g = this.data.groupList[gi];
    if (!g) return;
    var urls = [];
    for (var i = 0; i < g.cards.length; i++) {
      if (g.cards[i].url) urls.push(g.cards[i].url);
    }
    if (urls.length === 0) return;
    this._saveImagesSequentially(urls, '已保存全部 ' + urls.length + ' 张');
  },

  _forwardGroup: function () {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    wx.showToast({ title: '点右上角「···」发送给朋友', icon: 'none', duration: 2200 });
  },

  // ============ 保存到相册（与 result.js 同一实现口径）============
  _saveImagesSequentially: function (urls, successTitle) {
    var that = this;
    if (!urls || urls.length === 0) return;
    wx.showLoading({ title: '正在保存 1/' + urls.length + ' 张...', mask: true });
    var saveNext = function (index) {
      if (index >= urls.length) {
        wx.hideLoading();
        wx.showToast({ title: successTitle || '保存完成', icon: 'success', duration: 2000 });
        return;
      }
      wx.showLoading({ title: '正在保存 ' + (index + 1) + '/' + urls.length + ' 张...', mask: true });
      that._downloadAndSaveToAlbum(urls[index])
        .then(function () { saveNext(index + 1); })
        .catch(function (err) { wx.hideLoading(); that._handleSaveError(err, urls.slice(index)); });
    };
    saveNext(0);
  },

  _downloadAndSaveToAlbum: function (url) {
    var that = this;
    return this._resolveImageFilePath(url).then(function (filePath) {
      return new Promise(function (resolve, reject) {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: function () { resolve(); },
          fail: function (err) { reject({ type: 'save_fail', error: err, filePath: filePath }); }
        });
      });
    });
  },

  _resolveImageFilePath: function (url) {
    return new Promise(function (resolve, reject) {
      if (!url || typeof url !== 'string') {
        reject({ type: 'invalid_url', error: new Error('图片地址无效') });
        return;
      }
      if (url.indexOf('cloud://') === 0) {
        if (!wx.cloud) {
          reject({ type: 'download_fail', error: new Error('当前环境不支持云文件下载') });
          return;
        }
        wx.cloud.downloadFile({
          fileID: url,
          success: function (res) { resolve(res.tempFilePath); },
          fail: function (err) { reject({ type: 'download_fail', error: err }); }
        });
        return;
      }
      if (/^https?:\/\//.test(url)) {
        wx.downloadFile({
          url: url,
          success: function (res) {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              reject({ type: 'download_fail', error: new Error('HTTP ' + res.statusCode) });
              return;
            }
            resolve(res.tempFilePath);
          },
          fail: function (err) { reject({ type: 'download_fail', error: err }); }
        });
        return;
      }
      resolve(url);
    });
  },

  _handleSaveError: function (errInfo, urlsToRetry) {
    var that = this;
    var errMsg = errInfo && errInfo.error ? errInfo.error.errMsg : '';
    if (errMsg && (errMsg.indexOf('auth deny') !== -1 || errMsg.indexOf('authorize:fail') !== -1)) {
      wx.showModal({
        title: '需要相册授权',
        content: '保存卡片需要将图片写入您的相册。请点击下方"前往设置"，开启"保存到相册"权限后重试。',
        confirmText: '前往设置',
        cancelText: '取消',
        success: function (res) {
          if (res.confirm) {
            wx.openSetting({
              success: function (settingRes) {
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
        success: function (res) {
          if (res.confirm && urlsToRetry) {
            that._saveImagesSequentially(urlsToRetry, '保存完成');
          }
        }
      });
    }
  },

  // ============ 图片加载失败占位兜底 ============
  onImgError: function (e) {
    var d = e.currentTarget.dataset;
    var gi = parseInt(d.gi, 10);
    if (isNaN(gi)) return;
    var u = {};
    if (d.kind === 'node') u['groupList[' + gi + '].nodes[' + parseInt(d.ni, 10) + '].err'] = true;
    else if (d.kind === 'rest') u['groupList[' + gi + '].rest[' + parseInt(d.ci, 10) + '].err'] = true;
    else if (d.kind === 'card') u['groupList[' + gi + '].cards[' + parseInt(d.ci, 10) + '].err'] = true;
    else return;
    this.setData(u);
  },

  // ============ 亮 / 暗切换 ============
  onToggleTheme: function () {
    this.setData({ theme: this.data.theme === 'dark' ? 'light' : 'dark' });
  },

  onBack: function () {
    var pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    // 极端兜底：页面栈只有当前页时回到首页，保证返回永远可用
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onShareAppMessage: function () {
    return {
      title: '我刚用滑一叠做了一叠穿搭卡片，快来滑着帮我挑！',
      path: '/pages/index/index'
    };
  }
});
