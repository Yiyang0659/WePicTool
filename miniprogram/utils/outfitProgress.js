// Session-local results: never retry a successful image or automatically retry an AI request.
function describeError(error) {
  const code = String(error && (error.code || error.errCode) || '');
  const message = String(error && (error.errMsg || error.message) || '');
  if (code === 'CONTENT_UNSAFE') return { message: '图片审核未通过，请更换图片', retryable: false };
  if (code === 'AI_KEY_MISSING') return { message: '分类服务密钥尚未配置', retryable: true };
  if (code === 'SAFETY_UNAVAILABLE') return { message: '图片安全检查暂不可用', retryable: true };
  if (/timeout|timed out|超时/i.test(code + message)) return { message: '请求超时，后台可能仍在处理；重试可能再次消耗额度', retryable: true };
  if (/permission|unauthorized|forbidden|权限|未启用云开发|function.*not.*found/i.test(code + message)) return { message: '云服务权限或函数配置异常，请检查配置', retryable: true };
  if (code === 'UPLOAD_FAILED') return { message: '图片上传失败，请检查网络', retryable: true };
  if (code === 'GENERATION_FAILED') return { message: '图片生成失败，未将原图当作成图', retryable: true };
  return { message: '网络或云服务响应异常，请稍后重试', retryable: true };
}

function parseResult(task, image) {
  if (task && task.error) throw task.error;
  const entries = [];
  Object.keys(task && task.groups || {}).forEach(key => {
    (task.groups[key] || []).forEach(item => entries.push({ key, item }));
  });
  if (!task || task.status !== 'done' || entries.length !== 1 ||
      entries[0].item.sourceImageId !== image.imageId) throw { code: 'INVALID_RESULT' };
  const entry = entries[0];
  if (entry.item.status !== 'done' || entry.item.error ||
      (['tops', 'bottoms', 'shoes'].includes(entry.key) && !entry.item.matted)) {
    throw { code: 'GENERATION_FAILED' };
  }
  if (!['head', 'tops', 'bottoms', 'shoes', 'others'].includes(entry.key)) throw { code: 'INVALID_RESULT' };
  return entry;
}

function createSession(images) {
  return images.map((image, index) => ({ image, index, status: 'waiting', result: null, error: null }));
}

async function runSession(rows, request, isCurrent, onProgress) {
  const queue = rows.filter(row => row.status === 'waiting');
  let cursor = 0;
  async function worker() {
    while (isCurrent() && cursor < queue.length) {
      const row = queue[cursor++];
      row.status = 'processing';
      row.startedAt = Date.now();
      onProgress();
      try {
        const task = await request(row.image);
        if (!isCurrent()) return;
        row.result = parseResult(task, row.image);
        row.status = 'done';
      } catch (error) {
        if (!isCurrent()) return;
        row.status = 'failed';
        row.error = describeError(error);
      }
      onProgress();
    }
  }
  await Promise.all([worker(), worker()]);
}

function retryFailed(rows) {
  rows.forEach(row => {
    if (row.status === 'failed' && row.error.retryable) {
      row.status = 'waiting'; row.error = null;
    }
  });
}

function mergeResults(rows) {
  const groups = { head: [], tops: [], bottoms: [], shoes: [], others: [] };
  const names = { head: '头像', tops: '上衣', bottoms: '下装', shoes: '鞋子', others: '其他素材' };
  rows.forEach(row => {
    if (row.status !== 'done') return;
    const { key, item } = row.result;
    const order = groups[key].length + 1;
    groups[key].push(Object.assign({}, item, { order, label: names[key] + ' ' + order }));
  });
  return { taskId: 'batch_' + Date.now(), status: 'done', groups };
}

module.exports = { describeError, parseResult, createSession, runSession, retryFailed, mergeResults };
