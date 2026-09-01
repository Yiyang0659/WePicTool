var strategies = require('../config/funTextStrategies');

function normalizeVariant(variant) {
  var value = Math.floor(Number(variant) || 0);
  return Math.max(0, value);
}

function selectStrategyIds(expressionKey, variant) {
  var available = strategies.EXPRESSION_STRATEGIES[expressionKey]
    || strategies.EXPRESSION_STRATEGIES['random-fun'];
  var offset = normalizeVariant(variant) % available.length;

  return [0, 1, 2].map(function (index) {
    return available[(offset + index) % available.length];
  });
}

module.exports = {
  selectStrategyIds: selectStrategyIds
};
