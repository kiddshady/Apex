/* ═══════════════════════════════════════════════════════════════════════════
   APEX — el vigía del día
   La app queda abierta días seguidos, y las vistas calculan «hoy» al
   pintarse: Hoy, Esquema, Stock («alcanza desde hoy») y la tarjeta Hoy de cada
   sustancia se quedaban en el día en que se pintaron. Esto guarda qué día es y
   avisa cuando cambió; app.js revisa cada minuto y al recuperar el foco.

   Los diálogos abiertos no se tocan: su momento se toma al abrirlos y para
   corregirlo está el botón «Ahora».

   Puro: el reloj se inyecta, así se prueba la medianoche con node pelado.
   ═══════════════════════════════════════════════════════════════════════════ */

const pad2 = (n) => String(n).padStart(2, '0');

/** "aaaa-mm-dd" del día local de `ms`. */
export function claveDia(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function crearVigia(hoy = () => claveDia()) {
  let dia = hoy();
  const oyentes = new Set();
  return {
    get dia() { return dia; },

    /** `fn({ antes, ahora })` en cada cambio de día. Devuelve cómo soltarlo. */
    alCambiar(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },

    /** Mira el reloj. Si el día cambió, avisa y devuelve { antes, ahora };
        si no, null. Uno que falla no les corta el aviso a los demás. */
    revisar() {
      const ahora = hoy();
      if (ahora === dia) return null;
      const cambio = { antes: dia, ahora };
      dia = ahora;
      for (const fn of oyentes) {
        try { fn(cambio); } catch (err) { console.error(err); }
      }
      return cambio;
    },
  };
}

export const Dia = crearVigia();
