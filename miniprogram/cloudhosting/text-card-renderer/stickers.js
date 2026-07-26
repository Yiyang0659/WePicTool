const PALETTE = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#A66CFF', '#FF9F43'];

function withTransform(ctx, x, y, size, rotation, draw) {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((rotation || 0) * Math.PI / 180);
  ctx.translate(-size / 2, -size / 2);
  draw();
  ctx.restore();
}

function drawStar(ctx, size, color) {
  ctx.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? size * 0.48 : size * 0.21;
    const x = size / 2 + Math.cos(angle) * radius;
    const y = size / 2 + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawFace(ctx, size, color, ears) {
  ctx.fillStyle = color;
  if (ears) {
    ctx.beginPath(); ctx.arc(size * 0.24, size * 0.24, size * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.76, size * 0.24, size * 0.18, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#171717';
  ctx.beginPath(); ctx.arc(size * 0.39, size * 0.46, size * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.61, size * 0.46, size * 0.035, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size / 2, size * 0.58, size * 0.06, 0, Math.PI); ctx.strokeStyle = '#171717'; ctx.lineWidth = size * 0.035; ctx.stroke();
}

function drawFlower(ctx, size) {
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3;
    ctx.beginPath();
    ctx.arc(size / 2 + Math.cos(angle) * size * 0.24, size / 2 + Math.sin(angle) * size * 0.24, size * 0.19, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE[index % PALETTE.length];
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.16, 0, Math.PI * 2); ctx.fillStyle = '#FFD93D'; ctx.fill();
}

function drawHeart(ctx, size, color) {
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.82);
  ctx.bezierCurveTo(size * 0.12, size * 0.57, size * 0.18, size * 0.2, size * 0.38, size * 0.25);
  ctx.bezierCurveTo(size * 0.5, size * 0.28, size * 0.5, size * 0.38, size / 2, size * 0.4);
  ctx.bezierCurveTo(size * 0.5, size * 0.38, size * 0.5, size * 0.28, size * 0.62, size * 0.25);
  ctx.bezierCurveTo(size * 0.82, size * 0.2, size * 0.88, size * 0.57, size / 2, size * 0.82);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSticker(ctx, key, x, y, size, rotation) {
  const index = Number(String(key).replace('sticker_', '')) || 0;
  withTransform(ctx, x, y, size, rotation, () => {
    switch (index) {
      case 0: drawStar(ctx, size, '#FFD93D'); break;
      case 1: drawFace(ctx, size, '#FFD93D', false); break;
      case 2: drawHeart(ctx, size, '#FF6B6B'); break;
      case 3: drawFlower(ctx, size); break;
      case 4:
        ctx.beginPath(); ctx.moveTo(size * 0.58, size * 0.06); ctx.lineTo(size * 0.2, size * 0.56); ctx.lineTo(size * 0.48, size * 0.56); ctx.lineTo(size * 0.37, size * 0.94); ctx.lineTo(size * 0.82, size * 0.4); ctx.lineTo(size * 0.54, size * 0.4); ctx.closePath(); ctx.fillStyle = '#4D96FF'; ctx.fill(); break;
      case 5:
        ctx.beginPath(); ctx.arc(size * 0.5, size * 0.58, size * 0.32, 0, Math.PI, true); ctx.strokeStyle = '#A66CFF'; ctx.lineWidth = size * 0.13; ctx.stroke();
        ctx.strokeStyle = '#FF6B6B'; ctx.lineWidth = size * 0.13; ctx.beginPath(); ctx.arc(size * 0.5, size * 0.58, size * 0.19, 0, Math.PI, true); ctx.stroke(); break;
      case 6: drawFace(ctx, size, '#FF9F43', true); break;
      case 7: drawFace(ctx, size, '#CFA66A', true); break;
      case 8:
        ctx.fillStyle = '#FF6B6B'; ctx.beginPath(); ctx.arc(size * 0.37, size * 0.4, size * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(size * 0.63, size * 0.4, size * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4D96FF'; ctx.lineWidth = size * 0.07; ctx.beginPath(); ctx.moveTo(size * 0.5, size * 0.35); ctx.lineTo(size * 0.5, size * 0.88); ctx.stroke(); break;
      case 9:
        ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.31, 0, Math.PI * 2); ctx.fillStyle = '#FFD93D'; ctx.fill();
        ctx.strokeStyle = '#FF9F43'; ctx.lineWidth = size * 0.07; for (let ray = 0; ray < 8; ray += 1) { const angle = ray * Math.PI / 4; ctx.beginPath(); ctx.moveTo(size / 2 + Math.cos(angle) * size * 0.43, size / 2 + Math.sin(angle) * size * 0.43); ctx.lineTo(size / 2 + Math.cos(angle) * size * 0.5, size / 2 + Math.sin(angle) * size * 0.5); ctx.stroke(); } break;
      case 10: drawStar(ctx, size, '#A66CFF'); break;
      default:
        ctx.beginPath(); ctx.roundRect(size * 0.08, size * 0.16, size * 0.84, size * 0.62, size * 0.16); ctx.fillStyle = '#6BCB77'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(size * 0.65, size * 0.78); ctx.lineTo(size * 0.78, size * 0.92); ctx.lineTo(size * 0.8, size * 0.75); ctx.fillStyle = '#6BCB77'; ctx.fill();
    }
  });
}

module.exports = { drawSticker };
