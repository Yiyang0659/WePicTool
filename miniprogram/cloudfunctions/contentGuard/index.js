const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function toResult(response) {
  const errCode = response && Number(response.errCode);
  if (errCode === 0) return { ok: true, code: 'OK' };
  if (errCode === 87014) return { ok: false, code: 'CONTENT_UNSAFE' };
  return { ok: false, code: 'SAFETY_UNAVAILABLE' };
}

exports.main = async (event) => {
  const content = typeof (event && event.content) === 'string' ? event.content.trim() : '';
  if (!content) return { ok: false, code: 'CONTENT_UNSAFE' };

  try {
    const response = await cloud.openapi.security.msgSecCheck({ content: content });
    return toResult(response);
  } catch (err) {
    console.error('[contentGuard] 文本审核调用失败:', err && (err.errMsg || err.message || err));
    return { ok: false, code: 'SAFETY_UNAVAILABLE' };
  }
};
