const test=require('node:test');
const assert=require('node:assert/strict');
const {loadMiniProgramModule}=require('./helpers/miniprogram-loader.cjs');
for(const version of ['develop','trial','release','unknown',undefined,'throws']){
  test('015 final routing is isolated for '+String(version),async()=>{
    const client=loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js',{'../config/env':{
      FUN_CARD_RENDERER_SERVICE:'renderer',CLOUD_ENV_ID:'env',FUN_CARD_RENDERER_DEV_GRAY:'gray015'
    }});
    let path;
    const wx={getAccountInfoSync(){if(version==='throws')throw Error('unavailable');return {miniProgram:{envVersion:version}};},login(o){o.success({code:'test-code'});},cloud:{callContainer(o){path=o.path;o.success({statusCode:200,data:{ok:true,projectId:'p',candidateId:'c',cards:[{sceneId:'s',order:1,url:'cloud://test/image'}]}});}}};
    await client.requestRenderStack(wx,{projectId:'p',candidateId:'c',scenes:[{sceneId:'s',order:1}]});
    assert.equal(path,version==='develop'?'/render-stack?gray015=1':'/render-stack');
  });
}
test('cleared or invalid dev route configuration uses stable even in develop',async()=>{
  for(const configured of ['',undefined,'gray999','gray015&other=1']){
    const client=loadMiniProgramModule('miniprogram/utils/funCardRendererClient.js',{'../config/env':{FUN_CARD_RENDERER_SERVICE:'renderer',CLOUD_ENV_ID:'env',FUN_CARD_RENDERER_DEV_GRAY:configured}});
    let path;
    await client.requestRenderStack({getAccountInfoSync:()=>({miniProgram:{envVersion:'develop'}}),login:o=>o.success({code:'code'}),cloud:{callContainer(o){path=o.path;o.success({statusCode:200,data:{ok:true,projectId:'p',candidateId:'c',cards:[]}});}}},{projectId:'p',candidateId:'c',scenes:[]});
    assert.equal(path,'/render-stack');
  }
});
