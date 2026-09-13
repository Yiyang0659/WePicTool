// Keep small/legacy records inline. Publish a large value only after all chunks exist.
const CHUNK = 64000;
let sequence = 0;
function isManifest(value) { return value && value.recordChunks === 1 && Array.isArray(value.keys); }
function cleanup(storage, value) {
  if (!isManifest(value)) return;
  value.keys.forEach(key => { try { storage.removeStorageSync(key); } catch (_) { /* best effort */ } });
}
function get(storage, key) {
  const value = storage.getStorageSync(key);
  if (!isManifest(value)) return value;
  const parts = value.keys.map(partKey => {
    const part = storage.getStorageSync(partKey);
    if (typeof part !== 'string' || !part.length) throw new Error('记录数据不完整，请勿清理应用数据');
    return part;
  });
  return JSON.parse(parts.join(''));
}
function set(storage, key, value) {
  const previous = storage.getStorageSync(key);
  const serialized = JSON.stringify(value);
  if (serialized.length <= 250000) {
    storage.setStorageSync(key, value);
    cleanup(storage, previous);
    return;
  }
  const manifest = {recordChunks:1, keys:[]};
  const prefix = key + '_parts_' + Date.now() + '_' + (++sequence) + '_';
  try {
    for (let offset=0; offset<serialized.length; offset+=CHUNK) {
      const partKey=prefix+manifest.keys.length;
      manifest.keys.push(partKey);
      storage.setStorageSync(partKey, serialized.slice(offset,offset+CHUNK));
    }
    storage.setStorageSync(key,manifest);
  } catch (error) { cleanup(storage,manifest); throw error; }
  cleanup(storage,previous);
}
function remove(storage,key) {
  const previous=storage.getStorageSync(key);
  storage.removeStorageSync(key);
  cleanup(storage,previous);
}
module.exports={get,set,remove};
