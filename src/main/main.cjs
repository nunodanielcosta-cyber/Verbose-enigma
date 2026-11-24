// Processo principal: janela, protocolo interno, armazenamento cifrado e acesso a ficheiros.

const { app, BrowserWindow, ipcMain, dialog, protocol, session, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const { readTable } = require('./files.cjs');

const SRC = path.join(__dirname, '..');
const HOST = 'bussola';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// Pasta de dados alternativa (usada nos testes automáticos).
if (process.env.BUSSOLA_DATA_DIR) app.setPath('userData', process.env.BUSSOLA_DATA_DIR);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let store = null;

function serveFile(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Não encontrado', { status: 404 });
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(SRC, rel));
  if (!file.startsWith(SRC + path.sep) || !['renderer', 'core'].includes(rel.split('/')[0]) || !fs.existsSync(file)) {
    return new Response('Não encontrado', { status: 404 });
  }
  return new Response(fs.readFileSync(file), {
    headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-security-policy': CSP },
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1000,
    minHeight: 640,
    title: 'Bússola MGF',
    backgroundColor: '#f4f7f8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`app://${HOST}/`)) e.preventDefault();
  });
  win.loadURL(`app://${HOST}/renderer/index.html`);
}

function menu() {
  const template = [
    { label: 'Ficheiro', submenu: [{ role: 'quit', label: 'Sair' }] },
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Anular' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Cortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Ver', submenu: [{ role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' }, { role: 'resetZoom', label: 'Tamanho real' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Ecrã inteiro' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { role: 'reload' }])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!event.senderFrame || !event.senderFrame.url.startsWith(`app://${HOST}/`)) throw new Error('Origem não autorizada.');
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

const FILTERS = {
  table: [{ name: 'Folhas de cálculo e CSV', extensions: ['csv', 'xlsx', 'xlsm', 'txt'] }],
  csv: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  backup: [{ name: 'Cópia cifrada Bússola MGF', extensions: ['bmgf'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
};

function registerIpc() {
  handle('store:status', () => ({ exists: store.exists(), unlocked: store.unlocked, dir: store.dir }));
  handle('store:create', (password, data) => store.create(password, data));
  handle('store:unlock', (password) => store.unlock(password));
  handle('store:save', (data) => store.save(data));
  handle('store:lock', () => {
    store.lock();
    win.webContents.reload();
  });
  handle('store:changePassword', (oldPw, newPw, data) => store.changePassword(oldPw, newPw, data));
  handle('store:wipe', () => {
    store.wipe();
    win.webContents.reload();
  });

  handle('file:openTable', async (title) => {
    const r = await dialog.showOpenDialog(win, { title: title || 'Abrir ficheiro', properties: ['openFile'], filters: FILTERS.table });
    if (r.canceled || !r.filePaths[0]) return null;
    const rows = await readTable(r.filePaths[0]);
    return { name: path.basename(r.filePaths[0]), rows };
  });

  handle('file:saveText', async ({ defaultName, content, kind = 'csv' }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: FILTERS[kind] || FILTERS.csv });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, content, 'utf8');
    return path.basename(r.filePath);
  });

  handle('file:savePDF', async ({ defaultName }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: FILTERS.pdf });
    if (r.canceled || !r.filePath) return null;
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
    fs.writeFileSync(r.filePath, pdf);
    return path.basename(r.filePath);
  });

  handle('print', () => new Promise((resolve) => win.webContents.print({ printBackground: true }, (ok) => resolve(ok))));

  handle('backup:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win, { defaultPath: `bussola-mgf-copia-${stamp}.bmgf`, filters: FILTERS.backup });
    if (r.canceled || !r.filePath) return null;
    store.exportTo(r.filePath);
    return path.basename(r.filePath);
  });

  handle('backup:pick', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Restaurar cópia de segurança', properties: ['openFile'], filters: FILTERS.backup });
    return r.canceled ? null : r.filePaths[0] || null;
  });

  handle('backup:read', (file, password) => store.readBackup(file, password));

  handle('app:info', () => ({ version: app.getVersion(), dataDir: store.dir }));
  handle('app:openDataDir', () => shell.openPath(store.dir));
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  protocol.handle('app', serveFile);
  // Sem acesso à Internet: a app só carrega os seus próprios ficheiros.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = details.url.startsWith('app://') || details.url.startsWith('devtools://') || details.url.startsWith('data:');
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  menu();
  registerIpc();
  createWindow();
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (store) store.lock();
  app.quit();
});
