# Apex

El ápice es el pico de la curva de concentración: el punto que la app busca
en cada episodio. Registro personal de tomas —medicación y lo que se use de forma episódica— y,
de a episodios, la **farmacocinética personal** de cada sustancia: cuánto tarda
en pegar, cuándo pica, cuánto dura. App de escritorio, datos en disco como
JSON legible, sin red.

Construida sobre [Onyx](C:\tools\Onyx). Todo lo que dice el README de Onyx
sobre el shell, los tokens y el anti-flash vale acá; esto documenta lo que
Apex agrega encima.

```
npm run dev      # con la consola del renderer saliendo por la terminal
npm start
npm test         # tokens, almacenamiento, formato y cálculo PK (node pelado)
npm run humo     # monta la app con Electron y la recorre entera por la UI
npx electron test/capturas.cjs <carpeta>   # PNGs de cada vista con datos de muestra
```

---

## Qué guarda

Dos colecciones en `data/` (una carpeta por colección, un archivo JSON por
ítem, escritura atómica). `APEX_DATA` mueve la carpeta.

**Sustancia** — lo que se toma.

```json
{ "id": "s-0001", "nombre": "Modafinilo", "unidad": "mg", "dosisHabitual": 200,
  "via": "oral", "vidaMedia": 12, "notas": "", "archivada": false }
```

**Dosis** — una toma, con sus hitos adentro. Los tiempos son timestamps (ms).

```json
{ "id": "d-0042", "sustanciaId": "s-0001", "at": 1788699600000,
  "cantidad": 200, "unidad": "mg", "via": "oral", "notas": "Con café.",
  "hitos": [
    { "id": "h…", "at": 1788703200000, "fase": "onset", "intensidad": 3, "notas": "" },
    { "id": "h…", "at": 1788708600000, "fase": "pico",  "intensidad": 8, "notas": "Foco total." },
    { "id": "h…", "at": 1788721200000, "fase": "fin",   "intensidad": null, "notas": "" }
  ] }
```

La unidad viaja copiada en la toma a propósito: cambiarle la unidad a una
sustancia no reescribe el historial.

### Los hitos

Son los checkpoints del episodio, el «14:00 tomo → 15:00 onset → 17:00 va
mermando» del cuaderno. Seis fases:

| fase | qué marca | lleva intensidad |
|---|---|---|
| `onset` | empieza a sentirse | sí |
| `pico` | efecto máximo | sí |
| `plateau` | se mantiene | sí |
| `baja` | el efecto cede («Mermando») | sí |
| `fin` | de vuelta a la base | no (vale 0) |
| `nota` | una observación suelta | opcional |

La intensidad va de 0 a 10 y es opcional. Cada fase tiene su ícono —el mismo
punto recorriendo la curva de la marca—, así que se distinguen sin color: el
acento sigue siendo uno solo y el rojo queda para el fallo.

El diálogo de hito propone la fase que sigue (después de onset, pico; después
de pico, mermando; después de mermando, fin), pone la hora actual con un botón
de «Ahora» al lado, y no deja guardar un hito anterior a la toma.

### El perfil

`renderer/js/pk.js` deriva, sin DOM, todo lo que después se dibuja:

- **Perfil por sustancia**: mediana, min y max del tiempo hasta el primer
  hito de cada fase, la duración (fin − onset) y la intensidad máxima. Del
  primer hito de cada fase, no del último: si alguien marcó «pico» dos veces,
  lo que importa es cuándo llegó.
- **Curvas**: cada episodio con intensidad como intensidad(t) con t en horas
  desde la toma; la toma es el (0, 0). Con dos o más episodios sale la curva
  **mediana**, muestreada cada 15 minutos. Después del fin una curva sigue en
  0; una curva que quedó abierta no inventa nada.
- **Series**: dosis o tomas por día (con ceros donde no hubo), el calendario
  en semanas de lunes a domingo, y la matriz día de la semana × hora.

Todo en hora local: una toma a las 23:30 es de ese día.

---

## Las vistas

| vista | qué hay |
|---|---|
| **Hoy** | cifras del día, accesos rápidos a la dosis habitual de cada sustancia, lo que está en curso, las tomas de hoy |
| **Registro** | todas las tomas por día, con rango (7d · 30d · 90d · 1a · todo) y filtro de sustancia |
| **Dosis** | la línea de tiempo del episodio, la curva de intensidad, el inspector con las notas |
| **Sustancias** | la lista, y por cada una el perfil, las curvas superpuestas y la tabla de episodios |
| **Gráficos** | dosis por día en línea, mapa de calor calendario o semana × hora, con su tabla gemela |
| **Ajustes** | rango inicial, unidad por defecto, la carpeta de datos, exportar a CSV y JSON |

Registrar una toma es `Ctrl+N`, ajustar la cantidad si hace falta, `Enter`.
El estado de un episodio usa el sistema de estado de Onyx: **En curso**
(respira) si no tiene fin y pasaron menos de 24 h, **Cerrado** si tiene fin.

### Los gráficos

Son SVG dibujados a mano (`renderer/js/graficos.js`), sin librerías: la app
corre con CSP estricta y sin red, y una librería no se ve de la familia.
Siguen las reglas del método de dataviz de la casa:

- **Comparación legible.** Una sola sustancia usa el acento. En Gráficos se
  pueden elegir hasta tres y superponer sus curvas: cian, violeta y ámbar,
  también diferenciadas por trazo, con leyenda, hover y tabla compartidos.
  Si tienen la misma unidad se comparan por dosis o tomas; si se mezclan
  unidades (por ejemplo mg y ml), Apex cuenta tomas para no fingir una escala
  común. «Todas las sustancias» conserva la serie agregada de tomas.
- **Marcas finas**: línea de 2 px, puntos con anillo del color de la
  superficie, área al 10 %, grilla hairline sólida. Una sola etiqueta directa
  (el máximo); el resto lo dice el eje y el hover.
- **El texto viste tokens de texto**, nunca el color de la serie.
- **Hover siempre**: crosshair y tooltip en las líneas; tooltip declarativo de
  Onyx (`data-tip`) en cada celda de los mapas de calor.
- **Tabla gemela**: la línea de dosis por día se despliega también como tabla.
- **Mapa de calor secuencial**: una sola tonalidad —el acento— en cuatro
  escalones de menos a más; el cero se hunde casi en la superficie.

---

## Instalar, actualizar, publicar

`npm run build` arma el instalador NSIS en `dist/`: `Apex-Setup-<versión>.exe`,
su `.blockmap` y `latest.yml`. `npm run test:paquete` arranca ese `.exe` de
verdad y mira que la ventana abra, que el renderer monte (no una pantalla en
blanco) y que escriba en su carpeta de datos. `npm run release` publica los
tres archivos como release `v<versión>` en GitHub, con `gh`.

La app instalada guarda los datos en `%APPDATA%/Apex/data` (en desarrollo, en
`data/` al lado del código). `APEX_DATA` manda sobre las dos.

**Bandeja.** Apex vive al lado del reloj mientras corre. La X esconde la
ventana en vez de cerrar la app —se vuelve desde el ícono, y desde ahí también
se cierra del todo—; la perilla está en Ajustes → Ventana, por si preferís que
la X cierre como cualquier otra ventana. Y hay una sola Apex a la vez: abrirla
de nuevo trae la que ya estaba en lugar de arrancar una segunda sobre los
mismos JSON.

**Actualizaciones.** Al abrirse, la app instalada consulta el último release,
descarga la versión nueva en segundo plano y la instala al reiniciar. Sin
diálogos del sistema: un ítem en la statusbar mientras baja, un toast cuando
está lista, y la sección Actualizaciones de Ajustes para buscar a mano. En
desarrollo no hace nada. El chequeo automático es silencioso; solo el manual
contesta «estás al día».

Para sacar una versión:

```
npm version patch          # o minor: sube package.json, commitea y etiqueta
npm run build
npm run test:paquete
git push --follow-tags
npm run release
```

## Lo propio del código

```
renderer/js/
  pk.js            El cálculo puro: fases, rangos, series, curvas, perfil.
  graficos.js      Los SVG: línea, calendario, semana × hora, curvas.
  campo-fecha.js   Fecha, hora y «momento» propios (nada de type=date).
  dialogos.js      Registrar toma, sustancia, hito; confirmaciones; menús.
  tienda.js        El espejo en memoria de los datos y el chrome.
  vocab.js         Unidades, vías, y el paso del campo de cantidad.
  iconos-apex.js   Los íconos del dominio (Icons.add, no icons.js).
  actualizacion.js El lado renderer de las actualizaciones: statusbar, toast, Ajustes.
  vistas/          Una por sección, más `comunes.js`.
renderer/css/apex.css   Lo que Onyx no tiene, con prefijo `ap-`.
src/ipc.cjs              Colecciones permitidas + exportar CSV/JSON + abrir carpeta.
src/actualizador.cjs     electron-updater contra GitHub Releases, sin diálogos.
src/bandeja.cjs          El ícono junto al reloj: esconder al cerrar, y volver.
build/make-icon.cjs      Renderiza build/icon.png desde la marca (npm run icon).
tools/publicar.mjs       Sube el build a un release de GitHub (npm run release).
test/pk.test.mjs         El cálculo, con fechas locales.
test/humo.test.cjs       El recorrido entero por la UI, sobre datos temporales.
test/capturas.cjs        Siembra tres meses de muestra y fotografía cada vista.
test/empaquetado.test.cjs  Arranca el .exe empaquetado y mira que monte y escriba.
```

Los campos de fecha y hora son propios porque `<input type="date">` abre el
calendario nativo de Chromium. Se tipea `05092026` y `1400`, se formatea solo,
y hay un botón de «Ahora», que es la respuesta el 90 % de las veces.

El CSV exporta todo plano: una fila por toma y una por hito, con la columna
`tipo`, separado por punto y coma (en es-AR la coma es el decimal) y con BOM
para que Excel lo abra bien. El JSON es el volcado entero.

Apex no reemplaza a nadie con matrícula: es un cuaderno, con gráficos.
