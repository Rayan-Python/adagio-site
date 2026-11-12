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
const id = video.dataset.videoId || VIDEO_ID;
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

document.getElementById('year').textContent = new Date().getFullYear();
