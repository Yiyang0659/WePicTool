const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {generateGarmentImage,MODEL}=require('../miniprogram/cloudfunctions/processOutfit/hunyuanImage');
const input='data:image/png;base64,aGVsbG8=';
test('Hunyuan garment generation uses fixed growth-plan provider and one reference',async()=>{
  let request;
  const cloud={ai:()=>({createImageModel(provider){assert.equal(provider,'hunyuan-image');return {async generateImage(args){request=args;return {data:[{url:'https://example.com/result.png'}]}}}}})};
  assert.equal(await generateGarmentImage(cloud,input,'tops'),'https://example.com/result.png');
  assert.equal(request.model,MODEL);assert.deepEqual(request.images,['aGVsbG8=']);
  assert.equal(request.revise.value,false);assert.ok(request.prompt.length>100);
  assert.equal(request.footnote,'AI');
  assert.equal(request.apiKey,undefined);
});
test('generation failure never retries, falls back, or exposes SDK payload',async()=>{
  let calls=0;
  const cloud={ai:()=>({createImageModel:()=>({async generateImage(){calls++;throw Error('secret payload')}})})};
  await assert.rejects(generateGarmentImage(cloud,input,'tops'),{message:'HUNYUAN_GENERATION_FAILED'});
  assert.equal(calls,1);
});
test('invalid image and old SDK fail before calling provider',async()=>{
  await assert.rejects(generateGarmentImage({},'data:image/gif;base64,aGVsbG8=','tops'),/INVALID_IMAGE/);
  await assert.rejects(generateGarmentImage({},input,'tops'),/SDK_UPGRADE_REQUIRED/);
});
test('invalid or insecure output is rejected',async()=>{
  for(const value of [{}, {data:[]}, {data:[{url:'http://example.com/image'}]}]){
    const cloud={ai:()=>({createImageModel:()=>({async generateImage(){return value}})})};
    await assert.rejects(generateGarmentImage(cloud,input,'tops'),/INVALID_OUTPUT/);
  }
});
test('deployed entry routes image generation only to Hunyuan adapter',()=>{
  const src=fs.readFileSync('miniprogram/cloudfunctions/processOutfit/index.js','utf8');
  assert.match(src,/generateGarmentImage\(cloud, imageInput, category\)/);
  assert.match(src,/qwen3\.8-flash/);
  assert.doesNotMatch(src,/qwen-image|DASHSCOPE_MATTING_MODEL|mattingImageWithDashScope/);
  assert.match(src,/AI_KEY_MISSING/);
});
