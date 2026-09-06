/* ═══════════════════════════════════════════════════════════════════════════
   Verifica el build empaquetado, no el código fuente.

     npm run build && npm run test:paquete

   Existe porque una app Electron empaquetada se rompe de maneras que en `npm
   run dev` no aparecen nunca: el renderer queda en pantalla blanca por una
   ruta que solo resuelve en dev, la carpeta de datos pasa a ser de solo
   lectura, o el actualizador no encuentra su app-update.yml. Nada de eso lo
   agarra un test del fuente.

   Las preguntas que contesta:
     1. ¿Están los tres archivos que el actualizador necesita, y son coherentes?
     2. ¿El .exe arranca, abre ventana y escribe en su carpeta de datos?
     3. ¿El renderer montó de verdad, y el puente de actualizaciones responde?
   ═══════════════════════════════════════════════════════════════════════════ */

const { app } = require('electron');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.on('window-all-closed', () => { });

const RAIZ = path.join(__dirname, '..');
const pkg = require(path.join(RAIZ, 'package.json'));
const VERSION = pkg.version;
const SALIDA = path.join(RAIZ, 'dist');
const DESEMPACADA = path.join(SALIDA, 'win-unpacked');
const EXE = path.join(DESEMPACADA, 'Apex.exe');

let pasaron = 0; let fallaron = 0;
const prueba = async (nombre, fn) => {
  try { await fn(); pasaron++; console.log('  OK    ' + nombre); }
  catch (err) { fallaron++; console.log('  FALLA ' + nombre + '\n        ' + (err.message || err)); }
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Evalúa una expresión adentro del renderer de la app EMPAQUETADA, hablando
 * CDP con `--remote-debugging-port`. Node 24 ya trae `fetch` y `WebSocket`.
 */
async function cdpEvaluar(puerto, expresion) {
  const paginas = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
  const pagina = paginas.find((p) => p.type === 'page' && /index\.html/.test(p.url || ''));
  assert.ok(pagina, 'el depurador remoto no ve ninguna página de la app');

  return new Promise((listo, error) => {
    const ws = new WebSocket(pagina.webSocketDebuggerUrl);
    const reloj = setTimeout(() => { ws.close(); error(new Error('el depurador no contestó')); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expresion, returnByValue: true, awaitPromise: true },
    }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== 1) return;
      clearTimeout(reloj);
      ws.close();
      if (m.result?.exceptionDetails) {
        return error(new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text));
      }
      listo(m.result?.result?.value);
    };
    ws.onerror = () => { clearTimeout(reloj); error(new Error('no se pudo hablar con el depurador')); };
  });
}

app.whenReady().then(async () => {
  console.log(`\npaquete ${VERSION}\n`);

  await prueba('el instalador existe y no está vacío', () => {
    const inst = path.join(SALIDA, `Apex-Setup-${VERSION}.exe`);
    assert.ok(fs.existsSync(inst), `no está ${path.basename(inst)}`);
    const mb = fs.statSync(inst).size / 1024 / 1024;
    assert.ok(mb > 40, `el instalador salió sospechosamente chico (${mb.toFixed(1)} MB)`);
  });

  /* Lo que electron-updater lee del release: el .yml dice qué versión es la
     última y cómo se llama el archivo; el .blockmap deja bajar solo lo que
     cambió. Si alguno falta o miente, la app instalada no se actualiza y no
     avisa por qué. */
  await prueba('latest.yml y el blockmap apuntan a este instalador', () => {
    const yml = fs.readFileSync(path.join(SALIDA, 'latest.yml'), 'utf8');
    assert.ok(yml.includes(`version: ${VERSION}`), `latest.yml no dice version: ${VERSION}`);
    assert.ok(yml.includes(`Apex-Setup-${VERSION}.exe`), 'latest.yml no nombra al instalador');
    assert.ok(/sha512:/.test(yml), 'latest.yml no trae sha512');
    assert.ok(fs.existsSync(path.join(SALIDA, `Apex-Setup-${VERSION}.exe.blockmap`)), 'falta el .blockmap');
  });

  await prueba('la app lleva adentro su app-update.yml apuntando al repo', () => {
    const f = path.join(DESEMPACADA, 'resources', 'app-update.yml');
    assert.ok(fs.existsSync(f), 'no está resources/app-update.yml: la app instalada no sabría dónde buscar');
    const yml = fs.readFileSync(f, 'utf8');
    assert.ok(yml.includes('provider: github'), 'app-update.yml no usa el proveedor github');
    assert.ok(yml.includes(`owner: ${pkg.build.publish.owner}`) && yml.includes(`repo: ${pkg.build.publish.repo}`),
      `app-update.yml no apunta a ${pkg.build.publish.owner}/${pkg.build.publish.repo}`);
  });

  await prueba('la fuente empaquetada y su licencia viajan adentro', () => {
    const asar = path.join(DESEMPACADA, 'resources', 'app.asar');
    assert.ok(fs.existsSync(asar), 'no está app.asar');
    const bytes = fs.readFileSync(asar);
    // El índice del asar es texto: los nombres de archivo se leen tal cual.
    const cabecera = bytes.subarray(0, 64 * 1024).toString('latin1');
    assert.ok(cabecera.includes('roboto-mono-latin-400-normal.woff2'), 'la fuente no está en el asar');
    assert.ok(cabecera.includes('Roboto-Mono-LICENSE.txt'), 'la licencia de la fuente no viaja (la OFL lo exige)');
    assert.ok(!cabecera.includes('humo.test.cjs'), 'los tests se colaron en el paquete');
  });

  /* Arrancar el .exe de verdad. Una app empaquetada que muere al segundo igual
     deja el proceso vivo un instante, así que se le da tiempo y se pregunta
     por la VENTANA, no solo por el proceso. */
  let hijo = null;
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-paq-datos-'));
  const PUERTO = 9333;

  await prueba('el .exe arranca, abre ventana y escribe en su carpeta de datos', async () => {
    assert.ok(fs.existsSync(EXE), 'no está Apex.exe');
    hijo = spawn(EXE, [`--remote-debugging-port=${PUERTO}`], {
      env: { ...process.env, APEX_DATA: datos },
      detached: false, stdio: 'ignore',
    });
    let murio = null;
    hijo.on('exit', (code) => { murio = code; });

    await dormir(9000);
    assert.equal(murio, null, `el proceso se murió solo (código ${murio})`);

    const titulos = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-Process -Id ${hijo.pid} -ErrorAction SilentlyContinue | ` +
      'Select-Object -ExpandProperty MainWindowTitle'], { encoding: 'utf8' }).trim();
    assert.ok(titulos.includes('Apex'), `la ventana no tiene título "Apex" (vi: "${titulos}")`);

    /* Al moverse a su posición final la ventana guarda su estado: si ese
       archivo aparece, el proceso principal pudo escribir donde le toca. */
    const estado = path.join(datos, 'window.json');
    assert.ok(fs.existsSync(estado), 'no escribió window.json: la carpeta de datos no es escribible');
    const j = JSON.parse(fs.readFileSync(estado, 'utf8'));
    assert.ok(Number.isFinite(j.width) && j.width > 0, 'window.json salió sin medidas');
  });

  /* El título lo pone el <title>, así que se puede tener título y pantalla en
     blanco: alcanza con que el CSS o los módulos ES no resuelvan desde adentro
     del asar. La única forma honesta de descartarlo es mirar el DOM. */
  await prueba('el renderer empaquetado montó de verdad (no es pantalla en blanco)', async () => {
    const v = await cdpEvaluar(PUERTO, `(() => ({
      splashIdo:  !document.getElementById('boot-splash'),
      shell:      !!document.querySelector('.ox-rail') && !!document.querySelector('.ox-statusbar'),
      vista:      document.getElementById('view').children.length,
      cssCargado: getComputedStyle(document.documentElement).getPropertyValue('--ox-bg').trim(),
      iconosSVG:  !document.querySelector('i[data-icon]') && !!document.querySelector('.ox-brand__mark'),
      titulo:     document.querySelector('.ox-viewhead__title')?.textContent.trim() || '',
      datos:      document.getElementById('rail-foot')?.textContent || '',
    }))()`);
    assert.ok(v.cssCargado, 'los tokens no cargaron: el CSS no resuelve desde el asar');
    assert.ok(v.splashIdo, 'el splash sigue puesto: app.js no llegó a correr');
    assert.ok(v.shell && v.vista > 0, 'el shell o la vista no montaron');
    assert.ok(v.iconosSVG, 'los <i data-icon> no se reemplazaron: los módulos ES no cargaron');
    assert.equal(v.titulo, 'Hoy', `la vista inicial dice "${v.titulo}"`);
    assert.ok(v.datos.includes('apex-paq-datos'), `el pie del rail no muestra la carpeta de datos (${v.datos})`);
  });

  await prueba('el puente de actualizaciones responde con la versión del paquete', async () => {
    const e = await cdpEvaluar(PUERTO, `window.apex.actualizacion.estado()`);
    assert.ok(e && typeof e.fase === 'string', `estado raro: ${JSON.stringify(e)}`);
    assert.equal(e.version, VERSION, `la app dice ser ${e.version}`);
    // Empaquetada, el actualizador ARRANCA: nunca queda «inactivo por dev».
    assert.ok(e.motivo !== 'dev', 'la app empaquetada cree que está en desarrollo');
  });

  if (hijo && hijo.exitCode === null) { try { hijo.kill(); } catch { /* ya murió */ } }
  await dormir(600);
  try { fs.rmSync(datos, { recursive: true, force: true }); } catch { /* Windows */ }

  console.log(`\n${pasaron} bien, ${fallaron} mal\n`);
  setTimeout(() => app.exit(fallaron ? 1 : 0), 200);
});
