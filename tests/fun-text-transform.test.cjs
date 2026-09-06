'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const transform = require('../miniprogram/utils/funTextTransform');

test('single-touch drag maps preview pixels into the 1080 scene', () => {
  const start = transform.beginTransform([{ x: 100, y: 100 }], {
    x: 540, y: 540, scale: 1, rotation: 0
  }, 320);
  assert.deepEqual(transform.updateTransform(start, [{ x: 132, y: 84 }]), {
    x: 648, y: 486, scale: 1, rotation: 0
  });
});

test('two-touch gesture applies center movement, scale and rotation with bounds', () => {
  const start = transform.beginTransform([{ x: 100, y: 100 }, { x: 140, y: 100 }], {
    x: 540, y: 540, scale: 1, rotation: 10
  }, 320);
  const next = transform.updateTransform(start, [{ x: 100, y: 100 }, { x: 100, y: 180 }]);
  assert.equal(next.x, 473);
  assert.equal(next.y, 675);
  assert.equal(next.scale, 2);
  assert.equal(next.rotation, 100);

  const bounded = transform.clampTransform({ x: -20, y: 1400, scale: 9, rotation: 725 });
  assert.deepEqual(bounded, { x: 0, y: 1080, scale: 2.5, rotation: 5 });
});
