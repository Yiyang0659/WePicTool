const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const REQUIRED_FILES = [
  'docs/governance.md',
  'docs/current.md',
  'docs/roadmap.md',
  'docs/decisions.md',
  'docs/changelog.md',
  'docs/iterations/2026-07-26.md'
];

function writeFile(rootDir, relativePath, content) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function makeFixture({ identicalEntries, completeCurrent }) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wepic-governance-'));
  const entry = [
    '# WePicTool 项目治理入口',
    '阅读 docs/governance.md、docs/current.md、docs/roadmap.md。'
  ].join('\n');
  const current = completeCurrent
    ? ['## 当前阶段', '准备上线', '## 分支状态', 'main', '## 阻塞项', '无', '## 下一步', '验收'].join('\n')
    : ['## 当前阶段', '准备上线', '## 阻塞项', '无'].join('\n');

  writeFile(rootDir, 'AGENTS.md', entry);
  writeFile(rootDir, 'CLAUDE.md', identicalEntries ? entry : `${entry}\n不同规则`);
  writeFile(rootDir, 'docs/current.md', current);
  for (const filePath of REQUIRED_FILES.filter((filePath) => filePath !== 'docs/current.md')) {
    writeFile(rootDir, filePath, '# fixture\n');
  }
  return rootDir;
}

async function loadChecker() {
  return import(pathToFileURL(path.join(process.cwd(), 'scripts/check-documentation.mjs')).href);
}

test('governance check accepts complete documents and identical entry files', async () => {
  const rootDir = makeFixture({ identicalEntries: true, completeCurrent: true });
  const { collectDocumentationProblems } = await loadChecker();
  assert.deepEqual(collectDocumentationProblems({
    rootDir,
    stagedFiles: ['docs/iterations/2026-07-26.md'],
    today: '2026-07-26'
  }), []);
});

test('governance check rejects mismatched entry files and missing current sections', async () => {
  const rootDir = makeFixture({ identicalEntries: false, completeCurrent: false });
  const { collectDocumentationProblems } = await loadChecker();
  const problems = collectDocumentationProblems({ rootDir, stagedFiles: [], today: '2026-07-26' });
  assert.ok(problems.some((item) => item.includes('AGENTS.md 与 CLAUDE.md')));
  assert.ok(problems.some((item) => item.includes('分支状态')));
  assert.ok(problems.some((item) => item.includes('下一步')));
});

test('governance check requires today iteration log for staged product changes', async () => {
  const rootDir = makeFixture({ identicalEntries: true, completeCurrent: true });
  const { collectDocumentationProblems } = await loadChecker();
  const problems = collectDocumentationProblems({
    rootDir,
    stagedFiles: ['miniprogram/pages/index/index.js'],
    today: '2026-07-26'
  });
  assert.ok(problems.some((item) => item.includes('docs/iterations/2026-07-26.md')));
});

test('governance check requires a README sync decision for staged product changes', async () => {
  const rootDir = makeFixture({ identicalEntries: true, completeCurrent: true });
  const { collectDocumentationProblems } = await loadChecker();
  const problems = collectDocumentationProblems({
    rootDir,
    stagedFiles: ['miniprogram/pages/index/index.js', 'docs/iterations/2026-07-26.md'],
    today: '2026-07-26'
  });
  assert.ok(problems.some((item) => item.includes('README 同步说明')));
});

test('governance check rejects a claimed README update that is not staged', async () => {
  const rootDir = makeFixture({ identicalEntries: true, completeCurrent: true });
  writeFile(rootDir, 'docs/iterations/2026-07-26.md', '- README 已更新：新增大字滑卡说明。\n');
  const { collectDocumentationProblems } = await loadChecker();
  const problems = collectDocumentationProblems({
    rootDir,
    stagedFiles: ['miniprogram/pages/index/index.js', 'docs/iterations/2026-07-26.md'],
    today: '2026-07-26'
  });
  assert.ok(problems.some((item) => item.includes('README.md 未暂存')));
});
