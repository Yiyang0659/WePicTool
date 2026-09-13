const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadMiniProgramPage,instantiatePage}=require('./helpers/miniprogram-loader.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('seven-card stack traverses every card both ways and survives expansion',async()=>{
 const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/preview/preview.js'));
 page._maybeShowGuide=()=>{};page._hideGuide=()=>{};page._collapseTimers={};
 page._renderGroups([{cards:Array.from({length:7},(_,i)=>({url:'wxfile://'+i,num:String(i+1)}))}],'1:1');
 const front=()=>{const g=page.data.groupList[0];return g.nodes[g.frontIdx].num;};
 const swipe=async dir=>{page._settleStack(0,dir);await delay(390);};
 const seen=[front()];for(let i=0;i<7;i++){await swipe(-1);seen.push(front());}
 assert.deepEqual(seen,['1','2','3','4','5','6','7','1']);
 await swipe(1);assert.equal(front(),'7');await swipe(1);assert.equal(front(),'6');
 page.onToggleCapsule({currentTarget:{dataset:{gi:'0'}}});
 assert.equal(page.data.groupList[0].cards[0].num,'6');
 page.onToggleCapsule({currentTarget:{dataset:{gi:'0'}}});await delay(450);
 await swipe(-1);assert.equal(front(),'7');await swipe(-1);assert.equal(front(),'1');
 assert.equal(page.data.groupList[0].cards.length,7);
});
