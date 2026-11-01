/* ═══════════════════════════════════════════════════════════════════════════
   El vigía del día (renderer/js/dia.js): la app abierta días seguidos tiene
   que enterarse de la medianoche. El reloj se inyecta: la medianoche se
   simula, no se espera.
   ═══════════════════════════════════════════════════════════════════════════ */

import { claveDia, crearVigia } from '../renderer/js/dia.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const J = (x) => JSON.stringify(x);

console.log('\n1. La clave del día es local');
ok('23:59 del 31/10 es el 31', claveDia(new Date(2026, 9, 31, 23, 59).getTime()) === '2026-10-31');
ok('00:00 del 1/11 ya es el 1', claveDia(new Date(2026, 10, 1, 0, 0).getTime()) === '2026-11-01');

console.log('\n2. El vigía');
let ms = new Date(2026, 9, 31, 23, 59).getTime();
const v = crearVigia(() => claveDia(ms));
const avisos = [];
v.alCambiar((c) => avisos.push(c));
ok('arranca en el día del reloj', v.dia === '2026-10-31');
ok('sin medianoche, revisar no avisa', v.revisar() === null && avisos.length === 0);
ms += 2 * 60_000;
ok('pasada la medianoche avisa con el día viejo y el nuevo', J(v.revisar()) === J({ antes: '2026-10-31', ahora: '2026-11-01' }));
ok('avisa una sola vez', v.revisar() === null && avisos.length === 1, J(avisos));
ms += 3 * 86_400_000;
ok('tres días de golpe (suspendida) es un solo aviso', J(v.revisar()) === J({ antes: '2026-11-01', ahora: '2026-11-04' }) && avisos.length === 2);

console.log('\n3. Oyentes');
const v2 = crearVigia(() => claveDia(ms));
let llego = false;
const errorOriginal = console.error;
console.error = () => {};
v2.alCambiar(() => { throw new Error('a propósito'); });
v2.alCambiar(() => { llego = true; });
ms += 86_400_000;
v2.revisar();
console.error = errorOriginal;
ok('uno que falla no corta a los demás', llego);
const v3 = crearVigia(() => claveDia(ms));
let corrio = false;
const soltar = v3.alCambiar(() => { corrio = true; });
soltar();
ms += 86_400_000;
v3.revisar();
ok('soltar() lo saca de la lista', !corrio);

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
