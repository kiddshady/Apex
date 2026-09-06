/* ═══════════════════════════════════════════════════════════════════════════
   Genera build/icon.png (1024×1024) desde la marca de la app.

   La marca es la MISMA que pintan el splash y la titlebar (renderer/index.html)
   y el ícono `onyx` de renderer/js/icons.js: la curva de concentración sobre
   su línea de base, con el ápice marcado. Son TRES lugares que tienen que
   coincidir. Si la cambiás allá, corré esto de nuevo:

     npm run icon

   Se renderiza con Electron y no con una librería de imágenes porque Electron
   ya está instalado, y porque así el ícono sale del MISMO motor que dibuja la
   app: lo que se ve en la ventana es lo que queda en el .png.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const LADO = 1024;
const SALIDA = path.join(__dirname, 'icon.png');

/* Los colores van literales, no como tokens: acá no hay tokens.css. Son el
   fondo de la ventana (main.cjs → BG) y el acento cian de tokens.css. Si se
   re-tinta la app, hay que traerlos a mano. */
const FONDO = '#090c0c';
const ACENTO = '#22d3ee';

/* La curva no está centrada en su viewBox: el pico cae en x=7 y la cola
   derecha pesa más. Abajo se mide lo pintado y se corrige solo. En la app no
   se corrige, porque ahí la marca va al lado del nombre. */
const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${LADO}px; height: ${LADO}px; background: transparent; }
  .placa {
    width: ${LADO}px; height: ${LADO}px;
    box-sizing: border-box;
    background: ${FONDO};
    border-radius: ${Math.round(LADO * 0.18)}px;
    display: grid; place-items: center;
  }
  svg { width: ${Math.round(LADO * 0.64)}px; height: ${Math.round(LADO * 0.64)}px;
        stroke: ${ACENTO}; color: ${ACENTO}; fill: none;
        stroke-width: 1.15; stroke-linecap: round; stroke-linejoin: round; }
  .base { opacity: .34; }
</style>
<div class="placa">
  <svg viewBox="0 0 16 16">
    <g id="marca">
      <path d="M2.2 12.4C4.2 12.4 4.9 3.6 7 3.6S9.6 12.4 13.8 12.4"/>
      <path class="base" d="M2.2 12.4H13.8"/>
      <circle cx="7" cy="3.6" r="1.35" fill="currentColor" stroke="none"/>
    </g>
  </svg>
</div>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: LADO, height: LADO, show: false,
    transparent: true, frame: false, backgroundColor: '#00000000',
    useContentSize: true,
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML));

  /* Se centra MIDIENDO lo pintado, no con un número a mano: si mañana cambia
     el dibujo, el ícono se recentra solo. */
  const centrado = await win.webContents.executeJavaScript(`(() => {
    const g = document.getElementById('marca');
    const svg = document.querySelector('svg');
    const a = g.getBoundingClientRect();
    const b = svg.getBoundingClientRect();
    const cx = ((a.left + a.right) / 2 - b.left) / b.width  * 16;
    const cy = ((a.top + a.bottom) / 2 - b.top)  / b.height * 16;
    const dx = 8 - cx, dy = 8 - cy;
    g.setAttribute('transform', 'translate(' + dx.toFixed(3) + ' ' + dy.toFixed(3) + ')');
    return { dx: +dx.toFixed(3), dy: +dy.toFixed(3) };
  })()`);
  console.log(`  centrado: dx=${centrado.dx} dy=${centrado.dy}`);

  await new Promise((r) => setTimeout(r, 700));   // que asiente el layout

  const img = await win.capturePage();
  const { width, height } = img.getSize();
  if (width !== LADO || height !== LADO) {
    console.log(`ABORTADO: la captura salió ${width}×${height}, se esperaba ${LADO}×${LADO}`);
    app.exit(1);
    return;
  }

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, img.toPNG());
  console.log(`  ${SALIDA}  (${LADO}×${LADO})`);

  win.destroy();
  setTimeout(() => app.exit(0), 150);
});

// Sin esto, destruir la ventana termina el proceso antes de tiempo.
app.on('window-all-closed', () => { });
