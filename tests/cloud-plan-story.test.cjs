const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const strategies = loadMiniProgramModule('miniprogram/config/funTextStrategies.js');
const storyPrompt = loadMiniProgramModule('miniprogram/utils/storyPrompt.js');
const validator = loadMiniProgramModule('miniprogram/utils/candidateValidator.js');

const cloudPlanServicePath = path.join(__dirname, '..', 'miniprogram/cloudfunctions/planFunTextStory/index.js');

test('planFunTextStory returns valid candidates when LLM outputs compliant JSON', async () => {
  const planStory = require(cloudPlanServicePath);
  
  const mockCandidates = [
    {
      candidateId: 'candidate_a',
      strategyId: 'hard_turn',
      title: '嘴硬一下',
      preservedMeaning: '想见你',
      cards: [
        { order: 1, role: 'hook', text: '我今天' },
        { order: 2, role: 'misdirect', text: '不太想' },
        { order: 3, role: 'pause', text: '……' },
        { order: 4, role: 'reveal', text: '才怪，超想见你' }
      ]
    },
    {
      candidateId: 'candidate_b',
      strategyId: 'suspense_reveal',
      title: '悬念揭晓',
      preservedMeaning: '想见你',
      cards: [
        { order: 1, role: 'hook', text: '有件事' },
        { order: 2, role: 'build', text: '憋了很久' },
        { order: 3, role: 'reveal', text: '我今天想见你' }
      ]
    },
    {
      candidateId: 'candidate_c',
      strategyId: 'fake_checklist',
      title: '伪清单',
      preservedMeaning: '想见你',
      cards: [
        { order: 1, role: 'hook', text: '今日待办' },
        { order: 2, role: 'build', text: '1. 吃饭' },
        { order: 3, role: 'build', text: '2. 发呆' },
        { order: 4, role: 'reveal', text: '3. 见你（加粗）' }
      ]
    }
  ];

  const mockCallLlm = async () => ({
    choices: [{ message: { content: JSON.stringify({ candidates: mockCandidates }) } }]
  });

  const mockAudit = async () => ({ ok: true });

  const result = await planStory.handlePlanStory({
    brief: { sourceText: '我今天想见你', expressionKey: 'funny-reversal' },
    selectedStrategies: ['hard_turn', 'suspense_reveal', 'fake_checklist']
  }, {
    callLlm: mockCallLlm,
    checkContent: mockAudit
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'ai');
  assert.equal(result.candidates.length, 3);
});

test('planFunTextStory triggers repair when first output is malformed', async () => {
  const planStory = require(cloudPlanServicePath);
  
  let callCount = 0;
  const mockCallLlm = async (messages) => {
    callCount += 1;
    if (callCount === 1) {
      // First call returns malformed JSON
      return { choices: [{ message: { content: 'not valid json' } }] };
    }
    // Second call (repair) returns valid JSON
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            candidates: [
              {
                candidateId: 'candidate_a',
                strategyId: 'hard_turn',
                title: '嘴硬一下',
                cards: [
                  { order: 1, role: 'hook', text: '我今天' },
                  { order: 2, role: 'pause', text: '……' },
                  { order: 3, role: 'reveal', text: '才怪想见你' }
                ]
              },
              {
                candidateId: 'candidate_b',
                strategyId: 'suspense_reveal',
                title: '悬念',
                cards: [
                  { order: 1, role: 'hook', text: '其实' },
                  { order: 2, role: 'pause', text: '……' },
                  { order: 3, role: 'reveal', text: '很想见你' }
                ]
              },
              {
                candidateId: 'candidate_c',
                strategyId: 'fake_checklist',
                title: '待办',
                cards: [
                  { order: 1, role: 'hook', text: '待办' },
                  { order: 2, role: 'pause', text: '……' },
                  { order: 3, role: 'reveal', text: '见你' }
                ]
              }
            ]
          })
        }
      }]
    };
  };

  const mockAudit = async () => ({ ok: true });

  const result = await planStory.handlePlanStory({
    brief: { sourceText: '我今天想见你', expressionKey: 'funny-reversal' },
    selectedStrategies: ['hard_turn', 'suspense_reveal', 'fake_checklist']
  }, {
    callLlm: mockCallLlm,
    checkContent: mockAudit
  });

  assert.equal(callCount, 2);
  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 3);
});

test('planFunTextStory returns fallback recommendation on unrecoverable error or unsafe content', async () => {
  const planStory = require(cloudPlanServicePath);
  
  const mockCallLlm = async () => {
    throw new Error('LLM connection timeout');
  };

  const result = await planStory.handlePlanStory({
    brief: { sourceText: '我今天想见你' }
  }, {
    callLlm: mockCallLlm
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AI_FALLBACK_RECOMMENDED');
});
