const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const client=require('../miniprogram/utils/funCardRendererClient');
const options={serviceName:'renderer',cloudEnvId:'test'};
test('unavailable audit retains safe diagnostics and suppresses repeated export clicks',async()=>{
  let calls=0;
  const api={login:o=>o.success({code:'private-code'}),cloud:{callContainer(o){calls++;o.success({statusCode:503,requestId:'req-123',data:{code:'SAFETY_UNAVAILABLE',detail:'private'}});}}};
  await assert.rejects(client.requestRenderStack(api,{},options),e=>{
    assert.equal(e.code,'SAFETY_UNAVAILABLE');assert.equal(e.statusCode,503);
    assert.equal(e.requestId,'req-123');assert.equal(e.requestPath,'/render-stack');
    assert.ok(!JSON.stringify(e).includes('private'));return true;
  });
  await assert.rejects(client.requestRenderStack(api,{},options),/30秒/);
  assert.equal(calls,1);
});
test('missing container callback times out and aborts without retry',async()=>{
  let aborted=0,calls=0;
  const api={login:o=>o.success({code:'private-code'}),cloud:{callContainer(){calls++;return {abort(){aborted++;}};}}};
  await assert.rejects(client.requestRenderStack(api,{}, {...options,timeoutMs:10}),e=>e.code==='RENDER_TIMEOUT');
  assert.equal(calls,1);assert.equal(aborted,1);
});
test('late login cannot issue container request after timeout',async()=>{
  let login,calls=0;
  const api={login:o=>{login=o;},cloud:{callContainer(){calls++;}}};
  await assert.rejects(client.requestRenderStack(api,{}, {...options,timeoutMs:10}),e=>e.code==='RENDER_TIMEOUT');
  login.success({code:'late'});assert.equal(calls,0);
});
test('failed result never claims success and offers retained editor',()=>{
  const wxml=fs.readFileSync('miniprogram/pages/template-result/template-result.wxml','utf8');
  assert.match(wxml,/renderFailed \? '暂未生成成品'/);
  assert.match(wxml,/返回编辑，内容已保留/);
});
