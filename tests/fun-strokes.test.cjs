const test = require('node:test');
const assert = require('node:assert/strict');
const path = '../miniprogram/utils/funStrokes';
const stroke = () => ({ id:'stroke_1', brushKey:'pen', colorKey:'black', width:8, points:[{x:10,y:10},{x:100,y:10}] });

test('strokes reject invalid coordinates, widths, duplicate ids and oversized histories', () => {
  const ink = require(path);
  assert.equal(ink.valid([stroke()]),true);
  assert.equal(ink.valid([{...stroke(),width:999}]),false);
  assert.equal(ink.valid([{...stroke(),points:[{x:Infinity,y:2}]}]),false);
  assert.equal(ink.valid([stroke(),stroke()]),false);
  assert.equal(ink.valid([{...stroke(),points:Array.from({length:1001},()=>({x:0,y:0}))}]),false);
});

test('whole-stroke erase hits segments between sampled points and single dots', () => {
  const ink = require(path);
  assert.equal(ink.erase([stroke()],{x:50,y:12},2).length,0);
  assert.equal(ink.erase([stroke()],{x:50,y:40},2).length,1);
  assert.equal(ink.erase([{...stroke(),points:[{x:10,y:10}]}],{x:12,y:10},2).length,0);
});

test('stroke edits retain undoable data and invalidate final images', () => {
  const model = require('../miniprogram/utils/funTextProject');
  assert.equal(typeof model.updateStrokes,'function');
  const p = model.createFunTextProject({sourceText:'今天真开心',now:10});
  const c = p.candidates[0], s = c.editedScenes[0];
  p.renderedCards = [{url:'old'}];
  const edited = model.updateStrokes(p,c.candidateId,s.sceneId,[stroke()]);
  assert.equal(edited.candidates[0].editedScenes[0].strokes.length,1);
  assert.deepEqual(edited.renderedCards,[]);
  assert.equal((model.undoEdit(edited).candidates[0].editedScenes[0].strokes || []).length,0);
  const styled=model.switchCandidateStyle(edited,c.candidateId,'chalk-chaos-v1');
  assert.equal(styled.candidates[0].editedScenes[0].strokes.length,1);
});

test('client and container use identical bounded brush recipes',()=>{
 const fs=require('node:fs');
 assert.equal(fs.readFileSync(require.resolve(path),'utf8'),fs.readFileSync(require.resolve('../miniprogram/cloudhosting/fun-card-renderer/funStrokes'),'utf8'));
});
