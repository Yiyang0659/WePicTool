// pages/index/index.js
const { createMockTask, isCloudPermissionError } = require('../../utils/task');

// 确认页输出比例选项（与结果页 RATIO_OPTIONS 保持一致）
const CONFIRM_RATIO_OPTIONS = [
  { key: '1:1', label: '1:1' },
  { key: '4:5', label: '4:5' },
  { key: '3:4', label: '3:4' }
];

// 「用示例试一叠」包内示例素材清单。
// 顺序硬约束：3 张上衣 → 3 张下装 → 3 张鞋，
// 与 utils/task.js 的 getMockCategory 索引分组（0-2 tops、3-5 bottoms、6-8 shoes）对齐，
// 保证示例结果页三组全满、都有「适合微信叠图」绿标，演示效果最佳。
// width/height/size 为素材压缩后（≤80KB）的真实值，避免运行时再逐张探测。
const SAMPLE_FILES = [
  { name: 'top1.jpg', width: 640, height: 640, size: 25560 },
  { name: 'top2.jpg', width: 640, height: 800, size: 40013 },
  { name: 'top3.jpg', width: 640, height: 959, size: 39076 },
  { name: 'bottom1.jpg', width: 640, height: 512, size: 20671 },
  { name: 'bottom2.jpg', width: 640, height: 960, size: 26672 },
  { name: 'bottom3.jpg', width: 640, height: 427, size: 33402 },
  { name: 'shoe1.jpg', width: 640, height: 457, size: 43925 },
  { name: 'shoe2.jpg', width: 640, height: 800, size: 23610 },
  { name: 'shoe3.jpg', width: 640, height: 640, size: 18615 }
];

// 首屏「朋友视角」演示卡轮播内容：直接复用包内示例图前 4 张（含上/下/鞋三类）
const DEMO_SLIDES = [
  { src: '/assets/samples/top1.jpg', num: '01' },
  { src: '/assets/samples/bottom1.jpg', num: '02' },
  { src: '/assets/samples/shoe1.jpg', num: '03' },
  { src: '/assets/samples/top2.jpg', num: '04' }
];

Page({
  data: {
    loading: false,
    loadingText: '开始处理...',
    // 步骤状态：home = 选图入口；confirm = 处理前确认（缩略图 + 比例）
    step: 'home',
    pickedImages: [],
    confirmRatio: '4:5',
    ratioOptions: CONFIRM_RATIO_OPTIONS,
    // 首屏「朋友视角」仿真演示卡的轮播数据
    demoSlides: DEMO_SLIDES,
    // 玩法模板（即将上线）：数据驱动渲染，点击统一走 onComingSoon
    comingModules: [
      { key: 'bigtext', name: '大字滑卡', emoji: '🔤', desc: '一张一个大字，滑出惊喜' },
      { key: 'drama', name: '剧情滑卡', emoji: '🎬', desc: '多图连播，讲出你的剧情' },
      { key: 'blindbox', name: '盲盒抽卡', emoji: '🎁', desc: '抽到哪张看哪张，惊喜拉满' },
      { key: 'puzzle', name: '拼图揭秘', emoji: '🧩', desc: '一块一块，拼出完整答案' },
      { key: 'flipbook', name: '翻页动画', emoji: '🎞️', desc: '多图连翻，让照片动起来' },
      { key: 'suit', name: '成套搭配', emoji: '🧥', desc: '一整套穿搭，一图看懂' },
      { key: 'dressup', name: '滑滑换装', emoji: '👠', desc: '左右滑一滑，换装挑不停' }
    ]
  },

  // 即将上线模块统一提示
  onComingSoon: function () {
    wx.showToast({ title: '敬请期待，即将上线', icon: 'none' });
  },

  // 选择穿搭图片：先进入确认环节，不直接上传
  onChooseMedia: function () {
    const that = this;
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        const tempFiles = res.tempFiles;
        if (tempFiles.length === 0) return;

        that.setData({
          step: 'confirm',
          pickedImages: tempFiles
        });
      },
      fail: function (err) {
        console.log('选择图片失败:', err);
      }
    });
  },

  // 确认页：选择输出比例（只影响白底卡片合成，不影响抠图）
  onSelectConfirmRatio: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.confirmRatio) return;
    this.setData({ confirmRatio: key });
  },

  // 确认页：继续添加图片（追加到已选列表，总数不超过 9 张）
  onAddMedia: function () {
    const that = this;
    const remain = 9 - this.data.pickedImages.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多选择 9 张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        const tempFiles = res.tempFiles;
        if (!tempFiles || tempFiles.length === 0) return;
        that.setData({
          pickedImages: that.data.pickedImages.concat(tempFiles)
        });
      },
      fail: function (err) {
        console.log('添加图片失败:', err);
      }
    });
  },

  // 确认页：移除单张已选图片
  onRemoveImage: function (e) {
    const index = e.currentTarget.dataset.index;
    if (index === undefined || index === null) return;
    const pickedImages = this.data.pickedImages.slice();
    pickedImages.splice(Number(index), 1);
    // 删空则回退到首页步骤
    if (pickedImages.length === 0) {
      this.setData({ step: 'home', pickedImages: [] });
      return;
    }
    this.setData({ pickedImages: pickedImages });
  },

  // 确认页：返回重新选择图片
  onBackToHome: function () {
    this.setData({ step: 'home', pickedImages: [] });
  },

  // 确认页：开始处理，走既有上传/AI 分类/抠图链路
  onStartProcess: function () {
    const tempFiles = this.data.pickedImages;
    if (!tempFiles || tempFiles.length === 0) return;

    this.setData({
      loading: true,
      loadingText: '正在压缩图片...'
    });

    // 开始对所有选择的图片进行本地压缩
    this.compressAndUploadImages(tempFiles);
  },

  // 压缩并上传所有图片
  compressAndUploadImages: async function (tempFiles) {
    const app = getApp();
    const useLocalMock = app.globalData && app.globalData.localMock;

    if (useLocalMock) {
      this.createLocalPreviewTask(tempFiles);
      return;
    }

    if (!wx.cloud || !(app.globalData && app.globalData.cloudReady)) {
      this.setData({ loading: false });
      wx.showModal({
        title: '需要配置云开发',
        content: '请先在 miniprogram/config/env.js 中填写 CloudBase 云环境 ID，并在开发者工具中部署 processOutfit 云函数。',
        showCancel: false
      });
      return;
    }

    const uploadTasks = [];
    
    for (let i = 0; i < tempFiles.length; i++) {
      const file = tempFiles[i];
      this.setData({
        loadingText: `压缩第 ${i + 1}/${tempFiles.length} 张图片...`
      });

      try {
        // 1. 基础压缩 (最长边不超过 1600px)
        const compressedPath = await this.compressImage(file.tempFilePath);
        
        this.setData({
          loadingText: `上传第 ${i + 1}/${tempFiles.length} 张...`
        });

        // 2. 上传到 CloudBase 云存储
        const uploadResult = await this.uploadToCloudBase(compressedPath, i);
        uploadTasks.push({
          fileId: uploadResult.fileID,
          sourcePath: file.tempFilePath
        });
      } catch (err) {
        console.error(`处理第 ${i + 1} 张图片出错:`, err);
        // 单张失败不能影响其他图片，这里记录失败并继续
        uploadTasks.push({
          fileId: null,
          sourcePath: file.tempFilePath,
          error: true
        });
      }
    }

    // 过滤掉完全失败的图片 ID，但保留成功的部分
    const validImages = uploadTasks.filter(item => !item.error && item.fileId);

    if (validImages.length === 0) {
      this.setData({ loading: false });
      wx.showModal({
        title: '处理失败',
        content: '所有图片上传均失败，请检查网络后重试。',
        showCancel: false
      });
      return;
    }

    this.setData({
      loadingText: '创建分组处理任务...'
    });

    // 3. 调用云函数创建任务
    this.createProcessingTask(validImages);
  },

  // 模拟/原生本地图片压缩 (最长边不超过 1600px)
  compressImage: function (tempFilePath) {
    return new Promise((resolve, reject) => {
      // 获取图片原始大小
      wx.getImageInfo({
        src: tempFilePath,
        success: (res) => {
          const { width, height } = res;
          const maxSide = 1600;
          
          if (width <= maxSide && height <= maxSide) {
            // 无需压缩，直接返回原路径
            resolve(tempFilePath);
            return;
          }

          // 计算等比例缩放后的宽高
          let targetWidth = width;
          let targetHeight = height;
          if (width > height) {
            targetWidth = maxSide;
            targetHeight = Math.round((height * maxSide) / width);
          } else {
            targetHeight = maxSide;
            targetWidth = Math.round((width * maxSide) / height);
          }

          // 微信提供了 wx.compressImage API，可快速进行有损压缩
          wx.compressImage({
            src: tempFilePath,
            quality: 80,
            success: (compressRes) => {
              resolve(compressRes.tempFilePath);
            },
            fail: (compressErr) => {
              console.warn('wx.compressImage失败，降级使用原图:', compressErr);
              resolve(tempFilePath); // 降级处理
            }
          });
        },
        fail: (err) => {
          console.error('获取图片信息失败:', err);
          resolve(tempFilePath); // 降级返回
        }
      });
    });
  },

  // 上传至 CloudBase 云存储
  uploadToCloudBase: function (filePath, index) {
    const dotIndex = filePath.lastIndexOf('.');
    const suffix = dotIndex >= 0 ? filePath.substring(dotIndex).split('?')[0] : '.jpg';
    const cloudPath = `outfits/${Date.now()}_${index}${suffix || '.jpg'}`;
    
    return wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    });
  },

  // 调用云函数创建处理任务
  createProcessingTask: function (images) {
    const that = this;
    const imageCount = images.length;
    const taskImages = images.map((image, index) => ({
      imageId: `image_${index + 1}`,
      fileId: image.fileId,
      url: image.fileId,
      sourcePath: image.sourcePath || ''
    }));

    // 预估总耗时：分类（每张约 2-3 秒，并行 2 张）+ 抠图（每张约 3-5 秒，并行 2 张）
    const estimatedClassifySeconds = Math.ceil(imageCount / 2) * 3;
    const estimatedMattingSeconds = Math.ceil(imageCount / 2) * 4;
    const estimatedTotalSeconds = estimatedClassifySeconds + estimatedMattingSeconds;

    // 显示分类进度提示
    that.setData({
      loadingText: `AI 正在识别 ${imageCount} 张图片（约 ${estimatedTotalSeconds} 秒）...`
    });

    // 定时更新进度提示文字，让用户知道还在处理
    let dotCount = 0;
    const progressTimer = setInterval(function () {
      dotCount = (dotCount + 1) % 4;
      const dots = '.'.repeat(dotCount);
      that.setData({
        loadingText: `AI 正在识别 ${imageCount} 张图片${dots}`
      });
    }, 1500);

    wx.cloud.callFunction({
      name: 'processOutfit',
      data: {
        images: taskImages
      },
      success: function (res) {
        clearInterval(progressTimer);
        that.setData({ loading: false });

        if (res.result && res.result.taskId) {
          that.navigateToResult(res.result);
        } else {
          wx.showModal({
            title: '任务创建失败',
            content: '云服务未返回有效任务，请稍后重试。',
            showCancel: false
          });
        }
      },
      fail: function (err) {
        clearInterval(progressTimer);
        that.setData({ loading: false });
        console.error('调用云函数失败:', err);
        const content = isCloudPermissionError(err)
          ? '调用云函数失败，请确保已开通云开发、填写 CloudBase 环境 ID，并部署 processOutfit 云函数。'
          : '调用云函数失败，请检查网络或稍后重试。';
        wx.showModal({
          title: '系统出错',
          content: content,
          showCancel: false
        });
      }
    });
  },

  // 未配置云环境时，在开发者工具中直接用本地临时图片跑通页面闭环
  createLocalPreviewTask: function (tempFiles) {
    const images = tempFiles
      .map((file, index) => ({
        imageId: `local_image_${index + 1}`,
        localPath: file.tempFilePath,
        url: file.tempFilePath,
        width: file.width || 0,
        height: file.height || 0,
        size: file.size || 0
      }))
      .filter(item => item.url);

    if (images.length === 0) {
      this.setData({ loading: false });
      wx.showModal({
        title: '图片无效',
        content: '没有读取到有效图片，请重新选择。',
        showCancel: false
      });
      return;
    }

    this.setData({
      loadingText: '正在生成本地预览...'
    });

    const task = createMockTask(images);
    task.status = 'preview';
    task.localPreview = true;

    this.setData({ loading: false });
    wx.showToast({
      title: '本地预览模式',
      icon: 'none'
    });
    this.navigateToResult(task);
  },

  navigateToResult: function (task) {
    // 把确认页选定的输出比例随任务传给结果页，作为初始合成比例
    const taskWithRatio = Object.assign({}, task, {
      ratio: this.data.confirmRatio || '4:5'
    });
    wx.navigateTo({
      url: `/pages/result/result?taskId=${task.taskId}`,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', {
          task: taskWithRatio
        });
      }
    });
  }
});
