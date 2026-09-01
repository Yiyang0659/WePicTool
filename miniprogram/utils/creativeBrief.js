var EXPRESSION_KEYS = ['random-fun', 'funny-reversal', 'cute-direct', 'tough-soft'];

function normalizeCreativeBrief(input) {
  var value = input || {};
  var sourceText = typeof value.sourceText === 'string' ? value.sourceText.trim() : '';
  var count = Array.from(sourceText).length;
  if (!count) throw new Error('请输入一句话');
  if (count > 40) throw new Error('最多输入 40 个字');
  var expressionKey = EXPRESSION_KEYS.indexOf(value.expressionKey) >= 0
    ? value.expressionKey
    : 'random-fun';
  return {
    sourceText: sourceText,
    expressionKey: expressionKey,
    relationship: 'unspecified',
    intensity: 'medium',
    requestedCandidateCount: 3,
    cardRange: { min: 3, preferred: 5, max: 8 },
    locale: 'zh-CN',
    variant: Math.max(0, Number(value.variant) || 0)
  };
}

module.exports = {
  EXPRESSION_KEYS: EXPRESSION_KEYS,
  normalizeCreativeBrief: normalizeCreativeBrief
};
