'use strict';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveRuntimeMode(environment) {
  const env = environment || {};
  const nodeEnv = env.NODE_ENV;
  const cloudEnvId = clean(env.CLOUDBASE_ENV_ID);
  const explicitDevMode = env.FUN_CARD_RENDERER_DEV_MODE === '1';

  if (explicitDevMode && nodeEnv !== 'development') {
    throw new Error('FUN_CARD_RENDERER_DEV_MODE=1 requires exactly NODE_ENV=development');
  }
  if (explicitDevMode) return { devMode: true, cloudEnvId: '' };
  if (!cloudEnvId) {
    throw new Error('CLOUDBASE_ENV_ID is required unless NODE_ENV=development and FUN_CARD_RENDERER_DEV_MODE=1');
  }
  if (env.FUN_CARD_RENDERER_ACCESS_MODE !== 'call-container-only') {
    throw new Error('FUN_CARD_RENDERER_ACCESS_MODE=call-container-only is required; verify CloudBase public access is disabled before production use');
  }
  return { devMode: false, cloudEnvId };
}

function assertCloudCapabilities(cloud) {
  if (!cloud || !cloud.openapi || !cloud.openapi.security
      || typeof cloud.openapi.security.msgSecCheck !== 'function') {
    throw new Error('CloudBase msgSecCheck capability is unavailable');
  }
  if (typeof cloud.uploadFile !== 'function') {
    throw new Error('CloudBase uploadFile capability is unavailable');
  }
  if (typeof cloud.deleteFile !== 'function') {
    throw new Error('CloudBase deleteFile capability is unavailable');
  }
}

module.exports = {
  resolveRuntimeMode,
  assertCloudCapabilities
};
