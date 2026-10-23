/* Esquema — la medicación de base, toda junta y a la vista: qué, cuánto por
   toma, cuántas veces, cuándo, y cómo va hoy. Antes vivía repartida en la
   ficha de cada sustancia y solo se veía al crearla o editarla. Acá se agrega,
   se edita y se quita sin pasar por el perfil, y no tiene tope: es una fila
   por fármaco. Un click en la fila la edita. */

import { Icons } from '../icons.js';
import { Toast } from '../overlays.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { fmtDosis, fmtQty, fmtDiaLargo, plural } from '../format.js';
import { esquemaDelDia, dosisDiariaEsquema } from '../pk.js';
import { S, delEsquema, setContexto } from '../tienda.js';

export const BTN_AGREGAR_ESQUEMA = `<button class="ox-btn ox-btn--primary ox-flashable" data-action="agregar-esquema">
  ${Icons.svg('plus')} Agregar al esquema</button>`;

const BTN_COPIAR = `<button class="ox-btn ox-btn--secondary ox-flashable" data-action="copiar-esquema"
  data-tip="El esquema en texto, para pegarlo en un mensaje o mostrárselo al médico">${Icons.svg('copy')} Copiar</button>`;

/** Las filas: cada sustancia con cómo va su día. Los fijos y los a demanda van en tablas aparte. */
function filas(ahora) {
  return delEsquema().map((s) => ({ s, dia: esquemaDelDia(s, S.dosis, ahora) }));
}

/** «200–400 mg», «desde 200 mg», «hasta 400 mg», o ''. */
function rango(e, u) {
  if (e.min != null && e.max != null) return e.min === e.max ? fmtDosis(e.min, u) : `${fmtQty(e.min)}–${fmtDosis(e.max, u)}`;
  if (e.min != null) return `desde ${fmtDosis(e.min, u)}`;
  if (e.max != null) return `hasta ${fmtDosis(e.max, u)}`;
  return '';
}

const porToma = (s) => (Number(s.dosisHabitual) > 0 ? fmtDosis(s.dosisHabitual, s.unidad) : '');
const vacio = '<span class="ap-esqt__nada">—</span>';
const celda = (txt) => (txt ? esc(txt) : vacio);

export function vistaEsquema() {
  const ahora = Date.now();
  const todas = filas(ahora);
  const fijos = todas.filter((x) => x.dia.modo === 'fijo');
  const demanda = todas.filter((x) => x.dia.modo === 'demanda');

  setContexto('');
  paint(head({
    title: 'Esquema',
    sub: todas.length
      ? [plural(todas.length, 'fármaco'), fijos.length ? `${fijos.length} todos los días` : null, demanda.length ? `${demanda.length} a demanda` : null].filter(Boolean).join(' · ')
      : 'Tu medicación de base, toda junta',
    actions: todas.length ? `${BTN_COPIAR}${BTN_AGREGAR_ESQUEMA}` : BTN_AGREGAR_ESQUEMA,
  }) + (todas.length ? `
    <div class="ox-scroll ox-grow">
      ${fijos.length ? `
        <div class="ox-card ap-cardchart" id="esq-fijos">
          <div class="ox-card__head">
            <span class="ox-subtitle">Todos los días</span>
            <span class="ox-meta">${esc(plural(fijos.reduce((n, x) => n + x.dia.tomasDia, 0), 'toma'))} por día en total · ${esc(`${fijos.filter((x) => x.dia.completo).length} de ${fijos.length}`)} completos hoy</span>
          </div>
          <div class="ox-card__body" style="padding-left:0;padding-right:0;padding-bottom:6px">${tablaFijos(fijos)}</div>
        </div>` : ''}
      ${demanda.length ? `
        <div class="ox-card ap-cardchart" id="esq-demanda">
          <div class="ox-card__head">
            <span class="ox-subtitle">A demanda</span>
            <span class="ox-meta">cuando hace falta, sin un número fijo por día</span>
          </div>
          <div class="ox-card__body" style="padding-left:0;padding-right:0;padding-bottom:6px">${tablaDemanda(demanda)}</div>
        </div>` : ''}
      <div class="ap-esqt__pie ox-meta">Click en una fila para editarla. Hoy cuenta también lo tomado dentro de combinaciones.</div>
      <div style="height:24px"></div>
    </div>`
    : empty({
      icon: 'esquema',
      title: 'Todavía no hay nada en el esquema',
      text: 'Sumá lo que tomás de base —cuánto por toma, cuántas veces por día y cuándo— y queda todo junto acá, para verlo y editarlo cuando quieras.',
      actions: `<button class="ox-btn ox-btn--secondary ox-flashable" data-action="agregar-esquema">${Icons.svg('plus')} Agregar el primero</button>`,
    })));
}

const tdNombre = (s) => `<td><span class="ap-esqt__nombre">${esc(s.nombre)}</span></td>`;

const acciones = (s) => `<td class="ox-td--tight"><div class="ox-rowactions">
    <button class="ox-iconbtn ox-iconbtn--sm" data-rapida="${esc(s.id)}" data-tip="Registrar toma">${Icons.svg('gota')}</button>
    <button class="ox-iconbtn ox-iconbtn--sm" data-menu="esquema" data-menu-arg="${esc(s.id)}" data-tip="Más">${Icons.svg('more')}</button>
  </div></td>`;

function tablaFijos(lista) {
  const fila = ({ s, dia }) => {
    const diaria = dosisDiariaEsquema(s);
    const pips = Array.from({ length: dia.tomasDia }, (_, i) => `<span class="ap-pip${i < dia.hechas ? ' is-on' : ''}"></span>`).join('');
    return `<tr class="ox-tr ap-esqt__fila${dia.completo ? ' is-completo' : ''}" role="button" tabindex="0" data-esq="${esc(s.id)}">
      ${tdNombre(s)}
      <td class="ox-td--num">${celda(porToma(s))}</td>
      <td class="ox-td--num">${esc(dia.tomasDia === 1 ? '1 vez' : `${dia.tomasDia} veces`)}</td>
      <td class="ox-td--num"><b>${celda(diaria ? fmtDosis(diaria, s.unidad) : '')}</b></td>
      <td>${celda(dia.cuando)}</td>
      <td class="ox-td--num">${celda(rango(dia, s.unidad))}</td>
      <td><span class="ap-esqt__hoy"><span class="ap-pips">${pips}</span><span class="ap-esq__estado">${esc(`${dia.hechas} de ${dia.tomasDia}`)}</span></span></td>
      ${acciones(s)}
    </tr>`;
  };
  return `<table class="ox-table ap-esqt">
    <thead><tr>
      <th>Fármaco</th><th class="ox-td--num">Por toma</th><th class="ox-td--num">Veces por día</th><th class="ox-td--num">Total diario</th>
      <th>Cuándo</th><th class="ox-td--num">Rango</th><th>Hoy</th><th></th>
    </tr></thead>
    <tbody>${lista.map(fila).join('')}</tbody>
  </table>`;
}

function tablaDemanda(lista) {
  const fila = ({ s, dia }) => `<tr class="ox-tr ap-esqt__fila" role="button" tabindex="0" data-esq="${esc(s.id)}">
      ${tdNombre(s)}
      <td class="ox-td--num">${celda(porToma(s))}</td>
      <td>${celda(dia.cuando)}</td>
      <td class="ox-td--num">${celda(rango(dia, s.unidad))}</td>
      <td><span class="ap-esq__estado">${esc(dia.hechas ? `${plural(dia.hechas, 'toma')} · ${fmtDosis(dia.total, dia.unidad)}` : 'ninguna hoy')}</span></td>
      ${acciones(s)}
    </tr>`;
  return `<table class="ox-table ap-esqt">
    <thead><tr>
      <th>Fármaco</th><th class="ox-td--num">Por toma</th><th>Cuándo</th><th class="ox-td--num">Rango</th><th>Hoy</th><th></th>
    </tr></thead>
    <tbody>${lista.map(fila).join('')}</tbody>
  </table>`;
}

/**
 * El esquema en texto plano, para el portapapeles:
 *   Esquema de medicación · jueves 23 de octubre
 *
 *   Todos los días
 *   - Zolpidem 10 mg, 1 vez por día (10 mg por día) · a la noche
 *
 *   A demanda
 *   - Modafinilo 200 mg por toma · rango 200–400 mg
 */
export function textoDelEsquema(ahora = Date.now()) {
  const todas = filas(ahora);
  const linea = ({ s, dia }) => {
    const partes = [];
    const pt = porToma(s);
    if (dia.modo === 'fijo') {
      const diaria = dosisDiariaEsquema(s);
      const veces = dia.tomasDia === 1 ? '1 vez por día' : `${dia.tomasDia} veces por día`;
      partes.push(`${s.nombre}${pt ? ` ${pt}` : ''}, ${veces}${diaria && dia.tomasDia > 1 ? ` (${fmtDosis(diaria, s.unidad)} por día)` : ''}`);
    } else {
      partes.push(`${s.nombre}${pt ? ` ${pt} por toma` : ''}`);
    }
    const r = rango(dia, s.unidad);
    if (r) partes.push(`rango ${r}`);
    if (dia.cuando) partes.push(dia.cuando);
    return `- ${partes.join(' · ')}`;
  };
  const bloque = (titulo, lista) => (lista.length ? `${titulo}\n${lista.map(linea).join('\n')}` : '');
  return [
    `Esquema de medicación · ${fmtDiaLargo(ahora)}`,
    bloque('Todos los días', todas.filter((x) => x.dia.modo === 'fijo')),
    bloque('A demanda', todas.filter((x) => x.dia.modo === 'demanda')),
  ].filter(Boolean).join('\n\n');
}

/** Copia el esquema. El aviso no repite el texto entero: en un toast no entra. */
export async function copiarEsquema() {
  const n = delEsquema().length;
  const ok = await attempt(async () => { await navigator.clipboard.writeText(textoDelEsquema()); return true; }, { errorTitle: 'No se pudo copiar' });
  if (ok) Toast.show({ title: 'Esquema copiado', text: `${plural(n, 'fármaco')}, listo para pegar.`, icon: 'copy' });
}
