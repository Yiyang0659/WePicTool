const cloud = require('wx-server-sdk');
const axios = require('axios');

// 通过 wx-server-sdk 内建的 downloadFile 能力获取云存储文件 Buffer
async function downloadCloudFile(fileId) {
  const res = await cloud.downloadFile({
    fileID: fileId
  });
  return Buffer.from(res.fileContent, 'binary');
}

function bufferToBase64DataUrl(buffer, mimeType) {
  const base64 = buffer.toString('base64');
  return `data:${mimeType || 'image/jpeg'};base64,${base64}`;
}

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const PROCESSABLE_GROUPS = ['tops', 'bottoms', 'shoes'];
const OTHER_GROUP = 'others';

const GROUP_META = {
  tops: { itemLabel: '上衣' },
  bottoms: { itemLabel: '下装' },
  shoes: { itemLabel: '鞋子' },
  others: { itemLabel: '素材' }
};

const CLASSIFICATION_PROMPT = `你是一名穿搭商品分类助手。请判断这张图片中的主体物品属于哪个类别，只返回以下标签之一，并给出置信度：

可选标签：
- tops：上衣、T恤、衬衫、外套、卫衣、针织衫、POLO衫、背心等穿在上半身的衣物
- bottoms：裤子、牛仔裤、休闲裤、裙子、半身裙、短裤等穿在下半身的衣物
- shoes：鞋、运动鞋、皮鞋、靴子、凉鞋、高跟鞋等 footwear
- other_product：其他商品或小物件（如手表、手机、化妆品、食品等）
- daily：完整人物试穿图、真人上身照、生活场景照、合照、风景照
- unsupported：头像、包、帽子、腰带、项链、眼镜、围巾、手套等非穿搭主链路配饰
- uncertain：图片模糊、主体无法辨认、或无法归入以上任何类别

输出格式必须是纯 JSON，不要加 markdown 代码块，不要解释：
{"type":"tops","confidence":0.95}

判断规则：
1. 图片主体是一件单独的衣服或鞋子，即使挂在衣架上、平铺拍摄、或有人手持展示，也应归入 tops/bottoms/shoes，不要判为 daily 或 other_product。
2. 只有当图片中出现完整人物（能看到头+身体+穿着效果）时，才返回 daily。
3. 包、帽子、首饰、眼镜、围巾等配饰返回 unsupported。
4. 如果主体同时包含上衣和下装，以最清晰、最主要的主体为准。
5. 白色/浅色/深色衣物不影响类别判断。
6. 如果图片中文字、logo、背景复杂，仍以主体衣物为准。

示例：
- 一张白色T恤挂在衣架上的照片 → {"type":"tops","confidence":0.98}
- 一条牛仔裤平铺拍摄 → {"type":"bottoms","confidence":0.97}
- 一双运动鞋摆在白底上 → {"type":"shoes","confidence":0.98}
- 一个人穿着整套衣服照镜子 → {"type":"daily","confidence":0.95}
- 一个皮包特写 → {"type":"unsupported","confidence":0.96}`;

function createEmptyGroups() {
  return {
    tops: [],
    bottoms: [],
    shoes: [],
    others: []
  };
}

function getMockCategory(index) {
  if (index < 3) return 'tops';
  if (index < 6) return 'bottoms';
  if (index < 9) return 'shoes';
  return OTHER_GROUP;
}

function normalizeGroupKey(groupKey) {
  if (!groupKey) return OTHER_GROUP;
  if (groupKey === 'unprocessed') return OTHER_GROUP;
  if (PROCESSABLE_GROUPS.indexOf(groupKey) !== -1) return groupKey;
  if (groupKey === OTHER_GROUP) return OTHER_GROUP;
  return OTHER_GROUP;
}

function normalizeImageInput(image, index) {
  if (typeof image === 'string') {
    return {
      imageId: `image_${index + 1}`,
      fileId: image.indexOf('cloud://') === 0 ? image : '',
      url: image,
      width: 0,
      height: 0,
      size: 0
    };
  }

  const url = image.url || image.fileId || image.localPath || image.tempFilePath || image.path || '';

  return {
    imageId: image.imageId || `image_${index + 1}`,
    fileId: image.fileId || (url.indexOf('cloud://') === 0 ? url : ''),
    url,
    width: image.width || 0,
    height: image.height || 0,
    size: image.size || 0
  };
}

function labelGroupItems(groups) {
  Object.keys(groups).forEach((groupKey) => {
    const meta = GROUP_META[groupKey] || GROUP_META[OTHER_GROUP];
    groups[groupKey].forEach((item, index) => {
      item.order = index + 1;
      item.label = `${meta.itemLabel} ${index + 1}`;
    });
  });

  return groups;
}

function buildSendability(groups) {
  const threshold = 3;
  const perGroup = {};
  let totalProcessableCount = 0;
  let filledProcessableGroupCount = 0;
  let stackableGroupCount = 0;

  PROCESSABLE_GROUPS.forEach((groupKey) => {
    const count = (groups[groupKey] || []).length;
    totalProcessableCount += count;

    if (count > 0) {
      filledProcessableGroupCount += 1;
    }

    if (count >= threshold) {
      stackableGroupCount += 1;
      perGroup[groupKey] = {
        count,
        mode: 'stackable',
        message: '可形成微信叠图效果'
      };
      return;
    }

    if (count > 0) {
      perGroup[groupKey] = {
        count,
        mode: 'normal',
        message: '可保存，但可能按普通图片展示'
      };
      return;
    }

    perGroup[groupKey] = {
      count,
      mode: 'empty',
      message: '暂无素材'
    };
  });

  const allFilledGroupsBelowThreshold =
    totalProcessableCount >= threshold &&
    filledProcessableGroupCount > 0 &&
    stackableGroupCount === 0;

  return {
    threshold,
    groups: perGroup,
    summary: {
      totalProcessableCount,
      hasStackableGroup: stackableGroupCount > 0,
      allFilledGroupsBelowThreshold,
      message: allFilledGroupsBelowThreshold
        ? '当前更适合普通发送；想要叠图效果，建议每组补到 3 张以上'
        : ''
    }
  };
}

function parseClassificationResponse(text) {
  try {
    const cleaned = (text || '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/g, '')
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : cleaned;
    const parsed = JSON.parse(jsonText);

    if (parsed && parsed.type && typeof parsed.confidence === 'number') {
      return {
        type: normalizeGroupKey(parsed.type),
        confidence: parsed.confidence
      };
    }
  } catch (err) {
    console.error('分类响应解析失败:', err, text);
  }

  return { type: OTHER_GROUP, confidence: 0 };
}

function extractDashScopeText(responseData) {
  const output = responseData && responseData.output;
  const choices = output && output.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('DashScope 返回结构异常');
  }

  const message = choices[0].message;
  const content = message && message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content) && content.length > 0) {
    const textItem = content.find(item => item && typeof item.text === 'string');
    if (textItem) {
      return textItem.text;
    }
  }

  throw new Error('DashScope 返回内容不是文本');
}

async function classifyImageWithDashScope(imageInput, apiKey) {
  const response = await axios.post(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    {
      model: 'qwen-vl-plus',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: imageInput },
              { text: CLASSIFICATION_PROMPT }
            ]
          }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  const text = extractDashScopeText(response.data);
  return parseClassificationResponse(text);
}

// ===== 阶段三：抠图 =====
// 注意：白底卡片合成在前端通过 Canvas 完成，云函数只负责抠图

const MATTING_PROMPT = '对这张图片进行抠图，去除原背景，将背景替换为纯白色，保留主体的完整轮廓，确保边缘干净';

// 抠图模型：默认 wanx-v1（2026-07-19 起试用），可在云函数环境变量 DASHSCOPE_MATTING_MODEL 中覆盖
const MATTING_MODEL = process.env.DASHSCOPE_MATTING_MODEL || 'wanx-v1';

async function mattingImageWithDashScope(imageInput, apiKey) {
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`抠图第 ${attempt + 1} 次重试`);
        await new Promise(r => setTimeout(r, 1000));
      }

      const response = await axios.post(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        {
          model: MATTING_MODEL,
          input: {
            messages: [
              {
                role: 'user',
                content: [
                  { image: imageInput },
                  { text: MATTING_PROMPT }
                ]
              }
            ]
          }
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const output = response.data && response.data.output;
      const choices = output && output.choices;

      if (!Array.isArray(choices) || choices.length === 0) {
        throw new Error('抠图返回结构异常');
      }

      const message = choices[0].message;
      const content = message && message.content;

      if (Array.isArray(content) && content.length > 0) {
        const imageItem = content.find(item => item && item.image);
        if (imageItem) {
          return imageItem.image;
        }
      }

      throw new Error('抠图未返回图片');
    } catch (err) {
      console.error(`抠图${attempt > 0 ? '重试' : ''}失败:`, err.message);

      // 限流错误（429）等待更久再重试
      if (err.response && err.response.status === 429 && attempt < maxRetries) {
        console.log('抠图限流，等待 3 秒后重试...');
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      if (attempt >= maxRetries) {
        throw err;
      }
    }
  }
}

async function processMattingForImage(image, imageInput, apiKey) {
  console.log('开始抠图: ' + image.imageId);

  // 1. 调用抠图 API
  const resultImageUrl = await mattingImageWithDashScope(imageInput, apiKey);
  console.log('抠图完成: ' + image.imageId + ', 结果 URL: ' + resultImageUrl.substring(0, 80) + '...');

  // 2. 下载抠图结果图片
  const resultResponse = await axios.get(resultImageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  const mattedBuffer = Buffer.from(resultResponse.data, 'binary');
  console.log('抠图结果下载完成: ' + mattedBuffer.length + ' bytes');

  // 3. 上传抠图结果到云存储
  var timestamp = Date.now();
  var cloudPath = 'matted/' + timestamp + '_' + image.imageId + '.png';
  var uploadResult = await cloud.uploadFile({
    cloudPath: cloudPath,
    fileContent: mattedBuffer
  });
  console.log('抠图结果已上传: ' + uploadResult.fileID);

  return {
    mattedFileId: uploadResult.fileID,
    mattedUrl: uploadResult.fileID
  };
}

async function processMatting(images, classifications, apiKey, base64Cache) {
  const mattedResults = {};

  // 只对 tops/bottoms/shoes 且分类成功的图片做抠图
  const mattingTasks = [];
  for (let i = 0; i < images.length; i++) {
    const classification = classifications[i];
    if (classification && PROCESSABLE_GROUPS.indexOf(classification.category) !== -1 && !classification.error) {
      mattingTasks.push({ image: images[i], index: i });
    }
  }

  if (mattingTasks.length === 0) {
    console.log('没有需要抠图的图片');
    return mattedResults;
  }

  console.log(`需要抠图的图片: ${mattingTasks.length} 张`);

  // 分批并行抠图
  for (let batchStart = 0; batchStart < mattingTasks.length; batchStart += CONCURRENCY) {
    const batchEnd = Math.min(batchStart + CONCURRENCY, mattingTasks.length);
    const batch = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const task = mattingTasks[i];
      batch.push(
        (async () => {
          try {
            // 优先复用分类阶段缓存的 base64，避免重复下载云存储
            let imageInput;
            if (base64Cache && base64Cache.has(task.image.imageId)) {
              console.log('抠图复用分类阶段缓存: ' + task.image.imageId);
              imageInput = base64Cache.get(task.image.imageId);
            } else {
              console.log('抠图未命中缓存，重新下载: ' + task.image.imageId);
              imageInput = await downloadImageAsBase64(task.image);
            }
            const matted = await processMattingForImage(task.image, imageInput, apiKey);
            mattedResults[task.index] = matted;
          } catch (err) {
            console.error('图片 ' + task.image.imageId + ' 抠图失败:', err.message);
            mattedResults[task.index] = null;
          }
        })()
      );
    }

    await Promise.all(batch);
    console.log(`抠图进度: ${batchEnd}/${mattingTasks.length}`);
  }

  return mattedResults;
}

async function downloadImageAsBase64(image) {
  if (image.fileId && image.fileId.indexOf('cloud://') === 0) {
    console.log(`下载云存储文件: ${image.fileId}`);
    const buffer = await downloadCloudFile(image.fileId);
    console.log(`下载完成, 大小: ${buffer.length} bytes`);
    return bufferToBase64DataUrl(buffer, 'image/jpeg');
  }

  if (image.url && (image.url.indexOf('http://') === 0 || image.url.indexOf('https://') === 0)) {
    console.log(`下载网络图片: ${image.url}`);
    const response = await axios.get(image.url, { responseType: 'arraybuffer', timeout: 15000 });
    const buffer = Buffer.from(response.data, 'binary');
    return bufferToBase64DataUrl(buffer, response.headers['content-type'] || 'image/jpeg');
  }

  throw new Error('不支持的图片输入格式');
}

// 并发控制：最多同时处理 CONCURRENCY 张图片
const CONCURRENCY = 2;

async function classifySingleImage(image, index, apiKey, retryCount, base64Cache) {
  const maxRetries = retryCount || 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`第 ${index + 1} 张图片第 ${attempt + 1} 次重试`);
        await new Promise(r => setTimeout(r, 1000));
      }

      console.log(`第 ${index + 1} 张图片开始处理, fileId:`, image.fileId);
      const imageInput = await downloadImageAsBase64(image);
      console.log(`第 ${index + 1} 张图片已转为 base64, 长度:`, imageInput.length);

      // 缓存 base64 供抠图阶段复用，避免重复下载
      if (base64Cache) {
        base64Cache.set(image.imageId, imageInput);
      }

      const classification = await classifyImageWithDashScope(imageInput, apiKey);
      return {
        imageId: image.imageId,
        url: image.url,
        category: classification.type,
        confidence: classification.confidence,
        needsConfirmation: classification.confidence < 0.8,
        error: null
      };
    } catch (err) {
      console.error(`第 ${index + 1} 张图片分类${attempt > 0 ? '重试' : ''}失败:`, err.message);
      if (err.response) {
        console.error('DashScope 错误状态码:', err.response.status);
        console.error('DashScope 错误响应:', JSON.stringify(err.response.data));
      }

      // 限流错误（429）等待更久再重试
      if (err.response && err.response.status === 429 && attempt < maxRetries) {
        console.log(`限流，等待 3 秒后重试...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      // 非限流错误，不再重试
      if (attempt >= maxRetries) {
        return {
          imageId: image.imageId,
          url: image.url,
          category: OTHER_GROUP,
          confidence: 0,
          needsConfirmation: true,
          error: err.message
        };
      }
    }
  }
}

async function classifyImages(images, apiKey) {
  const results = new Array(images.length);
  // 分类阶段缓存每张图的 base64，供抠图阶段复用，避免重复下载云存储
  const base64Cache = new Map();

  // 分批并行处理，每批 CONCURRENCY 张
  for (let batchStart = 0; batchStart < images.length; batchStart += CONCURRENCY) {
    const batchEnd = Math.min(batchStart + CONCURRENCY, images.length);
    const batch = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batch.push(
        classifySingleImage(images[i], i, apiKey, 1, base64Cache).then(result => {
          results[i] = result;
        })
      );
    }

    await Promise.all(batch);
    console.log(`已处理 ${batchEnd}/${images.length} 张图片`);
  }

  return { classifications: results, base64Cache };
}

function createTaskFromClassifications(normalizedImages, classifications, useMockFallback, mattedResults) {
  const timestamp = Date.now();
  const groups = createEmptyGroups();

  const results = normalizedImages.map((image, index) => {
    const classification = classifications[index] || { category: OTHER_GROUP, confidence: 0, needsConfirmation: true };
    const category = useMockFallback
      ? getMockCategory(index)
      : normalizeGroupKey(classification.category);

    const matted = mattedResults && mattedResults[index];

    const result = {
      resultId: 'result_' + (index + 1),
      sourceImageId: image.imageId,
      category,
      classification: useMockFallback
        ? null
        : {
            type: classification.category,
            confidence: classification.confidence,
            needsConfirmation: classification.confidence < 0.8
          },
      type: matted ? 'matted' : 'original',
      status: 'done',
      localPath: '',
      fileId: matted ? matted.mattedFileId : image.fileId,
      url: matted ? matted.mattedUrl : image.url,
      mattedFileId: matted ? matted.mattedFileId : null,
      mattedUrl: matted ? matted.mattedUrl : null,
      originalFileId: image.fileId,
      originalUrl: image.url,
      matted: !!matted,
      width: image.width,
      height: image.height,
      size: image.size,
      error: classification.error || null
    };

    groups[category].push(result);
    return result;
  });

  labelGroupItems(groups);

  return {
    taskId: `task_${timestamp}`,
    mode: 'outfit',
    status: 'done',
    progress: 100,
    groups,
    results,
    sendability: buildSendability(groups),
    createdAt: timestamp,
    expiredAt: timestamp + 72 * 60 * 60 * 1000,
    error: null
  };
}

function createMockTask(images) {
  const timestamp = Date.now();
  const groups = createEmptyGroups();
  const normalizedImages = Array.isArray(images)
    ? images.slice(0, 9).map((image, index) => normalizeImageInput(image, index)).filter(image => image.url)
    : [];

  if (normalizedImages.length === 0) {
    return {
      taskId: `mock_${timestamp}`,
      mode: 'outfit',
      status: 'failed',
      progress: 0,
      groups,
      results: [],
      sendability: buildSendability(groups),
      createdAt: timestamp,
      expiredAt: timestamp + 72 * 60 * 60 * 1000,
      error: {
        code: 'NO_IMAGES',
        message: '没有收到图片'
      }
    };
  }

  return createTaskFromClassifications(normalizedImages, [], true, null);
}

exports.main = async (event) => {
  try {
    const images = Array.isArray(event.images) ? event.images : [];
    const apiKey = process.env.DASHSCOPE_API_KEY || '';

    console.log('收到处理图片列表:', images.length, '张');
    console.log('DASHSCOPE_API_KEY 是否配置:', apiKey ? '已配置' : '未配置');

    const normalizedImages = images
      .slice(0, 9)
      .map((image, index) => normalizeImageInput(image, index))
      .filter(image => image.url);

    if (normalizedImages.length === 0) {
      return createMockTask([]);
    }

    // 未配置 API Key 时退回 mock 分组
    if (!apiKey) {
      console.log('未配置 DASHSCOPE_API_KEY，使用 mock 分组');
      return createMockTask(normalizedImages);
    }

    // 阶段二：接入 DashScope / 通义千问视觉模型做 AI 分类
    const { classifications, base64Cache } = await classifyImages(normalizedImages, apiKey);
    console.log('分类结果:', JSON.stringify(classifications));

    // 阶段三：对 tops/bottoms/shoes 做抠图（复用分类阶段缓存的 base64，避免重复下载）
    const mattedResults = await processMatting(normalizedImages, classifications, apiKey, base64Cache);
    console.log('抠图完成，成功数量:', Object.values(mattedResults).filter(Boolean).length);

    return createTaskFromClassifications(normalizedImages, classifications, false, mattedResults);
  } catch (err) {
    console.error('[processOutfit] unhandled error:', err);
    const images = Array.isArray(event.images) ? event.images : [];
    const mockTask = createMockTask(images);
    const timestamp = Date.now();
    return {
      taskId: `task_${timestamp}`,
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || '处理失败'
      },
      groups: mockTask.groups
    };
  }
};
