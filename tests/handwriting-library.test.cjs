const {test}=require('node:test');const assert=require('node:assert/strict');
const lib=require('../miniprogram/utils/handwritingLibrary');const groups=require('../miniprogram/utils/inkStickers');
const model=require('../miniprogram/utils/funTextProject');
const strokes=[{id:'stroke_a',brushKey:'pen',colorKey:'black',width:8,points:[{x:400,y:400},{x:600,y:600}]}];
test('handwriting library restores real data, bounds count, and keeps project draft independent',()=>{
  const data={project:'keep'};const storage={getStorageSync:k=>data[k],setStorageSync:(k,v)=>data[k]=v};
  assert.deepEqual(lib.read(storage),[]);
  for(let i=0;i<10;i++)lib.save(storage,{id:'hw_'+i,updatedAt:i,strokes});
  assert.throws(()=>lib.save(storage,{id:'hw_extra',updatedAt:20,strokes}),/10/);
  assert.equal(lib.read(storage)[0].id,'hw_9');assert.equal(data.project,'keep');
  assert.throws(()=>lib.save({...storage,setStorageSync(){throw Error('full');}},{id:'hw_9',updatedAt:22,strokes}),/full/);
});
test('sticker transforms flatten into audited stroke protocol without mutating originals',()=>{
  const g={id:'hw_a',x:540,y:540,scale:1,rotation:90,strokes};
  const s=groups.renderScene({strokes:[],inkStickers:[g]});
  assert.equal(s.strokes[0].points[0].x,680);assert.equal(s.inkStickers,undefined);
  assert.equal(strokes[0].points[0].x,400);
  assert.throws(()=>groups.flatten({inkStickers:[{...g,x:-2000}]}),/画布/);
});
test('ink sticker edits preserve undo and send actual transformed strokes to renderer',()=>{
  let p=model.createFunTextProject({sourceText:'今天真开心',now:1});p=model.selectCandidate(p,p.candidates[0].candidateId);
  const id=p.selectedCandidateId,scene=p.candidates[0].editedScenes[0].sceneId;
  p=model.updateInkStickers(p,id,scene,[{id:'hw_a',x:540,y:540,scale:1,rotation:0,strokes}]);
  assert.equal(model.buildRenderPayload(p).scenes[0].strokes.length,1);
  assert.equal((model.buildRenderPayload(model.undoEdit(p)).scenes[0].strokes || []).length,0);
});
