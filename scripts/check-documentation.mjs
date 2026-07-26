import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_DOCUMENTS = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/governance.md',
  'docs/current.md',
  'docs/roadmap.md',
  'docs/decisions.md',
  'docs/changelog.md'
];

const REQUIRED_CURRENT_SECTIONS = ['当前阶段', '分支状态', '阻塞项', '下一步'];
const REQUIRED_ENTRY_REFERENCES = ['docs/governance.md', 'docs/current.md', 'docs/roadmap.md'];
const README_UPDATED_PATTERN = /README(?:\.md)?\s*已更新\s*[：:]\s*\S/u;
const README_NOT_NEEDED_PATTERN = /README(?:\.md)?\s*无需更新\s*[：:]\s*\S/u;

function normalizeText(value) {
  return value.replace(/\s+$/u, '');
}

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function fileExists(rootDir, relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

export function getShanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function isTrackedProductChange(filePath) {
  return /^(miniprogram|scripts|tests)\//u.test(filePath)
    || filePath === 'package.json'
    || filePath === 'project.config.json'
    || filePath === 'miniprogram/project.config.json';
}

export function requiresReadmeSyncDecision(filePath) {
  return isTrackedProductChange(filePath)
    || /^(docs\/product\/|docs\/ai-workflows\/|docs\/history\/|docs\/superpowers\/README\.md)/u.test(filePath);
}

export function collectDocumentationProblems({ rootDir, stagedFiles = [], today = getShanghaiDate() }) {
  const problems = [];

  for (const relativePath of REQUIRED_DOCUMENTS) {
    if (!fileExists(rootDir, relativePath)) {
      problems.push(`缺少治理文件：${relativePath}`);
    }
  }

  const iterationsPath = path.join(rootDir, 'docs', 'iterations');
  if (!fs.existsSync(iterationsPath) || !fs.statSync(iterationsPath).isDirectory()) {
    problems.push('缺少治理目录：docs/iterations/');
  }

  if (!fileExists(rootDir, 'AGENTS.md') || !fileExists(rootDir, 'CLAUDE.md')) return problems;

  const agentsText = normalizeText(readText(rootDir, 'AGENTS.md'));
  const claudeText = normalizeText(readText(rootDir, 'CLAUDE.md'));
  if (agentsText !== claudeText) {
    problems.push('AGENTS.md 与 CLAUDE.md 必须内容一致。');
  }

  for (const reference of REQUIRED_ENTRY_REFERENCES) {
    if (!agentsText.includes(reference) || !claudeText.includes(reference)) {
      problems.push(`入口文件必须引用：${reference}`);
    }
  }

  if (fileExists(rootDir, 'docs/current.md')) {
    const currentText = readText(rootDir, 'docs/current.md');
    for (const section of REQUIRED_CURRENT_SECTIONS) {
      if (!currentText.includes(`## ${section}`)) {
        problems.push(`docs/current.md 缺少章节：${section}`);
      }
    }
  }

  if (stagedFiles.some(isTrackedProductChange)) {
    const requiredIteration = `docs/iterations/${today}.md`;
    if (!stagedFiles.includes(requiredIteration)) {
      problems.push(`暂存产品改动时必须同时暂存当天迭代日志：${requiredIteration}`);
    }
  }

  if (stagedFiles.some(requiresReadmeSyncDecision)) {
    const requiredIteration = `docs/iterations/${today}.md`;
    if (!fileExists(rootDir, requiredIteration)) {
      problems.push(`缺少 README 同步说明所需的当天迭代日志：${requiredIteration}`);
    } else {
      const iterationText = readText(rootDir, requiredIteration);
      const readmeUpdated = README_UPDATED_PATTERN.test(iterationText);
      const readmeNotNeeded = README_NOT_NEEDED_PATTERN.test(iterationText);
      if (!readmeUpdated && !readmeNotNeeded) {
        problems.push('当天迭代日志缺少 README 同步说明：请写“README 已更新：原因”或“README 无需更新：原因”。');
      }
      if (readmeUpdated && !stagedFiles.includes('README.md')) {
        problems.push('当天迭代日志标注 README 已更新，但 README.md 未暂存。');
      }
    }
  }

  return problems;
}

function getStagedFiles() {
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return output.split('\n').map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function runCli() {
  const problems = collectDocumentationProblems({
    rootDir: process.cwd(),
    stagedFiles: getStagedFiles()
  });
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`文档治理检查失败：${problem}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('文档治理检查通过。\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
