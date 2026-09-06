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
  for (const v of ['registro', 'sustancias', 'graficos', 'piezas', 'ajustes', 'inicio']) {
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

  await click('#btn-palette');
  await sleep(500);
  const pal = await rect('.ox-palette');
  ok('la paleta abre centrada y visible', pal && pal.t > 0 && Math.abs(pal.cx - W / 2) < 4, JSON.stringify(pal));
  const ph = await js(`document.querySelector('.ox-palette__input')?.placeholder || ''`);
  ok('con el vocabulario de Apex en el campo vacío', /sustancias|tomas/.test(ph) && !/pipeline|agente/i.test(ph), ph);
  const cmds = await js(`[...document.querySelectorAll('.ox-palette__item')].map(b => b.textContent.trim())`);
  ok('ofrece registrar la dosis habitual', cmds.some((c) => c.includes('Modafinilo 200 mg')), cmds.join('|'));
  await click('.ox-scrim'); await sleep(400);

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

  console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
  console.log(errores.length ? `CONSOLA:\n  ${errores.join('\n  ')}` : 'CONSOLA: limpia');
  limpiar();
  app.exit(fail || errores.length ? 1 : 0);
});
