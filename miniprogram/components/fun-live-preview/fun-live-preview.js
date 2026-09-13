var cache = require('../../utils/funPreviewCache');
var preloader = require('../../utils/funPreviewPreloader');
var painter = require('../../utils/scenePainter');
var ink = require('../../utils/funStrokes');
var inkStickers = require('../../utils/inkStickers');
var localFonts = require('../../utils/localFontRenderer');
var localPreview = require('../../config/env').ENABLE_FUN_OFFLINE_PREVIEW === true;

Component({
  properties: {
    localOnly: {type:Boolean,value:false},
    drawing: { type: Boolean, value: false },
    panMode: {type:Boolean,value:false},
    brushKey: { type: String, value: 'pen' },
    colorKey: { type: String, value: 'black' },
    penWidth: { type: Number, value: 8 },
    scene: { type: Object, value: null },
    projectId: { type: String, value: '' },
    candidateId: { type: String, value: '' }
  },
  data: { url: '', loading: false, failed: false, localPreview: localPreview, localReady: false },
  lifetimes: {
    ready: function () { this.refresh(); },
    detached: function () { this._detached = true; this._key = ''; clearTimeout(this._timer); clearTimeout(this._inkTimer); }
  },
  observers: {
    'scene, projectId, candidateId': function () { this.refresh(); },
    drawing: function () { if (!this.properties.drawing && this._inkDraft) this.inkCancel(); },
    panMode: function () { this.inkCancel(); }
  },
  methods: {
    inkPoint: function (event) {
      var p = event.touches && event.touches[0];
      if (!p || !this._canvasWidth) return null;
      var x = Number.isFinite(p.x) ? p.x : p.clientX - this._rect.left;
      var y = Number.isFinite(p.y) ? p.y : p.clientY - this._rect.top;
      return {x: Math.max(0,Math.min(1080,x/this._canvasWidth*1080)), y: Math.max(0,Math.min(1080,y/this._canvasWidth*1080))};
    },
    inkStart: function (event) {
      if (!this.properties.drawing) { this.triggerEvent('browsestart',{touches:event.touches}); return; }
      if (!this.properties.drawing || event.touches.length !== 1) return;
      var p = this.inkPoint(event); if (!p) return;
      if(this.properties.panMode) {
        this._panStart=p;this._panOriginal=Object.assign({},this.properties.scene.viewport || {x:0,y:0});return;
      }
      var viewport=this.properties.scene.viewport || {x:0,y:0};
      p={x:p.x+viewport.x,y:p.y+viewport.y};
      this._inkSceneId = this.properties.scene.sceneId;
      this._inkDraft = (this.properties.scene.strokes || []).slice();
      this._eraser = this.properties.brushKey === 'eraser';
      this._eraseLast=p;
      this._stroke = this._eraser ? null : {id:'stroke_'+Date.now()+'_'+Math.random().toString(36).slice(2,10),
        brushKey:this.properties.brushKey,colorKey:this.properties.colorKey,width:this.properties.penWidth,points:[p]};
      this.triggerEvent('inking',{active:true});
      this.inkMove(event);
    },
    inkMove: function (event) {
      if(this._panStart) {
        if(event.touches.length!==1)return this.inkCancel();
        var point=this.inkPoint(event);if(!point)return;
        var max=(this.properties.scene.workspaceSize || 1080)-1080;
        this._panViewport={x:Math.max(0,Math.min(max,this._panOriginal.x+this._panStart.x-point.x)),y:Math.max(0,Math.min(max,this._panOriginal.y+this._panStart.y-point.y))};
        this._committedStrokes=null;this.paintInk();return;
      }
      if (!this._inkDraft) return;
      if (event.touches.length !== 1) return this.inkCancel();
      var p=this.inkPoint(event); if (!p) return;
      var viewport=this.properties.scene.viewport || {x:0,y:0};
      p={x:p.x+viewport.x,y:p.y+viewport.y};
      if (this._eraser) {
        try {this._inkDraft=ink.erasePartial(this._inkDraft,this._eraseLast,p,this.properties.penWidth/2,this.properties.scene.workspaceSize);}
        catch(error){if(!this._limitReported){this._limitReported=true;this.triggerEvent('inklimit',{message:error.message});}}
        this._eraseLast=p;
      }
      else if (this._stroke.points.length < 1000) {
        var last=this._stroke.points[this._stroke.points.length-1];
        if (Math.hypot(p.x-last.x,p.y-last.y)>=1.5) this._stroke.points.push(p);
      } else if (!this._limitReported) {
        this._limitReported=true;this.triggerEvent('inklimit');
      }
      if (!this._inkTimer) {
        var that=this; this._inkTimer=setTimeout(function(){that._inkTimer=null;that.paintInk();},16);
      }
    },
    inkEnd: function (event) {
      if (!this.properties.drawing && event) { this.triggerEvent('browseend',{changedTouches:event.changedTouches}); return; }
      if(this._panStart) {
        if(this._panViewport)this.triggerEvent('viewportchange',this._panViewport);
        this.inkCancel();return;
      }
      if (!this._inkDraft) return;
      var strokes=this._inkDraft.concat(this._stroke ? [this._stroke] : []);
      if (this.properties.scene.sceneId===this._inkSceneId) {
        if (ink.valid(strokes,this.properties.scene.workspaceSize)) this.triggerEvent('inkchange',{strokes:strokes});
        else this.triggerEvent('inklimit');
      }
      this.inkCancel();
    },
    inkCancel: function () {
      this.triggerEvent('browsecancel');
      if(this._panStart)this._committedStrokes=null;
      this._panStart=null;this._panViewport=null;
      this._inkDraft=null; this._stroke=null;this._limitReported=false;
      clearTimeout(this._inkTimer);this._inkTimer=null;
      this.triggerEvent('inking',{active:false});this.paintInk();
    },
    paintInk: function () {
      if (!this._inkContext || this._detached) return;
      var ctx=this._inkContext, width=this._canvasWidth;
      var scene=this.properties.scene;
      if (scene && this._inkSceneRef!==scene) {
        this._inkSceneRef=scene;this._flatInk=scene.workspaceSize ? scene.strokes : inkStickers.flatten(scene);
      }
      var completed=this._inkDraft || this._flatInk || this._emptyStrokes || (this._emptyStrokes=[]);
      if (this._committedContext && this._committedStrokes !== completed) {
        this._committedContext.clearRect(0,0,width,width);
        this.paintViewport(this._committedContext,completed,width);
        this._committedStrokes=completed;
      }
      ctx.clearRect(0,0,width,width);
      this.paintViewport(ctx,this._stroke ? [this._stroke] : [],width);
    },
    paintViewport:function(ctx,strokes,width) {
      var scene=this.properties.scene || {};
      ctx.save();
      if(scene.workspaceSize) {
        if(this.properties.drawing) {
          var viewport=this._panViewport || scene.viewport || {x:0,y:0};
          ctx.translate(-viewport.x*width/1080,-viewport.y*width/1080);
        } else ctx.scale(1080/scene.workspaceSize,1080/scene.workspaceSize);
      }
      ink.paint(ctx,strokes,width);ctx.restore();
    },
    payload: function () {
      return { projectId: this.properties.projectId, candidateId: this.properties.candidateId, scene: this.properties.scene };
    },
    refresh: function () {
      if (!this.properties.scene || this._detached) return;
      if (this._inkDraft && this._inkSceneId !== this.properties.scene.sceneId) this.inkCancel();
      this.paintOverlays();
      if(this.properties.localOnly) {this.setData({loading:false,failed:false,url:''});return;}
      if (localPreview) { this.loadLocalBase(); return; }
      var key = cache.previewKey(this.payload());
      if (key === this._key) return;
      // Invalidate an older in-flight result immediately, before debounce finishes.
      this._key = key;
      clearTimeout(this._timer);
      var identity = this.properties.projectId + '/' + this.properties.candidateId + '/' + this.properties.scene.sceneId;
      var cached=cache.shared.peek && cache.shared.peek(this.payload());
      if(cached){this._identity=identity;this._loadedKey=key;this.setData({url:cached,loading:false,failed:false});return;}
      if (this._identity !== identity) { this._identity = identity; this.setData({ url: '' }); }
      this.setData({ loading: true, failed: false });
      this._timer = setTimeout(this.loadBase.bind(this), 0);
    },
    loadBase: function () {
      if (localPreview) return this.loadLocalBase();
      var that = this;
      var payload = this.payload();
      var key = cache.previewKey(payload);
      if (this._loadedKey === key) return Promise.resolve();
      this._key = key;
      this.setData({ loading: true, failed: false });
      return cache.shared.get(payload, function (input) { return preloader.request(wx, input); }).then(function (url) {
        if (that._detached || that._key !== key) return;
        that._loadedKey = key;
        that.setData({ url: url, loading: false, failed: false });
      }).catch(function (error) {
        if (that._detached || that._key !== key) return;
        var messages={CONTENT_UNSAFE:'内容审核未通过，请修改文字',SAFETY_UNAVAILABLE:'审核暂不可用，点此重试',
          CALLER_UNAUTHORIZED:'登录校验失败，点此重试',CALLER_AUTH_UNAVAILABLE:'登录暂不可用，点此重试',
          RATE_LIMITED:'请求较多，请稍后重试',NETWORK_ERROR:'网络连接失败，点此重试'};
        that.setData({ loading: false, failed: true, errorText:messages[error && error.code] || '预览生成或下载失败，点此重试' });
      });
    },
    retry: function () {
      if (localPreview) { this._localLoadedKey=''; return this.loadLocalBase(); }
      cache.shared.invalidate(this.payload()); this._loadedKey = ''; this.loadBase();
    },
    imageFailed: function () {
      cache.shared.invalidate(this.payload()); this._loadedKey = '';
      this.setData({ url: '', loading: false, failed: true, errorText:'预览图片读取失败，点此重试' });
    },
    loadLocalBase: function () {
      if (!this.properties.scene || this.properties.localOnly || this._detached) return Promise.resolve();
      var that=this, scene=this.properties.scene, key=JSON.stringify([scene.background,scene.layers]);
      this._localKey=key;
      if(this._localLoadedKey===key) {
        this.setData({loading:false,failed:false}); return Promise.resolve();
      }
      // Font parsing is shared. Only the latest scene may paint after it completes.
      this.setData({loading:!localFonts.hasScene(scene),failed:false,url:''});
      return localFonts.ensureScene(wx,scene).then(function(){
        if(that._detached || that._localKey!==key)return;
        return new Promise(function(resolve,reject){
          if(!wx.createSelectorQuery)return reject(new Error('画布不可用'));
          wx.createSelectorQuery().in(that).select('#localBase').fields({node:true,size:true}).exec(function(result){
            if(that._detached || that._localKey!==key)return resolve();
            var item=result && result[0];
            // Observer may run before ready. ready will retry when the canvas exists.
            if(!item || !item.node || !item.width)return resolve();
            try {
              var ratio=Math.min(wx.getSystemInfoSync().pixelRatio || 1,3);
              var canvas=item.node;
              canvas.width=Math.round(item.width*ratio);canvas.height=canvas.width;
              var ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
              // Composite text and decorations together: native canvas stacking differs by device.
              painter.paintScene(ctx,scene,item.width,{drawText:localFonts.drawText});
              that._localLoadedKey=key;
              that.setData({loading:false,failed:false,localReady:true});resolve();
            }catch(error){reject(error);}
          });
        });
      }).catch(function(error){
        if(that._detached || that._localKey!==key)return;
        that._localDiagnostic = error && error.code==='FONT_GLYPH_MISSING' ? 'FONT_GLYPH_MISSING' : String(error && (error.stack || error.message) || 'FONT_LOAD_FAILED');
        that.setData({loading:false,failed:true,errorText:error && error.code==='FONT_GLYPH_MISSING' ? error.message : '本机字体资源未就绪，点此重试'});
      });
    },
    paintOverlays: function () {
      var that = this;
      if (!wx.createSelectorQuery) return;
      wx.createSelectorQuery().in(this).select('#overlay').fields({ node: true, size: true }).exec(function (result) {
        var item = result && result[0];
        if (!item || !item.node || !item.width || that._detached || !that.properties.scene) return;
        var ratio = (wx.getSystemInfoSync().pixelRatio || 1);
        var canvas = item.node;
        canvas.width = Math.round(item.width * ratio); canvas.height = canvas.width;
        var ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
        var scene = Object.assign({}, that.properties.scene, {
          background: that.properties.localOnly ? that.properties.scene.background : { color: 'rgba(0,0,0,0)' },
          layers: localPreview && !that.properties.localOnly ? [] : that.properties.scene.layers.filter(function (layer) { return layer.type !== 'text'; })
        });
        painter.paintScene(ctx, scene, item.width);
        that._canvasWidth = item.width;
        that.triggerEvent('geometry', { width: item.width });
      });
      ['committed','ink'].forEach(function(id) {
      wx.createSelectorQuery().in(that).select('#'+id).fields({node:true,size:true,rect:true}).exec(function(result) {
        var item=result && result[0]; if(!item || !item.node || !item.width || that._detached) return;
        var ratio=wx.getSystemInfoSync().pixelRatio || 1;
        item.node.width=Math.round(item.width*ratio);item.node.height=item.node.width;
        var context=item.node.getContext('2d');context.scale(ratio,ratio);
        if(id==='committed') {that._committedContext=context;that._committedStrokes=null;}
        else that._inkContext=context;
        that._rect=item;that._canvasWidth=item.width;that.paintInk();
      });
      });
    }
  }
});
