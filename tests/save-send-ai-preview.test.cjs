const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const framing=require('../miniprogram/utils/garmentFraming');
const model=require('../miniprogram/utils/layeredDressup');
const {garmentPrompt}=require('../miniprogram/cloudfunctions/processOutfit/garmentPrompt');
const {goToWechat}=require('../miniprogram/utils/wechatSendGuide');
const {loadMiniProgramPage,instantiatePage}=require('./helpers/miniprogram-loader.cjs');

test('garment prompts preserve uploaded style and isolate category, not people',()=>{
  for(const type of ['tops','bottoms','shoes']){
    const text=garmentPrompt(type);assert.match(text,/人物.*皮肤/);assert.match(text,/logo/);assert.match(text,/92%/);assert.match(text,/侧拍/);
  }
  assert.throws(()=>garmentPrompt('head'));
});
test('white margin measurement and 92% fit preserve full aspect without stretching',()=>{
  const {createCanvas}=require('../miniprogram/cloudhosting/fun-card-renderer/node_modules/@napi-rs/canvas');
  const c=createCanvas(400,400),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,400,400);
  ctx.fillStyle='#dde2dc';ctx.fillRect(120,90,160,240);
  const b=framing.findBounds(ctx.getImageData(0,0,400,400).data,400,400);
  assert.ok(b.x<120 && b.y<90);assert.ok(b.x+b.width>=280 && b.y+b.height>=330);
  for(const [w,h] of [[1024,1024],[1024,1280],[1024,1365]]){
    const r=framing.fit(w,h,b.width,b.height);
    assert.ok(r.x>=0 && r.y>=0 && r.x+r.width<=w && r.y+r.height<=h);
    assert.ok(Math.abs(r.width/r.height-b.width/b.height)<1e-10);
    assert.ok(Math.abs(Math.max(r.width/w,r.height/h)-.92)<1e-10);
  }
  ctx.fillStyle='#fff';ctx.fillRect(0,0,400,400);
  assert.equal(framing.findBounds(ctx.getImageData(0,0,400,400).data,400,400),null);
});
test('actual Canvas composer removes surrounding whitespace before fitting the product',async()=>{
  const {createCanvas,Image}=require('../miniprogram/cloudhosting/fun-card-renderer/node_modules/@napi-rs/canvas');
  const source=createCanvas(400,400),s=source.getContext('2d');s.fillStyle='#fff';s.fillRect(0,0,400,400);s.fillStyle='#4388aa';s.fillRect(120,80,160,240);
  const url=source.toDataURL('image/png');let output;
  const api={getImageInfo:o=>o.success({width:400,height:400,path:url}),canvasToTempFilePath:o=>{output=o.canvas.getContext('2d').getImageData(0,0,o.canvas.width,o.canvas.height);o.success({tempFilePath:'test.png'});}};
  const module={exports:{}};
  require('node:vm').runInNewContext(fs.readFileSync('miniprogram/utils/cardComposer.js','utf8'),{module,wx:api,require:p=>{assert.equal(p,'./garmentFraming');return framing;}});
  const canvas=createCanvas(1,1);canvas.createImage=()=>new Image();
  const result=await module.exports.composeCard(canvas,{sourceUrl:url,isMatted:true,ratio:'3:4'});
  assert.equal(result.width,1024);assert.equal(result.height,1365);
  const bounds=framing.findBounds(output.data,result.width,result.height);
  assert.ok(bounds.height/result.height>.85);assert.ok(bounds.height/result.height<.96);
  assert.equal(output.data[0],255);
});
test('other materials remain independent of four-body count and import is idempotent',()=>{
  let p=model.createProject({sourceMode:'upload'});
  const incoming={tops:[1,2,3].map(n=>({id:'t'+n,url:'t'+n})),shoes:[1,2].map(n=>({id:'s'+n,url:'s'+n})),others:[1,2,3].map(n=>({id:'o'+n,url:'o'+n}))};
  p=model.mergeImportedItems(p,incoming,[],'ai').project;
  assert.equal(p.groups.head.length,0);assert.equal(p.groups.bottoms.length,0);
  assert.equal(model.buildSendability(p).validGroupCount,1);
  assert.equal(model.buildSendability(p).totalExportCount,6);
  assert.equal(model.mergeImportedItems(p,incoming,[],'ai').addedCount,0);
  assert.equal(model.buildPreviewGroups(p).at(-1).key,'others');
});
test('normalized display and export use the same saved product rather than raw model file',()=>{
  const item={id:'shirt',url:'cloud://model',mattedUrl:'cloud://model',processedUrl:'wxfile://normalized',displayUrl:'wxfile://normalized',originalUrl:'cloud://original'};
  const project=model.addItems(model.createProject({}), 'tops',[item],'ai');
  const manifest=require('../miniprogram/utils/stackExportManifest').buildDressupManifest(project,model.GROUP_DEFINITIONS);
  assert.equal(project.groups.tops[0].localPath,'wxfile://normalized');
  assert.equal(manifest.stacks.find(s=>s.stackId==='tops').cards[0].sourceUrl,'wxfile://normalized');
});
test('go to WeChat requires user click and handles unavailable API honestly',()=>{
  const dialogs=[];let exited=0;
  const api={showModal:x=>dialogs.push(x),exitMiniProgram:()=>exited++};
  goToWechat(api);assert.equal(exited,0);dialogs[0].success({confirm:false});assert.equal(exited,0);
  dialogs[0].success({confirm:true});assert.equal(exited,1);
  delete api.exitMiniProgram;goToWechat(api);dialogs.at(-1).success({confirm:true});assert.equal(dialogs.at(-1).title,'请手动返回微信');
});
test('AI processing failure returns pending original without calling image generation again',async()=>{
  let payload,backs=0;
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/outfit-import/outfit-import.js',{}, {navigateBack(){backs++;},showToast(){}}));
  page._openerEventChannel={emit:(name,data)=>payload=data};
  await page.showReviewTask({groups:{tops:[{id:'bad',status:'processing_failed',url:'original',classification:{confidence:.99}}],others:[{id:'food',url:'food',classification:{confidence:.99}}]}});
  assert.equal(payload.groups.tops.length,0);assert.equal(payload.pendingItems.length,1);assert.equal(payload.groups.others.length,1);
  page.onApplyImport();assert.equal(backs,1);
});
test('full-screen preview does not invoke native image saving or text editing',()=>{
  const js=fs.readFileSync('miniprogram/pages/fun-text-editor/fun-text-editor.js','utf8');
  const action=js.slice(js.indexOf('onPreviewTap:'),js.indexOf('loadHandwritingDrafts:'));
  assert.match(action,/localPreview.renderCards/);assert.doesNotMatch(action,/onEditText|previewImage|requestRenderStack/);
  const wxml=fs.readFileSync('miniprogram/pages/fun-text-editor/fun-text-editor.wxml','utf8');
  assert.match(wxml,/show-menu-by-longpress="\{\{false\}\}"/);
  assert.match(wxml,/bindchange="onImageViewerChange"/);
});
test('cancelled AI response cannot overwrite a new batch and IDs are distinct',async()=>{
  const calls=[],applied=[];
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/outfit-import/outfit-import.js',{}, {cloud:{callFunction:o=>calls.push(o)}}));
  page.showReviewTask=(task)=>applied.push(task.groups.others[0].sourceImageId);
  const first = page.createProcessingTask([{fileId:'cloud://first'}]);
  page.onCancelProcess();page._cancelRequested=false;
  const second = page.createProcessingTask([{fileId:'cloud://second'}]);
  assert.notEqual(calls[0].data.images[0].imageId,calls[1].data.images[0].imageId);
  calls[0].success({result:{taskId:'stale'}});
  await first;
  assert.deepEqual(applied,[]);
  const id = calls[1].data.images[0].imageId;
  calls[1].success({result:{status:'done',groups:{others:[{sourceImageId:id,status:'done'}]}}});
  await second;
  assert.deepEqual(applied,[id]);page.onUnload();
});
test('reopening image viewer discards old files and serializes shared canvas use',async()=>{
  const releases=[];
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text-editor/fun-text-editor.js',{
    '../../utils/funLocalPreview':{renderCards:()=>new Promise(resolve=>releases.push(resolve))}
  },{createSelectorQuery:()=>({select(){return this;},fields(){return this;},exec(cb){cb([{node:{}}]);}})}));
  page.data.project={};
  const first=page.onPreviewTap();await new Promise(r=>setImmediate(r));
  page.onCloseImageViewer();const second=page.onPreviewTap();
  assert.equal(releases.length,1);
  releases[0]([{url:'old'}]);await first;await new Promise(r=>setImmediate(r));
  assert.equal(releases.length,2);assert.equal(page.data.imageViewerCards.length,0);
  releases[1]([{url:'new'}]);await second;
  assert.equal(page.data.imageViewerCards[0].url,'new');
});
