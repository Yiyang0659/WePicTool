const {test}=require('node:test');
const assert=require('node:assert/strict');
const records=require('../miniprogram/utils/recordStorage');
function memory(){
  const data={};
  return {data,getStorageSync:k=>data[k],removeStorageSync:k=>{delete data[k];},setStorageSync(k,v){
    if(Buffer.byteLength(JSON.stringify(v))>1024*1024)throw Error('entry size limit reached');
    data[k]=v;
  }};
}
test('large history round trips unicode, order and handwriting without single-entry overflow',()=>{
  const s=memory(), value=[{text:'字😀'.repeat(250000),strokes:[{points:[{x:5,y:6}]}]}, {id:2}];
  assert.throws(()=>s.setStorageSync('history',value),/entry size/);
  records.set(s,'history',value);
  assert.deepEqual(records.get(s,'history'),value);
  records.set(s,'history',[{id:3}]);
  assert.deepEqual(s.data,{history:[{id:3}]});
});
test('failed chunk write retains prior records and removes only new chunks',()=>{
  const s=memory();records.set(s,'history',[{text:'a'.repeat(350000)}]);
  const before=JSON.stringify(s.data), original=s.setStorageSync;
  let writes=0;s.setStorageSync=function(k,v){if(++writes===2)throw Error('quota');original.call(s,k,v);};
  assert.throws(()=>records.set(s,'history',[{text:'b'.repeat(350000)}]),/quota/);
  assert.equal(JSON.stringify(s.data),before);
});
test('legacy reads and deleting chunked history are compatible',()=>{
  const s=memory();s.data.history=[{id:1}];assert.deepEqual(records.get(s,'history'),[{id:1}]);
  records.set(s,'history',[{text:'a'.repeat(350000)}]);records.remove(s,'history');
  assert.deepEqual(s.data,{});
});
