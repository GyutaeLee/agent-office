// Kenney CC0 source models are kept in art/kenney. This module runs only during art export.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1280, H = 640, RES = 2, VIEW = 14.5;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W * RES, H * RES);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.setClearColor(0, 0);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-VIEW * W / H / 2, VIEW * W / H / 2, VIEW / 2, -VIEW / 2, .1, 100);
camera.position.set(14, 15, 18);
camera.lookAt(0, .8, 0);
camera.updateMatrixWorld();
scene.add(new THREE.HemisphereLight(0xf3f7ff, 0xc6ba9e, 2.1));
const sun = new THREE.DirectionalLight(0xfff1d8, 3.5);
sun.position.set(-3, 12, 8); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .1, far: 35 });
sun.shadow.bias = -.0003; sun.shadow.normalBias = .015; sun.shadow.radius = 4;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd7e8ff, .8); fill.position.set(8, 7, -6); scene.add(fill);
const base = new THREE.Group(); scene.add(base);
const layers = [];
const loader = new GLTFLoader(), cache = new Map();
const palette = { wood: '#c59a70', woodDark: '#927454', metal: '#a7b6b0', metalDark: '#344a50', metalMedium: '#526769', carpet: '#778f81', carpetBlue: '#cd8466', plant: '#69986e' };
const deskPositions = [[-3.3, -1.25], [-1.1, -1.25], [1.1, -1.25], [3.3, -1.25], [-3.3, 1], [-1.1, 1], [1.1, 1], [3.3, 1]];

function project(x, y, z, cam = camera, w = W, h = H) {
  const p = new THREE.Vector3(x, y, z).project(cam);
  return [+(w * (p.x + 1) / 2).toFixed(2), +(h * (1 - p.y) / 2).toFixed(2)];
}
function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .88, metalness: .02, ...extra });
}
function box(parent, x, y, z, w, h, d, color, radius = .025, extra = {}) {
  const mesh = new THREE.Mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d), material(color, extra));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, x, y, z, radius, height, color, top = radius) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 20), material(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function group(name, x, z, offset = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  layers.push({ name, group: g, depth: project(x, 0, z)[1] + offset }); return g;
}
async function furniture(name, parent, x, z, width, height, rotation = 0, colors = {}) {
  if (!cache.has(name)) cache.set(name, await loader.loadAsync('/art/kenney/furniture/' + name + '.glb'));
  const model = cache.get(name).scene.clone(true);
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true;
    const recolor = m => {
      const next = m.clone(); const color = colors[m.name] || palette[m.name];
      if (color) next.color.set(color);
      next.roughness = .9; return next;
    };
    node.material = Array.isArray(node.material) ? node.material.map(recolor) : recolor(node.material);
  });
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = width / size.x, sy = height ? height / size.y : scale;
  model.scale.set(scale, sy, scale);
  model.position.set(-center.x * scale, -bounds.min.y * sy, -center.z * scale);
  const wrapper = new THREE.Group(); wrapper.add(model); wrapper.position.set(x, 0, z); wrapper.rotation.y = rotation; parent.add(wrapper);
  return wrapper;
}
function sign(parent, text, x, y, z, width, height, color = '#596e65') {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.font = '600 48px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 384, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.position.set(x, y, z); parent.add(mesh);
}
function cup(parent, x, y, z, color = '#f0eee5') {
  cylinder(parent, x, y, z, .065, .14, color, .075);
  cylinder(parent, x, y + .073, z, .055, .005, '#675243');
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.04, .014, 6, 12), material(color));
  handle.position.set(x + .083, y, z); parent.add(handle);
}
function monitor(parent, x, z) {
  box(parent, x, .73, z, .3, .035, .18, '#3d5053');
  box(parent, x, .87, z, .045, .27, .045, '#485c5d');
  box(parent, x, 1.11, z, .76, .46, .065, '#293d44', .035);
  box(parent, x, 1.11, z + .037, .68, .37, .006, '#7ba6a9', .008, { emissive: '#759c9f', emissiveIntensity: .14 });
  const colors = ['#e1e9e0', '#b7d4be', '#d9be86'];
  for (let i = 0; i < 5; i++) box(parent, x - .21 + (i % 2) * .025, 1.24 - i * .057, z + .043, [.22, .35, .28, .18, .31][i], .013, .003, colors[i % 3], 0);
  box(parent, x, .717, z + .37, .49, .025, .17, '#e5e7df', .014);
  for (let i = 0; i < 3; i++) box(parent, x, .733, z + .32 + i * .047, .42, .004, .006, '#b5c0b8', 0);
  box(parent, x + .4, .728, z + .38, .085, .045, .13, '#d5ded5', .025);
}

async function buildRoom() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .13 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.3; ground.receiveShadow = true; base.add(ground);
  box(base, 0, -.16, 0, 18.2, .3, 8.3, '#d7cdbb', .09);
  box(base, 0, -.025, 0, 18.08, .05, 8.18, '#d5b99a', .03);
  for (let i = 0; i < 49; i++) {
    const x = -8.87 + i * .37;
    box(base, x, .009, 0, .36, .018, 8.03, ['#dec4a6', '#d8bc9d', '#e3c9ac', '#ddc0a0'][i % 4], .005);
    for (let j = -3; j < 4; j++) box(base, x, .019, j * 1.24 + (i % 2) * .59, .36, .002, .008, '#c4aa8c', 0);
  }
  // Walls and windows.
  box(base, -9.06, 1.24, -.05, .15, 2.48, 8.3, '#d3dcd1', .025);
  box(base, 0, 1.24, -4.1, 18.25, 2.48, .15, '#e8e3d7', .025);
  box(base, -9.05, 2.5, -.05, .2, .08, 8.35, '#e8e0d0', .02);
  box(base, 0, 2.5, -4.1, 18.25, .08, .2, '#f6f0e4', .02);
  box(base, -8.96, .13, -.02, .06, .18, 8.1, '#7e9488', .01);
  box(base, 0, .13, -3.99, 18.0, .18, .06, '#a6ada0', .01);
  for (const z of [-2.45, .1, 2.6]) {
    box(base, -8.965, 1.51, z, .035, 1.42, 2.06, '#f8f6ee', .018);
    box(base, -8.937, 1.51, z, .025, 1.24, 1.86, '#a9c7c5', .005, { emissive: '#b7d7d4', emissiveIntensity: .2 });
    box(base, -8.91, 1.51, z, .025, 1.3, .045, '#f5f4e9', .005);
    box(base, -8.91, 1.55, z, .025, .045, 1.9, '#f5f4e9', .005);
    box(base, -8.88, .83, z, .17, .06, 2.12, '#f7f1e4', .012);
  }
  box(base, -.25, 1.55, -3.985, 3.25, 1.18, .035, '#c7c6b7', .04);
  box(base, -.25, 1.56, -3.957, 3.12, 1.05, .018, '#f4f1e8', .028);
  for (let i = 0; i < 6; i++) box(base, -1.32 + i * .39, 1.65 + (i % 2) * .23, -3.94, .21, .18, .008, ['#d6ba76', '#afc5b0', '#d5a28b'][i % 3], .008);
  for (let i = 0; i < 4; i++) box(base, -.9 + i * .42, 1.25, -3.94, .28, .035, .008, '#a4b5aa', .003);
  sign(base, 'A G E N T   O F F I C E', -.25, 2.32, -3.99, 3.9, .6, '#66786b');
  const clock = cylinder(base, -2.5, 1.95, -3.94, .25, .035, '#5f756c');
  clock.rotation.x = Math.PI / 2;
  const face = cylinder(base, -2.5, 1.95, -3.91, .219, .012, '#f5eddb'); face.rotation.x = Math.PI / 2;
  box(base, -2.5, 2.015, -3.9, .017, .15, .008, '#53665e', .003);
  box(base, -2.445, 1.95, -3.89, .13, .017, .008, '#53665e', .003);
  // Floor materials mark the activity zones.
  box(base, -6.45, .035, -.55, 3.8, .022, 4.85, '#e9dcc4', .1);
  box(base, .0, .035, .0, 9.0, .022, 6.6, '#bacbbf', .12);
  box(base, 6.75, .035, -2.05, 3.7, .022, 3.35, '#b7c9ce', .1);
  box(base, -.25, .035, 2.96, 3.4, .022, 1.8, '#d7c9ad', .2);
  const shelves = group('library', -6.45, -3.08);
  for (const x of [-.76, .76]) {
    await furniture('bookcaseOpen', shelves, x, 0, 1.4, 1.9, 0, { wood: '#647e70' });
    for (const y of [.2, .77, 1.35]) {
      const books = await furniture('books', shelves, x, .025, .98, .34, 0, { wood: '#c5ad82', woodDark: '#4c746e' }); books.position.y = y;
    }
  }
  const reading = group('reading-table', -6.35, -.32);
  box(reading, 0, .69, 0, 2.04, .095, 1.1, '#d1ac80', .05);
  for (const x of [-.82, .82]) for (const z of [-.4, .4]) box(reading, x, .34, z, .065, .65, .065, '#79867a', .012);
  const book = box(reading, -.25, .762, .0, .55, .04, .36, '#f5f0dd', .008);
  book.rotation.y = -.2;
  box(reading, -.25, .79, .0, .012, .009, .35, '#c4b69b', 0);
  const stack = await furniture('books', reading, .61, -.2, .33, .25); stack.position.y = .75;
  cup(reading, .65, .83, .24);
  for (const [i, [x, z]] of deskPositions.entries()) {
    const desk = group('desk-' + i, x, z);
    await furniture('desk', desk, 0, 0, 1.86, .7);
    monitor(desk, -.18, -.18);
    cup(desk, .64, .8, .08, i % 2 ? '#a8beb0' : '#d8ab86');
    const plant = await furniture('plantSmall1', desk, -.7, -.2, .23, .26); plant.position.y = .72;
    const chair = group('chair-' + i, x, z + 1.05, 3);
    await furniture('chairDesk', chair, .04, 0, .65, .85, Math.PI, { carpet: ['#6f8d83', '#8b9c84'][i % 2] });
  }
  const servers = group('server-racks', 6.75, -2.65);
  for (const x of [-1.13, 0, 1.13]) {
    box(servers, x, .97, 0, .92, 1.9, .74, '#2d444c', .045);
    box(servers, x, 1.94, 0, .95, .06, .77, '#556c70', .025);
    box(servers, x, .94, .385, .78, 1.68, .028, '#1f343d', .01);
    for (let j = 0; j < 6; j++) {
      box(servers, x, .26 + j * .25, .41, .7, .18, .035, '#3c545e', .012);
      for (let k = 0; k < 5; k++) box(servers, x + .1 + k * .035, .26 + j * .25, .434, .012, .065, .005, '#6e8489', .002);
      for (let k = 0; k < 2; k++) box(servers, x - .25 + k * .07, .28 + j * .25, .436, .027, .024, .009, k ? '#8cc3cb' : '#b0d5b6', .005, { emissive: k ? '#7fbac3' : '#a6d4ad', emissiveIntensity: .4 });
    }
  }
  sign(base, 'SYSTEMS', 6.75, 2.25, -3.98, 1.9, .45, '#657b80');
  const lift = group('elevator', 8.25, .15);
  box(lift, 0, 1.2, -.06, 1.03, 2.4, .3, '#b5c2b9', .055);
  box(lift, 0, 1.15, .11, .84, 2.1, .035, '#768f8d', .008);
  for (const x of [-.205, .205]) box(lift, x, 1.15, .14, .39, 2.02, .016, x < 0 ? '#cad5cf' : '#b9c9c2', .006);
  box(lift, 0, 1.15, .155, .015, 2.02, .01, '#76918a', 0);
  box(lift, .64, 1.17, .12, .14, .32, .05, '#647d77', .025);
  box(lift, .64, 1.22, .15, .05, .05, .015, '#d3e2be', .008, { emissive: '#d5e8be', emissiveIntensity: .3 });
  sign(lift, '↕', 0, 2.26, .12, .55, .2, '#566e65');
  const sofa = group('lounge', -.15, 2.8);
  await furniture('loungeDesignSofa', sofa, 0, 0, 2.5, .77, 0, { carpetBlue: '#cf866a' });
  const table = group('coffee-table', -.15, 3.58);
  await furniture('tableCoffee', table, 0, 0, 1.3, .37);
  const magazine = box(table, -.2, .4, -.02, .3, .024, .36, '#708c83', .007); magazine.rotation.y = -.2;
  cup(table, .32, .46, .02, '#f0e7d4');
  for (const [name, x, z, width, height] of [['plant-left', -7.55, 2.8, .75, 1.28], ['plant-front', 4.75, 2.75, .85, 1.42], ['plant-back', 4.25, -3.25, .65, 1.12]]) {
    const plant = group(name, x, z);
    await furniture('pottedPlant', plant, 0, 0, width, height, 0, { wood: '#d3a186', woodDark: '#b98e75', plant: '#719974' });
  }
  const nook = group('coffee-nook', -7.5, .9);
  await furniture('sideTableDrawers', nook, 0, 0, .66, .74, Math.PI / 2);
  const coffee = await furniture('kitchenCoffeeMachine', nook, 0, 0, .37, .39); coffee.position.y = .75;
}

function croppedImage() {
  const width = renderer.domElement.width, height = renderer.domElement.height;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(renderer.domElement, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 4) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(width, x1 + 3); y1 = Math.min(height, y1 + 3);
  const out = document.createElement('canvas'); out.width = x1 - x0; out.height = y1 - y0;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return { image: out.toDataURL('image/png'), rect: [x0 / RES, y0 / RES, out.width / RES, out.height / RES] };
}

async function characterSheets(images) {
  base.visible = false; for (const layer of layers) layer.group.visible = false;
  renderer.shadowMap.enabled = false;
  const sw = 160, sh = 192, ratio = (VIEW / H) / RES;
  const spriteCamera = new THREE.OrthographicCamera(-sw * ratio / 2, sw * ratio / 2, sh * ratio / 2, -sh * ratio / 2, .1, 100);
  spriteCamera.position.set(14, 14.85, 18); spriteCamera.lookAt(0, .65, 0); spriteCamera.updateMatrixWorld();
  renderer.setSize(sw, sh);
  const anchor = project(0, 0, 0, spriteCamera, sw, sh);
  const names = ['character-male-a', 'character-female-a', 'character-male-b', 'character-female-b', 'character-male-d', 'character-female-d'];
  const poses = [
    ...['think', 'read', 'work', 'command'].flatMap(pose => Array.from({ length: 4 }, (_, frame) => ({ pose, frame, time: frame / 6, angle: pose === 'work' || pose === 'command' ? Math.PI : 0 }))),
    ...Array.from({ length: 4 }, (_, direction) => Array.from({ length: 6 }, (_, frame) => ({ pose: 'walk-' + direction, frame, time: frame / 6, angle: direction * Math.PI / 2 }))).flat(),
  ];
  for (const [index, name] of names.entries()) {
    const gltf = await loader.loadAsync('/art/kenney/characters/' + name + '.glb');
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    const wrapper = new THREE.Group(); wrapper.add(model); model.scale.setScalar(1.12 / size.y); model.position.y = -bounds.min.y * model.scale.y;
    scene.add(wrapper);
    model.traverse(node => { if (node.isMesh) { node.castShadow = false; node.material.roughness = .9; } });
    const mixer = new THREE.AnimationMixer(model);
    const initial = new Map(); model.traverse(node => initial.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
    const book = new THREE.Group();
    box(book, -.09, 0, 0, .18, .025, .24, '#f0e3c4', .008);
    box(book, .09, 0, 0, .18, .025, .24, '#fff3d6', .008);
    box(book, 0, -.02, 0, .39, .02, .27, '#678a7b', .005);
    book.position.set(0, .46, .27); book.rotation.x = .26; wrapper.add(book);
    const atlas = document.createElement('canvas'); atlas.width = sw * 8; atlas.height = sh * 5;
    const ctx = atlas.getContext('2d');
    for (const [i, pose] of poses.entries()) {
      mixer.stopAllAction();
      initial.forEach((transform, node) => { node.position.copy(transform.position); node.quaternion.copy(transform.quaternion); node.scale.copy(transform.scale); });
      const animation = pose.pose.startsWith('walk') ? 'walk' : pose.pose === 'read' ? 'holding-both' : pose.pose === 'command' ? 'interact-right' : pose.pose === 'work' ? 'holding-both' : 'idle';
      const clip = gltf.animations.find(a => a.name === animation);
      if (clip) { mixer.clipAction(clip).reset().play(); mixer.setTime(pose.time); }
      wrapper.rotation.y = pose.angle; book.visible = pose.pose === 'read';
      const head = model.getObjectByName('head'), arm = model.getObjectByName('arm-right');
      if (pose.pose === 'think') { if (head) head.rotation.z += .08 + Math.sin(pose.time * 3) * .035; if (arm) { arm.rotation.x = -1.3; arm.rotation.z = -.25; } }
      if (pose.pose === 'read' && head) head.rotation.x = .18;
      if (pose.pose === 'work') { if (head) head.rotation.x = .13; wrapper.rotation.z = Math.sin(pose.time * 9) * .012; }
      else wrapper.rotation.z = 0;
      renderer.render(scene, spriteCamera);
      ctx.drawImage(renderer.domElement, (i % 8) * sw, Math.floor(i / 8) * sh);
    }
    images['agent-' + index + '.png'] = atlas.toDataURL('image/png');
    scene.remove(wrapper); mixer.stopAllAction();
  }
  return { cell: [sw, sh], anchor, scale: 1 / RES, columns: 8, frames: Object.fromEntries(poses.map((p, i) => [p.pose + ':' + p.frame, i])), count: names.length };
}

window.exportOffice = async () => {
  await buildRoom();
  const images = {}, layout = { width: W, height: H, layers: [] };
  renderer.render(scene, camera);
  images['room.png'] = renderer.domElement.toDataURL('image/png');
  base.visible = false;
  for (const layer of layers) layer.group.visible = false;
  for (const layer of layers) {
    layer.group.visible = true; renderer.render(scene, camera);
    const crop = croppedImage();
    images[layer.name + '.png'] = crop.image;
    layout.layers.push({ image: layer.name + '.png', rect: crop.rect, depth: layer.depth });
    layer.group.visible = false;
  }
  layout.slots = {
    workspace: deskPositions.map(([x, z]) => project(x, 0, z + 1.05)),
    library: [[-6.1, .58], [-7.1, .65], [-5.2, .65], [-5.8, 1.55], [-6.8, 1.7], [-5.0, 1.55]].map(([x, z]) => project(x, 0, z)),
    servers: [[5.65, -1.45], [6.75, -1.45], [7.85, -1.45], [5.75, -.45], [6.85, -.4], [7.75, -.2]].map(([x, z]) => project(x, 0, z)),
  };
  layout.entry = project(8.25, 0, 1.05);
  layout.signals = [-1.13, 0, 1.13].flatMap(x => [0, 1, 2].map(i => project(6.75 + x - .25, .28 + i * .5, -2.214)));
  layout.sprites = await characterSheets(images);
  renderer.dispose();
  return { images, layout };
};
