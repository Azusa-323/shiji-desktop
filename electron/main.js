import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  powerMonitor,
  shell,
} = require('electron');
const { UsageDatabase } = require('./database.cjs');
const { UsageTracker } = require('./tracker.cjs');
const { createPlatformMonitor } = require('./platform.cjs');
const { CHANNELS, registerIpc } = require('./ipc.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow = null;
let tray = null;
let database = null;
let tracker = null;
let removeIpc = null;
let isQuitting = false;

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F4F5F6',
    title: '时迹',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!isQuitting && database?.getSettings().showTray) {
      event.preventDefault();
      mainWindow.hide();
    } else if (!isQuitting) {
      isQuitting = true;
      app.quit();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function updateTray() {
  if (!tray || !tracker) return;
  const status = tracker.getStatus();
  const pauseLabel = status.paused ? '恢复统计' : '暂停统计';
  tray.setToolTip(status.paused ? '时迹 - 已暂停' : `时迹${status.currentApp ? ` - ${status.currentApp.name}` : ''}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开时迹', click: showMainWindow },
    { type: 'separator' },
    { label: pauseLabel, click: () => tracker.togglePause() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function createTray() {
  if (tray || !database.getSettings().showTray) return;
  let icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(process.execPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
  }
  if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.on('double-click', showMainWindow);
  updateTray();
}

function applySettings(settings) {
  app.setLoginItemSettings({ openAtLogin: Boolean(settings.launchAtLogin) });
  if (settings.showTray) createTray();
  else if (tray) {
    tray.destroy();
    tray = null;
  }
  if (settings.onboardingCompleted) tracker?.start();
  else tracker?.stop();
}

function publishUpdate() {
  updateTray();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(CHANNELS.update);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(async () => {
    const databasePath = path.join(app.getPath('userData'), 'usage.sqlite3');
    database = new UsageDatabase(databasePath);
    tracker = new UsageTracker({
      database,
      platform: createPlatformMonitor({ powerMonitor }),
    });

    removeIpc = registerIpc({
      ipcMain,
      dialog,
      shell,
      app,
      database,
      tracker,
      onSettingsChanged: applySettings,
    });
    tracker.subscribe(publishUpdate);
    powerMonitor.on('lock-screen', () => tracker.setLocked(true));
    powerMonitor.on('unlock-screen', () => tracker.setLocked(false));
    powerMonitor.on('suspend', () => tracker.setSuspended(true));
    powerMonitor.on('resume', () => tracker.setSuspended(false));

    applySettings(database.getSettings());
    await createWindow();
  });

  app.on('activate', showMainWindow);
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    isQuitting = true;
    tracker?.stop();
  });
  app.on('will-quit', () => {
    removeIpc?.();
    database?.close();
  });
}
