/* Dosis — el detalle de una toma: su línea de tiempo (la toma y cada hito), la
   curva de intensidad del episodio, y el inspector con los datos y las notas. */

import { Icons } from '../icons.js';
import Router from '../router.js';
import { paint, head, esc, empty, status, attempt } from '../ui.js';
import { tick } from '../motion.js';
import { fmtHM, fmtDosis, fmtDiaLargo, fmtDiaSemana, fmtDiaCorto, fmtOffset, fmtQty, fmtMin, relTime, monogram, plural } from '../format.js';
import { ordenarHitos, faseInfo, estadoDosis, inicioDia, curvas, MIN } from '../pk.js';
import { dosis as tomarDosis, sustancia, etiquetaDosis, guardarDosis, setContexto } from '../tienda.js';
import { viaLabel } from '../vocab.js';
import { grafCurvas } from '../graficos.js';
import { dialogoHito, borrarHito, dialogoDosis } from '../dialogos.js';

export function vistaDosis(id) {
  const d = tomarDosis(id);
  if (!d) {
    setContexto('');
    paint(head({ title: 'No encontrada', crumbs: [{ label: 'Registro', view: 'registro' }, { label: id }] })
      + empty({ icon: 'alert', title: `No existe la toma ${id}`, text: 'Puede que la hayas borrado, o que el archivo ya no esté en la carpeta de datos.' }));
    return;
  }
  const s = sustancia(d.sustanciaId);
  const hitos = ordenarHitos(d.hitos || []);
  const cs = curvas([d]);
  const fin = hitos.find((h) => h.fase === 'fin');
  const onset = hitos.find((h) => h.fase === 'onset');
  const estado = estadoDosis(d);

  setContexto(`${Icons.svg('gota', 'ox-icon--sm')}<span>${esc(etiquetaDosis(d))} · ${esc(fmtHM(d.at))}</span>`);
  paint(head({
    title: etiquetaDosis(d),
    sub: `${fmtDiaLargo(d.at)} · ${fmtHM(d.at)}${d.via ? ` · ${viaLabel(d.via)}` : ''}`,
    crumbs: [{ label: 'Registro', view: 'registro' }, { label: `${fmtDiaSemana(d.at)} ${fmtHM(d.at)}` }],
    actions: `
      <button class="ox-btn ox-btn--primary ox-flashable" data-hito="${esc(d.id)}">${Icons.svg('hito')} Agregar hito</button>
      <button class="ox-iconbtn" data-menu="dosis" data-menu-arg="${esc(d.id)}" data-tip="Más">${Icons.svg('more')}</button>`,
  }) + `
    <div class="ox-viewbody">
      <div class="ox-viewbody__main">
        <div class="ox-scroll ox-grow">
          <div class="ox-card ap-cardchart" style="max-width:760px">
            <div class="ox-card__head">
              <span class="ox-subtitle">Línea de tiempo</span>
              <span class="ox-meta">${esc(hitos.length ? plural(hitos.length, 'hito') : 'todavía sin hitos')}</span>
              ${hitos.length ? `<span class="ox-spacer"></span><span class="ox-meta">${fin ? `duró ${esc(fmtMin((fin.at - (onset?.at ?? d.at)) / MIN))}` : 'sin cerrar'}</span>` : ''}
            </div>
            <div class="ox-card__body">
              <div class="ap-timeline" id="timeline">
                ${tomaHTML(d)}
                ${hitos.map((h, i) => hitoHTML(d, h, i + 1)).join('')}
              </div>
              ${!hitos.length ? `
                <div class="ap-aviso" style="margin-top:14px">${Icons.svg('info')}
                  <div>Los hitos son los checkpoints del episodio: <b>onset</b> cuando empieza a sentirse,
                  <b>pico</b>, <b>plateau</b>, <b>mermando</b> y <b>fin</b>. Con la hora y una intensidad de 0 a 10,
                  de a varios episodios sale tu perfil personal de esta sustancia.</div></div>` : ''}
            </div>
          </div>

          <div class="ox-card ap-cardchart" style="max-width:760px">
            <div class="ox-card__head">
              <span class="ox-subtitle">Curva del episodio</span>
              <span class="ox-meta">intensidad según las horas desde la toma</span>
            </div>
            <div class="ox-card__body">
              <div id="curva"></div>
            </div>
          </div>
          <div style="height:24px"></div>
        </div>
      </div>

      <aside class="ox-inspector">
        <div class="ox-inspector__head">
          <span class="ox-avatar">${esc(monogram(s?.nombre || '?'))}</span>
          <div class="ox-grow" style="min-width:0">
            <div class="ox-truncate" style="font-weight:var(--ox-w-medium)">${esc(s?.nombre || 'Sustancia eliminada')}</div>
            <div class="ox-meta ox-mono">${esc(d.id)}</div>
          </div>
          ${s ? `<button class="ox-iconbtn ox-iconbtn--sm" data-sust="${esc(s.id)}" data-tip="Ver la sustancia">${Icons.svg('curva')}</button>` : ''}
        </div>
        <div class="ox-inspector__body ox-scroll">
          <div class="ox-kv" style="margin-bottom:18px">
            <span class="ox-kv__k">Estado</span><span class="ox-kv__v">${status(estado)}</span>
            <span class="ox-kv__k">Cantidad</span><span class="ox-kv__v ox-num">${esc(fmtDosis(d.cantidad, d.unidad))}</span>
            <span class="ox-kv__k">Vía</span><span class="ox-kv__v">${esc(d.via ? viaLabel(d.via) : '—')}</span>
            <span class="ox-kv__k">Fecha</span><span class="ox-kv__v">${esc(fmtDiaSemana(d.at))}</span>
            <span class="ox-kv__k">Hora</span><span class="ox-kv__v ox-num">${esc(fmtHM(d.at))}</span>
            <span class="ox-kv__k">Onset</span><span class="ox-kv__v ox-num">${esc(onset ? fmtOffset(onset.at - d.at) : '—')}</span>
            <span class="ox-kv__k">Fin</span><span class="ox-kv__v ox-num">${esc(fin ? fmtOffset(fin.at - d.at) : '—')}</span>
            <span class="ox-kv__k">Guardada</span><span class="ox-kv__v">${esc(relTime(d.updatedAt || d.createdAt))}</span>
          </div>
          <div class="ox-field">
            <label class="ox-field__label" for="notas">Notas de la toma</label>
            <textarea class="ox-textarea ap-notas" id="notas" placeholder="Contexto, cómo venías, con qué lo tomaste… Se guarda solo al salir del campo.">${esc(d.notas || '')}</textarea>
          </div>
        </div>
        <div class="ox-inspector__foot">
          <button class="ox-btn ox-btn--ghost ox-btn--sm ox-grow" id="btn-editar">${Icons.svg('edit')} Editar toma</button>
          <button class="ox-btn ox-btn--danger ox-btn--sm" data-action="eliminar-dosis" data-arg="${esc(d.id)}">${Icons.svg('trash')} Eliminar</button>
        </div>
      </aside>
    </div>`);

  Router.onLeave(grafCurvas(document.getElementById('curva'), {
    curvas: cs,
    mediana: [],
    sinDatos: hitos.length ? 'Cargá intensidad en algún hito para ver la curva' : 'La curva aparece con el primer hito con intensidad',
  }));

  /* Las notas se guardan al salir del campo, no en cada tecla. */
  const notas = document.getElementById('notas');
  notas.addEventListener('blur', async () => {
    const actual = tomarDosis(id);
    if (!actual || notas.value === (actual.notas || '')) return;
    const ok = await attempt(() => guardarDosis({ ...actual, notas: notas.value }), { errorTitle: 'No se pudieron guardar las notas' });
    if (ok) tick(document.querySelector('#stat-guardado'));
  });

  document.getElementById('btn-editar').addEventListener('click', async () => {
    const actual = tomarDosis(id);
    if (actual && await dialogoDosis({ existente: actual })) Router.refresh();
  });

  /* Editar y borrar hitos: los listeners van sobre la línea de tiempo, que
     muere con el próximo pintado — nunca sobre #view, que sobrevive y los
     acumularía. */
  document.getElementById('timeline').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-hito-editar]');
    const br = e.target.closest('[data-hito-borrar]');
    const actual = tomarDosis(id);
    if (!actual) return;
    if (ed) {
      const h = (actual.hitos || []).find((x) => x.id === ed.dataset.hitoEditar);
      if (h && await dialogoHito(actual, h)) Router.refresh();
    } else if (br) {
      if (await borrarHito(actual, br.dataset.hitoBorrar)) Router.refresh();
    }
  });
}

function tomaHTML(d) {
  return `<div class="ap-hito ap-hito--toma" style="--i:0">
    <div class="ap-hito__rail"><span class="ap-hito__nodo"></span></div>
    <div class="ap-hito__body">
      <div class="ap-hito__head">
        <span class="ap-hito__hora">${esc(fmtHM(d.at))}</span>
        <span class="ap-hito__offset">0m</span>
        <span class="ap-hito__titulo">Toma · ${esc(fmtDosis(d.cantidad, d.unidad))}${d.via ? ` · ${esc(viaLabel(d.via))}` : ''}</span>
      </div>
      ${d.notas ? `<div class="ap-hito__notas">${esc(d.notas)}</div>` : ''}
    </div></div>`;
}

function hitoHTML(d, h, i) {
  const f = faseInfo(h.fase);
  const conInt = h.intensidad != null && h.intensidad !== '';
  // Un hito de otro día lleva la fecha: un episodio puede cruzar la medianoche.
  const otroDia = inicioDia(h.at) !== inicioDia(d.at);
  return `<div class="ap-hito ap-hito--${esc(h.fase)}" style="--i:${i}" data-hito-id="${esc(h.id)}">
    <div class="ap-hito__rail"><span class="ap-hito__nodo"></span></div>
    <div class="ap-hito__body">
      <div class="ap-hito__head">
        <span class="ap-hito__hora">${otroDia ? `${esc(fmtDiaCorto(h.at))} ` : ''}${esc(fmtHM(h.at))}</span>
        <span class="ap-hito__offset">${esc(fmtOffset(h.at - d.at))}</span>
        <span class="ox-chip">${Icons.svg(f.icono)} ${esc(f.label)}</span>
        <div class="ox-rowactions">
          <button class="ox-iconbtn ox-iconbtn--sm" data-hito-editar="${esc(h.id)}" data-tip="Editar hito">${Icons.svg('edit')}</button>
          <button class="ox-iconbtn ox-iconbtn--sm" data-hito-borrar="${esc(h.id)}" data-tip="Eliminar hito">${Icons.svg('trash')}</button>
        </div>
      </div>
      ${conInt ? `<div class="ap-hito__int">
        <span class="ox-meter" style="--ox-pct:${Number(h.intensidad) * 10}%"><span class="ox-meter__fill"></span></span>
        <b>${esc(fmtQty(h.intensidad))}</b> / 10</div>` : ''}
      ${h.notas ? `<div class="ap-hito__notas">${esc(h.notas)}</div>` : ''}
    </div></div>`;
}
