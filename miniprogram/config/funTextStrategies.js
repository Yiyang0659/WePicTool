var EXPRESSION_STRATEGIES = {
  'random-fun': ['hard_turn', 'suspense_reveal', 'fake_checklist', 'visual_pause', 'repeat_escalate', 'soft_direct', 'countdown_reveal', 'question_answer'],
  'funny-reversal': ['hard_turn', 'suspense_reveal', 'fake_checklist', 'visual_pause', 'countdown_reveal', 'question_answer', 'repeat_escalate', 'soft_direct'],
  'cute-direct': ['suspense_reveal', 'visual_pause', 'fake_checklist', 'hard_turn', 'soft_direct', 'repeat_escalate', 'question_answer', 'countdown_reveal'],
  'tough-soft': ['hard_turn', 'visual_pause', 'suspense_reveal', 'fake_checklist', 'repeat_escalate', 'question_answer', 'countdown_reveal', 'soft_direct']
};

function buildHardTurn(sourceText, variant) {
  var openings = ['我本来想说', '有句话到嘴边'];
  var misdirects = ['算了', '还是不说了'];
  var endings = ['才不撤回', '就当我没忍住'];
  return [
    { role: 'hook', text: openings[variant % openings.length] },
    { role: 'misdirect', text: misdirects[variant % misdirects.length] },
    { role: 'pause', text: '……', visualCue: 'scribble-cross' },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'heart-small' }
  ];
}

function buildSuspenseReveal(sourceText, variant) {
  var hooks = ['有件事', '有个秘密'];
  var builds = ['再滑一下', '再靠近一点'];
  var endings = ['现在告诉你', '终于说出口'];
  return [
    { role: 'hook', text: hooks[variant % hooks.length] },
    { role: 'build', text: builds[variant % builds.length] },
    { role: 'pause', text: '……', visualCue: 'arrow-curve' },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'heart-small' }
  ];
}

function buildFakeChecklist(sourceText, variant) {
  var headings = ['今日待办', '今日安排'];
  var firstItems = ['吃饭', '喝水'];
  var secondItems = ['发呆', '摸鱼'];
  var endings = ['已置顶', '优先处理'];
  return [
    { role: 'hook', text: headings[variant % headings.length] },
    { role: 'build', text: firstItems[variant % firstItems.length] },
    { role: 'build', text: secondItems[variant % secondItems.length] },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'circle-mark' }
  ];
}

function buildVisualPause(sourceText, variant) {
  var hooks = ['先别划走', '停在这里'];
  var builds = ['看一眼', '给你看个'];
  var endings = ['就这句', '收到没'];
  return [
    { role: 'hook', text: hooks[variant % hooks.length] },
    { role: 'pause', text: '', visualCue: 'scribble-cross' },
    { role: 'build', text: builds[variant % builds.length] },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'heart-small' }
  ];
}

function buildRepeatEscalate(sourceText, variant) {
  var hooks = ['只是有一点', '起初没什么'];
  var builds = ['后来更多了', '慢慢藏不住'];
  var endings = ['越来越确定', '现在很确定'];
  return [
    { role: 'hook', text: hooks[variant % hooks.length] },
    { role: 'build', text: '一点点' },
    { role: 'build', text: builds[variant % builds.length] },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'burst-lines' }
  ];
}

function buildSoftDirect(sourceText, variant) {
  var hooks = ['认真说一句', '这次不绕弯'];
  var builds = ['不是玩笑', '请认真收下'];
  var endings = ['这次很真', '句句都真'];
  return [
    { role: 'hook', text: hooks[variant % hooks.length] },
    { role: 'build', text: builds[variant % builds.length] },
    { role: 'pause', text: '听好了', visualCue: 'underline-rough' },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'heart-small' }
  ];
}

function buildCountdownReveal(sourceText, variant) {
  var hooks = ['答案倒数', '准备揭晓'];
  var endings = ['就是这句', '答案送达'];
  return [
    { role: 'hook', text: hooks[variant % hooks.length] },
    { role: 'build', text: '三' },
    { role: 'build', text: '二' },
    { role: 'build', text: '一' },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'circle-mark' }
  ];
}

function buildQuestionAnswer(sourceText, variant) {
  var hooks = ['猜一个问题', '先问你一句'];
  var questions = ['答案会是谁', '你猜是什么'];
  var endings = ['答案在这里', '现在知道了'];
  return [
    { role: 'hook', text: hooks[variant % hooks.length] },
    { role: 'build', text: questions[variant % questions.length] },
    { role: 'pause', text: '想好了吗', visualCue: 'circle-mark' },
    { role: 'reveal', text: sourceText },
    { role: 'ending', text: endings[variant % endings.length], visualCue: 'arrow-curve' }
  ];
}

var STRATEGY_REGISTRY = {
  hard_turn: {
    strategyId: 'hard_turn',
    title: '嘴硬一下',
    buildCards: buildHardTurn
  },
  suspense_reveal: {
    strategyId: 'suspense_reveal',
    title: '悬念揭晓',
    buildCards: buildSuspenseReveal
  },
  fake_checklist: {
    strategyId: 'fake_checklist',
    title: '今日待办',
    buildCards: buildFakeChecklist
  },
  visual_pause: {
    strategyId: 'visual_pause',
    title: '停一下',
    buildCards: buildVisualPause
  },
  repeat_escalate: {
    strategyId: 'repeat_escalate',
    title: '越来越强烈',
    buildCards: buildRepeatEscalate
  },
  soft_direct: {
    strategyId: 'soft_direct',
    title: '温柔直球',
    buildCards: buildSoftDirect
  },
  countdown_reveal: {
    strategyId: 'countdown_reveal',
    title: '倒数揭晓',
    buildCards: buildCountdownReveal
  },
  question_answer: {
    strategyId: 'question_answer',
    title: '问答翻牌',
    buildCards: buildQuestionAnswer
  }
};

module.exports = {
  EXPRESSION_STRATEGIES: EXPRESSION_STRATEGIES,
  STRATEGY_REGISTRY: STRATEGY_REGISTRY
};
