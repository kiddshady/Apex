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
import { bindStepper, bindSwitcher, toggleReveal } from './motion.js';
import { esc, attempt } from './ui.js';
import { fmtDosis, fmtHM, fmtOffset, fmtQty, fmtDiaSemana, plural } from './format.js';
import { campoMomento, cablearMomento } from './campo-fecha.js';
import {
  FASES, faseInfo, ordenarHitos, MODOS_ESQUEMA, MAX_COMPONENTES,
  esCombinacion, normalizarEsquema, esquemaDelDia,
} from './pk.js';
import { UNIDADES, VIAS, PRESENTACIONES, pasoPara } from './vocab.js';
import {
  S, sustancia, dosis as tomarDosis, dosisDe, activas, etiquetaDosis, combinacionesCon, textoEsquema,
  guardarSustancia, guardarDosis, borrarDosis, borrarSustancia, guardarAjustes,
  stocksActuales, ingreso as tomarIngreso, guardarIngreso, borrarIngreso, nombreSustancia,
} from './tienda.js';
import { segmentedHTML } from './vistas/comunes.js';

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

const MODOS = [{ id: 'ninguno', label: 'Sin esquema' }, ...MODOS_ESQUEMA];

export async function dialogoSustancia(existente = null) {
  if (esCombinacion(existente)) return dialogoCombinacion(existente);
  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  const unidad0 = existente?.unidad || S.ajustes.unidadDefault || UNIDADES[0];
  const esq0 = normalizarEsquema(existente?.esquema);
  const modo0 = esq0?.modo || 'ninguno';
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
      <label class="ox-field__label">Esquema</label>
      ${segmentedHTML('f-esquema', MODOS, modo0)}
    </div>
    <div class="ox-reveal${esq0 ? ' is-open' : ''}" id="f-esq-wrap"><div>
      <div class="ox-row" style="gap:12px;align-items:flex-start;padding-bottom:2px">
        <div class="ox-field ap-apagable${modo0 === 'demanda' ? ' is-off' : ''}" id="f-tomas-campo" style="width:150px">
          <label class="ox-field__label" for="f-tomas">Tomas por día</label>
          ${stepperHTML({ id: 'f-tomas', valor: esq0?.tomasDia ?? 1, min: 1, step: 1, placeholder: '1' })}
        </div>
        <div class="ox-field ox-grow">
          <label class="ox-field__label" for="f-min">Rango por toma</label>
          <div class="ox-row" style="gap:8px">
            <input class="ox-input ox-input--mono" type="number" id="f-min" min="0" placeholder="mín." value="${esc(esq0?.min ?? '')}">
            <span class="ox-meta">a</span>
            <input class="ox-input ox-input--mono" type="number" id="f-max" min="0" placeholder="máx." value="${esc(esq0?.max ?? '')}">
            <span class="ox-label ox-mono" id="f-esq-unidad" style="min-width:40px">${esc(unidad0)}</span>
          </div>
          <span class="ox-field__hint">Opcional y de referencia: una toma fuera del rango se registra igual.</span>
        </div>
      </div>
    </div></div>
    <div class="ox-field">
      <label class="ox-field__label" for="f-notas">Notas</label>
      <textarea class="ox-textarea" id="f-notas" rows="3" placeholder="Para qué la tomás, interacciones, lo que quieras recordar…">${esc(existente?.notas || '')}</textarea>
    </div>`;

  const p = Modal.show({
    title: existente ? 'Editar sustancia' : 'Nueva sustancia',
    sub: existente ? '' : 'Lo que se toma: cada una tiene su unidad, su dosis habitual y su perfil.',
    body,
    width: 560,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Crear', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();
  const nombre = body.querySelector('#f-nombre');
  const habitual = body.querySelector('#f-habitual');
  const esqUnidad = body.querySelector('#f-esq-unidad');
  const selU = bindSelect(body.querySelector('#f-unidad'), UNIDADES.map((u) => ({ value: u, label: u })), {
    valor: unidad0,
    onChange: (u) => { esqUnidad.textContent = u; },
  });
  const selV = bindSelect(body.querySelector('#f-via'),
    [{ value: null, label: 'Sin especificar' }, { sep: true }, ...VIAS.map((v) => ({ value: v.id, label: v.label }))],
    { valor: existente?.via || null });
  body.querySelectorAll('.ox-stepper').forEach((st) => bindStepper(st));
  // El paso acompaña la magnitud: escribir 200 pasa las flechas a 25.
  habitual.addEventListener('change', () => { habitual.step = pasoPara(habitual.value); });

  /* El esquema: «Sin esquema» pliega los campos; «A demanda» apaga las tomas
     por día (no hay un número fijo) pero deja el rango. */
  let modo = modo0;
  const tomasCampo = body.querySelector('#f-tomas-campo');
  bindSwitcher(body.querySelector('#f-esquema'), (v) => {
    modo = v;
    toggleReveal(body.querySelector('#f-esq-wrap'), v !== 'ninguno');
    tomasCampo.classList.toggle('is-off', v === 'demanda');
    body.querySelector('#f-tomas').disabled = v === 'demanda';
  });
  body.querySelector('#f-tomas').disabled = modo0 === 'demanda';

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
    esquema: modo === 'ninguno' ? null : normalizarEsquema({
      modo,
      tomasDia: numero(body.querySelector('#f-tomas').value),
      min: numero(body.querySelector('#f-min').value),
      max: numero(body.querySelector('#f-max').value),
    }),
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
    componentes: existente?.componentes?.map((c) => c.cantidad) ?? null,   // idem, en una combinación
    via: existente?.via ?? undefined,           // undefined → la habitual de la sustancia
    at: existente?.at ?? Date.now(),
    notas: existente?.notas ?? '',
  };
  if (!sustancia(estado.sustanciaId)) estado.sustanciaId = lista[0]?.id || null;

  for (;;) {
    const res = await formularioDosis(estado, existente);
    if (res === 'nueva' || res === 'combinacion') {
      const s = res === 'nueva' ? await dialogoSustancia() : await dialogoCombinacion();
      if (s) { estado.sustanciaId = s.id; estado.cantidad = null; estado.componentes = null; estado.via = undefined; }
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
  const simples = opciones.filter((s) => !esCombinacion(s));
  const combos = opciones.filter(esCombinacion);

  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  body.innerHTML = `
    <div class="ox-field">
      <label class="ox-field__label">Sustancia</label>
      ${selectHTML({ id: 'f-sust', placeholder: 'Elegir sustancia' })}
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label" id="f-cant-label">Cantidad</label>
        <div id="f-cant-zona"></div>
        <span class="ox-field__hint" id="f-esq-hint"></span>
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
    width: 560,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Registrar', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();

  const zona = body.querySelector('#f-cant-zona');
  const rotulo = body.querySelector('#f-cant-label');
  const hint = body.querySelector('#f-esq-hint');
  const notas = body.querySelector('#f-notas');
  let cantTocada = estado.cantidad != null;
  let viaTocada = estado.via !== undefined;
  let compTocadas = Array.isArray(estado.componentes);

  const momento = cablearMomento(body, 'f-momento', () => validar());

  const selV = bindSelect(body.querySelector('#f-via'),
    [{ value: null, label: 'Sin especificar' }, { sep: true }, ...VIAS.map((v) => ({ value: v.id, label: v.label }))],
    { valor: estado.via !== undefined ? estado.via : (s0?.via || null), onChange: () => { viaTocada = true; } });

  /* La zona de cantidad cambia de forma con la sustancia: un solo campo para
     una simple, uno por componente para una combinación. Se rehace entera y
     entra con el mismo deslizamiento de las vistas. */
  const campos = () => [...zona.querySelectorAll('input[type="number"]')];
  let selCarga = null;
  const pintarCantidad = (s, { entrar = false } = {}) => {
    if (esCombinacion(s)) {
      rotulo.textContent = 'Cantidades';
      const previas = compTocadas && estado.componentes?.length === s.componentes.length ? estado.componentes : null;
      zona.innerHTML = `<div class="ap-comps">${s.componentes.map((c, i) => {
        const cs = sustancia(c.sustanciaId);
        const v = previas ? previas[i] : c.cantidad;
        return `<div class="ap-comp">
          <span class="ap-comp__nombre ox-truncate">${esc(cs?.nombre || 'Sustancia eliminada')}</span>
          ${stepperHTML({ id: `f-comp-${i}`, valor: v ?? '', step: pasoPara(c.cantidad), extra: 'style="width:150px"' })}
          <span class="ox-label ox-mono ap-comp__u">${esc(cs?.unidad || '')}</span>
        </div>`;
      }).join('')}</div>`;
    } else {
      rotulo.textContent = 'Cantidad';
      const v = cantTocada ? estado.cantidad : s?.dosisHabitual;
      /* Con dos cargas en stock (150 y 300, por ejemplo) se puede decir de
         cuál sale la toma. Con una sola, o ninguna, no hay nada que elegir. */
      const cargas = stocksActuales().filter((x) => x.sustanciaId === s?.id && x.unidad === s?.unidad);
      zona.innerHTML = `<div class="ox-row" style="gap:10px">
        ${stepperHTML({ id: 'f-cant', valor: v ?? '', step: pasoPara(s?.dosisHabitual), extra: 'style="flex:1 1 auto"' })}
        <span class="ox-label ox-mono" id="f-unidad" style="min-width:40px">${esc(s?.unidad || '')}</span>
      </div>
      ${cargas.length > 1 ? `<div class="ox-row ap-carga">
        <span class="ox-meta">Sale del stock de</span>
        <div class="ox-grow" style="min-width:0">${selectHTML({ id: 'f-carga' })}</div>
      </div>` : ''}`;
      selCarga = cargas.length > 1 ? bindSelect(zona.querySelector('#f-carga'), [
        { value: 'auto', label: 'Automático, según la cantidad' },
        { sep: true },
        ...cargas.map((x) => ({ value: x.carga, label: `${fmtDosis(x.carga, x.unidad)} por unidad · quedan ${fmtQty(Math.max(0, x.restantes))}`, icon: 'stock' })),
      ], { valor: existente?.sustanciaId === s.id && cargas.some((x) => x.carga === Number(existente?.carga)) ? Number(existente.carga) : 'auto' }) : null;
    }
    rotulo.setAttribute('for', campos()[0]?.id || '');
    zona.querySelectorAll('.ox-stepper').forEach((st) => bindStepper(st, () => { tocar(s); validar(); }));
    campos().forEach((c) => c.addEventListener('input', () => { tocar(s); validar(); }));
    if (entrar) zona.firstElementChild.style.animation = 'ox-glide-in 220ms var(--ox-ease) both';
    hint.textContent = pistaEsquema(s, !!existente);
  };
  const tocar = (s) => {
    if (esCombinacion(s)) { compTocadas = true; estado.componentes = campos().map((c) => numero(c.value)); }
    else { cantTocada = true; estado.cantidad = numero(campos()[0]?.value); }
  };

  const recordar = () => {
    estado.sustanciaId = String(selS.valor).startsWith('__') ? estado.sustanciaId : selS.valor;
    estado.via = viaTocada ? (selV.valor || null) : undefined;
    estado.at = momento.leer() ?? estado.at;
    estado.notas = notas.value;
  };

  const opcion = (s) => ({ value: s.id, label: s.nombre, icon: esCombinacion(s) ? 'combinacion' : 'pill' });
  const selS = bindSelect(body.querySelector('#f-sust'), [
    ...simples.map(opcion),
    ...(combos.length ? [{ sep: true }, ...combos.map(opcion)] : []),
    { sep: true },
    { value: '__nueva', label: 'Nueva sustancia…', icon: 'plus', siempre: true },
    { value: '__combinacion', label: 'Nueva combinación…', icon: 'combinacion', siempre: true },
  ], {
    valor: s0?.id || null,
    onChange: (v) => {
      if (v === '__nueva' || v === '__combinacion') { recordar(); Modal.close(v === '__nueva' ? 'nueva' : 'combinacion'); return; }
      const s = sustancia(v);
      if (!s) return;
      // Otra combinación trae sus propias cantidades: las tipeadas eran de la anterior.
      compTocadas = false;
      estado.componentes = null;
      pintarCantidad(s, { entrar: true });
      if (!viaTocada) selV.set(s.via || null);
      validar();
    },
  });

  const validar = () => {
    const vals = campos().map((c) => numero(c.value));
    const ok = !!sustancia(selS.valor) && vals.length > 0 && vals.every((c) => c != null && c > 0) && momento.leer() != null;
    if (primario) primario.disabled = !ok;
  };
  pintarCantidad(s0);
  validar();
  enterEnvia(body);
  setTimeout(() => { const c = campos()[0]; c?.focus(); c?.select(); }, 80);

  const ok = await p;
  if (ok === 'nueva' || ok === 'combinacion') return ok;
  if (!ok) return null;
  recordar();

  const s = sustancia(estado.sustanciaId);
  const vals = campos().map((c) => numero(c.value));
  const item = {
    ...(existente || {}),
    sustanciaId: s.id,
    via: selV.valor || null,
    at: momento.leer(),
    notas: notas.value.trim(),
  };
  if (esCombinacion(s)) {
    /* La unidad de cada componente viaja copiada, como en una toma simple. Al
       editar, la que ya tenía la toma se respeta: cambiarle la unidad a una
       sustancia no reescribe el historial. */
    const previa = new Map((existente?.componentes || []).map((c) => [c.sustanciaId, c.unidad]));
    item.cantidad = null;
    item.unidad = null;
    item.componentes = s.componentes.map((c, i) => ({
      sustanciaId: c.sustanciaId,
      cantidad: vals[i],
      unidad: previa.get(c.sustanciaId) || sustancia(c.sustanciaId)?.unidad || UNIDADES[0],
    }));
  } else {
    item.cantidad = vals[0];
    item.unidad = s.unidad;
    delete item.componentes;
  }
  // La carga elegida a mano se guarda; «automático» no deja rastro.
  if (!esCombinacion(s) && selCarga && selCarga.valor !== 'auto') item.carga = Number(selCarga.valor);
  else delete item.carga;
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

/**
 * La línea de ayuda bajo la cantidad: qué dice el esquema y cómo va hoy. En
 * una combinación, a qué esquemas les cuenta la toma. Solo informa.
 */
function pistaEsquema(s, editando) {
  if (!s) return '';
  if (esCombinacion(s)) {
    const con = s.componentes.map((c) => sustancia(c.sustanciaId)).filter((x) => x && normalizarEsquema(x.esquema));
    return con.length ? `Cuenta para el esquema de ${con.map((x) => x.nombre).join(' y ')}.` : '';
  }
  const dia = esquemaDelDia(s, S.dosis);
  if (!dia) return '';
  const partes = [textoEsquema(s)];
  if (!editando) {
    partes.push(dia.modo === 'fijo'
      ? `hoy ${dia.hechas} de ${dia.tomasDia}`
      : dia.hechas ? `hoy ${fmtDosis(dia.total, s.unidad)} en ${plural(dia.hechas, 'toma')}` : 'hoy ninguna');
  }
  return partes.join(' · ');
}

/* ══ Combinación ═════════════════════════════════════════════════════════════ */

/**
 * Crea o edita una combinación: de 2 a 3 sustancias con la cantidad de cada
 * una. El nombre se arma solo con los componentes hasta que se lo toca.
 */
export async function dialogoCombinacion(existente = null) {
  const usadas = new Set((existente?.componentes || []).map((c) => c.sustanciaId));
  const simples = S.sustancias.filter((s) => !esCombinacion(s) && (!s.archivada || usadas.has(s.id)));
  if (simples.length < 2) {
    Toast.show({ title: 'Hacen falta dos sustancias', text: 'Una combinación junta dos o tres sustancias que ya existan.', icon: 'pill' });
    return null;
  }
  const filas = (existente?.componentes || []).map((c) => ({ ...c }));
  while (filas.length < MAX_COMPONENTES) filas.push({ sustanciaId: null, cantidad: null });

  const nombreAuto = () => filas.map((f) => sustancia(f.sustanciaId)?.nombre).filter(Boolean).join(' + ');
  let nombreTocado = !!existente && existente.nombre !== nombreAuto();

  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  body.innerHTML = `
    <div class="ox-field">
      <label class="ox-field__label">Componentes</label>
      <div class="ap-comps">${filas.map((f, i) => `
        <div class="ap-comp">
          <span class="ap-comp__n ox-mono">${i + 1}</span>
          <div class="ox-grow" style="min-width:0">${selectHTML({ id: `f-cs-${i}`, placeholder: i < 2 ? 'Elegir sustancia' : 'Opcional' })}</div>
          ${stepperHTML({ id: `f-cc-${i}`, valor: f.cantidad ?? '', step: pasoPara(f.cantidad), extra: 'style="width:140px"' })}
          <span class="ox-label ox-mono ap-comp__u" id="f-cu-${i}"></span>
        </div>`).join('')}
      </div>
      <span class="ox-field__hint">Hasta ${MAX_COMPONENTES}. Las cantidades son las habituales: al registrar se ajustan.</span>
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-nombre">Nombre</label>
        <input class="ox-input" id="f-nombre" spellcheck="false" autocomplete="off" value="${esc(existente?.nombre || '')}">
        <span class="ox-field__hint">Se arma con los componentes si no lo cambiás.</span>
      </div>
      <div class="ox-field" style="width:190px">
        <label class="ox-field__label">Vía habitual</label>
        ${selectHTML({ id: 'f-via', placeholder: 'Sin especificar' })}
      </div>
    </div>
    <div class="ox-field">
      <label class="ox-field__label" for="f-notas">Notas</label>
      <textarea class="ox-textarea" id="f-notas" rows="3" placeholder="Por qué se combinan, en qué orden, qué vigilar…">${esc(existente?.notas || '')}</textarea>
    </div>`;

  const p = Modal.show({
    title: existente ? 'Editar combinación' : 'Nueva combinación',
    sub: existente ? '' : 'Dos o tres sustancias que se toman juntas. Tiene su propio perfil, aparte del de cada una.',
    body,
    width: 580,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Crear', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();
  const nombre = body.querySelector('#f-nombre');
  const cant = (i) => body.querySelector(`#f-cc-${i}`);

  const pintarFila = (i) => {
    const s = sustancia(filas[i].sustanciaId);
    body.querySelector(`#f-cu-${i}`).textContent = s?.unidad || '';
    cant(i).disabled = !s;
    cant(i).closest('.ap-comp').classList.toggle('is-vacia', !s);
  };
  const actualizarNombre = () => {
    if (!nombreTocado) nombre.value = nombreAuto();
    nombre.placeholder = nombreAuto() || 'Zolpidem + Midazolam';
  };

  filas.forEach((f, i) => {
    const opciones = [
      ...(i >= 2 ? [{ value: null, label: 'Ninguna' }, { sep: true }] : []),
      ...simples.map((s) => ({ value: s.id, label: s.archivada ? `${s.nombre} (archivada)` : s.nombre, icon: 'pill' })),
    ];
    bindSelect(body.querySelector(`#f-cs-${i}`), opciones, {
      valor: f.sustanciaId,
      onChange: (v) => {
        f.sustanciaId = v;
        const s = sustancia(v);
        // Elegir otra sustancia propone su dosis habitual; «Ninguna» vacía la fila.
        cant(i).value = s ? (s.dosisHabitual ?? '') : '';
        cant(i).step = pasoPara(s?.dosisHabitual);
        pintarFila(i);
        actualizarNombre();
        validar();
      },
    });
    bindStepper(cant(i).closest('.ox-stepper'), () => validar());
    cant(i).addEventListener('input', () => validar());
    pintarFila(i);
  });
  nombre.addEventListener('input', () => { nombreTocado = nombre.value.trim() !== ''; validar(); });
  const selV = bindSelect(body.querySelector('#f-via'),
    [{ value: null, label: 'Sin especificar' }, { sep: true }, ...VIAS.map((v) => ({ value: v.id, label: v.label }))],
    { valor: existente?.via || null });

  const elegidas = () => filas.map((f, i) => ({ ...f, cantidad: numero(cant(i).value) })).filter((f) => sustancia(f.sustanciaId));
  const validar = () => {
    const e = elegidas();
    const distintas = new Set(e.map((f) => f.sustanciaId)).size === e.length;
    const ok = e.length >= 2 && distintas && e.every((f) => f.cantidad > 0) && (nombre.value.trim() || nombreAuto());
    if (primario) primario.disabled = !ok;
  };
  actualizarNombre();
  validar();
  enterEnvia(body);

  const ok = await p;
  if (!ok) return null;

  const item = {
    ...(existente || {}),
    nombre: nombre.value.trim() || nombreAuto(),
    componentes: elegidas().map((f) => ({ sustanciaId: f.sustanciaId, cantidad: f.cantidad })),
    unidad: null,
    dosisHabitual: null,
    via: selV.valor || null,
    esquema: null,
    notas: body.querySelector('#f-notas').value.trim(),
  };
  const saved = await attempt(() => guardarSustancia(item), { errorTitle: 'No se pudo guardar la combinación' });
  if (saved) {
    Toast.show({ title: existente ? 'Combinación actualizada' : 'Combinación creada', text: saved.nombre, icon: 'combinacion' });
  }
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

/* ══ Ingreso de stock ════════════════════════════════════════════════════════ */

/**
 * Un ingreso: cuántos envases de qué presentación entraron, y cuándo. Al
 * elegir la droga propone lo del último ingreso de esa droga —marca,
 * presentación, carga, unidades por envase—, que es lo que se repite.
 */
export async function dialogoIngreso({ existente = null, sustanciaId = null } = {}) {
  const usadas = new Set(existente ? [existente.sustanciaId] : []);
  const opciones = S.sustancias.filter((s) => !esCombinacion(s) && (!s.archivada || usadas.has(s.id)));
  if (!opciones.length) {
    Toast.show({ title: 'Primero, una sustancia', text: 'Un ingreso dice de qué droga es: creala en Sustancias.', icon: 'pill' });
    return null;
  }
  const ultimoDe = (id) => S.ingresos.find((i) => i.sustanciaId === id) || null;
  const id0 = existente?.sustanciaId || (sustancia(sustanciaId) && !esCombinacion(sustancia(sustanciaId)) ? sustanciaId : null) || opciones[0].id;
  const base = existente || ultimoDe(id0) || {};
  const s0 = sustancia(id0);

  const body = document.createElement('div');
  body.className = 'ox-col';
  body.style.gap = '16px';
  body.innerHTML = `
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label">Droga</label>
        ${selectHTML({ id: 'f-sust', placeholder: 'Elegir sustancia' })}
      </div>
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-marca">Marca</label>
        <input class="ox-input" id="f-marca" placeholder="Nuvigil" spellcheck="false" autocomplete="off" value="${esc(base.marca || '')}">
      </div>
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label">Presentación</label>
        ${selectHTML({ id: 'f-pres', placeholder: 'Comprimidos' })}
      </div>
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-carga">Dosis por unidad</label>
        <div class="ox-row" style="gap:10px">
          ${stepperHTML({ id: 'f-carga', valor: base.carga ?? s0?.dosisHabitual ?? '', step: pasoPara(base.carga ?? s0?.dosisHabitual), extra: 'style="flex:1 1 auto"' })}
          <span class="ox-label ox-mono" id="f-unidad" style="min-width:40px">${esc(s0?.unidad || '')}</span>
        </div>
      </div>
    </div>
    <div class="ox-row" style="gap:12px;align-items:flex-start">
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-upe">Unidades por envase</label>
        ${stepperHTML({ id: 'f-upe', valor: base.unidadesPorEnvase ?? 30, min: 1, step: 1, placeholder: '30' })}
      </div>
      <div class="ox-field ox-grow">
        <label class="ox-field__label" for="f-env">Envases</label>
        ${stepperHTML({ id: 'f-env', valor: existente?.envases ?? 1, min: 1, step: 1, placeholder: '1' })}
      </div>
    </div>
    <div class="ap-aviso ap-aviso--total" id="f-total"></div>
    ${campoMomento({ id: 'f-momento', label: 'Cuándo entró', ms: existente?.at ?? Date.now() })}
    <span class="ox-field__hint" style="margin-top:-10px">Las tomas descuentan desde este momento; las anteriores no.</span>
    <div class="ox-field">
      <label class="ox-field__label" for="f-notas">Notas</label>
      <textarea class="ox-textarea" id="f-notas" rows="2" placeholder="Farmacia, receta, lote, vencimiento…">${esc(existente?.notas || '')}</textarea>
    </div>`;

  const p = Modal.show({
    title: existente ? 'Editar ingreso' : 'Registrar ingreso',
    sub: existente ? '' : 'Lo que entra al stock. La misma droga con la misma dosis por unidad se suma, sea de la marca que sea.',
    body,
    width: 580,
    actions: [
      { label: 'Cancelar', value: null },
      { label: existente ? 'Guardar' : 'Registrar', value: true, variant: 'primary' },
    ],
  });
  const primario = primarioDe();
  const marca = body.querySelector('#f-marca');
  const carga = body.querySelector('#f-carga');
  const upe = body.querySelector('#f-upe');
  const env = body.querySelector('#f-env');
  const total = body.querySelector('#f-total');
  const unidadEl = body.querySelector('#f-unidad');

  const selP = bindSelect(body.querySelector('#f-pres'), PRESENTACIONES.map((x) => ({ value: x, label: x })), { valor: base.presentacion || PRESENTACIONES[0] });
  const selS = bindSelect(body.querySelector('#f-sust'),
    opciones.map((s) => ({ value: s.id, label: s.archivada ? `${s.nombre} (archivada)` : s.nombre, icon: 'pill' })), {
      valor: id0,
      onChange: (v) => {
        const s = sustancia(v);
        const u = ultimoDe(v);
        unidadEl.textContent = s?.unidad || '';
        // Otra droga: lo propuesto es lo de su último ingreso, o su dosis habitual.
        carga.value = u?.carga ?? s?.dosisHabitual ?? '';
        carga.step = pasoPara(carga.value);
        if (u) { marca.value = u.marca || ''; upe.value = u.unidadesPorEnvase ?? upe.value; selP.set(u.presentacion || PRESENTACIONES[0]); }
        validar();
      },
    });
  const momento = cablearMomento(body, 'f-momento', () => validar());
  body.querySelectorAll('.ox-stepper').forEach((st) => bindStepper(st, () => validar()));
  [carga, upe, env].forEach((c) => c.addEventListener('input', () => validar()));

  const validar = () => {
    const s = sustancia(selS.valor);
    const c = numero(carga.value); const u = numero(upe.value); const e = numero(env.value);
    const ok = !!s && c > 0 && u > 0 && e > 0 && momento.leer() != null;
    total.innerHTML = ok
      ? `${Icons.svg('stock')}<div>Entran <b>${esc(fmtQty(u * e))} ${esc(selP.valor.toLowerCase())}</b> de ${esc(fmtDosis(c, s.unidad))} de ${esc(s.nombre)}.</div>`
      : `${Icons.svg('stock')}<div>Completá la dosis por unidad, las unidades y los envases.</div>`;
    if (primario) primario.disabled = !ok;
  };
  validar();
  enterEnvia(body);
  setTimeout(() => { marca.focus(); marca.select(); }, 80);

  const ok = await p;
  if (!ok) return null;
  const s = sustancia(selS.valor);
  const item = {
    ...(existente || {}),
    sustanciaId: s.id,
    marca: marca.value.trim(),
    presentacion: selP.valor,
    carga: numero(carga.value),
    unidad: existente?.sustanciaId === s.id ? (existente.unidad || s.unidad) : s.unidad,
    unidadesPorEnvase: numero(upe.value),
    envases: numero(env.value),
    at: momento.leer(),
    notas: body.querySelector('#f-notas').value.trim(),
  };
  const saved = await attempt(() => guardarIngreso(item), { errorTitle: 'No se pudo guardar el ingreso' });
  if (saved) {
    Toast.show({
      title: existente ? 'Ingreso actualizado' : 'Ingreso registrado',
      text: `${s.nombre} ${fmtDosis(saved.carga, saved.unidad)} · ${fmtQty(saved.unidadesPorEnvase * saved.envases)} unidades`,
      icon: 'stock',
    });
  }
  return saved;
}

export async function confirmarBorrarIngreso(id) {
  const i = tomarIngreso(id);
  if (!i) return false;
  const ok = await Modal.confirm({
    title: '¿Eliminar este ingreso?',
    sub: `${nombreSustancia(i.sustanciaId)} ${fmtDosis(i.carga, i.unidad)} · ${fmtQty(i.unidadesPorEnvase * i.envases)} unidades del ${fmtDiaSemana(i.at)}. El stock se recalcula sin él.`,
    confirmLabel: 'Eliminar',
    danger: true,
  });
  if (!ok) return false;
  const hecho = await attempt(async () => { await borrarIngreso(id); return true; }, { errorTitle: 'No se pudo eliminar el ingreso' });
  if (hecho) Toast.show({ title: 'Ingreso eliminado', icon: 'trash' });
  return !!hecho;
}

export function menuIngreso(id, { despues } = {}) {
  const luego = (fn) => async () => { await fn(); despues?.(); };
  return [
    { label: 'Editar…', icon: 'edit', onSelect: luego(async () => { const i = tomarIngreso(id); if (i) await dialogoIngreso({ existente: i }); }) },
    { label: 'Repetir ahora…', icon: 'retry', onSelect: luego(async () => {
      const i = tomarIngreso(id);
      if (i) await dialogoIngreso({ sustanciaId: i.sustanciaId });
    }) },
    { sep: true },
    { label: 'Eliminar', icon: 'trash', danger: true, onSelect: luego(() => confirmarBorrarIngreso(id)) },
  ];
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
  const enCombos = combinacionesCon(id);
  if (tomas || enCombos.length) {
    const archivar = await Modal.show({
      title: tomas
        ? `«${s.nombre}» tiene ${plural(tomas, 'toma registrada', 'tomas registradas')}`
        : `«${s.nombre}» forma parte de ${enCombos.length === 1 ? `«${enCombos[0].nombre}»` : plural(enCombos.length, 'combinación', 'combinaciones')}`,
      sub: tomas
        ? 'Eliminarla dejaría esas tomas sin nombre. Archivarla la saca del diálogo de registro y de los accesos rápidos, pero el historial y los gráficos quedan.'
        : 'Eliminarla dejaría la combinación con un componente sin nombre. Archivarla la saca del diálogo de registro, y la combinación la sigue mostrando.',
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
    ...(d.componentes ? { componentes: d.componentes.map((c) => ({ ...c })) } : {}),
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
    ...(esCombinacion(s) ? [] : [{ label: 'Registrar ingreso de stock…', icon: 'stock', onSelect: luego(() => dialogoIngreso({ sustanciaId: id })) }]),
    { label: s?.archivada ? 'Recuperar' : 'Archivar', icon: 'archivar', onSelect: luego(() => archivarSustancia(id, !s?.archivada)) },
    { sep: true },
    { label: 'Eliminar', icon: 'trash', danger: true, onSelect: luego(async () => {
      const borrada = await confirmarBorrarSustancia(id);
      if (borrada && Router.name === 'sustancia' && Router.param === id) Router.go('sustancias');
    }) },
  ];
}
