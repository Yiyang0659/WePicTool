import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const rootArgIndex = args.indexOf('--root');
if (rootArgIndex >= 0 && !args[rootArgIndex + 1]) {
  console.error('--root 需要目录参数。');
  process.exit(2);
}
const root = path.resolve(rootArgIndex >= 0 ? args[rootArgIndex + 1] : process.cwd());
const miniprogramRoot = path.join(root, 'miniprogram');

if (!fs.existsSync(miniprogramRoot)) {
  console.error(`语法检查失败：缺少 ${miniprogramRoot}`);
  process.exit(1);
}

const files = [];
const stack = [miniprogramRoot];
while (stack.length > 0) {
  const current = stack.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') stack.push(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
}

files.sort();
const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({
      file: path.relative(root, file),
      detail: (result.stderr || result.stdout || '').trim()
    });
  }
}

if (failures.length > 0) {
  console.error(`小程序 JS 语法检查失败（${failures.length}/${files.length}）:`);
  for (const failure of failures) {
    console.error(`- ${failure.file}`);
    if (failure.detail) console.error(failure.detail);
  }
  process.exit(1);
}

console.log(`小程序 JS 语法检查通过：递归检查 ${files.length} 个首方文件（已排除 node_modules）。`);
