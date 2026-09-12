const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {loadMiniProgramModule,loadMiniProgramPage,instantiatePage} = require('./helpers/miniprogram-loader.cjs');
const manifest = require('../miniprogram/config/localFontManifest.json');
const fonts = require('../miniprogram/utils/localFontRenderer');
const model = require('../miniprogram/utils/funTextProject');
const root = path.resolve(__dirname,'../miniprogram');
const readPart = name => {
  return require(path.join(root,'font-packages',name,'entry.js')).read({base64ToArrayBuffer(value){
    const b=Buffer.from(value,'base64');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  }});
};
function loadPackages(onLoad=()=>{}) {
  return async name=>{onLoad(name);return {read:()=>readPart(name)};};
}

test('font resource packages reconstruct original fonts, retain licenses and stay below 2MiB each',()=>{
  const app=require('../miniprogram/app.json');
  for(const spec of Object.values(manifest)) {
    const merged=Buffer.concat(spec.parts.map(n=>Buffer.from(readPart(n))));
    assert.equal(merged.length,spec.bytes);
    assert.equal(crypto.createHash('sha256').update(merged).digest('hex'),spec.sha256);
    assert.deepEqual(merged,fs.readFileSync(path.join(root,'cloudhosting/fun-card-renderer/assets/fonts',spec.file)));
    for(const name of spec.parts){
      const p=app.subPackages.find(p=>p.name===name);assert.ok(p);
      const dir=path.join(root,p.root);
      const size=fs.readdirSync(dir).reduce((s,f)=>s+fs.statSync(path.join(dir,f)).size,0);
      assert.ok(size<2*1024*1024);
    }
  }
  assert.equal(fs.readdirSync(path.join(root,'vendor')).filter(n=>n.startsWith('OFL-')).length,3);
});

test('three bundled Chinese fonts parse once, draw true distinct outlines and never call native text',async()=>{
  const counts={}, api={};
  const loader=fonts.createLoader(loadPackages(n=>counts[n]=(counts[n]||0)+1));
  const signatures=[];
  for(const key of Object.keys(manifest)){
    const font=await loader.ensure(api,key);
    assert.equal(await loader.ensure(api,key),font);
    const layer={type:'text',fontKey:key,fontSize:140,lines:['我今天想见你'],effectKey:'marker-bold'};
    await loader.ensureScene(api,{layers:[layer]});
    const commands=[];
    const ctx=new Proxy({}, {get:(_,k)=>{assert.ok(!['fillText','strokeText'].includes(k));return (...args)=>commands.push([k,...args]);}});
    loader.drawText(ctx,layer.lines[0],540,400,layer,1,false);
    assert.ok(commands.length>100);assert.ok(commands.flat().filter(v=>typeof v==='number').every(Number.isFinite));
    signatures.push(JSON.stringify(commands));
  }
  assert.equal(new Set(signatures).size,3);
  assert.ok(Object.values(counts).every(n=>n===1));
  await assert.rejects(loader.ensureScene(api,{layers:[{type:'text',fontKey:'marker',lines:['\u{10ffff}']}]}),e=>e.code==='FONT_GLYPH_MISSING');
});

test('font load coalesces concurrent requests and retries an interrupted download',async()=>{
  let calls=0,broken=true;
  const loader=fonts.createLoader(name=>{calls++;return broken ? Promise.reject(Error('offline')) : loadPackages()(name);});
  await Promise.all([assert.rejects(loader.ensure({},'marker')),assert.rejects(loader.ensure({},'marker'))]);
  assert.equal(calls,1);
  broken=false;assert.ok(await loader.ensure({},'marker'));
});

test('local entry creates rules without text audit or AI; local preloader never requests image URLs',async()=>{
  let generated=false;
  const api={showToast(){},navigateTo(o){generated=true;o.success({eventChannel:{emit(){}}});},cloud:{callFunction(){throw Error('cloud forbidden');}}};
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text/fun-text.js',{
    '../../config/env':{ENABLE_FUN_TEXT_STACK_ENTRY:true,ENABLE_FUN_OFFLINE_PREVIEW:true},
    '../../utils/contentGuardClient':{checkTextContent(){throw Error('audit forbidden');}}
  },api));
  page.data.inputText='今天真开心';await page.onGenerate();assert.ok(generated);
  let warms=0;
  const preloader=loadMiniProgramModule('miniprogram/utils/funPreviewPreloader.js',{
    '../config/env':{ENABLE_FUN_OFFLINE_PREVIEW:true},
    './localFontRenderer':{warm(){warms++;return Promise.resolve();}},
    './funCardRendererClient':{requestPreviewScene(){throw Error('preview forbidden');}}
  });
  preloader.warm({...api,getFileSystemManager(){}},model.createFunTextProject({sourceText:'今天真开心'}));
  assert.equal(warms,1);await assert.rejects(preloader.request(api,{}),/不调用云端/);
});

test('local preview ignores old completion and composites decoration edits without cloud loading',async()=>{
  let definition;const waiting=[];let paints=0;
  const ctx=new Proxy({}, {get:()=>()=>{}}), canvas={getContext:()=>ctx};
  const api={getSystemInfoSync:()=>({pixelRatio:2}),createSelectorQuery(){return {in(){return this;},select(){return this;},fields(){return this;},exec(cb){cb([{node:canvas,width:320}]);}};}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'components/fun-live-preview/fun-live-preview.js'),'utf8'),{
    Component(d){definition=d;},wx:api,setTimeout,clearTimeout,
    require(n){
      if(n.includes('config/env'))return {ENABLE_FUN_OFFLINE_PREVIEW:true};
      if(n.includes('localFontRenderer'))return {ensureScene:()=>new Promise(r=>waiting.push(r)),hasScene:()=>true,drawText(){}};
      if(n.includes('scenePainter'))return {paintScene(){paints++;}};
      if(n.includes('funPreviewPreloader'))return {request(){throw Error('cloud forbidden');}};
      return require(path.resolve(root,'components/fun-live-preview',n));
    }
  });
  const scene={sceneId:'s',width:1080,height:1080,background:{color:'white'},layers:[{type:'text',text:'旧'}]};
  const c=Object.assign({data:{},properties:{scene,projectId:'p',candidateId:'c'},setData(d){Object.assign(this.data,d);}},definition.methods);
  const a=c.loadLocalBase();c.properties.scene={...scene,layers:[{type:'text',text:'新'}]};const b=c.loadLocalBase();
  waiting[1]();await b;waiting[0]();await a;assert.equal(paints,1);assert.equal(c.data.loading,false);
  c.properties.scene={...c.properties.scene,layers:[...c.properties.scene.layers,{type:'sticker',x:100}]};
  const decoration=c.loadLocalBase();waiting[2]();await decoration;
  assert.equal(paints,2);assert.equal(c.data.loading,false);
  await c.loadLocalBase();assert.equal(paints,2);assert.equal(waiting.length,3);
});
