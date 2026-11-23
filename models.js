// Adagio — real 3D models (three.js, WebGL), built from code, no model files:
//   • a distance track spike for "How it works · 01": green-to-gold knit upper, cream laces,
//     cream heel foam, green plate with salmon traction nubs and silver pins
//   • a Garmin-style round GPS watch (fenix / Forerunner look) for "Compatible devices";
//     its screen shows the page tempo and updates when you tap a new cadence
// Drag either one sideways to turn it. They only render while on screen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tempo = () => window.adagioTempo || { bpm: 170, phase: () => 0 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// Smooth curve through [x, y] points (x ascending): cubic Hermite with Catmull-Rom tangents.
function curve(points) {
  return (x) => {
    const n = points.length;
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[n - 1][0]) return points[n - 1][1];
    let i = 0;
    while (x > points[i + 1][0]) i++;
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n - 1)];
    const dx = p2[0] - p1[0], t = (x - p1[0]) / dx, t2 = t * t, t3 = t2 * t;
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * dx;
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * dx;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

/* ----------------------------------------------------------------------
   Shared stage: renderer, lighting, resize, drag-to-turn, and a render loop
   that only runs while the canvas is on screen.
   ---------------------------------------------------------------------- */
// fitWidth: the model's width in scene units; on narrow frames the camera backs off so
// the whole model still fits side to side.
function makeStage(canvas, { fov = 30, distance = 14, fitWidth = 0, lights = 'neon', shadows = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps product colors true
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(0, 0, distance);

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 6, 8); scene.add(key);
  if (shadows) { // soft contact shadows, so laces and loops sit on the shoe
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 4;
  }
  if (lights === 'neon') {
    // a lime rim from behind-left and a pink rim from the right
    const lime = new THREE.PointLight(0xa6e22e, 60, 30); lime.position.set(-7, 2, -4); scene.add(lime);
    const pink = new THREE.PointLight(0xff3d8b, 30, 30); pink.position.set(7, -2, -3); scene.add(pink);
  } else {
    // product-shot studio: less ambient, a strong key from above-left, a soft warm
    // fill, and bright edge lights from behind so the form reads
    scene.environmentIntensity = 0.75;
    key.intensity = 3.0; key.position.set(-3, 8, 6);
    const fill = new THREE.DirectionalLight(0xfff1dc, 0.35); fill.position.set(6, 1, 5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.8); rim.position.set(4, 4, -8); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xfff4d0, 0.9); rim2.position.set(-6, 2, -6); scene.add(rim2);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fitZ = fitWidth / 2 / (Math.tan((fov * Math.PI) / 360) * camera.aspect);
    camera.position.z = Math.max(distance, fitZ);
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  // drag sideways to turn the model; it eases back into its own motion when you let go
  const drag = { on: false, x: 0, offset: 0 };
  canvas.addEventListener('pointerdown', (e) => { drag.on = true; drag.x = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.on) return;
    const dx = e.clientX - drag.x; drag.x = e.clientX;
    drag.offset += dx * 0.012;
  });
  const end = () => { drag.on = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return { renderer, scene, camera, drag };
}

function runWhileVisible(el, frame, render) {
  let on = false, raf = 0;
  const loop = (now) => {
    frame(now);
    render();
    raf = on && !reduceMotion ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([e]) => {
    on = e.isIntersecting;
    if (on && !raf) raf = requestAnimationFrame(loop);
  }, { rootMargin: '100px' }).observe(el);
}

// A smooth tube-like surface lofted along x: section(x, phi) gives each ring's points.
// phi = 0 is the bottom center, phi = PI the top center. Faces point outward.
function loft({ x0, x1, nu = 120, nv = 48, section, colorAt, uvScale = 0.15 }) {
  const pos = [], uv = [], col = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const x = x0 + (x1 - x0) * (1 - Math.cos(Math.PI * u)) / 2; // more rings near the ends
    for (let j = 0; j <= nv; j++) {
      const phi = (j / nv) * Math.PI * 2;
      const p = section(x, phi);
      pos.push(x, p.y, p.z);
      uv.push(x / uvScale, ((j / nv) * p.perim) / uvScale);
      if (colorAt) { const c = colorAt(x, p.h, p.z); col.push(c.r, c.g, c.b); }
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorAt) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// Sweep a closed 2D outline along a 3D path. The outline's u runs along a fixed side axis,
// v along the path's normal, so the band never twists.
function sweep(path, outline, { samples = 64, side = new THREE.Vector3(1, 0, 0) } = {}) {
  const pos = [], idx = [], n = outline.length;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = path.getPointAt(t), tan = path.getTangentAt(t);
    const nrm = new THREE.Vector3().crossVectors(tan, side).normalize();
    outline.forEach(([u, v]) => { pos.push(p.x + side.x * u + nrm.x * v, p.y + side.y * u + nrm.y * v, p.z + side.z * u + nrm.z * v); });
  }
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = a + n, a2 = i * n + ((j + 1) % n), b2 = a2 + n;
      idx.push(a, b, a2, b, b2, a2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
function roundedRect(w, h, r, seg = 6) {
  const pts = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  corners.forEach(([cx, cy, a0]) => { for (let s = 0; s <= seg; s++) { const a = a0 + (s / seg) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } });
  return pts;
}

/* ----------------------------------------------------------------------
   Track spike, modeled after a modern distance spike (Dragonfly-style silhouette):
   long, narrow and pointed with strong toe spring; a full-length foam midsole that
   is tall at the heel and thin under the forefoot; a translucent lime spike plate
   with gold pins and traction nubs; a diamond-knit upper with ghillie lace loops and
   flat laces; a padded Achilles peak with pull tab; a lime heel badge; and an
   Adagio "beat" mark (equalizer bars) on each side. Heel at x = 0, toe at x = 10.
   ---------------------------------------------------------------------- */
const LEN = 10;
const groundY = (x) => (x < 6.2 ? 0 : 0.85 * Math.pow((x - 6.2) / 3.8, 2.1));      // toe spring
const foamH = (x) => lerp(lerp(0.95, 0.22, smooth(0.9, 6.0, x)), 0.15, smooth(8.2, 10, x)); // stack height
const foamTop = (x) => groundY(x) + foamH(x);
const upperRaw = curve([[0, 1.62], [0.25, 1.8], [0.9, 1.58], [1.9, 1.4], [3.0, 1.5], [3.6, 1.52], [5.2, 1.16], [6.8, 0.84], [8.3, 0.6], [9.4, 0.44], [10, 0.38]]);
const topY = (x) => foamTop(x) + upperRaw(x);
const widthRaw = curve([[0, 0.7], [0.6, 0.84], [2.2, 0.86], [3.8, 0.92], [5.8, 1.08], [7.2, 1.06], [8.6, 0.84], [9.5, 0.5], [10, 0.3]]);
const HEEL_R = 0.7, TOE_R = 0.95;
function endRound(x) {
  let k = 1;
  if (x < HEEL_R) k *= Math.sqrt(Math.max(0, 1 - Math.pow((HEEL_R - x) / HEEL_R, 2)));
  if (x > LEN - TOE_R) k *= Math.sqrt(Math.max(0, 1 - Math.pow((x - (LEN - TOE_R)) / TOE_R, 2)));
  return k;
}
const halfW = (x) => widthRaw(x) * endRound(x);
const toeK = (x) => (x > LEN - TOE_R ? Math.sqrt(Math.max(0, 1 - Math.pow((x - (LEN - TOE_R)) / TOE_R, 2))) : 1);

function upperSection(x, phi) {
  const yb = foamTop(x) - 0.02, yt = topY(x);
  const mid = (yb + yt) / 2, hh = ((yt - yb) / 2) * (0.45 + 0.55 * toeK(x)) * Math.pow(toeK(x), 0.3);
  const vert = -Math.cos(phi);                       // -1 bottom … +1 top
  const y = mid + hh * spow(vert, vert < 0 ? 0.28 : 0.85);
  const taper = 1 - 0.46 * smooth(0, 1, vert);       // narrower toward the top, like a foot
  const z = halfW(x) * spow(Math.sin(phi), 0.5) * taper;
  return { y, z, h: (y - yb) / Math.max(yt - yb, 1e-3), perim: 2 * (yt - yb) + 3 * halfW(x) };
}
function slabSection(bottom, top, width, e = 0.25, ez = 0.3) {
  return (x, phi) => {
    const yb = bottom(x), yt = top(x), mid = (yb + yt) / 2, hh = (yt - yb) / 2;
    const vert = -Math.cos(phi);
    const y = mid + hh * spow(vert, e);
    const z = width(x) * spow(Math.sin(phi), ez);
    return { y, z, h: (y - yb) / Math.max(yt - yb, 1e-3), perim: 2 * (yt - yb) + 3 * width(x) };
  };
}
// a point on the top half of the upper at a given x and sideways z
function surfaceAt(x, zTarget) {
  let lo = Math.PI / 2, hi = (3 * Math.PI) / 2; // z runs from +max down to -max
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (upperSection(x, m).z > zTarget) lo = m; else hi = m;
  }
  const p = upperSection(x, (lo + hi) / 2);
  return new THREE.Vector3(x, p.y, p.z);
}

// the foot opening, an ellipse on top of the upper
const COLLAR = { cx: 1.7, rx: 1.32, rz: 0.52, minY: 1.75 };

// fine diamond knit with rows of tiny perforations (used as color and bump)
function knitTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 2;
  for (let i = -S; i < S * 2; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.beginPath(); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,.42)';
  for (let y = 8; y < S; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < S; x += 16) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16; // keeps the weave from shimmering at grazing angles
  return t;
}

// Shader tweaks shared by the upper and its lining: cut the foot opening, and (upper
// only) print the Adagio beat mark, five rounded equalizer bars, on each side.
function cutCollar(material, withMark) {
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    let f = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          float ox = (vLocal.x - ${COLLAR.cx.toFixed(2)}) / ${COLLAR.rx.toFixed(2)};
          float oz = vLocal.z / ${COLLAR.rz.toFixed(2)};
          if (ox * ox + oz * oz < 1.0 && vLocal.y > ${COLLAR.minY.toFixed(2)}) discard;
        }`);
    if (withMark) {
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float sideMask = smoothstep(0.42, 0.66, abs(vLocal.z));
          float m = 0.0;
          float heights[5] = float[5](0.1, 0.2, 0.32, 0.22, 0.13); // an audio level meter
          for (int i = 0; i < 5; i++) {
            vec2 c = vec2(4.45 + float(i) * 0.2, 1.3);
            vec2 p = vec2(vLocal.x, vLocal.y) - c; // upright bars
            float w = 0.055;
            vec2 q = abs(p) - vec2(0.0, heights[i] - w);
            float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - w;   // capsule
            m = max(m, 1.0 - smoothstep(-0.01, 0.01, d));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.3, 0.14), m * sideMask); // deep green, like the toe of the midsole
        }`);
    }
    sh.fragmentShader = f;
  };
}

function buildSpike() {
  const shoe = new THREE.Group();
  const meshes = [];
  const add = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; shoe.add(m); meshes.push(m); return m; };

  // --- upper: gold diamond knit, a touch deeper toward the toe and the bottom edge
  const gold = new THREE.Color(0xf6b70a), deepGold = new THREE.Color(0xe08f00), toeTint = new THREE.Color(0x9fbf1c);
  const upperGeo = loft({
    x0: 0, x1: LEN, nu: 200, nv: 72, section: upperSection, uvScale: 2.2,
    colorAt: (x, h) => gold.clone().lerp(deepGold, 1 - smooth(0.0, 0.35, h)).lerp(toeTint, smooth(8.6, 10, x) * 0.35),
  });
  const knit = knitTexture();
  const upperMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, map: knit, bumpMap: knit, bumpScale: 2.2,
    roughness: 0.78, metalness: 0, sheen: 0.35, sheenColor: new THREE.Color(0xfff0b0), sheenRoughness: 0.7,
  });
  cutCollar(upperMat, true);
  add(new THREE.Mesh(upperGeo, upperMat));

  // lining: the inside of the same surface, seen through the foot opening
  // a shadowed gold, like the inside of the knit, so the opening reads as depth, not a flat cream patch
  const liningMat = new THREE.MeshStandardMaterial({ color: 0x8a6512, roughness: 0.95, side: THREE.BackSide });
  cutCollar(liningMat, false);
  add(new THREE.Mesh(upperGeo, liningMat), false);

  // insole, visible inside the opening
  const insole = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshStandardMaterial({ color: 0x2b2116, roughness: 0.9, side: THREE.DoubleSide }));
  insole.rotation.x = -Math.PI / 2;
  insole.scale.set(1.25, 0.5, 1);
  insole.position.set(COLLAR.cx, foamTop(COLLAR.cx) + 0.06, 0);
  add(insole, false);

  // padded collar rim around the opening
  const rim = [];
  for (let k = 0; k < 72; k++) {
    const t = (k / 72) * Math.PI * 2;
    rim.push(surfaceAt(COLLAR.cx + COLLAR.rx * Math.cos(t), COLLAR.rz * Math.sin(t)));
  }
  add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 144, 0.075, 12, true),
    new THREE.MeshStandardMaterial({ color: 0xf3c43a, roughness: 0.75 }),
  ));

  // --- midsole: full-length foam, cream at the heel fading to lime and deep green at the toe
  const cream = new THREE.Color(0xf1e8d0), limeFoam = new THREE.Color(0xc4dc3c), green = new THREE.Color(0x2c8a3c), deepGreen = new THREE.Color(0x0e4c24);
  const foamGeo = loft({
    x0: 0, x1: 9.92, nu: 160, nv: 44,
    // the height closes along with the width at each end, so the tips are rounded, not thin blades
    section: slabSection(
      (x) => { const a = groundY(x), b = foamTop(x) + 0.03, k = Math.pow(endRound(x), 0.3); return (a + b) / 2 - ((b - a) / 2) * k; },
      (x) => { const a = groundY(x), b = foamTop(x) + 0.03, k = Math.pow(endRound(x), 0.3); return (a + b) / 2 + ((b - a) / 2) * k; },
      (x) => halfW(x) * 1.08 + 0.04 * endRound(x), 0.32, 0.42),
    colorAt: (x, h) => {
      const c = cream.clone().lerp(limeFoam, smooth(2.2, 5.0, x)).lerp(green, smooth(5.0, 7.8, x)).lerp(deepGreen, smooth(7.8, 9.9, x));
      return c.lerp(new THREE.Color(0xffffff), 0.08 * smooth(0.6, 1, h)); // slightly lighter top edge
    },
  });
  add(new THREE.Mesh(foamGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 })));

  // heel rubber pad
  const pad = loft({
    x0: 0.15, x1: 2.6, nu: 40, nv: 24,
    section: slabSection((x) => groundY(x) - 0.04, (x) => groundY(x) + 0.03, (x) => halfW(x) * 0.95 * smooth(0.15, 0.5, x) * (1 - smooth(2.2, 2.6, x)) + 0.0001, 0.2, 0.3),
  });
  add(new THREE.Mesh(pad, new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.9 })));

  // --- spike plate: translucent lime, under the forefoot, lipping up the sides a little
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: 0xa6e22e, roughness: 0.32, metalness: 0, transmission: 0.45, thickness: 0.4, ior: 1.45,
    clearcoat: 0.6, attenuationColor: new THREE.Color(0x6f9a14), attenuationDistance: 1.2,
  });
  const plateGeo = loft({
    // it tapers shut under the forefoot, well behind the foam's toe, so nothing pokes out in front
    x0: 3.4, x1: 9.0, nu: 120, nv: 40,
    section: slabSection(
      (x) => groundY(x) - 0.06 * (1 - 0.8 * smooth(8.3, 9.0, x)),
      (x) => groundY(x) + (0.09 + 0.06 * smooth(4, 6, x)) * (1 - 0.85 * smooth(8.3, 9.0, x)),
      (x) => (halfW(x) * 1.09 + 0.03) * smooth(3.4, 4.2, x) * (1 - smooth(8.5, 9.0, x)) + 0.0001, 0.2, 0.25),
  });
  add(new THREE.Mesh(plateGeo, plateMat));

  // traction nubs on the plate, and gold spike pins
  const nubSpots = [];
  for (let x = 3.9, row = 0; x <= 6.6; x += 0.24, row++) { // only on the flat forefoot, not where the toe curls up
    const w = halfW(x) * 0.8 - 0.06;
    for (let z = -w + (row % 2) * 0.11; z <= w; z += 0.22) nubSpots.push([x, z]);
  }
  const nubGeo = new THREE.ConeGeometry(0.055, 0.11, 6);
  nubGeo.rotateX(Math.PI);
  const nubs = new THREE.InstancedMesh(nubGeo, new THREE.MeshStandardMaterial({ color: 0xbfe84a, roughness: 0.4 }), nubSpots.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  nubSpots.forEach(([x, z], i) => {
    q.setFromEuler(new THREE.Euler(0, 0, Math.atan2(groundY(x + 0.05) - groundY(x - 0.05), 0.1)));
    mtx.compose(new THREE.Vector3(x, groundY(x) - 0.1, z), q, one);
    nubs.setMatrixAt(i, mtx);
  });
  nubs.castShadow = true;
  shoe.add(nubs);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xd6a63a, metalness: 1, roughness: 0.22 });
  const pinGeo = new THREE.ConeGeometry(0.075, 0.36, 24);
  pinGeo.rotateX(Math.PI);
  const baseGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 24);
  [[4.6, 0.6], [4.6, -0.6], [6.0, 0.82], [6.0, -0.82], [7.4, 0.76], [7.4, -0.76], [8.3, 0.5], [8.3, -0.5]].forEach(([x, zf]) => {
    const tilt = Math.atan2(groundY(x + 0.05) - groundY(x - 0.05), 0.1);
    const g = new THREE.Group();
    const base = new THREE.Mesh(baseGeo, pinMat); base.position.y = -0.02;
    const pin = new THREE.Mesh(pinGeo, pinMat); pin.position.y = -0.22;
    g.add(base, pin);
    g.position.set(x, groundY(x) - 0.07, zf);
    g.rotation.z = tilt;
    shoe.add(g);
  });

  // --- lacing: ghillie loops up each side, flat ribbon laces criss-crossing through them
  const loopMat = new THREE.MeshStandardMaterial({ color: 0xf2a400, roughness: 0.7 });
  const laceMat = new THREE.MeshStandardMaterial({ color: 0xf7c23a, roughness: 0.65, side: THREE.DoubleSide });
  const rows = [3.4, 3.97, 4.54, 5.11, 5.68, 6.25, 6.82];
  const loopAt = (x, side) => surfaceAt(x, side * 0.4).add(new THREE.Vector3(0, 0.09, 0));
  rows.forEach((x) => {
    for (const side of [1, -1]) {
      const p = surfaceAt(x, side * 0.4);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 20, Math.PI), loopMat);
      loop.position.copy(p);
      loop.rotation.set(side * 0.55, 0, 0);
      add(loop);
    }
  });
  const laceShape = roundedRect(0.032, 0.13, 0.014, 3); // flat: thin vertically, wide sideways
  const lace = (a, b, arch = 0.07) => {
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, arch, 0));
    add(new THREE.Mesh(sweep(new THREE.QuadraticBezierCurve3(a, mid, b), laceShape, { samples: 20, side: new THREE.Vector3(0, 1, 0) }), laceMat));
  };
  for (let k = 0; k < rows.length - 1; k++) {
    lace(loopAt(rows[k], 1), loopAt(rows[k + 1], -1));
    lace(loopAt(rows[k], -1), loopAt(rows[k + 1], 1), 0.1);
  }
  lace(loopAt(rows[rows.length - 1], 1), loopAt(rows[rows.length - 1], -1), 0.05);
  // the bow at the top of the lacing
  const knot = loopAt(rows[0], 0).add(new THREE.Vector3(0, 0.06, 0));
  for (const side of [1, -1]) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.038, 8, 28), laceMat);
    bow.scale.set(1, 0.5, 1);
    bow.position.copy(knot).add(new THREE.Vector3(-0.12, 0.1, side * 0.28));
    bow.rotation.set(Math.PI / 2 - 0.45, side * 0.55, 0);
    add(bow);
    const tail = [knot.clone(), knot.clone().add(new THREE.Vector3(-0.28, 0.02, side * 0.46)), knot.clone().add(new THREE.Vector3(-0.5, -0.42, side * 0.78))];
    add(new THREE.Mesh(sweep(new THREE.CatmullRomCurve3(tail), laceShape, { samples: 20, side: new THREE.Vector3(0, 1, 0) }), laceMat));
  }

  // --- heel: pull tab rising off the Achilles peak, and a round lime badge on the back
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf2a400, roughness: 0.6 }));
  tab.position.set(0.16, topY(0.16) - 0.04, 0);
  tab.rotation.z = 0.55;
  add(tab);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshPhysicalMaterial({ color: 0xa6e22e, roughness: 0.3, clearcoat: 1, emissive: 0x2a3a00 }));
  badge.position.set(0.035, foamTop(0) + 0.72, 0);
  badge.rotation.y = -Math.PI / 2;
  add(badge, false);

  // real-shoe proportions: about 3 times as long as it is tall, and wider through the
  // forefoot (the profile curves above are drawn long; this brings it back to scale)
  const SX = 0.76, SZ = 1.32;
  shoe.scale.set(SX, 1, SZ);
  shoe.position.set(-5 * SX, -1.2, 0); // center the shoe on its pivot
  const pivot = new THREE.Group();
  pivot.add(shoe);
  return pivot;
}

// A real, scanned or modeled spike can replace the built-in one: put a glTF binary in
// assets/models/ and name it on the canvas, e.g. data-glb="assets/models/spike.glb".
// It's centered and scaled to fit automatically.
async function loadRealSpike(pivot, url) {
  if (!url) return false;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(10 / Math.max(size.x, size.y, size.z)); // same length as the built-in shoe
    pivot.clear();
    pivot.add(holder);
    return true;
  } catch {
    return false; // keep the built-in shoe
  }
}

function initSpike(canvas) {
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: 28, distance: 16.5, fitWidth: 11, lights: 'studio', shadows: true });
  const spike = buildSpike();
  // a tilted stage, angled toward the viewer like a product shot
  const tilt = new THREE.Group();
  tilt.rotation.set(0.3, 0, -0.06);
  tilt.position.y = -0.9;
  tilt.add(spike);
  scene.add(tilt);
  loadRealSpike(spike, canvas.dataset.glb);

  // a short strip of clay running track under the shoe, with a white lane line and a volt
  // tick mark where the shoe lands (the track doesn't turn with the shoe)
  const TRACK_Y = -1.62;
  const track = new THREE.Group();
  const clay = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.24, 3.4), new THREE.MeshStandardMaterial({ color: 0xb44a31, roughness: 0.92 }));
  clay.receiveShadow = true;
  track.add(clay);
  const line = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.012, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  line.position.set(0, 0.126, 1.45);
  track.add(line);
  const tickMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 3.4), tickMat);
  tick.position.y = 0.127;
  track.add(tick);
  track.position.y = TRACK_Y - 0.12;
  tilt.add(track);
  const VOLT = new THREE.Color(0xe8f02a), WHITE = new THREE.Color(0xffffff);

  // Scroll drives it: as Step 1 passes through the screen the shoe turns and steps down onto
  // the track, landing halfway through with a small squash, as the tick flashes volt. Dragging
  // still turns it on top of that. With reduced motion it simply rests on the track.
  const section = canvas.closest('section') || canvas;
  const progress = () => {
    const r = section.getBoundingClientRect();
    return clamp((window.innerHeight - r.top) / (window.innerHeight + r.height), 0, 1);
  };
  let landed = false, landAt = -1, flash = 0;
  runWhileVisible(canvas, (now) => {
    const p = reduceMotion ? 1 : progress();
    const d = clamp(p / 0.5, 0, 1);                       // 0 high above the track … 1 landed
    const height = reduceMotion ? 0 : 2.6 * Math.pow(1 - d, 2);
    if (!landed && d >= 1) { landed = true; landAt = now; }
    if (landed && d < 0.98) landed = false;               // scrolled back up: it can land again
    const since = landAt < 0 ? 1e9 : now - landAt;
    const squash = since < 220 ? 1 - 0.06 * Math.sin((since / 220) * Math.PI) : 1;
    spike.position.y = height;
    spike.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5);
    // it turns as it comes down, arriving at its three-quarter view as it lands, then drifts a little further
    spike.rotation.set(0, -2.55 + (1 - d) * 2.4 - Math.max(0, p - 0.5) * 0.9 + drag.offset, 0);
    // the tick: flashes volt on landing, and pulses gently on each beat while it's on screen
    const ph = reduceMotion ? 1 : tempo().phase(now);
    flash = Math.max(since < 400 ? 1 - since / 400 : 0, ph < 0.15 ? (1 - ph / 0.15) * 0.6 : 0);
    tickMat.color.copy(WHITE).lerp(VOLT, flash);
    tick.scale.set(1 + flash * 1.5, 1, 1);
  }, () => renderer.render(scene, camera));
}

/* ----------------------------------------------------------------------
   Garmin-style GPS watch (fenix / Forerunner look)
   ---------------------------------------------------------------------- */
function drawFace(g, size, bpm) {
  const m = size / 2;
  g.fillStyle = '#030405'; g.fillRect(0, 0, size, size);
  // outer status arcs, like Garmin's body-battery / training-load rings
  g.lineCap = 'round';
  const arc = (from, to, color, w = 16, r = m - 34) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(m, m, r, from, to); g.stroke(); };
  arc(Math.PI * 0.78, Math.PI * 1.22, 'rgba(255,255,255,.12)');
  arc(Math.PI * 0.78, Math.PI * 1.08, '#38b6ff');
  arc(Math.PI * 1.78, Math.PI * 2.22, 'rgba(255,255,255,.12)');
  arc(Math.PI * 1.78, Math.PI * 1.78 + Math.PI * 0.44 * clamp(bpm / 210, 0, 1), '#E8F02A');
  // minute ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, long = i % 5 === 0;
    g.strokeStyle = long ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.25)';
    g.lineWidth = long ? 5 : 2;
    g.beginPath();
    g.moveTo(m + Math.cos(a) * (m - 8), m + Math.sin(a) * (m - 8));
    g.lineTo(m + Math.cos(a) * (m - (long ? 22 : 16)), m + Math.sin(a) * (m - (long ? 22 : 16)));
    g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  // date
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.font = '600 34px ui-monospace, "SF Mono", Menlo, monospace';
  g.fillText('SAT 01', m, m - 150);
  // big two-tone time, the Garmin signature
  g.font = '700 205px "Atkinson Hyperlegible", Helvetica, Arial, sans-serif';
  g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.fillText('10', m - 6, m + 60);
  g.textAlign = 'left'; g.fillStyle = '#E8F02A'; g.fillText('10', m + 6, m + 60);
  // three data complications: heart rate, cadence (highlighted), music tempo
  const comp = (x, label, value, accent) => {
    g.lineWidth = 6;
    g.strokeStyle = accent ? '#E8F02A' : 'rgba(255,255,255,.3)';
    g.beginPath(); g.arc(x, m + 165, 58, 0, Math.PI * 2); g.stroke();
    g.textAlign = 'center';
    g.fillStyle = accent ? '#E8F02A' : '#ffffff';
    g.font = '800 46px "Atkinson Hyperlegible", Helvetica, Arial, sans-serif';
    g.fillText(value, x, m + 172);
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.font = '600 20px ui-monospace, "SF Mono", Menlo, monospace';
    g.fillText(label, x, m + 200);
  };
  comp(m - 140, '♥ BPM', '148', false);
  comp(m, 'SPM', String(bpm), true);
  comp(m + 140, '♪ BPM', String(bpm), false);
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.font = '600 22px ui-monospace, "SF Mono", Menlo, monospace';
  g.fillText('ADAGIO', m, m - 112);
}

function bezelLabels() {
  const size = 1024, m = size / 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.fillStyle = 'rgba(235,235,235,.8)';
  g.font = '700 30px "Atkinson Hyperlegible", Helvetica, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // labels sit next to the buttons, written around the ring
  const r = m * 0.905;
  [['LIGHT', 150], ['UP', 190], ['DOWN', 228], ['START', 32], ['BACK', -32]].forEach(([t, deg]) => {
    const a = (-deg * Math.PI) / 180; // canvas y runs down
    g.save();
    g.translate(m + Math.cos(a) * r, m + Math.sin(a) * r);
    g.rotate(Math.sin(a) > 0 ? a - Math.PI / 2 : a + Math.PI / 2); // keep the words upright
    g.fillText(t, 0, 0);
    g.restore();
  });
  // small minute numerals at the top and bottom
  g.font = '700 26px "Atkinson Hyperlegible", Helvetica, Arial, sans-serif';
  [['60', -90], ['30', 90]].forEach(([t, deg]) => {
    const a = (deg * Math.PI) / 180;
    g.fillText(t, m + Math.cos(a) * r, m + Math.sin(a) * r);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildWatch() {
  const watch = new THREE.Group();
  const R = 2.4;
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.45 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 1, roughness: 0.32, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9ea5, metalness: 1, roughness: 0.25 });
  const silicone = new THREE.MeshPhysicalMaterial({ color: 0x1c1e21, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color(0x777777) });

  // case body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 1.0, 96), caseMat);
  body.rotation.x = Math.PI / 2;
  watch.add(body);

  // flat-topped titanium bezel with a chamfered outer edge (lathe profile)
  const profile = [[2.0, 0.42], [2.0, 0.6], [2.06, 0.64], [2.42, 0.64], [2.52, 0.54], [2.52, 0.3]].map(([r, y]) => new THREE.Vector2(r, y));
  const bezelGeo = new THREE.LatheGeometry(profile, 128);
  bezelGeo.rotateX(Math.PI / 2);
  watch.add(new THREE.Mesh(bezelGeo, titanium));
  // engraved labels on the bezel
  const labels = new THREE.Mesh(new THREE.RingGeometry(2.06, 2.42, 128), new THREE.MeshBasicMaterial({ map: bezelLabels(), transparent: true }));
  labels.position.z = 0.645;
  watch.add(labels);
  // four bezel screws
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), steel);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(Math.cos(a) * 2.26, Math.sin(a) * 2.26, 0.665);
    watch.add(screw);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.02), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    slot.position.set(Math.cos(a) * 2.26, Math.sin(a) * 2.26, 0.69);
    slot.rotation.z = a + 0.6;
    watch.add(slot);
  }

  // screen (unlit, so it glows) under a glossy sapphire cover
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 768;
  drawFace(faceCanvas.getContext('2d'), 768, tempo().bpm);
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 8;
  const screen = new THREE.Mesh(new THREE.CircleGeometry(2.0, 96), new THREE.MeshBasicMaterial({ map: faceTex }));
  screen.position.z = 0.53; // just above the case's top cap
  watch.add(screen);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(2.0, 96),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.02, clearcoat: 1, envMapIntensity: 1.8 }),
  );
  glass.position.z = 0.57;
  watch.add(glass);

  // five buttons: LIGHT, UP, DOWN on the left; START (accent ring) and BACK on the right
  const btnGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.42, 28);
  [[150, false], [190, false], [228, false], [32, true], [-32, false]].forEach(([deg, accent]) => {
    const a = (deg * Math.PI) / 180;
    const b = new THREE.Mesh(btnGeo, steel);
    b.position.set(Math.cos(a) * (R + 0.14), Math.sin(a) * (R + 0.14), 0.02);
    b.rotation.z = a - Math.PI / 2;
    watch.add(b);
    if (accent) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0xe8f02a, emissive: 0x4a4d00, roughness: 0.4 }));
      ring.position.set(Math.cos(a) * (R + 0.3), Math.sin(a) * (R + 0.3), 0.02);
      ring.rotation.z = a - Math.PI / 2;
      watch.add(ring);
    }
  });

  // lugs + a smooth silicone strap curving back around the wrist, with holes on the bottom half
  const strapOutline = roundedRect(1.84, 0.3, 0.12);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
  const wrist = new THREE.Vector3(0, 0, -2.5);
  for (const dir of [1, -1]) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 0.75), caseMat);
    lug.position.set(0, dir * (R - 0.1), -0.08);
    watch.add(lug);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, dir * (R - 0.25), -0.1),
      new THREE.Vector3(0, dir * (R + 0.6), -0.2),
      new THREE.Vector3(0, dir * (R + 1.3), -0.75),
      new THREE.Vector3(0, dir * (R + 1.65), -1.7),
      new THREE.Vector3(0, dir * (R + 1.6), -2.8),
    ]);
    const strapMat = silicone.clone(); strapMat.side = THREE.DoubleSide;
    const strap = new THREE.Mesh(sweep(path, strapOutline, { samples: 70 }), strapMat);
    watch.add(strap);
    if (dir < 0) {
      for (let k = 0; k < 6; k++) {
        const p = path.getPointAt(0.32 + k * 0.1);
        const out = new THREE.Vector3(0, p.y - wrist.y, p.z - wrist.z).normalize();
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), holeMat);
        hole.position.copy(p).addScaledVector(out, 0.155);
        hole.lookAt(p.clone().addScaledVector(out, 2));
        watch.add(hole);
      }
    }
  }

  // caseback
  const back = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.2, 64), caseMat);
  back.rotation.x = Math.PI / 2;
  back.position.z = -0.58;
  watch.add(back);

  watch.userData.setBPM = (bpm) => { drawFace(faceCanvas.getContext('2d'), 768, bpm); faceTex.needsUpdate = true; };
  return watch;
}

function initWatch(canvas) {
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: 30, distance: 16.5, fitWidth: 8.5 });
  const watch = buildWatch();
  scene.add(watch);
  document.addEventListener('adagio:bpm', (e) => watch.userData.setBPM(e.detail));
  if (document.fonts) document.fonts.ready.then(() => watch.userData.setBPM(tempo().bpm)); // redraw once fonts load

  // it holds still at a three-quarter view and turns only while you drag it; the face
  // keeps showing the live SPM and BPM
  runWhileVisible(canvas, () => {
    watch.rotation.set(-0.3, -0.4 + drag.offset, 0.1);
  }, () => renderer.render(scene, camera));
}

/* ----------------------------------------------------------------------
   Apple Watch (Haptic Mode): midnight aluminum case with rounded edges, an
   all-glass front, the digital crown (ridged, with its red ring) and the long
   side button, a sport band with pin holes. It gives a small "haptic" tap on
   every beat, and turns a full circle when the music staff passes by.
   ---------------------------------------------------------------------- */
// Apple-style "continuous" corners: each corner is a superellipse that eases into the
// straight edge (the curvature builds up gradually) instead of a circular arc that snaps
// onto it. That's what makes an iPhone or Apple Watch corner look right.
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const e = Math.min(r * 1.28, w / 2, h / 2); // continuous corners reach further along each edge
  const k = 2 / 5;                             // superellipse exponent 5
  const corners = [[w / 2 - e, -h / 2 + e, -Math.PI / 2], [w / 2 - e, h / 2 - e, 0], [-w / 2 + e, h / 2 - e, Math.PI / 2], [-w / 2 + e, -h / 2 + e, Math.PI]];
  let first = true;
  corners.forEach(([cx, cy, a0]) => {
    for (let i = 0; i <= 16; i++) {
      const a = a0 + (i / 16) * (Math.PI / 2);
      const c = Math.cos(a), sn = Math.sin(a);
      const x = cx + e * Math.sign(c) * Math.pow(Math.abs(c), k);
      const y = cy + e * Math.sign(sn) * Math.pow(Math.abs(sn), k);
      if (first) { s.moveTo(x, y); first = false; } else s.lineTo(x, y);
    }
  });
  s.closePath();
  return s;
}

function drawAppleFace(g, W, H, bpm) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#A6E22E'; g.font = '600 34px -apple-system, "SF Pro Text", Archivo, sans-serif';
  g.textAlign = 'left'; g.fillText('Haptic', 46, 78);
  g.fillStyle = '#fff'; g.textAlign = 'right'; g.fillText('10:09', W - 46, 78);
  // target ring
  const cx = W / 2, cy = H * 0.52, r = W * 0.3;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(166,226,46,.22)'; g.lineWidth = 26;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#A6E22E';
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, bpm / 200)); g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#fff'; g.font = '800 120px -apple-system, "SF Pro Display", Archivo, sans-serif';
  g.fillText(String(bpm), cx, cy + 40);
  g.fillStyle = 'rgba(255,255,255,.65)'; g.font = '600 30px -apple-system, "SF Pro Text", Archivo, sans-serif';
  g.fillText('SPM target', cx, cy + 84);
  g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '600 30px -apple-system, "SF Pro Text", Archivo, sans-serif';
  g.fillText('On pace', cx, H - 62);
}

function buildAppleWatch() {
  const watch = new THREE.Group();
  const W = 3.2, H = 3.9, R = 0.95, D = 0.6, BEV = 0.24;
  const alu = new THREE.MeshPhysicalMaterial({ color: 0x2c3036, metalness: 0.85, roughness: 0.32, clearcoat: 0.4 });
  const caseGeo = new THREE.ExtrudeGeometry(roundedRectShape(W, H, R), { depth: D, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 10, curveSegments: 24 });
  caseGeo.translate(0, 0, -D / 2);
  watch.add(new THREE.Mesh(caseGeo, alu));
  const front = D / 2 + BEV; // z of the front face

  // all-glass front: black glass edge to edge, the display inset inside it
  const glassGeo = new THREE.ShapeGeometry(roundedRectShape(W + BEV * 1.6, H + BEV * 1.6, R + BEV * 0.8), 24);
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }));
  glass.position.z = front + 0.012;
  watch.add(glass);
  // the display shows the real Adagio watch app (assets/screens/watch-*.jpg), cycling
  // through its cue screens; a drawn face stands in until the first one loads
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 600; faceCanvas.height = 720;
  drawAppleFace(faceCanvas.getContext('2d'), 600, 720, tempo().bpm);
  let faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const loader = new THREE.TextureLoader();
  const watchScreens = ['assets/screens/watch-1-speed-up.jpg', 'assets/screens/watch-2-try-cues.jpg', 'assets/screens/watch-3-try-cues-more.jpg']
    .map((src) => { const t = loader.load(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const dispGeo = new THREE.ShapeGeometry(roundedRectShape(W - 0.15, H - 0.15, R - 0.12), 24);
  // map the shape's x/y onto the texture
  const uv = dispGeo.attributes.uv, pos = dispGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (W - 0.15) + 0.5, pos.getY(i) / (H - 0.15) + 0.5);
  const display = new THREE.Mesh(dispGeo, new THREE.MeshBasicMaterial({ map: faceTex }));
  display.position.z = front + 0.016;
  watch.add(display);
  let screenIdx = 0;
  const showScreen = () => { display.material.map = watchScreens[screenIdx]; display.material.needsUpdate = true; };
  loader.manager.onLoad = showScreen; // swap in the real screens once they've loaded
  if (!reduceMotion) setInterval(() => { if (document.hidden) return; screenIdx = (screenIdx + 1) % watchScreens.length; showScreen(); }, 3600);
  const sheen = new THREE.Mesh(glassGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0, clearcoat: 1, envMapIntensity: 2 }));
  sheen.position.z = front + 0.03;
  watch.add(sheen);

  // digital crown: ridged (a striped bump map around it) with a red ring on its face
  const ridge = document.createElement('canvas');
  ridge.width = 256; ridge.height = 4;
  const rg = ridge.getContext('2d');
  for (let i = 0; i < 64; i++) { rg.fillStyle = i % 2 ? '#222' : '#ddd'; rg.fillRect(i * 4, 0, 4, 4); }
  const ridgeTex = new THREE.CanvasTexture(ridge);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.9, roughness: 0.3, bumpMap: ridgeTex, bumpScale: 2 });
  const edge = W / 2 + BEV;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.34, 48), crownMat);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(edge + 0.14, 0.72, 0);
  watch.add(crown);
  const red = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 10, 40), new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.4 }));
  red.rotation.y = Math.PI / 2;
  red.position.set(edge + 0.315, 0.72, 0);
  watch.add(red);
  // side button: long and flat, below the crown
  const btn = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.95, 8, 16), new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.85, roughness: 0.35 }));
  btn.scale.set(0.55, 1, 1);
  btn.position.set(edge + 0.02, -0.55, 0);
  watch.add(btn);

  // sport band, curving back around the wrist, with pin holes on the lower half
  const band = new THREE.MeshPhysicalMaterial({ color: 0x1b1d21, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0x666666), side: THREE.DoubleSide });
  const bandOutline = roundedRect(2.45, 0.32, 0.14);
  for (const dir of [1, -1]) {
    const y0 = dir * (H / 2 + BEV - 0.1);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, y0, -0.05),
      new THREE.Vector3(0, y0 + dir * 0.8, -0.15),
      new THREE.Vector3(0, y0 + dir * 1.5, -0.7),
      new THREE.Vector3(0, y0 + dir * 1.85, -1.7),
      new THREE.Vector3(0, y0 + dir * 1.8, -2.8),
    ]);
    watch.add(new THREE.Mesh(sweep(path, bandOutline, { samples: 70 }), band));
    if (dir < 0) {
      const wrist = new THREE.Vector3(0, 0, -2.4);
      for (let k = 0; k < 5; k++) {
        const p = path.getPointAt(0.35 + k * 0.11);
        const out = new THREE.Vector3(0, p.y - wrist.y, p.z - wrist.z).normalize();
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.09, 18), new THREE.MeshBasicMaterial({ color: 0x050506 }));
        hole.position.copy(p).addScaledVector(out, 0.17);
        hole.lookAt(p.clone().addScaledVector(out, 2));
        watch.add(hole);
      }
    }
  }
  // sensor dome on the back
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(1.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 5), new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, roughness: 0.2, clearcoat: 1 }));
  sensor.rotation.x = -Math.PI / 2;
  sensor.position.z = -front + 0.85;
  watch.add(sensor);

  watch.userData.setBPM = () => {}; // the real screens don't follow the page tempo
  return watch;
}

function initAppleWatch(canvas) {
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: 30, distance: 15.5, fitWidth: 7.5, lights: 'studio' });
  const watch = buildAppleWatch();
  scene.add(watch);
  document.addEventListener('adagio:bpm', (e) => watch.userData.setBPM(e.detail));
  if (document.fonts) document.fonts.ready.then(() => watch.userData.setBPM(tempo().bpm));
  // the haptic pulse, the point of this section: on every beat at the page tempo the watch gives a
  // small scale bump and a thin ring (rubber, the section's ink color) spreads out from it and fades
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x16110e, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 128), ringMat);
  ring.position.z = -1.2;
  scene.add(ring);
  let beatAt = -1, lastCount = -1;
  runWhileVisible(canvas, (now) => {
    const t = tempo();
    if (!reduceMotion && t.count !== lastCount) { lastCount = t.count; beatAt = now; }
    const age = beatAt < 0 ? 1 : clamp((now - beatAt) / 900, 0, 1);
    const bump = reduceMotion ? 0 : Math.max(0, 1 - (now - beatAt) / 140);
    watch.scale.setScalar(1 + 0.035 * bump);
    watch.rotation.set(-0.22, 0.5 + drag.offset, 0.08);
    ring.scale.setScalar(2.3 + age * 2.2);
    ringMat.opacity = reduceMotion ? 0 : (1 - age) * 0.7;
  }, () => renderer.render(scene, camera));
}

/* ----------------------------------------------------------------------
   iPhone (hero): black titanium body with flat edges, black-glass front with the
   Dynamic Island, the real Adagio screens cycling on the display, the triple-camera
   plateau and flash on the back, and the side buttons (action, volume, power, camera
   control). It does one full turn when it first appears, then sways gently and leans
   toward the pointer; drag to turn it.
   ---------------------------------------------------------------------- */
const PHONE_SCREENS = ['4-run-on-target', '1-run-speed-up', '5-set-up-run', '2-summary'].map((n) => `assets/screens/${n}.jpg`);

function buildIPhone() {
  const phone = new THREE.Group();
  const W = 3.6, H = 7.8, R = 0.6, D = 0.3, BEV = 0.07; // iPhone 16 Pro proportions: corner radius about 1/6 of the width
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0x3a3a3d, metalness: 1, roughness: 0.38, clearcoat: 0.3 });
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(W, H, R), { depth: D, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 6, curveSegments: 32 });
  bodyGeo.translate(0, 0, -D / 2);
  phone.add(new THREE.Mesh(bodyGeo, titanium));
  const front = D / 2 + BEV;

  // front: black glass edge to edge, the display inset, the Dynamic Island on top
  const glassFront = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(W + BEV, H + BEV, R + BEV / 2), 32),
    new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 }));
  glassFront.position.z = front + 0.004;
  phone.add(glassFront);
  const dw = W - 0.26, dh = H - 0.26;
  const dispGeo = new THREE.ShapeGeometry(roundedRectShape(dw, dh, R - 0.12), 32);
  const uv = dispGeo.attributes.uv, pos = dispGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / dw + 0.5, pos.getY(i) / dh + 0.5);
  const loader = new THREE.TextureLoader();
  const screens = PHONE_SCREENS.map((src) => { const t = loader.load(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const display = new THREE.Mesh(dispGeo, new THREE.MeshBasicMaterial({ map: screens[0], toneMapped: false }));
  display.position.z = front + 0.008;
  phone.add(display);
  const island = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(1.05, 0.32, 0.16), 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, dh / 2 - 0.3, front + 0.012);
  phone.add(island);
  const glare = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(W, H, R), 32),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0, clearcoat: 1, envMapIntensity: 2.5 }));
  glare.position.z = front + 0.016;
  phone.add(glare);

  // back: frosted glass with the camera plateau, three lenses and the flash
  const back = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(W + BEV, H + BEV, R + BEV / 2), 32),
    new THREE.MeshPhysicalMaterial({ color: 0x2f3033, roughness: 0.5, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.6, side: THREE.DoubleSide }));
  back.position.z = -front - 0.004;
  phone.add(back);
  const bumpGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.62, 1.62, 0.46), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 16 });
  const bump = new THREE.Mesh(bumpGeo, new THREE.MeshPhysicalMaterial({ color: 0x35363a, roughness: 0.25, metalness: 0.2, clearcoat: 1 }));
  bump.rotation.y = Math.PI; // faces backward
  const bx = W / 2 - 0.98, by = H / 2 - 0.98; // top-left when you look at the back
  bump.position.set(bx, by, -front - 0.004);
  phone.add(bump);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4e, metalness: 1, roughness: 0.25 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x05070c, roughness: 0.05, clearcoat: 1, metalness: 0.2 });
  [[-0.36, 0.36], [-0.36, -0.36], [0.36, 0]].forEach(([dx, dy]) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(bx + dx, by + dy, -front - 0.17);
    phone.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.22, 40), lensMat);
    glass.rotation.y = Math.PI;
    glass.position.set(bx + dx, by + dy, -front - 0.232);
    phone.add(glass);
  });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0x332a10 }));
  flash.rotation.y = Math.PI;
  flash.position.set(bx + 0.42, by + 0.6, -front - 0.122);
  phone.add(flash);

  // side buttons: action and volume on the left, power and camera control on the right
  const btnMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3d, metalness: 1, roughness: 0.32 });
  const sideBtn = (x, y, len) => {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, len, 6, 12), btnMat);
    b.scale.set(1, 1, 1.6);
    b.position.set(x, y, 0);
    phone.add(b);
  };
  const edge = W / 2 + BEV;
  sideBtn(-edge - 0.02, 2.55, 0.28);   // action
  sideBtn(-edge - 0.02, 1.75, 0.55);   // volume up
  sideBtn(-edge - 0.02, 0.95, 0.55);   // volume down
  sideBtn(edge + 0.02, 1.55, 0.85);    // power
  sideBtn(edge + 0.01, -0.95, 0.42);   // camera control

  phone.userData.screens = screens;
  phone.userData.display = display;
  return phone;
}

function initIPhone(canvas) {
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: 30, distance: 18.5, fitWidth: 6, lights: 'studio' });
  const phone = buildIPhone();
  scene.add(phone);

  // it holds still on the run screen and turns only while you drag it
  runWhileVisible(canvas, () => {
    phone.rotation.set(0.06, -0.38 + drag.offset, 0.04);
  }, () => renderer.render(scene, camera));
}

/* ---------------------------------------------------------------------- */
function supportsWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (supportsWebGL()) {
  document.documentElement.classList.add('has-3d');
  const spikeCanvas = document.querySelector('[data-model="spike"]');
  const watchCanvas = document.querySelector('[data-model="watch"]');
  const appleCanvas = document.querySelector('[data-model="applewatch"]');
  if (spikeCanvas) initSpike(spikeCanvas);
  if (watchCanvas) initWatch(watchCanvas);
  if (appleCanvas) initAppleWatch(appleCanvas);
  const phoneCanvas = document.querySelector('[data-model="iphone"]');
  if (phoneCanvas) initIPhone(phoneCanvas);
}
