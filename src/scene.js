import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const ENTITIES = {
  pallet: { name: '签收托盘', code: '01', point: [-5.4, 0, -0.8], label: [-5.4, 0.2, 0.8] },
  scale: { name: '称量工位', code: '02', point: [-1.5, 0, -0.8], label: [-1.5, 0.2, 0.8] },
  tank: { name: 'T-01 投料罐', code: '03', point: [2.5, 0, -1.5], label: [2.5, 0.2, 0.6] },
  return: { name: '余料退回区', code: '04', point: [5.4, 0, 2.7], label: [5.4, 0.2, 4.15] },
};
const MODEL = {
  pallet: 'material-pallet-9bda57c1', bucket: 'ingredient-bucket-07038eee',
  scale: 'platform-scale-empty-883b2024', tank: 'mixing-tank-93dae506',
};
export async function createScene(onSelect) {
  const host = document.querySelector('#scene');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8eee5');
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 10; controls.maxDistance = 33;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.enablePan = false;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, .04).texture;
  room.dispose(); pmrem.dispose();
  scene.environmentIntensity = .8;
  scene.add(new THREE.HemisphereLight('#ffffff', '#9cae94', 2.3));
  const sun = new THREE.DirectionalLight('#fff8e9', 3);
  sun.position.set(-6, 13, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: .5, far: 35 });
  sun.shadow.normalBias = .04;
  scene.add(sun);
  const clickable = [], objects = {}, labels = {}, zones = {};
  const material = (color, roughness = .7) => new THREE.MeshStandardMaterial({ color, roughness });
  function box(size, pos, color, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
    mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  box([17.7, .38, 10.3], [0, -.23, .8], '#bacab0');
  box([17.5, .08, 10.1], [0, 0, .8], '#f0f2e8');
  const grid = new THREE.GridHelper(17.4, 29, '#d0d8c9', '#e0e5d9');
  grid.position.set(0, .049, .8); scene.add(grid);
  box([17.5, .12, .12], [0, .12, -4.17], '#cfdbbf');
  box([.12, .12, 10.1], [-8.7, .12, .8], '#cfdbbf');
  // Low rear service rail leaves every work station visible.
  for (let x = -8; x <= 8; x += 4) box([.07, .8, .07], [x, .43, -3.7], '#99afa4');
  for (const y of [.45, .8]) box([16, .04, .04], [0, y, -3.7], '#acbdb0');
  for (let x = -7.4; x < 6.7; x += .55) box([.27, .012, .065], [x, .065, 1.9], '#d1b96b');
  for (let z = 1.95; z < 4; z += .55) box([.065, .012, .27], [3.85, .065, z], '#d1b96b');
  const linePoints = [-5.4, -1.5, 2.5].map(x => new THREE.Vector3(x, .09, -0.8));
  linePoints.push(new THREE.Vector3(5.4, .09, 2.7));
  const flow = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineDashedMaterial({ color: '#91ab80', dashSize: .16, gapSize: .14 }));
  flow.computeLineDistances(); scene.add(flow);
  const arrowShape = new THREE.Shape(); arrowShape.moveTo(-.18, -.17); arrowShape.lineTo(.22, 0); arrowShape.lineTo(-.18, .17); arrowShape.closePath();
  for (const x of [-3.45, .45]) {
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: '#5f8c6c', side: THREE.DoubleSide }));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(x, .075, -.8); scene.add(arrow);
  }
  for (const [id, data] of Object.entries(ENTITIES)) {
    const [x, , z] = data.point;
    const pad = box([2.85, .08, 2.6], [x, .09, z], id === 'return' ? '#ece5ce' : '#e0e9d6');
    pad.userData.entity = id; clickable.push(pad); zones[id] = pad;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), new THREE.LineBasicMaterial({ color: id === 'return' ? '#b8aa7c' : '#b0c39e' }));
    outline.position.copy(pad.position); scene.add(outline);
    const label = document.createElement('button');
    label.className = 'object-label'; label.dataset.entity = id;
    label.innerHTML = `<strong>${data.code}</strong><span>${data.name}</span>`;
    label.setAttribute('aria-label', `选中${data.name}`);
    label.addEventListener('click', () => onSelect(id));
    document.querySelector('#object-labels').appendChild(label); labels[id] = label;
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.35, 64), new THREE.MeshBasicMaterial({ color: '#13846b', side: THREE.DoubleSide, transparent: true, opacity: .8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .15; scene.add(ring);
  // A separate transparent gauge makes the tank's 70kg intake visible.
  box([.16, 2.1, .18], [3.6, 1.3, -1.5], '#b7cabc');
  const gauge = box([.12, .01, .2], [3.6, .25, -1.49], '#178c75');
  const loader = new GLTFLoader(); let count = 0;
  async function model(name, target, dimension = 'y') {
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${MODEL[name]}/model.glb`);
    const object = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = target / (dimension === 'max' ? Math.max(size.x, size.y, size.z) : size[dimension]);
    object.scale.multiplyScalar(scale);
    const b = new THREE.Box3().setFromObject(object), c = b.getCenter(new THREE.Vector3());
    object.position.sub(new THREE.Vector3(c.x, b.min.y, c.z));
    object.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ('roughness' in mat) mat.roughness = Math.max(.35, mat.roughness);
        mat.envMapIntensity = 1.1;
      }
    });
    const group = new THREE.Group(); group.add(object); scene.add(group);
    objects[name] = group; group.userData.entity = name === 'bucket' ? 'scale' : name;
    clickable.push(group);
    count++; document.querySelector('#load-progress').textContent = `已载入 ${count} / 4 个模型`;
    return group;
  }
  const models = await Promise.all([model('pallet', 2.1, 'max'), model('bucket', .9), model('scale', 2), model('tank', 3.3)]);
  const [pallet, bucket, scale, tank] = models;
  pallet.position.set(-5.4, .15, -.8); scale.position.set(-1.5, .15, -.8); tank.position.set(2.5, .15, -1.5);
  const returnPallet = pallet.clone(); returnPallet.position.set(5.4, .15, 2.7); returnPallet.userData.entity = 'return';
  scene.add(returnPallet); clickable.push(returnPallet);
  const reserve = bucket.clone(); reserve.position.set(-5.85, .39, -.85); reserve.userData.entity = 'pallet';
  scene.add(reserve); clickable.push(reserve);
  const content = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .4, 32), material('#bea55f'));
  content.position.y = .42; bucket.add(content);
  const particles = new THREE.Group(); scene.add(particles);
  for (let i = 0; i < 18; i++) {
    const particle = new THREE.Mesh(new THREE.SphereGeometry(.045, 6, 4), material('#bca25d'));
    particle.userData.offset = i / 18; particles.add(particle);
  }
  particles.visible = false;
  let animation = null, currentStep = 0, selected = 'pallet';
  function update(s, selection, animate = true) {
    const previous = currentStep; currentStep = s.step; selected = selection;
    const positions = [[-5, .39, -.8], [-5, .39, -.8], [-1.5, .45, -.5], [4, .2, -.6], [5.95, .4, 2.7]];
    const to = new THREE.Vector3(...positions[Math.min(s.step, 4)]);
    if (s.step === 1 && selection === 'scale') to.set(-1.5, .45, -.5);
    if (animate) animation = { from: bucket.position.clone(), to, start: performance.now(), feed: previous === 2 && s.step === 3 };
    else { bucket.position.copy(to); bucket.rotation.z = 0; animation = null; }
    reserve.position.set(...(s.step === 4 ? [4.85, .39, 2.7] : [-5.85, .39, -.85]));
    reserve.userData.entity = s.step === 4 ? 'return' : 'pallet';
    content.visible = s.step >= 2;
    content.scale.y = s.step >= 3 ? .12 : 1;
    gauge.scale.y = s.fed ? 150 : 1; gauge.position.y = s.fed ? 1 : .25;
    ring.position.set(ENTITIES[selection].point[0], .15, ENTITIES[selection].point[2]);
    Object.entries(labels).forEach(([id, el]) => { el.classList.toggle('selected', id === selection); el.setAttribute('aria-pressed', String(id === selection)); });
    labels.tank.querySelector('span').textContent = s.fed ? 'T-01 · 已投 70kg' : ENTITIES.tank.name;
    labels.return.querySelector('span').textContent = s.returned ? '余料 · 已退 30kg' : ENTITIES.return.name;
    bucket.userData.entity = s.step >= 3 ? (s.step === 4 ? 'return' : 'tank') : s.step >= 1 ? 'scale' : 'pallet';
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clickable, true)[0];
    if (!hit) return;
    let target = hit.object;
    while (target && !target.userData.entity) target = target.parent;
    if (target) onSelect(target.userData.entity);
  });
  function resetView(top = false) {
    const aspect = host.clientWidth / host.clientHeight;
    const distance = aspect < 1.15 ? 1.55 : 1;
    camera.position.set(top ? 0 : 11 * distance, top ? 22 * distance : 11 * distance, top ? 1 : 15 * distance);
    controls.target.set(0, .3, .6); controls.update();
  }
  new ResizeObserver(() => {
    camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight); resetView();
  }).observe(host);
  resetView();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setAnimationLoop(now => {
    if (animation) {
      const t = reduced ? 1 : Math.min((now - animation.start) / (animation.feed ? 2000 : 950), 1);
      const ease = t * t * (3 - 2 * t);
      bucket.position.lerpVectors(animation.from, animation.to, ease);
      bucket.position.y += Math.sin(t * Math.PI) * (animation.feed ? 3.3 : .6);
      bucket.rotation.z = animation.feed ? -Math.sin(t * Math.PI) * 1.1 : 0;
      particles.visible = animation.feed && t > .35 && t < .85;
      particles.children.forEach(p => { const f = ((t * 4 + p.userData.offset) % 1); p.position.set(2.5 + Math.sin(p.userData.offset * 20) * .15, 3.7 - f * 1.6, -1.5 + Math.cos(p.userData.offset * 20) * .15); });
      if (t >= 1) { animation = null; particles.visible = false; bucket.rotation.z = 0; }
    }
    ring.material.opacity = reduced ? .8 : .65 + Math.sin(now * .002) * .15;
    controls.update();
    const width = host.clientWidth, height = host.clientHeight;
    for (const [id, data] of Object.entries(ENTITIES)) {
      const p = new THREE.Vector3(...data.label).project(camera);
      labels[id].style.left = `${Math.max(65, Math.min(width - 65, (p.x * .5 + .5) * width))}px`;
      labels[id].style.top = `${Math.max(56, Math.min(height - 65, (-p.y * .5 + .5) * height))}px`;
    }
    renderer.render(scene, camera);
  });
  document.querySelector('#loading').hidden = true;
  return { update, resetView };
}
