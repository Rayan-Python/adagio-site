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

// Metronome: the dot snaps to the tick of the section in the middle of the screen,
// and pulses each time it lands on a new one.
let metroIndex = -1;
function setMetronome(current) {
  const id = current && current.id;
  const index = metroTicks.findIndex((a) => a.hash === '#' + id);
  const at = index === -1 ? (id ? metroTicks.length - 1 : 0) : index; // footer counts as the last tick
  metronome.dataset.theme = current ? current.dataset.theme : 'black';
  if (at === metroIndex) return;
  metroIndex = at;
  metroDot.style.setProperty('--i', at);
  metroTicks.forEach((a, k) => a.classList.toggle('is-on', k === at));
  metroDot.classList.remove('is-pulsing');
  void metroDot.offsetWidth; // restart the pulse
  metroDot.classList.add('is-pulsing');
}

// The metronome follows whichever section is in the middle of the screen (its tick and
// its colors). Section backgrounds themselves are fixed in the CSS.
function setTheme() {
  const middle = window.innerHeight / 2;
  const current = themed.find((el) => {
    const box = el.getBoundingClientRect();
    return box.top <= middle && box.bottom > middle;
  });
  setMetronome(current);
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

// Waypoints per section, as fractions of the section: x across the width between the
// gutters, y down its height. Every section starts at its top centre and ends at its
// bottom centre, so the corner labels (top left, bottom right) stay clear.
const MOVES = [
  [[.5, 0], [.55, .18], [.97, .35], [.97, .6], [.72, .8], [.5, 1]],                                   // sweep right
  [[.5, 0], [.45, .17], [.03, .3], [.14, .44], [.03, .58], [.14, .72], [.06, .84], [.5, 1]],          // zigzag left
  [[.5, 0], [.7, .14], [.96, .3], [.88, .52], [.72, .44], [.78, .3], [.93, .4], [.92, .66], [.62, .86], [.5, 1]], // loop right
  [[.5, 0], [.36, .17], [.03, .32], [.06, .55], [.03, .74], [.42, .9], [.5, 1]],                     // wide arc left
  [[.5, 0], [.62, .16], [.97, .28], [.88, .44], [.98, .58], [.88, .72], [.64, .86], [.5, 1]],         // zigzag right
  [[.5, 0], [.32, .16], [.04, .32], [.12, .52], [.28, .44], [.22, .3], [.07, .4], [.08, .66], [.38, .86], [.5, 1]], // loop left
  [[.5, 0], [.62, .16], [.96, .32], [.96, .66], [.62, .86], [.5, 1]],                                // sweep right
];

let marks = []; // for each waypoint: scroll position it belongs to, and line length there
let total = 0;

function smoothPath(points) { // Catmull-Rom through every point
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, points.length - 1)];
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

function buildLine() {
  if (!course) return;
  const box = flow.getBoundingClientRect();
  const w = box.width, h = box.height;
  const points = [], keys = [];
  if (window.innerWidth < 720) {
    points.push({ x: w - 36, y: 0 }, { x: w - 36, y: h });
    keys.push(0, h);
  } else {
    const gutter = Math.max(50, (w - 1200) / 4);
    const span = w - gutter * 2 - 40; // keep the right-hand swings clear of the metronome
    points.push({ x: w / 2, y: 0 });
    keys.push(0);
    blocks.forEach((block, i) => {
      const b = block.getBoundingClientRect();
      const top = b.top - box.top, height = b.height;
      const move = MOVES[i % MOVES.length];
      move.slice(1).forEach(([fx, fy], k) => {
        points.push({ x: gutter + fx * span, y: top + fy * height });
        keys.push(top + (k + 1) / (move.length - 1) * height);
      });
    });
    points.push({ x: w / 2, y: h });
    keys.push(h);
  }
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
  indexLine();
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
  flipWords(len);
}

// Words the yellow line passes over flip to black. Every word in the dark sections is
// wrapped in a <span class="w">; a word flips when its centre sits on the drawn part of
// the line (or under the icon).
const darkWords = [];
document.querySelectorAll('.flow [data-theme="black"] :is(h2, h3, p, li, a, .big-num)').forEach((el) => {
  if (el.closest('.corner, .sec-num, .orbs, .shelf-display, .phone3d-stage') || el.querySelector('h2, h3, p, li')) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.parentElement.classList.contains('w')) return;
    const frag = document.createDocumentFragment();
    node.nodeValue.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = part;
      frag.appendChild(span);
      darkWords.push(span);
    });
    node.replaceWith(frag);
  });
});
let lineGrid = new Map(); // 40px rows of the page -> line points in them
let halfStroke = 7;
let wordSpots = [];
function indexLine() {
  lineGrid = new Map();
  halfStroke = parseFloat(getComputedStyle(line).strokeWidth) / 2;
  for (let len = 0; len <= total; len += 3) {
    const p = line.getPointAtLength(len);
    const row = Math.floor(p.y / 40);
    if (!lineGrid.has(row)) lineGrid.set(row, []);
    lineGrid.get(row).push({ x: p.x, y: p.y, len });
  }
  const box = flow.getBoundingClientRect();
  wordSpots = darkWords.map((el) => {
    const b = el.getBoundingClientRect();
    return { el, x: b.left + b.width / 2 - box.left, y: b.top + b.height / 2 - box.top, on: false };
  });
}
function flipWords(len) {
  const box = flow.getBoundingClientRect();
  const top = -box.top - 100, bottom = -box.top + window.innerHeight + 100;
  const tip = runner.classList.contains('is-on') ? runner.getBoundingClientRect() : null;
  wordSpots.forEach((w) => {
    if (w.y < top || w.y > bottom) return;
    let on = false;
    const reach = halfStroke + 2;
    for (let row = Math.floor((w.y - reach) / 40); row <= Math.floor((w.y + reach) / 40) && !on; row++) {
      const pts = lineGrid.get(row);
      if (pts) on = pts.some((p) => p.len <= len && Math.abs(p.x - w.x) < reach && Math.abs(p.y - w.y) < reach);
    }
    if (!on && tip) {
      const x = w.x + box.left, y = w.y + box.top;
      on = x > tip.left && x < tip.right && y > tip.top && y < tip.bottom;
    }
    if (on !== w.on) { w.on = on; w.el.classList.toggle('on-line', on); }
  });
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
