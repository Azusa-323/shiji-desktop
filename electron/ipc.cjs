const fs = require('node:fs');
const path = require('node:path');
const { localDateString } = require('./database.cjs');

const CHANNELS = {
  getDashboard: 'timewise:get-dashboard',
  getHistory: 'timewise:get-history',
  getCategories: 'timewise:get-categories',
  getApps: 'timewise:get-apps',
  saveCategory: 'timewise:save-category',
  deleteCategory: 'timewise:delete-category',
  assignCategory: 'timewise:assign-category',
  getSettings: 'timewise:get-settings',
  updateSettings: 'timewise:update-settings',
  getStatus: 'timewise:get-status',
  togglePause: 'timewise:toggle-pause',
  exportCsv: 'timewise:export-csv',
  clearData: 'timewise:clear-data',
  completeOnboarding: 'timewise:complete-onboarding',
  openDataFolder: 'timewise:open-data-folder',
  update: 'timewise:update',
};

function currentUsage(database, trackerStatus) {
  const current = trackerStatus.currentApp;
  if (!current) return null;
  const details = database.getApps().find((app) => app.id === current.id);
  return {
    appId: current.id,
    name: current.name,
    categoryName: details?.categoryName || '未分类',
    color: details?.categoryColor || '#A0A4A8',
    startedAt: current.startedAt || new Date().toISOString(),
    durationSeconds: current.sessionSeconds || 0,
  };
}

function runtimeStatus(database, tracker) {
  const status = tracker.getStatus();
  return {
    isPaused: status.paused,
    current: currentUsage(database, status),
    todaySeconds: database.getDashboard(localDateString()).totalSeconds,
    lastHeartbeatAt: status.lastHeartbeatAt,
    databasePath: database.filename,
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows) {
  const header = ['日期', '应用', '应用标识', '分类', '时长（秒）'];
  const lines = rows.map((row) => [
    row.date,
    row.appName,
    row.stableKey,
    row.categoryName,
    row.durationSeconds,
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
}

function registerIpc({
  ipcMain,
  dialog,
  shell,
  app,
  database,
  tracker,
  onSettingsChanged = () => {},
}) {
  const handles = [];
  const handle = (channel, listener) => {
    ipcMain.handle(channel, listener);
    handles.push(channel);
  };

  handle(CHANNELS.getDashboard, (_event, date) => {
    const dashboard = database.getDashboard(date || localDateString());
    const status = tracker.getStatus();
    return {
      ...dashboard,
      isPaused: status.paused,
      current: currentUsage(database, status),
    };
  });
  handle(CHANNELS.getHistory, (_event, period, anchor) => {
    if (period !== 'week' && period !== 'month') throw new Error('历史周期必须为 week 或 month');
    return database.getHistory(period, anchor || localDateString());
  });
  handle(CHANNELS.getCategories, () => database.getCategories());
  handle(CHANNELS.getApps, () => database.getApps());
  handle(CHANNELS.saveCategory, (_event, input) => {
    database.saveCategory(input);
    return database.getCategories();
  });
  handle(CHANNELS.deleteCategory, (_event, id) => {
    database.deleteCategory(id);
    return database.getCategories();
  });
  handle(CHANNELS.assignCategory, (_event, appIds, categoryId) => {
    database.assignCategory(appIds, categoryId);
  });
  handle(CHANNELS.getSettings, () => database.getSettings());
  handle(CHANNELS.updateSettings, (_event, patch) => {
    const settings = database.updateSettings(patch);
    onSettingsChanged(settings);
    return settings;
  });
  handle(CHANNELS.getStatus, () => runtimeStatus(database, tracker));
  handle(CHANNELS.togglePause, () => {
    tracker.togglePause();
    return runtimeStatus(database, tracker);
  });
  handle(CHANNELS.exportCsv, async (_event, options = {}) => {
    const result = await dialog.showSaveDialog({
      title: '导出使用时长数据',
      defaultPath: path.join(
        app.getPath('documents'),
        `使用时长-${options.startDate || '全部'}-${options.endDate || '全部'}.csv`,
      ),
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const rows = database.exportRows(options);
    fs.writeFileSync(result.filePath, `\uFEFF${rowsToCsv(rows)}`, 'utf8');
    return { canceled: false, path: result.filePath };
  });
  handle(CHANNELS.clearData, (_event, scope) => {
    database.clearData(scope);
  });
  handle(CHANNELS.completeOnboarding, () => {
    const settings = database.updateSettings({ onboardingCompleted: true });
    onSettingsChanged(settings);
    return settings;
  });
  handle(CHANNELS.openDataFolder, async () => {
    const error = await shell.openPath(path.dirname(database.filename));
    if (error) throw new Error(error);
  });

  return () => {
    for (const channel of handles) ipcMain.removeHandler(channel);
  };
}

module.exports = { CHANNELS, registerIpc, rowsToCsv, runtimeStatus };
