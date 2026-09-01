var ALLOWED_ROLES = ['hook', 'build', 'misdirect', 'pause', 'reveal', 'ending'];

function textLength(value) {
  return Array.from(value).length;
}

function validateCandidateSet(candidates, brief) {
  var errors = [];
  var sourceText = brief && brief.sourceText;

  if (!Array.isArray(candidates) || candidates.length !== 3) {
    return { valid: false, errors: ['必须正好有三套候选'] };
  }

  var strategyIds = candidates.map(function (candidate) {
    return candidate && candidate.strategyId;
  });
  if (new Set(strategyIds).size !== strategyIds.length) {
    errors.push('候选策略不能重复');
  }

  candidates.forEach(function (candidate, candidateIndex) {
    var label = '候选 ' + (candidateIndex + 1);
    if (!candidate || typeof candidate.candidateId !== 'string' || !candidate.candidateId) {
      errors.push(label + ' 缺少 candidateId');
      return;
    }
    if (typeof candidate.strategyId !== 'string' || !candidate.strategyId) {
      errors.push(label + ' 缺少 strategyId');
    }
    if (!Array.isArray(candidate.cards) || candidate.cards.length < 3 || candidate.cards.length > 8) {
      errors.push(label + ' 卡片数量必须在 3 到 8 张之间');
      return;
    }

    var revealCount = 0;
    var hasOpening = false;
    var hasClosing = false;
    candidate.cards.forEach(function (card, cardIndex) {
      if (!card || card.order !== cardIndex + 1) {
        errors.push(label + ' 卡片序号必须连续');
        return;
      }
      if (ALLOWED_ROLES.indexOf(card.role) < 0) {
        errors.push(label + ' 卡片角色无效');
      }
      if (card.role === 'hook' || card.role === 'build') hasOpening = true;
      if (card.role === 'reveal' || card.role === 'ending') hasClosing = true;
      if (typeof card.text !== 'string') {
        errors.push(label + ' 卡片文字必须是字符串');
        return;
      }
      if (!card.text && card.role !== 'pause' && card.role !== 'ending') {
        errors.push(label + ' 只有 pause 或 ending 可以留空');
      }
      if (card.role === 'reveal') {
        revealCount += 1;
        if (card.text !== sourceText) {
          errors.push(label + ' reveal 必须保留原句');
        }
      } else if (textLength(card.text) > 12) {
        errors.push(label + ' 非 reveal 文案不能超过 12 字');
      }
      if (cardIndex > 0 && card.text === candidate.cards[cardIndex - 1].text) {
        errors.push(label + ' 不能有连续相同文案');
      }
    });

    if (!hasOpening) errors.push(label + ' 缺少 hook 或 build');
    if (!hasClosing) errors.push(label + ' 缺少 reveal 或 ending');
    if (revealCount !== 1) errors.push(label + ' 必须有且仅有一张 reveal 卡');
  });

  return { valid: errors.length === 0, errors: errors };
}

module.exports = {
  validateCandidateSet: validateCandidateSet
};
