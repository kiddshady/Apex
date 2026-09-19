/* Lo que comparten varias vistas: la fila de una toma, la cifra grande, el
   título de un día. Sin estado propio. */

import { Icons } from '../icons.js';
import { esc, mark } from '../ui.js';
import { fmtHM, fmtDosis, fmtDiaSemana, fmtDiaLargo, fmtOffset, plural } from '../format.js';
import { estadoDosis, ordenarHitos, faseInfo, inicioDia, sumarDias } from '../pk.js';
import { nombreSustancia, cantidadDosis } from '../tienda.js';
import { viaLabel } from '../vocab.js';

/**
 * Una toma como fila de lista. Click abre el detalle; las acciones de fila
 * (hito, menú) se materializan con el hover. `data-open` y `data-menu` los
 * escucha la delegación global de app.js.
 */
export function filaDosis(d, { conFecha = false, conSustancia = true } = {}) {
  const hitos = ordenarHitos(d.hitos || []);
  const ultimo = hitos[hitos.length - 1];
  const partes = [];
  if (conFecha) partes.push(fmtDiaSemana(d.at));
  if (d.via) partes.push(viaLabel(d.via));
  if (hitos.length) {
    partes.push(plural(hitos.length, 'hito'));
    if (ultimo) partes.push(`último: ${faseInfo(ultimo.fase).label} ${fmtOffset(ultimo.at - d.at)}`);
  } else {
    partes.push('sin hitos');
  }
  if (d.notas) partes.push(d.notas.replace(/\s+/g, ' ').slice(0, 80));

  return `
    <div class="ox-listitem" role="button" tabindex="0" data-open="${esc(d.id)}">
      ${mark(estadoDosis(d))}
      <span class="ap-toma__hora">${esc(fmtHM(d.at))}</span>
      <div class="ox-listitem__main">
        <span class="ox-listitem__title">${conSustancia ? `${esc(nombreSustancia(d.sustanciaId))} ` : ''}<span class="ap-toma__cant">${esc(cantidadDosis(d))}</span></span>
        <span class="ox-listitem__sub">${esc(partes.join(' · '))}</span>
      </div>
      <div class="ox-rowactions">
        <button class="ox-iconbtn ox-iconbtn--sm" data-hito="${esc(d.id)}" data-tip="Agregar hito">${Icons.svg('hito')}</button>
        <button class="ox-iconbtn ox-iconbtn--sm" data-menu="dosis" data-menu-arg="${esc(d.id)}" data-tip="Más">${Icons.svg('more')}</button>
      </div>
    </div>`;
}

/** «Hoy · viernes 5 de septiembre», «Ayer · …», o la fecha. */
export function tituloDia(ms, ahora = Date.now()) {
  const hoy = inicioDia(ahora);
  if (ms === hoy) return `Hoy · ${fmtDiaLargo(ms)}`;
  if (ms === sumarDias(hoy, -1)) return `Ayer · ${fmtDiaLargo(ms)}`;
  const anio = new Date(ms).getFullYear();
  return fmtDiaLargo(ms) + (anio !== new Date(ahora).getFullYear() ? ` de ${anio}` : '');
}

/** Una cifra grande con su rótulo. `valor` ya viene formateado (o es un id para countTo). */
export function kpi(valor, label, { id = '', unidad = '', tip = '' } = {}) {
  return `<div class="ap-kpi"${tip ? ` data-tip="${esc(tip)}"` : ''}>
    <div class="ox-stat">
      <span class="ox-stat__value"${id ? ` id="${esc(id)}"` : ''}>${esc(valor)}${unidad ? `<span class="ox-stat__unit">${esc(unidad)}</span>` : ''}</span>
      <span class="ox-stat__label">${esc(label)}</span>
    </div></div>`;
}

/** El resumen de un día en texto: «600 mg · 3 tomas» o «3 tomas». */
export function resumenTexto(r) {
  return r.tipo === 'suma' ? `${fmtDosis(r.total, r.unidad)} · ${plural(r.tomas, 'toma')}` : plural(r.tomas, 'toma');
}

/** Un segmentado. Cablealo con bindSwitcher. */
export function segmentedHTML(id, opciones, activo, extra = '') {
  return `<div class="ox-segmented" id="${esc(id)}" ${extra}>${opciones.map((o) => `
    <button class="ox-segmented__opt${o.id === activo ? ' is-active' : ''}" data-value="${esc(o.id)}">${esc(o.label)}</button>`).join('')}
  </div>`;
}

/** El botón primario de registrar, el mismo en todas las vistas. */
export const BTN_REGISTRAR = `<button class="ox-btn ox-btn--primary ox-flashable" data-action="registrar">
  ${Icons.svg('plus')} Registrar dosis</button>`;
