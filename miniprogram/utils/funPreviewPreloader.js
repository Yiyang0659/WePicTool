const cache=require('./funPreviewCache');
const client=require('./funCardRendererClient');
const exporter=require('./imageExporter');
const model=require('./funTextProject');
const fonts=require('../config/fontFeels');
const env=require('../config/env');
const localFonts=require('./localFontRenderer');
let lastWarmKey='';
function request(wxApi,payload){
  if(env.ENABLE_FUN_OFFLINE_PREVIEW===true)return Promise.reject(new Error('本机预览不调用云端'));
  return client.requestPreviewScene(wxApi,payload).then(url=>exporter.resolveImagePath(wxApi,url));
}
function payloads(project,candidateId,index){
  const candidates=project.candidates||[], list=[];
  const add=(candidate,scene)=>{if(scene)list.push({projectId:project.projectId,candidateId:candidate.candidateId,scene});};
  const selected=candidates.find(c=>c.candidateId===candidateId);
  if(selected)add(selected,selected.editedScenes[index||0]);
  candidates.forEach(c=>add(c,c.editedScenes[0]));
  (selected?[selected]:candidates).forEach(c=>c.editedScenes.forEach(s=>add(c,s)));
  (selected?[selected]:candidates).forEach(candidate=>fonts.FONT_KEYS.forEach(key=>{
    const changed=model.updateCardStyle(project,candidate.candidateId,candidate.editedScenes[0].sceneId,{fontFeelKey:key},'stack');
    const c=changed.candidates.find(c=>c.candidateId===candidate.candidateId);
    c.editedScenes.forEach(s=>add(c,s));
  }));
  const seen=new Set();return list.filter(p=>{const key=cache.previewKey(p);if(seen.has(key))return false;seen.add(key);return true;});
}
function warm(wxApi,project,candidateId,index){
  if(env.ENABLE_FUN_OFFLINE_PREVIEW===true){
    if(wxApi && wxApi.getFileSystemManager)localFonts.warm(wxApi).catch(()=>{});
    return;
  }
  if(!project || !wxApi || !wxApi.cloud || !wxApi.login)return;
  const list=payloads(project,candidateId,index);
  const key=JSON.stringify(list.map(cache.previewKey));
  if(key===lastWarmKey)return;
  lastWarmKey=key;
  cache.shared.cancelBackground();
  list.forEach((p,i)=>cache.shared.get(p,input=>request(wxApi,input),!(candidateId && i===0)).catch(()=>{}));
}
module.exports={request,warm,payloads};
