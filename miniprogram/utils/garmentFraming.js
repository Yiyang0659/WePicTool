// Only for generated white-background products, never arbitrary user originals.
function findBounds(pixels, width, height) {
  if (!pixels || pixels.length !== width * height * 4 || width < 1 || height < 1) return null;
  let left = width, top = height, right = -1, bottom = -1, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Very conservative white cutoff: retain light fabric/shadows instead of cutting them off.
      if (pixels[i + 3] < 16 || (pixels[i] >= 250 && pixels[i + 1] >= 250 && pixels[i + 2] >= 250)) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
    }
  }
  // Do not magnify tiny noise or an effectively invisible white product.
  if (count < width * height * 0.005 || right - left < width * 0.04 || bottom - top < height * 0.04) return null;
  const pad = Math.max(2, Math.ceil(Math.max(width, height) * 0.012));
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function fit(width, height, sourceWidth, sourceHeight) {
  const scale = Math.min(width * 0.92 / sourceWidth, height * 0.92 / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
module.exports = { findBounds, fit };
