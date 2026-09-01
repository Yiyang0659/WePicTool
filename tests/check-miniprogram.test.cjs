'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

test('env.js declares FUN_CARD_RENDERER_URL for fun text preview and rendering', () => {
  const envPath = path.join(root, 'miniprogram/config/env.js');
  assert.ok(fs.existsSync(envPath), 'miniprogram/config/env.js must exist');
  const envContent = fs.readFileSync(envPath, 'utf8');
  assert.match(envContent, /FUN_CARD_RENDERER_URL/, 'env.js must declare FUN_CARD_RENDERER_URL');
  
  const env = require('../miniprogram/config/env.js');
  assert.ok('FUN_CARD_RENDERER_URL' in env, 'env export must include FUN_CARD_RENDERER_URL');
});

test('cloud hosting fun-card-renderer contains all required service files and OFL font', () => {
  const rendererDir = path.join(root, 'miniprogram/cloudhosting/fun-card-renderer');
  const requiredFiles = [
    'Dockerfile',
    'package.json',
    'index.js',
    'server.js',
    'renderer.js',
    'sceneValidator.js',
    'drawAssets.js',
    'fonts/LXGWMarkerGothic-Regular.ttf',
    'LICENSES/OFL-LXGWMarkerGothic.txt'
  ];

  requiredFiles.forEach((file) => {
    const fullPath = path.join(rendererDir, file);
    assert.ok(fs.existsSync(fullPath), `Cloud hosting file missing: ${file}`);
  });

  const fontStat = fs.statSync(path.join(rendererDir, 'fonts/LXGWMarkerGothic-Regular.ttf'));
  assert.ok(fontStat.size > 1000000, 'Font file must be non-empty and realistic size');
});

test('package.json check:syntax script includes all fun text modules and pages', () => {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const syntaxCmd = pkg.scripts['check:syntax'];

  const requiredModules = [
    'miniprogram/config/playRegistry.js',
    'miniprogram/config/funTextStrategies.js',
    'miniprogram/config/stylePacks.js',
    'miniprogram/config/assetRegistry.js',
    'miniprogram/config/env.js',
    'miniprogram/utils/creativeBrief.js',
    'miniprogram/utils/strategySelector.js',
    'miniprogram/utils/candidateValidator.js',
    'miniprogram/utils/candidatePlanner.js',
    'miniprogram/utils/styleMatcher.js',
    'miniprogram/utils/sceneComposer.js',
    'miniprogram/utils/funTextProject.js',
    'miniprogram/utils/funTextFont.js',
    'miniprogram/utils/scenePainter.js',
    'miniprogram/utils/contentGuardClient.js',
    'miniprogram/utils/funCardRendererClient.js',
    'miniprogram/utils/imageExporter.js',
    'miniprogram/components/fun-card-canvas/fun-card-canvas.js',
    'miniprogram/pages/fun-text/fun-text.js',
    'miniprogram/pages/fun-text-candidates/fun-text-candidates.js',
    'miniprogram/pages/fun-text-editor/fun-text-editor.js',
    'miniprogram/pages/template-result/template-result.js',
    'miniprogram/cloudhosting/fun-card-renderer/index.js',
    'miniprogram/cloudhosting/fun-card-renderer/server.js',
    'miniprogram/cloudhosting/fun-card-renderer/sceneValidator.js',
    'miniprogram/cloudhosting/fun-card-renderer/renderer.js',
    'miniprogram/cloudhosting/fun-card-renderer/drawAssets.js'
  ];

  requiredModules.forEach((mod) => {
    assert.ok(syntaxCmd.includes(mod), `check:syntax must check ${mod}`);
  });
});

test('check-miniprogram validator validates cloud hosting assets and config declarations', () => {
  const checkScript = fs.readFileSync(path.join(root, 'scripts/check-miniprogram.mjs'), 'utf8');
  assert.match(checkScript, /FUN_CARD_RENDERER_URL|fun-card-renderer/, 'check-miniprogram.mjs must inspect fun card renderer configuration or assets');
});
