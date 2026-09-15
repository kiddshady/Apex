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
import { selectHTML } from '../dialogos.js';
import { Menu } from '../overlays.js';
import { grafLinea, grafCalendario, grafSemanaHora } from '../graficos.js';
import { kpi, segmentedHTML } from './comunes.js';

const METRICAS = [{ id: 'total', label: 'Dosis total' }, { id: 'tomas', label: 'Tomas' }];
const MAPAS = [{ id: 'calendario', label: 'Calendario' }, { id: 'semana', label: 'Semana × hora' }];
const MAX_SUSTANCIAS = 3;

function seleccionGuardada(valor) {
  const ids = Array.isArray(valor) ? valor : (valor ? [valor] : []);
  return [...new Set(ids)].filter((id) => sustancia(id)).slice(0, MAX_SUSTANCIAS);
}

function etiquetaSeleccion(lista) {
  if (!lista.length) return 'Todas las sustancias';
  if (lista.length === 1) return lista[0].nombre;
  return lista.map((s) => s.nombre).join(' + ');
}

export function vistaGraficos() {
  const a = S.ajustes;
  const sustIds = seleccionGuardada(a.sustanciaGraficos);
  const seleccion = sustIds.map((id) => sustancia(id)).filter(Boolean);
  const unidades = new Set(seleccion.map((x) => x.unidad).filter(Boolean));
  const unidadComun = seleccion.length > 0 && unidades.size === 1;
  /* Con todas las sustancias juntas no hay una unidad común: sumar mg de una
     cosa con ml de otra no significa nada, así que la métrica es «tomas».
     Una selección múltiple sí puede usar dosis cuando todas comparten unidad. */
  const metrica = unidadComun ? (a.metricaGraficos || 'total') : 'tomas';
  const unidad = unidadComun && metrica === 'total' ? seleccion[0].unidad : '';
  const r = rango(a.rangoGraficos || '90d', S.dosis);
  const base = S.dosis.filter((d) => !sustIds.length || sustIds.includes(d.sustanciaId));
  const serie = serieDiaria(base, { ...r, metrica });
  const series = seleccion.length > 1 ? seleccion.map((item) => ({
    id: item.id,
    label: item.nombre,
    puntos: serieDiaria(S.dosis.filter((d) => d.sustanciaId === item.id), { ...r, metrica })
      .map((p) => ({ x: p.dia, y: p.valor, extra: p.tomas ? plural(p.tomas, 'toma') : '' })),
  })) : null;
  const cal = calendario(serie);
  const sh = semanaHora(base, r);
  const enR = base.filter((d) => enRango(d, r));
  const diasCon = serie.filter((p) => p.tomas > 0).length;
  const total = enR.reduce((n, d) => n + (Number(d.cantidad) || 0), 0);
  const rangoLabel = RANGOS.find((x) => x.id === r.id)?.label.toLowerCase() || '';

  setContexto('');
  paint(head({
    title: 'Gráficos',
    sub: seleccion.length ? `${etiquetaSeleccion(seleccion)} · ${rangoLabel}` : `todas las sustancias · ${rangoLabel}`,
  }) + `
    <div class="ox-scroll ox-grow">
      <div class="ap-filtros">
        ${segmentedHTML('f-rango', RANGOS, r.id)}
        ${selectHTML({ id: 'f-sust', texto: etiquetaSeleccion(seleccion), placeholder: 'Todas las sustancias', extra: `aria-label="Sustancias para comparar, máximo ${MAX_SUSTANCIAS}"` })}
        ${unidadComun ? segmentedHTML('f-metrica', METRICAS, metrica) : `<span class="ox-meta" data-tip="${seleccion.length > 1 ? 'Las unidades son distintas; se cuentan tomas' : 'Con todas las sustancias no hay una unidad común: se cuentan tomas'}">${Icons.svg('info', 'ox-icon--sm')}</span>`}
      </div>

      <div class="ap-kpis">
        ${kpi(String(enR.length), 'Tomas', { tip: `Tomas en ${rangoLabel}` })}
        ${unidadComun ? kpi(enR.length ? fmtQty(total) : '—', 'Total', { unidad: enR.length ? seleccion[0].unidad : '' }) : kpi(String(new Set(enR.map((d) => d.sustanciaId)).size), 'Sustancias', { tip: 'Sustancias distintas con tomas en el rango' })}
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
            <div class="ox-scroll ap-tabla ox-scroll--line-top">${tablaSerie(serie, unidad, series, metrica)}</div>
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
  const disponibles = S.sustancias.filter((x) => !x.archivada || conTomas.has(x.id));
  const selector = document.getElementById('f-sust');
  selector.addEventListener('click', () => {
    const alMaximo = sustIds.length >= MAX_SUSTANCIAS;
    Menu.show(selector, [
      { label: 'Todas las sustancias', icon: 'layers', selected: !sustIds.length,
        onSelect: () => cambiar({ sustanciaGraficos: null }) },
      { sep: true },
      { groupLabel: `Comparar hasta ${MAX_SUSTANCIAS}` },
      ...disponibles.map((x) => {
        const marcada = sustIds.includes(x.id);
        return {
          label: x.archivada ? `${x.nombre} (archivada)` : x.nombre,
          icon: 'pill', selected: marcada, disabled: alMaximo && !marcada,
          key: alMaximo && !marcada ? 'Máx. 3' : '',
          onSelect: () => {
            const next = marcada ? sustIds.filter((id) => id !== x.id) : [...sustIds, x.id];
            cambiar({ sustanciaGraficos: next.length ? next.slice(0, MAX_SUSTANCIAS) : null });
          },
        };
      }),
    ]);
  });

  Router.onLeave(grafLinea(document.getElementById('linea'), {
    puntos: serie.map((p) => ({ x: p.dia, y: p.valor, extra: p.tomas ? plural(p.tomas, 'toma') : '' })),
    series,
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

function tablaSerie(serie, unidad, series = null, metrica = 'total') {
  if (series?.length > 1) {
    const filas = serie.map((p, i) => ({
      dia: p.dia,
      valores: series.map((s) => s.puntos[i]?.y || 0),
    })).filter((fila) => fila.valores.some((v) => v > 0)).reverse();
    if (!filas.length) return `<div class="ox-meta" style="padding:8px 12px">Sin tomas en este rango.</div>`;
    const fmt = (v) => metrica === 'tomas' ? String(v) : fmtDosis(v, unidad);
    return `<table class="ox-table ap-tabla--series">
      <thead><tr><th>Día</th>${series.map((s, i) => `<th class="ox-td--num"><span class="ap-serie-cab" data-serie="${i}"><span class="ap-serie-muestra"></span>${esc(s.label)}</span></th>`).join('')}</tr></thead>
      <tbody>${filas.map((fila) => `<tr class="ox-tr">
        <td>${esc(fmtDiaSemana(fila.dia))}</td>
        ${fila.valores.map((v) => `<td class="ox-td--num">${v ? esc(fmt(v)) : '—'}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>`;
  }
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
