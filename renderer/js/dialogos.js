/* ═══════════════════════════════════════════════════════════════════════════
   APEX — diálogos

   Los tres formularios de la app —registrar una toma, crear o editar una
   sustancia, y anotar un hito— más las confirmaciones destructivas y los menús
   contextuales. Viven juntos porque comparten las piezas: el select propio, el
   campo de momento, el botón primario que se apaga hasta que el formulario
   está completo.

   El cuerpo de cada modal se arma como NODO y no como string: así se pueden
   leer los campos después de que el modal cerró (el elemento sigue siendo
   válido aunque ya no esté en el DOM) y cablear los controles antes de abrir.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Toast, Menu, Modal } from './overlays.js';
import Router from './router.js';
import { bindStepper } from './motion.js';
import { esc, attempt } from './ui.js';
import { fmtDosis, fmtHM, fmtOffset, fmtQty, fmtDiaSemana, plural } from './format.js';
import { campoMomento, cablearMomento } from './campo-fecha.js';
import { FASES, faseInfo, ordenarHitos } from './pk.js';
import { UNIDADES, VIAS, pasoPara } from './vocab.js';
import {
  S, sustancia, dosis as tomarDosis, dosisDe, activas, etiquetaDosis,
  guardarSustancia, guardarDosis, borrarDosis, borrarSustancia, guardarAjustes,
} from './tienda.js';

/* ── Piezas compartidas ──────────────────────────────────────────────────── */

/** El trigger de un select propio. La lista la abre `bindSelect` como Menu. */
export function selectHTML({ id, texto = '', placeholder = 'Elegir…', extra = '' }) {
  return `<button type="button" class="ox-select" id="${esc(id)}" ${extra}>
    <span class="ox-select__value" data-placeholder="${esc(placeholder)}">${esc(texto)}</span>
    ${Icons.svg('chevronDown', 'ox-icon--sm')}</button>`;
}

/**
 * Cablea un `.ox-select`. opciones: [{ value, label, icon }] o { sep:true }.
 * Devuelve { valor, set(v) }.
 */
export function bindSelect(btn, opciones, { valor = null, onChange, align = 'start' } = {}) {
  let actual = valor;
  const texto = btn.querySelector('.ox-select__value');
  const pintar = () => {
    const o = opciones.find((x) => !x.sep && x.value === actual);
    texto.textContent = o ? o.label : '';
  };
  btn.addEventListener('click', () => {
    Menu.show(btn, opciones.map((o) => (o.sep ? { sep: true } : {
      label: o.label,
      icon: o.icon,
      selected: o.value === actual,
      onSelect: () => {
        if (o.value === actual && !o.siempre) return;
        actual = o.value;
        pintar();
        onChange?.(actual, o);
      },
    })), { align });
  });
  pintar();
  return { get valor() { return actual; }, set(v) { actual = v; pintar(); } };
}

export function stepperHTML({ id, valor = '', min = 0, step = 1, placeholder = '0', extra = '' }) {
  return `<div class="ox-stepper" ${extra}>
    <input class="ox-input ox-input--mono" type="number" id="${esc(id)}" value="${esc(valor ?? '')}"
           min="${min}" step="${step}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off">
    <div class="ox-stepper__btns">
      <button type="button" class="ox-stepper__btn" data-step="up" tabindex="-1">${Icons.svg('chevronUp')}</button>
      <button type="button" class="ox-stepper__btn" data-step="down" tabindex="-1">${Icons.svg('chevronDown')}</button>
    </div></div>`;
}

/** El botón primario del modal que está abierto ahora. */
function primarioDe() {
  const modales = document.querySelectorAll('#ox-layer .ox-modal');
  const m = modales[modales.length - 1];
  return m?.querySelector('.ox-modal__foot .ox-btn--primary') || null;
}

/** Enter en un campo (no en un textarea) dispara el primario. Es lo que hace
    que registrar una toma sea: Ctrl+N, Enter. */
function enterEnvia(body) {
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.target.tagName === 'TEXTAREA') return;
    const p = primarioDe();
    if (p && !p.disabled) { e.preventDefault(); p.click(); }
  });
}

const numero = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* ══ Sustancia ═══════════════════════════════════════════════════════════════ */

export async function dialogoSustancia(existente = null) {
  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  const unidad0 = existente?.unidad || S.ajustes.unidadDefault || UNIDADES[0];
  body.innerHTML = `
    <div class="ox-field">
      <label class="ox-field__label" for="f-nombre">Nombre</label>
      <input class="ox-input" id="f-nombre" placeholder="Modafinilo" spellcheck="false" autocomplete="off" value="${esc(existente?.nombre || '')}">
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field" style="width:150px">
        <label class="ox-field__label">Unidad</label>
        ${selectHTML({ id: 'f-unidad', placeholder: 'mg' })}
      </div>
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-habitual">Dosis habitual</label>
        ${stepperHTML({ id: 'f-habitual', valor: existente?.dosisHabitual ?? '', step: pasoPara(existente?.dosisHabitual), placeholder: '200' })}
        <span class="ox-field__hint">La que el diálogo de registro propone primero.</span>
      </div>
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label">Vía habitual</label>
        ${selectHTML({ id: 'f-via', placeholder: 'Sin especificar' })}
      </div>
      <div class="ox-field" style="width:150px">
        <label class="ox-field__label" for="f-vida">Vida media (h)</label>
        <input class="ox-input ox-input--mono" type="number" id="f-vida" min="0" step="0.5" placeholder="opcional" value="${esc(existente?.vidaMedia ?? '')}">
      </div>
    </div>
    <div class="ox-field">
      <label class="ox-field__label" for="f-notas">Notas</label>
      <textarea class="ox-textarea" id="f-notas" rows="3" placeholder="Para qué la tomás, interacciones, lo que quieras recordar…">${esc(existente?.notas || '')}</textarea>
    </div>`;

  const p = Modal.show({
    title: existente ? 'Editar sustancia' : 'Nueva sustancia',
    sub: existente ? '' : 'Lo que se toma: cada una tiene su unidad, su dosis habitual y su perfil.',
    body,
    width: 520,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Crear', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();
  const nombre = body.querySelector('#f-nombre');
  const habitual = body.querySelector('#f-habitual');
  const selU = bindSelect(body.querySelector('#f-unidad'), UNIDADES.map((u) => ({ value: u, label: u })), { valor: unidad0 });
  const selV = bindSelect(body.querySelector('#f-via'),
    [{ value: null, label: 'Sin especificar' }, { sep: true }, ...VIAS.map((v) => ({ value: v.id, label: v.label }))],
    { valor: existente?.via || null });
  bindStepper(body.querySelector('.ox-stepper'));
  // El paso acompaña la magnitud: escribir 200 pasa las flechas a 25.
  habitual.addEventListener('change', () => { habitual.step = pasoPara(habitual.value); });

  const validar = () => { if (primario) primario.disabled = !nombre.value.trim(); };
  nombre.addEventListener('input', validar);
  validar();
  enterEnvia(body);
  setTimeout(() => nombre.focus(), 80);

  const ok = await p;
  if (!ok) return null;

  const item = {
    ...(existente || {}),
    nombre: nombre.value.trim(),
    unidad: selU.valor || UNIDADES[0],
    dosisHabitual: numero(habitual.value),
    via: selV.valor || null,
    vidaMedia: numero(body.querySelector('#f-vida').value),
    notas: body.querySelector('#f-notas').value.trim(),
  };
  const saved = await attempt(() => guardarSustancia(item), { errorTitle: 'No se pudo guardar la sustancia' });
  if (saved) {
    Toast.show({ title: existente ? 'Sustancia actualizada' : 'Sustancia creada', text: saved.nombre, icon: 'pill' });
  }
  return saved;
}

/* ══ Toma ════════════════════════════════════════════════════════════════════ */

/**
 * dialogoDosis({ existente, sustanciaId })
 * Sin sustancias todavía, primero pide crear una. La opción «Nueva sustancia…»
 * del select cierra este diálogo, abre el otro y vuelve con lo tipeado intacto:
 * dos modales apilados no existen en Onyx, y está bien que no existan.
 */
export async function dialogoDosis({ existente = null, sustanciaId = null } = {}) {
  let lista = activas();
  if (!lista.length && !existente) {
    Toast.show({ title: 'Primero, una sustancia', text: 'Para registrar una toma hay que decir de qué es.', icon: 'pill' });
    const s = await dialogoSustancia();
    if (!s) return null;
    lista = activas();
    sustanciaId = s.id;
  }

  const estado = {
    sustanciaId: existente?.sustanciaId || sustanciaId || S.ajustes.ultimaSustancia || lista[0]?.id || null,
    cantidad: existente?.cantidad ?? null,     // null → la habitual de la sustancia
    via: existente?.via ?? undefined,           // undefined → la habitual de la sustancia
    at: existente?.at ?? Date.now(),
    notas: existente?.notas ?? '',
  };
  if (!sustancia(estado.sustanciaId)) estado.sustanciaId = lista[0]?.id || null;

  for (;;) {
    const res = await formularioDosis(estado, existente);
    if (res === 'nueva') {
      const s = await dialogoSustancia();
      if (s) { estado.sustanciaId = s.id; estado.cantidad = null; estado.via = undefined; }
      continue;
    }
    return res;
  }
}

async function formularioDosis(estado, existente) {
  // La sustancia archivada de una toma vieja tiene que poder seguir eligiéndose
  // al editarla; las demás archivadas no aparecen.
  const opciones = activas();
  const actual = sustancia(estado.sustanciaId);
  if (actual && !opciones.includes(actual)) opciones.unshift(actual);
  const s0 = actual || opciones[0];

  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  const cant0 = estado.cantidad ?? s0?.dosisHabitual ?? '';
  body.innerHTML = `
    <div class="ox-field">
      <label class="ox-field__label">Sustancia</label>
      ${selectHTML({ id: 'f-sust', placeholder: 'Elegir sustancia' })}
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-cant">Cantidad</label>
        <div class="ox-row" style="gap:10px">
          ${stepperHTML({ id: 'f-cant', valor: cant0, step: pasoPara(s0?.dosisHabitual), extra: 'style="flex:1 1 auto"' })}
          <span class="ox-label ox-mono" id="f-unidad" style="min-width:40px">${esc(s0?.unidad || '')}</span>
        </div>
      </div>
      <div class="ox-field" style="width:190px">
        <label class="ox-field__label">Vía</label>
        ${selectHTML({ id: 'f-via', placeholder: 'Sin especificar' })}
      </div>
    </div>
    ${campoMomento({ id: 'f-momento', label: 'Cuándo', ms: estado.at })}
    <div class="ox-field">
      <label class="ox-field__label" for="f-notas">Notas</label>
      <textarea class="ox-textarea" id="f-notas" rows="3" placeholder="Contexto, con qué lo tomaste, cómo venías…">${esc(estado.notas)}</textarea>
    </div>`;

  const p = Modal.show({
    title: existente ? 'Editar toma' : 'Registrar dosis',
    sub: existente ? '' : 'Después podés sumarle hitos: onset, pico, cuándo mermó.',
    body,
    width: 540,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Registrar', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();

  const cant = body.querySelector('#f-cant');
  const unidadEl = body.querySelector('#f-unidad');
  const notas = body.querySelector('#f-notas');
  let cantTocada = estado.cantidad != null;
  let viaTocada = estado.via !== undefined;

  const momento = cablearMomento(body, 'f-momento', () => validar());

  const selV = bindSelect(body.querySelector('#f-via'),
    [{ value: null, label: 'Sin especificar' }, { sep: true }, ...VIAS.map((v) => ({ value: v.id, label: v.label }))],
    { valor: estado.via !== undefined ? estado.via : (s0?.via || null), onChange: () => { viaTocada = true; } });

  const recordar = () => {
    estado.sustanciaId = selS.valor === '__nueva' ? estado.sustanciaId : selS.valor;
    estado.cantidad = cantTocada ? numero(cant.value) : null;
    estado.via = viaTocada ? (selV.valor || null) : undefined;
    estado.at = momento.leer() ?? estado.at;
    estado.notas = notas.value;
  };

  const selS = bindSelect(body.querySelector('#f-sust'), [
    ...opciones.map((s) => ({ value: s.id, label: s.nombre, icon: 'pill' })),
    { sep: true },
    { value: '__nueva', label: 'Nueva sustancia…', icon: 'plus', siempre: true },
  ], {
    valor: s0?.id || null,
    onChange: (v) => {
      if (v === '__nueva') { recordar(); Modal.close('nueva'); return; }
      const s = sustancia(v);
      if (!s) return;
      unidadEl.textContent = s.unidad || '';
      if (!cantTocada) { cant.value = s.dosisHabitual ?? ''; cant.step = pasoPara(s.dosisHabitual); }
      if (!viaTocada) selV.set(s.via || null);
      validar();
    },
  });

  bindStepper(body.querySelector('.ox-stepper'), () => { cantTocada = true; validar(); });
  cant.addEventListener('input', () => { cantTocada = true; validar(); });

  const validar = () => {
    const c = numero(cant.value);
    const ok = !!sustancia(selS.valor) && c != null && c > 0 && momento.leer() != null;
    if (primario) primario.disabled = !ok;
  };
  validar();
  enterEnvia(body);
  setTimeout(() => { cant.focus(); cant.select(); }, 80);

  const ok = await p;
  if (ok === 'nueva') return 'nueva';
  if (!ok) return null;
  recordar();

  const s = sustancia(estado.sustanciaId);
  const item = {
    ...(existente || {}),
    sustanciaId: s.id,
    cantidad: numero(cant.value),
    unidad: s.unidad,
    via: selV.valor || null,
    at: momento.leer(),
    notas: notas.value.trim(),
  };
  const saved = await attempt(() => guardarDosis(item), { errorTitle: 'No se pudo guardar la toma' });
  if (!saved) return null;
  attempt(() => guardarAjustes({ ultimaSustancia: s.id }), { errorTitle: 'No se pudo recordar la sustancia' });
  Toast.show({
    title: existente ? 'Toma actualizada' : 'Toma registrada',
    text: `${etiquetaDosis(saved)} · ${fmtHM(saved.at)}`,
    icon: 'check',
  });
  return saved;
}

/* ══ Hito ════════════════════════════════════════════════════════════════════ */

const INTENSIDAD_DEFAULT = { onset: 3, pico: 7, plateau: 6, baja: 3, fin: 0, nota: 5 };

/** La fase que sigue naturalmente a la última anotada. */
function faseSiguiente(hitos) {
  const ultimo = ordenarHitos(hitos).filter((h) => h.fase !== 'nota').pop();
  return { onset: 'pico', pico: 'baja', plateau: 'baja', baja: 'fin', fin: 'nota' }[ultimo?.fase] || (ultimo ? 'nota' : 'onset');
}

export async function dialogoHito(d, existente = null) {
  const estado = {
    fase: existente?.fase || faseSiguiente(d.hitos || []),
    at: existente?.at ?? Date.now(),
    intensidad: existente ? (existente.intensidad ?? null) : null,
    notas: existente?.notas || '',
  };
  if (!existente) estado.intensidad = faseInfo(estado.fase).conIntensidad ? INTENSIDAD_DEFAULT[estado.fase] : null;
  let intTocada = !!existente;

  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  const v0 = estado.intensidad ?? INTENSIDAD_DEFAULT[estado.fase] ?? 5;
  body.innerHTML = `
    <div class="ox-field">
      <label class="ox-field__label">Fase</label>
      <div class="ap-fases" id="f-fases">${FASES.map((f) => `
        <button type="button" class="ap-fase${f.id === estado.fase ? ' is-active' : ''}" data-fase="${f.id}" data-tip="${esc(f.desc)}">
          ${Icons.svg(f.icono)} ${esc(f.label)}</button>`).join('')}
      </div>
    </div>
    ${campoMomento({ id: 'f-momento', label: 'Cuándo', ms: estado.at })}
    <div class="ox-meta ox-mono" id="f-offset" style="margin-top:-8px"></div>
    <div class="ox-field">
      <div class="ox-row" style="justify-content:space-between">
        <label class="ox-field__label" for="f-int">Intensidad</label>
        <label class="ox-row" style="gap:8px">
          <span class="ox-meta">Registrar</span>
          <button type="button" class="ox-switch${estado.intensidad != null ? ' is-on' : ''}" id="f-int-on" aria-label="Registrar intensidad"></button>
        </label>
      </div>
      <div class="ap-intensidad">
        <input type="range" class="ox-slider" id="f-int" min="0" max="10" step="0.5" value="${v0}" style="--ox-pct:${v0 * 10}%">
        <span class="ap-intensidad__valor" id="f-int-val">${esc(fmtQty(v0))}</span>
      </div>
      <span class="ox-field__hint">0 = nada · 10 = lo más fuerte que sentiste con esto</span>
    </div>
    <div class="ox-field">
      <label class="ox-field__label" for="f-notas">Observación</label>
      <textarea class="ox-textarea" id="f-notas" rows="3" placeholder="Qué sentís, qué cambió, qué te llamó la atención…">${esc(estado.notas)}</textarea>
    </div>`;

  const p = Modal.show({
    title: existente ? 'Editar hito' : 'Agregar hito',
    sub: `${etiquetaDosis(d)} · ${fmtDiaSemana(d.at)} ${fmtHM(d.at)}`,
    body,
    width: 540,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Agregar', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();

  const fases = body.querySelector('#f-fases');
  const slider = body.querySelector('#f-int');
  const valor = body.querySelector('#f-int-val');
  const sw = body.querySelector('#f-int-on');
  const offset = body.querySelector('#f-offset');

  const pintarInt = () => {
    const on = sw.classList.contains('is-on');
    slider.disabled = !on;
    slider.style.opacity = on ? '' : '.35';
    slider.style.setProperty('--ox-pct', `${Number(slider.value) * 10}%`);
    valor.textContent = on ? fmtQty(slider.value) : '—';
    valor.classList.toggle('is-off', !on);
  };
  slider.addEventListener('input', () => { intTocada = true; pintarInt(); });
  sw.addEventListener('click', () => { intTocada = true; sw.classList.toggle('is-on'); pintarInt(); });

  fases.addEventListener('click', (e) => {
    const b = e.target.closest('.ap-fase');
    if (!b) return;
    fases.querySelectorAll('.ap-fase').forEach((x) => x.classList.toggle('is-active', x === b));
    estado.fase = b.dataset.fase;
    // Si la intensidad no se tocó, sigue a la fase: fin y nota la apagan,
    // las demás la prenden con un valor razonable para arrancar.
    if (!intTocada) {
      const f = faseInfo(estado.fase);
      sw.classList.toggle('is-on', f.conIntensidad);
      slider.value = INTENSIDAD_DEFAULT[estado.fase] ?? 5;
      pintarInt();
    }
  });

  const momento = cablearMomento(body, 'f-momento', () => validar());
  const validar = () => {
    const at = momento.leer();
    const antes = at != null && at < d.at;
    offset.textContent = at == null ? '' : antes ? 'Antes de la toma: revisá la hora.' : `${fmtOffset(at - d.at)} desde la toma`;
    offset.classList.toggle('ox-danger', antes);
    if (primario) primario.disabled = at == null || antes;
  };
  pintarInt();
  validar();
  enterEnvia(body);
  setTimeout(() => body.querySelector('#f-notas')?.focus(), 80);

  const ok = await p;
  if (!ok) return null;

  const hito = {
    id: existente?.id || `h-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    fase: estado.fase,
    at: momento.leer(),
    intensidad: sw.classList.contains('is-on') ? Number(slider.value) : null,
    notas: body.querySelector('#f-notas').value.trim(),
  };
  const hitos = ordenarHitos([...(d.hitos || []).filter((h) => h.id !== hito.id), hito]);
  const saved = await attempt(() => guardarDosis({ ...d, hitos }), { errorTitle: 'No se pudo guardar el hito' });
  if (saved) {
    Toast.show({
      title: existente ? 'Hito actualizado' : `${faseInfo(hito.fase).label} anotado`,
      text: `${fmtOffset(hito.at - d.at)} desde la toma${hito.intensidad != null ? ` · intensidad ${fmtQty(hito.intensidad)}` : ''}`,
      icon: faseInfo(hito.fase).icono,
    });
  }
  return saved;
}

export async function borrarHito(d, hitoId) {
  const h = (d.hitos || []).find((x) => x.id === hitoId);
  if (!h) return null;
  const ok = await Modal.confirm({
    title: `¿Eliminar el hito «${faseInfo(h.fase).label}»?`,
    sub: `${fmtHM(h.at)} · ${fmtOffset(h.at - d.at)} desde la toma. Esto no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return null;
  const saved = await attempt(() => guardarDosis({ ...d, hitos: (d.hitos || []).filter((x) => x.id !== hitoId) }));
  if (saved) Toast.show({ title: 'Hito eliminado', icon: 'trash' });
  return saved;
}

/* ══ Confirmaciones ══════════════════════════════════════════════════════════ */

export async function confirmarBorrarDosis(id) {
  const d = tomarDosis(id);
  if (!d) return false;
  const n = (d.hitos || []).length;
  const ok = await Modal.confirm({
    title: `¿Eliminar esta toma?`,
    sub: `${etiquetaDosis(d)} · ${fmtDiaSemana(d.at)} ${fmtHM(d.at)}${n ? `, con sus ${plural(n, 'hito')}` : ''}. Se borra su archivo de la carpeta de datos y no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return false;
  const hecho = await attempt(async () => { await borrarDosis(id); return true; }, { errorTitle: 'No se pudo eliminar la toma' });
  if (hecho) Toast.show({ title: 'Toma eliminada', text: etiquetaDosis(d), icon: 'trash' });
  return !!hecho;
}

export async function confirmarBorrarSustancia(id) {
  const s = sustancia(id);
  if (!s) return false;
  const tomas = dosisDe(id).length;
  if (tomas) {
    const archivar = await Modal.show({
      title: `«${s.nombre}» tiene ${plural(tomas, 'toma registrada', 'tomas registradas')}`,
      sub: 'Eliminarla dejaría esas tomas sin nombre. Archivarla la saca del diálogo de registro y de los accesos rápidos, pero el historial y los gráficos quedan.',
      actions: [
        { label: 'Cancelar', value: null },
        { label: s.archivada ? 'Ya está archivada' : 'Archivar', value: true, variant: 'primary', autofocus: true },
      ],
    });
    if (archivar && !s.archivada) await archivarSustancia(id, true);
    return false;
  }
  const ok = await Modal.confirm({
    title: `¿Eliminar «${s.nombre}»?`,
    sub: 'No tiene tomas registradas. Se borra su archivo de la carpeta de datos.',
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return false;
  const hecho = await attempt(async () => { await borrarSustancia(id); return true; }, { errorTitle: 'No se pudo eliminar la sustancia' });
  if (hecho) Toast.show({ title: 'Sustancia eliminada', text: s.nombre, icon: 'trash' });
  return !!hecho;
}

export async function archivarSustancia(id, archivada = true) {
  const s = sustancia(id);
  if (!s) return null;
  const saved = await attempt(() => guardarSustancia({ ...s, archivada }), { errorTitle: 'No se pudo archivar' });
  if (saved) Toast.show({ title: archivada ? 'Sustancia archivada' : 'Sustancia recuperada', text: s.nombre, icon: 'archivar' });
  return saved;
}

/** Una toma igual a otra, ahora mismo. Para la dosis repetida de todos los días. */
export async function repetirDosis(id) {
  const d = tomarDosis(id);
  if (!d) return null;
  const saved = await attempt(() => guardarDosis({
    sustanciaId: d.sustanciaId, cantidad: d.cantidad, unidad: d.unidad, via: d.via || null, at: Date.now(), notas: '', hitos: [],
  }), { errorTitle: 'No se pudo repetir la toma' });
  if (saved) {
    Toast.show({ title: 'Toma registrada ahora', text: etiquetaDosis(saved), icon: 'check' });
    Router.go('dosis', saved.id);
  }
  return saved;
}

/* ══ Menús contextuales ══════════════════════════════════════════════════════ */

export function menuDosis(id, { despues } = {}) {
  const luego = (fn) => async () => { await fn(); despues?.(); };
  return [
    { label: 'Abrir', icon: 'external', onSelect: () => Router.go('dosis', id) },
    { label: 'Agregar hito…', icon: 'hito', onSelect: luego(async () => { const d = tomarDosis(id); if (d) await dialogoHito(d); }) },
    { label: 'Editar…', icon: 'edit', onSelect: luego(async () => { const d = tomarDosis(id); if (d) await dialogoDosis({ existente: d }); }) },
    { label: 'Repetir ahora', icon: 'retry', onSelect: () => repetirDosis(id) },
    { sep: true },
    { label: 'Eliminar', icon: 'trash', danger: true, onSelect: luego(async () => {
      const borrada = await confirmarBorrarDosis(id);
      if (borrada && Router.name === 'dosis' && Router.param === id) Router.go('registro');
    }) },
  ];
}

export function menuSustancia(id, { despues } = {}) {
  const s = sustancia(id);
  const luego = (fn) => async () => { await fn(); despues?.(); };
  return [
    { label: 'Abrir', icon: 'external', onSelect: () => Router.go('sustancia', id) },
    { label: 'Registrar dosis…', icon: 'gota', onSelect: luego(() => dialogoDosis({ sustanciaId: id })) },
    { label: 'Editar…', icon: 'edit', onSelect: luego(async () => { if (s) await dialogoSustancia(s); }) },
    { label: s?.archivada ? 'Recuperar' : 'Archivar', icon: 'archivar', onSelect: luego(() => archivarSustancia(id, !s?.archivada)) },
    { sep: true },
    { label: 'Eliminar', icon: 'trash', danger: true, onSelect: luego(async () => {
      const borrada = await confirmarBorrarSustancia(id);
      if (borrada && Router.name === 'sustancia' && Router.param === id) Router.go('sustancias');
    }) },
  ];
}
