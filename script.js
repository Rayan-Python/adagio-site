// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.getElementById('nav-links');

toggle.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});
links.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

// YouTube embed: set data-video-id on #video in index.html (or edit VIDEO_ID here).
const VIDEO_ID = '';
const video = document.getElementById('video');
const id = video && (video.dataset.videoId || VIDEO_ID);
if (id) {
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id);
  frame.title = 'Adagio demo video';
  frame.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.loading = 'lazy';
  video.replaceChildren(frame);
}

// Download link placeholder: don't jump to top until a real URL is set.
document.querySelectorAll('a[data-placeholder="download"]').forEach((a) => {
  if (a.getAttribute('href') === '#') {
    a.addEventListener('click', (e) => e.preventDefault());
  }
});

// Hero dims as the black sections slide up over it.
const hero = document.querySelector('.hero');
function dimHero() {
  const progress = Math.min(window.scrollY / window.innerHeight, 1);
  hero.style.setProperty('--dim', (progress * 0.7).toFixed(3));
}
window.addEventListener('scroll', dimHero, { passive: true });
dimHero();

// Timeline: a 5K race course. The lane is an SVG curve through one waypoint per
// card: beside the card on the open side, so it swerves left and right down the
// page (on phones it runs straight down the left edge). Marker k sits at exactly
// k km and the course ends at the 5 km finish. As you scroll, the shoe runs to the
// point on the course level with 60% down the screen, turned to follow the lane.
const tl = document.getElementById('tl');
if (tl) {
  const steps = [...tl.querySelectorAll('.tl-step')];
  const course = tl.querySelector('.tl-course');
  const paths = [...course.querySelectorAll('path')];
  const done = course.querySelector('.lane-done');
  const shoe = tl.querySelector('.tl-shoe');
  const tag = tl.querySelector('.tl-mi');
  const finish = tl.querySelector('.tl-finish');
  const finishLabel = tl.querySelector('.tl-finish-label');
  let samples = []; // points along the course, every 2px of length
  let marks = [];   // course length at each km marker
  let total = 0;

  const lengthAtY = (y) => { // the course always heads down, so y rises with length
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].y < y) lo = mid + 1; else hi = mid; }
    return samples[lo].len;
  };
  const angleAt = (len) => {
    const a = done.getPointAtLength(Math.max(len - 2, 0));
    const b = done.getPointAtLength(Math.min(len + 2, total));
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  };

  function buildCourse() {
    const box = tl.getBoundingClientRect();
    const wide = window.matchMedia('(min-width: 900px)').matches;
    const swing = Math.min(box.width * 0.18, 230);
    const points = [{ x: wide ? box.width / 2 : 28, y: 0 }];
    steps.forEach((step) => {
      const card = step.querySelector('.tl-card').getBoundingClientRect();
      const y = card.top + card.height / 2 - box.top;
      let x = 28;
      if (wide) x = box.width / 2 + (card.left + card.width / 2 < box.left + box.width / 2 ? swing : -swing);
      points.push({ x, y });
      const li = step.getBoundingClientRect();
      const node = step.querySelector('.tl-node');
      node.style.left = (box.left + x - li.left) + 'px';
      node.style.top = (box.top + y - li.top) + 'px';
    });
    // smooth S-bends: leave and arrive heading straight down
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], q = points[i], dy = (q.y - p.y) / 2;
      d += ` C${p.x},${p.y + dy} ${q.x},${q.y - dy} ${q.x},${q.y}`;
    }
    course.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    paths.forEach((p) => p.setAttribute('d', d));
    total = done.getTotalLength();
    samples = [];
    for (let len = 0; len <= total; len += 2) { const pt = done.getPointAtLength(len); samples.push({ len, y: pt.y }); }
    samples.push({ len: total, y: done.getPointAtLength(total).y });
    marks = points.slice(1).map((p) => lengthAtY(p.y));
    done.style.strokeDasharray = `${total} ${total}`;
    const end = points[points.length - 1];
    finish.style.transform = `translate(${end.x}px, ${end.y}px) rotate(${angleAt(total) + 90}deg) translate(-50%, -50%)`;
    finishLabel.style.left = end.x + 'px';
    finishLabel.style.top = end.y + 'px';
  }

  function kmAt(len) {
    let prev = 0;
    for (let k = 0; k < marks.length; k++) {
      if (len <= marks[k]) return k + (len - prev) / (marks[k] - prev);
      prev = marks[k];
    }
    return marks.length;
  }

  function runTimeline() {
    if (!samples.length) return;
    const box = tl.getBoundingClientRect();
    const len = lengthAtY(window.innerHeight * 0.6 - box.top);
    const pt = done.getPointAtLength(len);
    done.style.strokeDashoffset = total - len;
    shoe.style.transform = `translate(${pt.x}px, ${pt.y}px) rotate(${angleAt(len)}deg)`;
    tag.style.left = pt.x + 'px';
    tag.style.top = pt.y + 'px';
    tag.textContent = kmAt(len).toFixed(2) + ' km';
    steps.forEach((step, k) => step.classList.toggle('is-on', len >= marks[k] - 0.5));
  }

  const rebuild = () => { buildCourse(); runTimeline(); };
  window.addEventListener('scroll', runTimeline, { passive: true });
  window.addEventListener('resize', rebuild);
  document.fonts.ready.then(rebuild);
  rebuild();
}

// Small top-left wordmark appears once the big hero wordmark is covered.
// The hero stays pinned while the sections slide over it, so check where the
// first section's top edge is rather than whether the wordmark is on screen.
const bigBrand = document.querySelector('.hero-brand');
const miniBrand = document.querySelector('.mini-brand');
const firstSection = document.querySelector('.hero + * + section, .hero ~ section');
if (bigBrand && miniBrand && firstSection) {
  function toggleMiniBrand() {
    const covered = firstSection.getBoundingClientRect().top < bigBrand.getBoundingClientRect().top;
    miniBrand.classList.toggle('is-shown', covered);
  }
  window.addEventListener('scroll', toggleMiniBrand, { passive: true });
  toggleMiniBrand();
  // Clicking it jumps straight back to the top, with no smooth scroll.
  miniBrand.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

document.getElementById('year').textContent = new Date().getFullYear();
