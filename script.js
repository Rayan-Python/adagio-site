// Adagio: scroll effects for everything below the landing photo.

// A refresh always starts at the top: no remembered scroll position, and no #section
// left in the address from a nav click.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
window.scrollTo(0, 0);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = document.querySelector('.hero');
const heroBrand = document.querySelector('.hero-brand');
const flow = document.getElementById('flow');
const nav = document.querySelector('.site-nav');
const themed = [...flow.querySelectorAll('[data-theme]')];

// On load, "Adagio" and then "Run your rhythm" type in from left to right. Letters are
// wrapped in spans that hold their place, so the centered words never move.
function splitLetters(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const letters = [...text].map((c) => {
    const s = document.createElement('span');
    s.className = 'type-ch';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = c;
    el.appendChild(s);
    return s;
  });
  el.classList.add('is-split');
  return letters;
}
function typeIn() {
  const brand = splitLetters(heroBrand);
  const tagline = splitLetters(document.querySelector('.hero-tagline'));
  if (reduceMotion) return;
  const steps = [];
  let t = 350;
  brand.forEach((s) => { steps.push([s, t]); t += 130; });
  t += 300;
  tagline.forEach((s) => { steps.push([s, t]); t += s.textContent === ' ' ? 40 : 60; });
  let prev = null;
  steps.forEach(([s, at]) => setTimeout(() => {
    if (prev) prev.classList.remove('is-cur');
    s.classList.add('is-typed', 'is-cur');
    prev = s;
  }, at));
  setTimeout(() => prev && prev.classList.remove('is-cur'), t + 1800); // caret blinks a moment, then goes
}
typeIn();

// The photo dims as the page slides up over it.
function dimHero() {
  const progress = Math.min(window.scrollY / window.innerHeight, 1);
  hero.style.setProperty('--dim', (progress * 0.7).toFixed(3));
}

// The nav (and the metronome) appear once the page has covered the big wordmark.
const metronome = document.querySelector('.metronome');
const metroDot = metronome.querySelector('.metro-dot');
const metroTicks = [...metronome.querySelectorAll('a')];
function toggleNav() {
  const shown = flow.getBoundingClientRect().top < heroBrand.getBoundingClientRect().top;
  nav.classList.toggle('is-shown', shown);
  metronome.classList.toggle('is-shown', shown);
}

// Metronome: the dot follows your scroll continuously down the rail (no CSS transition,
// so every browser moves it the same way), resting on a section's tick as that section
// reaches the middle of the screen. The current tick lights up and the dot pulses when
// you enter a new section. The footer counts as Contact.
const metroSections = metroTicks.map((a) => document.querySelector(a.hash));
let metroIndex = -1;
function setMetronome() {
  const middle = window.innerHeight / 2;
  const tops = metroSections.map((s) => s.getBoundingClientRect().top - middle);
  let at = 0;
  tops.forEach((t, k) => { if (t <= 0) at = k; });
  let pos = at;
  if (tops[0] > 0) pos = 0;
  else if (at < tops.length - 1) pos = at + Math.min(1, -tops[at] / (tops[at] < 0 ? tops[at + 1] - tops[at] : 1));
  metroDot.style.setProperty('--pos', pos.toFixed(3));
  metronome.querySelector('ol').style.setProperty('--p', pos.toFixed(3));
  const section = metroSections[at];
  metronome.dataset.theme = section.getBoundingClientRect().bottom > middle ? section.dataset.theme : 'black';
  if (at === metroIndex) return;
  metroIndex = at;
  metroTicks.forEach((a, k) => a.classList.toggle('is-on', k === at));
  metroDot.classList.remove('is-pulsing');
  void metroDot.offsetWidth; // restart the pulse
  metroDot.classList.add('is-pulsing');
}
function setTheme() {
  setMetronome();
}

// Text is uncovered top to bottom as each section enters. Each item plays once per page
// load: it stops being watched after it appears, so scrolling back up never replays it.
const reveals = document.querySelectorAll('.reveal');
reveals.forEach((el) => el.addEventListener('transitionend', (e) => {
  if (e.target === el && el.classList.contains('is-in')) el.classList.add('is-done');
}));
// Checked on scroll by position (an IntersectionObserver would never fire: the clip hides
// the element from it).
let unrevealed = [...reveals];
function checkReveals() {
  if (!unrevealed.length) return;
  const line = window.innerHeight * 0.9;
  unrevealed = unrevealed.filter((el) => {
    const r = el.getBoundingClientRect();
    if (reduceMotion || (r.top < line && r.bottom > 0)) { el.classList.add('is-in'); return false; }
    return true;
  });
}

// The 3D phone rests at an angle (-18deg / 4deg) and tilts gently: a little as its
// section scrolls past, and towards the pointer on hover. Eased each frame.
const phone = document.querySelector('.phone3d');
const phoneSection = document.getElementById('features');
const phoneStage = document.querySelector('.phone3d-stage');
let phoneRY = -18, phoneRX = 4, phoneFrame = 0, pointerX = 0, pointerY = 0;
function phoneTarget() {
  const b = phoneSection.getBoundingClientRect();
  const p = Math.min(Math.max((window.innerHeight - b.top) / (window.innerHeight + b.height), 0), 1) - 0.5; // -0.5..0.5
  return { ry: -18 + p * 12 + pointerX * 10, rx: 4 - p * 6 - pointerY * 8 };
}
function tiltPhone() {
  const t = phoneTarget();
  phoneRY += (t.ry - phoneRY) * 0.12;
  phoneRX += (t.rx - phoneRX) * 0.12;
  phone.style.setProperty('--ry', phoneRY.toFixed(2) + 'deg');
  phone.style.setProperty('--rx', phoneRX.toFixed(2) + 'deg');
  phoneFrame = Math.abs(t.ry - phoneRY) > 0.02 || Math.abs(t.rx - phoneRX) > 0.02 ? requestAnimationFrame(tiltPhone) : 0;
}
function queuePhone() {
  if (phone && !reduceMotion && !phoneFrame) phoneFrame = requestAnimationFrame(tiltPhone);
}
if (phoneStage && !reduceMotion) {
  phoneStage.addEventListener('pointermove', (e) => {
    const r = phoneStage.getBoundingClientRect();
    pointerX = (e.clientX - r.left) / r.width - 0.5;
    pointerY = (e.clientY - r.top) / r.height - 0.5;
    queuePhone();
  });
  phoneStage.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; queuePhone(); });
}

function onScroll() {
  checkReveals();
  dimHero();
  toggleNav();
  setTheme();
  queuePhone();
}

function onLayout() {
  onScroll();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onLayout);
window.addEventListener('load', onLayout);
document.fonts.ready.then(onLayout);
onLayout();

// The logo in the nav jumps straight back to the top.
nav.querySelector('.nav-logo').addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: 'instant' });
});

// YouTube embed for a future demo section: give #video a data-video-id.
const video = document.getElementById('video');
if (video && video.dataset.videoId) {
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.dataset.videoId);
  frame.title = 'Adagio demo video';
  frame.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.loading = 'lazy';
  video.replaceChildren(frame);
}

// Placeholder links (no address yet) don't jump to the top.
document.querySelectorAll('a[data-placeholder]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

document.getElementById('year').textContent = new Date().getFullYear();
