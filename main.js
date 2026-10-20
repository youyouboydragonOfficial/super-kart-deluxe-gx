const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isSmokeTest = process.argv.includes('--smoke-test');
global.isSmokeTest = isSmokeTest;

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'SUPER MARIO KART GX DELUXE - 完全再現＆オリジナル超ギミック版',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      additionalArguments: isSmokeTest ? ['--smoke-test'] : []
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.webContents.on('did-finish-load', () => {
    if (isSmokeTest) {
      win.webContents.send('run-smoke-test');
    }
  });

  ipcMain.on('toggle-fullscreen', () => {
    win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  ipcMain.on('smoke-test-result', (_event, result) => {
    console.log('SMOKE_TEST_RESULT:', JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
