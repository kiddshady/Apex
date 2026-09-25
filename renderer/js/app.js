/* ═══════════════════════════════════════════════════════════════════════════
   APEX — arranque y shell

   Acá se cablea lo que vive fuera de las vistas: los controles de ventana, el
   rail, la delegación global de clicks y el teclado.
   Las vistas están en `vistas/`, el estado en `tienda.js`, los diálogos en
   `dialogos.js`.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import './iconos-apex.js';
import { Tooltip, Menu } from './overlays.js';
import Router from './router.js';
import { initClickFlash, initScrollFades, raf2 } from './motion.js';
import { paint, empty, colorToken, copy, setStateLabels } from './ui.js';
import { designHTML, wireDesign } from './design-view.js';
import { S, api, cargarTodo, pintarChrome, dosis as tomarDosis, sustancia, setContexto } from './tienda.js';
import {
  dialogoDosis, dialogoSustancia, dialogoCombinacion, dialogoHito, dialogoIngreso,
  dialogoReserva, dialogoSalida,
  menuDosis, menuSustancia, menuIngreso, menuReserva, menuSalida, confirmarBorrarDosis,
} from './dialogos.js';
import { initActualizacion } from './actualizacion.js';

import { vistaInicio } from './vistas/inicio.js';
import { vistaRegistro } from './vistas/registro.js';
import { vistaDosis } from './vistas/dosis.js';
import { vistaSustancias, vistaSustancia } from './vistas/sustancias.js';
import { vistaGraficos } from './vistas/graficos.js';
import { vistaStock } from './vistas/stock.js';
import { vistaReservas } from './vistas/reservas.js';
import { vistaAjustes } from './vistas/ajustes.js';
import { viewEl, head } from './ui.js';

/* ══ Vistas ══════════════════════════════════════════════════════════════════ */

function vistaPiezas() {
  setContexto('');
  paint(head({
    title: 'Piezas',
    sub: 'Todos los primitivos del sistema, vivos',
    actions: `<button class="ox-btn ox-btn--ghost ox-flashable" id="replay">${Icons.svg('retry')} Repetir entradas</button>`,
  }) + designHTML());
  wireDesign(viewEl());
  document.getElementById('replay')?.addEventListener('click', () => {
    const body = document.getElementById('design-body');
    if (!body) return;
    body.style.animation = 'none';
    void body.offsetWidth;
    body.style.animation = 'ox-glide-in 420ms var(--ox-ease) both';
  });
}

Router.define({
  inicio: { view: vistaInicio },
  registro: { view: vistaRegistro },
  dosis: { view: vistaDosis, nav: 'registro' },          // el detalle sigue iluminando Registro
  sustancias: { view: vistaSustancias },
  sustancia: { view: vistaSustancia, nav: 'sustancias' },
  stock: { view: vistaStock },
  reservas: { view: vistaReservas },
  graficos: { view: vistaGraficos },
  piezas: { view: vistaPiezas },
  ajustes: { view: vistaAjustes },
}, document.getElementById('view'));

/* ══ Acciones ════════════════════════════════════════════════════════════════
   Las que se disparan desde varios lugares. Después de cada una la vista
   actual se remonta: el espejo en memoria ya cambió y hay que dibujarlo. */

async function registrar(sustanciaId = null) {
  const d = await dialogoDosis({ sustanciaId });
  if (d) Router.go('dosis', d.id) || Router.refresh();
}

async function nuevaSustancia() {
  const s = await dialogoSustancia();
  if (s) Router.go('sustancia', s.id) || Router.refresh();
}

async function nuevaCombinacion() {
  const s = await dialogoCombinacion();
  if (s) Router.go('sustancia', s.id) || Router.refresh();
}

async function registrarIngreso(sustanciaId = null) {
  if (await dialogoIngreso({ sustanciaId })) Router.name === 'stock' ? Router.refresh() : Router.go('stock');
}

async function nuevaReserva(sustanciaId = null) {
  if (await dialogoReserva({ sustanciaId })) Router.name === 'reservas' ? Router.refresh() : Router.go('reservas');
}

async function salidaReserva(id, tipo) {
  if (await dialogoSalida(id, tipo)) Router.refresh();
}

async function agregarHito(id) {
  const d = tomarDosis(id);
  if (!d) return;
  if (await dialogoHito(d)) Router.refresh();
}

/* ══ Shell ═══════════════════════════════════════════════════════════════════ */

function cablearShell() {
  const w = api.win;
  document.getElementById('win-min').addEventListener('click', () => w.minimize());
  document.getElementById('win-close').addEventListener('click', () => w.close());
  const maxBtn = document.getElementById('win-max');
  maxBtn.addEventListener('click', () => w.toggleMaximize());
  w.onMaximized((isMax) => {
    maxBtn.innerHTML = Icons.svg(isMax ? 'winRestore' : 'winMax');
    maxBtn.setAttribute('aria-label', isMax ? 'Restaurar' : 'Maximizar');
  });

  document.querySelectorAll('.ox-navitem').forEach((b) =>
    b.addEventListener('click', () => Router.go(b.dataset.view)));
  document.getElementById('btn-registrar').addEventListener('click', () => registrar());

  /* Delegación global, cableada UNA vez sobre document: las vistas se repintan
     enteras, y enganchar esto en #view lo acumularía en cada visita. */
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) return Router.go(goto.dataset.goto, goto.dataset.param || null);

    const cp = e.target.closest('[data-copy]');
    if (cp) return copy(cp.dataset.copy);

    const trigger = e.target.closest('[data-menu]');
    if (trigger) {
      e.stopPropagation();
      const arg = trigger.dataset.menuArg;
      const menus = { dosis: menuDosis, sustancia: menuSustancia, ingreso: menuIngreso, reserva: menuReserva, salida: menuSalida };
      const items = menus[trigger.dataset.menu]?.(arg, { despues: () => Router.refresh() }) || null;
      if (items) Menu.show(trigger, items, { align: 'end' });
      return;
    }

    const hito = e.target.closest('[data-hito]');
    if (hito) return agregarHito(hito.dataset.hito);

    const rapida = e.target.closest('[data-rapida]');
    if (rapida) return registrar(rapida.dataset.rapida);

    const sust = e.target.closest('[data-sust]');
    if (sust && !e.target.closest('[data-menu], [data-rapida]')) return Router.go('sustancia', sust.dataset.sust);

    const open = e.target.closest('[data-open]');
    if (open && !e.target.closest('[data-menu], [data-hito]')) return Router.go('dosis', open.dataset.open);

    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'registrar') registrar();
      else if (a === 'nueva-sustancia') nuevaSustancia();
      else if (a === 'nueva-combinacion') nuevaCombinacion();
      else if (a === 'registrar-ingreso') registrarIngreso(act.dataset.arg || null);
      else if (a === 'nueva-reserva') nuevaReserva(act.dataset.arg || null);
      else if (a === 'pasar-stock') salidaReserva(act.dataset.arg, 'stock');
      else if (a === 'entregar-reserva') salidaReserva(act.dataset.arg, 'entrega');
      else if (a === 'eliminar-dosis') {
        confirmarBorrarDosis(act.dataset.arg).then((ok) => {
          if (!ok) return;
          Router.name === 'dosis' && Router.param === act.dataset.arg ? Router.go('registro') : Router.refresh();
        });
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    // Enter o Espacio sobre una fila: la lista tiene que ser usable sin mouse.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest) {
      const row = e.target.closest('[data-open], [data-sust]');
      if (row && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
        e.preventDefault();
        if (row.dataset.open) Router.go('dosis', row.dataset.open);
        else Router.go('sustancia', row.dataset.sust);
        return;
      }
    }
    // Ctrl+N registra: es la acción de la app, y merece la tecla.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (!document.querySelector('.ox-modal')) registrar();
    }
  });
}

/* ══ Color de la ventana ═════════════════════════════════════════════════════
   --ox-bg está en oklch y Electron solo entiende hex. La traducción la hace
   colorToken() con un canvas, no un regex: parseando el texto, la app le
   mandaba VERDE a su propia ventana. */
function sincronizarColor() {
  const hex = colorToken('--ox-bg');
  if (hex) api.win.setBackground(hex);
}

/* ══ Arranque ════════════════════════════════════════════════════════════════ */

async function boot() {
  Icons.mount(document);
  Tooltip.init();
  initClickFlash();
  initScrollFades();
  setStateLabels({ running: 'En curso', done: 'Cerrado', idle: 'Sin cerrar' });
  cablearShell();
  sincronizarColor();
  initActualizacion();

  try {
    await cargarTodo();
  } catch (err) {
    paint(empty({ icon: 'alert', title: 'No se pudo iniciar', text: err.message }));
    console.error(err);
    return;
  }

  pintarChrome();
  Router.onChange(() => pintarChrome());
  Router.go('inicio');

  // El splash se va recién cuando ya hay algo pintado debajo.
  raf2(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.style.opacity = '0';
    splash.addEventListener('transitionend', () => splash.remove(), { once: true });
    setTimeout(() => splash.remove(), 600);
  });
}

boot();

// Para depurar desde la consola y para el test de humo.
window.__apex = { S, Router, sustancia, tomarDosis };
