var CATEGORIES = [
  { key: 'love', label: '想念表白', icon: '💗' },
  { key: 'birthday', label: '生日祝福', icon: '🎂' },
  { key: 'reconcile', label: '道歉和好', icon: '🤝' },
  { key: 'prank', label: '搞怪整蛊', icon: '😜' },
  { key: 'group-chat', label: '群聊发疯', icon: '🔥' },
  { key: 'reminder', label: '日常提醒', icon: '📌' }
];

var CASES = [
  { caseId: 'miss-you-today', categoryKey: 'love', title: '今天想见你', sourceText: '我今天想见你', expressionKey: 'cute-direct', preferredStrategyId: 'soft_direct', preferredStylePackId: 'gentle-journal-v1' },
  { caseId: 'secret-to-tell', categoryKey: 'love', title: '有句话告诉你', sourceText: '其实我一直很喜欢你', expressionKey: 'tough-soft', preferredStrategyId: 'suspense_reveal', preferredStylePackId: 'pink-note-v1' },
  { caseId: 'birthday-star', categoryKey: 'birthday', title: '今天谁最大', sourceText: '今天你最大，生日快乐', expressionKey: 'funny-reversal', preferredStrategyId: 'question_answer', preferredStylePackId: 'crazy-grid-v1' },
  { caseId: 'birthday-wish', categoryKey: 'birthday', title: '愿望会实现', sourceText: '你的生日愿望会实现', expressionKey: 'cute-direct', preferredStrategyId: 'countdown_reveal', preferredStylePackId: 'gentle-journal-v1' },
  { caseId: 'no-excuse', categoryKey: 'reconcile', title: '不是来解释', sourceText: '我不是来解释的，我来道歉', expressionKey: 'cute-direct', preferredStrategyId: 'soft_direct', preferredStylePackId: 'blue-soda-v1' },
  { caseId: 'make-up', categoryKey: 'reconcile', title: '可以和好吗', sourceText: '我们可以和好吗', expressionKey: 'tough-soft', preferredStrategyId: 'hard_turn', preferredStylePackId: 'gentle-journal-v1' },
  { caseId: 'urgent-notice', categoryKey: 'prank', title: '紧急通知', sourceText: '紧急通知：我要请你吃饭', expressionKey: 'funny-reversal', preferredStrategyId: 'countdown_reveal', preferredStylePackId: 'crazy-grid-v1' },
  { caseId: 'big-secret', categoryKey: 'prank', title: '假装有大事', sourceText: '有件大事：我又想你了', expressionKey: 'funny-reversal', preferredStrategyId: 'suspense_reveal', preferredStylePackId: 'chalk-chaos-v1' },
  { caseId: 'dont-swipe', categoryKey: 'group-chat', title: '先别划走', sourceText: '先别划走，我有个大胆想法', expressionKey: 'random-fun', preferredStrategyId: 'visual_pause', preferredStylePackId: 'crazy-grid-v1' },
  { caseId: 'major-decision', categoryKey: 'group-chat', title: '重大决定', sourceText: '本人决定今天准时下班', expressionKey: 'funny-reversal', preferredStrategyId: 'repeat_escalate', preferredStylePackId: 'blue-soda-v1' },
  { caseId: 'today-list', categoryKey: 'reminder', title: '今日待办', sourceText: '今天最重要的事是开心', expressionKey: 'random-fun', preferredStrategyId: 'fake_checklist', preferredStylePackId: 'paper-collage-v1' },
  { caseId: 'remember-this', categoryKey: 'reminder', title: '别忘这件事', sourceText: '别忘了好好吃饭和休息', expressionKey: 'cute-direct', preferredStrategyId: 'repeat_escalate', preferredStylePackId: 'retro-ticket-v1' }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getFunTextCase(caseId) {
  var item = CASES.find(function (entry) { return entry.caseId === caseId; });
  return item ? clone(item) : null;
}

function listFunTextCases(categoryKey) {
  var values = categoryKey
    ? CASES.filter(function (item) { return item.categoryKey === categoryKey; })
    : CASES;
  return clone(values);
}

function listFunTextCategories() {
  return clone(CATEGORIES);
}

module.exports = {
  getFunTextCase: getFunTextCase,
  listFunTextCases: listFunTextCases,
  listFunTextCategories: listFunTextCategories
};
