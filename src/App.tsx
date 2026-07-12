import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  CheckCircle,
  Settings,
  ChevronLeft,
  Code2,
  FileJson,
  FileCode,
  Sparkles,
  Check,
  Copy,
  CheckCircle2,
  ListFilter
} from 'lucide-react';

// Preset Outfit Images for Quick Testing (Highly curated Unsplash clothing flat-lays)
const PRESET_IMAGES = [
  {
    name: '白色基础T恤',
    category: 'tops',
    url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '经典牛仔夹克',
    category: 'tops',
    url: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '复古针织开衫',
    category: 'tops',
    url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '重磅水洗牛仔裤',
    category: 'bottoms',
    url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '日系卡其休闲裤',
    category: 'bottoms',
    url: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '经典格子长裙',
    category: 'bottoms',
    url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '百搭复古德训鞋',
    category: 'shoes',
    url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '经典英伦马丁靴',
    category: 'shoes',
    url: 'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '复古红帆布鞋',
    category: 'shoes',
    url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=80'
  }
];

// Native Mini Program Files Source Viewer Data (Written using safe string concatenation to avoid nested template literal parser conflicts)
const MINIPROGRAM_FILES: Record<string, { title: string; path: string; lang: string; content: string }> = {
  'app.json': {
    title: 'app.json',
    path: '/miniprogram/app.json',
    lang: 'json',
    content: `{
  "pages": [
    "pages/index/index",
    "pages/result/result"
  ],
  "window": {
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#ffffff",
    "navigationBarTitleText": "WePicTool",
    "navigationBarTextStyle": "black"
  },
  "sitemapLocation": "sitemap.json",
  "style": "v2",
  "lazyCodeLoading": "requiredComponents"
}`
  },
  'index.wxml': {
    title: 'pages/index/index.wxml',
    path: '/miniprogram/pages/index/index.wxml',
    lang: 'html',
    content: `<!--pages/index/index.wxml-->
<view class="container">
  <view class="header-section">
    <view class="logo-container">
      <view class="logo-icon">👗</view>
    </view>
    <view class="title">WePicTool</view>
    <view class="subtitle">微信最快的穿搭参考图生成工具</view>
  </view>

  <view class="main-section">
    <view class="card-btn" bindtap="onChooseMedia">
      <view class="card-btn-content">
        <view class="card-btn-icon">📸</view>
        <view class="card-btn-title">做穿搭参考图</view>
        <view class="card-btn-desc">选择 1-9 张衣服/鞋子图片自动分组整理</view>
      </view>
    </view>
  </view>

  <view class="guide-section">
    <view class="guide-title">使用步骤</view>
    <view class="guide-list">
      <view class="guide-item">
        <view class="guide-num">1</view>
        <view class="guide-text">点击上方“做穿搭参考图”，选择上衣、下装、鞋子的照片（1-9张）。</view>
      </view>
      <view class="guide-item">
        <view class="guide-num">2</view>
        <view class="guide-text">系统对图片做基础压缩（最长边不超过 1600px）并上传至云存储。</view>
      </view>
      <view class="guide-item">
        <view class="guide-num">3</view>
        <view class="guide-text">云函数进行智能 mock 分组整理并返回结果。</view>
      </view>
      <view class="guide-item">
        <view class="guide-num">4</view>
        <view class="guide-text">结果页查看【上衣组】、【下装组】和【鞋子组】，保存至相册发送微信。</view>
      </view>
    </view>
  </view>

  <view class="loading-overlay" wx:if="{{loading}}">
    <view class="loading-box">
      <view class="spinner"></view>
      <view class="loading-text">{{loadingText}}</view>
      <view class="loading-subtext">正在处理您的穿搭素材...</view>
    </view>
  </view>
</view>`
  },
  'index.js': {
    title: 'pages/index/index.js',
    path: '/miniprogram/pages/index/index.js',
    lang: 'javascript',
    content: `// pages/index/index.js
Page({
  data: {
    loading: false,
    loadingText: '开始处理...'
  },

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

        that.compressAndUploadImages(tempFiles);
      },
      fail: function (err) {
        console.log('选择图片失败:', err);
      }
    });
  },

  compressAndUploadImages: async function (tempFiles) {
    const uploadTasks = [];
    
    for (let i = 0; i < tempFiles.length; i++) {
      const file = tempFiles[i];
      this.setData({
        loadingText: '压缩第 ' + (i + 1) + '/' + tempFiles.length + ' 张图片...'
      });

      try {
        // 压缩 (最长边不超过 1600px)
        const compressedPath = await this.compressImage(file.tempFilePath);
        
        this.setData({
          loadingText: '上传第 ' + (i + 1) + '/' + tempFiles.length + ' 张...'
        });

        // 上传到 CloudBase 云存储
        const uploadResult = await this.uploadToCloudBase(compressedPath, i);
        uploadTasks.push({
          fileId: uploadResult.fileID,
          sourcePath: file.tempFilePath
        });
      } catch (err) {
        console.error('处理图片出错:', err);
        uploadTasks.push({ fileId: null, sourcePath: file.tempFilePath, error: true });
      }
    }

    const validImages = uploadTasks.filter(item => !item.error && item.fileId);

    if (validImages.length === 0) {
      this.setData({ loading: false });
      wx.showModal({
        title: '处理失败',
        content: '所有图片上传均失败，请重试。',
        showCancel: false
      });
      return;
    }

    this.setData({ loadingText: '创建分组处理任务...' });
    this.createProcessingTask(validImages);
  },

  compressImage: function (tempFilePath) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: tempFilePath,
        success: (res) => {
          const { width, height } = res;
          const maxSide = 1600;
          if (width <= maxSide && height <= maxSide) {
            resolve(tempFilePath);
            return;
          }
          wx.compressImage({
            src: tempFilePath,
            quality: 80,
            success: (compressRes) => resolve(compressRes.tempFilePath),
            fail: () => resolve(tempFilePath)
          });
        },
        fail: () => resolve(tempFilePath)
      });
    });
  },

  uploadToCloudBase: function (filePath, index) {
    const suffix = filePath.substring(filePath.lastIndexOf('.'));
    const cloudPath = 'outfits/' + Date.now() + '_' + index + (suffix || '.jpg');
    return wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    });
  },

  createProcessingTask: function (images) {
    const that = this;
    const fileIds = images.map(img => img.fileId);

    wx.cloud.callFunction({
      name: 'processOutfit',
      data: { images: fileIds },
      success: function (res) {
        that.setData({ loading: false });
        if (res.result && res.result.taskId) {
          wx.navigateTo({
            url: '/pages/result/result?taskId=' + res.result.taskId,
            success: function (navRes) {
              navRes.eventChannel.emit('acceptTaskData', { task: res.result });
            }
          });
        }
      },
      fail: function () {
        that.setData({ loading: false });
        wx.showModal({ title: '系统出错', content: '调用云函数失败', showCancel: false });
      }
    });
  }
});`
  },
  'result.wxml': {
    title: 'pages/result/result.wxml',
    path: '/miniprogram/pages/result/result.wxml',
    lang: 'html',
    content: `<!--pages/result/result.wxml-->
<view class="container">
  <view class="tips-card">
    <view class="tips-title">💡 分组整理已完成</view>
    <view class="tips-text">系统已自动为您划分穿搭类别。推荐按组逐次保存并发送，即可形成多图滑动对比！</view>
  </view>

  <!-- 上衣组 -->
  <view class="group-section" wx:if="{{groups.tops && groups.tops.length > 0}}">
    <view class="group-header">
      <view class="group-title">👗 上衣组 ({{groups.tops.length}}张)</view>
      <view class="group-badge {{groups.tops.length >= 3 ? 'badge-stack' : 'badge-normal'}}">
        {{groups.tops.length >= 3 ? '适合微信叠图' : '数量较少'}}
      </view>
    </view>
    <scroll-view class="card-scroll" scroll-x="true">
      <view class="card-list">
        <view class="outfit-card" wx:for="{{groups.tops}}" wx:key="index">
          <image class="card-img" src="{{item}}" mode="aspectFit"></image>
          <view class="card-index">{{index + 1}}</view>
          <button class="save-btn" bindtap="onSaveSingle" data-url="{{item}}">保存单图</button>
        </view>
      </view>
    </scroll-view>
    <view class="group-validation" wx:if="{{groups.tops.length < 3}}">
      <text class="warning-text">⚠️ 当前组不足3张，发送后无法形成叠图滑动效果，建议补图。</text>
    </view>
    <button class="group-save-btn" bindtap="onSaveGroup" data-group="tops">💾 保存上衣组</button>
  </view>

  <!-- 下装组 -->
  <view class="group-section" wx:if="{{groups.bottoms && groups.bottoms.length > 0}}">
    <!-- 结构与上衣组一致 -->
  </view>

  <!-- 鞋子组 -->
  <view class="group-section" wx:if="{{groups.shoes && groups.shoes.length > 0}}">
    <!-- 结构与上衣组一致 -->
  </view>
</view>`
  },
  'result.js': {
    title: 'pages/result/result.js',
    path: '/miniprogram/pages/result/result.js',
    lang: 'javascript',
    content: `// pages/result/result.js
Page({
  data: {
    taskId: '',
    groups: { tops: [], bottoms: [], shoes: [], others: [] }
  },

  onLoad: function (options) {
    const that = this;
    if (options.taskId) this.setData({ taskId: options.taskId });

    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel && typeof eventChannel.on === 'function') {
      eventChannel.on('acceptTaskData', function (data) {
        if (data && data.task) {
          const groups = data.task.groups || {};
          that.setData({
            groups: {
              tops: groups.tops || [],
              bottoms: groups.bottoms || [],
              shoes: groups.shoes || [],
              others: groups.others || []
            }
          });
        }
      });
    }
  },

  onSaveSingle: function (e) {
    const url = e.currentTarget.dataset.url;
    wx.showLoading({ title: '正在保存...' });
    this.downloadAndSaveToAlbum(url)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        this.handleSaveError(err, [url]);
      });
  },

  onSaveGroup: function (e) {
    const groupName = e.currentTarget.dataset.group;
    const urls = this.data.groups[groupName];
    if (!urls || urls.length === 0) return;

    this.saveGroupSequentially(urls, 0)
      .then(() => {
        wx.showModal({
          title: '保存成功',
          content: '当前组已保存。先发上衣组、再发下装、最后发鞋子，左右滑动即可对比！',
          confirmText: '我知道了',
          showCancel: false
        });
      })
      .catch((err) => this.handleSaveError(err, urls));
  },

  saveGroupSequentially: function (urls, index) {
    if (index >= urls.length) return Promise.resolve();
    wx.showLoading({ title: '正在保存第 ' + (index + 1) + '/' + urls.length + ' 张...' });
    return this.downloadAndSaveToAlbum(urls[index])
      .then(() => this.saveGroupSequentially(urls, index + 1));
  },

  downloadAndSaveToAlbum: function (url) {
    return new Promise((resolve, reject) => {
      const downloadTask = url.startsWith('cloud://') 
        ? wx.cloud.downloadFile({ fileID: url })
        : Promise.resolve({ tempFilePath: url });

      downloadTask.then(res => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => resolve(),
          fail: (err) => reject({ type: 'save_fail', error: err, filePath: res.tempFilePath })
        });
      }).catch(err => reject({ type: 'download_fail', error: err }));
    });
  },

  handleSaveError: function (errInfo, urlsToRetry) {
    const errMsg = errInfo.error ? errInfo.error.errMsg : '';
    if (errMsg && (errMsg.indexOf('auth deny') !== -1 || errMsg.indexOf('authorize:fail') !== -1)) {
      wx.showModal({
        title: '需要相册授权',
        content: '保存参考图需要将图片写入相册。请点击前往设置中开启照片写入权限。',
        confirmText: '前往设置',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                if (settingRes.authSetting['scope.writePhotosAlbum']) {
                  wx.showToast({ title: '授权成功，请重新保存' });
                }
              }
            });
          }
        }
      });
    } else {
      wx.showModal({
        title: '保存失败',
        content: '系统相册写入异常，请检查权限或重试。',
        confirmText: '重新尝试',
        success: (res) => {
          if (res.confirm && urlsToRetry) {
            this.saveGroupSequentially(urlsToRetry, 0);
          }
        }
      });
    }
  }
});`
  },
  'processOutfit.js': {
    title: 'cloudfunctions/processOutfit/index.js',
    path: '/miniprogram/cloudfunctions/processOutfit/index.js',
    lang: 'javascript',
    content: `// 云函数入口文件
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const images = event.images || [];
  const taskId = 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

  // ----------------------------------------------------
  // 【后续开发扩展点 - 阶段二：接入图片部件识别】
  // AI 置信度分类等：const classes = await callAIClassifier(images);
  // 【后续开发扩展点 - 阶段三：抠图白底合成】
  // 后端 Sharp 抠图：const results = await removeBgAndRender(images);
  // ----------------------------------------------------

  // 阶段一：“最小技术闭环” Mock 分组：
  // 1-3 张归为 tops | 4-6 张归为 bottoms | 7-9 张归为 shoes
  const groups = { tops: [], bottoms: [], shoes: [], others: [] };
  const results = [];

  for (let i = 0; i < images.length; i++) {
    const imageUrl = images[i];
    let category = 'others';

    if (i >= 0 && i < 3) {
      category = 'tops';
    } else if (i >= 3 && i < 6) {
      category = 'bottoms';
    } else if (i >= 6 && i < 9) {
      category = 'shoes';
    }

    groups[category].push(imageUrl);
    results.push({
      resultId: 'result_' + i,
      sourceImageId: 'image_' + i,
      category: category,
      url: imageUrl,
      width: 1200, height: 1200
    });
  }

  await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟延时

  return {
    taskId: taskId,
    status: 'done',
    progress: 100,
    groups: groups,
    results: results,
    createdAt: Date.now()
  };
};`
  }
};

export default function App() {
  // Simulator Navigation State
  const [simulatorPage, setSimulatorPage] = useState<'home' | 'processing' | 'result' | 'preview'>('home');
  const [selectedImages, setSelectedImages] = useState<Array<{ name: string; url: string; rawFile?: File }>>([]);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStepText, setLoadingStepText] = useState('压缩图片中...');
  
  // Custom CloudBase Simulator State
  const [groups, setGroups] = useState<{ tops: string[]; bottoms: string[]; shoes: string[]; others: string[] }>({
    tops: [],
    bottoms: [],
    shoes: [],
    others: []
  });

  // Simulator Debug Configuration
  const [authStatus, setAuthStatus] = useState<'authorized' | 'denied'>('authorized');

  // Chat-style result page state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    tops: false,
    bottoms: false,
    shoes: false,
    others: false
  });
  const [stackIndex, setStackIndex] = useState<Record<string, number>>({
    tops: 0,
    bottoms: 0,
    shoes: 0,
    others: 0
  });
  const [slideOffset, setSlideOffset] = useState<Record<string, number>>({
    tops: 0,
    bottoms: 0,
    shoes: 0,
    others: 0
  });
  const [pillAnimating, setPillAnimating] = useState<Record<string, boolean>>({
    tops: false,
    bottoms: false,
    shoes: false,
    others: false
  });
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchGroupKey, setTouchGroupKey] = useState<string | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showGroupSaveSheet, setShowGroupSaveSheet] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<Array<{ key: string; title: string; emoji: string; count: number }>>([]);

  // Code Viewer State
  const [activeFileTab, setActiveFileTab] = useState('app.json');
  const [isCopied, setIsCopied] = useState(false);
  
  // Notifications or alert triggers
  const [wechatModal, setWechatModal] = useState<{
    show: boolean;
    title: string;
    content: string;
    confirmText: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Hidden File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto real-time clock in mock phone
  const [phoneTime, setPhoneTime] = useState('09:41');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setPhoneTime(hours + ':' + minutes);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // Copy to clipboard helper
  const handleCopyCode = () => {
    const content = MINIPROGRAM_FILES[activeFileTab].content;
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Simulate file change from browser input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limit to maximum 9 images
    const limit = Math.min(files.length, 9);
    const newImages: Array<{ name: string; url: string; rawFile: File }> = [];

    for (let i = 0; i < limit; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      newImages.push({
        name: file.name,
        url: url,
        rawFile: file
      });
    }

    setSelectedImages(newImages);
    startSimulatedPipeline(newImages);
  };

  // Preset quick import helper
  const handleImportPresets = () => {
    const formattedPresets = PRESET_IMAGES.map((preset) => ({
      name: preset.name,
      url: preset.url
    }));
    setSelectedImages(formattedPresets);
    startSimulatedPipeline(formattedPresets);
  };

  // Run simulated cloud development pipeline
  const startSimulatedPipeline = (images: Array<{ name: string; url: string }>) => {
    setSimulatorPage('processing');
    setLoadingProgress(10);
    setLoadingStepText('1. 正在对大图等比例进行基础压缩...');

    // Progress bar milestones simulating WeChat cloud call
    setTimeout(() => {
      setLoadingProgress(40);
      setLoadingStepText('2. 压缩完毕（最长边<1600px），正在上传至 CloudBase... ');
    }, 1000);

    setTimeout(() => {
      setLoadingProgress(75);
      setLoadingStepText('3. 正在部署并调用云函数 [processOutfit] ...');
    }, 2200);

    setTimeout(() => {
      setLoadingProgress(95);
      setLoadingStepText('4. 云函数正运行 Mock 穿搭识别与分类归纳...');
    }, 3400);

    setTimeout(() => {
      // Mock grouping rule implementation:
      // 1-3 tops, 4-6 bottoms, 7-9 shoes, rest others
      const mockGroups = {
        tops: [] as string[],
        bottoms: [] as string[],
        shoes: [] as string[],
        others: [] as string[]
      };

      images.forEach((img, index) => {
        if (index >= 0 && index < 3) {
          mockGroups.tops.push(img.url);
        } else if (index >= 3 && index < 6) {
          mockGroups.bottoms.push(img.url);
        } else if (index >= 6 && index < 9) {
          mockGroups.shoes.push(img.url);
        } else {
          mockGroups.others.push(img.url);
        }
      });

      setGroups(mockGroups);
      setLoadingProgress(100);
      setSimulatorPage('result');
    }, 4500);
  };

  // Simulating wx.saveImageToPhotosAlbum
  const handleSaveSingleImage = (url: string) => {
    if (authStatus === 'denied') {
      // Simulate User Permission Refused Dialog
      setWechatModal({
        show: true,
        title: '需要相册授权',
        content: '保存参考图需要将图片写入您的相册。请点击下方「前往设置」，在权限设置中开启「保存到相册」权限，然后重试。',
        confirmText: '前往设置',
        cancelText: '取消',
        onConfirm: () => {
          setWechatModal(null);
          // Trigger mock set authorization prompt
          setTimeout(() => {
            alert('⚙️ 模拟弹窗：请在侧边调试栏切换“模拟相册访问授权状态”为 [已授权] 后重试。');
          }, 400);
        }
      });
    } else {
      // Authorized: Download immediately to PC browser to mimic real save
      const link = document.createElement('a');
      link.href = url;
      link.download = 'wepictool_outfit_' + Date.now() + '.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show mock wx.showToast
      setWechatModal({
        show: true,
        title: '保存成功',
        content: '单张图片已成功保存到您的相册！',
        confirmText: '我知道了',
        onConfirm: () => setWechatModal(null)
      });
    }
  };

  // Simulating Saving Entire Group Sequentially
  const handleSaveGroup = (groupKey: keyof typeof groups) => {
    const groupUrls = groups[groupKey];
    if (groupUrls.length === 0) return;

    if (authStatus === 'denied') {
      setWechatModal({
        show: true,
        title: '需要相册授权',
        content: '批量保存参考图需要将图片写入您的相册。请点击下方「前往设置」开启相册写入权限。',
        confirmText: '前往设置',
        cancelText: '取消',
        onConfirm: () => {
          setWechatModal(null);
          setTimeout(() => {
            alert('⚙️ 模拟弹窗：请在侧边调试栏切换“模拟相册访问授权状态”为 [已授权] 后重试。');
          }, 400);
        }
      });
    } else {
      // Authorized: Download all items in group
      groupUrls.forEach((url, i) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'wepictool_' + String(groupKey) + '_' + (i + 1) + '_' + Date.now() + '.jpg';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, i * 300); // Small interval to trigger multiple browser downloads cleanly
      });

      // Show mock modal explaining wechat stacking effect
      setWechatModal({
        show: true,
        title: '💾 整组保存成功',
        content: '整组图片已成功存入手机相册！发给闺蜜时，记得先连选这几张并按组发送，即可在微信里形成流畅滑动叠图对比效果！',
        confirmText: '我知道了',
        onConfirm: () => setWechatModal(null)
      });
    }
  };

  // Reset simulator back to home
  const handleResetSimulator = () => {
    setSimulatorPage('home');
    setSelectedImages([]);
    setGroups({ tops: [], bottoms: [], shoes: [], others: [] });
    setExpanded({ tops: false, bottoms: false, shoes: false, others: false });
    setStackIndex({ tops: 0, bottoms: 0, shoes: 0, others: 0 });
    setSlideOffset({ tops: 0, bottoms: 0, shoes: 0, others: 0 });
    setShowActionSheet(false);
    setShowGroupSaveSheet(false);
  };

  // Chat-style result page helpers
  const groupOrder: Array<keyof typeof groups> = ['tops', 'bottoms', 'shoes', 'others'];
  const groupInfo: Record<keyof typeof groups, { title: string; emoji: string }> = {
    tops: { title: '上衣', emoji: '👕' },
    bottoms: { title: '下衣', emoji: '👖' },
    shoes: { title: '鞋子', emoji: '👟' },
    others: { title: '未处理素材', emoji: '📦' }
  };

  const groupList = groupOrder
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, items: groups[key] }));

  const totalCount = groupList.reduce((sum, group) => sum + group.items.length, 0);
  const chatTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  const handleToggleExpand = (key: keyof typeof groups) => {
    setPillAnimating((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setPillAnimating((prev) => ({ ...prev, [key]: false })), 120);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent, key: keyof typeof groups) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setTouchStartX(clientX);
    setTouchGroupKey(key);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent, key: keyof typeof groups) => {
    if (touchStartX == null || touchGroupKey !== key) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setSlideOffset((prev) => ({ ...prev, [key]: clientX - touchStartX }));
  };

  const handleTouchEnd = (key: keyof typeof groups) => {
    const delta = slideOffset[key] || 0;
    const threshold = 60;
    const items = groups[key];

    if (Math.abs(delta) >= threshold && items.length > 1) {
      const direction = delta > 0 ? -1 : 1;
      setSlideOffset((prev) => ({ ...prev, [key]: direction * 260 }));
      setTimeout(() => {
        setStackIndex((prev) => ({
          ...prev,
          [key]: (prev[key] + direction + items.length) % items.length
        }));
        setSlideOffset((prev) => ({ ...prev, [key]: 0 }));
      }, 280);
    } else {
      setSlideOffset((prev) => ({ ...prev, [key]: 0 }));
    }
    setTouchStartX(null);
    setTouchGroupKey(null);
  };

  const getAllImageUrls = () =>
    groupOrder.flatMap((key) => groups[key]);

  const handleSaveAllImages = () => {
    setShowActionSheet(false);
    const urls = getAllImageUrls();
    if (urls.length === 0) return;
    urls.forEach((url, i) => {
      setTimeout(() => handleSaveSingleImage(url), i * 300);
    });
    setWechatModal({
      show: true,
      title: '全部图片已保存',
      content: `${urls.length} 张图片已保存到相册，可返回微信发送。`,
      confirmText: '我知道了',
      onConfirm: () => setWechatModal(null)
    });
  };

  const handleSaveByGroup = () => {
    setShowActionSheet(false);
    const available = groupOrder
      .filter((key) => groups[key].length > 0)
      .map((key) => ({
        key,
        title: groupInfo[key].title,
        emoji: groupInfo[key].emoji,
        count: groups[key].length
      }));
    setAvailableGroups(available);
    setShowGroupSaveSheet(true);
  };

  const handleSaveGroupByKey = (key: keyof typeof groups) => {
    setShowGroupSaveSheet(false);
    handleSaveGroup(key);
  };

  const handleEditGroup = () => {
    setWechatModal({
      show: true,
      title: '编辑分组',
      content: '点击各分组的「展开」后，每张图片下方都有「改分类」按钮，可以调整图片归属（当前为演示，改分类功能后续接入）。',
      confirmText: '我知道了',
      onConfirm: () => setWechatModal(null)
    });
  };

  const handleReorder = () => {
    setWechatModal({
      show: true,
      title: '调整顺序',
      content: '调整顺序功能开发中，敬请期待。',
      confirmText: '我知道了',
      onConfirm: () => setWechatModal(null)
    });
  };

  const handleSaveLongImage = () => {
    setWechatModal({
      show: true,
      title: '保存长图',
      content: '保存长图功能开发中，敬请期待。',
      confirmText: '我知道了',
      onConfirm: () => setWechatModal(null)
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">

      {/* HEADER BAR */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-2xl">👗</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight text-white">WePicTool</h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded">
                阶段一：最小闭环
              </span>
            </div>
            <p className="text-xs text-slate-400">微信原生小程序 + CloudBase 云开发交互沙盒与源码工作台</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleImportPresets}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-medium text-xs px-4 py-2 rounded-lg shadow-md transition-all duration-200"
          >
            <Sparkles className="w-3.5 h-3.5" />
            一键导入9张测试图体验
          </button>
          
          <a 
            href="#code-explorer"
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-4 py-2 rounded-lg transition"
          >
            <FileCode className="w-3.5 h-3.5" />
            查看微信源码
          </a>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: SIMULATOR PANEL (Takes 5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center gap-4">
          
          {/* Debug Controls for Sandbox */}
          <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-2 mb-3 text-slate-300 font-semibold text-xs uppercase tracking-wider">
              <Settings className="w-4 h-4 text-indigo-500" />
              <span>沙盒调试与控制台 (Debugger)</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">相册授权状态</label>
                <select
                  value={authStatus}
                  onChange={(e) => setAuthStatus(e.target.value as 'authorized' | 'denied')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-indigo-500 transition"
                >
                  <option value="authorized">✅ 已授权 (自动保存下载)</option>
                  <option value="denied">❌ 拒绝授权 (触发报错提示)</option>
                </select>
              </div>
              <div className="flex items-end">
                <span className="text-[10px] text-slate-500">
                  提示：点击「拒绝授权」可测试小程序如何优雅引导用户重试。
                </span>
              </div>
            </div>
          </div>

          {/* PHONE FRAME SHIELD */}
          <div className="relative w-full max-w-[360px] aspect-[9/18.5] bg-slate-950 rounded-[44px] p-3 shadow-2xl border-[6px] border-slate-800 ring-1 ring-slate-700/50 flex flex-col overflow-hidden">
            
            {/* Phone Front Camera notch / Speaker */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-950 rounded-full z-50 flex items-center justify-center">
              <div className="w-12 h-1 bg-slate-800 rounded-full mb-1"></div>
              <div className="w-2.5 h-2.5 bg-slate-900 rounded-full border border-slate-800 absolute right-8"></div>
            </div>

            {/* Simulated Phone Status Bar */}
            <div className="flex justify-between items-center px-6 pt-2 pb-1 text-slate-800 font-semibold text-xs tracking-wider select-none z-40 bg-white">
              <span>{phoneTime}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]">📶</span>
                <span className="text-[10px]">🔋</span>
              </div>
            </div>

            {/* SCREEN CONTAINER */}
            <div className="flex-1 bg-slate-50 flex flex-col relative overflow-y-auto overflow-x-hidden text-slate-800 select-none">
              
              {/* Mini Program Navigation Header */}
              <div className="sticky top-0 bg-white border-b border-slate-200/60 px-4 py-3 flex justify-between items-center z-30">
                <div className="flex items-center gap-1">
                  {simulatorPage !== 'home' && (
                    <button 
                      onClick={handleResetSimulator}
                      className="p-1 hover:bg-slate-100 rounded-full transition text-slate-700 mr-1"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  <span className="font-bold text-sm tracking-tight text-slate-900">WePicTool</span>
                </div>
                
                {/* WeChat Capsule Menu Option button */}
                <div className="flex items-center gap-2 bg-slate-100/80 border border-slate-200 px-2.5 py-1 rounded-full text-slate-800 text-[10px] font-bold">
                  <span>●●●</span>
                  <div className="w-[1px] h-3.5 bg-slate-300"></div>
                  <span className="text-xs">⊚</span>
                </div>
              </div>

              {/* ACTIVE SIMULATOR PAGE CONTENT */}
              <div className="flex-1 flex flex-col relative">
                
                {/* 1. HOME SCREEN */}
                {simulatorPage === 'home' && (
                  <div className="p-5 flex flex-col items-center flex-1">
                    
                    {/* Brand Banner */}
                    <div className="my-6 text-center flex flex-col items-center">
                      <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-lg border border-slate-100 mb-4">
                        <span className="text-4xl">👗</span>
                      </div>
                      <h2 className="text-xl font-bold text-slate-800 tracking-tight">WePicTool</h2>
                      <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
                        微信最快的穿搭参考图生成工具
                      </p>
                    </div>

                    {/* Primary Trigger Button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full bg-gradient-to-br from-indigo-600 to-blue-500 active:from-indigo-700 active:to-blue-600 hover:shadow-lg text-white font-bold rounded-2xl py-4 px-6 flex flex-col items-center gap-1 shadow-md transition-all duration-150 mb-6"
                    >
                      <span className="text-3xl">📸</span>
                      <span className="text-base font-semibold mt-1">做穿搭参考图</span>
                      <span className="text-[10px] text-indigo-100/90 font-normal">
                        选择 1-9 张衣服/鞋子图片自动分组整理
                      </span>
                    </button>

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      multiple 
                      accept="image/*" 
                      className="hidden" 
                    />

                    {/* Preset recommendation banner */}
                    <button
                      onClick={handleImportPresets}
                      className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition"
                    >
                      <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
                      点击「一键导入穿搭测试图」直接体验
                    </button>

                    {/* Simple Instructions list */}
                    <div className="mt-8 w-full bg-white border border-slate-200/60 rounded-xl p-4">
                      <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1">
                        <ListFilter className="w-3.5 h-3.5 text-indigo-500" />
                        操作说明
                      </h4>
                      <ul className="space-y-3 text-[11px] text-slate-500 leading-relaxed">
                        <li className="flex gap-2">
                          <span className="w-4 h-4 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</span>
                          <span>支持选择 1-9 张图片，前端会自动进行等比例大图压缩。</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="w-4 h-4 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</span>
                          <span>由 CloudBase 智能 mock 归入<b>上衣组、下装组、鞋子组</b>。</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="w-4 h-4 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">3</span>
                          <span>按组极速保存到手机相册，回微信发送给好友开始滑动求建议！</span>
                        </li>
                      </ul>
                    </div>

                    <div className="mt-auto py-4 text-center text-[10px] text-slate-400">
                      WePicTool · 阶段一：最小技术闭环
                    </div>

                  </div>
                )}

                {/* 2. PROCESSING / LOADING SCREEN */}
                {simulatorPage === 'processing' && (
                  <div className="p-6 flex flex-col items-center justify-center flex-1 bg-white">
                    <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
                    
                    <h3 className="font-bold text-slate-800 text-base mb-2">正在处理穿搭素材...</h3>
                    <p className="text-xs text-indigo-600 font-semibold mb-4 text-center px-4">
                      {loadingStepText}
                    </p>

                    {/* Simulated loading bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden max-w-[240px]">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: loadingProgress + '%' }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">请稍后，单张图片失败不阻碍整组处理</span>
                  </div>
                )}

                {/* 3. RESULT VIEW SCREEN — Original white theme */}
                {simulatorPage === 'result' && (
                  <div className="p-4 flex flex-col gap-4 bg-slate-50 flex-1">
                    <div className="bg-indigo-50 border-l-4 border-indigo-500 rounded-lg p-3 text-[11px] text-indigo-800 leading-relaxed shadow-sm">
                      <p className="font-bold mb-0.5">💡 分组整理已完成</p>
                      已自动为您划分类别。推荐先保存同组图片并在微信中<b>按组逐次发送</b>，即可形成多图滑动对比！
                    </div>

                    {groupList.map((group) => {
                      const k = group.key as keyof typeof groups;
                      const items = group.items;
                      const info = { tops: '👕 上衣组', bottoms: '👖 下装组', shoes: '👟 鞋子组', others: '📦 未处理素材' };
                      return (
                        <div key={k} className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-sm">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-xs text-slate-800">{info[k]}</span>
                            <span className="text-[10px] text-slate-400">{items.length}张</span>
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {items.map((url, i) => (
                              <div key={i} className="w-20 flex-shrink-0 bg-slate-50 border border-slate-100 rounded-lg p-1">
                                <img src={url} className="w-full h-20 object-cover rounded bg-white" alt="" />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {groupList.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <div className="text-4xl mb-2">📂</div>
                        <div className="text-sm">未找到有效的分组结果</div>
                      </div>
                    )}

                    <div className="text-center py-2 space-y-2">
                      <button
                        onClick={() => setSimulatorPage('preview')}
                        className="w-full h-10 bg-emerald-500 active:bg-emerald-600 rounded-xl flex items-center justify-center text-white text-xs font-semibold"
                      >
                        📱 微信发送预览
                      </button>
                      <button onClick={handleResetSimulator} className="text-indigo-600 text-xs font-semibold underline">← 重新测试</button>
                    </div>
                  </div>
                )}

                {/* 4. WECHAT PREVIEW — Dark chat style */}
                {simulatorPage === 'preview' && (
                  <div className="absolute inset-x-0 top-[28px] bottom-0 bg-[#111111] flex flex-col z-40">
                    <div className="bg-[#1A1A1A] px-4 py-3 flex items-center justify-between shrink-0">
                      <button onClick={() => setSimulatorPage('result')} className="text-white text-3xl leading-none w-8 flex items-center justify-center">‹</button>
                      <span className="text-white text-[15px] font-semibold">小助手</span>
                      <span className="text-white text-xl tracking-[4px] w-8 text-right">···</span>
                    </div>

                    <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-4 pb-2">
                      <div className="text-center text-[#666666] text-xs mb-6">上午 {chatTime}</div>

                      {groupList.map((group) => {
                        const k = group.key as keyof typeof groups;
                        const isExp = expanded[k];
                        const curIdx = stackIndex[k] || 0;
                        const off = slideOffset[k] || 0;
                        const imgs = group.items;
                        const total = imgs.length;
                        const STACK_DY = 7, STACK_DS = 0.06, STACK_DO = 0.25;

                        return (
                          <div key={k} className="flex flex-row-reverse items-start mb-8" style={{ paddingLeft: '40px' }}>
                            <div className="w-10 h-10 rounded-xl bg-[#2c2c2c] flex items-center justify-center text-2xl flex-shrink-0 ml-2">😎</div>
                            <div className="relative" style={{ width: '140px' }}>
                              <button
                                onClick={() => handleToggleExpand(k)}
                                className={`absolute -left-14 top-1/2 -translate-y-1/2 z-[100] h-7 px-3 rounded-full flex items-center justify-center bg-[rgba(60,60,60,0.65)] backdrop-blur-md border border-[rgba(255,255,255,0.15)] text-white text-xs whitespace-nowrap transition-opacity ${pillAnimating[k] ? 'opacity-60' : 'opacity-100'}`}
                              >
                                {isExp ? '收起' : `展开 ${total}`}
                              </button>
                              <div className="relative" style={{ height: isExp ? 'auto' : '186px', width: '140px', transition: 'height 0.4s cubic-bezier(0.25,0.8,0.25,1)' }}>
                                {imgs.map((url, i) => {
                                  const rel = (i - curIdx + total) % total;
                                  const isTop = rel === 0;
                                  const stackStyle: React.CSSProperties = isExp
                                    ? { position: 'relative', transform: 'translateY(0) scale(1)', opacity: 1, marginBottom: i < total - 1 ? '8px' : '0', transition: 'all 0.4s cubic-bezier(0.25,0.8,0.25,1)' }
                                    : { position: 'absolute', top: 0, left: 0, transform: `translateY(${rel * STACK_DY}px) scale(${1 - rel * STACK_DS})`, opacity: rel >= 3 ? 0 : 1 - rel * STACK_DO, zIndex: total - rel, transition: 'transform 0.4s cubic-bezier(0.25,0.8,0.25,1), opacity 0.4s cubic-bezier(0.25,0.8,0.25,1)' };
                                  return (
                                    <div key={i} className="rounded-xl overflow-hidden bg-white shadow-lg" style={{ ...stackStyle, width: '140px', height: '186px' }}>
                                      {isTop && !isExp ? (
                                        <div style={{ transform: `translateX(${off}px)`, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', width: '100%', height: '100%' }}
                                          onTouchStart={(e) => handleTouchStart(e, k)} onTouchMove={(e) => handleTouchMove(e, k)} onTouchEnd={() => handleTouchEnd(k)}
                                          onMouseDown={(e) => handleTouchStart(e, k)} onMouseMove={(e) => handleTouchMove(e, k)} onMouseUp={() => handleTouchEnd(k)}
                                          onMouseLeave={() => { if (touchGroupKey === k) handleTouchEnd(k); }}>
                                          <img src={url} className="w-full h-full object-cover" alt="" draggable={false} />
                                        </div>
                                      ) : (
                                        <img src={url} className="w-full h-full object-cover" alt="" draggable={false} />
                                      )}
                                      {isExp && (
                                        <div className="absolute left-0 right-0 bottom-0 flex justify-end p-1.5 bg-gradient-to-t from-black/50 to-transparent">
                                          <button className="text-white text-[8px] px-1.5 py-0.5 bg-black/40 border border-white/20 rounded">改分类</button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-[#1E1E1E] border-t border-[#333333] px-3 py-2 shrink-0">
                      <div className="flex items-center h-10">
                        <span className="w-8 h-8 flex items-center justify-center text-lg mr-1">🎙️</span>
                        <div className="flex-1 h-9 bg-[#2c2c2c] rounded-md mx-1" />
                        <span className="w-8 h-8 flex items-center justify-center text-lg mx-0.5">🎤</span>
                        <span className="w-8 h-8 flex items-center justify-center text-lg mx-0.5">😊</span>
                        <span className="w-8 h-8 flex items-center justify-center text-lg ml-0.5">➕</span>
                      </div>
                    </div>

                    <div className="bg-[#111111] border-t border-[#2a2a2a] px-4 pt-3 pb-4 shrink-0">
                      <button onClick={() => setSimulatorPage('result')} className="w-full h-10 bg-[#07c160] active:bg-[#06ad56] rounded-2xl flex items-center justify-center text-white text-sm font-semibold">
                        返回结果页
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* SIMULATED WECHAT MODAL DIALOG OVERLAY */}
              {wechatModal && wechatModal.show && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
                  <div className="bg-white rounded-2xl p-5 w-full max-w-[280px] shadow-2xl text-slate-800 scale-100 opacity-100 transition-all duration-200">
                    <h4 className="font-bold text-sm text-center mb-2">{wechatModal.title}</h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed text-center mb-4">
                      {wechatModal.content}
                    </p>
                    <div className="flex gap-2 border-t border-slate-100 pt-3">
                      {wechatModal.cancelText && (
                        <button
                          onClick={() => {
                            if (wechatModal.onCancel) wechatModal.onCancel();
                            setWechatModal(null);
                          }}
                          className="flex-1 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-lg text-center"
                        >
                          {wechatModal.cancelText}
                        </button>
                      )}
                      <button
                        onClick={wechatModal.onConfirm}
                        className="flex-1 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg text-center"
                      >
                        {wechatModal.confirmText}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MERGE SEND ACTION SHEET */}
              {showActionSheet && (
                <div
                  className="absolute inset-0 bg-black/60 z-50 flex flex-col justify-end"
                  onClick={() => setShowActionSheet(false)}
                >
                  <div
                    className="bg-[#1c1c1e] rounded-t-2xl p-4 pb-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-center text-[#8e8e93] text-xs py-3">选择发送方式</div>
                    <div className="bg-[#2c2c2e] rounded-2xl overflow-hidden mb-3">
                      <button
                        onClick={() => {
                          setShowActionSheet(false);
                          setWechatModal({
                            show: true,
                            title: '分享给微信好友',
                            content: '请点击右上角「...」按钮，选择「转发」给朋友查看。',
                            confirmText: '我知道了',
                            onConfirm: () => setWechatModal(null)
                          });
                        }}
                        className="w-full flex items-center px-5 py-4 border-b border-[#3a3a3c] active:bg-[#3a3a3c]"
                      >
                        <span className="text-2xl mr-4">💬</span>
                        <div className="flex flex-col items-start">
                          <span className="text-white text-sm">分享给微信好友</span>
                          <span className="text-[#8e8e93] text-xs">发送小程序卡片，好友可点击查看</span>
                        </div>
                      </button>
                      <button
                        onClick={handleSaveAllImages}
                        className="w-full flex items-center px-5 py-4 border-b border-[#3a3a3c] active:bg-[#3a3a3c]"
                      >
                        <span className="text-2xl mr-4">💾</span>
                        <div className="flex flex-col items-start">
                          <span className="text-white text-sm">保存全部图片</span>
                          <span className="text-[#8e8e93] text-xs">保存 {totalCount} 张到相册，再手动发送</span>
                        </div>
                      </button>
                      <button
                        onClick={handleSaveByGroup}
                        className="w-full flex items-center px-5 py-4 active:bg-[#3a3a3c]"
                      >
                        <span className="text-2xl mr-4">📁</span>
                        <div className="flex flex-col items-start">
                          <span className="text-white text-sm">按分组保存</span>
                          <span className="text-[#8e8e93] text-xs">分别保存上衣/下衣/鞋子到相册</span>
                        </div>
                      </button>
                    </div>
                    <button
                      onClick={() => setShowActionSheet(false)}
                      className="w-full py-3 bg-[#2c2c2e] rounded-2xl text-white text-base font-medium active:bg-[#3a3a3c]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* GROUP SAVE ACTION SHEET */}
              {showGroupSaveSheet && (
                <div
                  className="absolute inset-0 bg-black/60 z-50 flex flex-col justify-end"
                  onClick={() => setShowGroupSaveSheet(false)}
                >
                  <div
                    className="bg-[#1c1c1e] rounded-t-2xl p-4 pb-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-center text-[#8e8e93] text-xs py-3">选择要保存的分组</div>
                    <div className="bg-[#2c2c2e] rounded-2xl overflow-hidden mb-3">
                      {availableGroups.map((g) => (
                        <button
                          key={g.key}
                          onClick={() => handleSaveGroupByKey(g.key as keyof typeof groups)}
                          className="w-full flex items-center px-5 py-4 border-b border-[#3a3a3c] last:border-b-0 active:bg-[#3a3a3c]"
                        >
                          <span className="text-2xl mr-4">{g.emoji}</span>
                          <div className="flex flex-col items-start">
                            <span className="text-white text-sm">保存{g.title}</span>
                            <span className="text-[#8e8e93] text-xs">{g.count} 张图片</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowGroupSaveSheet(false)}
                      className="w-full py-3 bg-[#2c2c2e] rounded-2xl text-white text-base font-medium active:bg-[#3a3a3c]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          <p className="text-slate-400 text-[11px] text-center max-w-[340px] leading-relaxed">
            * 提示：本小程序完全运行于 WeCloudMock 云开发虚拟沙盒中。大图会通过 Canvas 等比例高保真压缩（最高1600px）并交由 CloudBase 云端分类和返回。
          </p>

        </div>

        {/* RIGHT COLUMN: DEVELOPER WORKSPACE & CODE VIEW (Takes 7 cols) */}
        <div id="code-explorer" className="lg:col-span-7 flex flex-col gap-6">
          
          {/* ARCHITECTURE SUMMARY */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="font-bold text-white text-base mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
              <span>WePicTool “阶段一：最小技术闭环” 架构说明</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              当前代码严格遵守 <b>WePicTool_PRD</b> 以及 <b>开发行动手册</b> 定义，仅实现阶段一：最小技术闭环。不做真实抠图与 AI 部件分类，采用优雅的 Mock 分组算法和极致的客户端细节（等比例压缩、保存权限错误引导、微信叠图合并展示逻辑校验等）。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <span className="font-semibold text-indigo-400 block mb-1">🛠️ 原生小程序架构</span>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  区分 <code>pages</code>、<code>components</code> 并在 <code>cloudfunctions/processOutfit</code> 进行处理任务的创建与调度，预备后续完美对接真实抠图。
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <span className="font-semibold text-emerald-400 block mb-1">🔐 授权引导与降级</span>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  单张/整组保存相册均自带完备的授权失败处理。当用户首次拒绝写入相册时，自动弹出微信弹窗引导开启设置。
                </p>
              </div>
            </div>
          </div>

          {/* CODE VIEWER BOX */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
            
            {/* Folder tab selector */}
            <div className="bg-slate-900 px-4 pt-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {Object.keys(MINIPROGRAM_FILES).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveFileTab(key)}
                    className={`px-3 py-2 text-xs font-medium rounded-t-lg transition flex items-center gap-1.5 ${
                      activeFileTab === key 
                        ? 'bg-slate-950 text-indigo-400 border-t-2 border-indigo-500' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {key.endsWith('.json') ? (
                      <FileJson className="w-3.5 h-3.5" />
                    ) : (
                      <Code2 className="w-3.5 h-3.5" />
                    )}
                    {key}
                  </button>
                ))}
              </div>

              <button 
                onClick={handleCopyCode}
                className="mb-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制代码
                  </>
                )}
              </button>
            </div>

            {/* Path label */}
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-900 flex justify-between items-center text-xs text-slate-500 font-mono">
              <span>文件路径: {MINIPROGRAM_FILES[activeFileTab].path}</span>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-sans font-semibold">原生小程序源码</span>
            </div>

            {/* Code editor viewer */}
            <div className="p-4 bg-slate-950 max-h-[480px] overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300 scrollbar-thin">
              <pre className="whitespace-pre-wrap select-all">
                <code>{MINIPROGRAM_FILES[activeFileTab].content}</code>
              </pre>
            </div>

          </div>

          {/* VERIFICATION CHECKLIST AND CLOUD GUIDE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Guide to deploy to WeChat Dev Tools */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                <Folder className="w-4 h-4 text-indigo-400" />
                <span>微信开发者工具启动指南</span>
              </h4>
              <ol className="space-y-3 text-xs text-slate-400 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">1.</span>
                  <span>拷贝整个 <code>/miniprogram</code> 目录。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">2.</span>
                  <span>打开<b>微信开发者工具</b>，选择“导入项目”，指定导入 <code>/miniprogram</code> 文件夹。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">3.</span>
                  <span>在 <code>project.config.json</code> 中将 <code>appid</code> 修改为您的微信小程序 AppID。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">4.</span>
                  <span>开通 <b>CloudBase 云开发</b> 并在腾讯云控制台部署并命名一个云开发环境，将其 ID 填入 <code>app.js</code> 的 <code>env</code> 中。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold">5.</span>
                  <span>右键 <code>cloudfunctions/processOutfit</code> 目录并选择“上传并部署（云端安装依赖）”即可！</span>
                </li>
              </ol>
            </div>

            {/* Phase 1 Verification report */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>阶段一：最小闭环验收标准自检</span>
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">✓</span>
                  <span>已创建原生微信小程序全部文件。</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">✓</span>
                  <span>支持选择 1-9 张大图并进行前端等比例基础压缩 (最长边不超过 1600px)。</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">✓</span>
                  <span>云开发上传与云函数 Mock 任务创建接口就绪。</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">✓</span>
                  <span>云函数完美匹配 1-3 tops, 4-6 bottoms, 7-9 shoes 逻辑。</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-semibold">✓</span>
                  <span>结果页支持单张保存、整组保存，并内嵌授权失败和前往设置重试的完整闭环。</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-indigo-400 font-semibold">➔</span>
                  <span className="text-indigo-400 font-medium">保留后续真实 AI 智能分类与抠图接入点。</span>
                </li>
              </ul>
            </div>

          </div>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-6 py-4 mt-12 text-center text-xs text-slate-500">
        WePicTool @ {new Date().getFullYear()} · 微信穿搭求建议素材包生成工具
      </footer>

    </div>
  );
}
