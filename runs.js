// My runs: signs the runner in with their Apple ID (CloudKit JS) and reads the "Run" records
// the Adagio app saved to their PRIVATE iCloud database. Nothing goes through our servers.
//
// Security: every value from a record is written with textContent or as an SVG number,
// never as HTML, so a song title like "<script>" is shown as text and can't run.
'use strict';

(() => {
  const CONFIG = {
    containerIdentifier: 'iCloud.com.darrenkapturski.Adagio',
    // CloudKit JS web token: meant to sit in a public page; Apple only accepts it from the
    // allowed origin (https://www.adagiorunning.com) and it can only reach the signed-in
    // runner's own data.
    apiToken: 'd9210ba16598dc37e2347672693e16a0a2bef89cb6e155b7c459e4125615f7f0',
    // When Adagio 1.2 ships and the schema is deployed: set 'production' and use the
    // Production token.
    environment: 'development',
  };
  const MAX_RUNS = 2000;       // stop paging after this many records
  const MAX_SONGS = 300;       // per run
  const MAX_SAMPLES = 10000;   // cadence readings per run (~14 h at one per 5 s)
  const SAMPLE_SEC = 5;        // the app stores one cadence reading per ~5 s
  const SOURCES = ['iPhone', 'Watch', 'Garmin'];

  const $ = (id) => document.getElementById(id);
  const ui = {
    status: $('status'), signedOut: $('signed-out'), list: $('list-view'), detail: $('detail-view'),
    week: $('week'), months: $('months'), monthsHead: $('months-head'), runs: $('runs'), empty: $('empty'), facts: $('facts'), detailTitle: $('detail-title'),
    chart: $('chart'), chartWrap: $('chart-wrap'), legend: $('legend'), songs: $('songs'), songList: $('song-list'),
    back: $('back'),
  };
  $('year').textContent = String(new Date().getFullYear());

  let runs = [];
  let units = 'mi';
  let period = 'week';
  try { const p = localStorage.getItem('adagio-period'); if (p === 'month' || p === 'all') period = p; } catch (e) { /* keep week */ }
  try { if (localStorage.getItem('adagio-units') === 'km') units = 'km'; } catch (e) { /* storage blocked: keep mi */ }

  // ---------- small DOM helpers (text only) ----------
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = String(text);
    return n;
  }
  const SVG = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    return n;
  }

  // ---------- page states ----------
  function show(state, message) {
    ui.status.hidden = !(state === 'loading' || state === 'error');
    ui.status.classList.toggle('is-error', state === 'error');
    if (message) ui.status.textContent = message;
    ui.signedOut.hidden = state !== 'signedOut';
    ui.list.hidden = state !== 'list';
    ui.detail.hidden = state !== 'detail';
  }

  // ---------- reading records safely ----------
  function num(fields, key) {
    const f = fields[key];
    const x = f ? Number(f.value) : NaN;
    return Number.isFinite(x) ? x : null;
  }
  function parseRun(record) {
    const f = (record && record.fields) || {};
    const date = num(f, 'date');
    if (date == null || Number.isNaN(new Date(date).getTime())) return null;
    const distance = num(f, 'distance');
    const cadence = Array.isArray(f.cadence && f.cadence.value)
      ? f.cadence.value.slice(0, MAX_SAMPLES).map(Number).filter((x) => Number.isFinite(x) && x > 0 && x < 400)
      : [];
    const songs = Array.isArray(f.songs && f.songs.value)
      ? f.songs.value.slice(0, MAX_SONGS).map((s) => String(s).slice(0, 200)).filter(Boolean)
      : [];
    const source = f.source && SOURCES.includes(f.source.value) ? f.source.value : null;
    const avg = num(f, 'avgCadence');
    const target = num(f, 'targetBPM');
    const duration = num(f, 'duration');
    return {
      id: String(record.recordName || ''),
      date: new Date(date),
      duration: duration != null && duration > 0 ? duration : null,
      distance: distance != null && distance > 0 ? distance : null, // 0 means "no distance"
      avgCadence: avg != null && avg > 0 ? Math.round(avg) : null,
      targetBPM: target != null && target > 0 ? Math.round(target) : null,
      cadence,
      songs,
      pulse: num(f, 'haptic') === 1,
      source,
    };
  }

  // ---------- formatting ----------
  function fmtDuration(sec) {
    if (sec == null) return null;
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  }
  const perUnit = () => (units === 'km' ? 1000 : 1609.344);
  function fmtDistance(m) { return m == null ? null : `${(m / perUnit()).toFixed(2)} ${units}`; }
  function fmtPace(sec, m) {
    if (sec == null || m == null) return null;
    const p = sec / (m / perUnit());
    if (!Number.isFinite(p) || p <= 0 || p > 3600) return null;
    return `${fmtDuration(p)} /${units}`;
  }
  const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  function fmtVsTarget(run) {
    if (run.avgCadence == null || run.targetBPM == null) return null;
    const d = run.avgCadence - run.targetBPM;
    if (d === 0) return 'right on target';
    return `${Math.abs(d)} spm ${d > 0 ? 'over' : 'under'} target`;
  }

  // ---------- sparkline and chart ----------
  function scale(values, extra) {
    const all = values.concat(extra.filter((x) => x != null));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
    return { lo, hi };
  }
  function sparkline(run) {
    const w = 120, h = 36;
    const s = svg('svg', { class: 'spark', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    const vals = run.cadence;
    if (vals.length < 2) return s;
    const { lo, hi } = scale(vals, [run.targetBPM]);
    const y = (v) => (h - 3) - ((v - lo) / (hi - lo)) * (h - 6);
    if (run.targetBPM != null) {
      s.append(svg('line', { x1: 0, x2: w, y1: y(run.targetBPM).toFixed(1), y2: y(run.targetBPM).toFixed(1),
        stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }));
    }
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    s.append(svg('polyline', { points: pts, fill: 'none', stroke: '#A6E22E', 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
    return s;
  }
  function chart(run) {
    const W = 640, H = 240, L = 40, R = 12, T = 12, B = 28;
    const vals = run.cadence;
    const s = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img' });
    const { lo, hi } = scale(vals, [run.targetBPM]);
    const x = (i) => L + (i / Math.max(vals.length - 1, 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    // horizontal guides with labels
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3, yy = y(v);
      s.append(svg('line', { x1: L, x2: W - R, y1: yy.toFixed(1), y2: yy.toFixed(1), stroke: 'rgba(255,255,255,.08)' }));
      const t = svg('text', { x: L - 8, y: (yy + 4).toFixed(1), 'text-anchor': 'end' });
      t.textContent = String(Math.round(v));
      s.append(t);
    }
    // time labels (minutes)
    const totalMin = ((vals.length - 1) * SAMPLE_SEC) / 60;
    const step = totalMin > 60 ? 15 : totalMin > 20 ? 5 : totalMin > 6 ? 2 : 1;
    for (let m = 0; m <= totalMin; m += step) {
      const t = svg('text', { x: x((m * 60) / SAMPLE_SEC).toFixed(1), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = `${m}m`;
      s.append(t);
    }
    if (run.targetBPM != null) {
      s.append(svg('line', { x1: L, x2: W - R, y1: y(run.targetBPM).toFixed(1), y2: y(run.targetBPM).toFixed(1),
        stroke: 'rgba(255,255,255,.7)', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
    }
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    s.append(svg('polyline', { points: pts, fill: 'none', stroke: '#A6E22E', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const label = `Cadence over the run, between ${Math.round(Math.min(...vals))} and ${Math.round(Math.max(...vals))} steps per minute`
      + (run.targetBPM != null ? `, target ${run.targetBPM}` : '');
    s.setAttribute('aria-label', label);
    return s;
  }

  // ---------- list view ----------
  function stat(label, value) {
    const box = el('div', 'stat');
    box.append(el('dt', null, label), el('dd', null, value));
    return box;
  }
  function renderWeek() {
    const now = new Date();
    const starts = {
      week: new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)), // Monday
      month: new Date(now.getFullYear(), now.getMonth(), 1),
      all: new Date(0),
    };
    const inPeriod = runs.filter((r) => r.date >= starts[period]);
    const time = inPeriod.reduce((a, r) => a + (r.duration || 0), 0);
    const dist = inPeriod.reduce((a, r) => a + (r.distance || 0), 0);
    ui.week.replaceChildren(
      stat('Runs', String(inPeriod.length)),
      stat('Time', fmtDuration(time) || '0:00'),
      stat('Distance', fmtDistance(dist) || `0.00 ${units}`),
    );
    document.querySelectorAll('[data-period]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.period === period)));
  }
  // One row per month that has runs, newest first. The bar shows time run, relative to the
  // busiest month (time is on every run; distance isn't).
  function renderMonths() {
    const byMonth = new Map();
    for (const r of runs) {
      const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      const m = byMonth.get(key) || { date: new Date(r.date.getFullYear(), r.date.getMonth(), 1), count: 0, time: 0, dist: 0 };
      m.count += 1; m.time += r.duration || 0; m.dist += r.distance || 0;
      byMonth.set(key, m);
    }
    const months = [...byMonth.values()].sort((a, b) => b.date - a.date);
    const maxTime = Math.max(1, ...months.map((m) => m.time));
    ui.months.replaceChildren(...months.map((m) => {
      const li = el('li', 'month');
      li.append(el('span', 'month-name', m.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })));
      const bar = el('span', 'month-bar');
      const fill = el('span');
      fill.style.width = `${Math.max(2, (m.time / maxTime) * 100).toFixed(1)}%`;
      bar.append(fill);
      li.append(bar);
      const parts = [`${m.count} ${m.count === 1 ? 'run' : 'runs'}`, fmtDuration(m.time) || '0:00'];
      if (m.dist > 0) parts.push(fmtDistance(m.dist));
      li.append(el('span', 'month-stats', parts.join(' · ')));
      return li;
    }));
    ui.months.hidden = ui.monthsHead.hidden = months.length === 0;
  }

  function runCard(run, index) {
    const li = el('li');
    const b = el('button', 'run');
    b.type = 'button';
    const text = el('div');
    const when = el('p', 'run-when', `${fmtDay(run.date)} · ${fmtTime(run.date)}`);
    if (run.pulse) when.append(el('span', 'badge', 'Pulse Mode'));
    const meta = el('p', 'run-meta');
    [fmtDuration(run.duration), fmtDistance(run.distance), fmtPace(run.duration, run.distance), run.source]
      .filter(Boolean).forEach((t) => meta.append(el('span', null, t)));
    text.append(when, meta);
    if (run.avgCadence != null) {
      const cad = el('p', 'run-cad');
      cad.append(el('strong', null, `${run.avgCadence} spm`));
      const vs = fmtVsTarget(run);
      cad.append(document.createTextNode(vs ? ` average · ${vs}` : ' average'));
      text.append(cad);
    }
    b.append(text, sparkline(run));
    b.setAttribute('aria-label', `Run on ${fmtDay(run.date)} at ${fmtTime(run.date)}, open details`);
    b.addEventListener('click', () => openRun(index));
    li.append(b);
    return li;
  }
  function renderList() {
    renderWeek();
    renderMonths();
    ui.runs.replaceChildren(...runs.map(runCard));
    ui.empty.hidden = runs.length > 0;
    document.querySelectorAll('[data-units]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.units === units)));
  }

  // ---------- detail view ----------
  let openIndex = -1;
  function openRun(index) {
    const run = runs[index];
    if (!run) return;
    openIndex = index;
    ui.detailTitle.textContent = `${fmtDay(run.date)} · ${fmtTime(run.date)}`;
    const facts = [
      ['Time', fmtDuration(run.duration)], ['Distance', fmtDistance(run.distance)], ['Pace', fmtPace(run.duration, run.distance)],
      ['Avg cadence', run.avgCadence != null ? `${run.avgCadence} spm` : null],
      ['Target', run.targetBPM != null ? `${run.targetBPM} BPM` : null],
      ['Recorded on', run.source], ['Pulse Mode', run.pulse ? 'On' : 'Off'],
    ].filter(([, v]) => v != null);
    ui.facts.replaceChildren(...facts.map(([k, v]) => stat(k, v)));

    ui.chartWrap.hidden = run.cadence.length < 2;
    if (run.cadence.length >= 2) {
      ui.chart.replaceChildren(chart(run));
      ui.legend.replaceChildren(el('span', null, 'Your cadence'));
      if (run.targetBPM != null) ui.legend.append(el('span', 'target', 'Target'));
    }
    ui.songs.hidden = run.songs.length === 0;
    ui.songList.replaceChildren(...run.songs.map((s) => el('li', null, s)));

    show('detail');
    window.scrollTo(0, 0);
    ui.detailTitle.focus();
  }
  function closeRun() {
    const index = openIndex;
    openIndex = -1;
    show('list');
    const btn = ui.runs.querySelectorAll('.run')[index];
    if (btn) btn.focus();
  }
  ui.back.addEventListener('click', closeRun);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ui.detail.hidden) closeRun(); });

  document.querySelectorAll('[data-period]').forEach((btn) => btn.addEventListener('click', () => {
    period = ['week', 'month', 'all'].includes(btn.dataset.period) ? btn.dataset.period : 'week';
    try { localStorage.setItem('adagio-period', period); } catch (e) { /* ignore */ }
    renderWeek();
  }));
  document.querySelectorAll('[data-units]').forEach((btn) => btn.addEventListener('click', () => {
    units = btn.dataset.units === 'km' ? 'km' : 'mi';
    try { localStorage.setItem('adagio-units', units); } catch (e) { /* ignore */ }
    renderList();
  }));

  // ---------- CloudKit ----------
  const MESSAGES = {
    AUTHENTICATION_FAILED: "Couldn't connect to iCloud from this page. Please try again later.",
    AUTHENTICATION_REQUIRED: 'Your sign-in expired. Please sign in again.',
    NETWORK_ERROR: "Couldn't reach iCloud. Check your connection and refresh.",
    THROTTLED: 'iCloud is busy right now. Please try again in a minute.',
    TRY_AGAIN_LATER: 'iCloud is busy right now. Please try again in a minute.',
    SERVICE_UNAVAILABLE: 'iCloud is unavailable right now. Please try again later.',
  };
  function fail(err) {
    const code = err && (err.ckErrorCode || err.serverErrorCode);
    if (code) console.warn('CloudKit error:', code); // code only: never log record contents
    show('error', (code && MESSAGES[code]) || "Something went wrong loading your runs. Please refresh and try again.");
  }

  async function fetchRuns(db) {
    const records = [];
    let response = await db.performQuery(
      { recordType: 'Run', sortBy: [{ fieldName: 'date', ascending: false }] },
      { resultsLimit: 200 },
    );
    for (;;) {
      if (response.hasErrors) {
        const e = response.errors[0];
        if (e && e.ckErrorCode === 'NOT_FOUND') break; // no Run records exist for this runner yet
        throw e;
      }
      records.push(...response.records);
      if (!response.moreComing || records.length >= MAX_RUNS) break;
      response = await db.performQuery(response); // next page
    }
    return records.map(parseRun).filter(Boolean).sort((a, b) => b.date - a.date);
  }

  function signedOut(container) {
    runs = [];
    ui.runs.replaceChildren();
    show('signedOut');
    container.whenUserSignsIn().then(() => signedIn(container)).catch(fail);
  }
  function signedIn(container) {
    show('loading', 'Loading your runs…');
    container.whenUserSignsOut().then(() => signedOut(container)).catch(fail);
    fetchRuns(container.privateCloudDatabase)
      .then((list) => { runs = list; renderList(); show('list'); })
      .catch(fail);
  }

  let started = false;
  function start() {
    if (started || !window.CloudKit) return;
    started = true;
    try {
      window.CloudKit.configure({
        containers: [{
          containerIdentifier: CONFIG.containerIdentifier,
          apiTokenAuth: {
            apiToken: CONFIG.apiToken,
            persist: true,
            signInButton: { id: 'apple-sign-in-button', theme: 'white' },
            signOutButton: { id: 'apple-sign-out-button', theme: 'black' },
          },
          environment: CONFIG.environment,
        }],
      });
      const container = window.CloudKit.getDefaultContainer();
      container.setUpAuth()
        .then((user) => (user ? signedIn(container) : signedOut(container)))
        .catch(fail);
    } catch (e) {
      fail(e);
    }
  }

  // Local layout testing only: http://localhost:<port>/runs.html?demo shows made-up runs.
  // This can never run on the live site.
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (isLocal && new URLSearchParams(location.search).has('demo')) {
    const day = 86400000, now = Date.now();
    const wave = (n, base, amp) => Array.from({ length: n }, (_, i) => Math.round(base + amp * Math.sin(i / 9) + (i % 7) - 3));
    const fake = [
      { recordName: 'demo-1', fields: { date: { value: now - 3600000 }, duration: { value: 1920 }, distance: { value: 5200 }, avgCadence: { value: 172 }, targetBPM: { value: 174 },
        cadence: { value: wave(384, 172, 4) }, songs: { value: ['Demo Song One — Demo Artist', '<b>Not bold</b> — Escaping Test'] }, haptic: { value: 1 }, source: { value: 'Watch' } } },
      { recordName: 'demo-2', fields: { date: { value: now - 2 * day }, duration: { value: 2700 }, distance: { value: 0 }, avgCadence: { value: 168 },
        cadence: { value: wave(540, 168, 6) }, haptic: { value: 0 }, source: { value: 'iPhone' } } },
      { recordName: 'demo-3', fields: { date: { value: now - 9 * day }, duration: { value: 1500 }, distance: { value: 4100 }, haptic: { value: 0 }, source: { value: 'Garmin' } } },
      { recordName: 'demo-4', fields: { date: { value: now - 40 * day }, duration: { value: 3000 }, distance: { value: 8000 }, avgCadence: { value: 170 }, haptic: { value: 0 }, source: { value: 'iPhone' } } },
    ];
    runs = fake.map(parseRun).filter(Boolean);
    renderList();
    show('list');
    const note = el('p', 'demo-note', 'Demo data: local testing only');
    ui.list.prepend(note);
    return;
  }

  // CloudKit JS loads after this file (async). Start when it's ready, and explain if it never loads.
  window.addEventListener('cloudkitloaded', start);
  if (window.CloudKit) start();
  document.addEventListener('error', (e) => {
    if (e.target && e.target.tagName === 'SCRIPT' && /apple-cloudkit\.com/.test(e.target.src || '') && !started) {
      show('error', "Couldn't load Apple's sign-in. If you use a content blocker, allow cdn.apple-cloudkit.com and refresh.");
    }
  }, true);
  setTimeout(() => {
    if (!started) show('error', "Apple's sign-in is taking too long to load. Check your connection or content blocker, then refresh.");
  }, 15000);
})();
