/* ═══════════════════════════════════════════════════════════════════════════
   APEX — íconos del dominio

   Van acá y no en `icons.js` a propósito: así traerse una versión nueva del set
   base de Onyx no pisa estos. Misma receta que el resto — grilla de 16, trazo
   1.5, contenido entre 1.8 y 14.2, sin `fill` salvo puntos macizos.

   Las FASES de un episodio tienen cada una su ícono, y los seis son la misma
   curva de la marca recortada en distintos tramos: la fase se lee por dónde
   está el punto sobre la curva, no por un color. Es lo que deja el rojo libre
   para el fallo y mantiene un solo acento por pantalla.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Icons } from './icons.js';

/* La curva base, compartida por las fases. Empieza en la línea de base, sube
   hasta el pico en x=7 y baja largo hacia la derecha. */
const CURVA = '<path d="M2.2 12.4C4.2 12.4 4.9 3.6 7 3.6S9.6 12.4 13.8 12.4" opacity=".38"/>';
const PUNTO = (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor" stroke="none"/>`;

Icons.add({
  /* Cápsula partida al medio. Va DERECHA y no en diagonal: a 16 px la versión
     rotada 45° se lee como un eslabón de cadena, no como una pastilla. */
  pill: '<rect x="1.9" y="5.2" width="12.2" height="5.6" rx="2.8"/>'
      + '<path d="M8 5.2v5.6"/>',

  /* Gráfico de líneas: dos ejes y una traza que sube. */
  chart: '<path d="M2.4 2.6v10.8h11.2"/>'
       + '<path d="M4.6 10.2l2.6-3.2 2.2 1.8 3.4-4.4"/>',

  /* Grilla de celdas: el mapa de calor. Tres macizas dicen «valor». */
  heatmap: '<rect x="2.2" y="2.2" width="3.2" height="3.2" rx=".8"/><rect x="6.4" y="2.2" width="3.2" height="3.2" rx=".8" fill="currentColor" stroke="none"/><rect x="10.6" y="2.2" width="3.2" height="3.2" rx=".8"/>'
         + '<rect x="2.2" y="6.4" width="3.2" height="3.2" rx=".8" fill="currentColor" stroke="none"/><rect x="6.4" y="6.4" width="3.2" height="3.2" rx=".8"/><rect x="10.6" y="6.4" width="3.2" height="3.2" rx=".8" fill="currentColor" stroke="none"/>'
         + '<rect x="2.2" y="10.6" width="3.2" height="3.2" rx=".8"/><rect x="6.4" y="10.6" width="3.2" height="3.2" rx=".8"/><rect x="10.6" y="10.6" width="3.2" height="3.2" rx=".8"/>',

  /* La curva entera con el pico marcado: el perfil farmacocinético. */
  curva: '<path d="M2.2 12.4C4.2 12.4 4.9 3.6 7 3.6S9.6 12.4 13.8 12.4"/>'
       + PUNTO(7, 3.6),

  /* Banderín: un hito en la línea de tiempo. */
  hito: '<path d="M4 14.2V2.4"/><path d="M4 2.8h7.6l-1.6 2.6 1.6 2.6H4"/>',

  /* Gota: la toma / la dosis. */
  gota: '<path d="M8 1.9S3.4 7 3.4 9.6a4.6 4.6 0 0 0 9.2 0C12.6 7 8 1.9 8 1.9z"/>',

  /* Las fases: el punto recorre la curva. */
  faseOnset:   CURVA + PUNTO(4.3, 9.6),
  fasePico:    CURVA + PUNTO(7, 3.6),
  fasePlateau: '<path d="M2.2 12.4C4.2 12.4 4.6 4 6.2 4h3.6c1.6 0 2 8.4 4 8.4" opacity=".38"/>' + PUNTO(8, 4),
  faseBaja:    CURVA + PUNTO(10.4, 9.2),
  faseFin:     CURVA + PUNTO(13.4, 12.4),
  faseNota:    '<path d="M11.4 1.9a1.6 1.6 0 0 1 2.3 2.3L6.4 11.5l-2.9.6.6-2.9z"/><path d="M2.4 14.2h11.2"/>',

  /* Un reloj con la aguja en «ahora»: el botón que pone la hora actual. */
  ahora: '<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8h3.4"/><path d="M8 1.2v1.2M14.8 8h-1.2"/>',

  /* Tabla: el gemelo textual de cada gráfico. */
  tabla: '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8"/><path d="M1.8 6.4h12.4M1.8 9.8h12.4M6 6.4v6.8"/>',

  /* Vía de administración: una flecha que entra. */
  via: '<path d="M2.4 8h7.2M6.8 5.2 9.6 8l-2.8 2.8"/><path d="M11.4 3.2h.8A1.6 1.6 0 0 1 13.8 4.8v6.4a1.6 1.6 0 0 1-1.6 1.6h-.8"/>',

  /* Dos cápsulas corridas en diagonal: una combinación de sustancias. Las dos
     derechas, por lo mismo que `pill`. */
  combinacion: '<rect x="1.9" y="2.4" width="8.6" height="4.4" rx="2.2"/><path d="M6.2 2.4v4.4"/>'
             + '<rect x="5.5" y="9.2" width="8.6" height="4.4" rx="2.2"/><path d="M9.8 9.2v4.4"/>',

  /* Lista con dos de tres puntos llenos: el esquema del día y cuánto va. */
  esquema: '<circle cx="3.4" cy="4" r="1.4" fill="currentColor" stroke="none"/><circle cx="3.4" cy="8" r="1.4" fill="currentColor" stroke="none"/>'
         + '<circle cx="3.4" cy="12" r="1.3"/><path d="M6.6 4h7.2M6.6 8h7.2M6.6 12h7.2"/>',

  /* Caja archivada: la sustancia que ya no se usa pero cuyas tomas quedan. */
  archivar: '<rect x="1.9" y="2.4" width="12.2" height="3.2" rx="1.1"/>'
          + '<path d="M3.2 5.6v6.5a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V5.6"/>'
          + '<path d="M6.5 8.5h3"/>',
});
