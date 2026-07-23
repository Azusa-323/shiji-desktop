const { contextBridge, ipcRenderer } = require('electron');

const channels = {
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

contextBridge.exposeInMainWorld('timewise', {
  getDashboard: (date) => ipcRenderer.invoke(channels.getDashboard, date),
  getHistory: (period, anchor) => ipcRenderer.invoke(channels.getHistory, period, anchor),
  getCategories: () => ipcRenderer.invoke(channels.getCategories),
  getApps: () => ipcRenderer.invoke(channels.getApps),
  saveCategory: (input) => ipcRenderer.invoke(channels.saveCategory, input),
  deleteCategory: (id) => ipcRenderer.invoke(channels.deleteCategory, id),
  assignCategory: (appIds, categoryId) => ipcRenderer.invoke(channels.assignCategory, appIds, categoryId),
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(channels.updateSettings, patch),
  getStatus: () => ipcRenderer.invoke(channels.getStatus),
  togglePause: () => ipcRenderer.invoke(channels.togglePause),
  exportCsv: (options) => ipcRenderer.invoke(channels.exportCsv, options),
  clearData: (scope) => ipcRenderer.invoke(channels.clearData, scope),
  completeOnboarding: () => ipcRenderer.invoke(channels.completeOnboarding),
  openDataFolder: () => ipcRenderer.invoke(channels.openDataFolder),
  onUpdate: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channels.update, listener);
    return () => ipcRenderer.removeListener(channels.update, listener);
  },
});
