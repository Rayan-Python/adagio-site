// Adagio — the music staff, the page's signature.
// One continuous five-line staff runs from the top of the page to the Contact section. It starts
// under the nav, crosses the hero between the headline and the step pad (a treble clef, then
// three notes that land in time as the page loads), and then winds down the page through the
// open space of each section, drawn as you scroll, with engraved notes (Noto Music) popping onto
// it as the drawing passes them. It ends with a final barline, like a piece of music.
//
// It is never cut or masked. It runs behind the content, and it's routed: every block of small
// text (paragraphs, captions, labels, lists, buttons, figures) is an obstacle with clear space
// kept around it, and the route is the cheapest smooth path through what's left (route() below).
// Volt over dark sections, rubber over the volt and white ones (two copies, clipped by section).
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const main = document.getElementById('main');
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  const make = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  };

  // engraved glyphs (Unicode musical symbols, drawn with the Noto Music font)
  const CLEF = '\u{1D11E}';
  const GLYPHS = ['\u{1D160}', '♫', '\u{1D15F}', '\u{1D160}', '♫', '\u{1D161}'];
  // sections where the page is volt or white: the staff turns rubber there
  const LIGHT = ['#step-1', '#step-2', '#step-3', '#pulse', '#team', '#contact'];
  // what the staff keeps clear of (each one's box, tight to its words for paragraphs) …
  const HARD = ['p:not(.headline)', 'figure', 'h3', '.facts li', '.people li', '.school', '.device-list', '.cues',
    '.contact-actions', '.app-tray', '.store-badge', '.lane-no', '.lane-text', '.step-inline', '.spike-stage'].map((s) => `main ${s}`).join(', ');
  // … what it avoids when it can (it may pass behind a big headline, never through small text) …
  const SOFT = 'main .display, main .headline';
  // … and the one solid panel it may pass behind when there's no room beside it
  const TUNNEL = '.pad';

  // ---- the SVG: two identical layers, one per color ---------------------------------
  const svg = make('svg', { class: 'staff', 'aria-hidden': 'true' });
  const defs = make('defs', {}, svg);
  const clipDark = make('clipPath', { id: 'staff-clip-dark' }, defs);
  const clipLight = make('clipPath', { id: 'staff-clip-light' }, defs);
  const layers = ['dark', 'light'].map((kind) => {
    const g = make('g', { class: `staff-layer ${kind}`, 'clip-path': `url(#staff-clip-${kind})` }, svg);
    const lines = Array.from({ length: 5 }, () => make('path', { class: 'staff-line' }, g));
    const clef = make('text', { class: 'staff-clef' }, g);
    clef.textContent = CLEF;
    const notesG = make('g', {}, g);
    const end = make('g', { class: 'staff-end' }, g); // the final barline: a thin stroke, then a thick one
    const endThin = make('line', { 'stroke-width': 1.4 }, end), endThick = make('line', {}, end);
    const tip = make('g', { class: 'staff-tip' }, g);
    const tipGlyph = make('text', { 'text-anchor': 'middle' }, tip);
    tipGlyph.textContent = '\u{1D160}';
    return { g, lines, clef, notesG, end, endThin, endThick, tip, tipGlyph, notes: [] };
  });
  main.appendChild(svg);

  // ---- geometry -------------------------------------------------------------------
  let pts = [], cum = [], total = 0, lens = [], noteAt = [], noteY = [], heroNotes = 0, introEnd = 0, clefAt = 0, gap = 7, built = false;
  let debug = null; // last build's obstacles, for the clearance check

  // An element's box in page coordinates. Paragraphs use the box around their lines of text
  // (as wide as the longest line), so a short line in a wide column doesn't block the space beside it.
  function boxOf(el, tight, mainTop) {
    let r = el.getBoundingClientRect();
    if (tight) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((q) => q.width >= 1 && q.height >= 1);
      if (rects.length) r = rects.reduce((b, q) => ({ left: Math.min(b.left, q.left), right: Math.max(b.right, q.right), top: Math.min(b.top, q.top), bottom: Math.max(b.bottom, q.bottom) }),
        { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
    }
    if (r.right - r.left < 1 || r.bottom - r.top < 1) return null;
    const y = window.scrollY - mainTop;
    return { x0: r.left, x1: r.right, y0: r.top + y, y1: r.bottom + y, el };
  }

  // The route. The page below the hero is a grid (a row every few pixels down, a column every few
  // across). Standing on a cell costs: a great deal inside the clear space of small text, something
  // behind a headline or the step pad, a little near the page edge, and a little for being far from
  // where this section would like the staff to be (a slow side-to-side sway through its open half).
  // Moving sideways between rows costs more the steeper it is. The cheapest path from the start to
  // the end is found exactly (dynamic programming), then smoothed into curves; wherever smoothing
  // would cut into the clear space, the exact path is kept.
  function route({ W, y0, y1, xStart, xEnd, hard, soft, tunnels, zones, P }) {
    const { DX, DY, XMIN, half, clear, slack } = P;
    const clearY = P.clearY || clear; // phones: little room beside the text, but plenty asked above and below it
    const C = Math.max(2, Math.floor((W - 2 * XMIN) / DX) + 1), R = Math.max(2, Math.ceil((y1 - y0) / DY) + 1);
    const xOf = (c) => XMIN + c * DX, yOf = (r) => y0 + r * DY;
    const cOf = (x) => clamp(Math.round((x - XMIN) / DX), 0, C - 1), rOf = (y) => clamp(Math.round((y - y0) / DY), 0, R - 1);
    const cost = new Float32Array(R * C);
    // where each section wants it
    const param = (y, k) => {
      let v = zones[0][k];
      for (let i = 1; i < zones.length; i++) v = lerp(v, zones[i][k], smooth(zones[i].top - 150, zones[i].top + 150, y));
      return v;
    };
    for (let r = 0; r < R; r++) {
      const y = yOf(r);
      const want = param(y, 'cx') * W + param(y, 'amp') * W * Math.sin(((y - y0) / P.sway) * Math.PI * 2 + 0.6);
      for (let c = 0; c < C; c++) {
        const x = xOf(c), d = (x - want) / W;
        const edge = Math.max(0, 1 - Math.min(x, W - x) / P.edge);
        cost[r * C + c] = P.pull * d * d + P.edgeCost * edge * edge;
      }
    }
    const paint = (b, grow, fn, growY = grow) => {
      const r0 = rOf(b.y0 - growY), r1 = rOf(b.y1 + growY), c0 = cOf(b.x0 - grow + DX * 0.5), c1 = cOf(b.x1 + grow - DX * 0.5);
      if (b.y1 + growY < y0 || b.y0 - growY > y1 || xOf(c0) > b.x1 + grow || xOf(c1) < b.x0 - grow) return;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cost[r * C + c] = fn(cost[r * C + c], xOf(c));
    };
    tunnels.forEach((b) => paint(b, 0, (v, x) => v + 14 + 0.25 * Math.abs(x - xStart)));
    soft.forEach((b) => paint(b, half + 8, (v) => v + 500));
    hard.forEach((b) => paint(b, half + clear + slack, () => 1e5, half + clearY + slack));

    // cheapest path, row by row
    const K = Math.max(1, Math.round((P.steep * DY) / DX));
    const move = Array.from({ length: 2 * K + 1 }, (_, i) => { const s = ((i - K) * DX) / DY; return P.turn * s * s; });
    let best = new Float32Array(C).fill(Infinity), next = new Float32Array(C);
    const from = new Int8Array(R * C);
    best[cOf(xStart)] = 0;
    for (let r = 1; r < R; r++) {
      for (let c = 0; c < C; c++) {
        let m = Infinity, mk = 0;
        for (let k = -K; k <= K; k++) {
          const p = c - k;
          if (p < 0 || p >= C) continue;
          const v = best[p] + move[k + K];
          if (v < m) { m = v; mk = k; }
        }
        next[c] = m + cost[r * C + c];
        from[r * C + c] = mk;
      }
      [best, next] = [next, best];
    }
    let c = 0, m = Infinity;
    for (let i = 0; i < C; i++) { const v = best[i] + P.turn * 0.02 * Math.abs(xOf(i) - xEnd); if (v < m) { m = v; c = i; } }
    const raw = new Float32Array(R);
    for (let r = R - 1; r >= 0; r--) { raw[r] = xOf(c); c -= from[r * C + c]; }

    // smooth it; keep the exact path wherever the smooth one would come too close to small text
    const tooClose = (x, y, pad, padY = pad) => hard.some((b) => x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - padY && y < b.y1 + padY);
    const blur = (src, hw) => {
      const out = new Float32Array(R);
      for (let r = 0; r < R; r++) {
        let s = 0, n = 0;
        for (let k = -hw; k <= hw; k++) { const q = clamp(r + k, 0, R - 1), w = hw + 1 - Math.abs(k); s += src[q] * w; n += w; }
        out[r] = s / n;
      }
      return out;
    };
    let xs = blur(blur(raw, P.blur), P.blur);
    for (let pass = 0; pass < 3; pass++) {
      const mark = new Uint8Array(R);
      for (let r = 0; r < R; r++) if (tooClose(xs[r], yOf(r), half + clear, half + clearY)) for (let k = -2; k <= 2; k++) mark[clamp(r + k, 0, R - 1)] = 1;
      for (let r = 0; r < R; r++) if (mark[r]) xs[r] = raw[r];
      xs = blur(xs, 1);
    }
    const ease = Math.min(R - 1, P.blur * 2); // leave both ends exactly where the hero's and Contact's turns take over
    for (let r = 0; r <= ease; r++) { xs[r] = lerp(xStart, xs[r], smooth(0, ease, r)); xs[R - 1 - r] = lerp(xEnd, xs[R - 1 - r], smooth(0, ease, r)); }
    return { xs, yOf, R, tooClose };
  }

  function build() {
    const W = document.documentElement.clientWidth;
    const mobile = W < 720, wide = W >= 960;
    // staff size and how much room it asks for, by screen width
    const P = wide ? { DX: 8, DY: 8, XMIN: 30, clear: 32, slack: 14, blur: 7, pull: 520, turn: 6, steep: 4, edge: 120, edgeCost: 60, sway: 1150 }
      : mobile ? { DX: 3, DY: 8, XMIN: 8, clear: 5, clearY: 26, slack: 1, blur: 3, pull: 60, turn: 6, steep: 4, edge: 1, edgeCost: 0, sway: 900 }
        : { DX: 4, DY: 8, XMIN: 14, clear: 10, clearY: 28, slack: 3, blur: 4, pull: 80, turn: 6, steep: 4, edge: 1, edgeCost: 0, sway: 900 };
    gap = wide ? 7 : mobile ? 3.5 : 5;
    P.half = gap * 2;
    const mainTop = docTop(main);
    const H = main.scrollHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = `${H}px`;
    const top = (sel) => { const el = document.querySelector(sel); return el ? docTop(el) - mainTop : 0; };

    // clip regions: light sections get the rubber copy, everything else the volt one
    const light = LIGHT.map((sel) => { const el = document.querySelector(sel); const t = docTop(el) - mainTop; return [t, t + el.offsetHeight]; }).sort((a, b) => a[0] - b[0]);
    clipDark.replaceChildren();
    clipLight.replaceChildren();
    let yy = 0;
    light.forEach(([a, b]) => {
      make('rect', { x: -50, y: yy, width: W + 100, height: Math.max(0, a - yy) }, clipDark);
      make('rect', { x: -50, y: a, width: W + 100, height: b - a }, clipLight);
      yy = b;
    });
    make('rect', { x: -50, y: yy, width: W + 100, height: Math.max(0, H - yy) }, clipDark);

    // obstacles
    const pinned = (el) => el.closest('.pin3d .how-pin, .flyover .road-pin, .pad');
    const hard = [], soft = [], tunnels = [];
    document.querySelectorAll(HARD).forEach((el) => { if (pinned(el)) return; const b = boxOf(el, el.tagName === 'P', mainTop); if (b) hard.push(b); });
    document.querySelectorAll(SOFT).forEach((el) => { if (pinned(el)) return; const b = boxOf(el, true, mainTop); if (b) soft.push(b); });
    document.querySelectorAll(TUNNEL).forEach((el) => { const b = boxOf(el, false, mainTop); if (b) tunnels.push(b); });
    // the pinned roadmap track: its lanes fill the left of the view for the whole section, the staff takes the lane beside it
    const road = document.querySelector('.flyover.roadmap');
    if (road) { const t = docTop(road) - mainTop; hard.push({ x0: -100, x1: W * 0.86 - P.clear, y0: t + 30, y1: t + road.offsetHeight - 30, el: road }); }

    // ---- the hero: down from under the nav, a turn, across the band between the copy and the
    // step pad, and a turn down again. Straight runs and quarter turns, with a slow wave across.
    const copy = boxOf(document.querySelector('.hero-copy'), false, mainTop);
    const pad = tunnels[0];
    const band = (copy.y1 + pad.y0) / 2;
    const r = Math.min(wide ? 52 : 30, (pad.y0 - copy.y1) / 2 - P.half - 4);
    const xL = wide ? clamp(copy.x0 / 2, P.XMIN, 110) : P.XMIN + 1;
    const roomRight = W - pad.x1;
    const xR = wide ? (roomRight >= 2 * (P.half + P.clear) + 24 ? W - roomRight / 2 : pad.x1 - 96) : W - P.XMIN - 1;
    const wave = wide ? 9 : 5;
    const hero = [];
    const push = (x, y) => hero.push({ x, y });
    const yTop = wide ? 34 : 30; // it comes out from under the nav
    for (let y = yTop; y < band - r; y += 3) push(xL, y);
    for (let a = 0; a <= 1.0001; a += 0.06) push(xL + r - r * Math.cos(a * Math.PI / 2), band - r + r * Math.sin(a * Math.PI / 2));
    const runStart = hero.length;
    const span = xR - r - (xL + r);
    for (let x = 3; x < span; x += 3) { const u = x / span; push(xL + r + x, band + wave * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI)); }
    const runEnd = hero.length;
    for (let a = 0; a <= 1.0001; a += 0.06) push(xR - r + r * Math.sin(a * Math.PI / 2), band + r - r * Math.cos(a * Math.PI / 2));

    // ---- the rest of the page ----
    // where each section would like the staff: center (share of the width) and sway. On wide screens
    // the copy sits left, so the staff weaves through the right half (behind the phone, the watches,
    // over the photo); on phones and tablets it keeps to a side gutter and changes sides between sections.
    const L = (P.XMIN + 1) / W, Rt = 1 - L, xr = xR / W;
    const zones = (wide ? [
      ['#top', xr, 0], ['#story', 0.76, 0.1], ['#step-1', 0.72, 0.11], ['#step-2', 0.76, 0.1], ['#step-3', 0.72, 0.11],
      ['#features', 0.74, 0.1], ['.facts', 0.5, 0], ['#devices', 0.75, 0.1], ['#pulse', 0.77, 0.08],
      ['#roadmap', road ? 0.93 : 0.8, road ? 0.012 : 0.04], ['#team', 0.56, 0.02], ['#contact', 0.74, 0.03],
    ] : [
      ['#top', Rt, 0], ['#story', Rt, 0], ['#step-1', L, 0], ['#step-2', Rt, 0], ['#step-3', L, 0], ['#features', Rt, 0],
      ['#devices', L, 0], ['#pulse', Rt, 0], ['#roadmap', L, 0], ['#team', L, 0], ['#contact', L, 0],
    ]).map(([sel, cx, amp]) => ({ top: top(sel), cx, amp }));
    zones[0].top = 0;
    // It ends the way it began: a turn, then a closing phrase across the open space at the top of
    // Contact, finishing on a final barline.
    const cTop = top('#contact');
    const cr = wide ? 44 : 26;
    const yCoda = cTop + (wide ? 62 : 54);
    const xEnd = wide ? Math.round(W * 0.46) : P.XMIN + 1;      // where it comes down into Contact
    const xCoda = wide ? W - copy.x0 : W - P.XMIN - 14;         // where the barline stands
    const yEnd = yCoda - cr;
    zones[zones.length - 1].cx = xEnd / W;
    const y0 = band + r;
    const path = route({ W, y0, y1: yEnd, xStart: xR, xEnd, hard, soft, tunnels, zones, P });

    // flourishes: a full loop where there's open room for one (wide screens)
    const loops = [];
    if (wide) {
      const A = 40, RAD = 60, need = P.half + P.clear;
      // a loop half hidden behind a 3D model reads as a glitch, so the models' stages block loops (not the route)
      const stages = [...document.querySelectorAll('.pin3d .how-pin, .iphone-stage, .watch-stage, .aw-stage, .flyover.roadmap')].map((el) => boxOf(el, false, mainTop)).filter(Boolean);
      [['#story', 0.5], ['#features', 0.74], ['#devices', 0.86], ['#pulse', 0.82], ['#team', 0.08]].forEach(([sel, at]) => {
        const el = document.querySelector(sel);
        const ys = docTop(el) - mainTop + el.offsetHeight * at, ye = ys + Math.PI * 2 * A;
        if (ys < y0 + 100 || ye > yEnd - 100) return;
        const r0 = Math.round((ys - y0) / P.DY), r1 = Math.round((ye - y0) / P.DY);
        let lo = Infinity, hi = -Infinity;
        for (let q = r0; q <= r1; q++) { lo = Math.min(lo, path.xs[q]); hi = Math.max(hi, path.xs[q]); }
        for (const dir of [-1, 1]) {
          const bx0 = dir < 0 ? lo - 2 * RAD : lo, bx1 = dir < 0 ? hi : hi + 2 * RAD;
          const free = bx0 - need > 20 && bx1 + need < W - 20 && !hard.some((b) => bx0 - need < b.x1 && bx1 + need > b.x0 && ys - RAD - need < b.y1 && ye + RAD + need > b.y0)
            && ![...soft, ...stages].some((b) => bx0 - P.half < b.x1 && bx1 + P.half > b.x0 && ys - RAD < b.y1 && ye + RAD > b.y0);
          if (free) { loops.push({ ys, ye, dir, A, RAD }); break; }
        }
      });
    }

    // ---- sample the whole line: hero, then the route (finely, with any loops) ----
    pts = hero.map((p) => ({ x: p.x, y: p.y, base: p.y }));
    introEnd = pts.length - 1;
    const xAt = (y) => { const f = clamp((y - y0) / P.DY, 0, path.R - 1), i = Math.floor(f), t = f - i; // smooth between rows
      const p0 = path.xs[Math.max(i - 1, 0)], p1 = path.xs[i], p2 = path.xs[Math.min(i + 1, path.R - 1)], p3 = path.xs[Math.min(i + 2, path.R - 1)];
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t); };
    for (let y = y0 + 3; y <= yEnd; y += 3) {
      const lp = loops.find((l) => y >= l.ys && y <= l.ye);
      if (!lp) { pts.push({ x: xAt(y), y, base: y }); continue; }
      const th = (y - lp.ys) / lp.A;
      pts.push({ x: xAt(y) + lp.dir * lp.RAD * (1 - Math.cos(th)), y: y + lp.RAD * Math.sin(th), base: y });
    }
    for (let a = 0.06; a <= 1.0001; a += 0.06) pts.push({ x: xEnd + cr - cr * Math.cos(a * Math.PI / 2), y: yEnd + cr * Math.sin(a * Math.PI / 2), base: yEnd + cr * a });
    const codaSpan = xCoda - (xEnd + cr);
    for (let x = 3; x <= codaSpan; x += 3) { const u = x / codaSpan; pts.push({ x: xEnd + cr + x, y: yCoda + (wide ? 7 : 3) * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI), base: yCoda + 40 * u }); }
    for (let i = 1; i < pts.length; i++) pts[i].base = Math.max(pts[i].base, pts[i - 1].base); // for drawing: never goes back

    // running length along the center line; normals point toward the bottom staff line
    cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    total = cum[cum.length - 1];
    const normals = pts.map((p, i) => {
      const a = pts[Math.max(i - 2, 0)], b = pts[Math.min(i + 2, pts.length - 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: -dy / l, y: dx / l };
    });
    const angleAt = (i) => Math.atan2(-normals[i].x, normals[i].y) * 180 / Math.PI; // along the staff

    // the five lines
    const paths = [];
    lens = [];
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * gap;
      let d = '', len = 0, px = 0, py = 0;
      pts.forEach((p, i) => {
        const x = p.x + normals[i].x * off, y = p.y + normals[i].y * off;
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        if (i) len += Math.hypot(x - px, y - py);
        px = x; py = y;
      });
      paths.push(d);
      lens.push(len);
    }

    // treble clef where the staff turns to cross the hero, curled round the G line (second line up)
    const c = Math.min(runStart + 6, pts.length - 1), cp = pts[c], cn = normals[c];
    clefAt = c;
    const clefT = `translate(${(cp.x + cn.x * gap).toFixed(1)} ${(cp.y + cn.y * gap).toFixed(1)}) rotate(${angleAt(c).toFixed(1)})`;

    // notes: three across the hero (they land on the beat as the page loads), then one every so often
    const placed = [];
    noteAt = []; noteY = [];
    const place = (i, n) => {
      const p = pts[i], nm = normals[i];
      const off = (((n * 5) % 7) - 3) * (gap / 2); // -3 … 3 half-steps: lines and spaces
      placed.push({ t: `translate(${(p.x + nm.x * off).toFixed(1)} ${(p.y + nm.y * off).toFixed(1)}) rotate(${angleAt(i).toFixed(1)})`, glyph: GLYPHS[n % GLYPHS.length] });
      noteAt.push(i); noteY.push(p.y);
    };
    let n = 0;
    [0.34, 0.56, 0.78].forEach((u) => place(Math.round(lerp(runStart, runEnd, u)), n++));
    heroNotes = n;
    const spacing = wide ? 230 : 180;
    for (let Ln = cum[introEnd] + spacing * 0.8; Ln < total - 90; Ln += spacing, n++) {
      let i = introEnd;
      while (i < cum.length - 1 && cum[i] < Ln) i++;
      place(i, n);
    }

    // the final barline, square across the end of the staff
    const e = pts.length - 1, en = normals[e], et = { x: en.y, y: -en.x };
    const bar = (back) => ({ x1: (pts[e].x - et.x * back - en.x * gap * 2).toFixed(1), y1: (pts[e].y - et.y * back - en.y * gap * 2).toFixed(1),
      x2: (pts[e].x - et.x * back + en.x * gap * 2).toFixed(1), y2: (pts[e].y - et.y * back + en.y * gap * 2).toFixed(1) });

    const size = gap * 4; // music fonts: one em = four staff spaces
    layers.forEach((Ly) => {
      Ly.lines.forEach((p, k) => { p.setAttribute('d', paths[k]); p.style.strokeDasharray = `${lens[k]} ${lens[k]}`; });
      Ly.clef.setAttribute('transform', clefT);
      Ly.clef.setAttribute('font-size', size.toFixed(1));
      Ly.notesG.replaceChildren();
      Ly.notes = placed.map(({ t, glyph }) => {
        const g = make('g', { transform: t }, Ly.notesG);
        const inner = make('g', { class: 'note' }, g);
        const txt = make('text', { 'font-size': size.toFixed(1), 'text-anchor': 'middle' }, inner);
        txt.textContent = glyph;
        return inner;
      });
      Object.entries(bar(gap * 1.1)).forEach(([k, v]) => Ly.endThin.setAttribute(k, v));
      Object.entries(bar(-gap * 0.1)).forEach(([k, v]) => Ly.endThick.setAttribute(k, v));
      Ly.endThick.setAttribute('stroke-width', (gap * 0.62).toFixed(1));
      Ly.tipGlyph.setAttribute('font-size', (size * 1.15).toFixed(1));
    });
    debug = { hard, soft, tunnels, loops, P, W };
    built = true;
    update();
  }

  // ---- drawing: the load sequence, then as you scroll ---------------------------------
  // On load (once, about 1.4 s): the hero's stretch of staff draws in from under the nav, and its
  // three notes land on beats one, two and three of a 176 BPM count ("rhythm." lands on the
  // fourth, then the step pad rises: styles.css). After that the staff draws as you scroll.
  const BEAT = 60000 / 176;
  const t0 = window.adagioIntroT0 || 0;
  const introOn = () => !reduceMotion && t0 && performance.now() - t0 < BEAT * 4;
  let frame = 0;
  function update() {
    frame = 0;
    if (!built || !pts.length) return;
    const mainTop = docTop(main);
    const target = reduceMotion ? Infinity : window.scrollY + window.innerHeight * 0.62 - mainTop; // reduced motion: fully drawn
    // last point whose base height has been reached (base only ever increases)
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].base <= target) lo = mid; else hi = mid - 1; }
    let i = pts[0].base > target ? -1 : lo;
    const sinceLoad = performance.now() - t0;
    const intro = introOn();
    if (intro) { // the staff takes the first beat and a half to cross the hero
      const k = clamp(sinceLoad / (BEAT * 1.5), 0, 1);
      if (k < 1) i = Math.min(i, Math.round(introEnd * (1 - Math.pow(1 - k, 2.2))));
    }
    const frac = i < 0 ? 0 : cum[i] / total;
    const p = i < 0 ? null : pts[i];
    const q = i < 0 ? null : pts[Math.min(i + 2, pts.length - 1)];
    const done = i >= pts.length - 1;
    layers.forEach((Ly) => {
      Ly.lines.forEach((path, k) => { path.style.strokeDashoffset = (lens[k] * (1 - frac)).toFixed(1); });
      Ly.clef.style.opacity = i >= clefAt ? 1 : 0;
      Ly.notes.forEach((el, k) => el.classList.toggle('on', noteAt[k] <= i && (!intro || k >= heroNotes || sinceLoad >= BEAT * (k + 1))));
      Ly.end.style.opacity = done ? 0.9 : 0;
      if (!p) { Ly.tip.style.opacity = 0; return; }
      const angle = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      Ly.tip.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
      Ly.tip.style.opacity = done || (intro && i >= introEnd) ? 0 : 1;
    });
    if (intro) queue();
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', queue, { passive: true });
  if (t0 && !reduceMotion) setTimeout(queue, BEAT * 4 + 50); // one last pass when the load sequence ends

  // ---- keeping the beat: while the page follows your tempo, the notes on screen bob on each beat ----
  if (window.adagioOnBeat && !reduceMotion) window.adagioOnBeat(() => {
    const tempo = window.adagioTempo;
    if (!tempo || !tempo.live || document.hidden || !built) return;
    const a = window.scrollY - docTop(main) - 60, b = a + window.innerHeight + 120;
    layers.forEach((Ly) => Ly.notes.forEach((el, k) => {
      if (noteY[k] < a || noteY[k] > b || !el.classList.contains('on')) return;
      el.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 210, easing: 'ease-out' });
    }));
  });

  let t = 0;
  const rebuild = () => { clearTimeout(t); t = setTimeout(build, 120); };
  window.addEventListener('resize', rebuild);
  window.addEventListener('load', rebuild);
  window.addEventListener('adagio:layout', rebuild);
  if (document.fonts) document.fonts.ready.then(rebuild);
  if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(main);
  build();

  // A check for whoever edits the page: how close the staff comes to each block of small text.
  // adagioStaffCheck() in the console lists anything nearer than the clear space asked for.
  window.adagioStaffCheck = () => {
    if (!debug) return null;
    const { hard, P } = debug;
    let min = Infinity; const near = new Map();
    pts.forEach((p) => hard.forEach((b) => {
      const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
      const d = Math.hypot(dx, dy) - P.half;
      if (d < min) min = d;
      if (d < P.clear - 1) { const k = b.el; if (!near.has(k) || near.get(k) > d) near.set(k, d); }
    }));
    return { width: debug.W, clearAsked: P.clear, closest: Math.round(min), loops: debug.loops.length, points: pts.length,
      tooClose: [...near].map(([el, d]) => `${Math.round(d)}px ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 28)}"`) };
  };
})();
