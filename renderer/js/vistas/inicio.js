/* Hoy — lo primero que se ve al entrar: las tomas del día, lo que está en
   curso, y los accesos rápidos para registrar la dosis de siempre. */

import { Icons } from '../icons.js';
import { paint, head, esc, empty } from '../ui.js';
import { countTo } from '../motion.js';
import { fmtDiaLargo, fmtDosis, fmtHM, plural } from '../format.js';
import { inicioDia, sumarDias, ordenarHitos, faseInfo, esquemaDelDia, normalizarEsquema, esCombinacion, HORA } from '../pk.js';
import { S, activas, enCurso, setContexto, habitualSustancia, textoEsquema, nombreSustancia } from '../tienda.js';
import { filaDosis, kpi, BTN_REGISTRAR } from './comunes.js';

export function vistaInicio() {
  const ahora = Date.now();
  const hoy = inicioDia(ahora);
  const deHoy = S.dosis.filter((d) => d.at >= hoy);
  const semana = S.dosis.filter((d) => d.at >= sumarDias(hoy, -6));
  const curso = enCurso(ahora);
  /* El esquema: primero los fijos, después los a demanda. Lo que tiene
     esquema ya tiene su botón ahí, así que no se repite en los rápidos. */
  const esquema = activas()
    .map((s) => ({ s, dia: esquemaDelDia(s, S.dosis, ahora) }))
    .filter((x) => x.dia)
    .sort((a, b) => (a.dia.modo === b.dia.modo ? 0 : a.dia.modo === 'fijo' ? -1 : 1));
  const fijos = esquema.filter((x) => x.dia.modo === 'fijo');
  const rapidas = activas().filter((s) => !normalizarEsquema(s.esquema) && habitualSustancia(s));
  const sub = fmtDiaLargo(ahora);

  setContexto('');
  paint(head({
    title: 'Hoy',
    sub: sub.charAt(0).toUpperCase() + sub.slice(1),
    actions: BTN_REGISTRAR,
  }) + `
    <div class="ox-scroll ox-grow">
      <div class="ap-kpis">
        ${kpi('0', 'Tomas hoy', { id: 'k-hoy' })}
        ${kpi('0', 'Últimos 7 días', { id: 'k-semana', tip: 'Tomas en los últimos siete días' })}
        ${kpi('0', 'En curso', { id: 'k-curso', tip: 'Episodios sin hito de fin en las últimas 24 h' })}
        ${fijos.length
    ? kpi(`${fijos.filter((x) => x.dia.completo).length}/${fijos.length}`, 'Esquema fijo', { tip: 'Sustancias del esquema fijo con todas sus tomas de hoy' })
    : kpi('0', 'Sustancias', { id: 'k-sust', tip: 'Sustancias activas' })}
      </div>

      ${esquema.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Esquema de hoy</span>
            <span class="ox-meta">cuenta también lo tomado dentro de combinaciones</span></div>
          <div class="ox-list">${esquema.map(filaEsquema).join('')}</div>
        </div>` : ''}

      ${rapidas.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Registrar rápido</span>
            <span class="ox-meta">la dosis habitual, ahora — se confirma antes de guardar</span></div>
          <div class="ap-rapidas">${rapidas.map((s) => `
            <button class="ox-btn ox-btn--secondary ox-flashable" data-rapida="${esc(s.id)}">
              ${Icons.svg(esCombinacion(s) ? 'combinacion' : 'gota')} ${esc(s.nombre)} <b>${esc(habitualSustancia(s))}</b></button>`).join('')}
          </div>
        </div>` : ''}

      ${curso.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">En curso</span>
            <span class="ox-meta">${esc(plural(curso.length, 'episodio'))} sin cerrar</span></div>
          <div class="ox-list">${curso.map(filaCurso).join('')}</div>
        </div>` : ''}

      <div class="ox-section">
        <div class="ox-section__head"><span class="ox-section__title">Hoy</span>
          ${deHoy.length ? `<span class="ox-meta">${esc(plural(deHoy.length, 'toma'))}</span>` : ''}
          <span class="ox-spacer"></span>
          <button class="ox-btn ox-btn--ghost ox-btn--sm" data-goto="registro">Ver el registro ${Icons.svg('chevronRight')}</button>
        </div>
        ${deHoy.length
    ? `<div class="ox-list">${deHoy.map((d) => filaDosis(d)).join('')}</div>`
    : S.dosis.length
      ? `<div class="ox-empty" style="padding:28px 16px">${Icons.svg('gota')}
          <div class="ox-empty__title">Nada todavía hoy</div>
          <div class="ox-empty__text">La última toma fue ${esc(descripcionUltima())}.</div></div>`
      : empty({
        icon: 'gota',
        title: 'Todavía no registraste ninguna toma',
        text: rapidas.length || activas().length
          ? 'Registrá la primera con el botón de arriba: qué, cuánto y cuándo. Después le sumás hitos.'
          : 'Empezá creando una sustancia —qué tomás y en qué unidad— y después registrá la primera toma.',
        actions: activas().length
          ? '<button class="ox-btn ox-btn--secondary ox-flashable" data-action="registrar">' + Icons.svg('plus') + ' Registrar la primera</button>'
          : '<button class="ox-btn ox-btn--secondary ox-flashable" data-action="nueva-sustancia">' + Icons.svg('pill') + ' Crear una sustancia</button>',
      })}
      </div>

      ${!deHoy.length && S.dosis.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Recientes</span></div>
          <div class="ox-list">${S.dosis.slice(0, 6).map((d) => filaDosis(d, { conFecha: true })).join('')}</div>
        </div>` : ''}
      <div style="height:24px"></div>
    </div>`);

  countTo(document.getElementById('k-hoy'), deHoy.length);
  countTo(document.getElementById('k-semana'), semana.length);
  countTo(document.getElementById('k-curso'), curso.length);
  const kSust = document.getElementById('k-sust');
  if (kSust) countTo(kSust, activas().length);
}

/**
 * Una sustancia del esquema: los puntos de las tomas previstas (llenos los
 * hechos), qué dice su esquema, y cómo va hoy. Tomar de más no se marca
 * distinto: el esquema describe, no vigila.
 */
function filaEsquema({ s, dia }) {
  const fijo = dia.modo === 'fijo';
  const pips = fijo
    ? Array.from({ length: dia.tomasDia }, (_, i) => `<span class="ap-pip${i < dia.hechas ? ' is-on' : ''}"></span>`).join('')
    : Icons.svg('esquema');
  const ultima = dia.tomas[dia.tomas.length - 1];
  const estado = fijo
    ? `${dia.hechas} de ${dia.tomasDia}`
    : dia.hechas ? fmtDosis(dia.total, dia.unidad) : 'ninguna hoy';
  const detalle = [
    textoEsquema(s),
    ultima ? `última ${fmtHM(ultima.at)}${ultima.combinacion ? ` en ${nombreSustancia(ultima.combinacion)}` : ''}` : null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="ox-listitem ap-esq${dia.completo ? ' is-completo' : ''}" role="button" tabindex="0" data-sust="${esc(s.id)}">
      <span class="ap-pips" data-tip="${esc(fijo ? `${dia.hechas} de ${plural(dia.tomasDia, 'toma')} hoy` : 'A demanda')}">${pips}</span>
      <div class="ox-listitem__main">
        <span class="ox-listitem__title">${esc(s.nombre)} <span class="ap-toma__cant">${esc(habitualSustancia(s))}</span></span>
        <span class="ox-listitem__sub">${esc(detalle)}</span>
      </div>
      <span class="ap-esq__estado">${esc(estado)}</span>
      <div class="ox-rowactions">
        <button class="ox-iconbtn ox-iconbtn--sm" data-rapida="${esc(s.id)}" data-tip="Registrar toma">${Icons.svg('gota')}</button>
      </div>
    </div>`;
}

/** Una fila de episodio en curso: cuánto pasó y en qué fase va. */
function filaCurso(d) {
  const hitos = ordenarHitos(d.hitos || []);
  const ultimo = hitos[hitos.length - 1];
  const horas = (Date.now() - d.at) / HORA;
  const tiempo = horas < 1 ? `${Math.round(horas * 60)} min` : `${Math.round(horas * 10) / 10} h`.replace('.', ',');
  return filaDosis(d).replace(
    /<span class="ox-listitem__sub">[^<]*<\/span>/,
    `<span class="ox-listitem__sub">${esc(`hace ${tiempo}`)}${ultimo ? ` · ${esc(faseInfo(ultimo.fase).label)}${ultimo.intensidad != null ? ` ${esc(String(ultimo.intensidad).replace('.', ','))}/10` : ''}` : ' · sin hitos todavía'}</span>`,
  );
}

function descripcionUltima() {
  const d = S.dosis[0];
  if (!d) return '';
  const dias = Math.round((inicioDia(Date.now()) - inicioDia(d.at)) / 86_400_000);
  return dias === 1 ? 'ayer' : `hace ${plural(dias, 'día')}`;
}
