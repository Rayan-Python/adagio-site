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

// Timeline: the spike runs down the lane as you scroll. Its position is the point
// 60% down the screen; steps light up once the shoe passes their marker.
const tl = document.getElementById('tl');
if (tl) {
  const steps = [...tl.querySelectorAll('.tl-step')];
  const label = tl.querySelector('.tl-mi');
  const miles = 3.12; // the whole lane is a 5K
  // Label each card with the distance where its marker sits on the lane.
  function labelMiles() {
    const box = tl.getBoundingClientRect();
    steps.forEach((step) => {
      const node = step.querySelector('.tl-node').getBoundingClientRect();
      const at = (node.top + node.height / 2 - box.top) / box.height * miles;
      step.querySelector('.tl-mile').textContent = at.toFixed(2) + ' mi';
    });
  }
  function runTimeline() {
    const box = tl.getBoundingClientRect();
    const run = Math.min(Math.max(window.innerHeight * 0.6 - box.top, 0), box.height);
    tl.style.setProperty('--run', run + 'px');
    label.textContent = (run / box.height * miles).toFixed(2) + ' mi';
    steps.forEach((step) => {
      const node = step.querySelector('.tl-node').getBoundingClientRect();
      step.classList.toggle('is-on', node.top + node.height / 2 - box.top <= run);
    });
  }
  window.addEventListener('scroll', runTimeline, { passive: true });
  window.addEventListener('resize', () => { labelMiles(); runTimeline(); });
  document.fonts.ready.then(labelMiles);
  labelMiles();
  runTimeline();
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
}

document.getElementById('year').textContent = new Date().getFullYear();
