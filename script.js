// Adagio
// One tempo runs the page. It starts at 176 steps per minute (the hero runner's cadence);
// tap your own on the step pad (or drag the slider) and everything that keeps time
// follows: the Step 2 playhead, the Step 3 runner, the 3D watch and the click.

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

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
setBPM(176, { align: true });

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

// Which parts of the page are on screen, so off-screen work costs nothing.
const visible = new Set();
const watcher = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
}) : null;
function watch(el) { if (!el) return; if (watcher) watcher.observe(el); else visible.add(el); }
const isOn = (el) => el && visible.has(el);

/* ======================================================================
   Step pad: tap left, right, left, right like running in place (or press F
   and J). Every step stamps a print on the lane, which slides away like a
   timeline, so the gaps between prints show your rhythm.
   ====================================================================== */
const pad = $('[data-pad]');
const padStatus = $('[data-pad-status]');
const lane = $('[data-lane]');
const feetBtns = $$('[data-foot]');
const LANE_MS = 3200; // how long a print takes to cross the lane
let taps = [];
let lastFoot = 'R';

// "Your stride": counts steps, and reads the last 16 gaps between them for how even
// they are (steadiness) and whether the left or right foot lands sooner (balance)
const stride = $('[data-stride]');
const strideBars = stride ? $('[data-stride-bars]', stride) : null;
if (strideBars) strideBars.innerHTML = '<i></i>'.repeat(16);
let strideSteps = 0, strideGaps = []; // [gap ms, foot that landed]
function showStride() {
  if (!stride) return;
  $('[data-stride-steps]', stride).textContent = strideSteps;
  const note = $('[data-stride-note]', stride);
  const bars = $$('i', strideBars);
  if (strideGaps.length < 3) {
    $('[data-stride-steady]', stride).textContent = '–';
    $('[data-stride-balance]', stride).textContent = '–';
    note.textContent = strideSteps ? 'Keep stepping' : 'Waiting for steps';
    bars.forEach((b) => { b.style.height = ''; b.className = ''; });
    return;
  }
  const gaps = strideGaps.map(([g]) => g);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - avg) ** 2, 0) / gaps.length);
  const steady = Math.round(clamp(100 - (sd / avg) * 250, 0, 100));
  $('[data-stride-steady]', stride).textContent = `${steady}%`;
  // a foot that lands after a shorter gap is quicker; split the time between the two
  const side = (f) => { const g = strideGaps.filter(([, ft]) => ft === f).map(([x]) => x); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : avg; };
  const l = side('L'), r = side('R');
  const left = Math.round((l / (l + r)) * 100);
  $('[data-stride-balance]', stride).textContent = `${left} / ${100 - left}`;
  note.textContent = steady >= 85 ? 'Smooth and even.' : steady >= 65 ? 'Pretty steady.' : 'A little uneven.';
  // one bar per step gap, newest on the right; volt when it's close to your average
  const start = 16 - gaps.length;
  bars.forEach((b, i) => {
    const g = gaps[i - start];
    if (g === undefined) { b.style.height = ''; b.className = ''; return; }
    b.style.height = `${clamp(55 + (g / avg - 1) * 260, 14, 100).toFixed(0)}%`; // a slow step stands taller
    b.className = Math.abs(g - avg) / avg < 0.12 ? 'on' : 'off';
  });
}
function stamp(foot) {
  if (!lane || reduceMotion) return;
  const p = document.createElement('i');
  p.className = `print ${foot}`;
  lane.appendChild(p);
  const dist = lane.clientWidth + 10;
  p.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dist}px)`, opacity: 0.25 }], { duration: LANE_MS, easing: 'linear' })
    .onfinish = () => p.remove();
}
function step(foot) {
  foot = foot || (lastFoot === 'L' ? 'R' : 'L');
  lastFoot = foot;
  const btn = feetBtns.find((b) => b.dataset.foot === foot);
  if (btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 100); }
  stamp(foot);
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) { taps = []; strideGaps = []; }
  if (taps.length) strideGaps = strideGaps.concat([[now - taps[taps.length - 1], foot]]).slice(-16);
  strideSteps += 1;
  taps.push(now);
  showStride();
  if (taps.length > 9) taps.shift();
  if (taps.length < 3) { padStatus.textContent = 'Keep going.'; return; }
  const gaps = taps.slice(1).map((t, i) => t - taps[i]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  setBPM(60000 / avg, { align: true });
  padStatus.textContent = taps.length < 5 ? 'Finding your rhythm.' : `Locked in at ${tempo.bpm} steps per minute.`;
}
if (pad) {
  feetBtns.forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(b.dataset.foot); });
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); step(b.dataset.foot); } });
  });
  // F and J (or the arrow keys) step while the pad is on screen
  watch(pad);
  const keyFoot = { f: 'L', j: 'R', F: 'L', J: 'R', ArrowLeft: 'L', ArrowRight: 'R' };
  document.addEventListener('keydown', (e) => {
    if (e.repeat || !isOn(pad) || !(e.key in keyFoot) || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    e.preventDefault();
    step(keyFoot[e.key]);
  });
}
if (slider) slider.addEventListener('input', () => { taps = []; setBPM(+slider.value); padStatus.textContent = 'Set with the slider.'; });

// "Play a click": a metronome click on each beat (accent every fourth). "Vibrate": a
// vibration on each beat, where the browser supports it (Android).
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
   How it works
   ====================================================================== */
// Step 2: the track-staff. Two bars of four beats; a playhead runs along at the page
// tempo, and the footprint under the note it's on lights up.
const ts = $('[data-trackstaff]');
if (ts) {
  const NS = 'http://www.w3.org/2000/svg';
  const xs = [110, 165, 220, 275, 355, 410, 465, 520];
  const ys = [153, 138, 123, 108, 123, 93, 108, 138]; // a little melody on lines and spaces
  const notesG = $('.ts-notes', ts), stepsG = $('.ts-steps', ts), head = $('.ts-head', ts);
  xs.forEach((x, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ts-note');
    g.innerHTML = `<ellipse cx="${x}" cy="${ys[i]}" rx="11" ry="8" transform="rotate(-20 ${x} ${ys[i]})"/><line class="stem" x1="${x + 9.5}" x2="${x + 9.5}" y1="${ys[i] - 3}" y2="${ys[i] - 52}"/>`;
    notesG.appendChild(g);
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
  if (reduceMotion) { tsSteps[0].classList.add('on'); head.setAttribute('x1', xs[0]); head.setAttribute('x2', xs[0]); } // reduced motion: a still frame
  if (!reduceMotion) onBeat((n) => {
    if (!isOn(ts)) return;
    last = (n - 1) % xs.length;
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
  if (!reduceMotion) requestAnimationFrame(playhead);
}

// Step 3: one run, three paces. A runner dot travels the cadence line on a loop; the
// line draws in behind it, each zone lights up as it's entered, that zone's songs come
// in, and the readout shows the cadence right now. With reduced motion it rests at the end.
const rv = $('[data-runvis]');
if (rv) {
  const path = $('[data-rv-path]', rv);
  const dot = $('[data-rv-dot]', rv);
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
    if (isOn(rv) || reduceMotion) {
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
    if (!reduceMotion) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ======================================================================
   Media
   ====================================================================== */
// Hero video: footsteps striking the track, dim behind the copy. With reduced motion it
// stays on its poster frame.
const heroVideo = $('[data-hero-video]');
if (heroVideo && !reduceMotion) {
  const playHero = () => heroVideo.play().catch(() => {});
  heroVideo.addEventListener('canplay', playHero, { once: true });
  playHero();
}

// Footer: still frames from the track clips, loaded only once the footer is near.
const reel = $('.foot-reel');
if (reel && 'IntersectionObserver' in window) {
  const clips = $$('video', reel);
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    clips.forEach((v) => {
      if (getComputedStyle(v).display === 'none') return;
      v.preload = 'metadata';
      v.src = `${v.dataset.src}#t=1`; // a frame one second in
    });
  }, { rootMargin: '400px 0px' });
  io.observe(reel);
}

// Placeholder links (no address yet) don't jump to the top.
$$('a[data-placeholder]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
$('#year').textContent = new Date().getFullYear();
