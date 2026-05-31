const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow;
const IS_DEV = !app.isPackaged;

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

  // Load the app
  mainWindow.loadFile(path.join(__dirname, '..', 'app.html'));

  // Open DevTools in dev mode OR if launched with --debug flag
  if (IS_DEV || process.argv.includes('--debug')) {
    mainWindow.webContents.openDevTools();
  }

  // Show window when ready — with 5s timeout fallback
  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 5000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block ALL navigation away from the app — stay on app.html
  mainWindow.webContents.on('will-navigate', (e, url) => {
    // Allow file:// (local app) and Supabase auth callbacks
    if (url.startsWith('file://')) return;
    if (url.includes('cuxblomxefwgdcijmpjk.supabase.co/auth/')) return;
    // Block everything else — open in external browser if needed
    e.preventDefault();
    if (url.startsWith('http') && !url.includes('truesitesync.com')) {
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Build menu
  const template = [
    {
      label: 'True Site Sync',
      submenu: [
        { label: 'About True Site Sync', click: () => showAbout() },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Refresh' },
        { role: 'forceReload', label: 'Hard Refresh' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Visit Website', click: () => shell.openExternal('https://truesitesync.com') },
        { label: 'Contact Support', click: () => shell.openExternal('mailto:info@truesitesync.com') },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => shell.openExternal('https://truesitesync.com/#download') },
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About True Site Sync',
    message: 'True Site Sync',
    detail: `Version: ${app.getVersion()}\nConstruction Management Platform\n\nBuilt for Indian contractors.\nOffline-first. Cloud-synced.\n\n© 2026 True Site Sync. All rights reserved.\nwww.truesitesync.com`,
    buttons: ['OK'],
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });
}

// Second instance — focus existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
