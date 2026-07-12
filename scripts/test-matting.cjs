const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = process.env.DASHSCOPE_API_KEY || '';
const MODEL = process.env.DASHSCOPE_MODEL || 'qwen-image-2.0';

const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/vision/image-segmentation/background-removal';

// 本地图片路径，可通过命令行参数指定
const IMAGE_PATH = process.argv[2] || '';

async function downloadImageAsBase64(imageUrl) {
  console.log('下载图片:', imageUrl);
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const buffer = Buffer.from(response.data, 'binary');
  const contentType = response.headers['content-type'] || 'image/jpeg';
  console.log('图片大小:', buffer.length, 'bytes, 类型:', contentType);
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function fileToBase64(filePath) {
  console.log('读取本地文件:', filePath);
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };
  const contentType = mimeMap[ext] || 'image/jpeg';
  console.log('文件大小:', buffer.length, 'bytes, 类型:', contentType);
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function testBackgroundRemoval(imageInput) {
  if (!API_KEY) {
    console.error('错误：请设置环境变量 DASHSCOPE_API_KEY');
    console.error('示例：DASHSCOPE_API_KEY=sk-xxx node scripts/test-matting.cjs [图片路径或URL]');
    process.exit(1);
  }

  console.log(`\n模型: ${MODEL}`);
  console.log(`端点: ${ENDPOINT}`);
  console.log('正在发送抠图请求...\n');

  try {
    const response = await axios.post(
      ENDPOINT,
      {
        model: MODEL,
        input: {
          image_url: imageInput
        }
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    console.log('✅ 请求成功');
    console.log('状态码:', response.status);
    console.log('\n完整响应:');
    console.log(JSON.stringify(response.data, null, 2));

    // 如果返回了结果图片 URL，下载保存
    const output = response.data && response.data.output;
    if (output && output.results) {
      output.results.forEach((result, index) => {
        if (result.url) {
          console.log(`\n结果图片 ${index + 1} URL: ${result.url}`);
          console.log('可直接在浏览器打开查看抠图效果');
        }
      });
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

async function main() {
  let imageInput;

  if (IMAGE_PATH) {
    if (IMAGE_PATH.startsWith('http://') || IMAGE_PATH.startsWith('https://')) {
      imageInput = await downloadImageAsBase64(IMAGE_PATH);
    } else {
      const absPath = path.resolve(IMAGE_PATH);
      if (!fs.existsSync(absPath)) {
        console.error('文件不存在:', absPath);
        process.exit(1);
      }
      imageInput = await fileToBase64(absPath);
    }
  } else {
    // 默认使用一张测试图片
    console.log('未指定图片，使用默认测试图片（白色T恤）');
    imageInput = await downloadImageAsBase64('https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80');
  }

  await testBackgroundRemoval(imageInput);
}

main();
