const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('story audit fails closed when cloud security SDK is missing',async()=>{
 const source=fs.readFileSync('miniprogram/cloudfunctions/planFunTextStory/index.js','utf8');
 const context={module:{exports:{}},require(name){if(name==='wx-server-sdk')throw Error('unavailable');return {};}};
 vm.runInNewContext(source+'\nmodule.exports.auditForTest = defaultCheckContent;',context);
 const result=await context.module.exports.auditForTest('你好');
 assert.equal(result.ok,false);assert.equal(result.code,'SAFETY_UNAVAILABLE');
});
