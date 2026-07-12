const axios = require('axios');

const API_KEY = process.env.DASHSCOPE_API_KEY || '';
const MODEL = process.env.DASHSCOPE_MODEL || 'qwen3.7-plus';

const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80';

const CLASSIFICATION_PROMPT = `判断这张图片最适合归入哪个穿搭素材类别，只返回以下标签之一：

- tops：上衣、外套、衬衫、T恤、针织衫
- bottoms：裤子、裙子、短裤
- shoes：鞋
- other_product：其他商品或小物件
- daily：完整人物试穿图、合照、风景、场景图
- unsupported：头像、包、帽子、腰带、项链、眼镜等非 MVP 支持素材
- uncertain：无法判断

同时返回 0-1 的置信度。格式：
{"type":"tops","confidence":0.92}

约束：
1. 只返回 JSON，不要返回解释。
2. 完整人物试穿图必须返回 daily。
3. 包、帽子、项链、眼镜、头像等素材必须返回 unsupported 或 uncertain。
4. 如果图片中同时包含多件衣服，以最清晰、最主要的主体为准。`;

async function testDashScope() {
  if (!API_KEY) {
    console.error('错误：请设置环境变量 DASHSCOPE_API_KEY');
    console.error('示例：DASHSCOPE_API_KEY=sk-xxx node scripts/test-dashscope.cjs');
    process.exit(1);
  }

  console.log(`测试模型: ${MODEL}`);
  console.log(`测试图片: ${TEST_IMAGE_URL}`);
  console.log('正在发送请求...\n');

  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      {
        model: MODEL,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { image: TEST_IMAGE_URL },
                { text: CLASSIFICATION_PROMPT }
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data.output?.choices?.[0]?.message?.content?.[0]?.text || '';
    let classification = null;
    let parseError = null;

    try {
      const cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*$/g, '')
        .trim();
      classification = JSON.parse(cleaned);
    } catch (err) {
      parseError = err.message;
    }

    console.log('✅ 请求成功');
    console.log('状态码:', response.status);
    console.log('\n原始文本:');
    console.log(content);

    if (classification) {
      console.log('\n解析结果:');
      console.log(JSON.stringify(classification, null, 2));
    } else {
      console.error('\n⚠️ JSON 解析失败:', parseError);
    }

    console.log('\n完整响应:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('❌ 请求失败');

    if (err.response) {
      console.error('状态码:', err.response.status);
      console.error('响应头:', JSON.stringify(err.response.headers, null, 2));
      console.error('响应体:', JSON.stringify(err.response.data, null, 2));

      if (err.response.status === 404) {
        console.error('\n提示：模型名称可能不正确，请检查 DashScope 文档确认可用的视觉模型名称。');
      } else if (err.response.status === 401 || err.response.status === 403) {
        console.error('\n提示：API Key 无效或没有权限，请检查 DASHSCOPE_API_KEY。');
      }
    } else if (err.request) {
      console.error('没有收到响应，可能是网络问题:', err.message);
    } else {
      console.error('请求出错:', err.message);
    }

    process.exit(1);
  }
}

testDashScope();
