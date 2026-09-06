const test = require('node:test');
const assert = require('node:assert/strict');
const {
  loadMiniProgramModule,
  plain
} = require('./helpers/miniprogram-loader.cjs');

const strategies = loadMiniProgramModule('miniprogram/config/funTextStrategies.js');
const selector = loadMiniProgramModule('miniprogram/utils/strategySelector.js', {
  '../config/funTextStrategies': strategies
});
const validator = loadMiniProgramModule('miniprogram/utils/candidateValidator.js');
const planner = loadMiniProgramModule('miniprogram/utils/candidatePlanner.js', {
  '../config/funTextStrategies': strategies,
  './strategySelector': selector,
  './candidateValidator': validator
});
const { normalizeCreativeBrief } = loadMiniProgramModule('miniprogram/utils/creativeBrief.js');

function makeCandidate(overrides = {}) {
  return Object.assign({
    candidateId: 'candidate_hard_turn_1',
    strategyId: 'hard_turn',
    title: '嘴硬一下',
    seed: 1,
    cards: [
      { order: 1, role: 'hook', text: '我有句话' },
      { order: 2, role: 'build', text: '想告诉你' },
      { order: 3, role: 'reveal', text: '我今天想见你' },
      { order: 4, role: 'ending', text: '真的' }
    ]
  }, overrides);
}

function validCandidates() {
  return [
    makeCandidate(),
    makeCandidate({
      candidateId: 'candidate_suspense_reveal_2',
      strategyId: 'suspense_reveal',
      seed: 2
    }),
    makeCandidate({
      candidateId: 'candidate_fake_checklist_3',
      strategyId: 'fake_checklist',
      seed: 3
    })
  ];
}

const brief = normalizeCreativeBrief({ sourceText: '我今天想见你' });

test('plans three distinct valid candidates and preserves the full sentence', () => {
  const result = planner.planRuleCandidates(normalizeCreativeBrief({
    sourceText: '我今天想见你',
    expressionKey: 'funny-reversal'
  }));

  assert.equal(result.generationMode, 'rules');
  assert.equal(result.candidates.length, 3);
  assert.equal(new Set(result.candidates.map(item => item.strategyId)).size, 3);
  result.candidates.forEach((candidate) => {
    assert.ok(candidate.cards.length >= 3 && candidate.cards.length <= 8);
    assert.ok(candidate.cards.some(card => card.role === 'reveal' && card.text === '我今天想见你'));
    assert.deepEqual(candidate.cards.map(card => card.order), candidate.cards.map((card, index) => index + 1));
    assert.deepEqual(Object.keys(candidate).sort(), ['candidateId', 'cards', 'seed', 'strategyId', 'title']);
  });
  assert.equal(validator.validateCandidateSet(result.candidates, brief).valid, true);
});

test('replans identical briefs deterministically and changes a later variant', () => {
  const first = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '生日快乐', variant: 1 }));
  const again = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '生日快乐', variant: 1 }));
  const next = planner.planRuleCandidates(normalizeCreativeBrief({ sourceText: '生日快乐', variant: 2 }));

  assert.deepEqual(plain(first), plain(again));
  assert.notDeepEqual(plain(first), plain(next));
});

test('plans a normalized fractional variant with defined phrase text', () => {
  const fractionalBrief = normalizeCreativeBrief({ sourceText: '生日快乐', variant: 1.5 });
  const result = planner.planRuleCandidates(fractionalBrief);

  assert.equal(fractionalBrief.variant, 1.5);
  result.candidates.forEach((candidate) => {
    candidate.cards.forEach((card) => {
      assert.equal(typeof card.text, 'string');
    });
  });
  assert.equal(validator.validateCandidateSet(result.candidates, fractionalBrief).valid, true);
});

test('selects the expression mapping in deterministic three-strategy rotations', () => {
  assert.deepEqual(plain(selector.selectStrategyIds('cute-direct', 0)), [
    'suspense_reveal', 'visual_pause', 'fake_checklist'
  ]);
  assert.deepEqual(plain(selector.selectStrategyIds('cute-direct', 3)), [
    'hard_turn', 'soft_direct', 'repeat_escalate'
  ]);
});

test('registers eight distinct narrative strategies and can honor a case preference', () => {
  assert.deepEqual(Object.keys(strategies.STRATEGY_REGISTRY).sort(), [
    'countdown_reveal', 'fake_checklist', 'hard_turn', 'question_answer',
    'repeat_escalate', 'soft_direct', 'suspense_reveal', 'visual_pause'
  ]);
  const selected = selector.selectStrategyIds('cute-direct', 0, 'soft_direct');
  assert.equal(selected.length, 3);
  assert.equal(selected[0], 'soft_direct');
  assert.equal(new Set(selected).size, 3);
});

test('new strategies produce valid deterministic cards with one full reveal', () => {
  ['repeat_escalate', 'soft_direct', 'countdown_reveal', 'question_answer'].forEach((strategyId) => {
    const strategy = strategies.STRATEGY_REGISTRY[strategyId];
    const cards = strategy.buildCards('我今天想见你', 1).map((card, index) => ({
      ...card,
      order: index + 1
    }));
    const candidates = validCandidates();
    candidates[0] = makeCandidate({ candidateId: `candidate_${strategyId}_1`, strategyId, cards });
    assert.equal(validator.validateCandidateSet(candidates, brief).valid, true, strategyId);
  });
});

test('rejects candidate sets that do not contain exactly three candidates', () => {
  assert.equal(validator.validateCandidateSet(validCandidates().slice(0, 2), brief).valid, false);
});

test('rejects candidate sets with repeated strategies', () => {
  const candidates = validCandidates();
  candidates[2].strategyId = 'hard_turn';
  assert.equal(validator.validateCandidateSet(candidates, brief).valid, false);
});

test('rejects candidates outside the three-to-eight card range', () => {
  const tooShort = validCandidates();
  tooShort[0].cards = tooShort[0].cards.slice(0, 2);
  const tooLong = validCandidates();
  tooLong[0].cards = Array.from({ length: 9 }, (_, index) => ({
    order: index + 1,
    role: index === 0 ? 'hook' : index === 7 ? 'reveal' : 'build',
    text: index === 7 ? '我今天想见你' : '短句'
  }));

  assert.equal(validator.validateCandidateSet(tooShort, brief).valid, false);
  assert.equal(validator.validateCandidateSet(tooLong, brief).valid, false);
});

test('rejects candidates with broken order or adjacent identical text', () => {
  const brokenOrder = validCandidates();
  brokenOrder[0].cards[1].order = 4;
  const repeatedText = validCandidates();
  repeatedText[0].cards[1].text = repeatedText[0].cards[0].text;

  assert.equal(validator.validateCandidateSet(brokenOrder, brief).valid, false);
  assert.equal(validator.validateCandidateSet(repeatedText, brief).valid, false);
});

test('rejects candidates without an opening role or a reveal-or-ending role', () => {
  const noOpening = validCandidates();
  noOpening[0].cards[0].role = 'misdirect';
  noOpening[0].cards[1].role = 'misdirect';
  const noClose = validCandidates();
  noClose[0].cards[2].role = 'build';
  noClose[0].cards[3].role = 'build';

  assert.equal(validator.validateCandidateSet(noOpening, brief).valid, false);
  assert.equal(validator.validateCandidateSet(noClose, brief).valid, false);
});

test('rejects non-reveal text over twelve characters and incorrect reveal text', () => {
  const tooLong = validCandidates();
  tooLong[0].cards[0].text = '超过十二个字符的短句应该被拒绝';
  const wrongReveal = validCandidates();
  wrongReveal[0].cards[2].text = '今天不见了';

  assert.equal(validator.validateCandidateSet(tooLong, brief).valid, false);
  assert.equal(validator.validateCandidateSet(wrongReveal, brief).valid, false);
});

test('rejects a reveal over forty characters even when it matches the source text', () => {
  const longBrief = { sourceText: '字'.repeat(41) };
  const candidates = validCandidates();
  candidates.forEach((candidate) => {
    candidate.cards[2].text = longBrief.sourceText;
  });

  assert.equal(validator.validateCandidateSet(candidates, longBrief).valid, false);
});

test('rejects empty text outside pause and ending cards', () => {
  const emptyHook = validCandidates();
  emptyHook[0].cards[0].text = '';

  assert.equal(validator.validateCandidateSet(emptyHook, brief).valid, false);
});
