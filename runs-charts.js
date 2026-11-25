// My runs: the charts. Builds plain SVG from numbers and strings handed in by runs.js.
// Every text node is set with textContent, so nothing from a record is ever parsed as HTML.
'use strict';

(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const LIME = '#E8F02A';
  const INK = 'rgba(255,255,255,.55)';
  const GRID = 'rgba(255,255,255,.08)';
  const MUTED = 'rgba(255,255,255,.22)';
  const HEAT = ['rgba(255,255,255,.06)', 'rgba(232,240,42,.28)', 'rgba(232,240,42,.52)', 'rgba(232,240,42,.76)', LIME];

  function svg(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    return n;
  }
  function text(x, y, str, anchor) {
    const t = svg('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor || 'middle' });
    t.textContent = str;
    return t;
  }
  function frame(W, H, label, cls) {
    return svg('svg', { class: cls || 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  }
  // A bar with 4px rounded top corners, square at the baseline.
  function barPath(x, y, w, h, r) {
    const k = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function tip(node, str, focusable) {
    node.setAttribute('data-tip', str);
    if (focusable) { node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', str); }
  }

  // Vertical bars. items: [{ value, label, tip }]. yFmt formats axis values.
  function bars({ items, label, yFmt, max: top, W = 640, H = 220 }) {
    const L = 44, R = 8, T = 12, B = 26;
    const s = frame(W, H, label);
    const max = top || niceMax(Math.max(0, ...items.map((d) => d.value)));
    const y = (v) => T + (1 - v / max) * (H - T - B);
    for (let k = 0; k <= 2; k++) {
      const v = (max * k) / 2, yy = y(v);
      s.append(svg('line', { x1: L, x2: W - R, y1: yy.toFixed(1), y2: yy.toFixed(1), stroke: GRID }));
      s.append(text(L - 8, yy + 4, yFmt(v), 'end'));
    }
    const slot = (W - L - R) / items.length, gap = Math.max(2, slot * 0.28), bw = slot - gap;
    items.forEach((d, i) => {
      const x = L + i * slot + gap / 2;
      const g = svg('g', { class: 'hit' });
      g.append(svg('rect', { x: (x - gap / 2).toFixed(1), y: T, width: slot.toFixed(1), height: H - T - B, fill: 'transparent' }));
      if (d.value > 0) {
        const h = Math.max(2, (H - T - B) - (y(d.value) - T));
        g.append(svg('path', { class: 'mark', d: barPath(x, H - B - h, bw, h, 4), fill: LIME }));
      }
      tip(g, d.tip, true);
      s.append(g);
      if (d.label) s.append(text(x + bw / 2, H - 8, d.label));
    });
    return s;
  }

  // Dots in order with a rolling-average line. points: [{ value, tip }], line: [value].
  function trend({ points, line, label, W = 640, H = 220 }) {
    const L = 44, R = 12, T = 14, B = 14;
    const s = frame(W, H, label);
    const all = points.map((p) => p.value);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 10) { const m = (hi + lo) / 2; lo = m - 5; hi = m + 5; }
    lo = Math.floor(lo - 1); hi = Math.ceil(hi + 1);
    const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i / (points.length - 1)) * (W - L - R));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3, yy = y(v);
      s.append(svg('line', { x1: L, x2: W - R, y1: yy.toFixed(1), y2: yy.toFixed(1), stroke: GRID }));
      s.append(text(L - 8, yy + 4, String(Math.round(v)), 'end'));
    }
    if (line && line.length > 1) {
      s.append(svg('polyline', { points: line.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
        fill: 'none', stroke: LIME, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    const hitW = Math.max(24, (W - L - R) / Math.max(points.length, 1));
    points.forEach((p, i) => {
      const g = svg('g', { class: 'hit' });
      g.append(svg('rect', { x: (x(i) - hitW / 2).toFixed(1), y: T - 6, width: hitW.toFixed(1), height: H - T - B + 12, fill: 'transparent' }));
      g.append(svg('circle', { class: 'mark', cx: x(i).toFixed(1), cy: y(p.value).toFixed(1), r: 4, fill: '#16110E', stroke: LIME, 'stroke-width': 2 }));
      tip(g, p.tip, true);
      s.append(g);
    });
    return s;
  }

  // Calendar: one column per week, Monday at the top. days from AdagioStats.calendar.
  // level(day) -> 0..4, tipFor(day) -> string, monthName(date) -> 'Nov'.
  function calendar({ days, level, tipFor, monthName, label }) {
    const weeks = days[days.length - 1].week + 1;
    const C = 18, G = 4, L = 34, T = 20;
    const W = L + weeks * (C + G), H = T + 7 * (C + G);
    const s = frame(W, H, label, 'chart heat');
    ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((d, i) => { if (d) s.append(text(L - 6, T + i * (C + G) + C - 5, d, 'end')); });
    let lastMonth = -1;
    for (const d of days) {
      if (d.weekday === 0 && d.date.getMonth() !== lastMonth) {
        lastMonth = d.date.getMonth();
        if (d.week < weeks - 1) s.append(text(L + d.week * (C + G), 12, monthName(d.date), 'start'));
      }
      if (d.future) continue;
      const r = svg('rect', { class: 'mark', x: L + d.week * (C + G), y: T + d.weekday * (C + G), width: C, height: C, rx: 3, fill: HEAT[level(d)] });
      tip(r, tipFor(d), false);
      s.append(r);
    }
    return s;
  }
  const heatColors = HEAT;

  // Cadence over one run: line, dashed target, and a soft band for "on target".
  function runCadence({ values, target, band, sampleSec, label, W = 640, H = 240 }) {
    const L = 40, R = 12, T = 12, B = 28;
    const s = frame(W, H, label);
    const ext = target != null ? [target - band, target + band] : [];
    let lo = Math.min(...values, ...ext), hi = Math.max(...values, ...ext);
    if (hi - lo < 10) { const m = (hi + lo) / 2; lo = m - 5; hi = m + 5; }
    const x = (i) => L + (i / Math.max(values.length - 1, 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3, yy = y(v);
      s.append(svg('line', { x1: L, x2: W - R, y1: yy.toFixed(1), y2: yy.toFixed(1), stroke: GRID }));
      s.append(text(L - 8, yy + 4, String(Math.round(v)), 'end'));
    }
    const totalMin = ((values.length - 1) * sampleSec) / 60;
    const step = totalMin > 90 ? 30 : totalMin > 40 ? 10 : totalMin > 16 ? 5 : totalMin > 6 ? 2 : 1;
    for (let m = 0; m <= totalMin; m += step) s.append(text(x((m * 60) / sampleSec), H - 8, `${m}m`));
    if (target != null) {
      s.append(svg('rect', { x: L, width: W - L - R, y: y(target + band).toFixed(1), height: (y(target - band) - y(target + band)).toFixed(1), fill: 'rgba(255,255,255,.07)' }));
      s.append(svg('line', { x1: L, x2: W - R, y1: y(target).toFixed(1), y2: y(target).toFixed(1), stroke: 'rgba(255,255,255,.7)', 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
    }
    s.append(svg('polyline', { points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      fill: 'none', stroke: LIME, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // crosshair layer: snaps to the nearest reading
    const hair = svg('line', { y1: T, y2: H - B, stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1, visibility: 'hidden' });
    const dot = svg('circle', { r: 4, fill: LIME, stroke: '#16110E', 'stroke-width': 2, visibility: 'hidden' });
    const hit = svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent', class: 'crosshair' });
    s.append(hair, dot, hit);
    hit.addEventListener('pointermove', (e) => {
      const box = s.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(((px - L) / (W - L - R)) * (values.length - 1))));
      const xx = x(i).toFixed(1);
      hair.setAttribute('x1', xx); hair.setAttribute('x2', xx); hair.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', xx); dot.setAttribute('cy', y(values[i]).toFixed(1)); dot.setAttribute('visibility', 'visible');
      const sec = i * sampleSec;
      hit.setAttribute('data-tip', `${Math.round(values[i])} spm at ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    });
    hit.addEventListener('pointerleave', () => { hair.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
    return s;
  }

  // Histogram of cadence readings. bins: [{ from, to, count }]; inBand(bin) colors on-target bins.
  function histogram({ bins, inBand, tipFor, label, W = 640, H = 180 }) {
    const L = 12, R = 12, T = 10, B = 24;
    const s = frame(W, H, label);
    const max = Math.max(1, ...bins.map((b) => b.count));
    const slot = (W - L - R) / bins.length, gap = Math.min(4, Math.max(2, slot * 0.2)), bw = Math.min(40, Math.max(1, slot - gap));
    s.append(svg('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: GRID }));
    const every = Math.ceil(bins.length / 8);
    bins.forEach((b, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const g = svg('g', { class: 'hit' });
      g.append(svg('rect', { x: (L + i * slot).toFixed(1), y: T, width: slot.toFixed(1), height: H - T - B, fill: 'transparent' }));
      if (b.count > 0) {
        const h = Math.max(2, (b.count / max) * (H - T - B));
        g.append(svg('path', { class: 'mark', d: barPath(x, H - B - h, bw, h, 3), fill: inBand(b) ? LIME : MUTED }));
      }
      tip(g, tipFor(b), false);
      s.append(g);
      if (i % every === 0) s.append(text(x + bw / 2, H - 8, String(b.from)));
    });
    return s;
  }

  // Small sparkline for run cards.
  function sparkline(values, target) {
    const w = 120, h = 36;
    const s = svg('svg', { class: 'spark', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    if (values.length < 2) return s;
    const ext = target != null ? [target] : [];
    let lo = Math.min(...values, ...ext), hi = Math.max(...values, ...ext);
    if (hi - lo < 10) { const m = (hi + lo) / 2; lo = m - 5; hi = m + 5; }
    const y = (v) => (h - 3) - ((v - lo) / (hi - lo)) * (h - 6);
    if (target != null) {
      s.append(svg('line', { x1: 0, x2: w, y1: y(target).toFixed(1), y2: y(target).toFixed(1),
        stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }));
    }
    s.append(svg('polyline', { points: values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      fill: 'none', stroke: LIME, 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
    return s;
  }

  // One shared tooltip for every [data-tip] inside `scope`. Text only.
  function tooltips(scope) {
    const box = document.createElement('div');
    box.className = 'tip';
    box.setAttribute('aria-hidden', 'true');
    box.hidden = true;
    document.body.append(box);
    let current = null;
    function place(x, y) {
      const r = box.getBoundingClientRect();
      let left = x + 14, top = y - r.height - 12;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (left < 8) left = 8;
      if (top < 8) top = y + 18;
      box.style.left = `${Math.round(left)}px`; box.style.top = `${Math.round(top)}px`;
    }
    function showFor(node, x, y) {
      const str = node.getAttribute('data-tip');
      if (!str) return hide();
      if (current && current !== node) current.classList.remove('is-hover');
      current = node; node.classList.add('is-hover');
      if (box.textContent !== str) box.textContent = str;
      box.hidden = false;
      place(x, y);
    }
    function hide() { box.hidden = true; if (current) current.classList.remove('is-hover'); current = null; }
    scope.addEventListener('pointermove', (e) => {
      const node = e.target.closest && e.target.closest('[data-tip]');
      if (node && scope.contains(node)) showFor(node, e.clientX, e.clientY); else hide();
    });
    scope.addEventListener('pointerleave', hide);
    scope.addEventListener('focusin', (e) => {
      const node = e.target.closest && e.target.closest('[data-tip]');
      if (!node) return;
      const r = node.getBoundingClientRect();
      showFor(node, r.left + r.width / 2, r.top);
    });
    scope.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true });
  }

  root.AdagioCharts = { bars, trend, calendar, heatColors, runCadence, histogram, sparkline, tooltips };
})(self);
