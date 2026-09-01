// miniprogram/utils/creativePlannerClient.js
// 趣味字画 P2.2 客户端故事规划调度器（AI 优先 + 本地规则静默兜底）

var strategySelector = require('./strategySelector');
var candidatePlanner = require('./candidatePlanner');
var styleMatcher = require('./styleMatcher');
var sceneComposer = require('./sceneComposer');

function composeCandidateList(rawCandidates, brief) {
  var stylePackIds = styleMatcher.matchStylePacks(rawCandidates, brief && brief.variant);
  return rawCandidates.map(function (candidate, index) {
    var stylePackId = candidate.stylePackId || stylePackIds[index];
    var scenes = sceneComposer.composeCandidate(candidate, stylePackId);
    return Object.assign({}, candidate, {
      stylePackId: stylePackId,
      scenes: scenes,
      originalScenes: scenes.map(function (s) { return JSON.parse(JSON.stringify(s)); }),
      editedScenes: scenes.map(function (s) { return JSON.parse(JSON.stringify(s)); })
    });
  });
}

function fallbackToRules(brief, reason) {
  var ruleResult = candidatePlanner.planRuleCandidates(brief);
  var composed = composeCandidateList(ruleResult.candidates, brief);
  return {
    ok: true,
    source: 'rule_fallback',
    candidates: composed,
    fallbackReason: reason || '规则兜底'
  };
}

async function planCandidates(wxApi, creativeBrief, options) {
  var opts = options || {};
  var brief = creativeBrief || {};

  if (opts.forceRule) {
    var ruleResult = candidatePlanner.planRuleCandidates(brief);
    return {
      ok: true,
      source: 'rule',
      candidates: composeCandidateList(ruleResult.candidates, brief)
    };
  }

  var selectedStrategies = strategySelector.selectStrategyIds(brief.expressionKey, brief.variant);

  if (!wxApi || !wxApi.cloud || typeof wxApi.cloud.callFunction !== 'function') {
    return fallbackToRules(brief, '当前环境不支持云函数');
  }

  try {
    var res = await wxApi.cloud.callFunction({
      name: 'planFunTextStory',
      data: {
        brief: brief,
        selectedStrategies: selectedStrategies
      }
    });

    var resultData = res && res.result;
    if (resultData && resultData.ok && Array.isArray(resultData.candidates) && resultData.candidates.length === 3) {
      var composedCandidates = composeCandidateList(resultData.candidates, brief);
      return {
        ok: true,
        source: 'ai',
        candidates: composedCandidates
      };
    }

    return fallbackToRules(brief, (resultData && resultData.error) || 'AI 规划未返回有效候选');
  } catch (error) {
    return fallbackToRules(brief, (error && error.message) || '云端调用异常');
  }
}

module.exports = {
  planCandidates: planCandidates
};
