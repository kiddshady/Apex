/* Sustancias — la lista de lo que se toma, y el detalle de cada una: su perfil
   farmacocinético personal (cuánto tarda, cuándo pica, cuánto dura), las
   curvas de todos sus episodios superpuestas, y la tabla de tomas. */

import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc, empty, attempt } from '../ui.js';
import { countTo, tick } from '../motion.js';
import { fmtDosis, fmtQty, fmtMin, fmtHM, fmtDiaSemana, fmtOffset, relTime, monogram, plural } from '../format.js';
import { perfil, curvas, curvaMediana, totales, ordenarHitos, sumarDias, inicioDia, esCombinacion, MIN } from '../pk.js';
import {
  S, sustancia, dosisDe, setContexto, guardarSustancia,
  cantidadDosis, habitualSustancia, textoEsquema, combinacionesCon,
} from '../tienda.js';
import { viaLabel } from '../vocab.js';
import { grafCurvas } from '../graficos.js';
import { dialogoSustancia, archivarSustancia } from '../dialogos.js';
import { kpi } from './comunes.js';

const BTN_NUEVA = `<button class="ox-btn ox-btn--secondary ox-flashable" data-action="nueva-combinacion">${Icons.svg('combinacion')} Nueva combinación</button>
  <button class="ox-btn ox-btn--primary ox-flashable" data-action="nueva-sustancia">${Icons.svg('plus')} Nueva sustancia</button>`;

/** El avatar de una sustancia: sus iniciales, o las dos cápsulas si es una combinación. */
const avatar = (s, extra = '') => (esCombinacion(s)
  ? `<span class="ox-avatar${extra}">${Icons.svg('combinacion')}</span>`
  : `<span class="ox-avatar${extra}">${esc(monogram(s.nombre))}</span>`);

/* ══ Lista ═══════════════════════════════════════════════════════════════════ */

export function vistaSustancias() {
  const activasL = S.sustancias.filter((s) => !s.archivada && !esCombinacion(s));
  const combos = S.sustancias.filter((s) => !s.archivada && esCombinacion(s));
  const archivadas = S.sustancias.filter((s) => s.archivada);

  setContexto('');
  paint(head({
    title: 'Sustancias',
    sub: S.sustancias.length ? [
      plural(activasL.length, 'activa'),
      combos.length ? plural(combos.length, 'combinación', 'combinaciones') : null,
      archivadas.length ? plural(archivadas.length, 'archivada') : null,
    ].filter(Boolean).join(' · ') : 'Lo que tomás, con su unidad y su dosis habitual',
    actions: BTN_NUEVA,
  }) + (S.sustancias.length ? `
    <div class="ox-scroll ox-grow">
      <div class="ox-list">${activasL.map(filaSustancia).join('')}</div>
      ${combos.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Combinaciones</span>
            <span class="ox-meta">cada una con su perfil, aparte del de sus componentes</span></div>
          <div class="ox-list">${combos.map(filaSustancia).join('')}</div>
        </div>` : ''}
      ${archivadas.length ? `
        <div class="ox-section">
          <div class="ox-section__head"><span class="ox-section__title">Archivadas</span>
            <span class="ox-meta">no aparecen al registrar; su historial queda</span></div>
          <div class="ox-list">${archivadas.map(filaSustancia).join('')}</div>
        </div>` : ''}
      <div style="height:24px"></div>
    </div>`
    : empty({
      icon: 'pill',
      title: 'Todavía no hay sustancias',
      text: 'Cada una lleva nombre, unidad y dosis habitual. Con eso, registrar una toma es un click y un Enter.',
      actions: `<button class="ox-btn ox-btn--secondary ox-flashable" data-action="nueva-sustancia">${Icons.svg('plus')} Crear la primera</button>`,
    })));
}

function filaSustancia(s) {
  const ds = dosisDe(s.id);
  const t = totales(ds);
  const hace30 = totales(ds.filter((d) => d.at >= sumarDias(inicioDia(Date.now()), -29)));
  const combo = esCombinacion(s);
  const detalle = [
    habitualSustancia(s) ? `${habitualSustancia(s)} habitual` : s.unidad,
    s.via ? viaLabel(s.via) : null,
    s.vidaMedia ? `t½ ${fmtQty(s.vidaMedia)} h` : null,
    textoEsquema(s) || null,
  ].filter(Boolean).join(' · ');
  const treinta = combo ? plural(hace30.tomas, 'toma') : fmtDosis(hace30.total, s.unidad);
  return `
    <div class="ox-listitem" role="button" tabindex="0" data-sust="${esc(s.id)}">
      ${avatar(s)}
      <div class="ox-listitem__main">
        <span class="ox-listitem__title">${esc(s.nombre)}${s.archivada ? ` <span class="ox-chip ox-chip--outline">archivada</span>` : ''}</span>
        <span class="ox-listitem__sub">${esc(detalle)}</span>
      </div>
      <div class="ox-listitem__aside ap-sust__stats">
        <span><b>${esc(String(t.tomas))}</b> ${t.tomas === 1 ? 'toma' : 'tomas'}</span>
        <span>30 d: <b>${esc(hace30.tomas ? treinta : '—')}</b></span>
        <span>última: <b>${esc(t.ultima ? relTime(t.ultima) : '—')}</b></span>
      </div>
      <div class="ox-rowactions">
        <button class="ox-iconbtn ox-iconbtn--sm" data-rapida="${esc(s.id)}" data-tip="Registrar dosis">${Icons.svg('gota')}</button>
        <button class="ox-iconbtn ox-iconbtn--sm" data-menu="sustancia" data-menu-arg="${esc(s.id)}" data-tip="Más">${Icons.svg('more')}</button>
      </div>
    </div>`;
}

/* ══ Detalle: el perfil ══════════════════════════════════════════════════════ */

export function vistaSustancia(id) {
  const s = sustancia(id);
  if (!s) {
    setContexto('');
    paint(head({ title: 'No encontrada', linea: true, crumbs: [{ label: 'Sustancias', view: 'sustancias' }, { label: id }] })
      + empty({ icon: 'alert', title: `No existe ${id}`, text: 'Puede que la hayas eliminado.' }));
    return;
  }
  const ds = dosisDe(id).sort((a, b) => b.at - a.at);
  const t = totales(ds);
  const hace30 = totales(ds.filter((d) => d.at >= sumarDias(inicioDia(Date.now()), -29)));
  const p = perfil(ds);
  const cs = curvas(ds);
  const med = curvaMediana(cs);
  const combo = esCombinacion(s);
  const enCombos = combo ? [] : combinacionesCon(s.id);
  const habitual = habitualSustancia(s);

  setContexto(`${Icons.svg(combo ? 'combinacion' : 'pill', 'ox-icon--sm')}<span>${esc(s.nombre)}</span>`);
  paint(head({
    title: s.nombre,
    sub: [
      habitual ? `${habitual} habitual` : `en ${s.unidad}`,
      textoEsquema(s) || null,
      s.via ? viaLabel(s.via) : null,
      s.vidaMedia ? `vida media ${fmtQty(s.vidaMedia)} h` : null,
      s.archivada ? 'archivada' : null,
    ].filter(Boolean).join(' · '),
    crumbs: [{ label: 'Sustancias', view: 'sustancias' }, { label: s.nombre }],
    linea: true,
    actions: `
      <button class="ox-btn ox-btn--primary ox-flashable" data-rapida="${esc(s.id)}">${Icons.svg('plus')} Registrar dosis</button>
      <button class="ox-iconbtn" data-menu="sustancia" data-menu-arg="${esc(s.id)}" data-tip="Más">${Icons.svg('more')}</button>`,
  }) + `
    <div class="ox-viewbody">
      <div class="ox-viewbody__main">
        <div class="ox-scroll ox-grow">
          <div class="ap-kpis">
            ${kpi('0', 'Tomas', { id: 'k-tomas' })}
            ${combo
    ? kpi(String(hace30.tomas), 'Últimos 30 días', { tip: 'Tomas de la combinación en los últimos 30 días' })
    : kpi(hace30.tomas ? fmtQty(hace30.total) : '—', 'Últimos 30 días', { unidad: hace30.tomas ? s.unidad : '', tip: `${plural(hace30.tomas, 'toma')} en los últimos 30 días` })}
            ${kpi(t.ultima ? relTime(t.ultima) : '—', 'Última toma')}
            ${kpi(String(p.conHitos), 'Episodios con hitos', { tip: 'Tomas que tienen al menos un hito anotado' })}
          </div>

          <div class="ox-card ap-cardchart">
            <div class="ox-card__head">
              <span class="ox-subtitle">Perfil personal</span>
              <span class="ox-meta">medianas sobre ${esc(plural(p.conHitos, 'episodio'))}; el rango es min–max</span>
            </div>
            <div class="ox-card__body">
              <div class="ap-perfil">
                ${itemPerfil('faseOnset', 'Onset', p.fases.onset)}
                ${itemPerfil('fasePico', 'Pico', p.fases.pico)}
                ${itemPerfil('fasePlateau', 'Plateau', p.fases.plateau)}
                ${itemPerfil('faseBaja', 'Mermando', p.fases.baja)}
                ${itemPerfil('faseFin', 'Fin', p.fases.fin)}
                ${itemPerfil('clock', 'Duración', p.duracion, { nota: 'del onset al fin' })}
                ${itemPerfil('zap', 'Intensidad máx.', p.intensidad, { formato: (v) => `${fmtQty(v)} / 10` })}
                ${combo
    ? `<div class="ap-perfil__item">
                    <span class="ap-perfil__k">${Icons.svg('combinacion')} Habitual</span>
                    <span class="ap-perfil__v">${esc(habitual)}</span>
                    <span class="ap-perfil__r">${esc(plural(s.componentes.length, 'componente'))}</span></div>`
    : itemPerfil('gota', 'Dosis', p.cantidad, { formato: (v) => fmtDosis(v, s.unidad) })}
              </div>
            </div>
          </div>

          <div class="ox-card ap-cardchart">
            <div class="ox-card__head">
              <span class="ox-subtitle">Curvas de intensidad</span>
              <span class="ox-meta">${esc(cs.length ? `${plural(cs.length, 'episodio')} con intensidad` : 'cada episodio con intensidad se superpone acá')}</span>
            </div>
            <div class="ox-card__body"><div id="curvas"></div></div>
          </div>

          <div class="ox-card ap-cardchart">
            <div class="ox-card__head">
              <span class="ox-subtitle">Episodios</span>
              <span class="ox-meta">${esc(plural(ds.length, 'toma'))}</span>
            </div>
            <div class="ox-card__body" style="padding-left:0;padding-right:0;padding-bottom:6px">
              ${ds.length ? tablaEpisodios(ds) : `<div class="ox-empty" style="padding:24px">${Icons.svg('gota')}<div class="ox-empty__text">Todavía no hay tomas de ${esc(s.nombre)}.</div></div>`}
            </div>
          </div>
          <div style="height:24px"></div>
        </div>
      </div>

      <aside class="ox-inspector">
        <div class="ox-inspector__head">
          ${avatar(s, ' ox-avatar--lg')}
          <div class="ox-grow" style="min-width:0">
            <div class="ox-truncate" style="font-weight:var(--ox-w-medium)">${esc(s.nombre)}</div>
            <div class="ox-meta ox-mono">${esc(s.id)}</div>
          </div>
        </div>
        <div class="ox-inspector__body ox-scroll">
          <div class="ox-kv" style="margin-bottom:18px">
            ${combo ? `
            <span class="ox-kv__k">Vía</span><span class="ox-kv__v">${esc(s.via ? viaLabel(s.via) : '—')}</span>` : `
            <span class="ox-kv__k">Unidad</span><span class="ox-kv__v ox-mono">${esc(s.unidad || '—')}</span>
            <span class="ox-kv__k">Habitual</span><span class="ox-kv__v ox-num">${esc(habitual || '—')}</span>
            <span class="ox-kv__k">Esquema</span><span class="ox-kv__v">${esc(textoEsquema(s) || '—')}</span>
            <span class="ox-kv__k">Vía</span><span class="ox-kv__v">${esc(s.via ? viaLabel(s.via) : '—')}</span>
            <span class="ox-kv__k">Vida media</span><span class="ox-kv__v ox-num">${esc(s.vidaMedia ? `${fmtQty(s.vidaMedia)} h` : '—')}</span>
            <span class="ox-kv__k">Total</span><span class="ox-kv__v ox-num">${esc(t.tomas ? fmtDosis(t.total, s.unidad) : '—')}</span>`}
            <span class="ox-kv__k">Primera</span><span class="ox-kv__v">${esc(t.primera ? fmtDiaSemana(t.primera) : '—')}</span>
            <span class="ox-kv__k">Creada</span><span class="ox-kv__v">${esc(relTime(s.createdAt))}</span>
          </div>
          ${combo ? `
          <div class="ox-field" style="margin-bottom:18px">
            <span class="ox-field__label">Componentes</span>
            <div class="ox-list">${s.componentes.map((c) => {
    const cs = sustancia(c.sustanciaId);
    return `<div class="ox-listitem" role="button" tabindex="0" data-sust="${esc(c.sustanciaId)}">
                <div class="ox-listitem__main"><span class="ox-listitem__title">${esc(cs?.nombre || 'Sustancia eliminada')}</span></div>
                <span class="ap-toma__cant">${esc(fmtDosis(c.cantidad, cs?.unidad || ''))}</span></div>`;
  }).join('')}</div>
          </div>` : ''}
          ${enCombos.length ? `
          <div class="ox-field" style="margin-bottom:18px">
            <span class="ox-field__label">En combinaciones</span>
            <div class="ox-list">${enCombos.map((c) => `<div class="ox-listitem" role="button" tabindex="0" data-sust="${esc(c.id)}">
                <div class="ox-listitem__main"><span class="ox-listitem__title">${esc(c.nombre)}</span>
                <span class="ox-listitem__sub">${esc(plural(dosisDe(c.id).length, 'toma'))}; no entran en este perfil</span></div></div>`).join('')}</div>
          </div>` : ''}
          <div class="ox-field">
            <label class="ox-field__label" for="notas">Notas</label>
            <textarea class="ox-textarea ap-notas" id="notas" placeholder="Para qué la tomás, interacciones, lo que quieras recordar… Se guarda al salir del campo.">${esc(s.notas || '')}</textarea>
          </div>
        </div>
        <div class="ox-inspector__foot">
          <button class="ox-btn ox-btn--ghost ox-btn--sm ox-grow" id="btn-editar">${Icons.svg('edit')} Editar</button>
          <button class="ox-btn ox-btn--ghost ox-btn--sm" id="btn-archivar">${Icons.svg('archivar')} ${s.archivada ? 'Recuperar' : 'Archivar'}</button>
        </div>
      </aside>
    </div>`);

  countTo(document.getElementById('k-tomas'), t.tomas);
  Router.onLeave(grafCurvas(document.getElementById('curvas'), {
    curvas: cs,
    mediana: med,
    sinDatos: ds.length ? 'Anotá hitos con intensidad en las tomas para ver las curvas' : 'Las curvas aparecen con la primera toma con hitos',
  }));

  const notas = document.getElementById('notas');
  notas.addEventListener('blur', async () => {
    const actual = sustancia(id);
    if (!actual || notas.value === (actual.notas || '')) return;
    const ok = await attempt(() => guardarSustancia({ ...actual, notas: notas.value }), { errorTitle: 'No se pudieron guardar las notas' });
    if (ok) tick(document.querySelector('#stat-guardado'));
  });
  document.getElementById('btn-editar').addEventListener('click', async () => {
    const actual = sustancia(id);
    if (actual && await dialogoSustancia(actual)) Router.refresh();
  });
  document.getElementById('btn-archivar').addEventListener('click', async () => {
    const actual = sustancia(id);
    if (actual && await archivarSustancia(id, !actual.archivada)) Router.refresh();
  });
}

function itemPerfil(icono, rotulo, st, { formato = fmtMin, nota = '' } = {}) {
  const vacio = !st || !st.n;
  const rango = !vacio && st.n > 1 && st.min !== st.max ? `${formato(st.min)} – ${formato(st.max)}` : '';
  return `<div class="ap-perfil__item">
    <span class="ap-perfil__k">${Icons.svg(icono)} ${esc(rotulo)}</span>
    <span class="ap-perfil__v${vacio ? ' is-vacio' : ''}">${vacio ? 'sin datos' : esc(formato(st.mediana))}</span>
    <span class="ap-perfil__r">${vacio ? esc(nota || ' ') : esc([rango, `n = ${st.n}`].filter(Boolean).join(' · '))}</span>
  </div>`;
}

function tablaEpisodios(ds) {
  const fila = (d) => {
    const hs = ordenarHitos(d.hitos || []);
    const primero = (fase) => hs.find((h) => h.fase === fase);
    const on = primero('onset'); const pico = primero('pico'); const fin = primero('fin');
    const dur = fin ? (fin.at - (on?.at ?? d.at)) / MIN : null;
    const maxI = hs.reduce((m, h) => (h.intensidad != null && h.intensidad !== '' ? Math.max(m, Number(h.intensidad)) : m), -Infinity);
    return `<tr class="ox-tr" data-open="${esc(d.id)}" role="button" tabindex="0">
      <td>${esc(fmtDiaSemana(d.at))}</td>
      <td class="ox-td--num ox-mono">${esc(fmtHM(d.at))}</td>
      <td class="ox-td--num">${esc(cantidadDosis(d))}</td>
      <td>${esc(d.via ? viaLabel(d.via) : '—')}</td>
      <td class="ox-td--num">${hs.length || '—'}</td>
      <td class="ox-td--num">${esc(on ? fmtOffset(on.at - d.at) : '—')}</td>
      <td class="ox-td--num">${esc(pico ? fmtOffset(pico.at - d.at) : '—')}</td>
      <td class="ox-td--num">${esc(dur != null ? fmtMin(dur) : '—')}</td>
      <td class="ox-td--num">${Number.isFinite(maxI) ? esc(fmtQty(maxI)) : '—'}</td>
      <td class="ox-td--tight"><div class="ox-rowactions">
        <button class="ox-iconbtn ox-iconbtn--sm" data-menu="dosis" data-menu-arg="${esc(d.id)}" data-tip="Más">${Icons.svg('more')}</button></div></td>
    </tr>`;
  };
  return `<table class="ox-table">
    <thead><tr>
      <th>Fecha</th><th class="ox-td--num">Hora</th><th class="ox-td--num">Cantidad</th><th>Vía</th>
      <th class="ox-td--num">Hitos</th><th class="ox-td--num">Onset</th><th class="ox-td--num">Pico</th>
      <th class="ox-td--num">Duración</th><th class="ox-td--num">Int. máx.</th><th></th>
    </tr></thead>
    <tbody>${ds.map(fila).join('')}</tbody>
  </table>`;
}

