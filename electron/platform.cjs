const path = require('node:path');

function normalizeStableKey(value) {
  if (!value) return null;
  return process.platform === 'win32'
    ? path.normalize(value).toLocaleLowerCase('en-US')
    : path.normalize(value);
}

function createPlatformMonitor({ powerMonitor }) {
  let activeWinPromise;

  async function getActiveWindow() {
    try {
      activeWinPromise ||= import('active-win').then((module) => module.default || module);
      const activeWindow = await activeWinPromise;
      return await activeWindow();
    } catch {
      return null;
    }
  }

  return {
    getIdleSeconds() {
      return powerMonitor.getSystemIdleTime();
    },
    async snapshot() {
      const windowInfo = await getActiveWindow();
      const idleSeconds = this.getIdleSeconds();
      if (!windowInfo?.owner) return { app: null, idleSeconds, locked: false };
      const executablePath = windowInfo.owner.path || null;
      const bundleId = windowInfo.owner.bundleId || null;
      const stableKey = normalizeStableKey(executablePath || bundleId || windowInfo.owner.name);
      if (!stableKey) return { app: null, idleSeconds, locked: false };
      return {
        app: {
          platform: process.platform,
          stableKey,
          name: windowInfo.owner.name || path.basename(executablePath || stableKey),
          executablePath,
        },
        idleSeconds,
        locked: false,
      };
    },
  };
}

module.exports = { createPlatformMonitor, normalizeStableKey };
