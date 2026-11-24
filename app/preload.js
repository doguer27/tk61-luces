// Puente minimo entre la interfaz y el proceso principal: solo estas llamadas y estos avisos.
const { contextBridge, ipcRenderer } = require('electron');
const CALLS = ['init', 'apply', 'cfg', 'live', 'live-slots', 'anim-params', 'retry', 'update-check', 'update-install', 'export', 'import'];
const EVENTS = ['link', 'frame', 'applied', 'update', 'audio', 'visible'];
contextBridge.exposeInMainWorld('tk61', {
  call: (name, ...args) => { if (!CALLS.includes(name)) throw new Error('llamada desconocida: ' + name); return ipcRenderer.invoke(name, ...args); },
  on: (name, fn) => { if (EVENTS.includes(name)) ipcRenderer.on(name, (_e, data) => fn(data)); },
  audio: levels => ipcRenderer.send('audio', levels),
});
