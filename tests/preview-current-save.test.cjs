const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadMiniProgramPage,instantiatePage}=require('./helpers/miniprogram-loader.cjs');
const model=require('../miniprogram/utils/funTextProject');
const manifests=require('../miniprogram/utils/stackExportManifest');
test('preview uses local reference avatar and aligned vector icons, no glyph divider',()=>{
 const fs=require('node:fs');const w=fs.readFileSync('miniprogram/pages/preview/preview.wxml','utf8');
 assert.match(w,/preview-ui\/sun.svg/);assert.match(w,/preview-ui\/moon.svg/);assert.match(w,/preview-ui\/download.svg/);
 assert.match(w,/preview-ui\/cat-avatar.png/);assert.doesNotMatch(w,/class="theme-divider"|cat-face|☼|☾|展开后点图选择|preview-save-hint/);
 for(const name of ['sun','moon','download'])assert.match(fs.readFileSync('miniprogram/assets/preview-ui/'+name+'.svg','utf8'),/viewBox="0 0 24 24"/);
});
function setup(audit,save){
 let calls=0;const saved=[];
 const p=model.createFunTextProject({sourceText:'你好春天',expressionKey:'funny-reversal',now:123});
 const project=model.selectCandidate(p,p.candidates[0].candidateId);
 const payload=model.buildRenderPayload(project);
 const manifest=manifests.buildFunTextManifest(project,payload.scenes.map(s=>({...s,url:'wxfile://local/'+s.sceneId})));
 manifest.stacks[0].cards.forEach(c=>c.exportUrl=c.sourceUrl);
 const wx={createSelectorQuery(){return {select(){return this},fields(){return this},exec(cb){cb([{node:{}}])}}}};
 const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/preview/preview.js',{
 '../../utils/funCardRendererClient':{async requestRenderStack(api,p){calls++;if(audit)await audit();return {cards:p.scenes.map(s=>({...s,url:'wxfile://audited/'+s.sceneId}))};}},
 '../../utils/sequenceBadgeComposer':{async materializeManifest(api,c,m){m.stacks[0].cards.forEach(c=>c.exportUrl=c.sourceUrl);return m;}},
 '../../utils/imageExporter':{async saveImagesSequentially(api,urls,opts){if(save)return save(urls,opts,saved);saved.push(...urls);}}
 },wx));
 page._funProject=project;page._sourceManifest=manifest;
 const cards=manifest.stacks[0].cards.map(c=>({url:c.exportUrl}));
 page.setData({groupList:[{cards,nodes:cards,frontIdx:1,expanded:false}]});
 return {page,calls:()=>calls,saved,manifest};
}
test('preview saves entire project in order regardless of front card and reuses audit',async()=>{
 const x=setup();await x.page.onSaveCurrentPreview();
 const expected=x.manifest.stacks[0].cards.map(c=>'wxfile://audited/'+c.cardId);
 assert.equal(x.calls(),1);assert.deepEqual(x.saved,expected);
 x.page.data.groupList[0].frontIdx=0;await x.page.onSaveCurrentPreview();
 assert.equal(x.calls(),1);assert.deepEqual(x.saved,expected.concat(expected));
});
test('preview audit failure never writes album and clears busy state',async()=>{
 const x=setup(()=>{throw Error('审核暂不可用')});await x.page.onSaveCurrentPreview();
 assert.equal(x.saved.length,0);assert.equal(x.page.data.saveBusy,false);assert.match(x.page.data.saveStatus,/审核暂不可用/);
 assert.equal(x.page.data.saveDone,false);
 x.page.onGoWechat(); // Must not open the success-only exit dialog.
});
test('preview duplicate click coalesces; exiting during audit prevents saving',async()=>{
 let release;const wait=new Promise(r=>release=r);const x=setup(()=>wait);
 const first=x.page.onSaveCurrentPreview();await x.page.onSaveCurrentPreview();
 assert.equal(x.calls(),1);x.page.onUnload();release();await first;assert.equal(x.saved.length,0);
});
test('expanded selection does not restrict or reorder whole group saving',async()=>{
 const x=setup();x.page.data.groupList[0].expanded=true;x.page._selectedPreviewUrl=x.manifest.stacks[0].cards[2].exportUrl;
 await x.page.onSaveCurrentPreview();assert.deepEqual(x.saved,x.manifest.stacks[0].cards.map(c=>'wxfile://audited/'+c.cardId));
});
test('group save progress follows callbacks and retries from failed image without re-auditing',async()=>{
 let fail=true;const starts=[];const statuses=[];
 const x=setup(null,async(urls,opts,saved)=>{
   starts.push(opts.startIndex);
   for(let i=opts.startIndex;i<urls.length;i++){
     opts.onProgress(i+1,urls.length);statuses.push(x.page.data.saveStatus);
     if(fail&&i===2){fail=false;throw Object.assign(Error('保存失败'),{nextIndex:i});}
     saved.push(urls[i]);opts.onSaved(i+1,urls.length);
   }
 });
 await x.page.onSaveCurrentPreview();assert.equal(x.saved.length,2);
 await x.page.onSaveCurrentPreview();assert.deepEqual(starts,[0,2]);assert.equal(x.calls(),1);
 assert.deepEqual(x.saved,x.manifest.stacks[0].cards.map(c=>'wxfile://audited/'+c.cardId));
 assert.match(statuses[0],/1 \/ 5/);assert.match(x.page.data.saveStatus,/全部 5 张/);
});
