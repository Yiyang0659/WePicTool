// pages/preview/preview.js
// 微信折叠卡片 1:1 预览（技术契约 docs/product/TECHNICAL_SPEC.md §12.6）
// 参考实现：ui-reference/wx-stack-prototype.html（已验收 H5 高保真原型）
var taskUtils = require('../../utils/task');
var normalizeTaskGroups = taskUtils.normalizeTaskGroups;
var GROUP_META = taskUtils.GROUP_META;
var previewLayout = require('../../utils/previewLayout');
var buildPreviewStage = previewLayout.buildPreviewStage;
var orderCardsFromFront = previewLayout.orderCardsFromFront;
var resolveGestureAxis = previewLayout.resolveGestureAxis;
var resolveSwipeDecision = previewLayout.resolveSwipeDecision;
var buildStackPositionStyle = previewLayout.buildStackPositionStyle;
var buildStackMotionStyles = previewLayout.buildStackMotionStyles;
var stackExportManifest = require('../../utils/stackExportManifest');
var funModel = require('../../utils/funTextProject');
var rendererClient = require('../../utils/funCardRendererClient');
var badgeComposer = require('../../utils/sequenceBadgeComposer');
var imageExporter = require('../../utils/imageExporter');

var GROUP_ORDER = ['tops', 'bottoms', 'shoes', 'others'];
var RATIO_CLASS = { '1:1': 'ar11', '4:5': 'ar45', '3:4': 'ar34' };
var POS_CLASSES = ['pos-front', 'pos-g1', 'pos-g2'];
var THEME_STORAGE_KEY = 'wepic_preview_theme';
var GUIDE_STORAGE_KEY = 'wepic_preview_gesture_seen';
// 三个显示节点复用位置，并按完整卡片列表更新图片。
// 左滑：front→g2、g1→front、g2→g1；右滑反向取回
var ROTATE_LEFT = { 'pos-front': 'pos-g2', 'pos-g1': 'pos-front', 'pos-g2': 'pos-g1' };
var ROTATE_RIGHT = { 'pos-front': 'pos-g1', 'pos-g1': 'pos-g2', 'pos-g2': 'pos-front' };

// ---- 手势参数（契约 §12.6）----
var DIR_LOCK_PX = 8;          // 超过 8px 后还需满足横纵意图差，避免斜滑误判
var VELOCITY_WINDOW = 120;    // 速度采样窗口 ms
var SETTLE_DURATION = 190;    // 微信式前卡离场 + 后卡同步补位
var SETTLE_BUFFER = 20;
var TAIL_FADE_DURATION = 140; // 离场卡回到底层后只淡入露边，避免闪现
var ENTER_STAGGER = 45;     // 展开 stagger 45ms
var LEAVE_STAGGER = 30;     // 收起 stagger 30ms 逆序
var LEAVE_DURATION = 180;   // 收起单行动画 180ms ease-in

Page({
  data: {
    taskId: '',
    chatTime: '',
    ratio: '4:5',
    groupList: [],
    totalCount: 0,
    isEmpty: false,
    inputMode: '',
    inputError: '',
    manifestFingerprint: '',
    scrollLock: false,      // 判定为横向滑动后锁定聊天纵向滚动
    viewportStyle: '',
    navStyle: '',
    navRowStyle: '',
    themeToggleStyle: '',
    themeMode: 'light',
    themeClass: 'theme-light',
    themeName: '普通模式',
    themeToggleLabel: '切换到深色模式',
    guideVisible: false,
    viewer: { show: false, url: '' }
    ,canSaveCurrent: false, saveStatus: '', saveBusy: false, saveDone: false, selectedPreviewNum:''
  },

  _cardW: 143,              // 375px 标定约占屏宽 38%；每组仍以自身舞台宽度为手势阈值
  _windowWidth: 375,
  _gesture: null,           // 当前手势（单指单手势）
  _animating: {},           // gi -> 飞出/补位动画进行中
  _collapseTimers: {},
  _guideTimer: null,
  _suppressGesture: false,  // 长按已触发，吞掉本次手势
  _lastCardLongPressAt: 0,  // 展开态卡片长按时间戳：微信长按松手会补发一次 tap，用来吞掉它
  _lastStackMoveAt: 0,

  onLoad: function (options) {
    var that = this;
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
    }
    this.setData({ chatTime: this._formatTime(new Date()) });

    // 使用真实窗口与小程序胶囊位置标定固定视口、自定义导航和图片消息通道。
    var info = null;
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (err) {
      info = null;
    }
    if (info && info.windowWidth) {
      this._windowWidth = info.windowWidth;
      this._cardW = buildPreviewStage({ composedRatio: '1:1' }, '1:1', info.windowWidth).stageWidth;
    }
    this._applyViewportMetrics(info || {});
    this._loadTheme(info && info.theme);

    var eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        that._previewOnly = !!(data && data.previewOnly);
        that._acceptInput(data);
      });
    }
  },

  onUnload: function () {
    this._saveUnloaded = true;
    var timers = this._collapseTimers || {};
    Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); });
    if (this._guideTimer) clearTimeout(this._guideTimer);
  },

  _applyViewportMetrics: function (info) {
    var width = Number(info.windowWidth) > 0 ? Number(info.windowWidth) : this._windowWidth;
    var statusBarHeight = Number(info.statusBarHeight) >= 0
      ? Number(info.statusBarHeight)
      : (info.safeArea && Number(info.safeArea.top)) || 20;
    var menu = null;
    try {
      menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    } catch (err) {
      menu = null;
    }

    var validMenu = menu && Number(menu.top) >= statusBarHeight && Number(menu.height) > 0 && Number(menu.left) > 0;
    var menuTop = validMenu ? Number(menu.top) : statusBarHeight + 6;
    var menuHeight = validMenu ? Number(menu.height) : 32;
    var navRowHeight = validMenu
      ? Math.max(44, (menuTop - statusBarHeight) * 2 + menuHeight)
      : 44;
    var navHeight = statusBarHeight + navRowHeight;
    var toggleHeight = Math.min(32, menuHeight);
    var toggleTop = menuTop + Math.max(0, (menuHeight - toggleHeight) / 2);

    this.setData({
      // fixed + inset:0 直接取渲染视口，避免开发者工具 windowHeight 与模拟器画布不一致。
      viewportStyle: 'height: 100%;',
      navStyle: 'height: ' + navHeight + 'px; padding-top: ' + statusBarHeight + 'px;',
      navRowStyle: 'height: ' + navRowHeight + 'px;',
      themeToggleStyle: 'left: 52px; top: ' + toggleTop + 'px; height: ' + toggleHeight + 'px;'
    });
  },

  _loadTheme: function (systemTheme) {
    var stored = '';
    try {
      stored = wx.getStorageSync ? wx.getStorageSync(THEME_STORAGE_KEY) : '';
    } catch (err) {
      stored = '';
    }
    var mode = stored === 'dark' || stored === 'light'
      ? stored
      : (systemTheme === 'dark' ? 'dark' : 'light');
    this._applyTheme(mode, false);
  },

  _applyTheme: function (mode, persist) {
    var next = mode === 'dark' ? 'dark' : 'light';
    var dark = next === 'dark';
    this.setData({
      themeMode: next,
      themeClass: dark ? 'theme-dark' : 'theme-light',
      themeName: dark ? '深色模式' : '普通模式',
      themeToggleLabel: dark ? '切换到普通模式' : '切换到深色模式'
    });
    if (persist) {
      try {
        if (wx.setStorageSync) wx.setStorageSync(THEME_STORAGE_KEY, next);
      } catch (err) {
        // 本地存储失败不阻断预览。
      }
    }
    try {
      if (wx.setNavigationBarColor) {
        wx.setNavigationBarColor({
          frontColor: dark ? '#ffffff' : '#000000',
          backgroundColor: dark ? '#1e1e1e' : '#f7f7f7',
          animation: { duration: 180, timingFunc: 'easeIn' }
        });
      }
      if (wx.setBackgroundColor) {
        wx.setBackgroundColor({
          backgroundColor: dark ? '#111111' : '#ededed',
          backgroundColorTop: dark ? '#1e1e1e' : '#f7f7f7',
          backgroundColorBottom: dark ? '#1e1e1e' : '#f7f7f7'
        });
      }
    } catch (err) {
      // 系统栏颜色设置失败时页面主题仍可正常切换。
    }
  },

  onToggleTheme: function () {
    this._applyTheme(this.data.themeMode === 'dark' ? 'light' : 'dark', true);
  },

  // 新调用方只传 materialized manifest；task/groups 保留一个兼容周期。
  _acceptInput: function (data) {
    if (!data) return;
    this._funProject = data.funProject ? JSON.parse(JSON.stringify(data.funProject)) : null;
    this._saveManifest = null;
    this._sourceManifest = data.manifest;
    this._selectedPreviewUrl = '';
    this.setData({canSaveCurrent: !!this._funProject});
    if (data.manifest) {
      this._acceptManifest(data.manifest, data.selectedStackIds, data.ratio);
      return;
    }
    if (Object.prototype.toString.call(data.groups) === '[object Array]') {
      if (data.ratio && RATIO_CLASS[data.ratio]) this.setData({ ratio: data.ratio });
      this._renderGroups(this._normalizeContractGroups(data.groups), data.ratio || this.data.ratio, 'legacy');
      return;
    }
    if (data.task) {
      var task = data.task;
      if (task.ratio && RATIO_CLASS[task.ratio]) this.setData({ ratio: task.ratio });
      var groups = normalizeTaskGroups(task.groups || {});
      var named = [];
      for (var i = 0; i < GROUP_ORDER.length; i++) {
        var key = GROUP_ORDER[i];
        var items = groups[key] || [];
        var cards = [];
        for (var j = 0; j < items.length; j++) {
          var url = this._getUrl(items[j]);
          if (url) cards.push(Object.assign({}, items[j], { url: url }));
        }
        if (cards.length > 0) {
          named.push({ name: (GROUP_META[key] || {}).title || key, cards: cards });
        }
      }
      this._renderGroups(named, task.ratio || this.data.ratio, 'legacy');
    }
  },

  _acceptManifest: function (manifest, selectedStackIds, ratio) {
    try {
      stackExportManifest.validateManifest(manifest);
      var selected = null;
      if (Array.isArray(selectedStackIds) && selectedStackIds.length > 0) {
        selected = {};
        selectedStackIds.forEach(function (stackId) { selected[stackId] = true; });
      }
      var named = [];
      for (var stackIndex = 0; stackIndex < manifest.stacks.length; stackIndex++) {
        var stack = manifest.stacks[stackIndex];
        if (selected && !selected[stack.stackId]) continue;
        if (!stack.cards.length) continue;
        var cards = [];
        for (var cardIndex = 0; cardIndex < stack.cards.length; cardIndex++) {
          var card = stack.cards[cardIndex];
          if (!card.exportUrl) throw new Error('编号图尚未准备好：' + stack.title + ' ' + card.sequenceLabel);
          cards.push({
            url: card.exportUrl,
            num: card.sequenceLabel,
            sequenceLabel: card.sequenceLabel,
            isCover: card.isCover,
            ratio: card.ratio || manifest.ratio,
            width: card.width,
            height: card.height
          });
        }
        named.push({ key: stack.stackId, stackId: stack.stackId, name: stack.title, cards: cards });
      }
      if (ratio && RATIO_CLASS[ratio]) this.setData({ ratio: ratio });
      this.setData({ manifestFingerprint: manifest.fingerprint || '', inputError: '' });
      this._renderGroups(named, ratio || manifest.ratio || this.data.ratio, 'manifest');
    } catch (error) {
      var message = (error && error.message) || '编号图预览数据无效';
      this._gesture = null;
      this._animating = {};
      this.setData({
        groupList: [],
        totalCount: 0,
        isEmpty: true,
        inputMode: 'manifest',
        inputError: message,
        manifestFingerprint: '',
        scrollLock: false
      });
      wx.showToast({ title: message, icon: 'none', duration: 2200 });
    }
  },

  _normalizeContractGroups: function (arr) {
    var named = [];
    for (var i = 0; i < arr.length; i++) {
      var g = arr[i] || {};
      var rawCards = Array.isArray(g.cards) ? g.cards : [];
      var cards = [];
      for (var j = 0; j < rawCards.length; j++) {
        var source = rawCards[j] || {};
        var url = source.url;
        if (url) cards.push(Object.assign({}, source, { url: url }));
      }
      if (cards.length > 0) named.push({ name: g.name || '', cards: cards });
    }
    return named;
  },

  // 每组一份独立状态：固定节点 + 位置轮转 + 手势/展开/收起标记
  _renderGroups: function (namedGroups, fallbackRatio, inputMode) {
    var list = [];
    var total = 0;
    for (var i = 0; i < namedGroups.length; i++) {
      var g = namedGroups[i];
      var cards = [];
      for (var j = 0; j < g.cards.length; j++) {
        if (!g.cards[j].url) continue;
        var stage = buildPreviewStage(g.cards[j], fallbackRatio || this.data.ratio || '4:5', this._windowWidth);
        cards.push({
          url: g.cards[j].url,
          num: g.cards[j].num || g.cards[j].sequenceLabel || ('0' + (cards.length + 1)).slice(-2),
          isCover: g.cards[j].isCover === true,
          err: false,
          ratio: stage.ratio,
          cardWidth: stage.cardWidth,
          cardHeight: stage.cardHeight,
          cardStyle: stage.cardStyle,
          stageStyle: 'width: ' + stage.stageWidth + 'px; height: ' + stage.stageHeight + 'px;'
        });
      }
      if (cards.length === 0) continue;
      total += cards.length;

      // 三张牌堆卡为固定节点（少于 3 张按实际数量），只轮转位置 class
      var nodeCount = Math.min(3, cards.length);
      var nodes = [];
      for (var k = 0; k < nodeCount; k++) {
        var card = cards[cards.length > 3 && k === 2 ? cards.length - 1 : k];
        nodes.push({
          url: card.url,
          num: card.num,
          err: false,
          cardStyle: card.cardStyle,
          pos: POS_CLASSES[k],
          motionStyle: '',
          incoming: false
        });
      }

      // 展开态第 2~N 张（独立消息行），stagger 延迟预计算（WXML 不能调方法）
      var rest = this._buildRest(cards);

      list.push({
        key: g.key || 'group_' + i,
        stackId: g.stackId || '',
        name: g.name || '',
        n: cards.length,
        cards: cards,
        nodes: nodes,
        frontIdx: 0,
        cardIndex: 0,
        dragging: false,
        settling: false,
        noanimIdx: -1,
        expanded: false,
        leaving: false,
        rest: rest,
        stageWidth: cards[0].cardWidth || this._cardW,
        stageStyle: cards[0].stageStyle
      });
    }
    this._gesture = null;
    this._animating = {};
    this.setData({
      groupList: list,
      totalCount: total,
      isEmpty: total === 0,
      inputMode: inputMode || 'legacy',
      inputError: '',
      scrollLock: false
    });
    if (total > 0) this._maybeShowGuide();
  },

  _getUrl: function (item) {
    if (!item) return '';
    if (typeof item === 'string') return item;
    // 优先使用合成后的白底卡片
    if (item.composedUrl) return item.composedUrl;
    return item.url || item.mattedUrl || item.fileId || item.localPath || '';
  },

  _buildRest: function (cards) {
    var rest = [];
    for (var i = 1; i < cards.length; i++) {
      rest.push({
        url: cards[i].url,
        num: cards[i].num,
        err: cards[i].err,
        cardStyle: cards[i].cardStyle,
        enterDelay: i * ENTER_STAGGER,
        leaveDelay: (cards.length - 1 - i) * LEAVE_STAGGER
      });
    }
    return rest;
  },

  _formatTime: function () {
    return '刚刚';
  },

  _maybeShowGuide: function () {
    var seen = false;
    try {
      seen = Boolean(wx.getStorageSync && wx.getStorageSync(GUIDE_STORAGE_KEY));
    } catch (err) {
      seen = false;
    }
    if (seen || this.data.guideVisible) return;
    this.setData({ guideVisible: true });
    var that = this;
    if (this._guideTimer) clearTimeout(this._guideTimer);
    this._guideTimer = setTimeout(function () { that._hideGuide(); }, 2200);
  },

  _hideGuide: function () {
    if (!this._guideTimer && !this.data.guideVisible) return;
    if (this._guideTimer) {
      clearTimeout(this._guideTimer);
      this._guideTimer = null;
    }
    if (this.data.guideVisible) this.setData({ guideVisible: false });
    try {
      if (wx.setStorageSync) wx.setStorageSync(GUIDE_STORAGE_KEY, true);
    } catch (err) {
      // 手势提示状态不是主流程数据，写入失败可忽略。
    }
  },

  onChatScroll: function () {
    this._hideGuide();
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

    // 方向锁：超过 8px 后仍需拉开横纵意图差；斜向未明确时继续观察，不抢滚动。
    if (!gs.decided) {
      gs.decided = resolveGestureAxis(mx, my, DIR_LOCK_PX);
      if (!gs.decided) return;
      if (gs.decided === 'h') {
        gs.dragging = true;
        this._lastStackMoveAt = Date.now();
        this._hideGuide();
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

    // 微信式牌堆：顶卡严格跟手，后两卡按进度同步向前补位；消息行与头像完全不动。
    gs.dx = mx;
    var group = this.data.groupList[gs.gi];
    var styles = buildStackMotionStyles(group.nodes, group.frontIdx, mx, group.stageWidth || this._cardW, false);
    this._setStackMotionStyles(gs.gi, styles);
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
    this._resetStackMotion(gs.gi);
  },

  _releaseStack: function (gs) {
    var gi = gs.gi;
    var group = this.data.groupList[gi];
    var W = (group && group.stageWidth) || this._cardW || 200;

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

    var dir = resolveSwipeDecision(gs.dx, v, W); // -1 左滑，+1 右滑

    if (dir !== 0) {
      this._settleStack(gi, dir);
      return;
    }
    // 未达阈值：所有节点回到各自固定槽位；顶卡回弹，后卡退回露边位置。
    this._resetStackMotion(gi);
  },

  _setStackMotionStyles: function (gi, styles, extra) {
    var u = extra || {};
    for (var i = 0; i < styles.length; i++) {
      u['groupList[' + gi + '].nodes[' + i + '].motionStyle'] = styles[i] || '';
    }
    this.setData(u);
  },

  _resetStackMotion: function (gi) {
    var g = this.data.groupList[gi];
    if (!g) return;
    var u = {};
    u['groupList[' + gi + '].dragging'] = false;
    u['groupList[' + gi + '].settling'] = false;
    for (var i = 0; i < g.nodes.length; i++) {
      u['groupList[' + gi + '].nodes[' + i + '].motionStyle'] = '';
      u['groupList[' + gi + '].nodes[' + i + '].incoming'] = false;
    }
    this.setData(u);
  },

  // 松手后前卡只离开约一张卡宽，后卡同时补位；旧前卡从另一侧回到底层形成循环。
  _settleStack: function (gi, dir) {
    var that = this;
    var g = this.data.groupList[gi];
    if (!g) return;
    this._animating[gi] = true;
    var W = g.stageWidth || this._cardW || 200;
    var settleStyles = buildStackMotionStyles(g.nodes, g.frontIdx, dir, W, true);
    var settleUpdate = {};
    settleUpdate['groupList[' + gi + '].dragging'] = false;
    settleUpdate['groupList[' + gi + '].settling'] = true;
    for (var i = 0; i < g.nodes.length; i++) {
      var node = g.nodes[i];
      settleUpdate['groupList[' + gi + '].nodes[' + i + '].incoming'] = i !== g.frontIdx && (
        g.nodes.length === 2 ||
        (dir < 0 && node.pos === 'pos-g1') ||
        (dir > 0 && node.pos === 'pos-g2')
      );
    }
    this._setStackMotionStyles(gi, settleStyles, settleUpdate);

    setTimeout(function () {
      var cur = that.data.groupList[gi];
      if (!cur) { that._animating[gi] = false; return; }
      var map = dir < 0 ? ROTATE_LEFT : ROTATE_RIGHT;
      var two = cur.nodes.length === 2;
      var frontIdx = 0;
      var cardIndex = ((cur.cardIndex || 0) + (dir < 0 ? 1 : -1) + cur.cards.length) % cur.cards.length;
      var nodes = cur.nodes.map(function (nd, i) {
        var pos = two
          ? (nd.pos === 'pos-front' ? 'pos-g1' : 'pos-front')
          : (map[nd.pos] || nd.pos);
        if (pos === 'pos-front') frontIdx = i;
        var offset = pos === 'pos-front' ? 0 : (pos === 'pos-g1' ? 1 : -1);
        var card = cur.cards[(cardIndex + offset + cur.cards.length) % cur.cards.length];
        return {
          url: card.url,
          num: card.num,
          err: card.err,
          cardStyle: card.cardStyle,
          pos: pos,
          motionStyle: i === cur.frontIdx ? buildStackPositionStyle(pos, 0) : '',
          incoming: false
        };
      });

      // 补位完成后只重标固定槽位。旧前卡在目标尾槽以 opacity 0 复位，再淡入露边。
      var u2 = {};
      u2['groupList[' + gi + '].nodes'] = nodes;
      u2['groupList[' + gi + '].frontIdx'] = frontIdx;
      u2['groupList[' + gi + '].cardIndex'] = cardIndex;
      u2['groupList[' + gi + '].settling'] = false;
      u2['groupList[' + gi + '].noanimIdx'] = cur.frontIdx;
      that.setData(u2, function () {
        setTimeout(function () {
          var u3 = {};
          u3['groupList[' + gi + '].noanimIdx'] = -1;
          u3['groupList[' + gi + '].nodes[' + cur.frontIdx + '].motionStyle'] = '';
          that.setData(u3);
          setTimeout(function () { that._animating[gi] = false; }, TAIL_FADE_DURATION);
        }, 16);
      });
    }, SETTLE_DURATION + SETTLE_BUFFER);
  },

  // ============ 展开 / 收起 ============
  onToggleCapsule: function (e) {
    this._hideGuide();
    var gi = this._gi(e);
    var g = this.data.groupList[gi];
    if (!g || g.leaving || this._animating[gi]) return;
    var that = this;

    if (!g.expanded) {
      // 展开必须从当前顶层开始，避免用户翻页后视觉跳回最初的第 1 张。
      var orderedCards = orderCardsFromFront(g.cards, g.nodes, g.frontIdx);
      var u = {};
      u['groupList[' + gi + '].cards'] = orderedCards;
      u['groupList[' + gi + '].cardIndex'] = 0;
      u['groupList[' + gi + '].rest'] = this._buildRest(orderedCards);
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
    this._openViewer(this._gi(e), url);
  },

  onStackTap: function (e) {
    if (this._suppressGesture) return;
    if (this._lastStackMoveAt && Date.now() - this._lastStackMoveAt < 350) return;
    var gi = this._gi(e);
    var g = this.data.groupList[gi];
    if (!g) return;
    var node = g.nodes[g.frontIdx];
    if (!node || !node.url) return;
    this._openViewer(gi, node.url);
  },

  _openViewer: function (gi, url) {
    this._selectedPreviewUrl = url;
    var g = this.data.groupList[gi];
    var selected=g && g.cards.find(function(c){return c.url===url;});
    this.setData({selectedPreviewNum:selected ? selected.num : ''});
    var urls = g && g.cards ? g.cards.map(function (card) { return card.url; }).filter(Boolean) : [url];
    if (wx.previewImage && !this._previewOnly) {
      wx.previewImage({ current: url, urls: urls });
      return;
    }
    this.setData({ viewer: { show: true, url: url } });
  },

  onSaveCurrentPreview: async function () {
    if(this.data.saveBusy || !this._funProject)return;
    var project=this._funProject, payload=funModel.buildRenderPayload(project);
    var key=JSON.stringify(payload), that=this;
    var current=function(){return !that._saveUnloaded && that._funProject===project;};
    this.setData({saveBusy:true,saveDone:false,saveStatus:'正在审核图片'});
    try {
      var manifest=this._saveKey===key && this._saveManifest;
      if(!manifest){
        var result=await rendererClient.requestRenderStack(wx,payload);
        if(!current())return;
        this.setData({saveStatus:'审核通过，正在准备图片'});
        var canvas=await new Promise(function(resolve,reject){wx.createSelectorQuery().select('#previewExportCanvas').fields({node:true,size:true}).exec(function(r){r&&r[0]&&r[0].node?resolve(r[0].node):reject(Error('画布未就绪，请重试'));});});
        manifest=await badgeComposer.materializeManifest(wx,canvas,stackExportManifest.buildFunTextManifest(project,result.cards),{isCurrent:current});
        if(!current())return;
        this._saveKey=key;this._saveManifest=manifest;
      }
      var cards=manifest.stacks[0].cards;
      if(!cards.length)throw Error('没有可保存的图片');
      if(!current())return;
      var startIndex=this._saveCursorKey===key ? this._saveCursor||0 : 0;
      this._saveCursorKey=key;
      try {
        await imageExporter.saveImagesSequentially(wx,cards.map(function(c){return c.exportUrl;}),{
          startIndex:startIndex,
          onProgress:function(n,total){if(current())that.setData({saveStatus:'正在保存第 '+n+' / '+total+' 张图片'});},
          onSaved:function(n,total){if(current())that.setData({saveStatus:'已保存 '+n+' / '+total+' 张图片'});},
          resolvePath:async function(api,path){var local=await imageExporter.resolveImagePath(api,path);if(!current())throw Error('保存已取消');return local;}
        });
        this._saveCursor=0;
      }catch(saveError){this._saveCursor=saveError.nextIndex||0;throw saveError;}
      if(current())this.setData({saveDone:true,saveStatus:'已保存全部 '+cards.length+' 张图片到相册'});
    }catch(error){
      if(current())this.setData({saveDone:false,saveStatus:error.code==='AUTH_DENIED'?'需要相册权限，请在小程序设置中允许后重试':(error.message||'保存失败，请重试')});
    }finally{if(current())this.setData({saveBusy:false});}
  },
  onDismissSave: function(){if(!this.data.saveBusy)this.setData({saveStatus:''});},
  onGoWechat: function(){if(this.data.saveDone && !this.data.saveBusy)require('../../utils/wechatSendGuide').goToWechat(wx);},
  onSaveMaskTouch:function(){},

  onCloseViewer: function () {
    this.setData({ viewer: { show: false, url: '' } });
  },

  // ============ 长按动作面板（只提供能够兑现的相册保存）============
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
    if(this._previewOnly){wx.showToast({title:'请返回编辑或结果页，审核后保存',icon:'none'});return;}
    var that = this;
    var g = this.data.groupList[gi];
    if (!g) return;
    var items = singleUrl ? ['保存这张', '保存这一组'] : ['保存这一组'];
    wx.showActionSheet({
      alertText: (g.name || '当前图片组') + ' · ' + g.n + ' 张',
      itemList: items,
      success: function (res) {
        if (singleUrl && res.tapIndex === 0) {
          that._saveImagesSequentially([singleUrl], '已保存 1 张');
        } else if (singleUrl && res.tapIndex === 1) {
          that._saveGroup(gi);
        } else if (!singleUrl && res.tapIndex === 0) {
          that._saveGroup(gi);
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

  // ============ 保存到相册（与 result.js 同一实现口径）============
  _saveImagesSequentially: function (urls, successTitle) {
    if(this._previewOnly)return;
    var that = this;
    if (!urls || urls.length === 0) return;
    wx.showLoading({ title: '正在保存 1/' + urls.length + ' 张...', mask: true });
    var saveNext = function (index) {
      if (index >= urls.length) {
        wx.hideLoading();
        require('../../utils/wechatSendGuide').goToWechat(wx);
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

  onInputHint: function () {
    wx.showToast({ title: '这是效果预览，保存后回微信发送', icon: 'none', duration: 2200 });
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
