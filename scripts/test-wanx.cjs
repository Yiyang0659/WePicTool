/**
 * 本地测试：抠图模型连通性（默认 qwen-image-edit-plus）
 * 请求形态与云函数 processOutfit 的 mattingImageWithDashScope 完全一致
 * （multimodal-generation 端点 + 图片 base64 + 抠图提示词）。
 * 批量对比多个模型请用 scripts/test-matting-models.cjs
 *
 * 用法：
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/test-wanx.cjs [图片路径或URL]
 *   可用 DASHSCOPE_MATTING_MODEL=<模型名> 换模型
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = process.env.DASHSCOPE_API_KEY || '';
const MODEL = process.env.DASHSCOPE_MATTING_MODEL || 'qwen-image-edit-plus';
const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const MATTING_PROMPT = '对这张图片进行抠图，去除原背景，将背景替换为纯白色，保留主体的完整轮廓，确保边缘干净';

const IMAGE_PATH = process.argv[2] || '';

async function toBase64(input) {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const res = await axios.get(input, { responseType: 'arraybuffer', timeout: 30000 });
    const type = res.headers['content-type'] || 'image/jpeg';
    return `data:${type};base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
  }
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) {
    console.error('文件不存在:', abs);
    process.exit(1);
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

async function main() {
  if (!API_KEY) {
    console.error('错误：请设置环境变量 DASHSCOPE_API_KEY');
    console.error('示例：DASHSCOPE_API_KEY=sk-xxx node scripts/test-wanx.cjs [图片路径或URL]');
    process.exit(1);
  }

  const imageInput = IMAGE_PATH
    ? await toBase64(IMAGE_PATH)
    : await toBase64('https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80');

  console.log(`模型: ${MODEL}`);
  console.log(`端点: ${ENDPOINT}`);
  console.log('正在发送抠图请求（与云函数一致）...\n');

  try {
    const response = await axios.post(
      ENDPOINT,
      {
        model: MODEL,
        input: {
          messages: [
            { role: 'user', content: [{ image: imageInput }, { text: MATTING_PROMPT }] }
          ]
        }
      },
      {
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    console.log('✅ 请求成功，状态码:', response.status);
    const output = response.data && response.data.output;
    const choices = output && output.choices;
    const content = choices && choices[0] && choices[0].message && choices[0].message.content;
    const imageItem = Array.isArray(content) ? content.find(i => i && i.image) : null;
    if (imageItem) {
      console.log('✅ 返回了结果图片 URL（前 100 字符）:', String(imageItem.image).substring(0, 100));
      console.log(`→ ${MODEL} 可按当前云函数请求形态正常出图`);
    } else {
      console.log('⚠️ 请求成功但未返回图片，完整响应：');
      console.log(JSON.stringify(response.data, null, 2));
    }
  } catch (err) {
    console.error('❌ 请求失败');
    if (err.response) {
      console.error('状态码:', err.response.status);
      console.error('响应:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('错误:', err.message);
    }
    process.exit(1);
  }
}

main();
