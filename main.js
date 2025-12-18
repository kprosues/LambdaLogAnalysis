const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Performance optimizations - must be set before app is ready
app.commandLine.appendSwitch('enable-features', 'V8VmFuture'); // Enable V8 performance features
app.commandLine.appendSwitch('js-flags', '--optimize-for-size'); // Reduce memory usage, faster startup

let mainWindow;
let splashWindow;
let splashShownTime = 0;
const MIN_SPLASH_TIME = 1500; // Minimum time to show splash (ms)

function createSplashWindow() {
  // Set icon path based on platform
  let iconPath;
  if (process.platform === 'win32') {
    const icoPath = path.join(__dirname, 'assets', 'icon.ico');
    const pngPath = path.join(__dirname, 'assets', 'icon.png');
    iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
  } else {
    iconPath = path.join(__dirname, 'assets', 'icon.png');
  }

  splashWindow = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    center: true,
    show: true, // Show immediately - don't wait for content
    backgroundColor: '#1a1a2e', // Background shows while content loads
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Track when splash was shown
  splashShownTime = Date.now();

  // Load splash content - background color already visible
  splashWindow.loadFile('renderer/splash.html');
}

function createWindow() {
  // Set icon path based on platform
  let iconPath;
  if (process.platform === 'win32') {
    // On Windows, try .ico first, then fall back to .png
    const icoPath = path.join(__dirname, 'assets', 'icon.ico');
    const pngPath = path.join(__dirname, 'assets', 'icon.png');
    iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
  } else {
    iconPath = path.join(__dirname, 'assets', 'icon.png');
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // Don't show until ready - prevents blank window
    backgroundColor: '#f5f5f5', // Set background color to match app
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      v8CacheOptions: 'bypassHeatCheck' // Enable V8 code caching for faster startup
    },
    icon: iconPath,
    autoHideMenuBar: false
  });

  // Show main window and close splash when content is ready
  mainWindow.once('ready-to-show', () => {
    // Ensure splash has been visible for minimum time
    const elapsed = Date.now() - splashShownTime;
    const remainingTime = Math.max(0, MIN_SPLASH_TIME - elapsed);
    
    // Close splash window after minimum display time
    if (splashWindow && !splashWindow.isDestroyed()) {
      setTimeout(() => {
        mainWindow.show();
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
          splashWindow = null;
        }
        console.log('Main window shown, splash closed');
      }, remainingTime);
    } else {
      mainWindow.show();
      console.log('Main window shown (no splash)');
    }
  });

  mainWindow.setMenuBarVisibility(true);
  mainWindow.loadFile('renderer/index.html');

  // Create application menu after window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    createMenu(mainWindow);
    console.log('Menu created after window loaded');
  });

  // Also create menu immediately (fallback)
  createMenu(mainWindow);
  console.log('Menu created immediately');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createMenu(window) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Toggle Dark Mode',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            if (window && window.webContents) {
              window.webContents.send('toggle-dark-mode');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' }
      ]
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Tooltip Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            console.log('Tooltip Settings menu item clicked');
            if (window && window.webContents) {
              console.log('Sending open-tooltip-settings IPC message');
              window.webContents.send('open-tooltip-settings');
            } else {
              console.error('Window or webContents not available');
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  
  // Set menu on both application and window (for Windows compatibility)
  Menu.setApplicationMenu(menu);
  if (window) {
    window.setMenu(menu);
  }
}

app.whenReady().then(() => {
  // Show splash screen immediately
  createSplashWindow();
  
  // Start loading main window after a brief moment to ensure splash is painted
  setTimeout(() => {
    createWindow();
  }, 100);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashWindow();
      setTimeout(() => {
        createWindow();
      }, 100);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Get user's documents folder dynamically
function getDefaultLogPath() {
  const documentsPath = app.getPath('documents');
  return documentsPath;
}

// Handle file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Log File',
    defaultPath: getDefaultLogPath(),
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content: fileContent, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

// Handle file reading
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content: fileContent };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle tune file dialog
ipcMain.handle('open-tune-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Tune File',
    defaultPath: getDefaultLogPath(),
    properties: ['openFile'],
    filters: [
      { name: 'Tune Files', extensions: ['tune'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content: fileContent, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

// Handle app version request
ipcMain.handle('get-app-version', async () => {
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    console.error('Error reading app version:', error);
    return 'Unknown';
  }
});

