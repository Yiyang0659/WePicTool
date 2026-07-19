function assessSecurityResponse(response) {
  var errCode = response && Number(response.errCode);
  if (errCode === 0) return { ok: true, code: 'OK' };
  if (errCode === 87014) return { ok: false, code: 'CONTENT_UNSAFE' };
  return { ok: false, code: 'SAFETY_UNAVAILABLE' };
}

function inferImageMimeType(fileId) {
  var value = String(fileId || '').toLowerCase();
  if (/\.png(?:$|[?#])/.test(value)) return 'image/png';
  if (/\.webp(?:$|[?#])/.test(value)) return 'image/webp';
  if (/\.gif(?:$|[?#])/.test(value)) return 'image/gif';
  return 'image/jpeg';
}

async function mapWithConcurrency(items, limit, worker) {
  var source = Array.isArray(items) ? items : [];
  var maxWorkers = Math.max(1, Math.min(Number(limit) || 1, source.length));
  var output = new Array(source.length);
  var nextIndex = 0;

  async function runWorker() {
    while (nextIndex < source.length) {
      var currentIndex = nextIndex;
      nextIndex += 1;
      output[currentIndex] = await worker(source[currentIndex], currentIndex);
    }
  }

  var workers = [];
  for (var i = 0; i < maxWorkers; i++) workers.push(runWorker());
  await Promise.all(workers);
  return output;
}

module.exports = {
  assessSecurityResponse: assessSecurityResponse,
  inferImageMimeType: inferImageMimeType,
  mapWithConcurrency: mapWithConcurrency
};
