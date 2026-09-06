var strategies = require('../config/funTextStrategies');

function normalizeVariant(variant) {
  var value = Math.floor(Number(variant) || 0);
  return Math.max(0, value);
}

function selectStrategyIds(expressionKey, variant, preferredStrategyId) {
  var available = strategies.EXPRESSION_STRATEGIES[expressionKey]
    || strategies.EXPRESSION_STRATEGIES['random-fun'];
  var offset = normalizeVariant(variant) % available.length;
  var rotated = available.map(function (_, index) {
    return available[(offset + index) % available.length];
  });
  var selected = [];
  if (preferredStrategyId && strategies.STRATEGY_REGISTRY[preferredStrategyId]) {
    selected.push(preferredStrategyId);
  }
  rotated.forEach(function (strategyId) {
    if (selected.length < 3 && selected.indexOf(strategyId) < 0) selected.push(strategyId);
  });
  return selected;
}

module.exports = {
  selectStrategyIds: selectStrategyIds
};
