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

// The nav appears once the page has covered the big wordmark.
function toggleNav() {
  nav.classList.toggle('is-shown', flow.getBoundingClientRect().top < heroBrand.getBoundingClientRect().top);
}

// The background eases to the theme of whichever section is in the middle of the screen.
function setTheme() {
  const middle = window.innerHeight / 2;
  const current = themed.find((el) => {
    const box = el.getBoundingClientRect();
    return box.top <= middle && box.bottom > middle;
  });
  const theme = current ? current.dataset.theme : 'black';
  if (flow.dataset.theme !== theme) flow.dataset.theme = theme;
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
// (Switched off for now: with the <svg class="course"> and <img class="runner"> removed
// from the page, none of this runs.)
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
    points.push({ x: w - 22, y: 0 }, { x: w - 22, y: h });
    keys.push(0, h);
  } else {
    const gutter = Math.max(40, (w - 1200) / 4);
    const span = w - gutter * 2;
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

function onScroll() {
  dimHero();
  toggleNav();
  setTheme();
  if (!reduceMotion) runLine();
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

document.getElementById('year').textContent = new Date().getFullYear();
