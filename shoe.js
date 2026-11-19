// 3D running shoe on the shelf in the "Why we built it" section.
// Set data-model on .shoe-stage (e.g. "assets/shoe/scene.gltf" or a .glb) to turn it on.
// Until the model loads, the app icon shows. Three.js is only fetched when a model is set,
// and the loaded model is cached so any other spot on the page can reuse it.

const stages = [...document.querySelectorAll('.shoe-stage[data-model]')].filter((el) => el.dataset.model);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const models = new Map(); // path -> Promise<gltf scene>

async function loadModel(THREE, GLTFLoader, path) {
  if (!models.has(path)) {
    models.set(path, new GLTFLoader().loadAsync(path).then((gltf) => gltf.scene));
  }
  const scene = await models.get(path);
  return stages.length > 1 ? scene.clone(true) : scene; // reuse one download for every spot
}

async function mount(stage, THREE, GLTFLoader) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 3, 2);
  scene.add(key);

  const model = await loadModel(THREE, GLTFLoader, stage.dataset.model);
  // centre it, sit it on the shelf, and scale it to fit the stage
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = 1.6 / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(scale);
  model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  const turntable = new THREE.Group();
  turntable.add(model);
  scene.add(turntable);
  // frame the whole model: back the camera off until its bounding sphere fits the view
  const sphere = new THREE.Box3().setFromObject(turntable).getBoundingSphere(new THREE.Sphere());
  const fit = sphere.radius / Math.sin((camera.fov * Math.PI) / 360) * 0.95;
  // aim a little above centre so the model's base sits down on the shelf
  const aimY = sphere.center.y + sphere.radius * 0.45;
  camera.position.set(0, aimY + sphere.radius * 0.3, fit);
  camera.lookAt(0, aimY, 0);

  stage.appendChild(renderer.domElement);
  stage.classList.add('is-loaded');

  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // render only while the shelf is on screen
  let visible = false;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);
  turntable.rotation.y = -0.5;
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    if (!reduceMotion) turntable.rotation.y += 0.006; // slow spin
    renderer.render(scene, camera);
  });
}

if (stages.length) {
  try {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    stages.forEach((stage) => mount(stage, THREE, GLTFLoader).catch((err) => {
      console.warn('Shoe model could not load; keeping the app icon.', err);
    }));
  } catch (err) {
    console.warn('Three.js could not load; keeping the app icon.', err);
  }
}
