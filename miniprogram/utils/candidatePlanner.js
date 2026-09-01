var strategies = require('../config/funTextStrategies');
var selector = require('./strategySelector');
var validator = require('./candidateValidator');

function hashSeed(value) {
  var hash = 0x811c9dc5;
  var text = String(value);
  for (var index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

function normalizeVariant(variant) {
  return Math.max(0, Math.floor(Number(variant) || 0));
}

function planRuleCandidates(brief) {
  var variant = normalizeVariant(brief.variant);
  var strategyIds = selector.selectStrategyIds(brief.expressionKey, variant);
  var candidates = strategyIds.map(function (strategyId) {
    var strategy = strategies.STRATEGY_REGISTRY[strategyId];
    var seed = hashSeed([
      brief.sourceText,
      brief.expressionKey,
      variant,
      strategyId
    ].join('|'));
    var cards = strategy.buildCards(brief.sourceText, variant).map(function (card, index) {
      return Object.assign({}, card, { order: index + 1 });
    });

    return {
      candidateId: 'candidate_' + strategyId + '_' + seed,
      strategyId: strategyId,
      title: strategy.title,
      seed: seed,
      cards: cards
    };
  });
  var validation = validator.validateCandidateSet(candidates, brief);
  if (!validation.valid) {
    throw new Error('规则候选未通过校验：' + validation.errors.join('；'));
  }

  return {
    generationMode: 'rules',
    candidates: candidates
  };
}

module.exports = {
  hashSeed: hashSeed,
  planRuleCandidates: planRuleCandidates
};
