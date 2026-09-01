const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const validator = loadMiniProgramModule('miniprogram/utils/candidateValidator.js');

test('validateCandidateSet validates AI candidate with flexible reveal text under isAi option', () => {
  const brief = { sourceText: '我今天想见你', expressionKey: 'funny-reversal' };
  const aiCandidates = [
    {
      candidateId: 'candidate_a',
      strategyId: 'hard_turn',
      title: '嘴硬一下',
      preservedMeaning: '今天想见对方',
      cards: [
        { order: 1, role: 'hook', text: '我今天' },
        { order: 2, role: 'misdirect', text: '其实不太想' },
        { order: 3, role: 'pause', text: '……' },
        { order: 4, role: 'reveal', text: '才怪，立刻见我！' }
      ]
    },
    {
      candidateId: 'candidate_b',
      strategyId: 'suspense_reveal',
      title: '悬念揭晓',
      preservedMeaning: '今天想见你',
      cards: [
        { order: 1, role: 'hook', text: '有件事' },
        { order: 2, role: 'build', text: '憋了很久' },
        { order: 3, role: 'reveal', text: '我今天想见你' }
      ]
    },
    {
      candidateId: 'candidate_c',
      strategyId: 'visual_pause',
      title: '情绪留白',
      preservedMeaning: '想见你',
      cards: [
        { order: 1, role: 'hook', text: '悄悄告诉你' },
        { order: 2, role: 'pause', text: '……' },
        { order: 3, role: 'reveal', text: '我今天好想见你' }
      ]
    }
  ];

  const result = validator.validateCandidateSet(aiCandidates, brief, { isAi: true });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateCandidateSet catches invalid card count and missing reveal for AI output', () => {
  const brief = { sourceText: '我今天想见你' };
  const badCandidates = [
    {
      candidateId: 'candidate_a',
      strategyId: 'hard_turn',
      cards: [
        { order: 1, role: 'hook', text: '我今天' },
        { order: 2, role: 'misdirect', text: '不太想' } // only 2 cards (< 3)
      ]
    },
    {
      candidateId: 'candidate_b',
      strategyId: 'suspense_reveal',
      cards: [
        { order: 1, role: 'hook', text: '有件事' },
        { order: 2, role: 'build', text: '憋了很久' },
        { order: 3, role: 'ending', text: '结束' } // no reveal card
      ]
    },
    {
      candidateId: 'candidate_c',
      strategyId: 'visual_pause',
      cards: [
        { order: 1, role: 'hook', text: '文字超长超长超长超长超长超长超长' }, // > 12 chars
        { order: 2, role: 'pause', text: '……' },
        { order: 3, role: 'reveal', text: '我今天想见你' }
      ]
    }
  ];

  const result = validator.validateCandidateSet(badCandidates, brief, { isAi: true });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3);
});

test('buildRepairPrompt creates a structured repair prompt with error list', () => {
  const errors = ['候选 1 卡片数量必须在 3 到 8 张之间', '候选 2 必须有且仅有一张 reveal 卡'];
  const repairPrompt = validator.buildRepairPrompt(errors, '{"invalid":"json"}');

  assert.ok(repairPrompt.includes('请修正以下错误'));
  assert.ok(repairPrompt.includes('候选 1 卡片数量必须在 3 到 8 张之间'));
  assert.ok(repairPrompt.includes('JSON'));
});
