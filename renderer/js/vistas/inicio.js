/* Hoy — lo primero que se ve al entrar: las tomas del día, lo que está en
   curso, y los accesos rápidos para registrar la dosis de siempre. */

import { Icons } from '../icons.js';
import { paint, head, esc, empty } from '../ui.js';
import { countTo } from '../motion.js';
import { fmtDiaLargo, fmtDosis, plural } from '../format.js';
import { inicioDia, sumarDias, ordenarHitos, faseInfo, HORA } from '../pk.js';
import { S, activas, enCurso, setContexto } from '../tienda.js';
import { filaDosis, kpi, BTN_REGISTRAR } from './comunes.js';

export function vistaInicio() {
  const ahora = Date.now();
  const hoy = inicioDia(ahora);
  const deHoy = S.dosis.filter((d) => d.at >= hoy);
  const semana = S.dosis.filter((d) => d.at >= sumarDias(hoy, -6));
  const curso = enCurso(ahora);
  const rapidas = activas().filter((s) => Number(s.dosisHabitual) > 0);
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
        ${kpi('0', 'Sustancias', { id: 'k-sust', tip: 'Sustancias activas' })}
      </div>

      ${rapidas.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Registrar rápido</span>
            <span class="ox-meta">la dosis habitual, ahora — se confirma antes de guardar</span></div>
          <div class="ap-rapidas">${rapidas.map((s) => `
            <button class="ox-btn ox-btn--secondary ox-flashable" data-rapida="${esc(s.id)}">
              ${Icons.svg('gota')} ${esc(s.nombre)} <b>${esc(fmtDosis(s.dosisHabitual, s.unidad))}</b></button>`).join('')}
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
  countTo(document.getElementById('k-sust'), activas().length);
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
