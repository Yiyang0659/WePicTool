const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const strategies = loadMiniProgramModule('miniprogram/config/funTextStrategies.js');
const storyPrompt = loadMiniProgramModule('miniprogram/utils/storyPrompt.js', {
  '../config/funTextStrategies': strategies
});

test('buildStoryPrompt generates system prompt and user prompt with exact strategies and constraints', () => {
  const brief = {
    sourceText: '我今天想见你',
    expressionKey: 'funny-reversal',
    requestedCandidateCount: 3,
    cardRange: { min: 3, preferred: 5, max: 8 }
  };
  const selectedStrategies = ['hard_turn', 'suspense_reveal', 'fake_checklist'];

  const promptData = storyPrompt.buildStoryPrompt(brief, selectedStrategies);

  assert.ok(promptData);
  assert.equal(typeof promptData.systemPrompt, 'string');
  assert.equal(typeof promptData.userPrompt, 'string');
  assert.ok(promptData.systemPrompt.includes('微信叠图'));
  assert.ok(promptData.systemPrompt.includes('hook'));
  assert.ok(promptData.systemPrompt.includes('reveal'));
  assert.ok(promptData.userPrompt.includes('我今天想见你'));
  assert.ok(promptData.userPrompt.includes('hard_turn'));
  assert.ok(promptData.userPrompt.includes('suspense_reveal'));
  assert.ok(promptData.userPrompt.includes('fake_checklist'));
});

test('parseStoryResponse safely parses valid JSON and Markdown fenced JSON', () => {
  const validJson = JSON.stringify({
    candidates: [
      {
        candidateId: 'candidate_1',
        strategyId: 'hard_turn',
        title: '嘴硬一下',
        preservedMeaning: '今天想见对方',
        cards: [
          { order: 1, role: 'hook', text: '我今天' },
          { order: 2, role: 'misdirect', text: '不太想' },
          { order: 3, role: 'build', text: '见你' },
          { order: 4, role: 'pause', text: '……', visualCue: 'scribble-heart-hidden' },
          { order: 5, role: 'reveal', text: '才怪，立刻见我' }
        ]
      }
    ]
  });

  const parsedDirect = storyPrompt.parseStoryResponse(validJson);
  assert.equal(parsedDirect.ok, true);
  assert.equal(parsedDirect.data.candidates.length, 1);
  assert.equal(parsedDirect.data.candidates[0].strategyId, 'hard_turn');

  const fencedJson = '这是为您规划的方案：\n```json\n' + validJson + '\n```\n希望你喜欢！';
  const parsedFenced = storyPrompt.parseStoryResponse(fencedJson);
  assert.equal(parsedFenced.ok, true);
  assert.equal(parsedFenced.data.candidates[0].title, '嘴硬一下');
});

test('parseStoryResponse returns error for invalid or empty text', () => {
  const parsedEmpty = storyPrompt.parseStoryResponse('');
  assert.equal(parsedEmpty.ok, false);
  assert.ok(parsedEmpty.error);

  const parsedMalformed = storyPrompt.parseStoryResponse('不是 json 内容');
  assert.equal(parsedMalformed.ok, false);
});
