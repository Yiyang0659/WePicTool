const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const model=require('../miniprogram/utils/layeredDressup');
const {loadMiniProgramPage,instantiatePage}=require('./helpers/miniprogram-loader.cjs');
function setup(){
  const menus=[],toasts=[];
  const page=instantiatePage(loadMiniProgramPage('miniprogram/pages/dressup/dressup.js',{}, {
    showActionSheet:opts=>menus.push(opts),showToast:opts=>toasts.push(opts)
  }));
  page.data.project=model.createProject({sourceMode:'upload'});
  return {page,menus,toasts};
}
test('group add menu routes manual to clicked group and AI to independent classification flow',()=>{
  const {page,menus}=setup(); let manual,ai=0;
  page.chooseUserItemsForGroup=key=>manual=key;
  page.onOpenAiImporter=()=>ai++;
  const before=structuredClone(page.data.project);
  page.onGroupAdd({currentTarget:{dataset:{group:'tops'}}});
  assert.deepEqual(Array.from(menus[0].itemList),['继续让 AI 整理','自己添加图片']);
  menus[0].success({tapIndex:1});assert.equal(manual,'tops');
  menus[0].success({tapIndex:0});assert.equal(ai,1);
  assert.deepEqual(page.data.project,before);
});
test('full, invalid and saving groups do not open menus; cancelling has no mutation',()=>{
  const {page,menus,toasts}=setup();
  const event={currentTarget:{dataset:{group:'tops'}}};
  page.data.saving=true;page.onGroupAdd(event);assert.equal(menus.length,0);
  page.data.saving=false;page.data.exportPreparing=true;page.onGroupAdd(event);assert.equal(menus.length,0);
  page.data.exportPreparing=false;page.data.project.groups.tops=Array(12).fill({id:'x'});
  page.onGroupAdd(event);assert.equal(menus.length,0);assert.equal(toasts.length,1);
  page.onGroupAdd({currentTarget:{dataset:{group:'invalid'}}});assert.equal(menus.length,0);
  page.data.project.groups.tops=[];
  const before=structuredClone(page.data.project);page.onGroupAdd(event);
  assert.deepEqual(page.data.project,before);
});
test('tail add tile follows materials and empty groups use same chooser',()=>{
  const wxml=fs.readFileSync('miniprogram/pages/dressup/dressup.wxml','utf8');
  assert.ok(wxml.indexOf('class="material group-add')>wxml.indexOf('wx:for="{{g.items}}"'));
  assert.match(wxml,/class="empty-group" wx:else bindtap="onGroupAdd"/);
});
