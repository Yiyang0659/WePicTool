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

test('image diagnostics retain API status rid hash and trace without retrying 45009', async()=>{
 const {createHash}=require('node:crypto');
 for(const status of [200,503]) {
  const logs=[];let images=0;
  const checker=createWechatSafety({appId:'wx1234567890abcdef',appSecret:'secret-fixture',onError:d=>logs.push(d),fetch:async url=>{
   if(url.includes('stable_token')) return {ok:true,json:async()=>({access_token:'token-fixture',expires_in:7200})};
   images++;return {ok:status===200,status,json:async()=>({errcode:45009,errmsg:'reach max api daily quota limit',rid:'rid-123'})};
  }});
  const buffer=Buffer.from('private-image-fixture');
  assert.equal((await checker.checkImage(buffer,{traceId:'trace-123',openid:'private-openid'})).code,'IMAGE_SAFETY_UNAVAILABLE');
  assert.equal(images,1);assert.equal(logs.length,1);
  assert.equal(logs[0].api,'/wxa/img_sec_check');assert.equal(logs[0].httpStatus,status);
  assert.equal(logs[0].errcode,45009);assert.equal(logs[0].rid,'rid-123');assert.equal(logs[0].traceId,'trace-123');
  assert.equal(logs[0].contentHash,createHash('sha256').update(buffer).digest('hex'));
  for(const secret of ['secret-fixture','token-fixture','private-image-fixture','private-openid']) assert.ok(!JSON.stringify(logs).includes(secret));
 }
});

test('concurrent image token failures preserve each caller trace and merge token fetch',async()=>{
 const logs=[];let calls=0;
 const checker=createWechatSafety({appId:'wx1234567890abcdef',appSecret:'test',onError:d=>logs.push(d),fetch:async()=>{
  calls++;await new Promise(resolve=>setTimeout(resolve,5));return {ok:true,status:200,json:async()=>({errcode:45009,errmsg:'limited',rid:'token-rid'})};
 }});
 await Promise.all(['a','b'].map(traceId=>checker.checkImage(Buffer.from('img'),{traceId})));
 assert.equal(calls,1);assert.deepEqual(logs.map(d=>d.traceId).sort(),['a','b']);
 assert.ok(logs.every(d=>d.api==='/cgi-bin/stable_token'));
});

test('native image errors are sanitized and failing logger does not alter result',async()=>{
 const logs=[];
 const checker=createWechatSafety({appId:'wx1234567890abcdef',appSecret:'test',onError:d=>{logs.push(d);throw Error('logger');},fetch:async url=>{
  if(url.includes('stable_token')) return {ok:true,json:async()=>({access_token:'private-token',expires_in:7200})};
  throw Error(url);
 }});
 assert.equal((await checker.checkImage(Buffer.from('img'),{traceId:'safe-trace'})).code,'IMAGE_SAFETY_UNAVAILABLE');
 assert.equal(logs[0].code,'WECHAT_REQUEST_FAILED');assert.ok(!JSON.stringify(logs).includes('private-token'));
});
