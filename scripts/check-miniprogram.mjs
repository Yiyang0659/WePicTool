import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const miniprogramRoot = path.join(root, 'miniprogram');

const errors = [];
const warnings = [];

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath} 不是有效 JSON: ${error.message}`);
    return null;
  }
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

if (!exists('miniprogram/app.json')) {
  errors.push('缺少 miniprogram/app.json');
}

const appConfig = exists('miniprogram/app.json') ? readJson('miniprogram/app.json') : null;
const rootProjectConfig = exists('project.config.json') ? readJson('project.config.json') : null;
const projectConfig = exists('miniprogram/project.config.json')
  ? readJson('miniprogram/project.config.json')
  : null;

if (!exists('project.config.json')) {
  warnings.push('根目录缺少 project.config.json；从项目根目录导入微信开发者工具时不会自动识别小程序。');
}

if (appConfig) {
  if (!Array.isArray(appConfig.pages) || appConfig.pages.length === 0) {
    errors.push('miniprogram/app.json 必须声明 pages。');
  } else {
    for (const page of appConfig.pages) {
      for (const ext of ['js', 'json', 'wxml', 'wxss']) {
        const pageFile = `miniprogram/${page}.${ext}`;
        if (!exists(pageFile)) {
          errors.push(`app.json 中声明的页面文件不存在: ${pageFile}`);
        }
      }
    }
  }

  if (appConfig.sitemapLocation && !exists(`miniprogram/${appConfig.sitemapLocation}`)) {
    errors.push(`app.json 指向了 ${appConfig.sitemapLocation}，但 miniprogram/${appConfig.sitemapLocation} 不存在。`);
  }
}

const unsupportedHtmlTags = /<\/?(b|strong|i|em|span|div|p|img|a)\b/i;
if (fs.existsSync(miniprogramRoot)) {
  const stack = [miniprogramRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.name.endsWith('.wxml')) continue;

      const relativePath = path.relative(root, entryPath);
      const content = readText(relativePath);
      const match = content.match(unsupportedHtmlTags);
      if (match) {
        errors.push(`${relativePath} 使用了小程序 WXML 不支持的 HTML 标签: ${match[0]}`);
      }
    }
  }
}

function checkAppId(config, label) {
  if (!config) return;
  const appid = config.appid;
  if (!appid || appid === 'wx8888888888888888' || appid === 'touristappid') {
    warnings.push(`${label} 仍是占位 AppID；预览真机、云开发和上传前需要替换为真实小程序 AppID。`);
  }
}

checkAppId(rootProjectConfig, 'project.config.json');
checkAppId(projectConfig, 'miniprogram/project.config.json');

if (!exists('miniprogram/cloudfunctions/processOutfit/index.js')) {
  warnings.push('缺少 processOutfit 云函数入口；真实云端处理链路无法部署。');
}

if (exists('miniprogram/app.js')) {
  const appJs = readText('miniprogram/app.js');
  if (appJs.includes('wepictool-env-xxx')) {
    warnings.push('miniprogram/app.js 仍包含占位云环境 ID；真实云开发测试前需要配置 CloudBase 环境。');
  }
}

if (exists('miniprogram/config/env.js')) {
  const envJs = readText('miniprogram/config/env.js');
  if (/CLOUD_ENV_ID\s*=\s*['"]\s*['"]/.test(envJs)) {
    warnings.push('miniprogram/config/env.js 未填写 CloudBase 环境 ID；当前会启用本地预览模式。');
  }
} else {
  warnings.push('缺少 miniprogram/config/env.js；建议集中管理 CloudBase 环境 ID。');
}

if (errors.length > 0) {
  console.error('小程序上线预检未通过:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\n同时发现以下提醒:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log('小程序上线预检通过。');
if (warnings.length > 0) {
  console.log('\n上线前提醒:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}
