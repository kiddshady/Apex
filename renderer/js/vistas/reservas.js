/* Reservas — lo que se guarda aparte y no se toca: los remedios de otro, lo
   que se aparta para más adelante. No es stock: las tomas no lo descuentan
   nunca, y el Stock ni lo cuenta. Sale solo de dos maneras, las dos a mano:
   pasándolo al stock, o entregándolo. Abajo, cada movimiento, para que
   deshacer uno sea un click. */

import { Icons } from '../icons.js';
import { paint, head, esc, empty } from '../ui.js';
import { fmtDosis, fmtQty, fmtDiaSemana, plural } from '../format.js';
import { estadoReserva } from '../pk.js';
import { S, sustancia, nombreSustancia, reservasVigentes, setContexto } from '../tienda.js';
import { kpi } from './comunes.js';

export const BTN_RESERVA = `<button class="ox-btn ox-btn--primary ox-flashable" data-action="nueva-reserva">
  ${Icons.svg('plus')} Nueva reserva</button>`;

/** «comprimidos», o «unidades» si no se dijo la presentación. */
const pres = (r) => (r.presentacion || 'unidades').toLowerCase();

export function vistaReservas() {
  const vigentes = reservasVigentes();
  const salidas = S.reservas.flatMap((r) => estadoReserva(r).salidas.map((x) => ({ r, x })));
  const aStock = salidas.filter(({ x }) => x.tipo === 'stock').length;
  const entregas = salidas.length - aStock;

  setContexto('');
  paint(head({
    title: 'Reservas',
    sub: S.reservas.length
      ? `${plural(vigentes.length, 'vigente')} · ${plural(salidas.length, 'salida')}`
      : 'Lo que se guarda aparte y no se toca',
    actions: BTN_RESERVA,
  }) + (S.reservas.length ? `
    <div class="ox-scroll ox-grow">
      <div class="ap-aviso ap-reservas__aviso">${Icons.svg('lock')}<div>
        Nada de acá es stock: <b>ninguna toma lo descuenta</b>. Sale solo de dos maneras, y siempre a mano:
        pasándolo al stock —desde ahí sí se descuenta— o entregándolo.</div></div>

      <div class="ap-kpis">
        ${kpi(String(vigentes.length), 'Vigentes', { tip: 'Reservas a las que les queda algo' })}
        ${kpi(String(aStock), 'Pasadas al stock')}
        ${kpi(String(entregas), 'Entregas')}
      </div>

      ${vigentes.length
        ? `<div class="ap-stocks">${vigentes.map(({ r, e }) => tarjeta(r, e)).join('')}</div>`
        : `<div class="ap-aviso ap-reservas__vacio">${Icons.svg('check')}<div>No queda nada guardado: todo pasó al stock o se entregó.</div></div>`}

      <div class="ox-card ap-cardchart">
        <div class="ox-card__head">
          <span class="ox-subtitle">Movimientos</span>
          <span class="ox-meta">lo que se reservó y lo que salió, del más reciente al más viejo</span>
        </div>
        <div class="ox-card__body" style="padding-left:0;padding-right:0;padding-bottom:6px">${tablaMovimientos(salidas)}</div>
      </div>
      <div style="height:24px"></div>
    </div>`
    : empty({
      icon: 'lock',
      title: 'No hay nada reservado',
      text: 'Lo que guardás para otro —o para más adelante— y no tiene que tocarse. Las tomas no lo descuentan: sale cuando lo pases al stock o lo entregues.',
      actions: `<button class="ox-btn ox-btn--secondary ox-flashable" data-action="nueva-reserva">${Icons.svg('plus')} Reservar algo</button>`,
    })));
}

function tarjeta(r, e) {
  const s = sustancia(r.sustanciaId);
  const pct = e.total > 0 ? Math.min(100, (e.restantes / e.total) * 100) : 0;
  const salio = [
    e.aStock ? `${fmtQty(e.aStock)} al stock` : null,
    e.entregadas ? `${fmtQty(e.entregadas)} entregadas` : null,
  ].filter(Boolean).join(' · ');
  return `
    <div class="ap-stock ap-reserva" data-reserva="${esc(r.id)}">
      <span class="ap-stock__head">
        <span class="ap-stock__nombre ox-truncate">${esc(s?.nombre || 'Sustancia eliminada')}</span>
        <span class="ap-stock__carga ox-mono">${esc(fmtDosis(r.carga, r.unidad))}</span>
      </span>
      <span class="ap-stock__cifra"><b>${esc(fmtQty(e.restantes))}</b> ${esc(pres(r))}</span>
      <span class="ox-meter" style="--ox-pct:${pct.toFixed(1)}%"><span class="ox-meter__fill"></span></span>
      <span class="ap-stock__meta">de ${esc(fmtQty(e.total))} reservadas el ${esc(fmtDiaSemana(r.at))}${r.marca ? ` · ${esc(r.marca)}` : ''}${salio ? ` · ${esc(salio)}` : ''}</span>
      <span class="ap-reserva__para">${Icons.svg('user')}<span class="ox-truncate">${r.para ? `para <b>${esc(r.para)}</b>` : 'sin destino fijo'}</span></span>
      ${r.notas ? `<span class="ap-stock__meta ap-reserva__notas">${esc(r.notas)}</span>` : ''}
      <span class="ap-reserva__acciones">
        <button class="ox-btn ox-btn--secondary ox-btn--sm ox-flashable" data-action="pasar-stock" data-arg="${esc(r.id)}">${Icons.svg('stock')} Pasar al stock</button>
        <button class="ox-btn ox-btn--secondary ox-btn--sm ox-flashable" data-action="entregar-reserva" data-arg="${esc(r.id)}">${Icons.svg('send')} Entregar</button>
        <span class="ox-grow"></span>
        <button class="ox-iconbtn ox-iconbtn--sm" data-menu="reserva" data-menu-arg="${esc(r.id)}" data-tip="Más">${Icons.svg('more')}</button>
      </span>
    </div>`;
}

/** Una fila por reserva (cuando se guardó) y una por cada salida. */
function tablaMovimientos(salidas) {
  const filas = [
    ...S.reservas.map((r) => ({ at: r.at, r, x: null })),
    ...salidas.map(({ r, x }) => ({ at: x.at, r, x })),
  ].sort((a, b) => b.at - a.at || (a.x ? -1 : 1));

  const fila = ({ r, x }) => {
    const mov = !x ? 'Reservada' : x.tipo === 'stock' ? 'Al stock' : 'Entregada';
    const icono = !x ? 'lock' : x.tipo === 'stock' ? 'stock' : 'send';
    const quien = !x ? (r.para || '—') : x.tipo === 'stock' ? '—' : (x.destino || '—');
    const unidades = x ? x.unidades : estadoReserva(r).total;
    const menu = x
      ? `data-menu="salida" data-menu-arg="${esc(`${r.id}|${x.id}`)}"`
      : `data-menu="reserva" data-menu-arg="${esc(r.id)}"`;
    return `<tr class="ox-tr">
      <td>${esc(fmtDiaSemana(x ? x.at : r.at))}</td>
      <td><span class="ap-mov">${Icons.svg(icono)}${esc(mov)}</span></td>
      <td>${esc(nombreSustancia(r.sustanciaId))}</td>
      <td class="ox-td--num">${esc(fmtDosis(r.carga, r.unidad))}</td>
      <td class="ox-td--num"><b>${esc(fmtQty(unidades))}</b></td>
      <td>${esc(quien)}</td>
      <td class="ox-td--tight"><div class="ox-rowactions">
        <button class="ox-iconbtn ox-iconbtn--sm" ${menu} data-tip="Más">${Icons.svg('more')}</button></div></td>
    </tr>`;
  };
  return `<table class="ox-table">
    <thead><tr>
      <th>Fecha</th><th>Movimiento</th><th>Droga</th><th class="ox-td--num">Dosis</th>
      <th class="ox-td--num">Unidades</th><th>Para / a quién</th><th></th>
    </tr></thead>
    <tbody>${filas.map(fila).join('')}</tbody>
  </table>`;
}
