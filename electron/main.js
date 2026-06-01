const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow;
let autoUpdater = null;
const IS_DEV = !app.isPackaged;

// ══════════════════════════════════════
// AUTO UPDATER
// ══════════════════════════════════════
function initAutoUpdater() {
  if (IS_DEV) return;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      sendToRenderer('update-status', { status: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      sendToRenderer('update-status', { status: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      sendToRenderer('update-status', { status: 'latest' });
    });
    autoUpdater.on('download-progress', (progress) => {
      sendToRenderer('update-status', { status: 'downloading', percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      sendToRenderer('update-status', { status: 'ready', version: info.version });
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} is ready to install`,
        detail: 'The update will be installed when you restart the app.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });
    autoUpdater.on('error', (err) => {
      console.log('[updater] error:', err.message);
    });

    // Check for updates 5 seconds after launch, then every 4 hours
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  } catch (e) {
    console.log('[updater] not available:', e.message);
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('${channel}', { detail: ${JSON.stringify(data)} }))`
    ).catch(() => {});
  }
}

// ══════════════════════════════════════
// WINDOW
// ══════════════════════════════════════
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'True Site Sync',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
    backgroundColor: '#0a0f1a',
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: false,
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'app.html'));

  if (IS_DEV || process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }

  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) { mainWindow.show(); mainWindow.focus(); }
  }, 5000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    mainWindow.show();
    mainWindow.focus();
    initAutoUpdater();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://')) return;
    if (url.includes('cuxblomxefwgdcijmpjk.supabase.co/auth/')) return;
    e.preventDefault();
    if (url.startsWith('http') && !url.includes('truesitesync.com')) {
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  const template = [
    {
      label: 'True Site Sync',
      submenu: [
        { label: 'About True Site Sync', click: () => showAbout() },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => { if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {}); else shell.openExternal('https://truesitesync.com/#download'); }},
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Refresh' },
        { role: 'forceReload', label: 'Hard Refresh' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Visit Website', click: () => shell.openExternal('https://truesitesync.com') },
        { label: 'Contact Support', click: () => shell.openExternal('mailto:info@truesitesync.com') },
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'About True Site Sync', message: 'True Site Sync',
    detail: `Version: ${app.getVersion()}\nConstruction Management Platform\n\n© 2026 True Site Sync.\nwww.truesitesync.com`,
    buttons: ['OK'], icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
