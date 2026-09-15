/* ═══════════════════════════════════════════════════════════════════════════
   Capturas de Apex con datos de muestra.

   Monta la app sobre una carpeta temporal sembrada con tres meses de tomas
   inventadas, recorre las vistas y guarda un PNG de cada una. Sirve para MIRAR
   la app —el esfumado, los gráficos, el ritmo— sin cargar nada a mano.

     npx electron test/capturas.cjs <carpeta-de-salida>

   Nunca toca los datos reales: APEX_DATA apunta a un temporal que se borra.
   ═══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(os.tmpdir(), `apex-capturas-${process.pid}`);
process.env.APEX_DATA = DATA;

const { app, BrowserWindow } = require('electron');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'test', 'capturas'));
const W = 1440; const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIA = 86_400_000; const HORA = 3_600_000; const MIN = 60_000;

/* ── Datos de muestra, deterministas ─────────────────────────────────────── */
let semilla = 7;
const rnd = () => { semilla = (semilla * 9301 + 49297) % 233280; return semilla / 233280; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const p4 = (n) => String(n).padStart(4, '0');

async function sembrar() {
  const store = require(path.join(ROOT, 'src', 'store.cjs'));
  const sust = store.collection('sustancias');
  const dosis = store.collection('dosis');
  const ahora = Date.now();
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoy0 = hoy.getTime();

  const S1 = { id: 's-0001', nombre: 'Modafinilo', unidad: 'mg', dosisHabitual: 200, via: 'oral', vidaMedia: 12, notas: 'Para los días largos. Nunca después de las 11.', createdAt: ahora - 95 * DIA, updatedAt: ahora - 95 * DIA };
  const S2 = { id: 's-0002', nombre: 'Metilfenidato', unidad: 'mg', dosisHabitual: 10, via: 'oral', vidaMedia: 3, notas: '', createdAt: ahora - 80 * DIA, updatedAt: ahora - 80 * DIA };
  const S3 = { id: 's-0003', nombre: 'Melatonina', unidad: 'mg', dosisHabitual: 3, via: 'sublingual', vidaMedia: null, notas: '', createdAt: ahora - 60 * DIA, updatedAt: ahora - 60 * DIA };
  for (const s of [S1, S2, S3]) await sust.save(s);

  let n = 0;
  const guardar = (d) => dosis.save({ ...d, id: `d-${p4(++n)}`, createdAt: d.at, updatedAt: d.at });

  for (let k = 89; k >= 1; k--) {
    const d0 = hoy0 - k * DIA;
    if (rnd() < 0.55) {
      const at = d0 + entre(8, 10) * HORA + entre(0, 59) * MIN;
      const hitos = [];
      if (rnd() < 0.7) {
        const on = entre(40, 80);
        const pico = on + entre(50, 110);
        const baja = pico + entre(120, 240);
        const fin = baja + entre(90, 200);
        hitos.push({ id: `h${n}a`, at: at + on * MIN, fase: 'onset', intensidad: entre(2, 4), notas: '' });
        hitos.push({ id: `h${n}b`, at: at + pico * MIN, fase: 'pico', intensidad: entre(6, 9), notas: rnd() < .3 ? 'Foco limpio, sin ansiedad.' : '' });
        if (rnd() < .5) hitos.push({ id: `h${n}p`, at: at + (pico + entre(30, 90)) * MIN, fase: 'plateau', intensidad: entre(5, 8), notas: '' });
        hitos.push({ id: `h${n}c`, at: at + baja * MIN, fase: 'baja', intensidad: entre(2, 5), notas: rnd() < .3 ? 'Cansancio de fondo, pero sin bajón.' : '' });
        hitos.push({ id: `h${n}d`, at: at + fin * MIN, fase: 'fin', intensidad: null, notas: '' });
      }
      await guardar({ sustanciaId: 's-0001', at, cantidad: rnd() < .8 ? 200 : 100, unidad: 'mg', via: 'oral', notas: rnd() < .25 ? 'Con café.' : '', hitos });
    }
    if (rnd() < 0.3) {
      const at = d0 + entre(14, 16) * HORA + entre(0, 59) * MIN;
      const hitos = rnd() < .6 ? [
        { id: `h${n}a`, at: at + entre(20, 40) * MIN, fase: 'onset', intensidad: entre(3, 5), notas: '' },
        { id: `h${n}b`, at: at + entre(60, 90) * MIN, fase: 'pico', intensidad: entre(6, 8), notas: '' },
        { id: `h${n}d`, at: at + entre(180, 240) * MIN, fase: 'fin', intensidad: null, notas: '' },
      ] : [];
      await guardar({ sustanciaId: 's-0002', at, cantidad: 10, unidad: 'mg', via: 'oral', notas: '', hitos });
    }
    if (rnd() < 0.5) {
      const at = d0 + 22 * HORA + entre(0, 80) * MIN;
      await guardar({ sustanciaId: 's-0003', at, cantidad: 3, unidad: 'mg', via: 'sublingual', notas: '', hitos: [] });
    }
  }

  /* Hoy: un episodio en curso, con onset y pico pero sin fin. */
  const at = ahora - 3 * HORA - 12 * MIN;
  await guardar({
    sustanciaId: 's-0001', at, cantidad: 200, unidad: 'mg', via: 'oral', notas: 'Con café. Dormí seis horas.',
    hitos: [
      { id: 'hoy-a', at: at + 55 * MIN, fase: 'onset', intensidad: 3, notas: 'Se va la niebla.' },
      { id: 'hoy-b', at: at + 130 * MIN, fase: 'pico', intensidad: 8, notas: 'Foco total, sin taquicardia.' },
    ],
  });
  return { n, hoyId: `d-${p4(n)}` };
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { n, hoyId } = await sembrar();
  console.log(`  sembradas ${n} tomas en ${DATA}`);

  require(path.join(ROOT, 'src', 'ipc.cjs')).register();
  const win = new BrowserWindow({
    x: -20000, y: -20000, width: W, height: H,
    frame: false, show: false, paintWhenInitiallyHidden: true, backgroundColor: '#090c0c',
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true },
  });
  const errores = [];
  win.webContents.on('console-message', (e) => { if (e.level >= 2) errores.push(`${e.level}: ${e.message}`); });
  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.show();
  await sleep(2400);

  const js = (c) => win.webContents.executeJavaScript(c);
  const ir = async (vista, param = null) => { await js(`window.__apex.Router.go(${JSON.stringify(vista)}, ${JSON.stringify(param)}); true`); await sleep(1100); };
  const foto = async (nombre) => {
    const img = await win.webContents.capturePage();
    const archivo = path.join(OUT, `${nombre}.png`);
    fs.writeFileSync(archivo, img.toPNG());
    console.log(`  ${nombre}.png  ${img.getSize().width}×${img.getSize().height}${img.isEmpty() ? '  (VACÍA)' : ''}`);
  };

  await foto('01-hoy');
  await ir('registro');
  await foto('02-registro');
  /* Los ajustes se cambian en el espejo en memoria, que es lo que lee la
     vista; escribir solo en disco no la mueve. */
  const ajustar = (patch) => js(`Object.assign(window.__apex.S.ajustes, ${JSON.stringify(patch)}); true`);
  await ajustar({ sustanciaGraficos: 's-0001', rangoGraficos: '90d', metricaGraficos: 'total', mapaModo: 'calendario' });
  await ir('graficos');
  await foto('03-graficos');
  await ajustar({ sustanciaGraficos: ['s-0001', 's-0002', 's-0003'] });
  await js(`window.__apex.Router.refresh(); true`);
  await sleep(900);
  await foto('04-graficos-comparacion');
  await ajustar({ mapaModo: 'semana', sustanciaGraficos: null });
  await js(`window.__apex.Router.refresh(); true`);
  await sleep(900);
  await foto('05-graficos-semana');
  await ir('sustancia', 's-0001');
  await foto('06-sustancia');
  await ir('dosis', hoyId);
  await foto('07-dosis');
  await js(`document.querySelector('.ox-viewhead__actions [data-hito]').click(); true`);
  await sleep(700);
  await foto('08-dialogo-hito');
  await js(`document.querySelector('.ox-modal [data-dismiss]').click(); true`);
  await sleep(500);
  await ir('sustancias');
  await foto('09-sustancias');
  await js(`document.getElementById('btn-registrar').click(); true`);
  await sleep(700);
  await foto('10-dialogo-dosis');
  await js(`document.querySelector('.ox-modal [data-dismiss]').click(); true`);
  await sleep(400);
  await ir('ajustes');
  await foto('11-ajustes');

  console.log(errores.length ? `CONSOLA:\n  ${errores.join('\n  ')}` : 'CONSOLA: limpia');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* nada */ }
  app.exit(0);
});
