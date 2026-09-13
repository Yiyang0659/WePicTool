const { garmentPrompt } = require('./garmentPrompt');
const MODEL = 'HY-Image-v3.0-I2I-ToB-v1.0.1';

async function generateGarmentImage(cloud, imageInput, category) {
  const prompt = garmentPrompt(category);
  const match = /^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageInput || '');
  if (!match || Buffer.from(match[1], 'base64').length > 10 * 1024 * 1024) {
    throw new Error('HUNYUAN_INVALID_IMAGE');
  }
  if (typeof cloud.ai !== 'function') throw new Error('HUNYUAN_SDK_UPGRADE_REQUIRED');
  // One request only: a timed-out generation may already have consumed quota.
  let response;
  try {
    response = await cloud.ai().createImageModel('hunyuan-image').generateImage({
      model: MODEL,
      images: [match[1]],
      prompt,
      // Keep AI provenance; sequence numbers are composed separately after ordering.
      footnote: 'AI',
      revise: { value: false }
    });
  } catch (_) {
    // SDK errors can contain request payloads. Never propagate raw credentials/images.
    throw new Error('HUNYUAN_GENERATION_FAILED');
  }
  const url = response && response.data && response.data[0] && response.data[0].url;
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('HUNYUAN_INVALID_OUTPUT');
  return url;
}

module.exports = { MODEL, generateGarmentImage };
