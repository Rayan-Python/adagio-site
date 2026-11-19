// Adagio: scroll effects for everything below the landing photo.

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

// One thick line winds down the whole page, drawn up to the point level with 60% down
// the screen. On wide screens it swings between the left and right gutters, crossing
// over between sections; on phones it runs straight down the right edge. The app icon
// rides the tip, tilting a little with the line's direction.
const course = flow.querySelector('.course');
const edge = course.querySelector('.course-edge');
const line = course.querySelector('.course-line');
const grad = course.querySelector('#course-grad');
const runner = flow.querySelector('.runner');
const blocks = themed.filter((el) => el.classList.contains('block'));
let samples = [];
let total = 0;

const lengthAtY = (y) => { // the line always heads down, so y rises with length
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].y < y) lo = mid + 1; else hi = mid; }
  return samples[lo].len;
};

function buildLine() {
  const box = flow.getBoundingClientRect();
  const w = box.width, h = box.height;
  let d;
  if (window.innerWidth < 720) {
    const x = w - 22;
    d = `M${x},0 L${x},${h}`;
  } else {
    const gutter = Math.max(40, (w - 1200) / 4);
    const sides = [gutter, w - gutter];
    const points = [{ x: w / 2, y: 0 }];
    blocks.forEach((block, i) => {
      const b = block.getBoundingClientRect();
      const x = sides[i % 2];
      points.push({ x, y: b.top - box.top + 140 }, { x, y: b.bottom - box.top - 140 });
    });
    points.push({ x: w / 2, y: h });
    d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], q = points[i], dy = (q.y - p.y) / 2;
      d += ` C${p.x},${p.y + dy} ${q.x},${q.y - dy} ${q.x},${q.y}`;
    }
  }
  course.setAttribute('viewBox', `0 0 ${w} ${h}`);
  grad.setAttribute('y2', h);
  edge.setAttribute('d', d);
  line.setAttribute('d', d);
  total = line.getTotalLength();
  samples = [];
  for (let len = 0; len <= total; len += 4) samples.push({ len, y: line.getPointAtLength(len).y });
  samples.push({ len: total, y: line.getPointAtLength(total).y });
  [edge, line].forEach((p) => { p.style.strokeDasharray = `${total} ${total}`; });
}

function runLine() {
  if (!samples.length) return;
  const y = window.innerHeight * 0.6 - flow.getBoundingClientRect().top;
  const len = y <= 0 ? 0 : lengthAtY(y);
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
