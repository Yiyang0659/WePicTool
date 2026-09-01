// miniprogram/utils/storyPrompt.js
// 趣味字画 P2.2 AI 故事规划 Prompt 工程与结构化 JSON 解析器

const SYSTEM_PROMPT = `你是一个专业的微信聊天「叠图故事编排专家」。
用户的核心场景是：把一段简短的聊天文字（1~40字），编排成一叠（3~8张）适合在微信聊天合并发送的趣味滑动卡片。

【微信叠图物理特性】
1. 第 1 张卡片是封面（hook），微信聊天窗口里会露出一角或整卡，必须有好奇心、悬念或制造反差，吸引对方往右滑动。
2. 中间卡片（misdirect / build / pause）负责推进故事节奏、制造轻微误导、铺垫停顿（留白或短词……）。
3. 末尾卡片（reveal / ending）负责揭晓真相或反转落点（必须保留用户原话的核心真实诉求或反转），并收尾。

【卡片角色角色定义（Role）】
- hook: 封面悬念，制造吸引力，让对方想右滑
- build: 信息递进、补充铺垫
- misdirect: 制造可爱误导或假动作
- pause: 短词/省略号/留白停顿（如 "……"、"等一下"）
- reveal: 核心真相揭晓（必须完整表达用户原意或最终反转）
- ending: 表情/可爱短语收尾（可选）

【输出格式要求】
你必须且只能输出合法的 JSON 格式，严禁添加任何 Markdown 解释文字或代码块外部的前后缀。
JSON 格式示例如下：
{
  "candidates": [
    {
      "candidateId": "candidate_a",
      "strategyId": "hard_turn",
      "title": "嘴硬一下",
      "preservedMeaning": "今天想见对方",
      "cards": [
        { "order": 1, "role": "hook", "text": "我今天" },
        { "order": 2, "role": "misdirect", "text": "不太想" },
        { "order": 3, "role": "build", "text": "见你" },
        { "order": 4, "role": "pause", "text": "……" },
        { "order": 5, "role": "reveal", "text": "才怪，现在就想见" }
      ]
    }
  ]
}

【硬性约束规则】
1. 必须一次性生成 3 套不同的候选方案（candidates 数组长度必须为 3）。
2. 每套方案对应指定的 strategyId，3 套 strategyId 互不相同。
3. 每套候选卡片数量在 3~8 张之间，单张普通卡文字 ≤12 字，reveal 卡 ≤40 字。
4. 语言风格符合中文网感聊天，自然、搞怪、可爱、有反差感，严禁任何违法、敏感或低俗内容。`;

function buildStoryPrompt(creativeBrief, selectedStrategies) {
  const brief = creativeBrief || {};
  const sourceText = brief.sourceText || '';
  const expressionKey = brief.expressionKey || 'random-fun';
  const strategiesList = Array.isArray(selectedStrategies) ? selectedStrategies : [];

  const strategyDescriptions = strategiesList.map(function (s, index) {
    const sId = typeof s === 'string' ? s : (s && s.id);
    const letter = index === 0 ? 'a' : (index === 1 ? 'b' : 'c');
    return `方案 ${letter.toUpperCase()} (strategyId: "${sId}", candidateId: "candidate_${letter}")`;
  }).join('\n');

  const userPrompt = `用户原话：“${sourceText}”
用户选择的表达感觉：${expressionKey}
请为以下 3 个指定的策略分别编排一套完整的叠图故事：
${strategyDescriptions}

要求：
1. 3 套方案必须分别对应上述 3 个 strategyId。
2. 方案必须紧扣原话“${sourceText}”，在 reveal 卡中完整保留或反转点明原意。
3. 严格输出包含 3 套方案的 JSON 数据。`;

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: userPrompt
  };
}

function parseStoryResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { ok: false, error: '返回内容为空' };
  }

  let text = rawText.trim();
  // 提取 Markdown 代码块 ```json ... ```
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    text = match[1].trim();
  }

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !Array.isArray(data.candidates)) {
      return { ok: false, error: 'JSON 缺少 candidates 数组' };
    }
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'JSON 解析失败' };
  }
}

module.exports = {
  SYSTEM_PROMPT: SYSTEM_PROMPT,
  buildStoryPrompt: buildStoryPrompt,
  parseStoryResponse: parseStoryResponse
};
