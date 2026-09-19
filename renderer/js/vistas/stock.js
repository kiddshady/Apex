/* Stock — lo que hay en casa: los ingresos (compras, entregas) menos lo que
   se fue tomando desde entonces. Un stock por droga y dosis por unidad; la
   marca y el envase no lo parten. Abajo, la calculadora de hasta cuándo
   alcanza, siempre contada desde hoy. */

import { Icons } from '../icons.js';
import { paint, head, esc, empty } from '../ui.js';
import { fmtDosis, fmtQty, fmtDiaSemana, fmtDiaLargo, fmtHM, plural } from '../format.js';
import { dosisDiariaEsquema, ritmoReal, alcanza } from '../pk.js';
import { S, sustancia, nombreSustancia, stocksActuales, setContexto } from '../tienda.js';
import { selectHTML, bindSelect, stepperHTML } from '../dialogos.js';
import { bindStepper } from '../motion.js';
import { kpi } from './comunes.js';

export const BTN_INGRESO = `<button class="ox-btn ox-btn--primary ox-flashable" data-action="registrar-ingreso">
  ${Icons.svg('plus')} Registrar ingreso</button>`;

/* De la sesión, no de los ajustes: qué stock mira la calculadora y la
   dosificación que se tipeó para cada uno. */
let elegido = null;
const dosificacion = new Map();

/** Unidades con medio de resolución: 86,5 sí, 86,4999 no. */
const unidades = (n) => fmtQty(Math.round(n * 100) / 100);

/**
 * La dosificación diaria que la calculadora propone para un stock: la que ya
 * se tipeó, la del esquema fijo, la dosis habitual, o una unidad.
 */
function dosisPropuesta(p) {
  if (dosificacion.has(p.clave)) return dosificacion.get(p.clave);
  const s = sustancia(p.sustanciaId);
  return dosisDiariaEsquema(s) ?? (Number(s?.dosisHabitual) > 0 ? Number(s.dosisHabitual) : p.carga);
}

/** El ritmo con el que la tarjeta estima: el del esquema fijo, o el real de 30 días. */
function ritmoTarjeta(p, ahora) {
  const s = sustancia(p.sustanciaId);
  const esq = dosisDiariaEsquema(s);
  if (esq && s.unidad === p.unidad) return { porDia: esq / p.carga, fuente: 'al ritmo del esquema' };
  const real = ritmoReal(p, ahora);
  return real ? { porDia: real, fuente: 'al ritmo de los últimos 30 días' } : null;
}

export function vistaStock() {
  const ahora = Date.now();
  const lista = stocksActuales();
  if (!lista.some((p) => p.clave === elegido)) elegido = lista[0]?.clave || null;
  const conQueda = lista.filter((p) => p.restantes > 0).length;

  setContexto('');
  paint(head({
    title: 'Stock',
    sub: lista.length
      ? `${plural(lista.length, 'stock')} · ${plural(S.ingresos.length, 'ingreso')}`
      : 'Lo que tenés en casa, descontando las tomas',
    actions: BTN_INGRESO,
  }) + (lista.length ? `
    <div class="ox-scroll ox-grow">
      <div class="ap-kpis">
        ${kpi(String(conQueda), 'Con unidades', { tip: 'Stocks a los que les queda algo' })}
        ${kpi(String(lista.length - conQueda), 'Agotados')}
        ${kpi(String(S.ingresos.length), 'Ingresos')}
      </div>

      <div class="ap-stocks" id="stocks">${lista.map((p) => tarjeta(p, ahora)).join('')}</div>

      <div class="ox-card ap-cardchart">
        <div class="ox-card__head">
          <span class="ox-subtitle">Hasta cuándo alcanza</span>
          <span class="ox-meta">contado desde hoy, con lo que queda ahora</span>
        </div>
        <div class="ox-card__body">
          <div class="ap-calc">
            <div class="ox-field ox-grow" style="min-width:220px">
              <label class="ox-field__label">Stock</label>
              ${selectHTML({ id: 'c-stock' })}
            </div>
            <div class="ox-field" style="width:220px">
              <label class="ox-field__label" for="c-dosis">Dosificación por día</label>
              <div class="ox-row" style="gap:10px">
                ${stepperHTML({ id: 'c-dosis', valor: '', min: 0, step: 1, extra: 'style="flex:1 1 auto"' })}
                <span class="ox-label ox-mono" id="c-unidad" style="min-width:32px"></span>
              </div>
            </div>
          </div>
          <div class="ap-calc__res" id="c-res"></div>
        </div>
      </div>

      <div class="ox-card ap-cardchart">
        <div class="ox-card__head">
          <span class="ox-subtitle">Ingresos</span>
          <span class="ox-meta">${esc(plural(S.ingresos.length, 'ingreso'))}, del más reciente al más viejo</span>
        </div>
        <div class="ox-card__body" style="padding-left:0;padding-right:0;padding-bottom:6px">${tablaIngresos()}</div>
      </div>
      <div style="height:24px"></div>
    </div>`
    : empty({
      icon: 'stock',
      title: 'Todavía no hay ingresos',
      text: 'Registrá lo que compraste o te entregaron —droga, dosis por unidad, unidades y envases— y a partir de ahí cada toma lo va descontando.',
      actions: `<button class="ox-btn ox-btn--secondary ox-flashable" data-action="registrar-ingreso">${Icons.svg('plus')} Registrar el primero</button>`,
    })));
  if (!lista.length) return;

  /* La calculadora se recalcula en el lugar, sin repintar la vista: tipear la
     dosificación no puede hacer saltar el scroll. */
  const res = document.getElementById('c-res');
  const campo = document.getElementById('c-dosis');
  const unidadEl = document.getElementById('c-unidad');
  const actual = () => lista.find((p) => p.clave === elegido);
  const calcular = () => {
    const p = actual();
    const dosis = parseFloat(String(campo.value).replace(',', '.'));
    if (Number.isFinite(dosis)) dosificacion.set(p.clave, dosis);
    res.innerHTML = resultado(p, dosis, ahora);
  };
  const cargar = () => {
    const p = actual();
    campo.value = dosisPropuesta(p);
    campo.step = String(p.carga >= 1 ? p.carga / 2 : p.carga);
    unidadEl.textContent = p.unidad || '';
    document.querySelectorAll('#stocks .ap-stock').forEach((b) => b.classList.toggle('is-active', b.dataset.stock === elegido));
    calcular();
  };
  const sel = bindSelect(document.getElementById('c-stock'), lista.map((p) => ({
    value: p.clave, label: `${nombreSustancia(p.sustanciaId)} · ${fmtDosis(p.carga, p.unidad)}`, icon: 'stock',
  })), { valor: elegido, onChange: (v) => { elegido = v; cargar(); } });
  bindStepper(campo.closest('.ox-stepper'), calcular);
  campo.addEventListener('input', calcular);

  document.getElementById('stocks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stock]');
    if (!b || b.dataset.stock === elegido) return;
    elegido = b.dataset.stock;
    sel.set(elegido);
    cargar();
  });
  cargar();
}

function tarjeta(p, ahora) {
  const s = sustancia(p.sustanciaId);
  const queda = Math.max(0, p.restantes);
  const pct = p.ingresado > 0 ? Math.min(100, (queda / p.ingresado) * 100) : 0;
  const ritmo = ritmoTarjeta(p, ahora);
  const hasta = ritmo ? alcanza(p.restantes, ritmo.porDia, ahora) : null;
  const pres = [...new Set(p.ingresos.map((i) => i.presentacion).filter(Boolean))].join(', ').toLowerCase() || 'unidades';
  const marcas = [...new Set(p.ingresos.map((i) => i.marca).filter(Boolean))].join(', ');
  const nota = p.restantes < 0
    ? `${unidades(-p.restantes)} tomadas de más de lo ingresado`
    : hasta
      ? (hasta.dias ? `alcanza hasta el ${fmtDiaSemana(hasta.hasta)} ${ritmo.fuente}` : `se termina hoy ${ritmo.fuente}`)
      : 'sin ritmo todavía para estimar';
  return `
    <button type="button" class="ap-stock${p.clave === elegido ? ' is-active' : ''}${queda <= 0 ? ' is-agotado' : ''}" data-stock="${esc(p.clave)}">
      <span class="ap-stock__head">
        <span class="ap-stock__nombre ox-truncate">${esc(s?.nombre || 'Sustancia eliminada')}</span>
        <span class="ap-stock__carga ox-mono">${esc(fmtDosis(p.carga, p.unidad))}</span>
      </span>
      <span class="ap-stock__cifra"><b>${esc(unidades(queda))}</b> ${esc(pres)}</span>
      <span class="ox-meter" style="--ox-pct:${pct.toFixed(1)}%"><span class="ox-meter__fill"></span></span>
      <span class="ap-stock__meta">de ${esc(unidades(p.ingresado))} ingresadas desde el ${esc(fmtDiaSemana(p.desde))}${marcas ? ` · ${esc(marcas)}` : ''}</span>
      <span class="ap-stock__meta">${esc(nota)}</span>
    </button>`;
}

/** «1 unidad por día · alcanza para 90 días: hasta el …», y los otros dos ritmos. */
function resultado(p, dosis, ahora) {
  const queda = Math.max(0, p.restantes);
  const lineas = [];
  if (!(dosis > 0)) {
    lineas.push(`<div class="ap-calc__linea">Poné cuánto tomás por día para ver hasta cuándo te alcanzan las <b>${esc(unidades(queda))}</b> que quedan.</div>`);
  } else {
    const porDia = dosis / p.carga;
    const a = alcanza(p.restantes, porDia, ahora);
    lineas.push(`<div class="ap-calc__linea ap-calc__linea--main">
      <b>${esc(unidades(porDia))} ${porDia === 1 ? 'unidad' : 'unidades'} por día</b>
      ${a.dias
        ? `· alcanza para <b>${esc(plural(a.dias, 'día'))}</b> desde hoy: hasta el <b>${esc(fmtDiaLargo(a.hasta))}</b>`
        : '· no alcanza ni para hoy'}</div>`);
  }
  const s = sustancia(p.sustanciaId);
  const esq = dosisDiariaEsquema(s);
  if (esq && s.unidad === p.unidad && esq !== dosis) {
    const a = alcanza(p.restantes, esq / p.carga, ahora);
    lineas.push(`<div class="ap-calc__linea">Con tu esquema (${esc(fmtDosis(esq, p.unidad))} por día): ${a.dias ? `hasta el ${esc(fmtDiaLargo(a.hasta))}` : 'no alcanza ni para hoy'}.</div>`);
  }
  const real = ritmoReal(p, ahora);
  if (real) {
    const a = alcanza(p.restantes, real, ahora);
    lineas.push(`<div class="ap-calc__linea">Al ritmo real de los últimos 30 días (${esc(unidades(real))} por día): ${a.dias ? `hasta el ${esc(fmtDiaLargo(a.hasta))}` : 'no alcanza ni para hoy'}.</div>`);
  }
  const ultimas = p.tomas.slice(-3).reverse();
  if (ultimas.length) {
    lineas.push(`<div class="ap-calc__linea ap-calc__linea--meta">Últimas que descontaron: ${ultimas.map((t) =>
      `${esc(fmtDiaSemana(t.at))} ${esc(fmtHM(t.at))} (${esc(unidades(t.unidades))}${t.combinacion ? ` en ${esc(nombreSustancia(t.combinacion))}` : ''})`).join(' · ')}</div>`);
  }
  return lineas.join('');
}

function tablaIngresos() {
  const fila = (i) => `<tr class="ox-tr">
      <td>${esc(fmtDiaSemana(i.at))}</td>
      <td>${esc(i.marca || '—')}</td>
      <td>${esc(nombreSustancia(i.sustanciaId))}</td>
      <td>${esc(i.presentacion || '—')}</td>
      <td class="ox-td--num">${esc(fmtDosis(i.carga, i.unidad))}</td>
      <td class="ox-td--num">${esc(fmtQty(i.unidadesPorEnvase))}</td>
      <td class="ox-td--num">${esc(fmtQty(i.envases))}</td>
      <td class="ox-td--num"><b>${esc(fmtQty(i.unidadesPorEnvase * i.envases))}</b></td>
      <td class="ox-td--tight"><div class="ox-rowactions">
        <button class="ox-iconbtn ox-iconbtn--sm" data-menu="ingreso" data-menu-arg="${esc(i.id)}" data-tip="Más">${Icons.svg('more')}</button></div></td>
    </tr>`;
  return `<table class="ox-table">
    <thead><tr>
      <th>Fecha</th><th>Marca</th><th>Droga</th><th>Presentación</th><th class="ox-td--num">Dosis</th>
      <th class="ox-td--num">Unidades</th><th class="ox-td--num">Envases</th><th class="ox-td--num">Total</th><th></th>
    </tr></thead>
    <tbody>${S.ingresos.map(fila).join('')}</tbody>
  </table>`;
}
