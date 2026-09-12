'use strict';

// Existing-service deployment only. Secrets stay in memory and child stdin,
// never in OS command arguments, the source archive, or diagnostic output.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cwd = path.join(root, 'miniprogram/cloudhosting/fun-card-renderer');
const cli = process.env.WEPIC_TCB_CLI;
const envId = 'cloud1-d0g1blfsde474b168';
const service = 'fun-card-renderer';
function invoke(args) {
  if (!cli || !fs.existsSync(cli)) throw new Error('CLI_PATH_REQUIRED');
  const bootstrap = "const fs=require('fs');const x=JSON.parse(fs.readFileSync(0,'utf8'));process.argv=[process.execPath,x.cli,...x.args];require(x.cli);";
  const result = spawnSync(process.execPath, ['-e', bootstrap], {
    cwd, input: JSON.stringify({ cli, args }), encoding: 'utf8', timeout: 45000,
    maxBuffer: 8 * 1024 * 1024
  });
  let parsed;
  try { parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))); }
  catch (_) { throw new Error(result.error && result.error.code === 'ETIMEDOUT' ? 'CLI_TIMEOUT' : 'CLI_RESPONSE_UNAVAILABLE'); }
  if (result.status !== 0 || parsed.success === false || parsed.error) {
    const code = parsed.error && parsed.error.code || parsed.code || 'CLI_FAILED';
    throw new Error(/^[\w.:-]+$/.test(code) ? code : 'CLI_FAILED');
  }
  return parsed.data || parsed;
}
function api(product, action, version, body) {
  return invoke(['api', product, action, '--api-version', version, '--body', JSON.stringify(body), '--json']);
}
function detail() { return invoke(['cloudrun', 'detail', service, '--json']); }
function network(config) {
  return JSON.stringify(Object.fromEntries(['OpenAccessTypes','VpcConf','PublicNetConf',
    'InternalAccess','InternalDomain','MinNum','MaxNum','Cpu','Mem','Port'].map(k =>
    [k, k === 'OpenAccessTypes' ? [...config[k]].sort() : config[k]])));
}
async function main() {
  const before = detail();
  const config = before.ServerConfig;
  if (!config || config.EnvId !== envId || config.ServerName !== service) throw new Error('TARGET_MISMATCH');
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify({ service, base: before.BaseInfo && {
      status: before.BaseInfo.Status }, versions: before.OnlineVersionInfos,
      access: config.OpenAccessTypes, port: config.Port,
      safetyMode: JSON.parse(config.EnvParams || '{}').FUN_CARD_SAFETY_MODE }));
    return;
  }
  const local = {};
  for (const line of fs.readFileSync(path.join(root, '.env.renderer.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  if (local.WECHAT_APP_ID !== 'wxf16280c0ba5c507d' || !local.WECHAT_APP_SECRET || /填写|replace|placeholder/i.test(local.WECHAT_APP_SECRET)) throw new Error('WECHAT_CONFIG_REQUIRED');
  const variables = Object.assign({}, JSON.parse(config.EnvParams || '{}'), {
    WECHAT_APP_ID: local.WECHAT_APP_ID, WECHAT_APP_SECRET: local.WECHAT_APP_SECRET,
    FUN_CARD_SAFETY_MODE: 'wechat-https'
  });
  console.log(JSON.stringify({ stage: 'plan', service, envId,
    changedFields: ['deployment source', 'WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'FUN_CARD_SAFETY_MODE'],
    networkFieldsSubmitted: false, execute: process.argv.includes('--execute') }));
  if (!process.argv.includes('--execute')) return;
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wepic-renderer-deploy-'));
  const archive = path.join(folder, 'renderer.zip');
  const sources = ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json',
    ...fs.readdirSync(cwd).filter(f => f.endsWith('.js')), 'assets', 'LICENSES'];
  const zip = spawnSync('zip', ['-q', '-r', archive, ...sources], { cwd });
  if (zip.status !== 0) throw new Error('ARCHIVE_FAILED');
  const upload = api('tcb', 'DescribeCloudBaseBuildService', '2018-06-08', { EnvId: envId, ServiceName: service });
  if (!upload.UploadUrl || new URL(upload.UploadUrl).protocol !== 'https:') throw new Error('UPLOAD_URL_INVALID');
  const response = await fetch(upload.UploadUrl, { method: 'PUT', redirect: 'error',
    headers: Object.fromEntries((upload.UploadHeaders || []).map(h => [h.Key,h.Value])),
    body: fs.readFileSync(archive), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('SOURCE_UPLOAD_FAILED_' + response.status);
  const latest = detail().ServerConfig;
  if (network(latest) !== network(config) || latest.EnvParams !== config.EnvParams) throw new Error('CONFIG_CHANGED_ABORT');
  const result = api('tcbr', 'UpdateCloudRunServer', '2022-02-17', {
    EnvId: envId, ServerName: service,
    DeployInfo: { DeployType: 'package', PackageName: upload.PackageName,
      PackageVersion: upload.PackageVersion,
      ReleaseType: process.argv.includes('--traffic') ? 'GRAY' : 'FULL' },
    Items: [{ Key: 'EnvParam', Value: JSON.stringify(variables) }]
  });
  console.log(JSON.stringify({ stage: 'deployment-submitted', requestId: result.RequestId,
    buildId: result.BuildId, runId: result.RunId, archive }));
  console.log(JSON.stringify({ stage: 'network-check', unchanged: network(detail().ServerConfig) === network(config) }));
}
main().catch(error => {
  console.error(JSON.stringify({ ok: false, code: /^[\w.:-]+$/.test(error.message) ? error.message : 'DEPLOY_FAILED' }));
  process.exitCode = 1;
});
