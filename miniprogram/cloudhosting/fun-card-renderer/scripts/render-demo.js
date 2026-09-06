'use strict';

// scripts/render-demo.js
// 从固定示例项目渲染首页示例卡：趣味字画 · 搞怪反转 · pink-note-v1 前三叠第一套的前 5 张。
// 输出 01.png–05.png 到 miniprogram/assets/fun-text/demo/。
// 用法：node miniprogram/cloudhosting/fun-card-renderer/scripts/render-demo.js [输出目录]
const fs = require('node:fs');
const path = require('node:path');
const { createPngMaker } = require('../renderer');
const funTextProject = require('../../../utils/funTextProject');

const DEMO_SOURCE_TEXT = '我今天想见你';
const DEMO_EXPRESSION_KEY = 'funny-reversal';
const DEMO_VARIANT = 0;
const CARD_COUNT = 5;

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'assets', 'fun-text', 'demo'));
  const makePng = createPngMaker();
  const project = funTextProject.createFunTextProject({
    sourceText: DEMO_SOURCE_TEXT,
    expressionKey: DEMO_EXPRESSION_KEY,
    variant: DEMO_VARIANT,
    now: 1000
  });
  const candidate = project.candidates[0];
  if (candidate.stylePackId !== 'pink-note-v1') {
    throw new Error('demo candidate must use pink-note-v1, got ' + candidate.stylePackId);
  }
  const scenes = candidate.editedScenes.slice(0, CARD_COUNT);
  if (scenes.length !== CARD_COUNT) {
    throw new Error('demo candidate does not have ' + CARD_COUNT + ' cards');
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (let index = 0; index < scenes.length; index += 1) {
    const buffer = await makePng(scenes[index], 1080);
    const target = path.join(outDir, String(index + 1).padStart(2, '0') + '.png');
    fs.writeFileSync(target, buffer);
    console.log('rendered ' + target + ' (' + buffer.length + ' bytes)');
  }
  console.log('done: ' + scenes.length + ' demo cards -> ' + outDir);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});