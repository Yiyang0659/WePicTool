var COLORS = Object.freeze({ black:'#24303A', pink:'#F35C8C', blue:'#2077D4', purple:'#7657FF', yellow:'#FFD166', white:'#FFFFFF' });
var WIDTHS = [4,8,12,16,24,28,40,56,72,96];
var eraseSequence=0;
function valid(strokes, workspaceSize) {
  var size = workspaceSize === undefined ? 1080 : workspaceSize;
  if (size !== 1080 && size !== 2160) return false;
  if (!Array.isArray(strokes) || strokes.length > 100) return false;
  var ids = new Set(), total = 0;
  return strokes.every(function (s) {
    if (!s || typeof s.id !== 'string' || !/^stroke_[a-zA-Z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id)) return false;
    ids.add(s.id);
    if (['pen','highlighter'].indexOf(s.brushKey) < 0 || !Object.prototype.hasOwnProperty.call(COLORS,s.colorKey) || WIDTHS.indexOf(s.width) < 0) return false;
    if (!Array.isArray(s.points) || !s.points.length || s.points.length > 1000) return false;
    total += s.points.length;
    return total <= 20000 && s.points.every(function(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.y>=0 && p.x<=size && p.y<=size; });
  });
}
function distance(p,a,b) {
  var dx=b.x-a.x, dy=b.y-a.y, square=dx*dx+dy*dy;
  var t=square ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/square)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function erase(strokes, point, radius) {
  return strokes.filter(function(s) {
    return !s.points.some(function(p,i) { return distance(point,p,s.points[Math.max(0,i-1)]) <= radius+s.width/2; });
  });
}
// Clip centre lines outside a circular eraser, including half the pen width.
// Keep disconnected fragments separate so erased gaps never reconnect on export.
function erasePartial(strokes, from, to, radius, workspaceSize) {
  var result=strokes, serial=0, prefix='stroke_erase_'+Date.now()+'_'+(eraseSequence++)+'_';
  var steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/Math.max(1,radius/2)));
  for(var step=0;step<=steps;step++) {
    var c={x:from.x+(to.x-from.x)*step/steps,y:from.y+(to.y-from.y)*step/steps};
    var next=[];
    result.forEach(function(s) {
      var r=radius+s.width/2, chunks=[], chunk=[], changed=false;
      function flush(){if(chunk.length)chunks.push(chunk);chunk=[];}
      if(s.points.length===1) {
        if(Math.hypot(s.points[0].x-c.x,s.points[0].y-c.y)>r) next.push(s);
        return;
      }
      for(var i=1;i<s.points.length;i++) {
        var a=s.points[i-1],b=s.points[i],dx=b.x-a.x,dy=b.y-a.y;
        var aa=dx*dx+dy*dy, bb=2*((a.x-c.x)*dx+(a.y-c.y)*dy), cc=(a.x-c.x)*(a.x-c.x)+(a.y-c.y)*(a.y-c.y)-r*r;
        var cuts=[0,1],disc=bb*bb-4*aa*cc;
        if(aa && disc>0) {
          var root=Math.sqrt(disc);
          [(-bb-root)/(2*aa),(-bb+root)/(2*aa)].forEach(function(t){if(t>0 && t<1)cuts.push(t);});
        }
        cuts.sort(function(x,y){return x-y;});
        for(var j=1;j<cuts.length;j++) {
          var lo=cuts[j-1],hi=cuts[j],mid=(lo+hi)/2;
          if(Math.hypot(a.x+dx*mid-c.x,a.y+dy*mid-c.y)<=r) {changed=true;flush();continue;}
          if(!chunk.length)chunk.push({x:a.x+dx*lo,y:a.y+dy*lo});
          chunk.push({x:a.x+dx*hi,y:a.y+dy*hi});
        }
      }
      flush();
      if(!changed) {next.push(s);return;}
      chunks.forEach(function(points){next.push(Object.assign({},s,{id:prefix+(serial++),points:points}));});
    });
    if(!valid(next,workspaceSize)) throw new Error('擦除分段达到容量上限，请撤销或减少笔迹');
    result=next;
  }
  return result;
}
function paint(context, strokes, size) {
  var ratio=size/1080;
  strokes.forEach(function(s) {
    context.save();
    context.globalAlpha=s.brushKey==='highlighter' ? 0.35 : 1;
    context.strokeStyle=COLORS[s.colorKey]; context.fillStyle=COLORS[s.colorKey];
    context.lineWidth=s.width*ratio; context.lineCap='round'; context.lineJoin='round';
    context.beginPath();
    if(s.points.length===1) {
      context.arc(s.points[0].x*ratio,s.points[0].y*ratio,s.width*ratio/2,0,Math.PI*2); context.fill();
    } else {
      context.moveTo(s.points[0].x*ratio,s.points[0].y*ratio);
      s.points.slice(1).forEach(function(p) { context.lineTo(p.x*ratio,p.y*ratio); }); context.stroke();
    }
    context.restore();
  });
}
module.exports={COLORS:COLORS,WIDTHS:WIDTHS,valid:valid,erase:erase,erasePartial:erasePartial,paint:paint};
