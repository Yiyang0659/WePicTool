const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMiniProgramModule } = require('./helpers/miniprogram-loader.cjs');

const strategies = loadMiniProgramModule('miniprogram/config/funTextStrategies.js');
const stylePacks = loadMiniProgramModule('miniprogram/config/stylePacks.js');
const assetRegistry = loadMiniProgramModule('miniprogram/config/assetRegistry.js');
const strategySelector = loadMiniProgramModule('miniprogram/utils/strategySelector.js', {
  '../config/funTextStrategies': strategies
});
const validator = loadMiniProgramModule('miniprogram/utils/candidateValidator.js');
const candidatePlanner = loadMiniProgramModule('miniprogram/utils/candidatePlanner.js', {
  './strategySelector': strategySelector,
  './candidateValidator': validator,
  '../config/funTextStrategies': strategies
});
const styleMatcher = loadMiniProgramModule('miniprogram/utils/styleMatcher.js', {
  '../config/stylePacks': stylePacks
});
const sceneComposer = loadMiniProgramModule('miniprogram/utils/sceneComposer.js', {
  '../config/stylePacks': stylePacks,
  '../config/assetRegistry': assetRegistry,
  './candidatePlanner': candidatePlanner
});

const plannerClient = loadMiniProgramModule('miniprogram/utils/creativePlannerClient.js', {
  './strategySelector': strategySelector,
  './candidatePlanner': candidatePlanner,
  './styleMatcher': styleMatcher,
  './sceneComposer': sceneComposer
});

test('planCandidates uses cloud AI when available and composes scenes', async () => {
  const mockWx = {
    cloud: {
      callFunction: async () => ({
        result: {
          ok: true,
          source: 'ai',
          candidates: [
            {
              candidateId: 'candidate_a',
              strategyId: 'hard_turn',
              title: '嘴硬一下',
              cards: [
                { order: 1, role: 'hook', text: '我今天' },
                { order: 2, role: 'misdirect', text: '不太想' },
                { order: 3, role: 'pause', text: '……' },
                { order: 4, role: 'reveal', text: '才怪想见你' }
              ]
            },
            {
              candidateId: 'candidate_b',
              strategyId: 'suspense_reveal',
              title: '悬念揭晓',
              cards: [
                { order: 1, role: 'hook', text: '有件事' },
                { order: 2, role: 'pause', text: '……' },
                { order: 3, role: 'reveal', text: '我今天想见你' }
              ]
            },
            {
              candidateId: 'candidate_c',
              strategyId: 'fake_checklist',
              title: '伪清单',
              cards: [
                { order: 1, role: 'hook', text: '今日待办' },
                { order: 2, role: 'pause', text: '……' },
                { order: 3, role: 'reveal', text: '见你' }
              ]
            }
          ]
        }
      })
    }
  };

  const brief = { sourceText: '我今天想见你', expressionKey: 'funny-reversal' };
  const result = await plannerClient.planCandidates(mockWx, brief);

  assert.equal(result.ok, true);
  assert.equal(result.source, 'ai');
  assert.equal(result.candidates.length, 3);
  assert.ok(result.candidates[0].scenes.length >= 3);
  assert.ok(result.candidates[0].stylePackId);
});

test('planCandidates silently falls back to rule generator on cloud error', async () => {
  const mockWx = {
    cloud: {
      callFunction: async () => {
        throw new Error('Cloud function error');
      }
    }
  };

  const brief = { sourceText: '我今天想见你', expressionKey: 'funny-reversal' };
  const result = await plannerClient.planCandidates(mockWx, brief);

  assert.equal(result.ok, true);
  assert.equal(result.source, 'rule_fallback');
  assert.equal(result.candidates.length, 3);
  assert.ok(result.candidates[0].scenes.length >= 3);
});
