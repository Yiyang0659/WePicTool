var stylePacks = require('../config/stylePacks');

function normalizeVariant(variant) {
  return Math.max(0, Math.floor(Number(variant) || 0));
}

function matchStylePacks(candidates, variant) {
  if (!Array.isArray(candidates)) throw new Error('候选必须是数组');
  if (candidates.length > stylePacks.STYLE_PACKS.length) {
    throw new Error('单批候选不能超过可用视觉包数量');
  }

  var start = normalizeVariant(variant) % stylePacks.STYLE_PACKS.length;
  return candidates.map(function (_, index) {
    return stylePacks.STYLE_PACKS[(start + index) % stylePacks.STYLE_PACKS.length].id;
  });
}

module.exports = {
  matchStylePacks: matchStylePacks
};
