/* ═══════════════════════════════════════════════════════════════════════════
   APEX — estado compartido

   Vive aparte de `app.js` por una razón concreta: `app.js` importa las vistas y
   las vistas necesitan tocar el estado. Si el estado viviera en `app.js`, cada
   vista tendría que importarlo de vuelta y el ciclo de imports se arregla solo
   hasta el día que deja de hacerlo.

   Es un espejo en memoria de lo que hay en disco. Las vistas leen de acá y
   nunca hacen IPC para dibujarse: si cada repintado pidiera los datos de
   nuevo, navegar entre vistas parpadearía. Cada escritura pasa por acá, así el
   espejo y el disco nunca se desencuentran.
   ═══════════════════════════════════════════════════════════════════════════ */

import { relTime, fmtDosis, fmtQty } from './format.js';
import { esc, path as rutaHTML } from './ui.js';
import { estadoDosis, esCombinacion, normalizarEsquema } from './pk.js';

export const api = window.onyx;
export const apex = window.apex;

const colSustancias = api.col('sustancias');
const colDosis = api.col('dosis');

export const S = {
  info: null,
  ajustes: {},
  sustancias: [],
  dosis: [],           // siempre de la más reciente a la más vieja
  ultimoGuardado: null,
};

const porFechaDesc = (a, b) => (b.at || 0) - (a.at || 0);
const porNombre = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');

export async function cargarTodo() {
  const [info, ajustes, sustancias, dosis] = await Promise.all([
    api.info(), api.settings.get(), colSustancias.list(), colDosis.list(),
  ]);
  S.info = info;
  S.ajustes = ajustes;
  S.sustancias = sustancias.sort(porNombre);
  S.dosis = dosis.sort(porFechaDesc);
}

/* ── Lecturas ────────────────────────────────────────────────────────────── */

export const sustancia = (id) => S.sustancias.find((s) => s.id === id) || null;
export const dosis = (id) => S.dosis.find((d) => d.id === id) || null;
export const dosisDe = (sustanciaId) => S.dosis.filter((d) => d.sustanciaId === sustanciaId);
export const activas = () => S.sustancias.filter((s) => !s.archivada);

export function nombreSustancia(id) {
  return sustancia(id)?.nombre || 'Sustancia eliminada';
}

/** La cantidad de una toma: «200 mg», o en una combinación «10 mg + 7,5 mg»
    (en el orden de los componentes, que es el del nombre). */
export function cantidadDosis(d) {
  if (d.componentes?.length) return d.componentes.map((c) => fmtDosis(c.cantidad, c.unidad)).join(' + ');
  return fmtDosis(d.cantidad, d.unidad);
}

/** La dosis habitual de una sustancia en texto, o '' si no tiene. */
export function habitualSustancia(s) {
  if (esCombinacion(s)) {
    return s.componentes.map((c) => fmtDosis(c.cantidad, sustancia(c.sustanciaId)?.unidad || '')).join(' + ');
  }
  return Number(s?.dosisHabitual) > 0 ? fmtDosis(s.dosisHabitual, s.unidad) : '';
}

/** «Fijo · 2 por día · 150–300 mg por toma» · «A demanda · desde 200 mg» */
export function textoEsquema(s) {
  const e = normalizarEsquema(s?.esquema);
  if (!e) return '';
  const u = s.unidad || '';
  const rango = e.min != null && e.max != null
    ? (e.min === e.max ? fmtDosis(e.min, u) : `${fmtQty(e.min)}–${fmtDosis(e.max, u)}`)
    : e.min != null ? `desde ${fmtDosis(e.min, u)}` : e.max != null ? `hasta ${fmtDosis(e.max, u)}` : '';
  return [
    e.modo === 'fijo' ? `Fijo · ${e.tomasDia === 1 ? '1 por día' : `${e.tomasDia} por día`}` : 'A demanda',
    rango ? `${rango} por toma` : null,
  ].filter(Boolean).join(' · ');
}

/** Las combinaciones que llevan a esta sustancia adentro. */
export const combinacionesCon = (id) => S.sustancias.filter((s) => esCombinacion(s) && s.componentes.some((c) => c.sustanciaId === id));

/** «Modafinilo 200 mg» · «Zolpidem + Midazolam 10 mg + 7,5 mg» */
export function etiquetaDosis(d) {
  return `${nombreSustancia(d.sustanciaId)} ${cantidadDosis(d)}`;
}

/** Los episodios todavía abiertos (sin «fin», en las últimas 24 h). */
export function enCurso(ahora = Date.now()) {
  return S.dosis.filter((d) => estadoDosis(d, ahora) === 'running');
}

/* ── Escrituras ──────────────────────────────────────────────────────────── */

function tocar() {
  S.ultimoGuardado = Date.now();
  pintarChrome();
}

export async function guardarSustancia(s) {
  const ahora = Date.now();
  const item = { ...s, createdAt: s.createdAt || ahora, updatedAt: ahora };
  if (!item.id) item.id = await colSustancias.nextId('s');
  await colSustancias.save(item);
  S.sustancias = [...S.sustancias.filter((x) => x.id !== item.id), item].sort(porNombre);
  tocar();
  return item;
}

export async function borrarSustancia(id) {
  await colSustancias.remove(id);
  S.sustancias = S.sustancias.filter((x) => x.id !== id);
  tocar();
}

export async function guardarDosis(d) {
  const ahora = Date.now();
  const item = { ...d, hitos: d.hitos || [], createdAt: d.createdAt || ahora, updatedAt: ahora };
  if (!item.id) item.id = await colDosis.nextId('d');
  await colDosis.save(item);
  S.dosis = [...S.dosis.filter((x) => x.id !== item.id), item].sort(porFechaDesc);
  tocar();
  return item;
}

export async function borrarDosis(id) {
  await colDosis.remove(id);
  S.dosis = S.dosis.filter((x) => x.id !== id);
  tocar();
}

export async function guardarAjustes(patch) {
  S.ajustes = await api.settings.save(patch);
  tocar();
  return S.ajustes;
}

/* ── Chrome: lo que vive fuera de la vista ───────────────────────────────── */

function set(id, valor) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(valor)) el.textContent = String(valor);
}

export function pintarChrome() {
  set('cuenta-dosis', S.dosis.length);
  set('cuenta-sustancias', activas().length);
  set('stat-dosis', S.dosis.length);

  const ult = S.dosis[0];
  const ultEl = document.querySelector('#stat-ultima .ox-statusbar__value');
  if (ultEl) ultEl.textContent = ult ? `${etiquetaDosis(ult)} · ${relTime(ult.at)}` : '—';

  const curso = enCurso();
  const cursoEl = document.getElementById('stat-curso');
  if (cursoEl) {
    cursoEl.hidden = !curso.length;
    cursoEl.querySelector('.ox-statusbar__value').textContent = String(curso.length);
  }

  const guardado = document.querySelector('#stat-guardado .ox-statusbar__value');
  if (guardado) guardado.textContent = S.ultimoGuardado ? relTime(S.ultimoGuardado) : '—';

  /* La carpeta de datos, recortada por el medio: en un rail de 224px no entra
     entera ninguna ruta, y la cola es lo único que dice de cuál se trata. */
  const dir = S.info?.dataDir || '';
  const foot = document.getElementById('rail-foot');
  if (foot) foot.innerHTML = dir ? `<div class="ox-meta" data-tip="${esc(dir)}">${rutaHTML(dir)}</div>` : '';
}

/** El contexto del centro de la titlebar: la vista lo pone, el router lo borra. */
export function setContexto(html = '') {
  const ctx = document.getElementById('titlebar-context');
  if (ctx) ctx.innerHTML = html;
}
