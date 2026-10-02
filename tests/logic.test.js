// Pruebas de la logica pura del Pacto del Gym (reglas del negocio, no de la implementacion).
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('./load.js');
const eq = (a, b, msg) => assert.deepStrictEqual(a, b, msg);
const S = arr => new Set(arr);

test('daysIn / monthDays', () => {
  eq(L.daysIn('2026-10'), 31); eq(L.daysIn('2027-02'), 28); eq(L.daysIn('2028-02'), 29);
  eq(L.daysIn('2100-02'), 28); eq(L.daysIn('2000-02'), 29); eq(L.daysIn('2026-12'), 31); eq(L.daysIn('2026-09'), 30);
  const oct = L.monthDays('2026-10'); eq(oct.length, 31); eq(oct[0], '2026-10-01'); eq(oct[30], '2026-10-31');
  eq(L.monthDays('2028-02').at(-1), '2028-02-29');
});

test('wday', () => {
  eq(L.wday('2026-10-02'), 5); eq(L.wday('2026-10-03'), 6); eq(L.wday('2026-10-04'), 0);
  eq(L.wday('2026-10-05'), 1); eq(L.wday('2028-02-29'), 2); eq(L.wday('2027-01-01'), 5);
});

test('addDays', () => {
  eq(L.addDays('2026-10-31', 1), '2026-11-01'); eq(L.addDays('2026-11-01', -1), '2026-10-31');
  eq(L.addDays('2026-12-31', 1), '2027-01-01'); eq(L.addDays('2027-01-01', -1), '2026-12-31');
  eq(L.addDays('2028-02-28', 1), '2028-02-29'); eq(L.addDays('2027-02-28', 1), '2027-03-01');
  eq(L.addDays('2026-10-02', 365), '2027-10-02'); eq(L.addDays('2026-10-02', 0), '2026-10-02');
  eq(L.addDays('2026-03-01', -1), '2026-02-28');
});

test('addMonths / ymOf', () => {
  eq(L.addMonths('2026-12', 1), '2027-01'); eq(L.addMonths('2026-01', -1), '2025-12');
  eq(L.addMonths('2026-10', 15), '2028-01'); eq(L.addMonths('2026-10', -22), '2024-12');
  eq(L.addMonths('2026-10', 0), '2026-10'); eq(L.ymOf('2026-10-02'), '2026-10');
});

test('gs', () => {
  eq(L.gs(5000), '5.000 Gs'); eq(L.gs(0), '0 Gs'); eq(L.gs(1250000), '1.250.000 Gs');
  eq(L.gs(999), '999 Gs'); eq(L.gs(1000), '1.000 Gs'); eq(L.gs(1000000), '1.000.000 Gs');
  eq(L.gs(undefined), '0 Gs'); eq(L.gs(null), '0 Gs'); eq(L.gs(NaN), '0 Gs');
  eq(L.gs(4999.6), '5.000 Gs'); eq(L.gs(-5000), '-5.000 Gs'); eq(L.gs(110000), '110.000 Gs');
});

test('normConfig: basura cae a defaults', () => {
  const D = { fine: 5000, weekdays: [1, 2, 3, 4, 5], holidays: [], start: '2026-10-02', title: 'Pacto del Gym' };
  for (const g of [undefined, null, 'basura', 42, [], true, {}, { fine: 'x', weekdays: '1,2', holidays: '2026-10-12', start: 'hoy', title: '   ' },
    { fine: -1 }, { fine: NaN }, { fine: Infinity }, { fine: null }, { start: 20261002 }, { title: 7 }])
    eq(L.normConfig(g, '2026-10-02'), D, 'entrada ' + JSON.stringify(g));
});
test('normConfig: weekdays filtra invalidos', () => {
  eq(L.normConfig({ weekdays: [1, '2', 7, -1, 1.5, null, 3] }, '2026-10-02').weekdays, [1, 3]);
});
test('normConfig: weekdays todo basura -> default', () => {
  eq(L.normConfig({ weekdays: ['a', 9, null] }, '2026-10-02').weekdays, [1, 2, 3, 4, 5]);
});
test('normConfig: weekdays duplicados', () => {
  eq(L.normConfig({ weekdays: [1, 1, 2] }, '2026-10-02').weekdays, [1, 2]);
});
test('normConfig: fecha con forma valida pero inexistente', () => {
  eq(L.normConfig({ start: '2026-02-30' }, '2026-10-02').start, '2026-10-02');
  eq(L.normConfig({ start: '2026-13-01' }, '2026-10-02').start, '2026-10-02');
  eq(L.normConfig({ holidays: ['2026-02-30', '2026-10-12'] }, '2026-10-02').holidays, ['2026-10-12']);
});
test('normConfig: valores validos pasan', () => {
  eq(L.normConfig({ fine: 10000.4, weekdays: [0, 6], holidays: ['2026-12-25', 'x'], start: '2026-09-01', title: '  Hola  ' }, '2026-10-02'),
    { fine: 10000, weekdays: [0, 6], holidays: ['2026-12-25'], start: '2026-09-01', title: 'Hola' });
  eq(L.normConfig({ fine: 0 }, 'x').fine, 0);
  eq(L.normConfig({ title: 'a'.repeat(80) }, 'x').title.length, 60);
});

test('memberStart', () => {
  const c = L.normConfig({ start: '2026-09-28' }, 'x');
  eq(L.memberStart({ joined: '2026-09-01' }, c), '2026-09-28');
  eq(L.memberStart({ joined: '2026-10-05' }, c), '2026-10-05');
  eq(L.memberStart({}, c), '2026-09-28');
  eq(L.memberStart({ joined: 'basura' }, c), '2026-09-28');
});

test('inMonth', () => {
  const c = L.normConfig({ start: '2026-09-28' }, 'x');
  eq(L.inMonth({ joined: '2026-09-01' }, '2026-08', c), false);
  eq(L.inMonth({ joined: '2026-09-01' }, '2026-09', c), true);
  eq(L.inMonth({ joined: '2026-10-31' }, '2026-10', c), true);
  eq(L.inMonth({ joined: '2026-11-01' }, '2026-10', c), false);
  eq(L.inMonth({ left: '2026-10-01' }, '2026-10', c), true);
  eq(L.inMonth({ left: '2026-09-30' }, '2026-10', c), false);
  eq(L.inMonth({ left: '2026-10-01' }, '2026-11', c), false);
});

// Escenario comun: inicio lunes 28-09-2026, feriado 29-09 (Boqueron), hoy martes 06-10-2026.
const C = L.normConfig({ start: '2026-09-28', holidays: ['2026-09-29'] }, '2026-10-06');
const T = '2026-10-06';
const A = { id: 'A', name: 'Ana', joined: '2026-09-01' };
const B = { id: 'B', name: 'Beto' };
const D = { id: 'D', name: 'Dora', joined: '2026-10-05' };
const E = { id: 'E', name: 'Eva', left: '2026-10-01' };
const keys = (id, ds) => ds.map(d => id + '~' + d);
const ctx = {
  att: S([
    ...keys('A', ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-02', '2026-10-03', '2026-10-05']),
    ...keys('B', ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-05']),
    ...keys('E', ['2026-09-28', '2026-10-02']),
    ...keys('D', ['2026-10-07'])
  ]),
  exc: new Map([['A~2026-10-01', 1], ['B~2026-10-06', 1], ['E~2026-09-30', 1]])
};

test('dayState: todos los estados', () => {
  eq(L.dayState('2026-09-28', A, C, ctx, T), 'done');
  eq(L.dayState('2026-09-29', A, C, ctx, T), 'extra');   // feriado y fue
  eq(L.dayState('2026-09-29', B, C, ctx, T), 'off');     // feriado y no fue
  eq(L.dayState('2026-10-01', A, C, ctx, T), 'excused');
  eq(L.dayState('2026-10-03', A, C, ctx, T), 'extra');   // sabado
  eq(L.dayState('2026-10-04', A, C, ctx, T), 'off');     // domingo
  eq(L.dayState('2026-10-06', A, C, ctx, T), 'pending'); // hoy
  eq(L.dayState('2026-10-07', A, C, ctx, T), 'future');
  eq(L.dayState('2026-10-07', D, C, ctx, T), 'future');  // marca futura sigue siendo futura
  eq(L.dayState('2026-10-02', B, C, ctx, T), 'miss');
  eq(L.dayState('2026-09-25', A, C, ctx, T), 'off');     // antes del inicio
  eq(L.dayState('2026-10-02', D, C, ctx, T), 'off');     // antes de sumarse
  eq(L.dayState('2026-10-05', D, C, ctx, T), 'miss');
  eq(L.dayState('2026-10-01', E, C, ctx, T), 'miss');    // el dia de baja cuenta
  eq(L.dayState('2026-10-02', E, C, ctx, T), 'extra');   // despues de la baja: no cuenta
  eq(L.dayState('2026-10-05', E, C, ctx, T), 'off');
  eq(L.dayState('2026-10-06', B, C, ctx, T), 'excused'); // hoy justificado
  const ctxMap = { att: new Map([['A~2026-10-06', true]]), exc: new Map() };
  eq(L.dayState('2026-10-06', A, C, ctxMap, T), 'done'); // hoy marcado, ctx con Map
});

const pick = s => ({ done: s.done, extra: s.extra, miss: s.miss, excused: s.excused, pending: s.pending, counted: s.counted, rate: s.rate, fine: s.fine, gone: s.gone });
test('monthStats', () => {
  eq(pick(L.monthStats(A, '2026-10', C, ctx, T)), { done: 2, extra: 1, miss: 0, excused: 1, pending: 1, counted: 2, rate: 1, fine: 0, gone: 3 });
  eq(pick(L.monthStats(A, '2026-09', C, ctx, T)), { done: 2, extra: 1, miss: 0, excused: 0, pending: 0, counted: 2, rate: 1, fine: 0, gone: 3 });
  eq(pick(L.monthStats(B, '2026-10', C, ctx, T)), { done: 2, extra: 0, miss: 1, excused: 1, pending: 0, counted: 3, rate: 2 / 3, fine: 5000, gone: 2 });
  eq(pick(L.monthStats(D, '2026-10', C, ctx, T)), { done: 0, extra: 0, miss: 1, excused: 0, pending: 1, counted: 1, rate: 0, fine: 5000, gone: 0 });
  eq(pick(L.monthStats(E, '2026-10', C, ctx, T)), { done: 0, extra: 1, miss: 1, excused: 0, pending: 0, counted: 1, rate: 0, fine: 5000, gone: 1 });
  eq(pick(L.monthStats(A, '2026-11', C, ctx, T)), { done: 0, extra: 0, miss: 0, excused: 0, pending: 0, counted: 0, rate: null, fine: 0, gone: 0 });
  eq(L.monthStats(A, '2026-10', C, ctx, T).days.length, 31);
  // Mes entero sin ir: 22 dias habiles en oct-2026; con un feriado, 21; multa configurada.
  const c2 = L.normConfig({ start: '2026-10-01' }, 'x');
  const z = { att: S([]), exc: S([]) };
  const s1 = L.monthStats({ id: 'Z' }, '2026-10', c2, z, '2026-11-15');
  eq([s1.miss, s1.fine, L.gs(s1.fine)], [22, 110000, '110.000 Gs']);
  const c3 = L.normConfig({ start: '2026-10-01', holidays: ['2026-10-12'], fine: 7000 }, 'x');
  eq(L.monthStats({ id: 'Z' }, '2026-10', c3, z, '2026-11-15').fine, 21 * 7000);
  eq(L.monthStats({ id: 'Z' }, '2027-02', L.normConfig({ start: '2027-01-01' }, 'x'), z, '2027-03-15').miss, 20);
  eq(L.monthStats({ id: 'Z' }, '2028-02', L.normConfig({ start: '2028-01-01' }, 'x'), z, '2028-03-15').miss, 21);
});

test('streaks: fin de semana, feriado, justificado, falta y cambio de mes', () => {
  eq(L.streaks(A, C, ctx, T), { cur: 4, best: 4 });  // 28-09, 30-09, (01-10 justif.), 02-10, 05-10; hoy pendiente
  eq(L.streaks(B, C, ctx, T), { cur: 1, best: 3 });  // 28,30,01 | falta 02 | 05, hoy justificado
  eq(L.streaks(D, C, ctx, T), { cur: 0, best: 0 });
  eq(L.streaks(E, C, ctx, T), { cur: 0, best: 1 });  // 28, 30 justif., falta 01, despues no cuenta
  eq(L.streaks({ id: 'F', joined: '2026-12-01' }, C, ctx, T), { cur: 0, best: 0 }); // todavia no empezo
  // Cruce de anio con feriado el 01-01 sin ir.
  const cy = L.normConfig({ start: '2026-12-28', holidays: ['2027-01-01'] }, 'x');
  const ay = { att: S(keys('Y', ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-04', '2027-01-05'])), exc: S([]) };
  eq(L.streaks({ id: 'Y' }, cy, ay, '2027-01-06'), { cur: 6, best: 6 });
  eq(L.streaks({ id: 'Y' }, cy, ay, '2027-01-07'), { cur: 0, best: 6 }); // falto el 06
  // Hoy marcado suma a la racha.
  const ay2 = { att: S([...ay.att, 'Y~2027-01-06']), exc: S([]) };
  eq(L.streaks({ id: 'Y' }, cy, ay2, '2027-01-06'), { cur: 7, best: 7 });
});

test('streaks: reto largo (mas de 3000 dias)', () => {
  const c = L.normConfig({ start: '2018-01-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }, 'x');
  const today = '2026-10-02';
  const att = new Set(); let d = c.start;
  while (d <= today) { att.add('Q~' + d); d = L.addDays(d, 1); }
  // Falta el 01-10-2026; hoy 02-10 marcado: la racha actual debe ser 1.
  att.delete('Q~2026-10-01');
  eq(L.streaks({ id: 'Q' }, c, { att, exc: S([]) }, today).cur, 1);
});

const row = (name, miss, rate, gone, cur) => ({ m: { name }, st: { miss, rate, gone }, sk: { cur } });
test('rank: orden y posiciones', () => {
  const rows = [row('Eva', 1, 0.8, 4, 0), row('Fede', 0, null, 0, 0), row('Beto', 0, 1, 5, 3), row('Dario', 1, 0.8, 4, 2), row('Carla', 0, 1, 4, 9), row('Ana', 0, 1, 5, 5)];
  const r = L.rank(rows);
  eq(r.map(x => x.m.name + ':' + x.pos), ['Ana:1', 'Beto:1', 'Carla:3', 'Fede:4', 'Dario:5', 'Eva:5']);
  eq(rows[0].m.name, 'Eva', 'no reordena el arreglo original');
});
test('rank: tasa antes que idas', () => {
  eq(L.rank([row('Y', 1, 0.5, 10, 0), row('X', 1, 0.9, 9, 0)]).map(x => x.m.name + ':' + x.pos), ['X:1', 'Y:2']);
});
test('rank: nombre con colacion espanola', () => {
  eq(L.rank([row('Óscar', 0, 1, 1, 1), row('Ñandú', 0, 1, 1, 1), row('Nora', 0, 1, 1, 1), row('Álvaro', 0, 1, 1, 1), row('Pablo', 0, 1, 1, 1)]).map(x => x.m.name + ':' + x.pos),
    ['Álvaro:1', 'Nora:1', 'Ñandú:1', 'Óscar:1', 'Pablo:1']);
});
test("rank: comparten puesto sólo si empatan en faltas, porcentaje e idas", () => {
  const r = L.rank([row("A", 1, 2 / 3, 2, 0), row("B", 1, 0.5, 2, 0), row("C", 1, 0.6, 5, 0), row("D", 1, 0.5, 2, 0)]);
  eq(r.map(x => x.m.name + ":" + x.pos), ["A:1", "C:2", "B:3", "D:3"]);
});
test('rank: vacio', () => { eq(L.rank([]), []); });

test('plus de fin de semana: cada sábado o domingo perdona una falta del mes', () => {
  // Reto desde el lunes 5/10/2026, lunes a viernes. Hoy: viernes 16/10.
  const c = L.normConfig({ start: '2026-10-05', weekdays: [1, 2, 3, 4, 5] }, 'x');
  const T2 = '2026-10-16';
  const m = { id: 'p', joined: '2026-10-02' };
  const k = d => 'p~' + d;
  // Fue todos los días hábiles salvo el 7 y el 8 (2 faltas); fue el sábado 10.
  const went = ['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  const st = L.monthStats(m, '2026-10', c, { att: S(went.map(k)), exc: S([]) }, T2);
  eq([st.rawMiss, st.bonus, st.saved, st.miss, st.fine], [2, 1, 1, 1, 5000]);
  // Dos findes: ya no paga nada; el plus que sobra no se acumula.
  const st2 = L.monthStats(m, '2026-10', c, { att: S(went.concat(['2026-10-11', '2026-10-04']).map(k)), exc: S([]) }, T2);
  eq([st2.bonus, st2.saved, st2.miss, st2.fine], [2, 2, 0, 0]);   // el domingo 4 es antes del inicio: no suma
  // Sin faltas, el plus no da saldo a favor.
  const st3 = L.monthStats(m, '2026-10', c, { att: S(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map(k)), exc: S([]) }, '2026-10-10');
  eq([st3.rawMiss, st3.bonus, st3.miss, st3.fine], [0, 1, 0, 0]);
  // La asistencia (%) es la real, sin el plus.
  eq(Math.round(st.rate * 100), 80);
});

test('reto que empieza el lunes: el viernes y el finde anteriores no cuentan', () => {
  const c = L.normConfig({ start: '2026-10-05' }, 'x');
  const m = { id: 'q', joined: '2026-10-02' };
  const z = { att: S([]), exc: S([]) };
  eq(L.dayState('2026-10-02', m, c, z, '2026-10-02'), 'off');
  eq(L.monthStats(m, '2026-10', c, z, '2026-10-04').miss, 0);
  eq(L.monthStats(m, '2026-10', c, z, '2026-10-06').miss, 1);   // el lunes 5 sí es falta
});
