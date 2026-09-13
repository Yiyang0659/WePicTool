const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {loadMiniProgramModule}=require('./helpers/miniprogram-loader.cjs');
const {createHttpServer}=require('../miniprogram/cloudhosting/fun-card-renderer/server');
const payload={projectId:'p',candidateId:'c',stylePackId:'pink-note-v1',scenes:[{sceneId:'scene_free_1',order:1,stylePackId:'chalk-chaos-v1'}]};
function client(){return loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js',{'../config/env':{CLOUD_ENV_ID:'e',FUN_CARD_RENDERER_SERVICE:'r',FUN_CARD_RENDERER_DEV_GRAY:'gray015',FUN_CARD_RENDERER_SUPPORTS_FREE_CARDS:false}});}
test('free card requests audited render directly without a separate capability gate',async()=>{
 const paths=[];
 const wx={getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),login:o=>o.success({code:'login'}),cloud:{callContainer(o){paths.push(o.path);o.success({statusCode:200,data:o.path.startsWith('/render-capabilities')?{ok:true,freeCards:true,protocol:1}:{ok:true,projectId:'p',candidateId:'c',cards:[{sceneId:'scene_free_1',order:1,url:'cloud://image'}]}});}}};
 const result=await client().requestRenderStack(wx,payload);
 assert.equal(result.cards[0].sceneId,'scene_free_1');
 assert.deepEqual(paths,['/render-stack?gray015=1']);
});
test('render errors and missing cards never become successful saves',async()=>{
 for(const response of [{statusCode:404,data:{ok:false}}, {statusCode:200,data:{ok:true,freeCards:true}}, {statusCode:200,data:{ok:true,freeCards:false,protocol:1}}]){
  const paths=[];const wx={login:o=>o.success({code:'login'}),cloud:{callContainer(o){paths.push(o.path);o.success(response);}}};
  await assert.rejects(client().requestRenderStack(wx,payload),{code:'INVALID_RENDER_RESPONSE'});
  assert.deepEqual(paths,['/render-stack']);
 }
});
test('server capability uses existing authenticated entry, no audit or upload',async()=>{
 const server=createHttpServer({verifyCaller:async code=>code==='valid'?{openid:'user'}:{statusCode:403,code:'CALLER_UNAUTHORIZED'}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const url='http://127.0.0.1:'+server.address().port+'/render-capabilities';
  const denied=await fetch(url,{method:'POST',body:'{}'});assert.equal(denied.status,403);
  const res=await fetch(url,{method:'POST',headers:{'x-wepic-login-code':'valid'},body:'{}'});
  assert.deepEqual(await res.json(),{ok:true,protocol:1,freeCards:true});
 }finally{await new Promise(resolve=>server.close(resolve));}
});
