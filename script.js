// Adagio
// One tempo runs the page. It starts at 176 steps per minute (the hero runner's cadence).
// Tap your own on the step pad, or turn on the click, and the page keeps your beat: the
// staff's notes bob, "rhythm." pulses, the Step 2 clip runs at your cadence and the watches
// tap along, until you stop it (the pad's button, or "Stop the beat" in the nav).
// Sound is all made here with Web Audio, no audio files: your steps play a kick and a snare, the
// click is a hi-hat, and the staff's notes are a soft marimba (staff.js plays them). Sound only
// ever starts from something you do.

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
  live: false,  // true while the page is keeping the visitor's beat
  next: 0,      // time of the next beat (performance.now ms)
  count: 0,     // beats since load
  get len() { return 60000 / this.bpm; },
  // 0 right on a beat, rising to 1 just before the next one
  phase(now = performance.now()) { return 1 - clamp((this.next - now) / this.len, 0, 1); },
};
const beatListeners = [];
const onBeat = (fn) => beatListeners.push(fn);

/* ======================================================================
   Sound: a small synth. Kept quiet. Nothing plays until the visitor does something.
   ====================================================================== */
const sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, noise = null;
  const ensure = () => {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.4), ctx.sampleRate); // white noise, for the snare and hi-hat
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const env = (g, t, peak, decay, attack = 0.003) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  const tone = (freq, t, peak, decay, dest, type = 'sine', endFreq = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + decay * 0.7);
    env(g, t, peak, decay);
    o.connect(g).connect(dest || master);
    o.start(t); o.stop(t + decay + 0.06);
  };
  const burst = (t, peak, decay, type, freq, dest) => {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    env(g, t, peak, decay, 0.001);
    s.connect(f).connect(g).connect(dest || master);
    s.start(t); s.stop(t + decay + 0.06);
  };
  return {
    muted: false,                 // the pad's "Sound" button: steps and hovered notes
    unlock: ensure,
    time: () => (ensure() ? ctx.currentTime : 0),
    // a channel of its own that can be faded out at once (the page's melody uses one)
    bus() { if (!ensure()) return null; const g = ctx.createGain(); g.connect(master); return g; },
    // a soft marimba note: the fundamental, plus a short bright partial two octaves up
    note(freq, at = 0, dest) { if (!ensure()) return; const t = at || ctx.currentTime; tone(freq, t, 0.5, 0.85, dest); tone(freq * 4, t, 0.1, 0.11, dest); },
    kick() { if (!ensure()) return; tone(150, ctx.currentTime, 0.95, 0.17, null, 'sine', 46); },
    snare() { if (!ensure()) return; const t = ctx.currentTime; burst(t, 0.5, 0.13, 'bandpass', 1900); tone(196, t, 0.22, 0.08, null, 'triangle'); },
    hat(accent) { if (!ensure()) return; burst(ctx.currentTime, accent ? 0.34 : 0.2, accent ? 0.06 : 0.04, 'highpass', 7200); },
  };
})();
window.adagioAudio = sound; // staff.js plays the notes
// the first click, tap or key press readies the audio (silently), so a hovered note can sound afterwards
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => sound.unlock(), { once: true, passive: true }));


// Example songs for the queue preview. Every title and artist here is made up.
// Same-tempo songs cover running cadences; half-time songs (one beat every two steps) sit at half of them.
const SONGS = [
  ['Gravel Hymn', 'Paloma Reyes-Hart', 124], ['Lamplight Laps', 'The Overpass Choir', 130], ['Cotton Weather', 'Juno Vale', 136],
  ['Mile Marker Blue', 'Harbor & Pine', 142], ['Second Lane Over', 'Kit Moreland', 148], ['Easy Breathing', 'Lowfield Radio', 154],
  ['Brickyard Morning', 'Ostrander', 158], ['Split the Wind', 'Talia North', 162], ['Ribbon of Road', 'The Quiet Pacers', 166],
  ['Paper Spikes', 'Fern Arcade', 170], ['Out and Back', 'Milo Ashgrove', 173], ['Bell Lap', 'The Split Times', 176],
  ['Chalk Lines', 'Ivy Calloway', 179], ['Kick at the Bend', 'Saltmarsh', 182], ['Tempo Tuesday', 'Rowan Kade', 186],
  ['Last Four Hundred', 'Neon Orchard', 190], ['Rubber and Rain', 'Dessa Holm', 195], ['Finish Line Static', 'The Bright Intervals', 200],
  ['Overdrive Mile', 'Cass Merriweather', 206], ['Fast Feet Fever', 'Vela Club', 212], ['Sprint Theory', 'Arlo Penhallow', 220],
  ['Slow Burn Sunday', 'Willa Ferro', 62], ['Porchlight', 'Elm & Ember', 66], ['Low Tide Radio', 'Nico Ashby', 70],
  ['Backroad Glow', 'The Hollow Pines', 75], ['Velvet Commute', 'Sunny Marchetti', 79], ['Long Shadows', 'Okoro Wells', 83],
  ['Steady Hands', 'Fable Season', 86], ['Late Train Home', 'Mira Ostrowski', 88], ['Cool Concrete', 'The Pale Dials', 91],
  ['Window Seat', 'Jules Harrow', 95], ['Night Swim', 'Bellweather', 98], ['Golden Hour Loop', 'Rafe Calder', 102],
  ['Easy Does It', 'Linden Ray', 106], ['Wide Awake Avenue', 'The Small Hours', 110],
];
const songsEl = $('[data-songs]');
function showSongs(bpm) {
  if (!songsEl) return;
  const near = (target) => SONGS.slice().sort((a, b) => Math.abs(a[2] - target) - Math.abs(b[2] - target));
  const same = near(bpm).slice(0, 2).map((s) => [...s, '1×']);
  const half = near(bpm / 2).filter((s) => !same.includes(s)).slice(0, 1).map((s) => [...s, '½×']);
  songsEl.innerHTML = [...same, ...half].map(([title, artist, sbpm, match]) =>
    `<li class="song"><span class="song-title">${title}</span><span class="song-artist">${artist}</span>` +
    `<span class="song-bpm"><span class="num">${sbpm}</span> BPM</span><span class="song-match">${match} match</span></li>`).join('');
}

const slider = $('[data-slider]');
function setBPM(value, { align = false } = {}) {
  const bpm = Math.round(clamp(value, 60, 240));
  tempo.bpm = bpm;
  if (align) tempo.next = performance.now() + tempo.len;
  document.documentElement.style.setProperty('--beat', (60 / bpm).toFixed(3) + 's');
  $$('[data-bpm]').forEach((el) => { el.textContent = bpm; });
  $$('[data-bpm-half]').forEach((el) => { el.textContent = Math.round(bpm / 2); });
  showSongs(bpm);
  if (slider && +slider.value !== bpm) slider.value = clamp(bpm, +slider.min, +slider.max);
  if (slider) slider.style.setProperty('--fill', ((slider.value - slider.min) / (slider.max - slider.min) * 100).toFixed(1) + '%');
  document.dispatchEvent(new CustomEvent('adagio:bpm', { detail: bpm })); // the 3D watch face listens
}
window.adagioTempo = tempo; // shared with the 3D models (models.js)
setBPM(176, { align: true });
if (window.adagioIntroT0) tempo.next = window.adagioIntroT0 + tempo.len; // the load sequence counts the same beats
window.adagioOnBeat = onBeat; // the staff bobs its notes on the beat (staff.js)

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

// Keeping the beat. It starts when you tap a cadence or turn on the click, and from then on
// the page follows your tempo. It ends when you stop the click or press "Stop the beat".
const root = document.documentElement;
const beatChip = $('[data-beat-stop]');
const accent = $('.display .accent');
function setLive(on) {
  if (tempo.live === on) return;
  tempo.live = on;
  root.classList.toggle('beating', on);
  if (beatChip) beatChip.hidden = !(on || pagePlaying);
  document.dispatchEvent(new CustomEvent('adagio:live', { detail: on }));
}
let pagePlaying = false; // staff.js is playing the page's melody
if (beatChip) beatChip.addEventListener('click', () => { setClick(false); setLive(false); document.dispatchEvent(new Event('adagio:stop')); });
document.addEventListener('adagio:playing', (e) => { pagePlaying = e.detail; if (beatChip) beatChip.hidden = !(tempo.live || pagePlaying); });
const pulse = (el, scale, ms = 190) => el && el.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' });
onBeat(() => {
  if (!tempo.live || reduceMotion || document.hidden) return;
  if (isOn(accent)) pulse(accent, 1.035);
  pulse(beatChip && beatChip.firstElementChild, 1.7);
});

// Which parts of the page are on screen, so off-screen work costs nothing.
const visible = new Set();
const watcher = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
}) : null;
function watch(el) { if (!el) return; if (watcher) watcher.observe(el); else visible.add(el); }
const isOn = (el) => el && visible.has(el);
watch(accent);

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
// a small footprint: sole and heel, toe pointing the way the runner is heading (left)
const FOOTPRINT = '<svg viewBox="0 0 40 20"><path d="M3 10c0-5 5-8 12-8 6 0 9 2 12 4l-1 8c-3 2-6 4-11 4C8 18 3 15 3 10z"/><ellipse cx="33" cy="10" rx="5.5" ry="6"/></svg>';
function stamp(foot) {
  if (!lane || reduceMotion) return;
  const p = document.createElement('i');
  p.className = `print ${foot}`;
  p.innerHTML = FOOTPRINT;
  lane.appendChild(p);
  const dist = lane.clientWidth + 10;
  p.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dist}px)`, opacity: 0.25 }], { duration: LANE_MS, easing: 'linear' })
    .onfinish = () => p.remove();
}
function step(foot) {
  foot = foot || (lastFoot === 'L' ? 'R' : 'L');
  lastFoot = foot;
  const btn = feetBtns.find((b) => b.dataset.foot === foot);
  if (btn) { btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 110); }
  stamp(foot);
  if (!sound.muted) (foot === 'L' ? sound.kick() : sound.snare()); // left is the kick, right is the snare
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
  if (!reduceMotion) setLive(true);
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

// "Play a click": a hi-hat on every beat (a little louder every fourth), layered over your steps.
// "Sound on / off" mutes the steps' drums and the staff's hovered notes. "Vibrate": a vibration on
// each beat, where the browser supports it (Android).
const soundBtn = $('[data-sound]');
const muteBtn = $('[data-mute]');
const vibeBtn = $('[data-vibe]');
const soundLabel = soundBtn && $('[data-sound-label]', soundBtn);
let clickOn = false;
function setClick(on) {
  if (!soundBtn) return;
  clickOn = on;
  soundBtn.setAttribute('aria-pressed', on);
  soundLabel.textContent = on ? 'Stop the click' : 'Play a click';
  if (on) sound.unlock();
}
if (soundBtn) {
  // pressing it starts the beat for the whole page; pressing it again makes everything still
  soundBtn.addEventListener('click', () => {
    const on = !clickOn;
    setClick(on);
    if (!reduceMotion || !on) setLive(on);
  });
  // the sound stops when you scroll away from the pad (it never starts on its own); the page keeps the beat
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { if (!e.isIntersecting && clickOn) setClick(false); }).observe(pad);
}
onBeat((n) => { if (clickOn) sound.hat(n % 4 === 1); });
if (muteBtn) muteBtn.addEventListener('click', () => {
  sound.muted = !sound.muted;
  muteBtn.setAttribute('aria-pressed', !sound.muted);
  $('[data-mute-label]', muteBtn).textContent = sound.muted ? 'Sound off' : 'Sound on';
});
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
  const ys = [210, 190, 170, 150, 170, 130, 150, 190]; // a little melody on lines and spaces
  const notesG = $('.ts-notes', ts), stepsG = $('.ts-steps', ts), head = $('.ts-head', ts);
  xs.forEach((x, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ts-note');
    g.innerHTML = `<ellipse cx="${x}" cy="${ys[i]}" rx="14" ry="10" transform="rotate(-20 ${x} ${ys[i]})"/><line class="stem" x1="${x + 12}" x2="${x + 12}" y1="${ys[i] - 4}" y2="${ys[i] - 68}"/>`;
    notesG.appendChild(g);
  });
  const tsSteps = xs.map((x, i) => {
    const y = i % 2 ? 274 : 254; // left, right, left, right
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ts-step');
    g.innerHTML = `<ellipse cx="${x}" cy="${y}" rx="13" ry="6.5"/><ellipse cx="${x - 18}" cy="${y}" rx="6" ry="5.5"/>`;
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

// Step 3: one run against its target. A dot travels the cadence line on a loop and the line
// draws in behind it. While the cadence is outside the target band (170, give or take 5) the
// readout says "Speed up"; back inside it says "On target". The phone's screen follows: the
// 3D phone listens for "adagio:cue", and the inline screens cross-fade. With reduced motion
// it rests at the end of the run, on target.
const rv = $('[data-runvis]');
if (rv) {
  const path = $('[data-rv-path]', rv);
  const dot = $('[data-rv-dot]', rv);
  const clip = $('.rv-clip', rv);
  const spmEl = $('[data-rv-spm]', rv);
  const stateEl = $('[data-rv-state]', rv);
  const flip = $('[data-cue-screens]');
  const total = path.getTotalLength();
  const LOOP = 10000, HOLD = 1600;
  const spmAt = (y) => Math.round(150 + (205 - y) / 5.5); // the chart's scale, inverted
  let start = 0, cue = '';
  watch(rv);
  const frame = (now) => {
    if (isOn(rv) || reduceMotion) {
      if (!start) start = now;
      const p = reduceMotion ? 1 : Math.min(1, ((now - start) % (LOOP + HOLD)) / LOOP);
      const pt = path.getPointAtLength(total * p);
      dot.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      clip.setAttribute('width', pt.x.toFixed(1));
      const spm = spmAt(pt.y);
      spmEl.textContent = spm;
      const next = Math.abs(spm - 170) <= 5 ? 'target' : 'speed';
      if (next !== cue) {
        cue = next;
        stateEl.textContent = cue === 'target' ? 'On target' : 'Speed up';
        stateEl.classList.toggle('on', cue === 'target');
        if (flip) flip.classList.toggle('on-target', cue === 'target');
        window.adagioCue = cue;
        document.dispatchEvent(new CustomEvent('adagio:cue', { detail: cue }));
      }
    } else start = 0;
    if (!reduceMotion) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Step 2's phone screen, drawn here (there's no screenshot of matching in the App Store set):
// your cadence, and example songs whose BPM numbers tick into place as they match. The 3D
// phone uses the same drawing as its screen (models.js). Returns true while it's still moving.
function drawSongsScreen(g, W, H, bpm, age) {
  const near = (target) => SONGS.slice().sort((a, b) => Math.abs(a[2] - target) - Math.abs(b[2] - target));
  const same = near(bpm).slice(0, 3).map((s) => [...s, '1×']);
  const half = near(bpm / 2).filter((s) => !same.includes(s)).slice(0, 2).map((s) => [...s, '½×']);
  const rows = [...same, ...half];
  const F = '"Atkinson Hyperlegible", -apple-system, Helvetica, Arial, sans-serif';
  const M = 'ui-monospace, "SF Mono", Menlo, monospace';
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#16110E'; g.textAlign = 'left'; g.font = `700 30px ${F}`; g.fillText('9:41', 56, 64);
  g.textAlign = 'center'; g.font = `700 32px ${F}`; g.fillText('Matching', W / 2, 150);
  // your cadence
  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  g.fillStyle = '#16110E'; rr(32, 196, W - 64, 300, 28); g.fill();
  g.fillStyle = 'rgba(255,255,255,.74)'; g.font = `700 26px ${F}`; g.fillText('Your cadence', W / 2, 256);
  g.fillStyle = '#E8F02A'; g.font = `700 150px ${M}`; g.fillText(String(bpm), W / 2, 400);
  g.fillStyle = '#fff'; g.font = `400 28px ${F}`; g.fillText('steps per minute', W / 2, 456);
  g.textAlign = 'left'; g.fillStyle = 'rgba(22,17,14,.72)'; g.font = `700 24px ${F}`; g.fillText('From your playlist', 40, 566);
  let moving = false;
  rows.forEach(([title, artist, sbpm, match], i) => {
    const y = 596 + i * 124;
    const t = clamp((age - 250 - i * 260) / 700, 0, 1); // each row settles a beat after the one above
    if (t < 1) moving = true;
    const e = 1 - Math.pow(1 - t, 3);
    const shown = Math.round(sbpm + (1 - e) * (i % 2 ? 23 : -19));
    g.fillStyle = 'rgba(22,17,14,.06)'; rr(32, y, W - 64, 108, 20); g.fill();
    g.fillStyle = '#16110E'; g.font = `700 30px ${F}`; g.fillText(title, 56, y + 46);
    g.fillStyle = 'rgba(22,17,14,.72)'; g.font = `400 25px ${F}`; g.fillText(artist, 56, y + 84);
    g.textAlign = 'right';
    g.fillStyle = '#16110E'; g.font = `700 40px ${M}`; g.fillText(String(shown), W - 150, y + 52);
    g.font = `400 22px ${F}`; g.fillStyle = 'rgba(22,17,14,.72)'; g.fillText('BPM', W - 150, y + 84);
    // the match mark arrives when the number settles
    g.fillStyle = t >= 1 ? '#E8F02A' : 'rgba(22,17,14,.08)'; rr(W - 132, y + 28, 76, 52, 26); g.fill();
    if (t >= 1) { g.fillStyle = '#16110E'; g.textAlign = 'center'; g.font = `700 26px ${F}`; g.fillText(match, W - 94, y + 63); }
    g.textAlign = 'left';
  });
  g.textAlign = 'center'; g.fillStyle = 'rgba(22,17,14,.72)'; g.font = `400 23px ${F}`;
  g.fillText('Example songs, made up for this page', W / 2, 596 + rows.length * 124 + 40);
  return moving;
}
window.adagioScreens = { songs: drawSongsScreen };
// the inline copy (phones, tablets, reduced motion): redraws when it comes on screen and when the tempo changes
const songsCanvas = $('canvas[data-screen="songs"]');
if (songsCanvas) {
  const g = songsCanvas.getContext('2d');
  let t0 = 0, raf = 0;
  const draw = (now) => {
    raf = 0;
    const moving = drawSongsScreen(g, songsCanvas.width, songsCanvas.height, tempo.bpm, reduceMotion ? 1e6 : now - t0);
    if (moving && isOn(songsCanvas)) raf = requestAnimationFrame(draw);
  };
  const restart = () => { t0 = performance.now(); if (!raf) raf = requestAnimationFrame(draw); };
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { if (e.isIntersecting) { visible.add(songsCanvas); restart(); } else visible.delete(songsCanvas); }).observe(songsCanvas);
  document.addEventListener('adagio:bpm', () => { if (isOn(songsCanvas)) restart(); });
  if (document.fonts) document.fonts.ready.then(() => { if (isOn(songsCanvas)) restart(); });
}

/* ======================================================================
   Media
   ====================================================================== */
// Hero video: footsteps striking the track, dim behind the copy. It loads after the page
// and its load sequence are done. With reduced motion it stays on its poster frame.
const heroVideo = $('[data-hero-video]');
if (heroVideo && !reduceMotion) {
  const startHero = () => setTimeout(() => { heroVideo.src = heroVideo.dataset.src; heroVideo.play().catch(() => {}); }, 1500);
  if (document.readyState === 'complete') startHero(); else window.addEventListener('load', startHero, { once: true });
  // and it rests while the hero is off screen
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => {
    if (!heroVideo.src) return;
    if (e.isIntersecting) heroVideo.play().catch(() => {}); else heroVideo.pause();
  }).observe(heroVideo);
}

// Lazy video: load a clip once it's near the screen, play it while it's on screen, pause it
// when it isn't. With reduced motion nothing loads and the poster image stays.
function lazyVideo(v, onPlayable) {
  if (!v || reduceMotion || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => {
    if (getComputedStyle(v).display === 'none') return;
    if (e.isIntersecting) {
      if (!v.src) { v.preload = 'auto'; v.src = v.dataset.src; if (onPlayable) v.addEventListener('playing', onPlayable, { once: true }); }
      v.play().catch(() => {});
    } else if (!v.paused) v.pause();
  }, { rootMargin: '200px 0px' }).observe(v);
}

// Step 2: feet striking the track, with a strip of ticks underneath. The clip is slow motion:
// a foot lands every 0.675 s of playback, first at 0.2 s (measured from the footage), which is
// about 176 steps a minute at full speed. The ticks scroll so one crosses the mark on every
// strike. While the page keeps your beat the clip speeds up or slows down so its footstrikes
// land on your beat (the playback rate is steered until the two line up).
const beatClip = $('[data-beat-clip]');
if (beatClip) {
  const v = $('video', beatClip);
  const ticksEl = $('[data-beat-ticks]', beatClip);
  const mark = $('[data-beat-mark]', beatClip);
  const cap = $('[data-beat-cap]', beatClip);
  const STEP = 0.675, FIRST = 0.2, GAP = 64, N = 40, K = 20; // seconds per step, first strike, px between ticks
  ticksEl.innerHTML = Array.from({ length: N }, (_, k) => `<i style="left:${k * GAP}px"></i>`).join('');
  const place = (phase) => {
    const centre = ticksEl.parentElement.clientWidth / 2;
    ticksEl.style.transform = `translateX(${(centre - (K + phase) * GAP).toFixed(1)}px)`;
  };
  place(0); // reduced motion: still ticks, one on the mark
  window.addEventListener('resize', () => place(0));
  lazyVideo(v);
  const caption = () => { cap.textContent = tempo.live ? 'Every footstrike lands on your beat.' : 'Every footstrike lands on a tick.'; };
  document.addEventListener('adagio:live', caption);
  if (!reduceMotion) {
    let lastPhase = 0;
    const frame = () => {
      if (!v.paused && v.readyState >= 2) {
        const phase = ((((v.currentTime - FIRST) / STEP) % 1) + 1) % 1;
        place(phase);
        if (phase < lastPhase) { mark.classList.add('hit'); setTimeout(() => mark.classList.remove('hit'), 120); } // a strike
        lastPhase = phase;
        let rate = 1;
        if (tempo.live) {
          let err = phase - tempo.phase();           // how far the clip's step is ahead of the beat
          err -= Math.round(err);
          rate = clamp((STEP * tempo.bpm / 60) * (1 - 0.8 * err), 0.3, 4);
        }
        if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

// Footer: the track clips play muted while the footer is on screen and pause when it isn't.
$$('.foot-mark video').forEach((v) => lazyVideo(v));

/* ======================================================================
   Pulse Mode cues: each button plays its tap pattern. Phones that can vibrate do
   (Android); everywhere, the 3D watch taps the same pattern (models.js listens).
   ====================================================================== */
const cueNote = $('[data-cue-note]');
const canVibrate = 'vibrate' in navigator && window.matchMedia('(pointer: coarse)').matches;
if (cueNote && canVibrate) cueNote.textContent = 'Press a cue to feel it: your phone vibrates the same pattern.';
$$('.cue').forEach((btn) => btn.addEventListener('click', () => {
  const pattern = btn.dataset.pattern.split(',').map(Number); // on, off, on… in milliseconds
  if (canVibrate) navigator.vibrate(pattern);
  const total = pattern.reduce((a, b) => a + b, 0);
  $$('.cue').forEach((b) => b.classList.toggle('on', b === btn));
  setTimeout(() => btn.classList.remove('on'), Math.max(total, 450));
  document.dispatchEvent(new CustomEvent('adagio:cue-demo', { detail: { cue: btn.dataset.cue, pattern } }));
}));

/* ======================================================================
   Roadmap: a track under stadium lights (styles.css has the three looks).
     flat   phones and tablets: staggered lanes, a row of poles, everything lit
     still  wide screens with reduced motion: the track in perspective, everything lit, nothing moves
     fly    wide screens: the section pins and scrolling runs you down the track. It moves in three
            stops, one per release: the release in focus is at full strength, and the poles beside
            that stretch of track flicker on as you reach it (the stretches behind you stay lit)
   Lengths along the track are in cqh (hundredths of the track view's height).
   The poles stand upright on the screen, as verticals do in a photograph: each is placed where its
   foot falls on the track's perspective, and scaled by how far away that is. The numbers below
   repeat the track's perspective from styles.css (.road3d .road-view and .road3d .track).
   ====================================================================== */
const road = $('[data-roadmap]');
const track = $('[data-track]');
const footReel = $('[data-foot-reel]');
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
if (road && track) {
  const AT = [30, 66, 102], STEP = 27;      // where each release is painted, and how far each stop carries you
  const POLES = [18, 54, 90, 126, 162];     // a pole each side every 36, the last pair beyond the end of the track
  const stretch = (d) => (d < 40 ? 0 : d < 76 ? 1 : 2); // which release a pole stands beside
  const PERSP = 1100, ORIGIN = [0.43, -0.06], TILT = (63 * Math.PI) / 180, TRACK_W = 0.86, OUT = 3; // OUT: how far outside the lane line a pole stands
  const view = $('.road-view', road), lightsEl = $('[data-lights]', road);
  const marks = $$('.lane-mark', track);
  const lights = [];
  POLES.forEach((d, i) => {
    const pool = document.createElement('i');
    pool.className = 'pool';
    pool.style.setProperty('--d', d);
    $('.pools', track).appendChild(pool);
    lights.push({ el: pool, d });
    ['l', 'r'].forEach((side) => {
      const p = document.createElement('i');
      p.className = `pole ${side}`;
      p.innerHTML = `<i class="bank">${'<b></b>'.repeat(8)}</i>`;
      p.style.setProperty('--x', `${(((i + 0.5) / POLES.length) * 100).toFixed(1)}%`); // flat: spread along the top edge
      lightsEl.appendChild(p);
      lights.push({ el: p, d, side });
    });
  });
  const light = (upTo) => lights.forEach((o) => o.el.classList.toggle('lit', stretch(o.d) <= upTo));
  // where each pole's foot falls on screen, and how big the pole is there
  let G = null;
  const setPoles = (run) => {
    if (!G) { const v = view.getBoundingClientRect(); G = { W: v.width, H: v.height, u: v.height / 100 }; }
    const ox = G.W * ORIGIN[0], oy = G.H * ORIGIN[1];
    lights.forEach((o) => {
      if (!o.side) return;
      const d = (o.d - run) * G.u;                          // along the track, from its near edge
      const s = PERSP / (PERSP + d * Math.sin(TILT));       // how much smaller things are at that distance
      const x = o.side === 'l' ? -OUT * G.u : G.W * TRACK_W + OUT * G.u;
      o.el.style.setProperty('--sx', (ox + (x - ox) * s).toFixed(1));
      o.el.style.setProperty('--sb', (G.H - (oy + (G.H - d * Math.cos(TILT) - oy) * s)).toFixed(1));
      o.el.style.setProperty('--s', s.toFixed(4));
      o.el.classList.toggle('gone', o.d - run < 11);        // it's about to pass you: it fades before the screen's edge can cut it
    });
  };
  let mode = '', lit = -2, runNow = 0;
  const layout = () => {
    const next = window.innerWidth < 960 ? 'flat' : reduceMotion ? 'still' : 'fly';
    G = null;
    if (next !== mode) {
      mode = next;
      road.classList.toggle('road3d', mode !== 'flat');
      road.classList.toggle('flyover', mode === 'fly');
      track.style.removeProperty('--run');
      runNow = 0;
      marks.forEach((m) => { m.classList.remove('gone'); m.classList.toggle('now', mode !== 'fly'); });
      lights.forEach((o) => o.el.classList.remove('gone'));
      lit = mode === 'fly' ? -1 : 2;
      light(lit);
      window.dispatchEvent(new Event('adagio:layout')); // the staff re-routes
    }
    if (mode !== 'flat') setPoles(runNow);
  };
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    if (mode === 'fly') {
      const r = road.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) {
        const q = clamp((64 - r.top) / (r.height - (window.innerHeight - 64)), 0, 1);
        runNow = STEP * (smoothstep(0.12, 0.44, q) + smoothstep(0.56, 0.88, q)); // hold, move, hold, move, hold
        track.style.setProperty('--run', runNow.toFixed(2));
        setPoles(runNow);
        const k = Math.round(runNow / STEP);
        const upTo = r.top < window.innerHeight * 0.45 ? k : -1; // the first stretch lights as the track arrives
        if (upTo !== lit) { lit = upTo; light(lit); }
        marks.forEach((m, i) => { m.classList.toggle('now', i === k); m.classList.toggle('gone', AT[i] - runNow < -3); }); // it fades as it reaches your feet
      }
    }
    // footer: the wordmark's letters brighten as the bottom of the page arrives
    const mark = $('.foot-mark');
    if (mark) {
      const fr = mark.getBoundingClientRect();
      if (fr.top < window.innerHeight) mark.style.setProperty('--lift', clamp((window.innerHeight - fr.top) / fr.height, 0, 1).toFixed(3));
    }
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('load', layout);
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
}
if (footReel && reduceMotion) footReel.parentElement.style.setProperty('--lift', '1');

/* ======================================================================
   Footer wordmark: one clip per letter, and no seam inside any letter. Each letter gets a
   layer of its own: its clip, placed on that letter's ink (measured here), under a copy of
   the word with the other letters painted out. styles.css combines the six layers. On a
   desktop, the letter under the pointer comes up to full color.
   ====================================================================== */
const footMark = $('.foot-mark');
const footWord = $('[data-foot-word]');
if (footMark && footReel && footWord) {
  const clips = $$('video', footReel), letters = $$('span', footWord);
  if (clips.length === letters.length) {
    clips.forEach((v, i) => {
      const layer = document.createElement('div');
      layer.className = 'foot-letter';
      const word = footWord.cloneNode(true);
      word.removeAttribute('data-foot-word');
      word.children[i].className = 'on';
      layer.append(v, word);
      footMark.insertBefore(layer, footWord);
    });
    footMark.classList.add('placed');
    const place = () => {
      const box = footMark.getBoundingClientRect();
      if (!box.width) return;
      const size = parseFloat(getComputedStyle(footWord).fontSize);
      const g = document.createElement('canvas').getContext('2d');
      g.font = `900 expanded ${size}px Archivo`;
      const haveFont = document.fonts && document.fonts.check(`900 ${size}px Archivo`);
      letters.forEach((el, i) => { // each clip covers its letter's ink, and a little more
        const r = el.getBoundingClientRect();
        let x0 = r.left, x1 = r.right;
        if (haveFont) { const m = g.measureText(el.textContent); x0 = r.left - m.actualBoundingBoxLeft; x1 = r.left + m.actualBoundingBoxRight; }
        const pad = size * 0.03;
        clips[i].style.left = `${(x0 - pad - box.left).toFixed(1)}px`;
        clips[i].style.width = `${(x1 - x0 + pad * 2).toFixed(1)}px`;
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    if (document.fonts) { document.fonts.ready.then(place); document.fonts.load('900 100px Archivo').then(place, () => {}); }
    if (window.matchMedia('(hover: hover)').matches) letters.forEach((el, i) => {
      el.addEventListener('pointerenter', () => clips[i].classList.add('hot'));
      el.addEventListener('pointerleave', () => clips[i].classList.remove('hot'));
    });
  }
}

/* ======================================================================
   Story: the runner's cut-out (styles.css) loads with its section, on wide screens
   ====================================================================== */
const storyCut = $('[data-story-cut]');
if (storyCut && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { storyCut.classList.add('on'); io.disconnect(); } }, { rootMargin: '700px 0px' });
  io.observe(storyCut.parentElement);
}

/* ======================================================================
   3D (models.js, three.js): fetched only when the first model is about to come on screen
   ====================================================================== */
const modelCanvases = $$('canvas[data-model]');
if (modelCanvases.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    import(`./models.js?v=${window.ADAGIO_V || ''}`).catch(() => root.classList.remove('pin3d'));
  }, { rootMargin: '900px 0px' });
  modelCanvases.forEach((c) => io.observe(c));
}

// Placeholder links (no address yet) don't jump to the top.
$$('a[data-placeholder]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));
$('#year').textContent = new Date().getFullYear();
