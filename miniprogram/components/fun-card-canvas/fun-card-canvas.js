var font = require('../../utils/funTextFont');
var painter = require('../../utils/scenePainter');
var env = require('../../config/env');

Component({
  properties: {
    scene: { type: Object, value: null },
    size: { type: Number, value: 360 },
    revision: { type: Number, value: 0 }
  },

  lifetimes: {
    attached: function () {
      this.initCanvasAndPaint();
    },
    ready: function () {
      this.initCanvasAndPaint();
    }
  },

  observers: {
    'scene, size, revision': function () {
      this.paintCurrentScene();
    }
  },

  methods: {
    initCanvasAndPaint: function () {
      var component = this;
      if (!component._fontLoading && !component.fontReady) {
        component._fontLoading = true;
        font.loadFunTextFont(wx, env.FUN_CARD_RENDERER_URL).then(function () {
          component.fontReady = true;
          component._fontLoading = false;
          return component.paintCurrentScene();
        }).catch(function (error) {
          component._fontLoading = false;
          // 字体加载失败不中断界面显示，降级使用默认字体绘制
          return component.paintCurrentScene();
        });
      } else {
        component.paintCurrentScene();
      }
    },

    paintCurrentScene: function (retryCount) {
      var component = this;
      var scene = component.properties.scene;
      var size = Number(component.properties.size) || 360;
      var attempt = Number(retryCount) || 0;
      if (!scene) return Promise.resolve();

      return new Promise(function (resolve, reject) {
        wx.createSelectorQuery().in(component).select('#cardCanvas').fields({ node: true, size: true }).exec(function (result) {
          var canvasInfo = result && result[0];
          if (!canvasInfo || !canvasInfo.node) {
            if (attempt < 3) {
              setTimeout(function () {
                component.paintCurrentScene(attempt + 1).then(resolve).catch(reject);
              }, 80);
              return;
            }
            reject(new Error('预览画布不可用'));
            return;
          }
          try {
            var sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
            var pixelRatio = Number(sys && sys.pixelRatio) || 1;
            var canvas = canvasInfo.node;
            canvas.width = size * pixelRatio;
            canvas.height = size * pixelRatio;
            var context = canvas.getContext('2d');
            context.scale(pixelRatio, pixelRatio);
            painter.paintScene(context, scene, size);
            component.triggerEvent('ready', { sceneId: scene.sceneId });
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      }).catch(function (error) {
        component.triggerEvent('rendererror', {
          message: (error && error.message) || '场景预览失败'
        });
      });
    }
  }
});
