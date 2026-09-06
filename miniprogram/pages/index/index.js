// pages/index/index.js
const { createMockTask, isCloudPermissionError } = require('../../utils/task');
const funTextProject = require('../../utils/funTextProject');
const { ENABLE_FUN_TEXT_STACK_ENTRY } = require('../../config/env');

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

const LAYERED_DEMO_ROWS = [
  {
    key: 'head',
    emoji: '🙂',
    name: '头像 / 发型',
    images: ['/assets/samples/head1.jpg', '/assets/samples/head2.jpg', '/assets/samples/head3.jpg']
  },
  {
    key: 'tops',
    emoji: '👕',
    name: '上衣',
    images: ['/assets/samples/top1.jpg', '/assets/samples/top2.jpg', '/assets/samples/top3.jpg']
  },
  {
    key: 'bottoms',
    emoji: '👖',
    name: '下装',
    images: ['/assets/samples/bottom1.jpg', '/assets/samples/bottom2.jpg', '/assets/samples/bottom3.jpg']
  },
  {
    key: 'shoes',
    emoji: '👟',
    name: '鞋子',
    images: ['/assets/samples/shoe1.jpg', '/assets/samples/shoe2.jpg', '/assets/samples/shoe3.jpg']
  }
];

// 趣味字画首页示例：五张由 render-demo.js 用授权字体渲染的真实 PNG，
// 顺序即「搞怪反转」pink-note-v1 候选的 hook → misdirect → pause → reveal → ending。
const FUN_TEXT_DEMO_SLIDES = [
  { src: '/assets/fun-text/demo/01.png' },
  { src: '/assets/fun-text/demo/02.png' },
  { src: '/assets/fun-text/demo/03.png' },
  { src: '/assets/fun-text/demo/04.png' },
  { src: '/assets/fun-text/demo/05.png' }
];

const INITIAL_LAYERED_DEMO_INDICES = {
  head: 0,
  tops: 0,
  bottoms: 0,
  shoes: 0
};

function buildLayeredDemoState(indices) {
  const normalizedIndices = Object.assign({}, INITIAL_LAYERED_DEMO_INDICES, indices || {});
  const viewRows = LAYERED_DEMO_ROWS.map(function (row) {
    const rawIndex = Number(normalizedIndices[row.key]);
    const currentIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < row.images.length
      ? rawIndex
      : 0;
    normalizedIndices[row.key] = currentIndex;
    return {
      key: row.key,
      emoji: row.emoji,
      name: row.name,
      currentIndex: currentIndex,
      total: row.images.length,
      images: row.images.map(function (src, index) {
        return { src: src, index: index, selected: index === currentIndex };
      })
    };
  });
  return {
    indices: normalizedIndices,
    viewRows: viewRows,
    currentItems: viewRows.map(function (row) {
      return {
        key: row.key,
        name: row.name,
        src: row.images[row.currentIndex].src
      };
    })
  };
}

const INITIAL_LAYERED_DEMO_STATE = buildLayeredDemoState(INITIAL_LAYERED_DEMO_INDICES);

Page({
  data: {
    loading: false,
    loadingText: '开始处理...',
    processing: false,
    // 步骤状态：home = 选图入口；confirm = 处理前确认（缩略图 + 比例）
    step: 'home',
    pickedImages: [],
    confirmRatio: '4:5',
    ratioOptions: CONFIRM_RATIO_OPTIONS,
    activeHomePlay: 'layered-dressup',
    layeredDemoIndices: INITIAL_LAYERED_DEMO_STATE.indices,
    layeredDemoViewRows: INITIAL_LAYERED_DEMO_STATE.viewRows,
    layeredCurrentItems: INITIAL_LAYERED_DEMO_STATE.currentItems,
    // 趣味字画真实示例（开发中）：可滑五张，滑到末张展示 CTA
    funTextDemoSlides: FUN_TEXT_DEMO_SLIDES,
    funTextDemoIndex: 0,
    funTextEntryEnabled: ENABLE_FUN_TEXT_STACK_ENTRY === true,
    homeTools: [
      { key: 'ai-outfit', name: 'AI 穿搭整理', emoji: '📸', status: 'available' },
      { key: 'film', name: '胶片相册', emoji: '🎞️', status: 'coming' },
      { key: 'beforeafter', name: '前后对比', emoji: '↔️', status: 'coming' },
      { key: 'more', name: '更多玩法', emoji: '•••', status: 'coming' }
    ]
  },

  onSelectHomePlay: function (event) {
    const playId = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.playId
      : '';
    if (playId !== 'layered-dressup' && playId !== 'fun-text-stack') return;
    if (playId === this.data.activeHomePlay) return;
    this.setData({ activeHomePlay: playId });
  },

  onSelectLayeredDemoItem: function (event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const groupKey = dataset.groupKey;
    const index = Number(dataset.index);
    const row = LAYERED_DEMO_ROWS.find(function (item) { return item.key === groupKey; });
    if (!row || !Number.isInteger(index) || index < 0 || index >= row.images.length) return;
    const nextIndices = Object.assign({}, this.data.layeredDemoIndices, { [groupKey]: index });
    const nextState = buildLayeredDemoState(nextIndices);
    this.setData({
      layeredDemoIndices: nextState.indices,
      layeredDemoViewRows: nextState.viewRows,
      layeredCurrentItems: nextState.currentItems
    });
  },

  onShiftLayeredDemoItem: function (event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const groupKey = dataset.groupKey;
    const direction = Number(dataset.direction);
    const row = LAYERED_DEMO_ROWS.find(function (item) { return item.key === groupKey; });
    if (!row || (direction !== -1 && direction !== 1)) return;
    const current = Number(this.data.layeredDemoIndices[groupKey]) || 0;
    const nextIndex = (current + direction + row.images.length) % row.images.length;
    this.onSelectLayeredDemoItem({ currentTarget: { dataset: { groupKey: groupKey, index: nextIndex } } });
  },

  onLayeredDemoSwiperChange: function (event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const current = Number(event && event.detail ? event.detail.current : NaN);
    if (!Number.isInteger(current)) return;
    this.onSelectLayeredDemoItem({
      currentTarget: {
        dataset: {
          groupKey: dataset.groupKey,
          index: current
        }
      }
    });
  },

  onTryLayeredDemo: function () {
    wx.navigateTo({ url: '/pages/dressup/dressup?mode=demo' });
  },

  onCreateLayeredDressup: function () {
    wx.navigateTo({ url: '/pages/dressup/dressup?mode=upload' });
  },

  // 趣味字画示例滑动进度：滑到最后一张后展示 CTA
  onFunTextDemoChange: function (event) {
    const current = Number(event.detail && event.detail.current);
    if (Number.isFinite(current)) {
      this.setData({ funTextDemoIndex: current });
    }
  },

  // 趣味字画内置示例：固定已审核文案，不调用云函数，直接带入候选页
  onTryFunTextDemo: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) {
      wx.showToast({ title: '趣味字画暂不可用', icon: 'none' });
      return;
    }
    const project = funTextProject.createFunTextProject({
      sourceText: '我今天想见你',
      expressionKey: 'funny-reversal',
      now: Date.now()
    });
    wx.navigateTo({
      url: '/pages/fun-text-candidates/fun-text-candidates',
      success: function (navRes) {
        navRes.eventChannel.emit('funTextProject', { project: project });
      }
    });
  },

  onCreateFunText: function () {
    if (ENABLE_FUN_TEXT_STACK_ENTRY !== true) {
      wx.showToast({ title: '趣味字画暂不可用', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/fun-text/fun-text' });
  },

  // 即将上线模块统一提示
  onComingSoon: function () {
    wx.showToast({ title: '敬请期待，即将上线', icon: 'none' });
  },

  // AI 穿搭整理入口：先让用户理解选图页，再由空状态的添加按钮主动调起相册。
  onOpenOutfitPicker: function () {
    this.setData({
      step: 'confirm',
      pickedImages: [],
      confirmRatio: '4:5'
    });
  },

  // 「用示例试一叠」新手体验入口
  // 设计理由：示例模式走本地 mock 管线——零等待、零云端成本、无隐私顾虑，让新用户 10 秒看到成品。
  onTrySample: function () {
    const that = this;
    wx.showLoading({ title: '正在准备示例…', mask: true });

    this.prepareSampleImages()
      .then(function (images) {
        wx.hideLoading();
        if (!images || images.length === 0) {
          wx.showToast({ title: '示例资源不可用', icon: 'none' });
          return;
        }
        // 复用现有 createMockTask 构造任务，标记为本地预览
        const task = createMockTask(images);
        task.status = 'preview';
        task.localPreview = true;
        wx.showToast({ title: '示例体验模式', icon: 'none' });
        // 走既有 eventChannel 契约跳转结果页，逻辑不动
        that.navigateToResult(task);
      })
      .catch(function (err) {
        wx.hideLoading();
        console.error('示例准备失败:', err);
        wx.showToast({ title: '示例加载失败，请重试', icon: 'none' });
      });
  },

  // 把 9 张包内示例图复制到用户目录（已存在则跳过复制），返回 mock 管线可用的 images 数组
  prepareSampleImages: function () {
    const fsm = wx.getFileSystemManager();
    const dir = `${wx.env.USER_DATA_PATH}/samples`;

    const ensureDir = new Promise(function (resolve, reject) {
      fsm.mkdir({
        dirPath: dir,
        recursive: true,
        success: function () { resolve(); },
        fail: function (err) {
          // 目录已存在不算失败
          if (err && err.errMsg && err.errMsg.indexOf('already exists') !== -1) {
            resolve();
            return;
          }
          reject(err);
        }
      });
    });

    return ensureDir.then(function () {
      // 单张失败整体失败（all-or-nothing），保证 3+3+3 分组映射不被打乱
      const copyJobs = SAMPLE_FILES.map(function (file, index) {
        const targetPath = `${dir}/${file.name}`;
        return new Promise(function (resolve, reject) {
          const done = function () {
            resolve({
              imageId: `sample_${index + 1}`,
              localPath: targetPath,
              url: targetPath,
              width: file.width,
              height: file.height,
              size: file.size
            });
          };
          // 已复制过则跳过
          fsm.access({
            path: targetPath,
            success: done,
            fail: function () {
              fsm.readFile({
                filePath: `/assets/samples/${file.name}`,
                success: function (readRes) {
                  fsm.writeFile({
                    filePath: targetPath,
                    data: readRes.data,
                    success: done,
                    fail: reject
                  });
                },
                fail: reject
              });
            }
          });
        });
      });
      return Promise.all(copyJobs);
    });
  },

  // 确认页：点击缩略图预览大图
  onPreviewConfirmImage: function (e) {
    var index = e.currentTarget.dataset.index;
    if (index === undefined || index === null) return;
    var pickedImages = this.data.pickedImages;
    if (!pickedImages || pickedImages.length === 0) return;
    var urls = pickedImages.map(function (item) { return item.tempFilePath; });
    var current = urls[Number(index)] || urls[0];
    wx.previewImage({ urls: urls, current: current });
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
    this.setData({ pickedImages: pickedImages });
  },

  // 确认页：清空所有图片，但保留当前选图页面和比例。
  onResetPickedImages: function () {
    this.setData({ pickedImages: [] });
  },

  // 确认页：退出本次临时选择并回到首页。
  onBackToHome: function () {
    this.setData({ step: 'home', pickedImages: [] });
  },

  // 确认页：开始处理，走既有上传/AI 分类/抠图链路
  onStartProcess: function () {
    if (this.data.processing) return;

    const tempFiles = this.data.pickedImages;
    if (!tempFiles || tempFiles.length === 0) return;

    // 初始化取消标志（运行时属性，不走 setData）
    this._cancelRequested = false;

    this.setData({
      processing: true,
      loading: true,
      loadingText: '正在压缩图片...'
    });

    // 开始对所有选择的图片进行本地压缩
    this.compressAndUploadImages(tempFiles);
  },

  // 取消处理：设置标志位并关闭 loading 遮罩，回到确认页状态
  onCancelProcess: function () {
    this._cancelRequested = true;
    this.setData({ loading: false, processing: false });
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
      this.setData({ loading: false, processing: false });
      wx.showModal({
        title: '需要配置云开发',
        content: '请先在 miniprogram/config/env.js 中填写 CloudBase 云环境 ID，并在开发者工具中部署 processOutfit 云函数。',
        showCancel: false
      });
      return;
    }

    const uploadTasks = [];
    const that = this;

    // 1. 串行压缩（每张压缩需要 Canvas 或系统 API，不适合并发）
    for (let i = 0; i < tempFiles.length; i++) {
      if (that._cancelRequested) return;

      const file = tempFiles[i];
      this.setData({
        loadingText: `压缩第 ${i + 1}/${tempFiles.length} 张图片...`
      });

      try {
        const compressedPath = await this.compressImage(file.tempFilePath);
        uploadTasks.push({
          filePath: compressedPath,
          cloudPath: `outfits/${Date.now()}_${i}${compressedPath.substring(compressedPath.lastIndexOf('.')).split('?')[0] || '.jpg'}`,
          sourcePath: file.tempFilePath,
          fileId: null,
          error: false
        });
      } catch (err) {
        console.error(`压缩第 ${i + 1} 张图片出错:`, err);
        uploadTasks.push({
          filePath: null,
          cloudPath: null,
          sourcePath: file.tempFilePath,
          fileId: null,
          error: true
        });
      }
    }

    // 2. 并发上传，每批 2 张（与云函数并发度匹配）
    const UPLOAD_CONCURRENCY = 2;
    for (let i = 0; i < uploadTasks.length; i += UPLOAD_CONCURRENCY) {
      if (that._cancelRequested) return;

      const batch = uploadTasks.slice(i, i + UPLOAD_CONCURRENCY);
      await Promise.all(batch.map(async function (task, batchIdx) {
        if (task.error) return; // 跳过压缩失败的
        const idx = i + batchIdx;
        try {
          that.setData({ loadingText: `上传第 ${idx + 1}/${uploadTasks.length} 张...` });
          const res = await wx.cloud.uploadFile({ cloudPath: task.cloudPath, filePath: task.filePath });
          task.fileId = res.fileID;
        } catch (err) {
          task.fileId = null;
          task.error = true;
          console.error(`[upload] 第 ${idx + 1} 张失败:`, err);
        }
      }));
    }

    if (that._cancelRequested) return;

    // 过滤掉完全失败的图片 ID，但保留成功的部分
    const validImages = uploadTasks.filter(item => !item.error && item.fileId);

    if (validImages.length === 0) {
      this.setData({ loading: false, processing: false });
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

  // 本地图片质量压缩。
  // 注意：wx.compressImage 仅支持 quality 参数，不支持尺寸控制（无 width/height 参数）。
  // 如需限制图片物理尺寸，需使用 canvas 方案或在云函数侧处理。
  // 当前策略：quality 80 有损压缩，压缩后如仍超过 2000px 则输出警告供开发调试。
  compressImage: function (tempFilePath) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: tempFilePath,
        quality: 80,
        success: (compressRes) => {
          const outputPath = compressRes.tempFilePath;
          // 压缩后检查尺寸，过大则输出警告（不阻断流程）
          wx.getImageInfo({
            src: outputPath,
            success: (infoRes) => {
              const maxSide = Math.max(infoRes.width, infoRes.height);
              if (maxSide > 2000) {
                console.warn(
                  `[compressImage] 压缩后图片最长边仍为 ${maxSide}px（${infoRes.width}x${infoRes.height}），` +
                  '超过 2000px。wx.compressImage 不支持尺寸控制，如需缩放请使用 canvas 方案。'
                );
              }
              resolve(outputPath);
            },
            fail: () => {
              // getImageInfo 失败不阻断，直接用压缩后的路径
              resolve(outputPath);
            }
          });
        },
        fail: (compressErr) => {
          console.warn('wx.compressImage 失败，降级使用原图:', compressErr);
          resolve(tempFilePath);
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
        that.setData({ loading: false, processing: false });

        const safetyCode = res.result && res.result.error && res.result.error.code;
        if (safetyCode === 'CONTENT_UNSAFE' || safetyCode === 'SAFETY_UNAVAILABLE') {
          wx.showModal({
            title: safetyCode === 'CONTENT_UNSAFE' ? '图片审核未通过' : '安全服务暂不可用',
            content: safetyCode === 'CONTENT_UNSAFE'
              ? '图片不符合平台内容规范，请更换后重试。'
              : '暂时无法完成图片安全检查，请稍后重试。',
            showCancel: false
          });
          return;
        }

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
        that.setData({ loading: false, processing: false });
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
      this.setData({ loading: false, processing: false });
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

    this.setData({ loading: false, processing: false });
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
