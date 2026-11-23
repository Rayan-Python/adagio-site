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
  // The one rule on top of the original: the staff never crosses running text. A mask cuts it
  // out tightly under each line of body text, captions, labels, small headings, names, emails,
  // links and buttons, so it stops at their edges and carries on past them as the same line.
  // (Big headlines and the 3D models aren't masked: it still weaves over and behind those.)
  const mask = make('mask', { id: 'staff-mask', maskUnits: 'userSpaceOnUse' }, defs);
  // each of these is cut out as one block, tight to its words (paragraphs whole, not line by line)
  const TEXT = [
    'p:not(.headline)', 'figcaption', 'h3', 'dt', 'dd', '.song', '.scale', '.lane-text', 'a', 'button', 'label',
    '.facts li', '.people li', '.device-list', '.contact-actions', 'svg:not(.staff) text', // (not the staff's own notes)
  ].map((s) => `main ${s}`).join(', ');
  // The staff runs behind the text. Where it passes through a letter, the letter itself
  // shows it in the opposite color: the text uses "difference" blending (styles.css).
  const layers = ['dark', 'light'].map((kind) => {
    const g = make('g', { class: `staff-layer ${kind}`, 'clip-path': `url(#staff-clip-${kind})`, mask: 'url(#staff-mask)' }, svg);
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

    // the text mask: one hole per line of text (tight to the words), plus small bridges where
    // lines or paragraphs sit close together, so no little stubs of staff show in between
    const scrollY = window.scrollY;
    const holes = [];
    document.querySelectorAll(TEXT).forEach((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      // the block is the box around its lines of text: as wide as its longest line, no wider
      const rects = [...range.getClientRects()].filter((r) => r.width >= 1 && r.height >= 1);
      const box = rects.length ? rects.reduce((b, r) => ({ left: Math.min(b.left, r.left), right: Math.max(b.right, r.right), top: Math.min(b.top, r.top), bottom: Math.max(b.bottom, r.bottom) }),
        { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }) : el.getBoundingClientRect();
      if (box.right - box.left < 1 || box.bottom - box.top < 1) return;
      holes.push({ x0: box.left - 6, x1: box.right + 6, y0: box.top + scrollY - mainTop - 4, y1: box.bottom + scrollY - mainTop + 4 });
    });
    mask.replaceChildren();
    make('rect', { x: -50, y: 0, width: W + 100, height: H, fill: '#fff' }, mask);
    holes.forEach((h) => make('rect', { x: h.x0, y: h.y0, width: h.x1 - h.x0, height: h.y1 - h.y0, rx: 3, fill: '#000' }, mask));
    const GAP = mobile ? 22 : 30;
    holes.forEach((a, i) => holes.forEach((b, k) => {
      if (k === i) return;
      // b just below a and overlapping it sideways: fill the strip between them
      if (b.y0 > a.y1 - 1 && b.y0 - a.y1 < GAP) {
        const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
        if (x1 - x0 > 8) make('rect', { x: x0, y: a.y1 - 1, width: x1 - x0, height: b.y0 - a.y1 + 2, fill: '#000' }, mask);
      }
      // b just right of a on the same line: fill the gap between them
      if (b.x0 > a.x1 - 1 && b.x0 - a.x1 < GAP) {
        const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
        if (y1 - y0 > 6) make('rect', { x: a.x1 - 1, y: y0, width: b.x0 - a.x1 + 2, height: y1 - y0, fill: '#000' }, mask);
      }
    }));

    // each section gets its own way of moving: where the staff centers, how wide it
    // sways, and how loopy it gets (loops happen when "loop" pushes past the pitch)
    // Where the staff goes in each section: its center (as a share of the width), how far it
    // sways and how loopy it gets. On wide screens the text sits in the left column, so the staff
    // weaves through the right one (over and behind the models, the photo, the charts) and sweeps
    // across the page in the gaps between sections. On phones the text is full width, so it runs
    // in the side gutter and switches sides in the gap between each pair of sections.
    const L = 10 / W, R = 1 - 10 / W;
    const zones = (mobile ? [
      ['#story', R, 0, 0], ['#step-1', L, 0, 0], ['#step-2', R, 0, 0], ['#step-3', L, 0, 0],
      ['#features', R, 0, 0], ['#devices', L, 0, 0], ['#accessibility', R, 0, 0], ['#roadmap', L, 0, 0],
      ['#team', R, 0, 0], ['#contact', L, 0, 0],
    ] : [
      ['#story', 0.78, 0.12, 0.6],
      ['#step-1', 0.75, 0.14, 0.7],
      ['#step-2', 0.82, 0.1, 0.7],     // right of the paragraph, over the clip
      ['#step-3', 0.955, 0.02, 0],     // down the margin past the chart
      ['#features', 0.76, 0.12, 0.6],  // over and behind the phone
      ['.facts', 0.955, 0.02, 0],      // past the three facts in the margin
      ['#devices', 0.76, 0.12, 0.6],   // around the Garmin watch
      ['#accessibility', 0.78, 0.12, 0.7],
      ['#roadmap', 0.75, 0.15, 0.5],
      ['#team', 0.46, 0.03, 0],        // one pass between the names and the school logos
      ['#contact', 0.55, 0.1, 0],
    ]).map(([sel, cx, amp, loop]) => ({ top: docTop(document.querySelector(sel)) - mainTop, cx, amp, loop }));
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
      pts.push({ x: clamp(x, mobile ? 10 : 14, W - (mobile ? 10 : 14)), y: yy, base: y });
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
