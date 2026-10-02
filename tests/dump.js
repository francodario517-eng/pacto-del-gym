// Calcula un lote de resultados y los imprime en JSON; se corre en varias zonas horarias.
const L = require('./load.js');
const out = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, offJan: new Date(2026, 0, 1).getTimezoneOffset(), offJul: new Date(2026, 6, 1).getTimezoneOffset(), r: {} };
// Fechas de cambio de horario: Madrid 2026, Sao Paulo 2018/2019 (salto a medianoche),
// Asuncion 2023/2024 (medianoche), Santiago 2026 (medianoche), mas fin de mes/anio.
const pivots = ['2026-03-29', '2026-10-25', '2018-11-04', '2019-02-17', '2023-10-01', '2024-03-24',
  '2026-09-06', '2026-04-05', '2026-10-31', '2026-12-31', '2028-02-28', '2026-10-02'];
for (const p of pivots) {
  const walk = []; let d = L.addDays(p, -3);
  for (let i = 0; i < 7; i++) { walk.push(d + ':' + L.wday(d) + ':' + L.ymd(L.parse(d))); d = L.addDays(d, 1); }
  out.r[p] = { walk, back: L.addDays(p, -1), fwd: L.addDays(p, 1), m30: L.addDays(p, 30), ym: L.addMonths(L.ymOf(p), 1), days: L.daysIn(L.ymOf(p)) };
}
// Una corrida completa de estadisticas cruzando el cambio de horario de Madrid (25-10).
const c = L.normConfig({ start: '2026-10-19', holidays: [] }, '2026-10-19');
const m = { id: 'a', name: 'A' };
const att = new Set(['a~2026-10-19', 'a~2026-10-20', 'a~2026-10-23', 'a~2026-10-25', 'a~2026-10-26', 'a~2026-10-27']);
const ctx = { att, exc: new Set(['a~2026-10-22']) };
out.r.stats = L.monthStats(m, '2026-10', c, ctx, '2026-10-28');
out.r.sk = L.streaks(m, c, ctx, '2026-10-28');
console.log(JSON.stringify(out));
