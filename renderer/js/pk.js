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
    // Una combinación no tiene una cantidad sola: sus tomas no entran acá.
    if (d.cantidad != null && d.cantidad !== '') cantidades.push(Number(d.cantidad));
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

/* ── Combinaciones ───────────────────────────────────────────────────────────
   Una combinación es una sustancia más, con `componentes` (de 2 a 3): tiene su
   propio perfil, sus curvas y sus episodios. Su toma guarda la cantidad de
   cada componente con la unidad copiada, igual que una toma simple.

   Lo que la combinación NO hace es entrar en el perfil de sus componentes: el
   pico de Zolpidem + Midazolam no es del zolpidem, y mezclarlo le correría la
   mediana del onset al zolpidem solo. Donde sí cuenta es en lo que se tomó —
   el esquema del día y las series de Gráficos—, y para eso está aportesDe. */

export const MAX_COMPONENTES = 3;

export const esCombinacion = (s) => Array.isArray(s?.componentes) && s.componentes.length > 0;

/**
 * Las tomas de una sustancia más lo que aportó dentro de combinaciones, como
 * tomas virtuales sin hitos (llevan `combinacion` con el id de la mezcla).
 */
export function aportesDe(sustanciaId, dosis) {
  const out = [];
  for (const d of dosis) {
    if (d.sustanciaId === sustanciaId) { out.push(d); continue; }
    for (const c of d.componentes || []) {
      if (c.sustanciaId !== sustanciaId) continue;
      out.push({ id: d.id, sustanciaId, at: d.at, cantidad: c.cantidad, unidad: c.unidad, via: d.via, hitos: [], combinacion: d.sustanciaId });
    }
  }
  return out;
}

/* ── Esquema ─────────────────────────────────────────────────────────────────
   La medicación de base: una sustancia puede tener un esquema fijo (N tomas
   por día) o a demanda, y un rango por toma opcional. El rango es un dato, no
   un límite: Apex no bloquea ni advierte una toma fuera de él. */

export const MODOS_ESQUEMA = [
  { id: 'fijo',    label: 'Fijo' },
  { id: 'demanda', label: 'A demanda' },
];

/** El esquema limpio, o null si la sustancia no tiene uno válido. */
export function normalizarEsquema(e) {
  if (!e || !MODOS_ESQUEMA.some((m) => m.id === e.modo)) return null;
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v));
  let min = num(e.min); let max = num(e.max);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return {
    modo: e.modo,
    tomasDia: e.modo === 'fijo' ? Math.max(1, Math.round(num(e.tomasDia) ?? 1)) : null,
    min,
    max,
  };
}

/**
 * Cómo va el esquema de una sustancia en el día de `ahora`: cuántas tomas
 * hubo (contando las de combinaciones), cuánto suma, y si el fijo se cumplió.
 * La suma solo cuenta lo que está en la unidad de la sustancia.
 */
export function esquemaDelDia(s, dosis, ahora = Date.now()) {
  const e = normalizarEsquema(s?.esquema);
  if (!e) return null;
  const desde = inicioDia(ahora);
  const hasta = sumarDias(desde, 1);
  const hoy = aportesDe(s.id, dosis).filter((d) => d.at >= desde && d.at < hasta).sort((a, b) => a.at - b.at);
  const total = hoy.filter((d) => d.unidad === s.unidad).reduce((n, d) => n + (Number(d.cantidad) || 0), 0);
  return {
    ...e,
    hechas: hoy.length,
    total,
    unidad: s.unidad,
    tomas: hoy,
    completo: e.modo === 'fijo' ? hoy.length >= e.tomasDia : null,
  };
}

/* ── Stock ───────────────────────────────────────────────────────────────────
   Un ingreso es una compra o una entrega: tantos envases de tantas unidades,
   cada unidad con su carga (150 mg por comprimido). Los ingresos de la misma
   droga con la misma carga se suman en un solo stock, sin importar marca ni
   envase: 150 mg de armodafinilo son 150 mg de armodafinilo. Con otra carga
   es otro stock.

   Las tomas descuentan solo a partir del primer ingreso de ese stock: lo que
   pasó antes no se compró acá. Una toma de 300 mg con comprimidos de 150 son
   dos unidades; una de 75, media. */

export const unidadesIngreso = (i) => (Number(i.unidadesPorEnvase) || 0) * (Number(i.envases) || 0);

/**
 * De qué carga sale una toma cuando hay más de una: la que la cubre con un
 * número entero de unidades y la menor cantidad de ellas; si ninguna es
 * exacta, la más grande que no se pasa; si todas se pasan, la más chica.
 */
export function cargaParaToma(cantidad, cargas) {
  const c = [...new Set(cargas.map(Number))].filter((x) => x > 0);
  const q = Number(cantidad);
  if (!c.length || !(q > 0)) return null;
  const exactas = c.filter((x) => Math.abs(q / x - Math.round(q / x)) < 1e-9);
  if (exactas.length) return Math.max(...exactas);
  const menores = c.filter((x) => x <= q);
  return menores.length ? Math.max(...menores) : Math.min(...c);
}

/**
 * Los stocks: uno por sustancia + carga + unidad, con lo ingresado, lo
 * consumido (en unidades, puede ser fraccionario) y lo que queda. Una toma que
 * trae `carga` (elegida a mano en el diálogo) sale de ese stock si existe; si
 * no, de cargaParaToma. Lo tomado dentro de combinaciones también descuenta.
 */
export function stocks(ingresos, dosis) {
  const pools = new Map();
  for (const i of ingresos) {
    const carga = Number(i.carga);
    if (!i.sustanciaId || !(carga > 0) || !Number.isFinite(Number(i.at))) continue;
    const clave = `${i.sustanciaId}|${carga}|${i.unidad}`;
    let p = pools.get(clave);
    if (!p) {
      p = { clave, sustanciaId: i.sustanciaId, carga, unidad: i.unidad, desde: i.at, ingresado: 0, consumido: 0, ingresos: [], tomas: [] };
      pools.set(clave, p);
    }
    p.desde = Math.min(p.desde, i.at);
    p.ingresado += unidadesIngreso(i);
    p.ingresos.push(i);
  }

  const lista = [...pools.values()];
  for (const id of new Set(lista.map((p) => p.sustanciaId))) {
    const propios = lista.filter((p) => p.sustanciaId === id);
    for (const d of aportesDe(id, dosis)) {
      const cant = Number(d.cantidad);
      if (!(cant > 0)) continue;
      const candidatos = propios.filter((p) => p.unidad === d.unidad && p.desde <= d.at);
      if (!candidatos.length) continue;
      let p = !d.combinacion && d.carga != null ? candidatos.find((x) => x.carga === Number(d.carga)) : null;
      if (!p) {
        const c = cargaParaToma(cant, candidatos.map((x) => x.carga));
        p = candidatos.find((x) => x.carga === c);
      }
      const unidades = cant / p.carga;
      p.consumido += unidades;
      p.tomas.push({ id: d.id, at: d.at, cantidad: cant, unidades, combinacion: d.combinacion || null });
    }
  }
  return lista
    .map((p) => ({ ...p, restantes: p.ingresado - p.consumido, tomas: p.tomas.sort((a, b) => a.at - b.at) }))
    .sort((a, b) => a.sustanciaId.localeCompare(b.sustanciaId) || a.carga - b.carga);
}

/** La dosis diaria que dice el esquema fijo (tomas × habitual), o null. */
export function dosisDiariaEsquema(s) {
  const e = normalizarEsquema(s?.esquema);
  return e?.modo === 'fijo' && Number(s.dosisHabitual) > 0 ? e.tomasDia * Number(s.dosisHabitual) : null;
}

/**
 * Unidades por día al ritmo real: lo consumido de este stock en los últimos
 * `dias` días (o desde el primer ingreso, si es más reciente). Con menos de un
 * día de historia no hay ritmo que medir.
 */
export function ritmoReal(stock, ahora = Date.now(), dias = 30) {
  const desde = Math.max(stock.desde, ahora - dias * DIA);
  const lapso = (ahora - desde) / DIA;
  if (lapso < 1) return null;
  const u = stock.tomas.filter((t) => t.at >= desde && t.at <= ahora).reduce((n, t) => n + t.unidades, 0);
  return u / lapso;
}

/**
 * Hasta cuándo alcanza lo que queda a `porDia` unidades por día: la cantidad
 * de días enteros y el último día cubierto. null si no hay consumo.
 */
export function alcanza(restantes, porDia, ahora = Date.now()) {
  if (!(porDia > 0)) return null;
  const dias = Math.max(0, Math.floor(restantes / porDia + 1e-9));
  return { dias, hasta: sumarDias(inicioDia(ahora), dias) };
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
  // Una combinación no tiene unidad propia: sus tomas se cuentan.
  if (ds.length && ids.size === 1 && unidades.size === 1 && ds[0].unidad) {
    return { tipo: 'suma', total: ds.reduce((s, d) => s + (Number(d.cantidad) || 0), 0), unidad: ds[0].unidad, tomas: ds.length };
  }
  return { tipo: 'tomas', tomas: ds.length };
}
