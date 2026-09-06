/* ═══════════════════════════════════════════════════════════════════════════
   APEX — actualizaciones (lado renderer)

   El proceso principal solo manda estados (ver src/actualizador.cjs); acá se
   decide cómo se ven. Tres lugares, y en ninguno un diálogo del sistema:

   · La statusbar: un ítem que aparece cuando hay algo que decir —se está
     descargando, o la nueva ya está lista— y que al tocarlo instala.
   · Un toast, una sola vez por versión, cuando la descarga terminó.
   · Ajustes: la versión, el estado en palabras, y los botones.

   El chequeo automático del arranque es silencioso: si estás al día no pasa
   nada. Solo el chequeo manual (desde Ajustes) contesta siempre.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';
import { Toast } from './overlays.js';
import Router from './router.js';
import { esc } from './ui.js';
import { fmtBytes, relTime } from './format.js';

const apex = window.apex;

let estado = { fase: 'inactivo', manual: false };
let avisada = null;                 // la versión que ya anunció el toast
const oyentes = new Set();

export function estadoActualizacion() { return estado; }

/** Avisa en cada cambio. Devuelve la función para dejar de escuchar. */
export function onActualizacion(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** El estado, en una frase para Ajustes. */
export function describirEstado(e = estado) {
  switch (e.fase) {
    case 'buscando': return 'Buscando…';
    case 'al-dia': return `Al día${e.revisado ? ` · revisado ${relTime(e.revisado)}` : ''}.`;
    case 'disponible': return `Hay una versión nueva, la ${e.nueva}. Se está descargando.`;
    case 'descargando': return `Descargando la ${e.nueva}: ${Math.round(e.progreso || 0)} %${e.velocidad ? ` · ${fmtBytes(e.velocidad)}/s` : ''}.`;
    case 'listo': return `La ${e.nueva} ya está descargada. Se instala al reiniciar.`;
    case 'error': return `No se pudo buscar: ${e.error || 'error desconocido'}.`;
    default:
      return e.motivo === 'dev'
        ? 'Las actualizaciones automáticas corren solo en la app instalada.'
        : 'Todavía no se buscó.';
  }
}

function pintarStatusbar() {
  const el = document.getElementById('stat-update');
  if (!el) return;
  const f = estado.fase;
  // El chequeo automático no se anuncia mientras busca: solo el manual.
  const visible = f === 'disponible' || f === 'descargando' || f === 'listo' || (f === 'buscando' && estado.manual);
  el.hidden = !visible;
  if (!visible) return;

  const texto = {
    buscando: 'buscando actualización…',
    disponible: `Apex ${estado.nueva} disponible`,
    descargando: `descargando ${estado.nueva}`,
    listo: `Reiniciar y actualizar a ${estado.nueva}`,
  }[f];
  el.classList.toggle('is-lista', f === 'listo');
  el.innerHTML = `${Icons.svg(f === 'listo' ? 'retry' : 'download')}<span class="ox-statusbar__value">${esc(texto)}</span>`
    + (f === 'descargando' ? `<span class="ox-meter" style="--ox-pct:${Math.round(estado.progreso || 0)}%"><span class="ox-meter__fill"></span></span>` : '');
  el.dataset.tip = f === 'listo'
    ? 'Cierra la app, instala la versión nueva y la vuelve a abrir'
    : f === 'descargando' ? `${Math.round(estado.progreso || 0)} %${estado.velocidad ? ` · ${fmtBytes(estado.velocidad)}/s` : ''}` : 'Ver en Ajustes';
}

function aplicar(e) {
  estado = e || { fase: 'inactivo', manual: false };
  pintarStatusbar();

  if (estado.fase === 'listo' && avisada !== estado.nueva) {
    avisada = estado.nueva;
    Toast.show({
      title: `Apex ${estado.nueva} está lista`,
      text: 'Se instala al reiniciar. Tocá el aviso de la barra de estado cuando quieras.',
      icon: 'download',
      duration: 9000,
    });
  } else if (estado.manual && estado.fase === 'al-dia') {
    Toast.show({ title: 'Estás al día', text: `La ${estado.version} es la última versión.`, icon: 'check' });
  } else if (estado.manual && estado.fase === 'error') {
    Toast.error('No se pudo buscar la actualización', estado.error);
  }
  for (const fn of oyentes) fn(estado);
}

export async function buscarActualizacion() {
  if (!apex?.actualizacion) return estado;
  try {
    aplicar(await apex.actualizacion.buscar());
  } catch (err) {
    aplicar({ ...estado, fase: 'error', error: err.message, manual: true });
  }
  return estado;
}

export function instalarActualizacion() {
  apex?.actualizacion?.instalar();
}

/** Una vez, al arrancar. */
export async function initActualizacion() {
  if (!apex?.actualizacion) return;
  document.getElementById('stat-update')?.addEventListener('click', () => {
    if (estado.fase === 'listo') instalarActualizacion();
    else Router.go('ajustes');
  });
  apex.actualizacion.onEstado(aplicar);
  try {
    aplicar(await apex.actualizacion.estado());
  } catch {
    aplicar({ fase: 'inactivo', manual: false });
  }
}
