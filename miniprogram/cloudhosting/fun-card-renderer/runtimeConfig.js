'use strict';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveRuntimeMode(environment) {
  const env = environment || {};
  const nodeEnv = clean(env.NODE_ENV);
  const cloudEnvId = clean(env.CLOUDBASE_ENV_ID);
  const explicitDevMode = env.FUN_CARD_RENDERER_DEV_MODE === '1';

  if (explicitDevMode && nodeEnv === 'production') {
    throw new Error('FUN_CARD_RENDERER_DEV_MODE is forbidden when NODE_ENV=production');
  }
  if (explicitDevMode) return { devMode: true, cloudEnvId: '' };
  if (!cloudEnvId) {
    throw new Error('CLOUDBASE_ENV_ID is required unless explicit non-production FUN_CARD_RENDERER_DEV_MODE=1 is set');
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
