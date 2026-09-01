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
      this.loadFontAndPaint();
    }
  },

  observers: {
    'scene, size, revision': function () {
      if (this.fontReady) this.paintCurrentScene();
    }
  },

  methods: {
    loadFontAndPaint: function () {
      var component = this;
      return font.loadFunTextFont(wx, env.FUN_CARD_RENDERER_URL).then(function () {
        component.fontReady = true;
        return component.paintCurrentScene();
      }).catch(function (error) {
        component.triggerEvent('rendererror', {
          message: (error && error.message) || '手写字体加载失败'
        });
      });
    },

    paintCurrentScene: function () {
      var component = this;
      var scene = component.properties.scene;
      var size = Number(component.properties.size) || 360;
      if (!scene) return Promise.resolve();
      return new Promise(function (resolve, reject) {
        wx.createSelectorQuery().in(component).select('#cardCanvas').fields({ node: true, size: true }).exec(function (result) {
          var canvasInfo = result && result[0];
          if (!canvasInfo || !canvasInfo.node) {
            reject(new Error('预览画布不可用'));
            return;
          }
          try {
            var pixelRatio = Number(wx.getSystemInfoSync().pixelRatio) || 1;
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
