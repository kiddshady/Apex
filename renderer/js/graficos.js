/* ═══════════════════════════════════════════════════════════════════════════
   APEX — gráficos

   SVG dibujado a mano, sin librerías: la app corre con CSP estricta y sin red,
   y un gráfico tiene que verse de la misma familia que el resto —los mismos
   tokens, el mismo acento, la misma tipografía—, cosa que ninguna librería
   hace sin pelear.

   Las reglas que siguen todos:
   · Un solo acento por gráfico. La serie principal es el acento; lo que es
     contexto va en gris. Nunca una paleta de colores por serie.
   · Marcas finas: línea de 2 px, puntos de 8 px con anillo del color de la
     superficie, área al 10 %. La grilla es un hairline sólido y recesivo.
   · El texto viste tokens de texto, nunca el color de la serie.
   · Todo gráfico tiene su hover: crosshair en las líneas, tooltip por celda
     en los mapas de calor. Y todo valor se puede leer también sin hover: el
     tooltip suma, no reemplaza.
   · Cada gráfico se redibuja al cambiar el ancho, y devuelve una función para
     dejar de observar — la vista la registra en Router.onLeave.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from './ui.js';
import { fmtQty, fmtDosis, fmtDiaCorto, fmtDiaSemana, fmtOffset, fmtMes, fmtDiaSemanaNombre } from './format.js';
import { nivel, inicioDia, interpolar, faseInfo, HORA } from './pk.js';

/* Lunes primero, como el calendario. fmtDiaSemanaNombre cuenta desde domingo. */
const DIA_L = (j, largo = false) => fmtDiaSemanaNombre((j + 1) % 7, largo);
const p2 = (n) => String(n).padStart(2, '0');
const plural = (n, s, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

/* ── Redibujar al cambiar el ancho ───────────────────────────────────────── */

export function observarAncho(el, dibujar) {
  let ancho = 0;
  let raf = 0;
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (!w || Math.abs(w - ancho) < 2) return;
    ancho = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => dibujar(w));
  });
  ro.observe(el);
  const w0 = el.clientWidth;
  if (w0) { ancho = w0; dibujar(w0); }
  return () => { ro.disconnect(); cancelAnimationFrame(raf); };
}

/* ── Utilidades ──────────────────────────────────────────────────────────── */

/** Ticks redondos: 0 / 50 / 100 / 150 en vez de 0 / 37 / 74 / 111. */
function ticksLindos(max, n = 4, enteros = false) {
  if (!(max > 0)) return [0, 1];
  const crudo = max / n;
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const cand = [1, 2, 2.5, 5, 10].map((c) => c * pot);
  let paso = cand.find((c) => c >= crudo) || cand[cand.length - 1];
  if (enteros) paso = Math.max(1, Math.round(paso));
  const top = Math.ceil(max / paso - 1e-9) * paso;
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += paso) out.push(+v.toFixed(6));
  return out;
}

const r1 = (n) => (Math.round(n * 10) / 10).toString();

function vacio(el, texto, alto) {
  el.innerHTML = `<div class="ap-chart__vacio" style="height:${alto}px">${esc(texto)}</div>`;
}

/* El tooltip flotante de los gráficos de líneas. Se posiciona con transform y
   se recorta a los bordes del propio gráfico. */
function tipDe(el) {
  let t = el.querySelector(':scope > .ap-chart__tip');
  if (!t) {
    t = document.createElement('div');
    t.className = 'ap-chart__tip';
    el.appendChild(t);
  }
  return t;
}

function colocarTip(el, t, x, y) {
  t.classList.add('is-on');
  const W = el.clientWidth;
  const tw = t.offsetWidth; const th = t.offsetHeight;
  const left = Math.max(0, Math.min(W - tw, x - tw / 2));
  let top = y - th - 12;
  if (top < 0) top = y + 14;
  t.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function tipHTML(valor, etiqueta) {
  return `<span class="ap-chart__tip__val">${esc(valor)}</span><span class="ap-chart__tip__lab">${esc(etiqueta)}</span>`;
}

/* ══ Líneas: una serie por día ═══════════════════════════════════════════════ */

/**
 * grafLinea(el, { puntos: [{ x: ms, y, extra? }], unidad, enteros })
 * Una sola serie: el título de la tarjeta dice qué es, no hace falta leyenda.
 */
export function grafLinea(el, o) {
  el.classList.add('ap-chart');
  return observarAncho(el, (W) => dibujarLinea(el, W, o));
}

function dibujarLinea(el, W, { puntos = [], unidad = '', enteros = false, sinDatos = 'Sin tomas en este rango' }) {
  const H = 230;
  const m = { t: 20, r: 20, b: 30, l: 48 };
  const pw = Math.max(10, W - m.l - m.r);
  const ph = H - m.t - m.b;
  const n = puntos.length;
  const max = Math.max(0, ...puntos.map((p) => Number(p.y) || 0));
  if (!n || max <= 0) return vacio(el, sinDatos, H);

  const ticks = ticksLindos(max, 4, enteros);
  const top = ticks[ticks.length - 1] || 1;
  const X = (i) => m.l + (n > 1 ? (i / (n - 1)) * pw : pw / 2);
  const Y = (v) => m.t + ph - (v / top) * ph;
  const f = (v) => (unidad ? fmtDosis(v, unidad) : fmtQty(v));
  const fTick = (v) => (enteros ? String(v) : fmtQty(v));

  let grilla = '';
  for (const v of ticks) {
    const y = r1(Y(v));
    grilla += `<line class="ap-grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`
      + `<text class="ap-tick ap-tick--num" x="${m.l - 8}" y="${r1(Y(v) + 3.5)}" text-anchor="end">${esc(fTick(v))}</text>`;
  }

  // Etiquetas del eje X repartidas, siempre con la primera y la última.
  const k = Math.max(2, Math.min(n, Math.floor(pw / 84) + 1));
  const idx = new Set();
  for (let j = 0; j < k; j++) idx.add(Math.round((j * (n - 1)) / (k - 1)));
  let ejeX = '';
  for (const i of idx) {
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    ejeX += `<text class="ap-tick" x="${r1(X(i))}" y="${H - 9}" text-anchor="${anchor}">${esc(fmtDiaCorto(puntos[i].x))}</text>`;
  }

  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${r1(X(i))} ${r1(Y(p.y))}`).join('');
  const area = n > 1 ? `${d}L${r1(X(n - 1))} ${r1(Y(0))}L${r1(X(0))} ${r1(Y(0))}Z` : '';
  const puntosSVG = n <= 130
    ? puntos.map((p, i) => (p.y > 0 ? `<circle class="ap-punto" cx="${r1(X(i))}" cy="${r1(Y(p.y))}" r="3.5"/>` : '')).join('')
    : '';

  // Una sola etiqueta directa: el máximo. El resto lo dice el eje y el hover.
  const iMax = puntos.findIndex((p) => p.y === max);
  const lx = X(iMax);
  const anchorMax = lx < m.l + 36 ? 'start' : lx > W - m.r - 36 ? 'end' : 'middle';
  const etiqueta = `<text class="ap-etiqueta" x="${r1(lx)}" y="${r1(Y(max) - 10)}" text-anchor="${anchorMax}">${esc(f(max))}</text>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    ${grilla}${ejeX}
    <line class="ap-eje" x1="${m.l}" x2="${W - m.r}" y1="${r1(Y(0))}" y2="${r1(Y(0))}"/>
    ${area ? `<path class="ap-area" d="${area}"/>` : ''}
    <path class="ap-linea" d="${d}"/>
    ${puntosSVG}${etiqueta}
    <line class="ap-cursor" data-cursor x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}"/>
    <circle class="ap-cursor__punto" data-cursor-punto r="4.5"/>
  </svg>`;

  /* El crosshair encuentra el día: se apunta a una fecha, no a una línea de 2 px. */
  const svg = el.querySelector('svg');
  const cursor = svg.querySelector('[data-cursor]');
  const cp = svg.querySelector('[data-cursor-punto]');
  const t = tipDe(el);
  const ocultar = () => { cursor.style.opacity = 0; cp.style.opacity = 0; t.classList.remove('is-on'); };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n > 1 ? Math.round(((px - m.l) / pw) * (n - 1)) : 0;
    if (i < 0 || i >= n) return ocultar();
    const p = puntos[i];
    const x = X(i); const y = Y(p.y);
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.style.opacity = 1;
    cp.setAttribute('cx', x); cp.setAttribute('cy', y); cp.style.opacity = 1;
    t.innerHTML = tipHTML(f(p.y), fmtDiaSemana(p.x) + (p.extra ? ` · ${p.extra}` : ''));
    colocarTip(el, t, x, y);
  });
  svg.addEventListener('pointerleave', ocultar);
}

/* ══ Mapa de calor: calendario ═══════════════════════════════════════════════
   Semanas en columnas, días en filas, y el color es la magnitud: una sola
   tonalidad —el acento— de menos a más. Cada celda lleva su tooltip
   declarativo (data-tip), que es el de Onyx. */

export function grafCalendario(el, o) {
  el.classList.add('ap-chart', 'ap-chart--heat');
  return observarAncho(el, (W) => dibujarCalendario(el, W, o));
}

function descCelda(c, unidad, metrica) {
  const dia = fmtDiaSemana(c.dia);
  if (!c.tomas) return `${dia} · sin tomas`;
  if (metrica === 'tomas' || !unidad) return `${dia} · ${plural(c.tomas, 'toma')}`;
  return `${dia} · ${fmtDosis(c.total, unidad)} · ${plural(c.tomas, 'toma')}`;
}

function leyendaNiveles() {
  return `<div class="ap-leyenda"><span>menos</span>${[0, 1, 2, 3, 4]
    .map((n) => `<span class="ap-leyenda__celda" data-nivel="${n}"></span>`).join('')}<span>más</span></div>`;
}

function dibujarCalendario(el, W, { semanas = [], max = 0, unidad = '', metrica = 'total', hoy = Date.now(), sinDatos = 'Sin tomas en este rango' }) {
  const nSem = semanas.length;
  if (!nSem || !max) return vacio(el, sinDatos, 140);

  const labelW = 24; const gap = 3; const topH = 18;
  const celda = Math.max(9, Math.min(17, Math.floor((W - labelW - (nSem - 1) * gap) / nSem)));
  const ancho = labelW + nSem * celda + (nSem - 1) * gap;
  const H = topH + 7 * celda + 6 * gap + 2;
  const hoyIni = inicioDia(hoy);

  let meses = '';
  let mesPrev = -1; let ultimoX = -Infinity;
  semanas.forEach((sem, i) => {
    const mes = new Date(sem[0].dia).getMonth();
    if (mes === mesPrev) return;
    mesPrev = mes;
    const x = labelW + i * (celda + gap);
    // Dos rótulos pegados se pisan: si el mes cambia a la semana siguiente,
    // gana el nuevo y el primero se calla.
    const proximoCambia = i + 1 < nSem && new Date(semanas[i + 1][0].dia).getMonth() !== mes;
    if (x - ultimoX < 30 || (i === 0 && proximoCambia && nSem > 2)) return;
    ultimoX = x;
    meses += `<text class="ap-tick" x="${x}" y="${topH - 7}">${esc(fmtMes(mes))}</text>`;
  });

  let dias = '';
  const cadaDia = celda >= 13 ? 1 : 2;
  for (let j = 0; j < 7; j += cadaDia) {
    dias += `<text class="ap-tick" x="${labelW - 8}" y="${r1(topH + j * (celda + gap) + celda / 2 + 3.5)}" text-anchor="end">${DIA_L(j).charAt(0).toUpperCase()}</text>`;
  }

  let celdas = '';
  semanas.forEach((sem, i) => sem.forEach((c, j) => {
    const x = labelW + i * (celda + gap);
    const y = topH + j * (celda + gap);
    const cls = `ap-heat__celda${c.enRango ? '' : ' is-fuera'}${c.dia === hoyIni ? ' is-hoy' : ''}`;
    celdas += `<rect class="${cls}" x="${x}" y="${y}" width="${celda}" height="${celda}" rx="3"`
      + ` data-nivel="${nivel(c.valor, max)}" data-tip="${esc(descCelda(c, unidad, metrica))}" data-tip-side="top"/>`;
  }));

  el.style.overflowX = ancho > W ? 'auto' : '';
  el.innerHTML = `<svg viewBox="0 0 ${ancho} ${H}" width="${ancho}" height="${H}" aria-hidden="true">${meses}${dias}${celdas}</svg>${leyendaNiveles()}`;
}

/* ══ Mapa de calor: día de la semana × hora ══════════════════════════════════
   Cuándo se toma, no cuánto: cada celda cuenta tomas. */

export function grafSemanaHora(el, o) {
  el.classList.add('ap-chart', 'ap-chart--heat');
  return observarAncho(el, (W) => dibujarSemanaHora(el, W, o));
}

function dibujarSemanaHora(el, W, { matriz = [], max = 0, sinDatos = 'Sin tomas en este rango' }) {
  if (!max || matriz.length !== 7) return vacio(el, sinDatos, 140);
  const labelW = 32; const gap = 3; const topH = 18; const cols = 24;
  const celda = Math.max(8, Math.min(24, Math.floor((W - labelW - (cols - 1) * gap) / cols)));
  const alto = Math.max(12, Math.min(18, celda));
  const ancho = labelW + cols * celda + (cols - 1) * gap;
  const H = topH + 7 * alto + 6 * gap + 2;

  let horas = '';
  for (let h = 0; h < 24; h += 6) {
    horas += `<text class="ap-tick ap-tick--num" x="${labelW + h * (celda + gap)}" y="${topH - 7}">${p2(h)}</text>`;
  }
  let dias = '';
  for (let j = 0; j < 7; j++) {
    dias += `<text class="ap-tick" x="${labelW - 8}" y="${r1(topH + j * (alto + gap) + alto / 2 + 3.5)}" text-anchor="end">${esc(DIA_L(j))}</text>`;
  }
  let celdas = '';
  matriz.forEach((fila, j) => fila.forEach((v, h) => {
    const x = labelW + h * (celda + gap);
    const y = topH + j * (alto + gap);
    const desc = `${DIA_L(j, true)} · ${p2(h)}:00 a ${p2((h + 1) % 24)}:00 · ${v ? plural(v, 'toma') : 'sin tomas'}`;
    celdas += `<rect class="ap-heat__celda" x="${x}" y="${y}" width="${celda}" height="${alto}" rx="3"`
      + ` data-nivel="${nivel(v, max)}" data-tip="${esc(desc)}" data-tip-side="top"/>`;
  }));

  el.style.overflowX = ancho > W ? 'auto' : '';
  el.innerHTML = `<svg viewBox="0 0 ${ancho} ${H}" width="${ancho}" height="${H}" aria-hidden="true">${horas}${dias}${celdas}</svg>${leyendaNiveles()}`;
}

/* ══ Curvas de intensidad: el perfil farmacocinético ═════════════════════════
   X = horas desde la toma, Y = intensidad 0–10. Con varios episodios es un
   gráfico de ÉNFASIS: cada episodio en gris fino, la mediana en el acento.
   Con uno solo, la curva es el acento y cada hito lleva su fase escrita. */

export function grafCurvas(el, o) {
  el.classList.add('ap-chart');
  return observarAncho(el, (W) => dibujarCurvas(el, W, o));
}

function pasoHoras(tMax) {
  if (tMax <= 3) return 0.5;
  if (tMax <= 8) return 1;
  if (tMax <= 16) return 2;
  if (tMax <= 36) return 4;
  if (tMax <= 96) return 12;
  return 24;
}

function dibujarCurvas(el, W, { curvas = [], mediana = [], sinDatos = 'Todavía no hay hitos con intensidad' }) {
  const H = 240;
  const m = { t: 20, r: 26, b: 30, l: 36 };
  const pw = Math.max(10, W - m.l - m.r);
  const ph = H - m.t - m.b;
  if (!curvas.length) return vacio(el, sinDatos, H);

  const tMax = Math.max(1, ...curvas.map((c) => c.puntos[c.puntos.length - 1].t), ...mediana.map((p) => p.t));
  const paso = pasoHoras(tMax);
  const topT = Math.ceil(tMax / paso - 1e-9) * paso;
  const X = (t) => m.l + (t / topT) * pw;
  const Y = (i) => m.t + ph - (i / 10) * ph;
  const sola = curvas.length === 1 && !mediana.length;

  let grilla = '';
  for (const v of [0, 5, 10]) {
    grilla += `<line class="ap-grid" x1="${m.l}" x2="${W - m.r}" y1="${r1(Y(v))}" y2="${r1(Y(v))}"/>`
      + `<text class="ap-tick ap-tick--num" x="${m.l - 8}" y="${r1(Y(v) + 3.5)}" text-anchor="end">${v}</text>`;
  }
  let ejeX = '';
  for (let t = 0; t <= topT + 1e-9; t += paso) {
    const anchor = t === 0 ? 'start' : t >= topT - 1e-9 ? 'end' : 'middle';
    ejeX += `<text class="ap-tick ap-tick--num" x="${r1(X(t))}" y="${H - 9}" text-anchor="${anchor}">${esc(t ? fmtOffset(t * HORA, { signo: false }) : '0')}</text>`;
  }

  let trazos = '';
  let marcas = '';
  for (const c of curvas) {
    const d = c.puntos.map((p, i) => `${i ? 'L' : 'M'}${r1(X(p.t))} ${r1(Y(p.i))}`).join('');
    trazos += `<path class="ap-curva${sola ? ' ap-curva--sola' : ''}" d="${d}"/>`;
    let ultimoLabelX = -Infinity; let arriba = true;
    for (const p of c.puntos) {
      if (p.t === 0) continue;
      marcas += `<circle class="ap-curva__pt${sola ? ' ap-curva__pt--sola' : ''}" cx="${r1(X(p.t))}" cy="${r1(Y(p.i))}" r="${sola ? 4 : 2.5}"/>`;
      if (!sola) continue;
      // En modo «un episodio» cada hito dice su fase. Si dos quedan pegados,
      // el segundo baja para no pisarse.
      const x = X(p.t);
      arriba = x - ultimoLabelX < 46 ? !arriba : true;
      ultimoLabelX = x;
      const anchor = x > W - m.r - 40 ? 'end' : 'start';
      const dx = anchor === 'end' ? -8 : 8;
      marcas += `<text class="ap-curva__lab" x="${r1(x + dx)}" y="${r1(Y(p.i) + (arriba ? -8 : 14))}" text-anchor="${anchor}">${esc(faseInfo(p.fase).label)}</text>`;
    }
  }
  if (mediana.length) {
    const d = mediana.map((p, i) => `${i ? 'L' : 'M'}${r1(X(p.t))} ${r1(Y(p.i))}`).join('');
    trazos += `<path class="ap-curva ap-curva--media" d="${d}"/>`;
    const fin = mediana[mediana.length - 1];
    const anchor = X(fin.t) > W - m.r - 56 ? 'end' : 'start';
    marcas += `<text class="ap-curva__lab" x="${r1(X(fin.t) + (anchor === 'end' ? -6 : 6))}" y="${r1(Y(fin.i) - 6)}" text-anchor="${anchor}">mediana</text>`;
  }

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    ${grilla}${ejeX}
    <line class="ap-eje" x1="${m.l}" x2="${W - m.r}" y1="${r1(Y(0))}" y2="${r1(Y(0))}"/>
    ${trazos}${marcas}
    <line class="ap-cursor" data-cursor x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}"/>
  </svg>${mediana.length ? `<div class="ap-leyenda">
    <span class="ap-leyenda__linea"></span><span>${esc(plural(curvas.length, 'episodio'))}</span>
    <span class="ap-leyenda__linea ap-leyenda__linea--acento"></span><span>mediana</span>
  </div>` : ''}`;

  const svg = el.querySelector('svg');
  const cursor = svg.querySelector('[data-cursor]');
  const t = tipDe(el);
  const ocultar = () => { cursor.style.opacity = 0; t.classList.remove('is-on'); };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < m.l || px > W - m.r) return ocultar();
    const th = ((px - m.l) / pw) * topT;
    const x = X(th);
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.style.opacity = 1;
    let valor; let etiqueta = `+${fmtOffset(th * HORA, { signo: false })}`;
    if (sola) {
      const v = interpolar(curvas[0].puntos, th);
      valor = v == null ? 'sin dato' : `${fmtQty(Math.round(v * 10) / 10)} / 10`;
    } else {
      const cerca = mediana.reduce((a, p) => (Math.abs(p.t - th) < Math.abs(a.t - th) ? p : a), mediana[0] || null);
      if (cerca && Math.abs(cerca.t - th) <= 0.3) {
        valor = `${fmtQty(Math.round(cerca.i * 10) / 10)} / 10`;
        etiqueta += ` · mediana de ${plural(cerca.n, 'episodio')}`;
      } else {
        const vivos = curvas.filter((c) => interpolar(c.puntos, th) != null).length;
        valor = vivos ? plural(vivos, 'episodio') : 'sin dato';
      }
    }
    t.innerHTML = tipHTML(valor, etiqueta);
    colocarTip(el, t, x, m.t + 10);
  });
  svg.addEventListener('pointerleave', ocultar);
}
