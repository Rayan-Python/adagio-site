// Adagio — the music staff, the page's signature.
// One continuous five-line staff runs from the top of the page to the Contact section. It starts
// under the nav, crosses the hero between the headline and the step pad (a treble clef, then
// three notes that land in time as the page loads), and then winds down the page through the
// open space of each section. It draws itself as you scroll: a lead note rides the tip of the
// line, about two thirds of the way down the screen, and the engraved notes (Noto Music) pop
// onto the staff as the tip passes them.
// It ends in Contact like a piece of music: a last note under a fermata, a final barline.
//
// It is never cut or masked. It runs behind the content, and it's routed: every block of small
// text (paragraphs, captions, labels, lists, buttons, figures) is an obstacle with clear space
// kept around it, and the route is the cheapest smooth path through what's left (route() below).
// Volt over dark sections, rubber over the volt and white ones (two copies, clipped by section).
//
// Its notes are a real tune. Read in order from the clef they play an original sixteen-note
// phrase (each note sits on the line or space of its pitch). Hover over a note, or tap it, and it
// sounds; "Play the page" at the final barline plays them all, start to finish, at your cadence.
// In the story section the staff circles the runner in the photo, passing behind him and then in
// front, like a ribbon.
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
  const QUARTER = '\u{1D15F}', EIGHTH = '\u{1D160}', FERMATA = '\u{1D110}';
  // The tune: [place on the staff, length in beats]. Places count the staff's lines and spaces
  // from its middle line (B, with the treble clef): 1 is the space below (A), -1 the space above
  // (C), and so on. It keeps to C, D, E, G and A, so any stretch of it sounds settled, and the
  // page's last note is always C, held under a fermata.
  const PHRASE = [[2, 1], [1, 0.5], [-1, 0.5], [-2, 1], [-3, 1], [-2, 0.5], [-1, 0.5], [1, 1],
    [2, 1], [4, 0.5], [2, 0.5], [1, 1], [-1, 1], [-2, 0.5], [-1, 0.5], [1, 1]];
  const PITCH = { '-4': 698.46, '-3': 659.25, '-2': 587.33, '-1': 523.25, 0: 493.88, 1: 440, 2: 392, 3: 349.23, 4: 329.63 }; // F5 … E4, in Hz
  // the runner in the story photo (assets/hero.webp, 1696 x 960): his hips, and the size of the loop around them
  const RUNNER = { x: 0.787, y: 0.458, rx: 0.078, ry: 0.056 };
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
    const live = Array.from({ length: 5 }, () => make('path', { class: 'staff-line' }, g)); // from the long lines' end to the tip
    const clef = make('text', { class: 'staff-clef' }, g);
    clef.textContent = CLEF;
    const notesG = make('g', {}, g);
    const end = make('g', { class: 'staff-end' }, g); // the final barline: a thin stroke, then a thick one
    const endThin = make('line', { 'stroke-width': 1.4 }, end), endThick = make('line', {}, end);
    const fermata = make('text', { class: 'staff-clef', 'text-anchor': 'middle' }, g); // over the last note
    fermata.textContent = FERMATA;
    const tip = make('g', { class: 'staff-tip' }, g);
    const tipGlyph = make('text', { 'text-anchor': 'middle' }, tip);
    tipGlyph.textContent = EIGHTH;
    const playhead = make('line', { class: 'staff-playhead' }, g); // rides the staff while the page plays
    return { g, lines, live, clef, notesG, end, endThin, endThick, fermata, tip, tipGlyph, playhead, notes: [] };
  });
  main.appendChild(svg);
  // the half of the story loop that passes in front of the runner: drawn again on a layer above his cut-out
  const front = make('svg', { class: 'staff-front', 'aria-hidden': 'true' });
  const frontLines = Array.from({ length: 5 }, () => make('path', { class: 'staff-line' }, front));
  main.appendChild(front);
  // an invisible target over every note, above the page, so notes can be hovered and tapped
  const hits = document.createElement('div');
  hits.className = 'staff-hits';
  hits.setAttribute('aria-hidden', 'true');
  main.appendChild(hits);

  // ---- geometry -------------------------------------------------------------------
  let pts = [], normals = [], cum = [], total = 0, lens = [], noteAt = [], noteY = [], tune = [], heroNotes = 0, introEnd = 0, clefAt = 0, gap = 7, built = false;
  let frontAt = null, frontLens = []; // the stretch of the line that the front layer repeats
  let lineRun = [];                   // each of the five lines' length up to every point
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
  function route({ W, y0, y1, xStart, xEnd, hard, soft, tunnels, zones, pins = [], P }) {
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
    pins.forEach((pin) => { for (let r = rOf(pin.y0); r <= rOf(pin.y1); r++) for (let c = 0; c < C; c++) cost[r * C + c] += 3 * Math.abs(xOf(c) - pin.x); });
    tunnels.forEach((b) => paint(b, 0, (v, x) => v + 14 + 0.25 * Math.abs(x - xStart)));
    tunnels.forEach((b) => [b.x0, b.x1].forEach((edge) => paint({ x0: edge - half - 26, x1: edge + half + 26, y0: b.y0, y1: b.y1 }, 0, (v) => v + 220))); // not flush along the pad's edge
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
    [svg, front].forEach((el) => { el.setAttribute('viewBox', `0 0 ${W} ${H}`); el.style.height = `${H}px`; });
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
    const road = document.querySelector('.roadmap.road3d');
    if (road) { // pinned: the whole section; not pinned (reduced motion): just the track's view
      const fly = road.classList.contains('flyover'), box = fly ? road : road.querySelector('.road-view');
      const t = docTop(box) - mainTop, inset = fly ? 30 : -P.clear;
      hard.push({ x0: -100, x1: W * 0.86 - P.clear, y0: t + inset, y1: t + box.offsetHeight - inset, el: road });
    }

    // ---- the hero: down from under the nav, a turn, across the band between the copy and the
    // step pad, and a turn down again. Straight runs and quarter turns, with a slow wave across.
    const copy = boxOf(document.querySelector('.hero-copy'), false, mainTop);
    const pad = tunnels[0];
    const band = (copy.y1 + pad.y0) / 2;
    const r = Math.min(wide ? 52 : 30, (pad.y0 - copy.y1) / 2 - P.half - 4);
    const xL = wide ? clamp(copy.x0 / 2, P.XMIN, 110) : P.XMIN + 1;
    const roomRight = W - pad.x1;
    const xR = wide ? (roomRight >= 2 * (P.half + P.clear) + 24 ? W - roomRight / 2 : pad.x1 - 96) : W - P.XMIN - 1;
    const wave = clamp((pad.y0 - copy.y1) / 2 - P.half - (wide ? 26 : 12), 2, wide ? 9 : 5); // a slow wave, as far as the band has room for
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
    // Story: the staff circles the runner. The photo is fitted "cover" and anchored at 70% 50%, so
    // his place on the page is worked out the same way. The staff comes down on his right, swings
    // left in front of his legs, comes back behind his body and carries on down: one flat loop
    // around his hips. It's only done where there's room for it clear of the text.
    let orbit = null;
    const story = document.getElementById('story');
    if (wide && story) {
      const sTop = docTop(story) - mainTop, sH = story.offsetHeight;
      const k = Math.max(W / 1696, sH / 960), iw = 1696 * k, ih = 960 * k;
      const cx = (W - iw) * 0.7 + RUNNER.x * iw, cy = sTop + (sH - ih) * 0.5 + RUNNER.y * ih;
      const rx = RUNNER.rx * iw, ry = RUNNER.ry * ih, A = 8, need = P.half + P.clear;
      const xb = cx + rx; // where the staff comes down
      const free = xb + P.half < W - 16 && !hard.some((b) => cx - rx - need < b.x1 && xb + need > b.x0 && cy - ry - need < b.y1 && cy + ry + need > b.y0);
      if (free) orbit = { ys: cy - Math.PI * A, ye: cy + Math.PI * A, dir: -1, A, RX: rx, RY: ry, xb };
    }
    const zones = (wide ? [
      ['#top', xr, 0], ['#story', orbit ? orbit.xb / W : 0.76, orbit ? 0 : 0.1], ['#step-1', 0.72, 0.11], ['#step-2', 0.76, 0.1], ['#step-3', 0.72, 0.11],
      ['#features', 0.74, 0.1], ['.facts', 0.5, 0], ['#devices', 0.75, 0.1], ['#pulse', 0.77, 0.08],
      ['#roadmap', road ? 0.93 : 0.8, road ? 0.012 : 0.04], ['#team', 0.52, 0.01], ['#contact', 0.74, 0.03],
    ] : [
      ['#top', Rt, 0], ['#story', Rt, 0], ['#step-1', L, 0], ['#step-2', Rt, 0], ['#step-3', L, 0], ['#features', Rt, 0],
      ['#devices', L, 0], ['#pulse', Rt, 0], ['#roadmap', L, 0], ['#team', L, 0], ['#contact', L, 0],
    ]).map(([sel, cx, amp]) => ({ top: top(sel), cx, amp }));
    zones[0].top = 0;
    // It ends the way it began: a turn, then a closing phrase across the open space at the top of
    // Contact, finishing on a final barline that stops just short of the "Play the page" button,
    // on the button's own line.
    const cTop = top('#contact');
    const cr = wide ? 44 : 26;
    const playBox = document.querySelector('[data-play-page]') && boxOf(document.querySelector('[data-play-page]'), false, mainTop);
    const yCoda = playBox ? (playBox.y0 + playBox.y1) / 2 : cTop + 62;
    const xEnd = wide ? Math.round(W * 0.46) : P.XMIN + 1;                          // where it comes down into Contact
    const xCoda = playBox ? playBox.x0 - (wide ? 20 : 12) : W - copy.x0;            // where the barline stands
    const yEnd = yCoda - cr;
    zones[zones.length - 1].cx = xEnd / W;
    const y0 = band + r;
    const pins = orbit ? [{ y0: orbit.ys - 90, y1: orbit.ye + 90, x: orbit.xb }] : [];
    const path = route({ W, y0, y1: yEnd, xStart: xR, xEnd, hard, soft, tunnels, zones, pins, P });

    // ---- sample the whole line: hero, then the route (finely, with the turn around the runner) ----
    pts = hero.map((p) => ({ x: p.x, y: p.y, base: p.y }));
    introEnd = pts.length - 1;
    const xAt = (y) => { const f = clamp((y - y0) / P.DY, 0, path.R - 1), i = Math.floor(f), t = f - i; // smooth between rows
      const p0 = path.xs[Math.max(i - 1, 0)], p1 = path.xs[i], p2 = path.xs[Math.min(i + 1, path.R - 1)], p3 = path.xs[Math.min(i + 2, path.R - 1)];
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t); };
    frontAt = null;
    for (let y = y0 + 3; y <= yEnd; y += 3) {
      if (orbit && y >= orbit.ys && y < orbit.ys + 3) { // around the runner, by angle
        const x0 = xAt(orbit.ys), i0 = pts.length;
        for (let th = 0; th <= Math.PI * 2; th += 0.035) {
          const yb = orbit.ys + orbit.A * th;
          pts.push({ x: x0 + orbit.dir * orbit.RX * (1 - Math.cos(th)), y: yb + orbit.RY * Math.sin(th), base: yb });
        }
        const n = pts.length - i0;
        frontAt = [i0 + Math.round(n * 0.03), i0 + Math.round(n * 0.485)]; // the first half of the turn passes in front of him
        y = orbit.ye;
        continue;
      }
      pts.push({ x: xAt(y), y, base: y });
    }
    for (let a = 0.06; a <= 1.0001; a += 0.06) pts.push({ x: xEnd + cr - cr * Math.cos(a * Math.PI / 2), y: yEnd + cr * Math.sin(a * Math.PI / 2), base: yEnd + cr * a });
    const codaSpan = xCoda - (xEnd + cr);
    for (let x = 3; x <= codaSpan; x += 3) { const u = x / codaSpan; pts.push({ x: xEnd + cr + x, y: yCoda + (wide ? 7 : 3) * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI), base: yCoda + 40 * u }); }
    for (let i = 1; i < pts.length; i++) pts[i].base = Math.max(pts[i].base, pts[i - 1].base); // for drawing: never goes back

    // running length along the center line; normals point toward the bottom staff line
    cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    total = cum[cum.length - 1];
    normals = pts.map((p, i) => {
      const a = pts[Math.max(i - 2, 0)], b = pts[Math.min(i + 2, pts.length - 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: -dy / l, y: dx / l };
    });
    const angleAt = (i) => Math.atan2(-normals[i].x, normals[i].y) * 180 / Math.PI; // along the staff

    // the five lines
    const paths = [];
    lens = []; lineRun = [];
    for (let k = 0; k < 5; k++) {
      const off = (k - 2) * gap;
      const run = new Float32Array(pts.length);
      let d = '', len = 0, px = 0, py = 0;
      pts.forEach((p, i) => {
        const x = p.x + normals[i].x * off, y = p.y + normals[i].y * off;
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        if (i) len += Math.hypot(x - px, y - py);
        run[i] = len;
        px = x; py = y;
      });
      paths.push(d);
      lens.push(len);
      lineRun.push(run);
    }
    frontLens = [];
    frontLines.forEach((line, k) => {
      if (!frontAt) { line.setAttribute('d', ''); return; }
      const off = (k - 2) * gap;
      let d = '', len = 0, px = 0, py = 0;
      for (let i = frontAt[0]; i <= frontAt[1]; i++) {
        const x = pts[i].x + normals[i].x * off, y = pts[i].y + normals[i].y * off;
        d += `${i > frontAt[0] ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        if (i > frontAt[0]) len += Math.hypot(x - px, y - py);
        px = x; py = y;
      }
      line.setAttribute('d', d);
      line.style.strokeDasharray = `${len} ${len}`;
      frontLens.push(len);
    });

    // treble clef where the staff turns to cross the hero, curled round the G line (second line up)
    const c = Math.min(runStart + 6, pts.length - 1), cp = pts[c], cn = normals[c];
    clefAt = c;
    const clefT = `translate(${(cp.x + cn.x * gap).toFixed(1)} ${(cp.y + cn.y * gap).toFixed(1)}) rotate(${angleAt(c).toFixed(1)})`;

    // notes: three across the hero (they land on the beat as the page loads), one every so often
    // down the page, and a last one just before the final barline. Each takes the next note of the
    // tune and sits on that pitch's line or space.
    const placed = [];
    noteAt = []; noteY = []; tune = [];
    const place = (i, n, last) => {
      const [step, beats] = last ? [-1, 1] : PHRASE[n % PHRASE.length];
      const p = pts[i], nm = normals[i], off = step * (gap / 2);
      placed.push({ x: p.x + nm.x * off, y: p.y + nm.y * off, t: `translate(${(p.x + nm.x * off).toFixed(1)} ${(p.y + nm.y * off).toFixed(1)}) rotate(${angleAt(i).toFixed(1)})`, glyph: beats < 1 ? EIGHTH : QUARTER });
      noteAt.push(i); noteY.push(p.y); tune.push({ hz: PITCH[step], beats });
    };
    const indexAt = (len) => { let i = 0; while (i < cum.length - 1 && cum[i] < len) i++; return i; };
    let n = 0;
    [0.34, 0.56, 0.78].forEach((u) => place(Math.round(lerp(runStart, runEnd, u)), n++));
    heroNotes = n;
    const spacing = wide ? 230 : 180, lastLen = total - gap * 7;
    for (let Ln = cum[introEnd] + spacing * 0.8; Ln < lastLen - spacing * 0.6; Ln += spacing, n++) place(indexAt(Ln), n);
    const lastAt = indexAt(lastLen);
    place(lastAt, n, true);
    // the fermata sits over that last note, above the staff
    const fp = pts[lastAt], fn = normals[lastAt];
    const fermataT = `translate(${(fp.x - fn.x * gap * 3.3).toFixed(1)} ${(fp.y - fn.y * gap * 3.3).toFixed(1)}) rotate(${angleAt(lastAt).toFixed(1)})`;

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
      Ly.fermata.setAttribute('transform', fermataT);
      Ly.fermata.setAttribute('font-size', size.toFixed(1));
      Ly.tipGlyph.setAttribute('font-size', (size * 1.15).toFixed(1));
    });
    // a target over each note (not the ones hidden behind the step pad)
    hits.replaceChildren();
    placed.forEach(({ x, y }, k) => {
      if (tunnels.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) return;
      const el = document.createElement('i');
      el.dataset.k = k;
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
      hits.appendChild(el);
    });
    debug = { hard, soft, tunnels, P, W };
    built = true;
    lastDrawn = -2; lastTip = -2; lastFront = -1; // new geometry: redraw the lines
    mainTopAt = mainTop;
    update();
  }

  // ---- drawing: the load sequence, then as you scroll ---------------------------------
  // The line follows your scrolling: it is drawn as far as a point two thirds of the way down the
  // screen, with a lead note riding its tip, and each note pops on as the tip passes it. (Reduced
  // motion: the whole line is drawn and nothing moves.)
  // To keep scrolling smooth, the page-tall lines themselves only advance in steps of a fifth of a
  // screen, so they repaint every ~150px of scrolling, not every frame. The stretch between their
  // end and the tip is a short line of its own ("live"), redrawn each frame: a small repaint.
  // On load (once, about 1.4 s): the hero's stretch of staff draws in from under the nav, and its
  // three notes land on beats one, two and three of a 176 BPM count ("rhythm." lands on the
  // fourth, then the step pad rises: styles.css). After that the staff draws as you scroll.
  const BEAT = 60000 / 176;
  const t0 = window.adagioIntroT0 || 0;
  const introOn = () => !reduceMotion && t0 && performance.now() - t0 < BEAT * 4;
  let frame = 0, lastDrawn = -2, lastTip = -2, lastFront = -1, mainTopAt = 0; // mainTopAt: where the page's main block starts, measured when the staff is built
  function update() {
    frame = 0;
    if (!built || !pts.length) return;
    const mainTop = mainTopAt; // measured at build: reading it here would make the browser lay the page out on every scroll frame
    const target = reduceMotion ? Infinity : window.scrollY - mainTop + window.innerHeight * 0.66; // reduced motion: fully drawn
    // last point whose base height has been reached (base only ever increases)
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].base <= target) lo = mid; else hi = mid - 1; }
    let i = Math.max(lo, introEnd); // the hero's stretch is always drawn, the rest as you scroll
    const sinceLoad = performance.now() - t0;
    const intro = introOn();
    if (intro) { // the staff takes the first beat and a half to cross the hero
      const k = clamp(sinceLoad / (BEAT * 1.5), 0, 1);
      if (k < 1) i = Math.min(i, Math.round(introEnd * (1 - Math.pow(1 - k, 2.2))));
    }
    const p = i < 0 ? null : pts[i];
    const q = i < 0 ? null : pts[Math.min(i + 2, pts.length - 1)];
    const done = i >= pts.length - 1;
    // where the long lines stop: the last fifth-of-a-screen step at or before the tip
    let c = i;
    if (!intro && !reduceMotion && !done) {
      const drawStep = window.innerHeight * 0.2, stop = Math.floor(target / drawStep) * drawStep;
      let a = 0, b = i;
      while (a < b) { const mid = (a + b + 1) >> 1; if (pts[mid].base <= stop) a = mid; else b = mid - 1; }
      c = Math.max(Math.min(a, i), Math.min(introEnd, i));
    }
    const redraw = c !== lastDrawn;            // only touch the long lines when their end actually moves
    const moved = redraw || i !== lastTip;     // the tip moved: redraw the short live stretch
    lastDrawn = c; lastTip = i;
    let liveD = null;
    if (moved) liveD = [0, 1, 2, 3, 4].map((k) => {
      if (i <= c) return '';
      const off = (k - 2) * gap;
      let d = '';
      for (let j = c; j <= i; j++) d += `${j > c ? 'L' : 'M'}${(pts[j].x + normals[j].x * off).toFixed(1)} ${(pts[j].y + normals[j].y * off).toFixed(1)}`;
      return d;
    });
    layers.forEach((Ly) => {
      if (redraw) Ly.lines.forEach((path, k) => { path.style.strokeDashoffset = (lens[k] - lineRun[k][Math.max(c, 0)]).toFixed(1); });
      if (moved) Ly.live.forEach((path, k) => path.setAttribute('d', liveD[k]));
      Ly.clef.style.opacity = i >= clefAt ? 1 : 0;
      Ly.notes.forEach((el, k) => el.classList.toggle('on', noteAt[k] <= i && (k >= heroNotes || !intro || sinceLoad >= BEAT * (k + 1))));
      Ly.end.style.opacity = done ? 0.9 : 0;
      Ly.fermata.style.opacity = i >= noteAt[noteAt.length - 1] ? 1 : 0;
      if (!p) { Ly.tip.style.opacity = 0; return; }
      const angle = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      Ly.tip.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
      Ly.tip.style.opacity = done || (intro && i >= introEnd) ? 0 : 1; // the lead note rides the tip until the line reaches its final barline
    });
    if (frontAt) { // the front half of the story loop keeps pace with the tip
      const f = clamp((i - frontAt[0]) / (frontAt[1] - frontAt[0]), 0, 1);
      if (f !== lastFront) { lastFront = f; frontLines.forEach((line, k) => { line.style.strokeDashoffset = (frontLens[k] * (1 - f)).toFixed(1); }); }
    }
    if (intro) queue();
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', queue, { passive: true });
  if (t0 && !reduceMotion) setTimeout(queue, BEAT * 4 + 50); // one last pass when the load sequence ends

  // ---- notes that move and sound -------------------------------------------------------
  const audio = () => window.adagioAudio;
  const isOn = (k) => layers[0].notes[k] && layers[0].notes[k].classList.contains('on');
  const bounce = (k, scale = 1.3, ms = 210) => {
    if (reduceMotion) return;
    layers.forEach((Ly) => Ly.notes[k] && Ly.notes[k].animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' }));
  };
  // keeping the beat: while the page follows your tempo, the notes on screen bob on each beat
  if (window.adagioOnBeat && !reduceMotion) window.adagioOnBeat(() => {
    const tempo = window.adagioTempo;
    if (!tempo || !tempo.live || document.hidden || !built || playing) return;
    const a = window.scrollY - docTop(main) - 60, b = a + window.innerHeight + 120;
    noteY.forEach((y, k) => { if (y >= a && y <= b && isOn(k)) bounce(k); });
  });
  // a note sounds when you tap it, or move the mouse onto it (not when the page scrolls it under a
  // resting pointer). The pad's "Sound off" silences it; it still bounces.
  let lastMove = 0;
  window.addEventListener('pointermove', (e) => { if (e.movementX || e.movementY) lastMove = performance.now(); }, { passive: true });
  const sing = (k) => {
    if (!isOn(k) || playing) return;
    const a = audio();
    if (a && !a.muted) a.note(tune[k].hz);
    bounce(k, 1.45, 260);
  };
  hits.addEventListener('pointerover', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k !== undefined && e.pointerType === 'mouse' && performance.now() - lastMove < 150) sing(+k); });
  hits.addEventListener('pointerdown', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k !== undefined && e.pointerType !== 'mouse') sing(+k); });
  hits.addEventListener('click', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k !== undefined) sing(+k); });

  // ---- "Play the page": the whole tune, first note to last, at your cadence ----------------
  // The notes are scheduled on the audio clock, so the rhythm is exact. On screen, the page glides
  // back to the first note and follows a playhead down the staff, each note bouncing as it sounds,
  // ending back here at the final barline. Scrolling, Escape, "Stop the beat" or the button stops it.
  // With reduced motion the tune plays and nothing moves.
  const playBtn = document.querySelector('[data-play-page]');
  const playLabel = playBtn && playBtn.querySelector('[data-play-label]');
  let playing = null;
  const setPlayhead = (i) => layers.forEach((Ly) => {
    const p = pts[i], nm = normals[i], r = gap * 3.1;
    Ly.playhead.setAttribute('x1', (p.x - nm.x * r).toFixed(1)); Ly.playhead.setAttribute('y1', (p.y - nm.y * r).toFixed(1));
    Ly.playhead.setAttribute('x2', (p.x + nm.x * r).toFixed(1)); Ly.playhead.setAttribute('y2', (p.y + nm.y * r).toFixed(1));
    Ly.playhead.classList.add('on');
  });
  function stopPage() {
    if (!playing) return;
    const { bus, raf, timer, cancel } = playing;
    playing = null;
    cancelAnimationFrame(raf); clearTimeout(timer);
    if (bus) { try { bus.gain.setTargetAtTime(0, audio().time(), 0.04); } catch {} setTimeout(() => bus.disconnect(), 500); }
    ['wheel', 'touchmove', 'keydown'].forEach((ev) => window.removeEventListener(ev, cancel));
    layers.forEach((Ly) => Ly.playhead.classList.remove('on'));
    playBtn.setAttribute('aria-pressed', 'false');
    playLabel.textContent = 'Play the page';
    document.dispatchEvent(new CustomEvent('adagio:playing', { detail: false }));
  }
  function playPage() {
    const a = audio();
    if (!a || !built || !tune.length) return;
    const bus = a.bus();
    if (!bus) return;
    const beat = 60 / ((window.adagioTempo && window.adagioTempo.bpm) || 176);
    const starts = [];
    let len = 0;
    tune.forEach((nt) => { starts.push(len); len += nt.beats * beat; });
    const lead = reduceMotion ? 0.2 : 1; // time to glide back to the first note
    const t0 = a.time() + lead;
    tune.forEach((nt, k) => a.note(nt.hz, t0 + starts[k], bus));
    const total = len + beat * 2.5; // the last note rings on under its fermata
    const cancel = (e) => { if (e.type !== 'keydown' || ['Escape', ' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) stopPage(); };
    playing = { bus, raf: 0, timer: setTimeout(stopPage, (lead + total) * 1000 + 200), cancel };
    ['wheel', 'touchmove', 'keydown'].forEach((ev) => window.addEventListener(ev, cancel, { passive: true }));
    playBtn.setAttribute('aria-pressed', 'true');
    playLabel.textContent = 'Stop';
    document.dispatchEvent(new CustomEvent('adagio:playing', { detail: true }));
    if (reduceMotion) return;
    const mainTop = docTop(main), from = window.scrollY, began = performance.now();
    const viewFor = (i) => clamp(pts[i].y + mainTop - window.innerHeight * 0.5, 0, document.documentElement.scrollHeight - window.innerHeight);
    document.documentElement.style.scrollBehavior = 'auto';
    let lastK = -1, y = from;
    const frame = (now) => {
      if (!playing) { document.documentElement.style.scrollBehavior = ''; return; }
      const el = (now - began) / 1000 - lead;
      if (el < 0) { // the glide back to the start
        const u = 1 + el / lead, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        y = lerp(from, viewFor(noteAt[0]), e);
      } else {
        let k = lastK < 0 ? 0 : lastK;
        while (k < tune.length - 1 && starts[k + 1] <= el) k++;
        if (k !== lastK) { lastK = k; bounce(k, 1.5, 260); }
        const next = k < tune.length - 1 ? noteAt[k + 1] : noteAt[k];
        const f = clamp((el - starts[k]) / (tune[k].beats * beat), 0, 1);
        const i = Math.round(lerp(noteAt[k], next, f));
        setPlayhead(i);
        y = lerp(y, viewFor(i), 0.18); // follow, without jumping around the turns
      }
      window.scrollTo(0, y);
      playing.raf = requestAnimationFrame(frame);
    };
    playing.raf = requestAnimationFrame(frame);
  }
  if (playBtn) {
    playBtn.addEventListener('click', () => (playing ? stopPage() : playPage()));
    document.addEventListener('adagio:stop', stopPage);
    // with reduced motion nothing follows the tune, so it stops if you scroll its button away
    if (reduceMotion && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => { if (!e.isIntersecting) stopPage(); }).observe(playBtn);
  }

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
    return { width: debug.W, clearAsked: P.clear, closest: Math.round(min), orbit: !!frontAt, notes: noteAt.length, points: pts.length,
      tooClose: [...near].map(([el, d]) => `${Math.round(d)}px ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 28)}"`) };
  };
})();
