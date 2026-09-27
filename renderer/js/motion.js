/* ═══════════════════════════════════════════════════════════════════════════
   ONYX — motion (runtime)
   La mitad JS del sistema de movimiento. Su trabajo más importante es el que
   más se olvida: que lo que se va del DOM TERMINE su animación de salida antes
   de irse. Sin esto los overlays parpadean al cerrarse y la app se siente rota.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dos frames: garantiza que el navegador ya aplicó los estilos iniciales. */
export function raf2(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Saca un elemento del DOM DESPUÉS de su animación de salida.
 * Marca data-state="closing" (el CSS engancha ahí) y espera al animationend,
 * con un timeout de red por si el elemento no tiene animación declarada.
 */
export function exit(el, { fallback = 400, onDone } = {}) {
  if (!el || el.dataset.state === 'closing') return Promise.resolve();
  el.dataset.state = 'closing';

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener('animationend', onAnim);
      el.remove();
      onDone?.();
      resolve();
    };
    // Solo nos importa la animación del propio elemento, no la de sus hijos.
    const onAnim = (e) => { if (e.target === el) finish(); };
    el.addEventListener('animationend', onAnim);
    const timer = setTimeout(finish, fallback);
  });
}

/**
 * Muestra o esconde algo que se queda en el DOM (un ítem de la statusbar, un
 * botón que aparece según el estado). `hidden` a secas es display:none, que no
 * se anima: el elemento aparecía y desaparecía de golpe. El elemento lleva una
 * clase de entrada (.ox-in-fade): al volver de display:none su animación
 * arranca de nuevo, y la salida es la regla [data-state='closing'] de esa clase.
 */
export function alternar(el, visible, { fallback = 200 } = {}) {
  if (!el) return;
  if (visible) {
    if (el.dataset.state === 'closing') delete el.dataset.state;   // se arrepintió a mitad de salida
    el.hidden = false;
    return;
  }
  if (el.hidden || el.dataset.state === 'closing') return;
  el.dataset.state = 'closing';
  let timer = 0;
  const fin = (e) => {
    if (e && e.target !== el) return;       // la de un hijo también burbujea
    el.removeEventListener('animationend', fin);
    clearTimeout(timer);
    if (el.dataset.state !== 'closing') return;
    el.hidden = true;
    delete el.dataset.state;
  };
  el.addEventListener('animationend', fin);
  timer = setTimeout(fin, fallback);
}

/** Escalona los hijos de un contenedor seteando --i (el CSS lo usa de delay). */
export function stagger(container, selector = ':scope > *', step = 1) {
  container.querySelectorAll(selector).forEach((el, i) => {
    el.style.setProperty('--i', String(i * step));
  });
}

/* ── Click-flash ────────────────────────────────────────────────────────────
   Un velo de luz que nace con el press y decae. No viaja como un ripple de
   Material: solo confirma que el click llegó, y se limpia solo. */
export function initClickFlash(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const target = e.target.closest?.('.ox-flashable');
    if (!target || target.disabled) return;
    const flash = document.createElement('span');
    flash.className = 'ox-flash';
    target.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
  });
}

/* ── Esfumado del scroll ────────────────────────────────────────────────────
   Apaga el fade del lado donde no hay nada recortado: pegado arriba no se
   esfuma arriba. Sin esto el primer item vive a media luz sin razón. */
export function scrollFade(el) {
  if (!el || el.__vcFade) return;
  el.__vcFade = true;

  const update = () => {
    const slack = el.scrollHeight - el.clientHeight;
    if (slack <= 1) {                       // no hay nada que recortar
      el.classList.add('is-top', 'is-bottom');
      el.classList.remove('is-stuck-head');
      return;
    }
    el.classList.toggle('is-top', el.scrollTop <= 1);
    el.classList.toggle('is-bottom', el.scrollTop >= slack - 1);
    // Un encabezado de tabla clavado contra el borde: su tabla ya empezó arriba
    // del borde y todavía no terminó. Ahí la línea es el límite y el fade sobra.
    const top = el.getBoundingClientRect().top;
    const stuck = [...el.querySelectorAll('.ox-table')].some((t) => {
      if (t.closest('.ox-scroll') !== el) return false;
      const r = t.getBoundingClientRect();
      return r.top < top - 1 && r.bottom > top;
    });
    el.classList.toggle('is-stuck-head', stuck);
  };

  el.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(el);
  // El contenido puede cambiar de alto sin que cambie el del contenedor.
  new MutationObserver(update).observe(el, { childList: true, subtree: true });
  update();
}

/** Aplica scrollFade a todo .ox-scroll que todavía no lo tenga. */
export function initScrollFades(root = document) {
  root.querySelectorAll('.ox-scroll').forEach(scrollFade);
}

/* ── Indicadores que viajan ─────────────────────────────────────────────────
   La cápsula del segmentado y el subrayado de los tabs se DESLIZAN entre
   opciones. Que viajen en vez de saltar es lo que los hace sentir físicos. */

/* La cápsula copia la geometría REAL de la opción activa, igual que el
   subrayado de los tabs. Antes se calculaba como ancho/n asumiendo opciones
   iguales, y en una celda de tabla no lo son: la cápsula caía corrida y el
   texto parecía descentrado. offsetLeft es relativo al segmentado (position:
   relative), así que ya incluye su padding. */
export function syncSegmented(seg) {
  const active = seg.querySelector('.ox-segmented__opt.is-active') || seg.querySelector('.ox-segmented__opt');
  if (!active) return;
  seg.style.setProperty('--seg-x', `${active.offsetLeft}px`);
  seg.style.setProperty('--seg-w', `${active.offsetWidth}px`);
}

export function syncTabs(tabs) {
  const active = tabs.querySelector('.ox-tab.is-active');
  if (!active) return;
  tabs.style.setProperty('--tab-x', `${active.offsetLeft}px`);
  tabs.style.setProperty('--tab-w', `${active.offsetWidth}px`);
}

/* Pone un indicador en su lugar sin que viaje: la transición se apaga, se
   mide, se fuerza el estilo y se vuelve a prender. Leer el estilo del pseudo
   es lo que asienta el valor; sin eso, al sacar la clase el navegador ve el
   cambio recién ahí y lo anima igual. */
function colocar(root, pseudo, fn) {
  root.classList.add('is-placing');
  fn();
  void getComputedStyle(root, pseudo).width;
  root.classList.remove('is-placing');
}

/**
 * Cablea un grupo (segmentado o tabs) para que se comporte solo.
 * onChange recibe el value del botón elegido.
 */
export function bindSwitcher(root, onChange) {
  const isSeg = root.classList.contains('ox-segmented');
  const optSel = isSeg ? '.ox-segmented__opt' : '.ox-tab';
  const pseudo = isSeg ? '::before' : '::after';
  const medir = () => (isSeg ? syncSegmented(root) : syncTabs(root));
  /* La primera medida no viaja: la cápsula nace donde va. Sin esto nacía en
     ancho 0 contra la izquierda y crecía, y como la vista se remonta entera al
     tocar un filtro, crecían todas a la vez. Si ya trae una posición (la que
     devolvió remontar()), viaja desde ahí: es la que se tocó. */
  let colocado = !!root.style.getPropertyValue(isSeg ? '--seg-w' : '--tab-w');
  const sync = () => {
    if (colocado) return medir();
    if (!root.offsetWidth) return;          // todavía sin layout: lo hace el ResizeObserver
    colocar(root, pseudo, medir);
    colocado = true;
  };

  root.addEventListener('click', (e) => {
    const opt = e.target.closest(optSel);
    if (!opt || opt.classList.contains('is-active')) return;
    root.querySelectorAll(optSel).forEach((o) => o.classList.remove('is-active'));
    opt.classList.add('is-active');
    sync();
    onChange?.(opt.dataset.value, opt);
  });

  sync();
  new ResizeObserver(sync).observe(root);
  raf2(sync);   // las fuentes pueden cambiar el ancho después del primer layout
  return sync;
}

/* ── Remontar la misma vista sin perder el lugar ─────────────────────────────
   Router.refresh() vuelve a pintar la vista entera: así los números nunca se
   desencuentran. Pero un innerHTML nuevo nace sin nada de lo que el viejo ya
   había hecho: el scroll volvía arriba, un revelado abierto se cerraba de
   golpe, el foco se perdía y las cápsulas arrancaban de cero. La foto se saca
   antes de pintar y se devuelve en dos tiempos: lo que la vista tiene que ver
   al cablearse (revelados e indicadores) apenas se pinta, y lo que depende
   del alto final (scroll y foco) cuando la vista terminó de montar. */

const INDICADORES = [
  { sel: '.ox-segmented', pseudo: '::before', x: '--seg-x', w: '--seg-w' },
  { sel: '.ox-tabs', pseudo: '::after', x: '--tab-x', w: '--tab-w' },
];
let foto = null;

function fotografiar(root) {
  const f = { scrolls: [], indicadores: new Map(), revelados: [], foco: null };
  root.querySelectorAll('.ox-scroll').forEach((el) => f.scrolls.push(el.scrollTop));
  for (const ind of INDICADORES) {
    root.querySelectorAll(`${ind.sel}[id]`).forEach((el) => {
      // Lo que se VE, no el destino: si la cápsula venía viajando, sigue desde ahí.
      const cs = getComputedStyle(el, ind.pseudo);
      const x = cs.transform && cs.transform !== 'none' ? new DOMMatrixReadOnly(cs.transform).m41 : 0;
      f.indicadores.set(el.id, { ind, x, w: parseFloat(cs.width) || 0 });
    });
  }
  root.querySelectorAll('.ox-reveal.is-open[id]').forEach((el) => f.revelados.push(el.id));
  const act = document.activeElement;
  const dueño = act && root.contains(act) ? act.closest('[id]') : null;
  // Se reconoce por su id o por el data-value dentro de un grupo con id; si
  // no, no hay forma honesta de encontrar su gemelo y el foco no se devuelve.
  if (dueño && root.contains(dueño) && (dueño === act || act.dataset.value != null)) {
    f.foco = { id: dueño.id, valor: dueño === act ? null : act.dataset.value };
  }
  return f;
}

/** Lo llama paint(): devuelve lo que la vista necesita ver al cablearse. */
export function devolverAlPintar(root) {
  if (!foto) return;
  for (const id of foto.revelados) root.querySelector(`#${CSS.escape(id)}`)?.classList.add('is-open');
  for (const [id, { ind, x, w }] of foto.indicadores) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (!el?.matches(ind.sel) || !w) continue;
    colocar(el, ind.pseudo, () => {
      el.style.setProperty(ind.x, `${x}px`);
      el.style.setProperty(ind.w, `${w}px`);
    });
  }
}

/** Vuelve a montar lo que hay en root con `montar()`, sin perder el lugar. */
export function remontar(root, montar) {
  foto = fotografiar(root);
  const f = foto;
  try {
    montar();
  } finally {
    foto = null;
  }
  const scrolls = root.querySelectorAll('.ox-scroll');
  f.scrolls.forEach((top, i) => { if (scrolls[i] && top) scrolls[i].scrollTop = top; });
  if (f.foco && (!document.activeElement || document.activeElement === document.body)) {
    const dueño = root.querySelector(`#${CSS.escape(f.foco.id)}`);
    const el = f.foco.valor != null
      ? dueño?.querySelector(`[data-value="${CSS.escape(f.foco.valor)}"]`)
      : dueño;
    el?.focus({ preventScroll: true });
  }
}

/* ── Campo numérico ─────────────────────────────────────────────────────────
   El spinner de `<input type=number>` es de Chromium y está tapado en el CSS.
   Esto le devuelve las flechas, ya dibujadas por nosotros.

   El input NO se reemplaza: sigue siendo el dueño del valor, del foco y del
   teclado. Por eso cada paso despacha `input` Y `change` con bubbles — quien
   escuchaba al campo antes de tener flechas sigue funcionando sin tocar nada.

   Mantener apretado repite, y acelera: un campo de copias que llega a 50 de a
   un click por vez no lo usa nadie. */

const ESPERA = 380;    // antes de empezar a repetir: distingue click de aguante
const PASO_LENTO = 110;
const PASO_RAPIDO = 45;
const ACELERA_A = 1200;   // ms aguantando antes de pasar a rápido

/**
 * Cablea un `.ox-stepper` (input + dos flechas).
 * onChange recibe el valor numérico ya acotado a min/max.
 */
export function bindStepper(root, onChange) {
  const input = root?.querySelector('input[type="number"]');
  if (!input) return () => {};

  const num = (attr, fallback) => {
    const v = parseFloat(input.getAttribute(attr));
    return Number.isFinite(v) ? v : fallback;
  };

  const leer = () => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? v : num('min', 0);
  };

  /** Los topes se releen en cada paso: el max suele depender de otra cosa. */
  const acotar = (v) => Math.min(num('max', Infinity), Math.max(num('min', -Infinity), v));

  const sync = () => {
    const v = leer();
    const arriba = root.querySelector('[data-step="up"]');
    const abajo = root.querySelector('[data-step="down"]');
    if (arriba) arriba.disabled = v >= num('max', Infinity);
    if (abajo) abajo.disabled = v <= num('min', -Infinity);
  };

  function mover(dir) {
    const antes = leer();
    const v = acotar(antes + dir * num('step', 1));
    if (v === antes) { sync(); return false; }
    input.value = String(v);
    sync();
    // bubbles: los listeners suelen estar en el contenedor, no en el input.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    onChange?.(v, input);
    return true;
  }

  let timer = null;
  const frenar = () => { clearTimeout(timer); timer = null; };

  function arrancar(dir, desde) {
    const transcurrido = Date.now() - desde;
    if (!mover(dir)) { frenar(); return; }
    timer = setTimeout(() => arrancar(dir, desde), transcurrido > ACELERA_A ? PASO_RAPIDO : PASO_LENTO);
  }

  root.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn || btn.disabled) return;
    e.preventDefault();                 // que el campo no pierda el foco
    const dir = btn.dataset.step === 'up' ? 1 : -1;
    mover(dir);
    const desde = Date.now();
    timer = setTimeout(() => arrancar(dir, desde), ESPERA);
    /* La captura del puntero es lo que hace que soltar CUENTE aunque el dedo se
       haya ido del botón. Sin esto, arrastrar afuera deja el contador corriendo
       para siempre. */
    btn.setPointerCapture?.(e.pointerId);
  });

  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    root.addEventListener(ev, frenar);
  }

  input.addEventListener('input', sync);
  sync();
  return sync;
}

/* ── Revelado de alto (grid 0fr → 1fr) ───────────────────────────────────── */
export function toggleReveal(el, open) {
  const next = open ?? !el.classList.contains('is-open');
  el.classList.toggle('is-open', next);
  return next;
}

/* ── Números que cuentan ────────────────────────────────────────────────────
   Un contador que salta de 0 a 1284 no se lee; uno que corre, sí. */
export function countTo(el, to, { from = 0, duration = 700, format = (n) => n } = {}) {
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(Math.round(from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Marca un valor que acaba de cambiar: destella y vuelve. */
export function tick(el) {
  el.classList.remove('ox-ticked');
  void el.offsetWidth;          // reinicia la animación
  el.classList.add('ox-ticked');
}
