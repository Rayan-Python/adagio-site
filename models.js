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
function makeStage(canvas, { fov = 30, distance = 14, fitWidth = 0, lights = 'neon' } = {}) {
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
  if (lights === 'neon') {
    // a lime rim from behind-left and a pink rim from the right
    const lime = new THREE.PointLight(0xa6e22e, 60, 30); lime.position.set(-7, 2, -4); scene.add(lime);
    const pink = new THREE.PointLight(0xff3d8b, 30, 30); pink.position.set(7, -2, -3); scene.add(pink);
  } else {
    // product-shot studio: warm fill from the left, white rim from behind
    const fill = new THREE.DirectionalLight(0xfff1dc, 0.7); fill.position.set(-6, 2, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(-2, 5, -8); scene.add(rim);
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
   Track spike
   ---------------------------------------------------------------------- */
const LEN = 10; // heel at x = 0, toe at x = 10
const groundY = (x) => (x < 6.3 ? 0 : 0.62 * Math.pow((x - 6.3) / 3.7, 2.2)); // toe spring
const stackH = (x) => lerp(0.62, 0.2, smooth(0.6, 5.0, x));                      // heel foam → thin plate
const baseY = (x) => groundY(x) + stackH(x);                                     // where the upper starts
// low and long, like a modern distance spike: tall padded heel, a long sloping vamp to a pointed toe
const topRaw = curve([[0, 2.62], [0.35, 2.88], [1.1, 2.5], [2.2, 2.36], [3.2, 2.5], [3.9, 2.5], [5.4, 2.05], [7.0, 1.52], [8.4, 1.15], [9.4, 0.92], [10, 0.86]]);
const topY = (x) => topRaw(x) + groundY(x) * 0.7;
const widthRaw = curve([[0, 0.84], [0.7, 0.95], [2.4, 0.96], [3.8, 1.02], [5.8, 1.22], [7.2, 1.2], [8.5, 0.98], [9.4, 0.7], [10, 0.45]]);
const HEEL_R = 0.8, TOE_R = 1.05;
function endRound(x) {
  let k = 1;
  if (x < HEEL_R) k *= Math.sqrt(Math.max(0, 1 - Math.pow((HEEL_R - x) / HEEL_R, 2)));
  if (x > LEN - TOE_R) k *= Math.sqrt(Math.max(0, 1 - Math.pow((x - (LEN - TOE_R)) / TOE_R, 2)));
  return k;
}
const halfW = (x) => widthRaw(x) * endRound(x);
const toeK = (x) => (x > LEN - TOE_R ? Math.sqrt(Math.max(0, 1 - Math.pow((x - (LEN - TOE_R)) / TOE_R, 2))) : 1);

function upperSection(x, phi) {
  const yb = baseY(x), yt = topY(x);
  const mid = (yb + yt) / 2, hh = ((yt - yb) / 2) * (0.5 + 0.5 * toeK(x));
  const vert = -Math.cos(phi);                       // -1 bottom … +1 top
  const y = mid + hh * spow(vert, vert < 0 ? 0.3 : 0.8);
  const taper = 1 - 0.42 * smooth(0, 1, vert);       // narrower toward the top, like a foot
  const z = halfW(x) * spow(Math.sin(phi), 0.5) * taper;
  return { y, z, h: (y - yb) / Math.max(yt - yb, 1e-3), perim: 2 * (yt - yb) + 3 * halfW(x) };
}
function slabSection(bottom, top, width, e = 0.25) {
  return (x, phi) => {
    const yb = bottom(x), yt = top(x), mid = (yb + yt) / 2, hh = (yt - yb) / 2;
    const vert = -Math.cos(phi);
    const y = mid + hh * spow(vert, e);
    const z = width(x) * spow(Math.sin(phi), 0.3);
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
const COLLAR = { cx: 1.85, rx: 1.5, rz: 0.6, minY: 1.9 };

function knitTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8f8f8f';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      g.beginPath();
      g.ellipse(col * 16 + (row % 2) * 8 + 8, row * 16 + 8, 4.4, 3.1, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Shader tweaks shared by the upper and its lining: cut the foot opening, and (upper
// only) print three cream speed bars on each side.
function cutCollar(material, withBars) {
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
    if (withBars) {
      f = f.replace('#include <color_fragment>', `#include <color_fragment>
        {
          float sideMask = smoothstep(0.45, 0.7, abs(vLocal.z));
          float bars = 0.0;
          for (int i = 0; i < 3; i++) {
            float x0 = 4.0 + float(i) * 0.5;
            float d = (vLocal.x - x0) - (vLocal.y - 0.7) * 0.85; // lean forward
            float w = 0.13 - float(i) * 0.025;
            bars += (1.0 - smoothstep(w - 0.02, w, abs(d))) * smoothstep(0.7, 0.8, vLocal.y) * (1.0 - smoothstep(1.95, 2.05, vLocal.y));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.91, 0.84), clamp(bars, 0.0, 1.0) * sideMask);
        }`);
    }
    sh.fragmentShader = f;
  };
}

function buildSpike() {
  const shoe = new THREE.Group();
  const green = new THREE.Color(0x0f6a32), deep = new THREE.Color(0x07391b), gold = new THREE.Color(0xf6bd06);

  // upper: knit, green at the toe and along the bottom, fading to gold toward the heel collar
  const upperGeo = loft({
    x0: 0, x1: LEN, nu: 160, nv: 56, section: upperSection,
    colorAt: (x, h) => {
      const f = smooth(0.42, 0.95, h * 0.55 + (1 - x / LEN) * 0.75) * smooth(0.1, 0.3, h);
      const c = deep.clone().lerp(green, smooth(0.0, 0.18, h)).lerp(gold, f);
      return c;
    },
  });
  const knit = knitTexture();
  const upperMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, map: knit, bumpMap: knit, bumpScale: 1.4,
    roughness: 0.68, metalness: 0, sheen: 0.25, sheenColor: new THREE.Color(0xfff2c0), sheenRoughness: 0.7,
  });
  cutCollar(upperMat, true);
  shoe.add(new THREE.Mesh(upperGeo, upperMat));

  // lining: the inside of the same surface, seen through the foot opening
  const liningMat = new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.9, side: THREE.BackSide });
  cutCollar(liningMat, false);
  shoe.add(new THREE.Mesh(upperGeo, liningMat));

  // padded collar rim around the opening
  const rim = [];
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2;
    const x = COLLAR.cx + COLLAR.rx * Math.cos(t), z = COLLAR.rz * Math.sin(t);
    rim.push(surfaceAt(x, z));
  }
  shoe.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 128, 0.085, 12, true),
    new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.8 }),
  ));

  // heel foam: cream, with a green band along the bottom
  const cream = new THREE.Color(0xefe8d6);
  const foamGeo = loft({
    x0: 0, x1: 4.0, nu: 80, nv: 40,
    section: slabSection((x) => groundY(x) + 0.02, (x) => baseY(x) + 0.05, (x) => halfW(x) * 1.03 * smooth(4.0, 3.2, x) + 0.0001),
    colorAt: (x, h) => cream.clone().lerp(green, 1 - smooth(0.12, 0.28, h)),
  });
  shoe.add(new THREE.Mesh(foamGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, clearcoat: 0.3 })));

  // spike plate: dark green edge, salmon-orange underneath
  const salmon = new THREE.Color(0xf08a5d);
  const plateGeo = loft({
    x0: 2.9, x1: LEN, nu: 120, nv: 40,
    section: slabSection((x) => groundY(x) - 0.02, (x) => baseY(x) + 0.04 + 0.16 * smooth(3.6, 5.2, x) * (1 - smooth(9.2, 10, x)), (x) => halfW(x) * 1.06 * smooth(2.9, 3.6, x) + 0.0001),
    colorAt: (x, h) => salmon.clone().lerp(green, smooth(0.3, 0.5, h)),
  });
  shoe.add(new THREE.Mesh(plateGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.8 })));

  // traction nubs: little salmon pyramids all over the bottom
  const nubSpots = [];
  for (let x = 0.4, row = 0; x <= 9.75; x += 0.27, row++) {
    if (x > 3.0 && x < 3.7) continue;
    const w = halfW(x) * 0.85;
    for (let z = -w + (row % 2) * 0.12; z <= w; z += 0.24) nubSpots.push([x, z]);
  }
  const nubGeo = new THREE.ConeGeometry(0.075, 0.14, 6);
  nubGeo.rotateX(Math.PI); // point down
  const nubs = new THREE.InstancedMesh(nubGeo, new THREE.MeshStandardMaterial({ color: 0xf08a5d, roughness: 0.55 }), nubSpots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  nubSpots.forEach(([x, z], i) => {
    const slope = Math.atan2(groundY(x + 0.05) - groundY(x - 0.05), 0.1);
    q.setFromEuler(new THREE.Euler(0, 0, slope));
    m.compose(new THREE.Vector3(x, groundY(x) - 0.08, z), q, one);
    nubs.setMatrixAt(i, m);
  });
  shoe.add(nubs);

  // silver spike pins around the forefoot
  const pinGeo = new THREE.ConeGeometry(0.09, 0.44, 20);
  pinGeo.rotateX(Math.PI);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.15 });
  [[5.0, 0.62], [5.0, -0.62], [6.4, 0.86], [6.4, -0.86], [7.8, 0.78], [7.8, -0.78], [9.0, 0]].forEach(([x, zf]) => {
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.set(x, groundY(x) - 0.3, zf);
    pin.rotation.z = Math.atan2(groundY(x + 0.05) - groundY(x - 0.05), 0.1);
    shoe.add(pin);
  });

  // laces: cream criss-cross from the forefoot back to a bow by the collar
  const laceMat = new THREE.MeshStandardMaterial({ color: 0xf3eee1, roughness: 0.75 });
  const lift = (v) => v.clone().add(new THREE.Vector3(0, 0.06, 0));
  const rows = [3.55, 4.1, 4.65, 5.2, 5.75, 6.3, 6.85];
  const eye = (x, side) => lift(surfaceAt(x, side * 0.44));
  const lace = (a, b, arch = 0.1, r = 0.045) => {
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, arch, 0));
    shoe.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, r, 8, false), laceMat));
  };
  // eyestays: a stitched dark-green band down each side of the lacing, with cream eyelets
  const stayMat = new THREE.MeshPhysicalMaterial({ color: 0x0c4a24, roughness: 0.45, clearcoat: 0.6 });
  const eyeletMat = new THREE.MeshStandardMaterial({ color: 0xf3eee1, roughness: 0.5, metalness: 0.1 });
  for (const side of [1, -1]) {
    const stay = [];
    for (let x = 3.25; x <= 7.15; x += 0.13) stay.push(surfaceAt(x, side * 0.5).add(new THREE.Vector3(0, 0.015, 0)));
    shoe.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stay), 80, 0.075, 10, false), stayMat));
    rows.forEach((x) => {
      const p = surfaceAt(x, side * 0.44);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 18), eyeletMat);
      ring.position.copy(p).add(new THREE.Vector3(0, 0.04, 0));
      ring.rotation.x = Math.PI / 2;
      shoe.add(ring);
    });
  }
  for (let k = 0; k < rows.length - 1; k++) {
    lace(eye(rows[k], 1), eye(rows[k + 1], -1));
    lace(eye(rows[k], -1), eye(rows[k + 1], 1));
  }
  lace(eye(rows[rows.length - 1], 1), eye(rows[rows.length - 1], -1), 0.06);
  // the bow
  const knot = lift(surfaceAt(rows[0], 0)).add(new THREE.Vector3(0, 0.05, 0));
  for (const side of [1, -1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 28), laceMat);
    loop.scale.set(1, 0.55, 1);
    loop.position.copy(knot).add(new THREE.Vector3(-0.15, 0.12, side * 0.32));
    loop.rotation.set(Math.PI / 2 - 0.5, side * 0.5, 0);
    shoe.add(loop);
    const tail = [knot.clone(), knot.clone().add(new THREE.Vector3(-0.3, 0.05, side * 0.5)), knot.clone().add(new THREE.Vector3(-0.55, -0.45, side * 0.85))];
    shoe.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tail), 16, 0.04, 8, false), laceMat));
  }

  // heel pull tab
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf2b10c, roughness: 0.6 }));
  tab.position.set(0.12, topY(0.12) - 0.05, 0);
  tab.rotation.z = 0.5;
  shoe.add(tab);

  shoe.position.set(-5, -1.35, 0); // center the shoe on its pivot
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
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: 28, distance: 20, fitWidth: 12.5, lights: 'studio' });
  const spike = buildSpike();
  scene.add(spike);
  loadRealSpike(spike, canvas.dataset.glb);
  let spin = -2.55, last = 0; // start at a three-quarter view, toe toward the viewer
  runWhileVisible(canvas, (now) => {
    const dt = last ? Math.min(now - last, 50) : 16;
    last = now;
    if (!drag.on) { spin += dt * 0.00025; drag.offset *= 0.96; } // slow turntable
    const kick = reduceMotion ? 0 : Math.exp(-tempo().phase(now) * 6); // a small hop on each beat
    spike.rotation.set(0.24, spin + drag.offset, 0.05 + Math.sin(now * 0.0009) * 0.03);
    spike.position.y = Math.sin(now * 0.0012) * 0.15 + kick * 0.12;
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
  arc(Math.PI * 1.78, Math.PI * 1.78 + Math.PI * 0.44 * clamp(bpm / 210, 0, 1), '#A6E22E');
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
  g.font = '600 34px "JetBrains Mono", ui-monospace, monospace';
  g.fillText('SAT 01', m, m - 150);
  // big two-tone time, the Garmin signature
  g.font = 'italic 800 205px Archivo, Helvetica, Arial, sans-serif';
  g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.fillText('10', m - 6, m + 60);
  g.textAlign = 'left'; g.fillStyle = '#A6E22E'; g.fillText('10', m + 6, m + 60);
  // three data complications: heart rate, cadence (highlighted), music tempo
  const comp = (x, label, value, accent) => {
    g.lineWidth = 6;
    g.strokeStyle = accent ? '#A6E22E' : 'rgba(255,255,255,.3)';
    g.beginPath(); g.arc(x, m + 165, 58, 0, Math.PI * 2); g.stroke();
    g.textAlign = 'center';
    g.fillStyle = accent ? '#A6E22E' : '#ffffff';
    g.font = '800 46px Archivo, Helvetica, Arial, sans-serif';
    g.fillText(value, x, m + 172);
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.font = '600 20px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(label, x, m + 200);
  };
  comp(m - 140, '♥ BPM', '148', false);
  comp(m, 'SPM', String(bpm), true);
  comp(m + 140, '♪ BPM', String(bpm), false);
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
  g.fillText('ADAGIO', m, m - 112);
}

function bezelLabels() {
  const size = 1024, m = size / 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.fillStyle = 'rgba(235,235,235,.8)';
  g.font = '700 30px Archivo, Helvetica, Arial, sans-serif';
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
  g.font = '700 26px Archivo, Helvetica, Arial, sans-serif';
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
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0xa6e22e, emissive: 0x4a5a00, roughness: 0.4 }));
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

  // tilt toward the pointer over the panel; a full turn when the music staff passes by
  const zone = canvas.closest('.devices') || canvas;
  let px = 0, py = 0, tx = 0, ty = 0, turnStart = -1;
  zone.addEventListener('pointermove', (e) => {
    const r = zone.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5;
  });
  zone.addEventListener('pointerleave', () => { tx = ty = 0; });
  const stage = canvas.closest('.watch-stage');
  if (stage) stage.addEventListener('adagio:note-hit', () => { if (turnStart < 0) turnStart = performance.now(); });

  runWhileVisible(canvas, (now) => {
    if (!drag.on) drag.offset *= 0.95;
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    const t = reduceMotion ? 0 : now;
    let turn = 0;
    if (turnStart >= 0) {
      const p = clamp((now - turnStart) / 1500, 0, 1);
      turn = Math.PI * 2 * easeInOut(p);
      if (p >= 1) turnStart = -1;
    }
    watch.rotation.y = -0.4 + Math.sin(t * 0.0006) * 0.3 + px * 0.6 + drag.offset + turn;
    watch.rotation.x = -0.3 + Math.sin(t * 0.0005 + 1) * 0.07 + py * 0.4;
    watch.rotation.z = 0.1;
    watch.position.y = Math.sin(t * 0.001) * 0.12;
  }, () => renderer.render(scene, camera));
}

/* ----------------------------------------------------------------------
   Apple Watch (Haptic Mode): midnight aluminum case with rounded edges, an
   all-glass front, the digital crown (ridged, with its red ring) and the long
   side button, a sport band with pin holes. It gives a small "haptic" tap on
   every beat, and turns a full circle when the music staff passes by.
   ---------------------------------------------------------------------- */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
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
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 600; faceCanvas.height = 720;
  drawAppleFace(faceCanvas.getContext('2d'), 600, 720, tempo().bpm);
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const dispGeo = new THREE.ShapeGeometry(roundedRectShape(W - 0.15, H - 0.15, R - 0.12), 24);
  // map the shape's x/y onto the texture
  const uv = dispGeo.attributes.uv, pos = dispGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (W - 0.15) + 0.5, pos.getY(i) / (H - 0.15) + 0.5);
  const display = new THREE.Mesh(dispGeo, new THREE.MeshBasicMaterial({ map: faceTex }));
  display.position.z = front + 0.016;
  watch.add(display);
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

  watch.userData.setBPM = (bpm) => { drawAppleFace(faceCanvas.getContext('2d'), 600, 720, bpm); faceTex.needsUpdate = true; };
  return watch;
}

function initAppleWatch(canvas) {
  const { renderer, scene, camera, drag } = makeStage(canvas, { fov: 30, distance: 15.5, fitWidth: 7.5, lights: 'studio' });
  const watch = buildAppleWatch();
  scene.add(watch);
  document.addEventListener('adagio:bpm', (e) => watch.userData.setBPM(e.detail));
  if (document.fonts) document.fonts.ready.then(() => watch.userData.setBPM(tempo().bpm));
  let turnStart = -1;
  const stage = canvas.closest('.aw-stage');
  if (stage) stage.addEventListener('adagio:note-hit', () => { if (turnStart < 0) turnStart = performance.now(); });
  runWhileVisible(canvas, (now) => {
    if (!drag.on) drag.offset *= 0.95;
    const t = reduceMotion ? 0 : now;
    // the haptic tap: a quick little buzz at the start of every beat
    const ph = reduceMotion ? 1 : tempo().phase(now);
    const buzz = ph < 0.12 ? Math.sin(ph * 160) * 0.035 * (1 - ph / 0.12) : 0;
    let turn = 0;
    if (turnStart >= 0) {
      const p = clamp((now - turnStart) / 1500, 0, 1);
      turn = Math.PI * 2 * easeInOut(p);
      if (p >= 1) turnStart = -1;
    }
    watch.rotation.set(-0.22 + Math.sin(t * 0.0005) * 0.06, 0.5 + Math.sin(t * 0.0006) * 0.35 + drag.offset + turn, 0.08 + buzz);
    watch.position.set(buzz * 2, Math.sin(t * 0.001) * 0.1, 0);
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
}
