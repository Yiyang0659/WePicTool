const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadMiniProgramPage,instantiatePage}=require('./helpers/miniprogram-loader.cjs');
const model=require('../miniprogram/utils/layeredDressup');
test('reopening workspace retains access to saved backup after restoring latest draft',()=>{
 const key='wepictool_layered_dressup_draft_v1';
 const a=model.createProject({sourceMode:'upload',now:1}),b=model.createProject({sourceMode:'upload',now:2});
 const store={[key]:b,[key+'_previous']:a};
 const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/dressup/dressup.js',{}, {getStorageSync:k=>store[k],setStorageSync:(k,v)=>store[k]=v,showModal:o=>o.success({confirm:true})}));
 page.onLoad({mode:'upload'});page.onRestorePreviousDraft();
 assert.equal(page.data.project.projectId,b.projectId);
 page.onRestorePreviousDraft();assert.equal(page.data.project.projectId,a.projectId);
 assert.equal(store[key].projectId,a.projectId);
 assert.equal(store[key+'_previous'].projectId,b.projectId);
});
