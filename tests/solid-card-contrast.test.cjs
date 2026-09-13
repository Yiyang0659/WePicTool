const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('../miniprogram/utils/funTextProject');
const validator=require('../miniprogram/cloudhosting/fun-card-renderer/sceneValidator');

function fixture(){
  let p=model.createFunTextProject({sourceText:'今天真开心',now:88});
  const id=p.candidates[0].candidateId;
  p=model.selectCandidate(p,id);
  const first=p.candidates[0].editedScenes[0].sceneId;
  p=model.updateStylePack(p,id,first,'chalk-chaos-v1','card');
  p=model.insertFreeCard(p,id,first);
  const free=p.candidates[0].editedScenes[1].sceneId;
  p=model.updateCardText(p,id,free,'你好');
  return {p,id,free};
}
const text=p=>p.candidates[0].editedScenes[1].layers.find(l=>l.type==='text');

test('solid chalk card palette edits keep text readable on white and preserve other cards',()=>{
  let {p,id,free}=fixture();
  const other=structuredClone(p.candidates[0].editedScenes[0]);
  assert.equal(text(p).color,'#32414B');
  p=model.updateCardStyle(p,id,free,{paletteKey:'chalk-mint'},'card');
  assert.equal(text(p).color,'#32414B');
  p=model.updateCardStyle(p,id,free,{paletteKey:'chalk-candy'},'card');
  assert.equal(text(p).color,'#2D3740');
  assert.equal(text(p).text,'你好');
  assert.deepEqual(p.candidates[0].editedScenes[0],other);
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
});

test('solid background edits adjust contrast and undo restores prior text and background',()=>{
  let {p,id,free}=fixture();
  const before=structuredClone(p.candidates[0].editedScenes[1]);
  p=model.updateCardStyle(p,id,free,{backgroundColor:'#24303A'},'card');
  assert.equal(text(p).color,'#F9F4D0');
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
  assert.deepEqual(model.undoEdit(p).candidates[0].editedScenes[1],before);
  p=model.updateCardStyle(p,id,free,{backgroundVariantKey:'chalk-board-green'},'card');
  p=model.updateCardStyle(p,id,free,{backgroundColor:'#FFFFFF'},'card');
  assert.equal(text(p).color,'#32414B');
});

test('returning a white solid card to a chalk template restores the template text color',()=>{
  let {p,id,free}=fixture();
  p=model.updateCardStyle(p,id,free,{backgroundVariantKey:'chalk-board-green'},'card');
  assert.equal(text(p).color,'#F9F4D0');
  assert.equal(validator.validateRenderPayload(model.buildRenderPayload(p)).valid,true);
});
