var opentype = require('../vendor/opentype');
var manifest = require('../config/localFontManifest');
var packages = require('../config/localFontPackages');

function createLoader(loadPackage) {
  loadPackage = loadPackage || packages.load;
  var ready = Object.create(null), pending = Object.create(null);
  function ensure(api, key) {
    if (!manifest[key]) return Promise.reject(new Error('未知字体'));
    if (ready[key]) return Promise.resolve(ready[key]);
    if (pending[key]) return pending[key];
    var spec = manifest[key];
    pending[key] = (async function () {
      var bytes = new Uint8Array(spec.bytes), offset = 0;
      for (var i = 0; i < spec.parts.length; i++) {
        var name = spec.parts[i];
        var resource = await new Promise(function (resolve, reject) {
          var timer=setTimeout(function(){reject(new Error('字体资源加载超时'));},15000);
          try {
            loadPackage(name).then(function(result){clearTimeout(timer);resolve(result);},
              function(error){clearTimeout(timer);reject(error);});
          }catch(error){clearTimeout(timer);reject(error);}
        });
        var part = new Uint8Array(resource.read(api));
        bytes.set(part, offset); offset += part.length;
      }
      if (offset !== spec.bytes) throw new Error('字体资源不完整');
      ready[key] = opentype.parse(bytes.buffer, {lowMemory:true});
      return ready[key];
    })().then(function (font) { delete pending[key]; return font; }, function (error) { delete pending[key]; throw error; });
    return pending[key];
  }
  function ensureScene(api, scene) {
    var keys = [];
    (scene.layers || []).forEach(function (layer) {
      if (layer.type === 'text' && keys.indexOf(layer.fontKey || 'marker') < 0) keys.push(layer.fontKey || 'marker');
    });
    return Promise.all(keys.map(function (key) { return ensure(api, key); })).then(function () {
      // Check before clearing the previous canvas; unsupported text is not silently substituted.
      (scene.layers || []).filter(function(l){return l.type==='text';}).forEach(function (layer) {
        var font = ready[layer.fontKey || 'marker'];
        Array.from((layer.lines || []).join('')).forEach(function (char) {
          if (!font.charToGlyphIndex(char)) throw Object.assign(new Error('当前字体不支持部分字符，请换字体或修改文字'), {code:'FONT_GLYPH_MISSING'});
        });
      });
    });
  }
  function drawText(ctx, text, x, y, layer, ratio, stroke) {
    var font = ready[layer.fontKey || 'marker'];
    if (!font) throw new Error('字体尚未就绪');
    var size = layer.fontSize * ratio;
    var width = font.getAdvanceWidth(text, size);
    var align = layer.align || 'center';
    var left = x - (align === 'center' ? width / 2 : align === 'right' ? width : 0);
    var baseline = y + (font.ascender + font.descender) * size / font.unitsPerEm / 2;
    var commands = font.getPath(text, left, baseline, size).commands;
    ctx.beginPath();
    commands.forEach(function (c) {
      if (c.type === 'M') ctx.moveTo(c.x,c.y);
      else if (c.type === 'L') ctx.lineTo(c.x,c.y);
      else if (c.type === 'Q') ctx.quadraticCurveTo(c.x1,c.y1,c.x,c.y);
      else if (c.type === 'C') ctx.bezierCurveTo(c.x1,c.y1,c.x2,c.y2,c.x,c.y);
      else if (c.type === 'Z') ctx.closePath();
    });
    if (stroke) ctx.stroke(); else ctx.fill();
  }
  function warm(api) {
    // Sequential warm-up keeps parsing spikes bounded; foreground shares each promise.
    return Object.keys(manifest).reduce(function (p,key) { return p.then(function () { return ensure(api,key); }); }, Promise.resolve());
  }
  function hasScene(scene) {
    return (scene.layers || []).every(function(l){return l.type!=='text' || !!ready[l.fontKey || 'marker'];});
  }
  return {ensure:ensure, ensureScene:ensureScene, drawText:drawText, warm:warm, hasScene:hasScene};
}
module.exports = createLoader();
module.exports.createLoader = createLoader;
