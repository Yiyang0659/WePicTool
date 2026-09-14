const ink = require('./funStrokes');
const KEY = 'wepic_handwriting_library_v1';
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function validItem(item) {
  return item && /^hw_[a-zA-Z0-9_]+$/.test(item.id) && Number.isFinite(item.updatedAt) &&
    Array.isArray(item.strokes) && item.strokes.length > 0 && ink.valid(item.strokes,item.workspaceSize) && validViewport(item) &&
    (item.backgroundColor === undefined || /^#[0-9a-f]{6}$/i.test(item.backgroundColor)) &&
    (item.purpose === undefined || ['sticker','card'].includes(item.purpose));
}
function validViewport(item) {
  const size=item.workspaceSize===undefined?1080:item.workspaceSize, v=item.viewport;
  return !v || [v.x,v.y].every(n=>Number.isFinite(n) && n>=0 && n<=size-1080);
}
function read(storage) {
  const value = storage.getStorageSync(KEY);
  if (!value) return [];
  if (!Array.isArray(value) || value.length > 10 || !value.every(validItem)) throw new Error('手写草稿格式异常，请勿清理应用数据');
  return copy(value);
}
function save(storage, item) {
  if (!validItem(item)) throw new Error('请先写画，再保存草稿');
  const items = read(storage).filter(entry => entry.id !== item.id);
  items.unshift(copy(item));
  if (items.length > 10) throw new Error('最多保存10份手写草稿，请先删除旧草稿');
  if (encodeURIComponent(JSON.stringify(items)).replace(/%[A-F\d]{2}/gi, 'x').length > 2 * 1024 * 1024) throw new Error('手写草稿已达到本机容量上限');
  storage.setStorageSync(KEY, items);
  return items;
}
function scene(strokes, metadata) {
  const size=metadata && metadata.workspaceSize || 1080;
  return {sceneId:'handwriting',background:{color:metadata && metadata.purpose==='card' ? metadata.backgroundColor || '#FFFFFF' : 'transparent'},layers:[],strokes:copy(strokes),workspaceSize:size,
    purpose:metadata && metadata.purpose || 'sticker',backgroundColor:metadata && metadata.backgroundColor || '#FFFFFF',
    viewport:copy(metadata && metadata.viewport || {x:0,y:0})};
}
function decorate(items) {
  return items.map(item => {
    const d = new Date(item.updatedAt);
    return Object.assign({},item,{scene:scene(item.strokes,item),timeLabel:(d.getMonth()+1)+'月'+d.getDate()+'日 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')});
  });
}
module.exports = {KEY,read,save,scene,decorate,copy};
