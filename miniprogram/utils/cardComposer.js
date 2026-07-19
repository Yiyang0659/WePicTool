// miniprogram/utils/cardComposer.js
// 前端 Canvas 白底卡片合成工具
// 约束：
// - CloudBase 云函数不支持 sharp 等原生 C++ 模块，合成必须在前端完成
// - 输出 jpg 格式（白底卡片无透明需求，jpg 体积更小）
// - 支持 1:1 / 4:5 / 3:4 三种比例
// - 按组使用视觉锚点：上衣偏中上、下装偏中下、鞋子居中偏下
// - 浅色 / 白色衣物自动加轻阴影和细描边兜底

const PROCESSABLE_GROUPS = ['tops', 'bottoms', 'shoes'];

const RATIO_MAP = {
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4
};

const GROUP_ANCHOR = {
  tops: { yOffset: -0.04, scale: 0.82 },
  bottoms: { yOffset: 0.04, scale: 0.82 },
  shoes: { yOffset: 0.08, scale: 0.75 },
  default: { yOffset: 0, scale: 0.82 }
};

const DEFAULT_OPTIONS = {
  ratio: '1:1',
  background: '#FFFFFF',
  enhanceLightColor: true,
  shadowColor: 'rgba(0, 0, 0, 0.10)',
  shadowBlur: 16,
  shadowOffsetY: 6,
  strokeColor: 'rgba(0, 0, 0, 0.06)',
  strokeWidth: 2,
  // 白底卡片无透明需求，用 jpg 减小体积；outputQuality 仅对 jpg 有效，png 会忽略该参数
  outputFormat: 'jpg',
  outputQuality: 0.92,
  canvasSize: 1024,
  isMatted: false
};

function parseRatio(ratio) {
  return RATIO_MAP[ratio] || RATIO_MAP['1:1'];
}

function getAnchor(category) {
  return GROUP_ANCHOR[category] || GROUP_ANCHOR.default;
}

// 下载网络/cloud 图片到本地临时路径
function downloadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('图片地址为空'));
      return;
    }

    if (src.startsWith('cloud://')) {
      if (!wx.cloud) {
        reject(new Error('当前环境不支持云文件下载'));
        return;
      }
      wx.cloud.downloadFile({
        fileID: src,
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err)
      });
      return;
    }

    if (/^https?:\/\//.test(src)) {
      wx.downloadFile({
        url: src,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.tempFilePath);
          } else {
            reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          }
        },
        fail: (err) => reject(err)
      });
      return;
    }

    // 本地路径直接返回
    resolve(src);
  });
}

// 获取图片信息（宽高）
function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: (res) => resolve({ width: res.width, height: res.height, path: res.path }),
      fail: (err) => reject(err)
    });
  });
}

// 计算主体在画布上的绘制参数
function calculateDrawParams(canvasWidth, canvasHeight, imgWidth, imgHeight, category) {
  const anchor = getAnchor(category);
  const targetScaleBase = anchor.scale;

  const canvasAspect = canvasWidth / canvasHeight;
  const imgAspect = imgWidth / imgHeight;

  let drawWidth;
  let drawHeight;

  // 让主体最长边占画布对应边的 targetScaleBase
  if (imgAspect > canvasAspect) {
    drawWidth = canvasWidth * targetScaleBase;
    drawHeight = drawWidth / imgAspect;
  } else {
    drawHeight = canvasHeight * targetScaleBase;
    drawWidth = drawHeight * imgAspect;
  }

  // y 方向锚点偏移：正数向下，负数向上
  const yOffset = canvasHeight * anchor.yOffset;
  const x = (canvasWidth - drawWidth) / 2;
  const y = (canvasHeight - drawHeight) / 2 + yOffset;

  return { x, y, width: drawWidth, height: drawHeight };
}

// 使用传入的页面 canvas 实例合成
function composeWithPageCanvas(canvas, options) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('无法获取 canvas 2d 上下文'));
  }

  const {
    sourceUrl,
    category,
    ratio,
    background,
    enhanceLightColor,
    shadowColor,
    shadowBlur,
    shadowOffsetY,
    strokeColor,
    strokeWidth,
    outputFormat,
    outputQuality,
    canvasSize,
    isMatted
  } = Object.assign({}, DEFAULT_OPTIONS, options);

  const aspect = parseRatio(ratio);
  const width = canvasSize;
  const height = Math.round(canvasSize / aspect);

  // 高清屏下 canvas 实际像素需要与样式尺寸匹配
  canvas.width = width;
  canvas.height = height;

  const source = sourceUrl || options.url;

  return downloadImage(source)
    .then(getImageInfo)
    .then((imageInfo) => {
      const img = canvas.createImage();

      return new Promise((resolve, reject) => {
        img.onload = () => {
          // 1. 填充背景
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, width, height);

          // 2. 计算绘制参数
          const params = calculateDrawParams(width, height, imageInfo.width, imageInfo.height, category);

          // 3. 高质量缩放：大图缩小到 1024px 时保留纹理细节
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // 4. 可选：轻阴影 + 细描边，增强浅色衣物可见性
          if (enhanceLightColor) {
            ctx.save();
            ctx.shadowColor = shadowColor;
            // 抠图 PNG 的矩形阴影更明显，减小 blur 半径
            ctx.shadowBlur = isMatted ? 8 : shadowBlur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = shadowOffsetY;
          }

          // 5. 绘制主体
          ctx.drawImage(img, params.x, params.y, params.width, params.height);

          if (enhanceLightColor) {
            ctx.restore();

            // 抠图 PNG 跳过矩形描边（透明背景上矩形框非常明显）
            if (!isMatted) {
              // 细描边：在主体边缘绘制半透细线
              ctx.save();
              ctx.strokeStyle = strokeColor;
              ctx.lineWidth = strokeWidth;
              ctx.strokeRect(params.x, params.y, params.width, params.height);
              ctx.restore();
            }
          }

          // 6. 导出临时文件
          wx.canvasToTempFilePath({
            canvas,
            fileType: outputFormat,
            quality: outputQuality,
            success: (res) => {
              resolve({
                tempFilePath: res.tempFilePath,
                width,
                height,
                ratio,
                category
              });
            },
            fail: (err) => reject(err)
          });
        };

        img.onerror = (err) => reject(err || new Error('图片加载失败'));
        img.src = imageInfo.path;
      });
    });
}

// 主入口：优先使用页面 canvas，没有则尝试离屏 canvas
function composeCard(canvas, options) {
  if (!canvas) {
    return Promise.reject(new Error('canvas 实例不能为空'));
  }

  // 传入的 canvas 如果是离屏 canvas（有 getContext）也支持
  if (canvas.getContext) {
    return composeWithPageCanvas(canvas, options);
  }

  return Promise.reject(new Error('canvas 实例无效'));
}

module.exports = {
  RATIO_MAP,
  PROCESSABLE_GROUPS,
  GROUP_ANCHOR,
  DEFAULT_OPTIONS,
  composeCard,
  downloadImage,
  getImageInfo,
  parseRatio,
  getAnchor
};
