'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   APEX — actualizaciones

   electron-updater contra los releases de GitHub del repo (la sección
   `build.publish` de package.json dice cuál). El instalador publica un
   `latest.yml` al lado del .exe; la app instalada lo consulta al arrancar,
   descarga la versión nueva en segundo plano y la instala al reiniciar.

   Acá NO hay diálogos: este módulo solo mantiene un estado y se lo manda al
   renderer, que lo muestra a su manera (un ítem en la statusbar, un toast, la
   sección de Ajustes). Un `dialog.showMessageBox` del sistema al lado del
   resto de la app se vería como lo que es, y además interrumpe.

   En desarrollo (`electron .`, app sin empaquetar) no se busca nada: no hay
   `app-update.yml` y electron-updater tira. El estado queda en «inactivo» con
   el motivo, y el renderer lo dice en Ajustes.

   Fases: inactivo · buscando · al-dia · disponible · descargando · listo · error
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, ipcMain } = require('electron');

const CANAL = 'actualizacion:estado';

/* Cuánto esperar después del arranque antes de buscar. La app tiene que estar
   respirando primero: buscar en el primer frame compite con el splash. */
const ESPERA_INICIAL = 6000;

let autoUpdater = null;
let ventana = () => null;
let estado = { fase: 'inactivo', version: app.getVersion(), manual: false };

function emitir(patch) {
  estado = { ...estado, ...patch, version: app.getVersion() };
  const w = ventana();
  if (w && !w.isDestroyed()) w.webContents.send(CANAL, estado);
  return estado;
}

/** Los handlers IPC. Se registran siempre —también en los tests— para que el
    renderer pueda preguntar aunque el actualizador nunca haya arrancado. */
function registrarIPC() {
  ipcMain.handle('actualizacion:estado', () => estado);
  ipcMain.handle('actualizacion:buscar', () => buscar(true));
  ipcMain.on('actualizacion:instalar', () => {
    if (!autoUpdater || estado.fase !== 'listo') return;
    // Silencioso y volver a abrir: el instalador NSIS corre sin ventana y la
    // app aparece de nuevo con la versión nueva.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
}

/**
 * Arranca el actualizador de verdad. `getWin` devuelve la ventana a la que
 * avisar. Solo hace algo en la app empaquetada.
 */
function iniciar(getWin, { auto = true } = {}) {
  ventana = getWin;
  if (!app.isPackaged) {
    emitir({ fase: 'inactivo', motivo: 'dev' });
    return;
  }
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    emitir({ fase: 'error', error: `No cargó electron-updater: ${err.message}` });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => emitir({ fase: 'buscando' }));
  autoUpdater.on('update-available', (info) => emitir({
    fase: 'disponible',
    nueva: info.version,
    notas: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
  }));
  autoUpdater.on('update-not-available', () => emitir({ fase: 'al-dia', revisado: Date.now() }));
  autoUpdater.on('download-progress', (p) => emitir({
    fase: 'descargando', progreso: p.percent, velocidad: p.bytesPerSecond, total: p.total,
  }));
  autoUpdater.on('update-downloaded', (info) => emitir({ fase: 'listo', nueva: info.version, progreso: 100 }));
  autoUpdater.on('error', (err) => emitir({ fase: 'error', error: err?.message || String(err) }));

  if (auto) setTimeout(() => buscar(false), ESPERA_INICIAL);
}

/** Busca una vez. `manual` marca que lo pidió alguien, para que el renderer
    conteste aunque la respuesta sea «estás al día». */
async function buscar(manual = false) {
  if (!autoUpdater) return emitir({ fase: 'inactivo', motivo: app.isPackaged ? 'sin-actualizador' : 'dev', manual });
  // Una descarga en curso o una lista no se interrumpen por volver a preguntar.
  if (estado.fase === 'descargando' || estado.fase === 'listo') return emitir({ manual });
  emitir({ fase: 'buscando', manual });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    emitir({ fase: 'error', error: err?.message || String(err) });
  }
  return estado;
}

module.exports = { registrarIPC, iniciar, buscar, get estado() { return estado; } };
