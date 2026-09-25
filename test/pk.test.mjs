/* ═══════════════════════════════════════════════════════════════════════════
   El cálculo farmacocinético, con Node pelado.

   Lo que se prueba es lo que después se dibuja: si acá una mediana sale mal,
   el perfil de la sustancia miente con toda la cara. Las fechas se arman en
   hora LOCAL a propósito: una toma a las 23:30 es de ese día, y el cambio de
   horario no puede correr un día de lugar.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as pk from '../renderer/js/pk.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const es = (n, real, esperado) => ok(`${n} → ${JSON.stringify(esperado)}`, JSON.stringify(real) === JSON.stringify(esperado), `dio ${JSON.stringify(real)}`);

const { MIN, HORA } = pk;
const t0 = new Date(2026, 8, 5, 14, 0).getTime();       // sáb 5 sep 2026, 14:00
const hito = (min, fase, intensidad = null) => ({ id: `h${min}`, at: t0 + min * MIN, fase, intensidad });

const d1 = { id: 'd-1', sustanciaId: 's-1', at: t0, cantidad: 200, unidad: 'mg',
  hitos: [hito(60, 'onset', 3), hito(150, 'pico', 8), hito(300, 'baja', 4), hito(480, 'fin')] };
const d2 = { id: 'd-2', sustanciaId: 's-1', at: t0 - pk.DIA, cantidad: 100, unidad: 'mg',
  hitos: [{ ...hito(40, 'onset', 2), at: t0 - pk.DIA + 40 * MIN }, { ...hito(120, 'pico', 6), at: t0 - pk.DIA + 120 * MIN }, { ...hito(400, 'fin'), at: t0 - pk.DIA + 400 * MIN }] };
const d3 = { id: 'd-3', sustanciaId: 's-2', at: t0 - 2 * pk.DIA + 9 * HORA, cantidad: 0.5, unidad: 'mg', hitos: [] };

console.log('\n1. Fases y estado');
es('faseInfo(pico).label', pk.faseInfo('pico').label, 'Pico');
es('una fase desconocida cae en nota', pk.faseInfo('zzz').id, 'nota');
es('con fin → done', pk.estadoDosis(d1, t0 + 3 * HORA), 'done');
es('reciente sin fin → running', pk.estadoDosis({ ...d1, hitos: [] }, t0 + 3 * HORA), 'running');
es('justo antes de las 24 h sigue en curso', pk.estadoDosis({ ...d1, hitos: [] }, t0 + 24 * HORA - MIN), 'running');
// Pasado el día entero se separan los dos casos: la toma que nunca registró un
// hito se cierra sola, la que registró y quedó sin «fin» sigue abierta.
es('vieja y sin un solo hito → done', pk.estadoDosis({ ...d1, hitos: [] }, t0 + 30 * HORA), 'done');
es('vieja con hitos y sin fin → idle', pk.estadoDosis({ ...d1, hitos: d1.hitos.slice(0, 3) }, t0 + 30 * HORA), 'idle');

console.log('\n2. Días en hora local');
es('diaISO', pk.diaISO(t0), '2026-09-05');
es('inicioDia deja las 00:00', new Date(pk.inicioDia(t0)).getHours(), 0);
es('23:30 sigue siendo el mismo día', pk.diaISO(new Date(2026, 8, 5, 23, 30).getTime()), '2026-09-05');
es('lunes = 0, sábado = 5', pk.diaSemana(t0), 5);
es('sumarDias cruza el mes', pk.diaISO(pk.sumarDias(new Date(2026, 8, 30).getTime(), 1)), '2026-10-01');

console.log('\n3. Rango');
const r7 = pk.rango('7d', [d1], t0);
es('7d arranca 6 días antes', pk.diaISO(r7.desde), '2026-08-30');
ok('7d termina al final de hoy', new Date(r7.hasta).getHours() === 23 && pk.diaISO(r7.hasta) === '2026-09-05');
const rt = pk.rango('todo', [d1, d2, d3], t0);
// La primera toma es de hace dos días: «todo» igual cubre una semana entera.
es('todo nunca cubre menos de una semana', pk.diaISO(rt.desde), '2026-08-30');
es('todo arranca en la primera toma cuando es vieja', pk.diaISO(pk.rango('todo', [{ at: new Date(2026, 5, 10, 8).getTime() }], t0).desde), '2026-06-10');
es('todo sin tomas cubre 30 días', pk.diaISO(pk.rango('todo', [], t0).desde), '2026-08-07');
es('un rango desconocido cae en 30d', pk.rango('xx', [], t0).id, '30d');

console.log('\n4. Serie diaria y calendario');
const serie = pk.serieDiaria([d1, d2, d3], r7);
es('un punto por día', serie.length, 7);
es('los días con toma', serie.filter((p) => p.valor).map((p) => `${p.iso}:${p.valor}`), ['2026-09-03:0.5', '2026-09-04:100', '2026-09-05:200']);
es('métrica tomas cuenta', pk.serieDiaria([d1, d2, d3], { ...r7, metrica: 'tomas' }).map((p) => p.valor).reduce((a, b) => a + b), 3);
const cal = pk.calendario(serie);
es('el calendario completa semanas de lunes a domingo', cal.semanas.map((s) => s.length), [7, 7]);
es('la primera celda es lunes', pk.diaSemana(cal.semanas[0][0].dia), 0);
// El rango arranca el domingo 30: los seis días anteriores de esa semana son relleno.
es('el relleno viene marcado', cal.semanas.map((s) => s.filter((c) => !c.enRango).length), [6, 1]);
es('el máximo', cal.max, 200);
es('niveles', [pk.nivel(0, 200), pk.nivel(1, 200), pk.nivel(100, 200), pk.nivel(200, 200)], [0, 1, 2, 4]);
const sh = pk.semanaHora([d1, d2, d3], r7);
es('semana × hora: sábado 14 h', sh.matriz[5][14], 1);
es('semana × hora: jueves 23 h', sh.matriz[3][23], 1);
es('semana × hora: máximo', sh.max, 1);

console.log('\n5. Curvas y mediana');
const cs = pk.curvas([d1, d2, d3]);
es('solo los episodios con intensidad', cs.map((c) => c.id), ['d-1', 'd-2']);
es('la toma es el (0,0)', cs[0].puntos[0], { t: 0, i: 0, fase: 'toma' });
es('fin sin intensidad vale 0', cs[0].puntos[cs[0].puntos.length - 1].i, 0);
es('interpolar en el medio', pk.interpolar(cs[0].puntos, 1), 3);                 // onset a 1 h = 3
ok('interpolar entre onset y pico', Math.abs(pk.interpolar(cs[0].puntos, 1.75) - 5.5) < 1e-9);
es('después del fin sigue en 0', pk.interpolar(cs[0].puntos, 20), 0);
es('una curva abierta no inventa', pk.interpolar([{ t: 0, i: 0 }, { t: 1, i: 5 }], 2), null);
const med = pk.curvaMediana(cs, 0.5);
ok('la mediana existe con dos episodios', med.length > 0, String(med.length));
es('la mediana en t=0 es 0', med[0], { t: 0, i: 0, n: 2 });
es('con un solo episodio no hay mediana', pk.curvaMediana([cs[0]]), []);
es('mediana par', pk.mediana([1, 3, 2, 10]), 2.5);
es('mediana impar', pk.mediana([5, 1, 3]), 3);
es('mediana vacía', pk.mediana([]), null);

console.log('\n6. Perfil');
const p = pk.perfil([d1, d2, d3]);
es('episodios', p.episodios, 3);
es('con hitos', p.conHitos, 2);
es('onset mediana (min)', p.fases.onset.mediana, 50);
es('onset rango', [p.fases.onset.min, p.fases.onset.max], [40, 60]);
es('pico n', p.fases.pico.n, 2);
es('plateau sin datos', p.fases.plateau.n, 0);
es('duración = fin − onset', p.duracion.mediana, (420 + 360) / 2);
es('intensidad máxima mediana', p.intensidad.mediana, 7);
es('cantidad mediana', p.cantidad.mediana, 100);
// El primer hito de cada fase manda: un segundo «pico» no corre el tiempo.
const conPicoDoble = { ...d1, hitos: [...d1.hitos, hito(200, 'pico', 9)] };
es('el primer pico manda', pk.perfil([conPicoDoble]).fases.pico.mediana, 150);
// Un hito antes de la toma es un typo y no entra.
const conTypo = { ...d1, hitos: [hito(-30, 'onset', 3), ...d1.hitos] };
es('un hito antes de la toma se ignora', pk.perfil([conTypo]).fases.onset.mediana, 60);

console.log('\n7. Totales y agrupado');
es('totales', pk.totales([d1, d2]), { tomas: 2, total: 300, ultima: t0, primera: t0 - pk.DIA });
es('porDia ordena de hoy hacia atrás', pk.porDia([d3, d1, d2]).map((g) => g.iso), ['2026-09-05', '2026-09-04', '2026-09-03']);
es('resumen de un día de una sola sustancia', pk.resumenDia([d1, d2]), { tipo: 'suma', total: 300, unidad: 'mg', tomas: 2 });
es('resumen mezclado cuenta tomas', pk.resumenDia([d1, d3]), { tipo: 'tomas', tomas: 2 });

console.log('\n8. Combinaciones');
const zolpi = { id: 's-z', nombre: 'Zolpidem', unidad: 'mg', esquema: { modo: 'fijo', tomasDia: 1, min: 20, max: 10 } };
const combo = { id: 's-c', nombre: 'Zolpidem + Midazolam', componentes: [{ sustanciaId: 's-z', cantidad: 10 }, { sustanciaId: 's-m', cantidad: 7.5 }] };
const dc = { id: 'd-c', sustanciaId: 's-c', at: t0 + 8 * HORA, cantidad: null, unidad: null,
  componentes: [{ sustanciaId: 's-z', cantidad: 10, unidad: 'mg' }, { sustanciaId: 's-m', cantidad: 7.5, unidad: 'mg' }],
  hitos: [hito(8 * 60 + 20, 'onset', 5), hito(8 * 60 + 300, 'fin')] };
const dz = { id: 'd-z', sustanciaId: 's-z', at: t0 - pk.DIA, cantidad: 10, unidad: 'mg', hitos: [{ ...hito(30, 'onset', 4), at: t0 - pk.DIA + 30 * MIN }] };
ok('una combinación se reconoce', pk.esCombinacion(combo) && !pk.esCombinacion(zolpi));
const ap = pk.aportesDe('s-z', [dc, dz, d1]);
es('los aportes suman la toma propia y la de la combinación', ap.map((d) => `${d.id}:${d.cantidad}`), ['d-c:10', 'd-z:10']);
es('el aporte de la combinación no trae hitos', ap[0].hitos, []);
es('y recuerda de qué combinación salió', ap[0].combinacion, 's-c');
// El perfil del zolpidem solo se calcula con SUS tomas, nunca con las de la mezcla.
es('el perfil del componente no se contamina', pk.perfil([dz]).fases.onset.mediana, 30);
es('la combinación tiene su propio perfil', pk.perfil([dc]).fases.onset.mediana, 20);
es('un día solo de combinaciones cuenta tomas', pk.resumenDia([dc]), { tipo: 'tomas', tomas: 1 });

console.log('\n9. Esquema');
es('un rango al revés se endereza', pk.normalizarEsquema(zolpi.esquema), { modo: 'fijo', tomasDia: 1, min: 10, max: 20 });
es('a demanda no lleva tomas por día', pk.normalizarEsquema({ modo: 'demanda', tomasDia: 3, min: 150, max: '' }), { modo: 'demanda', tomasDia: null, min: 150, max: null });
es('un modo desconocido no es esquema', pk.normalizarEsquema({ modo: 'zzz' }), null);
es('sin esquema no hay día', pk.esquemaDelDia({ id: 's-1', unidad: 'mg' }, [d1], t0), null);
const dia = pk.esquemaDelDia(zolpi, [dc, dz], t0 + 9 * HORA);
es('la toma de la combinación cumple el fijo del componente', [dia.hechas, dia.completo, dia.total], [1, true, 10]);
const lamo = { id: 's-l', unidad: 'mg', esquema: { modo: 'fijo', tomasDia: 2 } };
const dl = { id: 'd-l', sustanciaId: 's-l', at: t0 - 5 * HORA, cantidad: 200, unidad: 'mg', hitos: [] };
const diaL = pk.esquemaDelDia(lamo, [dl, { ...dl, id: 'd-ayer', at: t0 - pk.DIA }], t0);
es('dos tomas previstas, una hecha hoy', [diaL.hechas, diaL.tomasDia, diaL.completo], [1, 2, false]);
// Fuera de rango no es error: el esquema describe, no limita.
const diaZ = pk.esquemaDelDia(zolpi, [{ ...dz, at: t0, cantidad: 30 }], t0);
es('una toma por encima del rango se cuenta igual', [diaZ.hechas, diaZ.total], [1, 30]);

console.log('\n10. Stock');
es('la carga exacta con menos unidades', pk.cargaParaToma(300, [150, 300]), 300);
es('150 sale de la de 150', pk.cargaParaToma(150, [150, 300]), 150);
es('sin exacta, la más grande que no se pasa', pk.cargaParaToma(200, [150, 300]), 150);
es('si todas se pasan, la más chica', pk.cargaParaToma(75, [150, 300]), 150);
const ing = (id, dias, sustanciaId, carga, u, env) => ({ id, at: t0 - dias * pk.DIA, sustanciaId, carga, unidad: 'mg', unidadesPorEnvase: u, envases: env });
const ingresos = [
  ing('i-1', 10, 's-a', 150, 30, 1),
  ing('i-2', 2, 's-a', 150, 30, 2),     // misma droga y carga: se suma
  ing('i-3', 5, 's-a', 250, 10, 1),     // otra carga: otro stock
];
const toma = (id, dias, cantidad, extra = {}) => ({ id, sustanciaId: 's-a', at: t0 - dias * pk.DIA, cantidad, unidad: 'mg', hitos: [], ...extra });
const tomas = [
  toma('t-antes', 12, 150),            // antes del primer ingreso: no descuenta
  toma('t-1', 9, 150),
  toma('t-2', 8, 300),                 // dos comprimidos
  toma('t-3', 4, 250),                 // sale del de 250, que ya existía
  toma('t-4', 3, 500, { carga: 250 }), // elegida a mano
  toma('t-5', 1, 75),                  // medio comprimido de 150
];
const st = pk.stocks(ingresos, tomas);
es('un stock por carga', st.map((p) => p.carga), [150, 250]);
es('los ingresos de la misma carga se suman', st[0].ingresado, 90);
es('lo anterior al primer ingreso no cuenta', st[0].tomas.map((t) => t.id), ['t-1', 't-2', 't-5']);
es('se descuenta en unidades, con medios', st[0].consumido, 3.5);
es('restantes', st[0].restantes, 86.5);
es('la carga elegida a mano manda', [st[1].consumido, st[1].restantes], [3, 7]);
const conCombo = pk.stocks([ing('i-z', 3, 's-z', 10, 30, 1)], [dc, { ...dz, at: t0 - pk.DIA }]);
es('lo tomado en una combinación también descuenta', conCombo[0].consumido, 2);
es('dosis diaria del esquema fijo', pk.dosisDiariaEsquema({ dosisHabitual: 200, esquema: { modo: 'fijo', tomasDia: 2 } }), 400);
es('a demanda no tiene dosis diaria', pk.dosisDiariaEsquema({ dosisHabitual: 200, esquema: { modo: 'demanda' } }), null);
ok('el ritmo real promedia los días', Math.abs(pk.ritmoReal(st[0], t0) - 3.5 / 10) < 1e-9, String(pk.ritmoReal(st[0], t0)));
es('con menos de un día no hay ritmo', pk.ritmoReal({ ...st[0], desde: t0 - pk.HORA }, t0), null);
const a = pk.alcanza(90, 1, t0);
es('90 unidades a 1 por día: 90 días', [a.dias, pk.diaISO(a.hasta)], [90, '2026-12-04']);
es('a 2 por día con 3: un día', pk.alcanza(3, 2, t0).dias, 1);
es('sin consumo no hay fecha', pk.alcanza(30, 0, t0), null);

console.log('\nReservas');
const reserva = {
  ...ing('r-1', 20, 's-a', 150, 30, 3),
  salidas: [
    { id: 'x-2', tipo: 'entrega', at: t0 - pk.DIA, unidades: 30, destino: 'Papá' },
    { id: 'x-1', tipo: 'stock', at: t0 - 5 * pk.DIA, unidades: 30, ingresoId: 'i-9' },
    { id: 'x-3', tipo: 'cualquiera', at: t0, unidades: 30 },   // un tipo que no existe no cuenta
  ],
};
const er = pk.estadoReserva(reserva);
es('lo reservado, lo que salió por cada lado y lo que queda', [er.total, er.aStock, er.entregadas, er.restantes], [90, 30, 30, 30]);
es('las salidas, de la más vieja a la más nueva', er.salidas.map((x) => x.id), ['x-1', 'x-2']);
es('sin salidas queda todo', pk.estadoReserva(ing('r-2', 1, 's-a', 150, 30, 2)).restantes, 60);
es('las tomas nunca descuentan una reserva: stocks() no la ve', pk.stocks([], tomas), []);
es('60 de cajas de 30 son dos cajas', pk.envasesPara(60, 30), { unidadesPorEnvase: 30, envases: 2 });
es('45 de cajas de 30 son un envase suelto de 45', pk.envasesPara(45, 30), { unidadesPorEnvase: 45, envases: 1 });
es('menos de una caja, también suelto', pk.envasesPara(10, 30), { unidadesPorEnvase: 10, envases: 1 });

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══\n`);
process.exit(fail ? 1 : 0);
