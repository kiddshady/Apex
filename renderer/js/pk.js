/* ═══════════════════════════════════════════════════════════════════════════
   APEX — farmacocinética personal (cálculo puro)

   Todo lo que se deriva de las tomas y sus hitos vive acá, sin DOM y sin IPC,
   para poder probarlo con Node pelado. Las vistas y los gráficos solo
   dibujan lo que este módulo devuelve.

   Vocabulario:
     toma / dosis  → una ingesta: qué, cuánto, cuándo.
     hito          → un checkpoint dentro del episodio: onset, pico, plateau,
                     mermando, fin, o una nota suelta. Lleva su hora, y
                     opcionalmente una intensidad de 0 a 10.
     episodio      → la toma con sus hitos, leídos como una curva en el tiempo.
     perfil        → lo que se repite entre episodios de la misma sustancia:
                     cuánto tarda en pegar, cuándo pica, cuánto dura.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MIN = 60_000;
export const HORA = 3_600_000;
export const DIA = 86_400_000;

/* ── Fases ───────────────────────────────────────────────────────────────── */

export const FASES = [
  { id: 'onset',   label: 'Onset',    icono: 'faseOnset',   conIntensidad: true,  desc: 'Empieza a sentirse' },
  { id: 'pico',    label: 'Pico',     icono: 'fasePico',    conIntensidad: true,  desc: 'Efecto máximo' },
  { id: 'plateau', label: 'Plateau',  icono: 'fasePlateau', conIntensidad: true,  desc: 'Se mantiene' },
  { id: 'baja',    label: 'Mermando', icono: 'faseBaja',    conIntensidad: true,  desc: 'El efecto cede' },
  { id: 'fin',     label: 'Fin',      icono: 'faseFin',     conIntensidad: false, desc: 'De vuelta a la base' },
  { id: 'nota',    label: 'Nota',     icono: 'faseNota',    conIntensidad: false, desc: 'Una observación suelta' },
];

export const faseInfo = (id) => FASES.find((f) => f.id === id) || FASES[FASES.length - 1];

/** Las fases que arman la curva (todas menos la nota). */
export const FASES_CURVA = FASES.filter((f) => f.id !== 'nota').map((f) => f.id);

export function ordenarHitos(hitos = []) {
  return [...hitos].sort((a, b) => (a.at || 0) - (b.at || 0));
}

/**
 * El estado de un episodio, con las palabras del sistema de estado de Onyx:
 *   running → sin «fin» y dentro de las últimas 24 h: todavía está pasando.
 *   done    → tiene un hito de fin, o pasó el día entero sin un solo hito.
 *   idle    → viejo, con hitos y sin cierre: quedó abierto por la mitad.
 *
 * Que la toma SIN hitos se cierre sola es a propósito. Pasadas las 24 h ya no
 * hay episodio que seguir, y «sin cerrar» prometía un cierre que nunca iba a
 * llegar: nadie vuelve a marcarle el fin a una toma de anteayer que jamás
 * registró nada. Con hitos y sin «fin» sí queda abierta — ahí alguien estaba
 * siguiendo el episodio y lo dejó por la mitad, y eso hay que verlo.
 */
export function estadoDosis(d, ahora = Date.now()) {
  const hitos = d.hitos || [];
  if (hitos.some((h) => h.fase === 'fin')) return 'done';
  if (ahora - d.at < 24 * HORA) return 'running';
  return hitos.length ? 'idle' : 'done';
}

/* ── Días ────────────────────────────────────────────────────────────────────
   Todo en hora LOCAL: una toma a las 23:30 es de ese día, no del siguiente en
   UTC. Se suma con setDate y no con +86400000 para que el cambio de horario no
   corra los días. */

const p2 = (n) => String(n).padStart(2, '0');

export function inicioDia(ms) {
  const d = new Date(Number(ms));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sumarDias(ms, n) {
  const d = new Date(Number(ms));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function diaISO(ms) {
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Lunes = 0 … domingo = 6. */
export function diaSemana(ms) {
  return (new Date(Number(ms)).getDay() + 6) % 7;
}

export const RANGOS = [
  { id: '7d',   label: '7 días',  dias: 7 },
  { id: '30d',  label: '30 días', dias: 30 },
  { id: '90d',  label: '90 días', dias: 90 },
  { id: '1a',   label: '1 año',   dias: 365 },
  { id: 'todo', label: 'Todo',    dias: null },
];

/**
 * Los límites de un rango, en ms: desde las 00:00 del primer día hasta el
 * final de hoy. «Todo» arranca en la primera toma que haya (y nunca menos de
 * una semana, para que un gráfico con una sola toma no sea un punto suelto).
 */
export function rango(id, dosis = [], ahora = Date.now()) {
  const hoy = inicioDia(ahora);
  const hasta = sumarDias(hoy, 1) - 1;
  const r = RANGOS.find((x) => x.id === id) || RANGOS[1];
  if (r.dias) return { id: r.id, desde: sumarDias(hoy, -(r.dias - 1)), hasta };
  const primera = dosis.reduce((m, d) => Math.min(m, Number(d.at) || Infinity), Infinity);
  const desde = Number.isFinite(primera) ? inicioDia(primera) : sumarDias(hoy, -29);
  return { id: 'todo', desde: Math.min(desde, sumarDias(hoy, -6)), hasta };
}

export const enRango = (d, { desde, hasta }) => d.at >= desde && d.at <= hasta;

/* ── Series ──────────────────────────────────────────────────────────────── */

/**
 * Un punto por día del rango, con ceros donde no hubo nada: un gráfico de
 * líneas necesita el eje completo, no solo los días con datos.
 * `metrica`: 'total' (suma de cantidades) o 'tomas' (cuántas).
 */
export function serieDiaria(dosis, { desde, hasta, metrica = 'total' }) {
  const mapa = new Map();
  for (const d of dosis) {
    if (!enRango(d, { desde, hasta })) continue;
    const k = inicioDia(d.at);
    const e = mapa.get(k) || { total: 0, tomas: 0 };
    e.total += Number(d.cantidad) || 0;
    e.tomas += 1;
    mapa.set(k, e);
  }
  const out = [];
  for (let t = inicioDia(desde); t <= hasta; t = sumarDias(t, 1)) {
    const e = mapa.get(t) || { total: 0, tomas: 0 };
    out.push({ dia: t, iso: diaISO(t), total: e.total, tomas: e.tomas, valor: metrica === 'tomas' ? e.tomas : e.total });
  }
  return out;
}

/**
 * La serie diaria acomodada en semanas de lunes a domingo, completando los
 * bordes. Los días de relleno vienen con `enRango:false` para pintarse
 * apagados.
 */
export function calendario(serie) {
  if (!serie.length) return { semanas: [], max: 0 };
  const lunes = (ms) => sumarDias(inicioDia(ms), -diaSemana(ms));
  const ini = lunes(serie[0].dia);
  const fin = sumarDias(lunes(serie[serie.length - 1].dia), 6);
  const porDiaMapa = new Map(serie.map((p) => [p.dia, p]));
  const semanas = [];
  let max = 0;
  for (let t = ini; t <= fin; t = sumarDias(t, 7)) {
    const sem = [];
    for (let i = 0; i < 7; i++) {
      const dia = sumarDias(t, i);
      const p = porDiaMapa.get(dia);
      sem.push({ dia, iso: diaISO(dia), valor: p ? p.valor : 0, total: p ? p.total : 0, tomas: p ? p.tomas : 0, enRango: !!p });
      if (p) max = Math.max(max, p.valor);
    }
    semanas.push(sem);
  }
  return { semanas, max };
}

/** El escalón de color de un valor: 0 = nada, 1..4 = de menos a más. */
export function nivel(valor, max) {
  if (!valor || !max) return 0;
  return Math.min(4, 1 + Math.floor((valor / max) * 3.999));
}

/** Cuántas tomas por día de la semana (lunes=0) y hora del día. */
export function semanaHora(dosis, { desde, hasta }) {
  const matriz = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let max = 0;
  for (const d of dosis) {
    if (!enRango(d, { desde, hasta })) continue;
    const f = diaSemana(d.at);
    const h = new Date(d.at).getHours();
    matriz[f][h] += 1;
    max = Math.max(max, matriz[f][h]);
  }
  return { matriz, max };
}

/* ── Curvas de un episodio ───────────────────────────────────────────────────
   Cada episodio con al menos un hito con intensidad se vuelve una curva
   intensidad(t), con t en horas desde la toma. La toma misma es el (0, 0):
   antes de tomar no hay efecto. Un «fin» sin intensidad vale 0. */

const conIntensidad = (h) => h.intensidad != null && h.intensidad !== '' && Number.isFinite(Number(h.intensidad));

export function curvas(lista) {
  const out = [];
  for (const d of lista) {
    const puntos = [{ t: 0, i: 0, fase: 'toma' }];
    const marcas = [];
    for (const h of ordenarHitos(d.hitos || [])) {
      const t = (h.at - d.at) / HORA;
      if (t < 0) continue;
      let i = conIntensidad(h) ? Number(h.intensidad) : null;
      if (i == null && h.fase === 'fin') i = 0;
      if (i == null) { marcas.push({ t, fase: h.fase }); continue; }
      puntos.push({ t, i, fase: h.fase });
      marcas.push({ t, fase: h.fase, i });
    }
    if (puntos.length < 2) continue;
    out.push({ id: d.id, at: d.at, cantidad: d.cantidad, unidad: d.unidad, puntos, marcas });
  }
  return out;
}

/**
 * Interpola una curva en t. Después del último punto: si la curva cerró en 0
 * (hubo fin), sigue en 0 — el efecto terminó; si quedó abierta, no se sabe y
 * devuelve null para no inventar.
 */
export function interpolar(puntos, t) {
  if (!puntos.length) return null;
  const ultimo = puntos[puntos.length - 1];
  if (t > ultimo.t) return ultimo.i === 0 ? 0 : null;
  for (let k = 1; k < puntos.length; k++) {
    const a = puntos[k - 1]; const b = puntos[k];
    if (t <= b.t) {
      if (b.t === a.t) return b.i;
      return a.i + (b.i - a.i) * ((t - a.t) / (b.t - a.t));
    }
  }
  return ultimo.i;
}

/**
 * La curva mediana de varios episodios, muestreada cada `paso` horas. Hace
 * falta más de un episodio: con uno solo la mediana ES la curva y dibujarla
 * dos veces confunde.
 */
export function curvaMediana(cs, paso = 0.25) {
  if (cs.length < 2) return [];
  const tMax = Math.max(...cs.map((c) => c.puntos[c.puntos.length - 1].t));
  const out = [];
  for (let t = 0; t <= tMax + 1e-9; t += paso) {
    const vals = [];
    for (const c of cs) {
      const v = interpolar(c.puntos, t);
      if (v != null) vals.push(v);
    }
    if (vals.length >= 2) out.push({ t: +t.toFixed(4), i: mediana(vals), n: vals.length });
  }
  return out;
}

/* ── Perfil ──────────────────────────────────────────────────────────────── */

export function mediana(nums) {
  const a = nums.map(Number).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function stats(arr) {
  const a = arr.map(Number).filter(Number.isFinite);
  if (!a.length) return { n: 0, mediana: null, min: null, max: null, media: null };
  return {
    n: a.length,
    mediana: mediana(a),
    min: Math.min(...a),
    max: Math.max(...a),
    media: a.reduce((s, v) => s + v, 0) / a.length,
  };
}

/**
 * Lo que se repite entre los episodios de una sustancia. Los tiempos van en
 * MINUTOS desde la toma, y de cada fase se toma el PRIMER hito de ese tipo
 * (si alguien marcó «pico» dos veces, el que importa es cuándo llegó).
 * La duración es fin − onset cuando hay onset, y fin − toma si no.
 */
export function perfil(lista) {
  const offsets = { onset: [], pico: [], plateau: [], baja: [], fin: [] };
  const duraciones = [];
  const picos = [];
  const cantidades = [];
  let conHitos = 0;

  for (const d of lista) {
    const hs = ordenarHitos(d.hitos || []);
    if (hs.length) conHitos += 1;
    cantidades.push(Number(d.cantidad));
    const primero = {};
    let picoI = null;
    for (const h of hs) {
      if (conIntensidad(h)) picoI = Math.max(picoI ?? -Infinity, Number(h.intensidad));
      if (!(h.fase in offsets)) continue;
      const min = (h.at - d.at) / MIN;
      if (min < 0 || primero[h.fase] != null) continue;
      primero[h.fase] = min;
      offsets[h.fase].push(min);
    }
    if (picoI != null && Number.isFinite(picoI)) picos.push(picoI);
    if (primero.fin != null) duraciones.push(primero.fin - (primero.onset ?? 0));
  }

  return {
    episodios: lista.length,
    conHitos,
    fases: Object.fromEntries(Object.entries(offsets).map(([k, v]) => [k, stats(v)])),
    duracion: stats(duraciones),
    intensidad: stats(picos),
    cantidad: stats(cantidades),
  };
}

/** Totales de una lista de tomas. */
export function totales(lista) {
  let total = 0; let ultima = null; let primera = null;
  for (const d of lista) {
    total += Number(d.cantidad) || 0;
    if (ultima == null || d.at > ultima) ultima = d.at;
    if (primera == null || d.at < primera) primera = d.at;
  }
  return { tomas: lista.length, total, ultima, primera };
}

/**
 * Las tomas agrupadas por día, de hoy hacia atrás, cada día con sus tomas de
 * la más reciente a la más vieja.
 */
export function porDia(lista) {
  const mapa = new Map();
  for (const d of lista) {
    const k = inicioDia(d.at);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(d);
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dia, ds]) => ({ dia, iso: diaISO(dia), dosis: ds.sort((a, b) => b.at - a.at) }));
}

/**
 * El resumen de un día: si todas las tomas son de la misma sustancia, la suma
 * con su unidad; si no, cuántas tomas hubo (sumar mg de una cosa con ml de
 * otra no significa nada).
 */
export function resumenDia(ds) {
  const ids = new Set(ds.map((d) => d.sustanciaId));
  const unidades = new Set(ds.map((d) => d.unidad));
  if (ds.length && ids.size === 1 && unidades.size === 1) {
    return { tipo: 'suma', total: ds.reduce((s, d) => s + (Number(d.cantidad) || 0), 0), unidad: ds[0].unidad, tomas: ds.length };
  }
  return { tipo: 'tomas', tomas: ds.length };
}
