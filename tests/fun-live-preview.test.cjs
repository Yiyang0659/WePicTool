const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cacheModule = require('../miniprogram/utils/funPreviewCache');

function preview(request) {
  let definition;
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../miniprogram/components/fun-live-preview/fun-live-preview.js'), 'utf8'), {
    Component(d) { definition = d; }, wx: {}, setTimeout, clearTimeout,
    require(name) {
      if (name.includes('funPreviewCache')) return { ...cacheModule, shared:cacheModule.createPreviewCache() };
      if (name.includes('funPreviewPreloader')) return { request };
      if (name.includes('funStrokes')) return require('../miniprogram/utils/funStrokes');
      if (name.includes('inkStickers')) return require('../miniprogram/utils/inkStickers');
      return { paintScene() {} };
    }
  });
  return Object.assign({ data:{ url:'' }, properties:{ projectId:'p', candidateId:'c', scene:{sceneId:'s',layers:[],background:{}} },
    setData(update) { Object.assign(this.data, update); }, triggerEvent() {} }, definition.methods);
}

test('live preview keeps image during refresh, ignores stale response and skips decoration-only edits', async () => {
  const pending = [];
  const component = preview(() => new Promise(resolve => pending.push(resolve)));
  const first = component.loadBase();
  await Promise.resolve();
  pending[0]('cloud://first'); await first;
  component.properties.scene.layers = [{type:'sticker',x:10}];
  await component.loadBase();
  assert.equal(pending.length, 1);
  component.properties.scene.background = {color:'blue'};
  const second = component.loadBase(); await Promise.resolve();
  assert.equal(component.data.url,'cloud://first');
  component.properties.scene.background = {color:'red'};
  const third = component.loadBase(); await Promise.resolve();
  pending[2]('cloud://third'); await third;
  pending[1]('cloud://second'); await second;
  assert.equal(component.data.url,'cloud://third');
});

test('freehand commits one stroke locally and cancel does not commit', () => {
  const component = preview(() => { throw new Error('drawing must not request renderer'); });
  component.properties.drawing = true;
  component.properties.brushKey = 'pen'; component.properties.colorKey = 'black'; component.properties.penWidth = 8;
  component._canvasWidth = 360;
  component._rect = {left:0,top:0};
  component.paintInk = () => {};
  const emitted = []; component.triggerEvent = (name,data) => emitted.push({name,data});
  const e = x => ({touches:[{x,y:10}]});
  component.inkStart(e(10)); component.inkMove(e(20)); component.inkEnd();
  const commits = emitted.filter(e=>e.name==='inkchange');
  assert.equal(commits.length,1);
  assert.equal(commits[0].data.strokes[0].points[1].x,60);
  component.inkStart(e(30)); component.inkCancel();
  assert.equal(emitted.filter(e=>e.name==='inkchange').length,1);
});

test('text edits replace loaded preview, preserve latest text and show meaningful auth failure',async()=>{
  let seen;
  const component=preview(async(api,payload)=>{seen=payload.scene.layers[0].text;return '/tmp/'+seen;});
  component.properties.scene.layers=[{type:'text',text:'旧文字'}];
  await component.loadBase();
  component.properties.scene={...component.properties.scene,layers:[{type:'text',text:'哈哈哈'}]};
  await component.loadBase();assert.equal(seen,'哈哈哈');assert.equal(component.data.url,'/tmp/哈哈哈');
  const failed=preview(async()=>{throw Object.assign(Error('private'),{code:'CALLER_UNAUTHORIZED'});});
  await failed.loadBase();assert.equal(failed.data.errorText,'登录校验失败，点此重试');
});

test('completed ink is cached across active points and scene change cancels an unfinished stroke', () => {
  const component = preview(async () => 'cloud://test');
  let completedClears=0;
  const context = () => new Proxy({}, {get:(_,key)=>key==='clearRect' ? ()=>completedClears++ : ()=>{}});
  component._committedContext=context(); component._inkContext=context(); component._canvasWidth=360;
  component.properties.scene.strokes=[];
  component.paintInk(); const first=completedClears;
  assert.equal(first,2,'completed and active canvases are separate');
  component.paintInk();
  assert.equal(completedClears-first,1,'only active canvas is cleared for another frame');
  component._inkDraft=[];component._inkSceneId='previous';component._stroke={};
  component.refresh();
  assert.equal(component._inkDraft,null);
  clearTimeout(component._timer);
});

test('pan moves only viewport; subsequent drawing uses world coordinates and cancel restores view',()=>{
  const component=preview(()=>{throw Error('no cloud during panning');});
  Object.assign(component.properties,{drawing:true,panMode:true,localOnly:true,brushKey:'pen',colorKey:'black',penWidth:8});
  component.properties.scene={sceneId:'handwriting',layers:[],strokes:[],workspaceSize:2160,viewport:{x:540,y:540}};
  component._canvasWidth=360;component._rect={left:0,top:0};component.paintInk=()=>{};
  const events=[];component.triggerEvent=(name,data)=>events.push({name,data});
  const e=x=>({touches:[{x,y:100}]});
  component.inkStart(e(100));component.inkMove(e(200));component.inkEnd();
  const v=events.find(e=>e.name==='viewportchange').data;
  assert.equal(v.x,240);assert.ok(!events.some(e=>e.name==='inkchange'));
  component.properties.scene.viewport=v;component.properties.panMode=false;
  component.inkStart(e(100));component.inkEnd();
  assert.equal(events.find(e=>e.name==='inkchange').data.strokes[0].points[0].x,540);
  component.properties.panMode=true;component.inkStart(e(100));component.inkMove(e(0));component.inkCancel();
  assert.equal(component.properties.scene.viewport.x,240);assert.equal(events.filter(e=>e.name==='viewportchange').length,1);
});
