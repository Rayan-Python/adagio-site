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

// Metronome: the dot sits on the tick of the section you're in: the last section whose
// top has passed the middle of the screen. That holds steady through the gradient bands
// between sections (and the footer counts as Contact). It pulses on each new section.
const metroSections = metroTicks.map((a) => document.querySelector(a.hash));
let metroIndex = -1;
function setMetronome() {
  const middle = window.innerHeight / 2;
  let at = 0;
  metroSections.forEach((section, k) => { if (section.getBoundingClientRect().top <= middle) at = k; });
  const section = metroSections[at];
  const box = section.getBoundingClientRect();
  // colors follow what's actually behind the rail: the section, or dark once past its end
  metronome.dataset.theme = box.bottom > middle ? section.dataset.theme : 'black';
  if (at === metroIndex) return;
  metroIndex = at;
  metroDot.style.setProperty('--i', at);
  metroTicks.forEach((a, k) => a.classList.toggle('is-on', k === at));
  metroDot.classList.remove('is-pulsing');
  void metroDot.offsetWidth; // restart the pulse
  metroDot.classList.add('is-pulsing');
}
function setTheme() {
  setMetronome();
}

// Text fades and slides in as each section enters.
const reveals = document.querySelectorAll('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('is-in'));
} else {
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        seen.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
  reveals.forEach((el) => seen.observe(el));
}

// One thick line winds down the whole page and is drawn as you scroll. Each section has
// its own movement (sweeps, zigzags, loops), routed around the small corner labels; on
// phones it runs straight down the right edge. The app icon rides the tip, tilting a
// little with the line's direction.
const course = flow.querySelector('.course');
const edge = course && course.querySelector('.course-edge');
const line = course && course.querySelector('.course-line');
const grad = course && course.querySelector('#course-grad');
const runner = flow.querySelector('.runner');
const blocks = themed.filter((el) => el.classList.contains('block'));

let marks = []; // for each waypoint: scroll position it belongs to, and line length there
let total = 0;

// S-bends that leave and arrive heading straight down, so the line never swings
// sideways past its waypoints (and into text).
function smoothPath(points) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1], q = points[i], dy = (q.y - p.y) / 2;
    d += ` C${p.x},${p.y + dy} ${q.x},${q.y - dy} ${q.x},${q.y}`;
  }
  return d;
}

// The line keeps out of all text: through each section it runs down a side margin
// (alternating left and right, wiggling where there's room), and it only crosses the
// page inside the empty gradient bands between sections. On phones it runs straight
// down the right edge.
function buildLine() {
  if (!course) return;
  const box = flow.getBoundingClientRect();
  const w = box.width, h = box.height;
  const points = [];
  if (window.innerWidth < 720) {
    const end = blocks[blocks.length - 1].getBoundingClientRect().bottom - box.top; // stop before the footer
    points.push({ x: w - 36, y: 0 }, { x: w - 36, y: end });
  } else {
    const half = parseFloat(getComputedStyle(edge).strokeWidth) / 2;
    const pad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pad')) || 80;
    // left margin: between the window edge and the corner labels / text
    const leftMax = pad - half - 8, leftMin = half + 4;
    // right margin: between the text / labels and the metronome
    const metroLeft = w - (window.innerWidth - metronome.getBoundingClientRect().left);
    const rightMin = w - pad + half + 8, rightMax = Math.min(metroLeft - half - 6, w - half - 4);
    const lanes = [
      { a: leftMin, b: Math.max(leftMin, leftMax) },
      { a: Math.min(rightMin, rightMax), b: Math.max(rightMin, rightMax) },
    ];
    let lastBottom = 0;
    blocks.forEach((block, i) => {
      const r = block.getBoundingClientRect();
      const top = r.top - box.top, bottom = r.bottom - box.top;
      const lane = lanes[i % 2];
      const steps = Math.max(2, Math.round((bottom - top) / 150));
      for (let k = 0; k <= steps; k++) {
        const x = k === 0 || k === steps ? (lane.a + lane.b) / 2 : (k % 2 ? lane.a : lane.b); // wiggle in the margin
        points.push({ x, y: top + (bottom - top) * k / steps });
      }
      lastBottom = bottom;
    });
    if (points[0].y > 0) points.unshift({ x: points[0].x, y: 0 });
    points.push({ x: points[points.length - 1].x, y: Math.min(h, lastBottom + 1) });
  }
  const keys = points.map((p) => p.y);
  course.setAttribute('viewBox', `0 0 ${w} ${h}`);
  grad.setAttribute('y2', h);
  const d = smoothPath(points);
  edge.setAttribute('d', d);
  line.setAttribute('d', d);
  total = line.getTotalLength();
  // line length at each waypoint (measured on growing prefixes of the path)
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  course.appendChild(probe);
  marks = points.map((p, i) => {
    if (i === 0) return { key: keys[0], len: 0 };
    probe.setAttribute('d', smoothPath(points.slice(0, i + 1)));
    return { key: keys[i], len: probe.getTotalLength() };
  });
  probe.remove();
  [edge, line].forEach((p) => { p.style.strokeDasharray = `${total} ${total}`; });
}

// How much line to draw: scrolling through a section moves the tip evenly through that
// section's waypoints, so loops play out smoothly as you scroll.
function lengthFor(y) {
  if (y <= 0) return 0;
  for (let i = 1; i < marks.length; i++) {
    if (y < marks[i].key) {
      const a = marks[i - 1], b = marks[i];
      return a.len + (y - a.key) / (b.key - a.key) * (b.len - a.len);
    }
  }
  return total;
}

function runLine() {
  if (!marks.length) return;
  const len = lengthFor(window.innerHeight * 0.6 - flow.getBoundingClientRect().top);
  [edge, line].forEach((p) => { p.style.strokeDashoffset = total - len; });
  const tip = line.getPointAtLength(len);
  const ahead = line.getPointAtLength(Math.min(len + 4, total));
  const heading = Math.atan2(ahead.y - tip.y, ahead.x - tip.x) * 180 / Math.PI; // 90 = straight down
  const tilt = Math.max(-25, Math.min(25, (heading - 90) * 0.35));
  runner.style.transform = `translate(${tip.x}px, ${tip.y}px) translate(-50%, -50%) rotate(${tilt}deg)`;
  runner.classList.toggle('is-on', len > 0);
}

// The 3D phone spins as its section scrolls into view and ends facing forward
// (eased towards the scroll position each frame).
const phone = document.querySelector('.phone3d');
const phoneSection = document.getElementById('features');
let phoneRY = 360, phoneRX = 14, phoneFrame = 0;
function phoneTarget() {
  const b = phoneSection.getBoundingClientRect();
  const p = Math.min(Math.max((window.innerHeight - b.top) / (window.innerHeight / 2 + b.height / 2), 0), 1);
  return { ry: (1 - p) * 360, rx: (1 - p) * 14 };
}
function spinPhone() {
  const t = phoneTarget();
  phoneRY += (t.ry - phoneRY) * 0.12;
  phoneRX += (t.rx - phoneRX) * 0.12;
  phone.style.setProperty('--ry', phoneRY.toFixed(2) + 'deg');
  phone.style.setProperty('--rx', phoneRX.toFixed(2) + 'deg');
  phoneFrame = Math.abs(t.ry - phoneRY) > 0.05 || Math.abs(t.rx - phoneRX) > 0.05 ? requestAnimationFrame(spinPhone) : 0;
}
function queuePhone() {
  if (phone && !reduceMotion && !phoneFrame) phoneFrame = requestAnimationFrame(spinPhone);
}

function onScroll() {
  dimHero();
  toggleNav();
  setTheme();
  if (!reduceMotion) runLine();
  queuePhone();
}

function onLayout() {
  if (!reduceMotion) buildLine();
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
