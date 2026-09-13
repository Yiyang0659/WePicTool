// miniprogram/cloudfunctions/planFunTextStory/index.js
// 趣味字画 P2.2 AI 智能故事规划云函数

const storyPrompt = require('../../utils/storyPrompt');
const validator = require('../../utils/candidateValidator');

let cloud = null;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  // Local environment or testing
}

function collectCandidateTexts(candidates) {
  const texts = [];
  (candidates || []).forEach(function (cand) {
    (cand.cards || []).forEach(function (card) {
      if (card.text) texts.push(card.text);
    });
  });
  return texts.join('；');
}

async function defaultCallLlm(messages, options) {
  const apiKey = process.env.LLM_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  const baseUrl = (process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const model = process.env.LLM_MODEL || 'qwen3.8-flash';

  if (!apiKey) {
    throw new Error('LLM_API_KEY 未配置');
  }

  const endpoint = baseUrl + '/chat/completions';
  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 1500
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error('LLM 请求失败，状态码: ' + response.status);
  }

  return response.json();
}

async function defaultCheckContent(content) {
  if (!cloud || !cloud.openapi || !cloud.openapi.security) {
    return { ok: false, code: 'SAFETY_UNAVAILABLE' };
  }
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content });
    return res && Number(res.errCode) === 0
      ? { ok: true, code: 'OK' }
      : { ok: false, code: 'CONTENT_UNSAFE' };
  } catch (error) {
    return { ok: false, code: 'SAFETY_UNAVAILABLE', message: error && error.message };
  }
}

async function handlePlanStory(event, dependencies) {
  const deps = dependencies || {};
  const callLlm = deps.callLlm || defaultCallLlm;
  const checkContent = deps.checkContent || defaultCheckContent;

  const brief = (event && event.brief) || {};
  const selectedStrategies = (event && event.selectedStrategies) || [];

  if (!brief.sourceText || typeof brief.sourceText !== 'string') {
    return { ok: false, code: 'INVALID_INPUT', error: '缺少有效原话' };
  }

  try {
    // 1. 构造初始 Prompt
    const promptData = storyPrompt.buildStoryPrompt(brief, selectedStrategies);
    const messages = [
      { role: 'system', content: promptData.systemPrompt },
      { role: 'user', content: promptData.userPrompt }
    ];

    // 2. 调用大模型（第一次）
    const llmRes = await callLlm(messages);
    const rawContent = (llmRes && llmRes.choices && llmRes.choices[0] && llmRes.choices[0].message && llmRes.choices[0].message.content) || '';

    // 3. 解析与结构校验
    let parseResult = storyPrompt.parseStoryResponse(rawContent);
    let validationResult = parseResult.ok
      ? validator.validateCandidateSet(parseResult.data.candidates, brief, { isAi: true })
      : { valid: false, errors: [parseResult.error] };

    // 4. 单次自动修复机制
    if (!validationResult.valid) {
      const repairPrompt = validator.buildRepairPrompt(validationResult.errors, rawContent);
      const repairMessages = messages.concat([
        { role: 'assistant', content: rawContent },
        { role: 'user', content: repairPrompt }
      ]);

      const repairRes = await callLlm(repairMessages);
      const repairContent = (repairRes && repairRes.choices && repairRes.choices[0] && repairRes.choices[0].message && repairRes.choices[0].message.content) || '';
      parseResult = storyPrompt.parseStoryResponse(repairContent);
      validationResult = parseResult.ok
        ? validator.validateCandidateSet(parseResult.data.candidates, brief, { isAi: true })
        : { valid: false, errors: [parseResult.error] };
    }

    if (!validationResult.valid || !parseResult.ok) {
      return {
        ok: false,
        code: 'AI_FALLBACK_RECOMMENDED',
        error: 'AI 输出结构校验未通过: ' + validationResult.errors.join('; ')
      };
    }

    const candidates = parseResult.data.candidates;

    // 5. 二次聚合安全审核
    const auditText = collectCandidateTexts(candidates);
    const auditRes = await checkContent(auditText);
    if (!auditRes || !auditRes.ok) {
      return {
        ok: false,
        code: 'AI_FALLBACK_RECOMMENDED',
        error: 'AI 生成内容安全审核未通过'
      };
    }

    return {
      ok: true,
      source: 'ai',
      candidates: candidates
    };
  } catch (error) {
    return {
      ok: false,
      code: 'AI_FALLBACK_RECOMMENDED',
      error: (error && error.message) || 'AI 服务异常'
    };
  }
}

async function main(event, context) {
  return handlePlanStory(event);
}

module.exports = {
  main: main,
  handlePlanStory: handlePlanStory
};
