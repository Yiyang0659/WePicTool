function previewKey(payload) {
  var scene=payload.scene;
  return JSON.stringify([1,payload.projectId,payload.candidateId,scene.sceneId,scene.background,
    scene.layers.filter(function(l){return l.type==='text';})]);
}
function createPreviewCache() {
  var ready=new Map(), tasks=new Map(), queue=[], active=0;
  var backgroundError=null;
  function cancelBackground(error){queue=queue.filter(function(t){if(!t.background)return true;tasks.delete(t.key);t.reject(error||Error('预加载已替换'));return false;});}
  function peek(payload){
    var key=previewKey(payload),entry=ready.get(key);
    if(!entry)return '';
    if(Date.now()-entry.time>15*60*1000){ready.delete(key);return '';}
    ready.delete(key);ready.set(key,entry);return entry.url;
  }
  function pump(){
    while(active<2 && queue.length){
      var foreground=queue.findIndex(function(t){return !t.background;});
      // Reserve one slot for visible edits; speculative work never fills both slots.
      if(foreground<0 && active>=1)return;
      var task=queue.splice(foreground<0?0:foreground,1)[0];task.started=true;active++;
      (function(t){Promise.resolve().then(function(){return t.request(t.payload);}).then(function(url){
        if(!t.background)backgroundError=null;
        if(tasks.get(t.key)===t){ready.set(t.key,{url:url,time:Date.now()});while(ready.size>60)ready.delete(ready.keys().next().value);}
        active--;if(tasks.get(t.key)===t)tasks.delete(t.key);pump();t.resolve(url);
      },function(error){
        if(error && ['SAFETY_UNAVAILABLE','RATE_LIMITED','CALLER_AUTH_UNAVAILABLE','CALLER_UNAUTHORIZED'].indexOf(error.code)>=0){backgroundError=error;cancelBackground(error);}
        active--;if(tasks.get(t.key)===t)tasks.delete(t.key);pump();t.reject(error);
      });})(task);
    }
  }
  function get(payload,request,background){
    var url=peek(payload);if(url)return Promise.resolve(url);
    if(background && backgroundError)return Promise.reject(backgroundError);
    var key=previewKey(payload),task=tasks.get(key);
    if(task){
      if(!background){task.background=false;if(!task.started){queue.splice(queue.indexOf(task),1);queue.unshift(task);}pump();}
      return task.promise;
    }
    task={key:key,payload:payload,request:request,background:!!background};
    task.promise=new Promise(function(resolve,reject){task.resolve=resolve;task.reject=reject;});
    tasks.set(key,task);if(background)queue.push(task);else queue.unshift(task);pump();return task.promise;
  }
  return {get:get,peek:peek,
    invalidate:function(payload){var key=previewKey(payload),task=tasks.get(key);ready.delete(key);tasks.delete(key);
      if(task && !task.started){queue.splice(queue.indexOf(task),1);task.reject(Error('预览缓存已失效'));}},
    cancelBackground:cancelBackground
  };
}
module.exports={previewKey:previewKey,createPreviewCache:createPreviewCache,shared:createPreviewCache()};
