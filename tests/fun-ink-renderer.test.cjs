const test=require('node:test');const assert=require('node:assert/strict');
const {createSceneRenderer}=require('../miniprogram/cloudhosting/fun-card-renderer/renderer');
test('ink final renderer audits PNG before upload and never uploads a rejected PNG',async()=>{
 const scene={sceneId:'scene_test',order:1,strokes:[{id:'stroke_a'}]};
 const order=[];
 const render=createSceneRenderer({makePng:async()=>Buffer.from('PNG'),
   checkImage:async()=>{order.push('audit');return {ok:false,code:'CONTENT_UNSAFE'};},
   uploadBuffer:async()=>{order.push('upload');return {url:'cloud://test',fileId:'f'};}});
 await assert.rejects(render([scene],{kind:'final',size:1080,projectId:'funtext_test',candidateId:'candidate_test'}),e=>e.code==='CONTENT_UNSAFE');
 assert.deepEqual(order,['audit']);
});
