function point(touch) {
  return {
    x: Number(touch && (touch.x !== undefined ? touch.x : touch.clientX)) || 0,
    y: Number(touch && (touch.y !== undefined ? touch.y : touch.clientY)) || 0
  };
}

function midpoint(points) {
  if (points.length < 2) return points[0] || { x: 0, y: 0 };
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
}

function distance(points) {
  if (points.length < 2) return 0;
  var dx = points[1].x - points[0].x;
  var dy = points[1].y - points[0].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angle(points) {
  if (points.length < 2) return 0;
  return Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) * 180 / Math.PI;
}

function normalizeRotation(value) {
  var result = Number(value) || 0;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return Math.round(result * 10) / 10;
}

function clampTransform(value) {
  return {
    x: Math.max(0, Math.min(1080, Math.round(Number(value.x) || 0))),
    y: Math.max(0, Math.min(1080, Math.round(Number(value.y) || 0))),
    scale: Math.max(0.35, Math.min(2.5, Math.round((Number(value.scale) || 0.35) * 100) / 100)),
    rotation: normalizeRotation(value.rotation)
  };
}

function beginTransform(touches, layer, previewSize) {
  var points = Array.from(touches || []).slice(0, 2).map(point);
  return {
    points: points,
    center: midpoint(points),
    distance: distance(points),
    angle: angle(points),
    layer: clampTransform(layer || {}),
    scenePerPixel: 1080 / (Number(previewSize) || 320)
  };
}

function updateTransform(start, touches) {
  var points = Array.from(touches || []).slice(0, 2).map(point);
  if (!start || !points.length) return start && start.layer;
  var center = midpoint(points);
  var result = {
    x: start.layer.x + (center.x - start.center.x) * start.scenePerPixel,
    y: start.layer.y + (center.y - start.center.y) * start.scenePerPixel,
    scale: start.layer.scale,
    rotation: start.layer.rotation
  };
  if (points.length >= 2 && start.points.length >= 2 && start.distance > 0) {
    result.scale = start.layer.scale * distance(points) / start.distance;
    result.rotation = start.layer.rotation + angle(points) - start.angle;
  }
  return clampTransform(result);
}

module.exports = {
  beginTransform: beginTransform,
  updateTransform: updateTransform,
  clampTransform: clampTransform
};
