// Ponte segura entre a interface e o processo principal.

const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

contextBridge.exposeInMainWorld('api', {
  status: () => call('store:status'),
  create: (password, data) => call('store:create', password, data),
  unlock: (password) => call('store:unlock', password),
  save: (data) => call('store:save', data),
  lock: () => call('store:lock'),
  changePassword: (oldPw, newPw, data) => call('store:changePassword', oldPw, newPw, data),
  wipe: () => call('store:wipe'),
  openTable: (title) => call('file:openTable', title),
  saveText: (opts) => call('file:saveText', opts),
  savePDF: (opts) => call('file:savePDF', opts),
  print: () => call('print'),
  exportBackup: () => call('backup:export'),
  pickBackup: () => call('backup:pick'),
  readBackup: (file, password) => call('backup:read', file, password),
  info: () => call('app:info'),
  openDataDir: () => call('app:openDataDir'),
});
