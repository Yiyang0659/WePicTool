var EXPRESSION_STRATEGIES = {
  'random-fun': ['hard_turn', 'suspense_reveal', 'fake_checklist', 'visual_pause'],
  'funny-reversal': ['hard_turn', 'suspense_reveal', 'fake_checklist', 'visual_pause'],
  'cute-direct': ['suspense_reveal', 'visual_pause', 'fake_checklist', 'hard_turn'],
  'tough-soft': ['hard_turn', 'visual_pause', 'suspense_reveal', 'fake_checklist']
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
  }
};

module.exports = {
  EXPRESSION_STRATEGIES: EXPRESSION_STRATEGIES,
  STRATEGY_REGISTRY: STRATEGY_REGISTRY
};
