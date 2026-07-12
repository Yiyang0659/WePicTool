// pages/index/index.js
const { createMockTask, isCloudPermissionError } = require('../../utils/task');

Page({
  data: {
    loading: false,
    loadingText: '开始处理...'
  },

  // 选择穿搭图片
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
          loading: true,
          loadingText: '正在压缩图片...'
        });

        // 开始对所有选择的图片进行本地压缩
        that.compressAndUploadImages(tempFiles);
      },
      fail: function (err) {
        console.log('选择图片失败:', err);
      }
    });
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
    wx.navigateTo({
      url: `/pages/result/result?taskId=${task.taskId}`,
      success: function (navRes) {
        navRes.eventChannel.emit('acceptTaskData', {
          task: task
        });
      }
    });
  }
});
