// Adagio — "keeps time" edition.
// One tempo runs the page. It starts at 170 steps per minute; tap your own cadence in
// "Try it" (or drag the slider) and every pulse on the page follows: the hero's light
// strands, the live-run beat bar, the nav pill, the footsteps, the haptic rings.

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ======================================================================
   Tempo: the page's clock
   ====================================================================== */
const tempo = {
  bpm: 176,
  next: 0,      // time of the next beat (performance.now ms)
  count: 0,     // beats since load
  get len() { return 60000 / this.bpm; },
  // 0 right on a beat, rising to 1 just before the next one
  phase(now = performance.now()) { return 1 - clamp((this.next - now) / this.len, 0, 1); },
};
const beatListeners = [];
const onBeat = (fn) => beatListeners.push(fn);

function genresFor(bpm) {
  if (bpm < 70) return 'ambient, ballads';
  if (bpm < 90) return 'hip-hop, R&B, reggae';
  if (bpm < 110) return 'funk, soul, boom-bap';
  if (bpm < 130) return 'house, disco, pop';
  if (bpm < 150) return 'techno, pop-rock, punk';
  if (bpm < 170) return 'indie rock, pop-punk';
  if (bpm < 190) return 'drum & bass, pop-punk';
  return 'hardcore, speed punk';
}

const slider = $('[data-slider]');
function setBPM(value, { align = false } = {}) {
  const bpm = Math.round(clamp(value, 60, 240));
  tempo.bpm = bpm;
  if (align) tempo.next = performance.now() + tempo.len;
  document.documentElement.style.setProperty('--beat', (60 / bpm).toFixed(3) + 's');
  $$('[data-bpm]').forEach((el) => { el.textContent = bpm; });
  $$('[data-bpm-half]').forEach((el) => { el.textContent = Math.round(bpm / 2); });
  $$('[data-genre]').forEach((el) => { el.textContent = genresFor(bpm * parseFloat(el.dataset.genre)); });
  if (slider && +slider.value !== bpm) slider.value = clamp(bpm, +slider.min, +slider.max);
  if (slider) slider.style.setProperty('--fill', ((slider.value - slider.min) / (slider.max - slider.min) * 100).toFixed(1) + '%');
  document.dispatchEvent(new CustomEvent('adagio:bpm', { detail: bpm })); // the 3D watch face listens
}
window.adagioTempo = tempo; // shared with the 3D models (models.js)
setBPM(176, { align: true }); // the hero runner's cadence (see HERO_STEP below)

function tick(now) {
  if (now - tempo.next > tempo.len * 2) tempo.next = now; // came back from a hidden tab
  if (now >= tempo.next) {
    tempo.next += tempo.len;
    tempo.count += 1;
    beatListeners.forEach((fn) => fn(tempo.count));
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Which parts of the page are on screen, so off-screen pulses cost nothing.
const visible = new Set();
const watcher = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
}) : null;
function watch(el) { if (!el) return; if (watcher) watcher.observe(el); else visible.add(el); }
const isOn = (el) => el && visible.has(el);

/* ======================================================================
   Beat pulses
   ====================================================================== */
// Up top, only two things keep the beat: the hero's light strands and the live-run beat
// bar. The nav and tag dots stay still so the first screen doesn't flicker all over.

// hero live-run beat bar: one cell per beat, four bars of four
const beatbar = $('[data-beatbar]');
const cells = beatbar ? $$('i', beatbar) : [];
watch(beatbar);
onBeat((n) => {
  if (!isOn(beatbar)) return;
  const k = (n - 1) % cells.length;
  cells.forEach((c, i) => { c.classList.toggle('on', i === k); c.classList.toggle('past', i < k); });
});

// live-run clock ticks along in real seconds
const clock = $('[data-clock]');
let secs = 24 * 60 + 18;
setInterval(() => {
  secs += 1;
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor(secs / 60) % 60).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  if (clock) clock.textContent = `${h}:${m}:${s}`;
}, 1000);

// sparklines: a cadence trace that wobbles around the tempo, scrolling left each beat
const sparks = $$('[data-spark]');
const sparkData = sparks.map(() => Array.from({ length: 28 }, (_, i) => 0.5 + Math.sin(i / 3) * 0.12 + (Math.random() - 0.5) * 0.18));
function drawSpark(poly, data) {
  const w = 200, h = poly.ownerSVGElement.viewBox.baseVal.height;
  poly.setAttribute('points', data.map((v, i) => `${(i / (data.length - 1) * w).toFixed(1)},${(h - v * h).toFixed(1)}`).join(' '));
}
sparks.forEach((p, i) => { drawSpark(p, sparkData[i]); watch(p.ownerSVGElement); });
onBeat((n) => {
  if (n % 2) return;
  sparks.forEach((p, i) => {
    if (!isOn(p.ownerSVGElement)) return;
    const d = sparkData[i];
    const last = d[d.length - 1];
    d.shift();
    d.push(clamp(last + (0.5 - last) * 0.25 + (Math.random() - 0.5) * 0.22, 0.12, 0.92));
    drawSpark(p, d);
  });
});

// stat cards: the services and devices take turns lighting up, one every four beats
const modeSets = $$('[data-modes]').map((el) => ({ el, cells: $$('span', el) }));
modeSets.forEach((m) => watch(m.el));
onBeat((n) => {
  modeSets.forEach(({ el, cells }) => {
    if (!isOn(el)) return;
    const k = Math.floor((n - 1) / 4) % cells.length;
    cells.forEach((c, i) => c.classList.toggle('on', i === k));
  });
});

// haptic mode: a ring leaves the watch on every beat
const rings = $('[data-rings]');
watch(rings);
onBeat(() => {
  if (!isOn(rings) || reduceMotion) return;
  const ring = document.createElement('i');
  ring.className = 'ring';
  rings.appendChild(ring);
  ring.animate([{ scale: 1, opacity: 0.6 }, { scale: 2.6, opacity: 0 }], { duration: 1800, easing: 'cubic-bezier(.2,.7,.2,1)' })
    .onfinish = () => ring.remove();
});

// how it works, 02: the track-staff. Two bars of four beats; a playhead runs along at the
// page tempo, each note hops as it's hit and the footprint under it lights up.
const ts = $('[data-trackstaff]');
if (ts) {
  const NS = 'http://www.w3.org/2000/svg';
  const xs = [110, 165, 220, 275, 355, 410, 465, 520];
  const ys = [153, 138, 123, 108, 123, 93, 108, 138]; // a little melody on lines and spaces
  const notesG = $('.ts-notes', ts), stepsG = $('.ts-steps', ts), head = $('.ts-head', ts);
  const tsNotes = xs.map((x, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ts-note');
    g.innerHTML = `<ellipse cx="${x}" cy="${ys[i]}" rx="11" ry="8" transform="rotate(-20 ${x} ${ys[i]})"/><line class="stem" x1="${x + 9.5}" x2="${x + 9.5}" y1="${ys[i] - 3}" y2="${ys[i] - 52}"/>`;
    notesG.appendChild(g);
    return g;
  });
  const tsSteps = xs.map((x, i) => {
    const y = i % 2 ? 206 : 190; // left, right, left, right
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ts-step');
    g.innerHTML = `<ellipse cx="${x}" cy="${y}" rx="11" ry="5.5"/><ellipse cx="${x - 15}" cy="${y}" rx="5" ry="4.5"/>`;
    stepsG.appendChild(g);
    return g;
  });
  watch(ts);
  let last = 0;
  onBeat((n) => {
    if (!isOn(ts)) return;
    last = (n - 1) % xs.length;
    if (!reduceMotion) tsNotes[last].animate([{ transform: 'translateY(-7px) scale(1.18)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
    tsSteps.forEach((s, i) => s.classList.toggle('on', i === last));
  });
  const playhead = () => {
    if (isOn(ts)) {
      const a = xs[last], b = last === xs.length - 1 ? xs[last] + 55 : xs[last + 1];
      const x = reduceMotion ? a : a + (b - a) * tempo.phase();
      head.setAttribute('x1', x); head.setAttribute('x2', x);
    }
    requestAnimationFrame(playhead);
  };
  requestAnimationFrame(playhead);
}

// how it works, 03: one run, three paces. A runner dot travels the cadence line on a
// loop; the line draws in behind it, each zone lights up as it's entered, that zone's
// songs pop in, and the readout shows the cadence right now. The dot pings on the beat.
const rv = $('[data-runvis]');
if (rv) {
  const path = $('[data-rv-path]', rv);
  const dot = $('[data-rv-dot]', rv);
  const ring = $('.rv-ring', rv);
  const clip = $('.rv-clip', rv);
  const zones = $$('.rv-zone', rv);
  const songs = $$('.rv-song', rv).map((g) => ({ g, at: +g.dataset.at }));
  const spmEl = $('[data-rv-spm]', rv);
  const songEl = $('[data-rv-song]', rv);
  const names = ['warm-up songs', 'tempo songs', 'cool-down songs'];
  const total = path.getTotalLength();
  const LOOP = 9000, HOLD = 1400;
  const spmAt = (y) => Math.round(150 + (200 - y) * (35 / 170)); // the chart's scale, inverted
  let start = 0, zoneNow = -1;
  watch(rv);
  const frame = (now) => {
    if (isOn(rv)) {
      if (!start) start = now;
      const p = reduceMotion ? 1 : Math.min(1, ((now - start) % (LOOP + HOLD)) / LOOP);
      const pt = path.getPointAtLength(total * p);
      dot.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      clip.setAttribute('width', pt.x.toFixed(1));
      spmEl.textContent = spmAt(pt.y);
      const z = pt.x < 190 ? 0 : pt.x < 420 ? 1 : 2;
      if (z !== zoneNow) {
        zoneNow = z;
        zones.forEach((r, i) => r.classList.toggle('on', i === z));
        songEl.textContent = names[z];
      }
      songs.forEach((s) => s.g.classList.toggle('on', pt.x >= s.at));
    } else start = 0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  onBeat(() => {
    if (isOn(rv) && !reduceMotion) ring.animate([{ transform: 'scale(1)', opacity: 0.7 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 700, easing: 'ease-out' });
  });
}

/* ======================================================================
   Hero: light strands (canvas). A bundle of thin lime strands pinches into a
   bright knot and fans out, swaying slowly. Each beat kicks them outward; the
   pointer pushes them aside; scrolling away spreads them apart. Sparks run
   along the strands.
   ====================================================================== */
const hero = $('.hero');
const canvas = $('.strands');
const ctx = canvas && canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, strands = [], sparksOnLine = [], heroOn = true;
const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

function setupStrands() {
  if (!ctx) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = W < 720 ? 20 : 34;
  strands = Array.from({ length: n }, (_, i) => ({
    o: (i / (n - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.08, // place in the bundle, -1..1
    ph: Math.random() * Math.PI * 2,
    sp: 0.6 + Math.random() * 0.7,
    a: 0.35 + Math.random() * 0.65,
  }));
  sparksOnLine = Array.from({ length: W < 720 ? 14 : 26 }, () => ({
    s: Math.floor(Math.random() * n), u: Math.random(), v: 0.0006 + Math.random() * 0.0012, r: 0.8 + Math.random() * 1.6,
  }));
}

function strandY(s, x, t, kick, spreadMul) {
  const knotX = W < 960 ? W * 0.55 : W * 0.6;
  const cy = W < 960 ? H * 0.74 : H * 0.56;
  const d = (x - knotX) / W;                       // distance from the knot, in screen widths
  const fan = 6 + Math.pow(Math.abs(d), 1.25) * H * 1.15 * spreadMul;
  const twist = Math.sin(d * 6 - t * 0.0005 * s.sp + s.ph);
  let y = cy - d * H * 0.42                        // rises to the right
    + Math.sin(d * 3.2 + t * 0.00035) * H * 0.06
    + s.o * fan * (0.62 + 0.38 * twist)
    + s.o * fan * kick * 0.07;
  // pointer pushes strands aside
  const dx = x - mouse.x, dy = y - mouse.y;
  const f = Math.exp(-(dx * dx + dy * dy) / (2 * 110 * 110));
  y += (dy >= 0 ? 1 : -1) * f * 70;
  return y;
}

function drawStrands(now) {
  if (!ctx || !W) return;
  mouse.x += (mouse.tx - mouse.x) * 0.12;
  mouse.y += (mouse.ty - mouse.y) * 0.12;
  const t = reduceMotion ? 0 : now;
  const vk = heroKick(); // locked to the footsteps in the hero video while it plays
  // if the video stalls for a moment, keep pulsing at the same footstep rate
  const kick = reduceMotion ? 0 : (vk !== null ? vk : Math.exp(-(((now / 1000) / HERO_STEP) % 1) * 5));
  const scrolled = clamp(window.scrollY / Math.max(H, 1), 0, 1);
  const spreadMul = 1 + scrolled * 1.6;

  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(166,226,46,0)');
  grad.addColorStop(W < 960 ? 0.2 : 0.3, 'rgba(166,226,46,.12)'); // dim behind the headline copy
  grad.addColorStop(W < 960 ? 0.4 : 0.47, 'rgba(166,226,46,.85)');
  grad.addColorStop(W < 960 ? 0.55 : 0.6, 'rgba(240,246,160,1)');
  grad.addColorStop(0.85, 'rgba(166,226,46,.9)');
  grad.addColorStop(1, 'rgba(166,226,46,0)');
  ctx.strokeStyle = grad;
  const step = W < 720 ? 18 : 14;

  strands.forEach((s) => {
    ctx.beginPath();
    for (let x = -40; x <= W + 40; x += step) {
      const y = strandY(s, x, t, kick, spreadMul);
      if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.04 * s.a * (1 + kick * 0.2);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.globalAlpha = 0.42 * s.a;
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // the knot glows brighter on each beat
  const kx = W < 960 ? W * 0.55 : W * 0.6, ky = strandY({ o: 0, ph: 0, sp: 1 }, kx, t, kick, spreadMul);
  const r = 70 + kick * 14;
  const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, r);
  g.addColorStop(0, `rgba(236,244,120,${0.16 + kick * 0.08})`);
  g.addColorStop(1, 'rgba(166,226,46,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(kx - r, ky - r, r * 2, r * 2);

  // sparks travel along strands
  ctx.fillStyle = 'rgba(244,248,190,1)';
  sparksOnLine.forEach((p) => {
    if (!reduceMotion) p.u += p.v;
    if (p.u > 1) { p.u = 0; p.s = Math.floor(Math.random() * strands.length); }
    const x = p.u * (W + 80) - 40;
    const y = strandY(strands[p.s], x, t, kick, spreadMul);
    ctx.globalAlpha = Math.sin(p.u * Math.PI) * 0.9;
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function strandLoop(now) {
  if (heroOn) drawStrands(now);
  if (!reduceMotion) requestAnimationFrame(strandLoop);
}
if (ctx) {
  setupStrands();
  if (watcher) new IntersectionObserver(([e]) => { heroOn = e.isIntersecting; }).observe(hero);
  requestAnimationFrame(strandLoop);
  hero.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top;
    if (mouse.x < -1000) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
  });
  hero.addEventListener('pointerleave', () => { mouse.tx = mouse.ty = -9999; });
}

/* ======================================================================
   Try it: step pads. Tap left, right, left, right like running in place
   (or press F and J). Every step stamps a print on the lane, which slides
   away like a timeline, so the gaps between prints show your rhythm.
   ====================================================================== */
const pad = $('[data-pad]');
const padStatus = $('[data-pad-status]');
const lane = $('[data-lane]');
const feetBtns = $$('[data-foot]');
const LANE_MS = 3200; // how long a print takes to cross the lane
let taps = [];
let lastFoot = 'R';
function stamp(foot) {
  if (!lane || reduceMotion) return;
  const p = document.createElement('i');
  p.className = `print ${foot}`;
  lane.appendChild(p);
  const dist = lane.clientWidth + 10;
  p.animate([{ transform: 'translateX(0) scale(1.25)', opacity: 1 }, { transform: 'translateX(-14px) scale(1)', opacity: 0.95, offset: 0.04 }, { transform: `translateX(${-dist}px)`, opacity: 0.2 }], { duration: LANE_MS, easing: 'linear' })
    .onfinish = () => p.remove();
}
function step(foot) {
  foot = foot || (lastFoot === 'L' ? 'R' : 'L');
  lastFoot = foot;
  const btn = feetBtns.find((b) => b.dataset.foot === foot);
  if (btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 100); }
  stamp(foot);
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 9) taps.shift();
  if (taps.length < 3) { padStatus.textContent = 'Keep going…'; return; }
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  setBPM(60000 / avg, { align: true });
  padStatus.textContent = taps.length < 5 ? 'Finding your rhythm…' : `Locked in at ${tempo.bpm} spm. The page now runs at your pace.`;
}
if (pad) {
  feetBtns.forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(b.dataset.foot); });
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); step(b.dataset.foot); } });
  });
  // F / J (or the arrow keys, or space) step while the Try it section is on screen
  const play = $('#play');
  watch(play);
  const keyFoot = { f: 'L', j: 'R', ArrowLeft: 'L', ArrowRight: 'R', ' ': null };
  document.addEventListener('keydown', (e) => {
    if (e.repeat || !isOn(play) || !(e.key in keyFoot) || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.key === ' ' && ['BUTTON', 'A'].includes(tag))) return;
    e.preventDefault();
    step(keyFoot[e.key]);
  });
  // the music staff passing through leaves a pair of prints on the lane
  pad.addEventListener('adagio:note-hit', () => { stamp('L'); setTimeout(() => stamp('R'), tempo.len); });
}
if (slider) slider.addEventListener('input', () => { taps = []; setBPM(+slider.value); padStatus.textContent = 'Set with the slider.'; });

// "Hear it": a metronome click on each beat (accent every fourth). "Feel it": a vibration
// on each beat, where the browser supports it (Android).
const soundBtn = $('[data-sound]');
const vibeBtn = $('[data-vibe]');
let audio = null;
function click(n) {
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.frequency.value = n % 4 === 1 ? 1600 : 1050;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(gain).connect(audio.destination);
  osc.start(t); osc.stop(t + 0.06);
}
if (soundBtn) soundBtn.addEventListener('click', () => {
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  soundBtn.setAttribute('aria-pressed', on);
  if (on) { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); }
  else if (audio) audio.suspend();
});
onBeat((n) => { if (soundBtn && soundBtn.getAttribute('aria-pressed') === 'true') click(n); });
if (vibeBtn && 'vibrate' in navigator && window.matchMedia('(pointer: coarse)').matches) {
  vibeBtn.hidden = false;
  vibeBtn.addEventListener('click', () => vibeBtn.setAttribute('aria-pressed', vibeBtn.getAttribute('aria-pressed') !== 'true'));
  onBeat(() => { if (vibeBtn.getAttribute('aria-pressed') === 'true') navigator.vibrate(35); });
}

/* ======================================================================
   Scroll effects
   ====================================================================== */
// text slides in as it enters
const reveals = $$('.reveal');
if (reduceMotion || !watcher) {
  reveals.forEach((el) => el.classList.add('is-in'));
} else {
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); seen.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  reveals.forEach((el) => seen.observe(el));
}

// Some text types itself in as it scrolls into view, as if it's being processed live.
// Leads type letter by letter with a caret; small mono labels "decode" from scrambled
// characters. The untyped rest stays in place (transparent), so nothing shifts, and
// screen readers always get the full text.
const typeTargets = [...new Set([
  ...$$('[data-type]'),
  ...$$('.panel .lead, #accessibility .lead, .contact-sec .lead, .devices-copy .stat-text'),
])];
const decodeTargets = $$('main .tag');
function splitForTyping(el) {
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
  return nodes.map((n) => {
    const on = document.createElement('span');
    const off = document.createElement('span');
    off.className = 't-off';
    off.textContent = n.textContent;
    n.replaceWith(on, off);
    return { on, off, text: n.textContent };
  });
}
function typeIn(parts, msPerChar = 13) {
  const total = parts.reduce((a, p) => a + p.text.length, 0);
  const caret = document.createElement('span');
  caret.className = 't-caret';
  caret.setAttribute('aria-hidden', 'true');
  const start = performance.now();
  const frame = (now) => {
    let left = Math.min(total, Math.floor((now - start) / msPerChar));
    const done = left >= total;
    parts.forEach((p) => {
      const take = Math.max(0, Math.min(p.text.length, left));
      left -= take;
      p.on.textContent = p.text.slice(0, take);
      p.off.textContent = p.text.slice(take);
    });
    const cur = parts.find((p) => p.off.textContent.length) || parts[parts.length - 1];
    cur.on.after(caret);
    if (!done) requestAnimationFrame(frame); else setTimeout(() => caret.remove(), 1200);
  };
  requestAnimationFrame(frame);
}
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·';
function decode(parts, ms = 700) {
  const start = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - start) / ms);
    parts.forEach(({ on, off, text }) => {
      const shown = Math.floor(text.length * p);
      on.textContent = text.slice(0, shown) + [...text.slice(shown)].map((ch) => (ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      off.textContent = '';
    });
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
if (!reduceMotion && watcher) {
  const jobs = new Map();
  // prepare every target up front (untyped text transparent), so nothing flashes before it types
  typeTargets.forEach((el) => {
    el.classList.remove('reveal'); // typing is its own entrance
    el.__parts = splitForTyping(el);
    jobs.set(el, () => typeIn(el.__parts));
  });
  decodeTargets.forEach((el) => { el.__parts = splitForTyping(el); el.__parts.forEach((q) => { q.on.textContent = ''; }); jobs.set(el, () => decode(el.__parts)); });
  const typer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      typer.unobserve(e.target);
      const job = jobs.get(e.target);
      if (job) job();
    });
  }, { threshold: 0.35 });
  jobs.forEach((_, el) => typer.observe(el));
}

// Hero iPhone: cross-fade through the real Adagio screens every few seconds.
const screens = $$('[data-screen]');
if (screens.length > 1 && !reduceMotion) {
  let current = 0;
  setInterval(() => {
    if (document.hidden) return;
    screens[current].classList.remove('on');
    current = (current + 1) % screens.length;
    screens[current].classList.add('on');
  }, 3200);
}

// Hero video: footsteps striking the track, faint behind the copy. Plays muted; with
// reduced motion it stays on its poster frame.
const heroVideo = $('[data-hero-video]');
// The hero's light strands pulse in time with those footsteps. The clip is slow motion:
// a foot lands every 0.675 s of playback (measured from the footage), about 89 a minute on
// screen, which is a real cadence of about 176 steps per minute (the page's start tempo).
const HERO_STEP = 0.675;      // seconds between footstrikes in the clip
const HERO_FIRST_STEP = 0.2;  // when the first one lands
function heroKick() {
  if (!heroVideo || heroVideo.paused || heroVideo.readyState < 2) return null;
  const phase = (((heroVideo.currentTime - HERO_FIRST_STEP) / HERO_STEP) % 1 + 1) % 1;
  return Math.exp(-phase * 5);
}
if (heroVideo) {
  if (reduceMotion) heroVideo.removeAttribute('autoplay');
  else {
    const playHero = () => heroVideo.play().catch(() => {});
    heroVideo.addEventListener('canplay', playHero, { once: true });
    playHero();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && window.scrollY < window.innerHeight) playHero(); });
  }
}

// Finish line: a checkered flag drawn in thin vertical slices, each nudged up or down and
// shaded by a travelling wave so it reads as cloth. Every beat of the page tempo sends a
// fresh ripple through it.
const finish = $('[data-finish]');
if (finish) {
  const cv = $('[data-finish-flag]', finish);
  const ctx = cv.getContext('2d');
  const tile = document.createElement('canvas');
  const tctx = tile.getContext('2d');
  let W = 0, H = 0, dpr = 1, SQ = 24, t0 = performance.now(), kicks = [];
  const paint = () => { // the flat flag, a little taller than the banner so waves never show an edge
    tile.width = W; tile.height = H + 2 * SQ;
    const cols = Math.ceil(W / SQ) + 1, rows = Math.ceil(tile.height / SQ) + 1;
    tctx.fillStyle = '#F4F4EF'; tctx.fillRect(0, 0, tile.width, tile.height);
    tctx.fillStyle = '#0A0A0A';
    for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) if ((r + c2) % 2) tctx.fillRect(c2 * SQ, r * SQ, SQ, SQ);
  };
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(finish.clientWidth * dpr); H = Math.round(finish.clientHeight * dpr);
    SQ = Math.round((finish.clientWidth < 720 ? 20 : 26) * dpr);
    cv.width = W; cv.height = H; paint(); draw(performance.now());
  };
  const draw = (now) => {
    const t = (now - t0) / 1000;
    const strip = Math.max(2, Math.round(2 * dpr));
    kicks = kicks.filter((k) => t - k < 2.2);
    ctx.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x += strip) {
      const u = x / W;
      // a slow breeze plus beat ripples that roll from left to right and fade out
      let wave = Math.sin(u * 7 - t * 0.7) * 0.55 + Math.sin(u * 3.4 - t * 0.4 + 1.2) * 0.45;
      let slope = Math.cos(u * 7 - t * 0.7) * 0.55 + Math.cos(u * 3.4 - t * 0.4 + 1.2) * 0.45;
      kicks.forEach((k) => {
        const age = t - k, front = age * 0.9, d = u - front;
        const env = Math.exp(-d * d * 60) * Math.exp(-age * 1.6);
        wave += Math.sin(d * 30) * env * 0.35; slope += Math.cos(d * 30) * env * 0.35;
      });
      const dy = wave * SQ * 0.12;
      ctx.drawImage(tile, x, 0, strip, tile.height, x, dy - SQ, strip, tile.height);
      const shade = slope * 0.08;
      ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade.toFixed(3)})` : `rgba(0,0,0,${(-shade * 1.6).toFixed(3)})`;
      ctx.fillRect(x, 0, strip, H);
    }
    // a little sag of light along the top and bottom hems
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  size();
  window.addEventListener('resize', size);
  watch(finish);
  if (!reduceMotion) {
    const loop = (now) => { if (isOn(finish) && !document.hidden) draw(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    onBeat(() => { if (isOn(finish)) kicks.push((performance.now() - t0) / 1000); });
  }
}
let lastY = window.scrollY;

// how it works: each panel shrinks and dims a little as the next one covers it;
// panel 03 draws its pace line as it arrives
const panels = $$('.panel');
const pacePath = $('.pace-path');
function stackPanels() {
  if (reduceMotion) return;
  panels.forEach((p, i) => {
    const next = panels[i + 1];
    const inner = $('.panel-in', p);
    if (next) {
      const c = clamp(1 - next.getBoundingClientRect().top / window.innerHeight, 0, 1);
      inner.style.setProperty('--cover', c.toFixed(3));
    }
  });
  if (pacePath) {
    const last = panels[panels.length - 1].getBoundingClientRect();
    pacePath.style.setProperty('--draw', clamp(1 - last.top / window.innerHeight, 0, 1).toFixed(3));
  }
}

// story photo drifts slower than the page
const parallax = $('[data-parallax]');
function runParallax() {
  if (!parallax || reduceMotion) return;
  const r = parallax.parentElement.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
  parallax.style.transform = `translate3d(0, ${(p * -8).toFixed(2)}%, 0) scale(1.05)`;
}

// roadmap: the line draws across and each release lights as it's reached
const road = $('[data-road]');
const nodes = road ? $$('.node', road) : [];
function runRoad() {
  if (!road) return;
  const r = road.getBoundingClientRect();
  const p = reduceMotion ? 1 : clamp((window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.35), 0, 1);
  road.style.setProperty('--p', p.toFixed(3));
  nodes.forEach((n, i) => n.classList.toggle('lit', p >= (i + 0.2) / nodes.length));
}

// 3D phone: sways gently from side to side, does one full spin the first time it comes
// into view (and again whenever you tap it), and leans with scroll and toward the pointer.
const phone = $('.phone3d');
const phoneZone = $('.phone-zone');
let phoneRY = -18, phoneRX = 4, px = 0, py = 0;
let phoneVisible = false, phoneLooping = false, spinStart = -1, spunOnce = false;
const SPIN_MS = 1700;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
function phoneTarget() {
  const b = phoneZone.getBoundingClientRect();
  const p = clamp((window.innerHeight - b.top) / (window.innerHeight + b.height), 0, 1) - 0.5;
  return { ry: -18 + p * 30 + px * 14, rx: 4 - p * 8 - py * 10 };
}
function phoneLoop(now) {
  if (!phoneVisible) { phoneLooping = false; return; }
  const t = phoneTarget();
  const sway = Math.sin(now * 0.0008) * 16; // the gentle side-to-side
  phoneRY += (t.ry + sway - phoneRY) * 0.08;
  phoneRX += (t.rx - phoneRX) * 0.08;
  let spin = 0;
  if (spinStart >= 0) {
    const p = clamp((now - spinStart) / SPIN_MS, 0, 1);
    spin = 360 * easeInOut(p);
    if (p >= 1) spinStart = -1;
  }
  phone.style.setProperty('--ry', (phoneRY + spin).toFixed(2) + 'deg');
  phone.style.setProperty('--rx', phoneRX.toFixed(2) + 'deg');
  requestAnimationFrame(phoneLoop);
}
function queuePhone() {} // the loop above runs on its own while the phone is on screen
if (phone && phoneZone && !reduceMotion) {
  new IntersectionObserver(([e]) => {
    phoneVisible = e.isIntersecting;
    if (phoneVisible && !spunOnce && e.intersectionRatio > 0.5) { spunOnce = true; spinStart = performance.now() + 250; }
    if (phoneVisible && !phoneLooping) { phoneLooping = true; requestAnimationFrame(phoneLoop); }
  }, { threshold: [0, 0.5] }).observe(phoneZone);
  phoneZone.addEventListener('pointermove', (e) => {
    const r = phoneZone.getBoundingClientRect();
    px = (e.clientX - r.left) / r.width - 0.5; py = (e.clientY - r.top) / r.height - 0.5;
  });
  phoneZone.addEventListener('pointerleave', () => { px = py = 0; });
  phoneZone.addEventListener('click', () => { if (spinStart < 0) spinStart = performance.now(); });
  phoneZone.addEventListener('adagio:note-hit', () => { if (spinStart < 0 && spunOnce) spinStart = performance.now(); }); // the music staff passed by
}

// Metronome rail: the dot follows your scroll, resting on a section's tick as that
// section reaches the middle of the screen; its color follows whatever is behind it.
const metronome = $('.metronome');
const metroDot = $('.metro-dot', metronome);
const metroTicks = $$('a', metronome);
const metroSections = metroTicks.map((a) => $(a.hash));
let metroIndex = -1;
function setMetronome() {
  const middle = window.innerHeight / 2;
  metronome.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.6);
  const tops = metroSections.map((s) => s.getBoundingClientRect().top - middle);
  let at = 0;
  tops.forEach((t, k) => { if (t <= 0) at = k; });
  let pos = at;
  if (tops[0] > 0) pos = 0;
  else if (at < tops.length - 1) pos = at + Math.min(1, -tops[at] / (tops[at + 1] - tops[at]));
  metroDot.style.setProperty('--pos', pos.toFixed(3));
  $('ol', metronome).style.setProperty('--p', pos.toFixed(3));
  const behind = document.elementsFromPoint(window.innerWidth - 12, middle).find((el) => !metronome.contains(el));
  const themed = behind && behind.closest('[data-theme]');
  metronome.dataset.theme = themed ? themed.dataset.theme : 'black';
  if (at !== metroIndex) {
    metroIndex = at;
    metroTicks.forEach((a, k) => a.classList.toggle('is-on', k === at));
  }
}

function onScroll() {
  const y = window.scrollY;
  lastY = y;
  stackPanels();
  runParallax();
  runRoad();
  setMetronome();
  queuePhone();
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { setupStrands(); if (reduceMotion) drawStrands(0); onScroll(); });
onScroll();

// The logo jumps straight back to the top.
$('.nav-logo').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'instant' }); });

// Placeholder links (no address yet) don't jump to the top.
$$('a[data-placeholder]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

$('#year').textContent = new Date().getFullYear();

// Footer video mosaic: load and play the clips only while the footer is near the screen.
const reel = $('.foot-reel');
if (reel) {
  const clips = $$('video', reel);
  let reelInView = false;
  const shown = (v) => getComputedStyle(v).display !== 'none';
  const playAll = () => clips.forEach((v) => { if (reelInView && !reduceMotion && shown(v) && v.paused && v.src) v.play().catch(() => {}); });
  clips.forEach((v) => v.addEventListener('canplay', playAll)); // retry once each clip is ready
  document.addEventListener('visibilitychange', () => { if (!document.hidden) playAll(); });
  new IntersectionObserver(([e]) => {
    reelInView = e.isIntersecting;
    clips.forEach((v) => {
      if (!shown(v)) return;
      if (reelInView) {
        if (!v.src) { v.preload = reduceMotion ? 'metadata' : 'auto'; v.src = v.dataset.src; } // reduced motion: a still frame only
      } else if (!v.paused) v.pause();
    });
    playAll();
  }, { rootMargin: '300px 0px' }).observe(reel);
}
