/* Lógica pura del reto: fechas, estado de cada día, faltas, multas y rachas.
   No toca la página ni la base; recibe todo por parámetro para poder probarla aparte. */
var PactoLogic = (function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  // Formato AAAA-MM-DD y además una fecha que exista (nada de 30 de febrero).
  const isYmd = s => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const p = s.split('-').map(Number);
    return ymd(new Date(p[0], p[1] - 1, p[2], 12)) === s;
  };
  // Mediodía local, para que ningún cambio de horario corra el día.
  const parse = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const wday = s => parse(s).getDay();
  const ymOf = s => s.slice(0, 7);
  const daysIn = ym => { const p = ym.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); };
  const monthDays = ym => Array.from({ length: daysIn(ym) }, (_, i) => ym + '-' + pad(i + 1));
  const addMonths = (ym, n) => { const p = ym.split('-').map(Number); const d = new Date(p[0], p[1] - 1 + n, 1, 12); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  // Guaraníes con punto de miles, como se escribe en Paraguay.
  const gs = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' Gs';

  // Normaliza la configuración guardada; lo que falte o venga mal toma el valor por defecto.
  function normConfig(c, todayStr) {
    c = c || {};
    // Días válidos y sin repetir; si no queda ninguno, lunes a viernes (si no, nadie pagaría nunca).
    const wd = Array.isArray(c.weekdays) ? [...new Set(c.weekdays.filter(n => Number.isInteger(n) && n >= 0 && n <= 6))] : [];
    return {
      fine: typeof c.fine === 'number' && isFinite(c.fine) && c.fine >= 0 ? Math.round(c.fine) : 5000,
      weekdays: wd.length ? wd : [1, 2, 3, 4, 5],
      holidays: Array.isArray(c.holidays) ? c.holidays.filter(isYmd) : [],
      start: isYmd(c.start) ? c.start : todayStr,
      title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 60) : 'Pacto del Gym'
    };
  }

  const isTraining = (d, c) => c.weekdays.includes(wday(d)) && !c.holidays.includes(d);

  // Cada uno empieza a contar desde el inicio del reto o desde que se sumó, lo que sea más tarde.
  function memberStart(m, c) {
    const j = isYmd(m.joined) ? m.joined : c.start;
    return j > c.start ? j : c.start;
  }

  // Estado de un día para una persona:
  // done = fue en día que cuenta; miss = faltó; excused = justificado; pending = hoy sin marcar;
  // extra = fue en un día que no cuenta; off = no cuenta; future = todavía no llegó.
  function dayState(d, m, c, ctx, today) {
    if (d > today) return 'future';
    const k = m.id + '~' + d;
    const went = ctx.att.has(k);
    const counts = d >= memberStart(m, c) && isTraining(d, c) && !(isYmd(m.left) && d > m.left);
    if (!counts) return went ? 'extra' : 'off';
    if (went) return 'done';
    if (ctx.exc.has(k)) return 'excused';
    return d === today ? 'pending' : 'miss';
  }

  function monthStats(m, ym, c, ctx, today) {
    const days = monthDays(ym).map(d => ({ d: d, s: dayState(d, m, c, ctx, today) }));
    const n = { done: 0, extra: 0, miss: 0, excused: 0, pending: 0 };
    for (const x of days) if (x.s in n) n[x.s]++;
    const counted = n.done + n.miss;
    return Object.assign(n, {
      days: days, counted: counted,
      rate: counted ? n.done / counted : null,
      fine: n.miss * c.fine,
      gone: n.done + n.extra
    });
  }

  // Racha = días que cuentan seguidos sin faltar. Justificados y días libres no la cortan;
  // hoy sin marcar tampoco (todavía hay tiempo).
  function streaks(m, c, ctx, today) {
    const start = memberStart(m, c);
    let run = 0, best = 0;
    if (start > today) return { cur: 0, best: 0 };
    for (let d = start, i = 0; d <= today && i < 40000; d = addDays(d, 1), i++) {
      const s = dayState(d, m, c, ctx, today);
      if (s === 'done') { run++; if (run > best) best = run; }
      else if (s === 'miss') run = 0;
    }
    return { cur: run, best: best };
  }

  // Si la persona participa en ese mes (ya se había sumado y no se dio de baja antes).
  function inMonth(m, ym, c) {
    const first = ym + '-01', last = ym + '-' + pad(daysIn(ym));
    return memberStart(m, c) <= last && !(isYmd(m.left) && m.left < first);
  }

  // Orden de la tabla: menos faltas, mejor porcentaje, más idas, racha más larga, nombre.
  function rank(rows) {
    const sorted = rows.slice().sort((a, b) =>
      a.st.miss - b.st.miss ||
      (b.st.rate == null ? -1 : b.st.rate) - (a.st.rate == null ? -1 : a.st.rate) ||
      b.st.gone - a.st.gone ||
      b.sk.cur - a.sk.cur ||
      String(a.m.name).localeCompare(String(b.m.name), 'es'));
    let pos = 0, prev = null;
    sorted.forEach((r, i) => {
      // Comparten puesto sólo si empatan en todo lo que decide el orden (faltas, porcentaje, idas).
      if (!prev || r.st.miss !== prev.st.miss || r.st.rate !== prev.st.rate || r.st.gone !== prev.st.gone) pos = i + 1;
      r.pos = pos; prev = r;
    });
    return sorted;
  }

  return { pad, isYmd, ymd, parse, addDays, wday, ymOf, daysIn, monthDays, addMonths, gs,
           normConfig, isTraining, memberStart, dayState, monthStats, streaks, inMonth, rank };
})();
