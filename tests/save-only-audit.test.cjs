const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadMiniProgramModule,loadMiniProgramPage,instantiatePage}=require('./helpers/miniprogram-loader.cjs');
const model=require('../miniprogram/utils/funTextProject');
function project(){const p=model.createFunTextProject({sourceText:'我今天想见你',expressionKey:'funny-reversal',now:1000});return model.selectCandidate(p,p.candidates[0].candidateId);}
function setup(file, options={}){
  let audits=0,saves=0,previews=0; const p=project();
  const cards=p.candidates[0].editedScenes.map(s=>({sceneId:s.sceneId,role:s.role,order:s.order,url:'wxfile://local/'+s.order}));
  const wx={createSelectorQuery(){return{select(){return this},fields(){return this},exec(cb){cb([{node:{}}])}}},showToast(){},showLoading(){},hideLoading(){},getStorageSync(){return []},setStorageSync(){},navigateTo(o){o.success?.({eventChannel:{emit(){previews++}}})}};
  const page=instantiatePage(loadMiniProgramPage(file,{
    '../../config/env':{ENABLE_FUN_TEXT_STACK_ENTRY:true,ENABLE_FUN_LOCAL_EDITOR:true},
    '../../utils/funTextProject':model,
    '../../utils/funPreviewPreloader':{warm(){}},
    '../../utils/funLocalPreview':{async renderCards(api,canvas,p){return options.local ? options.local(p) : cards}},
    '../../utils/funCardRendererClient':{async requestRenderStack(api,payload){audits++;if(options.audit)return options.audit(payload);throw Error('audit rejected')}},
    '../../utils/sequenceBadgeComposer':{async materializeManifest(a,b,m){m.stacks[0].cards.forEach(c=>c.exportUrl=c.sourceUrl);return m}},
    '../../utils/imageExporter':{async saveExportManifest(api,manifest,opts){saves++;if(options.save)return options.save(manifest,opts)},async saveImagesSequentially(){saves++}}
  },wx));
  page._sequenceCanvas={};page._sequenceReady=true;
  return{page,p,counts:()=>({audits,saves,previews})};
}
test('editor preview never audits while save still fails closed',async()=>{
  const {page,p,counts}=setup('miniprogram/pages/fun-text-editor/fun-text-editor.js');
  page.initProject(p);await page.onWechatPreview();
  assert.deepEqual(counts(),{audits:0,saves:0,previews:1});
  await page.onSaveCurrentPage();assert.deepEqual(counts(),{audits:1,saves:0,previews:1});
});
test('result enter and preview never audit, failed save never writes album',async()=>{
  const {page,p,counts}=setup('miniprogram/pages/template-result/template-result.js');
  await page.initProject(p);await page.onPreviewStack();
  assert.deepEqual(counts(),{audits:0,saves:0,previews:1});
  await page.onSaveStack();assert.deepEqual(counts(),{audits:1,saves:0,previews:1});
});

test('deleting to one card keeps render payload valid, and style change does not restore deleted cards',()=>{
  let p=project(); const id=p.selectedCandidateId;
  while(p.candidates[0].editedScenes.length>1)p=model.removeCard(p,id,0);
  assert.equal(model.buildRenderPayload(p).scenes.length,1);
  const validator=require('../miniprogram/cloudhosting/fun-card-renderer/sceneValidator');
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
  p=model.switchCandidateStyle(p,id,'chalk-chaos-v1');
  assert.equal(model.buildRenderPayload(p).scenes.length,1);
});

function audited(payload){return {cards:payload.scenes.map(s=>({sceneId:s.sceneId,role:s.role,order:s.order,url:'cloud://audited/'+s.order}))};}
test('result saves only audited output and reuses it on unchanged second save',async()=>{
  const written=[];const {page,p,counts}=setup('miniprogram/pages/template-result/template-result.js',{audit:async p=>audited(p),save:async m=>written.push(m.stacks[0].cards.map(c=>c.exportUrl))});
  await page.initProject(p);await page.onSaveStack();await page.onSaveStack();
  assert.deepEqual(counts(),{audits:1,saves:2,previews:0});
  assert.ok(written.flat().every(u=>u.startsWith('cloud://audited/')));
});
test('one-card result uses ordinary-image saving after audit, not stack eligibility filtering',async()=>{
  let album=0;const {page,p}=setup('miniprogram/pages/template-result/template-result.js',{audit:async p=>audited(p),save:async (m,opts)=>{
    const exporter=require('../miniprogram/utils/imageExporter');
    await exporter.saveExportManifest({saveImageToPhotosAlbum(o){album++;o.success({})}},m,{...opts,resolvePath:async()=>'/tmp/audited.png'});
  }});
  let one=p;while(one.candidates[0].editedScenes.length>1)one=model.removeCard(one,one.selectedCandidateId,0);
  // Use one-card local fixture, retaining the real model and manifest validation.
  page.setData({project:one,rendering:false,renderedCards:audited(model.buildRenderPayload(one)).cards});page.nextRenderGeneration();
  await page.onSaveStack();assert.equal(album,1);
});
test('result duplicate save while auditing joins a single request',async()=>{
  let release;const pending=new Promise(r=>release=r);
  const {page,p,counts}=setup('miniprogram/pages/template-result/template-result.js',{audit:async p=>{await pending;return audited(p)}});
  await page.initProject(p);const first=page.onSaveStack();const second=page.onSaveStack();
  release();await Promise.all([first,second]);assert.equal(counts().audits,1);assert.equal(counts().saves,1);
});
test('audit completing after replacement project cannot save or certify replacement',async()=>{
  let release;const pending=new Promise(r=>release=r);
  const {page,p,counts}=setup('miniprogram/pages/template-result/template-result.js',{audit:async p=>{await pending;return audited(p)}});
  await page.initProject(p);const save=page.onSaveStack();await Promise.resolve();
  const replacement=project();replacement.projectId='funtext_replacement';await page.initProject(replacement);
  release();await save;assert.equal(counts().saves,0);assert.equal(page._auditedFingerprint,'');assert.equal(page.data.project.projectId,'funtext_replacement');
});
test('local preview completing after a newer project does not replace it',async()=>{
  let release;const pending=new Promise(r=>release=r);let calls=0;
  const {page,p}=setup('miniprogram/pages/template-result/template-result.js',{local:async p=>{if(++calls===1)await pending;return audited(model.buildRenderPayload(p)).cards;}});
  const first=page.initProject(p);await Promise.resolve();const newer=project();newer.projectId='funtext_newer';await page.initProject(newer);release();await first;
  assert.equal(page.data.project.projectId,'funtext_newer');assert.equal(page.data.renderFailed,false);
});
test('local font failure remains retryable without invoking audit',async()=>{
  const {page,p,counts}=setup('miniprogram/pages/template-result/template-result.js',{local:async()=>{throw Error('font unavailable')}});
  await page.initProject(p);assert.equal(page.data.renderFailed,true);assert.equal(counts().audits,0);assert.equal(page.data.project.projectId,p.projectId);
});
test('new result session never treats a historical preview as audit proof',async()=>{
  const {page,p,counts}=setup('miniprogram/pages/template-result/template-result.js');
  await page.initProject(p,[{url:'cloud://historic'}],{renderFingerprint:model.createRenderFingerprint(p)});
  await page.onSaveStack();assert.equal(counts().audits,1);assert.equal(counts().saves,0);
});
test('local compositor includes full-size purple strokes and does not mutate project',async()=>{
  const {createCanvas}=require('../miniprogram/cloudhosting/fun-card-renderer/node_modules/@napi-rs/canvas');
  const p=project();p.candidates[0].editedScenes.forEach(s=>{s.layers=[];s.strokes=[{id:'stroke_test',brushKey:'pen',colorKey:'purple',width:28,points:[{x:200,y:700},{x:400,y:700}]}]});
  const before=JSON.stringify(p);const images=[];
  const compositor=loadMiniProgramModule('miniprogram/utils/funLocalPreview.js',{'./localFontRenderer':{async ensureScene(){},drawText(){}}});
  const canvas=createCanvas(1080,1080);const api={canvasToTempFilePath(o){images.push(Array.from(o.canvas.getContext('2d').getImageData(300,700,1,1).data));o.success({tempFilePath:'wxfile://local/'+images.length})}};
  const cards=await compositor.renderCards(api,canvas,p,()=>true);
  assert.equal(cards.length,5);assert.deepEqual(images[0],[118,87,255,255]);assert.equal(JSON.stringify(p),before);
});
test('preview-only viewer cannot open native save menu or write images',()=>{
  let native=0,saved=0,menus=0;
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/preview/preview.js',{}, {previewImage(){native++},showToast(){},showActionSheet(){menus++},saveImageToPhotosAlbum(){saved++}}));
  page._previewOnly=true;page.data.groupList=[{cards:[{url:'wxfile://local/1'}],nodes:[]}];
  page._openViewer(0,'wxfile://local/1');page._openActions(0,'wxfile://local/1');page._saveImagesSequentially(['wxfile://local/1'],'saved');
  assert.equal(native+saved+menus,0);assert.equal(page.data.viewer.show,true);
});
