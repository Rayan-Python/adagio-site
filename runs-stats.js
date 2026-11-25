// My runs: the math. Pure functions over parsed runs (see parseRun in runs.js), no DOM.
// Loaded by runs.html before runs.js, and by Node for tests (module.exports).
//
// A parsed run looks like:
//   { id, date: Date, duration: sec|null, distance: m|null, avgCadence: spm|null,
//     targetBPM: spm|null, cadence: [spm every ~5 s], songs: ['Title — Artist'],
//     pulse: bool, source: 'iPhone'|'Watch'|'Garmin'|null }
'use strict';

(function (root) {
  const DAY = 86400000;
  const ON_TARGET_SPM = 3;      // "on target" means within 3 steps per minute of the target
  const MIN_STEADY_SAMPLES = 60; // ~5 minutes of readings before a run counts for "steadiest"

  // ---------- dates (local time, weeks start Monday) ----------
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function weekStart(d) { const s = dayStart(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  function periodStart(period, now) {
    if (period === 'week') return weekStart(now);
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'year') return new Date(now.getFullYear(), 0, 1);
    return new Date(0);
  }
  function inPeriod(runs, period, now) {
    const s = periodStart(period, now);
    return runs.filter((r) => r.date >= s);
  }

  // ---------- one run ----------
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function cadenceStats(run) {
    const v = run.cadence;
    if (!v || v.length < 2) return null;
    const m = mean(v);
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) * (x - m), 0) / v.length);
    const half = Math.floor(v.length / 2);
    let lo = Infinity, hi = -Infinity;
    for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
    return {
      min: Math.round(lo), max: Math.round(hi), mean: m, sd,
      firstHalf: mean(v.slice(0, half)), secondHalf: mean(v.slice(half)),
      samples: v.length,
    };
  }
  // Share of cadence readings within ON_TARGET_SPM of the target, or null without a target.
  function onTarget(run) {
    if (run.targetBPM == null || !run.cadence || run.cadence.length < 2) return null;
    let hit = 0;
    for (const x of run.cadence) if (Math.abs(x - run.targetBPM) <= ON_TARGET_SPM) hit++;
    return { hit, total: run.cadence.length, share: hit / run.cadence.length };
  }
  // Cadence readings bucketed into bins of `width` spm, for the detail histogram.
  function histogram(run, width) {
    const w = width || 2;
    const bins = new Map();
    for (const x of run.cadence) { const b = Math.floor(x / w) * w; bins.set(b, (bins.get(b) || 0) + 1); }
    const keys = [...bins.keys()].sort((a, b) => a - b);
    if (!keys.length) return [];
    const out = [];
    for (let b = keys[0]; b <= keys[keys.length - 1]; b += w) out.push({ from: b, to: b + w, count: bins.get(b) || 0 });
    return out;
  }

  // ---------- many runs ----------
  // Average cadence across runs, weighted by run time so a 1-minute run doesn't count as
  // much as an hour. Runs without a duration count as one minute.
  function avgCadence(runs) {
    let sum = 0, w = 0;
    for (const r of runs) {
      if (r.avgCadence == null) continue;
      const k = r.duration || 60;
      sum += r.avgCadence * k; w += k;
    }
    return w ? sum / w : null;
  }
  function onTargetAll(runs) {
    let hit = 0, total = 0;
    for (const r of runs) { const t = onTarget(r); if (t) { hit += t.hit; total += t.total; } }
    return total ? { hit, total, share: hit / total } : null;
  }
  function totals(runs) {
    const time = runs.reduce((a, r) => a + (r.duration || 0), 0);
    const dist = runs.reduce((a, r) => a + (r.distance || 0), 0);
    const timed = runs.filter((r) => r.duration != null);
    return {
      count: runs.length, time, dist,
      avgLength: timed.length ? time / timed.length : null,
      avgCadence: avgCadence(runs),
      onTarget: onTargetAll(runs),
      songs: runs.reduce((a, r) => a + r.songs.length, 0),
    };
  }

  // The last `n` weeks, oldest first, including weeks with no runs.
  function weekly(runs, n, now) {
    const first = addDays(weekStart(now), -7 * (n - 1));
    const weeks = Array.from({ length: n }, (_, i) => ({ start: addDays(first, 7 * i), count: 0, time: 0, dist: 0 }));
    for (const r of runs) {
      if (r.date < first) continue;
      const i = Math.floor((weekStart(r.date) - first) / (7 * DAY) + 0.01);
      const wk = weeks[i];
      if (!wk) continue;
      wk.count++; wk.time += r.duration || 0; wk.dist += r.distance || 0;
    }
    return weeks;
  }
  // Day-by-day grid for the calendar: `n` weeks of 7 days ending this week.
  function calendar(runs, n, now) {
    const first = addDays(weekStart(now), -7 * (n - 1));
    const byDay = new Map();
    for (const r of runs) {
      if (r.date < first) continue;
      const k = dayKey(r.date);
      const d = byDay.get(k) || { count: 0, time: 0 };
      d.count++; d.time += r.duration || 0;
      byDay.set(k, d);
    }
    const today = dayStart(now);
    const days = [];
    for (let i = 0; i < n * 7; i++) {
      const date = addDays(first, i);
      const d = byDay.get(dayKey(date)) || { count: 0, time: 0 };
      days.push({ date, week: Math.floor(i / 7), weekday: i % 7, future: date > today, count: d.count, time: d.time });
    }
    return days;
  }
  function byMonth(runs) {
    const m = new Map();
    for (const r of runs) {
      const key = `${r.date.getFullYear()}-${r.date.getMonth()}`;
      const x = m.get(key) || { date: new Date(r.date.getFullYear(), r.date.getMonth(), 1), count: 0, time: 0, dist: 0 };
      x.count++; x.time += r.duration || 0; x.dist += r.distance || 0;
      m.set(key, x);
    }
    return [...m.values()].sort((a, b) => b.date - a.date);
  }

  // Streaks. A week streak counts this week if you've run, otherwise it still holds from
  // last week (the week isn't over yet).
  function streaks(runs, now) {
    if (!runs.length) return { weeks: 0, bestWeeks: 0, bestDays: 0 };
    const weeks = new Set(runs.map((r) => weekStart(r.date).getTime()));
    const days = new Set(runs.map((r) => dayStart(r.date).getTime()));
    let cur = weekStart(now);
    if (!weeks.has(cur.getTime())) cur = addDays(cur, -7);
    let current = 0;
    while (weeks.has(cur.getTime())) { current++; cur = addDays(cur, -7); }
    const longest = (set, step) => {
      let best = 0;
      for (const t of set) {
        if (set.has(addDays(new Date(t), -step).getTime())) continue; // not the start of a run of days
        let len = 0, d = new Date(t);
        while (set.has(d.getTime())) { len++; d = addDays(d, step); }
        if (len > best) best = len;
      }
      return best;
    };
    return { weeks: current, bestWeeks: longest(weeks, 7), bestDays: longest(days, 1) };
  }

  const TIMES = [['Morning', 5, 12], ['Afternoon', 12, 17], ['Evening', 17, 21], ['Night', 21, 29]];
  function timeOfDay(runs) {
    const out = TIMES.map(([name]) => ({ name, count: 0, time: 0 }));
    for (const r of runs) {
      let h = r.date.getHours(); if (h < 5) h += 24;
      const i = TIMES.findIndex(([, a, b]) => h >= a && h < b);
      out[i].count++; out[i].time += r.duration || 0;
    }
    return out;
  }
  function bySource(runs) {
    const names = ['iPhone', 'Watch', 'Garmin'];
    const out = names.map((name) => ({ name, count: 0, time: 0 }));
    for (const r of runs) { const i = names.indexOf(r.source); if (i >= 0) { out[i].count++; out[i].time += r.duration || 0; } }
    return out.filter((x) => x.count > 0);
  }
  // Pulse Mode on vs off, side by side. Only facts from the runs, no claims about cause.
  function pulseCompare(runs) {
    const side = (list) => ({ count: list.length, avgCadence: avgCadence(list), onTarget: onTargetAll(list) });
    return { on: side(runs.filter((r) => r.pulse)), off: side(runs.filter((r) => !r.pulse)) };
  }
  function topSongs(runs, n) {
    const m = new Map();
    for (const r of runs) for (const s of new Set(r.songs)) m.set(s, (m.get(s) || 0) + 1);
    return [...m.entries()].map(([song, count]) => ({ song, count }))
      .sort((a, b) => b.count - a.count || a.song.localeCompare(b.song)).slice(0, n || 10);
  }
  function bestWeek(runs) {
    const m = new Map();
    for (const r of runs) {
      const k = weekStart(r.date).getTime();
      const w = m.get(k) || { start: new Date(k), count: 0, time: 0, dist: 0 };
      w.count++; w.time += r.duration || 0; w.dist += r.distance || 0;
      m.set(k, w);
    }
    let best = null;
    for (const w of m.values()) if (!best || w.time > best.time) best = w;
    return best && best.time > 0 ? best : null;
  }
  // Personal records. minPaceDist (meters) keeps very short runs out of "fastest pace".
  function records(runs, minPaceDist) {
    const pick = (list, score) => list.reduce((best, r) => (best == null || score(r) > score(best) ? r : best), null);
    const timed = runs.filter((r) => r.duration != null);
    const far = runs.filter((r) => r.distance != null);
    const paced = runs.filter((r) => r.duration != null && r.distance != null && r.distance >= minPaceDist);
    const cad = runs.filter((r) => r.avgCadence != null);
    const steady = runs.filter((r) => r.cadence.length >= MIN_STEADY_SAMPLES).map((r) => ({ run: r, sd: cadenceStats(r).sd }));
    const tgt = runs.map((r) => ({ run: r, t: onTarget(r) })).filter((x) => x.t && x.t.total >= MIN_STEADY_SAMPLES);
    const s = steady.reduce((b, x) => (!b || x.sd < b.sd ? x : b), null);
    const t = tgt.reduce((b, x) => (!b || x.t.share > b.t.share ? x : b), null);
    return {
      longest: pick(timed, (r) => r.duration),
      farthest: pick(far, (r) => r.distance),
      fastest: pick(paced, (r) => r.distance / r.duration),
      highCadence: pick(cad, (r) => r.avgCadence),
      steadiest: s ? { run: s.run, sd: s.sd } : null,
      onTarget: t ? { run: t.run, share: t.t.share } : null,
    };
  }
  // Rolling average over the last k values (for the cadence trend line).
  function rolling(values, k) {
    return values.map((_, i) => mean(values.slice(Math.max(0, i - k + 1), i + 1)));
  }

  // ---------- export ----------
  // A cell that starts with = + - @ (or tab/CR) could run as a formula in a spreadsheet,
  // so it gets a leading apostrophe. Everything is quoted.
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  }
  function toCSV(runs) {
    const head = ['date', 'duration_seconds', 'distance_meters', 'avg_cadence_spm', 'target_spm', 'on_target_percent', 'pulse_mode', 'recorded_on', 'songs'];
    const rows = runs.map((r) => {
      const t = onTarget(r);
      return [r.date.toISOString(), r.duration != null ? Math.round(r.duration) : '', r.distance != null ? Math.round(r.distance) : '',
        r.avgCadence ?? '', r.targetBPM ?? '', t ? Math.round(t.share * 100) : '', r.pulse ? 'on' : 'off', r.source || '', r.songs.join(' | ')];
    });
    return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  const api = {
    ON_TARGET_SPM, MIN_STEADY_SAMPLES,
    dayStart, weekStart, addDays, periodStart, inPeriod,
    cadenceStats, onTarget, histogram, avgCadence, onTargetAll, totals,
    weekly, calendar, byMonth, streaks, timeOfDay, bySource, pulseCompare, topSongs, bestWeek, records, rolling,
    csvCell, toCSV,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdagioStats = api;
})(typeof self !== 'undefined' ? self : this);
