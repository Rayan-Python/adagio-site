// Adagio, version 2 (experimental): an app promo you scroll through.
// One 3D stage sits behind the page. A phone stays on it the whole way and moves between scenes
// as you scroll; a track spike, an Apple Watch and a Garmin watch come on for their scenes.
// The page keeps a beat (176 a minute until you tap your own): lime rings spread from the
// phone on each one, the headline's last word pulses, the shoe lands on one, the watch taps.
// Along the foot of the screen a music staff doubles as the progress bar: each scene is a note.
import { THREE, makeStage, buildIPhone, buildAppleWatch, buildWatch, buildRunway } from './v2-models.js?v=1';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- the beat */
const tempo = {
  bpm: 176, next: performance.now(), count: 0, live: true,
  get len() { return 60000 / this.bpm; },
  phase(now = performance.now()) { return 1 - clamp((this.next - now) / this.len, 0, 1); },
};
window.adagioTempo = tempo; // the models read the page tempo from here
const beatFns = [];
function setBPM(v) {
  tempo.bpm = Math.round(clamp(v, 120, 240));
  $$('[data-bpm]').forEach((el) => { el.textContent = tempo.bpm; });
  document.dispatchEvent(new CustomEvent('adagio:bpm', { detail: tempo.bpm }));
  showSongs();
}

/* ---------------------------------------------------------------- sound (off until asked for) */
const soundBtn = $('[data-sound]');
let ctx = null, soundOn = false;
const TUNE = [392, 440, 523.25, 587.33, 659.25, 587.33, 523.25, 523.25]; // one note per scene: G A C D E D C C
function blip(freq, peak, decay, type = 'sine') {
  if (!ctx || !soundOn) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + decay + 0.05);
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  if (soundOn) { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); }
  soundBtn.setAttribute('aria-pressed', soundOn);
  $('[data-sound-label]').textContent = soundOn ? 'Sound on' : 'Sound off';
});
beatFns.push((n) => blip(n % 4 === 1 ? 1500 : 1000, 0.05, 0.05)); // a quiet click on the beat

/* ---------------------------------------------------------------- scenes and scroll */
const scenes = $$('[data-scene]');
const N = scenes.length;
let P = 0, sceneNow = -1; // P: 0 at the first scene, N - 1 at the last
function readScroll() {
  const mid = window.innerHeight * 0.5;
  let p = 0;
  scenes.forEach((el, i) => { if (i < N - 1) { const r = el.getBoundingClientRect(); p += clamp((mid - r.top - r.height * 0.5) / r.height, 0, 1); } });
  P = p;
  const k = Math.round(P);
  if (k !== sceneNow) {
    sceneNow = k;
    scenes.forEach((el, i) => el.classList.toggle('on', i === k));
    marks.forEach((m, i) => m.classList.toggle('on', i <= k));
    blip(TUNE[k % TUNE.length], 0.16, 0.7); // each scene sounds its note
  }
  runner.style.left = `${(P / (N - 1)) * 100}%`;
  doneLines.forEach((l) => l.setAttribute('x2', ((P / (N - 1)) * 1000).toFixed(1)));
}

// the score: five lines, a note for each scene, and the runner's mark
const score = $('[data-score]');
const NS = 'http://www.w3.org/2000/svg';
const doneLines = [];
[12, 20, 28, 36, 44].forEach((y) => {
  const base = document.createElementNS(NS, 'line');
  base.setAttribute('x1', 0); base.setAttribute('x2', 1000); base.setAttribute('y1', y); base.setAttribute('y2', y);
  const done = base.cloneNode();
  done.setAttribute('class', 'done'); done.setAttribute('x2', 0);
  score.append(base, done);
  doneLines.push(done);
});
const marksEl = document.createElement('div');
marksEl.className = 'score-marks';
const STEPS = [36, 28, 20, 12, 4, 12, 20, 20]; // where each scene's note sits on the staff (the same tune)
const marks = scenes.map((_, i) => {
  const m = document.createElement('span');
  m.className = 'mark';
  m.style.left = `${(i / (N - 1)) * 100}%`;
  m.innerHTML = `<i style="top:${STEPS[i % STEPS.length] - 20}px">${i % 2 ? '\u{1D160}' : '\u{1D15F}'}</i>`;
  marksEl.appendChild(m);
  return m;
});
const runner = document.createElement('span');
runner.className = 'runner';
marksEl.appendChild(runner);
score.parentElement.appendChild(marksEl);

/* ---------------------------------------------------------------- tap your beat */
let taps = [];
$('[data-tap]').addEventListener('pointerdown', () => {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 6) taps.shift();
  blip(180, 0.3, 0.12);
  if (taps.length >= 3) {
    const gaps = taps.slice(1).map((t, i) => t - taps[i]);
    setBPM(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    tempo.next = now + tempo.len;
  }
});

/* ---------------------------------------------------------------- example songs (made up) */
const SONGS = [['Gravel Hymn', 'Paloma Reyes-Hart', 124], ['Cotton Weather', 'Juno Vale', 136], ['Second Lane Over', 'Kit Moreland', 148], ['Brickyard Morning', 'Ostrander', 158],
  ['Ribbon of Road', 'The Quiet Pacers', 166], ['Out and Back', 'Milo Ashgrove', 173], ['Bell Lap', 'The Split Times', 176], ['Kick at the Bend', 'Saltmarsh', 182],
  ['Last Four Hundred', 'Neon Orchard', 190], ['Finish Line Static', 'The Bright Intervals', 200], ['Fast Feet Fever', 'Vela Club', 212], ['Sprint Theory', 'Arlo Penhallow', 224],
  ['Porchlight', 'Elm & Ember', 66], ['Backroad Glow', 'The Hollow Pines', 75], ['Long Shadows', 'Okoro Wells', 83], ['Late Train Home', 'Mira Ostrowski', 88],
  ['Window Seat', 'Jules Harrow', 95], ['Golden Hour Loop', 'Rafe Calder', 102], ['Wide Awake Avenue', 'The Small Hours', 110]];
const pickSongs = () => {
  const near = (t) => SONGS.slice().sort((a, b) => Math.abs(a[2] - t) - Math.abs(b[2] - t));
  const same = near(tempo.bpm).slice(0, 2).map((s) => [...s, '1×']);
  return [...same, [...near(tempo.bpm / 2)[0], '½×']];
};
function showSongs() {
  $('[data-songs]').innerHTML = pickSongs().map(([t, a, b, m], i) => `<li class="song" style="--i:${i}"><b>${t}</b><span>${a}</span><i>${b}</i><small>${m} match</small></li>`).join('');
  songsAt = performance.now();
}
let songsAt = 0;
// the same songs as the phone's screen, with their BPM numbers ticking into place
function drawSongs(g, W, H, age) {
  const F = '"Atkinson Hyperlegible", -apple-system, Helvetica, Arial, sans-serif', M = 'ui-monospace, "SF Mono", Menlo, monospace';
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic'; g.fillStyle = '#16110E';
  g.textAlign = 'left'; g.font = `700 30px ${F}`; g.fillText('9:41', 56, 64);
  g.textAlign = 'center'; g.font = `700 32px ${F}`; g.fillText('Matching', W / 2, 150);
  g.beginPath(); g.roundRect(32, 196, W - 64, 300, 28); g.fill();
  g.fillStyle = 'rgba(255,255,255,.74)'; g.font = `700 26px ${F}`; g.fillText('Your cadence', W / 2, 256);
  g.fillStyle = '#E8F02A'; g.font = `700 150px ${M}`; g.fillText(String(tempo.bpm), W / 2, 400);
  g.fillStyle = '#fff'; g.font = `400 28px ${F}`; g.fillText('steps per minute', W / 2, 456);
  let moving = false;
  pickSongs().forEach(([title, artist, bpm, match], i) => {
    const y = 560 + i * 132, t = clamp((age - 250 - i * 260) / 700, 0, 1), e = 1 - Math.pow(1 - t, 3);
    if (t < 1) moving = true;
    g.fillStyle = 'rgba(22,17,14,.06)'; g.beginPath(); g.roundRect(32, y, W - 64, 112, 20); g.fill();
    g.textAlign = 'left'; g.fillStyle = '#16110E'; g.font = `700 30px ${F}`; g.fillText(title, 56, y + 48);
    g.fillStyle = 'rgba(22,17,14,.72)'; g.font = `400 25px ${F}`; g.fillText(artist, 56, y + 86);
    g.textAlign = 'right'; g.fillStyle = '#16110E'; g.font = `700 40px ${M}`; g.fillText(String(Math.round(bpm + (1 - e) * (i % 2 ? 23 : -19))), W - 150, y + 66);
    g.fillStyle = t >= 1 ? '#E8F02A' : 'rgba(22,17,14,.08)'; g.beginPath(); g.roundRect(W - 132, y + 30, 76, 52, 26); g.fill();
    if (t >= 1) { g.fillStyle = '#16110E'; g.textAlign = 'center'; g.font = `700 26px ${F}`; g.fillText(match, W - 94, y + 65); }
  });
  g.textAlign = 'center'; g.fillStyle = 'rgba(22,17,14,.72)'; g.font = `400 23px ${F}`; g.fillText('Example songs, made up for this page', W / 2, 1010);
  return moving;
}

/* ---------------------------------------------------------------- the cue that drops in */
const toast = $('[data-toast]');
let cueOK = false, flipAt = -1e9;
function setCue(ok, now) {
  cueOK = ok; flipAt = now;
  $('[data-toast-title]').textContent = ok ? 'Back on target' : 'Speed up';
  $('[data-toast-text]').textContent = ok ? '170, target 170' : '157, target 170';
  toast.classList.toggle('ok', ok);
  if (!reduceMotion) toast.animate([{ transform: 'translateY(-14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
}

/* ---------------------------------------------------------------- pulse cues */
const pulses = []; // { at, dur }: taps the watch shows
$$('.cue').forEach((btn) => btn.addEventListener('click', () => {
  const pattern = btn.dataset.cue.split(',').map(Number);
  if ('vibrate' in navigator) navigator.vibrate(pattern);
  let t = performance.now() + 30;
  pattern.forEach((ms, i) => { if (i % 2 === 0) pulses.push({ at: t, dur: Math.max(ms, 110) }); t += ms; });
  $$('.cue').forEach((b) => b.classList.toggle('on', b === btn));
  setTimeout(() => btn.classList.remove('on'), 600);
}));

/* ---------------------------------------------------------------- the stage */
function startStage() {
  const canvas = $('[data-stage]');
  const FOV = 30, DIST = 24;
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: FOV, distance: DIST, lights: 'studio', shadows: true, autoFit: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const glow = new THREE.PointLight(0xe8f02a, 46, 40); // the stage's one coloured light
  glow.position.set(-5, 3, 7);
  scene.add(glow);

  const phone = buildIPhone(['4-run-on-target', '5-set-up-run', '1-run-speed-up', '3-pulse-cues', '2-summary']);
  const [onTarget, setUp, speedUp, pulseCues, summary] = phone.userData.screens;
  const songsCanvas = document.createElement('canvas');
  songsCanvas.width = 600; songsCanvas.height = 1303;
  const songsTex = new THREE.CanvasTexture(songsCanvas);
  songsTex.colorSpace = THREE.SRGBColorSpace;
  const display = phone.userData.display;
  const runway = buildRunway();
  const watch = buildAppleWatch();
  const garmin = buildWatch();
  document.addEventListener('adagio:bpm', (e) => garmin.userData.setBPM(e.detail));
  scene.add(phone, runway, watch, garmin);

  // rings on the beat, lime, spreading from whatever the scene is about
  const rings = Array.from({ length: 4 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8f02a, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 1.022, 96), mat);
    scene.add(mesh);
    return { mesh, mat, at: -1e9 };
  });
  let ringNext = 0;

  // where things stand in each scene. Wide screens: the phone has the right half; phones: the top half.
  const poses = (k) => {
    const visH = 2 * DIST * Math.tan((FOV * Math.PI) / 360), visW = visH * camera.aspect, wide = camera.aspect > 1.05;
    const hx = wide ? Math.min(5, visW * 0.25) : 0, hy = wide ? 0 : visH * 0.27, B = wide ? 1 : clamp(visW / 12.4, 0.42, 0.62);
    const gapX = wide ? Math.min(4.3, visW / 2 - hx - 1.2) : visW * 0.31, trio = wide ? 0.68 : 0.36;
    const off = { x: hx, y: -18, z: 0, rx: 0, ry: 0, rz: 0, s: B };
    const at = (x, y, z, rx, ry, rz, s) => ({ x: hx + x, y: hy + y, z, rx, ry, rz, s: s * B });
    return {
      phone: [at(0, 0, 0, 0.05, -0.45, 0.04, 1), at(15, 1, -8, 0, -1.7, 0, 1), at(0, 0, 0, 0, 0.38, -0.03, 1), at(0, 0, 1.2, -0.04, -0.22, 0, 1.04),
        at(0, 0, 0, 0.06, 0.16, 0.02, 1), wide ? at(3.6, 1.6, -9, 0, -0.75, 0, 0.9) : at(12, 0, -8, 0, -1.2, 0, 1),
        { ...at(0, 0, 0, 0, 0, 0, 0), s: trio }, at(0, 0, 0, 0.05, -0.4, 0.04, 1)][k],
      runway: k === 1 ? { x: hx - (wide ? 0.4 : 0), y: hy - (wide ? 0.2 : 0.4), z: 0, rx: 0.3, ry: 0, rz: -0.06, s: wide ? 0.8 : B * 0.72 } : { x: k < 1 ? -24 : 24, y: hy - 0.2, z: 0, rx: 0.3, ry: 0, rz: -0.06, s: wide ? 0.8 : B * 0.72 },
      watch: k === 5 ? at(0, 0.2, 0, -0.2, 0.5, 0.08, wide ? 1.2 : 0.95) : k === 6 ? { x: hx + gapX, y: hy, z: 0, rx: -0.12, ry: -0.3, rz: 0, s: trio * 0.9 } : { ...off, y: -18 },
      garmin: k === 6 ? { x: hx - gapX, y: hy, z: 0, rx: -0.12, ry: 0.3, rz: 0, s: trio * 0.86 } : { ...off, y: 18 },
    };
  };
  const place = (obj, a, b, t) => {
    obj.position.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
    obj.rotation.set(lerp(a.rx, b.rx, t), lerp(a.ry, b.ry, t), lerp(a.rz, b.rz, t));
    obj.scale.setScalar(lerp(a.s, b.s, t));
  };
  const SCREENS = [onTarget, onTarget, setUp, songsTex, speedUp, pulseCues, summary, onTarget];
  let shown = null, lastBeat = -1, beatAt = -1e9, songsMoving = true;

  const frame = (now) => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    // the beat
    if (now - tempo.next > tempo.len * 2) tempo.next = now;
    if (now >= tempo.next) { tempo.next += tempo.len; tempo.count += 1; beatFns.forEach((fn) => fn(tempo.count)); }
    if (tempo.count !== lastBeat) {
      lastBeat = tempo.count; beatAt = now;
      if (!reduceMotion) {
        rings[ringNext++ % rings.length].at = now;
        const em = $('.scene.on .line em');
        if (em) em.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
        if (sceneNow === 4 && tempo.count % 8 === 0) setCue(!cueOK, now); // the cue changes every eight beats
      }
    }
    // between scenes
    const k = Math.min(Math.floor(P), N - 1), k2 = Math.min(k + 1, N - 1), t = smooth(0.25, 0.85, P - k);
    const A = poses(k), Bp = poses(k2);
    place(phone, A.phone, Bp.phone, t);
    place(runway, A.runway, Bp.runway, t);
    place(watch, A.watch, Bp.watch, t);
    place(garmin, A.garmin, Bp.garmin, t);
    // the phone: a turn of the hand, a flip when the cue changes, and the scene's screen
    const flip = clamp((now - flipAt) / 620, 0, 1), flipE = flip < 0.5 ? 4 * flip * flip * flip : 1 - Math.pow(-2 * flip + 2, 3) / 2;
    phone.rotation.y += drag.offset + (sceneNow === 4 && !reduceMotion ? flipE * Math.PI * 2 : 0);
    const want = t > 0.5 ? k2 : k;
    let tex = SCREENS[want];
    if (want === 4) tex = (flip >= 0.5 ? cueOK : !cueOK) ? onTarget : speedUp; // the screen changes halfway through the flip
    if (tex !== shown) { shown = tex; display.material.map = tex; display.material.needsUpdate = true; if (tex === songsTex) { songsAt = now; songsMoving = true; } }
    if (shown === songsTex && (songsMoving || now - songsAt < 60)) { songsMoving = drawSongs(songsCanvas.getContext('2d'), 600, 1303, reduceMotion ? 1e6 : now - songsAt); songsTex.needsUpdate = true; }
    // the shoe comes down as its scene arrives, and lands on a beat
    runway.userData.update(P < 2 ? smooth(0.35, 0.92, P) : 1, now);
    // the watch taps: on the beat, or the pattern of the cue you pressed
    let bump = reduceMotion ? 0 : Math.max(0, 1 - (now - beatAt) / 150);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const u = (now - pulses[i].at) / pulses[i].dur;
      if (u > 1.6) { pulses.splice(i, 1); continue; }
      if (u >= 0) bump = Math.max(bump, u < 1 ? 1 : 1 - (u - 1) / 0.6);
    }
    watch.scale.multiplyScalar(1 + 0.045 * bump);
    // rings: around the phone, or the watch in its scene; none while the shoe or the three devices have the stage
    const focus = P > 4.5 && P < 5.5 ? watch : phone;
    const vis = (1 - smooth(0.3, 0.7, P) * (1 - smooth(1.3, 1.7, P))) * (1 - smooth(5.5, 5.9, P) * (1 - smooth(6.3, 6.7, P)));
    rings.forEach((r) => {
      const age = clamp((now - r.at) / (tempo.len * 2.2), 0, 1);
      r.mesh.position.set(focus.position.x, focus.position.y, focus.position.z - 2.5);
      r.mesh.scale.setScalar((2.6 + (1 - Math.pow(1 - age, 2)) * 5) * focus.scale.x);
      r.mat.opacity = reduceMotion ? 0 : (1 - age) * 0.55 * vis;
    });
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- start */
showSongs();
readScroll();
window.addEventListener('scroll', readScroll, { passive: true });
window.addEventListener('resize', readScroll);
const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
if (webgl) { try { startStage(); } catch (e) { console.warn('3D stage failed', e); document.documentElement.classList.add('no-3d'); } }
else document.documentElement.classList.add('no-3d');
