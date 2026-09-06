'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   APEX — bandeja del sistema

   El ícono al lado del reloj. Existe mientras la app corre, y es lo que hace
   que cerrar la ventana no sea lo mismo que cerrar Apex: con `cerrarAlTray`
   la X esconde, y desde acá se vuelve.

   El menú es NATIVO —lo pinta Windows, no nosotros—, así que es el único
   lugar de la app donde no mandan nuestros estilos: no hay ícono propio que
   valga, ni transición, ni tipografía. Por eso tiene lo mínimo indispensable,
   abrir y salir, y todo lo demás vive adentro de la ventana, donde sí lo
   dibujamos nosotros.
   ═══════════════════════════════════════════════════════════════════════════ */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

/* El mismo PNG del que sale el ícono del instalador (build/make-icon.cjs), así
   la marca es una sola. Va empaquetado a propósito: `build/**` está excluido
   del asar salvo este archivo (ver package.json → build.files).

   32 px y no 16: Windows lo baja a 16 en pantallas al 100 % —con mejor filtro
   que el que haría al agrandar— y lo usa tal cual al 200 %. */
const ICONO = path.join(__dirname, '..', 'build', 'icon.png');

let tray = null;

function icono() {
  const img = nativeImage.createFromPath(ICONO);
  // Si el PNG no viajó, `createFromPath` devuelve una imagen vacía en vez de
  // tirar. Redimensionarla la deja vacía igual, y Windows pinta un hueco: es
  // feo, pero es mejor que quedarse sin bandeja y sin forma de volver.
  return img.isEmpty() ? img : img.resize({ width: 32, height: 32, quality: 'best' });
}

/**
 * Crea el ícono. `mostrar` trae la ventana al frente; `salir` termina Apex de
 * verdad —con la X escondiendo, este menú es el único lugar desde donde se
 * puede—. Llamarla dos veces no crea dos íconos.
 */
function crear({ mostrar, salir }) {
  if (tray) return tray;
  tray = new Tray(icono());
  tray.setToolTip(`Apex ${app.getVersion()}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Apex', click: mostrar },
    { type: 'separator' },
    { label: 'Salir', click: salir },
  ]));
  // Click izquierdo: mostrar, nunca alternar. Un toggle acá esconde la ventana
  // justo cuando alguien la fue a buscar.
  tray.on('click', mostrar);
  return tray;
}

/** Sin esto, el ícono queda de fantasma en la bandeja hasta que pasás el mouse. */
function destruir() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}

module.exports = { crear, destruir };
