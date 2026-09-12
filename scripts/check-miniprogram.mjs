import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const rootArgIndex = args.indexOf('--root');
if (rootArgIndex >= 0 && !args[rootArgIndex + 1]) {
  console.error('--root 需要目录参数。');
  process.exit(2);
}
const root = path.resolve(rootArgIndex >= 0 ? args[rootArgIndex + 1] : process.cwd());
const releaseMode = args.includes('--release');
const miniprogramRoot = path.join(root, 'miniprogram');
const MAIN_PACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const MAIN_PACKAGE_WARNING_BYTES = Math.floor(1.8 * 1024 * 1024);

const errors = [];
const warnings = [];

function issue(message, releaseBlocking = false) {
  if (releaseMode && releaseBlocking) errors.push(message);
  else warnings.push(message);
}

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

function readConfigString(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:const|let|var)\\s+${escapedKey}\\s*=\\s*(['"])(.*?)\\1`).exec(source);
  return match ? match[2].trim() : null;
}

function readConfigBoolean(source, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:const|let|var)\\s+${escapedKey}\\s*=\\s*(true|false)\\s*;`).exec(source);
  return match ? match[1] === 'true' : null;
}

function isPlaceholder(value) {
  return /(?:xxx|placeholder|replace[-_ ]?me|your[-_]|example\.(?:com|test))/i.test(value);
}

function isLoopbackHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  // WHATWG URL normalizes IPv4 shorthand/numeric forms and compressed IPv6.
  return host === 'localhost' || host.endsWith('.localhost')
    || /^127\./.test(host) || host === '0.0.0.0'
    || host === '[::1]' || host === '[::]'
    || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]+\]$/.test(host);
}

if (!exists('miniprogram/app.json')) {
  errors.push('缺少 miniprogram/app.json');
}

const appConfig = exists('miniprogram/app.json') ? readJson('miniprogram/app.json') : null;
const rootProjectConfig = exists('project.config.json') ? readJson('project.config.json') : null;
const projectConfig = exists('miniprogram/project.config.json')
  ? readJson('miniprogram/project.config.json')
  : null;

function normalizePackageRoot(value) {
  return String(value || '').replace(/^[/\\]+|[/\\]+$/g, '').split(/[\\/]+/).join(path.sep);
}

function measureMainPackageSource() {
  if (!fs.existsSync(miniprogramRoot)) return 0;
  const declaredSubpackages = appConfig && (appConfig.subPackages || appConfig.subpackages);
  const subpackageRoots = Array.isArray(declaredSubpackages)
    ? declaredSubpackages.map(item => normalizePackageRoot(item && item.root)).filter(Boolean)
    : [];
  const excludedRoots = ['cloudfunctions', 'cloudhosting'];
  let total = 0;
  const stack = [miniprogramRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.relative(miniprogramRoot, entryPath);
      if (entry.isDirectory()) {
        const isExcludedRoot = excludedRoots.includes(relativePath);
        const isSubpackageRoot = subpackageRoots.some(packageRoot => (
          relativePath === packageRoot || relativePath.startsWith(`${packageRoot}${path.sep}`)
        ));
        if (entry.name !== 'node_modules' && !isExcludedRoot && !isSubpackageRoot) {
          stack.push(entryPath);
        }
        continue;
      }
      if (entry.isFile()) total += fs.statSync(entryPath).size;
    }
  }

  return total;
}

const mainPackageSourceBytes = measureMainPackageSource();
// Resource subpackages must fit too; main-package exclusion must not hide oversize fonts.
let combinedPackageSourceBytes = mainPackageSourceBytes;
for (const pkg of (appConfig && (appConfig.subPackages || appConfig.subpackages)) || []) {
  const normalized = normalizePackageRoot(pkg.root);
  const directory = path.resolve(miniprogramRoot, normalized);
  if (!normalized || !directory.startsWith(miniprogramRoot + path.sep) || !fs.existsSync(directory)) {
    errors.push(`无效分包目录: ${pkg.root}`); continue;
  }
  function sizeOf(dir) {
    return fs.readdirSync(dir,{withFileTypes:true}).reduce((sum,e)=>{
      const file=path.join(dir,e.name);
      return sum+(e.isDirectory()?sizeOf(file):e.isFile()?fs.statSync(file).size:0);
    },0);
  }
  const bytes=sizeOf(directory);combinedPackageSourceBytes+=bytes;
  if(bytes>MAIN_PACKAGE_LIMIT_BYTES)errors.push(`分包 ${pkg.root} 超过 2 MiB 限制。`);
}
// Conservative 20MiB baseline, including service-provider deployments.
if(combinedPackageSourceBytes>20*1024*1024)errors.push('小程序总包体超过本项目 20 MiB 保守发布预算。');
if (mainPackageSourceBytes > MAIN_PACKAGE_LIMIT_BYTES) {
  errors.push(
    `小程序主包源码约 ${(mainPackageSourceBytes / 1024).toFixed(1)} KiB，超过微信单个主包 2 MiB 限制。`
  );
} else if (mainPackageSourceBytes > MAIN_PACKAGE_WARNING_BYTES) {
  warnings.push(
    `小程序主包源码约 ${(mainPackageSourceBytes / 1024).toFixed(1)} KiB，已接近微信单个主包 2 MiB 限制。`
  );
}

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
        if (!exists(pageFile)) errors.push(`app.json 中声明的页面文件不存在: ${pageFile}`);
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
        if (entry.name !== 'node_modules') stack.push(entryPath);
        continue;
      }
      if (!entry.name.endsWith('.wxml')) continue;
      const relativePath = path.relative(root, entryPath);
      const match = readText(relativePath).match(unsupportedHtmlTags);
      if (match) errors.push(`${relativePath} 使用了小程序 WXML 不支持的 HTML 标签: ${match[0]}`);
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

if (exists('miniprogram/config/env.js')) {
  const envJs = readText('miniprogram/config/env.js');
  const cloudEnvId = readConfigString(envJs, 'CLOUD_ENV_ID');
  const funTextEntryEnabled = readConfigBoolean(envJs, 'ENABLE_FUN_TEXT_STACK_ENTRY');
  const rendererUrl = readConfigString(envJs, 'FUN_CARD_RENDERER_URL');
  const rendererService = readConfigString(envJs, 'FUN_CARD_RENDERER_SERVICE');

  if (cloudEnvId === null) {
    errors.push('miniprogram/config/env.js 缺少 CLOUD_ENV_ID 配置声明。');
  } else if (!cloudEnvId) {
    issue('CLOUD_ENV_ID 为空；云能力与发布环境尚未配置。', true);
  } else if (isPlaceholder(cloudEnvId)) {
    issue('CLOUD_ENV_ID 仍是占位值；必须替换为真实 CloudBase 环境 ID。', true);
  }

  if (funTextEntryEnabled === null) {
    errors.push('miniprogram/config/env.js 的 ENABLE_FUN_TEXT_STACK_ENTRY 必须声明为 true 或 false 布尔字面量。');
  }

  if (funTextEntryEnabled !== false) {
    if (process.env.FUN_CARD_RENDERER_ACCESS_MODE !== 'call-container-only') {
      issue('FUN_CARD_RENDERER_ACCESS_MODE 必须为 call-container-only；发布前还必须独立验证服务公网访问已关闭。', true);
    }
    if (rendererService === null) {
      errors.push('miniprogram/config/env.js 缺少 FUN_CARD_RENDERER_SERVICE 配置声明。');
    } else if (!rendererService) {
      issue('FUN_CARD_RENDERER_SERVICE 为空或未填写；生产 POST 无法通过 callContainer 路由。', true);
    } else if (isPlaceholder(rendererService)) {
      issue('FUN_CARD_RENDERER_SERVICE 仍是占位值；必须填写真实云托管服务名。', true);
    }

    if (rendererUrl === null) {
      errors.push('miniprogram/config/env.js 缺少 FUN_CARD_RENDERER_URL 配置声明。');
    } else if (!rendererUrl) {
      issue('FUN_CARD_RENDERER_URL 为空或未填写；授权字体公网地址尚未配置。', true);
    } else {
      if (isPlaceholder(rendererUrl)) {
        issue('FUN_CARD_RENDERER_URL 仍是占位 URL；必须替换为真实 HTTPS 字体域名。', true);
      }
      try {
        const parsedUrl = new URL(rendererUrl);
        if (parsedUrl.protocol !== 'https:') {
          if (parsedUrl.protocol === 'http:') {
            issue('FUN_CARD_RENDERER_URL 使用 HTTP；仅本地开发可用，发布必须使用 HTTPS。', true);
          } else {
            throw new Error('unsupported protocol');
          }
        }
        if (isLoopbackHostname(parsedUrl.hostname)) {
          issue('FUN_CARD_RENDERER_URL 指向 localhost/loopback；不能用于发布。', true);
        }
      } catch (error) {
        issue('FUN_CARD_RENDERER_URL 不是有效 HTTP(S) URL。', true);
      }
    }
  }
} else {
  issue('缺少 miniprogram/config/env.js；CloudBase 与 renderer 配置不可用。', true);
}

const rendererRoot = 'miniprogram/cloudhosting/fun-card-renderer';
const requiredRendererFiles = [
  'Dockerfile',
  'package-lock.json',
  'package.json',
  'index.js',
  'server.js',
  'renderer.js',
  'sceneValidator.js',
  'drawAssets.js',
  'runtimeConfig.js',
  'assets/fonts/LXGWMarkerGothic-Regular.ttf',
  'assets/fonts/SmileySans-Oblique.ttf',
  'assets/fonts/MaShanZheng-Regular.ttf',
  'LICENSES/OFL-LXGWMarkerGothic.txt'
];
for (const file of requiredRendererFiles) {
  const relativePath = `${rendererRoot}/${file}`;
  if (!exists(relativePath)) errors.push(`趣味字画云托管缺少必要文件: ${relativePath}`);
}

const rendererDockerfile = `${rendererRoot}/Dockerfile`;
if (exists(rendererDockerfile) && !/^FROM node:20-bookworm-slim\s*$/m.test(readText(rendererDockerfile))) {
  errors.push(`${rendererDockerfile} 必须固定使用 node:20-bookworm-slim 基础镜像。`);
}

const rendererServer = `${rendererRoot}/server.js`;
if (exists(rendererServer) && !/require\(['"]node:http['"]\)/.test(readText(rendererServer))) {
  errors.push(`${rendererServer} 必须使用 Node.js 内置 node:http 实现 HTTP 服务。`);
}

const bundledFonts = [
  'LXGWMarkerGothic-Regular.ttf',
  'SmileySans-Oblique.ttf',
  'MaShanZheng-Regular.ttf'
];
for (const fontFileName of bundledFonts) {
  const fontRelativePath = `${rendererRoot}/assets/fonts/${fontFileName}`;
  if (!exists(fontRelativePath)) continue;
  const font = fs.readFileSync(path.join(root, fontRelativePath));
  const ttfMagic = font.length >= 4
    && font[0] === 0x00 && font[1] === 0x01 && font[2] === 0x00 && font[3] === 0x00;
  const otfMagic = font.length >= 4 && font.subarray(0, 4).toString('ascii') === 'OTTO';
  if (font.length < 1024 * 1024 || font.length > 20 * 1024 * 1024) {
    errors.push(`${fontRelativePath} 字体大小不合理（应在 1 MiB 到 20 MiB 之间）。`);
  }
  if (!ttfMagic && !otfMagic) {
    errors.push(`${fontRelativePath} 字体文件头 magic 无效，不是受支持的 TrueType/OpenType 字体。`);
  }
}

const licenseRelativePath = `${rendererRoot}/LICENSES/OFL-LXGWMarkerGothic.txt`;
if (exists(licenseRelativePath)) {
  const license = readText(licenseRelativePath);
  const requiredLicenseMarkers = [
    /Copyright\s+\d{4}/i,
    /SIL OPEN FONT LICENSE Version 1\.1/i,
    /PERMISSION & CONDITIONS/i,
    /Permission is hereby granted, free of charge/i,
    /TERMINATION/i,
    /DISCLAIMER/i
  ];
  if (!requiredLicenseMarkers.every((marker) => marker.test(license))) {
    errors.push(`${licenseRelativePath} OFL 正文或 copyright 授权标识不完整。`);
  }
}

if (errors.length > 0) {
  console.error(releaseMode ? '小程序发布预检未通过:' : '小程序上线预检未通过:');
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length > 0) {
    console.error('\n同时发现以下提醒:');
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log(releaseMode ? '小程序发布预检通过。' : '小程序上线预检通过。');
if (warnings.length > 0) {
  console.log('\n上线前提醒:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
