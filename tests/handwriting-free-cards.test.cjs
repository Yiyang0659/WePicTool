const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const model=require('../miniprogram/utils/funTextProject');
const lib=require('../miniprogram/utils/handwritingLibrary');
const validator=require('../miniprogram/cloudhosting/fun-card-renderer/sceneValidator');
const {loadMiniProgramPage,instantiatePage,loadMiniProgramModule}=require('./helpers/miniprogram-loader.cjs');
const strokes=[{id:'stroke_free',brushKey:'pen',colorKey:'blue',width:28,points:[{x:0,y:1080},{x:2160,y:1080}]}];
const sticker={id:'hw_free',x:540,y:540,scale:0.88,rotation:0,workspaceSize:2160,viewport:{x:540,y:540},strokes};
function project(){let p=model.createFunTextProject({sourceText:'今天真开心',now:8});return model.selectCandidate(p,p.candidates[0].candidateId);}
function scene(p){return p.candidates[0].editedScenes;}
function insert(p,options){return model.insertFreeCard(p,p.selectedCandidateId,scene(p)[0].sceneId,options);}
const event=dataset=>({currentTarget:{dataset}});
function editor(){
  const storage={},toasts=[];
  const api={getStorageSync:k=>storage[k],setStorageSync:(k,v)=>storage[k]=v,showToast:o=>toasts.push(o),showModal(){}};
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/fun-text-editor/fun-text-editor.js',{
    '../../config/env':{ENABLE_FUN_TEXT_STACK_ENTRY:true,ENABLE_FUN_LOCAL_EDITOR:true,ENABLE_FUN_OFFLINE_PREVIEW:true},
    '../../utils/funPreviewPreloader':{warm(){}},
  },api));
  page.initProject(project());return {page,storage,toasts};
}
test('free card insertion preserves originals, has stable identity, and survives undo/redo/order/delete cycles',()=>{
  const original=project();let p=insert(original,{backgroundColor:'#EDF7EF',inkSticker:sticker});
  const id=scene(p)[1].sceneId;
  assert.deepEqual(scene(p)[0],scene(original)[0]);
  assert.equal(scene(p).length,scene(original).length+1);
  assert.deepEqual(model.undoEdit(p).candidates,original.candidates);
  p=model.redoEdit(model.undoEdit(p));
  p=model.moveCard(p,p.selectedCandidateId,1,0);
  assert.equal(scene(p)[0].sceneId,id);
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
  p=model.removeCard(p,p.selectedCandidateId,0);
  for(let i=0;i<12;i++){p=insert(p);p=model.removeCard(p,p.selectedCandidateId,1);}
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
  while(scene(p).length<8)p=insert(p);
  assert.throws(()=>insert(p),/最多8/);
  assert.equal(p.candidates[0].freeSceneOriginals.length,3);
});
test('free cards accept text, backgrounds, decorations and style changes without inventing template objects',()=>{
  let p=insert(project(),{backgroundColor:'#EDF7EF',inkSticker:sticker});const id=scene(p)[1].sceneId;
  p=model.updateCardText(p,p.selectedCandidateId,id,'我的字');
  p=model.addDecoration(p,p.selectedCandidateId,id,'sticker_2');
  const before=JSON.parse(JSON.stringify(scene(p)[1]));
  p=model.switchCandidateStyle(p,p.selectedCandidateId,'blue-soda-v1');
  assert.deepEqual(scene(p)[1].inkStickers,before.inkStickers);
  assert.deepEqual(scene(p)[1].background,before.background);
  assert.deepEqual(scene(p)[1].layers.map(l=>l.id),before.layers.map(l=>l.id));
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
  p=model.updateCardStyle(p,p.selectedCandidateId,id,{backgroundColor:'#ffffff'});
  assert.equal(scene(p)[1].background.color,'#FFFFFF');
  assert.equal(scene(model.undoEdit(p))[1].background.color,'#EDF7EF');
  p=model.restoreCard(p,p.selectedCandidateId,id);
  assert.equal(scene(p)[1].layers.length,0);
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
  p=model.restoreCandidate(p,p.selectedCandidateId);
  assert.equal(scene(p).some(s=>s.sceneId===id),false);
});
test('solid background validates strictly on both sides and handwritten payload contains entire workspace',()=>{
  let p=insert(project(),{inkSticker:sticker});
  const payload=model.buildRenderPayload(p),s=payload.scenes[1];
  assert.ok(s.strokes[0].points[0].x>0 && s.strokes[0].points[1].x<1080);
  assert.equal(s.inkStickers,undefined);
  assert.equal(validator.validateRenderPayload(payload).valid,true);
  s.backgroundVariantKey='pink-note-soft';assert.equal(validator.validateRenderPayload(payload).valid,false);
  delete s.backgroundVariantKey;s.background.color='url(secret)';assert.equal(validator.validateRenderPayload(payload).valid,false);
  assert.throws(()=>insert(p,{backgroundColor:'transparent'}),/背景/);
});
test('old drafts remain readable, card drafts retain background, and data copies are isolated',()=>{
  const data={},api={getStorageSync:k=>data[k],setStorageSync:(k,v)=>data[k]=v};
  lib.save(api,{id:'hw_old',updatedAt:1,strokes,workspaceSize:2160});
  assert.equal(lib.scene(strokes,lib.read(api)[0]).background.color,'transparent');
  lib.save(api,{id:'hw_new',updatedAt:2,strokes,workspaceSize:2160,purpose:'card',backgroundColor:'#FCE4EC'});
  const item=lib.read(api)[0];assert.equal(lib.decorate([item])[0].scene.background.color,'#FCE4EC');
  item.strokes[0].points[0].x=99;assert.equal(lib.read(api)[0].strokes[0].points[0].x,0);
  assert.throws(()=>lib.save(api,{...item,backgroundColor:'red'}),/先写画/);
});
test('editor has one handwriting block below text and above size, with purpose and background controls',()=>{
  const wxml=fs.readFileSync('miniprogram/pages/fun-text-editor/fun-text-editor.wxml','utf8');
  assert.equal((wxml.match(/class="handwriting-title"/g)||[]).length,1);
  assert.ok(wxml.indexOf('edit-text-row')<wxml.indexOf('content-handwriting'));
  assert.ok(wxml.indexOf('content-handwriting')<wxml.indexOf('>字号<'));
  assert.match(wxml,/bindtap="onHandwritingPurpose"/);
  assert.match(wxml,/bindtap="onAddBlankCard"/);
  const component=fs.readFileSync('miniprogram/components/fun-live-preview/fun-live-preview.js','utf8');
  assert.match(component,/background: that.properties.localOnly \? that.properties.scene.background/);
});
test('editor adds background handwriting as new selected card and editing the copy preserves the source draft',()=>{
  const {page,storage}=editor();const originalId=page.data.currentScene.sceneId;
  page.onStartHandwriting();page.onHandwritingChange({detail:{strokes}});
  page.onHandwritingPurpose(event({purpose:'card'}));page.onHandwritingBackground(event({color:'#FCE4EC'}));
  assert.equal(page.data.handwritingScene.background.color,'#FCE4EC');
  page.onAddHandwritingSticker();
  assert.equal(page.data.currentCardIndex,1);assert.notEqual(page.data.currentScene.sceneId,originalId);
  assert.equal(page.data.currentScene.background.color,'#FCE4EC');
  const originalDraft=JSON.parse(JSON.stringify(storage[lib.KEY][0]));
  const count=page.data.scenes.length;
  page.onAddHandwritingSticker();assert.equal(page.data.scenes.length,count);
  page.onEditInkSticker();
  page.onHandwritingChange({detail:{strokes:strokes.map(s=>({...s,colorKey:'purple'}))}});
  page.onAddHandwritingSticker();
  assert.equal(page.data.scenes.length,count);
  assert.deepEqual(storage[lib.KEY].find(d=>d.id===originalDraft.id),originalDraft);
  assert.equal(page.data.currentScene.inkStickers[0].strokes[0].colorKey,'purple');
});
test('card draft used as sticker never replaces background, target changes abort submission',()=>{
  const {page,toasts}=editor();const background=JSON.stringify(page.data.currentScene.background);
  page.onStartHandwriting();page.onHandwritingChange({detail:{strokes}});
  page.onHandwritingPurpose(event({purpose:'card'}));page.onHandwritingBackground(event({color:'#EDF7EF'}));
  page.onHandwritingPurpose(event({purpose:'sticker'}));page.onAddHandwritingSticker();
  assert.equal(JSON.stringify(page.data.currentScene.background),background);
  page.onStartHandwriting();page.onHandwritingChange({detail:{strokes}});
  page.onSelectCard(event({index:2}));page.onAddHandwritingSticker();
  assert.match(toasts.at(-1).title,/目标卡片已变化/);
  assert.equal(page.data.currentScene.inkStickers,undefined);
});
test('handwriting undo/redo includes background without discarding strokes',()=>{
  const {page}=editor();page.onStartHandwriting();page.onHandwritingChange({detail:{strokes}});
  page.onHandwritingPurpose(event({purpose:'card'}));page.onHandwritingBackground(event({color:'#FCE4EC'}));
  page.onHandwritingUndo();assert.equal(page.data.handwritingBackground,'#FFFFFF');
  assert.equal(page.data.handwritingScene.strokes.length,1);
  page.onHandwritingRedo();assert.equal(page.data.handwritingScene.background.color,'#FCE4EC');
  page.onHandwritingUndo();page.onHandwritingUndo();assert.equal(page.data.handwritingPurpose,'sticker');
  assert.equal(page.data.handwritingScene.background.color,'transparent');
});
test('new protocol never calls old renderer before explicit deployment capability is enabled',async()=>{
  const client=loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js',{'../config/env':{FUN_CARD_RENDERER_SUPPORTS_FREE_CARDS:false}});
  let calls=0;
  await assert.rejects(client.requestRenderStack({login(){calls++;}},model.buildRenderPayload(insert(project(),{inkSticker:sticker}))),e=>e.code==='FREE_CARDS_NOT_READY');
  await assert.rejects(client.requestRenderStack({login(){calls++;}},model.buildRenderPayload(insert(project()))),e=>e.code==='EMPTY_CARD');
  assert.equal(calls,0);
});
test('real free-card PNG has chosen background and ink, and image audit failure blocks upload',async()=>{
  const base='../miniprogram/cloudhosting/fun-card-renderer/';
  const canvas=require(base+'node_modules/@napi-rs/canvas');
  const renderer=require(base+'renderer');const makePng=renderer.createPngMaker(canvas);
  const s=model.buildRenderPayload(insert(project(),{backgroundColor:'#EDF7EF',inkSticker:sticker})).scenes[1];
  const buffer=await makePng(s,1080),img=await canvas.loadImage(buffer);
  const c=canvas.createCanvas(1080,1080),ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  assert.deepEqual([...ctx.getImageData(10,10,1,1).data],[237,247,239,255]);
  assert.deepEqual([...ctx.getImageData(540,540,1,1).data],[32,119,212,255]);
  const local=canvas.createCanvas(1080,1080),localCtx=local.getContext('2d');
  require('../miniprogram/utils/scenePainter').paintScene(localCtx,s,1080);
  require('../miniprogram/utils/funStrokes').paint(localCtx,s.strokes,1080);
  assert.deepEqual([...localCtx.getImageData(540,540,1,1).data],[...ctx.getImageData(540,540,1,1).data]);
  assert.deepEqual([...localCtx.getImageData(10,10,1,1).data],[...ctx.getImageData(10,10,1,1).data]);
  let audits=0,uploads=0;
  const render=renderer.createSceneRenderer({makePng,checkImage:async()=>{audits++;return {ok:false,code:'CONTENT_UNSAFE'};},uploadBuffer:async()=>{uploads++;}});
  await assert.rejects(render([s],{kind:'final',size:1080,projectId:'funtext_test',candidateId:'candidate_test'}),e=>e.code==='CONTENT_UNSAFE');
  assert.equal(audits,1);assert.equal(uploads,0);
  const accepted=renderer.createSceneRenderer({makePng,checkImage:async()=>({ok:true}),uploadBuffer:async()=>({fileId:'test',url:'https://test.invalid/image.png'})});
  const result=await accepted([s],{kind:'final',size:1080,projectId:'funtext_test',candidateId:'candidate_test'});
  assert.equal(result.length,1);
});
