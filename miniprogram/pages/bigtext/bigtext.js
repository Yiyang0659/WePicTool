const { THEMES, buildCardSpecs, buildBigtextTask, normalizeSourceText } = require('../../utils/textCard');
const { validateRenderedCards } = require('../../utils/bigtextResponse');
const { buildMarkerPreviewCards } = require('../../utils/markerCard');
const { TEXT_CARD_RENDERER_URL } = require('../../config/env');

function getErrorMessage(code) {
  if (code === 'CONTENT_UNSAFE') return '这段文字未通过内容审核，请修改后重试。';
  if (code === 'SAFETY_UNAVAILABLE') return '安全服务暂不可用，请稍后再试。';
  return '生成失败，请检查网络后重试。';
}

function requestRenderer(payload) {
  if (!TEXT_CARD_RENDERER_URL) {
    return Promise.reject(new Error('HANDWRITE_SERVICE_NOT_CONFIGURED'));
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${TEXT_CARD_RENDERER_URL}/render`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: payload,
      success: function (response) {
        let body = response && response.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (err) {
            reject(new Error('INVALID_RESPONSE'));
            return;
          }
        }
        if (!response || response.statusCode !== 200 || !body || body.ok !== true) {
          reject(new Error((body && body.code) || 'RENDER_FAILED'));
          return;
        }
        try {
          if (typeof body.taskId !== 'string' || !/^text_[A-Za-z0-9_-]{6,80}$/.test(body.taskId)) {
            reject(new Error('INVALID_RESPONSE'));
            return;
          }
          resolve({ taskId: body.taskId, cards: validateRenderedCards(payload.sourceText, body.cards) });
        } catch (err) {
          reject(err);
        }
      },
      fail: function () {
        reject(new Error('NETWORK_ERROR'));
      }
    });
  });
}

Page({
  data: {
    sourceText: '',
    charCount: 0,
    hasSourceText: false,
    themeKey: 'handwrite-paper',
    themes: Object.keys(THEMES).map((key) => THEMES[key]),
    cardSpecs: [],
    helperCount: 0,
    loading: false,
    errorText: ''
  },

  onLoad: function () {
    var that = this;
    var eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptBigtextDraft', function (draft) {
        if (!draft) return;
        that.refreshDraft(draft.sourceText || '', draft.themeKey || 'handwrite-paper');
      });
    }
  },

  onInput: function (event) {
    this.refreshDraft(event.detail.value, this.data.themeKey);
  },

  onSelectTheme: function (event) {
    const themeKey = event.currentTarget.dataset.key;
    this.refreshDraft(this.data.sourceText, THEMES[themeKey] ? themeKey : 'handwrite-paper');
  },

  refreshDraft: function (value, themeKey) {
    const rawText = typeof value === 'string' ? value : '';
    const sourceText = Array.from(rawText).slice(0, 20).join('');
    let cardSpecs = [];
    let errorText = '';
    try {
      if (sourceText.trim()) cardSpecs = buildCardSpecs(sourceText);
    } catch (err) {
      errorText = err.message || '请输入 1–20 个字';
    }
    const characterCount = Array.from(sourceText.trim()).length;
    const previewCards = buildMarkerPreviewCards({
      taskId: `draft_${sourceText || 'empty'}`,
      cards: cardSpecs
    });
    this.setData({
      sourceText,
      themeKey,
      charCount: characterCount,
      hasSourceText: characterCount > 0,
      cardSpecs: previewCards,
      helperCount: Math.max(0, cardSpecs.length - characterCount),
      errorText
    });
  },

  onGenerate: async function () {
    if (this.data.loading) return;

    let sourceText;
    try {
      sourceText = normalizeSourceText(this.data.sourceText);
    } catch (err) {
      this.setData({ errorText: err.message || '请输入 1–20 个字' });
      return;
    }

    this.setData({ loading: true, errorText: '' });
    try {
      const taskId = `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const response = await requestRenderer({ taskId, sourceText, themeKey: this.data.themeKey });
      const task = buildBigtextTask({
        taskId: response.taskId,
        sourceText,
        themeKey: this.data.themeKey,
        renderedCards: response.cards,
        createdAt: Date.now()
      });
      this.goToResult(task);
    } catch (err) {
      const code = err && err.message;
      const message = code === 'HANDWRITE_SERVICE_NOT_CONFIGURED'
        ? '手写卡服务尚未部署；文字与排版预览可正常使用。'
        : getErrorMessage(code);
      this.setData({ errorText: message });
    } finally {
      this.setData({ loading: false });
    }
  },

  goToResult: function (task) {
    wx.navigateTo({
      url: `/pages/template-result/template-result?taskId=${task.taskId}`,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', { task });
      }
    });
  }
});

module.exports = { requestRenderer };
