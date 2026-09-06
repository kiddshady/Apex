/* Ajustes — pocas perillas, las actualizaciones, la carpeta de datos y la
   exportación. */

import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc, attempt } from '../ui.js';
import { Toast } from '../overlays.js';
import { bindSwitcher } from '../motion.js';
import { RANGOS } from '../pk.js';
import { UNIDADES } from '../vocab.js';
import { S, apex, guardarAjustes, setContexto } from '../tienda.js';
import { selectHTML, bindSelect } from '../dialogos.js';
import { estadoActualizacion, describirEstado, buscarActualizacion, instalarActualizacion, onActualizacion } from '../actualizacion.js';
import { segmentedHTML } from './comunes.js';

export function vistaAjustes() {
  const a = S.ajustes;
  setContexto('');
  paint(head({ title: 'Ajustes', sub: 'Se guardan en settings.json, con escritura atómica' }) + `
    <div class="ox-scroll ox-grow">
      <div style="max-width:640px">

        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Registro</span></div>
          <div class="ox-card"><div class="ox-card__body ox-col" style="gap:18px">
            <div class="ox-field">
              <label class="ox-field__label">Rango con el que abre el Registro</label>
              ${segmentedHTML('set-rango', RANGOS, a.rangoRegistro || '30d', 'style="max-width:420px"')}
            </div>
            <div class="ox-field" style="max-width:220px">
              <label class="ox-field__label">Unidad para una sustancia nueva</label>
              ${selectHTML({ id: 'set-unidad', placeholder: 'mg' })}
              <span class="ox-field__hint">Cada sustancia después tiene la suya.</span>
            </div>
          </div></div>
        </div>

        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Ventana</span></div>
          <div class="ox-card"><div class="ox-card__body">
            <label class="ox-row" style="gap:16px;justify-content:space-between">
              <span class="ox-col" style="gap:3px">
                <span class="ox-label">Al cerrar, seguir en la bandeja</span>
                <span class="ox-meta">La X esconde la ventana en vez de cerrar Apex.</span>
              </span>
              <button type="button" class="ox-switch${a.cerrarAlTray !== false ? ' is-on' : ''}" id="set-tray"
                role="switch" aria-checked="${a.cerrarAlTray !== false}" aria-label="Al cerrar, seguir en la bandeja"></button>
            </label>
            <p class="ox-meta" style="margin-top:14px;line-height:1.65">
              Apex vive al lado del reloj mientras corre: desde ahí se abre de nuevo, y desde ahí se
              cierra del todo. Apagado, la X cierra la app como cualquier otra ventana. Abrir Apex
              cuando ya está abierto nunca arranca una segunda: trae al frente la que hay.
            </p>
          </div></div>
        </div>

        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Actualizaciones</span></div>
          <div class="ox-card"><div class="ox-card__body">
            <div class="ox-kv">
              <span class="ox-kv__k">Versión</span><span class="ox-kv__v ox-mono">${esc(S.info?.version || '—')}</span>
              <span class="ox-kv__k">Estado</span><span class="ox-kv__v ox-kv__v--wrap" id="upd-estado">${esc(describirEstado())}</span>
            </div>
            <div class="ox-row" style="gap:8px;margin-top:16px;flex-wrap:wrap">
              <button class="ox-btn ox-btn--secondary ox-flashable" id="btn-buscar-upd">${Icons.svg('retry')} Buscar actualizaciones</button>
              <button class="ox-btn ox-btn--primary ox-flashable" id="btn-instalar-upd" hidden>${Icons.svg('download')} Reiniciar y actualizar</button>
              ${S.info?.repo ? `<button class="ox-btn ox-btn--ghost ox-flashable" id="btn-releases">${Icons.svg('external')} Ver versiones en GitHub</button>` : ''}
            </div>
            <p class="ox-meta" style="margin-top:14px;line-height:1.65">
              Al abrirse, la app instalada mira si hay una versión nueva, la descarga en segundo plano
              y la instala al reiniciar. Nunca se reinicia sola: cuando está lista aparece un aviso en la
              barra de estado y lo tocás cuando quieras.
            </p>
          </div></div>
        </div>

        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Datos</span></div>
          <div class="ox-card"><div class="ox-card__body">
            <div class="ox-kv">
              <span class="ox-kv__k">Carpeta</span>
              <span class="ox-kv__v ox-mono ox-copyable" data-copy="${esc(S.info?.dataDir || '')}" data-tip="Click para copiar">${esc(S.info?.dataDir || '—')}</span>
              <span class="ox-kv__k">Tomas</span><span class="ox-kv__v ox-num">${S.dosis.length}</span>
              <span class="ox-kv__k">Sustancias</span><span class="ox-kv__v ox-num">${S.sustancias.length}</span>
              <span class="ox-kv__k">Esquema</span><span class="ox-kv__v ox-mono">v${esc(a.schema ?? 1)}</span>
            </div>
            <div class="ox-row" style="gap:8px;margin-top:16px;flex-wrap:wrap">
              <button class="ox-btn ox-btn--secondary ox-flashable" id="btn-carpeta">${Icons.svg('folder')} Abrir carpeta</button>
              <button class="ox-btn ox-btn--secondary ox-flashable" id="btn-csv">${Icons.svg('download')} Exportar CSV</button>
              <button class="ox-btn ox-btn--secondary ox-flashable" id="btn-json">${Icons.svg('download')} Exportar JSON</button>
            </div>
            <p class="ox-meta" style="margin-top:14px;line-height:1.65">
              Los archivos son JSON legibles: una carpeta por colección y un archivo por toma o por
              sustancia. Se pueden abrir con un editor, versionar en git y arreglar a mano. El CSV
              exporta todo plano —una fila por toma y una por hito, con la columna <span class="ox-mono">tipo</span>—
              separado por punto y coma, que es lo que una planilla en español espera.
            </p>
          </div></div>
        </div>

        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Acerca de</span></div>
          <div class="ox-card"><div class="ox-card__body">
            <div class="ox-kv">
              <span class="ox-kv__k">App</span><span class="ox-kv__v">Apex${S.info?.empaquetada ? '' : ' · en desarrollo'}</span>
              <span class="ox-kv__k">Electron</span><span class="ox-kv__v ox-mono">${esc(S.info?.electron || '—')}</span>
            </div>
            <p class="ox-meta" style="margin-top:14px;line-height:1.65">
              Apex lleva el registro de lo que tomás y arma, de a episodios, tu farmacocinética
              personal por sustancia. No reemplaza a nadie con matrícula: es tu cuaderno, con gráficos.
            </p>
          </div></div>
        </div>

      </div>
      <div style="height:24px"></div>
    </div>`);

  bindSwitcher(document.getElementById('set-rango'), (v) => guardarAjustes({ rangoRegistro: v }));

  const swTray = document.getElementById('set-tray');
  swTray.addEventListener('click', () => {
    const on = !swTray.classList.contains('is-on');
    swTray.classList.toggle('is-on', on);
    swTray.setAttribute('aria-checked', String(on));
    guardarAjustes({ cerrarAlTray: on });
  });
  bindSelect(document.getElementById('set-unidad'), UNIDADES.map((u) => ({ value: u, label: u })), {
    valor: a.unidadDefault || 'mg',
    onChange: (v) => guardarAjustes({ unidadDefault: v }),
  });

  /* Actualizaciones: el estado se repinta con cada aviso del principal, y el
     oyente se suelta al navegar. */
  const pintarUpd = (e) => {
    const est = document.getElementById('upd-estado');
    if (est) est.textContent = describirEstado(e);
    const inst = document.getElementById('btn-instalar-upd');
    if (inst) inst.hidden = e.fase !== 'listo';
    const buscar = document.getElementById('btn-buscar-upd');
    if (buscar) buscar.disabled = e.fase === 'buscando' || e.fase === 'descargando';
  };
  pintarUpd(estadoActualizacion());
  Router.onLeave(onActualizacion(pintarUpd));
  document.getElementById('btn-buscar-upd').addEventListener('click', () => buscarActualizacion());
  document.getElementById('btn-instalar-upd').addEventListener('click', () => instalarActualizacion());
  // window.open con https lo intercepta el principal y lo manda al navegador.
  document.getElementById('btn-releases')?.addEventListener('click', () => window.open(`${S.info.repo}/releases`));

  document.getElementById('btn-carpeta').addEventListener('click', () =>
    attempt(() => apex.abrirCarpeta(), { errorTitle: 'No se pudo abrir la carpeta' }));

  const exportar = (fn, titulo) => attempt(async () => {
    const r = await fn();
    if (!r?.cancelado) Toast.show({ title: titulo, text: r.ruta, icon: 'download' });
  }, { errorTitle: 'No se pudo exportar' });
  document.getElementById('btn-csv').addEventListener('click', () => exportar(apex.exportar.csv, 'CSV exportado'));
  document.getElementById('btn-json').addEventListener('click', () => exportar(apex.exportar.json, 'JSON exportado'));
}
