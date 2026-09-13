const {test}=require('node:test');const assert=require('node:assert/strict');
test('tabbar validation catches missing images and invalid PNG payloads',async()=>{
 const {checkTabIcons}=await import('../scripts/check-tab-icons.mjs');
 const app={tabBar:{list:[{iconPath:'assets/a.png',selectedIconPath:'assets/b.png'}]}};
 assert.equal(checkTabIcons(app,()=>{throw Error('missing');}).length,2);
 assert.equal(checkTabIcons(app,()=>Buffer.from('not a PNG')).length,2);
});
test('all declared shipped tab icons decode and invalid paths cannot escape package',async()=>{
 const fs=require('node:fs');const {checkTabIcons}=await import('../scripts/check-tab-icons.mjs');
 const app=JSON.parse(fs.readFileSync('miniprogram/app.json'));
 assert.deepEqual(checkTabIcons(app,p=>fs.readFileSync('miniprogram/'+p)),[]);
 assert.equal(checkTabIcons({tabBar:{list:[{iconPath:'../secret',selectedIconPath:'/a'}]}},()=>{throw Error('must not read');}).length,2);
});
