/* ═══════════════════════════════════════════════════════════════════════════
   Humo de Apex: monta la app de verdad y la recorre.

   Se corre con `npm run humo` (necesita Electron, por eso no está en el
   `npm test`, que es node pelado).

   Recorre el flujo entero POR LA INTERFAZ, no por la API: crea una sustancia
   en su diálogo, registra una toma en el suyo, le anota tres hitos, y después
   mira que el registro, el perfil, los gráficos y el mapa de calor digan lo
   mismo que se cargó. La regla que lo guía: **medí dónde CAE una cosa y qué
   DICE, no solo si existe**.

   Corre sobre una carpeta de datos temporal (APEX_DATA): nunca toca la real.
   ═══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(os.tmpdir(), `apex-humo-${process.pid}`);
process.env.APEX_DATA = DATA;

const { app, BrowserWindow } = require('electron');
const W = 1440; const H = 900;

const BG_MAIN = (fs.readFileSync(path.join(ROOT, 'main.cjs'), 'utf8')
  .match(/const BG = '(#[0-9a-f]{6})'/i)?.[1] || '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const limpiar = () => { try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* nada */ } };
const bail = (w, e) => { console.log(`ABORTADO ${w}`, e?.stack || e || ''); limpiar(); app.exit(3); };
process.on('unhandledRejection', (e) => bail('rechazo', e));
process.on('uncaughtException', (e) => bail('excepción', e));
setTimeout(() => bail('timeout de 150s'), 150000);

app.whenReady().then(async () => {
  const ipc = require(path.join(ROOT, 'src', 'ipc.cjs'));
  ipc.register();

  const win = new BrowserWindow({
    x: -20000, y: -20000, width: W, height: H,
    frame: false, show: false, paintWhenInitiallyHidden: true, backgroundColor: '#000',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true },
  });
  const errores = [];
  win.webContents.on('console-message', (e) => { if (e.level >= 2) errores.push(`${e.level}: ${e.message}`); });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.show();
  await sleep(2200);

  const js = (c) => win.webContents.executeJavaScript(c);
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.click(); return true; })()`);
  const tap = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
    el.click(); return true; })()`);
  const texto = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim() ?? null`);
  const cuenta = (sel) => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const existe = (sel) => js(`!!document.querySelector(${JSON.stringify(sel)})`);
  /* Escribir en un campo como lo haría una persona: valor + evento input, que
     es lo que escuchan los campos de fecha/hora para formatear y validar. */
  const escribir = (sel, valor) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return false; el.value = ${JSON.stringify(String(valor))};
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const primario = async () => { const r = await click('.ox-modal__foot .ox-btn--primary'); await sleep(900); return r; };
  const primarioApagado = () => js(`document.querySelector('.ox-modal__foot .ox-btn--primary')?.disabled ?? null`);
  const menuItem = async (label) => {
    const r = await js(`(() => { const it = [...document.querySelectorAll('.ox-menuitem')].find(b => b.textContent.trim() === ${JSON.stringify(label)});
      if (!it) return false; it.click(); return true; })()`);
    await sleep(700);
    return r;
  };
  const rect = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    const r = el.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), b: Math.round(r.bottom), r: Math.round(r.right), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }; })()`);

  console.log('\n1. Arranque');
  ok('el splash se fue', !(await existe('#boot-splash')));
  ok('el shell está montado', await existe('.ox-titlebar') && await existe('.ox-rail'));
  ok('los <i data-icon> se reemplazaron por SVG', !(await existe('i[data-icon]')));
  ok('la vista inicial pintó algo', (await js(`document.getElementById('view').children.length`)) > 0);
  ok('la marca es la de Apex, no el octágono', (await js(`document.querySelector('.ox-brand__mark path').getAttribute('d')`)).startsWith('M2.2 12.4C'));
  ok('sin datos, Hoy ofrece crear una sustancia', await existe('[data-action="nueva-sustancia"]'));
  ok('los datos van a la carpeta temporal', (await js(`window.onyx.info().then(i => i.dataDir)`)) === DATA, DATA);

  console.log('\n2. Crear una sustancia por su diálogo');
  await click('[data-action="nueva-sustancia"]');
  await sleep(600);
  ok('el diálogo abre', await existe('.ox-modal'));
  ok('con el nombre vacío el primario está apagado', (await primarioApagado()) === true);
  await escribir('#f-nombre', 'Modafinilo');
  await escribir('#f-habitual', '200');
  ok('con nombre, el primario se prende', (await primarioApagado()) === false);
  await primario();
  const sust = await js(`window.onyx.col('sustancias').list().then(l => l.find(s => s.nombre === 'Modafinilo') || null)`);
  ok('quedó en disco con id, unidad y dosis habitual', sust?.id && sust.unidad === 'mg' && sust.dosisHabitual === 200, JSON.stringify(sust));
  ok('el router saltó a su perfil', await existe('.ox-inspector') && (await texto('.ox-viewhead__title')) === 'Modafinilo');
  ok('el rail cuenta una sustancia', (await texto('#cuenta-sustancias')) === '1');

  console.log('\n3. Registrar una toma por su diálogo');
  await click('#btn-registrar');
  await sleep(600);
  ok('el diálogo abre', await existe('.ox-modal'));
  ok('propone la sustancia', (await texto('#f-sust .ox-select__value')) === 'Modafinilo');
  ok('propone la dosis habitual', (await js(`document.querySelector('#f-cant').value`)) === '200');
  ok('y muestra su unidad', (await texto('#f-unidad')) === 'mg');
  ok('la fecha viene con hoy', /^\d{2}\/\d{2}\/\d{4}$/.test(await js(`document.querySelector('#f-momento-fecha').value`)));
  await escribir('#f-momento-hora', '1400');
  ok('1400 se formatea como 14:00', (await js(`document.querySelector('#f-momento-hora').value`)) === '14:00');
  await escribir('#f-cant', '0');
  ok('cantidad 0 apaga el primario', (await primarioApagado()) === true);
  await escribir('#f-cant', '200');
  await escribir('#f-notas', 'con café');
  ok('cantidad válida lo prende', (await primarioApagado()) === false);
  await primario();
  const dosis = await js(`window.onyx.col('dosis').list().then(l => l[0] || null)`);
  ok('quedó en disco', !!dosis?.id, JSON.stringify(dosis));
  ok('con cantidad, unidad y notas', dosis?.cantidad === 200 && dosis.unidad === 'mg' && dosis.notas === 'con café', JSON.stringify(dosis));
  ok('a las 14:00 de hoy, hora local', new Date(dosis?.at).getHours() === 14 && new Date(dosis.at).getMinutes() === 0);
  ok('el router abrió el detalle', await existe('#timeline .ap-hito--toma'));
  ok('la curva todavía no existe y lo dice', await existe('#curva .ap-chart__vacio'));
  ok('la statusbar cuenta la toma', (await texto('#stat-dosis')) === '1');
  ok('y la titlebar muestra el contexto', (await texto('#titlebar-context')).includes('Modafinilo 200 mg'));

  console.log('\n4. Los hitos: onset, pico, fin');
  await click('.ox-viewhead__actions [data-hito]');
  await sleep(600);
  ok('el diálogo de hito abre', await existe('.ox-modal'));
  ok('propone onset para la primera', await existe('.ap-fase.is-active[data-fase="onset"]'));
  ok('con intensidad prendida', await existe('#f-int-on.is-on'));
  await escribir('#f-momento-hora', '1330');
  ok('un hito ANTES de la toma apaga el primario', (await primarioApagado()) === true);
  ok('y lo dice', (await texto('#f-offset')).includes('Antes de la toma'));
  await escribir('#f-momento-hora', '1500');
  ok('a las 15:00 dice +1h', (await texto('#f-offset')).startsWith('+1h'));
  await escribir('#f-int', '4');
  ok('el slider pinta su valor', (await texto('#f-int-val')) === '4');
  await primario();
  let d = await js(`window.onyx.col('dosis').get(${JSON.stringify(dosis.id)})`);
  ok('el hito quedó en la toma', d?.hitos?.length === 1 && d.hitos[0].fase === 'onset' && d.hitos[0].intensidad === 4, JSON.stringify(d?.hitos));
  ok('la línea de tiempo tiene la toma y el hito', (await cuenta('#timeline .ap-hito')) === 2);
  ok('con su desplazamiento', (await texto('#timeline .ap-hito--onset .ap-hito__offset')) === '+1h');
  ok('y la curva ya se dibuja', await existe('#curva svg .ap-curva--sola'));

  await click('.ox-viewhead__actions [data-hito]');
  await sleep(600);
  ok('la segunda vez propone pico', await existe('.ap-fase.is-active[data-fase="pico"]'));
  await escribir('#f-momento-hora', '1630');
  await escribir('#f-int', '8');
  await escribir('#f-notas', 'foco total');
  await primario();

  await click('.ox-viewhead__actions [data-hito]');
  await sleep(600);
  ok('después del pico propone mermando', await existe('.ap-fase.is-active[data-fase="baja"]'));
  await click('.ap-fase[data-fase="fin"]');
  await sleep(200);
  ok('elegir fin apaga la intensidad', !(await existe('#f-int-on.is-on')));
  await escribir('#f-momento-hora', '2000');
  await primario();

  d = await js(`window.onyx.col('dosis').get(${JSON.stringify(dosis.id)})`);
  ok('tres hitos en disco, ordenados', d?.hitos?.map((h) => h.fase).join(',') === 'onset,pico,fin', JSON.stringify(d?.hitos?.map((h) => h.fase)));
  ok('el fin no lleva intensidad', d?.hitos?.[2].intensidad === null);
  ok('la línea de tiempo muestra los cuatro pasos', (await cuenta('#timeline .ap-hito')) === 4);
  const offsets = await js(`[...document.querySelectorAll('#timeline .ap-hito__offset')].map(e => e.textContent.trim())`);
  ok('con los desplazamientos correctos', JSON.stringify(offsets) === JSON.stringify(['0m', '+1h', '+2h 30m', '+6h']), JSON.stringify(offsets));
  ok('el estado pasó a cerrado', await existe('.ox-inspector .ox-status[data-state="done"]'));
  ok('la curva rotula sus fases', (await cuenta('#curva .ap-curva__lab')) === 3);
  ok('la nota del hito se ve', (await texto('#timeline .ap-hito--pico .ap-hito__notas')) === 'foco total');
  ok('la duración aparece en la cabecera', (await texto('.ap-cardchart .ox-card__head')).includes('duró 5 h'));

  console.log('\n5. Todas las vistas montan');
  for (const v of ['registro', 'sustancias', 'stock', 'reservas', 'graficos', 'piezas', 'ajustes', 'inicio']) {
    await click(`[data-view="${v}"]`);
    await sleep(700);
    const hijos = await js(`document.getElementById('view').children.length`);
    const activo = await existe(`[data-view="${v}"].is-active`);
    ok(`${v}: pinta y queda activa en el rail`, hijos > 0 && activo, `hijos=${hijos} activo=${activo}`);
  }

  console.log('\n6. Hoy');
  ok('cuenta la toma del día', (await texto('#k-hoy')) === '1');
  ok('ofrece el acceso rápido a la dosis habitual', (await texto('[data-rapida]')).includes('200 mg'));
  ok('la toma está en la lista de hoy', await existe(`[data-open="${dosis.id}"]`));

  console.log('\n7. Registro');
  await click('[data-view="registro"]');
  await sleep(700);
  ok('un día', (await cuenta('.ap-dia')) === 1);
  ok('el título del día dice Hoy', (await texto('.ap-dia__fecha')).startsWith('Hoy'));
  ok('el total del día suma con su unidad', (await texto('.ap-dia__total')) === '200 mg · 1 toma');
  ok('la fila dice sus hitos', (await texto('.ox-listitem__sub')).includes('3 hitos'));
  await tap('#f-sust');
  await sleep(400);
  ok('el filtro de sustancia abre su menú', await existe('.ox-menu'));
  ok('y ofrece la sustancia', await menuItem('Modafinilo'));
  ok('filtrado, la fila deja el nombre y queda la cantidad', (await texto('.ox-listitem__title')) === '200 mg');
  ok('y aparece el botón de quitar filtro', await existe('#f-limpiar'));
  await click('#f-limpiar');
  await sleep(600);

  console.log('\n8. Gráficos');
  await click('[data-view="graficos"]');
  await sleep(800);
  ok('con todas las sustancias, la métrica es tomas', (await texto('.ap-cardchart .ox-subtitle')) === 'Tomas por día');
  await tap('#f-sust');
  await sleep(400);
  await menuItem('Modafinilo');
  await sleep(300);
  ok('con una sustancia, la métrica pasa a dosis', (await texto('.ap-cardchart .ox-subtitle')) === 'Dosis por día');
  ok('la línea se dibuja', await existe('#linea svg .ap-linea'));
  ok('con su etiqueta directa en el máximo', (await texto('#linea .ap-etiqueta')) === '200 mg');
  ok('el eje Y es tabular y redondo', (await js(`[...document.querySelectorAll('#linea .ap-tick--num')].map(t => t.textContent)`)).includes('0'));
  /* El crosshair: se mueve el puntero sobre el gráfico y tiene que aparecer el
     tooltip con el valor. Se apunta al extremo derecho, que es hoy. */
  const lineaR = await rect('#linea svg');
  await js(`(() => { const svg = document.querySelector('#linea svg');
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: ${lineaR.r - 25}, clientY: ${lineaR.cy}, bubbles: true })); return true; })()`);
  await sleep(250);
  ok('el hover muestra el tooltip', await existe('#linea .ap-chart__tip.is-on'));
  ok('con el valor de hoy', (await texto('#linea .ap-chart__tip__val')) === '200 mg', await texto('#linea .ap-chart__tip__val'));
  ok('el cursor se prende', (await js(`document.querySelector('#linea [data-cursor]').style.opacity`)) === '1');
  ok('el mapa de calor es el calendario', (await cuenta('#mapa .ap-heat__celda')) % 7 === 0 && (await cuenta('#mapa .ap-heat__celda')) > 0);
  ok('hoy es la celda más oscura', await existe('#mapa .ap-heat__celda.is-hoy[data-nivel="4"]'));
  ok('con su tooltip declarativo', (await js(`document.querySelector('#mapa .ap-heat__celda.is-hoy').dataset.tip`)).includes('200 mg'));
  ok('la leyenda de niveles está', (await cuenta('#mapa .ap-leyenda__celda')) === 5);
  await click('#f-mapa [data-value="semana"]');
  await sleep(800);
  ok('semana × hora: 7 × 24 celdas', (await cuenta('#mapa .ap-heat__celda')) === 168);
  ok('con la toma a las 14', await existe('#mapa .ap-heat__celda[data-nivel="4"]'));
  await click('#f-mapa [data-value="calendario"]');
  await sleep(600);
  ok('la tabla gemela está cerrada', !(await existe('#tabla-wrap.is-open')));
  await click('#btn-tabla');
  await sleep(400);
  ok('y se abre con el botón', await existe('#tabla-wrap.is-open'));
  ok('con la misma fila', (await texto('#tabla-wrap tbody tr')).includes('200 mg'));
  ok('las cifras del rango coinciden', (await js(`[...document.querySelectorAll('.ap-kpis .ox-stat__value')].map(e => e.textContent.trim())`)).join('|').startsWith('1|200mg|1|1'), (await js(`[...document.querySelectorAll('.ap-kpis .ox-stat__value')].map(e => e.textContent.trim())`)).join('|'));

  console.log('\n9. El perfil de la sustancia');
  await js(`window.__apex.Router.go('sustancia', ${JSON.stringify(sust.id)}); true`);
  await sleep(800);
  const perfil = await js(`[...document.querySelectorAll('.ap-perfil__item')].map(i => ({ k: i.querySelector('.ap-perfil__k').textContent.trim(), v: i.querySelector('.ap-perfil__v').textContent.trim() }))`);
  const p = Object.fromEntries(perfil.map((x) => [x.k, x.v]));
  ok('onset a 1 h', p.Onset === '1 h', JSON.stringify(p));
  ok('pico a 2 h 30', p.Pico === '2 h 30 min', p.Pico);
  ok('fin a 6 h', p.Fin === '6 h', p.Fin);
  ok('duración del onset al fin: 5 h', p['Duración'] === '5 h', p['Duración']);
  ok('intensidad máxima 8', p['Intensidad máx.'] === '8 / 10', p['Intensidad máx.']);
  ok('plateau sin datos, dicho', p.Plateau === 'sin datos');
  ok('las curvas se dibujan (un episodio, en acento)', await existe('#curvas svg .ap-curva--sola'));
  ok('la tabla de episodios tiene la toma', (await cuenta('#curvas ~ * tbody tr, .ox-table tbody tr')) >= 1);
  ok('la fila de la tabla dice onset y duración', (await texto('.ox-table tbody tr')).includes('+1h') && (await texto('.ox-table tbody tr')).includes('5 h'));

  console.log('\n10. Overlays: dónde caen, no solo si existen');
  await click('[data-menu="sustancia"]');
  await sleep(400);
  const menu = await rect('.ox-menu');
  ok('el menú de la sustancia abre dentro de la ventana', menu && menu.t >= 0 && menu.l >= 0 && menu.b <= H && menu.r <= W, JSON.stringify(menu));
  ok('y ofrece archivar y eliminar', (await js(`[...document.querySelectorAll('.ox-menuitem')].map(b => b.textContent.trim())`)).join('|').includes('Archivar|Eliminar'));
  await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`);
  await sleep(400);

  ok('no queda el botón de comandos', !(await js(`document.querySelector('#btn-palette')`)));
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'K', modifiers: ['control'] });
  await sleep(200);
  ok('Ctrl+K no abre una paleta', !(await js(`document.querySelector('.ox-palette')`)));

  console.log('\n11. Eliminar pasa por confirmación');
  await js(`window.__apex.Router.go('dosis', ${JSON.stringify(dosis.id)}); true`);
  await sleep(700);
  await click('[data-action="eliminar-dosis"]');
  await sleep(500);
  ok('pide confirmación', await existe('.ox-modal'));
  ok('con el botón peligroso', await existe('.ox-modal__foot .ox-btn--danger-solid'));
  await click('[data-dismiss]'); await sleep(400);
  ok('cancelar no borra', (await js(`window.onyx.col('dosis').list().then(l => l.length)`)) === 1);

  console.log('\n12. Exportar');
  const csv = await ipc.armarCSV();
  ok('el CSV arranca con BOM', csv.charCodeAt(0) === 0xFEFF);
  const filas = csv.slice(1).trim().split('\r\n');
  ok('una cabecera, una toma y tres hitos', filas.length === 5, String(filas.length));
  ok('separado por punto y coma', filas[0].split(';').length === 12);
  ok('la fila del hito trae los minutos desde la toma', filas[2].includes('"onset";"60";"4"'), filas[2]);

  console.log('\n13. Los botones de solo ícono centran su contenido');
  await click('[data-view="piezas"]');
  await sleep(900);
  const descentrados = await js(`(() => {
    const malos = [];
    for (const b of document.querySelectorAll('button')) {
      if (b.children.length !== 1 || b.textContent.trim()) continue;
      const hijo = b.firstElementChild;
      if (hijo.tagName.toLowerCase() !== 'svg') continue;
      const rb = b.getBoundingClientRect(); const rh = hijo.getBoundingClientRect();
      if (!rb.width || !rh.width) continue;
      const d = ((rh.left + rh.right) / 2) - ((rb.left + rb.right) / 2);
      const desborda = rh.right > rb.right + 0.5 || rh.left < rb.left - 0.5;
      if (Math.abs(d) > 0.51 || desborda) malos.push({ clase: b.className.slice(0, 34), corrimiento: +d.toFixed(2), desborda });
    }
    return { malos, revisados: document.querySelectorAll('button').length };
  })()`);
  ok('ninguno tiene el ícono corrido ni desbordado', descentrados.malos.length === 0, JSON.stringify(descentrados.malos));

  console.log('\n14. Las reglas de oro');
  await click('[data-view="inicio"]');
  await sleep(700);
  const glifos = await js(`(() => {
    const malo = /[\\u2190-\\u21FF\\u2300-\\u23FF\\u25A0-\\u27BF\\u2B00-\\u2BFF\\uFE0F\\u{1F300}-\\u{1FAFF}]/u;
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (malo.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 40));
    return out;
  })()`);
  ok('cero emojis y glifos unicode en la UI', glifos.length === 0, JSON.stringify(glifos));
  ok('cero title= nativo', (await cuenta('[title]')) === 0);
  ok('cero <input type=date|time> nativos', (await cuenta('input[type="date"], input[type="time"], input[type="datetime-local"], select')) === 0);
  const colorVentana = await js(`(async () => { const { colorToken } = await import('./js/ui.js'); return colorToken('--ox-bg'); })()`);
  ok('el color de la ventana coincide con main.cjs', colorVentana.toLowerCase() === BG_MAIN, `${colorVentana} vs ${BG_MAIN}`);

  console.log('\n15. Comparar hasta tres sustancias en Gráficos');
  const extras = await js(`(async () => {
    const T = await import('./js/tienda.js');
    const ahora = Date.now();
    const defs = [
      { nombre: 'Armodafinilo', unidad: 'mg', cantidad: 150, dias: 1 },
      { nombre: 'Cafeína', unidad: 'mg', cantidad: 80, dias: 2 },
      { nombre: 'Aceite', unidad: 'ml', cantidad: 2, dias: 3 },
    ];
    const out = [];
    for (const def of defs) {
      const s = await T.guardarSustancia({ nombre: def.nombre, unidad: def.unidad, dosisHabitual: def.cantidad });
      await T.guardarDosis({ sustanciaId: s.id, cantidad: def.cantidad, unidad: def.unidad,
        at: ahora - def.dias * 86400000, hitos: [], notas: '' });
      out.push(s);
    }
    await T.guardarAjustes({ sustanciaGraficos: null, metricaGraficos: 'total', rangoGraficos: '7d' });
    window.__apex.Router.go('graficos');
    return out;
  })()`);
  await sleep(900);
  ok('las sustancias auxiliares quedaron disponibles', extras.length === 3, JSON.stringify(extras));

  for (const nombre of ['Modafinilo', 'Armodafinilo', 'Cafeína']) {
    await tap('#f-sust'); await sleep(250); await menuItem(nombre); await sleep(350);
  }
  ok('el ajuste persiste tres ids', (await js(`window.onyx.settings.get().then(a => a.sustanciaGraficos)`)).length === 3);
  ok('se dibujan tres curvas superpuestas', (await cuenta('#linea .ap-linea')) === 3);
  ok('la leyenda identifica las tres', (await cuenta('#linea .ap-series-legend__item')) === 3
    && (await texto('#linea .ap-series-legend')).includes('Modafinilo')
    && (await texto('#linea .ap-series-legend')).includes('Cafeína'));
  const trazos = await js(`[...document.querySelectorAll('#linea .ap-linea')].map(p => ({ stroke: getComputedStyle(p).stroke, dash: getComputedStyle(p).strokeDasharray }))`);
  ok('color y trazo distinguen cada curva', new Set(trazos.map((x) => x.stroke)).size === 3
    && new Set(trazos.map((x) => x.dash)).size === 3, JSON.stringify(trazos));
  await tap('#f-sust'); await sleep(300);
  ok('al llegar a tres, una cuarta queda deshabilitada', await js(`(() => {
    const b = [...document.querySelectorAll('.ox-menuitem')].find(x => x.textContent.includes('Aceite'));
    return !!b?.disabled && b.textContent.includes('Máx. 3');
  })()`));
  await js(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`); await sleep(250);

  const multiR = await rect('#linea svg');
  await js(`(() => { const svg = document.querySelector('#linea svg');
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: ${multiR.r - 25}, clientY: ${multiR.cy}, bubbles: true })); return true; })()`);
  await sleep(250);
  ok('el hover compara las tres en la misma fecha', (await cuenta('#linea .ap-chart__tip__serie')) === 3);
  await click('#btn-tabla'); await sleep(300);
  ok('la tabla gemela tiene una columna por curva', (await cuenta('#tabla-wrap thead .ap-serie-cab')) === 3);

  await tap('#f-sust'); await sleep(250); await menuItem('Todas las sustancias');
  await tap('#f-sust'); await sleep(250); await menuItem('Modafinilo');
  await tap('#f-sust'); await sleep(250); await menuItem('Aceite');
  ok('mezclar mg y ml fuerza una comparación por tomas', (await texto('.ap-cardchart .ox-subtitle')) === 'Tomas por día'
    && !(await existe('#f-metrica')) && (await cuenta('#linea .ap-linea')) === 2);

  console.log('\n16. El esquema de una sustancia');
  await js(`window.__apex.Router.go('sustancia', ${JSON.stringify(sust.id)}); true`);
  await sleep(700);
  await click('#btn-editar');
  await sleep(600);
  ok('sin esquema, los campos están plegados', !(await existe('#f-esq-wrap.is-open')));
  await click('#f-esquema [data-value="demanda"]');
  await sleep(400);
  ok('a demanda despliega el rango', await existe('#f-esq-wrap.is-open'));
  ok('y apaga las tomas por día', await existe('#f-tomas-campo.is-off'));
  await click('#f-esquema [data-value="fijo"]');
  await sleep(300);
  ok('fijo las prende', !(await existe('#f-tomas-campo.is-off')));
  await escribir('#f-tomas', '2');
  await escribir('#f-min', '400');
  await escribir('#f-max', '200');
  await primario();
  let modaf = await js(`window.onyx.col('sustancias').get(${JSON.stringify(sust.id)})`);
  ok('el esquema quedó en disco, con el rango enderezado', JSON.stringify(modaf?.esquema) === JSON.stringify({ modo: 'fijo', tomasDia: 2, min: 200, max: 400 }), JSON.stringify(modaf?.esquema));
  ok('el perfil lo dice en la cabecera', (await texto('.ox-viewhead__sub'))?.includes('Fijo · 2 por día · 200–400 mg por toma'), await texto('.ox-viewhead__sub'));

  await click('[data-view="inicio"]');
  await sleep(700);
  ok('Hoy muestra el esquema', await existe(`.ap-esq[data-sust="${sust.id}"]`));
  ok('con dos puntos y uno lleno', (await cuenta('.ap-esq .ap-pip')) === 2 && (await cuenta('.ap-esq .ap-pip.is-on')) === 1);
  ok('y dice 1 de 2', (await texto('.ap-esq .ap-esq__estado')) === '1 de 2');
  ok('lo del esquema no se repite en los rápidos', !(await js(`[...document.querySelectorAll('.ap-rapidas [data-rapida]')].some(b => b.dataset.rapida === ${JSON.stringify(sust.id)})`)));

  console.log('\n17. Una combinación');
  await click('[data-view="sustancias"]');
  await sleep(700);
  await click('[data-action="nueva-combinacion"]');
  await sleep(600);
  ok('el diálogo abre con tres filas', (await cuenta('.ox-modal .ap-comp')) === 3);
  ok('vacío, el primario está apagado', (await primarioApagado()) === true);
  await tap('#f-cs-0'); await sleep(300); await menuItem('Modafinilo');
  await tap('#f-cs-1'); await sleep(300); await menuItem('Modafinilo');
  ok('la misma sustancia dos veces no vale', (await primarioApagado()) === true);
  await tap('#f-cs-1'); await sleep(300); await menuItem('Armodafinilo');
  ok('dos distintas sí', (await primarioApagado()) === false);
  ok('propone la dosis habitual de cada una', (await js(`[0,1].map(i => document.querySelector('#f-cc-' + i).value).join('|')`)) === '200|150');
  ok('el nombre se arma solo', (await js(`document.querySelector('#f-nombre').value`)) === 'Modafinilo + Armodafinilo');
  await primario();
  const combo = await js(`window.onyx.col('sustancias').list().then(l => l.find(s => s.componentes) || null)`);
  ok('quedó en disco con sus componentes y sin unidad', combo?.componentes?.length === 2 && combo.unidad === null
    && combo.componentes[1].cantidad === 150, JSON.stringify(combo));
  ok('el router abrió su perfil', (await texto('.ox-viewhead__title')) === 'Modafinilo + Armodafinilo');
  ok('el inspector lista los componentes', (await cuenta('.ox-inspector [data-sust]')) === 2);

  await click('.ox-viewhead__actions [data-rapida]');
  await sleep(600);
  ok('registrar pide una cantidad por componente', (await cuenta('.ox-modal .ap-comp')) === 2 && !(await existe('#f-cant')));
  ok('con las habituales de la combinación', (await js(`document.querySelector('#f-comp-0').value`)) === '200');
  ok('y avisa a qué esquema cuenta', (await texto('#f-esq-hint')).includes('Cuenta para el esquema de Modafinilo'), await texto('#f-esq-hint'));
  await escribir('#f-comp-1', '100');
  await escribir('#f-momento-hora', '1600');
  await primario();
  const dCombo = await js(`window.onyx.col('dosis').list().then(l => l.find(d => d.componentes) || null)`);
  ok('la toma guarda cada componente con su unidad', JSON.stringify(dCombo?.componentes?.map((c) => [c.cantidad, c.unidad])) === '[[200,"mg"],[100,"mg"]]', JSON.stringify(dCombo));
  ok('y no inventa una cantidad propia', dCombo?.cantidad === null && dCombo.unidad === null);
  ok('el detalle nombra las dos cantidades', (await texto('.ox-viewhead__title')) === 'Modafinilo + Armodafinilo 200 mg + 100 mg', await texto('.ox-viewhead__title'));

  await click('[data-view="inicio"]');
  await sleep(700);
  ok('la toma de la combinación completa el esquema del componente', (await texto('.ap-esq .ap-esq__estado')) === '2 de 2'
    && await existe('.ap-esq.is-completo'));

  await js(`window.__apex.Router.go('sustancia', ${JSON.stringify(sust.id)}); true`);
  await sleep(700);
  ok('el perfil del componente sigue con su única toma', (await cuenta('.ox-table tbody tr')) === 1);
  ok('y señala la combinación aparte', (await texto('.ox-inspector'))?.includes('En combinaciones'));

  await tap('[data-view="registro"]');
  await sleep(700);
  ok('en el registro, la combinación dice sus dos cantidades', (await js(`[...document.querySelectorAll('.ap-toma__cant')].map(e => e.textContent).includes('200 mg + 100 mg')`)));

  const csv2 = await ipc.armarCSV();
  ok('el CSV abre la combinación en una fila por componente', csv2.split('\r\n').filter((l) => l.startsWith('"componente"')).length === 2);

  console.log('\n18. Stock');
  await click('[data-view="stock"]');
  await sleep(700);
  ok('sin ingresos, ofrece registrar el primero', await existe('.ox-empty [data-action="registrar-ingreso"]'));
  await click('.ox-empty [data-action="registrar-ingreso"]');
  await sleep(600);
  ok('el diálogo de ingreso abre', await existe('.ox-modal #f-upe'));
  await tap('#f-sust'); await sleep(300); await menuItem('Armodafinilo');
  ok('propone la dosis habitual como dosis por unidad', (await js(`document.querySelector('#f-carga').value`)) === '150');
  await escribir('#f-marca', 'Nuvigil');
  await escribir('#f-upe', '30');
  await escribir('#f-env', '2');
  // A las 23:58: después de todo lo que los pasos anteriores registraron hoy.
  await escribir('#f-momento-hora', '2358');
  ok('el total se cuenta solo', (await texto('#f-total')).includes('60 comprimidos'), await texto('#f-total'));
  await primario();
  const ingr = await js(`window.onyx.col('ingresos').list()`);
  ok('el ingreso quedó en disco', ingr.length === 1 && ingr[0].carga === 150 && ingr[0].envases === 2 && ingr[0].marca === 'Nuvigil', JSON.stringify(ingr));
  ok('Stock muestra una tarjeta con 60', (await cuenta('.ap-stock')) === 1 && (await texto('.ap-stock__cifra b')) === '60');
  ok('la toma de ayer, anterior al ingreso, no descontó', (await texto('.ap-stock__meta')).includes('de 60 ingresadas'));

  await click('#btn-registrar'); await sleep(600);
  await tap('#f-sust'); await sleep(300); await menuItem('Armodafinilo');
  await escribir('#f-cant', '300');
  await escribir('#f-momento-hora', '2359');
  ok('con una sola carga no pregunta de qué stock sale', !(await existe('#f-carga')));
  await primario();
  await click('[data-view="stock"]'); await sleep(700);
  ok('una toma de 300 descuenta dos comprimidos', (await texto('.ap-stock__cifra b')) === '58');
  ok('el rail cuenta el stock', (await texto('#cuenta-stock')) === '1');
  ok('la calculadora propone la dosis habitual', (await js(`document.querySelector('#c-dosis').value`)) === '150');
  ok('y dice hasta cuándo alcanza, desde hoy', (await texto('#c-res')).includes('1 unidad por día') && (await texto('#c-res')).includes('58 días desde hoy'), await texto('#c-res'));
  await escribir('#c-dosis', '300');
  ok('cambiar la dosificación recalcula sin repintar', (await texto('#c-res')).includes('2 unidades por día') && (await texto('#c-res')).includes('29 días'));

  await click('[data-action="registrar-ingreso"]'); await sleep(600);
  await tap('#f-sust'); await sleep(300); await menuItem('Armodafinilo');
  await escribir('#f-carga', '50');
  await escribir('#f-env', '1');
  await primario();
  ok('otra carga es otro stock', (await cuenta('.ap-stock')) === 2);
  await click('#btn-registrar'); await sleep(600);
  await tap('#f-sust'); await sleep(300); await menuItem('Armodafinilo');
  ok('con dos cargas, el diálogo de toma pregunta de cuál sale', await existe('#f-carga'));
  await click('[data-dismiss]'); await sleep(400);

  console.log('\n19. Reservas');
  const armo = await js(`window.__apex.S.sustancias.find((s) => s.nombre === 'Armodafinilo').id`);
  const cifra150 = async () => { await click('[data-view="stock"]'); await sleep(700); return texto(`[data-stock="${armo}|150|mg"] .ap-stock__cifra b`); };
  const reservasEnDisco = () => js(`window.onyx.col('reservas').list()`);
  await click('[data-view="reservas"]'); await sleep(700);
  ok('la vista monta y queda activa en el rail', await existe('[data-view="reservas"].is-active'));
  ok('sin reservas, ofrece la primera', await existe('.ox-empty [data-action="nueva-reserva"]'));
  await click('.ox-empty [data-action="nueva-reserva"]'); await sleep(600);
  ok('el diálogo de reserva abre, con «para quién»', await existe('.ox-modal #f-para'));
  await tap('#f-sust'); await sleep(300); await menuItem('Armodafinilo');
  await escribir('#f-carga', '150');
  await escribir('#f-upe', '30');
  await escribir('#f-env', '3');
  await escribir('#f-para', 'Papá');
  ok('el total dice que se reservan', (await texto('#f-total')).includes('Se reservan 90 comprimidos'), await texto('#f-total'));
  await primario();
  let res = await reservasEnDisco();
  ok('la reserva quedó en disco, en su colección', res.length === 1 && res[0].para === 'Papá' && res[0].envases === 3 && res[0].salidas.length === 0, JSON.stringify(res));
  ok('muestra una tarjeta con 90, para Papá', (await texto('.ap-reserva .ap-stock__cifra b')) === '90' && (await texto('.ap-reserva__para')).includes('Papá'));
  ok('el rail cuenta la reserva', (await texto('#cuenta-reservas')) === '1');
  ok('y el stock no la ve: el de 150 sigue en 58', (await cifra150()) === '58');

  await click('#btn-registrar'); await sleep(600);
  await tap('#f-sust'); await sleep(300); await menuItem('Armodafinilo');
  await escribir('#f-cant', '150');
  await escribir('#f-momento-hora', '2359');
  await primario();
  ok('una toma descuenta del stock', (await cifra150()) === '57');
  await click('[data-view="reservas"]'); await sleep(700);
  ok('y a la reserva no la toca', (await texto('.ap-reserva .ap-stock__cifra b')) === '90');

  await click(`[data-action="pasar-stock"][data-arg="${res[0].id}"]`); await sleep(600);
  ok('pasar al stock propone todo lo que queda', (await js(`document.querySelector('#f-unid').value`)) === '90');
  await escribir('#f-unid', '120');
  ok('no deja sacar más de lo que hay', (await primarioApagado()) === true && (await texto('#f-total')).includes('quedan 90'));
  await escribir('#f-unid', '30');
  await escribir('#f-momento-hora', '2359');
  ok('cuenta los envases y lo que queda', (await texto('#f-total')).includes('30 comprimidos (1 envase)') && (await texto('#f-total')).includes('quedan 60'), await texto('#f-total'));
  await primario();
  const deReserva = (await js(`window.onyx.col('ingresos').list()`)).filter((i) => i.reservaId === res[0].id);
  ok('se creó un ingreso atado a la reserva', deReserva.length === 1 && deReserva[0].carga === 150 && deReserva[0].unidadesPorEnvase * deReserva[0].envases === 30, JSON.stringify(deReserva));
  ok('a la reserva le quedan 60', (await texto('.ap-reserva .ap-stock__cifra b')) === '60');
  ok('y el stock de 150 subió 30', (await cifra150()) === '87');

  await click('[data-view="reservas"]'); await sleep(700);
  await click(`[data-action="entregar-reserva"][data-arg="${res[0].id}"]`); await sleep(600);
  ok('entregar propone el destino de la reserva', (await js(`document.querySelector('#f-dest').value`)) === 'Papá');
  await primario();
  res = await reservasEnDisco();
  const entrega = res[0].salidas.find((x) => x.tipo === 'entrega');
  ok('la entrega quedó registrada, con todo lo que quedaba', entrega?.unidades === 60 && entrega?.destino === 'Papá', JSON.stringify(res[0].salidas));
  ok('la reserva se cerró: no quedan tarjetas', (await cuenta('.ap-reserva')) === 0 && await existe('.ap-reservas__vacio'));
  ok('el rail ya no la cuenta', (await texto('#cuenta-reservas')) === '0');
  ok('la entrega no toca el stock', (await cifra150()) === '87');
  await click('[data-view="reservas"]'); await sleep(700);
  ok('los movimientos: reservada, al stock y entregada', (await cuenta('#view .ox-table tbody tr')) === 3);

  const menuDe = (mov) => js(`(() => { const tr = [...document.querySelectorAll('#view .ox-table tbody tr')].find((t) => t.textContent.includes(${JSON.stringify(mov)}));
    const b = tr?.querySelector('[data-menu]'); if (!b) return false; b.click(); return true; })()`);
  await menuDe('Al stock'); await sleep(300);
  await menuItem('Devolver a la reserva…');
  await primario();
  ok('devolver a la reserva borra su ingreso', !(await js(`window.onyx.col('ingresos').list()`)).some((i) => i.reservaId === res[0].id));
  ok('y las 30 vuelven a la reserva', (await texto('.ap-reserva .ap-stock__cifra b')) === '30' && (await texto('#cuenta-reservas')) === '1');
  ok('el stock de 150 vuelve a 57', (await cifra150()) === '57');

  /* ── 20. Ningún anillo de foco se corta ─────────────────────────────────
     El anillo de base.css sale 3.5px por fuera del elemento. Si el elemento se
     ve entero pero esos 3.5px caen afuera de un contenedor que recorta (un
     .ox-scroll, el borde de la ventana) o encima del canto de una superficie
     (una card, el carril del segmentado), con Tab se ve cortado: pasó en los
     controles de ventana, el primer ítem del rail, el segmentado y las filas
     de una tabla de borde a borde (Apex, sep 2026). Cada elemento se enfoca
     como con teclado y se mide su anillo real (solo las sombras duras: una
     difusa es elevación, no anillo), así los que van hacia adentro cuentan
     cero. Las filas de tabla se prueban como si tuvieran tabindex, porque las
     apps se lo ponen. Traído de Onyx (test/renderer.test.cjs). */
  console.log('\n20. Ningún anillo de foco se corta');
  const AUDITAR_ANILLOS = `((scope) => {
  if (!document.getElementById('aud-notr')) document.head.insertAdjacentHTML('beforeend', '<style id="aud-notr">*,*::before{transition:none!important}</style>');
  // Cuánto sale el anillo REAL por fuera del elemento: se lo enfoca como con
  // teclado y se leen sus sombras de afuera y su outline.
  const extent = (el) => {
    el.focus({ focusVisible: true, preventScroll: true });
    const s = getComputedStyle(el);
    let m = 0;
    for (const part of s.boxShadow.split(/,(?![^(]*\\))/)) {
      if (part.includes('inset') || part.trim() === 'none') continue;
      const nums = part.replace(/rgba?\\([^)]*\\)|oklch\\([^)]*\\)/g, '').match(/-?[\\d.]+px/g) || [];
      const [x = 0, y = 0, blur = 0, spread = 0] = nums.map(parseFloat);
      if (blur > 0) continue;   // una sombra difusa (elevación, brillo) no es el anillo
      m = Math.max(m, spread + Math.max(Math.abs(x), Math.abs(y)));
    }
    if (s.outlineStyle !== 'none' && !/rgba\\(0, 0, 0, 0\\)/.test(s.outlineColor)) m = Math.max(m, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset));
    el.blur();
    return m;
  };
  const SEL = 'a[href],button:not([disabled]):not([tabindex="-1"]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  const name = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24);
    return el.tagName.toLowerCase() + id + cls + (txt ? ' «' + txt + '»' : '');
  };
  const out = [];
  for (const el of scope.querySelectorAll(SEL)) {
    if (el.closest('[inert],[hidden],[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const R = extent(el);
    if (R <= 0.5) continue;
    const boxes = [{ who: 'ventana', l: 0, t: 0, r: innerWidth, b: innerHeight }];
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none' || /paint|strict|content/.test(s.contain)) {
        const ar = a.getBoundingClientRect();
        const l = ar.left + a.clientLeft; const t = ar.top + a.clientTop;
        boxes.push({ who: name(a), l, t, r: l + a.clientWidth, b: t + a.clientHeight });
      }
    }
    const e = 0.5;
    // ¿Roza el canto de una superficie (card, panel, modal)? Un fondo o una
    // sombra con radio: el anillo se pisa con su borde aunque nada lo recorte.
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      const surf = (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.boxShadow !== 'none') && parseFloat(s.borderTopLeftRadius) > 0;
      if (!surf) continue;
      const ar = a.getBoundingClientRect();
      const g = [r.left - ar.left, r.top - ar.top, ar.right - r.right, ar.bottom - r.bottom];
      if (g.some((x) => x < -e)) continue;
      const lados = ['izq', 'arriba', 'der', 'abajo'].filter((_, i) => g[i] < R - e).map((n, i) => n);
      const det = g.map((x, i) => ['izq', 'arriba', 'der', 'abajo'][i] + ' ' + x.toFixed(1)).filter((_, i) => g[i] < R - e);
      if (det.length) { out.push(name(el) + '  roza ' + name(a) + '  [' + det.join(', ') + ']'); break; }
    }
    for (const bx of boxes) {
      const inside = r.left >= bx.l - e && r.top >= bx.t - e && r.right <= bx.r + e && r.bottom <= bx.b + e;
      if (!inside) break;   // el elemento mismo ya está recortado: no es culpa del anillo
      const lados = [];
      if (r.left - R < bx.l - e) lados.push('izq ' + (r.left - bx.l).toFixed(1));
      if (r.top - R < bx.t - e) lados.push('arriba ' + (r.top - bx.t).toFixed(1));
      if (r.right + R > bx.r + e) lados.push('der ' + (bx.r - r.right).toFixed(1));
      if (r.bottom + R > bx.b + e) lados.push('abajo ' + (bx.b - r.bottom).toFixed(1));
      if (lados.length) { out.push(name(el) + '  ← ' + bx.who + '  [' + lados.join(', ') + ']'); break; }
    }
  }
  document.querySelectorAll('.ox-scroll, .ox-main, [class*="scroll"]').forEach((s) => { s.scrollTop = 0; s.scrollLeft = 0; });
  return out;
})(document)`;
  for (const v of ['inicio', 'registro', 'sustancias', 'stock', 'reservas', 'graficos', 'piezas', 'ajustes']) {
    await click(`[data-view="${v}"]`);
    await sleep(700);
    await js(`document.querySelectorAll('#view tbody tr').forEach((tr) => tr.tabIndex = 0)`);
    const cortes = await js(AUDITAR_ANILLOS);
    ok(`${v}: ningún anillo de foco se corta ni roza un canto`, cortes.length === 0, '\n      ' + cortes.join('\n      '));
  }
  await js(`document.getElementById('aud-notr')?.remove()`);


  console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
  console.log(errores.length ? `CONSOLA:\n  ${errores.join('\n  ')}` : 'CONSOLA: limpia');
  limpiar();
  app.exit(fail || errores.length ? 1 : 0);
});
