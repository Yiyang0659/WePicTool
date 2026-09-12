const ink = require('./funStrokes');
function flatten(scene) {
  const groups = scene.inkStickers || [];
  if (!Array.isArray(groups) || groups.length > 10) throw new Error('每张卡最多10个手写贴纸');
  let strokes = (scene.strokes || []).slice();
  const ids = new Set();
  groups.forEach(g => {
    if (!g || !/^hw_[a-zA-Z0-9_]+$/.test(g.id) || ids.has(g.id) || !ink.valid(g.strokes,g.workspaceSize) || !g.strokes.length ||
      ![g.x,g.y,g.scale,g.rotation].every(Number.isFinite) || g.scale < 0.35 || g.scale > 2.5 || Math.abs(g.rotation)>180) throw new Error('手写贴纸数据不合法');
    ids.add(g.id);
    const rad=g.rotation*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
    const normalization=1080/(g.workspaceSize || 1080);
    strokes=strokes.concat(g.strokes.map((s,i)=>({id:'stroke_'+g.id+'_'+i,brushKey:s.brushKey,colorKey:s.colorKey,
      width:ink.WIDTHS.reduce((a,b)=>Math.abs(a-s.width*g.scale*normalization)<=Math.abs(b-s.width*g.scale*normalization)?a:b),
      points:s.points.map(p=>({x:g.x+((p.x*normalization-540)*cos-(p.y*normalization-540)*sin)*g.scale,y:g.y+((p.x*normalization-540)*sin+(p.y*normalization-540)*cos)*g.scale}))})));
  });
  if (!ink.valid(strokes)) throw new Error('手写贴纸超出画布或笔迹容量，请缩小或移回画布');
  return strokes;
}
function renderScene(scene) {
  if (!scene.inkStickers) return scene;
  const next=Object.assign({},scene,{strokes:flatten(scene)});
  delete next.inkStickers;
  return next;
}
module.exports={flatten,renderScene};
