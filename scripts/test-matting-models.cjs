/**
 * 本地批量测试：哪些抠图模型能用
 * 请求形态与云函数 processOutfit 的 mattingImageWithDashScope 完全一致
 * （multimodal-generation 端点 + 图片 base64 + 抠图提示词）。
 *
 * 用法：
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/test-matting-models.cjs [图片路径或URL]
 *   可用 DASHSCOPE_MATTING_MODELS="qwen-image-edit,qwen-image-edit-plus" 覆盖候选列表
 *
 * 行为：
 *   - 逐个模型发送同一请求，记录成功/失败与错误详情
 *   - 成功模型的结果图下载到 scripts/.matting-test-out/ 供目检
 *   - 最后输出汇总表
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = process.env.DASHSCOPE_API_KEY || '';
const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const MATTING_PROMPT = '对这张图片进行抠图，去除原背景，将背景替换为纯白色，保留主体的完整轮廓，确保边缘干净';

// 候选模型：与百炼免费额度页面对齐（2026-07-19）
const DEFAULT_MODELS = [
  'qwen-image-edit',          // 当前云函数默认值，剩 99/100
  'qwen-image-edit-plus',     // 剩 100/100
  'qwen-image-2.0-pro',       // 剩 98/100
  'qwen-image-2.0',           // 剩 10/100（历史默认，额度告急）
  'qwen-image-edit-plus-2025-11-25' // 快照版，剩 100/100
];
const MODELS = (process.env.DASHSCOPE_MATTING_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
const CANDIDATES = MODELS.length > 0 ? MODELS : DEFAULT_MODELS;

const OUT_DIR = path.join(__dirname, '.matting-test-out');
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

async function testModel(model, imageInput) {
  const startedAt = Date.now();
  try {
    const response = await axios.post(
      ENDPOINT,
      {
        model,
        input: {
          messages: [
            { role: 'user', content: [{ image: imageInput }, { text: MATTING_PROMPT }] }
          ]
        }
      },
      {
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 120000
      }
    );

    const output = response.data && response.data.output;
    const choices = output && output.choices;
    const content = choices && choices[0] && choices[0].message && choices[0].message.content;
    const imageItem = Array.isArray(content) ? content.find(i => i && i.image) : null;

    if (!imageItem) {
      return { model, ok: false, ms: Date.now() - startedAt, error: '请求成功但未返回图片: ' + JSON.stringify(response.data).substring(0, 300) };
    }

    // 下载结果图目检
    let savedTo = '';
    try {
      const imgRes = await axios.get(imageItem.image, { responseType: 'arraybuffer', timeout: 30000 });
      const file = path.join(OUT_DIR, model.replace(/[^a-zA-Z0-9.-]/g, '_') + '.png');
      fs.writeFileSync(file, Buffer.from(imgRes.data, 'binary'));
      savedTo = file;
    } catch (dlErr) {
      savedTo = '(下载失败: ' + dlErr.message + ')';
    }

    return { model, ok: true, ms: Date.now() - startedAt, url: imageItem.image, savedTo };
  } catch (err) {
    let detail = err.message;
    if (err.response) {
      detail = `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 300)}`;
    }
    return { model, ok: false, ms: Date.now() - startedAt, error: detail };
  }
}

async function main() {
  if (!API_KEY) {
    console.error('错误：请设置环境变量 DASHSCOPE_API_KEY');
    console.error('示例：DASHSCOPE_API_KEY=sk-xxx node scripts/test-matting-models.cjs [图片路径或URL]');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const imageInput = IMAGE_PATH
    ? await toBase64(IMAGE_PATH)
    : await toBase64('https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80');

  console.log(`端点: ${ENDPOINT}`);
  console.log(`候选模型: ${CANDIDATES.join(', ')}\n`);

  const results = [];
  for (const model of CANDIDATES) {
    console.log(`--- 测试 ${model} ...`);
    const r = await testModel(model, imageInput);
    results.push(r);
    console.log(r.ok ? `    ✅ 成功 (${r.ms}ms)，结果已存: ${r.savedTo}` : `    ❌ 失败 (${r.ms}ms): ${r.error}`);
  }

  console.log('\n===== 汇总 =====');
  results.forEach(r => {
    console.log(`${r.ok ? '✅' : '❌'} ${r.model} (${r.ms}ms)${r.ok ? '' : '  -- ' + r.error}`);
  });
  const okModels = results.filter(r => r.ok).map(r => r.model);
  console.log('\n可用模型:', okModels.length > 0 ? okModels.join(', ') : '（无）');
  if (okModels.length > 0) {
    console.log(`结果图目录: ${OUT_DIR}（请目检抠图质量）`);
  }
}

main();
