'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 렌더러(앱 화면)는 Node에 직접 접근하지 않고 이 얇은 다리만 쓴다.
 * 브라우저에서 index.html 을 그냥 열면 이 객체가 없고,
 * 앱은 자동으로 localStorage 모드로 떨어진다. (app/js/store.js 참고)
 */
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,

  readData: () => ipcRenderer.invoke('data:read'),
  writeData: (payload) => ipcRenderer.invoke('data:write', payload),
  backupData: (payload) => ipcRenderer.invoke('data:backup', payload),

  getConfig: () => ipcRenderer.invoke('config:get'),
  chooseDataDir: () => ipcRenderer.invoke('config:chooseDataDir'),
  resetDataDir: () => ipcRenderer.invoke('config:resetDataDir'),
  openDataDir: () => ipcRenderer.invoke('shell:openDataDir'),

  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),

  onMenu: (channel, handler) => {
    const allowed = [
      'menu:new-event',
      'menu:new-task',
      'menu:export-ics',
      'menu:import-ics',
      'menu:export-json',
      'menu:view-today',
      'menu:view-calendar',
      'menu:view-checklist',
      'menu:view-team',
      'menu:view-settings',
    ];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, () => handler());
  },
});
