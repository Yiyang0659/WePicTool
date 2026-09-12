'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'miniprogram', file), 'utf8');

test('handwriting modal unmounts background draft canvases, without deleting draft tiles', () => {
  const wxml = read('pages/fun-text-editor/fun-text-editor.wxml');
  const condition = wxml.match(/class="draft-image"><fun-live-preview wx:if="\{\{(.*?)\}\}"/);
  assert.ok(condition, 'draft preview has a mounting condition');
  const mounted = new Function('handwritingVisible', 'exportProgress', 'return ' + condition[1]);
  assert.equal(mounted(true, { visible: false }), false);
  assert.equal(mounted(false, { visible: false }), true);
  assert.equal(mounted(false, { visible: true }), false);
  assert.match(wxml, /wx:for="{{handwritingDrafts}}" wx:key="id"/);
});

test('handwriting canvas is outside the toolbar scroll region and clips its layers', () => {
  const wxml = read('pages/fun-text-editor/fun-text-editor.wxml');
  const modal = wxml.slice(wxml.indexOf('class="handwriting-mask"'));
  assert.match(modal, /<view class="handwriting-sheet">/);
  assert.ok(modal.indexOf('class="handwriting-canvas"') < modal.indexOf('<scroll-view'));
  assert.match(modal, /<scroll-view scroll-y="true" class="handwriting-tools-scroll">/);
  const css = read('components/fun-live-preview/fun-live-preview.wxss');
  assert.match(css, /\.preview\s*\{[^}]*overflow:\s*hidden/);
});

test('added decoration border has priority over the ordinary asset style', () => {
  const css = read('pages/fun-text-editor/fun-text-editor.wxss');
  assert.match(css, /\.decoration-asset\.decoration-asset-added\s*\{[^}]*border-color:#7952ff/);
  const wxml = read('pages/fun-text-editor/fun-text-editor.wxml');
  assert.match(wxml, /item.inScene \? 'decoration-asset-added'/);
});
