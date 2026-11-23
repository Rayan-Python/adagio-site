// Adagio — the music staff.
// A five-line staff winds and loops down the page, drawn as you scroll, starting with a
// treble clef, with engraved notes (Noto Music) popping onto it as the drawing passes
// them and a note riding the tip (two copies of the drawing, each clipped to its sections).
// It's volt over dark sections and rubber over the volt and white ones. It's the page's
// one ambient animation: nothing else reacts to it.
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
  const LIGHT = ['#step-1', '#step-2', '#step-3', '#accessibility', '#team', '#contact'];

  // ---- the SVG: two identical layers, one per color ---------------------------------
  const svg = make('svg', { class: 'staff', 'aria-hidden': 'true' });
  const defs = make('defs', {}, svg);
  const clipDark = make('clipPath', { id: 'staff-clip-dark' }, defs);
  const clipLight = make('clipPath', { id: 'staff-clip-light' }, defs);
  // The staff runs behind the text. Where it passes through a letter, the letter itself
  // shows it in the opposite color: the text uses "difference" blending (styles.css).
  const layers = ['dark', 'light'].map((kind) => {
    const g = make('g', { class: `staff-layer ${kind}`, 'clip-path': `url(#staff-clip-${kind})` }, svg);
    const lines = Array.from({ length: 5 }, () => make('path', { class: 'staff-line' }, g));
    const clef = make('text', { class: 'staff-clef' }, g);
    clef.textContent = CLEF;
    const notesG = make('g', {}, g);
    const tip = make('g', { class: 'staff-tip' }, g);
    const tipGlyph = make('text', { 'text-anchor': 'middle' }, tip);
    tipGlyph.textContent = '\u{1D160}';
    return { g, lines, clef, notesG, tip, tipGlyph, notes: [] };
  });
  main.appendChild(svg);

  // ---- geometry -------------------------------------------------------------------
  let pts = [], cum = [], total = 0, lens = [], noteAt = [], gap = 7, built = false;

  function build() {
    const W = document.documentElement.clientWidth;
    const mobile = W < 720;
    gap = mobile ? 4.5 : 7;
    const mainTop = docTop(main);
    const H = main.scrollHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = `${H}px`;

    // clip regions: light sections get the red copy, everything else the lime one
    const light = LIGHT.map((sel) => {
      const el = document.querySelector(sel);
      const top = docTop(el) - mainTop;
      return [top, top + el.offsetHeight];
    }).sort((a, b) => a[0] - b[0]);
    clipDark.replaceChildren();
    clipLight.replaceChildren();
    let y0 = 0;
    light.forEach(([a, b]) => {
      make('rect', { x: -50, y: y0, width: W + 100, height: Math.max(0, a - y0) }, clipDark);
      make('rect', { x: -50, y: a, width: W + 100, height: b - a }, clipLight);
      y0 = b;
    });
    make('rect', { x: -50, y: y0, width: W + 100, height: Math.max(0, H - y0) }, clipDark);

    // each section gets its own way of moving: where the staff centers, how wide it
    // sways, and how loopy it gets (loops happen when "loop" pushes past the pitch)
    const zones = [
      ['#story', 0.62, 0.26, 0.85],
      ['#step-1', 0.5, 0.36, 0.9],
      ['#step-2', 0.5, 0.38, 1.0],
      ['#step-3', 0.5, 0.36, 0.8],
      ['#features', 0.5, 0.38, 0.8],
      ['#devices', 0.5, 0.3, 0.6],
      ['#accessibility', 0.5, 0.34, 1.0],
      ['#roadmap', 0.5, 0.38, 0.7],
      ['#team', 0.5, 0.36, 0.9],
      ['#contact', 0.5, 0.18, 0.0],
    ].map(([sel, cx, amp, loop]) => ({ top: docTop(document.querySelector(sel)) - mainTop, cx, amp, loop }));
    const param = (y, k) => {
      let v = zones[0][k];
      for (let i = 1; i < zones.length; i++) v = lerp(v, zones[i][k], smooth(zones[i].top - 180, zones[i].top + 180, y));
      return v;
    };

    const start = docTop(document.getElementById('story')) - mainTop + 110;
    const end = docTop(document.getElementById('contact')) - mainTop + 30;
    const A = mobile ? 52 : 82;            // vertical pitch per radian of the loop
    const B = mobile ? 72 : 118;           // loop radius at full loopiness
    const P = mobile ? 900 : 1300;         // period of the big side-to-side sway
    pts = [];
    for (let y = start; y <= end; y += 3) {
      const b = param(y, 'loop') * B;
      const t = (y - start) / A;
      const x = param(y, 'cx') * W + param(y, 'amp') * W * Math.sin(((y - start) / P) * Math.PI * 2 + 0.4) + b * Math.cos(t) - b;
      const yy = y - b * Math.sin(t);
      pts.push({ x: clamp(x, 14, W - 14), y: yy, base: y });
    }

    // running length along the center line; normals point toward the bottom staff line
    cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    total = cum[cum.length - 1];
    const normals = pts.map((p, i) => {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
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

    // treble clef at the start, curled round the G line (second line up)
    const c = 6, cp = pts[c], cn = normals[c];
    const clefT = `translate(${(cp.x + cn.x * gap).toFixed(1)} ${(cp.y + cn.y * gap).toFixed(1)}) rotate(${angleAt(c).toFixed(1)})`;

    // notes every so often, sitting on lines and spaces
    const spacing = mobile ? 170 : 220;
    const placed = [];
    noteAt = [];
    let n = 0;
    for (let L = 120 + gap * 6; L < total - 120; L += spacing, n++) {
      let i = 0;
      while (i < cum.length - 1 && cum[i] < L) i++;
      const p = pts[i], nm = normals[i];
      const step = ((n * 5) % 7) - 3;                   // -3 … 3 half-steps: lines and spaces
      const off = step * (gap / 2);
      placed.push({ t: `translate(${(p.x + nm.x * off).toFixed(1)} ${(p.y + nm.y * off).toFixed(1)}) rotate(${angleAt(i).toFixed(1)})`, glyph: GLYPHS[n % GLYPHS.length] });
      noteAt.push(i);
    }

    const size = gap * 4; // music fonts: one em = four staff spaces
    layers.forEach((L) => {
      L.lines.forEach((p, k) => { p.setAttribute('d', paths[k]); p.style.strokeDasharray = `${lens[k]} ${lens[k]}`; });
      L.clef.setAttribute('transform', clefT);
      L.clef.setAttribute('font-size', size.toFixed(1));
      L.notesG.replaceChildren();
      L.notes = placed.map(({ t, glyph }) => {
        const g = make('g', { transform: t }, L.notesG);
        const inner = make('g', { class: 'note' }, g);
        const txt = make('text', { 'font-size': size.toFixed(1), 'text-anchor': 'middle' }, inner);
        txt.textContent = glyph;
        return inner;
      });
      L.tipGlyph.setAttribute('font-size', (size * 1.15).toFixed(1));
    });
    built = true;
    update();
  }

  // ---- interactions ---------------------------------------------------------------
  // split headlines into words so they can wave
  function splitWords(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const words = [];
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = part;
        frag.appendChild(s);
        words.push(s);
      });
      node.replaceWith(frag);
    });
    return words;
  }
  const heads = []; // headlines no longer wave as the tip passes
  const cards = []; // and nothing lights up: the staff is the only thing moving

  function wave(head) {
    head.words.forEach((w, i) => {
      w.classList.remove('bop');
      void w.offsetWidth; // restart the animation
      w.style.animationDelay = `${i * 45}ms`;
      w.classList.add('bop');
    });
  }

  function interact(tx, ty) {
    heads.forEach((h) => {
      const r = h.el.getBoundingClientRect();
      const inside = ty > r.top - 6 && ty < r.bottom + 6;
      if (inside && h.armed) { h.armed = false; wave(h); }
      else if (ty < r.top - 140 || ty > r.bottom + 140) h.armed = true;
    });
    cards.forEach((el) => {
      const r = el.getBoundingClientRect();
      const hit = tx > r.left - 24 && tx < r.right + 24 && ty > r.top - 24 && ty < r.bottom + 24;
      if (hit === !!el.noteHit) return;
      el.noteHit = hit;
      el.classList.toggle('note-hit', hit);
      if (hit) el.dispatchEvent(new CustomEvent('adagio:note-hit'));
    });
  }

  // ---- drawing as you scroll ------------------------------------------------------
  let frame = 0;
  function update() {
    frame = 0;
    if (!built || !pts.length) return;
    const mainTop = docTop(main);
    const target = reduceMotion ? Infinity : window.scrollY + window.innerHeight * 0.62 - mainTop;
    // last point whose base height has been reached (base only ever increases)
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].base <= target) lo = mid; else hi = mid - 1; }
    const i = pts[0].base > target ? -1 : lo;
    const frac = i < 0 ? 0 : cum[i] / total;
    const p = i < 0 ? null : pts[i];
    const q = i < 0 ? null : pts[Math.min(i + 2, pts.length - 1)];
    layers.forEach((L) => {
      L.lines.forEach((path, k) => { path.style.strokeDashoffset = (lens[k] * (1 - frac)).toFixed(1); });
      L.clef.style.opacity = i > 8 ? 1 : 0;
      L.notes.forEach((el, k) => el.classList.toggle('on', noteAt[k] <= i));
      if (!p) { L.tip.style.opacity = 0; return; }
      const angle = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      L.tip.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
      L.tip.style.opacity = i >= pts.length - 1 ? 0 : 1;
    });
    if (p && !reduceMotion) interact(p.x, p.y + mainTop - window.scrollY);
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', queue, { passive: true });

  let t = 0;
  const rebuild = () => { clearTimeout(t); t = setTimeout(build, 120); };
  window.addEventListener('resize', rebuild);
  window.addEventListener('load', rebuild);
  if (document.fonts) document.fonts.ready.then(rebuild);
  if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(main);
  build();
})();
