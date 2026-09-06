/* Gráficos — la línea de dosis por día y el mapa de calor. Una sola fila de
   filtros arriba, que manda sobre todo lo de abajo: los números siempre
   coinciden entre sí. */

import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc } from '../ui.js';
import { bindSwitcher, toggleReveal } from '../motion.js';
import { fmtDosis, fmtQty, fmtDiaSemana, plural } from '../format.js';
import { RANGOS, rango, serieDiaria, calendario, semanaHora, enRango } from '../pk.js';
import { S, sustancia, guardarAjustes, setContexto } from '../tienda.js';
import { selectHTML, bindSelect } from '../dialogos.js';
import { grafLinea, grafCalendario, grafSemanaHora } from '../graficos.js';
import { kpi, segmentedHTML } from './comunes.js';

const METRICAS = [{ id: 'total', label: 'Dosis total' }, { id: 'tomas', label: 'Tomas' }];
const MAPAS = [{ id: 'calendario', label: 'Calendario' }, { id: 'semana', label: 'Semana × hora' }];

export function vistaGraficos() {
  const a = S.ajustes;
  const sustId = sustancia(a.sustanciaGraficos) ? a.sustanciaGraficos : null;
  const s = sustancia(sustId);
  /* Con todas las sustancias juntas no hay una unidad común: sumar mg de una
     cosa con ml de otra no significa nada, así que la métrica es «tomas». */
  const metrica = s ? (a.metricaGraficos || 'total') : 'tomas';
  const unidad = s && metrica === 'total' ? s.unidad : '';
  const r = rango(a.rangoGraficos || '90d', S.dosis);
  const base = S.dosis.filter((d) => !sustId || d.sustanciaId === sustId);
  const serie = serieDiaria(base, { ...r, metrica });
  const cal = calendario(serie);
  const sh = semanaHora(base, r);
  const enR = base.filter((d) => enRango(d, r));
  const diasCon = serie.filter((p) => p.tomas > 0).length;
  const total = enR.reduce((n, d) => n + (Number(d.cantidad) || 0), 0);
  const rangoLabel = RANGOS.find((x) => x.id === r.id)?.label.toLowerCase() || '';

  setContexto('');
  paint(head({
    title: 'Gráficos',
    sub: s ? `${s.nombre} · ${rangoLabel}` : `todas las sustancias · ${rangoLabel}`,
  }) + `
    <div class="ox-scroll ox-grow">
      <div class="ap-filtros">
        ${segmentedHTML('f-rango', RANGOS, r.id)}
        ${selectHTML({ id: 'f-sust', placeholder: 'Todas las sustancias' })}
        ${s ? segmentedHTML('f-metrica', METRICAS, metrica) : `<span class="ox-meta" data-tip="Con varias sustancias no hay una unidad común: se cuentan tomas">${Icons.svg('info', 'ox-icon--sm')}</span>`}
      </div>

      <div class="ap-kpis">
        ${kpi(String(enR.length), 'Tomas', { tip: `Tomas en ${rangoLabel}` })}
        ${s ? kpi(enR.length ? fmtQty(total) : '—', 'Total', { unidad: enR.length ? s.unidad : '' }) : kpi(String(new Set(enR.map((d) => d.sustanciaId)).size), 'Sustancias', { tip: 'Sustancias distintas con tomas en el rango' })}
        ${kpi(String(diasCon), 'Días con toma', { tip: `De ${serie.length} días en el rango` })}
        ${kpi(diasCon ? fmtQty(Math.round((enR.length / diasCon) * 10) / 10) : '—', 'Tomas por día con toma')}
      </div>

      <div class="ox-card ap-cardchart">
        <div class="ox-card__head">
          <span class="ox-subtitle">${metrica === 'tomas' ? 'Tomas por día' : 'Dosis por día'}</span>
          <span class="ox-meta">${esc(unidad ? `en ${unidad}` : 'cantidad de tomas')}</span>
          <span class="ox-spacer"></span>
          <button class="ox-btn ox-btn--ghost ox-btn--sm" id="btn-tabla" data-tip="Los mismos datos, en tabla">${Icons.svg('tabla')} Tabla</button>
        </div>
        <div class="ox-card__body">
          <div id="linea"></div>
          <div class="ox-reveal" id="tabla-wrap"><div>
            <div class="ox-scroll ap-tabla ox-scroll--line-top">${tablaSerie(serie, unidad)}</div>
          </div></div>
        </div>
      </div>

      <div class="ox-card ap-cardchart">
        <div class="ox-card__head">
          <span class="ox-subtitle">Mapa de calor</span>
          <span class="ox-meta">${esc(a.mapaModo === 'semana' ? 'cuándo caen las tomas, por día de la semana y hora' : `${metrica === 'tomas' ? 'tomas' : 'dosis'} por día, más oscuro es más`)}</span>
          <span class="ox-spacer"></span>
          ${segmentedHTML('f-mapa', MAPAS, a.mapaModo === 'semana' ? 'semana' : 'calendario')}
        </div>
        <div class="ox-card__body"><div id="mapa"></div></div>
      </div>
      <div style="height:24px"></div>
    </div>`);

  /* Los filtros guardan y remontan la vista: todo lo de abajo se recalcula
     sobre la misma rebanada, así los números nunca se desencuentran. */
  const cambiar = async (patch) => { await guardarAjustes(patch); Router.refresh(); };
  bindSwitcher(document.getElementById('f-rango'), (v) => cambiar({ rangoGraficos: v }));
  const fm = document.getElementById('f-metrica');
  if (fm) bindSwitcher(fm, (v) => cambiar({ metricaGraficos: v }));
  bindSwitcher(document.getElementById('f-mapa'), (v) => cambiar({ mapaModo: v }));

  const conTomas = new Set(S.dosis.map((d) => d.sustanciaId));
  bindSelect(document.getElementById('f-sust'), [
    { value: null, label: 'Todas las sustancias' },
    { sep: true },
    ...S.sustancias.filter((x) => !x.archivada || conTomas.has(x.id)).map((x) => ({ value: x.id, label: x.archivada ? `${x.nombre} (archivada)` : x.nombre, icon: 'pill' })),
  ], { valor: sustId, onChange: (v) => cambiar({ sustanciaGraficos: v }) });

  Router.onLeave(grafLinea(document.getElementById('linea'), {
    puntos: serie.map((p) => ({ x: p.dia, y: p.valor, extra: p.tomas ? plural(p.tomas, 'toma') : '' })),
    unidad,
    enteros: metrica === 'tomas',
  }));

  const mapa = document.getElementById('mapa');
  Router.onLeave(a.mapaModo === 'semana'
    ? grafSemanaHora(mapa, { matriz: sh.matriz, max: sh.max })
    : grafCalendario(mapa, { semanas: cal.semanas, max: cal.max, unidad, metrica }));

  const wrap = document.getElementById('tabla-wrap');
  const btn = document.getElementById('btn-tabla');
  btn.addEventListener('click', () => {
    const abierta = toggleReveal(wrap);
    btn.classList.toggle('is-active', abierta);
  });
}

function tablaSerie(serie, unidad) {
  const conDatos = serie.filter((p) => p.tomas > 0).reverse();
  if (!conDatos.length) return `<div class="ox-meta" style="padding:8px 12px">Sin tomas en este rango.</div>`;
  return `<table class="ox-table">
    <thead><tr><th>Día</th><th class="ox-td--num">Tomas</th>${unidad ? `<th class="ox-td--num">Total</th>` : ''}</tr></thead>
    <tbody>${conDatos.map((p) => `<tr class="ox-tr">
      <td>${esc(fmtDiaSemana(p.dia))}</td>
      <td class="ox-td--num">${p.tomas}</td>
      ${unidad ? `<td class="ox-td--num">${esc(fmtDosis(p.total, unidad))}</td>` : ''}
    </tr>`).join('')}</tbody>
  </table>`;
}
