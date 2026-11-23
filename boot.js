// Adagio: runs in the head, before the first paint.
// ADAGIO_V is the version tag script.js adds when it imports models.js (keep it in step with the
// ?v= tags in index.html). With motion allowed, "intro" starts the load sequence (styles.css,
// staff.js time it from adagioIntroT0), and "pin3d" picks the layout with the 3D phone pinned
// beside the three steps, where the browser can draw it.
window.ADAGIO_V = '20261129a';
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('intro');
  window.adagioIntroT0 = performance.now();
  if (window.WebGL2RenderingContext) document.documentElement.classList.add('pin3d');
}
