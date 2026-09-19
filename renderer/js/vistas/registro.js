/* Registro — todas las tomas, agrupadas por día, con un filtro de rango y de
   sustancia. Es la vista de «qué tomé y cuándo». */

import { Icons } from '../icons.js';
import { paint, head, esc, empty } from '../ui.js';
import { bindSwitcher } from '../motion.js';
import Router from '../router.js';
import { plural } from '../format.js';
import { RANGOS, rango, enRango, porDia, resumenDia } from '../pk.js';
import { S, activas, sustancia, guardarAjustes, setContexto } from '../tienda.js';
import { selectHTML, bindSelect } from '../dialogos.js';
import { filaDosis, tituloDia, resumenTexto, segmentedHTML, BTN_REGISTRAR } from './comunes.js';

/* El filtro de sustancia vive en memoria, no en los ajustes: es de la sesión.
   El rango sí se guarda, porque es una preferencia. */
let filtroSustancia = null;

export function vistaRegistro() {
  const r = rango(S.ajustes.rangoRegistro || '30d', S.dosis);
  if (filtroSustancia && !sustancia(filtroSustancia)) filtroSustancia = null;
  // Filtrar por una sustancia trae también las combinaciones que la llevan.
  const coincide = (d) => d.sustanciaId === filtroSustancia || d.componentes?.some((c) => c.sustanciaId === filtroSustancia);
  const lista = S.dosis.filter((d) => enRango(d, r) && (!filtroSustancia || coincide(d)));
  const dias = porDia(lista);

  setContexto('');
  paint(head({
    title: 'Registro',
    sub: S.dosis.length
      ? `${plural(lista.length, 'toma')} en ${RANGOS.find((x) => x.id === r.id)?.label.toLowerCase() || 'el rango'}${filtroSustancia ? ` de ${sustancia(filtroSustancia).nombre}` : ''}`
      : 'Todavía no hay tomas registradas',
    actions: BTN_REGISTRAR,
  }) + `
    <div class="ox-scroll ox-grow">
      <div class="ap-filtros">
        ${segmentedHTML('f-rango', RANGOS, r.id)}
        ${selectHTML({ id: 'f-sust', placeholder: 'Todas las sustancias' })}
        ${filtroSustancia ? `<button class="ox-btn ox-btn--ghost ox-btn--sm" id="f-limpiar">${Icons.svg('close')} Quitar filtro</button>` : ''}
      </div>

      ${dias.length
    ? dias.map((g) => `
        <div class="ap-dia">
          <div class="ap-dia__head">
            <span class="ap-dia__fecha">${esc(tituloDia(g.dia))}</span>
            <span class="ap-dia__total">${esc(resumenTexto(resumenDia(g.dosis)))}</span>
          </div>
          <div class="ox-list">${g.dosis.map((d) => filaDosis(d, { conSustancia: !filtroSustancia || d.sustanciaId !== filtroSustancia })).join('')}</div>
        </div>`).join('')
    : `<div class="ox-empty" style="padding:48px 16px">${Icons.svg('inbox')}
        <div class="ox-empty__title">${S.dosis.length ? 'Nada en este rango' : 'Sin tomas todavía'}</div>
        <div class="ox-empty__text">${S.dosis.length
    ? 'Probá con un rango más largo, o sacá el filtro de sustancia.'
    : 'Cada toma queda como un archivo JSON en la carpeta de datos, con sus hitos adentro.'}</div>
        ${!S.dosis.length ? `<div class="ox-row" style="margin-top:6px"><button class="ox-btn ox-btn--secondary ox-flashable" data-action="registrar">${Icons.svg('plus')} Registrar la primera</button></div>` : ''}
      </div>`}
      <div style="height:24px"></div>
    </div>`);

  bindSwitcher(document.getElementById('f-rango'), async (value) => {
    await guardarAjustes({ rangoRegistro: value });
    Router.refresh();
  });

  // Las archivadas aparecen si tienen tomas en el rango: filtrar por ellas
  // sigue teniendo sentido aunque ya no se registren.
  const conTomas = new Set(S.dosis.map((d) => d.sustanciaId));
  const opciones = [
    { value: null, label: 'Todas las sustancias' },
    { sep: true },
    ...S.sustancias.filter((s) => !s.archivada || conTomas.has(s.id)).map((s) => ({ value: s.id, label: s.archivada ? `${s.nombre} (archivada)` : s.nombre, icon: s.componentes?.length ? 'combinacion' : 'pill' })),
  ];
  bindSelect(document.getElementById('f-sust'), opciones, {
    valor: filtroSustancia,
    onChange: (v) => { filtroSustancia = v; Router.refresh(); },
  });
  document.getElementById('f-limpiar')?.addEventListener('click', () => { filtroSustancia = null; Router.refresh(); });
}

/** Para que otras vistas puedan abrir el registro ya filtrado. */
export function filtrarRegistro(sustanciaId) {
  filtroSustancia = sustanciaId || null;
  Router.go('registro');
  if (Router.name === 'registro') Router.refresh();
}

