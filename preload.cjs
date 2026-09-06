'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   ONYX — preload
   La única puerta entre el renderer y el sistema. Todo lo que NO esté acá, el
   renderer no lo puede hacer: no tiene require, ni fs, ni acceso al proceso
   principal. Esa es la idea.

   Regla: exponé funciones, nunca objetos de Electron. `ipcRenderer` en el
   window anula por completo el aislamiento de contexto.
   ═══════════════════════════════════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

/** Desenvuelve {ok,data|error} y convierte el error en una excepción real. */
const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res?.ok) throw new Error(res?.error || `Falló ${channel}`);
  return res.data;
};

contextBridge.exposeInMainWorld('onyx', {
  info: () => call('app:info'),

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
    /** El renderer le pasa a la ventana su color base ya resuelto (ver app.js). */
    setBackground: (hex) => ipcRenderer.send('win:set-bg', hex),
    onMaximized: (cb) => {
      const handler = (_e, value) => cb(value);
      ipcRenderer.on('win:maximized', handler);
      return () => ipcRenderer.off('win:maximized', handler);
    },
  },

  settings: {
    get: () => call('settings:get'),
    save: (patch) => call('settings:save', patch),
  },

  /** Documento suelto: un borrador, un caché, el último estado de la UI. */
  doc: {
    read: (name, fallback = null) => call('doc:read', name, fallback),
    write: (name, data) => call('doc:write', name, data),
  },

  /** Colección: una carpeta con un archivo por ítem. */
  col: (name) => ({
    list: () => call('col:list', name),
    get: (id) => call('col:get', name, id),
    save: (item) => call('col:save', name, item),
    remove: (id) => call('col:remove', name, id),
    nextId: (prefix) => call('col:next-id', name, prefix),
  }),
});

/* Lo propio de Apex, aparte de `onyx` para que se note qué es del framework
   y qué es de la app. Devuelven {cancelado, ruta}: cancelar el diálogo no es
   un error, es una decisión. */
contextBridge.exposeInMainWorld('apex', {
  exportar: {
    csv: () => call('exportar:csv'),
    json: () => call('exportar:json'),
  },
  abrirCarpeta: () => call('datos:abrir-carpeta'),

  /** Actualizaciones: el principal manda estados, el renderer los muestra. */
  actualizacion: {
    estado: () => call('actualizacion:estado'),
    buscar: () => call('actualizacion:buscar'),
    instalar: () => ipcRenderer.send('actualizacion:instalar'),
    onEstado: (cb) => {
      const handler = (_e, value) => cb(value);
      ipcRenderer.on('actualizacion:estado', handler);
      return () => ipcRenderer.off('actualizacion:estado', handler);
    },
  },
});
