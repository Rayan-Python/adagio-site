// My runs: signs the runner in with their Apple ID (CloudKit JS) and reads the "Run" records
// the Adagio app saved to their PRIVATE iCloud database. Nothing goes through our servers,
// and nothing is stored in the browser except the mi/km and period choices.
//
// Security: every value from a record is written with textContent or as an SVG number,
// never as HTML, so a song title like "<script>" is shown as text and can't run.
//
// runs-stats.js (the math) and runs-charts.js (the SVG) load before this file.
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
  const S = window.AdagioStats;
  const C = window.AdagioCharts;
  const MAX_RUNS = 2000;       // stop paging after this many records
  const MAX_SONGS = 300;       // per run
  const MAX_SAMPLES = 10000;   // cadence readings per run (~14 h at one per 5 s)
  const SAMPLE_SEC = 5;        // the app stores one cadence reading per ~5 s
  const PAGE = 30;             // run cards shown before "Show more"
  const SOURCES = ['iPhone', 'Watch', 'Garmin'];
  const PERIODS = { week: 'This week', month: 'This month', year: 'This year', all: 'All time' };

  const $ = (id) => document.getElementById(id);
  const ui = {
    status: $('status'), signedOut: $('signed-out'), list: $('list-view'), detail: $('detail-view'),
    synced: $('synced'), refresh: $('refresh'),
    summary: $('summary'), highlights: $('highlights'),
    weeklyChart: $('weekly-chart'), calendar: $('calendar'), calendarSub: $('calendar-sub'), heatKey: $('heat-key'),
    trendCard: $('trend-card'), trend: $('trend'), trendSub: $('trend-sub'),
    recordsBlock: $('records-block'), records: $('records'),
    periodTitle: $('period-title'), week: $('week'),
    pulseCard: $('pulse-card'), pulse: $('pulse'), tod: $('tod'), sourcesCard: $('sources-card'), sources: $('sources'),
    topSongsCard: $('top-songs-card'), topSongs: $('top-songs'),
    monthsBlock: $('months-block'), months: $('months'),
    runs: $('runs'), noMatch: $('no-match'), more: $('more'), exportBtn: $('export'), empty: $('empty'),
    facts: $('facts'), detailTitle: $('detail-title'), compare: $('compare'),
    chart: $('chart'), chartWrap: $('chart-wrap'), legend: $('legend'),
    hist: $('hist'), histWrap: $('hist-wrap'), histLegend: $('hist-legend'),
    songs: $('songs'), songList: $('song-list'),
    back: $('back'), newer: $('newer'), older: $('older'),
  };
  $('year').textContent = String(new Date().getFullYear());

  let runs = [];              // every run, newest first
  let loadedAt = null;
  let units = 'mi';
  let period = 'all';
  let source = 'all';
  let shown = PAGE;
  try { const p = localStorage.getItem('adagio-period'); if (p in PERIODS) period = p; } catch (e) { /* keep all */ }
  try { if (localStorage.getItem('adagio-units') === 'km') units = 'km'; } catch (e) { /* storage blocked: keep mi */ }

  // ---------- small DOM helpers (text only) ----------
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = String(text);
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
    const src = f.source && SOURCES.includes(f.source.value) ? f.source.value : null;
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
      source: src,
    };
  }

  // ---------- formatting ----------
  function fmtClock(sec) {
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  }
  // Run lengths read as "1m 14s" or "1h 17m" so short and long runs can't be confused.
  // (Pace keeps the usual "9:54 /mi" form.)
  function fmtLength(sec) {
    if (sec == null) return null;
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${r}s`;
    return `${r}s`;
  }
  const perUnit = () => (units === 'km' ? 1000 : 1609.344);
  function fmtDistance(m, digits) { return m == null ? null : `${(m / perUnit()).toFixed(digits ?? 2)} ${units}`; }
  function fmtPace(sec, m) {
    if (sec == null || m == null) return null;
    const p = sec / (m / perUnit());
    if (!Number.isFinite(p) || p <= 0 || p > 3600) return null;
    return `${fmtClock(p)} /${units}`;
  }
  const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtShort = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtPct = (x) => `${Math.round(x * 100)}%`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
  function fmtVsTarget(run) {
    if (run.avgCadence == null || run.targetBPM == null) return null;
    const d = run.avgCadence - run.targetBPM;
    if (d === 0) return 'right on target';
    return `${Math.abs(d)} spm ${d > 0 ? 'over' : 'under'} target`;
  }

  function stat(label, value) {
    const box = el('div', 'stat');
    box.append(el('dt', null, label), el('dd', null, value));
    return box;
  }
  // Horizontal bar rows (When you run, Recorded on). rows: [{ name, count, time }]
  function hbars(list, rows) {
    const max = Math.max(1, ...rows.map((r) => r.count));
    list.replaceChildren(...rows.map((r) => {
      const li = el('li', 'hbar');
      li.append(el('span', 'hbar-name', r.name));
      const bar = el('span', 'month-bar');
      const fill = el('span');
      fill.style.width = r.count ? `${Math.max(3, (r.count / max) * 100).toFixed(1)}%` : '0';
      bar.append(fill);
      li.append(bar, el('span', 'hbar-stats', r.count ? `${plural(r.count, 'run')} · ${fmtLength(r.time)}` : '—'));
      return li;
    }));
  }

  // ---------- overview (all time) ----------
  function renderOverview() {
    const now = new Date();
    const all = S.totals(runs);
    const first = runs[runs.length - 1];
    const st = S.streaks(runs, now);
    const totalsText = [all.time > 0 ? fmtLength(all.time) : null, all.dist > 0 ? fmtDistance(all.dist, 1) : null].filter(Boolean).join(' and ');
    const parts = [`You've logged ${plural(all.count, 'run')} with Adagio since ${first.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}${totalsText ? `: ${totalsText} in all.` : '.'}`];
    if (all.avgCadence != null) parts.push(`Your average cadence is ${Math.round(all.avgCadence)} steps per minute.`);
    if (all.onTarget) parts.push(`On runs with a target, you were within ${S.ON_TARGET_SPM} spm of it ${fmtPct(all.onTarget.share)} of the time.`);
    if (st.weeks > 1) parts.push(`You've run every week for ${st.weeks} weeks in a row.`);
    ui.summary.textContent = parts.join(' ');

    const tod = S.timeOfDay(runs).sort((a, b) => b.count - a.count)[0];
    const src = S.bySource(runs).sort((a, b) => b.count - a.count)[0];
    const best = S.bestWeek(runs);
    const items = [
      ['Week streak', plural(st.weeks, 'week')],
      ['Longest daily streak', plural(st.bestDays, 'day')],
      ['Best week', best ? `${fmtLength(best.time)}` : null, best ? `Week of ${fmtShort(best.start)}` : null],
      ['You usually run', tod && tod.count ? `${tod.name}s`.replace('Nights', 'At night') : null],
      ['Mostly on', src ? src.name : null],
      ['Songs played', all.songs ? String(all.songs) : null],
    ].filter(([, v]) => v != null);
    ui.highlights.replaceChildren(...items.map(([k, v, sub]) => {
      const box = stat(k, v);
      if (sub) box.append(el('p', 'stat-sub', sub));
      return box;
    }));
  }

  // ---------- charts (fixed windows) ----------
  // Charts are drawn at the width they'll show at, so axis text stays a readable size on phones.
  const wrapEl = document.querySelector('#main .wrap');
  function chartWidth() {
    const w = wrapEl.clientWidth - 40 - 42; // page padding, card padding and border
    return Math.max(280, Math.min(720, Math.round(w)));
  }
  // Axis top for minutes, so the halfway line lands on a round time (30m, 1h, 1.5h ...).
  function niceMinutes(v) {
    for (const m of [20, 30, 60, 120, 180, 240, 360, 480, 600, 900, 1200, 1800]) if (v <= m) return m;
    return Math.ceil(v / 600) * 600;
  }
  function renderCharts() {
    const now = new Date();
    const W = chartWidth();
    const narrow = W < 460;
    const weeks = S.weekly(runs, 12, now);
    ui.weeklyChart.replaceChildren(C.bars({
      W, H: narrow ? 180 : 220,
      label: `Minutes run per week for the last 12 weeks. ${weeks.map((w) => `Week of ${fmtShort(w.start)}: ${Math.round(w.time / 60)} minutes`).join('. ')}`,
      max: niceMinutes(Math.max(...weeks.map((w) => w.time / 60))),
      yFmt: (v) => (v >= 60 ? `${+(v / 60).toFixed(1)}h` : `${Math.round(v)}m`),
      items: weeks.map((w, i) => ({
        value: w.time / 60,
        label: (11 - i) % (narrow ? 4 : 3) === 0 ? fmtShort(w.start) : '', // every 3rd (4th on phones) week, ending this week
        tip: `Week of ${fmtShort(w.start)}: ${w.count ? `${plural(w.count, 'run')}, ${fmtLength(w.time)}${w.dist ? `, ${fmtDistance(w.dist, 1)}` : ''}` : 'no runs'}`,
      })),
    }));

    // As many weeks as fit, up to 6 months (26 weeks).
    const nWeeks = Math.max(10, Math.min(26, Math.floor((W - 34) / 22)));
    const days = S.calendar(runs, nWeeks, now);
    ui.calendarSub.textContent = nWeeks === 26 ? 'Last 6 months, brighter means longer' : `Last ${nWeeks} weeks, brighter means longer`;
    const ranDays = days.filter((d) => d.count);
    const maxT = Math.max(1, ...ranDays.map((d) => d.time));
    const level = (d) => (d.count === 0 ? 0 : d.time === 0 ? 1 : Math.min(4, 1 + Math.floor((d.time / maxT) * 3.999)));
    ui.calendar.replaceChildren(C.calendar({
      days, level,
      monthName: (d) => d.toLocaleDateString(undefined, { month: 'short' }),
      tipFor: (d) => `${fmtDay(d.date)}: ${d.count ? `${plural(d.count, 'run')}, ${fmtLength(d.time)}` : 'no runs'}`,
      label: `Calendar of the last ${nWeeks} weeks. You ran on ${plural(ranDays.length, 'day')}.`,
    }));
    const key = [el('span', null, 'Less')];
    C.heatColors.forEach((c) => { const sw = el('i'); sw.style.background = c; key.push(sw); });
    key.push(el('span', null, 'More'));
    ui.heatKey.replaceChildren(...key);

    const withCad = runs.filter((r) => r.avgCadence != null).slice(0, 30).reverse();
    ui.trendCard.hidden = withCad.length < 2;
    if (withCad.length >= 2) {
      const vals = withCad.map((r) => r.avgCadence);
      ui.trendSub.textContent = `Your last ${withCad.length} runs with cadence, oldest on the left`;
      ui.trend.replaceChildren(C.trend({
        W, H: narrow ? 180 : 220,
        points: withCad.map((r) => ({ value: r.avgCadence, tip: `${fmtDay(r.date)}: ${r.avgCadence} spm${r.pulse ? ', Pulse Mode' : ''}` })),
        line: S.rolling(vals, 5),
        label: `Average cadence for your last ${withCad.length} runs, from ${Math.min(...vals)} to ${Math.max(...vals)} steps per minute`,
      }));
    }
  }

  // ---------- personal records (all time) ----------
  function renderRecords() {
    const rec = S.records(runs, perUnit());
    const rows = [
      ['Longest run', rec.longest, (r) => fmtLength(r.duration)],
      ['Farthest run', rec.farthest, (r) => fmtDistance(r.distance)],
      [`Fastest pace (1 ${units} or more)`, rec.fastest, (r) => fmtPace(r.duration, r.distance)],
      ['Highest average cadence', rec.highCadence, (r) => `${r.avgCadence} spm`],
      ['Steadiest cadence', rec.steadiest && rec.steadiest.run, () => `±${rec.steadiest.sd.toFixed(1)} spm`],
      ['Most on target', rec.onTarget && rec.onTarget.run, () => fmtPct(rec.onTarget.share)],
    ].filter(([, r]) => r);
    ui.records.replaceChildren(...rows.map(([label, run, value]) => {
      const li = el('li');
      const b = el('button', 'record');
      b.type = 'button';
      b.append(el('span', 'record-label', label), el('span', 'record-value', value(run)), el('span', 'record-date', fmtShort(run.date)));
      b.setAttribute('aria-label', `${label}: ${value(run)}, on ${fmtDay(run.date)}. Open run`);
      b.addEventListener('click', () => openRun(run));
      li.append(b);
      return li;
    }));
    ui.recordsBlock.hidden = rows.length === 0;
  }

  // ---------- the period section ----------
  function renderPeriod() {
    const list = S.inPeriod(runs, period, new Date());
    const t = S.totals(list);
    ui.periodTitle.textContent = PERIODS[period];
    ui.week.replaceChildren(
      stat('Runs', String(t.count)),
      stat('Time', fmtLength(t.time)),
      stat('Distance', t.dist > 0 ? fmtDistance(t.dist) : '—'),
      stat('Avg run', t.avgLength != null ? fmtLength(t.avgLength) : '—'),
      stat('Avg cadence', t.avgCadence != null ? `${Math.round(t.avgCadence)} spm` : '—'),
      stat('On target', t.onTarget ? fmtPct(t.onTarget.share) : '—'),
    );

    // Pulse Mode on vs off
    const pc = S.pulseCompare(list);
    if (pc.on.count && pc.off.count) {
      const tbl = el('table', 'compare-table');
      const head = el('tr');
      head.append(el('th'), el('th', null, 'On'), el('th', null, 'Off'));
      const row = (name, f) => { const tr = el('tr'); tr.append(el('th', null, name), el('td', null, f(pc.on)), el('td', null, f(pc.off))); return tr; };
      const thead = el('thead'); thead.append(head);
      const tbody = el('tbody');
      tbody.append(
        row('Runs', (x) => String(x.count)),
        row('Avg cadence', (x) => (x.avgCadence != null ? `${Math.round(x.avgCadence)} spm` : '—')),
        row('On target', (x) => (x.onTarget ? fmtPct(x.onTarget.share) : '—')),
      );
      tbl.append(thead, tbody);
      ui.pulse.replaceChildren(tbl, el('p', 'sub', 'Plain averages from your own runs.'));
    } else if (list.length) {
      ui.pulse.replaceChildren(el('p', 'muted', pc.on.count
        ? `All ${plural(list.length, 'run')} here had Pulse Mode on. Try one with it off to compare.`
        : `None of these runs used Pulse Mode. Turn it on for a run to compare.`));
    } else {
      ui.pulse.replaceChildren(el('p', 'muted', 'No runs in this period yet.'));
    }

    hbars(ui.tod, S.timeOfDay(list));
    const srcs = S.bySource(list);
    ui.sourcesCard.hidden = srcs.length === 0;
    hbars(ui.sources, srcs);

    const top = S.topSongs(list, 10);
    ui.topSongsCard.hidden = top.length === 0;
    ui.topSongs.replaceChildren(...top.map((s) => {
      const li = el('li');
      li.append(el('span', 'song', s.song), el('span', 'count', plural(s.count, 'run')));
      return li;
    }));

    // By month
    const months = S.byMonth(list);
    const maxTime = Math.max(1, ...months.map((m) => m.time));
    ui.months.replaceChildren(...months.map((m) => {
      const li = el('li', 'month');
      li.append(el('span', 'month-name', m.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })));
      const bar = el('span', 'month-bar');
      const fill = el('span');
      fill.style.width = `${Math.max(2, (m.time / maxTime) * 100).toFixed(1)}%`;
      bar.append(fill);
      li.append(bar);
      const parts = [plural(m.count, 'run'), fmtLength(m.time)];
      if (m.dist > 0) parts.push(fmtDistance(m.dist));
      li.append(el('span', 'month-stats', parts.join(' · ')));
      return li;
    }));
    ui.monthsBlock.hidden = months.length < 2;

    renderRunList(list);
    document.querySelectorAll('[data-period]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.period === period)));
  }

  // ---------- run cards ----------
  function runCard(run) {
    const li = el('li');
    const b = el('button', 'run');
    b.type = 'button';
    b.dataset.id = run.id;
    const text = el('div');
    const when = el('p', 'run-when', `${fmtDay(run.date)} · ${fmtTime(run.date)}`);
    if (run.pulse) when.append(el('span', 'badge', 'Pulse Mode'));
    const meta = el('p', 'run-meta');
    [fmtLength(run.duration), fmtDistance(run.distance), fmtPace(run.duration, run.distance), run.source]
      .filter(Boolean).forEach((t) => meta.append(el('span', null, t)));
    text.append(when, meta);
    if (run.avgCadence != null) {
      const cad = el('p', 'run-cad');
      cad.append(el('strong', null, `${run.avgCadence} spm`));
      const vs = fmtVsTarget(run);
      cad.append(document.createTextNode(vs ? ` average · ${vs}` : ' average'));
      text.append(cad);
    }
    b.append(text, C.sparkline(run.cadence, run.targetBPM));
    b.setAttribute('aria-label', `Run on ${fmtDay(run.date)} at ${fmtTime(run.date)}, open details`);
    b.addEventListener('click', () => openRun(run));
    li.append(b);
    return li;
  }
  let listed = [];
  function renderRunList(periodRuns) {
    listed = periodRuns.filter((r) => (source === 'all' ? true : source === 'pulse' ? r.pulse : r.source === source));
    ui.runs.replaceChildren(...listed.slice(0, shown).map(runCard));
    ui.more.hidden = listed.length <= shown;
    ui.more.textContent = `Show more (${listed.length - shown} left)`;
    ui.noMatch.hidden = listed.length > 0 || runs.length === 0;
    document.querySelectorAll('[data-source]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.source === source)));
  }

  function renderList() {
    ui.empty.hidden = runs.length > 0;
    ui.list.querySelectorAll('.block, .filter-row').forEach((n) => { n.hidden = runs.length === 0; });
    const note = runs.length >= MAX_RUNS ? ` (your latest ${MAX_RUNS})` : '';
    ui.synced.textContent = loadedAt ? `${plural(runs.length, 'run')}${note} · updated ${fmtTime(loadedAt)}` : '';
    document.querySelectorAll('[data-units]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.units === units)));
    if (!runs.length) return;
    renderOverview();
    renderCharts();
    renderRecords();
    renderPeriod();
  }

  // ---------- detail view ----------
  let openId = null;
  function drawRunCharts(run, cs) {
    const W = chartWidth();
    ui.chartWrap.hidden = run.cadence.length < 2;
    ui.histWrap.hidden = run.cadence.length < 12;
    if (run.cadence.length >= 2) {
      ui.chart.replaceChildren(C.runCadence({
        W, H: W < 460 ? 200 : 240,
        values: run.cadence, target: run.targetBPM, band: S.ON_TARGET_SPM, sampleSec: SAMPLE_SEC,
        label: `Cadence over the run, between ${cs.min} and ${cs.max} steps per minute${run.targetBPM != null ? `, target ${run.targetBPM}` : ''}`,
      }));
      ui.legend.replaceChildren(el('span', null, 'Your cadence'));
      if (run.targetBPM != null) ui.legend.append(el('span', 'target', 'Target'), el('span', 'band', `Within ${S.ON_TARGET_SPM} spm`));
    }
    if (run.cadence.length >= 12) {
      const width = cs.max - cs.min <= 36 ? 1 : 2; // 1 spm bins unless the run spans a wide range
      const bins = S.histogram(run, width);
      const n = run.cadence.length;
      const tgt = run.targetBPM;
      const inBand = (b) => tgt == null || (b.to - 1 >= tgt - S.ON_TARGET_SPM && b.from <= tgt + S.ON_TARGET_SPM);
      ui.hist.replaceChildren(C.histogram({
        W, H: W < 460 ? 150 : 180,
        bins, inBand,
        tipFor: (b) => `${width === 1 ? b.from : `${b.from}–${b.to - 1}`} spm: ${fmtPct(b.count / n)} of the run`,
        label: `Cadence distribution from ${bins[0].from} to ${bins[bins.length - 1].to - 1} steps per minute`,
      }));
      ui.histLegend.replaceChildren();
      if (tgt != null) ui.histLegend.append(el('span', null, 'Near target'), el('span', 'off', 'Away from target'));
    }
  }
  function openRun(run, fromHistory) {
    if (!run) return;
    openId = run.id;
    const i = runs.indexOf(run);
    ui.detailTitle.textContent = `${fmtDay(run.date)} · ${fmtTime(run.date)}`;
    const cs = S.cadenceStats(run);
    const ot = S.onTarget(run);
    const facts = [
      ['Time', fmtLength(run.duration)], ['Distance', fmtDistance(run.distance)], ['Pace', fmtPace(run.duration, run.distance)],
      ['Avg cadence', run.avgCadence != null ? `${run.avgCadence} spm` : null],
      ['Target', run.targetBPM != null ? `${run.targetBPM} spm` : null],
      ['On target', ot ? fmtPct(ot.share) : null],
      ['Cadence range', cs ? `${cs.min}–${cs.max}` : null],
      ['Steadiness', cs ? `±${cs.sd.toFixed(1)} spm` : null],
      ['Recorded on', run.source], ['Pulse Mode', run.pulse ? 'On' : 'Off'],
      ['Songs', run.songs.length ? String(run.songs.length) : null],
    ].filter(([, v]) => v != null);
    ui.facts.replaceChildren(...facts.map(([k, v]) => stat(k, v)));

    // Plain comparisons: this run vs your all-time average, and first half vs second half.
    const lines = [];
    const avgAll = S.avgCadence(runs.filter((r) => r !== run));
    if (run.avgCadence != null && avgAll != null) {
      const d = Math.round(run.avgCadence - avgAll);
      lines.push(d === 0 ? `Your cadence matched your usual average of ${Math.round(avgAll)} spm.`
        : `Your cadence was ${Math.abs(d)} spm ${d > 0 ? 'above' : 'below'} your usual average of ${Math.round(avgAll)} spm.`);
    }
    if (cs && cs.samples >= 24) {
      const a = Math.round(cs.firstHalf), b = Math.round(cs.secondHalf);
      lines.push(a === b ? `You held ${a} spm through both halves.` : `First half ${a} spm, second half ${b} spm.`);
    }
    ui.compare.textContent = lines.join(' ');
    ui.compare.hidden = lines.length === 0;

    drawRunCharts(run, cs);
    ui.songs.hidden = run.songs.length === 0;
    ui.songList.replaceChildren(...run.songs.map((s) => el('li', null, s)));

    ui.newer.disabled = i <= 0;
    ui.older.disabled = i < 0 || i >= runs.length - 1;

    if (!fromHistory) {
      if (history.state && history.state.run) history.replaceState({ run: run.id }, '', '#run');
      else history.pushState({ run: run.id }, '', '#run');
    }
    show('detail');
    window.scrollTo(0, 0);
    ui.detailTitle.focus();
  }
  function closeRun(fromHistory) {
    if (!fromHistory && history.state && history.state.run) { history.back(); return; } // popstate finishes the close
    const id = openId;
    openId = null;
    show('list');
    const btn = [...ui.runs.querySelectorAll('.run')].find((b) => b.dataset.id === id);
    if (btn) btn.focus();
  }
  window.addEventListener('popstate', (e) => {
    const id = e.state && e.state.run;
    const run = id && runs.find((r) => r.id === id);
    if (run) openRun(run, true);
    else if (!ui.detail.hidden) closeRun(true);
  });
  ui.back.addEventListener('click', () => closeRun(false));
  ui.newer.addEventListener('click', () => { const i = runs.findIndex((r) => r.id === openId); if (i > 0) openRun(runs[i - 1]); });
  ui.older.addEventListener('click', () => { const i = runs.findIndex((r) => r.id === openId); if (i >= 0 && i < runs.length - 1) openRun(runs[i + 1]); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ui.detail.hidden) closeRun(false); });

  // ---------- controls ----------
  document.querySelectorAll('[data-period]').forEach((btn) => btn.addEventListener('click', () => {
    period = btn.dataset.period in PERIODS ? btn.dataset.period : 'all';
    shown = PAGE;
    try { localStorage.setItem('adagio-period', period); } catch (e) { /* ignore */ }
    renderPeriod();
  }));
  document.querySelectorAll('[data-units]').forEach((btn) => btn.addEventListener('click', () => {
    units = btn.dataset.units === 'km' ? 'km' : 'mi';
    try { localStorage.setItem('adagio-units', units); } catch (e) { /* ignore */ }
    renderList();
  }));
  document.querySelectorAll('[data-source]').forEach((btn) => btn.addEventListener('click', () => {
    source = ['iPhone', 'Watch', 'Garmin', 'pulse'].includes(btn.dataset.source) ? btn.dataset.source : 'all';
    shown = PAGE;
    renderRunList(S.inPeriod(runs, period, new Date()));
  }));
  ui.more.addEventListener('click', () => {
    const next = ui.runs.children.length;
    shown += PAGE;
    renderRunList(S.inPeriod(runs, period, new Date()));
    const btn = ui.runs.children[next] && ui.runs.children[next].querySelector('.run');
    if (btn) btn.focus();
  });
  // The CSV is made in this browser from the runs already on screen; nothing is uploaded.
  ui.exportBtn.addEventListener('click', () => {
    const blob = new Blob([S.toCSV(runs)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    const d = new Date();
    a.download = `adagio-runs-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  C.tooltips(document.getElementById('main'));
  let lastW = 0, resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = chartWidth();
      if (!runs.length || Math.abs(w - lastW) < 24) return;
      lastW = w;
      renderCharts();
      const run = openId != null && runs.find((r) => r.id === openId);
      if (run) drawRunCharts(run, S.cadenceStats(run));
    }, 150);
  });

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
  function loaded(list) {
    runs = list;
    loadedAt = new Date();
    shown = PAGE;
    renderList();
    if (history.state && history.state.run) history.replaceState(null, '', location.pathname + location.search);
    show('list');
  }

  let activeContainer = null;
  function signedOut(container) {
    activeContainer = null;
    runs = [];
    ui.runs.replaceChildren();
    show('signedOut');
    container.whenUserSignsIn().then(() => signedIn(container)).catch(fail);
  }
  function signedIn(container) {
    activeContainer = container;
    show('loading', 'Loading your runs…');
    container.whenUserSignsOut().then(() => signedOut(container)).catch(fail);
    fetchRuns(container.privateCloudDatabase).then(loaded).catch(fail);
  }
  ui.refresh.addEventListener('click', () => {
    if (!activeContainer) return;
    ui.refresh.disabled = true;
    ui.list.classList.add('is-refreshing'); // keep the page, dim it while it reloads
    fetchRuns(activeContainer.privateCloudDatabase)
      .then(loaded).catch(fail)
      .finally(() => { ui.refresh.disabled = false; ui.list.classList.remove('is-refreshing'); });
  });

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
    const wave = (n, base, amp, seed) => Array.from({ length: n }, (_, i) => Math.round(base + amp * Math.sin(i / 9 + seed) + ((i * 7 + seed) % 7) - 3));
    const songs = ['Demo Song One — Demo Artist', 'Second Demo — Another Artist', 'Third Track — Demo Band', '<b>Not bold</b> — Escaping Test', '=1+1 — CSV Test'];
    const fake = [];
    // ~60 runs over 5 months, a few per week, different devices and times
    for (let k = 0, t = now - 3600000; k < 60; k++) {
      const dur = 900 + ((k * 397) % 2700);
      const pulse = k % 3 !== 1;
      const tgt = k % 4 === 3 ? null : 170 + (k % 3) * 2;
      const base = (tgt || 168) + (pulse ? 0 : -3) + ((k % 5) - 2);
      const src = SOURCES[k % 3];
      fake.push({ recordName: `demo-${k}`, fields: {
        date: { value: t }, duration: { value: dur }, distance: { value: k % 5 === 2 ? 0 : dur * (2.6 + (k % 4) * 0.15) },
        avgCadence: { value: base }, ...(tgt ? { targetBPM: { value: tgt } } : {}),
        cadence: { value: k % 9 === 8 ? [] : wave(Math.round(dur / SAMPLE_SEC), base, 3 + (k % 4), k) },
        songs: { value: songs.slice(k % 3, (k % 3) + 2 + (k % 2)) }, haptic: { value: pulse ? 1 : 0 }, source: { value: src } } });
      t -= day * (1 + ((k * 5) % 4)) + (k % 2 ? 9 : 3) * 3600000;
    }
    fake.push({ recordName: 'demo-short', fields: { date: { value: now - 7200000 }, duration: { value: 74 }, haptic: { value: 1 }, source: { value: 'Garmin' } } });
    loaded(fake.map(parseRun).filter(Boolean).sort((a, b) => b.date - a.date));
    ui.list.prepend(el('p', 'demo-note', 'Demo data: local testing only'));
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
