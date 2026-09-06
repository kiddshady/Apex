'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   APEX — puente IPC
   El renderer no tiene fs, ni require, ni red: `contextIsolation` está activo.
   Todo lo que necesite del sistema pasa por acá, y acá se decide qué se puede
   pedir. Es la superficie de ataque de la app: todo lo que agregues es una
   puerta más.

   Convención: cada handler devuelve {ok:true, data} o {ok:false, error}. El
   preload la desenvuelve y convierte el error en una excepción real, así el
   renderer escribe try/catch normal en vez de chequear banderas.
   ═══════════════════════════════════════════════════════════════════════════ */

const { ipcMain, app, dialog, shell, BrowserWindow } = require('electron');
const fsp = require('fs/promises');
const store = require('./store.cjs');

/* Las colecciones que el renderer puede tocar. Es una lista blanca a
   propósito: sin ella, cualquier bug en el renderer puede crear carpetas
   sueltas en tu directorio de datos.

     sustancias  → lo que se toma: nombre, unidad, dosis habitual, vía.
     dosis       → cada toma, con sus hitos (onset, pico, fin…) adentro. */
const COLLECTIONS = ['sustancias', 'dosis'];

function coll(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`colección no permitida: ${name}`);
  return store.collection(name);
}

function ventana() { return BrowserWindow.getAllWindows()[0] || null; }

/** Envuelve un handler para que un throw viaje como error y no como crash. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(`[ipc] ${channel}:`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

/* ── Exportar ────────────────────────────────────────────────────────────────
   Los datos ya son JSON legibles en disco, pero una planilla quiere CSV. Se
   exporta TODO en un solo archivo, plano: una fila por toma y una fila por
   hito, con la columna `tipo` diciendo cuál es cuál. Así una tabla dinámica
   puede filtrar por tipo y no hay dos archivos que mantener juntos. */

const sello = () => new Date().toISOString().slice(0, 10);

/** Un valor listo para una celda CSV: comillas dobladas, y siempre entre comillas. */
const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const p2 = (n) => String(n).padStart(2, '0');
function fechaLocal(ms) {
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function horaLocal(ms) {
  const d = new Date(Number(ms));
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

async function armarCSV() {
  const [sustancias, dosis] = await Promise.all([coll('sustancias').list(), coll('dosis').list()]);
  const nombre = new Map(sustancias.map((s) => [s.id, s.nombre]));
  const filas = [[
    'tipo', 'dosis_id', 'fecha', 'hora', 'sustancia', 'cantidad', 'unidad', 'via',
    'fase', 'minutos_desde_dosis', 'intensidad', 'notas',
  ]];
  const ordenadas = [...dosis].sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const d of ordenadas) {
    filas.push(['dosis', d.id, fechaLocal(d.at), horaLocal(d.at), nombre.get(d.sustanciaId) || d.sustanciaId,
      d.cantidad, d.unidad, d.via || '', '', '', '', d.notas || '']);
    for (const h of [...(d.hitos || [])].sort((a, b) => (a.at || 0) - (b.at || 0))) {
      filas.push(['hito', d.id, fechaLocal(h.at), horaLocal(h.at), nombre.get(d.sustanciaId) || d.sustanciaId,
        '', '', '', h.fase || '', Math.round((h.at - d.at) / 60000), h.intensidad ?? '', h.notas || '']);
    }
  }
  // BOM para que Excel abra el UTF-8 sin preguntar; punto y coma porque en
  // es-AR la coma es el decimal y una planilla partiría "0,5" en dos columnas.
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}

/** El repo de GitHub al que apunta el actualizador, para el botón de Ajustes. */
function repoURL() {
  try {
    const pub = require('../package.json').build?.publish;
    return pub?.owner && pub?.repo ? `https://github.com/${pub.owner}/${pub.repo}` : null;
  } catch { return null; }
}

/**
 * Registra los handlers. `onAjustes` le avisa al principal cuando cambian los
 * ajustes: hay perillas que él tiene que tener en la mano —si la X esconde o
 * cierra— y que no puede ir a buscar al disco en medio de un evento síncrono.
 */
function register({ onAjustes } = {}) {
  // Siempre, también en los tests: el renderer pregunta por el estado aunque
  // el actualizador nunca haya arrancado (en dev no arranca).
  require('./actualizador.cjs').registrarIPC();

  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    dataDir: store.ROOT,
    electron: process.versions.electron,
    empaquetada: app.isPackaged,
    repo: repoURL(),
  }));

  handle('settings:get', () => store.loadSettings());
  handle('settings:save', async (patch) => {
    const ajustes = await store.saveSettings(patch);
    onAjustes?.(ajustes);
    return ajustes;
  });

  handle('doc:read', (name, fallback = null) => store.doc(name, fallback).read());
  handle('doc:write', (name, data) => store.doc(name).write(data).then(() => true));

  handle('col:list', (name) => coll(name).list());
  handle('col:get', (name, id) => coll(name).get(id));
  handle('col:save', (name, item) => coll(name).save(item));
  handle('col:remove', (name, id) => coll(name).remove(id).then(() => true));
  handle('col:next-id', (name, prefix) => coll(name).nextId(prefix));

  /* ── Lo propio de Apex ─────────────────────────────────────────────────── */

  handle('exportar:csv', async () => {
    const res = await dialog.showSaveDialog(ventana(), {
      title: 'Exportar el registro a CSV',
      defaultPath: `apex-${sello()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return { cancelado: true };
    await fsp.writeFile(res.filePath, await armarCSV(), 'utf8');
    return { cancelado: false, ruta: res.filePath };
  });

  handle('exportar:json', async () => {
    const res = await dialog.showSaveDialog(ventana(), {
      title: 'Exportar todo a JSON',
      defaultPath: `apex-${sello()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { cancelado: true };
    const [sustancias, dosis, ajustes] = await Promise.all([
      coll('sustancias').list(), coll('dosis').list(), store.loadSettings(),
    ]);
    const todo = { app: 'apex', exportado: new Date().toISOString(), ajustes, sustancias, dosis };
    await fsp.writeFile(res.filePath, JSON.stringify(todo, null, 2), 'utf8');
    return { cancelado: false, ruta: res.filePath };
  });

  handle('datos:abrir-carpeta', async () => {
    await store.ensureDirs();
    const err = await shell.openPath(store.ROOT);
    if (err) throw new Error(err);
    return store.ROOT;
  });
}

module.exports = { register, COLLECTIONS, armarCSV };
