// pages/fun-text/fun-text.js
// 趣味字画输入页：一句话 + 组合表达标签；本地归一化 → contentGuard → 创建规则项目 → 候选页。
// 内置示例固定使用已审核文案，不调用云函数。
const contentGuardClient = require('../../utils/contentGuardClient');
const creativePlannerClient = require('../../utils/creativePlannerClient');
const funTextProject = require('../../utils/funTextProject');
const funTextCases = require('../../config/funTextCases');
const { ENABLE_FUN_TEXT_STACK_ENTRY } = require('../../config/env');

const EXPRESSION_OPTIONS = [
  { key: 'random-fun', label: '随机好玩', desc: '自动挑三种结构' },
  { key: 'funny-reversal', label: '搞怪反转', desc: '悬念误导末卡翻转' },
  { key: 'cute-direct', label: '可爱直球', desc: '逐步靠近真心落点' },
  { key: 'tough-soft', label: '嘴硬心软', desc: '先否定再撤回真心' }
];

const DEMO_SOURCE_TEXT = '我今天想见你';
const DEMO_EXPRESSION_KEY = 'funny-reversal';
const MAX_CHAR_COUNT = 40;

Page({
  data: {
    funTextEntryEnabled: ENABLE_FUN_TEXT_STACK_ENTRY === true,
    inputText: '',
    charCount: 0,
    expressionOptions: EXPRESSION_OPTIONS,
    expressionKey: 'random-fun',
    caseCategories: funTextCases.listFunTextCategories(),
    funTextCases: funTextCases.listFunTextCases(),
    activeCaseCategory: 'all',
    selectedCaseId: '',
    preferredStrategyId: '',
    preferredStylePackId: '',
    generating: false
  },

  onInput: function (event) {
    const value = (event.detail && event.detail.value) || '';
    this.setData({
      inputText: value,
      charCount: Array.from(value).length
    });
  },

  onSelectExpression: function (event) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    this.setData({ expressionKey: key, selectedCaseId: '', preferredStrategyId: '', preferredStylePackId: '' });
  },

  onSelectCaseCategory: function (event) {
    const key = event.currentTarget.dataset.key || 'all';
    this.setData({
      activeCaseCategory: key,
      funTextCases: funTextCases.listFunTextCases(key === 'all' ? '' : key)
    });
  },

  onSelectCase: function (event) {
    const selected = funTextCases.getFunTextCase(event.currentTarget.dataset.caseId);
    if (!selected) return;
    this.setData({
      selectedCaseId: selected.caseId,
      inputText: selected.sourceText,
      charCount: Array.from(selected.sourceText).length,
      expressionKey: selected.expressionKey,
      preferredStrategyId: selected.preferredStrategyId,
      preferredStylePackId: selected.preferredStylePackId
    });
  },

  onGenerate: async function () {
    if (!this.ensureEnabled()) return;
    if (this.data.generating) return;

    const sourceText = (this.data.inputText || '').trim();
    const count = Array.from(sourceText).length;
    if (count === 0) {
      wx.showToast({ title: '请输入一句话', icon: 'none' });
      return;
    }
    if (count > MAX_CHAR_COUNT) {
      wx.showToast({ title: `最多 ${MAX_CHAR_COUNT} 个字`, icon: 'none' });
      return;
    }

    this.setData({ generating: true });
    try {
      await contentGuardClient.checkTextContent(wx, sourceText);
      const brief = {
        sourceText: sourceText,
        expressionKey: this.data.expressionKey,
        caseId: this.data.selectedCaseId,
        preferredStrategyId: this.data.preferredStrategyId,
        preferredStylePackId: this.data.preferredStylePackId,
        now: Date.now()
      };
      const planRes = await creativePlannerClient.planCandidates(wx, brief);
      const project = funTextProject.createFunTextProject(Object.assign({}, brief, {
        candidates: planRes.candidates,
        generationMode: planRes.source
      }));
      this.navigateToCandidates(project);
    } catch (err) {
      if (err && err.code === 'CONTENT_UNSAFE') {
        wx.showModal({
          title: '内容审核未通过',
          content: '这句话不符合平台内容规范，请换一句话试试。',
          showCancel: false
        });
      } else {
        wx.showModal({
          title: '安全服务暂不可用',
          content: '暂时无法完成内容安全检查，请稍后重试。',
          showCancel: false
        });
      }
    } finally {
      this.setData({ generating: false });
    }
  },

  // 内置示例：固定、已审核文案，不调用云函数，直接带入候选页
  onTryDemo: function () {
    if (!this.ensureEnabled()) return;
    const project = funTextProject.createFunTextProject({
      sourceText: DEMO_SOURCE_TEXT,
      expressionKey: DEMO_EXPRESSION_KEY,
      now: Date.now()
    });
    this.navigateToCandidates(project);
  },

  navigateToCandidates: function (project) {
    if (!this.ensureEnabled()) return;
    wx.navigateTo({
      url: '/pages/fun-text-candidates/fun-text-candidates',
      success: function (navRes) {
        navRes.eventChannel.emit('funTextProject', { project: project });
      }
    });
  },

  ensureEnabled: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY === true) return true;
    wx.showToast({ title: '趣味字画暂不可用', icon: 'none' });
    return false;
  }
});
