/* Pacto del Gym: pantalla, ingreso y conexión con Supabase.
   Las reglas de seguridad viven en la base (supabase/schema.sql); acá sólo
   se ofrece lo que cada uno puede hacer, y el servidor tiene la última palabra. */
(function () {
  'use strict';
  const L = PactoLogic;
  const CFG = window.PACTO || {};
  const WD_LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const WD_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const today = () => L.ymd(new Date());
  const yesterday = () => L.addDays(today(), -1);
  const monthName = ym => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
  const dayLong = d => WD_NAME[L.wday(d)] + ' ' + Number(d.slice(8)) + ' de ' + MONTHS[Number(d.slice(5, 7)) - 1];
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const colorOf = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'c' + (h % 6); };
  const avatar = (m, sm) => '<span class="av ' + colorOf(m.id) + (sm ? ' sm' : '') + '" aria-hidden="true">' + esc(initials(m.name)) + '</span>';
  const emailOf = u => u.trim().toLowerCase() + '@' + (CFG.domain || 'pactodelgym.app');
  const USER_RE = /^[a-z0-9._-]{3,30}$/;

  if (!window.supabase || !CFG.url || /PEGAR/.test(CFG.url)) {
    document.body.innerHTML = '<p style="padding:24px;font-family:system-ui">Falta configurar la conexión con la base (config.js).</p>';
    return;
  }
  const sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pacto-auth' } });

  const S = {
    session: null, myId: null, isAdmin: false,
    status: 'loading',
    cfgRow: null, members: [],
    att: new Map(), exc: new Map(), pay: new Map(),
    month: L.ymOf(today()),
    busy: new Set(),
    checking: null,          // null | 'locating' | 'sending'
    stampNext: false,
    lastCred: null           // credenciales recién creadas, para copiarlas
  };
  // La fila de la base traducida al formato que usa la lógica.
  const cfg = () => {
    const r = S.cfgRow || {};
    return L.normConfig({ title: r.title, fine: r.fine, weekdays: r.weekdays, start: r.start_date, holidays: r.holidays }, today());
  };
  const gym = () => {
    const r = S.cfgRow || {};
    return { name: r.gym_name || '', lat: r.gym_lat, lng: r.gym_lng, radius: r.gym_radius_m || 200, set: typeof r.gym_lat === 'number' && typeof r.gym_lng === 'number' };
  };
  const ctx = () => ({ att: S.att, exc: S.exc });
  const me = () => S.members.find(m => m.id === S.myId) || null;
  const paidOf = (mid, ym) => { const p = S.pay.get(mid + '~' + ym); return p ? p.amount : 0; };

  /* ---------- Avisos ---------- */
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms || 4500);
  }
  // Mensaje legible para un error de Supabase. Los de nuestras funciones ya vienen en castellano.
  function explain(error) {
    if (!error) return '';
    const msg = String(error.message || '');
    if (error.code === 'P0001' && msg) return msg;
    if (/JWT|session/i.test(msg)) return 'Se venció la sesión. Volvé a entrar.';
    if (error.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'No tenés permiso para hacer eso.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión. Revisá internet y probá de nuevo.';
    return msg || 'No se pudo guardar. Probá de nuevo.';
  }
  async function run(promise, okMsg) {
    const { error, data } = await promise;
    if (error) { toast(explain(error)); return null; }
    if (okMsg) toast(okMsg);
    return data === undefined ? true : (data === null ? true : data);
  }

  /* ---------- Carga de datos ---------- */
  // Supabase devuelve como máximo 1.000 filas por pedido: se piden de a páginas.
  async function fetchAll(table, cols) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  const loaders = {
    config: async () => {
      const { data, error } = await sb.from('config').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      S.cfgRow = data;
    },
    profiles: async () => {
      const rows = await fetchAll('profiles', 'id,username,name,is_admin,joined,left_on');
      S.members = rows.map(p => ({ id: p.id, username: p.username, name: p.name, isAdmin: p.is_admin, joined: p.joined, left: p.left_on, userId: p.id }));
      const mine = S.members.find(m => m.id === S.myId);
      S.isAdmin = !!(mine && mine.isAdmin);
    },
    checkins: async () => { S.att = new Map((await fetchAll('checkins', 'member,day,at,by,distance_m')).map(r => [r.member + '~' + r.day, r])); },
    excuses: async () => { S.exc = new Map((await fetchAll('excuses', 'member,day,at,by,reason')).map(r => [r.member + '~' + r.day, r])); },
    payments: async () => { S.pay = new Map((await fetchAll('payments', 'member,month,amount,at,by')).map(r => [r.member + '~' + r.month, r])); }
  };
  async function reload(tables) {
    try {
      await Promise.all(tables.map(t => loaders[t]()));
      S.status = 'ready';
    } catch (e) {
      toast(explain(e));
      if (S.status === 'loading') S.status = 'error';
    }
    render();
    if ($('dayDlg').open) drawDay();
    if ($('setDlg').open) keepInputs(drawSettings);
  }

  // Cambios en vivo: cuando alguien marca, se recarga sólo la tabla que cambió.
  let channel = null, pending = new Set(), pendTimer = null;
  function subscribe() {
    if (channel) return;
    channel = sb.channel('pacto')
      .on('postgres_changes', { event: '*', schema: 'public' }, p => {
        if (!loaders[p.table]) return;
        pending.add(p.table);
        clearTimeout(pendTimer);
        pendTimer = setTimeout(() => { const t = [...pending]; pending.clear(); reload(t); }, 350);
      })
      .subscribe();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.session) reload(Object.keys(loaders));
  });

  /* ---------- Ingreso ---------- */
  function showLogin(msg) {
    $('appView').hidden = true; $('loginView').hidden = false;
    $('loginErr').textContent = msg || '';
  }
  async function enter(session) {
    S.session = session; S.myId = session.user.id;
    $('loginView').hidden = true; $('appView').hidden = false;
    render();
    await reload(Object.keys(loaders));
    if (!me()) { showLogin('Tu usuario no está anotado en el reto. Avisale al organizador.'); return; }
    subscribe();
  }
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const user = $('loginUser').value.trim().toLowerCase();
    const pass = $('loginPass').value;
    if (!user || !pass) return;
    $('loginBtn').disabled = true; $('loginErr').textContent = '';
    const { data, error } = await sb.auth.signInWithPassword({ email: emailOf(user), password: pass });
    $('loginBtn').disabled = false;
    if (error) { $('loginErr').textContent = /invalid/i.test(error.message) ? 'Usuario o contraseña incorrectos.' : explain(error); return; }
    $('loginPass').value = '';
    enter(data.session);
  });

  /* ---------- Marcar asistencia con ubicación ---------- */
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject({ code: 0 });
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  const geoError = e => ({
    1: 'Tenés que permitir la ubicación para esta página. Activala en el navegador y probá de nuevo.',
    2: 'No se pudo obtener tu ubicación. Prendé el GPS o acercate a una ventana.',
    3: 'La ubicación tardó demasiado. Probá de nuevo.'
  }[e && e.code] || 'Este navegador no da la ubicación. Probá con otro.');

  async function checkIn() {
    if (S.checking) return;
    S.checking = 'locating'; render();
    let pos;
    try { pos = await getPosition(); }
    catch (e) { S.checking = null; render(); toast(geoError(e), 6000); return; }
    S.checking = 'sending'; render();
    const { error } = await sb.rpc('check_in', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy: pos.coords.accuracy });
    S.checking = null;
    if (error) { render(); toast(explain(error), 7000); return; }
    S.stampNext = true;
    await reload(['checkins']);
    toast('Marcado. Buen entrenamiento.');
  }

  /* ---------- Cambios del organizador sobre un día ---------- */
  async function setDay(mid, d, mark) {
    const key = mid + '~' + d;
    if (S.busy.has(key)) return;
    S.busy.add(key); render(); if ($('dayDlg').open) drawDay();
    let ok = true;
    if (mark === 'went') {
      ok = !!await run(sb.from('checkins').upsert({ member: mid, day: d, by: S.myId }));
      if (ok && S.exc.has(key)) ok = !!await run(sb.from('excuses').delete().eq('member', mid).eq('day', d));
    } else if (mark === 'excused') {
      if (S.att.has(key)) ok = !!await run(sb.from('checkins').delete().eq('member', mid).eq('day', d));
      if (ok) ok = !!await run(sb.from('excuses').upsert({ member: mid, day: d, by: S.myId }));
    } else {
      if (S.att.has(key)) ok = !!await run(sb.from('checkins').delete().eq('member', mid).eq('day', d));
      if (ok && S.exc.has(key)) ok = !!await run(sb.from('excuses').delete().eq('member', mid).eq('day', d));
    }
    S.busy.delete(key);
    await reload(['checkins', 'excuses']);
    return ok;
  }

  /* ---------- Render ---------- */
  let queued = false;
  function render() {
    if (queued) return; queued = true;
    Promise.resolve().then(() => { queued = false; draw(); });
  }

  function draw() {
    const c = cfg(), t = today(), cx = ctx();
    document.title = c.title;
    $('title').textContent = c.title;
    $('tag').textContent = L.gs(c.fine) + ' por falta';
    const startYm = L.ymOf(c.start), nowYm = L.ymOf(t);
    if (S.month > nowYm) S.month = nowYm;
    if (S.month < startYm) S.month = startYm <= nowYm ? startYm : nowYm;
    $('monthLbl').textContent = monthName(S.month);
    $('prev').disabled = S.month <= startYm;
    $('next').disabled = S.month >= nowYm;
    $('settingsBtn').hidden = !S.isAdmin;

    drawBanner();
    if (S.status === 'loading' || !me()) return;

    const ym = S.month;
    const members = S.members.filter(m => L.inMonth(m, ym, c));
    const rows = members.map(m => ({ m: m, st: L.monthStats(m, ym, c, cx, t), sk: L.streaks(m, c, cx, t) }));
    const ranked = L.rank(rows);

    drawToday(c, t, cx);
    drawKpis(c, t, ym, rows);
    drawRank(ranked, ym);
    drawShame(rows);
    drawInvictos(c, t, cx);
    drawMatrix(c, t, ym, ranked);
    drawFines(c, ym, ranked);
  }

  function drawBanner() {
    const b = $('banner');
    let html = '';
    if (S.status === 'error') html = '<div class="banner"><b>No se pudo leer el reto.</b> Revisá la conexión y recargá la página.</div>';
    else if (S.status === 'ready' && S.isAdmin && !gym().set) html = '<div class="banner"><b>Falta la ubicación del gym.</b> Sin ella nadie puede marcar. Cargala en Ajustes.</div>';
    b.innerHTML = html; b.hidden = !html;
  }

  function drawToday(c, t, cx) {
    const m = me();
    const st = L.dayState(t, m, c, cx, t);
    const sk = L.streaks(m, c, cx, t);
    const ms = L.monthStats(m, L.ymOf(t), c, cx, t);
    const g = gym();
    let html = '<div class="date">Hoy · ' + esc(dayLong(t)) + '</div><div class="who">' + esc(m.name) + '</div>';
    const left = L.isYmd(m.left) && m.left < t;
    if (left) {
      html += '<button class="plate off" disabled><span class="small">Estás</span><span class="big">De baja</span></button>';
    } else if (st === 'done' || st === 'extra') {
      const stamp = S.stampNext; S.stampNext = false;
      const rec = S.att.get(m.id + '~' + t);
      html += '<button class="plate done' + (stamp ? ' stamp' : '') + '" disabled aria-label="Ya marcaste hoy">' +
        '<span class="small">Hoy</span><span class="big">Listo</span><span class="small">✓ ' + (rec && rec.at ? esc(hhmm(rec.at)) : 'marcado') + '</span></button>' +
        (rec && rec.by === S.myId ? '<button class="linkbtn" data-act="undo">Me equivoqué, desmarcar</button>' : '');
    } else if (st === 'excused') {
      html += '<button class="plate off" disabled><span class="small">Hoy</span><span class="big">Libre</span><span class="small">justificado</span></button>';
    } else if (S.checking) {
      html += '<button class="plate" disabled><span class="spin" aria-hidden="true"></span><span class="small">' +
        (S.checking === 'locating' ? 'Buscando tu ubicación' : 'Verificando') + '</span></button>';
    } else {
      const counts = st === 'pending';
      html += '<button class="plate' + (counts ? '' : ' off') + '" data-act="checkin"' + (g.set ? '' : ' disabled') + '>' +
        (counts ? '<span class="small">Tocá al llegar</span><span class="big">Fui<br>hoy</span><span class="small">evitá ' + esc(L.gs(c.fine)) + '</span>'
                : '<span class="small">Hoy no cuenta</span><span class="big">Fui<br>igual</span><span class="small">suma como extra</span>') + '</button>';
      html += '<div class="note">' + (g.set ? 'Se marca sólo estando en el gym' + (g.name ? ' (' + esc(g.name) + ')' : '') + '. Te va a pedir la ubicación.'
                                          : 'Todavía no se cargó la ubicación del gym, así que no se puede marcar.') + '</div>';
    }
    html += '<div class="meta">' +
      '<span>Racha <b class="num">' + sk.cur + '</b></span>' +
      '<span>Faltas del mes <b class="num">' + ms.miss + '</b></span>' +
      '<span>Debés <b class="num">' + esc(L.gs(Math.max(0, ms.fine - paidOf(m.id, L.ymOf(t))))) + '</b></span></div>';
    $('today').innerHTML = html;
  }
  const hhmm = iso => { const d = new Date(iso); return L.pad(d.getHours()) + ':' + L.pad(d.getMinutes()); };

  function drawKpis(c, t, ym, rows) {
    const fine = rows.reduce((a, r) => a + r.st.fine, 0);
    const paid = rows.reduce((a, r) => a + Math.min(paidOf(r.m.id, ym), r.st.fine), 0);
    const done = rows.reduce((a, r) => a + r.st.done, 0);
    const counted = rows.reduce((a, r) => a + r.st.counted, 0);
    const inv = rows.filter(r => r.st.counted > 0 && r.st.miss === 0).length;
    const closed = L.monthDays(ym).filter(d => d >= c.start && d < t && L.isTraining(d, c)).length;
    const totalTrain = L.monthDays(ym).filter(d => d >= c.start && L.isTraining(d, c)).length;
    const pct = fine ? Math.round(paid / fine * 100) : 0;
    const days = c.weekdays.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(n => WD_NAME[n].slice(0, 3)).join(' · ');
    $('kpis').innerHTML =
      '<div class="kpi pozo"><span class="k">Pozo de ' + esc(MONTHS[Number(ym.slice(5, 7)) - 1]) + '</span>' +
        '<span class="v num">' + esc(L.gs(fine)) + '</span>' +
        '<span class="s num">' + esc(L.gs(paid)) + ' cobrado · ' + esc(L.gs(fine - paid)) + ' por cobrar</span>' +
        '<div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="kpi"><span class="k">Invictos</span><span class="v num">' + inv + '<small class="of"> / ' + rows.length + '</small></span><span class="s">sin ninguna falta</span></div>' +
      '<div class="kpi"><span class="k">Asistencia del grupo</span><span class="v num">' + (counted ? Math.round(done / counted * 100) + '%' : '—') + '</span><span class="s num">' + done + ' de ' + counted + ' días que contaron</span></div>' +
      '<div class="kpi"><span class="k">Días de entrenamiento</span><span class="v num">' + closed + '<small class="of"> / ' + totalTrain + '</small></span><span class="s">ya cerrados en el mes</span></div>' +
      '<div class="kpi"><span class="k">Multa por falta</span><span class="v num">' + esc(L.gs(c.fine).replace(' Gs', '')) + '<small class="of"> Gs</small></span><span class="s">' + esc(days) + '</span></div>';
  }

  function drawRank(ranked, ym) {
    const el = $('rank');
    if (!ranked.length) { el.innerHTML = '<li class="empty" style="display:block">Este mes todavía no hay nadie anotado.</li>'; return; }
    const m0 = me();
    el.innerHTML = ranked.map(r => {
      const owed = Math.max(0, r.st.fine - paidOf(r.m.id, ym));
      let pill = '';
      if (r.st.counted > 0 && r.st.miss === 0) pill = '<span class="pill ok">Invicto</span>';
      else if (r.st.fine > 0 && owed === 0) pill = '<span class="pill paid">Multa pagada</span>';
      else if (r.st.miss > 0) pill = '<span class="pill bad">' + r.st.miss + (r.st.miss === 1 ? ' falta' : ' faltas') + '</span>';
      const strip = r.st.days.map(x => '<i class="s-' + x.s + '"></i>').join('');
      return '<li class="' + (r.pos === 1 && r.st.counted > 0 ? 'lead' : '') + '">' +
        '<span class="pos num">' + r.pos + '</span>' + avatar(r.m) +
        '<div style="min-width:0"><div class="name">' + esc(r.m.name) + (m0 && m0.id === r.m.id ? '<span class="me">vos</span>' : '') + '</div>' +
          '<div class="sub num"><span>Fue <b>' + r.st.gone + '</b></span><span>Racha <b>' + r.sk.cur + '</b></span><span>Mejor <b>' + r.sk.best + '</b></span>' +
          (r.st.rate != null ? '<span><b>' + Math.round(r.st.rate * 100) + '%</b></span>' : '') + '</div>' +
          '<div class="strip" aria-hidden="true">' + strip + '</div></div>' +
        '<div class="right">' + pill + '<span class="fine num' + (r.st.fine ? '' : ' zero') + '">' + esc(L.gs(r.st.fine)) + '</span></div></li>';
    }).join('');
  }

  function drawShame(rows) {
    const el = $('shame');
    const list = rows.filter(r => r.st.miss > 0).sort((a, b) => b.st.miss - a.st.miss || String(a.m.name).localeCompare(String(b.m.name), 'es'));
    if (!rows.length) { el.innerHTML = '<div class="empty">Cuando haya gente en el reto, acá aparecen los que más faltan.</div>'; return; }
    if (!list.length) { el.innerHTML = '<div class="empty">Nadie faltó este mes. Así se hace.</div>'; return; }
    const max = list[0].st.miss;
    el.innerHTML = list.map(r =>
      '<div class="barrow"><span class="n">' + esc(r.m.name) + '</span>' +
      '<div class="track"><div class="fill" style="width:' + (r.st.miss / max * 100).toFixed(1) + '%"></div></div>' +
      '<span class="val num">' + r.st.miss + ' · ' + esc(L.gs(r.st.fine)) + '</span></div>').join('');
  }

  function drawInvictos(c, t, cx) {
    const el = $('invictos');
    const ym = S.month;
    const rows = S.members.filter(m => L.inMonth(m, ym, c)).map(m => ({ m: m, st: L.monthStats(m, ym, c, cx, t) }));
    const inv = rows.filter(r => r.st.counted > 0 && r.st.miss === 0);
    let html = inv.length
      ? '<div class="inv">' + inv.map(r => '<span class="chip">' + avatar(r.m, true) + esc(r.m.name) + '</span>').join('') + '</div>'
      : '<div class="empty">' + (rows.length ? 'Este mes nadie se salvó de una multa todavía.' : 'Sin participantes todavía.') + '</div>';
    // Competencia de rachas: la de hoy, sin importar el mes que se mire.
    const active = S.members.filter(m => !(L.isYmd(m.left) && m.left < t)).map(m => ({ m: m, sk: L.streaks(m, c, cx, t) }))
      .sort((a, b) => b.sk.cur - a.sk.cur || b.sk.best - a.sk.best || String(a.m.name).localeCompare(String(b.m.name), 'es'));
    if (active.length && active[0].sk.cur > 0) {
      const top = active[0];
      html += '<div class="streak-best"><span class="k">Racha más larga ahora</span>' +
        '<span class="v">' + esc(top.m.name) + ' · <span class="num">' + top.sk.cur + '</span> ' + (top.sk.cur === 1 ? 'día' : 'días') + ' seguidos</span>' +
        '<ul class="streak-list">' + active.slice(1, 6).map(a => '<li><span>' + esc(a.m.name) + '</span><span class="num">' + a.sk.cur + ' (mejor ' + a.sk.best + ')</span></li>').join('') + '</ul></div>';
    }
    el.innerHTML = html;
  }

  function drawMatrix(c, t, ym, ranked) {
    const days = L.monthDays(ym);
    const el = $('matrix');
    document.querySelector('.legend').hidden = !ranked.length;
    if (!ranked.length) { el.innerHTML = '<tbody><tr><td class="empty">El calendario se llena a medida que la gente marca.</td></tr></tbody>'; return; }
    let html = '<thead><tr><th class="nm"></th>' + days.map(d => {
      const off = !L.isTraining(d, c) || d < c.start;
      return '<th class="' + (off ? 'off' : '') + (d === t ? ' is-today' : '') + '"' + (d === t ? ' id="todayCol"' : '') + '><span class="wd">' + WD_LETTER[L.wday(d)] + '</span>' + Number(d.slice(8)) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    const glyph = { done: '✓', miss: '×', excused: 'J', extra: '+' };
    const label = { done: 'fue', miss: 'faltó', excused: 'justificado', extra: 'fue en día libre', pending: 'falta marcar', off: 'no cuenta', future: 'todavía no' };
    for (const r of ranked) {
      html += '<tr><th class="nm" scope="row">' + esc(r.m.name) + '</th>' + r.st.days.map(x =>
        '<td><button class="cell s-' + x.s + '" data-act="cell" data-m="' + esc(r.m.id) + '" data-d="' + x.d + '"' +
        (x.s === 'future' ? ' disabled' : '') + ' aria-label="' + esc(r.m.name + ', ' + dayLong(x.d) + ': ' + label[x.s]) + '">' + (glyph[x.s] || '') + '</button></td>'
      ).join('') + '</tr>';
    }
    const wrap = el.parentElement, keep = wrap.scrollLeft, first = !el.dataset.ym || el.dataset.ym !== ym;
    el.innerHTML = html + '</tbody>';
    el.dataset.ym = ym;
    // En el celular entran pocos días: al abrir el mes, se corre hasta hoy.
    const col = $('todayCol');
    if (first && col) wrap.scrollLeft = Math.max(0, col.offsetLeft - wrap.clientWidth + 80);
    else wrap.scrollLeft = keep;
  }

  function drawFines(c, ym, ranked) {
    const el = $('fines');
    $('finesHint').textContent = L.gs(c.fine) + ' por cada falta';
    if (!ranked.length) { el.innerHTML = '<div class="empty">Sin multas: todavía no hay participantes.</div>'; return; }
    const rows = ranked.slice().sort((a, b) => b.st.fine - a.st.fine || String(a.m.name).localeCompare(String(b.m.name), 'es'));
    let tf = 0, tp = 0;
    const body = rows.map(r => {
      const paid = Math.min(paidOf(r.m.id, ym), r.st.fine), owed = r.st.fine - paid;
      tf += r.st.fine; tp += paid;
      let state = '<span class="pill paid">Sin multa</span>';
      if (r.st.fine > 0) state = owed === 0 ? '<span class="pill ok">Pagó</span>' : '<span class="pill warn">Debe ' + esc(L.gs(owed)) + '</span>';
      const btn = S.isAdmin && r.st.fine > 0
        ? (owed > 0 ? '<button class="btn small" data-act="pay" data-m="' + esc(r.m.id) + '">Cobrado</button>'
                    : '<button class="btn small" data-act="unpay" data-m="' + esc(r.m.id) + '">Deshacer</button>')
        : '';
      return '<tr><td><span class="who-cell">' + avatar(r.m, true) + '<span>' + esc(r.m.name) + '<small class="num">' + r.st.miss + (r.st.miss === 1 ? ' falta' : ' faltas') + '</small></span></span></td>' +
        '<td class="r num amt">' + esc(L.gs(r.st.fine)) + '</td><td><span class="state-cell">' + state + btn + '</span></td></tr>';
    }).join('');
    el.innerHTML = '<table class="fines"><thead><tr><th>Persona</th><th class="r">Multa</th><th>Estado</th></tr></thead><tbody>' + body +
      '</tbody><tfoot><tr><td>Total</td><td class="r num amt">' + esc(L.gs(tf)) + '</td><td class="num">' + esc(L.gs(tp)) + ' cobrado</td></tr></tfoot></table>';
  }

  /* ---------- Diálogos ---------- */
  function openDlg(d) { if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  function closeDlg(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }

  let dayCtx = null;
  function openDay(mid, d) {
    if (!S.members.find(x => x.id === mid)) return;
    dayCtx = { mid: mid, d: d };
    drawDay(); openDlg($('dayDlg'));
  }
  function drawDay() {
    if (!dayCtx) return;
    const m = S.members.find(x => x.id === dayCtx.mid); if (!m) return;
    const c = cfg(), t = today(), d = dayCtx.d, key = m.id + '~' + d;
    const st = L.dayState(d, m, c, ctx(), t);
    const rec = S.att.get(key) || S.exc.get(key);
    const txt = {
      done: 'Fue al gym.', extra: 'Fue en un día que no cuenta. Suma como extra.', miss: 'Faltó. Multa de ' + L.gs(c.fine) + '.',
      excused: 'Falta justificada, sin multa.', pending: 'Todavía no marcó. Tiene hasta las 23:59.', off: 'Este día no cuenta para el reto.', future: 'Todavía no llegó.'
    }[st];
    let who = '';
    if (rec && rec.at) {
      const byM = S.members.find(x => x.id === rec.by);
      const at = new Date(rec.at);
      who = '<div class="sub">Marcado ' + (byM && byM.id !== m.id ? 'por ' + esc(byM.name) + ' ' : '') + 'el ' + at.getDate() + '/' + (at.getMonth() + 1) + ' a las ' + hhmm(rec.at) +
        (typeof rec.distance_m === 'number' ? ', a ' + Math.round(rec.distance_m) + ' m del gym' : '') + '</div>';
    }
    const busy = S.busy.has(key) ? ' disabled' : '';
    let acts = '';
    if (S.isAdmin && d <= t) {
      const went = S.att.has(key), ex = S.exc.has(key);
      acts = '<div class="acts">' +
        (!went ? '<button class="btn primary" data-act="mark" data-k="went"' + busy + '>Fue</button>' : '') +
        (went || ex ? '<button class="btn danger" data-act="mark" data-k="miss"' + busy + '>Sacar la marca</button>' : '') +
        (!ex && st !== 'off' && st !== 'extra' ? '<button class="btn" data-act="mark" data-k="excused"' + busy + '>Justificar</button>' : '') +
        '</div>';
    } else if (d <= t && !S.isAdmin) {
      acts = '<div class="sub">Cada uno marca su día desde el gym. Para corregir otro día, pedíselo al organizador.</div>';
    }
    $('dayBody').innerHTML = '<h3 tabindex="-1" autofocus>' + esc(m.name) + '</h3><div class="sub">' + esc(dayLong(d)) + '</div>' +
      '<div>' + esc(txt) + '</div>' + who + acts +
      '<div class="foot"><button class="btn" data-act="close-day">Cerrar</button></div>';
  }

  // Ajustes y participantes (sólo admin).
  function openSettings() { S.lastCred = null; drawSettings(); openDlg($('setDlg')); }
  function drawSettings() {
    const c = cfg(), g = gym(), t = today();
    const order = [1, 2, 3, 4, 5, 6, 0];
    const members = S.members.slice().sort((a, b) => ((L.isYmd(a.left) ? 1 : 0) - (L.isYmd(b.left) ? 1 : 0)) || String(a.name).localeCompare(String(b.name), 'es'));
    const cred = S.lastCred
      ? '<div class="cred" id="credBox"><b>Pasale esto a ' + esc(S.lastCred.name) + ':</b><span>Link: ' + esc(location.origin + location.pathname) + '</span><span>Usuario: ' + esc(S.lastCred.user) + '</span><span>Contraseña: ' + esc(S.lastCred.pass) + '</span></div>' +
        '<div class="acts"><button class="btn small" data-act="copy-cred">Copiar</button></div>'
      : '';
    $('setBody').innerHTML =
      '<h3 tabindex="-1" autofocus>Ajustes del reto</h3>' +
      '<label class="field"><span>Nombre del reto</span><input type="text" id="cfgTitle" maxlength="60" value="' + esc(c.title) + '"></label>' +
      '<label class="field"><span>Multa por falta (Gs)</span><input type="number" id="cfgFine" min="0" step="500" inputmode="numeric" value="' + c.fine + '"></label>' +
      '<div class="field"><span>Días que hay que ir</span><div class="wdays">' + order.map(n =>
        '<label title="' + WD_NAME[n] + '"><input type="checkbox" id="wd' + n + '" value="' + n + '"' + (c.weekdays.includes(n) ? ' checked' : '') + '>' + WD_LETTER[n] + '</label>').join('') + '</div></div>' +
      '<label class="field"><span>El reto empieza el</span><input type="date" id="cfgStart" value="' + c.start + '"></label>' +
      '<div class="field"><span>Ubicación del gym</span>' +
        '<input type="text" id="gymName" maxlength="60" placeholder="Nombre (opcional)" value="' + esc(g.name) + '">' +
        '<div class="gps-row"><input type="text" id="gymLat" inputmode="decimal" placeholder="Latitud" aria-label="Latitud" value="' + (g.set ? g.lat : '') + '">' +
        '<input type="text" id="gymLng" inputmode="decimal" placeholder="Longitud" aria-label="Longitud" value="' + (g.set ? g.lng : '') + '">' +
        '<label class="rad"><input type="number" id="gymRadius" min="30" max="2000" step="10" aria-label="Radio en metros" value="' + g.radius + '" style="width:100%"></label></div>' +
        '<input type="text" id="gymPaste" placeholder="O pegá acá un link de Google Maps o «lat, long»">' +
        '<small>El último número es el radio en metros. En el gym podés tocar «Usar mi ubicación».</small>' +
        '<div class="acts"><button class="btn small" type="button" data-act="gym-here">Usar mi ubicación</button></div></div>' +
      '<div class="foot"><button class="btn primary" data-act="save-cfg">Guardar ajustes</button></div>' +
      '<div class="field"><span>Feriados y días que no cuentan</span><div class="hols">' +
        (c.holidays.length ? c.holidays.slice().sort().map(h => '<span class="pill">' + Number(h.slice(8)) + '/' + Number(h.slice(5, 7)) + '/' + h.slice(0, 4) +
          '<button type="button" data-act="rm-hol" data-d="' + h + '" aria-label="Quitar ' + h + '">×</button></span>').join('') : '<span class="empty">Ninguno</span>') +
        '</div><div class="joinrow"><input type="date" id="holNew" aria-label="Fecha del feriado"><button class="btn" type="button" data-act="add-hol">Agregar</button></div>' +
        '<small>Los feriados se guardan al agregarlos.</small></div>' +
      '<hr class="sep">' +
      '<div class="field"><span>Crear usuario para alguien del grupo</span>' +
        '<form class="mlist" id="addForm">' +
          '<input type="text" id="addName" maxlength="40" placeholder="Nombre que se ve en la tabla" required>' +
          '<input type="text" id="addUser" maxlength="30" placeholder="Usuario (ej. lucas)" autocapitalize="none" spellcheck="false" required>' +
          '<div class="joinrow"><input type="text" id="addPass" maxlength="40" value="' + esc(suggestPass()) + '" aria-label="Contraseña" required><button class="btn primary" type="submit">Crear</button></div>' +
        '</form>' + cred + '</div>' +
      '<hr class="sep">' +
      '<div class="field"><span>Participantes</span><div class="mlist">' + members.map(m =>
        '<div class="mrow' + (L.isYmd(m.left) ? ' inactive' : '') + '">' +
          '<input type="text" id="mn-' + esc(m.id) + '" maxlength="40" value="' + esc(m.name) + '" aria-label="Nombre de ' + esc(m.username) + '">' +
          '<label class="field"><small>Cuenta desde</small><input type="date" id="mj-' + esc(m.id) + '" value="' + esc(L.isYmd(m.joined) ? m.joined : c.start) + '"></label>' +
          '<span class="acts"><button class="btn small" data-act="save-m" data-m="' + esc(m.id) + '">Guardar</button>' +
            '<button class="btn small" data-act="pass-m" data-m="' + esc(m.id) + '">Contraseña</button>' +
            (m.id === S.myId ? '' : L.isYmd(m.left)
              ? '<button class="btn small" data-act="back-m" data-m="' + esc(m.id) + '">Reincorporar</button>'
              : '<button class="btn small danger" data-act="leave-m" data-m="' + esc(m.id) + '">Dar de baja</button>') + '</span>' +
          '<small style="grid-column:1/-1;color:var(--muted)">usuario: ' + esc(m.username) + (m.isAdmin ? ' · organizador' : '') + (L.isYmd(m.left) ? ' · de baja desde el ' + esc(m.left) : '') + '</small>' +
        '</div>').join('') + '</div></div>' +
      '<div class="foot"><button class="btn" data-act="close-set">Cerrar</button></div>';
  }
  // Contraseña fácil de dictar: palabra + 4 números.
  function suggestPass() {
    const w = ['pesas', 'banca', 'remo', 'sentadilla', 'barra', 'disco', 'cardio', 'prensa', 'dominada', 'plancha'];
    const r = crypto.getRandomValues(new Uint32Array(2));
    return w[r[0] % w.length] + String(1000 + (r[1] % 9000));
  }

  // Redibuja Ajustes sin perder lo que se estaba escribiendo.
  function keepInputs(fn) {
    const vals = {};
    $('setBody').querySelectorAll('input[id]').forEach(i => { vals[i.id] = i.type === 'checkbox' ? i.checked : i.value; });
    fn();
    for (const id in vals) {
      const i = $(id); if (!i || id === 'holNew') continue;
      if (i.type === 'checkbox') i.checked = vals[id]; else i.value = vals[id];
    }
  }

  // Lee coordenadas de un link de Google Maps o de un texto «lat, long».
  function parseCoords(s) {
    s = String(s || '');
    const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i, /^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/];
    for (const p of pats) { const m = s.match(p); if (m) { const lat = Number(m[1]), lng = Number(m[2]); if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; } }
    return null;
  }

  function openAccount() {
    const m = me();
    $('acctBody').innerHTML = '<h3 tabindex="-1" autofocus>Mi cuenta</h3><div class="sub">' + esc(m ? m.name + ' · usuario ' + m.username : '') + '</div>' +
      '<form class="field" id="passForm"><span>Cambiar mi contraseña</span><div class="joinrow">' +
      '<input type="password" id="newPass" minlength="6" autocomplete="new-password" placeholder="Nueva contraseña" required><button class="btn" type="submit">Cambiar</button></div></form>' +
      '<div class="foot"><button class="btn danger" data-act="logout">Salir</button><button class="btn" data-act="close-acct">Cerrar</button></div>';
    openDlg($('acctDlg'));
  }

  /* ---------- Clicks ---------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const c = cfg(), t = today();
    if (act === 'prev') { S.month = L.addMonths(S.month, -1); render(); }
    else if (act === 'next') { S.month = L.addMonths(S.month, 1); render(); }
    else if (act === 'checkin') checkIn();
    else if (act === 'undo') { b.disabled = true; if (await run(sb.rpc('undo_check_in'), 'Marca de hoy borrada.')) await reload(['checkins']); }
    else if (act === 'cell') openDay(b.dataset.m, b.dataset.d);
    else if (act === 'mark') { if (dayCtx) await setDay(dayCtx.mid, dayCtx.d, b.dataset.k); }
    else if (act === 'close-day') closeDlg($('dayDlg'));
    else if (act === 'settings') openSettings();
    else if (act === 'close-set') closeDlg($('setDlg'));
    else if (act === 'account') openAccount();
    else if (act === 'close-acct') closeDlg($('acctDlg'));
    else if (act === 'logout') { await sb.auth.signOut(); location.reload(); }
    else if (act === 'gym-here') {
      b.disabled = true; b.textContent = 'Buscando…';
      try {
        const pos = await getPosition();
        $('gymLat').value = pos.coords.latitude.toFixed(6); $('gymLng').value = pos.coords.longitude.toFixed(6);
        toast('Ubicación tomada (precisión ' + Math.round(pos.coords.accuracy) + ' m). Tocá «Guardar ajustes».');
      } catch (err) { toast(geoError(err), 6000); }
      b.disabled = false; b.textContent = 'Usar mi ubicación';
    }
    else if (act === 'save-cfg') {
      const fineTxt = $('cfgFine').value.trim(), fine = Number(fineTxt);
      const start = $('cfgStart').value;
      const weekdays = [0, 1, 2, 3, 4, 5, 6].filter(n => $('wd' + n).checked);
      const pasted = $('gymPaste').value.trim();
      if (pasted) {
        const p = parseCoords(pasted);
        if (!p) return toast('No encontré coordenadas en ese link. En Google Maps, mantené apretado el gym y copiá los números que aparecen.', 7000);
        $('gymLat').value = p.lat; $('gymLng').value = p.lng; $('gymPaste').value = '';
      }
      const latTxt = $('gymLat').value.trim().replace(',', '.'), lngTxt = $('gymLng').value.trim().replace(',', '.');
      const lat = latTxt === '' ? null : Number(latTxt), lng = lngTxt === '' ? null : Number(lngTxt);
      const radius = Math.round(Number($('gymRadius').value));
      if (fineTxt === '' || !isFinite(fine) || fine < 0) return toast('Poné el monto de la multa (0 o más).');
      if (!L.isYmd(start)) return toast('Elegí la fecha de inicio del reto.');
      if (!weekdays.length) return toast('Marcá al menos un día de entrenamiento.');
      if ((lat === null) !== (lng === null) || (lat !== null && (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))) return toast('Revisá la latitud y la longitud del gym.');
      if (!(radius >= 30 && radius <= 2000)) return toast('El radio tiene que estar entre 30 y 2.000 metros.');
      b.disabled = true;
      const ok = await run(sb.from('config').update({
        title: $('cfgTitle').value.trim().slice(0, 60) || 'Pacto del Gym', fine: Math.round(fine), weekdays: weekdays, start_date: start,
        gym_name: $('gymName').value.trim().slice(0, 60) || null, gym_lat: lat, gym_lng: lng, gym_radius_m: radius, updated_at: new Date().toISOString()
      }).eq('id', 1), 'Ajustes guardados.');
      b.disabled = false;
      if (ok) await reload(['config']);
    }
    else if (act === 'add-hol' || act === 'rm-hol') {
      let hol = c.holidays.slice();
      if (act === 'add-hol') {
        const v = $('holNew').value;
        if (!L.isYmd(v)) return toast('Elegí la fecha del feriado.');
        if (hol.includes(v)) return toast('Ese día ya está cargado.');
        hol.push(v);
      } else hol = hol.filter(h => h !== b.dataset.d);
      b.disabled = true;
      if (await run(sb.from('config').update({ holidays: hol.sort(), updated_at: new Date().toISOString() }).eq('id', 1), act === 'add-hol' ? 'Feriado agregado.' : 'Feriado quitado.')) await reload(['config']);
    }
    else if (act === 'save-m') {
      const id = b.dataset.m, name = $('mn-' + id).value.trim().slice(0, 40), joined = $('mj-' + id).value;
      if (!name) return toast('El nombre no puede quedar vacío.');
      if (!L.isYmd(joined)) return toast('Elegí desde qué fecha le cuenta.');
      b.disabled = true;
      if (await run(sb.from('profiles').update({ name: name, joined: joined }).eq('id', id), 'Guardado.')) await reload(['profiles']);
      b.disabled = false;
    }
    else if (act === 'leave-m') {
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Seguro?'; return; }
      b.disabled = true;
      // El último día que cuenta es ayer; su historia queda en el tablero.
      if (await run(sb.from('profiles').update({ left_on: yesterday() }).eq('id', b.dataset.m), 'Dado de baja. Sus días anteriores quedan en el historial.')) await reload(['profiles']);
    }
    else if (act === 'back-m') {
      b.disabled = true;
      // Sólo se quita la baja; no se toca desde cuándo cuenta, para no perder su historia.
      if (await run(sb.from('profiles').update({ left_on: null }).eq('id', b.dataset.m), 'Reincorporado.')) await reload(['profiles']);
    }
    else if (act === 'pass-m') {
      const id = b.dataset.m, m = S.members.find(x => x.id === id);
      const pass = suggestPass();
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Nueva?'; return; }
      b.disabled = true;
      if (await run(sb.rpc('admin_set_password', { p_member: id, p_password: pass }))) {
        S.lastCred = { name: m.name, user: m.username, pass: pass };
        keepInputs(drawSettings);
        toast('Contraseña nueva para ' + m.name + '. Pasásela.');
      }
    }
    else if (act === 'copy-cred') {
      const txt = $('credBox').innerText.replace(/^Pasale esto a [^:]+:\s*/, '');
      try { await navigator.clipboard.writeText(txt); toast('Copiado.'); }
      catch (err) { const r = document.createRange(); r.selectNodeContents($('credBox')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Seleccionado: copialo con el menú.'); }
    }
    else if (act === 'pay' || act === 'unpay') {
      const mid = b.dataset.m, ym = S.month;
      const m = S.members.find(x => x.id === mid); if (!m) return;
      const st = L.monthStats(m, ym, c, ctx(), t);
      b.disabled = true;
      const q = act === 'pay'
        ? sb.from('payments').upsert({ member: mid, month: ym, amount: st.fine, by: S.myId, at: new Date().toISOString() })
        : sb.from('payments').delete().eq('member', mid).eq('month', ym);
      if (await run(q)) await reload(['payments']); else b.disabled = false;
    }
  });

  /* ---------- Formularios ---------- */
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.id === 'loginForm') return;
    e.preventDefault();
    if (f.id === 'addForm') {
      const name = $('addName').value.trim().slice(0, 40);
      const user = $('addUser').value.trim().toLowerCase();
      const pass = $('addPass').value;
      if (!name) return toast('Poné el nombre.');
      if (!USER_RE.test(user)) return toast('El usuario va en minúsculas, sin espacios, de 3 a 30 letras o números (se permiten . _ -).');
      if (S.members.some(m => m.username === user)) return toast('Ya existe el usuario ' + user + '.');
      if (pass.length < 6) return toast('La contraseña tiene que tener al menos 6 caracteres.');
      const btn = f.querySelector('button[type="submit"]'); btn.disabled = true;
      // 1) Se habilita el usuario. 2) Se crea con un cliente aparte para no cerrar la sesión del admin.
      const inv = await run(sb.from('invites').upsert({ username: user, name: name }));
      if (!inv) { btn.disabled = false; return; }
      const tmp = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'pacto-alta' } });
      const { error } = await tmp.auth.signUp({ email: emailOf(user), password: pass });
      btn.disabled = false;
      if (error) {
        await sb.from('invites').delete().eq('username', user);
        return toast(/registered|exists/i.test(error.message) ? 'Ese usuario ya existe.' : 'No se pudo crear: ' + explain(error), 7000);
      }
      S.lastCred = { name: name, user: user, pass: pass };
      await reload(['profiles']);
      ['addName', 'addUser'].forEach(id => { if ($(id)) $(id).value = ''; });
      if ($('addPass')) $('addPass').value = suggestPass();
      toast(name + ' ya tiene usuario.');
    } else if (f.id === 'passForm') {
      const pass = $('newPass').value;
      if (pass.length < 6) return toast('Al menos 6 caracteres.');
      if (await run(sb.auth.updateUser({ password: pass }), 'Contraseña cambiada.')) { $('newPass').value = ''; closeDlg($('acctDlg')); }
    }
  });

  $('dayDlg').addEventListener('close', () => { dayCtx = null; });

  // A medianoche cambia "hoy": se redibuja para que la falta de ayer aparezca sola.
  let lastDay = today();
  setInterval(() => { const t = today(); if (t !== lastDay) { lastDay = t; S.month = L.ymOf(t); render(); } }, 60000);

  /* ---------- Arranque ---------- */
  (async () => {
    const { data } = await sb.auth.getSession();
    if (data && data.session) enter(data.session); else showLogin();
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_OUT') { S.session = null; showLogin(); }
      else if (ev === 'TOKEN_REFRESHED' && session) S.session = session;
    });
  })();
})();
