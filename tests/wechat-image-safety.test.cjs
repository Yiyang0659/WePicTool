const test=require('node:test');const assert=require('node:assert/strict');
const {createWechatSafety}=require('../miniprogram/cloudhosting/fun-card-renderer/wechatSafety');
test('image checker shares token cache and fails closed for rejection or unknown result',async()=>{
 let tokens=0, result={errcode:0};
 const checker=createWechatSafety({appId:'wx1234567890abcdef',appSecret:'test',fetch:async(url,opts)=>{
   if(url.includes('stable_token')){tokens++;return {ok:true,json:async()=>({access_token:'test',expires_in:7200})};}
   assert.ok(opts.body instanceof FormData);return {ok:true,json:async()=>result};
 }});
 assert.equal(typeof checker.checkImage,'function');
 assert.deepEqual(await checker.checkImage(Buffer.from('test')),{ok:true,code:'OK'});
 result={errcode:87014};assert.equal((await checker.checkImage(Buffer.from('test'))).code,'CONTENT_UNSAFE');
 result={};assert.equal((await checker.checkImage(Buffer.from('test'))).code,'IMAGE_SAFETY_UNAVAILABLE');
 assert.equal(tokens,1);
});
