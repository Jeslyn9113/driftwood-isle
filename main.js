import * as THREE from 'three';
import { createIsland, PALETTE, LAYOUT, loopPolyline, plotVisit, buildBoRoute, routeAt, riverPolyline, makePath, pathAt, bananaCourse, bananaRideAt, bananaRetAt, bananaReturnCtrl, VOLLEY, volleyEngine, volleyBallAt, volleyStart, volleyClamp, volleyHalfOf, volleyMatchPoint, pondR, POND_DOCK, atPond, MOVE, PIANO, PIANO_DEMO, PIANO_LOW, PIANO_HIGH, pianoAutoNotes, pianoPiecesIn } from './island.js';

// walking and running: the speeds live in MOVE in island.js (walk 3.2, run 6.0 units a second; running from taps 8+
// units away, full speed from 12), so the game and the server agree on them
// ---------------------------------------------------------------- helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const worldRand = mulberry32(20261021);
// item spawns swap in a per-item generator so every client places them identically
let rand = worldRand;
const rr = (a, b) => a + (b - a) * rand();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
// ---------------------------------------------------------------- seaside festival goods (not for sale yet)
// One table for everything the beach festival booths will sell. Each row: id (a stable key for the coin system and,
// later, character customization), name, icon, price in coins, and which booth sells it.
const FESTIVAL_ITEMS = [
  { id: 'swim_suit_coral', name: 'Coral swimsuit', icon: '👙', price: 120, booth: 'swim' },
  { id: 'swim_trunks_wave', name: 'Wave swim trunks', icon: '🩳', price: 110, booth: 'swim' },
  { id: 'swim_hat_straw', name: 'Straw sun hat', icon: '👒', price: 90, booth: 'swim' },
  { id: 'swim_shades_heart', name: 'Heart sunglasses', icon: '🕶️', price: 70, booth: 'swim' },
  { id: 'ring_donut', name: 'Donut swim ring', icon: '🛟', price: 80, booth: 'rings' },
  { id: 'ring_ball', name: 'Striped beach ball', icon: '🏐', price: 40, booth: 'rings' },
  { id: 'ring_duck', name: 'Floaty duck', icon: '🦆', price: 150, booth: 'rings' },
  { id: 'lantern_peach', name: 'Peach paper lantern', icon: '🏮', price: 60, booth: 'lantern' },
  { id: 'lantern_moon', name: 'Moon lantern', icon: '🌕', price: 95, booth: 'lantern' },
  { id: 'lantern_star', name: 'Star string lights', icon: '✨', price: 85, booth: 'lantern' },
  { id: 'snack_ice', name: 'Rainbow shaved ice', icon: '🍧', price: 25, booth: 'snack' },
  { id: 'snack_coconut', name: 'Coconut drink', icon: '🥥', price: 20, booth: 'snack' },
  { id: 'snack_skewer', name: 'Grilled corn', icon: '🌽', price: 18, booth: 'snack' },
  { id: 'games_rings', name: 'Ring toss (3 rings)', icon: '🎯', price: 10, booth: 'games' },
  { id: 'games_fish', name: 'Toy fishing', icon: '🎣', price: 12, booth: 'games' },
  { id: 'games_plush', name: 'Crab plush prize', icon: '🦀', price: 200, booth: 'games' },
];
// ---------------------------------------------------------------- the seaside restaurant's menu (not served yet)
// One table for every dish: id (a stable key for cooking and coins later), name, icon, price in coins.
const MENU_ITEMS = [
  { id: 'dish_chili_crab', name: 'Sweet chili crab', icon: '🦀', price: 60 },
  { id: 'dish_butter_prawns', name: 'Butter prawns', icon: '🍤', price: 45 },
  { id: 'dish_grilled_fish', name: 'Grilled fish with sambal', icon: '🐟', price: 40 },
  { id: 'dish_flat_noodles', name: 'Fried flat noodles', icon: '🍜', price: 25 },
  { id: 'dish_coconut_rice', name: 'Coconut rice', icon: '🍚', price: 15 },
  { id: 'drink_lime', name: 'Iced lime juice', icon: '🍹', price: 10 },
  { id: 'dessert_shaved_ice', name: 'Shaved ice dessert', icon: '🍧', price: 12 },
];

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y) { return vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 3.7, y * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 7.1, y * 4.3 + 5.9) * 0.15; }

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts }));
  return matCache.get(key);
}
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function radialTexture(inner = 'rgba(255,240,180,1)', outer = 'rgba(255,200,80,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner); grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)')); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = radialTexture();

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement); // first in the page, so it sits under the UI (see the layer order in index.html)

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3f5, 150, 560);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1200);

const hemi = new THREE.HemisphereLight(0xcfe9ff, 0xe6d3a8, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- the island (island.js)
// The island's shape, ground, water and scenery live in island.js; main.js builds the gameplay on top of it.
const island = createIsland({ THREE, hash, vnoise, fbm, smooth, lerp, TAU });
const { ISLAND, coastR } = island;

// ---------------------------------------------------------------- layout (island.js LAYOUT, traced from the painting)
// The plaza with its fountain near the top middle, four shops around it, six hedged home yards in two staggered rows
// inside the loop road (plus plots 7 and 8 on the lawns behind the town and by the lighthouse road), the pier at the
// bottom. Plot numbers are the accounts' plot numbers; server.js reads the same LAYOUT.
const TOWN = { x: LAYOUT.plaza.x, z: LAYOUT.plaza.z }; // the plaza's centre
const deg = (d) => (d * Math.PI) / 180;
const polar = (a, r) => ({ x: TOWN.x + Math.cos(deg(a)) * r, z: TOWN.z + Math.sin(deg(a)) * r, a: deg(a) });
const PLAZA_R = LAYOUT.plaza.r;
const PLOT_HALF = LAYOUT.plotHalf; // half the yard's side; the hedge runs just inside this
const SHOPS = LAYOUT.shops.map((sh) => ({ ...sh }));
const PLOTS = LAYOUT.plots.map((pl) => ({ ...pl })); // { n, x, z, face }: face = the gate's direction as a yaw
// where the beach festival's pieces stand: measured along the boardwalk (distance s from the road's end), to one side
// (1 = the north side, -1 = the south side) and out from its middle line
const FEST = (() => {
  const F = LAYOUT.beach.festival, bw = LAYOUT.beach.boardwalk;
  const along = (s, side, off) => {
    let i = 0;
    for (; i + 1 < bw.length - 1; i++) { const l = Math.hypot(bw[i + 1][0] - bw[i][0], bw[i + 1][1] - bw[i][1]); if (s <= l) break; s -= l; }
    const [ax, az] = bw[i], [bx, bz] = bw[i + 1], l = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / l, dz = (bz - az) / l;
    const nx = dz * side, nz = -dx * side; // out to that side
    return { x: ax + dx * s + nx * off, z: az + dz * s + nz * off, yaw: Math.atan2(-nx, -nz), dx, dz }; // yaw: facing the boardwalk
  };
  return {
    along,
    booths: F.booths.map(([kind, s, side]) => ({ kind, ...along(s, side, 5.0) })),
    poles: F.poles.map((s, i) => along(s, i % 2 ? 1 : -1, 1.75)),
    lanternPoles: F.lanternPoles.map(([s, side, off]) => along(s, side, off)),
    benches: F.benches.map(([s, side, off]) => along(s, side, off)),
    stage: along(...F.stage),
  };
})();

// level ground under the plaza, the shops and the home plots
const FLATS = [
  { x: TOWN.x, z: TOWN.z, r: PLAZA_R + 1.5 },
  ...SHOPS.map((s) => ({ x: s.x, z: s.z, r: 2.8 })),
  ...PLOTS.map((p) => ({ x: p.x, z: p.z, r: PLOT_HALF * 1.42 })), // the whole square yard, corners too
  ...LAYOUT.decor.map((d) => ({ x: d.x, z: d.z, r: 1.9 })), // the cafe, the clock tower and the cottage
  ...Object.values(LAYOUT.rides).map((r) => ({ x: r.x, z: r.z, r: r.pad + 0.6 })), // the Ferris wheel and the merry-go-round
  { x: LAYOUT.rental.x, z: LAYOUT.rental.z, r: 2.6 }, // Rex's bicycle stand
  { x: LAYOUT.balloon.x, z: LAYOUT.balloon.z, r: 7 }, // the hot air balloon park's meadow
  ...FEST.booths.map((b) => ({ x: b.x, z: b.z, r: 2 })), { x: FEST.stage.x, z: FEST.stage.z, r: 2.6 }, // the festival's booths and stage
].map((f) => ({ ...f, h: island.rawH(f.x, f.z) }));
island.setFlats(FLATS);
const { H, landD, waterR } = island;

// ground, sea, foam and the far horizon
const { terrain, waterGeo, waterBase, waterMat, farSea, foamA, foamB, foamEvent, waveY, riverMat, causticsMat } = island.buildSurface(scene, { mat });

// ---------------------------------------------------------------- sky
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() }, uSunVis: { value: 1 }, uFog: { value: new THREE.Color() },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunVis; uniform vec3 uFog; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec3 col = mix(uBot, uTop, smoothstep(-0.02, 0.55, d.y));
      col = mix(uFog, col, smoothstep(-0.01, 0.1, d.y)); // a hazy horizon matching the fogged far sea
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35) * uSunVis;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

const stars = (() => {
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = rand() * TAU, y = rr(0.05, 1), r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(th) * r * 450; pos[i * 3 + 1] = y * 450; pos[i * 3 + 2] = Math.sin(th) * r * 450;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m); scene.add(p); return m;
})();
const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, transparent: true }));
scene.add(moon);
const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,250,220,1)', 'rgba(200,220,255,0)'), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
moonGlow.scale.set(70, 70, 1);
scene.add(moonGlow);

// clouds
const clouds = [];
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false, flatShading: true, transparent: true, opacity: 0.95 });
for (let i = 0; i < 13; i++) {
  const c = new THREE.Group();
  const n = 5 + Math.floor(rand() * 4);
  for (let j = 0; j < n; j++) {
    const s = rr(6, 12);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), cloudMat);
    b.position.set((j - n / 2) * rr(7, 10), rr(-2, 3), rr(-4, 4));
    b.scale.y = 0.65;
    c.add(b);
  }
  const th = rr(0, TAU), r = rr(220, 320);
  c.position.set(Math.cos(th) * r, rr(50, 110), Math.sin(th) * r);
  c.userData = { th, r, speed: rr(0.004, 0.01) };
  c.lookAt(0, c.position.y, 0);
  scene.add(c); clouds.push(c);
}

// ---------------------------------------------------------------- world bookkeeping
const colliders = [];   // {x,z,r}
const avoid = [];       // {x,z,r} for placement
const lampData = [];
function blocked(x, z, r) {
  for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r + r) return true;
  return false;
}
function place(obj, x, z, colR = 0, avoidR = colR) {
  obj.position.set(x, H(x, z), z);
  scene.add(obj);
  if (colR > 0) colliders.push({ x, z, r: colR });
  if (avoidR > 0) avoid.push({ x, z, r: avoidR });
  return obj;
}

// ---------------------------------------------------------------- props
const M = {
  trunk: mat('#9a6a44'), palmTrunk: mat('#c9955f'), leaf: mat('#5cbf47'), leafDark: mat('#3e9a3c'), leafLight: mat('#8fd85a'),
  wood: mat('#b4835a'), woodDark: mat('#8a6040'), white: mat('#fbf6ec'), cream: mat('#f4ead6'),
  roof: mat('#e2735a'), blue: mat('#4f86b8'), grey: mat('#9aa0a6'), red: mat('#e05a4f'),
  window: new THREE.MeshStandardMaterial({ color: 0x9fc6e0, emissive: 0xffc861, emissiveIntensity: 0, roughness: 0.4, flatShading: true }),
  lantern: new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffc35a, emissiveIntensity: 0, roughness: 0.5 }),
  flowerW: mat('#fffaf0'), flowerY: mat('#ffd34d'),
};

function makeLamp() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 6), M.woodDark, 0, 1.1, 0));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), M.woodDark, 0.22, 2.15, 0));
  const lantern = mesh(new THREE.BoxGeometry(0.24, 0.32, 0.24), M.lantern, 0.42, 1.92, 0);
  lantern.castShadow = false;
  g.add(lantern);
  g.add(mesh(new THREE.ConeGeometry(0.22, 0.15, 4), M.woodDark, 0.42, 2.14, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 6), M.grey, 0, 0.06, 0));
  return g;
}
function makeBench() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(1.6, 0.06, 0.16), M.wood, 0, 0.45, -0.18 + i * 0.18));
  for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(1.6, 0.16, 0.05), M.wood, 0, 0.7 + i * 0.2, -0.3));
  for (const x of [-0.65, 0.65]) { g.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), M.woodDark, x, 0.22, -0.05)); g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.06), M.woodDark, x, 0.7, -0.32)); }
  return g;
}
// ---- a cute low-poly boat (shared by every small boat): a hull that's widest just behind the middle, narrows to an
// upturned pointed bow and ends in a flat stern; white topsides, a colored waterline stripe, a soft-colored bottom.
// Local +z is the bow, y = 0 the waterline. o: { L, W, hull, stripe, bottom, rail, deck, motor, windshield, seats,
// wheel, flag, fenders, lights } (all optional). Returns { g, prop, flag, foam, deckY(t), half(t), zAt(t), L, W }.
function cuteHullStation(o, t) {
  const W = o.W, sheer = o.sheer ?? 0.34, draft = o.draft ?? 0.3, up = Math.pow(Math.max(0, (t - 0.6) / 0.4), 2);
  const w = W * (t < 0.55 ? 0.8 + 0.2 * Math.sin((t / 0.55) * Math.PI / 2) : Math.pow(Math.max(0, Math.cos(((t - 0.55) / 0.45) * Math.PI / 2)), 0.75));
  return { z: -o.L / 2 + t * o.L, w, top: sheer + up * 0.34 * (o.L / 3.4), keel: -draft * (1 - up * 0.8) };
}
function cuteHullGeo(o, th0, th1) {
  const NS = 16, NT = 6, pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const s = cuteHullStation(o, i / NS);
    for (let k = 0; k <= NT; k++) { const th = th0 + ((th1 - th0) * k) / NT; pos.push(s.w * Math.cos(th), s.top + (s.keel - s.top) * Math.sin(th), s.z); }
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NT; k++) { const a = i * (NT + 1) + k, b = a + NT + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function makeCuteBoat(o = {}) {
  o = { L: 3.2, W: 0.78, hull: '#fffaf0', stripe: '#5fb4e0', bottom: '#f29ab8', rail: '#f6d55c', deck: '#e8c99a', ...o };
  const g = new THREE.Group(), two = (c) => mat(c, { side: THREE.DoubleSide });
  const sheer = o.sheer ?? 0.34, draft = o.draft ?? 0.3, WL = Math.asin(Math.min(1, sheer / (sheer + draft))); // where the hull meets the water
  for (const [a, b, c] of [[0, 0.07, o.rail], [0.07, WL - 0.13, o.hull], [WL - 0.13, WL + 0.04, o.stripe], [WL + 0.04, Math.PI - WL - 0.04, o.bottom], [Math.PI - WL - 0.04, Math.PI - WL + 0.13, o.stripe], [Math.PI - WL + 0.13, Math.PI - 0.07, o.hull], [Math.PI - 0.07, Math.PI, o.rail]])
    g.add(mesh(cuteHullGeo(o, a, b), two(c)));
  const half = (t) => cuteHullStation(o, t).w, deckY = (t) => cuteHullStation(o, t).top - 0.1, zAt = (t) => -o.L / 2 + t * o.L;
  { // the flat stern: a transom panel, and the recessed deck from stern to bow
    const s = cuteHullStation(o, 0), shp = new THREE.Shape(); shp.moveTo(s.w, s.top);
    for (let k = 1; k <= 12; k++) { const th = (k / 12) * Math.PI; shp.lineTo(s.w * Math.cos(th), s.top + (s.keel - s.top) * Math.sin(th)); }
    g.add(mesh(new THREE.ShapeGeometry(shp), two(o.hull), 0, 0, s.z));
    const dp = [], di = [], N = 14;
    for (let i = 0; i <= N; i++) { const st = cuteHullStation(o, (i / N) * 0.97); dp.push(-st.w * 0.94, st.top - 0.1, st.z, st.w * 0.94, st.top - 0.1, st.z); if (i) di.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setIndex(di); dg.computeVertexNormals();
    g.add(mesh(dg, two(o.deck)));
  }
  if (o.windshield) { // a small curved windshield with a white frame
    const r = half(0.62) * 0.95, zc = zAt(0.62) - r * 0.55;
    const ws = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.38, 12, 1, true, -1.05, 2.1), new THREE.MeshStandardMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    ws.position.set(0, deckY(0.62) + 0.3, zc); ws.rotation.x = -0.28; g.add(ws);
  }
  if (o.wheel) { // a little console with the steering wheel
    const z = zAt(0.5);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.42, 0.32), M.white, 0, deckY(0.5) + 0.21, z));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.04), mat('#6fd0e0'), 0, deckY(0.5) + 0.36, z - 0.17));
    const wheel = new THREE.Group(); wheel.position.set(0, deckY(0.5) + 0.52, z - 0.2); wheel.rotation.x = -0.55; g.add(wheel);
    wheel.add(mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 14), mat('#2b2b3a')));
    for (let k = 0; k < 3; k++) { const sp = mesh(new THREE.BoxGeometry(0.02, 0.15, 0.02), mat('#2b2b3a'), Math.sin((k * TAU) / 3) * 0.075, Math.cos((k * TAU) / 3) * 0.075, 0); sp.rotation.z = (-k * TAU) / 3; wheel.add(sp); }
    g.userData.wheel = wheel;
  }
  for (const s of o.seats || []) { // cushioned seats: a white base, a plump cushion, a backrest
    const z = zAt(s.t), y = deckY(s.t), w = s.w || 0.5, c = mat(s.c || '#f29ab8', { flatShading: false });
    g.add(mesh(new THREE.BoxGeometry(w, 0.22, 0.4), M.white, s.x || 0, y + 0.11, z));
    const cu = mesh(new THREE.CapsuleGeometry(0.09, w - 0.2, 3, 8), c, s.x || 0, y + 0.29, z); cu.rotation.z = Math.PI / 2; cu.scale.set(1, 1, 2); g.add(cu);
    const bk = mesh(new THREE.CapsuleGeometry(0.07, w - 0.24, 3, 8), c, s.x || 0, y + 0.52, z - 0.2); bk.rotation.z = Math.PI / 2; g.add(bk);
  }
  let prop = null;
  if (o.motor) { // a small outboard motor hanging off the stern, propeller underneath
    const m = new THREE.Group(); m.position.set(0, cuteHullStation(o, 0).top, -o.L / 2 - 0.16); g.add(m);
    const cow = mesh(new THREE.CapsuleGeometry(0.17, 0.16, 4, 8), mat(o.motor, { flatShading: false }), 0, 0.12, 0); cow.scale.set(1, 1, 1.25); m.add(cow);
    m.add(mesh(new THREE.BoxGeometry(0.36, 0.05, 0.42), M.white, 0, 0.36, 0));
    m.add(mesh(new THREE.BoxGeometry(0.1, 0.6, 0.12), mat('#3a3a4a'), 0, -0.3, -0.02));
    prop = new THREE.Group(); prop.position.set(0, -0.56, -0.12); m.add(prop);
    prop.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#f6d55c')));
    for (let k = 0; k < 3; k++) { const pv = new THREE.Group(); pv.rotation.z = (k * TAU) / 3; const bl = mesh(new THREE.BoxGeometry(0.06, 0.16, 0.02), mat('#f6d55c'), 0, 0.08, 0); bl.rotation.y = 0.5; pv.add(bl); prop.add(pv); }
    const tiller = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), mat('#3a3a4a'), 0, 0.18, 0.3); tiller.rotation.x = 1.1; m.add(tiller);
  }
  let flag = null;
  if (o.flag) { // a little flag on a pole at the stern
    const pz = zAt(0.06), px = half(0.06) * 0.7, py = deckY(0.06);
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 5), M.white, px, py + 0.45, pz));
    g.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), mat('#f6d55c'), px, py + 0.92, pz));
    const shp = new THREE.Shape(); shp.moveTo(0, 0); shp.lineTo(-0.42, -0.12); shp.lineTo(0, -0.26);
    flag = new THREE.Group(); flag.position.set(px, py + 0.88, pz); flag.rotation.y = -Math.PI / 2; g.add(flag);
    flag.add(mesh(new THREE.ShapeGeometry(shp), mat(o.flag, { side: THREE.DoubleSide })));
  }
  if (o.fenders) for (const t of [0.25, 0.5]) for (const s of [-1, 1]) { // round rubber fenders hanging on the sides
    const st = cuteHullStation(o, t);
    g.add(mesh(new THREE.CapsuleGeometry(0.075, 0.1, 3, 8), mat(o.fenders, { flatShading: false }), s * (st.w + 0.08), st.top - 0.16, st.z));
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 3), M.white, s * (st.w + 0.06), st.top - 0.04, st.z));
  }
  if (o.lights) for (const [s, c] of [[-1, 0xff6a6a], [1, 0x7dffa0]]) { // little running lights: red to port, green to starboard
    const st = cuteHullStation(o, 0.72), l = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: c })); l.position.set(s * st.w * 0.95, st.top + 0.03, st.z); g.add(l);
  }
  // the foam bow wave (shown while moving): two white curls folding off the bow
  const foam = new THREE.Group(); foam.visible = false; g.add(foam);
  const fm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 4, 0, TAU, 0, Math.PI / 2), fm); c.scale.set(0.35, 0.35, 1.5); c.position.set(s * 0.28, 0.02, o.L / 2 - 0.45); c.rotation.y = s * 0.45; foam.add(c); }
  foam.userData.mat = fm;
  return { g, prop, flag, foam, deckY, half, zAt, L: o.L, W: o.W };
}
// every small boat: propeller spin, flag flutter and the bow wave, from how fast it goes (f: 0..1)
function boatFx(b, f, time) {
  if (b.prop) b.prop.rotation.z += 0.25 + f * 1.2;
  if (b.flag) b.flag.rotation.y = -Math.PI / 2 + Math.sin(time * (3 + f * 9)) * (0.12 + f * 0.22) - f * 0.2;
  b.foam.visible = f > 0.05; b.foam.scale.set(0.6 + f * 0.8, 0.5 + f, 0.6 + f * 0.9); b.foam.userData.mat.opacity = 0.35 + f * 0.5;
}
// the moored boats (pier, restaurant pier) bob gently and flutter their flags
const mooredBoats = [];
function makeBoat() {
  const b = makeCuteBoat({ L: 3, W: 0.75, stripe: '#5fb4e0', bottom: '#8fc0f0', rail: '#5fb4e0', fenders: '#f6d55c', flag: '#e0584a', seats: [{ t: 0.3, w: 0.9, c: '#8fc0f0' }] });
  mooredBoats.push(b); return b.g;
}
function makeGull() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.25, 8, 6), M.white); body.scale.set(0.9, 0.8, 2.0); g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), M.white, 0, 0.1, 0.45));
  const beak = mesh(new THREE.ConeGeometry(0.05, 0.2, 5), mat('#f2b134'), 0, 0.08, 0.68); beak.rotation.x = Math.PI / 2; g.add(beak);
  const tail = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.25), mat('#d7dbe0'), 0, 0.03, -0.55); g.add(tail);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.18, 0.08, 0.05);
    const w = mesh(new THREE.BoxGeometry(0.8, 0.04, 0.38), M.white, side * 0.4, 0, 0);
    const tip = mesh(new THREE.BoxGeometry(0.45, 0.04, 0.3), mat('#6f7780'), side * 1.0, 0, -0.03);
    pivot.add(w, tip); g.add(pivot); wings.push({ pivot, side });
  }
  g.userData.wings = wings;
  return g;
}
function flapGull(g, t, speed = 1) {
  const glide = Math.sin(t * 0.7) > 0.4;
  const a = glide ? 0.12 + Math.sin(t * 2) * 0.05 : Math.sin(t * 9 * speed) * 0.55;
  for (const w of g.userData.wings) w.pivot.rotation.z = w.side * a;
}

// ---------------------------------------------------------------- town props: canvas pictures, shops, homes, plots
// little picture textures drawn with canvas paths (signs carry pictures, not words)
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function signPicture(kind) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#fbf3df'; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#8a5a36'; g.stroke();
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 'seed') { // a sprout: stem and two leaves
      g.strokeStyle = '#4f8f2f'; g.lineWidth = 7; g.beginPath(); g.moveTo(64, 100); g.lineTo(64, 60); g.stroke();
      g.fillStyle = '#7cc457';
      g.beginPath(); g.moveTo(64, 64); g.quadraticCurveTo(30, 62, 30, 34); g.quadraticCurveTo(58, 34, 64, 64); g.fill();
      g.beginPath(); g.moveTo(64, 58); g.quadraticCurveTo(98, 54, 98, 26); g.quadraticCurveTo(68, 28, 64, 58); g.fill();
    } else if (kind === 'clothes') { // a t-shirt
      g.fillStyle = '#f08aa0';
      g.beginPath(); g.moveTo(46, 30); g.lineTo(26, 44); g.lineTo(34, 60); g.lineTo(42, 56); g.lineTo(42, 98); g.lineTo(86, 98); g.lineTo(86, 56);
      g.lineTo(94, 60); g.lineTo(102, 44); g.lineTo(82, 30); g.quadraticCurveTo(64, 46, 46, 30); g.fill();
    } else if (kind === 'pet') { // a paw print
      g.fillStyle = '#8a5a36';
      g.beginPath(); g.ellipse(64, 78, 20, 17, 0, 0, TAU); g.fill();
      for (const [x, y] of [[38, 54], [54, 40], [74, 40], [90, 54]]) { g.beginPath(); g.ellipse(x, y, 9, 11, 0, 0, TAU); g.fill(); }
    } else { // an armchair
      g.fillStyle = '#e07a5f';
      g.fillRect(36, 40, 56, 34); g.fillRect(28, 60, 72, 24); g.fillRect(24, 54, 14, 34); g.fillRect(90, 54, 14, 34);
      g.fillStyle = '#8a5a36'; g.fillRect(32, 88, 8, 12); g.fillRect(88, 88, 8, 12);
    }
  });
}
function plateTexture(text, big) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#fbf3df'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a5a36'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#5a4632'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${big ? 64 : 40}px "Trebuchet MS", sans-serif`;
    g.fillText(text, w / 2, h / 2 + 3);
  });
}
const flatPic = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, transparent: true }));
function pyramidRoof(w, d, h, color) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); geo.rotateY(Math.PI / 4); geo.scale(w, h, d);
  return mesh(geo, mat(color));
}
function makeAwning(width, color) {
  const g = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const s = mesh(new THREE.BoxGeometry(width / n, 0.05, 0.75), i % 2 ? M.white : mat(color), -width / 2 + (i + 0.5) * (width / n), 0, 0.3);
    s.rotation.x = 0.35; g.add(s);
  }
  return g;
}
// shop: front faces local +z (turned toward the plaza when placed); every window shares the night glow
function makeShop(spec) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3.8, 0.4, 3.2), mat('#cbbfa9'), 0, -0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(3.4, 2.3, 2.6), M.cream, 0, 1.3, -0.1));
  const roof = pyramidRoof(4.2, 3.4, 1.8, spec.roof); roof.position.set(0, 3.35, -0.1); g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), mat('#9a948e'), 0.95, 3.6, -0.6));
  g.add(mesh(new THREE.BoxGeometry(0.8, 1.35, 0.1), mat('#8a5a36'), 0, 0.87, 1.21));
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), M.flowerY, 0.25, 0.85, 1.28));
  for (const x of [-1.15, 1.15]) {
    const w = mesh(new THREE.BoxGeometry(0.8, 0.75, 0.08), M.window, x, 1.25, 1.22); w.castShadow = false; g.add(w);
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.08, 0.16), M.wood, x, 0.84, 1.25));
  }
  const aw = makeAwning(3.4, spec.roof); aw.position.set(0, 1.95, 1.2); g.add(aw);
  // the picture sign: a round board above the awning, plus a small one on a post by the door
  const board = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 20), M.wood, 0, 2.55, 1.2); board.rotation.x = Math.PI / 2; g.add(board);
  const pic = flatPic(signPicture(spec.kind), 0.95, 0.95); pic.position.set(0, 2.55, 1.26); g.add(pic);
  const lampL = mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), M.lantern, -0.7, 1.7, 1.3); lampL.castShadow = false; g.add(lampL);
  const props = new THREE.Group(); props.position.z = 1.9; g.add(props);
  if (spec.kind === 'seed') {
    [['#e8c76a', -1.3], ['#9fd16a', -0.95], ['#f2a65a', -0.6]].forEach(([c, x]) => {
      props.add(mesh(new THREE.BoxGeometry(0.28, 0.4, 0.16), mat(c), x, 0.2, 0));
      props.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.18), mat('#d9c9a3'), x, 0.42, 0));
    });
    for (const [x, c] of [[0.9, '#ff8fa8'], [1.35, '#fff07a']]) {
      props.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8), mat('#d07a50'), x, 0.15, 0));
      props.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), M.leaf, x, 0.42, 0));
      for (let i = 0; i < 3; i++) props.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(c), x + Math.cos(i * 2.1) * 0.13, 0.55, Math.sin(i * 2.1) * 0.13));
    }
  } else if (spec.kind === 'clothes') {
    // a little display just in front of each window: a shirt and a hat
    for (const [x, c] of [[-1.15, '#f08aa0'], [1.15, '#7ab8f2']]) {
      const shirt = new THREE.Group(); shirt.position.set(x, 1.2, -0.62);
      shirt.add(mesh(new THREE.BoxGeometry(0.34, 0.38, 0.05), mat(c)));
      for (const s of [-1, 1]) { const sl = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), mat(c), s * 0.23, 0.12, 0); sl.rotation.z = s * -0.6; shirt.add(sl); }
      props.add(shirt);
    }
    const hat = new THREE.Group(); hat.position.set(1.5, 0, 0.1);
    hat.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), M.woodDark, 0, 0.45, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14), mat('#e8c76a'), 0, 0.92, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.18, 12), mat('#e8c76a'), 0, 1.02, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 12), mat('#d9705a'), 0, 0.97, 0));
    props.add(hat);
  } else if (spec.kind === 'pet') {
    const pet = (x, fur, ears) => { // a small sitting pet
      const p = new THREE.Group(); p.position.set(x, 0, 0.1);
      p.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(fur), 0, 0.2, 0));
      p.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(fur), 0, 0.45, 0.08));
      for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.06, ears, 4), mat(fur), s * 0.08, 0.6, 0.06); e.rotation.z = s * -0.3; p.add(e); }
      for (const s of [-1, 1]) p.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), mat('#2b211c'), s * 0.05, 0.47, 0.22));
      props.add(p);
    };
    pet(-1.3, '#f2c48a', 0.14); pet(-0.85, '#9a948e', 0.1);
    props.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), M.wood, 1.1, 0.25, 0));
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.42), new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.35, roughness: 0.1 }));
    tank.position.set(1.1, 0.75, 0); props.add(tank);
    props.add(mesh(new THREE.BoxGeometry(0.74, 0.36, 0.36), new THREE.MeshStandardMaterial({ color: 0x6fc7ee, transparent: true, opacity: 0.55 }), 1.1, 0.7, 0));
    for (const [x, y] of [[0.95, 0.75], [1.25, 0.66]]) { const f = mesh(new THREE.SphereGeometry(0.06, 6, 4), mat('#f2a65a'), x, y, 0.02); f.scale.set(1.5, 1, 0.6); props.add(f); }
  } else {
    const chair = (x, c, turn) => {
      const ch = new THREE.Group(); ch.position.set(x, 0, 0); ch.rotation.y = turn;
      ch.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), mat(c), 0, 0.42, 0));
      ch.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), mat(c), 0, 0.7, -0.2));
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) ch.add(mesh(new THREE.BoxGeometry(0.06, 0.38, 0.06), M.woodDark, lx, 0.19, lz));
      props.add(ch);
    };
    chair(-1.35, '#e07a5f', 0.3); chair(-0.7, '#7ab8a8', -0.2);
    const fl = new THREE.Group(); fl.position.set(1.3, 0, 0);
    fl.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.06, 10), M.woodDark, 0, 0.03, 0));
    fl.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), M.woodDark, 0, 0.68, 0));
    const shade = mesh(new THREE.CylinderGeometry(0.18, 0.32, 0.32, 12), M.lantern, 0, 1.4, 0); shade.castShadow = false; fl.add(shade);
    props.add(fl);
  }
  return g;
}
function makeFountain() {
  const g = new THREE.Group();
  const stone = mat('#e6dfd2'), stoneDark = mat('#cfc6b6');
  const waterMatF = new THREE.MeshStandardMaterial({ color: 0x7fd3f0, roughness: 0.15, transparent: true, opacity: 0.85, emissive: 0x2a6f8f, emissiveIntensity: 0.15 });
  g.add(mesh(new THREE.CylinderGeometry(2.1, 2.25, 0.55, 24), stone, 0, 0.27, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.05, 24), waterMatF, 0, 0.5, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.4, 10), stoneDark, 0, 0.9, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.0, 0.45, 0.3, 18), stone, 0, 1.55, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.04, 18), waterMatF, 0, 1.68, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 8), stoneDark, 0, 1.95, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.22, 0.2, 14), stone, 0, 2.3, 0));
  g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), waterMatF, 0, 2.5, 0));
  // droplets arcing from the top bowl into the basin (animated in updateWorld)
  const drops = [];
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.8, emissive: 0x3f8fbf, emissiveIntensity: 0.2 });
  for (let i = 0; i < 16; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), dropMat);
    d.userData = { a: (i / 16) * TAU, ph: (i % 4) / 4 };
    g.add(d); drops.push(d);
  }
  g.userData.drops = drops;
  return g;
}
function makeHome(roof) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.9, 2.0, 2.4), M.cream, 0, 1.15, 0));
  const top = pyramidRoof(3.7, 3.2, 1.5, roof); top.position.set(0, 2.9, 0); g.add(top);
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), mat('#9a948e'), -0.8, 3.1, -0.4));
  g.add(mesh(new THREE.BoxGeometry(0.7, 1.15, 0.1), mat('#a8744a'), -0.45, 0.72, 1.21));
  g.add(mesh(new THREE.SphereGeometry(0.045, 6, 4), M.flowerY, -0.25, 0.72, 1.28));
  const w = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.08), M.window, 0.7, 1.3, 1.22); w.castShadow = false; g.add(w);
  g.add(mesh(new THREE.BoxGeometry(0.85, 0.15, 0.22), mat('#a8744a'), 0.7, 0.92, 1.3));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(['#ff8fa8', '#fff07a', '#c9a6ff'][i]), 0.48 + i * 0.22, 1.04, 1.33));
  for (const z of [-0.5, 0.5]) { const sw = mesh(new THREE.BoxGeometry(0.08, 0.55, 0.55), M.window, 1.46, 1.3, z); sw.castShadow = false; g.add(sw); }
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.12, 0.5), M.wood, -0.45, 0.06, 1.5));
  const lamp = mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), M.lantern, -1.05, 1.5, 1.27); lamp.castShadow = false; g.add(lamp);
  return g;
}
function makeMailbox(n) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), M.woodDark, 0, 0.5, 0));
  const box = new THREE.Group(); box.position.y = 1.08; g.add(box);
  box.add(mesh(new THREE.BoxGeometry(0.34, 0.26, 0.5), mat('#e2735a')));
  const top = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 10, 1, false, 0, Math.PI), mat('#e2735a'), 0, 0.13, 0); top.rotation.set(Math.PI / 2, Math.PI / 2, 0); box.add(top);
  box.add(mesh(new THREE.BoxGeometry(0.04, 0.2, 0.08), M.red, 0.19, 0.12, -0.12));
  // number sign on top, name plate (blank until someone moves in) hanging below the box
  const num = flatPic(plateTexture(String(n), true), 0.42, 0.16); num.position.set(0, 0.42, 0); box.add(num);
  const num2 = num.clone(); num2.rotation.y = Math.PI; box.add(num2);
  const plate = flatPic(plateTexture('', false), 0.62, 0.23); plate.position.set(0, 0.66, 0.06); plate.visible = false; g.add(plate);
  g.userData.plate = plate;
  return g;
}

// a two-seat swing in a wooden A-frame; the seat hangs from userData.pivot (rotated about x to swing).
// Seat spots for both kinds of seat are in the frame of userData.seatFrame, facing local +z.
const SEAT_TOP = 0.48; // seat surface height above the bench/swing base
function makeSwing() {
  const g = new THREE.Group();
  const H_TOP = 2.55;
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.65, 0.65]) {
      const leg = mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.75, 6), M.woodDark, x, H_TOP / 2, z * 0.5);
      leg.rotation.x = z > 0 ? -0.26 : 0.26;
      g.add(leg);
    }
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.08, 1.1), M.wood, x, 0.9, 0));
  }
  const beam = mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.7, 8), M.wood, 0, H_TOP, 0); beam.rotation.z = Math.PI / 2; g.add(beam);
  const pivot = new THREE.Group(); pivot.position.y = H_TOP - 0.05; g.add(pivot);
  const drop = H_TOP - 0.05 - SEAT_TOP;
  for (const x of [-0.8, 0.8]) {
    const rope = mesh(new THREE.CylinderGeometry(0.018, 0.018, drop, 4), mat('#d9c39a'), x, -drop / 2, 0); rope.castShadow = false; pivot.add(rope);
  }
  const seat = new THREE.Group(); seat.position.y = -drop; pivot.add(seat); // seat surface at y = 0 in this frame
  for (let i = 0; i < 3; i++) seat.add(mesh(new THREE.BoxGeometry(1.75, 0.06, 0.15), M.wood, 0, -0.03, -0.16 + i * 0.16));
  for (let i = 0; i < 2; i++) seat.add(mesh(new THREE.BoxGeometry(1.75, 0.13, 0.05), M.wood, 0, 0.25 + i * 0.18, -0.25));
  for (const x of [-0.8, 0.8]) seat.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), M.woodDark, x, 0.25, -0.25));
  g.userData = { pivot, seatFrame: seat, seatY: 0 };
  return g;
}
// a cute girl in a dress with a ponytail, holding a bunch of balloons
function makeBalloonGirl() {
  const g = new THREE.Group();
  const skin = mat('#ffd8bd', { flatShading: false }), hair = mat('#7a4a2c', { flatShading: false });
  const dress = mat('#f5a3c0', { flatShading: false }), dressDark = mat('#e27fa3', { flatShading: false });
  const body = new THREE.Group(); body.position.y = 0.5; g.add(body);
  const skirt = mesh(new THREE.ConeGeometry(0.36, 0.55, 14, 1, true), dress, 0, 0.05, 0); skirt.material.side = THREE.DoubleSide; body.add(skirt);
  body.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.3, 12), dress, 0, 0.42, 0));
  const sash = mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 16), dressDark, 0, 0.3, 0); sash.rotation.x = Math.PI / 2; body.add(sash);
  for (const x of [-0.11, 0.11]) {
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 6), skin, x, 0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.11, 0.07, 0.17), mat('#e27f6a', { flatShading: false }), x, 0.03, 0.03));
  }
  const head = new THREE.Group(); head.position.y = 0.95; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 18, 14), skin));
  const cap = mesh(new THREE.SphereGeometry(0.32, 18, 12, 0, TAU, 0, Math.PI * 0.55), hair, 0, 0.03, -0.03); cap.rotation.x = -0.3; head.add(cap);
  for (const x of [-0.12, 0, 0.12]) { const bang = mesh(new THREE.SphereGeometry(0.09, 8, 6), hair, x, 0.2, 0.22); bang.scale.set(1, 0.6, 0.6); head.add(bang); }
  const tail = new THREE.Group(); tail.position.set(0, 0.18, -0.28); head.add(tail);
  tail.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#f25c7a', { flatShading: false }))); // scrunchie
  const pony = mesh(new THREE.ConeGeometry(0.11, 0.42, 10), hair, 0, -0.2, -0.06); pony.rotation.x = Math.PI - 0.35; tail.add(pony);
  for (const x of [-0.1, 0.1]) {
    head.add(mesh(new THREE.SphereGeometry(0.037, 8, 6), mat('#2b211c', { flatShading: false }), x, -0.02, 0.27));
    const blush = mesh(new THREE.SphereGeometry(0.042, 8, 6), mat('#ffb1a0', { flatShading: false }), x * 1.6, -0.09, 0.24); blush.scale.z = 0.3; head.add(blush);
  }
  const arms = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.21, 0.52, 0); body.add(arm);
    arm.add(mesh(new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), skin, 0, -0.15, 0));
    arms[side < 0 ? 'left' : 'right'] = arm;
  }
  // balloons on strings from the left hand, gathered in one bunch that sways
  const bunch = new THREE.Group(); bunch.position.set(-0.32, 0.75, 0.05); body.add(bunch);
  const colors = ['#ff6b6b', '#ffd84d', '#7ab8f2', '#8fd17a', '#c79af2', '#ff9ad5'];
  const balloons = [];
  colors.forEach((c, i) => {
    const a = (i / colors.length) * TAU, top = new THREE.Vector3(Math.cos(a) * 0.32, 1.25 + (i % 3) * 0.17, Math.sin(a) * 0.25);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.05 }));
    ball.scale.y = 1.2; ball.position.copy(top); ball.castShadow = true; bunch.add(ball);
    ball.add(mesh(new THREE.ConeGeometry(0.04, 0.06, 6), mat(c), 0, -0.21, 0));
    const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), top.clone().add(new THREE.Vector3(0, -0.25, 0))]);
    bunch.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xf5efe0 })));
    balloons.push({ ball, base: top.clone(), ph: i * 1.3 });
  });
  g.userData = { body, head, arms, bunch, balloons, tail };
  return g;
}

// ---------------------------------------------------------------- place the island
// the pier runs out from the bottom beach along the traced direction; it starts where the sand meets the water
const dockDir = new THREE.Vector2(LAYOUT.pier.dir.x, LAYOUT.pier.dir.z).normalize();
const dockStart = (() => {
  const r = LAYOUT.pier.root;
  for (let t = 0; t < 20; t += 0.05) if (H(r.x + dockDir.x * t, r.z + dockDir.y * t) < 0) return new THREE.Vector2(r.x, r.z).addScaledVector(dockDir, t - 1.6);
  return new THREE.Vector2(r.x, r.z);
})();
const dockEnd = dockStart.clone().addScaledVector(dockDir, LAYOUT.pier.len);
const DOCK_Y = 0.42;

// stone paths, as traced from the painting (see below)
const pathSegs = [];
const seg = (a, b, w = 0.55, boards = false) => pathSegs.push([a, b, w, boards]); // w: how far stones spread either side of the line; boards: planks, no stones
// the loop road (not across the paved plaza), each yard's spur from it to the gate, the pier walk, the lighthouse
// road and the pond path, as traced
const LOOP = loopPolyline(LAYOUT, 1);
const inPlaza = (q) => Math.hypot(q.x - TOWN.x, q.z - TOWN.z) < PLAZA_R - 0.2;
LOOP.forEach((a, i) => { const b = LOOP[(i + 1) % LOOP.length]; if (!inPlaza(a) || !inPlaza(b)) seg(a, b, LAYOUT.loop.width / 2); });
const nearestOnLoop = (q) => LOOP.reduce((best, c) => (Math.hypot(c.x - q.x, c.z - q.z) < Math.hypot(best.x - q.x, best.z - q.z) ? c : best), LOOP[0]);
for (const p of PLOTS) {
  const way = plotVisit(p);
  let prev = nearestOnLoop(way[0]);
  p.pathFrom = prev;
  for (const w of way) { seg(prev, w); prev = w; }
  p.pathTo = prev;
}
const polyPath = (list) => { for (let i = 0; i + 1 < list.length; i++) seg({ x: list[i][0], z: list[i][1] }, { x: list[i + 1][0], z: list[i + 1][1] }); };
for (const sh of SHOPS) {
  const dx = TOWN.x - sh.x, dz = TOWN.z - sh.z, l = Math.hypot(dx, dz);
  seg({ x: TOWN.x - (dx / l) * (PLAZA_R - 0.3), z: TOWN.z - (dz / l) * (PLAZA_R - 0.3) }, { x: sh.x + (dx / l) * 2.2, z: sh.z + (dz / l) * 2.2 });
}
polyPath(LAYOUT.lighthouseRoad);
polyPath(LAYOUT.pondPath);
polyPath(LAYOUT.gardenPath); // the island garden's footpath west over the river to the ring road
// the roads out to the desert (east) and the beach (west), from the ring road; the desert trail to the huts; the boardwalk
for (const road of Object.values(LAYOUT.roads)) {
  seg(nearestOnLoop({ x: road[0][0], z: road[0][1] }), { x: road[0][0], z: road[0][1] }, 0.85);
  for (let i = 0; i + 1 < road.length; i++) seg({ x: road[i][0], z: road[i][1] }, { x: road[i + 1][0], z: road[i + 1][1] }, 0.85);
}
polyPath(LAYOUT.desert.hutPath);
for (let i = 0; i + 1 < LAYOUT.beach.boardwalk.length; i++) { const [a, b] = [LAYOUT.beach.boardwalk[i], LAYOUT.beach.boardwalk[i + 1]]; seg({ x: a[0], z: a[1] }, { x: b[0], z: b[1] }, 1.1, true); }
{ const [x, z] = LAYOUT.gardenPath[LAYOUT.gardenPath.length - 1], r = nearestOnLoop({ x, z }); seg({ x, z }, r); }
// from the plaza out to the ring road (each spoke ends on the ring), and from the ring down to the pier
for (const spoke of LAYOUT.townSpokes) { polyPath(spoke); const [x, z] = spoke[spoke.length - 1], r = nearestOnLoop({ x, z }); seg({ x, z }, r); }
const pierJoin = nearestOnLoop({ x: LAYOUT.pier.root.x, z: LAYOUT.pier.root.z });
seg(pierJoin, { x: dockStart.x, z: dockStart.y });
{ const r = nearestOnLoop({ x: LAYOUT.lighthouseRoad[0][0], z: LAYOUT.lighthouseRoad[0][1] }); seg(r, { x: LAYOUT.lighthouseRoad[0][0], z: LAYOUT.lighthouseRoad[0][1] }); }

{ // the balloon park's path: from the ring road to the meadow's edge
  const c = { x: LAYOUT.balloon.x, z: LAYOUT.balloon.z }, r = nearestOnLoop(c), l = Math.hypot(r.x - c.x, r.z - c.z);
  seg(r, { x: c.x + ((r.x - c.x) / l) * 3.4, z: c.z + ((r.z - c.z) / l) * 3.4 }, 0.7);
}
const pathSamples = [];
for (const [a, b, w, boards] of pathSegs) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
  for (let i = 0; i <= n; i++) { const v = new THREE.Vector3(lerp(a.x, b.x, i / n), 0, lerp(a.z, b.z, i / n)); v.w = w; v.boards = boards; pathSamples.push(v); }
}
for (const p of pathSamples) avoid.push({ x: p.x, z: p.z, r: 0.45 + p.w });
{
  const stoneGeo = new THREE.CircleGeometry(0.5, 7); stoneGeo.rotateX(-Math.PI / 2);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, pathSamples.length * 5);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
  const tones = [0xddd2bd, 0xd2c6ae, 0xe6dccb, 0xcbbfa6];
  let n = 0;
  for (const p of pathSamples) {
    if (p.boards) continue; // the boardwalk has its own planks
    for (let k = 0; k < (p.w > 0.6 ? 5 : 3); k++) {
      const x = p.x + rr(-p.w, p.w), z = p.z + rr(-p.w, p.w);
      const h = H(x, z);
      if (h < 0.05) continue;
      q.setFromAxisAngle(v.set(0, 1, 0), rr(0, TAU));
      s.setScalar(rr(0.7, 1.05));
      m4.compose(v.set(x, h + 0.03, z), q, s);
      inst.setColorAt(n, col.setHex(pick(tones)));
      inst.setMatrixAt(n++, m4);
    }
  }
  inst.count = n;
  inst.receiveShadow = true;
  scene.add(inst);
}

// ---------------------------------------------------------------- bridges over the river
// Wherever a road or path crosses the river, an arched wooden bridge with railings and two little lamps. A bridge's
// deck is walkable ground (onBridge gives its height); the river beside it is water and can't be walked into.
const RIVER_PTS = riverPolyline(LAYOUT, 0.5);
const bridges = (() => {
  const cross = [];
  const hit = (a, b, c, d) => { // segments a-b and c-d: where they cross, or null
    const r = { x: b.x - a.x, z: b.z - a.z }, q = { x: d.x - c.x, z: d.z - c.z }, den = r.x * q.z - r.z * q.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * q.z - (c.z - a.z) * q.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + r.x * t, z: a.z + r.z * t, dx: r.x, dz: r.z, w: 0 } : null;
  };
  for (const [a, b, w] of pathSegs) for (let i = 0; i + 1 < RIVER_PTS.length; i++) {
    const c = hit(a, b, RIVER_PTS[i], RIVER_PTS[i + 1]);
    if (c && !cross.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 4)) { c.w = w; cross.push(c); }
  }
  return cross.map((c) => {
    const l = Math.hypot(c.dx, c.dz), ux = c.dx / l, uz = c.dz / l;
    const halfW = Math.max(1.0, c.w + 0.45) + 0.4;
    // out to dry ground across the bridge's whole width (the river bends, so its banks aren't square to the path)
    const dryAt = (t, sgn) => [-halfW, 0, halfW].every((o) => H(c.x + ux * t * sgn - uz * o, c.z + uz * t * sgn + ux * o) >= 0.35);
    const reach = (sgn) => { let t = 0; while (t < 10 && !dryAt(t, sgn)) t += 0.1; return t + 0.4; };
    const t0 = reach(-1), t1 = reach(1), len = t0 + t1;
    const cx = c.x + ux * (t1 - t0) / 2, cz = c.z + uz * (t1 - t0) / 2;
    const yA = Math.max(H(cx - ux * len / 2, cz - uz * len / 2), 0.2), yB = Math.max(H(cx + ux * len / 2, cz + uz * len / 2), 0.2);
    return { x: cx, z: cz, ux, uz, len, half: Math.max(1.0, c.w + 0.45), yA, yB, rise: 0.55 };
  });
})();
// the deck height at (x, z) if that point is on a bridge, else null
function onBridge(x, z, shrink = 0) { // shrink: count only the middle of the deck (for planning paths)
  for (const b of bridges) {
    const px = x - b.x, pz = z - b.z, along = px * b.ux + pz * b.uz, across = Math.abs(px * b.uz - pz * b.ux);
    if (across > b.half - shrink || Math.abs(along) > b.len / 2) continue;
    const u = along / b.len + 0.5;
    return lerp(b.yA, b.yB, u) + Math.sin(u * Math.PI) * b.rise + 0.1;
  }
  return null;
}
for (const b of bridges) {
  const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = Math.atan2(b.ux, b.uz); scene.add(g);
  const n = Math.max(8, Math.round(b.len / 0.3)), plankW = b.half * 2 + 0.2;
  for (let i = 0; i < n; i++) { // planks following the arch
    const u = (i + 0.5) / n, y = lerp(b.yA, b.yB, u) + Math.sin(u * Math.PI) * b.rise;
    const pl = mesh(new THREE.BoxGeometry(plankW, 0.1, b.len / n * 0.92), i % 3 ? M.wood : mat('#a9774f'), 0, y, (u - 0.5) * b.len);
    pl.rotation.x = -Math.atan2(Math.cos(u * Math.PI) * Math.PI * b.rise / b.len + (b.yB - b.yA) / b.len, 1); g.add(pl);
  }
  for (const side of [-1, 1]) { // railings: posts and a rail along the arch
    const posts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, y = lerp(b.yA, b.yB, u) + Math.sin(u * Math.PI) * b.rise;
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.7, 0.09), M.woodDark, side * (b.half + 0.05), y + 0.35, (u - 0.5) * b.len));
      posts.push(new THREE.Vector3(side * (b.half + 0.05), y + 0.68, (u - 0.5) * b.len));
    }
    for (let i = 0; i < 6; i++) {
      const a = posts[i], c = posts[i + 1], d = c.clone().sub(a), r = mesh(new THREE.BoxGeometry(0.07, 0.07, d.length() + 0.04), M.wood);
      r.position.copy(a).add(c).multiplyScalar(0.5); r.lookAt(g.localToWorld(c.clone())); g.add(r);
    }
  }
  g.updateMatrixWorld(true);
  for (const [side, end] of [[-1, -0.5], [1, 0.5]]) { // two little lamps at opposite corners
    const z = end * b.len, y = end < 0 ? b.yA : b.yB;
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6), M.woodDark, side * (b.half + 0.05), y + 0.6, z));
    const lan = mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), M.lantern, side * (b.half + 0.05), y + 1.3, z); lan.castShadow = false; g.add(lan);
    const at = g.localToWorld(new THREE.Vector3(side * (b.half + 0.05), y + 1.3, z));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.copy(at); glow.scale.set(1.4, 1.4, 1); scene.add(glow);
    lampData.push({ pos: at.clone(), light: null, glow });
    colliders.push({ x: at.x, z: at.z, r: 0.1 });
  }
  avoid.push({ x: b.x, z: b.z, r: b.len / 2 + 1.5 });
}
// nothing grows in the river or on its banks
for (const q of riverPolyline(LAYOUT, 1)) avoid.push({ x: q.x, z: q.z, r: LAYOUT.river.half + 1.4 });

// the plaza: a round paved disc with a fountain in the middle and benches around it
const plazaY = FLATS[0].h;
const seatSpots = []; // { id, kind: 'bench' | 'swing' | 'chair' | 'lounger', holder, frame, local }
const festBenches = [], parasolTops = []; // the festival's benches and the beach parasols (made sittable / see-through further down)
{
  scene.add(mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 0.15, 0.4, 48), mat('#ddd3c1'), TOWN.x, plazaY - 0.12, TOWN.z));
  scene.add(mesh(new THREE.CylinderGeometry(PLAZA_R - 1.6, PLAZA_R - 1.6, 0.42, 40), mat('#cfc3ad'), TOWN.x, plazaY - 0.11, TOWN.z));
  scene.add(mesh(new THREE.CylinderGeometry(PLAZA_R - 2.0, PLAZA_R - 2.0, 0.44, 40), mat('#e3dacb'), TOWN.x, plazaY - 0.1, TOWN.z));
  avoid.push({ x: TOWN.x, z: TOWN.z, r: PLAZA_R + 1.2 });
  // the plaza's three benches, left / middle / right as seen from the camera; the middle one is a swing.
  // Each is a two-person seat; seat ids 0-1 left bench, 2-3 swing, 4-5 right bench (the server uses the same ids).
  for (const [a, kind] of [[150, 'bench'], [115, 'swing'], [20, 'bench']]) {
    const p = polar(a, PLAZA_R - 0.8);
    const b = kind === 'swing' ? makeSwing() : makeBench();
    b.position.set(p.x, plazaY + 0.08, p.z); b.rotation.y = Math.atan2(TOWN.x - p.x, TOWN.z - p.z); scene.add(b);
    colliders.push({ x: p.x, z: p.z, r: 0.75 });
    if (kind === 'swing') for (const lx of [-1.2, 1.2]) { // the frame's legs
      const c = new THREE.Vector3(lx, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.rotation.y);
      colliders.push({ x: p.x + c.x, z: p.z + c.z, r: 0.3 });
    }
    for (const lx of [-0.42, 0.42]) {
      seatSpots.push({ id: seatSpots.length, kind, holder: b, frame: kind === 'swing' ? b.userData.seatFrame : b, local: new THREE.Vector3(lx, kind === 'swing' ? 0 : SEAT_TOP, 0.04) });
    }
  }
}
// the balloon girl stands by the fountain, at the front where players arrive
const npcGirl = makeBalloonGirl();
{
  const p = polar(68, 4.4);
  npcGirl.position.set(p.x, plazaY + 0.08, p.z);
  npcGirl.rotation.y = Math.atan2(TOWN.x - p.x, TOWN.z - p.z) + Math.PI; // facing away from the fountain
  npcGirl.userData.baseYaw = npcGirl.rotation.y;
  scene.add(npcGirl);
  colliders.push({ x: p.x, z: p.z, r: 0.45 });
}
const fountain = makeFountain();
const FOUNTAIN_SCALE = 0.65; // a smaller fountain, leaving more of the plaza open
fountain.scale.setScalar(FOUNTAIN_SCALE);
fountain.position.set(TOWN.x, plazaY + 0.08, TOWN.z);
scene.add(fountain);
colliders.push({ x: TOWN.x, z: TOWN.z, r: 2.25 * FOUNTAIN_SCALE });

// the four shops, facing the plaza
for (const s of SHOPS) {
  const shop = makeShop(s);
  shop.position.set(s.x, FLATS.find((f) => f.x === s.x && f.z === s.z).h + 0.15, s.z);
  shop.rotation.y = Math.atan2(TOWN.x - s.x, TOWN.z - s.z);
  scene.add(shop);
  for (const lx of [-0.9, 0.9]) { // two circles cover the building's width
    const c = new THREE.Vector3(lx, 0, -0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), shop.rotation.y);
    colliders.push({ x: s.x + c.x, z: s.z + c.z, r: 1.45 });
  }
  avoid.push({ x: s.x, z: s.z, r: 3.8 });
  { // no trees in front of any shop, so the shopkeeper and the door stay in plain view
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), shop.rotation.y);
    for (const [ahead, side, r] of [[3.5, 0, 2.9], [1.75, 2.3, 1.8], [1.75, -2.3, 1.8], [4.5, 2.3, 2.2], [4.5, -2.3, 2.2]]) {
      avoid.push({ x: s.x + fwd.x * ahead + fwd.z * side, z: s.z + fwd.z * ahead - fwd.x * side, r });
    }
  }
  s.obj = shop;
}

// ---------------------------------------------------------------- the playground: a Ferris wheel and a merry-go-round
// Both after ref/notes.md, in the island's own low-poly style. They turn from the shared clock (one turn every
// periodMs, the same formula as the server), so every player sees the same gondola in the same place.
const RIDES = LAYOUT.rides;
const rodBetween = (a, b, r, m) => {
  const d = b.clone().sub(a), o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m);
  o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
};
const wheelAngle = (t) => ((((t % RIDES.ferris.periodMs) + RIDES.ferris.periodMs) % RIDES.ferris.periodMs) / RIDES.ferris.periodMs) * TAU;
const carouselAngle = (t) => -((((t % RIDES.carousel.periodMs) + RIDES.carousel.periodMs) % RIDES.carousel.periodMs) / RIDES.carousel.periodMs) * TAU;
function makeFerris(cfg) {
  const g = new THREE.Group(), cream = mat('#f4ecd8'), pink = mat('#f2a6c0'), grey = mat('#6b7079');
  const R = cfg.radius, HY = cfg.hubY;
  g.add(mesh(new THREE.CylinderGeometry(cfg.pad, cfg.pad + 0.1, 0.22, 28), mat('#ded2bb'), 0, 0.08, 0)); // round pad
  // A-frame legs from the feet up to the hub, front and back of the wheel
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const foot = new THREE.Vector3(sx * 2.1, 0.2, sz * 1.0), top = new THREE.Vector3(0, HY, sz * 0.5);
    g.add(rodBetween(foot, top, 0.11, cream));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.22, 0.4), grey, foot.x, 0.25, foot.z));
  }
  const wheel = new THREE.Group(); wheel.position.set(0, HY, 0); g.add(wheel);
  for (const z of [-0.32, 0.32]) {
    const rim = mesh(new THREE.TorusGeometry(R, 0.07, 6, 56), cream); rim.position.z = z; wheel.add(rim);
    for (let i = 0; i < 16; i++) { // thin spokes
      const a = (i / 16) * TAU, sp = mesh(new THREE.BoxGeometry(0.05, R, 0.05), cream, Math.cos(a) * R / 2, Math.sin(a) * R / 2, z);
      sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
    }
  }
  wheel.add(mesh(new THREE.TorusGeometry(R * 0.8, 0.05, 6, 48), pink)); // the pink inner ring
  const hub = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 14), pink); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  const cap = mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.06, 14), mat('#f2c94c')); cap.rotation.x = Math.PI / 2; wheel.add(cap);
  for (let i = 0; i < 16; i++) { // little bulbs round the rim: they light up at dusk
    const a = (i / 16 + 1 / 32) * TAU, b = mesh(new THREE.SphereGeometry(0.08, 6, 4), M.lantern, Math.cos(a) * R, Math.sin(a) * R, 0.4); b.castShadow = false; wheel.add(b);
  }
  // pastel box gondolas: they hang from the rim and stay upright as the wheel turns
  const colours = ['#f2c94c', '#f2a6c0', '#f0a040', '#c9a6ff', '#9be0c0', '#6fd3d0', '#8fc0f0', '#ffb3a0'];
  const gondolas = [];
  for (let k = 0; k < cfg.gondolas; k++) {
    const gd = new THREE.Group(), c = mat(colours[k % colours.length]);
    gd.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), grey, 0, -0.25, 0));
    gd.add(mesh(new THREE.BoxGeometry(1.0, 0.75, 0.9), c, 0, -0.85, 0));
    gd.add(mesh(new THREE.BoxGeometry(1.12, 0.12, 1.02), mat('#fbf6ec'), 0, -0.42, 0));
    const win = mesh(new THREE.BoxGeometry(0.62, 0.3, 0.04), M.window, 0, -0.78, 0.46); win.castShadow = false; gd.add(win);
    const seat = new THREE.Object3D(); seat.position.set(0, -1.0, 0.05); gd.add(seat); // where a rider sits
    gd.userData.seat = seat;
    g.add(gd); gondolas.push(gd);
  }
  return { g, wheel, gondolas };
}
function makeCarousel(cfg) {
  const g = new THREE.Group(), beige = mat('#e8d9bf'), gold = mat('#e8c25a');
  g.add(mesh(new THREE.CylinderGeometry(cfg.pad - 0.1, cfg.pad, 0.35, 28), beige, 0, 0.18, 0)); // the raised platform
  g.add(mesh(new THREE.TorusGeometry(cfg.pad - 0.05, 0.05, 4, 40), gold, 0, 0.35, 0)).rotation.x = 0;
  const top = new THREE.Group(); top.position.y = 0.36; g.add(top); // everything that turns
  top.add(mesh(new THREE.CylinderGeometry(0.34, 0.4, 2.7, 12), mat('#c9a26a'), 0, 1.35, 0)); // the central column
  // the striped canopy: 12 wedges, pink and cream
  const canopyGeo = new THREE.ConeGeometry(cfg.pad + 0.3, 1.05, 12, 1, true);
  canopyGeo.clearGroups(); for (let i = 0; i < 12; i++) canopyGeo.addGroup(i * 6, 6, i % 2);
  const canopy = new THREE.Mesh(canopyGeo, [mat('#f29ab8', { side: THREE.DoubleSide }), mat('#fbf0dc', { side: THREE.DoubleSide })]);
  canopy.position.y = 3.2; canopy.castShadow = true; top.add(canopy);
  const rim = mesh(new THREE.TorusGeometry(cfg.pad + 0.3, 0.06, 4, 40), gold, 0, 2.68, 0); rim.rotation.x = Math.PI / 2; top.add(rim);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, b = mesh(new THREE.SphereGeometry(0.08, 6, 4), M.lantern, Math.cos(a) * (cfg.pad + 0.3), 2.56, Math.sin(a) * (cfg.pad + 0.3)); b.castShadow = false; top.add(b); }
  top.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), M.woodDark, 0, 4.0, 0));
  const flag = mesh(new THREE.ConeGeometry(0.18, 0.4, 3), mat('#f29ab8'), 0.18, 4.2, 0); flag.rotation.z = -Math.PI / 2; top.add(flag);
  // 6 cute animals on gold poles: ponies and deer in pastel colours, each with a coloured saddle
  const coats = ['#c9a6ff', '#9be0c0', '#fbf0dc', '#f2c94c', '#8fc0f0', '#f2a6c0'], saddles = ['#f29ab8', '#6fd3d0', '#d9584a', '#5b8fd6', '#f0a040', '#4fa36a'];
  const animals = [];
  for (let k = 0; k < cfg.seats; k++) {
    const a = (k / cfg.seats) * TAU, holder = new THREE.Group(); holder.position.set(Math.cos(a) * cfg.seatR, 0, Math.sin(a) * cfg.seatR);
    holder.rotation.y = -a; // nose along the way it turns
    top.add(holder);
    holder.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 5), gold, 0, 1.2, 0));
    const an = new THREE.Group(); holder.add(an);
    const coat = mat(coats[k]), deer = k % 2 === 1;
    const body = mesh(new THREE.CapsuleGeometry(0.2, 0.5, 3, 8), coat, 0, 0.78, 0); body.rotation.x = Math.PI / 2; an.add(body);
    const neck = mesh(new THREE.CapsuleGeometry(0.09, 0.25, 3, 6), coat, 0, 1.0, 0.34); neck.rotation.x = 0.6; an.add(neck);
    an.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), coat, 0, 1.16, 0.46));
    an.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), M.woodDark, 0.08, 1.2, 0.58));
    an.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), M.woodDark, -0.08, 1.2, 0.58));
    if (deer) for (const sx of [-1, 1]) an.add(rodBetween(new THREE.Vector3(sx * 0.06, 1.28, 0.42), new THREE.Vector3(sx * 0.16, 1.48, 0.38), 0.02, M.woodDark)); // little antlers
    else for (const sx of [-1, 1]) an.add(mesh(new THREE.ConeGeometry(0.04, 0.1, 4), coat, sx * 0.07, 1.31, 0.42)); // pony ears
    for (const [lx, lz] of [[-0.11, 0.24], [0.11, 0.24], [-0.11, -0.24], [0.11, -0.24]]) an.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.4, 5), coat, lx, 0.48, lz));
    an.add(mesh(new THREE.BoxGeometry(0.34, 0.06, 0.36), mat(saddles[k]), 0, 0.98, -0.04));
    const tail = mesh(new THREE.ConeGeometry(0.06, 0.24, 5), mat(saddles[k]), 0, 0.84, -0.38); tail.rotation.x = -2.3; an.add(tail);
    const seat = new THREE.Object3D(); seat.position.set(0, 1.03, -0.04); an.add(seat);
    an.userData.seat = seat; an.userData.k = k;
    animals.push(an);
  }
  return { g, top, animals };
}
const ferris = makeFerris(RIDES.ferris), carousel = makeCarousel(RIDES.carousel);
for (const [ride, cfg, colR] of [[ferris, RIDES.ferris, 0], [carousel, RIDES.carousel, RIDES.carousel.pad + 0.15]]) {
  ride.g.position.set(cfg.x, H(cfg.x, cfg.z), cfg.z);
  scene.add(ride.g);
  avoid.push({ x: cfg.x, z: cfg.z, r: cfg.pad + 2.2 }); // no trees, bushes or rocks on or round the rides
  if (colR) colliders.push({ x: cfg.x, z: cfg.z, r: colR }); // the turning platform: you board with the Ride button
}
for (const sz of [-1, 1]) for (const sx of [-1, 1]) colliders.push({ x: RIDES.ferris.x + sx * 2.1, z: RIDES.ferris.z + sz * 1.0, r: 0.35 }); // the wheel's feet
colliders.push({ x: RIDES.ferris.x, z: RIDES.ferris.z, r: 0.9 });
// a soft glow over each ride at dusk and night (the bulbs themselves light up with the lamps)
for (const [x, y, z, s] of [[RIDES.ferris.x, H(RIDES.ferris.x, RIDES.ferris.z) + RIDES.ferris.hubY, RIDES.ferris.z + 0.6, 3.2], [RIDES.carousel.x, H(RIDES.carousel.x, RIDES.carousel.z) + 3.0, RIDES.carousel.z, 4.5]]) {
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.position.set(x, y, z); glow.scale.set(s, s, 1); scene.add(glow);
  lampData.push({ pos: glow.position.clone(), light: null, glow });
}
// where you board each ride (just outside its pad, on the town side)
const RIDE_ENTRANCE = {
  ferris: { x: RIDES.ferris.x, z: RIDES.ferris.z + RIDES.ferris.pad + 0.6 },
  carousel: { x: RIDES.carousel.x - RIDES.carousel.pad - 0.9, z: RIDES.carousel.z },
};
function turnRides(time) {
  const t = nowMs(), w = wheelAngle(t), cfg = RIDES.ferris;
  ferris.wheel.rotation.z = w;
  ferris.gondolas.forEach((gd, k) => {
    const a = (k / cfg.gondolas) * TAU + w;
    gd.position.set(Math.cos(a) * cfg.radius, cfg.hubY + Math.sin(a) * cfg.radius, 0);
    gd.rotation.z = Math.sin(time * 1.3 + k) * 0.04; // a little sway
  });
  carousel.top.rotation.y = carouselAngle(t);
  carousel.animals.forEach((an, k) => { an.position.y = 0.16 + Math.sin(t / 520 + k * 2.1) * 0.16; }); // the gentle up-and-down
}

// ---------------------------------------------------------------- shopkeepers: one NPC in front of each shop
// A shared base body (same proportions as the players), dressed differently per shop, plus their little props.
// Nothing here uses the world's random numbers, so the island layout stays exactly as it was.
function makeTownNpc(o) {
  const g = new THREE.Group();
  const soft = (c) => mat(c, { flatShading: false });
  const skin = soft(o.skin), hair = soft(o.hair), top = soft(o.top), bottom = soft(o.bottom), shoe = soft(o.shoes || '#7a4e34');
  const body = new THREE.Group(); body.position.y = 0.55; g.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.22, 0.25, 4, 10), top, 0, 0.2, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.235, 0.24, 0.16, 10), bottom, 0, 0.0, 0));
  const head = new THREE.Group(); head.position.y = 0.72; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.33, 18, 14), skin));
  const cap = mesh(new THREE.SphereGeometry(0.35, 18, 12, 0, TAU, 0, Math.PI * (o.longHair ? 0.62 : 0.52)), hair, 0, 0.03, -0.03); cap.rotation.x = -0.25; head.add(cap);
  for (const x of [-0.11, 0.11]) {
    head.add(mesh(new THREE.SphereGeometry(0.038, 8, 6), soft('#2b211c'), x, -0.02, 0.3));
    const blush = mesh(new THREE.SphereGeometry(0.044, 8, 6), soft('#ffb1a0'), x * 1.6, -0.1, 0.27); blush.scale.z = 0.3; head.add(blush);
  }
  const arm = (side) => {
    const a = new THREE.Group(); a.position.set(side * 0.27, 0.36, 0); body.add(a);
    a.add(mesh(new THREE.CapsuleGeometry(0.065, 0.1, 3, 6), top, 0, -0.06, 0)); // sleeve
    a.add(mesh(new THREE.CapsuleGeometry(0.058, 0.14, 3, 6), skin, 0, -0.2, 0));
    const hand = new THREE.Group(); hand.position.y = -0.32; a.add(hand);
    return { a, hand };
  };
  const L = arm(-1), R = arm(1);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.11, 0.55, 0); g.add(leg);
    leg.add(mesh(new THREE.CapsuleGeometry(0.068, 0.22, 3, 6), bottom, 0, -0.24, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), shoe, 0, -0.45, 0.03));
    legs.push(leg);
  }
  g.add(nameTag(o.name, o.tag));
  return { g, body, head, armL: L.a, armR: R.a, handL: L.hand, handR: R.hand, legs, soft };
}
const SHOPKEEPERS = {
  seed: { name: 'Mira', tag: '#8fd17a', skin: '#ffd8bd', hair: '#c0703a', top: '#e97a6a', bottom: '#5d8fc4', longHair: true, dress(n) {
    // straw hat, denim overalls (bib and straps over a red shirt), a little watering can in the left hand
    const straw = n.soft('#e8c76a');
    n.head.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 16), straw, 0, 0.22, 0));
    n.head.add(mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.22, 14), straw, 0, 0.34, 0));
    n.head.add(mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.05, 14), n.soft('#d9705a'), 0, 0.27, 0));
    for (const s of [-1, 1]) { const braid = mesh(new THREE.CapsuleGeometry(0.06, 0.2, 3, 6), n.soft('#c0703a'), s * 0.25, -0.18, -0.08); braid.rotation.z = s * 0.2; n.head.add(braid); }
    n.body.add(mesh(new THREE.BoxGeometry(0.32, 0.26, 0.06), n.soft('#5d8fc4'), 0, 0.18, 0.2));
    for (const s of [-1, 1]) n.body.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), n.soft('#4f7fb0'), s * 0.12, 0.38, 0.19));
    const can = new THREE.Group(); can.position.set(0, -0.06, 0.08); n.handL.add(can);
    can.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.15, 10), n.soft('#6fb8a8'), 0, -0.05, 0));
    const spout = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.18, 6), n.soft('#6fb8a8'), 0, -0.02, 0.12); spout.rotation.x = 1.0; can.add(spout);
    n.can = can;
    const pot = new THREE.Group(); pot.position.set(0.25, 0, 0.55); n.g.add(pot);
    pot.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 8), mat('#d07a50'), 0, 0.09, 0));
    pot.add(mesh(new THREE.IcosahedronGeometry(0.1, 0), M.leaf, 0, 0.25, 0));
    pot.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), mat('#ff8fa8'), 0.03, 0.33, 0.02));
    const drops = [];
    for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.85 })); d.visible = false; pot.add(d); drops.push(d); }
    n.drops = drops; n.pot = pot; n.props = [pot];
  } },
  clothes: { name: 'Tess', tag: '#f2a6c8', skin: '#f5c9a8', hair: '#2b2b3a', top: '#c9a6ff', bottom: '#3a3f5a', shoes: '#2b2b3a', dress(n) {
    // a striped scarf, a measuring tape around the neck, and a display stand with a shirt beside her
    const scarf1 = mesh(new THREE.TorusGeometry(0.17, 0.06, 6, 14), n.soft('#f08a7a'), 0, 0.48, 0); scarf1.rotation.x = Math.PI / 2; n.body.add(scarf1);
    const scarf2 = mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 14), n.soft('#ffd84d'), 0, 0.5, 0); scarf2.rotation.x = Math.PI / 2; n.body.add(scarf2);
    n.body.add(mesh(new THREE.BoxGeometry(0.1, 0.28, 0.04), n.soft('#f08a7a'), 0.1, 0.3, 0.24));
    for (const s of [-1, 1]) n.body.add(mesh(new THREE.BoxGeometry(0.03, 0.34, 0.015), n.soft('#ffe14d'), s * 0.15, 0.28, 0.215));
    n.head.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), n.soft('#2b2b3a'), 0, 0.22, -0.22)); // a neat bun
    const stand = new THREE.Group(); stand.position.set(0.5, 0, -0.4); n.g.add(stand);
    stand.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 10), M.woodDark, 0, 0.03, 0));
    stand.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), M.woodDark, 0, 0.68, 0));
    stand.add(mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), M.woodDark, 0, 1.3, 0));
    const shirt = new THREE.Group(); shirt.position.y = 1.05; stand.add(shirt);
    shirt.add(mesh(new THREE.BoxGeometry(0.42, 0.46, 0.06), mat('#7ab8f2')));
    for (const s of [-1, 1]) { const sl = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), mat('#7ab8f2'), s * 0.27, 0.15, 0); sl.rotation.z = s * -0.6; shirt.add(sl); }
    n.shirt = shirt; n.stand = stand; n.props = [stand];
  } },
  pet: { name: 'Pip', tag: '#7ad1a8', skin: '#ffe0c8', hair: '#f2c46a', top: '#fffaf0', bottom: '#7a8fa8', scale: 0.85, dress(n) {
    // a green apron and messy blond hair, and a puppy at their side
    n.body.add(mesh(new THREE.BoxGeometry(0.34, 0.36, 0.05), n.soft('#5fb48a'), 0, 0.12, 0.21));
    n.body.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), n.soft('#4f9f78'), 0, 0.14, 0.24));
    for (const [x, y, z] of [[0.15, 0.3, 0.12], [-0.12, 0.32, 0.1], [0.02, 0.36, 0.05]]) n.head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), n.soft('#f2c46a'), x, y, z));
    const pup = new THREE.Group(); pup.position.set(0.55, 0, 0.25); n.g.add(pup);
    const fur = mat('#d9a066'), dark = mat('#8a5a36');
    const pb = mesh(new THREE.SphereGeometry(0.16, 10, 8), fur, 0, 0.22, 0); pb.scale.set(0.8, 0.8, 1.25); pup.add(pb);
    const ph = new THREE.Group(); ph.position.set(0, 0.36, 0.18); pup.add(ph);
    ph.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), fur));
    ph.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#f5d4a8'), 0, -0.03, 0.1));
    ph.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), mat('#2b211c'), 0, -0.01, 0.15));
    for (const s of [-1, 1]) { ph.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), mat('#2b211c'), s * 0.05, 0.03, 0.1)); const ear = mesh(new THREE.SphereGeometry(0.055, 6, 4), dark, s * 0.1, 0.04, -0.01); ear.scale.set(0.5, 1.2, 0.8); ph.add(ear); }
    for (const [x, z] of [[-0.08, 0.1], [0.08, 0.1], [-0.08, -0.1], [0.08, -0.1]]) pup.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 5), fur, x, 0.07, z));
    const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.18); pup.add(tail);
    const tl = mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 5), fur, 0, 0.07, -0.02); tl.rotation.x = -0.6; tail.add(tl);
    n.pup = pup; n.pupHead = ph; n.tail = tail; n.props = [pup];
  } },
  furniture: { name: 'Oak', tag: '#e8b07a', skin: '#e8b48c', hair: '#6b4a2c', top: '#e8925a', bottom: '#6b5a4a', dress(n) {
    // a tool belt, a pencil behind the ear, a small hammer, and a wooden stool to tap on
    n.body.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 12), n.soft('#8a5a36'), 0, 0.09, 0));
    for (const [x, c] of [[0.17, '#9aa2ad'], [-0.15, '#c98c52'], [0.05, '#e05a4f']]) n.body.add(mesh(new THREE.BoxGeometry(0.07, 0.12, 0.05), mat(c), x, 0.04, 0.22));
    const pencil = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), mat('#ffd84d'), 0.33, 0.05, 0.02); pencil.rotation.set(0.3, 0, Math.PI / 2 - 0.4); n.head.add(pencil);
    const beard = mesh(new THREE.SphereGeometry(0.14, 10, 8), n.soft('#6b4a2c'), 0, -0.22, 0.18); beard.scale.set(1.3, 0.7, 0.6); n.head.add(beard); // a short beard
    const hammer = new THREE.Group(); hammer.position.set(0, -0.04, 0.04); n.handR.add(hammer);
    const hh = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), M.wood, 0, 0, 0.1); hh.rotation.x = Math.PI / 2; hammer.add(hh);
    hammer.add(mesh(new THREE.BoxGeometry(0.06, 0.07, 0.15), mat('#8f97a3'), 0, 0, 0.26));
    const stool = new THREE.Group(); stool.position.set(0.05, 0, 0.6); n.g.add(stool);
    stool.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), mat('#d0a274'), 0, 0.42, 0));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; const lg = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 5), M.woodDark, Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13); lg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); stool.add(lg); }
    n.hammer = hammer; n.stool = stool; n.props = [stool];
  } },
};
// stand beside the entrance, just past the shop's own display, on the side farther from the paths.
// Props are built with +x pointing away from the shop's middle, so they're mirrored on the other side.
const shopkeepers = SHOPS.map((s, i) => {
  const spec = SHOPKEEPERS[s.kind];
  const n = makeTownNpc(spec);
  spec.dress(n);
  n.g.scale.setScalar(spec.scale || 1);
  const shop = s.obj, side = (lx) => new THREE.Vector3(lx, 0, 1.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), shop.rotation.y).add(shop.position);
  const pathGap = (p) => Math.min(...pathSamples.map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
  const a = side(2.3), b = side(-2.3), right = pathGap(a) >= pathGap(b), at = right ? a : b;
  if (!right) for (const pr of n.props) pr.position.x = -pr.position.x;
  n.g.position.set(at.x, H(at.x, at.z) + 0.02, at.z);
  n.baseYaw = shop.rotation.y; // facing out of the shop, toward the plaza
  n.g.rotation.y = n.baseYaw;
  n.kind = s.kind; n.ph = i * 2.3;
  scene.add(n.g);
  colliders.push({ x: at.x, z: at.z, r: 0.4 });
  return n;
});
// ---------------------------------------------------------------- the bicycle stand and Rex, the bike mechanic
// A small booth beside the main path from the plaza to the pier: a striped awning, a glowing window, a bicycle picture
// sign, a rack with three parked bicycles and two little lamps. Rex stands out front; talk to him to borrow a bike.
const RENTAL = LAYOUT.rental;
// a cute low-poly bicycle; its materials are its own, so it can fade out on its own
function makeBike(color) {
  const g = new THREE.Group(), mats = [];
  const m = (c, o = {}) => { const x = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, flatShading: true, transparent: true, opacity: 1, ...o }); mats.push(x); return x; };
  const frameM = m(color), tyre = m('#2e2e33'), chrome = m('#d8dde3', { metalness: 0.4, roughness: 0.3 }), seatM = m('#6b4a34'), basketM = m('#c9a06e');
  const part = (geo, mt, x, y, z) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.castShadow = true; return o; };
  const rod = (a, b, r, mt) => { const d = b.clone().sub(a), o = part(new THREE.CylinderGeometry(r, r, d.length(), 6), mt, 0, 0, 0); o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const wheels = [];
  for (const z of [-0.55, 0.55]) { // two wheels: tyre, six spokes, a hub
    const w = new THREE.Group(); w.position.set(0, 0.36, z); g.add(w);
    const t = part(new THREE.TorusGeometry(0.31, 0.045, 6, 18), tyre, 0, 0, 0); t.rotation.y = Math.PI / 2; w.add(t);
    for (let i = 0; i < 6; i++) { const sp = part(new THREE.BoxGeometry(0.015, 0.6, 0.015), chrome, 0, 0, 0); sp.rotation.x = (i / 6) * Math.PI; w.add(sp); }
    const hub = part(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), chrome, 0, 0, 0); hub.rotation.z = Math.PI / 2; w.add(hub);
    wheels.push(w);
  }
  const rear = V(0, 0.36, -0.55), front = V(0, 0.36, 0.55), bb = V(0, 0.38, -0.05), seatTop = V(0, 0.86, -0.22), head = V(0, 0.88, 0.4);
  g.add(rod(rear, seatTop, 0.035, frameM), rod(rear, bb, 0.035, frameM), rod(bb, seatTop, 0.04, frameM), rod(bb, head, 0.045, frameM), rod(seatTop, head, 0.035, frameM), rod(head, front, 0.035, frameM));
  g.add(part(new THREE.BoxGeometry(0.2, 0.07, 0.34), seatM, 0, 0.94, -0.25)); // the saddle
  const handle = new THREE.Group(); handle.position.copy(head); g.add(handle);
  handle.add(rod(V(0, 0, 0), V(0, 0.2, -0.04), 0.03, chrome));
  handle.add(rod(V(-0.3, 0.2, -0.06), V(0.3, 0.2, -0.06), 0.025, chrome));
  for (const x of [-0.3, 0.3]) { const grip = part(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6), seatM, x, 0.2, -0.06); grip.rotation.z = Math.PI / 2; handle.add(grip); }
  const bell = part(new THREE.CylinderGeometry(0.035, 0.05, 0.05, 8), m('#f2c94c', { metalness: 0.5, roughness: 0.3 }), 0.18, 0.25, -0.04); handle.add(bell);
  const basket = part(new THREE.BoxGeometry(0.42, 0.24, 0.3), basketM, 0, 0.08, 0.24); handle.add(basket);
  const lightM = m('#fff6d0', { emissive: 0xffe08a, emissiveIntensity: 0 }), light = part(new THREE.BoxGeometry(0.1, 0.08, 0.06), lightM, 0, 0.0, 0.4); handle.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.position.set(0, 0.0, 0.5); glow.scale.set(0.9, 0.9, 1); handle.add(glow);
  const crank = new THREE.Group(); crank.position.copy(bb); g.add(crank); // pedals turn round the bottom bracket
  for (const s of [-1, 1]) { const arm = part(new THREE.BoxGeometry(0.03, 0.2, 0.03), chrome, s * 0.08, -s * 0.08, 0); crank.add(arm); crank.add(part(new THREE.BoxGeometry(0.1, 0.03, 0.06), tyre, s * 0.13, -s * 0.17, 0)); }
  return { g, wheels, crank, bell, lightM, glow, mats, handle };
}
{
  const g = new THREE.Group(), y = H(RENTAL.x, RENTAL.z);
  g.position.set(RENTAL.x, y, RENTAL.z); g.rotation.y = RENTAL.face; scene.add(g);
  g.add(mesh(new THREE.BoxGeometry(3.4, 0.16, 2.6), mat('#cbbfa9'), 0, 0.05, 0)); // a paved base
  g.add(mesh(new THREE.BoxGeometry(2.6, 2.0, 1.7), mat('#fbf0dc'), 0, 1.1, -0.35)); // the booth
  g.add(mesh(new THREE.BoxGeometry(2.9, 0.18, 2.0), mat('#5fb4e0'), 0, 2.2, -0.35));
  const aw = makeAwning(2.7, '#5fb4e0'); aw.position.set(0, 1.75, 0.55); g.add(aw);
  const win = mesh(new THREE.BoxGeometry(1.5, 0.6, 0.06), M.window, 0, 1.25, 0.52); win.castShadow = false; g.add(win);
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.35), M.wood, 0, 0.88, 0.62)); // the counter, with a toolbox on it
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.2, 0.22), mat('#e0584a'), 0.5, 1.03, 0.62));
  // the sign: a picture of a bicycle on a board above the awning
  const sc = document.createElement('canvas'); sc.width = 160; sc.height = 96;
  { const c = sc.getContext('2d'); c.fillStyle = '#fbf0dc'; c.fillRect(0, 0, 160, 96); c.strokeStyle = '#3f6fa0'; c.lineWidth = 7; c.lineCap = 'round';
    for (const cx of [42, 118]) { c.beginPath(); c.arc(cx, 60, 22, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(42, 60); c.lineTo(70, 30); c.lineTo(102, 30); c.lineTo(118, 60); c.moveTo(70, 30); c.lineTo(84, 60); c.lineTo(102, 30); c.moveTo(64, 22); c.lineTo(78, 22); c.moveTo(98, 24); c.lineTo(110, 18); c.stroke(); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 0.08), M.wood, 0, 2.75, 0.2));
  const pic = flatPic(st, 1.15, 0.68); pic.position.set(0, 2.75, 0.25); g.add(pic);
  // the rack and its three parked bicycles, beside the booth
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 2.4), M.woodDark, 1.75, 0.3, 0.1));
  ['#9be0c0', '#f6b8d0', '#8fc0f0'].forEach((c, i) => { const b = makeBike(c); b.g.position.set(1.95, 0.08, -0.85 + i * 0.85); b.g.rotation.y = Math.PI / 2; b.g.scale.setScalar(0.95); g.add(b.g); });
  // two little lamps at the front corners
  g.updateMatrixWorld(true);
  for (const lx of [-1.6, 1.4]) {
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), M.woodDark, lx, 0.8, 1.1));
    const lan = mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), M.lantern, lx, 1.7, 1.1); lan.castShadow = false; g.add(lan);
    const at = g.localToWorld(new THREE.Vector3(lx, 1.7, 1.1));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.copy(at); glow.scale.set(1.4, 1.4, 1); scene.add(glow);
    lampData.push({ pos: at.clone(), light: null, glow });
  }
  for (const [lx, lz, r] of [[0, -0.35, 1.5], [1.9, 0.1, 0.9], [-0.9, -0.35, 0.9]]) { const w = g.localToWorld(new THREE.Vector3(lx, 0, lz)); colliders.push({ x: w.x, z: w.z, r }); }
  avoid.push({ x: RENTAL.x, z: RENTAL.z, r: 4.5 });
}
// Rex: cap, blue overalls, a wrench in hand
SHOPKEEPERS.bike = { name: 'Rex', tag: '#7ab8f2', skin: '#f0c8a0', hair: '#3a2a22', top: '#f2e8d8', bottom: '#4f86b8', shoes: '#4a3426', dress(n) {
  const blue = n.soft('#4f86b8');
  n.body.add(mesh(new THREE.BoxGeometry(0.34, 0.26, 0.05), blue, 0, 0.2, 0.2)); // the overall bib
  for (const x of [-0.12, 0.12]) n.body.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), blue, x, 0.36, 0.17));
  n.head.add(mesh(new THREE.SphereGeometry(0.35, 14, 8, 0, TAU, 0, Math.PI / 2), n.soft('#e0584a'), 0, 0.06, -0.02)); // the cap
  const brim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12, 1, false, 0, Math.PI), n.soft('#e0584a'), 0, 0.08, 0.2); brim.rotation.y = -Math.PI / 2; n.head.add(brim);
  const wrench = new THREE.Group(); wrench.position.set(0, -0.04, 0.04); n.handR.add(wrench);
  const shaft = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), mat('#aab2bc'), 0, 0, 0.1); wrench.add(shaft);
  wrench.add(mesh(new THREE.TorusGeometry(0.05, 0.02, 4, 8, Math.PI * 1.5), mat('#aab2bc'), 0, 0, 0.28));
  n.props = [];
} };
{
  const spec = SHOPKEEPERS.bike, n = makeTownNpc(spec); spec.dress(n);
  const at = new THREE.Vector3(1.0, 0, 1.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), RENTAL.face).add(new THREE.Vector3(RENTAL.x, 0, RENTAL.z));
  n.g.position.set(at.x, H(at.x, at.z) + 0.02, at.z);
  n.baseYaw = RENTAL.face; n.g.rotation.y = n.baseYaw;
  n.kind = 'bike'; n.ph = 7.1;
  scene.add(n.g);
  colliders.push({ x: at.x, z: at.z, r: 0.4 });
  shopkeepers.push(n);
}
const _npcV = new THREE.Vector3();
// look around, then watch and wave at any player within 3 units; otherwise their idle task now and then
function updateShopkeepers(dt) {
  const t = nowMs() / 1000;
  const players = [...(myRoom === null ? [player] : []), ...[...remotes.values()].filter((r) => !r.room).map((r) => r.player)];
  for (const n of shopkeepers) {
    if (n.driver) continue; // the boat drivers move with their boats (updateDriver)
    const p = n.g.position;
    let near = null, nearD = 3;
    for (const c of players) { const d = Math.hypot(c.position.x - p.x, c.position.z - p.z); if (d < nearD) { nearD = d; near = c; } }
    const talking = dlg.npc === n;
    if (talking) near = player;
    const idleCycle = (t + n.ph) % 9, busy = !near && idleCycle > 6; // 3 seconds of their task every 9
    const u = busy ? (idleCycle - 6) / 3 : 0, bump = Math.sin(u * Math.PI); // eases in and out of the task
    const wantYaw = near ? Math.atan2(near.position.x - p.x, near.position.z - p.z) : n.baseYaw + Math.sin(t * 0.25 + n.ph) * 0.55;
    n.g.rotation.y = lerpAngle(n.g.rotation.y, wantYaw, Math.min(1, dt * (near ? 4 : 1.2)));
    n.head.rotation.y = near || busy ? 0 : Math.sin(t * 0.7 + n.ph) * 0.3;
    n.head.rotation.x = busy ? 0.35 * bump : 0;
    // right arm waves when someone is close (unless the hammer is mid-swing, which also stops for visitors)
    const k = Math.min(1, dt * 8);
    n.armR.rotation.z = lerp(n.armR.rotation.z, near && !talking ? 2.6 + Math.sin(t * 9) * 0.35 : 0.12, k);
    n.armR.rotation.x = lerp(n.armR.rotation.x, 0, k);
    n.armL.rotation.z = lerp(n.armL.rotation.z, -0.12, k);
    n.armL.rotation.x = lerp(n.armL.rotation.x, 0, k);
    n.body.rotation.x = 0; n.body.position.y = 0.55 + Math.sin(t * 2 + n.ph) * 0.008;
    if (n.kind === 'seed') { // tips the watering can over the little pot
      n.armL.rotation.x = -1.1 * bump; n.can.rotation.x = 0.9 * bump;
      n.drops.forEach((d, i) => { d.visible = bump > 0.6; const f = (t * 2.2 + i / 4) % 1; d.position.set(0.18 - f * 0.05, 0.75 - f * 0.45, -0.25 + f * 0.2); });
    } else if (n.kind === 'clothes') { // smooths the shirt on the stand
      n.armL.rotation.x = -1.2 * bump; n.armL.rotation.z = -0.12 - 0.5 * bump + Math.sin(t * 5) * 0.12 * bump;
      n.shirt.rotation.z = Math.sin(t * 5) * 0.04 * bump;
    } else if (n.kind === 'pet') { // crouches to pet the puppy; the puppy wags (harder while petted)
      n.body.rotation.x = 0.35 * bump; n.body.position.y -= 0.08 * bump;
      n.armR.rotation.z = near ? n.armR.rotation.z : -0.2 * bump + 0.12; n.armR.rotation.x = near ? 0 : -1.0 * bump + Math.sin(t * 6) * 0.15 * bump;
      n.tail.rotation.z = Math.sin(t * (busy ? 18 : 9)) * (busy ? 0.7 : 0.4);
      n.pup.position.y = Math.abs(Math.sin(t * 3)) * 0.01;
      n.pupHead.rotation.y = near ? Math.atan2(near.position.x - p.x, near.position.z - p.z) - n.g.rotation.y : Math.sin(t * 0.9) * 0.4;
      n.pupHead.rotation.x = busy ? 0.25 : 0;
    } else if (n.kind === 'bike') { // gives the wrench a few turns
      if (!near) { n.armR.rotation.z = 0.12; n.armR.rotation.x = busy ? -0.9 - Math.sin(t * 6) * 0.35 * bump : 0; }
      n.head.rotation.x = busy ? 0.3 * bump : 0;
    } else if (n.kind === 'furniture') { // taps the hammer on the stool
      if (!near) { n.armR.rotation.z = 0.12; n.armR.rotation.x = busy ? -0.9 - Math.abs(Math.sin(t * 7)) * 0.6 * bump : 0; }
      n.head.rotation.x = busy ? 0.45 * bump : 0;
    }
  }
}

// ---------------------------------------------------------------- home gardens: a fenced vegetable area in every yard
// Plot coordinates: local +z faces the gate (and the plaza), so "left of the house as seen from the gate" is -x.
// The fenced area beside the house holds three beds in a column: the front one (nearest the gate) is the active
// patch of 6 soil squares, 2 rows of 3; the two behind it are bare marked beds for later.
// Each square is 0 empty soil, 1 sprout, 2 grown crop.
const GARDEN_CELLS = 6, CELL = 0.38, CELL_GAP = 0.08;
// growth and drying times come from the server (GARDEN_GROW_MS in server.js); these match it until it says
const GARDEN = { growMs: 3 * 60 * 1000, wetMs: 24 * 60 * 60 * 1000 };
const soilMat = mat('#7a553e');
const wetSoilMat = new THREE.MeshStandardMaterial({ color: 0x3f2a1f, roughness: 0.32, metalness: 0.05, flatShading: true }); // dark and a little shiny
const HOUSE_AT = { x: 0.35, z: -1.4 }; // the house: back-centre of the yard (nudged right to leave the garden room)
const GARDEN_AT = { x: -2.05, z: 0.1 }; // active patch centre, left of the house
const GARDEN_CROPS = ['carrot', 'tomato', 'cabbage']; // one per column
const gardenCellPos = (i) => ({ x: GARDEN_AT.x + ((i % 3) - 1) * (CELL + CELL_GAP), z: GARDEN_AT.z + (Math.floor(i / 3) - 0.5) * (CELL + CELL_GAP) });
const PATCH_W = 3 * CELL + 2 * CELL_GAP + 0.16, PATCH_D = 2 * CELL + CELL_GAP + 0.16;
const BED_STEP = PATCH_D + 0.22; // the empty beds sit one and two steps behind the active patch
const GFENCE = { x: PATCH_W / 2 + 0.12, front: PATCH_D / 2 + 0.12, back: -(2 * BED_STEP + PATCH_D / 2 + 0.12) }; // fence, patch-relative
// where you stand to tend a square: just outside the garden fence, in front of its column (plot coordinates)
const gardenStand = (i) => ({ x: gardenCellPos(i).x, z: GARDEN_AT.z + GFENCE.front + 0.5 });
function makePlotGarden(slot) {
  const g = new THREE.Group(); g.position.set(GARDEN_AT.x, 0.17, GARDEN_AT.z); slot.group.add(g); // on top of the plot's pad
  // low wooden border
  for (const [w, d, x, z] of [[PATCH_W, 0.08, 0, -PATCH_D / 2], [PATCH_W, 0.08, 0, PATCH_D / 2], [0.08, PATCH_D, -PATCH_W / 2, 0], [0.08, PATCH_D, PATCH_W / 2, 0]]) g.add(mesh(new THREE.BoxGeometry(w, 0.14, d), M.wood, x, 0.07, z));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.24, 0.1), M.woodDark, x * PATCH_W / 2, 0.12, z * PATCH_D / 2));
  const cells = [];
  for (let i = 0; i < GARDEN_CELLS; i++) {
    const p = gardenCellPos(i);
    const soil = mesh(new THREE.BoxGeometry(CELL, 0.09, CELL), soilMat, p.x - GARDEN_AT.x, 0.045, p.z - GARDEN_AT.z);
    soil.add(mesh(new THREE.BoxGeometry(CELL * 0.8, 0.02, 0.04), mat('#6a4733'), 0, 0.05, -0.08));
    soil.add(mesh(new THREE.BoxGeometry(CELL * 0.8, 0.02, 0.04), mat('#6a4733'), 0, 0.05, 0.08));
    soil.userData.gardenCell = { slot, i };
    soil.traverse((m) => { m.userData.gardenCell = soil.userData.gardenCell; });
    g.add(soil);
    const plant = new THREE.Group(); plant.position.set(p.x - GARDEN_AT.x, 0.09, p.z - GARDEN_AT.z); g.add(plant);
    cells.push({ soil, plant, state: 0, s: 0, p: 0, w: 0, wet: false, pop: 1 });
  }
  // two bare beds behind it for later: tilled soil in a wooden frame, with little corner pegs marking them out
  const bareMat = mat('#8f6a50');
  for (let b = 1; b <= 2; b++) {
    const bz = -b * BED_STEP;
    g.add(mesh(new THREE.BoxGeometry(PATCH_W - 0.12, 0.07, PATCH_D - 0.12), bareMat, 0, 0.035, bz));
    for (const [w, d, x, z] of [[PATCH_W, 0.06, 0, -PATCH_D / 2], [PATCH_W, 0.06, 0, PATCH_D / 2], [0.06, PATCH_D, -PATCH_W / 2, 0], [0.06, PATCH_D, PATCH_W / 2, 0]]) g.add(mesh(new THREE.BoxGeometry(w, 0.1, d), M.wood, x, 0.05, bz + z));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), M.woodDark, x * PATCH_W / 2, 0.1, bz + z * PATCH_D / 2));
    for (const dz of [-0.2, 0.2]) g.add(mesh(new THREE.BoxGeometry(PATCH_W * 0.7, 0.02, 0.05), mat('#7d5a42'), 0, 0.075, bz + dz));
  }
  // a low picket fence around all three beds, open at the front-right corner like a little garden gate
  const { x: fx, front: ff, back: fb } = GFENCE, picketGeo = new THREE.BoxGeometry(0.06, 0.34, 0.04), sideGeo = new THREE.BoxGeometry(0.04, 0.34, 0.06);
  const rail = (x1, z1, x2, z2) => { const len = Math.hypot(x2 - x1, z2 - z1), r = mesh(new THREE.BoxGeometry(Math.abs(x2 - x1) + 0.03, 0.04, Math.abs(z2 - z1) + 0.03), M.wood, (x1 + x2) / 2, 0.22, (z1 + z2) / 2); g.add(r); return len; };
  for (const [x1, z1, x2, z2] of [[-fx, ff, fx - 0.42, ff], [-fx, fb, fx, fb], [-fx, fb, -fx, ff], [fx, fb, fx, ff - 0.42]]) {
    const len = rail(x1, z1, x2, z2), n = Math.max(1, Math.round(len / 0.2));
    for (let k = 0; k <= n; k++) g.add(mesh(x1 === x2 ? sideGeo : picketGeo, M.cream, lerp(x1, x2, k / n), 0.17, lerp(z1, z2, k / n)));
  }
  // the owner's things: a tiny picture sign and a small watering can (shown once someone lives here)
  const extras = new THREE.Group(); extras.visible = false; g.add(extras);
  extras.add(mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), M.woodDark, -PATCH_W / 2 + 0.2, 0.25, ff + 0.08));
  const board = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.04), M.wood, -PATCH_W / 2 + 0.2, 0.5, ff + 0.08); extras.add(board);
  const sprout = flatPic(signPicture('seed'), 0.17, 0.17); sprout.position.set(-PATCH_W / 2 + 0.2, 0.5, ff + 0.11); extras.add(sprout);
  const can = new THREE.Group(); can.position.set(fx + 0.15, 0, ff + 0.3); can.rotation.y = 0.7; can.scale.setScalar(0.7); extras.add(can);
  can.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 10), mat('#6fb8a8'), 0, 0.12, 0));
  const spout = mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.3, 6), mat('#6fb8a8'), 0, 0.18, 0.2); spout.rotation.x = 0.9; can.add(spout);
  const grip = mesh(new THREE.TorusGeometry(0.08, 0.017, 5, 10, Math.PI), mat('#5a9f90'), 0, 0.25, -0.04); grip.rotation.y = Math.PI / 2; can.add(grip);
  // nobody walks through the fence: its front and house-side edges block (the hedge covers the other two)
  slot.group.updateMatrixWorld(true);
  const block = (lx, lz) => { const w = g.localToWorld(new THREE.Vector3(lx, 0, lz)); colliders.push({ x: w.x, z: w.z, r: 0.2 }); };
  for (let x = -fx; x <= fx + 0.01; x += 0.34) block(x, ff);
  for (let z = fb; z <= ff + 0.01; z += 0.34) block(fx, z);
  return { group: g, cells, extras };
}
// what grows in a square: nothing, a two-leaf sprout, or the grown crop of its column
function setGardenCell(slot, i, state, popIn = false) {
  const c = slot.garden.cells[i];
  if (!c || c.state === state) return;
  c.state = state;
  c.plant.clear();
  c.pop = popIn ? 0 : 1; // a crop that grows while you watch pops in
  if (state === 1) {
    c.plant.add(mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.1, 4), M.leafDark, 0, 0.05, 0));
    for (const sx of [-1, 1]) { const l = mesh(new THREE.SphereGeometry(0.05, 6, 4), M.leafLight, sx * 0.04, 0.11, 0); l.scale.set(1, 0.35, 0.6); l.rotation.z = sx * 0.4; c.plant.add(l); }
  } else if (state === 2) {
    const crop = makeCrop(GARDEN_CROPS[i % 3], mulberry32(slot.n * 31 + i)); // the same little look on every screen
    crop.scale.setScalar(0.68); crop.rotation.y = (slot.n + i) * 0.9;
    c.plant.add(crop);
  }
}
// the server's squares: { s, p, w } (older servers sent plain 0/1/2)
function setGarden(slot, cellsArr) {
  for (let i = 0; i < GARDEN_CELLS; i++) {
    const raw = Array.isArray(cellsArr) ? cellsArr[i] : 0, c = slot.garden.cells[i];
    if (typeof raw === 'number') { c.s = raw | 0; c.p = 0; c.w = 0; } else if (raw) { c.s = raw.s | 0; c.p = +raw.p || 0; c.w = +raw.w || 0; }
    else { c.s = 0; c.p = 0; c.w = 0; }
    refreshGardenCell(slot, i, false);
  }
}
// a watered sprout becomes a crop growMs after it was watered; wet soil dries after wetMs
const gardenState = (c, now) => (c.s === 1 && c.w && now - c.w >= GARDEN.growMs ? 2 : c.s);
const gardenWet = (c, now) => !!c.w && now - c.w < GARDEN.wetMs;
function refreshGardenCell(slot, i, popIn) {
  const c = slot.garden.cells[i], now = nowMs();
  setGardenCell(slot, i, gardenState(c, now), popIn);
  const wet = gardenWet(c, now);
  if (wet !== c.wet) { c.wet = wet; c.soil.material = wet ? wetSoilMat : soilMat; }
}
// every frame: crops that finish growing pop in, soil that dries goes light again, pops finish their bounce
let gardenTick = 0;
function updateGardens(dt) {
  gardenTick -= dt;
  if (gardenTick <= 0) {
    gardenTick = 0.5;
    for (const sl of plotSlots) for (let i = 0; i < GARDEN_CELLS; i++) refreshGardenCell(sl, i, true);
    const now = nowMs();
    for (const sp of islandSpots) { sp.wet.visible = now - (islandWatered[sp.idx] || 0) < GARDEN.wetMs; sp.crop.visible = islandGrown(sp); }
  }
  for (const sl of plotSlots) for (const c of sl.garden.cells) if (c.pop < 1) {
    c.pop = Math.min(1, c.pop + dt / 0.5);
    const u = c.pop, back = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2); // ease out with a little overshoot
    c.plant.scale.setScalar(Math.max(0.001, back));
  }
}
let islandWatered = [], islandHarvested = [];

// eight numbered home plots on the outer ring, each a private square yard: a lawn inside a low rounded hedge with a
// wide gate facing the path to the plaza, the numbered sign and the mailbox beside the gate, two gate lanterns,
// a stepping-stone walk to the door and the fenced garden on the left. The hedge blocks walking; the gate is open.
const HEDGE = PLOT_HALF - 0.25, GATE_HALF = 1.25; // the hedge's centre line; half the gate's width
const lawnMat = mat('#9bd36c'), stepMat = mat('#e3dacb');
const hedgeBushes = [], hedgeFlowers = []; // { pos, s, rot, col } in world space, built into instanced meshes below
const plotSlots = PLOTS.map((p) => {
  const y = FLATS.find((f) => f.x === p.x && f.z === p.z).h;
  const g = new THREE.Group();
  g.position.set(p.x, y, p.z);
  g.rotation.y = p.face; // local +z: the gate side, toward its road (from the trace)
  scene.add(g);
  g.updateMatrixWorld(true);
  const toWorld = (lx, lz) => g.localToWorld(new THREE.Vector3(lx, 0, lz));
  const pr = mulberry32(p.n * 977 + 5); // the same hedge on every screen
  const pRange = (a, b) => a + (b - a) * pr();
  // the lawn, and stepping stones from the gate to the door
  g.add(mesh(new THREE.BoxGeometry(HEDGE * 2, 0.3, HEDGE * 2), lawnMat, 0, 0.02, 0));
  const door = { x: HOUSE_AT.x - 0.45, z: HOUSE_AT.z + 1.45 };
  for (let k = 0; k < 6; k++) {
    const u = k / 5, st = mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.05, 7), stepMat, lerp(0, door.x, u) + pRange(-0.06, 0.06), 0.18, lerp(HEDGE + 0.1, door.z, u));
    st.rotation.y = pRange(0, TAU); st.castShadow = false; g.add(st);
  }
  // the hedge: soft overlapping bushes along the square, open at the gate
  const bushAt = (lx, lz) => {
    const w = toWorld(lx, lz);
    colliders.push({ x: w.x, z: w.z, r: 0.3 });
    const s = pRange(0.3, 0.38), col = new THREE.Color('#6cc24a').offsetHSL(pRange(-0.02, 0.02), pRange(-0.05, 0.05), pRange(-0.05, 0.04));
    hedgeBushes.push({ pos: w.clone().setY(y + 0.24), s: new THREE.Vector3(s, s * 0.85, s), rot: pRange(0, TAU), col });
    const off = pRange(-0.12, 0.12), w2 = toWorld(lx + (lz === HEDGE || lz === -HEDGE ? 0 : off), lz + (lz === HEDGE || lz === -HEDGE ? off : 0));
    hedgeBushes.push({ pos: w2.setY(y + 0.42), s: new THREE.Vector3(s * 0.75, s * 0.65, s * 0.75), rot: pRange(0, TAU), col: col.clone().offsetHSL(0, 0, 0.05) });
    if (pr() < 0.22) {
      const fw = toWorld(lx + pRange(-0.12, 0.12), lz + pRange(-0.12, 0.12));
      hedgeFlowers.push({ pos: fw.setY(y + 0.6), s: new THREE.Vector3(1, 1, 1).multiplyScalar(pRange(0.8, 1.2)), rot: 0, col: new THREE.Color(['#ff9ec4', '#fff27a', '#ffffff', '#c9a6ff'][Math.floor(pr() * 4)]) });
    }
  };
  const n = Math.round((HEDGE * 2) / 0.42);
  for (let k = 0; k <= n; k++) {
    const t = -HEDGE + (k / n) * HEDGE * 2;
    bushAt(t, -HEDGE); // back
    if (k > 0 && k < n) { bushAt(-HEDGE, t); bushAt(HEDGE, t); } // sides (corners come with the back and front)
    if (Math.abs(t) >= GATE_HALF) bushAt(t, HEDGE); // front, with the gate gap
  }
  // gate lanterns on short posts at the ends of the hedge: they glow at dusk and night like the path lamps
  for (const sx of [-1, 1]) {
    const lx = sx * (GATE_HALF - 0.12), lz = HEDGE + 0.12;
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.05, 6), M.woodDark, lx, 0.52, lz));
    const lan = mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), M.lantern, lx, 1.16, lz); lan.castShadow = false; g.add(lan);
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.12, 4), M.woodDark, lx, 1.34, lz));
    const lw = toWorld(lx, lz); colliders.push({ x: lw.x, z: lw.z, r: 0.12 });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.copy(lw).setY(y + 1.16); glow.scale.set(1.3, 1.3, 1); scene.add(glow);
    lampData.push({ pos: glow.position.clone(), light: null, glow });
  }
  // the numbered sign on the left of the gate, the mailbox on the right (both just outside the hedge)
  const sign = new THREE.Group(); sign.position.set(-(GATE_HALF + 0.8), 0, HEDGE + 0.55); g.add(sign);
  sign.add(mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), M.woodDark, 0, 0.5, 0));
  sign.add(mesh(new THREE.BoxGeometry(0.62, 0.36, 0.06), M.wood, 0, 0.92, 0));
  for (const ry of [0, Math.PI]) { const num = flatPic(plateTexture(String(p.n), true), 0.5, 0.2); num.position.set(0, 0.92, ry ? -0.035 : 0.035); num.rotation.y = ry; sign.add(num); }
  const sw = toWorld(sign.position.x, sign.position.z); colliders.push({ x: sw.x, z: sw.z, r: 0.15 });
  const mailbox = makeMailbox(p.n);
  mailbox.position.set(GATE_HALF + 0.8, 0, HEDGE + 0.55);
  g.add(mailbox);
  const mw = toWorld(mailbox.position.x, mailbox.position.z); colliders.push({ x: mw.x, z: mw.z, r: 0.2 });
  avoid.push({ x: p.x, z: p.z, r: PLOT_HALF * 1.42 + 0.4 });
  const slot = { ...p, y, group: g, mailbox, house: null, owner: null, toWorld };
  slot.garden = makePlotGarden(slot);
  return slot;
});
{
  const build = (list, geo, matl) => {
    const inst = new THREE.InstancedMesh(geo, matl, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((b, i) => { m4.compose(b.pos, q.setFromAxisAngle(up, b.rot), b.s); inst.setMatrixAt(i, m4); inst.setColorAt(i, b.col); });
    inst.castShadow = true; inst.receiveShadow = true;
    scene.add(inst);
    return inst;
  };
  build(hedgeBushes, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }));
  build(hedgeFlowers, new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true, emissive: 0x332a22, emissiveIntensity: 0.3 }));
}
// a point in a yard's own frame (local +z = the gate side)
const _yardL = new THREE.Vector3();
function yardLocal(sl, x, z) { return sl.group.worldToLocal(_yardL.set(x, sl.y, z)); }

// ---------------------------------------------------------------- walking: a grid path finder for the island
// The island is a 0.5-unit grid; a cell is blocked when it's water or near anything solid (hedges, buildings, trees,
// rocks, lamps...). A walk plans a path once (and again if the goal moves), smooths it to straight runs, and the
// character steers along it, so taps anywhere go round yards (in through their gates), shops and trees.
const NAV = { x0: -100, z0: -72, cell: 0.5, w: 400, h: 268, grid: null, built: -1 }; // the whole island, beach and desert too
function navBuild() {
  const { w, h, cell } = NAV, grid = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = NAV.x0 + (i + 0.5) * cell, z = NAV.z0 + (j + 0.5) * cell;
    const e = cell * 0.45; // the whole cell must be walkable, not just its middle (no clipping the water at a bank)
    // planned paths keep a little margin from the water (a waterline is walkable, but a path along it is fragile)
    const firm = (px, pz) => onDock(px, pz) || onBridge(px, pz, 0.35) !== null || H(px, pz) > 0.15;
    if (!firm(x, z) || !firm(x - e, z - e) || !firm(x + e, z - e) || !firm(x - e, z + e) || !firm(x + e, z + e)) grid[j * w + i] = 1;
  }
  for (const c of colliders) { // anything solid, with a little room for the character
    if (c.lvl === 'd' || c.lvl === 'w' || c.nonav) continue; // up on a balcony, out in the water, or the volleyball net (solid, but left out of planned paths so they stay as they were)
    const r = c.r + 0.28, i0 = Math.floor((c.x - r - NAV.x0) / cell), i1 = Math.floor((c.x + r - NAV.x0) / cell);
    const j0 = Math.floor((c.z - r - NAV.z0) / cell), j1 = Math.floor((c.z + r - NAV.z0) / cell);
    for (let j = Math.max(0, j0); j <= Math.min(h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(w - 1, i1); i++) {
      const x = NAV.x0 + (i + 0.5) * cell, z = NAV.z0 + (j + 0.5) * cell;
      if (Math.hypot(x - c.x, z - c.z) < r) grid[j * w + i] = 1;
    }
  }
  NAV.grid = grid; NAV.built = colliders.length;
}
const navCell = (x, z) => [Math.floor((x - NAV.x0) / NAV.cell), Math.floor((z - NAV.z0) / NAV.cell)];
const navFree = (i, j) => i >= 0 && j >= 0 && i < NAV.w && j < NAV.h && !NAV.grid[j * NAV.w + i];
const navPos = (i, j) => ({ x: NAV.x0 + (i + 0.5) * NAV.cell, z: NAV.z0 + (j + 0.5) * NAV.cell });
function navNearestFree(i, j, R = 8) {
  if (navFree(i, j)) return [i, j];
  for (let r = 1; r <= R; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) === r && navFree(i + di, j + dj)) return [i + di, j + dj];
  }
  return null;
}
function navSight(i0, j0, i1, j1) { // every cell along the line is free
  const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)) * 2;
  for (let k = 0; k <= n; k++) { const u = n ? k / n : 0; if (!navFree(Math.round(i0 + (i1 - i0) * u), Math.round(j0 + (j1 - j0) * u))) return false; }
  return true;
}
// waypoints from (sx, sz) toward (tx, tz), not including the goal itself; [] when the way is clear; null if no way
function navPath(sx, sz, tx, tz) {
  if (!NAV.grid || NAV.built !== colliders.length) navBuild();
  const s = navNearestFree(...navCell(sx, sz)), g = navNearestFree(...navCell(tx, tz));
  if (!s || !g) return null;
  if (navSight(s[0], s[1], g[0], g[1])) return [];
  const { w } = NAV, N = w * NAV.h, cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = []; // [f, idx]
  const push = (f, idx) => { heap.push([f, idx]); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= heap[k][0]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const hEst = (i, j) => { const dx = Math.abs(i - g[0]), dz = Math.abs(j - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const si = s[1] * w + s[0], gi = g[1] * w + g[0];
  cost[si] = 0; push(hEst(s[0], s[1]), si);
  let found = false, expanded = 0;
  while (heap.length && expanded < 300000) {
    const [, idx] = pop();
    if (closed[idx]) continue;
    closed[idx] = 1; expanded++;
    if (idx === gi) { found = true; break; }
    const i = idx % w, j = (idx / w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (!navFree(ni, nj) || (di && dj && (!navFree(i + di, j) || !navFree(i, j + dj)))) continue; // no corner cutting
      const n = nj * w + ni, c = cost[idx] + (di && dj ? 1.414 : 1);
      if (c < cost[n]) { cost[n] = c; from[n] = idx; push(c + hEst(ni, nj), n); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = gi; k !== -1; k = from[k]) cells.push([k % w, (k / w) | 0]);
  cells.reverse();
  // keep only the turns: from each kept cell, jump to the farthest one in plain sight
  const out = [];
  let cur = 0;
  while (cur < cells.length - 1) {
    let next = cells.length - 1;
    while (next > cur + 1 && !navSight(cells[cur][0], cells[cur][1], cells[next][0], cells[next][1])) next--;
    if (next < cells.length - 1) out.push(navPos(cells[next][0], cells[next][1]));
    cur = next;
  }
  return out;
}
// the point to head for right now on the way to walk.target (null: straight at it)
function navWaypoint() {
  const t = walk.target;
  if (!walk.nav || Math.hypot(walk.nav.tx - t.x, walk.nav.tz - t.z) > 0.75) walk.nav = { tx: t.x, tz: t.z, pts: navPath(player.position.x, player.position.z, t.x, t.z) || [] };
  const pts = walk.nav.pts;
  while (pts.length && Math.hypot(pts[0].x - player.position.x, pts[0].z - player.position.z) < 0.45) pts.shift();
  return pts.length ? pts[0] : null;
}
// a player's house on their plot (from the server); the name goes on the mailbox plate
function setPlotOwner(n, name, roof) {
  const slot = plotSlots[n - 1];
  if (!slot || typeof name !== 'string') return;
  if (slot.house) slot.group.remove(slot.house);
  const ROOF_PASTELS = ['#f4a6a6', '#a6c8f4', '#b8e2a8', '#f7d38a', '#d4b4f0', '#a8e0d8', '#f6b8d6', '#f5c49c']; // server.js ROOF_COLORS
  const pi = ROOF_PASTELS.indexOf(String(roof).toLowerCase());
  slot.house = makeHome(pi >= 0 ? [PALETTE.roofs[2], PALETTE.roofs[0], PALETTE.roofs[1], PALETTE.roofs[6], PALETTE.roofs[4], PALETTE.roofs[5], PALETTE.roofs[7], PALETTE.roofs[3]][pi]
    : /^#[0-9a-f]{6}$/i.test(roof || '') ? roof : PALETTE.roofs[2]);
  slot.house.position.set(HOUSE_AT.x, 0.17, HOUSE_AT.z);
  slot.group.add(slot.house);
  if (!slot.owner) { const hw = slot.toWorld(HOUSE_AT.x, HOUSE_AT.z); colliders.push({ x: hw.x, z: hw.z, r: 1.75 }); } // one per plot, kept if the house is rebuilt
  slot.owner = name;
  const plate = slot.mailbox.userData.plate;
  if (plate.material.map) plate.material.map.dispose();
  plate.material.map = plateTexture(name.slice(0, 16), false);
  plate.material.needsUpdate = true;
  plate.visible = true;
  slot.garden.extras.visible = true; // the patch is now someone's garden: sign and watering can appear
}

// ---------------------------------------------------------------- house rooms (inside a player's house)
// Every house has one small room. It lives in its own scene, centred on the origin; a player who goes in is moved
// into that scene, and the game renders it instead of the island. Players see only others in the same space.
const ROOM_HALF = 3, ROOM_WALL_H = 2.8, ROOM_DOOR_W = 1.2, ROOM_DOOR_H = 2.1;
const roomScene = new THREE.Scene();
roomScene.background = new THREE.Color(0x2b2f3a);
const roomHemi = new THREE.HemisphereLight(0xfff1dc, 0x8a6a4a, 0.9);
const roomLamp = new THREE.PointLight(0xffc98a, 6, 12, 2); roomLamp.position.set(0, 2.5, 0);
const roomSun = new THREE.DirectionalLight(0xfff1d8, 0.6); roomSun.position.set(-6, 5, 1); // daylight through the window
roomScene.add(roomHemi, roomLamp, roomSun);
const roomWalls = []; // { group, normal (outward), c (centre) } — a wall hides while the camera is outside it
{
  const plank = (i) => mat(i % 2 ? '#c99a68' : '#bf8f5e');
  for (let i = 0; i < 12; i++) roomScene.add(mesh(new THREE.BoxGeometry(0.5, 0.1, ROOM_HALF * 2), plank(i), -ROOM_HALF + 0.25 + i * 0.5, -0.05, 0));
  const wallMat = mat('#f4e7d0'), trim = mat('#a8744a');
  const T = 0.15, W = ROOM_HALF * 2 + T;
  const wall = (normal, pieces) => {
    const g = new THREE.Group();
    for (const [w, h, x, y] of pieces) {
      const m = mesh(new THREE.BoxGeometry(w, h, T), wallMat, x, y, 0); g.add(m);
    }
    g.add(mesh(new THREE.BoxGeometry(W, 0.14, T + 0.04), trim, 0, 0.07, 0)); // skirting board
    g.rotation.y = Math.atan2(normal.x, normal.z);
    g.position.copy(normal).multiplyScalar(ROOM_HALF + T / 2);
    roomScene.add(g);
    roomWalls.push({ group: g, normal, c: g.position.clone() });
    return g;
  };
  const side = (W - ROOM_DOOR_W) / 2;
  // front wall (+z) with the door gap in the middle
  wall(new THREE.Vector3(0, 0, 1), [
    [side, ROOM_WALL_H, -(ROOM_DOOR_W + side) / 2, ROOM_WALL_H / 2], [side, ROOM_WALL_H, (ROOM_DOOR_W + side) / 2, ROOM_WALL_H / 2],
    [ROOM_DOOR_W, ROOM_WALL_H - ROOM_DOOR_H, 0, (ROOM_WALL_H + ROOM_DOOR_H) / 2],
  ]);
  wall(new THREE.Vector3(0, 0, -1), [[W, ROOM_WALL_H, 0, ROOM_WALL_H / 2]]);
  wall(new THREE.Vector3(1, 0, 0), [[W, ROOM_WALL_H, 0, ROOM_WALL_H / 2]]);
  // left wall (-x) with a window opening (1.4 wide, from 1.0 to 2.1 high)
  const ww = 1.4, wb = 1.0, wt = 2.1, ws = (W - ww) / 2;
  const leftWall = wall(new THREE.Vector3(-1, 0, 0), [
    [ws, ROOM_WALL_H, -(ww + ws) / 2, ROOM_WALL_H / 2], [ws, ROOM_WALL_H, (ww + ws) / 2, ROOM_WALL_H / 2],
    [ww, wb, 0, wb / 2], [ww, ROOM_WALL_H - wt, 0, (ROOM_WALL_H + wt) / 2],
  ]);
  leftWall.add(mesh(new THREE.BoxGeometry(ww + 0.2, 0.08, T + 0.18), trim, 0, wb, 0)); // window sill
  // the door frame and a warm wall lamp: cozy but empty
  const front = roomWalls[0].group;
  for (const x of [-ROOM_DOOR_W / 2 - 0.05, ROOM_DOOR_W / 2 + 0.05]) front.add(mesh(new THREE.BoxGeometry(0.1, ROOM_DOOR_H, T + 0.06), trim, x, ROOM_DOOR_H / 2, 0));
  front.add(mesh(new THREE.BoxGeometry(ROOM_DOOR_W + 0.2, 0.1, T + 0.06), trim, 0, ROOM_DOOR_H, 0));
  const sconce = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), M.lantern, 0, 2.0, -ROOM_HALF + 0.08); sconce.castShadow = false; roomScene.add(sconce);
}
const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2), new THREE.MeshBasicMaterial({ visible: false }));
roomFloor.rotation.x = -Math.PI / 2; roomScene.add(roomFloor); // what floor taps hit
const ROOM_SPAWN = new THREE.Vector3(0, 0, ROOM_HALF - 0.9); // just inside the door
const ROOM_DOOR = new THREE.Vector3(0, 0, ROOM_HALF);
// the house door on a plot, in island coordinates: where it is, and where you stand in front of it
function plotDoor(slot, out, ahead = 0) {
  slot.group.updateMatrixWorld(true);
  return slot.group.localToWorld(out.set(HOUSE_AT.x - 0.45, 0, HOUSE_AT.z + 1.21 + ahead));
}

// lamps: two at the plaza's pier entrance, two along every plot path (alternating sides), two along the pier walk.
// Only some carry a real light (few point lights keep it fast); all glow at dusk and night.
const lampSpots = [polar(60, PLAZA_R + 0.8), polar(120, PLAZA_R + 0.8)];
{
  // along the loop road about every 7 units, just outside it; two on the lighthouse road; two on the pier walk
  const cx = LOOP.reduce((t, q) => t + q.x, 0) / LOOP.length, cz = LOOP.reduce((t, q) => t + q.z, 0) / LOOP.length;
  let run = 3;
  LOOP.forEach((a, i) => {
    const b = LOOP[(i + 1) % LOOP.length];
    run += Math.hypot(b.x - a.x, b.z - a.z);
    if (run < 8 || inPlaza(a) || Math.hypot(a.x - TOWN.x, a.z - TOWN.z) < PLAZA_R + 2) return;
    run = 0;
    const out = Math.hypot(a.x - cx, (a.z - cz) * 0.8) || 1;
    lampSpots.push({ x: a.x + ((a.x - cx) / out) * 1.9, z: a.z + ((a.z - cz) * 0.8 / out) * 1.9 });
  });
  for (const k of [1, 3]) { const [x, z] = LAYOUT.lighthouseRoad[k]; lampSpots.push({ x: x + 1.3, z }); }
  for (const u of [0.3, 0.75]) lampSpots.push({ x: lerp(pierJoin.x, dockStart.x, u) + (u > 0.5 ? 1.3 : -1.3), z: lerp(pierJoin.z, dockStart.y, u) });
  for (const spoke of LAYOUT.townSpokes) { const [x, z] = spoke[1]; lampSpots.push({ x: x + 1.2, z: z + 1.0 }); }
  // every ~9 units along the desert and beach roads and the boardwalk, alternating sides
  for (const line of [...Object.values(LAYOUT.roads), LAYOUT.desert.hutPath, LAYOUT.beach.boardwalk]) {
    let run = 4, side = 1;
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1], l = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < l; t += 1) {
        run += 1; if (run < 9) continue; run = 0; side = -side;
        const x = ax + ((bx - ax) * t) / l, z = az + ((bz - az) * t) / l;
        lampSpots.push({ x: x - ((bz - az) / l) * 2.1 * side, z: z + ((bx - ax) / l) * 2.1 * side });
      }
    }
  }
}
lampSpots.forEach((sp, i) => {
  if (H(sp.x, sp.z) < 0.05) return;
  if (SHOPS.some((sh) => Math.hypot(sh.x - sp.x, sh.z - sp.z) < 3.2) || LAYOUT.decor.some((d) => Math.hypot(d.x - sp.x, d.z - sp.z) < 3.2)) return; // never inside a building
  const lamp = makeLamp();
  lamp.rotation.y = rr(0, TAU);
  place(lamp, sp.x, sp.z, 0.25, 0.8);
  lamp.updateMatrixWorld(true);
  const lpos = new THREE.Vector3(0.42, 1.92, 0).applyMatrix4(lamp.matrixWorld);
  let light = null;
  if (i % 3 === 0) { light = new THREE.PointLight(0xffc56a, 0, 9, 2); light.position.copy(lpos); scene.add(light); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.position.copy(lpos); glow.scale.set(1.8, 1.8, 1);
  scene.add(glow);
  lampData.push({ pos: lpos, light, glow });
});

// dock
const dock = new THREE.Group();
{
  const len = dockStart.distanceTo(dockEnd);
  const deck = new THREE.Group();
  for (let i = 0; i < Math.floor(len / 0.42); i++) {
    deck.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.38), i % 3 ? M.wood : mat('#a9774f'), 0, 0, i * 0.42 + 0.2));
  }
  dock.add(deck);
  for (let i = 0; i <= 4; i++) for (const x of [-0.95, 0.95]) {
    dock.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), M.woodDark, x, -0.9, (i / 4) * (len - 0.3) + 0.15));
  }
  dock.position.set(dockStart.x, DOCK_Y, dockStart.y);
  dock.rotation.y = Math.atan2(dockDir.x, dockDir.y);
  scene.add(dock);
  dock.userData.len = len;
}
const dockClick = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, dock.userData.len), new THREE.MeshBasicMaterial({ visible: false }));
dockClick.position.set(0, 0, dock.userData.len / 2);
dock.add(dockClick);
const boat = makeBoat();
{
  const side = new THREE.Vector2(dockDir.y, -dockDir.x);
  const bp = dockStart.clone().lerp(dockEnd, 0.75).add(side.multiplyScalar(-1.9));
  boat.position.set(bp.x, 0.05, bp.y);
  boat.rotation.y = Math.atan2(dockDir.x, dockDir.y) + 0.15;
  scene.add(boat);
}
// the beach's big pier: wider and longer than the home one, with lamps along it and a larger boat moored at its end
const pier2 = (() => {
  const P = LAYOUT.beach.pier, dir = new THREE.Vector2(P.dir.x, P.dir.z).normalize();
  let start = new THREE.Vector2(P.root.x, P.root.z);
  for (let t = 0; t < 30; t += 0.05) if (H(P.root.x + dir.x * t, P.root.z + dir.y * t) < 0) { start = new THREE.Vector2(P.root.x, P.root.z).addScaledVector(dir, t - 2.5); break; }
  const len = P.len, g = new THREE.Group();
  for (let i = 0; i < Math.floor(len / 0.42); i++) g.add(mesh(new THREE.BoxGeometry(2.6, 0.1, 0.38), i % 3 ? M.wood : mat('#a9774f'), 0, 0, i * 0.42 + 0.2));
  for (let i = 0; i <= 6; i++) for (const x of [-1.35, 1.35]) g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.8, 6), M.woodDark, x, -1.0, (i / 6) * (len - 0.3) + 0.15));
  for (const x of [-1.35, 1.35]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, len), M.wood, x, 0.55, len / 2));
  for (let i = 0; i <= 6; i++) for (const x of [-1.35, 1.35]) g.add(mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), M.woodDark, x, 0.28, (i / 6) * (len - 0.3) + 0.15));
  g.position.set(start.x, DOCK_Y, start.y); g.rotation.y = Math.atan2(dir.x, dir.y); scene.add(g);
  const click = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, len), new THREE.MeshBasicMaterial({ visible: false })); click.position.set(0, 0, len / 2); g.add(click);
  g.updateMatrixWorld(true);
  for (const u of [0.3, 0.65, 0.98]) for (const sx of [-1, 1]) {
    const at = g.localToWorld(new THREE.Vector3(sx * 1.35, 0.85, u * (len - 0.3)));
    const lan = mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), M.lantern, at.x, at.y, at.z); lan.castShadow = false; scene.add(lan);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.copy(at); glow.scale.set(1.4, 1.4, 1); scene.add(glow);
    lampData.push({ pos: at.clone(), light: null, glow });
  }
  const bigBoat = makeBoat(); bigBoat.scale.setScalar(1.6);
  const side = new THREE.Vector2(dir.y, -dir.x), bp = start.clone().addScaledVector(dir, len * 0.8).add(side.multiplyScalar(-2.9));
  bigBoat.position.set(bp.x, 0.05, bp.y); bigBoat.rotation.y = Math.atan2(dir.x, dir.y) + 0.1; scene.add(bigBoat);
  for (let t = -2; t < len; t += 1.5) avoid.push({ x: start.x + dir.x * t, z: start.y + dir.y * t, r: 2.2 });
  return { start, dir, len, click, boat: bigBoat };
})();
function onDock(x, z) {
  const px = x - dockStart.x, pz = z - dockStart.y;
  const along = px * dockDir.x + pz * dockDir.y, across = Math.abs(px * dockDir.y - pz * dockDir.x);
  if (along > -0.2 && along < dock.userData.len && across < 0.85) return true;
  const qx = x - pier2.start.x, qz = z - pier2.start.y; // the beach's big pier
  const along2 = qx * pier2.dir.x + qz * pier2.dir.y, across2 = Math.abs(qx * pier2.dir.y - qz * pier2.dir.x);
  return along2 > -0.2 && along2 < pier2.len && across2 < 1.2;
}
// pier lamps on the end posts
for (const u of [0.45, 0.98]) {
  const p = dockStart.clone().lerp(dockEnd, u * (dock.userData.len - 0.3) / dock.userData.len);
  for (const s of [-1, 1]) {
    const x = p.x + dockDir.y * 0.95 * s, z = p.y - dockDir.x * 0.95 * s;
    const post = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), M.woodDark, x, DOCK_Y + 0.3, z); scene.add(post);
    const lan = mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), M.lantern, x, DOCK_Y + 0.7, z); lan.castShadow = false; scene.add(lan);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.set(x, DOCK_Y + 0.7, z); glow.scale.set(1.3, 1.3, 1); scene.add(glow);
    lampData.push({ pos: glow.position.clone(), light: null, glow });
  }
}

// the island's scenery (island.js): rocks, trees, bushes, the lighthouse, the pond, boats at sea. Built after the
// town, yards, paths and pier, so it keeps out of all of them.
// ---------------------------------------------------------------- string lights round the plaza
// Strings of warm fairy lights (a thin dark cable with small round bulbs, sagging gently) between slim poles round the
// plaza, from those poles to the shops' front eaves, and across the paths leading out of the town. All high up
// (2.5-3.6), so they never get in the way of walking, tapping or the view. Bulbs glow and twinkle at dusk and night.
const townLights = (() => {
  const POLE_H = 3.7, ringR = PLAZA_R + 0.5;
  const pole = (x, z) => {
    const y = H(x, z);
    scene.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, POLE_H, 6), M.woodDark, x, y + POLE_H / 2, z));
    scene.add(mesh(new THREE.SphereGeometry(0.09, 6, 4), M.woodDark, x, y + POLE_H + 0.05, z));
    colliders.push({ x, z, r: 0.12 }); avoid.push({ x, z, r: 0.7 });
    return new THREE.Vector3(x, y + POLE_H - 0.1, z);
  };
  // poles on the plaza's rim, between the shop paths and the town's three spokes
  const ring = [-130, -80, -30, 16, 70, 135].map((a) => { const p = polar(a, ringR); return pole(p.x, p.z); });
  const strings = [];
  for (let i = 0; i < ring.length; i++) strings.push([ring[i], ring[(i + 1) % ring.length]]);
  // from the rim poles to the front corners of each shop's eaves
  for (const sh of SHOPS) {
    sh.obj.updateMatrixWorld(true);
    for (const lx of [-1.6, 1.6]) {
      const eave = sh.obj.localToWorld(new THREE.Vector3(lx, 2.4, 1.5));
      let best = ring[0]; for (const r of ring) if (r.distanceTo(eave) < best.distanceTo(eave)) best = r;
      if (best.distanceTo(eave) < 7) strings.push([best, eave]);
    }
  }
  // across each spoke path a little way out of town: a pole either side, a string over the path
  for (const spoke of LAYOUT.townSpokes) {
    const [a, b] = spoke, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
    const cx = a[0] + (dx / l) * Math.min(4.5, l * 0.5), cz = a[1] + (dz / l) * Math.min(4.5, l * 0.5);
    const off = LAYOUT.loop.width / 2 + 1.0;
    strings.push([pole(cx + nx * off, cz + nz * off), pole(cx - nx * off, cz - nz * off)]);
  }
  // cables and bulbs
  const bulbs = [], cableMat = new THREE.LineBasicMaterial({ color: 0x3a2f28 });
  for (const [a, b] of strings) {
    const len = a.distanceTo(b), sag = Math.min(0.9, len * 0.09), n = Math.max(6, Math.round(len / 0.5)), pts = [];
    for (let k = 0; k <= n; k++) { const u = k / n; pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0))); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat); scene.add(line);
    for (let k = 1; k < n; k++) bulbs.push(pts[k].clone().add(new THREE.Vector3(0, -0.07, 0)));
  }
  // three sets of bulbs that twinkle a little out of step, plus a soft additive glow round every bulb
  const sets = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc861, emissiveIntensity: 0.15, roughness: 0.4 }));
  const geo = new THREE.SphereGeometry(0.07, 6, 4), m4 = new THREE.Matrix4();
  sets.forEach((m, s) => {
    const mine = bulbs.filter((_, i) => i % 3 === s);
    const inst = new THREE.InstancedMesh(geo, m, mine.length);
    mine.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
    inst.castShadow = false; scene.add(inst);
  });
  const gGeo = new THREE.BufferGeometry().setFromPoints(bulbs);
  const glowMat = new THREE.PointsMaterial({ map: glowTex, size: 0.55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd98a });
  const glow = new THREE.Points(gGeo, glowMat); glow.frustumCulled = false; scene.add(glow);
  return { sets, glowMat, count: bulbs.length, strings: strings.length };
})();
function updateTownLights(time) {
  const on = cur.lamp; // 0 by day, 1 at dusk and night
  townLights.sets.forEach((m, s) => { m.emissiveIntensity = 0.15 + on * (1.9 + 0.5 * Math.sin(time * (1.7 + s * 0.6) + s * 2.1)); });
  townLights.glowMat.opacity = on * (0.75 + 0.15 * Math.sin(time * 2.3));
}

// ---------------------------------------------------------------- signposts at the road junctions
function signBoard(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf0dc'; g.fillRect(0, 0, 256, 72);
  g.fillStyle = color; g.fillRect(0, 0, 14, 72);
  g.fillStyle = '#5a4632'; g.font = 'bold 34px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 136, 38);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeSignpost(x, z, boards) {
  const g = new THREE.Group(), y = H(x, z);
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), M.woodDark, 0, 1.2, 0));
  boards.forEach(([text, color, yaw], i) => { // each board points along yaw (the way to that place)
    const b = new THREE.Group(); b.position.y = 2.05 - i * 0.42; b.rotation.y = yaw - Math.PI / 2; g.add(b);
    b.add(mesh(new THREE.BoxGeometry(1.25, 0.34, 0.06), M.wood, 0.55, 0, 0));
    const tip = mesh(new THREE.ConeGeometry(0.2, 0.25, 3), M.wood, 1.28, 0, 0); tip.rotation.z = -Math.PI / 2; b.add(tip);
    for (const side of [1, -1]) { const pic = flatPic(signBoard(text, color), 1.15, 0.3); pic.position.set(0.55, 0, side * 0.035); pic.rotation.y = side < 0 ? Math.PI : 0; b.add(pic); }
  });
  g.position.set(x, y, z); scene.add(g);
  colliders.push({ x, z, r: 0.15 }); avoid.push({ x, z, r: 1 });
}
{
  const E = Math.PI / 2, W = -Math.PI / 2, S = 0; // yaw toward +x, -x, +z
  const [dx, dz] = LAYOUT.roads.desert[0], [bx, bz] = LAYOUT.roads.beach[0];
  makeSignpost(dx + 2.5, dz + 2.4, [['🏜️ Desert', '#e8a24a', E], ['🏡 Town', '#6cb848', W]]);
  makeSignpost(bx - 2.5, bz + 2.4, [['🏖️ Beach', '#5fb4e0', W], ['🏡 Town', '#6cb848', E]]);
  makeSignpost(TOWN.x + 2.2, TOWN.z + PLAZA_R + 1.6, [['🏜️ Desert', '#e8a24a', E], ['🏖️ Beach', '#5fb4e0', W], ['⚓ Pier', '#8fc0f0', S]]);
  const hp = LAYOUT.desert.hutPath[0]; makeSignpost(hp[0] + 2.2, hp[1] - 0.5, [['🌴 Oasis', '#4fa36a', Math.atan2(8, -5)], ['🏠 Huts', '#d9844a', S + Math.PI]]);
}

// ---------------------------------------------------------------- the hot air balloon park
// An open meadow between the plaza and the two northern homes: a round plank launch pad in the middle, a ticket hut
// with a striped awning, a flagpole, flower beds, bunting, benches and lamps. The balloon itself is built further down.
const BPARK = LAYOUT.balloon;
const balloonPark = (() => {
  const g = new THREE.Group(), y0 = H(BPARK.x, BPARK.z);
  g.position.set(BPARK.x, y0, BPARK.z); scene.add(g);
  g.updateMatrixWorld(true);
  // the launch pad: a ring of planks, a darker rim, and four mooring pegs
  const pad = mesh(new THREE.CylinderGeometry(3, 3.1, 0.14, 24), M.wood, 0, 0.07, 0); pad.receiveShadow = true; pad.castShadow = false; g.add(pad);
  for (let i = -2; i <= 2; i++) { const seam = mesh(new THREE.BoxGeometry(0.05, 0.02, Math.sqrt(9 - (i * 1.15) ** 2) * 2 - 0.2), M.woodDark, i * 1.15, 0.15, 0); seam.castShadow = false; g.add(seam); }
  const rim = mesh(new THREE.TorusGeometry(3.05, 0.09, 6, 32), M.woodDark, 0, 0.14, 0); rim.rotation.x = Math.PI / 2; rim.castShadow = false; g.add(rim);
  const pegs = [];
  for (const [lx, lz] of [[2.4, 2.4], [-2.4, 2.4], [2.4, -2.4], [-2.4, -2.4]]) {
    const k = lx / 2.4 * 0.35, j = lz / 2.4 * 0.35;
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), M.woodDark, lx + k, 0.25, lz + j));
    pegs.push(new THREE.Vector3(BPARK.x + lx + k, y0 + 0.45, BPARK.z + lz + j));
  }
  // the ticket hut, its front toward the pad
  const hut = new THREE.Group(); hut.position.set(5.8, 0, -1.2); hut.rotation.y = -Math.PI / 2 + 0.2; g.add(hut);
  hut.add(mesh(new THREE.BoxGeometry(2.2, 1.9, 1.6), M.cream, 0, 0.95, 0));
  hut.add(mesh(new THREE.BoxGeometry(2.5, 0.16, 1.9), mat('#f29ab8'), 0, 1.98, 0));
  const aw = makeAwning(2.2, '#f29ab8'); aw.position.set(0, 1.62, 0.8); hut.add(aw);
  const win = mesh(new THREE.BoxGeometry(1.2, 0.55, 0.06), M.window, 0, 1.12, 0.81); win.castShadow = false; hut.add(win);
  hut.add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.3), M.wood, 0, 0.8, 0.92));
  const sign = flatPic(signBoard('🎈 Balloon', '#f29ab8'), 1.4, 0.4); sign.position.set(0, 2.35, 0.2); hut.add(sign);
  hut.add(mesh(new THREE.BoxGeometry(1.55, 0.48, 0.06), M.wood, 0, 2.35, 0.15));
  // the flagpole, with a little flag that ripples
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), M.white, -5.2, 2.1, 2.2));
  g.add(mesh(new THREE.SphereGeometry(0.1, 6, 4), mat('#f2c94c'), -5.2, 4.25, 2.2));
  const flag = new THREE.Group(); flag.position.set(-5.2, 3.85, 2.2); g.add(flag);
  const flagM = mesh(new THREE.BoxGeometry(0.03, 0.5, 0.8), mat('#8fc0f0'), 0, 0, 0.42); flag.add(flagM);
  // bunting from the flagpole to the hut's roof, small pastel triangles hanging off a sagging string
  g.updateMatrixWorld(true);
  const a = new THREE.Vector3(-5.2, 3.6, 2.2), b = hut.localToWorld(new THREE.Vector3(-1.1, 1.95, 0.9)).sub(g.position);
  const cols = ['#f6b8d0', '#9be0c0', '#f2e28a', '#8fc0f0', '#c9a6ff'], pts = [];
  for (let k = 0; k <= 16; k++) { const u = k / 16; pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -1.0 * 4 * u * (1 - u), 0))); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a5a36 })));
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  for (let k = 1; k < 16; k++) { const tri = mesh(new THREE.ConeGeometry(0.13, 0.28, 3), mat(cols[k % cols.length]), pts[k].x, pts[k].y - 0.14, pts[k].z); tri.rotation.set(Math.PI, yaw, 0); tri.scale.z = 0.2; tri.castShadow = false; g.add(tri); }
  // flower beds round the meadow
  const flowerCols = ['#ff9ec4', '#fff27a', '#ffffff', '#c9a6ff', '#ffb37a'];
  [[-4.6, -3.6, 0.5], [0.8, -5.6, 0], [-1.2, 5.6, 0.3]].forEach(([lx, lz, r], i) => {
    const bed = new THREE.Group(); bed.position.set(lx, 0, lz); bed.rotation.y = r; g.add(bed);
    bed.add(mesh(new THREE.BoxGeometry(2.2, 0.18, 0.8), mat('#7a553e'), 0, 0.09, 0));
    for (let k = 0; k < 10; k++) { const fx = -0.9 + (k % 5) * 0.45, fz = k < 5 ? -0.18 : 0.18; bed.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4), M.leaf, fx, 0.3, fz)); bed.add(mesh(new THREE.SphereGeometry(0.08, 6, 4), mat(flowerCols[(k + i) % flowerCols.length]), fx, 0.45, fz)); }
  });
  // benches looking at the pad, and lamps that glow at dusk and night
  const benches = [[-5.2, -1.2], [2.2, 5.4], [-3.8, 4.6]];
  for (const [lx, lz] of benches) { const bn = makeBench(); bn.position.set(lx, 0, lz); bn.rotation.y = Math.atan2(-lx, -lz); g.add(bn); }
  const lampSpots = [[4.2, 3.6], [-4.4, -5], [4.6, -4.6]];
  for (const [lx, lz] of lampSpots) {
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 6), M.woodDark, lx, 0.95, lz));
    const lan = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), M.lantern, lx, 2.0, lz); lan.castShadow = false; g.add(lan);
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.15, 4), M.woodDark, lx, 2.22, lz));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.position.set(BPARK.x + lx, y0 + 2.0, BPARK.z + lz); glow.scale.set(1.6, 1.6, 1); scene.add(glow);
    lampData.push({ pos: glow.position.clone(), light: null, glow });
  }
  // solid pieces, and no trees or rocks anywhere on the meadow
  const hc = hut.localToWorld(new THREE.Vector3(0, 0, 0));
  colliders.push({ x: hc.x, z: hc.z, r: 1.25 }, { x: BPARK.x - 5.2, z: BPARK.z + 2.2, r: 0.15 }, { x: BPARK.x, z: BPARK.z, r: 1.35 }); // the basket, when it's on the pad
  for (const [lx, lz] of [...lampSpots]) colliders.push({ x: BPARK.x + lx, z: BPARK.z + lz, r: 0.12 });
  for (const [lx, lz] of benches) colliders.push({ x: BPARK.x + lx, z: BPARK.z + lz, r: 0.75 });
  [[-4.6, -3.6], [0.8, -5.6], [-1.2, 5.6]].forEach(([lx, lz]) => colliders.push({ x: BPARK.x + lx, z: BPARK.z + lz, r: 0.6 })); // the flower beds
  for (const pg of pegs) colliders.push({ x: pg.x, z: pg.z, r: 0.12 });
  avoid.push({ x: BPARK.x, z: BPARK.z, r: 8.5 });
  return { y0, pegs, flag };
})();
// ---------------------------------------------------------------- raised walkways: stairs, balconies and rope bridges
// A deck is a strip along a line from a to b, hw wide each side, with its walking height going from ya to yb. You step
// from one deck (or the ground) onto another only where their heights meet, so stairs climb, balconies keep you from
// stepping off their edges, and the sand under a balcony is still the sand. LINKS join them up for walking routes.
const DECKS = [], LINKS = []; // LINKS: { a, b, x, z } (a/b: deck index, or -1 for the ground)
function addDeck(ax, az, bx, bz, ya, yb, hw) { DECKS.push({ ax, az, bx, bz, ya, yb, hw, len: Math.hypot(bx - ax, bz - az) }); return DECKS.length - 1; }
function deckT(d, x, z) { const ux = (d.bx - d.ax) / d.len, uz = (d.bz - d.az) / d.len, rx = x - d.ax, rz = z - d.az; return { t: (rx * ux + rz * uz) / d.len, side: Math.abs(-rx * uz + rz * ux) }; }
function deckHas(d, x, z, m = 0) { const q = deckT(d, x, z); return q.t >= -m / d.len && q.t <= 1 + m / d.len && q.side <= d.hw + m; }
function deckY(d, x, z) { return lerp(d.ya, d.yb, clamp(deckT(d, x, z).t, 0, 1)); }
// where you can stand stepping to (x, z), from the deck you're on (or the ground, -1) at height curY: a deck index,
// -1 for the ground, or null (a railing edge or a drop)
// (from the sand you only step onto stairs when climb is set: a walk heading up them, not one passing their foot)
function standAt(x, z, cur, curY, climb = true) {
  if (myRoom !== null) return walkable(x, z) ? -1 : null;
  if (cur >= 0 && deckHas(DECKS[cur], x, z) && Math.abs(deckY(DECKS[cur], x, z) - curY) < 0.4) return cur;
  let best = null, bd = 0.4;
  DECKS.forEach((d, i) => { if ((cur >= 0 || climb) && deckHas(d, x, z)) { const dy = Math.abs(deckY(d, x, z) - curY); if (dy < bd) { bd = dy; best = i; } } });
  if (best !== null) return best;
  return walkable(x, z) && Math.abs(groundY(x, z) - curY) < 0.4 ? -1 : null;
}
// the way from one level to another: the link points to pass through, ending at (x, z); null if there's no way
function levelRoute(from, to, x, z) {
  if (from === to) return [{ x, z }];
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n === to) break;
    for (const l of LINKS) for (const [p, q] of [[l.a, l.b], [l.b, l.a]]) if (p === n && !prev.has(q)) { prev.set(q, { n, l }); queue.push(q); }
  }
  if (!prev.has(to)) return null;
  const pts = [{ x, z }];
  for (let n = to; prev.get(n); n = prev.get(n).n) pts.unshift({ x: prev.get(n).l.x, z: prev.get(n).l.z });
  return pts;
}
const deckClicks = []; // invisible slabs over the decks, so a tap on a balcony lands on the balcony

// ---------------------------------------------------------------- the beach festival: booths, vendors, cabins, lights
// Five market booths along the boardwalk (each with a vendor to chat with), tall wooden cabins on stilts at the back of
// the beach joined by rope bridges, and string lights, bunting, lanterns, benches, bins, a stage and beach props.
// Everything here is the same on every screen (no random numbers) and nothing is saved.
const festival = (() => {
  const glowMats = [], lanternMats = [];
  const glowSprite = (x, y, z, s = 1.4, color = 0xffffff) => {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    g.position.set(x, y, z); g.scale.set(s, s, 1); scene.add(g);
    lampData.push({ pos: g.position.clone(), light: null, glow: g });
    return g;
  };
  const paperLantern = (color) => { const m = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.15, roughness: 0.6 }); lanternMats.push(m); return m; };
  const signPic = (emoji, bg) => { // a picture sign: one big picture on a round board, no words
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = bg; if (x.beginPath) { x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fill(); }
    x.font = '76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const scallops = (w, color) => { // a row of round scallops hanging off an awning's front edge
    const g = new THREE.Group(), n = Math.round(w / 0.4);
    for (let i = 0; i < n; i++) { const s = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10, 1, false, 0, Math.PI), i % 2 ? M.white : mat(color), -w / 2 + (i + 0.5) * (w / n), 0, 0); s.rotation.set(Math.PI / 2, 0, Math.PI); g.add(s); }
    return g;
  };
  // ---- the booths
  const BOOTH = {
    swim: { color: '#f29ab8', pic: '👙', bg: '#ffe3ee', scallop: false },
    rings: { color: '#5fb4e0', pic: '🛟', bg: '#dff3ff', scallop: true },
    lantern: { color: '#e0584a', pic: '🏮', bg: '#fff0d8', scallop: false },
    snack: { color: '#6fd3b0', pic: '🍧', bg: '#e6fff4', scallop: true },
    games: { color: '#f2c94c', pic: '🎯', bg: '#fff6d0', scallop: false },
  };
  for (const b of FEST.booths) {
    const spec = BOOTH[b.kind], g = new THREE.Group(), y = H(b.x, b.z);
    g.position.set(b.x, y, b.z); g.rotation.y = b.yaw; scene.add(g);
    for (const [px, pz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6), M.wood, px, 1.2, pz));
    g.add(mesh(new THREE.BoxGeometry(2.6, 1.7, 0.08), mat('#fbf0dc'), 0, 1.25, -0.8)); // the back wall
    g.add(mesh(new THREE.BoxGeometry(2.7, 0.12, 1.8), mat(spec.color), 0, 2.45, 0)); // the roof
    const counter = mesh(new THREE.BoxGeometry(2.5, 0.9, 0.5), M.wood, 0, 0.45, 0.62); g.add(counter);
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.6, 0.04), mat(spec.color), 0, 0.45, 0.88)); // the counter's coloured front
    g.add(mesh(new THREE.BoxGeometry(2.6, 0.06, 0.6), M.woodDark, 0, 0.93, 0.62));
    if (spec.scallop) { const sc = scallops(2.7, spec.color); sc.position.set(0, 2.37, 0.92); g.add(sc); }
    else { const aw = makeAwning(2.7, spec.color); aw.position.set(0, 2.3, 0.62); g.add(aw); }
    const board = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20), M.wood, 0, 3.0, 0.1); board.rotation.x = Math.PI / 2; g.add(board);
    const pic = flatPic(signPic(spec.pic, spec.bg), 0.74, 0.74); pic.position.set(0, 3.0, 0.15); g.add(pic);
    if (b.kind === 'swim') { // a rack of swimsuits, hats and sunglasses on the counter
      g.add(mesh(new THREE.BoxGeometry(2.0, 0.04, 0.04), M.woodDark, 0, 1.9, -0.55));
      ['#ff8fa8', '#6fd3d0', '#f2e28a', '#c9a6ff', '#8fc0f0'].forEach((c, i) => { const s = mesh(new THREE.BoxGeometry(0.26, 0.36, 0.05), mat(c), -0.8 + i * 0.4, 1.65, -0.55); g.add(s); g.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), M.woodDark, -0.8 + i * 0.4, 1.86, -0.55)); });
      for (const [hx, c] of [[-0.7, '#e8c76a'], [0.1, '#f6b8d0']]) { g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12), mat(c), hx, 0.98, 0.6)); g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 10), mat(c), hx, 1.04, 0.6)); }
      for (const sx of [0.7, 0.86]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), mat('#2b2b3a'), sx, 0.99, 0.66));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), mat('#2b2b3a'), 0.78, 0.99, 0.66));
    } else if (b.kind === 'rings') { // a pile of swim rings, beach balls and a floaty duck beside the counter
      ['#ff8a3a', '#f6d55c', '#6fd3d0', '#f29ab8', '#8fc0f0', '#9be0c0'].forEach((c, i) => { const r = mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16), mat(c), -1.75 + (i % 2) * 0.15, 0.12 + i * 0.2, 0.3 + (i % 3) * 0.05); r.rotation.x = Math.PI / 2 + (i % 2 ? 0.2 : -0.15); g.add(r); });
      for (const [bx, c] of [[-0.6, '#ff8fa8'], [0.3, '#8fc0f0']]) { g.add(mesh(new THREE.SphereGeometry(0.2, 12, 8), M.white, bx, 1.13, 0.6)); const band = mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), mat(c), bx, 1.13, 0.6); band.rotation.y = Math.PI / 2; g.add(band); }
      const duck = new THREE.Group(); duck.position.set(-1.7, 1.35, 0.35); g.add(duck);
      const dy = mat('#f6d55c'); const dbody = mesh(new THREE.SphereGeometry(0.25, 10, 8), dy, 0, 0, 0); dbody.scale.set(1, 0.7, 1.3); duck.add(dbody);
      duck.add(mesh(new THREE.SphereGeometry(0.14, 10, 8), dy, 0, 0.22, 0.2));
      const beak = mesh(new THREE.ConeGeometry(0.05, 0.12, 6), mat('#ff8a3a'), 0, 0.2, 0.36); beak.rotation.x = Math.PI / 2; duck.add(beak);
      for (const x of [-0.06, 0.06]) duck.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), mat('#2b211c'), x, 0.26, 0.31));
    } else if (b.kind === 'lantern') { // glowing paper lanterns in many colours under the awning
      ['#ff8a5a', '#f6d55c', '#f29ab8', '#9be0c0', '#c9a6ff', '#ff6a6a'].forEach((c, i) => {
        const lx = -1.0 + i * 0.4, ly = 1.95 - (i % 2) * 0.25;
        g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 2.3 - ly, 3), M.woodDark, lx, (2.3 + ly) / 2 + 0.1, 0.75));
        const l = mesh(new THREE.SphereGeometry(0.17, 10, 8), paperLantern(c), lx, ly, 0.75); l.scale.y = 1.25; l.castShadow = false; g.add(l);
        for (const cy of [0.22, -0.22]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), M.woodDark, lx, ly + cy, 0.75));
      });
      g.updateMatrixWorld(true); const w = g.localToWorld(new THREE.Vector3(0, 1.9, 0.8)); glowSprite(w.x, w.y, w.z, 3.2, 0xffc890);
    } else if (b.kind === 'snack') { // shaved ice in cups, coconut drinks with straws
      ['#ff9ec4', '#9be0f0', '#fff27a'].forEach((c, i) => { const x = -0.8 + i * 0.35; g.add(mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.16, 8), M.white, x, 1.04, 0.62)); g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(c), x, 1.16, 0.62)); });
      for (const x of [0.4, 0.75]) { g.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat('#8a5a36'), x, 1.1, 0.62)); const straw = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 4), mat('#f29ab8'), x + 0.04, 1.3, 0.62); straw.rotation.z = -0.3; g.add(straw); }
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.8, 0.5), mat('#9be0f0'), 0.8, 0.4, -0.35)); // a cool box
    } else if (b.kind === 'games') { // ring toss: a board of pegs, some rings, and prize plushies on a shelf
      const board2 = mesh(new THREE.BoxGeometry(1.0, 0.06, 0.6), mat('#fbf0dc'), -0.6, 0.97, 0.6); g.add(board2);
      for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 5), mat('#e0584a'), -0.95 + (i % 3) * 0.35, 1.1, 0.45 + Math.floor(i / 3) * 0.3));
      for (const [rx, c] of [[0.3, '#5fb4e0'], [0.55, '#f29ab8'], [0.8, '#9be0c0']]) { const r = mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), mat(c), rx, 0.98, 0.62); r.rotation.x = Math.PI / 2; g.add(r); }
      g.add(mesh(new THREE.BoxGeometry(2.2, 0.06, 0.3), M.woodDark, 0, 1.75, -0.6));
      ['#ef6a4a', '#f6d55c', '#9be0c0', '#c9a6ff'].forEach((c, i) => { const x = -0.8 + i * 0.53; g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(c), x, 1.93, -0.6)); for (const ex of [-0.1, 0.1]) g.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(c), x + ex, 2.08, -0.6)); });
    }
    colliders.push({ x: b.x, z: b.z, r: 1.55 });
    if (b.kind === 'rings') { g.updateMatrixWorld(true); const w = g.localToWorld(new THREE.Vector3(-1.75, 0, 0.35)); colliders.push({ x: w.x, z: w.z, r: 0.5 }); }
    avoid.push({ x: b.x, z: b.z, r: 3.2 });
    // keep the ground in front of it open: no palms, umbrellas or rocks between the booth and the boardwalk
    for (let k = 1; k <= 3; k++) avoid.push({ x: b.x + Math.sin(b.yaw) * k * 1.4, z: b.z + Math.cos(b.yaw) * k * 1.4, r: 1.6 });
  }
  // ---- the vendors, one beside each booth's front corner
  Object.assign(SHOPKEEPERS, {
    swim: { name: 'Nia', tag: '#f29ab8', skin: '#f5c9a8', hair: '#3a2a22', top: '#ff8fa8', bottom: '#6fd3d0', longHair: true, dress(n) { // a wide sun hat and heart sunglasses
      n.head.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 16), n.soft('#e8c76a'), 0, 0.24, 0));
      n.head.add(mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.18, 14), n.soft('#e8c76a'), 0, 0.33, 0));
      n.head.add(mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.05, 14), n.soft('#f29ab8'), 0, 0.27, 0));
      for (const x of [-0.11, 0.11]) { const s = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), n.soft('#e0584a'), x, 0.0, 0.31); s.rotation.x = Math.PI / 2; n.head.add(s); }
      n.props = [];
    } },
    rings: { name: 'Pogo', tag: '#5fb4e0', skin: '#e8b48c', hair: '#2b2b3a', top: '#5fb4e0', bottom: '#f2e28a', dress(n) { // a snorkel mask pushed up on the forehead, a swim ring round the waist
      const mask = mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), n.soft('#9be0f0'), 0, 0.2, 0.28); n.head.add(mask);
      const tube = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), n.soft('#ff8a3a'), 0.22, 0.32, 0.12); n.head.add(tube);
      const ring = mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 16), n.soft('#ff8a3a'), 0, 0.02, 0); ring.rotation.x = Math.PI / 2; n.body.add(ring);
      n.props = [];
    } },
    lantern: { name: 'Lumi', tag: '#ffb37a', skin: '#ffe0c8', hair: '#6b4a2c', top: '#e0584a', bottom: '#3a3f5a', longHair: true, dress(n) { // a flower in the hair and a little lantern in hand
      n.head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), n.soft('#ff9ec4'), 0.24, 0.2, 0.1));
      const lan = mesh(new THREE.SphereGeometry(0.1, 8, 6), paperLantern('#ffb37a'), 0, -0.14, 0.05); lan.scale.y = 1.2; n.handL.add(lan);
      n.props = [];
    } },
    snack: { name: 'Kiko', tag: '#6fd3b0', skin: '#f0c8a0', hair: '#2b211c', top: '#fffaf0', bottom: '#6fd3b0', dress(n) { // a bandana and an apron
      n.head.add(mesh(new THREE.SphereGeometry(0.345, 14, 8, 0, TAU, 0, Math.PI / 2.4), n.soft('#6fd3b0'), 0, 0.05, -0.02));
      n.body.add(mesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), n.soft('#9be0c0'), 0, 0.12, 0.21));
      n.props = [];
    } },
    games: { name: 'Dash', tag: '#f2c94c', skin: '#d9a07a', hair: '#c0703a', top: '#f2c94c', bottom: '#5d8fc4', dress(n) { // a striped cap and a whistle
      n.head.add(mesh(new THREE.SphereGeometry(0.35, 14, 8, 0, TAU, 0, Math.PI / 2), n.soft('#e0584a'), 0, 0.06, -0.02));
      const brim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12, 1, false, 0, Math.PI), n.soft('#fbf0dc'), 0, 0.08, 0.2); brim.rotation.y = -Math.PI / 2; n.head.add(brim);
      n.body.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), n.soft('#c0c6cf'), 0, 0.3, 0.24));
      n.props = [];
    } },
  });
  for (const b of FEST.booths) {
    const spec = SHOPKEEPERS[b.kind], n = makeTownNpc(spec); spec.dress(n);
    const at = new THREE.Vector3(1.85, 0, 1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw).add(new THREE.Vector3(b.x, 0, b.z));
    n.g.position.set(at.x, H(at.x, at.z) + 0.02, at.z);
    n.baseYaw = b.yaw; n.g.rotation.y = b.yaw; n.kind = b.kind; n.ph = 3.3 + b.x;
    scene.add(n.g); colliders.push({ x: at.x, z: at.z, r: 0.4 }); shopkeepers.push(n);
  }
  // ---- tall wooden cabins on stilts: a balcony all round, stairs up, round glowing windows, a thatched roof
  const F = LAYOUT.beach.festival, wood = mat('#c08a5a'), woodLight = mat('#d9a873'), thatch = mat('#d9b56a'), thatchDark = mat('#c49a4e');
  const floorOf = []; // deck index of each cabin's balcony
  const cluster = new Set(F.bridges.flat());
  const clusterY = Math.max(...[...cluster].map((i) => H(F.cabins[i].x, F.cabins[i].z))) + 1.2;
  const HALF = 2.5;
  F.cabins.forEach((c, ci) => {
    const g = new THREE.Group(), fy = cluster.has(ci) ? clusterY : H(c.x, c.z) + 1.2;
    g.position.set(c.x, 0, c.z); g.rotation.y = c.face; scene.add(g); g.updateMatrixWorld(true);
    const W = (lx, lz) => g.localToWorld(new THREE.Vector3(lx, 0, lz));
    c.fy = fy; c.W = W;
    // stilts down to the sand (each as long as it needs to be on sloping ground)
    for (const [lx, lz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3], [0, 2.3], [0, -2.3]]) { const w = W(lx, lz), gh = H(w.x, w.z), len = fy - gh + 0.1; g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, len, 6), wood, lx, gh + len / 2 - 0.1, lz)); }
    // the floor (planks) and the balcony
    const floor = mesh(new THREE.BoxGeometry(HALF * 2, 0.16, HALF * 2), woodLight, 0, fy - 0.08, 0); floor.receiveShadow = true; g.add(floor);
    for (let k = -2; k <= 2; k++) { const seam = mesh(new THREE.BoxGeometry(HALF * 2, 0.01, 0.04), wood, 0, fy + 0.005, k); seam.castShadow = false; g.add(seam); }
    const fa = W(0, -HALF), fb = W(0, HALF);
    floorOf[ci] = addDeck(fa.x, fa.z, fb.x, fb.z, fy, fy, HALF);
    // the cabin: one storey of plank walls, round windows, a decorative door, a thatched roof (about 4 units tall in all)
    g.add(mesh(new THREE.BoxGeometry(2.8, 1.7, 2.4), wood, 0, fy + 0.85, -0.8));
    for (let k = 0; k < 5; k++) { const pl = mesh(new THREE.BoxGeometry(2.82, 0.03, 2.42), mat('#a8774c'), 0, fy + 0.25 + k * 0.32, -0.8); pl.castShadow = false; g.add(pl); }
    const roof = mesh(new THREE.ConeGeometry(2.3, 1.25, 4), thatch, 0, fy + 2.3, -0.8); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.95; g.add(roof);
    const fringe = mesh(new THREE.ConeGeometry(2.4, 0.32, 4, 1, true), thatchDark, 0, fy + 1.74, -0.8); fringe.rotation.y = Math.PI / 4; g.add(fringe);
    g.add(mesh(new THREE.BoxGeometry(0.75, 1.25, 0.08), mat('#8a5a36'), 0.6, fy + 0.63, 0.42)); // the door (just for looks)
    g.add(mesh(new THREE.SphereGeometry(0.045, 6, 4), M.flowerY, 0.85, fy + 0.63, 0.48));
    for (const [wx, wy, wz] of [[-0.7, fy + 1.0, 0.41], [1.41, fy + 1.0, -0.8], [-1.41, fy + 1.0, -0.8]]) {
      const ring = mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 16), M.woodDark, wx, wy, wz);
      const win = mesh(new THREE.CircleGeometry(0.28, 16), M.window, wx, wy, wz + (Math.abs(wx) > 1.4 ? 0 : 0.01)); win.castShadow = false;
      if (Math.abs(wx) > 1.4) { ring.rotation.y = Math.PI / 2; win.rotation.y = Math.sign(wx) * Math.PI / 2; win.position.x += Math.sign(wx) * 0.01; }
      g.add(ring, win);
    }
    // lanterns at the front corners, and flower pots hanging from the balcony edge
    for (const lx of [-2.2, 2.2]) {
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), M.woodDark, lx, fy + 1.4, 2.35));
      const lan = mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), M.lantern, lx, fy + 1.1, 2.35); lan.castShadow = false; g.add(lan);
      const w = W(lx, 2.35); glowSprite(w.x, fy + 1.1, w.z, 1.4);
    }
    for (const lx of [-1.2, 1.4]) {
      g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.5, 3), M.woodDark, lx, fy - 0.35, 2.55));
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 8), mat('#d07a50'), lx, fy - 0.65, 2.55));
      for (const [fx, c] of [[-0.07, '#ff9ec4'], [0.07, '#fff27a'], [0, '#c9a6ff']]) g.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(c), lx + fx, fy - 0.5, 2.55));
    }
    // solid: the cabin's walls up on the balcony; the stilts and the space under the balcony down on the sand
    const body = W(0, -0.8);
    colliders.push({ x: body.x, z: body.z, r: 1.45, lvl: 'd' });
    const mid = W(0, 0); colliders.push({ x: mid.x, z: mid.z, r: 2.7, lvl: 'g' });
    avoid.push({ x: mid.x, z: mid.z, r: 4.2 });
  });
  // stairs up the side of a cabin, from the front corner down toward the back
  const STAIR_L = 2.6; // short stairs up to a low balcony
  F.cabins.forEach((c, ci) => {
    if (!c.stairs) return;
    const s = c.stairs, sx = s * 2.95, top = c.W(sx, 1.6), bot = c.W(sx, 1.6 - STAIR_L), gy = H(bot.x, bot.z);
    const di = addDeck(top.x, top.z, bot.x, bot.z, c.fy, gy, 0.55);
    const inFloor = c.W(sx, 1.3), out = c.W(sx, 1.6 - STAIR_L - 0.6); // both on the stairs' middle line, so routes climb straight
    LINKS.push({ a: floorOf[ci], b: di, x: inFloor.x, z: inFloor.z }, { a: di, b: -1, x: out.x, z: out.z });
    // the steps and their side rails
    const n = 7, sg = new THREE.Group(); scene.add(sg);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, x = lerp(top.x, bot.x, u), z = lerp(top.z, bot.z, u), y = lerp(c.fy, gy, u);
      const st = mesh(new THREE.BoxGeometry(1.1, 0.08, STAIR_L / n + 0.02), woodLight, x, y - 0.04, z); st.rotation.y = c.face; sg.add(st);
    }
    for (const side of [-0.55, 0.55]) {
      const a = c.W(sx + side, 1.6), b = c.W(sx + side, 1.6 - STAIR_L);
      sg.add(rodBetween(new THREE.Vector3(a.x, c.fy - 0.1, a.z), new THREE.Vector3(b.x, gy - 0.1, b.z), 0.05, wood));
      if (side * s > 0) sg.add(rodBetween(new THREE.Vector3(a.x, c.fy + 0.8, a.z), new THREE.Vector3(b.x, gy + 0.8, b.z), 0.035, wood)); // the handrail on the outside
      for (let k = 0; k <= 3; k++) { const u = k / 3, x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u), y = lerp(c.fy, gy, u); if (side * s > 0) sg.add(mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), wood, x, y + 0.4, z)); }
    }
    // the sand under the high end of the stairs is out of bounds (the low end is where you step on)
    for (let u = 0; u <= 0.45; u += 0.15) colliders.push({ x: lerp(top.x, bot.x, u), z: lerp(top.z, bot.z, u), r: 0.6, lvl: 'g' });
    avoid.push({ x: lerp(top.x, bot.x, 0.5), z: lerp(top.z, bot.z, 0.5), r: 3 }, { x: out.x, z: out.z, r: 1.6 });
  });
  // rope bridges between neighbouring balconies, across their fronts
  const fairy = []; // [from, to] cables of fairy lights
  for (const [i, j] of F.bridges) {
    const A = F.cabins[i], B = F.cabins[j];
    const dirS = Math.sign(B.W(0, 0).x - A.W(0, 0).x) || 1; // which side of A faces B (in A's own x)
    const a = A.W(dirS * (HALF - 0.1), 1.5), b = B.W(-dirS * (HALF - 0.1), 1.5), y = clusterY;
    const di = addDeck(a.x, a.z, b.x, b.z, y, y, 0.6);
    const ia = A.W(dirS * (HALF - 0.5), 1.5), ib = B.W(-dirS * (HALF - 0.5), 1.5);
    LINKS.push({ a: floorOf[i], b: di, x: ia.x, z: ia.z }, { a: di, b: floorOf[j], x: ib.x, z: ib.z });
    const len = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z), n = Math.round(len / 0.32), bg = new THREE.Group(); scene.add(bg);
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n, sag = Math.sin(u * Math.PI) * 0.08; const pl = mesh(new THREE.BoxGeometry(1.2, 0.07, 0.24), k % 2 ? woodLight : wood, lerp(a.x, b.x, u), y - 0.04 - sag, lerp(a.z, b.z, u)); pl.rotation.y = yaw; bg.add(pl); }
    const nx = Math.cos(yaw), nz = -Math.sin(yaw); // across the bridge
    for (const side of [-0.62, 0.62]) {
      const pts = []; for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push(new THREE.Vector3(lerp(a.x, b.x, u) + nx * side, y + 0.85 - Math.sin(u * Math.PI) * 0.18, lerp(a.z, b.z, u) + nz * side)); }
      bg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a6a4a })));
      for (const e of [a, b]) bg.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), wood, e.x + nx * side, y + 0.45, e.z + nz * side));
    }
    fairy.push([new THREE.Vector3(a.x, y + 2.6, a.z), new THREE.Vector3(b.x, y + 2.6, b.z)]);
  }
  // railings round each balcony, leaving gaps where stairs and bridges join
  const gaps = DECKS.map(() => []);
  for (const l of LINKS) for (const k of [l.a, l.b]) if (k >= 0 && floorOf.includes(k)) gaps[k].push({ x: l.x, z: l.z });
  F.cabins.forEach((c, ci) => {
    const fi = floorOf[ci], rail = new THREE.Group(); scene.add(rail);
    const corners = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4], n = 10;
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, lx = lerp(ax, bx, (u0 + u1) / 2), lz = lerp(az, bz, (u0 + u1) / 2), w = c.W(lx, lz);
        if (gaps[fi].some((q) => Math.hypot(q.x - w.x, q.z - w.z) < 1.0)) continue;
        const a = c.W(lerp(ax, bx, u0), lerp(az, bz, u0)), b = c.W(lerp(ax, bx, u1), lerp(az, bz, u1));
        rail.add(rodBetween(new THREE.Vector3(a.x, c.fy + 0.8, a.z), new THREE.Vector3(b.x, c.fy + 0.8, b.z), 0.035, wood));
        rail.add(mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), wood, a.x, c.fy + 0.4, a.z));
      }
    }
  });
  // invisible tap targets over every deck
  const clickM = new THREE.MeshBasicMaterial({ visible: false });
  DECKS.forEach((d, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(d.hw * 2, 0.1, d.len), clickM);
    m.position.set((d.ax + d.bx) / 2, (d.ya + d.yb) / 2, (d.az + d.bz) / 2);
    m.rotation.set(0, Math.atan2(d.bx - d.ax, d.bz - d.az), 0); m.rotateX(Math.atan2(d.ya - d.yb, d.len));
    m.userData.deck = i; scene.add(m); deckClicks.push(m);
  });
  // fairy lights from roof to roof across the cabins, string lights zig-zagging over the boardwalk, bunting under them
  const poleTop = FEST.poles.map((p) => { const y = H(p.x, p.z); scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.8, 6), M.woodDark, p.x, y + 1.9, p.z)); colliders.push({ x: p.x, z: p.z, r: 0.12 }); avoid.push({ x: p.x, z: p.z, r: 0.6 }); return new THREE.Vector3(p.x, y + 3.7, p.z); });
  const strings = [...fairy];
  for (let k = 0; k + 1 < poleTop.length; k++) strings.push([poleTop[k], poleTop[k + 1]]);
  const bulbs = [], cableMat = new THREE.LineBasicMaterial({ color: 0x3a2f28 }), flagCols = ['#f6b8d0', '#9be0c0', '#f2e28a', '#8fc0f0', '#c9a6ff', '#ffb37a'];
  strings.forEach(([a, b], si) => {
    const len = a.distanceTo(b), sag = Math.min(0.7, len * 0.08), n = Math.max(6, Math.round(len / 0.5)), pts = [];
    for (let k = 0; k <= n; k++) { const u = k / n; pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0))); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
    for (let k = 1; k < n; k++) bulbs.push(pts[k].clone().add(new THREE.Vector3(0, -0.07, 0)));
    if (si >= fairy.length) { // bunting under the boardwalk strings
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (let k = 1; k < n; k += 1) { const tri = mesh(new THREE.ConeGeometry(0.12, 0.26, 3), mat(flagCols[(k + si) % flagCols.length]), pts[k].x, pts[k].y - 0.5, pts[k].z); tri.rotation.set(Math.PI, yaw, 0); tri.scale.z = 0.2; tri.castShadow = false; scene.add(tri); }
      const low = []; for (let k = 0; k <= n; k++) low.push(pts[k].clone().add(new THREE.Vector3(0, -0.38, 0)));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(low), cableMat));
    }
  });
  const bulbMats = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc861, emissiveIntensity: 0.15, roughness: 0.4 }));
  const bgeo = new THREE.SphereGeometry(0.06, 6, 4), m4 = new THREE.Matrix4();
  bulbMats.forEach((m, s) => { const mine = bulbs.filter((_, i) => i % 3 === s); const inst = new THREE.InstancedMesh(bgeo, m, Math.max(1, mine.length)); mine.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); inst.count = mine.length; inst.castShadow = false; scene.add(inst); });
  const bulbGlow = new THREE.PointsMaterial({ map: glowTex, size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd98a });
  const glowPts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(bulbs), bulbGlow); glowPts.frustumCulled = false; scene.add(glowPts);
  // paper lanterns on poles
  for (const p of FEST.lanternPoles) {
    const y = H(p.x, p.z), g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = p.yaw; scene.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.0, 6), M.woodDark, 0, 1.5, 0));
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), M.woodDark, 0, 2.9, 0));
    for (const [lx, c] of [[-0.55, '#ff8a5a'], [0.55, '#f29ab8']]) {
      g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 3), M.woodDark, lx, 2.75, 0));
      const l = mesh(new THREE.SphereGeometry(0.2, 10, 8), paperLantern(c), lx, 2.45, 0); l.scale.y = 1.25; l.castShadow = false; g.add(l);
      g.updateMatrixWorld(true); const w = g.localToWorld(new THREE.Vector3(lx, 2.45, 0)); glowSprite(w.x, w.y, w.z, 1.6, 0xffc890);
    }
    colliders.push({ x: p.x, z: p.z, r: 0.12 }); avoid.push({ x: p.x, z: p.z, r: 0.8 });
  }
  // benches with a bin beside each, facing the boardwalk
  for (const p of FEST.benches) {
    const y = H(p.x, p.z), bn = makeBench(); bn.position.set(p.x, y, p.z); bn.rotation.y = p.yaw; scene.add(bn); festBenches.push(bn);
    const bx = p.x + p.dx * 1.3, bz = p.z + p.dz * 1.3, bin = new THREE.Group(); bin.position.set(bx, H(bx, bz), bz); scene.add(bin);
    bin.add(mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.7, 10), mat('#6fb8a8'), 0, 0.35, 0));
    bin.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 10), mat('#4f9f90'), 0, 0.72, 0));
    colliders.push({ x: p.x, z: p.z, r: 0.75 }, { x: bx, z: bz, r: 0.3 }); avoid.push({ x: p.x, z: p.z, r: 1.6 }, { x: bx, z: bz, r: 0.8 });
  }
  // a small stage: a low plank platform with a striped backdrop and two little lights
  {
    const p = FEST.stage, y = H(p.x, p.z), g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = p.yaw; scene.add(g);
    g.add(mesh(new THREE.BoxGeometry(4, 0.45, 3), M.wood, 0, 0.22, 0));
    for (let k = -1.5; k <= 1.5; k += 0.5) { const s = mesh(new THREE.BoxGeometry(0.03, 0.01, 3), M.woodDark, k, 0.455, 0); s.castShadow = false; g.add(s); }
    for (let k = 0; k < 8; k++) g.add(mesh(new THREE.BoxGeometry(0.5, 2.2, 0.06), k % 2 ? M.white : mat('#5fb4e0'), -1.75 + k * 0.5, 1.55, -1.45));
    for (const x of [-1.9, 1.9]) { g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), M.woodDark, x, 1.4, -1.45)); g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), M.lantern, x, 2.85, -1.45)); g.updateMatrixWorld(true); const w = g.localToWorld(new THREE.Vector3(x, 2.85, -1.45)); glowSprite(w.x, w.y, w.z, 1.5); }
    colliders.push({ x: p.x, z: p.z, r: 1.9 }); avoid.push({ x: p.x, z: p.z, r: 3.2 });
  }
  // beach props: surfboards standing in the sand, two more parasols. The volleyball net that stood here is now the
  // playable court a little to the south (built after the scenery, see the volleyball section); these placeholders keep
  // the scenery laid out exactly as before and are taken away again once it's placed.
  {
    const v = F.volley;
    for (const x of [-2.6, 2.6]) colliders.push({ x: v.x + x, z: v.z, r: 0.12, oldNet: true });
    avoid.push({ x: v.x, z: v.z, r: 4 });
  }
  F.surf.forEach(([x, z], i) => {
    const b = mesh(new THREE.CapsuleGeometry(0.22, 1.5, 3, 8), mat(['#f2c94c', '#5fb4e0', '#f29ab8'][i % 3]), x, H(x, z) + 0.9, z);
    b.scale.z = 0.22; b.rotation.set(0, 0.3 + i * 0.25, (i - 1) * 0.12); scene.add(b);
    colliders.push({ x, z, r: 0.25 }); avoid.push({ x, z, r: 0.9 });
  });
  for (const [x, z] of F.parasols) {
    const g = new THREE.Group(); g.position.set(x, H(x, z), z); scene.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5), M.white, 0, 1.15, 0));
    const geo = new THREE.ConeGeometry(1.2, 0.45, 8, 1, true); geo.clearGroups(); for (let i = 0; i < 8; i++) geo.addGroup(i * 6, 6, i % 2);
    const top = new THREE.Mesh(geo, [mat('#ffb37a', { side: THREE.DoubleSide }), mat('#fbf0dc', { side: THREE.DoubleSide })]); top.position.y = 2.3; top.castShadow = true; g.add(top); parasolTops.push(top);
    colliders.push({ x, z, r: 0.12 }); avoid.push({ x, z, r: 1.6 });
  }
  // every frame: the bulbs twinkle and the paper lanterns glow at dusk and night
  return function update(time) {
    const on = cur.lamp;
    bulbMats.forEach((m, s) => { m.emissiveIntensity = 0.15 + on * (1.8 + 0.5 * Math.sin(time * (1.6 + s * 0.5) + s * 2.3)); });
    bulbGlow.opacity = on * (0.75 + 0.15 * Math.sin(time * 2.1));
    for (const m of lanternMats) m.emissiveIntensity = 0.2 + on * 1.4;
  };
})();
// ---------------------------------------------------------------- the seaside restaurant on stilts
// An open-air seafood restaurant standing half on the sand and half over the shallows, its open dining deck facing the
// sea: the kitchen at the back (land side), a wide walkway up from the beach, six tables whose chairs all look out to
// sea, a stage at the sea end for the fire show, and a little pier at the side with a fishing boat. Local +z points out
// to sea, -z back to the beach. Nothing here uses the world's random numbers; nothing is saved.
const RESTO = LAYOUT.beach.restaurant;
const restaurant = (() => {
  const RY = RESTO.face, FY = 1.25; // the deck's walking height (sand at the back is about 0.3)
  const ax = new THREE.Vector3(Math.cos(RY), 0, -Math.sin(RY)), az = new THREE.Vector3(Math.sin(RY), 0, Math.cos(RY));
  const W = (lx, lz) => ({ x: RESTO.x + ax.x * lx + az.x * lz, z: RESTO.z + ax.z * lx + az.z * lz });
  const g = new THREE.Group(); g.position.set(RESTO.x, 0, RESTO.z); g.rotation.y = RY; scene.add(g);
  const plank = mat('#c9a06e'), plankDark = mat('#a8774c'), post = mat('#8a6040'), cream = M.cream;
  const HX = 6, HZ = 7; // half the deck's width and length
  const deckIds = [];
  // ---- stilts and the deck
  for (let x = -5.8; x <= 5.81; x += 2.9) for (let z = -6.8; z <= 6.81; z += 3.4) {
    const w = W(x, z), gh = Math.min(H(w.x, w.z), FY - 0.3), len = FY - gh;
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, len, 6), post, x, gh + len / 2 - 0.08, z));
  }
  const floor = mesh(new THREE.BoxGeometry(HX * 2, 0.16, HZ * 2), plank, 0, FY - 0.08, 0); floor.receiveShadow = true; g.add(floor);
  for (let x = -HX + 0.6; x < HX; x += 0.6) { const s = mesh(new THREE.BoxGeometry(0.03, 0.01, HZ * 2), plankDark, x, FY + 0.005, 0); s.castShadow = false; g.add(s); }
  { const a = W(0, -HZ), b = W(0, HZ); deckIds.push(addDeck(a.x, a.z, b.x, b.z, FY, FY, HX)); }
  const floorDeck = deckIds[0];
  // ---- the wide walkway up from the beach (at the back corner, beside the kitchen)
  const WALK = { x: -4.5, z0: -HZ + 0.1, z1: -12.6, hw: 1.3 };
  const wt = W(WALK.x, WALK.z0), wb = W(WALK.x, WALK.z1), wgy = H(wb.x, wb.z);
  const walkDeck = addDeck(wt.x, wt.z, wb.x, wb.z, FY, wgy, WALK.hw); deckIds.push(walkDeck);
  { const inF = W(WALK.x, -HZ + 0.5), out = W(WALK.x, WALK.z1 - 0.6); LINKS.push({ a: floorDeck, b: walkDeck, x: inF.x, z: inF.z }, { a: walkDeck, b: -1, x: out.x, z: out.z }); }
  {
    const n = 18, len = WALK.z0 - WALK.z1;
    for (let k = 0; k < n; k++) { const u = (k + 0.5) / n, z = WALK.z0 - u * len, w = W(WALK.x, z), y = lerp(FY, wgy, u); g.add(mesh(new THREE.BoxGeometry(WALK.hw * 2, 0.09, len / n + 0.02), k % 3 ? plank : plankDark, WALK.x, y - 0.045, z)); if (k % 4 === 1) { const gh = H(w.x, w.z); if (y - gh > 0.2) for (const sx of [-1.1, 1.1]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, y - gh, 5), post, WALK.x + sx, gh + (y - gh) / 2, z)); } }
    for (const sx of [-WALK.hw, WALK.hw]) { // railings both sides
      g.add(rodBetween(new THREE.Vector3(WALK.x + sx, FY + 0.85, WALK.z0), new THREE.Vector3(WALK.x + sx, wgy + 0.85, WALK.z1), 0.04, post));
      for (let k = 0; k <= 4; k++) { const u = k / 4, z = WALK.z0 - u * len; g.add(mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), post, WALK.x + sx, lerp(FY, wgy, u) + 0.42, z)); }
    }
  }
  // ---- the side pier with a little fishing boat
  const PIER = { z: 4.2, x0: -HX + 0.1, x1: -10.8, hw: 0.9 };
  { const a = W(PIER.x0, PIER.z), b = W(PIER.x1, PIER.z); deckIds.push(addDeck(a.x, a.z, b.x, b.z, FY, FY, PIER.hw)); const inF = W(-HX + 0.5, PIER.z); LINKS.push({ a: floorDeck, b: deckIds[2], x: inF.x, z: inF.z }); }
  for (let x = PIER.x0 - 0.2; x > PIER.x1; x -= 0.4) g.add(mesh(new THREE.BoxGeometry(0.36, 0.08, PIER.hw * 2), plank, x, FY - 0.04, PIER.z));
  for (let x = -7.5; x >= PIER.x1; x -= 1.6) for (const sz of [-0.8, 0.8]) { const w = W(x, PIER.z + sz), gh = H(w.x, w.z); g.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, FY - gh + 0.4, 5), post, x, (FY + gh + 0.4) / 2 - 0.08, PIER.z + sz)); }
  const boat = new THREE.Group(); boat.position.set(-8.8, 0.05, PIER.z + 1.8); boat.rotation.y = Math.PI / 2; g.add(boat);
  { // a little fishing boat: sea-green stripe, a mast with a red sail furled, a basket of net
    const fb = makeCuteBoat({ L: 3.2, W: 0.72, stripe: '#4fb89a', bottom: '#9be0c0', rail: '#e0584a', fenders: '#fbf0dc', flag: '#f6d55c', seats: [{ t: 0.55, w: 0.9, c: '#f6d55c' }] });
    mooredBoats.push(fb); boat.add(fb.g);
    boat.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), post, 0, fb.deckY(0.7) + 0.8, fb.zAt(0.7) - 0.2));
    boat.add(mesh(new THREE.BoxGeometry(0.05, 0.8, 0.6), mat('#e0584a'), 0, fb.deckY(0.7) + 1.1, fb.zAt(0.7) + 0.05));
    const net2 = mesh(new THREE.SphereGeometry(0.3, 8, 6), mat('#e8c76a'), 0.15, fb.deckY(0.25) + 0.1, fb.zAt(0.25)); net2.scale.y = 0.4; boat.add(net2); }
  // ---- railings round the deck (gaps where the walkway and the pier join)
  const gapAt = [[WALK.x, -HZ, 1.6], [-HX, PIER.z, 1.2]];
  const railM = post;
  const edges = [[[-HX, -HZ], [HX, -HZ]], [[HX, -HZ], [HX, HZ]], [[HX, HZ], [-HX, HZ]], [[-HX, HZ], [-HX, -HZ]]];
  for (const [[ax0, az0], [bx0, bz0]] of edges) {
    const n = Math.round(Math.hypot(bx0 - ax0, bz0 - az0) / 0.7);
    for (let k = 0; k < n; k++) {
      const u0 = k / n, u1 = (k + 1) / n, mx = lerp(ax0, bx0, (u0 + u1) / 2), mz = lerp(az0, bz0, (u0 + u1) / 2);
      if (gapAt.some(([gx, gz, r]) => Math.hypot(mx - gx, mz - gz) < r)) continue;
      const x0 = lerp(ax0, bx0, u0), z0 = lerp(az0, bz0, u0), x1 = lerp(ax0, bx0, u1), z1 = lerp(az0, bz0, u1);
      g.add(rodBetween(new THREE.Vector3(x0, FY + 0.85, z0), new THREE.Vector3(x1, FY + 0.85, z1), 0.035, railM));
      g.add(rodBetween(new THREE.Vector3(x0, FY + 0.45, z0), new THREE.Vector3(x1, FY + 0.45, z1), 0.025, railM));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), railM, x0, FY + 0.42, z0));
    }
  }
  for (const side of [-PIER.hw, PIER.hw]) g.add(rodBetween(new THREE.Vector3(PIER.x0 - 0.3, FY + 0.85, PIER.z + side), new THREE.Vector3(PIER.x1, FY + 0.85, PIER.z + side), 0.035, railM));
  g.add(rodBetween(new THREE.Vector3(PIER.x1, FY + 0.85, PIER.z - PIER.hw), new THREE.Vector3(PIER.x1, FY + 0.85, PIER.z + PIER.hw), 0.035, railM));
  // ---- the big pitched tile roof on posts (it fades out while you're underneath)
  const roofMats = [];
  const tile = new THREE.MeshStandardMaterial({ color: 0xb5533c, roughness: 0.75, flatShading: true, transparent: true, opacity: 1 }); roofMats.push(tile);
  const tileDark = new THREE.MeshStandardMaterial({ color: 0x8e3b2a, roughness: 0.75, flatShading: true, transparent: true, opacity: 1 }); roofMats.push(tileDark);
  const roof = new THREE.Group(); g.add(roof);
  for (const s of [-1, 1]) {
    const plane = new THREE.Group(); plane.position.set(s * 3.25, FY + 3.55, 0); plane.rotation.z = -s * 0.3; roof.add(plane);
    plane.add(mesh(new THREE.BoxGeometry(6.9, 0.14, 15.4), tile, 0, 0, 0));
    for (let k = -3; k <= 3; k++) { const r2 = mesh(new THREE.BoxGeometry(0.08, 0.05, 15.4), tileDark, k * 0.95, 0.09, 0); r2.castShadow = false; plane.add(r2); }
  }
  roof.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 15.6), tileDark, 0, FY + 4.55, 0));
  for (const x of [-5.85, 5.85]) for (let z = -6.85; z <= 6.86; z += 3.425) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), post, x, FY + 1.3, z));
  for (const x of [-5.85, 5.85]) g.add(mesh(new THREE.BoxGeometry(0.18, 0.18, 14), post, x, FY + 2.6, 0)); // the eaves beams
  for (let z = -6.85; z <= 6.86; z += 3.425) g.add(mesh(new THREE.BoxGeometry(11.9, 0.12, 0.12), post, 0, FY + 2.6, z)); // cross beams
  // ---- the kitchen at the back: a counter with a fish tank and a seafood display, shelves, picture signs
  g.add(mesh(new THREE.BoxGeometry(5, 1.0, 0.7), mat('#d9a873'), 2.5, FY + 0.5, -5.6));
  g.add(mesh(new THREE.BoxGeometry(5.2, 0.08, 0.85), plankDark, 2.5, FY + 1.04, -5.6));
  g.add(mesh(new THREE.BoxGeometry(5.2, 1.9, 0.12), cream, 2.5, FY + 0.95, -6.9)); // the back wall
  for (const y of [1.35, 1.75]) g.add(mesh(new THREE.BoxGeometry(4.6, 0.06, 0.3), plankDark, 2.5, FY + y, -6.75));
  ['#e0584a', '#f2c94c', '#6fd3d0', '#9aa2ad', '#e0584a'].forEach((c, i) => g.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 8), mat(c), 0.8 + i * 0.85, FY + 1.48, -6.75)));
  const tankFish = [];
  { // a cute fish tank: glass, water, a little plant, three tiny fish swimming round
    const tank = new THREE.Group(); tank.position.set(0.7, FY + 1.08, -5.6); g.add(tank);
    tank.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.35, roughness: 0.1 })).translateY(0.3));
    tank.add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.46, 0.46), new THREE.MeshStandardMaterial({ color: 0x4fc3e0, transparent: true, opacity: 0.35 })).translateY(0.25));
    tank.add(mesh(new THREE.BoxGeometry(1.0, 0.04, 0.5), mat('#e9e0b8'), 0, 0.02, 0));
    for (const x of [-0.3, 0.32]) tank.add(mesh(new THREE.ConeGeometry(0.04, 0.3, 4), mat('#5cbf7a'), x, 0.17, -0.1));
    ['#ff8a3a', '#f6d55c', '#ff8fb8'].forEach((c, i) => { const f = mesh(new THREE.OctahedronGeometry(0.05, 0), mat(c), 0, 0.3, 0); f.scale.set(0.6, 0.7, 1.6); tank.add(f); tankFish.push({ f, ph: i * 2.1 }); });
  }
  { // the seafood display: fish, a crab and prawns on ice
    const tray = new THREE.Group(); tray.position.set(3.0, FY + 1.1, -5.55); g.add(tray);
    tray.add(mesh(new THREE.BoxGeometry(1.6, 0.08, 0.6), M.white, 0, 0, 0));
    for (const x of [-0.5, -0.15]) { const f = mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#9fb7c9'), x, 0.08, 0); f.scale.set(0.6, 0.5, 1.8); f.rotation.y = 1.4; tray.add(f); }
    const crab = mesh(new THREE.SphereGeometry(0.14, 8, 6), mat('#ef6a4a'), 0.25, 0.09, 0); crab.scale.y = 0.55; tray.add(crab);
    for (const x of [0.55, 0.68]) { const pr = mesh(new THREE.TorusGeometry(0.07, 0.03, 5, 8, Math.PI * 1.3), mat('#ff9f7a'), x, 0.08, 0); pr.rotation.x = Math.PI / 2; tray.add(pr); }
  }
  const signPic = (emoji, bg) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = bg; if (x.beginPath) { x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fill(); } x.font = '76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 64, 70); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  [['🦀', '#ffe3dc'], ['🦐', '#fff0d8'], ['🐟', '#dff3ff'], ['🍜', '#fff6d0']].forEach(([e, bg], i) => {
    const x = 0.6 + i * 1.3, board = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 18), M.wood, x, FY + 2.15, -6.8); board.rotation.x = Math.PI / 2; g.add(board);
    const pic = flatPic(signPic(e, bg), 0.62, 0.62); pic.position.set(x, FY + 2.15, -6.76); g.add(pic);
  });
  // ---- six tables, each with four chairs that all look out to sea; tablecloths, plates, cups, chopsticks, a lantern
  const clothCols = ['#f6b8d0', '#9be0c0', '#fff27a', '#8fc0f0', '#ffb37a', '#c9a6ff'];
  const tables = [];
  const tableLamps = [];
  const CHAIRS = [[-0.45, -0.85, 0], [0.45, -0.85, 0], [-1.0, 0.1, 0.64], [1.0, 0.1, -0.64]]; // [x, z, yaw] around a table
  [-3.6, 0, 3.6].forEach((tx) => [-1.6, 2.2].forEach((tz) => tables.push([tx, tz])));
  tables.forEach(([tx, tz], ti) => {
    const t = new THREE.Group(); t.position.set(tx, FY, tz); g.add(t);
    t.add(mesh(new THREE.BoxGeometry(1.3, 0.07, 0.9), M.wood, 0, 0.74, 0));
    t.add(mesh(new THREE.BoxGeometry(1.36, 0.02, 0.96), mat(clothCols[ti]), 0, 0.785, 0));
    for (const [lx, lz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) t.add(mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), plankDark, lx, 0.36, lz));
    for (const [cx, cz] of CHAIRS) { // a plate, a cup and a pair of chopsticks in front of every chair
      const px = cx * 0.42, pz = Math.max(-0.3, Math.min(0.3, cz * 0.5));
      t.add(mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.02, 12), M.white, px, 0.805, pz));
      t.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 8), mat('#bfe6ff'), px + 0.15, 0.83, pz));
      for (const o of [-0.012, 0.012]) t.add(mesh(new THREE.BoxGeometry(0.008, 0.008, 0.2), plankDark, px - 0.14 + o, 0.8, pz));
    }
    const lampM = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffc35a, emissiveIntensity: 0.1, roughness: 0.5 }); tableLamps.push(lampM);
    t.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 8), lampM, 0, 0.87, 0));
    t.add(mesh(new THREE.ConeGeometry(0.08, 0.06, 8), plankDark, 0, 0.97, 0));
    const tw = W(tx, tz); colliders.push({ x: tw.x, z: tw.z, r: 0.75, lvl: 'd' });
    // chairs: each one a seat spot, like the plaza benches (sit with its floating circle, stand by tapping the ground)
    for (const [cx, cz, cyaw] of CHAIRS) {
      const w = W(tx + cx, tz + cz), ch = new THREE.Group();
      ch.position.set(w.x, FY, w.z); ch.rotation.y = RY + cyaw; scene.add(ch);
      ch.add(mesh(new THREE.BoxGeometry(0.46, 0.06, 0.44), M.wood, 0, 0.45, 0));
      ch.add(mesh(new THREE.BoxGeometry(0.46, 0.4, 0.05), M.wood, 0, 0.68, -0.21));
      for (const [lx, lz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) ch.add(mesh(new THREE.BoxGeometry(0.045, 0.45, 0.045), plankDark, lx, 0.22, lz));
      seatSpots.push({ id: seatSpots.length, kind: 'chair', holder: ch, frame: ch, local: new THREE.Vector3(0, SEAT_TOP, 0.04) });
    }
  });
  // ---- the stage at the sea end, facing the tables, with lights
  g.add(mesh(new THREE.BoxGeometry(5, 0.25, 2.1), mat('#d9a873'), 0, FY + 0.12, 5.85));
  g.add(mesh(new THREE.BoxGeometry(5.1, 0.06, 2.2), mat('#e0584a'), 0, FY + 0.27, 5.85));
  for (const x of [-2.4, 2.4]) { g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), post, x, FY + 1.35, 6.8)); }
  // ---- lights: string lights along the eaves and across under the roof, paper lanterns over each table, fairy lights
  //      along the sea-end railing
  const lanternMats = [];
  const glowSprite = (x, y, z, s, color = 0xffffff) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp.position.set(x, y, z); sp.scale.set(s, s, 1); scene.add(sp); lampData.push({ pos: sp.position.clone(), light: null, glow: sp }); return sp; };
  const lanternCols = ['#ff8a5a', '#f29ab8', '#f6d55c', '#ff6a6a', '#ffb37a', '#c9a6ff'];
  tables.forEach(([tx, tz], i) => {
    const m = new THREE.MeshStandardMaterial({ color: lanternCols[i], emissive: new THREE.Color(lanternCols[i]), emissiveIntensity: 0.15, roughness: 0.6 }); lanternMats.push(m);
    g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 3), post, tx, FY + 2.33, tz));
    const l = mesh(new THREE.SphereGeometry(0.22, 10, 8), m, tx, FY + 1.95, tz); l.scale.y = 1.25; l.castShadow = false; g.add(l);
    for (const cy of [0.27, -0.27]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8), post, tx, FY + 1.95 + cy, tz));
    const w = W(tx, tz); glowSprite(w.x, FY + 1.95, w.z, 2.2, 0xffc890);
  });
  const bulbs = [];
  const string = (a, b, sag, step = 0.45) => { const n = Math.max(4, Math.round(a.distanceTo(b) / step)), pts = []; for (let k = 0; k <= n; k++) { const u = k / n; pts.push(new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0))); } scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a2f28 }))); for (let k = 1; k < n; k++) bulbs.push(pts[k].clone().add(new THREE.Vector3(0, -0.06, 0))); };
  const V3 = (lx, y, lz) => { const w = W(lx, lz); return new THREE.Vector3(w.x, y, w.z); };
  for (const x of [-5.85, 5.85]) for (let z = -6.85; z < 6.8; z += 3.425) string(V3(x, FY + 2.5, z), V3(x, FY + 2.5, z + 3.425), 0.25);
  for (let z = -3.425; z <= 3.43; z += 3.425) string(V3(-5.85, FY + 2.5, z), V3(5.85, FY + 2.5, z), 0.45);
  string(V3(-HX, FY + 0.9, HZ), V3(HX, FY + 0.9, HZ), 0.05, 0.35); // fairy lights on the sea-end railing
  string(V3(-HX, FY + 0.9, -HZ + 0.1), V3(WALK.x - 1.7, FY + 0.9, -HZ + 0.1), 0.03, 0.35);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffc861, emissiveIntensity: 0.15, roughness: 0.4 });
  { const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), bulbMat, bulbs.length), m4 = new THREE.Matrix4(); bulbs.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z))); inst.castShadow = false; scene.add(inst); }
  const bulbGlow = new THREE.PointsMaterial({ map: glowTex, size: 0.45, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd98a });
  { const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(bulbs), bulbGlow); pts.frustumCulled = false; scene.add(pts); }
  // ---- what's solid up on the deck, what's out of bounds on the sand underneath, and where nothing else may grow
  for (let x = 0.4; x <= 4.7; x += 0.8) { const w = W(x, -5.6); colliders.push({ x: w.x, z: w.z, r: 0.45, lvl: 'd' }); }
  for (let x = 0.4; x <= 4.7; x += 1.1) { const w = W(x, -6.8); colliders.push({ x: w.x, z: w.z, r: 0.4, lvl: 'd' }); }
  for (const x of [-1.9, 0, 1.9]) { const w = W(x, 5.85); colliders.push({ x: w.x, z: w.z, r: 0.95, lvl: 'd' }); } // the stage
  for (const x of [-5.85, 5.85]) for (let z = -6.85; z <= 6.86; z += 3.425) { const w = W(x, z); colliders.push({ x: w.x, z: w.z, r: 0.12, lvl: 'd' }); }
  for (let x = -5; x <= 5.01; x += 2) for (let z = -6; z <= 6.01; z += 2) { const w = W(x, z); if (H(w.x, w.z) > -0.45) colliders.push({ x: w.x, z: w.z, r: 1.3, lvl: 'g' }); }
  for (let u = 0; u <= 0.6; u += 0.15) { const w = W(WALK.x, WALK.z0 - u * (WALK.z0 - WALK.z1)); colliders.push({ x: w.x, z: w.z, r: 1.0, lvl: 'g' }); }
  for (let x = -6; x <= 6; x += 3) for (let z = -7; z <= 7; z += 3.5) { const w = W(x, z); avoid.push({ x: w.x, z: w.z, r: 3 }); }
  for (let u = 0; u <= 1.2; u += 0.25) { const w = W(WALK.x, WALK.z0 - u * (WALK.z0 - WALK.z1)); avoid.push({ x: w.x, z: w.z, r: 3.3 }); } // the walkway and the open sand in front of it
  for (let x = PIER.x0; x >= PIER.x1 - 2; x -= 1.5) { const w = W(x, PIER.z + 1); avoid.push({ x: w.x, z: w.z, r: 2.6 }); }
  // tap targets over the restaurant's decks
  const clickM = new THREE.MeshBasicMaterial({ visible: false });
  for (const i of deckIds) {
    const d = DECKS[i], m = new THREE.Mesh(new THREE.BoxGeometry(d.hw * 2, 0.1, d.len), clickM);
    m.position.set((d.ax + d.bx) / 2, (d.ya + d.yb) / 2, (d.az + d.bz) / 2);
    m.rotation.set(0, Math.atan2(d.bx - d.ax, d.bz - d.az), 0); m.rotateX(Math.atan2(d.ya - d.yb, d.len));
    m.userData.deck = i; scene.add(m); deckClicks.push(m);
  }
  // ---- the staff: a waiter by the entrance, a cook behind the counter
  Object.assign(SHOPKEEPERS, {
    waiter: { name: 'Mei', tag: '#f29ab8', skin: '#f5c9a8', hair: '#2b211c', top: '#fffaf0', bottom: '#3a3f5a', longHair: true, dress(n) { // a bow tie, an apron and a tray of drinks
      for (const s of [-1, 1]) { const bow = mesh(new THREE.ConeGeometry(0.05, 0.1, 4), n.soft('#e0584a'), s * 0.05, 0.48, 0.2); bow.rotation.z = s * Math.PI / 2; n.body.add(bow); }
      n.body.add(mesh(new THREE.BoxGeometry(0.34, 0.32, 0.05), n.soft('#f29ab8'), 0, 0.08, 0.21));
      const tray = new THREE.Group(); tray.position.set(0, 0.02, 0.15); n.handL.add(tray);
      tray.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 14), n.soft('#c0c6cf'), 0, 0, 0));
      for (const [x, c] of [[-0.07, '#ffb37a'], [0.08, '#9be0c0']]) tray.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8), n.soft(c), x, 0.07, 0));
      n.props = [];
    } },
    cook: { name: 'Bakar', tag: '#ffb37a', skin: '#d9a07a', hair: '#2b211c', top: '#fffaf0', bottom: '#5d6a7a', dress(n) { // a tall chef's hat and a ladle
      n.head.add(mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.3, 12), n.soft('#ffffff'), 0, 0.42, 0));
      n.head.add(mesh(new THREE.SphereGeometry(0.27, 12, 8), n.soft('#ffffff'), 0, 0.6, 0));
      n.body.add(mesh(new THREE.BoxGeometry(0.36, 0.36, 0.05), n.soft('#ffffff'), 0, 0.12, 0.21));
      const ladle = new THREE.Group(); ladle.position.set(0, -0.04, 0.04); n.handR.add(ladle);
      const sh = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5), n.soft('#9aa2ad'), 0, 0, 0.14); sh.rotation.x = Math.PI / 2; ladle.add(sh);
      ladle.add(mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, TAU, Math.PI / 2, Math.PI / 2), n.soft('#9aa2ad'), 0, 0, 0.32));
      n.props = [];
    } },
  });
  for (const [kind, lx, lz, yaw] of [['waiter', -2.2, -4.7, 0], ['cook', 2.5, -6.35, 0]]) {
    const spec = SHOPKEEPERS[kind], n = makeTownNpc(spec); spec.dress(n);
    const w = W(lx, lz); n.g.position.set(w.x, FY + 0.02, w.z); n.baseYaw = RY + yaw; n.g.rotation.y = n.baseYaw; n.kind = kind; n.ph = lx * 1.7;
    scene.add(n.g); colliders.push({ x: w.x, z: w.z, r: 0.4, lvl: 'd' }); shopkeepers.push(n);
  }
  // ---- the fire show: Api, a performer on the stage. Every 10 minutes (by the shared clock, the same on every screen)
  //      a 60 second show with fire poi, then a fire baton, then a fire fan; between shows at dusk and night a short
  //      twirl now and then. The fire is just glowing orange particles and soft light.
  const api = makeTownNpc({ name: 'Api', tag: '#ff8a3a', skin: '#e8b48c', hair: '#c0402a', top: '#ff8a3a', bottom: '#e0584a', shoes: '#3a2a22' });
  api.head.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), api.soft('#ffcf4a'), 0, 0.33, 0.05)); // a flame-shaped tuft
  api.head.add(mesh(new THREE.ConeGeometry(0.1, 0.25, 6), api.soft('#ff8a3a'), 0, 0.45, 0.05));
  const sash = mesh(new THREE.TorusGeometry(0.245, 0.035, 6, 14), api.soft('#ffcf4a'), 0, 0.05, 0); sash.rotation.x = Math.PI / 2; api.body.add(sash);
  const apiAt = W(0, 5.85); api.g.position.set(apiAt.x, FY + 0.28, apiAt.z); api.g.rotation.y = RY + Math.PI; scene.add(api.g); // facing the tables
  const propM = mat('#5a4632'), headM = new THREE.MeshBasicMaterial({ color: 0xffb040 });
  const poi = [0, 1].map(() => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), headM); api.g.add(b); return b; });
  const poiChain = [0, 1].map(() => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 3), propM); api.g.add(c); return c; });
  const baton = new THREE.Group(); api.g.add(baton);
  baton.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), propM, 0, 0, 0));
  const batonEnds = [0.55, -0.55].map((y) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), headM); e.position.y = y; baton.add(e); return e; });
  const fan = new THREE.Group(); api.g.add(fan);
  const fanTips = [];
  for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; const rib = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 4), propM, Math.sin(a) * 0.22, Math.cos(a) * 0.22, 0); rib.rotation.z = -a; fan.add(rib); const tip = new THREE.Object3D(); tip.position.set(Math.sin(a) * 0.46, Math.cos(a) * 0.46, 0); fan.add(tip); fanTips.push(tip); }
  fan.add(new THREE.Mesh(new THREE.CircleGeometry(0.42, 10, Math.PI / 2 - 1.0, 2.0), new THREE.MeshStandardMaterial({ color: 0xffcf4a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })));
  // particles: one small pool of glowing points, each with a short life
  const NP = 220, ppos = new Float32Array(NP * 3), pcol = new Float32Array(NP * 3), pvel = new Float32Array(NP * 3), plife = new Float32Array(NP);
  const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pgeo.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const sparks = new THREE.Points(pgeo, new THREE.PointsMaterial({ map: glowTex, size: 0.32, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; scene.add(sparks);
  let pnext = 0;
  const emit = (p, n) => { for (let k = 0; k < n; k++) { const i = pnext; pnext = (pnext + 1) % NP; ppos[i * 3] = p.x; ppos[i * 3 + 1] = p.y; ppos[i * 3 + 2] = p.z; pvel[i * 3] = (Math.random() - 0.5) * 0.4; pvel[i * 3 + 1] = 0.5 + Math.random() * 0.6; pvel[i * 3 + 2] = (Math.random() - 0.5) * 0.4; plife[i] = 0.45 + Math.random() * 0.25; } };
  const flameGlows = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a40, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.set(0.9, 0.9, 1); scene.add(s); return s; });
  const stageLight = new THREE.PointLight(0xff9a40, 0, 16, 1.6); { const w = W(0, 5.2); stageLight.position.set(w.x, FY + 1.6, w.z); } scene.add(stageLight);
  const warmPool = new THREE.Mesh(new THREE.CircleGeometry(5, 24), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9a40, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  warmPool.rotation.x = -Math.PI / 2; { const w = W(0, 9.5); warmPool.position.set(w.x, 0.14, w.z); } scene.add(warmPool); // warm light on the water in front of the stage
  const SHOW = { every: 600000, len: 60000, warn: 15000 };
  const banner = document.getElementById('fireBanner');
  const _e = new THREE.Vector3(), _w = new THREE.Vector3();
  // ---- the sandcastle, near the waterline on the north beach
  {
    const S = LAYOUT.beach.sandcastle, sand = mat('#ead39a'), sandDark = mat('#d9bd7f'), y = H(S.x, S.z), sc = new THREE.Group();
    sc.position.set(S.x, y, S.z); sc.rotation.y = S.face; scene.add(sc);
    const moat = mesh(new THREE.TorusGeometry(1.05, 0.09, 4, 24), mat('#c9a96e'), 0, 0.01, 0); moat.rotation.x = Math.PI / 2; moat.scale.z = 0.4; moat.castShadow = false; sc.add(moat);
    sc.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.25, 12), sand, 0, 0.12, 0));
    sc.add(mesh(new THREE.BoxGeometry(0.9, 0.42, 0.7), sand, 0, 0.45, -0.05));
    for (let i = 0; i < 4; i++) sc.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), sand, -0.36 + i * 0.24, 0.72, 0.28));
    sc.add(mesh(new THREE.BoxGeometry(0.26, 0.28, 0.04), mat('#8a6a4a'), 0, 0.38, 0.31)); // the gate
    for (const [x, z, round, h] of [[-0.55, 0.3, true, 0.75], [0.55, 0.3, true, 0.75], [-0.5, -0.4, false, 0.65], [0.5, -0.4, false, 0.65], [0, -0.2, true, 0.95]]) {
      if (round) { sc.add(mesh(new THREE.CylinderGeometry(0.16, 0.19, h, 10), sand, x, h / 2 + 0.2, z)); sc.add(mesh(new THREE.ConeGeometry(0.2, 0.22, 10), sandDark, x, h + 0.31, z)); }
      else { sc.add(mesh(new THREE.BoxGeometry(0.3, h, 0.3), sand, x, h / 2 + 0.2, z)); for (const [cx, cz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) sc.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), sand, x + cx, h + 0.24, z + cz)); }
      const top = round ? h + 0.42 : h + 0.28;
      sc.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 3), propM, x, top + 0.12, z));
      sc.add(mesh(new THREE.BoxGeometry(0.01, 0.07, 0.12), mat(['#f29ab8', '#5fb4e0', '#f6d55c'][Math.round((x + 1) * 3) % 3]), x, top + 0.2, z + 0.06));
    }
    for (const [x, z, c] of [[-0.95, 0.55, '#f6b8a8'], [0.9, 0.7, '#fff0d8'], [0.25, 0.95, '#f6b8d0']]) { const sh = mesh(new THREE.ConeGeometry(0.06, 0.08, 7), mat(c), x, 0.03, z); sh.rotation.x = -1.2; sc.add(sh); }
    const star = new THREE.Group(); star.position.set(-0.75, 0.02, 0.85); sc.add(star);
    for (let i = 0; i < 5; i++) { const arm = mesh(new THREE.ConeGeometry(0.03, 0.12, 4), mat('#ff8a5a'), Math.sin(i * 1.257) * 0.05, 0, Math.cos(i * 1.257) * 0.05); arm.rotation.set(Math.PI / 2, 0, 0); arm.rotation.y = i * 1.257; star.add(arm); }
    const shade = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.set(S.x + 0.15, y + 0.03, S.z + 0.1); shade.renderOrder = 1; scene.add(shade);
    colliders.push({ x: S.x, z: S.z, r: 1.05 }); avoid.push({ x: S.x, z: S.z, r: 2.2 });
  }
  // ---- every frame
  let roofFade = 1;
  return function update(dt, time) {
    const on = cur.lamp, now = nowMs();
    bulbMat.emissiveIntensity = 0.15 + on * (1.9 + 0.4 * Math.sin(time * 1.9));
    bulbGlow.opacity = on * (0.75 + 0.15 * Math.sin(time * 2.4));
    for (const m of lanternMats) m.emissiveIntensity = 0.2 + on * 1.4;
    for (const m of tableLamps) m.emissiveIntensity = 0.1 + on * (1.6 + 0.2 * Math.sin(time * 7));
    boat.position.y = 0.05 + Math.sin(time * 1.2) * 0.04; boat.rotation.z = Math.sin(time * 0.9) * 0.04;
    for (const f of tankFish) { const a = time * 0.8 + f.ph; f.f.position.set(Math.cos(a) * 0.32, 0.22 + Math.sin(time * 1.3 + f.ph) * 0.08, Math.sin(a) * 0.12); f.f.rotation.y = -a; }
    // the roof fades away while you're under it, so it never hides you
    const under = myRoom === null && (deckIds.includes(walk.deck) || (mySeat !== null && seatSpots[mySeat].kind === 'chair'));
    roofFade += ((under ? 0.15 : 1) - roofFade) * Math.min(1, dt * 5);
    for (const m of roofMats) { m.opacity = roofFade; m.depthWrite = roofFade > 0.95; }
    // the fire show
    const cyc = ((now % SHOW.every) + SHOW.every) % SHOW.every, inShow = cyc < SHOW.len, t = cyc / 1000;
    const idle = !inShow && on > 0.5 && (now / 1000) % 40 < 8; // a short twirl between shows at dusk and night
    const near = Math.hypot(player.position.x - RESTO.x, player.position.z - RESTO.z) < 70 && myRoom === null;
    if (banner) banner.classList.toggle('show', near && cyc > SHOW.every - SHOW.warn);
    const phase = inShow ? (t < 20 ? 'poi' : t < 40 ? 'baton' : 'fan') : idle ? 'poi' : null;
    poi.forEach((b, i) => { b.visible = phase === 'poi'; poiChain[i].visible = phase === 'poi'; });
    baton.visible = phase === 'baton'; fan.visible = phase === 'fan';
    const k = Math.min(1, dt * 8);
    api.body.position.y = 0.55 + (phase ? Math.abs(Math.sin(time * 4)) * 0.05 : Math.sin(time * 2) * 0.01);
    api.g.rotation.y = lerpAngle(api.g.rotation.y, RY + Math.PI + (inShow ? Math.sin(time * 0.8) * 0.6 + (t % 10 > 8.6 ? (t % 10 - 8.6) / 1.4 * TAU : 0) : 0), Math.min(1, dt * 6));
    api.head.rotation.y = phase ? 0 : Math.sin(time * 0.6) * 0.3;
    const emitters = [];
    if (phase === 'poi') { // two flaming balls whirling on short chains, one in each hand
      const sp = inShow ? 7 : 3.5;
      api.armL.rotation.z = lerp(api.armL.rotation.z, -1.1, k); api.armR.rotation.z = lerp(api.armR.rotation.z, 1.1, k);
      api.armL.rotation.x = lerp(api.armL.rotation.x, -0.6, k); api.armR.rotation.x = lerp(api.armR.rotation.x, -0.6, k);
      [-1, 1].forEach((s, i) => {
        const hx = s * 0.62, hy = 1.12, hz = 0.25, a = time * sp * (i ? 1 : -1) + i, r = 0.5;
        const bx = hx + Math.cos(a) * r * 0.3 * s, by = hy + Math.sin(a) * r, bz = hz + Math.cos(a) * r;
        poi[i].position.set(bx, by, bz);
        const c = poiChain[i]; c.position.set((hx + bx) / 2, (hy + by) / 2, (hz + bz) / 2);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _e.set(bx - hx, by - hy, bz - hz).normalize());
        api.g.localToWorld(_w.copy(poi[i].position)); emitters.push(_w.clone());
      });
    } else if (phase === 'baton') { // a baton with fire at both ends, spun in front and tossed up now and then
      api.armR.rotation.z = lerp(api.armR.rotation.z, 0.4, k); api.armR.rotation.x = lerp(api.armR.rotation.x, -1.3, k);
      api.armL.rotation.z = lerp(api.armL.rotation.z, -0.3 - Math.sin(time * 3) * 0.3, k); api.armL.rotation.x = lerp(api.armL.rotation.x, -0.5, k);
      const toss = t % 6 > 4.8 ? Math.sin((t % 6 - 4.8) / 1.2 * Math.PI) * 1.4 : 0;
      baton.position.set(0.25, 1.15 + toss, 0.45); baton.rotation.set(0, 0, time * 9);
      for (const e of batonEnds) emitters.push(e.getWorldPosition(new THREE.Vector3()));
    } else if (phase === 'fan') { // a fan with flaming tips, swept in slow arcs
      api.armR.rotation.z = lerp(api.armR.rotation.z, 1.6 + Math.sin(time * 2.2) * 0.8, k); api.armR.rotation.x = lerp(api.armR.rotation.x, -0.8, k);
      api.armL.rotation.z = lerp(api.armL.rotation.z, -0.8 + Math.sin(time * 2.2 + 1) * 0.5, k); api.armL.rotation.x = 0;
      fan.position.set(0.5 + Math.sin(time * 2.2) * 0.3, 1.35 + Math.sin(time * 2.2) * 0.35, 0.35); fan.rotation.set(0, 0, -Math.sin(time * 2.2) * 0.9);
      api.g.updateMatrixWorld(true);
      for (let i = 0; i < fanTips.length; i += 2) emitters.push(fanTips[i].getWorldPosition(new THREE.Vector3()));
    } else {
      api.armL.rotation.z = lerp(api.armL.rotation.z, -0.12, k); api.armR.rotation.z = lerp(api.armR.rotation.z, 0.12, k);
      api.armL.rotation.x = lerp(api.armL.rotation.x, 0, k); api.armR.rotation.x = lerp(api.armR.rotation.x, 0, k);
    }
    for (const e of emitters) emit(e, Math.max(1, Math.round(dt * (inShow ? 70 : 35))));
    flameGlows.forEach((s, i) => { const e = emitters[i]; s.material.opacity = e ? 0.55 + 0.35 * on : 0; if (e) s.position.copy(e); });
    for (let i = 0; i < NP; i++) {
      if (plife[i] <= 0) { pcol[i * 3] = pcol[i * 3 + 1] = pcol[i * 3 + 2] = 0; continue; }
      plife[i] -= dt; const l = Math.max(0, plife[i] / 0.6);
      ppos[i * 3] += pvel[i * 3] * dt; ppos[i * 3 + 1] += pvel[i * 3 + 1] * dt; ppos[i * 3 + 2] += pvel[i * 3 + 2] * dt;
      pcol[i * 3] = 1.0 * l; pcol[i * 3 + 1] = (0.35 + 0.4 * l) * l; pcol[i * 3 + 2] = 0.1 * l;
    }
    pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
    const glow = emitters.length ? (inShow ? 1 : 0.5) : 0;
    stageLight.intensity += ((glow * (3 + 6 * on)) - stageLight.intensity) * Math.min(1, dt * 4);
    warmPool.material.opacity += ((glow * (0.15 + 0.35 * on)) - warmPool.material.opacity) * Math.min(1, dt * 4);
  };
})();
// keep the island garden's lawn and the open front of the plaza free of trees
avoid.push({ x: LAYOUT.islandGarden.x, z: LAYOUT.islandGarden.z, r: 3.2 });
avoid.push({ x: TOWN.x, z: TOWN.z + PLAZA_R + 3, r: 3.5 });
const scenery = island.buildScenery({ scene, rr, rand: () => rand(), pick, mesh, mat, M, place, blocked, colliders, avoid, lampData, glowTex, makeAwning, makeBench, loop: LOOP, bridges });
const { palms, trees, swayers, grassTufts, lighthouse, sailboats } = scenery;
// the piano's glade: an 8 x 8 square round PIANO kept free of trees, bushes and props. Anything grown there is moved just
// outside it (away from the plaza side, so nothing stands between the piano and the walking traffic), except the one
// cherry tree behind the piano, which stays right beside it. Its trunk, shadow and collision move along with it.
{
  const inGlade = (x, z, pad = 0) => Math.abs(x - PIANO.x) < PIANO.clear + pad && Math.abs(z - PIANO.z) < PIANO.clear + pad;
  const fx = Math.sin(PIANO.face), fz = Math.cos(PIANO.face); // toward the plaza
  const front = (x, z) => (x - PIANO.x) * fx + (z - PIANO.z) * fz;
  const keep = trees.filter((t) => inGlade(t.position.x, t.position.z) && Math.hypot(t.position.x - PIANO.x, t.position.z - PIANO.z) > 3.6)
    .sort((a, b) => front(a.position.x, a.position.z) - front(b.position.x, b.position.z))[0]; // the one furthest behind
  const crown = (c) => (trees.some((t) => Math.hypot(t.position.x - c.x, t.position.z - c.z) < 0.05) ? 1.1 : 0); // a tree's crown spreads past its trunk
  const moving = colliders.filter((c) => !c.lvl && inGlade(c.x, c.z, c.r + crown(c)) && !(keep && Math.hypot(c.x - keep.position.x, c.z - keep.position.z) < 0.05));
  const free = (x, z, r, cr) => !inGlade(x, z, r + cr + 0.3) && front(x, z) < 1 && H(x, z) > 0.3 && Math.hypot(x - LAYOUT.rental.x, z - LAYOUT.rental.z) > 3.4
    && !pathSamples.some((p) => Math.hypot(p.x - x, p.z - z) < p.w + r + 0.5) && !colliders.some((o) => !moving.includes(o) && Math.hypot(o.x - x, o.z - z) < o.r + r + 0.5);
  for (const c of moving) {
    const cr = crown(c), objs = scene.children.filter((o) => Math.abs(o.position.x - c.x) < 0.06 && Math.abs(o.position.z - c.z) < 0.06);
    let to = null;
    for (let d = 0.5; d < 12 && !to; d += 0.25) for (let a = 0; a < TAU && !to; a += TAU / 32) {
      const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
      if (free(x, z, c.r, cr)) to = { x, z };
    }
    if (!to) { for (const o of objs) scene.remove(o); colliders.splice(colliders.indexOf(c), 1); continue; } // nowhere nearby: gone
    const dy = H(to.x, to.z) - H(c.x, c.z);
    for (const o of objs) { o.position.x += to.x - c.x; o.position.z += to.z - c.z; o.position.y += dy; }
    c.x = to.x; c.z = to.z; moving.splice(moving.indexOf(c), 1, { x: NaN, z: NaN }); // now an ordinary obstacle for the next one
  }
}
// the beach's seats: every pair of loungers under a parasol (left and right lounger, reclining, facing the sea) and
// the festival's two benches by the boardwalk, two spots each. Ids carry on after the restaurant's chairs (the
// server counts them the same way).
for (const pair of scenery.beach.loungers || []) {
  pair.g.updateMatrixWorld(true);
  pair.chairs.forEach((ch, i) => {
    const w = ch.getWorldPosition(new THREE.Vector3()), yaw = pair.g.rotation.y + ch.rotation.y;
    seatSpots.push({ id: seatSpots.length, kind: 'lounger', side: i ? 1 : -1, holder: { position: w, rotation: { y: yaw }, userData: {} }, frame: ch, local: new THREE.Vector3(0, 0.36, 0.05) });
  });
  parasolTops.push(pair.top);
}
for (const bn of festBenches) { // turned round to look out to sea
  let best = 99, seaA = bn.rotation.y;
  for (let a = 0; a < TAU; a += TAU / 48) for (let d = 1; d < Math.min(best, 40); d += 0.5) if (H(bn.position.x + Math.sin(a) * d, bn.position.z + Math.cos(a) * d) < 0) { if (d < best) { best = d; seaA = a; } break; }
  const clear = (a) => [-0.42, 0.42].every((lx) => { const x = bn.position.x + Math.cos(a) * lx + Math.sin(a) * 1.2, z = bn.position.z - Math.sin(a) * lx + Math.cos(a) * 1.2; return !colliders.some((c) => !c.lvl && Math.hypot(c.x - bn.position.x, c.z - bn.position.z) > 0.1 && Math.hypot(c.x - x, c.z - z) < (c.r || 0) + 0.3); });
  for (const off of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) if (clear(seaA + off)) { bn.rotation.y = seaA + off; break; } // with room to walk up to both seats
}
for (const bn of festBenches) for (const lx of [-0.42, 0.42]) seatSpots.push({ id: seatSpots.length, kind: 'bench', holder: bn, frame: bn, local: new THREE.Vector3(lx, SEAT_TOP, 0.04) });
// parasols fade out while they hide your character from the camera (each gets its own see-through materials)
const parasolFade = parasolTops.map((top) => {
  top.material = (Array.isArray(top.material) ? top.material : [top.material]).map((m) => { const c = m.clone(); c.transparent = true; return c; });
  top.updateWorldMatrix(true, false);
  return { top, at: top.getWorldPosition(new THREE.Vector3()), o: 1 };
});
const _pfA = new THREE.Vector3(), _pfB = new THREE.Vector3();
function updateParasolFade(dt) {
  _pfA.copy(camera.position); _pfB.copy(player.position); _pfB.y += 1.0;
  const dx = _pfB.x - _pfA.x, dy = _pfB.y - _pfA.y, dz = _pfB.z - _pfA.z, l2 = dx * dx + dy * dy + dz * dz || 1;
  for (const p of parasolFade) {
    const t = ((p.at.x - _pfA.x) * dx + (p.at.y - _pfA.y) * dy + (p.at.z - _pfA.z) * dz) / l2;
    const cover = myRoom === null && t > 0 && t < 1 && Math.hypot(_pfA.x + dx * t - p.at.x, _pfA.y + dy * t - p.at.y, _pfA.z + dz * t - p.at.z) < 1.5;
    const want = cover ? 0.22 : 1;
    if (Math.abs(p.o - want) < 0.005) continue;
    p.o = lerp(p.o, want, Math.min(1, dt * 6)); if (Math.abs(p.o - want) < 0.01) p.o = want;
    for (const m of p.top.material) { m.opacity = p.o; m.depthWrite = p.o > 0.99; }
  }
}
const updateSailboats = (dt) => scenery.updateSailboats(dt, nowMs() / 1000);

// fruit trees for the axe: palms give coconuts, round trees the fruit that already grows around them.
// Fruit shown in the crown hides after a harvest and comes back when the tree has regrown (timestamp based).
const TREE_REGROW_MS = 90000;
const fruitTrees = [];
function setupFruitTree(obj, kind, colR) {
  const crown = obj.userData.sway;
  let fruits;
  if (kind === 'coconut') fruits = crown.children.filter((c) => c.geometry && c.geometry.type === 'SphereGeometry');
  else {
    const color = kind === 'mango' ? '#ffc23a' : '#f2b632';
    fruits = [[0.9, 0.6, 0.5], [-0.7, 0.9, 0.7], [0.2, 0.4, -1.0]].map(([x, y, z]) => {
      const f = mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(color), x, y, z); crown.add(f); return f;
    });
  }
  const tree = { id: fruitTrees.length, obj, kind, fruits, readyAt: 0, shakeT: 0, reach: colR + 0.65 }; // readyAt in server time
  obj.traverse((o) => { o.userData.fruitTree = tree; });
  fruitTrees.push(tree);
}
// ---------------------------------------------------------------- cherry blossom trees
// About one tree in five turns pink: the ones in a few groves near the plaza, along the loop road and by the yard
// gates (picked the same way on every screen, from the trees' positions). They're scenery: they don't give fruit
// (so they're taken off the fruit-tree list; their trunks and collisions stay). A few petals drift down from each.
const blossoms = (() => {
  const nearLoop = (t) => LOOP.some((q) => Math.abs(q.x - t.position.x) < 7 && Math.hypot(q.x - t.position.x, q.z - t.position.z) < 7);
  const nearGate = (t) => PLOTS.some((p) => { const g = plotVisit(p).pop(); return Math.hypot(g.x - t.position.x, g.z - t.position.z) < 9; });
  const score = (t) => {
    const x = t.position.x, z = t.position.z;
    return (Math.hypot(x - TOWN.x, z - TOWN.z) < 22 ? 0.6 : 0) + (nearLoop(t) ? 0.35 : 0) + (nearGate(t) ? 0.45 : 0)
      + smooth(0.45, 0.7, fbm(x * 0.07 + 70, z * 0.07 + 30)) * 0.8 + hash(Math.round(x * 10), Math.round(z * 10)) * 0.3; // groves + a little variety
  };
  const want = Math.round(trees.length / 5);
  const picked = trees.map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s).slice(0, want).map((o) => o.t);
  const pinks = [mat('#f6b8d0'), mat('#f29ab8'), mat('#ffd3e2')];
  for (const t of picked) {
    const crown = t.userData.sway;
    crown.children.forEach((m, i) => { if (m.isMesh) m.material = pinks[(i + Math.round(t.position.x)) % 3 < 0 ? 0 : (i + Math.round(t.position.x)) % 3]; });
    trees.splice(trees.indexOf(t), 1); // not a fruit tree
  }
  // falling petals: one small points cloud, each petal drifting down under a random pink tree and starting again
  const N = Math.min(320, picked.length * 5), pos = new Float32Array(N * 3), info = [];
  for (let i = 0; i < N; i++) {
    const t = picked[i % picked.length], top = t.position.y + 2.2 * t.scale.y;
    info.push({ t, top, x: (rand() - 0.5) * 2.4, z: (rand() - 0.5) * 2.4, ph: rand() * 50, sp: 0.18 + rand() * 0.14 });
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const petalMat = new THREE.PointsMaterial({ map: radialTexture('rgba(255,190,215,1)', 'rgba(255,170,200,0)'), size: 0.16, transparent: true, depthWrite: false, color: 0xffffff });
  const pts = new THREE.Points(geo, petalMat); pts.frustumCulled = false; scene.add(pts);
  return { picked, info, geo, petalMat };
})();
function updatePetals(time) {
  const p = blossoms.geo.attributes.position, day = 0.45 + 0.55 * (1 - cur.night); // dimmer at night
  blossoms.petalMat.color.setRGB(day, day, day);
  blossoms.info.forEach((o, i) => {
    const fall = ((time * o.sp + o.ph) % 1); // 0..1: from the crown down to the grass
    const t = o.t.position;
    p.setXYZ(i, t.x + o.x + Math.sin(time * 1.3 + o.ph) * 0.35 * fall, o.top - fall * (o.top - t.y), t.z + o.z + Math.cos(time * 1.1 + o.ph) * 0.3 * fall);
  });
  p.needsUpdate = true;
}

palms.forEach((p) => setupFruitTree(p, 'coconut', 0.4));
trees.forEach((t, i) => setupFruitTree(t, i % 3 === 2 ? 'pineapple' : 'mango', 0.6));

// ---------------------------------------------------------------- vegetable garden (decor only)
// Added after the rest of the island is laid out (and with its own random generator), so nothing that
// already exists moves. It takes the free spot closest to the upper right of town, then reserves it.
const GARDEN_W = 2.8, GARDEN_D = 2.2; // bed area; the fence runs 0.2 outside it
const garden = (() => {
  const want = LAYOUT.islandGarden; // on the open lawn between yard 1 and the plaza
  const fx = GARDEN_W / 2 + 0.2, fz = GARDEN_D / 2 + 0.2; // fence half-size
  const fits = (x, z) => {
    const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => [x + a * fx, z + b * fz]);
    if (pts.some(([px, pz]) => H(px, pz) < 0.3 || landD(px, pz) > 0.85)) return null;
    const hs = pts.map(([px, pz]) => H(px, pz));
    if (Math.max(...hs) - Math.min(...hs) > 1.0) return null;
    // nothing solid inside the fence (trunks, rocks, lamps, bench, the house) and the path stays outside it
    const solidInside = colliders.some((c) => Math.hypot(Math.max(Math.abs(c.x - x) - fx, 0), Math.max(Math.abs(c.z - z) - fz, 0)) < c.r);
    const pathInside = pathSamples.some((p) => Math.abs(p.x - x) < fx + 0.4 && Math.abs(p.z - z) < fz + 0.4);
    const inYard = PLOTS.some((p) => Math.hypot(p.x - x, p.z - z) < PLOT_HALF * 1.42 + Math.hypot(fx, fz) + 0.5);
    const onPlaza = Math.hypot(x - TOWN.x, z - TOWN.z) < PLAZA_R + Math.hypot(fx, fz) + 0.5;
    if (solidInside || pathInside || inYard || onPlaza) return null;
    return { x, z, y: Math.min(...hs) };
  };
  for (let ring = 0; ring <= 24; ring++) {
    const steps = ring === 0 ? 1 : 8 + ring * 4;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * TAU, x = want.x + Math.cos(a) * ring * 0.5, z = want.z + Math.sin(a) * ring * 0.5;
      const spot = fits(x, z);
      if (spot) return spot;
    }
  }
  return null;
})();
const islandSpots = []; // the island garden's plants, which anyone can water
if (garden) buildGarden(garden);
function buildGarden(spot) {
  const gr = mulberry32(4242);
  const g = new THREE.Group();
  g.position.set(spot.x, spot.y, spot.z);
  scene.add(g);
  const gy = (lx, lz) => H(spot.x + lx, spot.z + lz) - spot.y; // local ground height, the terrain is gently uneven
  const soil = mat('#8a6248'), soilDark = mat('#76533c');

  // three raised beds, one crop each
  const rows = [{ z: -0.62, crop: 'cabbage' }, { z: 0, crop: 'tomato' }, { z: 0.62, crop: 'carrot' }];
  for (const row of rows) {
    let top = -Infinity;
    for (let lx = -1.1; lx <= 1.1; lx += 0.275) for (const dz of [-0.22, 0.22]) top = Math.max(top, gy(lx, row.z + dz));
    top += 0.12;
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.7, 0.46), soil, 0, top - 0.35, row.z));
    for (const dz of [-0.12, 0.12]) g.add(mesh(new THREE.BoxGeometry(2.2, 0.05, 0.07), soilDark, 0, top + 0.02, row.z + dz));
    for (let i = 0; i < 5; i++) {
      const c = makeCrop(row.crop, gr);
      c.position.set(-0.9 + i * 0.45 + (gr() - 0.5) * 0.08, top, row.z + (gr() - 0.5) * 0.06);
      c.rotation.y = gr() * TAU;
      g.add(c);
      // dark wet soil under the plant, shown while it is watered (index = bed * 5 + plant, as on the server)
      const wet = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), wetSoilMat); wet.rotation.x = -Math.PI / 2;
      wet.position.set(c.position.x, top + 0.008, c.position.z); wet.visible = false; g.add(wet);
      const spot = { idx: islandSpots.length, crop: c, wet, group: g };
      c.traverse((m) => { m.userData.islandSpot = spot; });
      islandSpots.push(spot);
    }
  }

  // low wooden fence around the beds, with a gap on the side nearest the path
  const fx = GARDEN_W / 2 + 0.2, fz = GARDEN_D / 2 + 0.2;
  const sides = [
    { from: [-fx, -fz], to: [fx, -fz] }, { from: [fx, -fz], to: [fx, fz] },
    { from: [fx, fz], to: [-fx, fz] }, { from: [-fx, fz], to: [-fx, -fz] },
  ];
  const pathDist = (lx, lz) => Math.min(...pathSamples.map((p) => Math.hypot(p.x - spot.x - lx, p.z - spot.z - lz)));
  let gateSide = sides[0], gateD = Infinity;
  for (const sd of sides) {
    const d = pathDist((sd.from[0] + sd.to[0]) / 2, (sd.from[1] + sd.to[1]) / 2);
    if (d < gateD) { gateD = d; gateSide = sd; }
  }
  for (const sd of sides) {
    const len = Math.hypot(sd.to[0] - sd.from[0], sd.to[1] - sd.from[1]);
    const n = Math.round(len / 0.55);
    const posts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, lx = lerp(sd.from[0], sd.to[0], u), lz = lerp(sd.from[1], sd.to[1], u);
      posts.push({ lx, lz, y: gy(lx, lz), gate: sd === gateSide && Math.abs(u - 0.5) < 0.12 });
    }
    posts.forEach((p, i) => {
      if (p.gate) return;
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.62, 0.09), M.woodDark, p.lx, p.y + 0.26, p.lz));
      const cap = mesh(new THREE.ConeGeometry(0.075, 0.1, 4), M.woodDark, p.lx, p.y + 0.62, p.lz); cap.rotation.y = Math.PI / 4; g.add(cap);
      colliders.push({ x: spot.x + p.lx, z: spot.z + p.lz, r: 0.12 });
      const q = posts[i + 1];
      if (!q || q.gate) return;
      const seg = Math.hypot(q.lx - p.lx, q.lz - p.lz), dy = q.y - p.y;
      for (const h of [0.2, 0.42]) {
        const rail = mesh(new THREE.BoxGeometry(seg, 0.06, 0.04), M.wood, (p.lx + q.lx) / 2, (p.y + q.y) / 2 + h, (p.lz + q.lz) / 2);
        rail.rotation.order = 'YZX';
        rail.rotation.y = -Math.atan2(q.lz - p.lz, q.lx - p.lx);
        rail.rotation.z = Math.atan2(dy, seg);
        g.add(rail);
      }
    });
  }

  // a scarecrow keeping watch in the back corner
  const sc = new THREE.Group();
  const shirt = mat('#d98a6a'), straw = mat('#e8c76a'), hat = mat('#c9a55a');
  sc.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 6), M.woodDark, 0, 0.62, 0));
  sc.add(mesh(new THREE.BoxGeometry(0.95, 0.06, 0.06), M.woodDark, 0, 1.05, 0));
  sc.add(mesh(new THREE.BoxGeometry(0.36, 0.44, 0.2), shirt, 0, 0.93, 0));
  sc.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), mat('#6f9fd0'), 0.08, 0.86, 0.105));
  for (const side of [-1, 1]) {
    sc.add(mesh(new THREE.BoxGeometry(0.3, 0.13, 0.13), shirt, side * 0.32, 1.05, 0));
    const hand = mesh(new THREE.ConeGeometry(0.05, 0.14, 5), straw, side * 0.53, 1.05, 0); hand.rotation.z = side * Math.PI / 2; sc.add(hand);
  }
  sc.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#e9d3a0'), 0, 1.33, 0));
  for (const x of [-0.06, 0.06]) sc.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), mat('#3a2e26'), x, 1.36, 0.15));
  sc.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 12), hat, 0, 1.46, 0));
  sc.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.15, 10), hat, 0, 1.54, 0));
  sc.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.035, 10), mat('#d9705a'), 0, 1.49, 0));
  const scX = -GARDEN_W / 2 + 0.05, scZ = -GARDEN_D / 2 + 0.05;
  sc.position.set(scX, gy(scX, scZ), scZ);
  sc.rotation.y = 0.35;
  g.add(sc);
  colliders.push({ x: spot.x + scX, z: spot.z + scZ, r: 0.25 });

  // a watering can left on the grass by the front corner
  const can = new THREE.Group();
  const teal = mat('#6fb8a8'), tealDark = mat('#5a9f90');
  can.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 10), teal, 0, 0.12, 0));
  can.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 10), tealDark, 0, 0.245, 0));
  const spout = mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.3, 6), teal, 0, 0.18, 0.2); spout.rotation.x = 0.9; can.add(spout);
  const rose = mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.04, 8), tealDark, 0, 0.29, 0.31); rose.rotation.x = 0.9; can.add(rose);
  const grip = mesh(new THREE.TorusGeometry(0.08, 0.017, 5, 10, Math.PI), tealDark, 0, 0.25, -0.04); grip.rotation.y = Math.PI / 2; can.add(grip);
  const canX = fx + 0.45, canZ = fz - 0.3;
  can.position.set(canX, gy(canX, canZ), canZ);
  can.rotation.y = -0.8;
  g.add(can);

  // the plot is taken: later item and bug spots keep out of it, and no grass grows in the beds
  avoid.push({ x: spot.x, z: spot.z, r: Math.hypot(fx, fz) + 0.2 });
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < grassTufts.count; i++) {
    grassTufts.getMatrixAt(i, m4); p.setFromMatrixPosition(m4);
    if (Math.abs(p.x - spot.x) < fx + 0.15 && Math.abs(p.z - spot.z) < fz + 0.15) grassTufts.setMatrixAt(i, zero);
  }
  grassTufts.instanceMatrix.needsUpdate = true;
}
// crops sit with their base on the soil surface (y = 0)
function makeCrop(kind, r) {
  const c = new THREE.Group();
  if (kind === 'carrot') {
    const root = mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mat('#f29a4a'), 0, 0.01, 0); root.rotation.x = Math.PI; c.add(root);
    for (let i = 0; i < 4; i++) {
      const leaf = mesh(new THREE.ConeGeometry(0.03, 0.3, 4), mat('#7cc457'), Math.cos(i * 1.6) * 0.03, 0.2, Math.sin(i * 1.6) * 0.03);
      leaf.rotation.set(Math.sin(i * 1.6) * 0.35, 0, -Math.cos(i * 1.6) * 0.35);
      c.add(leaf);
    }
  } else if (kind === 'tomato') {
    c.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 4), M.wood, 0.06, 0.37, 0));
    c.add(mesh(new THREE.IcosahedronGeometry(0.2, 0), mat('#5fae4f'), 0, 0.32, 0));
    c.add(mesh(new THREE.IcosahedronGeometry(0.14, 0), mat('#6fbf55'), 0.02, 0.52, 0.02));
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + r() * 0.5;
      c.add(mesh(new THREE.SphereGeometry(0.055, 7, 5), mat('#ef5b4b'), Math.cos(a) * 0.17, 0.26 + r() * 0.25, Math.sin(a) * 0.17));
    }
  } else {
    const head = mesh(new THREE.IcosahedronGeometry(0.16, 1), mat('#b9e08e'), 0, 0.15, 0); head.scale.y = 0.85; c.add(head);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const leaf = mesh(new THREE.SphereGeometry(0.14, 7, 5), mat('#86c866'), Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14);
      leaf.scale.set(1, 0.35, 0.8); leaf.rotation.y = -a; leaf.rotation.z = 0.4;
      c.add(leaf);
    }
  }
  return c;
}

// ---------------------------------------------------------------- pickables
const pickGroup = new THREE.Group();
scene.add(pickGroup);
const items = [];
function starShape(ro, ri) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? ri : ro;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
const KINDS = {
  shell: { name: 'a seashell', make() {
    const g = new THREE.Group();
    const variant = Math.floor(rand() * 3);
    if (variant === 0) {
      const s = mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, TAU, 0, Math.PI / 2), mat('#f7c9b4')); s.scale.set(1, 0.5, 0.85); g.add(s);
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), mat('#f0b49a'), 0, 0.02, -0.2));
    } else if (variant === 1) {
      const s = mesh(new THREE.ConeGeometry(0.13, 0.42, 9), mat('#fbe0cf')); s.rotation.z = Math.PI / 2; s.position.y = 0.1; g.add(s);
      g.add(mesh(new THREE.SphereGeometry(0.14, 9, 7), mat('#f6c3b0'), -0.15, 0.1, 0));
    } else {
      g.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), mat('#cbbbe8'), 0, 0.13, 0));
      const t = mesh(new THREE.TorusGeometry(0.11, 0.045, 6, 14), mat('#f4f0fb'), 0, 0.13, 0); t.rotation.y = Math.PI / 2; g.add(t);
    }
    return g;
  } },
  star: { name: 'a starfish', make() {
    const geo = new THREE.ExtrudeGeometry(starShape(0.26, 0.11), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const m = mesh(geo, mat(pick(['#f5894d', '#5b98d8', '#ec6a6a']))); m.position.y = 0.03;
    const g = new THREE.Group(); g.add(m); return g;
  } },
  coconut: { name: 'a coconut', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#8bc34a'), 0, 0.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 9), mat('#fbf6e8'), 0, 0.39, 0));
    return g;
  } },
  mango: { name: 'a mango', make() {
    const g = new THREE.Group();
    const b = mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#ffc23a'), 0, 0.15, 0); b.scale.set(1.3, 0.9, 1); g.add(b);
    const l = mesh(new THREE.ConeGeometry(0.06, 0.2, 4), M.leafDark, 0.15, 0.28, 0); l.rotation.z = -1; l.scale.z = 0.3; g.add(l);
    return g;
  } },
  pineapple: { name: 'a pineapple', make() {
    const g = new THREE.Group();
    const b = mesh(new THREE.SphereGeometry(0.18, 8, 6), mat('#f2b632'), 0, 0.22, 0); b.scale.y = 1.35; g.add(b);
    for (let i = 0; i < 5; i++) { const l = mesh(new THREE.ConeGeometry(0.05, 0.3, 4), M.leaf, Math.cos(i * 1.26) * 0.05, 0.55, Math.sin(i * 1.26) * 0.05); l.rotation.set(Math.sin(i * 1.26) * 0.4, 0, -Math.cos(i * 1.26) * 0.4); g.add(l); }
    return g;
  } },
  smallfish: { name: 'a small fish', make() { // caught with the rod only, never spawned on the ground
    const g = new THREE.Group();
    const color = pick(['#7fb6e0', '#f2a65a', '#9ad0a0', '#e88aa0']);
    const body = mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(color), 0, 0.12, 0); body.scale.set(0.55, 0.8, 1.6); g.add(body);
    const tail = mesh(new THREE.ConeGeometry(0.14, 0.22, 4), mat(color), 0, 0.12, -0.34); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; g.add(tail);
    for (const x of [-0.08, 0.08]) g.add(mesh(new THREE.SphereGeometry(0.025, 5, 4), mat('#2b211c'), x, 0.17, 0.2));
    return g;
  } },
  bigfish: { name: 'a big fish', make() { // a chunky violet-blue fish with gold fins, about twice the size
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.3, 10, 8), mat('#6a6fd8'), 0, 0.2, 0); body.scale.set(0.6, 0.85, 1.6); g.add(body);
    const belly = mesh(new THREE.SphereGeometry(0.26, 10, 8), mat('#c9d4ff'), 0, 0.12, 0.04); belly.scale.set(0.5, 0.5, 1.4); g.add(belly);
    const tail = mesh(new THREE.ConeGeometry(0.24, 0.34, 4), mat('#f2c94c'), 0, 0.2, -0.56); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; g.add(tail);
    const fin = mesh(new THREE.ConeGeometry(0.12, 0.22, 4), mat('#f2c94c'), 0, 0.46, -0.05); fin.scale.z = 2; g.add(fin);
    for (const x of [-0.13, 0.13]) g.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), mat('#2b211c'), x, 0.27, 0.36));
    return g;
  } },
  carrot: { name: 'a carrot', make: () => makeCrop('carrot', Math.random) },
  tomato: { name: 'a tomato', make: () => makeCrop('tomato', Math.random) },
  cabbage: { name: 'a cabbage', make: () => makeCrop('cabbage', Math.random) },
  flower: { name: 'a flower', make() {
    const g = new THREE.Group();
    const color = pick(['#ff6b6b', '#fff6ea', '#ffb3c8', '#ffd84d', '#c9a6ff']);
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), M.leafDark, 0, 0.15, 0));
    const head = new THREE.Group(); head.position.y = 0.32; g.add(head);
    for (let i = 0; i < 5; i++) { const p = mesh(new THREE.SphereGeometry(0.075, 6, 4), mat(color), Math.cos(i * 1.257) * 0.09, 0, Math.sin(i * 1.257) * 0.09); p.scale.y = 0.45; head.add(p); }
    head.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), M.flowerY, 0, 0.02, 0));
    const lf = mesh(new THREE.SphereGeometry(0.08, 5, 3), M.leaf, 0.07, 0.06, 0); lf.scale.set(1, 0.3, 0.5); g.add(lf);
    return g;
  } },
};
// bugs caught with the net (the models are shared with the live bugs flying around)
Object.assign(KINDS, {
  butterfly: { name: 'a butterfly', make: () => makeBug('butterfly').obj },
  beetle: { name: 'a beetle', make: () => makeBug('beetle').obj },
  dragonfly: { name: 'a dragonfly', make: () => makeBug('dragonfly').obj },
  scarab: { name: 'a scarab beetle', make: () => makeBug('scarab').obj },
  lizard: { name: 'a sand lizard', make: () => makeBug('lizard').obj },
  crab: { name: 'a crab', make: () => makeBug('crab').obj },
  clownfish: { name: 'a clownfish', make() { // caught with the rod at the beach: orange with white bands
    const g = new THREE.Group(), o = mat('#ff8a3a'), w = mat('#fffaf0');
    const body = mesh(new THREE.SphereGeometry(0.16, 8, 6), o, 0, 0.12, 0); body.scale.set(0.55, 0.8, 1.5); g.add(body);
    for (const z of [0.12, -0.08]) { const band = mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.05, 8), w, 0, 0.12, z); band.rotation.x = Math.PI / 2; band.scale.set(0.62, 1, 0.95); g.add(band); }
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.2, 4), o, 0, 0.12, -0.3); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; g.add(tail);
    for (const x of [-0.07, 0.07]) g.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), mat('#2b211c'), x, 0.16, 0.18));
    return g;
  } },
  koi: { name: 'a koi', make() { // caught in the home pond: white with orange patches
    const g = new THREE.Group(), w = mat('#fffaf0'), o = mat('#ff7a3a');
    const body = mesh(new THREE.SphereGeometry(0.16, 8, 6), w, 0, 0.12, 0); body.scale.set(0.55, 0.62, 1.6); g.add(body);
    for (const [z, y] of [[0.1, 0.17], [-0.12, 0.16]]) { const sp = mesh(new THREE.SphereGeometry(0.08, 6, 4), o, 0, y, z); sp.scale.set(0.9, 0.5, 1.2); g.add(sp); }
    const tail = mesh(new THREE.ConeGeometry(0.13, 0.22, 4), o, 0, 0.12, -0.32); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; g.add(tail);
    for (const x of [-0.07, 0.07]) g.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), mat('#2b211c'), x, 0.15, 0.2));
    return g;
  } },
  carp: { name: 'a carp', make() { // a plump golden-brown pond fish
    const g = new THREE.Group(), c = mat('#c9a04a'), d = mat('#a07a32');
    const body = mesh(new THREE.SphereGeometry(0.17, 8, 6), c, 0, 0.13, 0); body.scale.set(0.6, 0.75, 1.5); g.add(body);
    g.add(mesh(new THREE.ConeGeometry(0.05, 0.12, 4), d, 0, 0.26, -0.02));
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.2, 4), d, 0, 0.13, -0.3); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; g.add(tail);
    for (const x of [-0.07, 0.07]) g.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), mat('#2b211c'), x, 0.17, 0.19));
    return g;
  } },
  puffer: { name: 'a pufferfish', make() { // a round yellow fish with soft little spikes
    const g = new THREE.Group(), y = mat('#f6d55c');
    g.add(mesh(new THREE.IcosahedronGeometry(0.2, 1), y, 0, 0.2, 0));
    for (let i = 0; i < 10; i++) { const a = i * 2.4, b = Math.acos(1 - 2 * ((i + 0.5) / 10)); const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)); const sp = mesh(new THREE.ConeGeometry(0.025, 0.08, 4), mat('#d9a92c'), d.x * 0.21, 0.2 + d.y * 0.21, d.z * 0.21); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(sp); }
    const tail = mesh(new THREE.ConeGeometry(0.09, 0.14, 4), y, 0, 0.2, -0.26); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; g.add(tail);
    for (const x of [-0.08, 0.08]) g.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), mat('#2b211c'), x, 0.25, 0.16));
    return g;
  } },
  conch: { name: 'a conch shell', make() { // a pink spiral shell from the beach
    const g = new THREE.Group(), pink = mat('#f6b8a8'), inner = mat('#ffe2d8');
    for (let i = 0; i < 4; i++) { const t = mesh(new THREE.ConeGeometry(0.17 - i * 0.035, 0.16, 7), pink, 0, 0.08 + i * 0.07, -i * 0.03); t.rotation.x = -0.4; t.rotation.y = i * 0.8; g.add(t); }
    const lip = mesh(new THREE.SphereGeometry(0.11, 8, 6), inner, 0, 0.08, 0.1); lip.scale.set(0.9, 0.5, 0.7); g.add(lip);
    return g;
  } },
});
const pocket = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 0]));

// a spot in the desert or on the beach (shells, starfish and conches on the sand by the water)
function areaSpot(kind, area) {
  for (let k = 0; k < 40; k++) {
    const s = island.randomInArea(area, rand, ['shell', 'star', 'conch'].includes(kind) ? 'shore' : 'land');
    if (s && !blocked(s.x, s.z, 0.25) && !onDock(s.x, s.z)) return s;
  }
  return null;
}
function spot(kind, near) {
  for (let k = 0; k < 200; k++) {
    let x, z;
    if (kind === 'shell' || kind === 'star') {
      const th = rr(0, TAU), r = waterR(th) - rr(0.4, 2.2);
      x = Math.cos(th) * r; z = Math.sin(th) * r;
      if (H(x, z) < 0.04 || H(x, z) > 0.5) continue;
    } else if (near) {
      const a = rr(0, TAU), d = rr(1.0, 2.0);
      x = near.position.x + Math.cos(a) * d; z = near.position.z + Math.sin(a) * d;
      if (H(x, z) < 0.15 || colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3)) continue;
      if (onDock(x, z)) continue;
      return { x, z };
    } else {
      const th = rr(0, TAU), r = Math.sqrt(rand()) * coastR(th) * 0.78;
      x = Math.cos(th) * r; z = Math.sin(th) * r;
      if (H(x, z) < 0.5) continue;
    }
    if (blocked(x, z, 0.25) || onDock(x, z)) continue;
    return { x, z };
  }
  return null;
}
function addItem(kind, near, area) {
  const it = { id: items.length, gen: 0, kind, near, area, active: false, obj: null, x: 0, z: 0, respawnAt: Date.now() + rr(0, 2000), anim: 0, state: 'waiting', picker: null };
  items.push(it);
}
for (let i = 0; i < 26; i++) addItem('shell');
for (let i = 0; i < 16; i++) addItem('star');
for (const p of palms) addItem('coconut', p);
trees.forEach((t, i) => addItem(i % 3 === 2 ? 'pineapple' : 'mango', t));
for (let i = 0; i < 40; i++) addItem('flower');
for (let i = 0; i < 12; i++) addItem('shell', null, 'beach');
for (let i = 0; i < 8; i++) addItem('star', null, 'beach');
for (let i = 0; i < 10; i++) addItem('conch', null, 'beach');

function spawn(it) {
  if (it.obj) despawn(it);
  rand = mulberry32(it.id * 7919 + it.gen * 104729 + 1);
  const s = it.area ? areaSpot(it.kind, it.area) : spot(it.kind, it.near);
  if (!s) { rand = worldRand; it.respawnAt = Date.now() + 5000; return; }
  it.x = s.x; it.z = s.z;
  const obj = KINDS[it.kind].make();
  obj.position.set(s.x, H(s.x, s.z), s.z);
  obj.rotation.y = rr(0, TAU);
  rand = worldRand;
  obj.scale.setScalar(0.001);
  obj.traverse((o) => { o.userData.item = it; });
  pickGroup.add(obj);
  it.obj = obj; it.active = true; it.state = 'growing'; it.anim = 0;
  it.watered = 0; it.size = 1; // a fresh flower starts unwatered
}
function despawn(it) {
  if (it.obj) { pickGroup.remove(it.obj); it.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  it.obj = null; it.active = false; it.state = 'waiting'; it.respawnAt = Date.now() + rr(20000, 40000);
}

// ---------------------------------------------------------------- character
function makeCharacter(shirtColor) {
  const player = new THREE.Group();
  player.rotation.order = 'YXZ'; // heading first, then the swing's tilt
  const rig = {};
  const skin = mat('#ffd8bd', { flatShading: false }), hair = mat('#5b3a26', { flatShading: false });
  const shirt = mat(shirtColor, { flatShading: false }), shorts = mat('#5d8fc4', { flatShading: false }), shoe = mat('#8a5a3a', { flatShading: false });
  const body = new THREE.Group(); body.position.y = 0.55; player.add(body); rig.body = body;
  rig.shirt = mesh(new THREE.CapsuleGeometry(0.22, 0.25, 4, 10), shirt, 0, 0.2, 0);
  body.add(rig.shirt);
  body.add(mesh(new THREE.CylinderGeometry(0.235, 0.24, 0.16, 10), shorts, 0, 0.0, 0));
  const pack = mesh(new THREE.BoxGeometry(0.34, 0.36, 0.18), mat('#c89a64', { flatShading: false }), 0, 0.25, -0.24); body.add(pack);
  body.add(mesh(new THREE.BoxGeometry(0.26, 0.12, 0.04), mat('#b0844f', { flatShading: false }), 0, 0.18, -0.34));
  const head = new THREE.Group(); head.position.y = 0.72; body.add(head); rig.head = head;
  head.add(mesh(new THREE.SphereGeometry(0.33, 18, 14), skin));
  const hairCap = mesh(new THREE.SphereGeometry(0.355, 18, 12, 0, TAU, 0, Math.PI * 0.55), hair, 0, 0.03, -0.03); hairCap.rotation.x = -0.25; head.add(hairCap);
  const tuft = mesh(new THREE.ConeGeometry(0.06, 0.16, 6), hair, 0.02, 0.38, 0.0); tuft.rotation.z = -0.4; head.add(tuft);
  for (const x of [-0.11, 0.11]) {
    head.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#2b211c', { flatShading: false }), x, -0.02, 0.3));
    const blush = mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#ffb1a0', { flatShading: false }), x * 1.6, -0.1, 0.27); blush.scale.z = 0.3; head.add(blush);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.27, 0.36, 0); body.add(arm);
    arm.add(mesh(new THREE.CapsuleGeometry(0.06, 0.2, 3, 6), skin, 0, -0.14, 0));
    rig[side < 0 ? 'armL' : 'armR'] = arm;
    const leg = new THREE.Group(); leg.position.set(side * 0.11, 0.55, 0); player.add(leg);
    leg.add(mesh(new THREE.CapsuleGeometry(0.065, 0.22, 3, 6), skin, 0, -0.24, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.13, 0.08, 0.2), shoe, 0, -0.45, 0.03));
    rig[side < 0 ? 'legL' : 'legR'] = leg;
  }
  scene.add(player);
  return { player, rig };
}
function animateRig(rig, dt, time, moving, phase, pickT, run = 0) {
  const swing = moving ? Math.sin(phase) * (0.7 + 0.35 * run) : 0;
  const k = Math.min(1, dt * 12);
  rig.legL.rotation.x = lerp(rig.legL.rotation.x, swing, k);
  rig.legR.rotation.x = lerp(rig.legR.rotation.x, -swing, k);
  if (pickT > 0) {
    const u = 1 - pickT / 0.6;
    rig.armL.rotation.x = rig.armR.rotation.x = -Math.sin(u * Math.PI) * 2.2;
    rig.body.rotation.x = Math.sin(u * Math.PI) * 0.35;
  } else {
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, -swing * (0.8 + 0.5 * run) - run * 0.25, k);
    rig.armR.rotation.x = lerp(rig.armR.rotation.x, swing * (0.8 + 0.5 * run) - run * 0.25, k);
    rig.body.rotation.x = lerp(rig.body.rotation.x, moving ? 0.08 + 0.17 * run : 0, Math.min(1, dt * 8));
  }
  rig.armL.rotation.z = -0.15 - 0.12 * run; rig.armR.rotation.z = 0.15 + 0.12 * run;
  rig.body.position.y = 0.55 + (moving ? Math.abs(Math.sin(phase)) * (0.06 + 0.07 * run) : Math.sin(time * 2) * 0.012);
  rig.head.rotation.y = moving ? 0 : Math.sin(time * 0.4) * 0.35;
  rig.head.rotation.z = moving ? Math.sin(phase) * 0.05 * (1 - 0.5 * run) : 0;
}
function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 28px "Trebuchet MS", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(248, (g.measureText ? g.measureText(text).width : 150) + 28);
  g.fillStyle = 'rgba(255,250,238,0.9)';
  if (g.roundRect) { g.beginPath(); g.roundRect(128 - w / 2, 8, w, 48, 24); g.fill(); } else g.fillRect(128 - w / 2, 8, w, 48);
  g.fillStyle = color; g.fillRect(128 - w / 2 + 14, 28, 8, 8);
  g.fillStyle = '#5a4632'; g.fillText(text, 136, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.0; s.renderOrder = 5;
  return s;
}
const { player, rig } = makeCharacter('#fbf8f0');
player.position.set(LAYOUT.spawn.x, 0, LAYOUT.spawn.z); // arriving players start by the pier
player.position.y = H(player.position.x, player.position.z);

// ---------------------------------------------------------------- tools (held only, no actions yet)
// each tool is built with its grip at the origin and the shaft along +y; the hand then points it forward
function makeTool(kind) {
  const g = new THREE.Group();
  const handle = (len, r = 0.025) => mesh(new THREE.CylinderGeometry(r, r * 1.1, len, 6), M.wood, 0, len / 2 - 0.12, 0);
  if (kind === 'axe') {
    g.add(handle(0.7));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.16, 0.2), mat('#a7adb3'), 0, 0.5, 0.08));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.2, 0.05), mat('#d9dde0'), 0, 0.5, 0.2));
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), M.woodDark, 0, 0.5, -0.03));
  } else if (kind === 'can') {
    const body = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.22, 10), mat('#6fb8a8'), 0, -0.12, 0.08); g.add(body);
    g.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 10), mat('#5a9f90'), 0, -0.01, 0.08));
    const spout = mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.3, 6), mat('#6fb8a8'), 0, -0.08, 0.28); spout.rotation.x = 1.0; g.add(spout);
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.04, 8), mat('#5a9f90'), 0, 0.03, 0.4));
    const grip = mesh(new THREE.TorusGeometry(0.08, 0.017, 5, 10, Math.PI), mat('#5a9f90'), 0, 0, 0.0); grip.rotation.y = Math.PI / 2; g.add(grip);
    g.rotation.x = -Math.PI / 2; // carried hanging from the hand, upright
  } else if (kind === 'rod') {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.28, 6), mat('#6b4a32'), 0, 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.02, 1.25, 5), M.wood, 0, 0.78, 0));
    const reel = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), mat('#d9dde0'), 0.05, 0.08, 0); reel.rotation.z = Math.PI / 2; g.add(reel);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.45, 3), new THREE.MeshBasicMaterial({ color: 0xf8f8f8 }));
    line.position.set(0, 1.18, 0.0); line.rotation.x = 0.35; line.position.z = 0.08; g.add(line);
    g.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), M.red, 0, 0.98, 0.16));
  } else if (kind === 'house') { // a little hammer
    g.add(handle(0.5));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.28), mat('#8f97a3'), 0, 0.38, 0.04));
    g.add(mesh(new THREE.BoxGeometry(0.11, 0.13, 0.06), mat('#6f7780'), 0, 0.38, 0.2));
  } else if (kind === 'net') {
    g.add(handle(0.85, 0.02));
    const hoop = mesh(new THREE.TorusGeometry(0.17, 0.014, 5, 16), mat('#d9dde0'), 0, 0.88, 0); hoop.rotation.x = Math.PI / 2; g.add(hoop);
    const bag = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.32, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1, flatShading: true }));
    bag.position.set(0, 0.88, -0.17); bag.rotation.x = Math.PI / 2; g.add(bag);
  }
  return g;
}
// ---------------------------------------------------------------- UI icons (inline SVG, drawn to match the wooden UI)
// the House Tool catalog, in the order shown in its panel
const ROOM_ITEM_LABELS = { bed: 'Bed', window: 'Window', lamp: 'Lamp', table: 'Table', chair: 'Chair', sofa: 'Sofa', bookshelf: 'Bookshelf', rug: 'Rug', plant: 'Plant', picture: 'Wall picture' };
const svg = (body) => `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
const HANDLE = (d) => `<path d="${d}" fill="none" stroke="#7a4a26" stroke-width="7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#c98c52" stroke-width="3.5" stroke-linecap="round"/>`;
const ICONS = {
  axe: svg(`${HANDLE('M11 41 L31 15')}<path d="M24 12 L35 5 C42 9 45 17 42 25 L31 22 Z" fill="#9aa2ad" stroke="#59606b" stroke-width="2" stroke-linejoin="round"/><path d="M36 6 C41 10 43 17 41 23" fill="none" stroke="#eef1f4" stroke-width="2.5" stroke-linecap="round"/>`),
  can: svg(`<path d="M15 15 C15 6 31 6 31 15" fill="none" stroke="#2f78b0" stroke-width="4.5"/><path d="M33 24 L43 13 L46 15 L37 29 Z" fill="#53aee6" stroke="#2f78b0" stroke-width="2" stroke-linejoin="round"/><rect x="42" y="10" width="5" height="7" rx="2" transform="rotate(35 44 13)" fill="#53aee6" stroke="#2f78b0" stroke-width="1.6"/><rect x="8" y="15" width="28" height="25" rx="9" fill="#53aee6" stroke="#2f78b0" stroke-width="2.2"/><path d="M5 22 C1 26 3 34 9 34" fill="none" stroke="#2f78b0" stroke-width="3.5"/><rect x="12" y="19" width="6" height="15" rx="3" fill="#a6dcff" opacity=".8"/>`),
  rod: svg(`<path d="M7 43 Q20 20 39 5" fill="none" stroke="#7a4a26" stroke-width="5" stroke-linecap="round"/><path d="M7 43 Q20 20 39 5" fill="none" stroke="#c98c52" stroke-width="2.6" stroke-linecap="round"/><circle cx="14" cy="34" r="4.5" fill="#b8c0c9" stroke="#5d6470" stroke-width="1.6"/><path d="M39 5 Q42 20 40 30" fill="none" stroke="#7a828c" stroke-width="1"/><circle cx="40" cy="33" r="4" fill="#ef5b4b" stroke="#9e3a2e" stroke-width="1.4"/><path d="M36.2 33.5 h7.6" stroke="#fff" stroke-width="2"/><path d="M14 34 Q24 34 30 40" fill="none" stroke="#7a828c" stroke-width="1"/>`),
  net: svg(`${HANDLE('M8 42 L23 26')}<circle cx="31" cy="17" r="12" fill="#fffaf0" stroke="#a8744a" stroke-width="3"/><g stroke="#cdbfa6" stroke-width="1.2"><path d="M21 12 h20 M20 17 h22 M21 22 h20 M26 7 v20 M31 6 v22 M36 7 v20"/></g><circle cx="31" cy="17" r="12" fill="none" stroke="#a8744a" stroke-width="3"/>`),
  bag: svg(`<path d="M17 13 C17 5 31 5 31 13" fill="none" stroke="#e9dcc2" stroke-width="3.5"/><rect x="9" y="12" width="30" height="30" rx="10" fill="#fbf0dc" stroke="#d2bd98" stroke-width="2"/><rect x="15" y="26" width="18" height="11" rx="4" fill="#efe0c2" stroke="#d2bd98" stroke-width="1.6"/><path d="M9 22 Q24 28 39 22" fill="none" stroke="#d2bd98" stroke-width="2"/><circle cx="24" cy="26" r="2" fill="#c9a66a"/>`),
  tools: svg(`<path d="M18 15 V11 a3 3 0 0 1 3 -3 h6 a3 3 0 0 1 3 3 V15" fill="none" stroke="#e9dcc2" stroke-width="3.5"/><rect x="7" y="15" width="34" height="25" rx="6" fill="#fbf0dc" stroke="#d2bd98" stroke-width="2"/><path d="M7 25 h34" stroke="#d2bd98" stroke-width="2"/><rect x="20" y="22" width="8" height="7" rx="2" fill="#e2b25a" stroke="#b07a2a" stroke-width="1.6"/>`),
  house: svg(`${HANDLE('M10 42 L28 20')}<rect x="20" y="6" width="22" height="12" rx="3" transform="rotate(40 31 12)" fill="#9aa2ad" stroke="#59606b" stroke-width="2"/><rect x="36" y="16" width="7" height="9" rx="2" transform="rotate(40 39 20)" fill="#6f7780"/>`),
  close: svg(`<path d="M13 13 L35 35 M35 13 L13 35" stroke="#fbf0dc" stroke-width="7" stroke-linecap="round"/>`),
  shell: svg(`<path d="M24 41 L10 31 C3 19 13 6 24 6 C35 6 45 19 38 31 Z" fill="#dccbf3" stroke="#9784c4" stroke-width="2" stroke-linejoin="round"/><path d="M24 40 L16 9 M24 40 L24 6 M24 40 L32 9 M24 40 L9 20 M24 40 L39 20" stroke="#b9a6e0" stroke-width="1.6"/><path d="M18 40 h12 l-3 5 h-6 z" fill="#cdb9ee" stroke="#9784c4" stroke-width="1.6" stroke-linejoin="round"/>`),
  star: svg(`<path d="M24 5 L28.9 18.2 L42.9 18.9 L31.9 27.6 L35.7 41.1 L24 33.3 L12.3 41.1 L16.1 27.6 L5.1 18.9 L19.1 18.2 Z" fill="#f58a4c" stroke="#c4592a" stroke-width="2.4" stroke-linejoin="round"/><g fill="#ffd3ad"><circle cx="24" cy="15" r="1.6"/><circle cx="33" cy="22" r="1.6"/><circle cx="29" cy="32" r="1.6"/><circle cx="19" cy="32" r="1.6"/><circle cx="15" cy="22" r="1.6"/><circle cx="24" cy="25" r="2"/></g>`),
  coconut: svg(`<circle cx="24" cy="27" r="16" fill="#8cc84b" stroke="#5a8f2c" stroke-width="2.2"/><ellipse cx="24" cy="16" rx="9" ry="4" fill="#fbf6e8" stroke="#c9bf9e" stroke-width="1.5"/><path d="M27 15 L34 3" stroke="#ef6a5a" stroke-width="2.6" stroke-linecap="round"/><path d="M30 10 L32 6.5" stroke="#fff" stroke-width="2.6"/><ellipse cx="17" cy="30" rx="4" ry="6" fill="#b3e07a" opacity=".6"/>`),
  mango: svg(`<path d="M10 30 C8 18 20 9 32 12 C42 15 43 28 35 36 C27 43 12 41 10 30 Z" fill="#ffc63d" stroke="#d48e1c" stroke-width="2.2"/><path d="M14 27 C15 21 20 17 26 16" fill="none" stroke="#ffe9a3" stroke-width="3" stroke-linecap="round"/><path d="M31 12 C33 6 39 4 44 6 C42 11 37 13 31 12 Z" fill="#6cbf4a" stroke="#3f8a2c" stroke-width="1.8"/>`),
  pineapple: svg(`<path d="M24 16 L18 4 L23 9 L24 2 L26 9 L31 4 Z" fill="#6cbf4a" stroke="#3f8a2c" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="24" cy="30" rx="12" ry="15" fill="#f6c03a" stroke="#c98d1d" stroke-width="2.2"/><g stroke="#d9a02a" stroke-width="1.5"><path d="M14 24 L30 42 M15 33 L25 44 M18 18 L34 37 M24 16 L36 29 M34 24 L18 42 M33 33 L23 44 M30 18 L14 37 M24 16 L12 29"/></g>`),
  bigfish: svg(`<path d="M33 24 L46 12 L43 24 L46 36 Z" fill="#f2c94c" stroke="#c08a10" stroke-width="2" stroke-linejoin="round"/><ellipse cx="20" cy="24" rx="17" ry="14" fill="#6a6fd8" stroke="#3f44a8" stroke-width="2.2"/><path d="M14 11 Q22 3 29 11" fill="#f2c94c" stroke="#c08a10" stroke-width="1.8"/><ellipse cx="19" cy="30" rx="11" ry="5" fill="#c9d4ff" opacity=".8"/><path d="M24 14 q3 10 0 20 M29 15 q3 9 0 18" fill="none" stroke="#8f94f0" stroke-width="2"/><circle cx="10" cy="20" r="3.6" fill="#fff"/><circle cx="9.4" cy="20.4" r="2.1" fill="#23313f"/><path d="M5 27 q2 2 4 0" fill="none" stroke="#3f44a8" stroke-width="1.4" stroke-linecap="round"/>`),
  carrot: svg(`<path d="M30 14 L12 42 C10 45 13 46 15 44 L36 20 Z" fill="#f29a4a" stroke="#c96a22" stroke-width="2.2" stroke-linejoin="round"/><path d="M20 30 l4 2 M24 24 l4 2 M16 37 l3 1.5" stroke="#c96a22" stroke-width="1.8" stroke-linecap="round"/><path d="M33 17 C33 9 37 5 41 4 C40 9 38 13 35 18 Z M33 17 C28 11 28 6 30 3 C33 7 35 11 35 17 Z M34 18 C40 15 44 16 46 18 C42 21 38 21 34 19 Z" fill="#6cbf4a" stroke="#3f8a2c" stroke-width="1.6" stroke-linejoin="round"/>`),
  tomato: svg(`<circle cx="24" cy="27" r="16" fill="#ef5a4a" stroke="#b8332a" stroke-width="2.2"/><ellipse cx="17" cy="21" rx="5" ry="3.5" fill="#ff9a8a" opacity=".8"/><path d="M24 12 L20 7 L24 10 L27 5 L28 11 L34 10 L29 14 L31 18 L25 15 L20 19 L21 14 L15 12 Z" fill="#6cbf4a" stroke="#3f8a2c" stroke-width="1.6" stroke-linejoin="round"/>`),
  cabbage: svg(`<circle cx="24" cy="26" r="17" fill="#9ad66a" stroke="#4f8f2f" stroke-width="2.2"/><path d="M24 10 C15 14 12 24 16 33 M24 10 C33 14 36 24 32 33 M11 22 C17 26 31 26 37 22" fill="none" stroke="#4f8f2f" stroke-width="1.8"/><circle cx="24" cy="25" r="7" fill="#c7ec9a" stroke="#4f8f2f" stroke-width="1.6"/>`),
  smallfish: svg(`<path d="M35 24 L46 15 L44 24 L46 33 Z" fill="#4fa6e6" stroke="#2c74b3" stroke-width="2" stroke-linejoin="round"/><ellipse cx="22" cy="24" rx="16" ry="12" fill="#5cb3ef" stroke="#2c74b3" stroke-width="2.2"/><path d="M18 13 Q24 7 29 13" fill="#4fa6e6" stroke="#2c74b3" stroke-width="1.8"/><ellipse cx="20" cy="29" rx="9" ry="4" fill="#a8dcff" opacity=".7"/><circle cx="13" cy="21" r="3.4" fill="#fff"/><circle cx="12.4" cy="21.4" r="2" fill="#23313f"/><path d="M8 27 q2 2 4 0" fill="none" stroke="#2c74b3" stroke-width="1.4" stroke-linecap="round"/>`),
  flower: svg(`<g fill="#ffb3c8" stroke="#e0789a" stroke-width="1.8"><circle cx="24" cy="12" r="8"/><circle cx="35.4" cy="20.3" r="8"/><circle cx="31" cy="33.7" r="8"/><circle cx="17" cy="33.7" r="8"/><circle cx="12.6" cy="20.3" r="8"/></g><circle cx="24" cy="24" r="6" fill="#ffd84d" stroke="#d9a91f" stroke-width="1.8"/>`),
  butterfly: svg(`<g stroke="#8a5a2c" stroke-width="2" stroke-linejoin="round"><path d="M23 22 C17 5 4 6 5 15 C6 23 15 25 23 24 Z" fill="#ffc35c"/><path d="M25 22 C31 5 44 6 43 15 C42 23 33 25 25 24 Z" fill="#ffc35c"/><path d="M23 25 C13 26 8 34 13 39 C17 42 22 35 23 27 Z" fill="#f6a94a"/><path d="M25 25 C35 26 40 34 35 39 C31 42 26 35 25 27 Z" fill="#f6a94a"/></g><g fill="#fff3d6"><circle cx="11" cy="14" r="2.4"/><circle cx="37" cy="14" r="2.4"/></g><rect x="22.3" y="13" width="3.4" height="24" rx="1.7" fill="#6b4424"/><path d="M23 13 Q20 7 18 6 M25 13 Q28 7 30 6" fill="none" stroke="#6b4424" stroke-width="1.4"/>`),
  beetle: svg(`<g stroke="#3a2a22" stroke-width="2" stroke-linecap="round"><path d="M12 22 L6 19 M12 30 L5 31 M14 37 L9 42 M36 22 L42 19 M36 30 L43 31 M34 37 L39 42"/></g><circle cx="24" cy="13" r="7" fill="#3a2a22"/><circle cx="21" cy="12" r="1.6" fill="#fff"/><circle cx="27" cy="12" r="1.6" fill="#fff"/><ellipse cx="24" cy="29" rx="14" ry="15" fill="#e8453c" stroke="#9c2a24" stroke-width="2.2"/><path d="M24 15 V44" stroke="#3a2a22" stroke-width="2"/><g fill="#3a2a22"><circle cx="17" cy="24" r="3"/><circle cx="31" cy="24" r="3"/><circle cx="18" cy="35" r="2.6"/><circle cx="30" cy="35" r="2.6"/></g>`),
  scarab: svg(`<g stroke="#2b3a2a" stroke-width="2" stroke-linecap="round"><path d="M12 22 L6 18 M12 30 L5 31 M14 38 L9 43 M36 22 L42 18 M36 30 L43 31 M34 38 L39 43"/></g><path d="M18 9 L15 4 M30 9 L33 4" stroke="#c9a03a" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="24" cy="13" rx="7" ry="6" fill="#2f6f5a"/><ellipse cx="24" cy="29" rx="13" ry="15" fill="#3a8f6f" stroke="#1f5a44" stroke-width="2.2"/><path d="M24 15 V44" stroke="#1f5a44" stroke-width="2"/><ellipse cx="19" cy="25" rx="3" ry="6" fill="#7fd0a8" opacity=".6"/><circle cx="24" cy="29" r="2.4" fill="#f2c94c"/>`),
  lizard: svg(`<path d="M30 30 C38 34 42 40 44 46" fill="none" stroke="#c99a3a" stroke-width="4" stroke-linecap="round"/><g stroke="#a87a2a" stroke-width="3" stroke-linecap="round"><path d="M16 22 L9 17 M16 32 L9 37 M28 22 L35 17 M28 32 L35 37"/></g><ellipse cx="22" cy="27" rx="10" ry="6.5" fill="#e8b84a" stroke="#a87a2a" stroke-width="2"/><ellipse cx="10" cy="14" rx="6" ry="4.5" fill="#e8b84a" stroke="#a87a2a" stroke-width="2" transform="rotate(-30 10 14)"/><circle cx="8" cy="12" r="1.6" fill="#23313f"/><g fill="#c98a3a"><circle cx="19" cy="25" r="1.6"/><circle cx="24" cy="29" r="1.6"/><circle cx="26" cy="24" r="1.4"/></g>`),
  clownfish: svg(`<path d="M35 24 L46 15 L44 24 L46 33 Z" fill="#ff8a3a" stroke="#b8541f" stroke-width="2" stroke-linejoin="round"/><ellipse cx="22" cy="24" rx="16" ry="11" fill="#ff8a3a" stroke="#b8541f" stroke-width="2.2"/><path d="M15 14 Q13 24 15 34 L20 34.5 Q18 24 20 13.5 Z M27 13.5 Q25 24 27 34.5 L31 33 Q29.5 24 31 15 Z" fill="#fffaf0"/><ellipse cx="22" cy="24" rx="16" ry="11" fill="none" stroke="#b8541f" stroke-width="2.2"/><circle cx="11" cy="21" r="3" fill="#fff"/><circle cx="10.5" cy="21.4" r="1.8" fill="#23313f"/>`),
  koi: svg(`<path d="M34 24 L46 14 L43 24 L46 34 Z" fill="#ff7a3a" stroke="#c0541f" stroke-width="2" stroke-linejoin="round"/><ellipse cx="21" cy="24" rx="16" ry="10" fill="#fffaf0" stroke="#c0541f" stroke-width="2.2"/><ellipse cx="16" cy="20" rx="6" ry="4" fill="#ff7a3a"/><ellipse cx="27" cy="27" rx="5" ry="3.5" fill="#ff7a3a"/><circle cx="10" cy="22" r="2" fill="#23313f"/>`),
  carp: svg(`<path d="M34 24 L46 14 L43 24 L46 34 Z" fill="#a07a32" stroke="#7a5a20" stroke-width="2" stroke-linejoin="round"/><ellipse cx="21" cy="24" rx="16" ry="11" fill="#d9b25a" stroke="#7a5a20" stroke-width="2.2"/><path d="M14 18 Q21 15 28 18 M14 30 Q21 33 28 30" fill="none" stroke="#a07a32" stroke-width="1.6"/><path d="M19 13 L23 9 L25 13" fill="#a07a32"/><circle cx="10" cy="22" r="2" fill="#23313f"/>`),
  puffer: svg(`<g stroke="#b8862a" stroke-width="2" stroke-linecap="round"><path d="M24 6 V10 M24 38 V42 M8 24 H12 M12 12 L15 15 M12 36 L15 33 M36 12 L33 15 M36 36 L33 33"/></g><path d="M37 24 L45 17 L43 24 L45 31 Z" fill="#f6d55c" stroke="#b8862a" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="24" r="13" fill="#f6d55c" stroke="#b8862a" stroke-width="2.2"/><ellipse cx="23" cy="29" rx="8" ry="4.5" fill="#fff4c2"/><circle cx="18" cy="20" r="3.2" fill="#fff"/><circle cx="17.6" cy="20.4" r="1.9" fill="#23313f"/><circle cx="15" cy="27" r="1.6" fill="#f2a6a0"/>`),
  crab: svg(`<g stroke="#b8402a" stroke-width="2.4" stroke-linecap="round"><path d="M14 30 L6 34 M14 34 L7 40 M34 30 L42 34 M34 34 L41 40"/><path d="M15 24 L9 16 M33 24 L39 16"/></g><circle cx="8" cy="13" r="5" fill="#ef6a4a" stroke="#b8402a" stroke-width="2"/><circle cx="40" cy="13" r="5" fill="#ef6a4a" stroke="#b8402a" stroke-width="2"/><ellipse cx="24" cy="29" rx="13" ry="9" fill="#ef6a4a" stroke="#b8402a" stroke-width="2.2"/><path d="M20 21 V17 M28 21 V17" stroke="#b8402a" stroke-width="2"/><circle cx="20" cy="16" r="2.4" fill="#fff"/><circle cx="28" cy="16" r="2.4" fill="#fff"/><circle cx="20" cy="16" r="1.2" fill="#23313f"/><circle cx="28" cy="16" r="1.2" fill="#23313f"/><path d="M20 31 q4 3 8 0" fill="none" stroke="#b8402a" stroke-width="1.6" stroke-linecap="round"/>`),
  conch: svg(`<path d="M10 34 C6 20 18 6 32 9 C42 11 44 22 36 30 C30 36 18 40 10 34 Z" fill="#f6b8a8" stroke="#c97a68" stroke-width="2.2"/><path d="M14 31 C20 22 28 16 36 16 M17 34 C24 28 31 24 38 24" fill="none" stroke="#c97a68" stroke-width="1.8"/><ellipse cx="19" cy="30" rx="6" ry="4" fill="#ffe2d8" transform="rotate(-30 19 30)"/><path d="M32 9 L38 4" stroke="#c97a68" stroke-width="2.2" stroke-linecap="round"/>`),
  dragonfly: svg(`<g fill="#bfe6ff" stroke="#5aa8d8" stroke-width="1.6" opacity=".95"><ellipse cx="13" cy="15" rx="11" ry="4.5" transform="rotate(-12 13 15)"/><ellipse cx="35" cy="15" rx="11" ry="4.5" transform="rotate(12 35 15)"/><ellipse cx="14" cy="23" rx="10" ry="4" transform="rotate(10 14 23)"/><ellipse cx="34" cy="23" rx="10" ry="4" transform="rotate(-10 34 23)"/></g><rect x="22" y="12" width="4" height="33" rx="2" fill="#3fb39a" stroke="#2a7f6c" stroke-width="1.2"/><circle cx="24" cy="10" r="4.5" fill="#3fb39a" stroke="#2a7f6c" stroke-width="1.4"/><circle cx="22" cy="9" r="1.4" fill="#23313f"/><circle cx="26" cy="9" r="1.4" fill="#23313f"/>`),
};
for (const b of document.querySelectorAll('#toolPanel button[data-tool]')) b.innerHTML = ICONS[b.dataset.tool] || '';
document.getElementById('bagBtn').innerHTML = ICONS.bag;
{
  const pic = {
    bed: '<rect x="6" y="20" width="36" height="14" rx="3" fill="#c99a68"/><rect x="8" y="16" width="32" height="8" rx="3" fill="#fffaf0"/><rect x="22" y="15" width="18" height="10" rx="3" fill="#9fc8f0"/><rect x="5" y="12" width="5" height="24" rx="2" fill="#b08058"/>',
    window: '<rect x="9" y="8" width="30" height="30" rx="3" fill="#bfe6ff" stroke="#fffaf0" stroke-width="4"/><path d="M24 9 v28 M10 23 h28" stroke="#fffaf0" stroke-width="3"/><rect x="7" y="38" width="34" height="4" rx="2" fill="#a8744a"/>',
    lamp: '<path d="M16 10 h16 l5 12 h-26 z" fill="#ffe08a" stroke="#d9a020" stroke-width="2"/><path d="M24 22 v16" stroke="#a8744a" stroke-width="3"/><rect x="16" y="38" width="16" height="4" rx="2" fill="#a8744a"/>',
    table: '<rect x="6" y="16" width="36" height="6" rx="2" fill="#d0a274"/><path d="M11 22 v18 M37 22 v18" stroke="#a8744a" stroke-width="4" stroke-linecap="round"/>',
    chair: '<rect x="14" y="8" width="20" height="16" rx="3" fill="#f2c48a"/><rect x="12" y="24" width="24" height="6" rx="2" fill="#f2c48a"/><path d="M15 30 v12 M33 30 v12" stroke="#a8744a" stroke-width="3.5" stroke-linecap="round"/>',
    sofa: '<rect x="6" y="14" width="36" height="14" rx="5" fill="#8cc9b5"/><rect x="4" y="22" width="40" height="12" rx="4" fill="#9fd6c4"/><path d="M8 34 v4 M40 34 v4" stroke="#a8744a" stroke-width="3" stroke-linecap="round"/>',
    bookshelf: '<rect x="10" y="5" width="28" height="38" rx="2" fill="#b08058"/><rect x="13" y="8" width="22" height="9" fill="#fbf3df"/><rect x="13" y="20" width="22" height="9" fill="#fbf3df"/><rect x="13" y="32" width="22" height="8" fill="#fbf3df"/><path d="M15 9 v8 M19 9 v8 M23 21 v8 M27 21 v8 M16 33 v7" stroke="#f08a7a" stroke-width="3"/>',
    rug: '<ellipse cx="24" cy="26" rx="20" ry="13" fill="#f0a8b8"/><ellipse cx="24" cy="26" rx="14" ry="8" fill="#fbe3c8"/>',
    plant: '<path d="M16 30 h16 l-3 12 h-10 z" fill="#d07a50"/><circle cx="24" cy="20" r="9" fill="#6cc35a"/><circle cx="17" cy="16" r="6" fill="#4fa84a"/><circle cx="31" cy="15" r="6" fill="#93d86a"/>',
    picture: '<rect x="7" y="10" width="34" height="28" rx="2" fill="#a8744a"/><rect x="11" y="14" width="26" height="20" fill="#9fd3f5"/><path d="M11 34 q10 -12 18 -4 q4 -3 8 0 v4 z" fill="#8fd17a"/><circle cx="31" cy="19" r="3" fill="#ffd36a"/>',
  };
  const grid = document.querySelector('#buildPanel .catalog');
  if (grid) grid.innerHTML = Object.entries(ROOM_ITEM_LABELS).map(([k, label]) =>
    `<button type="button" class="card" data-item="${k}" title="${label}" aria-label="${label}"><svg viewBox="0 0 48 48" aria-hidden="true">${pic[k]}</svg><span>${label}</span></button>`).join('');
}
document.getElementById('toolBtn').innerHTML = ICONS.tools;

const toolSlot = new THREE.Group();
toolSlot.position.set(0, -0.3, 0.03); // in the right hand
toolSlot.rotation.x = Math.PI / 2 - 0.35; // shaft forward and slightly up
rig.armR.add(toolSlot);
const toolModels = {};
let currentTool = null;
let progressDirty = false; // backpack, energy or tool changed since the server last heard about it
function selectTool(kind) {
  if (bikeRide) { toast("Tools can't be used while riding"); return; }
  if (myBalloonSpot() !== null) { toast("Tools can't be used in the balloon"); return; }
  if (myBananaSeat() || isSwimming()) { toast("Tools can't be used in the water"); return; }
  if (volMine() !== null) { toast("Tools can't be used while playing volleyball"); return; }
  if (pianoMe()) { toast("Tools can't be used while playing the piano"); return; }
  if (kind === 'house' && currentTool !== 'house' && !(roomInfo && roomInfo.own)) { toast('The House Tool works inside your own house'); return; }
  const was = currentTool;
  currentTool = currentTool === kind ? null : kind;
  if (was === 'house' || currentTool === 'house') onHouseTool(currentTool === 'house');
  progressDirty = true;
  if (currentTool && !toolModels[currentTool]) toolModels[currentTool] = makeTool(currentTool);
  toolSlot.clear();
  if (currentTool) toolSlot.add(toolModels[currentTool]);
  document.querySelectorAll('#toolPanel button').forEach((b) => b.classList.toggle('selected', b.dataset.tool === currentTool));
}
{
  const panel = document.getElementById('toolPanel');
  document.getElementById('toolBtn').addEventListener('click', () => panel.classList.toggle('open'));
  panel.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    panel.classList.remove('open'); // the menu closes once a tool is picked (the House Tool opens its bar instead)
    selectTool(b.dataset.tool);
  }));
}
const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
shadowBlob.rotation.x = -Math.PI / 2;
scene.add(shadowBlob);

const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
scene.add(marker);

const walk = { target: null, item: null, phase: 0, speed: 0, heading: 0, pickT: 0 };
let myRoom = null; // the plot number of the house room we're inside, or null on the island
const WADE_DEPTH = -0.55; // deeper than this off the beach you swim (SWIM_Y below)
const beachSide = (x) => island.areaW(x).beach > 0.5;
const wading = (x, z) => myRoom === null && beachSide(x) && H(x, z) < 0 && H(x, z) > WADE_DEPTH;
function walkable(x, z) {
  if (myRoom !== null) return Math.abs(x) < ROOM_HALF - 0.3 && Math.abs(z) < ROOM_HALF - 0.3;
  return H(x, z) > 0.03 || onDock(x, z) || onBridge(x, z) !== null || inSwimZone(x, z);
}
function groundY(x, z) {
  if (myRoom !== null) return 0;
  if (onDock(x, z)) return DOCK_Y + 0.05;
  const b = onBridge(x, z);
  if (b === null && beachSide(x) && H(x, z) < 0) return Math.max(H(x, z), WADE_DEPTH); // feet on the sandy floor, shins in the water
  return b !== null ? Math.max(b, H(x, z)) : Math.max(H(x, z), 0);
}

// ---------------------------------------------------------------- birds & ambient life
const gulls = [];
for (let i = 0; i < 4; i++) {
  const g = makeGull();
  g.userData.orbit = { r: rr(40, 58), h: rr(10, 17), speed: rr(0.12, 0.2) * (i % 2 ? 1 : -1), ph: rr(0, TAU), wob: rr(0, TAU) };
  g.scale.setScalar(1.1);
  scene.add(g); gulls.push(g);
}
const transients = []; // {update(dt) -> bool alive}

const homeLamps = lampData.filter((l) => island.areaAt(l.pos.x, l.pos.z) === 'home'); // fireflies stay in the green area
const fireflyCount = homeLamps.length * 6 + 24;
const fireflies = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fireflyCount * 3), 3));
  const m = new THREE.PointsMaterial({ map: glowTex, size: 0.45, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff3a0 });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  const homes = [];
  for (let i = 0; i < fireflyCount; i++) {
    let home;
    if (i < homeLamps.length * 6) home = homeLamps[i % homeLamps.length].pos.clone().add(new THREE.Vector3(0, -0.8, 0));
    else { const t = trees[i % Math.max(1, trees.length)]; home = t ? t.position.clone().add(new THREE.Vector3(0, 1, 0)) : new THREE.Vector3(0, 1.5, 0); }
    homes.push({ home, ph: rr(0, TAU), r: rr(0.6, 1.8), sp: rr(0.3, 0.8) });
  }
  return { g, m, homes };
})();

// ---------------------------------------------------------------- time of day
const C = (h) => new THREE.Color(h);
const KEYS = [
  { name: 'Day', top: C(PALETTE.dayTop), bot: C(PALETTE.dayHorizon), fog: C(0xc0e6f7), sunCol: C(0xfff3dc), sunI: 2.8, hemiSky: C(0xd2ecff), hemiGround: C(0xe6d6a6), hemiI: 1.2,
    dir: new THREE.Vector3(0.45, 0.85, 0.35), water: C(0xffffff), lamp: 0, night: 0, sunVis: 1, foam: C(0xffffff), cloud: C(0xffffff), exposure: 1.0 },
  { name: 'Dusk', top: C(PALETTE.duskTop), bot: C(PALETTE.duskHorizon), fog: C(0xe8968a), sunCol: C(0xffa060), sunI: 2.1, hemiSky: C(0xffbca8), hemiGround: C(0x6e4c78), hemiI: 0.95,
    dir: new THREE.Vector3(-0.2, 0.18, -0.98), water: C(0xd8a8d0), lamp: 1, night: 0.25, sunVis: 1, foam: C(0xffe6d6), cloud: C(0xffb39a), exposure: 1.0 },
  { name: 'Night', top: C(PALETTE.nightTop), bot: C(PALETTE.nightHorizon), fog: C(0x1a3170), sunCol: C(0xa6c0ff), sunI: 0.75, hemiSky: C(0x4f6cb0), hemiGround: C(0x18203e), hemiI: 0.6,
    dir: new THREE.Vector3(0.3, 0.75, -0.6), water: C(0x4a6cc0), lamp: 1, night: 1, sunVis: 0, foam: C(0xbfd2ff), cloud: C(0x3a4a78), exposure: 1.1 },
];
// dawn: like dusk but cooler and pinker, with the sun low on the other side
KEYS.push({ ...KEYS[1], name: 'Sunrise', top: C(0x7f8fd0), bot: C(0xffc2a0), fog: C(0xf4c2b0), sunCol: C(0xffb98a), hemiSky: C(0xffd2c0), hemiGround: C(0x6f6a8a),
  dir: new THREE.Vector3(0.95, 0.2, -0.35), water: C(0xffd0c0), cloud: C(0xffc6b8) });
const SKY = [new THREE.Vector3(0.3, 0.75, -0.6), new THREE.Vector3(-0.2, 0.06, -0.98), new THREE.Vector3(0.0, -0.5, -0.8), new THREE.Vector3(0.75, 0.06, -0.66)];
KEYS.forEach((k, i) => { k.sky = SKY[i]; });
const DAY = 0, DUSK = 1, NIGHT = 2, DAWN = 3;

// ---- real Malaysia time (UTC+8, no daylight saving) and the sun over Kuala Lumpur
const MYT_OFFSET_MIN = 8 * 60;
const KL = { lat: 3.14, lon: 101.69 };
const worldClock = { skew: 0, override: null }; // skew: server clock minus ours; override: debug key preview
function nowMs() { return Date.now() + worldClock.skew; }
function syncClock(c) { if (c && Number.isFinite(c.now)) worldClock.skew = c.now - Date.now(); }
function mytParts(ms) {
  const d = new Date(ms + MYT_OFFSET_MIN * 60000); // shifted so the UTC getters read Malaysia wall time
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000) + 1;
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60, dayOfYear };
}
// NOAA's simplified solar equations; returns local (MYT) sunrise/sunset in minutes after midnight
function sunTimes(dayOfYear) {
  const g = (TAU / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = (KL.lat * Math.PI) / 180;
  const cosHa = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const ha = (Math.acos(clamp(cosHa, -1, 1)) * 180) / Math.PI;
  return { rise: 720 - 4 * (KL.lon + ha) - eqTime + MYT_OFFSET_MIN, set: 720 - 4 * (KL.lon - ha) - eqTime + MYT_OFFSET_MIN };
}
// sky keyframes over the local day, anchored on today's sunrise/sunset (minutes after midnight)
function skyBlend(minutes, sunrise, sunset) {
  const marks = [
    [sunrise - 50, NIGHT], [sunrise + 5, DAWN], [sunrise + 55, DAY],
    [sunset - 60, DAY], [sunset - 5, DUSK], [sunset + 45, NIGHT],
  ];
  if (minutes <= marks[0][0] || minutes >= marks[marks.length - 1][0]) return { a: NIGHT, b: NIGHT, w: 0 };
  for (let i = 0; i < marks.length - 1; i++) {
    const [t0, k0] = marks[i], [t1, k1] = marks[i + 1];
    if (minutes < t1) return { a: k0, b: k1, w: smooth(t0, t1, minutes) };
  }
  return { a: NIGHT, b: NIGHT, w: 0 };
}
let sunToday = { rise: 0, set: 0 };
const target = { top: new THREE.Color(), bot: new THREE.Color(), fog: new THREE.Color(), sunCol: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
  water: new THREE.Color(), foam: new THREE.Color(), cloud: new THREE.Color(), dir: new THREE.Vector3(), sunSky: new THREE.Vector3(), sunI: 0, hemiI: 0, lamp: 0, night: 0, sunVis: 0, exposure: 1, name: 'Day' };
const cur = { ...target };
for (const k of Object.keys(target)) if (target[k] && target[k].clone) cur[k] = target[k].clone();
const COLOR_KEYS = ['top', 'bot', 'fog', 'sunCol', 'hemiSky', 'hemiGround', 'water', 'foam', 'cloud'];
const NUM_KEYS = ['sunI', 'hemiI', 'lamp', 'night', 'sunVis', 'exposure'];
let clockInfo = mytParts(nowMs());
// evaluates the sky for the current Malaysia time (or the debug preview) and eases toward it;
// dt = 0 snaps, which is only used on the very first frame
function evalTime(dt) {
  clockInfo = mytParts(nowMs());
  sunToday = sunTimes(clockInfo.dayOfYear);
  const blend = worldClock.override !== null ? { a: worldClock.override, b: worldClock.override, w: 0 } : skyBlend(clockInfo.minutes, sunToday.rise, sunToday.set);
  const a = KEYS[blend.a], b = KEYS[blend.b], w = blend.w;
  for (const k of COLOR_KEYS) target[k].copy(a[k]).lerp(b[k], w);
  for (const k of NUM_KEYS) target[k] = lerp(a[k], b[k], w);
  target.dir.copy(a.dir).lerp(b.dir, w).normalize();
  target.sunSky.copy(a.sky).lerp(b.sky, w).normalize();
  cur.name = w < 0.5 ? a.name : b.name;
  // real time already moves smoothly; this also glides debug previews instead of cutting
  const k = dt > 0 ? 1 - Math.exp(-dt * 1.5) : 1;
  for (const c of COLOR_KEYS) cur[c].lerp(target[c], k);
  for (const n of NUM_KEYS) cur[n] = lerp(cur[n], target[n], k);
  cur.dir.lerp(target.dir, k).normalize();
  cur.sunSky.lerp(target.sunSky, k).normalize();
}
const hhmm = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
function clockText() {
  const t = `${String(clockInfo.h).padStart(2, '0')}:${String(clockInfo.m).padStart(2, '0')}`;
  return worldClock.override !== null ? `${t} MYT · previewing ${KEYS[worldClock.override].name}` : `${t} MYT · ${cur.name}`;
}
const _deserttint = new THREE.Color(0xffcf9a), _beachtint = new THREE.Color(0xbdf0ff);
function applyTime() {
  skyMat.uniforms.uTop.value.copy(cur.top);
  skyMat.uniforms.uBot.value.copy(cur.bot);
  skyMat.uniforms.uFog.value.copy(cur.fog);
  applyRoomLight();
  farSea.material.color.copy(cur.water);
  skyMat.uniforms.uSunCol.value.copy(cur.sunCol);
  skyMat.uniforms.uSunDir.value.copy(cur.sunSky);
  skyMat.uniforms.uSunVis.value = cur.sunVis;
  scene.fog.color.copy(cur.fog);
  const aw = island.areaW(player.position.x);
  if (aw.desert > 0) { scene.fog.color.lerp(_deserttint, aw.desert * 0.35); skyMat.uniforms.uBot.value.lerp(_deserttint, aw.desert * 0.3); }
  if (aw.beach > 0) { scene.fog.color.lerp(_beachtint, aw.beach * 0.25); skyMat.uniforms.uBot.value.lerp(_beachtint, aw.beach * 0.25); }
  renderer.setClearColor(cur.fog);
  sun.color.copy(cur.sunCol); sun.intensity = cur.sunI;
  hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemiI;
  if (aw.desert > 0) { hemi.color.lerp(_deserttint, aw.desert * 0.25); sun.intensity *= 1 + aw.desert * 0.12; }
  waterMat.color.copy(cur.water);
  riverMat.uniforms.uTint.value.copy(cur.water); riverMat.uniforms.uLamp.value = cur.lamp;
  causticsMat.uniforms.uTint.value.copy(cur.water); causticsMat.uniforms.uDay.value = 1 - cur.lamp * 0.75;
  for (const f of [foamA, foamB, foamEvent]) f.uniforms.uColor.value.copy(cur.foam);
  cloudMat.color.copy(cur.cloud);
  renderer.toneMappingExposure = cur.exposure;
  stars.opacity = smooth(0.5, 1, cur.night);
  const moonDir = new THREE.Vector3(-0.5, 0.45, -0.75).normalize();
  moon.position.copy(moonDir).multiplyScalar(420);
  moon.material.opacity = smooth(0.3, 0.9, cur.night);
  moonGlow.position.copy(moonDir).multiplyScalar(410);
  moonGlow.material.opacity = smooth(0.3, 1, cur.night) * 0.7;
  moon.visible = moonGlow.visible = cur.night > 0.3;
  M.lantern.emissiveIntensity = cur.lamp * 2.4;
  M.window.emissiveIntensity = cur.lamp * 1.6;
  for (const l of lampData) { if (l.light) l.light.intensity = cur.lamp * 7; l.glow.material.opacity = cur.lamp * 0.85; }
  fireflies.m.opacity = smooth(0.15, 0.9, cur.lamp * 0.4 + cur.night * 0.6);
}

// ---------------------------------------------------------------- UI
const clockEl = document.getElementById('clockName');
const sunEl = document.getElementById('sunTimes');
const toastEl = document.getElementById('toast');
// the backpack holds everything picked up from the ground (`pocket` counts per kind)
const BAG_LABELS = { shell: 'Seashells', star: 'Starfish', coconut: 'Coconuts', mango: 'Mangoes', pineapple: 'Pineapples', smallfish: 'Small fish', bigfish: 'Big fish', carrot: 'Carrots', tomato: 'Tomatoes', cabbage: 'Cabbages', flower: 'Flowers',
  butterfly: 'Butterflies', beetle: 'Beetles', dragonfly: 'Dragonflies', scarab: 'Scarabs', lizard: 'Sand lizards', crab: 'Crabs', conch: 'Conch shells', clownfish: 'Clownfish', puffer: 'Pufferfish', koi: 'Koi', carp: 'Carp' };
const bagEl = document.getElementById('bagPanel');
const FOODS = new Set(['coconut', 'mango', 'pineapple', 'carrot', 'tomato', 'cabbage']); // can be eaten from the backpack
const FOOD_ENERGY = 15; // fruit; crops give less (foodEnergy), as on the server
const foodEnergy = (k) => (['carrot', 'tomato', 'cabbage'].includes(k) ? 8 : FOOD_ENERGY);
function renderPocket() {
  progressDirty = true;
  // one slot per kind you own, padded with empty slots to full rows of three (at least a 3 x 3 grid)
  const kinds = Object.keys(KINDS).filter((k) => pocket[k] > 0);
  const slots = kinds.map((k) => {
    const label = BAG_LABELS[k] || k;
    return FOODS.has(k)
      ? `<button class="slot eat" data-kind="${k}" title="${label}: click to eat (+${foodEnergy(k)} energy)" aria-label="${label} ${pocket[k]}, click to eat">${ICONS[k] || ''}<b>${pocket[k]}</b></button>`
      : `<div class="slot" title="${label}" aria-label="${label} ${pocket[k]}">${ICONS[k] || ''}<b>${pocket[k]}</b></div>`;
  });
  const total = Math.max(9, Math.ceil(slots.length / 3) * 3);
  while (slots.length < total) slots.push('<div class="slot"></div>');
  bagEl.innerHTML = `<button class="close" title="Close" aria-label="Close backpack">${ICONS.close}</button><h3>Backpack</h3><div class="grid">${slots.join('')}</div>`
    + (kinds.length ? (kinds.some((k) => FOODS.has(k)) ? '<div class="hint">Click fruit or veggies to eat them</div>' : '')
      : '<div class="empty">Your backpack is empty. Pick up shells, fruit and flowers to fill it!</div>');
}
{
  const toolPanel = document.getElementById('toolPanel');
  const bagBtn = document.getElementById('bagBtn'), toolBtn = document.getElementById('toolBtn');
  // the round buttons glow while their panel is open
  const syncButtons = () => { bagBtn.classList.toggle('active', bagEl.classList.contains('open')); toolBtn.classList.toggle('active', toolPanel.classList.contains('open')); };
  bagBtn.addEventListener('click', () => { bagEl.classList.toggle('open'); toolPanel.classList.remove('open'); syncButtons(); });
  toolBtn.addEventListener('click', () => { bagEl.classList.remove('open'); syncButtons(); });
  bagEl.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    if (e.target.closest('.close')) { bagEl.classList.remove('open'); syncButtons(); return; }
    const slot = e.target.closest('.slot.eat');
    if (slot) openEatPopup(slot.dataset.kind); // food only; other slots aren't clickable
  });
}

// energy: starts full; nothing uses it yet (tools will)
const ENERGY_MAX = 100;
let energy = ENERGY_MAX;
function renderEnergy() {
  progressDirty = true;
  document.getElementById('energyFill').style.width = `${(energy / ENERGY_MAX) * 100}%`;
  document.getElementById('energyText').textContent = `${Math.round(energy)}`;
}
renderEnergy();
renderPocket();
let toastTimer = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); toastTimer = 3.2; }

// ---------------------------------------------------------------- events: little things happening
function eventGullFlyby() {
  const g = makeGull();
  const a = rr(0, TAU), from = new THREE.Vector3(Math.cos(a) * 45, rr(5, 9), Math.sin(a) * 45);
  const to = new THREE.Vector3(-from.x + rr(-10, 10), from.y + rr(-1, 2), -from.z + rr(-10, 10));
  scene.add(g);
  let t = 0; const dur = 11;
  transients.push((dt, time) => {
    t += dt;
    const u = t / dur;
    g.position.lerpVectors(from, to, u);
    g.position.y += Math.sin(u * Math.PI) * 2;
    g.lookAt(to.x, g.position.y, to.z);
    flapGull(g, time * 1.3 + 2, 1.2);
    if (u >= 1) { scene.remove(g); return false; }
    return true;
  });
  return 'A seagull glides past';
}
function eventWave() {
  let t = 0; const dur = 5;
  transients.push((dt) => {
    t += dt; const u = t / dur;
    foamEvent.uniforms.uOffset.value = lerp(3.5, -0.4, smooth(0, 1, u));
    foamEvent.uniforms.uWidth.value = lerp(1.3, 2.2, u);
    foamEvent.uniforms.uAlpha.value = Math.sin(Math.min(u, 1) * Math.PI) * 0.95;
    if (u >= 1) { foamEvent.uniforms.uAlpha.value = 0; return false; }
    return true;
  });
  return 'A big wave rolls onto the beach';
}
function eventFirefly() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  s.scale.set(0.6, 0.6, 1);
  const start = player.position.clone().add(new THREE.Vector3(rr(-4, 4), 0.6, rr(-4, 4)));
  const drift = new THREE.Vector3(rr(-1, 1), 0.35, rr(-1, 1));
  scene.add(s);
  let t = 0; const dur = 8;
  transients.push((dt) => {
    t += dt; const u = t / dur;
    s.position.copy(start).addScaledVector(drift, t).add(new THREE.Vector3(Math.sin(t * 2.1) * 0.4, Math.sin(t * 3.3) * 0.2, Math.cos(t * 1.7) * 0.4));
    s.material.opacity = Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(t * 6));
    if (u >= 1) { scene.remove(s); s.material.dispose(); return false; }
    return true;
  });
  return 'A firefly drifts by';
}
function eventFish() {
  const th = rr(0, TAU), r = coastR(th) * rr(1.15, 1.6);
  const x = Math.cos(th) * r, z = Math.sin(th) * r, heading = rr(0, TAU);
  const fish = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.18, 8, 6), mat('#7fb6e0')); body.scale.set(0.6, 0.8, 1.6); fish.add(body);
  const tail = mesh(new THREE.ConeGeometry(0.14, 0.22, 4), mat('#7fb6e0'), 0, 0, -0.32); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; fish.add(tail);
  scene.add(fish);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  let t = 0; const dur = 1.2;
  transients.push((dt) => {
    t += dt; const u = Math.min(t / dur, 1);
    const along = (u - 0.5) * 2.2;
    fish.position.set(x + Math.sin(heading) * along, Math.sin(u * Math.PI) * 1.3 - 0.2, z + Math.cos(heading) * along);
    fish.rotation.set(-Math.cos(u * Math.PI) * 1.1, heading, 0);
    fish.visible = u < 1;
    const rt = Math.max(0, t - dur * 0.9);
    ring.position.set(x + Math.sin(heading) * 1.1, 0.12, z + Math.cos(heading) * 1.1);
    ring.scale.setScalar(1 + rt * 4); ring.material.opacity = rt > 0 ? Math.max(0, 0.8 - rt * 0.8) : 0;
    if (t > dur + 1.2) { scene.remove(fish, ring); ring.geometry.dispose(); ring.material.dispose(); return false; }
    return true;
  });
  return 'Splash! A fish jumps out of the water';
}
let nextEvent = 4;
function triggerEvent() {
  const pool = [eventGullFlyby, eventWave, eventFish];
  if (cur.lamp > 0.5) pool.push(eventFirefly, eventFirefly);
  toast(pick(pool)());
}

// ---------------------------------------------------------------- input
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downPos = null;
function setNdc(e) { ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera); }
function itemUnder() {
  const hits = raycaster.intersectObjects(pickGroup.children, true);
  for (const h of hits) { const it = h.object.userData.item; if (it && it.state === 'idle') return it; }
  return null;
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) { downPos = null; return; }
  downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  // only a quick tap walks or uses a tool: under 8px of movement and under 250ms; drags (camera) and pinches don't
  if (pinch.used || !downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > DRAG_START_PX || performance.now() - downPos.t > TAP_MAX_MS) { downPos = null; return; }
  downPos = null;
  setNdc(e);
  if (fishing) { strike(); return; } // while the line is out, any click is the strike
  if (bikeRide) { if (dlg.npc) endTalk(); bikeTap(); return; } // riding: tap the ground to ride there
  if (myBalloonSpot() !== null) return; // in the balloon: the floating buttons do everything
  if (myBananaSeat()) return; // on the banana boat: hold on!
  if (volMine() !== null) { if (dlg.npc) endTalk(); volleyTap(); return; } // on the volleyball court: move on your half, aim at theirs
  if (isSwimming()) { if (dlg.npc) endTalk(); swimTap(); return; } // swimming: just swim where you tap
  if (myRide) { // tapping the ground: off the merry-go-round (the Ferris wheel finishes its turn first)
    if (myRide.kind === 'carousel') net.send({ t: 'rideOff' }); else toast('Enjoy the view! You step off after one full turn');
    return;
  }
  if (mySeat !== null) standUp();
  if (pianoMe()) pianoStand(); // tapping the ground: up from the piano bench
  walk.seat = null; walk.door = null; walk.exitDoor = null; walk.waterSpot = null; walk.balloon = false; walk.route = null; walk.piano = false;
  if (myRoom !== null) { roomTap(); return; }
  walk.talk = null;
  if (boTap()) return; // Bo: open the sell panel (or walk over to him)
  if (rideTap()) return; // the Ferris wheel or the merry-go-round: board it (or walk over first)
  if (npcTap()) return; // a shopkeeper: walk up and talk
  if (dlg.npc) endTalk(); // tapping anywhere else ends the conversation
  if (waterTap()) return; // the Watering Can on a garden square or island plant
  if (gardenTap()) return;
  if (currentTool === 'net') {
    const bug = bugNear();
    if (bug) {
      if (energy < NET_COST) { toast('Too tired, eat something'); return; }
      walk.item = null; walk.tree = null; walk.cast = null; walk.water = null; walk.bug = bug;
      walk.target = new THREE.Vector3(bug.obj.position.x, 0, bug.obj.position.z);
      return;
    }
  }
  const it = itemUnder();
  if (it && currentTool === 'can' && it.kind === 'flower') {
    if (energy < WATER_COST) { toast('Too tired, eat something'); return; }
    walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = it;
    walk.target = new THREE.Vector3(it.x, 0, it.z);
    showMarker(it.x, it.z);
    return;
  }
  if (it) {
    walk.item = it; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.target = new THREE.Vector3(it.x, 0, it.z);
    showMarker(it.x, it.z);
    return;
  }
  const tree = currentTool === 'axe' ? treeUnder() : null;
  if (tree) {
    if (energy < SWING_COST) { toast('Too tired, eat something'); return; }
    walk.item = null; walk.tree = tree; walk.cast = null; walk.bug = null; walk.water = null; walk.target = new THREE.Vector3(tree.obj.position.x, 0, tree.obj.position.z);
    showMarker(tree.obj.position.x, tree.obj.position.z);
    return;
  }
  const hits = raycaster.intersectObjects([terrain, dockClick, pier2.click, ...deckClicks], false);
  if (!hits.length) return;
  const p = hits[0].point, onDeckHit = hits[0].object.userData.deck;
  if (currentTool === 'rod' && walk.deck != null && onDeckHit === undefined && !walkable(p.x, p.z) && H(p.x, p.z) < 0) {
    if (Math.hypot(p.x - player.position.x, p.z - player.position.z) > CAST_RANGE) { toast('Too far out, try closer to the dock'); return; }
    if (energy < CAST_COST) { toast('Too tired, eat something'); return; }
    walk.target = null; walk.route = null; startCast(new THREE.Vector3(p.x, 0, p.z)); showMarker(p.x, p.z);
    return;
  }
  if (onDeckHit !== undefined || walk.deck != null) {
    const to = onDeckHit !== undefined ? onDeckHit : -1;
    if (to === -1 && !walkable(p.x, p.z)) return;
    const route = levelRoute(walk.deck ?? -1, to, p.x, p.z);
    if (!route) return;
    walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null;
    walk.target = new THREE.Vector3(route[0].x, 0, route[0].z); walk.route = route.slice(1);
    showMarker(p.x, p.z); if (onDeckHit !== undefined) marker.position.y = deckY(DECKS[to], p.x, p.z) + 0.05;
    return;
  }
  if (currentTool === 'rod' && !walkable(p.x, p.z)) {
    const spot = shoreSpotToward(p);
    if (!spot || Math.hypot(p.x - spot.x, p.z - spot.z) > CAST_RANGE) { toast('Too far out, try the water near the shore'); return; }
    if (energy < CAST_COST) { toast('Too tired, eat something'); return; }
    walk.item = null; walk.tree = null; walk.bug = null; walk.water = null; walk.cast = new THREE.Vector3(p.x, 0, p.z);
    walk.target = new THREE.Vector3(spot.x, 0, spot.z);
    showMarker(p.x, p.z);
    return;
  }
  if (!walkable(p.x, p.z)) {
    // clicked the water: walk to the nearest shore along the ray toward it (or the buoys, off the beach)
    if (beachSide(p.x)) tooDeep();
    const dir = new THREE.Vector3(p.x - player.position.x, 0, p.z - player.position.z);
    const len = dir.length(); dir.normalize();
    let last = null;
    for (let s = 0; s < len; s += 0.2) { const x = player.position.x + dir.x * s, z = player.position.z + dir.z * s; if (walkable(x, z)) last = { x, z }; else break; }
    if (!last) return;
    p.x = last.x; p.z = last.z;
  }
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.target = new THREE.Vector3(p.x, 0, p.z);
  showMarker(p.x, p.z);
});
function treeUnder() {
  const hits = raycaster.intersectObjects(fruitTrees.map((t) => t.obj), true);
  return hits.length ? hits[0].object.userData.fruitTree || null : null;
}
let hoverPending = null;
renderer.domElement.addEventListener('pointermove', (e) => { hoverPending = e; });
function showMarker(x, z) { marker.position.set(x, groundY(x, z) + 0.05, z); marker.userData.t = 0; marker.material.opacity = 0.9; }

// ---------------------------------------------------------------- camera zoom: mouse wheel, touch pinch, touchpad pinch
// zoom scales the camera's offset from the character. Bigger = farther away (the island looks smaller).
// It eases toward zoomTarget each frame, so every input feels smooth.
const ZOOM_MIN = 0.5, ZOOM_MAX = 7, ZOOM_DEFAULT = 1.35; // ~9 to ~125 units from the character; starts at ~24
let zoom = ZOOM_DEFAULT, zoomTarget = ZOOM_DEFAULT;
const setZoomTarget = (z) => { zoomTarget = clamp(z, ZOOM_MIN, ZOOM_MAX); };
const wheelPixels = (e) => e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  // a touchpad pinch arrives as a wheel event with ctrlKey: fingers apart (deltaY < 0) zooms IN, like the touch screen
  if (e.ctrlKey) setZoomTarget(zoomTarget * Math.exp(wheelPixels(e) * 0.01));
  else setZoomTarget(zoomTarget * Math.exp(clamp(wheelPixels(e), -300, 300) * 0.0015)); // scroll down = zoom out
}, { passive: false });
// ctrl+wheel anywhere would zoom the whole page: never let the browser do that
window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// two fingers on a touch screen, like phone apps: spreading zooms in (closer), pinching zooms out (farther)
const pinch = { pointers: new Map(), startDist: 0, startZoom: ZOOM_DEFAULT, used: false };
const fingerSpread = () => { const [a, b] = [...pinch.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch.pointers.size === 2) {
    pinch.startDist = Math.max(10, fingerSpread()); pinch.startZoom = zoomTarget;
    pinch.used = true; // this touch is a pinch now, so lifting the fingers must not walk
    downPos = null;
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!pinch.pointers.has(e.pointerId)) return;
  pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // camera distance = |camOffset| * zoom, and zoom is inversely proportional to the finger spread:
  // spread up (fingers apart) -> camera closer; spread down (pinching) -> camera farther
  if (pinch.pointers.size === 2) setZoomTarget(pinch.startZoom * (pinch.startDist / Math.max(10, fingerSpread())));
});
const endTouch = (e) => {
  if (!pinch.pointers.delete(e.pointerId)) return;
  if (pinch.pointers.size === 2) { pinch.startDist = Math.max(10, fingerSpread()); pinch.startZoom = zoomTarget; }
  if (pinch.pointers.size === 0) pinch.used = false;
};
renderer.domElement.addEventListener('pointerup', endTouch);
renderer.domElement.addEventListener('pointercancel', endTouch);
// Safari on a Mac touchpad reports pinches only as gesture events (scale > 1 = fingers apart = zoom in).
// iOS Safari sends these too, alongside the touch pointers above; there the pointers already drive the zoom,
// so the gesture events are ignored instead of fighting them from a different starting point.
let gestureStartZoom = ZOOM_DEFAULT;
renderer.domElement.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureStartZoom = zoomTarget; });
renderer.domElement.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  if (pinch.pointers.size > 0 || !(e.scale > 0)) return;
  setZoomTarget(gestureStartZoom / e.scale);
});
// The browser must never zoom the page during a pinch: page zoom magnifies everything while the camera
// moves, and the two fight each other.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', (e) => {
  // debug preview, local to this viewer: 1/2/3 show day, dusk, night; 0 returns to real Malaysia time
  const map = { '1': DAY, '2': DUSK, '3': NIGHT, '0': null };
  if (!(e.key in map) || (e.target && e.target.tagName === 'INPUT')) return; // typing in the login form
  worldClock.override = map[e.key];
  toast(map[e.key] === null ? 'Back to real Malaysia time' : `Previewing ${KEYS[map[e.key]].name.toLowerCase()} (press 0 for real time)`);
});
// on a phone (no number keys): tap the clock to preview night, dusk, day, then back to real time (only on your screen)
document.getElementById('clock').addEventListener('click', (e) => {
  e.stopPropagation();
  const order = [null, NIGHT, DUSK, DAY], next = order[(order.indexOf(worldClock.override) + 1) % order.length];
  worldClock.override = next;
  toast(next === null ? 'Back to real Malaysia time' : `Previewing ${KEYS[next].name.toLowerCase()} (tap the clock again to change)`);
});
// the game fills the whole window at the device's pixel ratio; refit on resize, rotation and mobile UI bars
function fitToWindow() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', fitToWindow);
window.addEventListener('orientationchange', () => setTimeout(fitToWindow, 250)); // some phones report the new size late
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToWindow);
fitToWindow();

// ---------------------------------------------------------------- update
// ---------------------------------------------------------------- orbit camera
// The camera sits on a sphere around the character: yaw (all the way round) and pitch (tilt), at zoom times
// CAM_DIST. It starts where the old fixed camera was (behind and above, looking toward -z).
const CAM_DIST = Math.hypot(11, 14);
// a high-angle, top-down style view; the tilt stays high so the camera never drops to a low angle
const PITCH_MIN = THREE.MathUtils.degToRad(35), PITCH_MAX = THREE.MathUtils.degToRad(80);
const PITCH_DEFAULT = THREE.MathUtils.degToRad(55);
const CAM_TARGET_Y = 0.8; // looks at the character's middle
const orbit = { yaw: 0, pitch: PITCH_DEFAULT, vYaw: 0, vPitch: 0, drag: null };
const camOffset = new THREE.Vector3();
function updateCamOffset() {
  const c = Math.cos(orbit.pitch);
  camOffset.set(Math.sin(orbit.yaw) * c, Math.sin(orbit.pitch), Math.cos(orbit.yaw) * c).multiplyScalar(CAM_DIST);
}
updateCamOffset();
const camLook = new THREE.Vector3(); // the point the camera looks at: trails the character smoothly
// a new session (login, refresh, joining): the character faces the plaza and the camera starts right behind it
function faceThePlaza() {
  walk.heading = Math.atan2(TOWN.x - player.position.x, TOWN.z - player.position.z);
  player.rotation.y = walk.heading;
}
function resetCameraBehind() {
  orbit.yaw = walk.heading + Math.PI; // behind: opposite the way the character faces
  orbit.pitch = PITCH_DEFAULT; orbit.vYaw = orbit.vPitch = 0;
  zoom = zoomTarget = ZOOM_DEFAULT;
  updateCamOffset();
  camLook.copy(player.position).add(new THREE.Vector3(0, CAM_TARGET_Y, 0));
  camera.position.copy(camLook).addScaledVector(camOffset, zoom);
  camera.lookAt(camLook);
}
faceThePlaza();
resetCameraBehind();

// one finger or the left mouse button dragging on the game rotates (sideways) and tilts (up/down) the camera.
// A drag only counts once it has moved 8px, so a tap's wobble still walks; a second finger cancels it (pinch).
const ORBIT_YAW_SPEED = 0.0065, ORBIT_PITCH_SPEED = 0.0045; // radians per pixel
const DRAG_START_PX = 8, TAP_MAX_MS = 250;
const ORBIT_SPIN_MAX = 3, ORBIT_SPIN_FADE = 6; // rad/s at release, and how fast it fades (coasting <= MAX / FADE rad)
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (pinch.pointers.size >= 2 || pinch.used) { orbit.drag = null; return; }
  if (furnitureClaims(e)) { orbit.drag = null; return; } // pressing furniture with the House Tool moves it, not the camera
  orbit.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  orbit.vYaw = orbit.vPitch = 0; // grabbing stops any leftover spin
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const d = orbit.drag;
  if (!d || e.pointerId !== d.id) return;
  if (pinch.pointers.size >= 2 || pinch.used) { orbit.drag = null; return; } // two fingers: that's a pinch
  if (!d.moved) {
    if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START_PX) return; // finger wobble
    d.moved = true;
    downPos = null; // this press is a drag now: it must not walk or use a tool when released
  }
  const now = performance.now(), dt = Math.max(1, now - d.t) / 1000;
  const dYaw = -(e.clientX - d.x) * ORBIT_YAW_SPEED, dPitch = (e.clientY - d.y) * ORBIT_PITCH_SPEED;
  orbit.yaw += dYaw;
  orbit.pitch = clamp(orbit.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  // a smoothed speed for the little spin that continues after letting go
  orbit.vYaw = lerp(orbit.vYaw, dYaw / dt, 0.4); orbit.vPitch = lerp(orbit.vPitch, dPitch / dt, 0.4);
  d.x = e.clientX; d.y = e.clientY; d.t = now;
});
const endOrbitDrag = (e) => {
  const d = orbit.drag;
  if (!d || e.pointerId !== d.id) return;
  if (!d.moved || performance.now() - d.t > 80) orbit.vYaw = orbit.vPitch = 0; // held still before letting go: no spin
  // a little inertia only: even a hard flick coasts at most ~30 degrees
  orbit.vYaw = clamp(orbit.vYaw, -ORBIT_SPIN_MAX, ORBIT_SPIN_MAX); orbit.vPitch = clamp(orbit.vPitch, -ORBIT_SPIN_MAX / 2, ORBIT_SPIN_MAX / 2);
  orbit.drag = null;
};
renderer.domElement.addEventListener('pointerup', endOrbitDrag);
renderer.domElement.addEventListener('pointercancel', endOrbitDrag);
renderer.domElement.addEventListener('lostpointercapture', endOrbitDrag);

function updatePlayer(dt, time) {
  let moving = false;
  if (bikeRide) { updateBikeRide(dt, time); return; }
  if (myBalloonSpot() !== null) { updateBalloonRider(dt, time); return; }
  if (myBananaSeat()) { updateBananaRider(dt, time); return; }
  if (pianoMe()) { // at the piano: on the bench, hands on the keys
    placeAtPiano(player, rig, net.id, dt, time);
    walk.heading = player.rotation.y; walk.moving = false; walk.speed = 0; walk.target = null;
    shadowBlob.position.set(player.position.x, groundY(player.position.x, player.position.z) + 0.03, player.position.z);
    return;
  }
  if (myRide) { // on a ride: carried along, the camera follows
    placeRiding(player, rig, myRide.kind, myRide.seat, dt, time);
    walk.heading = player.rotation.y; walk.moving = false; walk.speed = 0; walk.target = null;
    shadowBlob.position.set(player.position.x, groundY(player.position.x, player.position.z) + 0.03, player.position.z);
    return;
  }
  if (mySeat !== null) {
    placeSeated(player, rig, seatSpots[mySeat], dt, time);
    walk.heading = player.rotation.y; walk.moving = false; walk.speed = 0;
    shadowBlob.position.set(player.position.x, groundY(player.position.x, player.position.z) + 0.03, player.position.z);
    return;
  }
  if (walk.deck != null && (myRoom !== null || !deckHas(DECKS[walk.deck], player.position.x, player.position.z, 0.05))) walk.deck = null; // moved some other way
  if (walk.bug) { // chase the bug as it moves
    if (!walk.bug.active) { walk.bug = null; walk.target = null; }
    else if (walk.target) walk.target.set(walk.bug.obj.position.x, 0, walk.bug.obj.position.z);
  }
  if (walk.target) {
    const dx = walk.target.x - player.position.x, dz = walk.target.z - player.position.z, dist = Math.hypot(dx, dz);
    const stopAt = walk.item ? 0.7 : walk.tree ? walk.tree.reach : walk.bug ? 0.9 : walk.water ? 0.8 : walk.seat || walk.piano || walk.door || walk.exitDoor ? 0.35 : walk.talk ? 0.15 : 0.08;
    if (walk.item && !walk.item.active) { walk.item = null; walk.target = null; }
    // stuck against an obstacle (rock, umbrella...): give up the walk, or act from here if close enough
    // round anything in the way (hedges, buildings, trees): follow the planned path's next waypoint
    const wp = myRoom === null && walk.deck == null && !(beachSide(player.position.x) && (H(player.position.x, player.position.z) < 0.03 || H(walk.target.x, walk.target.z) < 0.03)) ? navWaypoint() : null; // in the sea: straight there
    const sx = wp ? wp.x - player.position.x : dx, sz = wp ? wp.z - player.position.z : dz, sd = Math.max(1e-4, Math.hypot(sx, sz));
    const gauge = wp ? sd : dist;
    if (walk.lastDist !== undefined && walk.lastDist - gauge < 0.002) walk.stuckT = (walk.stuckT || 0) + dt; else walk.stuckT = 0;
    walk.lastDist = gauge;
    const stuck = walk.stuckT > 0.4;
    if (stuck && (dist > stopAt + 1.5 || wp)) {
      if (walk.item || walk.tree || walk.cast || walk.bug || walk.water || walk.seat || walk.piano || walk.door) toast("Can't reach it from here, try another way");
      walk.piano = false; walk.seat = null; walk.door = null; walk.exitDoor = null; walk.talk = null; walk.route = null;
      walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.stuckT = 0; walk.lastDist = undefined; }
    else if ((dist <= stopAt || (stuck && !wp)) && walk.route && walk.route.length) { // next leg: up or down the stairs, over a bridge
      const n = walk.route.shift(); walk.target.set(n.x, 0, n.z); walk.stuckT = 0; walk.lastDist = undefined;
    }
    else if (dist <= stopAt || (stuck && !wp)) {
      walk.stuckT = 0; walk.lastDist = undefined;
      if (walk.item) collect(walk.item);
      if (walk.tree) startSwing(walk.tree);
      const { cast, bug, water, seat, door, exitDoor, waterSpot, talk, ride } = walk, pianoGo = walk.piano;
      walk.ride = null; walk.piano = false;
      if (pianoGo) pianoRequest(); // reached the piano bench: sit down and play
      if (ride && rideReach(ride, player.position)) boardRide(ride);
      walk.talk = null;
      if (talk) { walk.heading = Math.atan2(talk.g.position.x - player.position.x, talk.g.position.z - player.position.z); startTalk(talk); }
      walk.waterSpot = null;
      if (waterSpot) startGardenPour(waterSpot);
      walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null;
      walk.door = null; walk.exitDoor = null;
      if (seat) requestSit(seat);
      if (walk.balloon) { walk.balloon = false; balloonSend({ t: 'balloonBoard' }); } // reached the basket: step in
      if (door) requestEnter(door);
      if (exitDoor && net.online) { net.send({ t: 'exit' }); awaitRoomReply(); }
      if (cast) startCast(cast);
      if (bug) startNetSwing(bug);
      if (water) startPour(water);
    } else {
      moving = true;
      const swimSlow = swimming(player.position.x, player.position.z), inWater = wading(player.position.x, player.position.z) || swimSlow;
      // how fast: a walk for short taps, a run for far ones (blended in between), easing to a walk and a stop at the end.
      // Only on open ground: in the water, on decks, stairs and jetties, and on the volleyball court it stays as it was.
      const left = dist + (walk.route || []).reduce((a, q, i, arr) => a + Math.hypot(q.x - (i ? arr[i - 1].x : walk.target.x), q.z - (i ? arr[i - 1].z : walk.target.z)), 0);
      const canRun = !inWater && myRoom === null && walk.deck == null && !(walk.route && walk.route.length) && volMine() === null;
      walk.run = canRun ? smooth(MOVE.runFrom - 2, MOVE.runFull, left) : 0;
      const wantV = swimSlow ? 1.5 : inWater ? 1.6 : volMine() !== null ? 5 : Math.min(lerp(MOVE.walk, MOVE.run, walk.run), MOVE.walk * 0.45 + left * 1.1);
      walk.speed = walk.speed < wantV ? Math.min(wantV, walk.speed + dt * (volMine() !== null ? 16 : walk.speed < MOVE.walk ? 10 : MOVE.accel)) : Math.max(wantV, walk.speed - dt * MOVE.decel);
      if (inWater) { walk.rippleT = (walk.rippleT || 0) - dt; if (walk.rippleT <= 0) { walk.rippleT = 0.32; ripple(player.position.x, player.position.z, 0.35); } }
      const step = Math.min(wp ? sd : dist - stopAt * 0.5, walk.speed * dt);
      const nx = player.position.x + (sx / sd) * step, nz = player.position.z + (sz / sd) * step;
      let px = nx, pz = nz;
      const wet = myRoom === null && walk.deck == null && H(player.position.x, player.position.z) < 0.03 && !onDock(player.position.x, player.position.z);
      for (const c of (myRoom !== null ? roomColliders : colliders)) {
        if (c.lvl === 'w' ? !wet : c.lvl && (c.lvl === 'g') !== (walk.deck == null)) continue; // only what's solid on your own level ('w': in the water)
        const ox = px - c.x, oz = pz - c.z, d = Math.hypot(ox, oz), rad = c.r + 0.25;
        if (d < rad && d > 1e-4) { px = c.x + (ox / d) * rad; pz = c.z + (oz / d) * rad; }
      }
      const lv = walk.deck ?? -1, curY = lv >= 0 ? deckY(DECKS[lv], player.position.x, player.position.z) : groundY(player.position.x, player.position.z);
      const climb = !!(walk.route && walk.route.length) || (walk.deck == null && !!walk.target && DECKS.some((d) => deckHas(d, walk.target.x, walk.target.z) && Math.abs(deckY(d, walk.target.x, walk.target.z) - curY) < 0.5)); // or heading onto a dock or jetty at about your height
      let to;
      if ((to = standAt(px, pz, lv, curY, climb)) !== null) { player.position.x = px; player.position.z = pz; }
      else if ((to = standAt(nx, pz, lv, curY, climb)) !== null) player.position.x = nx;
      else if ((to = standAt(px, nz, lv, curY, climb)) !== null) player.position.z = nz;
      else { if (wet && beachSide(player.position.x)) tooDeep(); walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.route = null; }
      if (to !== null) walk.deck = to >= 0 ? to : null;
      const want = Math.atan2(sx, sz);
      let diff = ((want - walk.heading + Math.PI) % TAU + TAU) % TAU - Math.PI;
      walk.heading += diff * Math.min(1, dt * 10);
    }
  }
  if (!moving) { walk.speed = 0; walk.run = 0; }
  walk.runNow = lerp(walk.runNow || 0, moving ? clamp((walk.speed - MOVE.walk) / (MOVE.run - MOVE.walk), 0, 1) : 0, Math.min(1, dt * 6)); // eased, for the pose and camera
  player.rotation.y = walk.heading;
  const gy = walk.deck != null ? deckY(DECKS[walk.deck], player.position.x, player.position.z) : groundY(player.position.x, player.position.z);
  player.position.y = lerp(player.position.y, gy, Math.min(1, dt * 15));

  // animation
  if (moving) { const ph = walk.phase; walk.phase += dt * strideRate(walk.speed, walk.runNow); runDust(player.position, ph, walk.phase, walk.runNow, walk.deck != null); }
  if (walk.pickT > 0) walk.pickT -= dt;
  animateRig(rig, dt, time, moving, walk.phase, walk.pickT, walk.runNow);
  if (walk.swing) updateSwing(dt);
  if (walk.netSwing) updateNetSwing(dt);
  if (walk.pour) updatePour(dt);
  updateFishing(dt, time);
  walk.moving = moving;
  // swimming: lying in the water and paddling (no tools while you swim)
  const swimNow = isSwimming();
  if (swimNow !== !!walk.swimNow) { walk.swimNow = swimNow; document.body.classList.toggle('swimming', swimNow); toolSlot.visible = !swimNow; if (swimNow && fishing) endFishing(); }
  if (swimNow) {
    swimPose(player, rig, time, moving);
    if (!moving) { walk.rippleT = (walk.rippleT || 0) - dt; if (walk.rippleT <= 0) { walk.rippleT = 1.1; ripple(player.position.x, player.position.z, 0.3); } }
  } else if (player.rotation.x) player.rotation.x = 0;

  shadowBlob.position.set(player.position.x, gy + 0.03, player.position.z);
}

// ---------------------------------------------------------------- axe: swing at a fruit tree
const SWING_COST = 5, SWING_TIME = 0.55;
function startSwing(tree) {
  if (walk.swing) return;
  if (energy < SWING_COST) { toast('Too tired, eat something'); return; }
  energy -= SWING_COST; renderEnergy();
  walk.heading = Math.atan2(tree.obj.position.x - player.position.x, tree.obj.position.z - player.position.z);
  walk.swing = { tree, t: 0, hit: false };
}
// overrides the right arm after the normal walk/idle pose: wind up over the head, chop down, recover
function updateSwing(dt) {
  const s = walk.swing;
  s.t += dt;
  const u = Math.min(s.t / SWING_TIME, 1);
  rig.armR.rotation.x = u < 0.45 ? lerp(0, -2.9, smooth(0, 0.45, u)) : lerp(-2.9, -0.4, smooth(0.45, 0.65, u)) * (1 - smooth(0.75, 1, u));
  rig.body.rotation.x = u > 0.45 ? 0.15 * Math.sin(((u - 0.45) / 0.55) * Math.PI) : -0.08 * smooth(0, 0.45, u);
  if (!s.hit && u >= 0.6) { s.hit = true; hitTree(s.tree); }
  if (u >= 1) walk.swing = null;
}
// online the server decides how much fruit falls (trees are shared); offline we roll it here
function hitTree(tree) {
  if (net.online) { net.send({ t: 'chop', tree: tree.id, kind: tree.kind }); return; }
  let n = 0;
  if (nowMs() >= tree.readyAt) { n = 1 + Math.floor(Math.random() * 3); tree.readyAt = nowMs() + TREE_REGROW_MS; }
  applyChop(tree, n, tree.readyAt, null);
}
// everyone sees the shake and the falling fruit; only the chopper (picker === null) gets it in the backpack
function applyChop(tree, n, readyAt, picker) {
  tree.shakeT = 0.7;
  tree.readyAt = readyAt;
  const mine = picker === null;
  if (n === 0) {
    if (mine) toast(`No fruit left, it'll regrow in about ${Math.max(1, Math.ceil((readyAt - nowMs()) / 1000))}s`);
    return;
  }
  if (mine) {
    pocket[tree.kind] += n;
    renderPocket();
    toast(`The tree shakes! ${n} ${n > 1 ? BAG_LABELS[tree.kind].toLowerCase() : KINDS[tree.kind].name.replace(/^an? /, '')} went into your backpack`);
  }
  const who = mine ? player : picker && picker.player ? picker.player : null;
  for (let i = 0; i < n; i++) dropFruit(tree, i, who);
}
// a fruit falls out of the crown, bounces once and hops into the backpack
function dropFruit(tree, i, who) {
  const f = KINDS[tree.kind].make();
  const top = tree.obj.position.clone().add(new THREE.Vector3(0, tree.kind === 'coconut' ? 3.8 : 2.4, 0));
  const a = Math.random() * TAU, land = tree.obj.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0));
  land.y = groundY(land.x, land.z);
  f.position.copy(top);
  scene.add(f);
  let t = -i * 0.15;
  transients.push((dt) => {
    t += dt;
    if (t < 0) return true;
    if (t < 0.6) { const u = t / 0.6; f.position.lerpVectors(top, land, u); f.position.y = lerp(top.y, land.y, u * u); }
    else if (t < 0.9) { const u = (t - 0.6) / 0.3; f.position.set(land.x, land.y + Math.sin(u * Math.PI) * 0.3, land.z); }
    else {
      const u = Math.min((t - 0.9) / 0.5, 1);
      f.position.lerpVectors(land, who ? who.position : land, u); f.position.y += Math.sin(u * Math.PI) * 0.8 + u * 1.2;
      f.scale.setScalar(Math.max(0.001, 1 - u * u));
      if (u >= 1) { scene.remove(f); f.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); return false; }
    }
    f.rotation.y += dt * 6;
    return true;
  });
}
function eat(kind) {
  if (!FOODS.has(kind) || pocket[kind] <= 0) return;
  if (energy >= ENERGY_MAX) { toast("You're already full of energy"); return; }
  pocket[kind]--;
  const gained = Math.min(foodEnergy(kind), ENERGY_MAX - energy);
  energy += gained;
  renderPocket(); renderEnergy();
  toast(`Yum! ${BAG_LABELS[kind].replace(/s$/, '').replace(/oe$/, 'o')} eaten, +${Math.round(gained)} energy`);
}

// ---------------------------------------------------------------- eat confirmation popup
const eatUI = {
  root: document.getElementById('eatPopup'), icon: document.getElementById('eatIcon'), name: document.getElementById('eatName'),
  gain: document.getElementById('eatGain'), note: document.getElementById('eatNote'),
  yes: document.getElementById('eatYes'), no: document.getElementById('eatNo'),
};
let eatKind = null, eatWaiting = false; // the food on show; waiting for the server's answer
const foodName = (kind) => BAG_LABELS[kind].replace(/s$/, '').replace(/oe$/, 'o');
function openEatPopup(kind) {
  if (!FOODS.has(kind) || !(pocket[kind] > 0)) return;
  eatKind = kind; eatWaiting = false;
  eatUI.icon.innerHTML = ICONS[kind] || '';
  eatUI.name.textContent = foodName(kind);
  eatUI.gain.textContent = `+${foodEnergy(kind)} energy`;
  eatUI.root.classList.add('open');
  refreshEatPopup();
}
function closeEatPopup() { eatKind = null; eatWaiting = false; eatUI.root.classList.remove('open'); }
// keeps the buttons honest while the popup is open (energy or count can change underneath it)
function refreshEatPopup() {
  if (!eatKind) return;
  if (!(pocket[eatKind] > 0)) { closeEatPopup(); return; }
  const full = energy >= ENERGY_MAX;
  eatUI.yes.disabled = full || eatWaiting;
  eatUI.note.textContent = full ? 'Energy is full' : eatWaiting ? 'Eating…' : `You have ${pocket[eatKind]}`;
}
eatUI.no.addEventListener('click', closeEatPopup);
eatUI.yes.addEventListener('click', () => {
  if (!eatKind || eatWaiting || energy >= ENERGY_MAX) return;
  if (net.online) { eatWaiting = true; refreshEatPopup(); net.send({ t: 'eat', kind: eatKind }); return; }
  eat(eatKind);
  closeEatPopup();
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && eatKind) closeEatPopup(); });
function eatAnswered(m) {
  if (m.ok) {
    toast(`Yum! ${foodName(m.kind)} eaten, +${Math.round(Number.isFinite(m.gained) ? m.gained : foodEnergy(m.kind))} energy`);
    closeEatPopup();
  } else if (eatKind) {
    eatWaiting = false;
    refreshEatPopup();
    if (m.msg && m.msg !== 'Energy is full') eatUI.note.textContent = m.msg;
  }
}

// ---------------------------------------------------------------- seats: the two-person benches and the swing
// Who sits where comes from the server online (seat id -> player id); offline it's kept here. The swing's
// motion is a pure function of the shared clock and a small state, computed the same way on the server.
const SWING = { A: 0.38, PERIOD: 2600, RAMP: 2000, DECAY: 1500 };
const SWING_SEATS = [2, 3];
const seatState = { occ: new Map(), swing: { occupied: false, phase0: 0, occAt: 0, ampStart: 0, stop: 0, ampStop: 0 } };
let mySeat = null; // seat id the local player sits on
function swingAmp(sw, t) { return sw.occupied ? lerp(sw.ampStart, 1, smooth(0, SWING.RAMP, t - sw.occAt)) : sw.ampStop * Math.exp(-Math.max(0, t - sw.stop) / SWING.DECAY); }
function swingAngle(t) {
  const sw = seatState.swing, a = swingAmp(sw, t);
  return a < 0.002 ? 0 : SWING.A * a * Math.sin((TAU * (t - sw.phase0)) / SWING.PERIOD);
}
function localSwingUpdate() { // offline only; the server applies the same rule online
  const occ = SWING_SEATS.some((s) => seatState.occ.has(s)), sw = seatState.swing, t = nowMs();
  if (occ && !sw.occupied) { const a = swingAmp(sw, t); if (a < 0.02) sw.phase0 = t; sw.ampStart = a; sw.occAt = t; sw.occupied = true; }
  else if (!occ && sw.occupied) { sw.ampStop = swingAmp(sw, t); sw.stop = t; sw.occupied = false; }
}
function seatWorld(spot, out) { spot.frame.updateWorldMatrix(true, false); return spot.frame.localToWorld(out.copy(spot.local)); }
function seatApproach(spot, out) { // where to stand in front of a seat
  const yaw = spot.holder.rotation.y;
  seatWorld(spot, out);
  const k = spot.kind === 'chair' ? -0.95 : spot.kind === 'lounger' ? 1.35 : 1.15; // a lounger: past its foot end // a restaurant chair: from behind it (the table is in front)
  out.x += Math.sin(yaw) * k; out.z += Math.cos(yaw) * k;
  return out;
}
function seatOfPlayer(id) { for (const [s, who] of seatState.occ) if (who === id) return s; return null; }
// puts a character on a seat: hips on the seat, legs forward, hands in the lap, tilting with the swing
const _seatPos = new THREE.Vector3();
function placeSeated(character, charRig, spot, dt, time) {
  seatWorld(spot, _seatPos);
  character.position.set(_seatPos.x, _seatPos.y - 0.5, _seatPos.z);
  character.rotation.y = spot.holder.rotation.y;
  character.rotation.x = spot.kind === 'swing' ? spot.holder.userData.pivot.rotation.x : 0;
  animateRig(charRig, dt, time, false, 0, 0);
  charRig.legL.rotation.x = charRig.legR.rotation.x = -1.45;
  charRig.armL.rotation.x = charRig.armR.rotation.x = -0.55;
  charRig.body.rotation.x = 0;
  charRig.body.position.y = 0.55;
  charRig.head.rotation.y = Math.sin(time * 0.4 + spot.id) * 0.25;
  if (spot.kind === 'lounger') { // stretched out on the lounger: leaning back, legs out, hands behind the head
    charRig.legL.rotation.x = charRig.legR.rotation.x = -1.5;
    charRig.body.rotation.x = -0.95; charRig.head.rotation.x = 0.55;
    charRig.armL.rotation.x = charRig.armR.rotation.x = -2.7; charRig.armL.rotation.z = 0.45; charRig.armR.rotation.z = -0.45;
  }
}
function sitDown(spot) {
  mySeat = spot.id;
  walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null;
}
function standUp() {
  if (mySeat === null) return;
  const spot = seatSpots[mySeat];
  mySeat = null;
  seatApproach(spot, _seatPos);
  player.position.set(_seatPos.x, groundY(_seatPos.x, _seatPos.z), _seatPos.z);
  if (spot.kind === 'chair') { // back on the restaurant's deck, not on the sand under it
    const fy = seatWorld(spot, new THREE.Vector3()).y - SEAT_TOP, di = DECKS.findIndex((d) => deckHas(d, _seatPos.x, _seatPos.z) && Math.abs(deckY(d, _seatPos.x, _seatPos.z) - fy) < 0.3);
    if (di >= 0) { walk.deck = di; player.position.y = fy; }
  }
  player.rotation.x = 0;
  walk.heading = spot.holder.rotation.y;
  if (net.online) net.send({ t: 'stand' });
  else { seatState.occ.delete(spot.id); localSwingUpdate(); }
}
function requestSit(spot) {
  if (seatState.occ.has(spot.id)) { toast('Someone else is sitting there'); return; }
  if (net.online) { net.awaitSeat = spot.id; net.send({ t: 'sit', seat: spot.id }); return; }
  seatState.occ.set(spot.id, 'me'); localSwingUpdate(); sitDown(spot);
}
// the server's seat list (sent whenever anyone sits or stands)
function applySeats(m) {
  seatState.occ = new Map((m.seats || []).filter(([s]) => seatSpots[s]));
  if (m.swing) Object.assign(seatState.swing, m.swing);
  const mine = seatOfPlayer(net.id);
  if (mine !== null && mySeat !== mine) sitDown(seatSpots[mine]);
  else if (mine === null && mySeat !== null) { mySeat = null; player.rotation.x = 0; }
  if (net.awaitSeat !== undefined && net.awaitSeat !== null && mine !== net.awaitSeat) toast('Someone else is sitting there');
  net.awaitSeat = null;
}

// floating seat circles: one small round sit button on every seat spot (left and right half of each bench and
// of the swing), drawn as page elements placed over the canvas every frame so they keep the same size at any
// zoom. A circle shows when the player is within 2 units of that bench or swing and its own spot is free.
// While seated no circle shows; tapping the ground is how you stand up.
const SEAT_ICON_SIT = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="12" width="30" height="6" rx="3" fill="#c98c52" stroke="#7a4a26" stroke-width="2"/><rect x="7" y="21" width="34" height="7" rx="3" fill="#c98c52" stroke="#7a4a26" stroke-width="2"/><path d="M12 28 v11 M36 28 v11 M12 18 v3 M36 18 v3" stroke="#7a4a26" stroke-width="3.5" stroke-linecap="round"/></svg>';
const SEAT_NEAR = 2;
const seatLayer = document.getElementById('seatBubbles');
// Buttons floating over the world move every frame to follow their spot on screen (the camera glides after the
// character and coasts after a drag). A browser 'click' needs the press and release on the same element, so a tap
// made while the view moves can miss it. These buttons act on the press itself instead: the pointer is captured
// on press, the button holds still while pressed, and the release triggers it. 'click' stays for keyboard use.
function bindWorldTap(btn, onTap) {
  let pid = null, x0 = 0, y0 = 0, lastTap = 0;
  const release = () => { pid = null; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
    btn.classList.add('pressed'); // updateSeatBubbles / placeBubble leave a pressed button where it is
    try { btn.setPointerCapture(pid); } catch { /* older browsers: the frozen position keeps it under the finger */ }
    orbit.vYaw = orbit.vPitch = 0; // stop any leftover camera spin
  });
  btn.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pid) return;
    e.preventDefault(); e.stopPropagation();
    const moved = Math.hypot(e.clientX - x0, e.clientY - y0) > 40; // slid far off: treat as changing your mind
    release();
    if (!moved) { lastTap = performance.now(); onTap(); }
  });
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', () => { if (pid !== null) release(); });
  btn.addEventListener('click', (e) => { // keyboard (Enter/Space) and assistive tech; ignore the click that follows a tap
    e.preventDefault(); e.stopPropagation();
    if (performance.now() - lastTap > 600) onTap();
  });
}
const seatBubbles = seatSpots.map((spot) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'seat-bubble';
  btn.title = 'Sit';
  btn.setAttribute('aria-label', `Sit on the ${(spot.side ?? spot.local.x) < 0 ? 'left' : 'right'} ${spot.kind === 'lounger' ? 'lounger' : 'side'}`);
  btn.innerHTML = `<span class="bob">${SEAT_ICON_SIT}</span>`;
  // anchored just above its own spot, in the seat's frame, so it rides along with the swing
  const bubble = { spot, btn, shown: false, anchor: spot.local.clone().add(new THREE.Vector3(0, 0.32, 0)) };
  bindWorldTap(btn, () => sitOnSpot(spot));
  seatLayer.appendChild(btn);
  return bubble;
});
function sitOnSpot(spot) {
  if (mySeat !== null || seatState.occ.has(spot.id)) return;
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null;
  walk.seat = spot;
  walk.target = seatApproach(spot, new THREE.Vector3());
}
const _bubbleV = new THREE.Vector3();
const BUBBLE_MIN_GAP = 46; // px between the two circles of one seat, so their tap areas never overlap
function updateSeatBubbles() {
  // where each spot is on screen
  for (const b of seatBubbles) {
    b.spot.frame.updateWorldMatrix(true, false);
    _bubbleV.copy(b.anchor); b.spot.frame.localToWorld(_bubbleV); _bubbleV.project(camera);
    b.sx = (_bubbleV.x * 0.5 + 0.5) * window.innerWidth; b.sy = (-_bubbleV.y * 0.5 + 0.5) * window.innerHeight; b.behind = _bubbleV.z > 1;
  }
  // zoomed out, a seat's two spots get close on screen: push the pair apart along the line between them
  for (let i = 0; i < seatBubbles.length; i += 2) {
    const a = seatBubbles[i], c = seatBubbles[i + 1];
    let dx = c.sx - a.sx, dy = c.sy - a.sy;
    const d = Math.hypot(dx, dy);
    if (d >= BUBBLE_MIN_GAP) continue;
    if (d < 1e-3) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
    const mx = (a.sx + c.sx) / 2, my = (a.sy + c.sy) / 2, h = BUBBLE_MIN_GAP / 2;
    a.sx = mx - dx * h; a.sy = my - dy * h; c.sx = mx + dx * h; c.sy = my + dy * h;
  }
  for (const b of seatBubbles) {
    const holder = b.spot.holder;
    const near = Math.hypot(holder.position.x - player.position.x, holder.position.z - player.position.z) <= SEAT_NEAR + (b.spot.kind === 'lounger' ? 0.4 : 0.8); // bench spots sit ~0.8 from its centre, a lounger's on it
    let show = myRoom === null && mySeat === null && !walk.seat && !walk.door && near && !seatState.occ.has(b.spot.id) && (b.spot.kind !== 'chair' || walk.deck != null);
    // hide while behind the camera or off screen
    if (b.behind || b.sx < -40 || b.sy < -40 || b.sx > window.innerWidth + 40 || b.sy > window.innerHeight + 40) show = false;
    if (show !== b.shown) { b.shown = show; b.btn.classList.toggle('show', show); }
    if ((show || b.btn.classList.contains('show')) && !b.btn.classList.contains('pressed')) b.btn.style.transform = `translate(${b.sx.toFixed(1)}px, ${b.sy.toFixed(1)}px) translate(-50%, -100%)`;
  }
}
function updateSeats() {
  for (const spot of seatSpots) if (spot.kind === 'swing') { spot.holder.userData.pivot.rotation.x = swingAngle(nowMs()); break; }
}

// the balloon girl: looks around slowly, turns and waves at whoever comes close; balloons bob and sway
function updateNpc(dt) {
  const t = nowMs() / 1000; // shared clock, so everyone sees her look the same way
  const u = npcGirl.userData;
  let near = null, nearD = 4.5;
  for (const c of [...(myRoom === null ? [player] : []), ...[...remotes.values()].filter((r) => !r.room).map((r) => r.player)]) {
    const d = Math.hypot(c.position.x - npcGirl.position.x, c.position.z - npcGirl.position.z);
    if (d < nearD) { nearD = d; near = c; }
  }
  const wantYaw = near ? Math.atan2(near.position.x - npcGirl.position.x, near.position.z - npcGirl.position.z) : u.baseYaw + Math.sin(t * 0.3) * 0.7;
  npcGirl.rotation.y = lerpAngle(npcGirl.rotation.y, wantYaw, Math.min(1, dt * (near ? 4 : 1)));
  u.head.rotation.y = near ? 0 : Math.sin(t * 0.8) * 0.35;
  u.head.rotation.z = near ? Math.sin(t * 3) * 0.08 : 0;
  const waveTarget = near ? 2.6 + Math.sin(t * 9) * 0.35 : 0.12;
  u.arms.right.rotation.z = lerp(u.arms.right.rotation.z, waveTarget, Math.min(1, dt * 8));
  u.arms.left.rotation.z = -0.55; // holding the balloon strings
  u.body.position.y = 0.5 + Math.sin(t * 2) * 0.01;
  u.tail.rotation.x = Math.sin(t * 1.7) * 0.12;
  u.bunch.rotation.z = Math.sin(t * 0.7) * 0.09;
  u.bunch.rotation.x = Math.sin(t * 0.5 + 1) * 0.07;
  for (const b of u.balloons) {
    b.ball.position.set(b.base.x + Math.sin(t * 0.9 + b.ph) * 0.05, b.base.y + Math.sin(t * 1.3 + b.ph) * 0.06, b.base.z);
    b.ball.rotation.z = Math.sin(t * 1.1 + b.ph) * 0.15;
  }
}

// ---------------------------------------------------------------- furniture (House Tool catalog)
// Floor items stand on the floor with their front toward local +z; w x d is their footprint.
// Wall items (window, picture) hang on a wall, centred at height y, w wide.
const ROOM_ITEM_LIMIT = 60;
const windowSkyMat = new THREE.ShaderMaterial({ // the real sky outside, from the same colours as the island's sky
  uniforms: { uTop: skyMat.uniforms.uTop, uBot: skyMat.uniforms.uBot, uFog: skyMat.uniforms.uFog },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uFog; varying vec2 vUv;
    void main(){ vec3 c = mix(mix(uFog, uBot, smoothstep(0.0, 0.35, vUv.y)), uTop, smoothstep(0.3, 1.0, vUv.y)); gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
    }`,
});
const pictureTex = canvasTex(128, 96, (g) => {
  const sky = g.createLinearGradient(0, 0, 0, 96); sky.addColorStop(0, '#9fd3f5'); sky.addColorStop(1, '#ffe2c4');
  g.fillStyle = sky; g.fillRect(0, 0, 128, 96);
  g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(92, 30, 12, 0, TAU); g.fill();
  g.fillStyle = '#8fd17a'; g.beginPath(); g.moveTo(0, 96); g.quadraticCurveTo(40, 40, 80, 70); g.quadraticCurveTo(105, 55, 128, 75); g.lineTo(128, 96); g.fill();
  g.fillStyle = '#5fa85a'; g.beginPath(); g.moveTo(0, 96); g.quadraticCurveTo(50, 62, 128, 90); g.lineTo(128, 96); g.fill();
});
const ROOM_ITEMS = {
  bed: { label: 'Bed', w: 1.5, d: 2, make(g) {
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 1.95), mat('#c99a68'), 0, 0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.3, 0.16, 1.85), mat('#fffaf0'), 0, 0.43, 0));
    g.add(mesh(new THREE.BoxGeometry(1.34, 0.08, 1.15), mat('#9fc8f0'), 0, 0.53, 0.33));
    g.add(mesh(new THREE.BoxGeometry(0.62, 0.14, 0.34), mat('#ffe2ec'), 0, 0.58, -0.68));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.85, 0.1), mat('#b08058'), 0, 0.45, -0.95));
  } },
  table: { label: 'Table', w: 1, d: 1, make(g) {
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.08, 0.95), mat('#d0a274'), 0, 0.72, 0));
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), mat('#a8744a'), x, 0.35, z));
  } },
  chair: { label: 'Chair', w: 0.5, d: 0.5, make(g) {
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), mat('#f2c48a'), 0, 0.44, 0));
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.5, 0.06), mat('#f2c48a'), 0, 0.72, -0.2));
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), mat('#a8744a'), x, 0.21, z));
  } },
  sofa: { label: 'Sofa', w: 1.5, d: 1, make(g) {
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.35, 0.8), mat('#9fd6c4'), 0, 0.25, 0));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 0.2), mat('#8cc9b5'), 0, 0.6, -0.32));
    for (const x of [-0.68, 0.68]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.45, 0.8), mat('#8cc9b5'), x, 0.42, 0));
    for (const x of [-0.33, 0.33]) g.add(mesh(new THREE.BoxGeometry(0.6, 0.1, 0.58), mat('#b8e6d6'), x, 0.47, 0.05));
  } },
  bookshelf: { label: 'Bookshelf', w: 1, d: 0.5, make(g) {
    const wood = mat('#b08058');
    for (const x of [-0.47, 0.47]) g.add(mesh(new THREE.BoxGeometry(0.06, 1.7, 0.4), wood, x, 0.85, 0));
    g.add(mesh(new THREE.BoxGeometry(1.0, 1.7, 0.04), wood, 0, 0.85, -0.18));
    for (let i = 0; i < 4; i++) {
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.05, 0.38), wood, 0, 0.05 + i * 0.52, 0));
      if (i === 3) continue;
      ['#f08a7a', '#7ab8f2', '#f2c450', '#8fd17a', '#c79af2'].forEach((c, j) => g.add(mesh(new THREE.BoxGeometry(0.12, 0.34 + (j % 2) * 0.06, 0.28), mat(c), -0.32 + j * 0.15, 0.27 + i * 0.52 + (j % 2) * 0.03, 0.02)));
    }
  } },
  rug: { label: 'Rug', w: 2, d: 1.5, flat: true, make(g) {
    const r1 = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.03, 28), mat('#f0a8b8'), 0, 0.015, 0); r1.scale.z = 0.72; r1.castShadow = false; g.add(r1);
    const r2 = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.035, 28), mat('#fbe3c8'), 0, 0.02, 0); r2.scale.z = 0.72; r2.castShadow = false; g.add(r2);
  } },
  plant: { label: 'Plant', w: 0.5, d: 0.5, make(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 8), mat('#d07a50'), 0, 0.16, 0));
    for (const [x, y, z, s] of [[0, 0.55, 0, 0.26], [0.12, 0.72, 0.05, 0.18], [-0.1, 0.7, -0.06, 0.18]]) g.add(mesh(new THREE.IcosahedronGeometry(s, 0), M.leaf, x, y, z));
  } },
  lamp: { label: 'Lamp', w: 0.5, d: 0.5, light: true, make(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 10), mat('#a8744a'), 0, 0.03, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), mat('#a8744a'), 0, 0.68, 0));
    const shade = mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.3, 12), roomGlowMat, 0, 1.42, 0); shade.castShadow = false; g.add(shade);
  } },
  window: { label: 'Window', wall: true, w: 1, y: 1.55, make(g) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), windowSkyMat); sky.position.z = 0.01; g.add(sky);
    const frame = mat('#fffaf0');
    for (const [w, h, x, y] of [[1, 0.08, 0, 0.47], [1, 0.08, 0, -0.47], [0.08, 1, -0.47, 0], [0.08, 1, 0.47, 0], [0.05, 0.9, 0, 0], [0.9, 0.05, 0, 0]]) g.add(mesh(new THREE.BoxGeometry(w, h, 0.06), frame, x, y, 0.03));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.06, 0.16), mat('#a8744a'), 0, -0.53, 0.06));
  } },
  picture: { label: 'Picture', wall: true, w: 0.75, y: 1.6, make(g) {
    g.add(mesh(new THREE.BoxGeometry(0.72, 0.56, 0.05), mat('#a8744a'), 0, 0, 0.02));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ map: pictureTex, roughness: 0.8 })); p.position.z = 0.05; g.add(p);
  } },
};
const roomGlowMat = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffc35a, emissiveIntensity: 1.6, roughness: 0.5 });
function makeRoomItem(kind) { const g = new THREE.Group(); ROOM_ITEMS[kind].make(g); return g; }
// floor items: x, z (any position) and a (any angle, radians). Layouts saved before free placement used r
// (quarter turns on a grid); their positions are used as they are and r becomes the angle.
const itemAngle = (item) => (Number.isFinite(item.a) ? item.a : (item.r || 0) * Math.PI / 2);
// a floor item's footprint: a rectangle turned by its angle (centre, half sizes, its own x and z axes on the floor)
function footBox(item, grow = 0) {
  const def = ROOM_ITEMS[item.k], a = itemAngle(item), c = Math.cos(a), sn = Math.sin(a);
  return { x: item.x, z: item.z, hw: def.w / 2 + grow, hd: def.d / 2 + grow, ux: [c, -sn], uz: [sn, c] };
}
// how far it reaches along the room's x and z (to keep every part inside the walls)
const boxReach = (b) => ({ ex: Math.abs(b.ux[0]) * b.hw + Math.abs(b.uz[0]) * b.hd, ez: Math.abs(b.ux[1]) * b.hw + Math.abs(b.uz[1]) * b.hd });
// do two turned rectangles overlap? (separating axis test on their four edge directions)
function boxesOverlap(A, B) {
  const dx = B.x - A.x, dz = B.z - A.z;
  for (const ax of [A.ux, A.uz, B.ux, B.uz]) {
    const r = (b) => b.hw * Math.abs(ax[0] * b.ux[0] + ax[1] * b.ux[1]) + b.hd * Math.abs(ax[0] * b.uz[0] + ax[1] * b.uz[1]);
    if (Math.abs(dx * ax[0] + dz * ax[1]) >= r(A) + r(B)) return false;
  }
  return true;
}
function pointInBox(b, x, z, inset = 0) {
  const dx = x - b.x, dz = z - b.z;
  return Math.abs(dx * b.ux[0] + dz * b.ux[1]) <= b.hw - inset && Math.abs(dx * b.uz[0] + dz * b.uz[1]) <= b.hd - inset;
}
const SURFACES = { table: 0.76, bookshelf: 1.72 }; // tops that small things can stand on
const SMALL_ITEMS = new Set(['lamp', 'plant']);
// the table or bookshelf a small item stands on (its centre over that top), or null
function supportOf(item, layout) {
  if (!SMALL_ITEMS.has(item.k)) return null;
  return layout.find((o) => o !== item && SURFACES[o.k] !== undefined && Number.isFinite(o.x) && pointInBox(footBox(o), item.x, item.z, 0.1)) || null;
}
// the 4 walls in roomWalls order: 0 front (+z, door), 1 back, 2 right (+x), 3 left (-x, built-in window)
function wallBlocked(wallIdx, o, w) {
  if (wallIdx === 0 && Math.abs(o) < ROOM_DOOR_W / 2 + w / 2 + 0.05) return true; // the doorway
  if (wallIdx === 3 && Math.abs(o) < 0.75 + w / 2) return true; // the built-in window
  return Math.abs(o) + w / 2 > ROOM_HALF + 0.001;
}
// is this layout entry somewhere it can go? Items may sit close together but not on each other's footprint;
// a lamp or plant may stand on a table or bookshelf top. ignore = the entry being moved
function itemFits(item, layout, ignore) {
  const def = ROOM_ITEMS[item.k];
  if (!def) return false;
  if (def.wall) {
    if (wallBlocked(item.w, item.o, def.w)) return false;
    return !layout.some((o) => o !== ignore && ROOM_ITEMS[o.k] && ROOM_ITEMS[o.k].wall && o.w === item.w && Math.abs(o.o - item.o) < (def.w + ROOM_ITEMS[o.k].w) / 2 - 0.01);
  }
  const box = footBox(item), { ex, ez } = boxReach(box);
  if (Math.abs(item.x) + ex > ROOM_HALF + 0.01 || Math.abs(item.z) + ez > ROOM_HALF + 0.01) return false;
  const others = layout.filter((o) => o !== ignore && o !== item && ROOM_ITEMS[o.k] && !ROOM_ITEMS[o.k].wall);
  const tight = footBox(item, -0.01); // touching is fine, overlapping is not
  const support = supportOf(item, others);
  if (support) return !others.some((o) => SMALL_ITEMS.has(o.k) && supportOf(o, others) === support && boxesOverlap(tight, footBox(o, -0.01)));
  if (!def.flat && item.z + ez > ROOM_HALF - 1.0 && Math.abs(item.x) - ex < 0.75) return false; // keep the doorway clear
  return !others.some((o) => !!ROOM_ITEMS[o.k].flat === !!def.flat && !(SMALL_ITEMS.has(o.k) && supportOf(o, others)) && boxesOverlap(tight, footBox(o, -0.01)));
}
// put an item object where its layout entry says
function poseRoomItem(obj, item) {
  const def = ROOM_ITEMS[item.k];
  if (def.wall) {
    const wall = roomWalls[item.w].group;
    if (obj.parent !== wall) wall.add(obj);
    obj.position.set(item.o, def.y, -0.08); obj.rotation.set(0, Math.PI, 0); // on the inside face, facing into the room
  } else {
    if (obj.parent !== roomScene) roomScene.add(obj);
    const support = supportOf(item, roomLayout);
    obj.position.set(item.x, support ? SURFACES[support.k] : 0, item.z); obj.rotation.set(0, itemAngle(item), 0);
  }
}
// the room's furniture, built from a layout (the owner's, from the server)
let roomLayout = [];
const roomObjects = []; const roomColliders = []; const roomLights = [];
function buildRoomLayout(layout) {
  for (const o of roomObjects) { if (o.parent) o.parent.remove(o); o.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); }
  for (const l of roomLights) roomScene.remove(l);
  roomObjects.length = roomColliders.length = roomLights.length = 0;
  roomLayout = (Array.isArray(layout) ? layout : []).filter((it) => it && ROOM_ITEMS[it.k])
    .map((it) => (ROOM_ITEMS[it.k].wall ? { k: it.k, w: it.w, o: it.o } : { k: it.k, x: it.x, z: it.z, a: itemAngle(it) }));
  for (const item of roomLayout) {
    const def = ROOM_ITEMS[item.k], obj = makeRoomItem(item.k);
    obj.userData.roomItem = item;
    obj.traverse((m) => { m.userData.roomItem = item; });
    poseRoomItem(obj, item);
    obj.updateMatrixWorld(true); // ready to be pressed right away, before the next frame is drawn
    roomObjects.push(obj);
    const support = def.wall ? null : supportOf(item, roomLayout);
    if (!def.wall && !def.flat && !support) { // walking blocks: circles along the item's long side
      const b = footBox(item), short = Math.min(b.hw, b.hd), along = b.hw >= b.hd ? b.ux : b.uz, reach = Math.max(b.hw, b.hd) - short;
      for (const k of reach > 0.05 ? [-1, 0, 1] : [0]) roomColliders.push({ x: item.x + along[0] * reach * k, z: item.z + along[1] * reach * k, r: short + 0.05 });
    }
    if (def.light && roomLights.length < 4) { // a real light (only a few, to keep it fast)
      const l = new THREE.PointLight(0xffc98a, 0, 7, 2); l.position.set(item.x, (support ? SURFACES[support.k] : 0) + 1.45, item.z); roomScene.add(l); roomLights.push(l);
    }
  }
  applyRoomLight();
}
// interior lighting follows the time of day: daylight through the windows, warm lamps at dusk and night
function applyRoomLight() {
  roomScene.background.copy(cur.fog).multiplyScalar(0.6);
  roomSun.color.copy(cur.sunCol); roomSun.intensity = cur.sunI * 0.3;
  roomHemi.intensity = 0.55 + (1 - cur.night) * 0.45;
  roomLamp.intensity = 2.5 + cur.lamp * 4;
  for (const l of roomLights) l.intensity = 3 + cur.lamp * 5;
}

// ---------------------------------------------------------------- entering and leaving houses
let roomInfo = null; // { plot, owner, own } while inside
const fadeEl = document.getElementById('fade');
function fadeSwap(fn) { // a short fade to black, the swap, and back
  fadeEl.classList.add('show');
  setTimeout(() => { fn(); setTimeout(() => fadeEl.classList.remove('show'), 60); }, 320);
}
// asking the server to go in or out; if it never answers (e.g. a server older than this page), say so
const ROOM_REPLY_MS = 4000;
let roomWait = null;
function awaitRoomReply() {
  clearTimeout(roomWait);
  roomWait = setTimeout(() => { roomWait = null; serverProblem("The server didn't answer. Restart it (node server.js), then reload this page."); }, ROOM_REPLY_MS);
}
function roomReplied() { clearTimeout(roomWait); roomWait = null; }
function serverProblem(msg) { toast(msg); toastTimer = 8; }
function requestEnter(plot) {
  if (!net.online) { toast('Houses open when you play online'); return; }
  net.send({ t: 'enter', plot });
  awaitRoomReply();
}
function switchToRoom(m) {
  if (mySeat !== null) standUp();
  myRoom = m.plot;
  roomInfo = { plot: m.plot, owner: m.owner, own: !!m.own };
  buildRoomLayout(m.layout);
  markLayoutSaved(roomLayout);
  document.body.classList.add('in-room');
  walk.target = null; walk.door = null; walk.exitDoor = null;
  roomScene.add(player); roomScene.add(shadowBlob);
  player.position.copy(ROOM_SPAWN);
  walk.heading = Math.PI; player.rotation.y = Math.PI; // facing into the room
  resetCameraBehind();
  refreshRemotes();
  updateHouseToolButton();
  toast(m.own ? 'Welcome home!' : `Welcome to ${m.owner}'s house`);
}
function switchToIsland(plot) {
  if (currentTool === 'house') selectTool('house'); // put the House Tool away
  myRoom = null; roomInfo = null;
  closeExitPopup(); document.body.classList.remove('in-room'); updateSaveButton();
  walk.target = null; walk.door = null; walk.exitDoor = null;
  scene.add(player); scene.add(shadowBlob);
  const slot = plotSlots[plot - 1];
  if (slot) { const p = plotDoor(slot, new THREE.Vector3(), 1.25); player.position.set(p.x, groundY(p.x, p.z), p.z); walk.heading = slot.group.rotation.y; }
  player.rotation.y = walk.heading;
  resetCameraBehind();
  refreshRemotes();
  updateHouseToolButton();
}
// door buttons: an Enter circle on every house door (rooms are left with the "<" button at the top left)
const DOOR_ICON_IN = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="8" width="22" height="34" rx="3" fill="#c98c52" stroke="#7a4a26" stroke-width="2.5"/><circle cx="29" cy="26" r="2" fill="#ffd36a"/><path d="M4 26 h14 M13 20 l6 6 -6 6" fill="none" stroke="#4f8f2f" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DOOR_ICON_OUT = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="8" width="22" height="34" rx="3" fill="#c98c52" stroke="#7a4a26" stroke-width="2.5"/><circle cx="23" cy="26" r="2" fill="#ffd36a"/><path d="M26 26 h16 M36 20 l6 6 -6 6" fill="none" stroke="#e0705a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function makeDoorBubble(icon, label, onTap) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'seat-bubble'; btn.title = label; btn.setAttribute('aria-label', label);
  btn.innerHTML = `<span class="bob">${icon}</span>`;
  bindWorldTap(btn, onTap);
  seatLayer.appendChild(btn);
  return { btn, shown: false };
}
const doorBubbles = plotSlots.map((slot) => ({ slot, ...makeDoorBubble(DOOR_ICON_IN, 'Enter', () => {
  if (bikeRide) { toast('Park the bicycle first'); return; }
  if (mySeat !== null) standUp();
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null;
  walk.door = slot.n; walk.target = plotDoor(slot, new THREE.Vector3(), 1.25);
}) }));
for (const b of doorBubbles) b.btn.classList.add('door-bubble');
const _doorV = new THREE.Vector3();
function placeBubble(b, world, show) {
  _doorV.copy(world).project(camera);
  const x = (_doorV.x * 0.5 + 0.5) * window.innerWidth, y = (-_doorV.y * 0.5 + 0.5) * window.innerHeight;
  if (_doorV.z > 1 || x < -40 || y < -40 || x > window.innerWidth + 40 || y > window.innerHeight + 40) show = false;
  if (b.btn.classList.contains('pressed')) show = b.shown;
  if (show !== b.shown) { b.shown = show; b.btn.classList.toggle('show', show); }
  if (show && !b.btn.classList.contains('pressed')) b.btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
}
const DOOR_NEAR = 2;
function updateDoorBubbles() {
  const free = mySeat === null && !walk.door && !walk.exitDoor;
  for (const b of doorBubbles) {
    let show = false;
    if (myRoom === null && free && b.slot.house) {
      plotDoor(b.slot, _seatPos);
      show = Math.hypot(_seatPos.x - player.position.x, _seatPos.z - player.position.z) <= DOOR_NEAR + 1.25;
      _seatPos.y = b.slot.y + 2.05;
    }
    placeBubble(b, _seatPos, show);
  }
}
// the room hides the wall between the camera and the character (and any wall the camera is outside of)
function updateRoomWalls() {
  for (const w of roomWalls) w.group.visible = _seatPos.copy(camera.position).sub(w.c).dot(w.normal) <= 0;
}

// ---------------------------------------------------------------- House Tool: placing furniture in your own room
const buildPanel = document.getElementById('buildPanel');
const buildActs = document.getElementById('buildActs');
const houseToolBtn = document.querySelector('#toolPanel button[data-tool="house"]');
const build = { kind: null, a: 0, moving: null, ghost: null, item: null, valid: false };
const ghostMat = new THREE.MeshStandardMaterial({ color: 0x6fd36a, transparent: true, opacity: 0.5, depthWrite: false });
function updateHouseToolButton() {
  const own = !!(roomInfo && roomInfo.own);
  if (houseToolBtn) houseToolBtn.classList.toggle('hidden', !own); // visitors (and the island) never see it
  if (!own && currentTool === 'house') selectTool('house');
}
function onHouseTool(selected) {
  if (!selected) cancelBuild();
  barCollapsed = false; // the House Tool always starts with the bar open
  showBuildBar(selected);
}
// the furniture bar: open with the House Tool; its round tab on top folds it down to just the tab and back.
// Folded or not, it stays that way while placing (the preview and the circles work either way).
let barCollapsed = false;
const barToggle = buildPanel.querySelector('[data-act="toggle"]');
function showBuildBar(open) {
  buildPanel.classList.toggle('open', open);
  buildPanel.classList.toggle('collapsed', open && barCollapsed);
  document.body.classList.toggle('building', open && !barCollapsed); // lifts the tool and backpack buttons above the bar
  document.body.classList.toggle('bar-collapsed', open && barCollapsed);
  if (barToggle) {
    barToggle.innerHTML = barCollapsed ? BAR_UP : BAR_DOWN;
    barToggle.title = barCollapsed ? 'Show the furniture bar' : 'Hide the furniture bar';
    barToggle.setAttribute('aria-label', barToggle.title);
  }
  renderBuildPanel();
}
const BAR_DOWN = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 19 L24 30 L35 19" fill="none" stroke="#7d5332" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BAR_UP = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 29 L24 18 L35 29" fill="none" stroke="#7d5332" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderBuildPanel() {
  for (const b of buildPanel.querySelectorAll('[data-item]')) b.classList.toggle('selected', b.dataset.item === build.kind);
  // rotate / cancel float above the bar while something is in hand; remove only for an item picked up from the room
  buildActs.classList.toggle('show', currentTool === 'house' && !!(build.kind || build.moving));
  const rm = buildActs.querySelector('[data-act="remove"]');
  if (rm) rm.classList.toggle('hidden', !build.moving);
  const count = buildPanel.querySelector('.count');
  if (count) count.textContent = `${roomLayout.length + (build.moving ? 1 : 0)} / ${ROOM_ITEM_LIMIT}`;
}
function clearGhost() { if (build.ghost) { if (build.ghost.parent) build.ghost.parent.remove(build.ghost); build.ghost = null; } }
function makeGhost(kind) {
  clearGhost();
  const g = makeRoomItem(kind);
  g.traverse((m) => { if (m.isMesh) { m.material = ghostMat; m.castShadow = false; m.receiveShadow = false; } });
  build.ghost = g;
}
function pickCatalog(kind) {
  if (!build.moving && roomLayout.length >= ROOM_ITEM_LIMIT) { toast(`Your room is full (${ROOM_ITEM_LIMIT} items)`); return; }
  if (build.moving) putBackMoving();
  build.kind = build.kind === kind ? null : kind; build.a = 0;
  if (build.kind) { makeGhost(build.kind); previewAt(player.position.clone().add(new THREE.Vector3(Math.sin(walk.heading), 0, Math.cos(walk.heading)).multiplyScalar(1.2)), null); }
  else clearGhost();
  renderBuildPanel();
}
// where the item goes for a floor point or a wall hit: exactly there (no grid), but never through a wall
function placementFor(kind, point, wallIdx) {
  const def = ROOM_ITEMS[kind];
  if (def.wall) {
    if (wallIdx === null || wallIdx === undefined) return null;
    const local = roomWalls[wallIdx].group.worldToLocal(point.clone());
    const lim = Math.floor((ROOM_HALF - def.w / 2) * 100) / 100; // rounded down, so the 2-decimal value never pokes past the wall
    return { k: kind, w: wallIdx, o: +clamp(Math.round(local.x * 100) / 100, -lim, lim).toFixed(2) };
  }
  const a = +(((build.a % TAU) + TAU) % TAU).toFixed(3);
  const { ex, ez } = boxReach(footBox({ k: kind, x: 0, z: 0, a }));
  return { k: kind, a, x: +clamp(point.x, -(ROOM_HALF - ex), ROOM_HALF - ex).toFixed(2), z: +clamp(point.z, -(ROOM_HALF - ez), ROOM_HALF - ez).toFixed(2) };
}
function previewAt(point, wallIdx) {
  const kind = build.kind || (build.moving && build.moving.k);
  if (!kind || !build.ghost) return;
  const item = placementFor(kind, point, wallIdx);
  if (!item) { build.item = null; build.valid = false; build.ghost.visible = false; return; }
  build.item = item;
  build.valid = itemFits(item, roomLayout, null);
  ghostMat.color.set(build.valid ? 0x6fd36a : 0xf06a5a); // green: free, red: overlapping or outside
  build.ghost.visible = true;
  poseRoomItem(build.ghost, item);
}
function commitPlacement() {
  if (!build.item || !build.valid) { toast("That spot isn't free"); return false; }
  if (!build.moving && roomLayout.length >= ROOM_ITEM_LIMIT) { toast(`Your room is full (${ROOM_ITEM_LIMIT} items)`); return false; }
  const next = roomLayout.concat([build.item]);
  build.moving = null; build.kind = null; clearGhost();
  setDraftLayout(next);
  return true;
}
// Furniture changes are a draft until the owner taps Save; only then does the server hear about them. Leaving,
// refreshing or disconnecting without saving drops the draft (the server still has the last saved layout).
let savedLayoutKey = '[]';
const layoutKey = (layout) => JSON.stringify(layout.map((o) => JSON.stringify(o)).sort());
const draftLayout = () => (build.moving ? roomLayout.concat([build.moving]) : roomLayout); // an item in hand still counts where it was
const roomDirty = () => !!(myRoom !== null && roomInfo && roomInfo.own && layoutKey(draftLayout()) !== savedLayoutKey);
function setDraftLayout(layout) {
  buildRoomLayout(layout);
  renderBuildPanel();
  updateSaveButton();
}
function markLayoutSaved(layout) { savedLayoutKey = layoutKey(layout); updateSaveButton(); }
function saveDraft() {
  if (!roomInfo || !roomInfo.own || !net.online) return false;
  const layout = draftLayout();
  net.send({ t: 'roomLayout', layout });
  markLayoutSaved(layout);
  return true;
}
const saveBtn = document.getElementById('saveBtn');
function updateSaveButton() { saveBtn.classList.toggle('show', roomDirty()); }
saveBtn.addEventListener('click', () => { if (roomDirty() && saveDraft()) toast('Saved'); });
// the "<" button at the top left leaves the room, after asking (and offering to save a draft)
const exitUI = { root: document.getElementById('exitPopup'), shade: document.getElementById('exitShade'), title: document.getElementById('exitTitle'), note: document.getElementById('exitNote'),
  save: document.getElementById('exitSave'), leave: document.getElementById('exitLeave'), cancel: document.getElementById('exitCancel') };
function openExitPopup() {
  if (myRoom === null) return;
  const dirty = roomDirty();
  exitUI.title.textContent = dirty ? 'Save your changes?' : 'Exit the house?';
  exitUI.note.textContent = dirty ? 'Your furniture changes are not saved yet' : '';
  exitUI.save.classList.toggle('hidden', !dirty);
  exitUI.leave.textContent = dirty ? 'Exit without saving' : 'Exit';
  exitUI.root.classList.add('open'); exitUI.shade.classList.add('open');
}
function closeExitPopup() { exitUI.root.classList.remove('open'); exitUI.shade.classList.remove('open'); }
function leaveRoom(save) {
  closeExitPopup();
  if (myRoom === null) return;
  if (!net.online) { switchToIsland(myRoom); return; }
  if (save) saveDraft();
  if (currentTool === 'house') selectTool('house'); // drops anything in hand; an unsaved draft is simply not sent
  net.send({ t: 'exit' }); awaitRoomReply();
}
document.getElementById('backBtn').addEventListener('click', openExitPopup);
exitUI.save.addEventListener('click', () => leaveRoom(true));
exitUI.leave.addEventListener('click', () => leaveRoom(false));
exitUI.cancel.addEventListener('click', closeExitPopup);
exitUI.shade.addEventListener('pointerdown', (e) => { e.preventDefault(); closeExitPopup(); }); // a tap outside is Cancel
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && exitUI.root.classList.contains('open')) closeExitPopup(); });
function pickUpItem(item) { // tap a placed item: carry it (the panel offers Remove)
  if (build.moving) putBackMoving();
  build.kind = null; build.a = itemAngle(item);
  build.moving = item;
  buildRoomLayout(roomLayout.filter((o) => o !== item)); // still part of the draft (draftLayout adds it back)
  makeGhost(item.k);
  build.item = item; build.valid = true; ghostMat.color.set(0x6fd36a); poseRoomItem(build.ghost, item);
  renderBuildPanel();
}
function putBackMoving() { // cancel a move: the item goes back where it was
  if (!build.moving) return;
  const item = build.moving; build.moving = null; clearGhost();
  setDraftLayout(roomLayout.concat([item]));
}
function cancelBuild() { putBackMoving(); build.kind = null; clearGhost(); }
// the round button: a quick quarter turn (the rotate handle turns it to any angle)
function rotateBuild() { turnBuild(build.a + Math.PI / 2); }
function turnBuild(angle) {
  const kind = build.kind || (build.moving && build.moving.k);
  if (!kind || ROOM_ITEMS[kind].wall) return;
  build.a = angle;
  if (build.item) previewAt(new THREE.Vector3(build.item.x, 0, build.item.z), null);
}
function onBuildButton(e) {
  const t = e.target.closest && e.target.closest('button');
  if (!t || catalogDrag.moved) return; // a drag to scroll the bar is not a tap on an item
  if (t.dataset.item) pickCatalog(t.dataset.item); // tapping the selected item again deselects it
  else if (t.dataset.act === 'rotate') rotateBuild();
  else if (t.dataset.act === 'remove' && build.moving) { build.moving = null; clearGhost(); setDraftLayout(roomLayout); toast('Put back in the catalog'); }
  else if (t.dataset.act === 'cancel') { if (build.moving) putBackMoving(); else { build.kind = null; clearGhost(); } renderBuildPanel(); }
  else if (t.dataset.act === 'toggle') { barCollapsed = !barCollapsed; showBuildBar(true); }
  else if (t.dataset.act === 'close') selectTool('house'); // puts the House Tool away, which hides the bar
}
buildPanel.addEventListener('click', onBuildButton);
buildActs.addEventListener('click', onBuildButton);
// on desktop the card row scrolls with the mouse wheel or by dragging it; touch screens swipe it natively
const catalogEl = buildPanel.querySelector('.catalog');
const catalogDrag = { x: 0, left: 0, down: false, moved: false };
if (catalogEl) {
  catalogEl.addEventListener('wheel', (e) => { e.preventDefault(); catalogEl.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY); }, { passive: false });
  catalogEl.addEventListener('pointerdown', (e) => {
    catalogDrag.moved = false;
    if (e.pointerType !== 'mouse') return;
    Object.assign(catalogDrag, { x: e.clientX, left: catalogEl.scrollLeft, down: true });
  });
  window.addEventListener('pointermove', (e) => {
    if (!catalogDrag.down) return;
    const dx = e.clientX - catalogDrag.x;
    if (Math.abs(dx) > 6) catalogDrag.moved = true;
    if (catalogDrag.moved) catalogEl.scrollLeft = catalogDrag.left - dx;
  });
  window.addEventListener('pointerup', () => { catalogDrag.down = false; setTimeout(() => { catalogDrag.moved = false; }, 0); });
}
// what a tap or mouse position in the room points at: a wall (for wall items), a placed item, or the floor
function roomPointer() {
  const kind = build.kind || (build.moving && build.moving.k);
  if (kind && ROOM_ITEMS[kind].wall) {
    const hit = raycaster.intersectObjects(roomWalls.filter((w) => w.group.visible).map((w) => w.group), true).find((h) => !build.ghost || !isInside(h.object, build.ghost));
    if (hit) { let o = hit.object; while (o && !roomWalls.some((w) => w.group === o)) o = o.parent; return { point: hit.point, wall: roomWalls.findIndex((w) => w.group === o) }; }
    return null;
  }
  const f = raycaster.intersectObject(roomFloor, false)[0];
  return f ? { point: f.point, wall: null } : null;
}
const isInside = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
function roomTap() {
  const f = raycaster.intersectObject(roomFloor, false)[0];
  if (!f) return;
  walk.door = null; walk.exitDoor = null;
  walk.target = new THREE.Vector3(clamp(f.point.x, -ROOM_HALF + 0.35, ROOM_HALF - 0.35), 0, clamp(f.point.z, -ROOM_HALF + 0.35, ROOM_HALF - 0.35));
  showMarker(walk.target.x, walk.target.z);
}
// on desktop the preview follows the mouse
function roomHover() {
  if (!furnitureActive() || !(build.kind || build.moving) || furn.mode) return;
  const p = roomPointer();
  if (p) previewAt(p.point, p.wall);
}

// furniture by hand (owner, House Tool selected): press and drag places or slides an item and lifting the finger
// drops it if the spot is free; a short tap on a placed item picks it up for rotate / remove. These presses are
// claimed before the camera sees them, so dragging furniture never turns the camera; dragging bare floor still does.
const furn = { mode: null, id: null, x0: 0, y0: 0, t0: 0, item: null, fromRoom: false, grab: null };
function furnitureActive() { return myRoom !== null && !!roomInfo && roomInfo.own && currentTool === 'house'; }
// the item follows the pointer; one dragged from the room keeps the spot you grabbed under your finger
function followPointer() {
  const p = roomPointer();
  if (!p) return;
  if (furn.grab && p.wall === null) p.point.add(furn.grab);
  previewAt(p.point, p.wall);
}
function furnitureClaims(e) {
  if (!furnitureActive() || (e.pointerType === 'mouse' && e.button !== 0) || pinch.pointers.size >= 2) return false;
  setNdc(e);
  Object.assign(furn, { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), item: null, fromRoom: false, grab: null });
  if (build.kind || build.moving) { furn.mode = 'place'; furn.fromRoom = !!build.moving; followPointer(); }
  else {
    const hit = raycaster.intersectObjects(roomObjects, true)[0];
    if (!hit || !hit.object.userData.roomItem) { furn.id = null; return false; }
    furn.mode = 'press'; furn.item = hit.object.userData.roomItem;
    const f = raycaster.intersectObject(roomFloor, false)[0]; // where on the floor the finger is, relative to the item
    if (f && !ROOM_ITEMS[furn.item.k].wall) furn.grab = new THREE.Vector3(furn.item.x - f.point.x, 0, furn.item.z - f.point.z);
  }
  downPos = null; // not a walk tap
  return true;
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!furn.mode || e.pointerId !== furn.id) return;
  if (pinch.pointers.size >= 2) { furn.mode = null; return; }
  setNdc(e);
  if (furn.mode === 'press' && Math.hypot(e.clientX - furn.x0, e.clientY - furn.y0) > DRAG_START_PX) { // started dragging a placed item
    pickUpItem(furn.item); furn.mode = 'place'; furn.fromRoom = true;
  }
  if (furn.mode === 'place') followPointer();
});
const endFurniture = (e) => {
  if (!furn.mode || e.pointerId !== furn.id) return;
  const mode = furn.mode; furn.mode = null; furn.id = null;
  if (e.type === 'pointercancel') return;
  if (mode === 'press') { pickUpItem(furn.item); return; } // a short tap: selected, ready to rotate or remove
  setNdc(e); followPointer();
  if (build.item && build.valid) commitPlacement();
  else if (build.moving && furn.fromRoom && performance.now() - furn.t0 > TAP_MAX_MS) { putBackMoving(); toast("It doesn't fit there, so it went back"); }
  else toast("That spot isn't free");
};
renderer.domElement.addEventListener('pointerup', endFurniture);
renderer.domElement.addEventListener('pointercancel', endFurniture);

// the rotate handle: a little circle in front of the item in hand; drag it around the item to turn it to any angle
const rotHandle = document.createElement('button');
rotHandle.type = 'button'; rotHandle.className = 'rot-handle'; rotHandle.title = 'Drag to turn'; rotHandle.setAttribute('aria-label', 'Turn the item');
rotHandle.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M35 15 A14 14 0 1 0 38 27" fill="none" stroke="#7a4a26" stroke-width="5" stroke-linecap="round"/><path d="M36 6 L36 17 L25 16" fill="none" stroke="#7a4a26" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
seatLayer.appendChild(rotHandle);
const rot = { id: null };
rotHandle.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  rot.id = e.pointerId; try { rotHandle.setPointerCapture(e.pointerId); } catch { /* fine without */ }
  rotHandle.classList.add('pressed');
});
rotHandle.addEventListener('pointermove', (e) => {
  if (e.pointerId !== rot.id || !build.item || ROOM_ITEMS[build.item.k].wall) return;
  setNdc(e);
  const f = raycaster.intersectObject(roomFloor, false)[0];
  if (f) turnBuild(Math.atan2(f.point.x - build.item.x, f.point.z - build.item.z)); // the item's front faces the pointer
});
const endRot = (e) => { if (e.pointerId === rot.id) { rot.id = null; rotHandle.classList.remove('pressed'); } };
rotHandle.addEventListener('pointerup', endRot);
rotHandle.addEventListener('pointercancel', endRot);
const _rotV = new THREE.Vector3();
function updateRotHandle() {
  const item = build.item;
  let show = furnitureActive() && !!(build.kind || build.moving) && !!item && !ROOM_ITEMS[item.k].wall && !!build.ghost && build.ghost.visible;
  if (show) {
    const b = footBox(item), reach = Math.max(b.hw, b.hd) + 0.45, a = itemAngle(item);
    _rotV.set(item.x + Math.sin(a) * reach, build.ghost.position.y + 0.25, item.z + Math.cos(a) * reach).project(camera);
    const x = (_rotV.x * 0.5 + 0.5) * window.innerWidth, y = (-_rotV.y * 0.5 + 0.5) * window.innerHeight;
    if (_rotV.z > 1) show = false;
    else if (rot.id === null) rotHandle.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  rotHandle.classList.toggle('show', show || rot.id !== null);
}

// other players: shown only when they are in the same place (the island, or the same room)
function refreshRemotes() {
  for (const r of remotes.values()) {
    const same = (r.room || null) === myRoom;
    if (same) { const target = myRoom === null ? scene : roomScene; if (r.player.parent !== target) target.add(r.player); }
    r.player.visible = same;
  }
}

// ---------------------------------------------------------------- tending your own garden
// The owner taps a soil square to pick it; a small floating button on that square plants a sprout (empty soil)
// or grows it into the crop (sprout). Free for now; the server checks the owner and keeps the squares.
const GARDEN_REACH = 2.2;
let gardenSel = null; // { slot, i }
const myGardenSlot = () => (net.online && net.myName ? plotSlots.find((sl) => sl.owner === net.myName) : null) || null;
function gardenCellWorld(slot, i, out) { const p = gardenCellPos(i); slot.group.updateMatrixWorld(true); return slot.group.localToWorld(out.set(p.x, 0.17, p.z)); }
// a grown island plant (anyone may pick these); bare ones regrow GARDEN.growMs after their harvest
const islandGrown = (sp) => nowMs() - (islandHarvested[sp.idx] || 0) >= GARDEN.growMs;
function gardenTap() {
  const mine = myGardenSlot();
  const ripe = islandSpots.filter(islandGrown).map((sp) => sp.crop);
  const hit = raycaster.intersectObjects([...(mine ? mine.garden.cells.map((c) => c.soil) : []), ...ripe], true)[0];
  const isl = hit && hit.object.userData.islandSpot;
  if (isl) { // the island garden: walk beside the plant, then the Harvest button shows
    gardenSel = { spot: isl };
    const pos = isl.crop.getWorldPosition(new THREE.Vector3());
    if (Math.hypot(pos.x - player.position.x, pos.z - player.position.z) > GARDEN_REACH) {
      walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null;
      const side = new THREE.Vector3(player.position.x - pos.x, 0, player.position.z - pos.z).normalize().multiplyScalar(0.75);
      walk.target = new THREE.Vector3(pos.x + side.x, 0, pos.z + side.z);
    }
    return true;
  }
  if (!hit || !hit.object.userData.gardenCell) { gardenSel = null; return false; } // a tap anywhere else lets go of the pick
  gardenSel = { slot: mine, i: hit.object.userData.gardenCell.i };
  const cw = gardenCellWorld(mine, gardenSel.i, new THREE.Vector3());
  if (Math.hypot(cw.x - player.position.x, cw.z - player.position.z) > GARDEN_REACH) { // too far: walk over first
    walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null;
    const st = gardenStand(gardenSel.i);
    walk.target = mine.toWorld(st.x, st.z);
  }
  return true;
}
const HARVEST_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22 h32 l-4 18 a3 3 0 0 1 -3 2.5 h-18 a3 3 0 0 1 -3 -2.5 z" fill="#d9a86a" stroke="#8a5a36" stroke-width="2.4" stroke-linejoin="round"/><path d="M13 22 C13 10 35 10 35 22" fill="none" stroke="#8a5a36" stroke-width="3"/><path d="M12 29 h24 M14 35 h20" stroke="#b07a4a" stroke-width="2"/><circle cx="19" cy="20" r="5" fill="#ef5a4a" stroke="#b8332a" stroke-width="1.6"/><path d="M27 22 L31 12 L34 13 L31 22 Z" fill="#f29a4a" stroke="#c96a22" stroke-width="1.4"/><path d="M31 12 l-1 -4 M32 12 l3 -3" stroke="#3f8a2c" stroke-width="2" stroke-linecap="round"/></svg>';
const PLANT_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40 h32" stroke="#7a553e" stroke-width="5" stroke-linecap="round"/><path d="M24 39 V24" stroke="#4f8f2f" stroke-width="3.5" stroke-linecap="round"/><path d="M24 27 C14 27 11 19 12 14 C20 14 24 19 24 27 Z" fill="#7cc457" stroke="#4f8f2f" stroke-width="2"/><path d="M24 24 C34 24 37 16 36 11 C28 11 24 16 24 24 Z" fill="#93d86a" stroke="#4f8f2f" stroke-width="2"/></svg>';
const gardenBtn = document.createElement('button');
gardenBtn.type = 'button'; gardenBtn.className = 'seat-bubble';
gardenBtn.innerHTML = `<span class="bob">${PLANT_ICON}</span>`;
seatLayer.appendChild(gardenBtn);
const gardenBubble = { btn: gardenBtn, shown: false };
gardenBtn.title = 'Plant a sprout'; gardenBtn.setAttribute('aria-label', 'Plant a sprout');
const _gardenV = new THREE.Vector3();
// the same circle plants on empty soil and harvests a grown crop (your own squares, or any ripe island plant)
bindWorldTap(gardenBtn, () => {
  if (!gardenSel) return;
  if (!net.online) { toast('Gardens grow when you play online'); return; }
  if (gardenSel.spot) { if (islandGrown(gardenSel.spot)) net.send({ t: 'harvest', where: 'island', idx: gardenSel.spot.idx }); return; }
  const c = gardenSel.slot.garden.cells[gardenSel.i];
  if (c.state === 0) net.send({ t: 'garden', plot: gardenSel.slot.n, idx: gardenSel.i, state: 1 });
  else if (c.state === 2) net.send({ t: 'harvest', where: 'plot', plot: gardenSel.slot.n, idx: gardenSel.i });
});
let gardenBtnMode = 'plant';
function setGardenBtnMode(mode) {
  if (mode === gardenBtnMode) return;
  gardenBtnMode = mode;
  const label = mode === 'harvest' ? 'Harvest' : 'Plant a sprout';
  gardenBtn.innerHTML = `<span class="bob">${mode === 'harvest' ? HARVEST_ICON : PLANT_ICON}</span>`;
  gardenBtn.title = label; gardenBtn.setAttribute('aria-label', label);
}
function updateGardenButton() {
  let show = false;
  if (gardenSel && gardenSel.spot && myRoom === null && mySeat === null) {
    gardenSel.spot.crop.getWorldPosition(_gardenV);
    const d = Math.hypot(_gardenV.x - player.position.x, _gardenV.z - player.position.z);
    if (d > 5 && !walk.target) gardenSel = null;
    show = !!gardenSel && d <= GARDEN_REACH && islandGrown(gardenSel.spot);
    if (show) setGardenBtnMode('harvest');
    _gardenV.y += 0.45;
  } else if (gardenSel && gardenSel.slot && myRoom === null && mySeat === null && gardenSel.slot.owner === net.myName) {
    const c = gardenSel.slot.garden.cells[gardenSel.i];
    gardenCellWorld(gardenSel.slot, gardenSel.i, _gardenV);
    const d = Math.hypot(_gardenV.x - player.position.x, _gardenV.z - player.position.z);
    if (d > 5 && !walk.target) gardenSel = null; // walked away: forget the pick
    show = !!gardenSel && d <= GARDEN_REACH && (c.state === 0 || c.state === 2);
    if (show) setGardenBtnMode(c.state === 2 ? 'harvest' : 'plant');
    _gardenV.y += c.state === 2 ? 0.4 : 0.25;
  }
  placeBubble(gardenBubble, _gardenV, show);
}
// the server's answer: a pop out of the soil, then the crop hops into the backpack
function harvestAnswered(m) {
  if (!m.ok) { if (m.msg) toast(m.msg); return; }
  const from = new THREE.Vector3();
  if (m.where === 'island') { const sp = islandSpots[m.idx]; if (sp) sp.crop.getWorldPosition(from); else from.copy(player.position); }
  else { const sl = plotSlots[m.plot - 1]; if (sl) gardenCellWorld(sl, m.idx, from); else from.copy(player.position); }
  toast(`You harvested ${KINDS[m.kind] ? KINDS[m.kind].name : 'a crop'}! It went into your backpack`);
  const f = KINDS[m.kind] ? KINDS[m.kind].make() : null;
  if (!f) return;
  f.position.copy(from); scene.add(f);
  let t = 0;
  transients.push((dt) => {
    t += dt;
    if (t < 0.35) { const u = t / 0.35; f.scale.setScalar(0.7 + Math.sin(u * Math.PI) * 0.6 + u * 0.3); f.position.y = from.y + u * 0.5; return true; } // pop!
    const u = Math.min((t - 0.35) / 0.6, 1);
    f.position.lerpVectors(from, player.position, u); f.position.y += 0.5 + Math.sin(u * Math.PI) * 1.2 + u * 0.8;
    f.rotation.y += dt * 6; f.scale.setScalar(Math.max(0.001, 1.0 * (1 - u * u * u)));
    if (u >= 1) { scene.remove(f); f.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); return false; }
    return true;
  });
}

// ---------------------------------------------------------------- watering gardens
// With the Watering Can: tap a square in any plot garden (anyone may help) or any plant in the island garden. The
// character walks beside it and pours; the server checks it has a sprout, isn't wet yet, you're near and have energy.
function waterTap() {
  if (currentTool !== 'can' || myRoom !== null) return false;
  const soils = plotSlots.flatMap((sl) => sl.garden.cells.map((c) => c.soil));
  const hit = raycaster.intersectObjects([...soils, ...islandSpots.filter((sp) => sp.crop.visible).map((sp) => sp.crop)], true)[0];
  if (!hit) return false;
  const cell = hit.object.userData.gardenCell, spot = hit.object.userData.islandSpot;
  if (!cell && !spot) return false;
  if (!net.online) { toast('Gardens grow when you play online'); return true; }
  const now = nowMs(), target = new THREE.Vector3();
  let job;
  if (cell) {
    const { slot, i } = cell, c = slot.garden.cells[i];
    if (gardenState(c, now) === 0) { toast('Plant something first'); return true; }
    if (gardenWet(c, now)) { toast('Already watered'); return true; }
    if (gardenState(c, now) === 2) { if (slot.owner === net.myName) return false; toast("It's fully grown"); return true; } // the owner harvests it instead
    gardenCellWorld(slot, i, target);
    job = { where: 'plot', plot: slot.n, idx: i, pos: target, stand: slot.toWorld(gardenStand(i).x, gardenStand(i).z) };
  } else {
    if (now - (islandWatered[spot.idx] || 0) < GARDEN.wetMs) { toast('Already watered'); return true; }
    spot.crop.getWorldPosition(target);
    job = { where: 'island', idx: spot.idx, pos: target };
  }
  if (energy < COST_WATER) { toast('Too tired, eat something'); return true; }
  // walk to stand beside it, on the side you're coming from
  const side = new THREE.Vector3(player.position.x - target.x, 0, player.position.z - target.z);
  if (side.lengthSq() < 1e-4) side.set(0, 0, 1);
  side.normalize().multiplyScalar(0.75);
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null;
  walk.waterSpot = job;
  walk.target = job.stand || new THREE.Vector3(target.x + side.x, 0, target.z + side.z); // plot gardens: from in front of the fence
  showMarker(target.x, target.z);
  return true;
}
const COST_WATER = 3;

// ---------------------------------------------------------------- talking to the shopkeepers (client only)
// Tap Mira, Tess, Pip or Oak: the character walks up (or just turns if already beside them) and a dialogue box opens
// at the bottom: a greeting for the Malaysia time of day and the sky, then Chat / About the island / I want to shop / Bye.
// A "..." bubble floats over a shopkeeper you're close enough to talk to. The balloon girl doesn't talk.
const TALK_RANGE = 4, TALK_STAND = 1.25;
const DIALOGUE = {
  seed: {
    portrait: '🧑‍🌾',
    greet: {
      morning: ["Morning! The soil's still cool and damp, perfect for planting.", "Oh, hello! I've been up since the roosters. Want to talk seeds?", "Good morning! Dew on the leaves means a happy garden today."],
      afternoon: ["Afternoon! Hot one, isn't it? My carrots are snoozing under their leaves.", "Hi there! Perfect time for a little shade and a cold drink.", "Hello hello! The sun's doing half my gardening for me today."],
      evening: ["Evening! Best time to water: the plants get a whole cool night to drink.", "Oh, hey! I'm just tidying my pots before the light goes.", "Good evening! The bees have gone home, so now it's just us."],
      night: ["Still awake? Me too. I like listening to the seeds think.", "Hi, night owl! The garden grows quietest in the dark.", "Shh, the sprouts are sleeping. Hello though!"],
    },
    sky: {
      Day: ["Look at that blue sky. My tomatoes are going to love it.", "Not a cloud in sight. Good growing weather!"],
      Dusk: ["Ooh, see how orange the sky is? That's my favourite colour of light.", "The sky's going all peachy. Time to put the trowel down soon."],
      Night: ["The stars are out. My grandma said seeds planted under stars grow brave.", "Moonlight on the leaves... a garden looks magic at night."],
    },
    chat: [
      "Carrots are shy. They hide all their best work underground.",
      "If you water a sprout, it'll be a proper crop in a few minutes. Patience is a seed too!",
      "I talk to my cabbages. They're great listeners, terrible at answering.",
      "Tomatoes like it warm. On this island, they're very happy tomatoes.",
      "Wet soil goes dark and shiny. That's how you know it's had a good drink.",
      "My straw hat is older than some of the palm trees here.",
      "A little mud on your boots means a good day's work.",
      "Rain or no rain, the island garden always needs a helping hand.",
      "I once grew a cabbage so big I had to roll it home!",
    ],
    tips: [
      "You can water anyone's sprouts with your Watering Can, not just your own. Friends love waking up to a wet garden!",
      "Each watering costs a little energy. If you're tired, eat some fruit from your backpack.",
      "The shared island garden near town is for everybody. Give its plants a drink when you pass by!",
      "Plant a sprout in your own yard's garden bed, water it, and come back in a few minutes for the crop.",
    ],
    shop: ["Take a look! Fresh seeds, straight from my own pots.", "Here's what I've got. Every seed's a tiny promise!"],
    bye: ["Bye now! Say hi to your sprouts for me.", "See you! Don't forget to water!", "Off you go, happy growing!"],
    items: [{ icon: '🥕', name: 'Carrot seeds', price: 20 }, { icon: '🍅', name: 'Tomato seeds', price: 30 }, { icon: '🥬', name: 'Cabbage seeds', price: 25 }],
  },
  clothes: {
    portrait: '💁',
    greet: {
      morning: ["Good morning, darling! Fresh day, fresh outfit, right?", "Morning! I've already changed my scarf twice. Can't decide!", "Oh, hello! Morning light makes every colour look brand new."],
      afternoon: ["Afternoon! Sunny days call for big hats and bright colours.", "Hi, hi! Love that you came by. Let me see your look.", "Hello! It's the perfect afternoon for linen. Breezy and chic."],
      evening: ["Evening! Time for something cosy with a little sparkle.", "Oh, good evening! Golden hour is everyone's best angle.", "Hi there! I'm swapping my sunhat for a cardigan."],
      night: ["Out late? Night's the boldest time for fashion, you know.", "Hello, star! Dark colours are so elegant at night.", "Oh! You startled me. I was sketching new hats by lamplight."],
    },
    sky: {
      Day: ["This blue sky goes with absolutely everything.", "Bright sun! Sunglasses season, officially."],
      Dusk: ["This sky is giving peach and lilac. I need it on a dress.", "Sunset colours! I'm taking notes for my next collection."],
      Night: ["Navy sky, silver stars... that's a whole outfit right there.", "The lamps make everyone look so warm and glowy."],
    },
    chat: [
      "Lilac is the colour of the season. Trust me on this.",
      "A good hat can turn a regular walk into a whole event.",
      "I've noticed everyone on the island loves stripes. Very nautical!",
      "Matching your outfit to your roof colour? Bold. I approve.",
      "The secret to style is wearing whatever makes you smile.",
      "I'm designing a hat with a little flower that bobs when you walk.",
      "Fishing in a fancy outfit is a vibe. A wet vibe, but still.",
      "Pink and green together? Like a watermelon. Iconic.",
      "Accessories are the sprinkles on the cake of fashion.",
    ],
    tips: [
      "Every house has its own roof colour. Peek at your neighbours' yards for outfit inspiration!",
      "The clock up in the corner shows real Malaysia time. Dusk on the island is the prettiest light for photos!",
      "Tap a bench or the swing and you can sit down. Perfect for showing off a new look.",
      "Visitors can walk right into your yard through the gate, so keep it looking sharp!",
    ],
    shop: ["Take a look! Everything's handmade with love.", "Ooh, let me show you the new collection!"],
    bye: ["Ciao! Stay fabulous!", "Bye, darling! Come back for a fitting.", "See you! Love the look today."],
    items: [{ icon: '👒', name: 'Sun hat', price: 120 }, { icon: '🎩', name: 'Top hat', price: 150 }, { icon: '🧢', name: 'Cap', price: 80 }, { icon: '👗', name: 'Summer dress', price: 200 }, { icon: '👕', name: 'Striped tee', price: 90 }],
  },
  pet: {
    portrait: '🐶',
    greet: {
      morning: ["Morning!! Biscuit already did three zoomies around the shop!", "Hi hi hi! Good morning! Want to meet my puppy?", "Morning! Biscuit had breakfast and now wants SECOND breakfast."],
      afternoon: ["Hey! It's nap time for Biscuit, but not for me!", "Afternoon! It's so hot, Biscuit is lying flat like a pancake.", "Hiya! Wanna see Biscuit do a trick? He can sit. Sometimes."],
      evening: ["Evening! Biscuit loves this time, it's walkies time!", "Hey hey! The fireflies are coming out, Biscuit tries to catch them!", "Hi! I'm brushing Biscuit before bed. He's so fluffy."],
      night: ["Psst! Biscuit is asleep, he's snoring a tiny snore.", "It's late! I'm only allowed up because I'm guarding the puppies.", "Hi! Did you hear an owl? Biscuit thinks owls are big birds-who-say-boo."],
    },
    sky: {
      Day: ["It's sunny! Perfect for fetch on the beach!", "Look, no clouds! Biscuit wants to chase a seagull."],
      Dusk: ["The sky's pink! Biscuit's nose is pink too. They match!", "Sunset means dinner for puppies. Biscuit knows exactly when."],
      Night: ["Stars! I'm gonna name one after Biscuit.", "The moon is out. Biscuit howled at it once. Very small howl."],
    },
    chat: [
      "Puppies love belly rubs. It's science.",
      "Biscuit's favourite toy is a sock. Nobody knows whose sock.",
      "Did you know cats sleep like, sixteen hours a day? Goals.",
      "I wanna open a pet hotel one day. With tiny beds!",
      "Seagulls are not pets. I asked. Twice.",
      "When Biscuit wags his tail really fast, his whole bottom wiggles!",
      "Bunnies like it quiet, so you have to whisper to them.",
      "Biscuit tried to dig up a crab once. The crab won.",
      "Every pet needs a name that makes you smile when you say it!",
    ],
    tips: [
      "You can catch bugs with the Bug Net! Butterflies are fast, so walk up close first.",
      "Fish jump near the shore. Take your Fishing Rod, tap the water, and wait for the bite!",
      "If you're out of energy, open your backpack and eat some fruit. Biscuit eats when he's tired too!",
      "Fireflies come out at dusk and at night near the lamps. So pretty!",
    ],
    shop: ["Take a look! These are the pets that'll come live here soon!", "Ooh, wanna see? I picked all the names myself!"],
    bye: ["Bye bye! Biscuit says woof!", "See ya! Come back and play!", "Bye! Biscuit's wagging at you!"],
    items: [{ icon: '🐕', name: 'Puppy "Mochi"', price: 500 }, { icon: '🐈', name: 'Kitten "Pudding"', price: 450 }, { icon: '🐇', name: 'Bunny "Sprinkles"', price: 350 }, { icon: '🐥', name: 'Chick "Nugget"', price: 200 }],
  },
  furniture: {
    portrait: '🧔',
    greet: {
      morning: ["Oh. Good morning. I was just... sanding something.", "Morning. The wood smells nice when it's cool out.", "Hello. Early light is good for spotting knots in the grain."],
      afternoon: ["Ah, hello. Afternoon's a quiet time for careful work.", "Hi. Mind the sawdust, it gets everywhere.", "Oh, hello there. I was about to take a little tea break."],
      evening: ["Good evening. A warm lamp and a soft chair... that's all I need.", "Evening. My shop gets cosy when the lights come on.", "Oh, hello. I'm putting my tools away, but I can chat."],
      night: ["Still up? I couldn't sleep either. Thinking about bookshelves.", "Hello... it's peaceful this late, isn't it?", "Oh. Hi. I like the quiet of the night. Good for thinking."],
    },
    sky: {
      Day: ["Bright day. Good for drying a fresh coat of varnish.", "Sunny. The wood looks almost golden today."],
      Dusk: ["The sky's the colour of cherry wood right now. I like it.", "Sunset. Soon the windows in every house will glow."],
      Night: ["Quiet night. Somewhere a house is cosy because of a chair I made. That's nice.", "The stars look like little nail heads in the sky. Sorry, carpenter brain."],
    },
    chat: [
      "A room feels like home once it has a rug. That's my opinion, anyway.",
      "Oak is strong, pine is light, and cedar smells wonderful.",
      "I like round tables. Nobody has to sit at the corner.",
      "One lamp in the right spot can change a whole room.",
      "I once built a chair so comfy I fell asleep testing it.",
      "Plants by the window. Always. They like to see outside too.",
      "Sanding is slow. But slow is how you get smooth.",
      "Your house doesn't have to be fancy. Just yours.",
      "I hum while I work. Please don't tell anyone.",
    ],
    tips: [
      "Inside your own house, pick the House Tool from the tool menu to place furniture. You can turn things any way you like.",
      "Furniture changes stay a draft until you tap Save in the top left. Don't forget, or they'll be gone.",
      "Tap a piece you've already placed to move it, turn it, or put it back in the catalog.",
      "Friends can visit your house and see how you've decorated, but only you can rearrange it.",
    ],
    shop: ["Take a look. I made all of these myself... I hope you like them.", "Here. Each piece is sanded by hand."],
    bye: ["Bye. Take care.", "See you. Sit somewhere comfy tonight.", "Okay. Goodbye. Come by anytime."],
    items: [{ icon: '🛏️', name: 'Wooden bed', price: 400 }, { icon: '🪑', name: 'Chair', price: 120 }, { icon: '🛋️', name: 'Sofa', price: 350 }, { icon: '📚', name: 'Bookshelf', price: 280 }, { icon: '🪴', name: 'Potted plant', price: 60 }],
  },
};
DIALOGUE.bike = {
  portrait: '🧑‍🔧',
  greet: {
    morning: ["Morning! Tyres pumped, chains oiled. Ready to roll?", "Hey, good morning! Best time for a ride, the air's still cool.", "Morning! I've already fixed two squeaky bells today."],
    afternoon: ["Afternoon! Hot out. Riding makes your own breeze, you know.", "Hey there! Perfect weather for a spin round the island.", "Good afternoon! Mind the grease, I just changed a chain."],
    evening: ["Evening! The sunset ride along the road is the best one.", "Hey! Lights on soon. Every bike here has a little lamp.", "Good evening! I'm just tightening a few bolts before dark."],
    night: ["Out late? The bike lamps make the night roads cosy.", "Hey, night rider! Quiet roads, bright stars.", "Still up? Me too. Bikes don't fix themselves."],
  },
  sky: {
    Day: ["Not a cloud in the sky. Good day for a long ride.", "Sunny and dry. The roads are perfect today."],
    Dusk: ["Look at that pink sky. The front lamps just flicked on.", "Dusk already. Ride slow and enjoy the colours."],
    Night: ["See the lamps along the road? Follow them and you can't get lost.", "Night breeze, starry sky. Best time for a quiet ride."],
  },
  chat: [
    "A happy bicycle goes 'click click click' when it rolls. A sad one goes 'squeak'.",
    "I named every bike on the rack. The mint one is Sprout.",
    "The secret to a smooth ride? A drop of oil and a lot of patience.",
    "I once rode all the way round the loop road without touching the brakes. Don't tell anyone.",
    "Bells are important. A ding is just a friendly hello on wheels.",
    "My cap has a grease spot shaped like a turtle. I'm keeping it.",
    "You can't ride into the water. I've tried. The bike was not impressed.",
    "Wheels are just circles that decided to go somewhere.",
  ],
  tips: [
    "A bicycle gets you round the island about twice as fast as walking, and it doesn't cost any energy.",
    "Tap the ground while riding and the bike steers itself there. Tap somewhere new to change your mind.",
    "Park the bike before you go into a house. Bicycles aren't allowed indoors, it's a rule.",
    "The road east goes to the desert and the one west goes to the beach. Both are lovely by bike.",
  ],
  shop: ["Free of charge! Pick a colour you like.", "No coins needed. Which colour do you fancy?"],
  lent: ["Here you go! She's right beside you. Tap the Ride button to hop on.", "All yours! Ride safe, and give the bell a ding for me."],
  back: ["Thanks for bringing her back! She'll roll home to the rack.", "Back in one piece! Good rider."],
  bye: ["See you! Keep the wheels turning.", "Bye! Ride safe out there.", "Later! Ding ding!"],
};
// the beach festival's vendors: their lines, and what their booth will sell (from FESTIVAL_ITEMS at the top)
const FEST_SKY = {
  Day: ["What a sunny day for a festival!", "Bright sun, blue water. Don't forget to drink something cold."],
  Dusk: ["The sky's going orange... the lanterns will come on soon!", "Sunset at the festival is the best part, I think."],
  Night: ["Look at all the little lights! The beach looks like a jewellery box.", "The stars came out for the festival too."],
};
Object.assign(DIALOGUE, {
  swim: {
    portrait: '👙', title: 'Swimwear booth', soon: true, sky: FEST_SKY,
    greet: {
      morning: ["Morning! Perfect weather for a swim, isn't it?", "Good morning! The water's still cool. Lovely and fresh!"],
      afternoon: ["Hi hi! Hot afternoon, perfect for the beach!", "Hello! Don't forget your hat in this sun."],
      evening: ["Evening! A sunset swim is a fancy swim.", "Oh, hello! The sand's still warm from today."],
      night: ["Out late? Night swims are for the brave!", "Hello, night owl! Want to see the shiny swimsuits?"],
    },
    chat: [
      "Stripes or polka dots? Why not both!",
      "A good sun hat is like a little umbrella you can wear.",
      "I tried on every swimsuit on this rack. Twice.",
      "Heart sunglasses make everything look cuter. Science.",
      "The pink one matches the sunset exactly. I checked.",
      "Pogo keeps borrowing my hats for his swim rings. Rude!",
    ],
    tips: ["Wade into the shallows by the beach. The water's clear enough to see the little fish!", "The lanterns along the boardwalk light up at dusk. Come back and see!"],
    shop: ["Take a look! It's all coming very soon.", "Here's what I'll have! Not quite ready yet though."],
    bye: ["Bye bye! Stay sunny!", "See you on the sand!"],
  },
  rings: {
    portrait: '🛟', title: 'Swim ring booth', soon: true, sky: FEST_SKY,
    greet: {
      morning: ["Morning! I've already blown up forty rings. Phew!", "Good morning! Float on, float on!"],
      afternoon: ["Hey! Perfect floating weather!", "Afternoon! Want to see the duck? Everyone wants to see the duck."],
      evening: ["Evening! The water's calm. Great for floating.", "Hey there! The rings look extra bright at sunset."],
      night: ["Night time! Even the duck is sleepy.", "Hey, night swimmer! Glow rings would be cool, huh?"],
    },
    chat: [
      "Every ring here was blown up by me. My cheeks are very strong.",
      "The duck's name is Captain. He's in charge.",
      "Beach balls bounce better on sand than you'd think.",
      "I wear a swim ring all day. Just in case.",
      "A donut ring you can't eat is a little bit sad.",
      "Never trust a beach ball in the wind.",
    ],
    tips: ["Little crabs live on the sand. They scuttle off if you rush at them!", "Fish around the coral rocks if you want a clownfish or a pufferfish."],
    shop: ["Pick a float! Well... soon you can!", "Here's what's coming. Captain approves."],
    bye: ["Float safe!", "Bye! Captain says bye too."],
  },
  lantern: {
    portrait: '🏮', title: 'Paper lantern booth', soon: true, sky: FEST_SKY,
    greet: {
      morning: ["Morning... the lanterns are sleeping, but they're still pretty.", "Good morning! I'm folding new lanterns today."],
      afternoon: ["Hello! The lanterns are resting before tonight.", "Afternoon! Come back at dusk, they glow so softly."],
      evening: ["Evening! Watch, the lanterns are about to wake up.", "Oh, it's my favourite time. Lantern time!"],
      night: ["Isn't it beautiful? Every lantern has its own colour.", "Good evening! The lanterns are glowing just for you."],
    },
    chat: [
      "Each lantern takes me a whole afternoon to fold.",
      "The peach ones glow the warmest. I don't know why.",
      "A lantern is just a little piece of sunset you can keep.",
      "I hang one in my window every night.",
      "When the wind blows, the lanterns dance. Shh, listen.",
    ],
    tips: ["The cabin up by the beach hut has a balcony. Climb the stairs at night and look at all the lights!", "The restaurant on stilts at the south end of the beach has a fire show every ten minutes!"],
    shop: ["These will light up your home... soon!", "Here's my lantern list. Coming soon, I promise."],
    bye: ["Goodnight, little light!", "Bye! Shine bright."],
  },
  snack: {
    portrait: '🍧', title: 'Snack booth', soon: true, sky: FEST_SKY,
    greet: {
      morning: ["Morning! Shaved ice for breakfast? I won't tell.", "Good morning! The coconuts are extra fresh."],
      afternoon: ["Hot day! You need shaved ice. Trust me.", "Hello! Cold coconut? It's the best thing in this heat."],
      evening: ["Evening! The grill's warming up for corn.", "Hi! Sunset snacks taste better. It's a fact."],
      night: ["Late snack? I've got you.", "Night munchies? Welcome!"],
    },
    chat: [
      "Rainbow ice is every flavour at once. Very efficient.",
      "I shake the coconuts to check they're good. They always say yes.",
      "Brain freeze is just your head saying thank you.",
      "My bandana keeps the ice syrup out of my hair. Mostly.",
      "Grilled corn plus a sea breeze. Perfect.",
    ],
    tips: ["Fruit from the trees and veggies from the gardens give you energy back. Eat when you're tired!", "Bo buys fish and shells by the loop road if you need coins."],
    shop: ["Here's my menu! Kitchen opens soon.", "Take a peek! Snacks coming soon."],
    bye: ["Bye! Stay cool!", "Come back hungry!"],
  },
  games: {
    portrait: '🎯', title: 'Game booth', soon: true, sky: FEST_SKY,
    greet: {
      morning: ["Morning! Warm up those throwing arms!", "Good morning, champ!"],
      afternoon: ["Step right up! Well, soon you can.", "Hey! Ready to win a crab plush?"],
      evening: ["Evening! The best throws happen at sunset.", "Hey hey! The prizes are waiting!"],
      night: ["Night games! Nobody can see you miss.", "Hey, night champ!"],
    },
    chat: [
      "The trick to ring toss is a gentle wrist. And luck.",
      "Nobody has won the big crab plush yet. Will you be first?",
      "I practise every morning. I still miss sometimes.",
      "The toy fish are magnetic. Very clever fish.",
      "Cheering is free! I recommend it.",
      "My whistle is for celebrating, not for stopping fun.",
    ],
    tips: ["Tap the Board button at the balloon park to fly up high and see the whole island.", "Rex by the plaza lends bicycles for free!"],
    shop: ["Here's what you can play... soon!", "Prizes and games, coming soon!"],
    bye: ["Good luck out there!", "Bye, champ!"],
  },
});
for (const k of ['swim', 'rings', 'lantern', 'snack', 'games']) DIALOGUE[k].items = FESTIVAL_ITEMS.filter((it) => it.booth === k).map(({ id, icon, name, price }) => ({ id, icon, name, price }));
// the seaside restaurant's staff: their lines; "Menu" lists MENU_ITEMS (from the top) with orders coming soon
const RESTO_SKY = {
  Day: ["Bright day, calm sea. Perfect for eating by the water.", "Look how blue the water is today!"],
  Dusk: ["Sunset over the sea... best table in the house is any table right now.", "The lanterns are coming on. My favourite time here."],
  Night: ["Hear the waves under the deck? That's our music.", "The fire show looks amazing on a night like this."],
};
Object.assign(DIALOGUE, {
  waiter: {
    portrait: '🧑‍🍳', title: 'Seaside menu', soon: true, buy: 'Order', menuLabel: 'Menu', sky: RESTO_SKY,
    greet: {
      morning: ["Good morning! Welcome to the restaurant on the sea!", "Morning! Sit anywhere, every chair looks at the waves."],
      afternoon: ["Good afternoon! Table for one? Or for friends?", "Hello hello! It's breezy out on the deck, lovely and cool."],
      evening: ["Good evening! You're just in time for the sunset.", "Welcome! The lanterns are on, find a nice seat."],
      night: ["Good evening, night owl! The kitchen's still warm.", "Welcome! The sea sparkles at night, doesn't it?"],
    },
    chat: [
      "I carry six drinks at once. Seven if nobody's watching.",
      "The best seat? The one at the front, right by the water.",
      "Bakar sings to the noodles. He says it makes them springy.",
      "Sometimes a fish jumps right by the deck. Everyone cheers.",
      "Api practises fire twirls every evening. Don't worry, it's very safe!",
      "I named the boat at the pier 'Little Wave'. Bakar says it's silly.",
    ],
    tips: ["The fire show starts every ten minutes. Grab a seat facing the stage!", "You can sit on any free chair, just tap the little circle. Tap the ground to stand up."],
    shop: ["Here's our menu! We're not serving yet, but soon!", "Have a look. Everything's coming soon, I promise!"],
    bye: ["Thank you, come again!", "Bye! Enjoy the sea breeze!"],
  },
  cook: {
    portrait: '👨‍🍳', title: 'Seaside menu', soon: true, buy: 'Order', menuLabel: 'Menu', sky: RESTO_SKY,
    greet: {
      morning: ["Morning! The fishing boat came back full today.", "Good morning! I'm just sharpening my knives. Joking. Chopping onions."],
      afternoon: ["Afternoon! Smell that? Butter, garlic and the sea.", "Hello! The wok is hot and so is the weather!"],
      evening: ["Evening! Dinner rush. My favourite rush.", "Good evening! The crabs look extra happy today."],
      night: ["Late dinner? Good choice. Night food tastes better.", "Still cooking! A kitchen by the sea never sleeps."],
    },
    chat: [
      "A good wok needs a big flame and a brave cook.",
      "The fish in the tank are friends, not food. Their names are Pip, Pop and Pancake.",
      "Coconut rice is all about patience. And coconut.",
      "Chili crab is sweet first, then spicy. Like me.",
      "I learned to cook from my grandma. She still says I use too much garlic.",
    ],
    tips: ["Fish from the beach shallows can bite better than the river. Try for a clownfish!", "Bo buys seafood by the loop road, if you catch more than you need."],
    shop: ["Here's what I'll be cooking! Soon, very soon.", "Today's menu! Kitchen opens properly soon."],
    bye: ["Bye! Come hungry next time!", "See you! Mind the steps!"],
  },
});
for (const k of ['waiter', 'cook']) DIALOGUE[k].items = MENU_ITEMS.map(({ id, icon, name, price }) => ({ id, icon, name, price }));
// Captain Lia at the banana boat jetty
DIALOGUE.banana = {
  portrait: '🧑‍✈️', menuLabel: 'Take a ride', sky: RESTO_SKY,
  greet: {
    morning: ["Ahoy, good morning! The sea is smooth as glass today.", "Morning, sailor! The boats are fuelled and ready."],
    afternoon: ["Ahoy! Perfect afternoon for a splashy ride!", "Hello there! Life vests on, big smiles on!"],
    evening: ["Ahoy! An evening ride means sunset spray. Lovely!", "Good evening! The water turns gold out past the buoys."],
    night: ["Ahoy, night owl! The lanterns on the jetty will light your way.", "Evening ride? The sea sparkles at night, you know."],
  },
  chat: [
    "I've captained every boat on this beach. Even the bathtub ones.",
    "The banana boat is the happiest boat. Look at its little face!",
    "Hold the handles, lean into the turns, and laugh as loud as you like.",
    "Sometimes the pink dolphins race us. They always win.",
    "My cap has been in the sea four times. It always floats back.",
    "Rule one of the sea: always wave at other boats.",
  ],
  tips: ["Swim anywhere inside the buoys, but the boats' lane by the jetty is for boats only.", "Out past the buoys you might spot the pink dolphins jumping!"],
  ride: ["Hop on! Tap a Ride circle over a free seat on the banana boat.", "Pick a seat on the banana, any seat! We leave a few seconds after the first rider sits down."],
  bye: ["Fair winds!", "Bye! Stay splashy!"],
};
// the banana boat drivers (tap them while their boat waits at the jetty)
DIALOGUE.driver0 = {
  portrait: '👧', menuLabel: 'About the ride', sky: RESTO_SKY,
  greet: {
    morning: ["Selamat pagi! Morning rides are the splashiest, trust me!", "Good morning! I've already done three laps. For practice!"],
    afternoon: ["Hi hi! Hot afternoon? Nothing cools you down like banana spray!", "Selamat petang! My boat is warmed up and ready to zoom."],
    evening: ["Good evening! The sea goes all golden out past the buoys.", "Evening! Sunset rides are my favourite. Everything sparkles."],
    night: ["Oh, a night owl! My running lights will keep us safe out there.", "Selamat malam! The sea at night is so calm. And so dark. Hold on tight!"],
  },
  chat: [
    "I named my boat Bubblegum. Mak Jah says it sounds like a sweet, and she's right!",
    "Captain Lia taught me to drive. Her first rule: always wave back at the riders.",
    "The best part is the big S-turn. Everyone screams, then everyone laughs.",
    "Once a pink dolphin jumped right over the rope. I still can't believe it!",
    "I wear my life vest even on the jetty. It's comfy. And it's orange!",
  ],
  tips: ["Lean into the turns with the banana and you'll feel like you're flying!", "If you want to stop, tap Get off. I'll slow down gently and bring you back to the jetty, promise."],
  ride: ["Tap a Ride circle over a free seat on my banana. We leave ten seconds after the first rider sits, or tap Start!", "Six seats, three pairs. The front pair gets the most spray!"],
  bye: ["See you on the water!", "Bye bye! Come ride soon!"],
};
DIALOGUE.driver1 = {
  portrait: '👵', menuLabel: 'About the ride', sky: RESTO_SKY,
  greet: {
    morning: ["Good morning, dear. Did you have breakfast? Never ride on an empty tummy.", "Pagi, sayang! The sea is calm, just how I like it."],
    afternoon: ["Ah, hello dear! Sit with me a moment, the sun is lovely.", "Afternoon, sayang. My boat may be old, but she's still fast!"],
    evening: ["Good evening, dear. I've driven boats at sunset for forty years.", "Ah, evening already! The best light for a ride, you know."],
    night: ["So late, dear! Wrap up warm, the spray is cool at night.", "Night rides are peaceful. Just us, the stars and the motor."],
  },
  chat: [
    "When I was a girl, we paddled out on banana leaves. Well, almost.",
    "Suri drives very fast. I drive fast too, but more gracefully.",
    "My straw hat has never fallen off. Not once. It's a family secret.",
    "I bring kuih for the riders sometimes. Don't tell Captain Lia.",
    "The dolphins know my boat. They come to say hello when I hum.",
  ],
  tips: ["Hold the handles with both hands, dear. The turns are wide but they are quick!", "Feeling dizzy? Tap Get off and I'll take us home nice and slow."],
  ride: ["Pick any free seat on the banana, dear, and tap the Ride circle over it.", "We set off a little while after the first rider sits down. Or tap Start if you can't wait!"],
  bye: ["Take care, sayang!", "Bye bye, dear. Mind the sun!"],
};
const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
function timeOfDay() {
  const h = mytParts(nowMs()).h;
  return h >= 5 && h < 12 ? 'morning' : h < 17 && h >= 12 ? 'afternoon' : h >= 17 && h < 20 ? 'evening' : 'night';
}
const dlgUI = {
  root: document.getElementById('dialogue'), name: document.getElementById('dlgName'), portrait: document.getElementById('dlgPortrait'),
  text: document.getElementById('dlgText'), more: document.getElementById('dlgMore'), choices: document.getElementById('dlgChoices'),
  shop: document.getElementById('shopPanel'), shopTitle: document.getElementById('shopTitle'), shopList: document.getElementById('shopList'), shopClose: document.getElementById('shopClose'),
};
// dlg: who we're talking to, the lines still to show, the line being typed and what happens after the last line
const dlg = { npc: null, queue: [], line: '', shown: 0, then: null, choosing: false, lastChat: -1, doneT: 0 };
const TYPE_CPS = 38; // characters per second: a gentle typewriter
function npcTalkSpec(n) { return DIALOGUE[n.kind]; }
function startTalk(n) {
  const spec = npcTalkSpec(n);
  if (!spec || myRoom !== null) return;
  if (mySeat !== null) standUp();
  dlg.npc = n; dlg.lastChat = -1;
  dlgUI.name.textContent = SHOPKEEPERS[n.kind].name;
  dlgUI.name.style.background = SHOPKEEPERS[n.kind].tag;
  dlgUI.portrait.textContent = spec.portrait;
  dlgUI.root.classList.add('open');
  const lines = [pickFrom(spec.greet[timeOfDay()])];
  if (Math.random() < 0.6) lines.push(pickFrom(spec.sky[cur.name] || spec.sky.Day)); // a word about the sky as it is now
  say(lines, showChoices);
}
function say(lines, then) {
  dlg.queue = lines.slice(); dlg.then = then; dlg.choosing = false;
  dlgUI.choices.classList.remove('show');
  nextLine();
}
function nextLine() {
  dlg.line = dlg.queue.shift() || ''; dlg.shown = 0; dlg.doneT = 0;
  dlgUI.text.textContent = ''; dlgUI.more.classList.remove('show');
}
function lineDone() { return dlg.shown >= dlg.line.length; }
function showChoices() {
  dlg.choosing = true;
  const rex = dlg.npc && dlg.npc.kind === 'bike';
  dlgUI.choices.querySelector('[data-talk="shop"]').textContent = rex ? 'Borrow a bicycle' : (dlg.npc && DIALOGUE[dlg.npc.kind] && DIALOGUE[dlg.npc.kind].menuLabel) || 'I want to shop';
  dlgUI.choices.querySelector('[data-talk="return"]').hidden = !(rex && myBike());
  dlgUI.more.classList.remove('show');
  dlgUI.choices.classList.add('show');
}
function endTalk() {
  if (!dlg.npc) return;
  dlg.npc = null; dlg.queue = []; dlg.then = null; dlg.choosing = false;
  document.getElementById('bikePanel').classList.remove('open');
  dlgUI.root.classList.remove('open'); dlgUI.choices.classList.remove('show');
  closeShopPanel();
}
// a tap on the box: finish the line being typed, or go on to the next one
function advanceTalk() {
  if (!dlg.npc || dlg.choosing || dlgUI.shop.classList.contains('open') || document.getElementById('bikePanel').classList.contains('open')) return;
  if (!lineDone()) { dlg.shown = dlg.line.length; dlgUI.text.textContent = dlg.line; dlgUI.more.classList.add('show'); return; }
  if (dlg.queue.length) { nextLine(); return; }
  const then = dlg.then; dlg.then = null;
  if (then) then(); else endTalk();
}
function chooseTalk(what) {
  const n = dlg.npc, spec = n && npcTalkSpec(n);
  if (!spec || !dlg.choosing) return;
  if (what === 'chat') {
    let i; do { i = Math.floor(Math.random() * spec.chat.length); } while (i === dlg.lastChat && spec.chat.length > 1); // never the same twice in a row
    dlg.lastChat = i;
    say([spec.chat[i]], showChoices);
  } else if (what === 'island') say([pickFrom(spec.tips)], showChoices);
  else if (what === 'shop' && n.kind === 'bike') bikeBorrowTalk();
  else if (what === 'shop' && (n.kind === 'banana' || n.driver)) say([pickFrom(spec.ride)], showChoices);
  else if (what === 'shop') say([pickFrom(spec.shop)], () => openShopPanel(n));
  else if (what === 'return') { dlg.choosing = false; dlgUI.choices.classList.remove('show'); bikeSend({ t: 'bikeReturn' }); }
  else say([pickFrom(spec.bye)], null);
}
function openShopPanel(n) {
  const spec = npcTalkSpec(n);
  dlgUI.shopTitle.textContent = `${SHOPKEEPERS[n.kind].name}'s ${{ seed: 'Seed Shop', clothes: 'Boutique', pet: 'Pet Shop', furniture: 'Furniture Shop' }[n.kind] || spec.title}`;
  dlgUI.shopList.innerHTML = spec.items.map((it) => `<div class="shop-row"><span class="slot shop-icon">${it.icon}</span><span class="shop-name">${it.name}</span><span class="shop-price">🪙 ${it.price}</span><button type="button" class="shop-buy" disabled>${spec.buy || 'Buy'}</button></div>`).join('') + (spec.soon ? '<p class="shop-soon">Coming soon</p>' : '');
  dlgUI.shop.classList.add('open');
}
function closeShopPanel() {
  const wasOpen = dlgUI.shop.classList.contains('open');
  dlgUI.shop.classList.remove('open');
  if (wasOpen && dlg.npc) showChoices(); // back to the menu
}
dlgUI.root.addEventListener('click', (e) => {
  const c = e.target && e.target.closest && e.target.closest('[data-talk]');
  if (c) { chooseTalk(c.dataset.talk); return; }
  advanceTalk();
});
dlgUI.shopClose.addEventListener('click', closeShopPanel);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlgUI.shop.classList.contains('open')) closeShopPanel(); });
// tapping a shopkeeper in the world: walk up beside them (or just turn if close), then talk
function npcUnder() {
  const hits = raycaster.intersectObjects(shopkeepers.map((n) => n.g), true);
  if (!hits.length) return null;
  for (let o = hits[0].object; o; o = o.parent) { const n = shopkeepers.find((k) => k.g === o); if (n) return n; }
  return null;
}
function talkTo(n) {
  const p = n.g.position, d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
  if (n.driver) { // in the boat: chat from the jetty, never wade out to them
    if (!n.docked) { toast(`${SHOPKEEPERS[n.kind].name} is out on the water`); return; }
    if (driverReach(n) > TALK_RANGE + 0.3) { toast(`Come closer to ${SHOPKEEPERS[n.kind].name}'s boat to chat`); return; }
    walk.target = null; walk.talk = null; walk.heading = Math.atan2(p.x - player.position.x, p.z - player.position.z); startTalk(n); return;
  }
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.waterSpot = null;
  if (d <= TALK_STAND + 0.35) { walk.target = null; walk.talk = null; walk.heading = Math.atan2(p.x - player.position.x, p.z - player.position.z); startTalk(n); return; }
  const dir = new THREE.Vector3(player.position.x - p.x, 0, player.position.z - p.z).normalize();
  walk.talk = n;
  walk.target = new THREE.Vector3(p.x + dir.x * TALK_STAND, 0, p.z + dir.z * TALK_STAND);
}
function npcTap() {
  if (myRoom !== null) return false;
  const n = npcUnder();
  if (!n) return false;
  if (Math.hypot(player.position.x - n.g.position.x, player.position.z - n.g.position.z) > TALK_RANGE) { // too far to talk: just walk over
    talkTo(n); walk.talk = null; return true;
  }
  talkTo(n);
  return true;
}
// "..." over a shopkeeper you could talk to
const TALK_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="13" cy="25" r="4.5" fill="#8a5a36"/><circle cx="24" cy="25" r="4.5" fill="#8a5a36"/><circle cx="35" cy="25" r="4.5" fill="#8a5a36"/></svg>';
const talkBubbles = shopkeepers.map((n) => {
  const b = makeDoorBubble(TALK_ICON, `Talk to ${SHOPKEEPERS[n.kind].name}`, () => { if (mySeat !== null) standUp(); talkTo(n); });
  b.btn.classList.add('talk-bubble');
  return { n, ...b };
});
const _talkV = new THREE.Vector3();
// ---- riding: the server keeps who sits where ({ seat -> { id, at } } per ride); a circle "Ride" button at each
// entrance boards the ride. The Ferris wheel carries you one full turn and lets you off; on the merry-go-round,
// tap the ground to get off.
const RIDE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="22" r="15" fill="none" stroke="#e8c25a" stroke-width="3"/><circle cx="24" cy="22" r="3.5" fill="#f2a6c0"/><path d="M24 7 V37 M9 22 H39 M13.4 11.4 L34.6 32.6 M34.6 11.4 L13.4 32.6" stroke="#e8c25a" stroke-width="1.8"/><rect x="20" y="3" width="8" height="7" rx="2" fill="#9be0c0" stroke="#4f8f6a" stroke-width="1.4"/><rect x="20" y="34" width="8" height="7" rx="2" fill="#f2a6c0" stroke="#b05a7a" stroke-width="1.4"/><path d="M18 46 L24 26 L30 46" fill="none" stroke="#8a5a36" stroke-width="3" stroke-linecap="round"/></svg>';
const rideState = { ferris: new Map(), carousel: new Map() };
let myRide = null; // { kind, seat, at } while the local player rides
function rideOf(id) {
  for (const kind of ['ferris', 'carousel']) for (const [seat, o] of rideState[kind]) if (o.id === id) return { kind, seat, at: o.at };
  return null;
}
function applyRides(m) {
  for (const kind of ['ferris', 'carousel']) rideState[kind] = new Map((m[kind] || []).map(([k, id, at]) => [k, { id, at }]));
  const mine = net.id !== undefined ? rideOf(net.id) : null;
  if (mine && (!myRide || myRide.kind !== mine.kind || myRide.seat !== mine.seat)) startRiding(mine);
  else if (!mine && myRide) stepOffRide();
  net.awaitRide = false;
}
function startRiding(r) {
  if (mySeat !== null) standUp();
  if (dlg.npc) endTalk();
  if (fishing) endFishing();
  myRide = r;
  walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null;
  toast(r.kind === 'ferris' ? 'Up you go! Enjoy one full turn of the Ferris wheel' : 'Wheee! Tap the ground to hop off the merry-go-round');
}
function stepOffRide() {
  const e = RIDE_ENTRANCE[myRide.kind];
  myRide = null;
  player.position.set(e.x, groundY(e.x, e.z), e.z);
  player.rotation.x = 0;
  walk.heading = Math.atan2(TOWN.x - e.x, TOWN.z - e.z);
}
const _rideV = new THREE.Vector3(), _rideQ = new THREE.Quaternion(), _rideE = new THREE.Euler();
// a rider sits in their gondola (facing out of the wheel, toward the town side) or astride their animal
function placeRiding(character, charRig, kind, seat, dt, time) {
  const holder = kind === 'ferris' ? ferris.gondolas[seat] : carousel.animals[seat];
  if (!holder) return;
  holder.userData.seat.getWorldPosition(_rideV);
  character.position.set(_rideV.x, _rideV.y - 0.5, _rideV.z);
  holder.getWorldQuaternion(_rideQ); _rideE.setFromQuaternion(_rideQ, 'YXZ');
  character.rotation.set(0, kind === 'ferris' ? ferris.g.rotation.y : _rideE.y, 0);
  animateRig(charRig, dt, time, false, 0, 0);
  charRig.legL.rotation.x = charRig.legR.rotation.x = -1.45;
  if (kind === 'carousel') { charRig.legL.rotation.z = 0.35; charRig.legR.rotation.z = -0.35; }
  charRig.armL.rotation.x = charRig.armR.rotation.x = -0.55;
  charRig.body.rotation.x = 0; charRig.body.position.y = 0.55;
}
let rideBubbles = null;
// close enough to board: anywhere within RIDE_REACH of the ride's pad (the server allows a little more)
const RIDE_REACH = 3.5;
const rideReach = (kind, p) => Math.hypot(p.x - RIDES[kind].x, p.z - RIDES[kind].z) <= RIDES[kind].pad + RIDE_REACH;
// the point just outside the ride's pad nearest to p (where the button floats, and where you walk to)
function rideEdgeNear(kind, p) {
  const c = RIDES[kind], dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1, r = c.pad + 0.9;
  return { x: c.x + (dx / l) * r, z: c.z + (dz / l) * r };
}
// tapping the wheel or the merry-go-round itself: board it if you're close, or walk over and board on arrival
function rideUnder() {
  for (const kind of ['ferris', 'carousel']) if (raycaster.intersectObject(kind === 'ferris' ? ferris.g : carousel.g, true).length) return kind;
  return null;
}
function rideTap() {
  if (myRoom !== null || myRide) return false;
  const kind = rideUnder();
  if (!kind) return false;
  if (rideReach(kind, player.position)) { boardRide(kind); return true; }
  const e = rideEdgeNear(kind, player.position);
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null;
  walk.ride = kind; walk.target = new THREE.Vector3(e.x, 0, e.z);
  showMarker(e.x, e.z);
  return true;
}
function boardRide(kind) {
  if (pianoBlocked()) return;
  if (!net.online) { toast('The rides run when you play online'); return; }
  if (mySeat !== null) standUp();
  let seat;
  if (kind === 'carousel') { // the free animal nearest you
    let bd = Infinity;
    carousel.animals.forEach((an, k) => { if (rideState.carousel.has(k)) return; an.userData.seat.getWorldPosition(_rideV); const d = Math.hypot(_rideV.x - player.position.x, _rideV.z - player.position.z); if (d < bd) { bd = d; seat = k; } });
    if (seat === undefined) { toast('Every animal is taken right now'); return; }
  } else if (rideState.ferris.size >= RIDES.ferris.gondolas) { toast('Every gondola is taken right now, try again in a moment'); return; }
  net.awaitRide = true;
  net.send({ t: 'ride', ride: kind, seat });
}
function updateRides(dt, time) {
  turnRides(time);
  if (!rideBubbles) rideBubbles = Object.fromEntries(['ferris', 'carousel'].map((kind) => {
    const b = makeDoorBubble(RIDE_ICON, kind === 'ferris' ? 'Ride the Ferris wheel' : 'Ride the merry-go-round', () => boardRide(kind));
    return [kind, b];
  }));
  for (const kind of ['ferris', 'carousel']) {
    const e = rideEdgeNear(kind, player.position), cap = kind === 'ferris' ? RIDES.ferris.gondolas : RIDES.carousel.seats;
    const show = myRoom === null && !myRide && mySeat === null && rideState[kind].size < cap && rideReach(kind, player.position);
    placeBubble(rideBubbles[kind], _rideV.set(e.x, groundY(e.x, e.z) + 1.9, e.z), show);
  }
  // in case the server's "ride over" never arrives (a lost connection), the Ferris wheel lets you off anyway
  if (myRide && myRide.kind === 'ferris' && nowMs() > myRide.at + RIDES.ferris.periodMs + 4000) { rideState.ferris.delete(myRide.seat); stepOffRide(); }
  if (myRide && myRoom !== null) myRide = null;
}

// ---------------------------------------------------------------- Bo the traveling buyer
// A round little trader with a big backpack of crates, a straw hat and a bell. The server says where he is along the
// loop road ({ s, moving, at }); every client works out the same spot from the shared clock. Tap him when you're
// within 4 units to open the sell panel: he stops and waits while it's open. Prices come from the server.
const boRoute = buildBoRoute(LAYOUT); // the same route the server uses
const boState = { s: 0, moving: true, at: Date.now(), speed: 1.0 }; // offline he just keeps walking (as fast as on the server)
let sellPrices = {}; // from the server (SELL_PRICES in server.js)
const BO_RANGE = 4;
function makeBo() {
  const g = new THREE.Group(), soft = (c) => mat(c, { flatShading: false });
  const body = new THREE.Group(); g.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.44, 18, 14), soft('#7fb6d9'), 0, 0.74, 0); torso.scale.set(1, 0.95, 0.92); body.add(torso);
  const belly = mesh(new THREE.SphereGeometry(0.3, 14, 10), soft('#fff3dc'), 0, 0.68, 0.2); belly.scale.set(1, 1, 0.55); body.add(belly);
  const head = new THREE.Group(); head.position.y = 1.32; body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.31, 18, 14), soft('#f2c9a0')));
  for (const x of [-0.1, 0.1]) {
    head.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), soft('#2b211c'), x, 0.02, 0.28));
    const blush = mesh(new THREE.SphereGeometry(0.045, 8, 6), soft('#ffa99a'), x * 1.7, -0.07, 0.25); blush.scale.z = 0.3; head.add(blush);
  }
  head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), soft('#e8a888'), 0, -0.04, 0.31)); // round nose
  const smile = mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), soft('#7a3f2c'), 0, -0.12, 0.28); smile.rotation.z = Math.PI; head.add(smile);
  // straw hat with a red band
  const straw = soft('#e8c76a');
  head.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.04, 18), straw, 0, 0.2, 0));
  head.add(mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.22, 16), straw, 0, 0.32, 0));
  head.add(mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.06, 16), soft('#d9644f'), 0, 0.25, 0));
  // stubby arms holding the backpack straps, short legs
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.42, 0.9, 0.02); body.add(a);
    const arm = mesh(new THREE.CapsuleGeometry(0.08, 0.2, 3, 8), soft('#7fb6d9'), 0, -0.14, 0); arm.rotation.z = sx * 0.35; a.add(arm);
    a.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), soft('#f2c9a0'), sx * 0.08, -0.3, 0.04));
    const strap = mesh(new THREE.BoxGeometry(0.07, 0.62, 0.05), soft('#8a5a36'), sx * 0.2, 0.86, 0.36); strap.rotation.x = -0.15; body.add(strap);
    arms.push(a);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(sx * 0.16, 0.36, 0); g.add(leg);
    leg.add(mesh(new THREE.CapsuleGeometry(0.09, 0.14, 3, 8), soft('#6b5a4a'), 0, -0.16, 0));
    leg.add(mesh(new THREE.BoxGeometry(0.17, 0.09, 0.24), soft('#7a4e34'), 0, -0.3, 0.04));
    legs.push(leg);
  }
  // the big backpack: a wooden frame with crates of goods, a rolled blanket and a little lantern
  const pack = new THREE.Group(); pack.position.set(0, 0.95, -0.52); body.add(pack);
  const crate = (w, h, d, x, y, z, col) => {
    const c = new THREE.Group(); c.position.set(x, y, z); pack.add(c);
    c.add(mesh(new THREE.BoxGeometry(w, h, d), mat(col)));
    for (const yy of [-h / 3, h / 3]) c.add(mesh(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), M.woodDark, 0, yy, 0));
    return c;
  };
  for (const x of [-0.3, 0.3]) pack.add(mesh(new THREE.BoxGeometry(0.05, 1.25, 0.05), M.woodDark, x, 0.15, 0.1));
  crate(0.62, 0.36, 0.42, 0, -0.25, -0.05, '#c9935a');
  crate(0.52, 0.32, 0.38, 0.03, 0.1, -0.05, '#d9a86a');
  crate(0.42, 0.28, 0.34, -0.04, 0.42, -0.05, '#c98c52');
  for (const [x, c] of [[-0.12, '#ff8a6a'], [0.02, '#ffd36a'], [0.14, '#8fd17a']]) pack.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(c), x, 0.6, -0.02)); // fruit peeking out
  const roll = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 10), mat('#d96f8a'), 0, 0.72, -0.05); roll.rotation.z = Math.PI / 2; pack.add(roll);
  const lantern = mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), M.lantern, 0.38, -0.1, 0.05); lantern.castShadow = false; pack.add(lantern);
  pack.add(mesh(new THREE.ConeGeometry(0.11, 0.08, 4), M.woodDark, 0.38, 0.03, 0.05));
  // the bell on a ribbon at his chest: it swings with a little ding now and then
  const bell = new THREE.Group(); bell.position.set(0, 1.08, 0.38); body.add(bell);
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.5, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.25 });
  const cup = mesh(new THREE.CylinderGeometry(0.03, 0.085, 0.12, 12, 1, true), gold, 0, -0.1, 0); cup.material.side = THREE.DoubleSide; bell.add(cup);
  bell.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), gold, 0, -0.03, 0));
  bell.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), M.woodDark, 0, -0.17, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 20), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false }));
  ring.position.set(0, 1.0, 0.42); body.add(ring);
  g.add(nameTag('Bo', '#f2c94c'));
  g.traverse((m) => { if (m.isMesh && m !== ring) m.userData.bo = true; });
  return { g, body, head, legs, arms, bell, ring, pack };
}
const bo = makeBo();
scene.add(bo.g);
const boPos = new THREE.Vector3();
function boS() { return boState.moving ? boState.s + (boState.speed * (nowMs() - boState.at)) / 1000 : boState.s; }
function setBoState(m) {
  if (!m || !Number.isFinite(m.s)) return;
  boState.s = m.s; boState.moving = !!m.moving; boState.at = Number.isFinite(m.at) ? m.at : nowMs();
  if (Number.isFinite(m.speed)) boState.speed = m.speed;
}
let boYaw = 0, boDing = 0, boDingT = 0, boStep = 0;
const boBubble = (() => { const b = makeDoorBubble(TALK_ICON, 'Sell to Bo', () => { if (mySeat !== null) standUp(); openBo(); }); b.btn.classList.add('talk-bubble'); return b; })();
function updateBo(dt) {
  const at = routeAt(boRoute, boS());
  boPos.set(at.x, groundY(at.x, at.z), at.z);
  bo.g.position.copy(boPos);
  // walking: face the way he goes; standing: face the nearest player close by
  let want = boState.moving ? Math.atan2(at.dx, at.dz) : boYaw;
  if (!boState.moving) {
    let best = 6;
    const people = [...(myRoom === null ? [player] : []), ...[...remotes.values()].filter((r) => !r.room).map((r) => r.player)];
    const me = sellUI.root.classList.contains('open') ? player : null;
    for (const c of me ? [me] : people) { const d = Math.hypot(c.position.x - boPos.x, c.position.z - boPos.z); if (d < best) { best = d; want = Math.atan2(c.position.x - boPos.x, c.position.z - boPos.z); } }
  }
  boYaw = lerpAngle(boYaw, want, Math.min(1, dt * 4));
  bo.g.rotation.y = boYaw;
  // a slow waddle
  if (boState.moving) boStep += dt * boState.speed * 5.5;
  const sw = boState.moving ? Math.sin(boStep) : 0;
  bo.legs[0].rotation.x = sw * 0.5; bo.legs[1].rotation.x = -sw * 0.5;
  bo.body.position.y = boState.moving ? Math.abs(Math.cos(boStep)) * 0.04 : Math.sin(nowMs() / 600) * 0.01;
  bo.body.rotation.z = sw * 0.04;
  bo.pack.rotation.x = -Math.abs(sw) * 0.04;
  // the bell: a ding every ~7 s (and a swing that follows his steps)
  boDingT -= dt;
  if (boDingT <= 0) { boDingT = 6 + Math.random() * 3; boDing = 1; }
  if (boDing > 0) boDing = Math.max(0, boDing - dt / 0.9);
  const k = 1 - boDing;
  bo.bell.rotation.z = Math.sin(k * 22) * 0.6 * boDing + sw * 0.15;
  bo.ring.material.opacity = boDing > 0 ? 0.9 * boDing * boDing : 0;
  bo.ring.scale.setScalar(1 + k * 3);
  const d = Math.hypot(player.position.x - boPos.x, player.position.z - boPos.z);
  placeBubble(boBubble, _talkV.set(boPos.x, boPos.y + 2.45, boPos.z), myRoom === null && mySeat === null && !sellUI.root.classList.contains('open') && d <= BO_RANGE);
  // the panel closes if you wander off or he moves on (the server lets go after 30 s without activity)
  if (sellUI.root.classList.contains('open')) {
    if (myRoom !== null || d > 6.5) closeSell(true);
    else if (boState.moving && sellUI.held) { closeSell(false); toast('Bo rings his bell and heads off down the road'); }
  }
}
function boUnder() {
  const hit = raycaster.intersectObject(bo.g, true)[0];
  return !!(hit && hit.object.userData.bo);
}
function boTap() {
  if (myRoom !== null || !boUnder()) return false;
  openBo();
  return true;
}
function openBo() {
  const d = Math.hypot(player.position.x - boPos.x, player.position.z - boPos.z);
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.waterSpot = null; walk.talk = null;
  if (d > BO_RANGE) { // too far: walk over to where he is now
    const dir = new THREE.Vector3(player.position.x - boPos.x, 0, player.position.z - boPos.z).normalize();
    walk.target = new THREE.Vector3(boPos.x + dir.x * 1.4, 0, boPos.z + dir.z * 1.4);
    showMarker(boPos.x, boPos.z);
    return;
  }
  walk.target = null;
  walk.heading = Math.atan2(boPos.x - player.position.x, boPos.z - player.position.z);
  if (dlg.npc) endTalk();
  if (!net.online) { toast('Bo trades when you play online'); return; }
  net.send({ t: 'boOpen' });
}

// ---- coins: the server's number, shown under the energy bar with a little "+N" when it goes up
let coins = 0;
const coinText = document.getElementById('coinText'), coinPill = document.getElementById('coins');
function setCoins(n, animate) {
  if (!Number.isInteger(n) || n < 0) return;
  const gain = n - coins;
  coins = n; coinText.textContent = String(n);
  if (animate && gain > 0) {
    const pop = document.createElement('span'); pop.className = 'coin-pop'; pop.textContent = `+${gain}`;
    coinPill.appendChild(pop); setTimeout(() => { if (pop.remove) pop.remove(); }, 1300);
    coinPill.classList.remove('bump'); void coinPill.offsetWidth; coinPill.classList.add('bump');
  }
}

// ---- the sell panel
const sellUI = { root: document.getElementById('sellPanel'), line: document.getElementById('sellLine'), list: document.getElementById('sellList'), total: document.getElementById('sellTotal'),
  btn: document.getElementById('sellBtn'), close: document.getElementById('sellClose'), held: false, qty: {}, waiting: false, pingAt: 0 };
const BO_HELLOS = ['Ding ding! Got anything nice for old Bo?', 'Oh ho, a customer! Let\'s see that backpack.', 'Fair prices, happy faces! What have you got?', 'Bo buys the good stuff. Show me, show me!'];
const SELL_NAMES = { coconut: 'Coconut', mango: 'Mango', pineapple: 'Pineapple', shell: 'Seashell', star: 'Starfish', smallfish: 'Small fish', bigfish: 'Big fish', flower: 'Flower',
  butterfly: 'Butterfly', beetle: 'Beetle', dragonfly: 'Dragonfly', carrot: 'Carrot', tomato: 'Tomato', cabbage: 'Cabbage',
  scarab: 'Scarab beetle', lizard: 'Sand lizard', crab: 'Crab', conch: 'Conch shell', clownfish: 'Clownfish', puffer: 'Pufferfish', koi: 'Koi', carp: 'Carp' };
const sellable = (k) => Number.isInteger(sellPrices[k]) && sellPrices[k] > 0;
function boAnswered(m) {
  if (!m.ok) { toast(m.msg || 'Get a little closer to Bo'); return; }
  sellUI.held = true; sellUI.qty = {}; sellUI.waiting = false;
  const owned = Object.keys(pocket).filter((k) => pocket[k] > 0);
  sellUI.line.textContent = owned.some(sellable) ? pickFrom(BO_HELLOS) : "Come back when you've got something good!";
  renderSell();
  sellUI.root.classList.add('open');
}
function renderSell() {
  const owned = Object.keys(pocket).filter((k) => pocket[k] > 0);
  for (const k of Object.keys(sellUI.qty)) sellUI.qty[k] = Math.min(sellUI.qty[k], pocket[k] || 0);
  const rows = owned.map((k) => {
    const name = SELL_NAMES[k] || BAG_LABELS[k] || k;
    if (!sellable(k)) return `<div class="sell-row off" title="Bo doesn't buy these"><span class="slot sell-icon">${ICONS[k] || ''}</span><span class="sell-name">${name}<small>×${pocket[k]} · Bo doesn't buy these</small></span></div>`;
    const q = sellUI.qty[k] || 0;
    return `<div class="sell-row"><span class="slot sell-icon">${ICONS[k] || ''}</span><span class="sell-name">${name}<small>×${pocket[k]} · 🪙 ${sellPrices[k]} each</small></span>`
      + `<span class="stepper"><button type="button" data-act="minus" data-kind="${k}" aria-label="One less ${name}"${q ? '' : ' disabled'}>−</button><b>${q}</b>`
      + `<button type="button" data-act="plus" data-kind="${k}" aria-label="One more ${name}"${q < pocket[k] ? '' : ' disabled'}>+</button>`
      + `<button type="button" class="max" data-act="max" data-kind="${k}"${q < pocket[k] ? '' : ' disabled'}>Max</button></span></div>`;
  });
  sellUI.list.innerHTML = rows.length ? rows.join('') : '<div class="sell-empty">Your backpack is empty.</div>';
  const total = Object.entries(sellUI.qty).reduce((t, [k, n]) => t + (sellable(k) ? sellPrices[k] * n : 0), 0);
  sellUI.total.textContent = `Total 🪙 ${total}`;
  sellUI.btn.disabled = !total || sellUI.waiting;
  sellUI.btn.textContent = sellUI.waiting ? 'Selling…' : 'Sell';
}
function closeSell(tellServer) {
  if (!sellUI.root.classList.contains('open')) return;
  sellUI.root.classList.remove('open'); sellUI.held = false; sellUI.qty = {}; sellUI.waiting = false;
  if (tellServer && net.online) net.send({ t: 'boClose' });
}
sellUI.root.addEventListener('click', (e) => {
  const b = e.target && e.target.closest && e.target.closest('button[data-act]');
  if (!b || b.disabled || sellUI.waiting) return;
  const k = b.dataset.kind, have = pocket[k] || 0, q = sellUI.qty[k] || 0;
  if (b.dataset.act === 'minus') sellUI.qty[k] = Math.max(0, q - 1);
  else if (b.dataset.act === 'plus') sellUI.qty[k] = Math.min(have, q + 1);
  else if (b.dataset.act === 'max') sellUI.qty[k] = have;
  renderSell();
  const now = performance.now();
  if (net.online && now - sellUI.pingAt > 2000) { sellUI.pingAt = now; net.send({ t: 'boPing' }); } // still here: Bo keeps waiting
});
sellUI.btn.addEventListener('click', () => {
  const items = Object.fromEntries(Object.entries(sellUI.qty).filter(([k, n]) => n > 0 && sellable(k)));
  if (!Object.keys(items).length || sellUI.waiting || !net.online) return;
  sellUI.waiting = true; renderSell();
  net.send({ t: 'sell', items });
});
sellUI.close.addEventListener('click', () => closeSell(true));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sellUI.root.classList.contains('open')) closeSell(true); });
function sellAnswered(m) {
  sellUI.waiting = false;
  if (m.ok) {
    sellUI.qty = {};
    sellUI.line.textContent = pickFrom(['Pleasure doing business! Ding!', 'Ooh, lovely stuff. Here you go!', 'A fine trade! Bo is very pleased.']);
    toast(`Sold ${m.count} item${m.count === 1 ? '' : 's'} for ${m.gained} coins`);
  } else sellUI.line.textContent = m.msg || "Hmm, that didn't work.";
  renderSell();
}
function updateDialogue(dt) {
  if (walk.talk && !walk.target) walk.talk = null; // the walk over was given up
  for (const b of talkBubbles) {
    const p = b.n.g.position;
    const show = myRoom === null && mySeat === null && dlg.npc !== b.n && walk.talk !== b.n && (b.n.driver ? b.n.docked && !myBananaSeat() && !isSwimming() && driverReach(b.n) <= TALK_RANGE : Math.hypot(player.position.x - p.x, player.position.z - p.z) <= TALK_RANGE);
    placeBubble(b, _talkV.set(p.x, p.y + 2.25 * (SHOPKEEPERS[b.n.kind].scale || 1), p.z), show);
  }
  if (!dlg.npc) return;
  const p = dlg.npc.g.position, d = dlg.npc.driver ? driverReach(dlg.npc) : Math.hypot(player.position.x - p.x, player.position.z - p.z);
  if (myRoom !== null || mySeat !== null || d > TALK_RANGE + 1) { endTalk(); return; } // walked away
  if (!walk.target) walk.heading = lerpAngle(walk.heading, Math.atan2(p.x - player.position.x, p.z - player.position.z), Math.min(1, dt * 8));
  if (!lineDone()) {
    dlg.shown = Math.min(dlg.line.length, dlg.shown + dt * TYPE_CPS);
    dlgUI.text.textContent = dlg.line.slice(0, Math.floor(dlg.shown));
    if (lineDone()) dlgUI.more.classList.add('show');
  } else if (!dlg.then && !dlg.queue.length && !dlg.choosing) { // the goodbye line: closes by itself after a moment
    dlg.doneT += dt;
    if (dlg.doneT > 2.2) endTalk();
  }
}
function startGardenPour(job) {
  if (walk.pour || currentTool !== 'can') return;
  walk.heading = Math.atan2(job.pos.x - player.position.x, job.pos.z - player.position.z);
  walk.pour = { target: job.pos, t: 0, drip: 0, done: () => net.send({ t: 'waterGarden', where: job.where, plot: job.plot, idx: job.idx }), job };
}
// a burst of little golden stars rising and twinkling over a freshly watered square (~2 s), for everyone nearby
const starGeo = (() => {
  const g = new THREE.ExtrudeGeometry(starShape(0.09, 0.04), { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  g.center();
  return g;
})();
function starBurst(at) {
  for (let k = 0; k < 9; k++) {
    // glowing gold: the emissive part keeps them bright at night, the lit part gives them shape by day
    const m = new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0xffb300, emissiveIntensity: 0.9, roughness: 0.4, transparent: true, flatShading: true });
    const star = new THREE.Mesh(starGeo, m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(0.45); star.add(glow);
    star.visible = false;
    scene.add(star);
    const a = (k / 9) * TAU + Math.random() * 0.4, out = 0.15 + Math.random() * 0.25, rise = 0.7 + Math.random() * 0.6, spin = (Math.random() - 0.5) * 6, delay = k * 0.05;
    let t = -delay;
    transients.push((dt) => {
      t += dt;
      if (t < 0) return true;
      star.visible = true;
      const u = Math.min(t / 2, 1);
      star.position.set(at.x + Math.cos(a) * out * (0.4 + u), at.y + 0.15 + rise * (1 - (1 - u) * (1 - u)), at.z + Math.sin(a) * out * (0.4 + u));
      star.rotation.set(0.3, spin * t, Math.sin(t * 5 + k) * 0.3);
      const twinkle = 0.75 + 0.25 * Math.sin(t * 14 + k * 1.7), fade = 1 - smooth(0.65, 1, u);
      star.scale.setScalar(Math.max(0.001, smooth(0, 0.12, u) * twinkle));
      m.opacity = fade; glow.material.opacity = 0.7 * fade * twinkle;
      if (u >= 1) { scene.remove(star); m.dispose(); glow.material.dispose(); return false; }
      return true;
    });
  }
}
// "[name] watered!" floating over someone else's square for a few seconds, in the name-label style
function wateredLabel(text, at) {
  const tag = nameTag(text, '#ffd84d');
  tag.position.set(at.x, at.y + 0.85, at.z); tag.scale.multiplyScalar(0.85);
  scene.add(tag);
  let t = 0;
  transients.push((dt) => {
    t += dt;
    tag.position.y = at.y + 0.85 + t * 0.08;
    tag.material.opacity = 1 - smooth(2.6, 3.5, t);
    if (t >= 3.5) { scene.remove(tag); tag.material.map.dispose(); tag.material.dispose(); return false; }
    return true;
  });
}
// the server tells everyone about each successful watering: stars for players nearby, a label when it was a
// visitor helping out, and a note to the owner if they're online
function onWatered(m) {
  const pos = new THREE.Vector3();
  if (m.where === 'island') { const sp = islandSpots[m.idx]; if (!sp) return; sp.crop.getWorldPosition(pos); }
  else { const sl = plotSlots[m.plot - 1]; if (!sl || !sl.garden.cells[m.idx]) return; gardenCellWorld(sl, m.idx, pos); }
  const near = myRoom === null && Math.hypot(pos.x - player.position.x, pos.z - player.position.z) < 30;
  if (near) starBurst(pos);
  if (m.where === 'plot' && m.byName !== m.owner) {
    if (near) wateredLabel(`${m.byName} watered!`, pos);
    if (m.owner === net.myName && m.by !== net.id) toast(`${m.byName} watered your garden!`);
  }
}
function waterAnswered(m) {
  if (!m.ok) { toast(m.msg || "Couldn't water that"); return; } // no stars for a failed watering
  toast('Watered! The soil is nice and wet');
}

// ---------------------------------------------------------------- fishing rod: cast, wait, strike
const CAST_COST = 5, CAST_RANGE = 7, BITE_WINDOW = 1.1;
let fishing = null; // { phase: 'casting'|'waiting'|'bite', t, from, to, biteAt, bobber, line }
const bobberMat = new THREE.MeshStandardMaterial({ color: 0xe0544a, roughness: 0.6 });
function makeBobber() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, TAU, 0, Math.PI / 2), bobberMat));
  const low = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M.white); g.add(low);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), M.woodDark).translateY(0.1));
  return g;
}
function rodTip(out) {
  const rod = toolModels.rod;
  if (rod && rod.parent) return rod.localToWorld(out.set(0, 1.4, 0));
  return out.copy(player.position).add(new THREE.Vector3(0, 1.2, 0));
}
// nearest standing spot on land along the way to a water point, or null if there is no shore that way
function shoreSpotToward(p) {
  const dir = new THREE.Vector3(p.x - player.position.x, 0, p.z - player.position.z);
  const len = dir.length(); dir.normalize();
  let last = walkable(player.position.x, player.position.z) ? { x: player.position.x, z: player.position.z } : null;
  for (let s = 0; s < len; s += 0.2) {
    const x = player.position.x + dir.x * s, z = player.position.z + dir.z * s;
    if (walkable(x, z)) last = { x, z }; else break;
  }
  return last;
}
function startCast(target) {
  if (fishing || currentTool !== 'rod') return;
  if (energy < CAST_COST) { toast('Too tired, eat something'); return; }
  energy -= CAST_COST; renderEnergy();
  if (net.online) net.send({ t: 'cast' });
  walk.heading = Math.atan2(target.x - player.position.x, target.z - player.position.z);
  const bobber = makeBobber(); scene.add(bobber);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  line.frustumCulled = false; scene.add(line);
  fishing = { phase: 'casting', t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(target.x, 0, target.z), biteAt: 0, bobber, line };
  rodTip(fishing.from);
}
function endFishing(msg) {
  if (!fishing) return;
  scene.remove(fishing.bobber, fishing.line);
  fishing.line.geometry.dispose(); fishing.line.material.dispose();
  if (fishing.fish) { scene.remove(fishing.fish); fishing.fish.geometry.dispose(); fishing.fish.material.dispose(); }
  fishing.bobber.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  fishing = null;
  if (msg) toast(msg);
}
function strike() { // the player clicked while the line is out
  if (!fishing || fishing.phase === 'casting') return;
  if (fishing.phase === 'bite') {
    const from = fishing.bobber.position.clone();
    endFishing();
    if (net.online) { catchFrom = from; net.send({ t: 'fish' }); return; } // the server checks the timing and rolls the catch
    const table = atPond(player.position.x, player.position.z) ? POND_CATCH_TABLE : atBeach(player.position.x, player.position.z) ? BEACH_CATCH_TABLE : CATCH_TABLE;
    let r = Math.random(), kind = table[table.length - 1][0];
    for (const [k, chance] of table) { if (r < chance) { kind = k; break; } r -= chance; }
    pocket[kind]++; renderPocket();
    caught(kind, from);
  } else endFishing('Too early! The fish got away');
}
let catchFrom = null; // where the bobber was, while the server decides what bit
const CATCH_NAMES = { smallfish: 'a small fish', bigfish: 'a big fish', shell: 'a seashell', star: 'a starfish', clownfish: 'a clownfish', puffer: 'a pufferfish', crab: 'a crab', koi: 'a koi', carp: 'a carp' };
// fishing off the beach turns up beach catches too (the same tables as CATCH_TABLE and BEACH_CATCH_TABLE in server.js)
const BEACH_AREA = LAYOUT.areas.beach;
const atBeach = (x, z) => x < -43 && ((x - BEACH_AREA.x) / BEACH_AREA.rx) ** 2 + ((z - BEACH_AREA.z) / BEACH_AREA.rz) ** 2 < 2.56;
const CATCH_TABLE = [['smallfish', 0.6], ['bigfish', 0.25], ['shell', 0.075], ['star', 0.075]];
const BEACH_CATCH_TABLE = [['smallfish', 0.33], ['clownfish', 0.22], ['puffer', 0.15], ['bigfish', 0.13], ['crab', 0.1], ['star', 0.07]];
const POND_CATCH_TABLE = [['carp', 0.35], ['koi', 0.25], ['smallfish', 0.25], ['crab', 0.15]]; // the home pond (POND_CATCH_TABLE in server.js)
function caught(kind, from) {
  toast(kind === 'bigfish' ? 'You caught a big fish! What a whopper!' : `You caught ${CATCH_NAMES[kind] || KINDS[kind].name}!`);
  landFish(from, kind);
}
function fishAnswered(m) {
  const from = catchFrom || player.position.clone(); catchFrom = null;
  if (m.kind && KINDS[m.kind]) caught(m.kind, from); else toast('It slipped off the hook!');
}
function landFish(from, kind = 'smallfish') { // the catch leaps out of the water into the backpack (a big one leaps higher)
  const big = kind === 'bigfish';
  const f = KINDS[kind].make(); f.position.copy(from); scene.add(f);
  let t = 0;
  transients.push((dt) => {
    t += dt; const u = Math.min(t / (big ? 1.1 : 0.9), 1);
    f.position.lerpVectors(from, player.position, u); f.position.y += Math.sin(u * Math.PI) * (big ? 2.8 : 2) + u * 1.2;
    f.rotation.x = -Math.cos(u * Math.PI) * 1.2; f.rotation.y += dt * 4;
    f.scale.setScalar(Math.max(0.001, (big ? 1.7 + Math.sin(u * Math.PI) * 0.4 : 1.3) * (1 - u * u * u)));
    if (u >= 1) { scene.remove(f); f.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); return false; }
    return true;
  });
}
const _tip = new THREE.Vector3();
function updateFishing(dt, time) {
  if (!fishing) return;
  if (currentTool !== 'rod' || walk.target) { endFishing('You reeled the line in'); return; }
  const f = fishing, b = f.bobber;
  f.t += dt;
  const waterY = waveY(f.to.x, f.to.z, time) + 0.03;
  if (f.phase === 'casting') {
    const u = Math.min(f.t / 0.7, 1);
    rig.armR.rotation.x = u < 0.35 ? lerp(0, -2.6, u / 0.35) : lerp(-2.6, -1.0, smooth(0.35, 0.7, u));
    b.position.lerpVectors(f.from, f.to, u);
    b.position.y = lerp(f.from.y, waterY, u) + Math.sin(u * Math.PI) * 2.2;
    if (u >= 1) { f.phase = 'waiting'; f.t = 0; f.biteAt = 3 + Math.random() * 5; splash(f.to, 0.5); }
  } else {
    rig.armR.rotation.x = -1.0 + Math.sin(time * 1.3) * 0.03;
    b.position.set(f.to.x, waterY + Math.sin(time * 2.2) * 0.02, f.to.z);
    if (f.phase === 'waiting' && !f.fish && f.t >= f.biteAt - 1.8) { // a fish comes for a look
      const beach = atBeach(f.to.x, f.to.z), pondFish = atPond(f.to.x, f.to.z), a = Math.random() * TAU;
      f.fish = new THREE.Mesh(BITE_FISH_GEO, new THREE.MeshBasicMaterial({ color: beach ? pick([0xff8a3a, 0xf6d55c, 0x6fd3f0, 0xff8fb8]) : pondFish ? pick([0xff8a3a, 0xfffaf0, 0xf6c84c, 0xc9a04a]) : 0x1d3a52, transparent: true, opacity: beach || pondFish ? 0.9 : 0.45, depthWrite: false }));
      f.fishFrom = new THREE.Vector3(f.to.x + Math.cos(a) * 1.8, 0, f.to.z + Math.sin(a) * 1.8);
      scene.add(f.fish);
    }
    if (f.fish) { // swims in (with a wiggle) and nibbles at the bobber
      const u = f.phase === 'bite' ? 1 : smooth(f.biteAt - 1.8, f.biteAt, f.t);
      const fp = f.fish.position.lerpVectors(f.fishFrom, f.to, u * 0.92);
      fp.y = waterY - 0.14 + (f.phase === 'bite' ? Math.sin(f.t * 16) * 0.03 : 0);
      f.fish.rotation.set(0, Math.atan2(f.to.x - f.fishFrom.x, f.to.z - f.fishFrom.z) + Math.sin(time * (f.phase === 'bite' ? 30 : 12)) * 0.25, 0);
    }
    if (f.phase === 'waiting' && f.t >= f.biteAt) { f.phase = 'bite'; f.t = 0; toast('Something is biting! Click now!'); splash(f.to, 0.7); }
    else if (f.phase === 'bite') {
      b.position.y -= Math.abs(Math.sin(f.t * 16)) * 0.14; // sharp tugs under the surface
      b.rotation.z = Math.sin(f.t * 23) * 0.3;
      rig.armR.rotation.x = -1.0 + Math.sin(f.t * 20) * 0.08;
      if (f.t > BITE_WINDOW) endFishing('Too slow, the fish got away');
    }
  }
  if (!fishing) return;
  const pos = f.line.geometry.attributes.position;
  rodTip(_tip);
  pos.setXYZ(0, _tip.x, _tip.y, _tip.z); pos.setXYZ(1, b.position.x, b.position.y + 0.09, b.position.z);
  pos.needsUpdate = true;
}
const BITE_FISH_GEO = (() => { const g = new THREE.OctahedronGeometry(0.1, 0); g.scale(0.55, 0.45, 1.7); return g; })();
// a small ring on the water where you wade
function ripple(x, z, size) { splash({ x, z }, size); }
// the stride: how fast the legs cycle for a speed, so the feet keep pace with the ground (a run takes longer strides)
const STRIDE = 11 / 3.2; // leg-cycle radians per unit walked (the old walk: 11 a second at 3.2 units a second)
const strideRate = (speed, run) => Math.max(4, speed * STRIDE / (1 + 0.32 * run));
// tiny dust puffs at the feet while running (a small ripple instead when a foot lands in shallow water): a pool of
// soft sprites, one per footfall (each time the stride passes a half turn)
const dustPool = (() => {
  const tex = radialTexture('rgba(246,232,206,0.95)', 'rgba(236,214,180,0)'), list = [];
  for (let i = 0; i < 28; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false; sp.scale.setScalar(0.2); scene.add(sp); list.push({ sp, t: 1, vx: 0, vz: 0 });
  }
  return list;
})();
let dustNext = 0;
function runDust(pos, ph0, ph1, run, onDeck) {
  if (run < 0.35 || myRoom !== null || Math.floor(ph0 / Math.PI) === Math.floor(ph1 / Math.PI)) return;
  if (camera && Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z) > 60) return; // too far away to see
  if (!onDeck && H(pos.x, pos.z) < 0.05) { ripple(pos.x, pos.z, 0.3); return; }
  for (let k = 0; k < 2; k++) {
    const d = dustPool[dustNext]; dustNext = (dustNext + 1) % dustPool.length;
    d.t = 0; d.vx = (Math.random() - 0.5) * 0.6; d.vz = (Math.random() - 0.5) * 0.6;
    d.sp.position.set(pos.x + d.vx * 0.3, pos.y + 0.08, pos.z + d.vz * 0.3); d.sp.visible = true;
  }
}
function updateDust(dt) {
  for (const d of dustPool) {
    if (!d.sp.visible) continue;
    d.t += dt * 1.8;
    if (d.t >= 1) { d.sp.visible = false; continue; }
    d.sp.position.x += d.vx * dt; d.sp.position.z += d.vz * dt; d.sp.position.y += dt * 0.25;
    d.sp.scale.setScalar(0.18 + d.t * 0.35); d.sp.material.opacity = 0.7 * (1 - d.t) * Math.min(1, d.t * 6) * (myRoom === null ? 1 : 0);
  }
}
function splash(at, size) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.24, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(at.x, 0.13, at.z); scene.add(ring);
  let t = 0;
  transients.push((dt) => {
    t += dt; ring.scale.setScalar(1 + t * 4 * size); ring.material.opacity = Math.max(0, 0.8 - t);
    if (t >= 0.8) { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); return false; }
    return true;
  });
}

// ---------------------------------------------------------------- bugs: little critters wandering the island
const NET_COST = 3, NET_TIME = 0.5, NET_REACH = 1.35;
const BUG_INFO = {
  butterfly: { speed: 1.1, lift: 0.7 },
  beetle: { speed: 0.35, lift: 0.04 },
  dragonfly: { speed: 3.2, lift: 1.3 },
  scarab: { speed: 0.45, lift: 0.04 },
  lizard: { speed: 1.8, lift: 0.03 },
  crab: { speed: 0.75, lift: 0.03 },
};
function makeBug(type) {
  const obj = new THREE.Group(), wings = [];
  const plain = (geo, color, x, y, z) => { const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); return m; };
  if (type === 'butterfly') {
    const color = pick(['#ffb347', '#8fc7ff', '#ff9ad5', '#fff07a']);
    const body = plain(new THREE.CapsuleGeometry(0.025, 0.16, 2, 5), '#4a3a30', 0, 0, 0); body.rotation.x = Math.PI / 2; obj.add(body);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const fore = plain(new THREE.SphereGeometry(0.13, 7, 5), color, side * 0.12, 0, 0.04); fore.scale.set(1, 0.12, 0.8);
      const hind = plain(new THREE.SphereGeometry(0.09, 7, 5), color, side * 0.09, 0, -0.08); hind.scale.set(1, 0.12, 0.8);
      const spot = plain(new THREE.SphereGeometry(0.035, 6, 4), '#ffffff', side * 0.15, 0.012, 0.05); spot.scale.y = 0.2;
      pivot.add(fore, hind, spot); obj.add(pivot); wings.push({ pivot, side });
    }
  } else if (type === 'beetle') {
    const shell = plain(new THREE.SphereGeometry(0.11, 10, 6, 0, TAU, 0, Math.PI / 2), '#e0443a', 0, 0, 0); shell.scale.set(1, 0.8, 1.15); obj.add(shell);
    obj.add(plain(new THREE.SphereGeometry(0.055, 8, 6), '#2b211c', 0, 0.02, 0.12));
    for (const [x, z] of [[0.05, 0.03], [-0.05, 0.03], [0.045, -0.06], [-0.045, -0.06]]) {
      const d = plain(new THREE.SphereGeometry(0.022, 5, 4), '#2b211c', x, 0.07, z); d.scale.y = 0.4; obj.add(d);
    }
  } else if (type === 'scarab') { // a shiny green-teal desert beetle with little golden horns
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a8f6f, metalness: 0.5, roughness: 0.3, flatShading: true }));
    shell.scale.set(1, 0.85, 1.25); obj.add(shell);
    obj.add(plain(new THREE.SphereGeometry(0.06, 8, 6), '#2f6f5a', 0, 0.02, 0.14));
    for (const x of [-0.03, 0.03]) { const horn = plain(new THREE.ConeGeometry(0.012, 0.07, 4), '#c9a03a', x, 0.05, 0.19); horn.rotation.x = 0.6; obj.add(horn); }
  } else if (type === 'lizard') { // a sandy little lizard that darts about and stops to sun itself
    const body = plain(new THREE.CapsuleGeometry(0.06, 0.2, 3, 6), '#e8b84a', 0, 0.04, 0); body.rotation.x = Math.PI / 2; obj.add(body);
    obj.add(plain(new THREE.SphereGeometry(0.06, 8, 6), '#e8b84a', 0, 0.05, 0.17));
    const tail = plain(new THREE.ConeGeometry(0.04, 0.3, 5), '#c99a3a', 0, 0.03, -0.27); tail.rotation.x = -Math.PI / 2; obj.add(tail);
    for (const [x, z] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) obj.add(plain(new THREE.SphereGeometry(0.022, 5, 4), '#a87a2a', x, 0.01, z));
    for (const x of [-0.03, 0.03]) obj.add(plain(new THREE.SphereGeometry(0.014, 5, 4), '#23313f', x, 0.08, 0.21));
  } else if (type === 'crab') { // a little orange crab with two claws, scuttling sideways
    const body = plain(new THREE.SphereGeometry(0.13, 10, 6), '#ef6a4a', 0, 0.05, 0); body.scale.set(1.3, 0.55, 0.9); obj.add(body);
    for (const side of [-1, 1]) {
      const claw = plain(new THREE.SphereGeometry(0.06, 7, 5), '#ef6a4a', side * 0.2, 0.06, 0.1); claw.scale.set(1, 0.7, 1.3); obj.add(claw);
      for (const z of [-0.06, 0.0, 0.06]) { const leg = plain(new THREE.CylinderGeometry(0.01, 0.01, 0.14, 4), '#b8402a', side * 0.17, 0.02, z); leg.rotation.z = side * 1.1; obj.add(leg); }
      obj.add(plain(new THREE.SphereGeometry(0.022, 6, 4), '#ffffff', side * 0.05, 0.13, 0.07));
    }
  } else {
    const body = plain(new THREE.CylinderGeometry(0.02, 0.012, 0.42, 5), '#3fb8b0', 0, 0, -0.08); body.rotation.x = Math.PI / 2; obj.add(body);
    obj.add(plain(new THREE.SphereGeometry(0.045, 7, 5), '#2f7f9a', 0, 0, 0.15));
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.3 });
    for (const side of [-1, 1]) for (const z of [0.07, -0.02]) {
      const pivot = new THREE.Group(); pivot.position.z = z;
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.005, 0.06), wingMat); w.position.x = side * 0.16;
      pivot.add(w); obj.add(pivot); wings.push({ pivot, side });
    }
  }
  return { obj, wings };
}
const bugs = [];
// A bug's whole life is a pure function of (id, gen, spawnAt, now): a seeded home spot and a seeded loop
// of wander legs around it. Every client computes the same path from the shared server clock, so only
// catches travel over the network (and offline the same code runs on the local clock).
function bugPath(b) {
  const r = mulberry32(b.id * 9973 + b.gen * 7919 + 17);
  let home = null;
  const area = b.type === 'scarab' || b.type === 'lizard' ? 'desert' : b.type === 'crab' ? 'beach' : null;
  for (let k = 0; k < 30 && area && !home; k++) { const s = island.randomInArea(area, r, b.type === 'crab' ? 'shore' : 'land'); if (s && !blocked(s.x, s.z, 0.3)) home = new THREE.Vector3(s.x, 0, s.z); }
  for (let k = 0; k < 200 && !home && !area; k++) {
    const x = (r() - 0.5) * ISLAND.ax * 1.8, z = (r() - 0.5) * ISLAND.az * 1.8;
    if (H(x, z) > 0.45 && landD(x, z) < 0.8 && !blocked(x, z, 0.2)) home = new THREE.Vector3(x, 0, z);
  }
  if (!home) home = new THREE.Vector3(TOWN.x + 8, 0, TOWN.z + 8);
  const speed = BUG_INFO[b.type].speed, legs = [];
  let at = home.clone(), total = 0;
  for (let i = 0; i < 12; i++) {
    let to = home.clone(); // the last leg flies back home so the loop closes
    if (i < 11) for (let k = 0; k < 10; k++) {
      const a = r() * TAU, d = 0.5 + r() * (b.type === 'beetle' ? 1.5 : 3.5);
      const x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
      if (H(x, z) > (b.type === 'crab' ? 0.03 : 0.3)) { to = new THREE.Vector3(x, 0, z); break; }
    }
    const move = at.distanceTo(to) / speed;
    const pause = b.type === 'butterfly' ? r() * 0.6 : 0.4 + r() * 1.2; // dragonflies hover, beetles rest
    legs.push({ from: at, to, move, pause, start: total });
    total += move + pause; at = to;
  }
  return { home, legs, total };
}
function setBugState(b, gen, spawnAt) {
  b.gen = gen; b.spawnAt = spawnAt;
  b.path = bugPath(b);
}
['butterfly', 'butterfly', 'butterfly', 'beetle', 'beetle', 'dragonfly', 'dragonfly', 'scarab', 'scarab', 'crab', 'crab', 'lizard', 'lizard'].forEach((type, id) => {
  const m = makeBug(type);
  const b = { id, type, ...m, active: false, moving: false, pos: new THREE.Vector3(), ph: id * 1.7 };
  m.obj.traverse((o) => { o.userData.bug = b; });
  scene.add(m.obj);
  setBugState(b, 0, 0);
  bugs.push(b);
});
function updateBugs(dt, time) {
  const now = nowMs();
  for (const b of bugs) {
    const age = (now - b.spawnAt) / 1000;
    b.active = age >= 0;
    b.obj.visible = b.active;
    if (!b.active) continue;
    b.obj.scale.setScalar(Math.max(0.001, smooth(0, 1, age))); // fades in after a respawn
    const { legs, total } = b.path;
    const tt = age % total;
    let leg = legs[legs.length - 1];
    for (const l of legs) if (tt < l.start + l.move + l.pause) { leg = l; break; }
    const u = leg.move > 0 ? clamp((tt - leg.start) / leg.move, 0, 1) : 1;
    b.moving = u < 1;
    b.pos.lerpVectors(leg.from, leg.to, u);
    if (b.moving) b.obj.rotation.y = lerpAngle(b.obj.rotation.y, Math.atan2(leg.to.x - leg.from.x, leg.to.z - leg.from.z) + (b.type === 'crab' ? Math.PI / 2 : 0), Math.min(1, dt * 8)); // crabs go sideways
    const info = BUG_INFO[b.type];
    let y = Math.max(H(b.pos.x, b.pos.z), 0) + info.lift;
    if (b.type === 'butterfly') y += Math.sin(time * 2.3 + b.ph) * 0.25;
    if (b.type === 'dragonfly') y += Math.sin(time * 1.1 + b.ph) * 0.15;
    b.obj.position.set(b.pos.x, y, b.pos.z);
    if (b.type === 'butterfly') for (const w of b.wings) w.pivot.rotation.z = w.side * (0.2 + Math.abs(Math.sin(time * 11 + b.ph)) * 1.1);
    if (b.type === 'dragonfly') for (const w of b.wings) w.pivot.rotation.z = w.side * Math.sin(time * 60 + b.ph) * 0.35;
    if (b.type === 'beetle' || b.type === 'scarab' || b.type === 'crab' || b.type === 'lizard') b.obj.rotation.z = b.moving ? Math.sin(time * 18 + b.ph) * 0.05 : 0;
  }
}
function lerpAngle(a, b, t) { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
// the bug under the cursor, or the closest one to the clicked ground point
function bugNear() {
  const live = bugs.filter((b) => b.active);
  const hit = raycaster.intersectObjects(live.map((b) => b.obj), true)[0];
  if (hit && hit.object.userData.bug) return hit.object.userData.bug;
  const g = raycaster.intersectObjects([terrain, dockClick, pier2.click], false)[0];
  if (!g) return null;
  let best = null, bestD = 1.8;
  for (const b of live) { const d = Math.hypot(b.pos.x - g.point.x, b.pos.z - g.point.z); if (d < bestD) { bestD = d; best = b; } }
  return best;
}
function startNetSwing(bug) {
  if (walk.netSwing || currentTool !== 'net') return;
  if (energy < NET_COST) { toast('Too tired, eat something'); return; }
  energy -= NET_COST; renderEnergy();
  if (net.online) net.send({ t: 'swing' });
  if (bug.active) walk.heading = Math.atan2(bug.pos.x - player.position.x, bug.pos.z - player.position.z);
  walk.netSwing = { bug, t: 0, hit: false };
}
// a sideways sweep: arm out in front, body twists from right to left
function updateNetSwing(dt) {
  const s = walk.netSwing;
  s.t += dt;
  const u = Math.min(s.t / NET_TIME, 1);
  rig.armR.rotation.x = -1.3 - Math.sin(u * Math.PI) * 0.6;
  rig.body.rotation.y = lerp(0.9, -0.9, smooth(0.1, 0.7, u)) * (1 - smooth(0.8, 1, u));
  if (!s.hit && u >= 0.5) {
    s.hit = true;
    const b = s.bug;
    const fx = player.position.x + Math.sin(walk.heading) * 0.9, fz = player.position.z + Math.cos(walk.heading) * 0.9;
    if (b.active && Math.hypot(b.pos.x - fx, b.pos.z - fz) <= NET_REACH) catchBug(b);
    else if (b.active) toast(`Missed! The ${b.type} got away`);
    else toast('Whoosh! Nothing in the net');
  }
  if (u >= 1) { rig.body.rotation.y = 0; walk.netSwing = null; }
}
// online the server confirms the catch (first net wins); offline we respawn it ourselves
function catchBug(b) {
  if (net.online) { net.send({ t: 'catch', bug: b.id, gen: b.gen }); return; }
  applyCatch(b, b.gen + 1, nowMs() + 25000 + Math.random() * 20000, null);
}
// the bug leaves for everyone and a new one wanders in at spawnAt; only the catcher (picker === null) keeps it
function applyCatch(b, gen, spawnAt, picker) {
  const from = b.obj.position.clone(), wasVisible = b.active;
  setBugState(b, gen, spawnAt);
  b.active = false; b.obj.visible = false;
  const who = picker === null ? player : picker && picker.player ? picker.player : null;
  if (picker === null) {
    pocket[b.type]++; renderPocket();
    toast(`You caught ${KINDS[b.type].name}! It went into your backpack`);
  }
  if (!who || !wasVisible) return;
  const f = KINDS[b.type].make(); f.position.copy(from); scene.add(f);
  let t = 0;
  transients.push((dt) => {
    t += dt; const u = Math.min(t / 0.6, 1);
    f.position.lerpVectors(from, who.position, u); f.position.y += Math.sin(u * Math.PI) * 0.6 + u * 1.2;
    f.scale.setScalar(Math.max(0.001, 1 - u * u));
    if (u >= 1) { scene.remove(f); f.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); return false; }
    return true;
  });
}

// ---------------------------------------------------------------- watering can: flowers grow and bloom brighter
const WATER_COST = 3, POUR_TIME = 1.3, MAX_WATER = 3;
function startPour(it) {
  if (walk.pour || currentTool !== 'can' || !it.active || it.state !== 'idle') return;
  if ((it.watered || 0) >= MAX_WATER) { toast('This flower is already in full bloom'); return; }
  if (energy < WATER_COST) { toast('Too tired, eat something'); return; }
  energy -= WATER_COST; renderEnergy();
  if (net.online) net.send({ t: 'water' });
  walk.heading = Math.atan2(it.x - player.position.x, it.z - player.position.z);
  walk.pour = { target: it.obj.position, t: 0, drip: 0, done: () => { if (it.active && it.obj) bloom(it); } };
}
const _spout = new THREE.Vector3();
function updatePour(dt) {
  const p = walk.pour;
  p.t += dt;
  const u = Math.min(p.t / POUR_TIME, 1);
  const tilt = smooth(0, 0.2, u) * (1 - smooth(0.85, 1, u));
  rig.armR.rotation.x = -1.2 * tilt;
  rig.armR.rotation.z = 0.15 + 0.5 * tilt; // tips the can forward
  p.drip -= dt;
  if (tilt > 0.8 && p.drip <= 0 && p.target) {
    p.drip = 0.05;
    const can = toolModels.can;
    if (can && can.parent) can.localToWorld(_spout.set(0, 0.03, 0.42)); else _spout.copy(player.position).setY(player.position.y + 1);
    waterDrop(_spout, p.target);
  }
  if (u >= 1) {
    walk.pour = null;
    rig.armR.rotation.z = 0.15;
    p.done();
  }
}
function waterDrop(from, to) {
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.85, roughness: 0.2 }));
  d.position.copy(from); scene.add(d);
  const start = from.clone(), end = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.3, (Math.random() - 0.5) * 0.25));
  let t = 0;
  transients.push((dt) => {
    t += dt; const u = Math.min(t / 0.35, 1);
    d.position.lerpVectors(start, end, u); d.position.y = lerp(start.y, end.y, u * u);
    if (u >= 1) { scene.remove(d); d.geometry.dispose(); d.material.dispose(); return false; }
    return true;
  });
}
// each watering makes the flower a bit larger and its petals more vivid and softly glowing
function bloom(it) {
  it.watered = Math.min(MAX_WATER, (it.watered || 0) + 1);
  it.size = 1 + 0.15 * it.watered;
  const head = it.obj.children[1];
  if (head) head.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; o.userData.baseColor = o.material.color.clone(); }
    o.material.color.copy(o.userData.baseColor).offsetHSL(0, 0.12 * it.watered, 0.03 * it.watered);
    o.material.emissive.copy(o.userData.baseColor);
    o.material.emissiveIntensity = 0.12 * it.watered;
  });
  toast(it.watered >= MAX_WATER ? 'The flower is in full bloom!' : 'The flower drinks it up and blooms a little brighter');
}

function collect(it) {
  if (!it.active || it.state !== 'idle') return;
  walk.pickT = 0.6;
  walk.heading = Math.atan2(it.x - player.position.x, it.z - player.position.z);
  // online the server decides who got it; offline it's ours right away
  if (net.online) net.send({ t: 'pick', item: it.id, gen: it.gen, kind: it.kind });
  else pickedBy(it, null);
}
function pickedBy(it, remote) {
  if (!it.active || it.state === 'collecting') return;
  it.state = 'collecting'; it.anim = 0; it.picker = remote;
  if (remote) { if (remote.rig) remote.pickT = 0.6; return; }
  if (!net.online) it.gen++; // offline we own respawns: the next one lands somewhere new
  pocket[it.kind]++;
  renderPocket();
  toast(`You put ${KINDS[it.kind].name} in your backpack!`);
}

function updateItems(dt, time) {
  for (const it of items) {
    if (it.state === 'waiting') {
      if (net.mode !== 'offline') continue; // the server handles respawns
      if (Date.now() >= it.respawnAt) spawn(it);
      continue;
    }
    const o = it.obj; if (!o) continue;
    if (it.state === 'growing') {
      it.anim += dt / 1.2;
      const u = Math.min(it.anim, 1);
      o.scale.setScalar(Math.max(0.001, 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2)));
      if (u >= 1) { it.state = 'idle'; o.scale.setScalar(1); }
    } else if (it.state === 'idle') {
      const base = it.size || 1;
      const s = it === hovered ? base * (1.2 + Math.sin(time * 6) * 0.05) : base;
      o.scale.setScalar(lerp(o.scale.x, s, Math.min(1, dt * 10)));
      if (it.kind === 'flower') o.rotation.z = Math.sin(time * 1.5 + it.x) * 0.06;
    } else if (it.state === 'collecting') {
      it.anim += dt / 0.6;
      const u = Math.min(it.anim, 1);
      const who = it.picker && it.picker.player && it.picker.player.parent ? it.picker.player : player;
      const tx = who.position.x, ty = who.position.y + 1.9, tz = who.position.z;
      o.position.x = lerp(it.x, tx, u); o.position.z = lerp(it.z, tz, u);
      o.position.y = lerp(H(it.x, it.z), ty, u) + Math.sin(u * Math.PI) * 0.8;
      o.rotation.y += dt * 10;
      o.scale.setScalar(Math.max(0.001, 1.2 * (1 - u * u)));
      if (u >= 1) despawn(it);
    }
  }
}

let hovered = null;
function updateHover() {
  if (myRoom !== null) { if (hoverPending) { setNdc(hoverPending); hoverPending = null; roomHover(); } return; }
  if (!hoverPending) return;
  setNdc(hoverPending); hoverPending = null;
  hovered = itemUnder();
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';
}

const _v = new THREE.Vector3();
function updateWorld(dt, time) {
  // water waves
  const p = waterGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, waveY(waterBase[i * 2], waterBase[i * 2 + 1], time));
  p.needsUpdate = true;
  // foam lapping
  foamA.uniforms.uTime.value = foamB.uniforms.uTime.value = foamEvent.uniforms.uTime.value = time;
  riverMat.uniforms.uTime.value = time;
  causticsMat.uniforms.uTime.value = time;
  foamA.uniforms.uOffset.value = Math.sin(time * 0.9) * 0.25;
  foamA.uniforms.uAlpha.value = 0.85;
  const lap = (time * 0.18) % 1;
  foamB.uniforms.uOffset.value = lerp(2.2, -0.1, lap);
  foamB.uniforms.uWidth.value = 0.8;
  foamB.uniforms.uAlpha.value = Math.sin(lap * Math.PI) * 0.55;
  // boat bob
  boat.position.y = 0.05 + waveY(boat.position.x, boat.position.z, time) * 1.5;
  boat.rotation.z = Math.sin(time * 1.2) * 0.05;
  // fruit trees: shake after an axe hit, crown fruit visible only while the tree has fruit to give
  const nowT = nowMs();
  for (const t of fruitTrees) {
    if (t.shakeT > 0) { t.shakeT = Math.max(0, t.shakeT - dt); t.obj.rotation.z = Math.sin(time * 45) * 0.07 * (t.shakeT / 0.7); }
    const ready = nowT >= t.readyAt;
    for (const f of t.fruits) f.visible = ready;
  }
  // vegetation sway
  for (const s of swayers) { s.o.rotation.z = Math.sin(time * 0.9 + s.ph) * 0.03; s.o.rotation.x = Math.cos(time * 0.7 + s.ph) * 0.02; }
  // gulls
  for (const g of gulls) {
    const o = g.userData.orbit, a = o.ph + time * o.speed;
    const r = o.r + Math.sin(time * 0.3 + o.wob) * 3;
    g.position.set(Math.cos(a) * r, o.h + Math.sin(time * 0.5 + o.wob) * 1.2, Math.sin(a) * r);
    const da = o.speed > 0 ? 0.1 : -0.1;
    g.lookAt(Math.cos(a + da) * r, g.position.y, Math.sin(a + da) * r);
    g.rotateZ(o.speed > 0 ? -0.25 : 0.25);
    flapGull(g, time + o.wob * 3);
  }
  // clouds
  for (const c of clouds) { c.userData.th += c.userData.speed * dt; c.position.x = Math.cos(c.userData.th) * c.userData.r; c.position.z = Math.sin(c.userData.th) * c.userData.r; c.lookAt(0, c.position.y, 0); }
  // fountain droplets: little arcs from the top bowl down into the basin
  for (const d of fountain.userData.drops) {
    const u = (time * 0.9 + d.userData.ph) % 1, r = 0.35 + u * 1.3;
    d.position.set(Math.cos(d.userData.a) * r, 2.45 + u * 0.5 - u * u * 2.4, Math.sin(d.userData.a) * r);
  }
  // fireflies
  if (fireflies.m.opacity > 0.01) {
    const fp = fireflies.g.attributes.position;
    fireflies.homes.forEach((f, i) => {
      const a = f.ph + time * f.sp;
      fp.setXYZ(i, f.home.x + Math.cos(a) * f.r + Math.sin(a * 2.3) * 0.3, f.home.y + Math.sin(a * 1.7 + i) * 0.5, f.home.z + Math.sin(a) * f.r);
    });
    fp.needsUpdate = true;
  }
  // marker
  if (marker.material.opacity > 0) {
    marker.userData.t += dt;
    marker.scale.setScalar(1 + marker.userData.t * 1.5);
    marker.material.opacity = Math.max(0, 0.9 - marker.userData.t * 1.5);
  }
  // sun / shadow camera follows the player
  sun.target.position.copy(player.position);
  sun.position.copy(player.position).addScaledVector(cur.dir, 50);
  if (myBalloonSpot() !== null) { // aloft: keep the sun's shadows on the ground below, not round the basket
    sun.target.position.y = Math.max(H(player.position.x, player.position.z), 0);
    sun.position.copy(sun.target.position).addScaledVector(cur.dir, 50);
  }
}

function updateCamera(dt) {
  zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt * 10));
  // the sun's shadow area grows with the view so zoomed-out islands still get shadows
  const shadowSize = 20 + zoom * 13, sc = sun.shadow.camera;
  if (Math.abs(sc.right - shadowSize) > 1) {
    sc.left = sc.bottom = -shadowSize; sc.right = sc.top = shadowSize;
    sc.updateProjectionMatrix();
  }
  // the spin after letting go fades out; while dragging the drag itself drives the angles
  if (!orbit.drag && (orbit.vYaw || orbit.vPitch)) {
    orbit.yaw += orbit.vYaw * dt;
    orbit.pitch = clamp(orbit.pitch + orbit.vPitch * dt, PITCH_MIN, PITCH_MAX);
    const fade = Math.exp(-dt * ORBIT_SPIN_FADE);
    orbit.vYaw *= fade; orbit.vPitch *= fade;
    if (Math.abs(orbit.vYaw) < 0.005 && Math.abs(orbit.vPitch) < 0.005) orbit.vYaw = orbit.vPitch = 0;
  }
  orbit.yaw = ((orbit.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
  updateCamOffset();
  // follow the character smoothly at exactly the chosen angle and distance (the orbit applies directly)
  camLook.lerp(_v.copy(player.position).add(new THREE.Vector3(0, CAM_TARGET_Y, 0)), 1 - Math.exp(-dt * (3.5 + 2 * (walk.runNow || 0)))); // a little quicker while running
  camera.position.copy(camLook).addScaledVector(camOffset, zoom * (1 + balloonWide * 0.9));
  scene.fog.near = 150 + balloonWide * 260; scene.fog.far = 560 + balloonWide * 700;
  // the one rule kept: never below the ground or the sea surface
  const floor = myRoom !== null ? 0.6 : Math.max(H(camera.position.x, camera.position.z), 0) + 0.6;
  if (camera.position.y < floor) camera.position.y = floor;
  bananaRushFx(dt, nowMs() / 1000);
  camera.lookAt(camLook);
  sky.position.copy(camera.position);
  if (myRoom !== null) updateRoomWalls();
}

// ---------------------------------------------------------------- multiplayer
// ---------------------------------------------------------------- bicycles: borrowed free from Rex, ridden by tapping the ground
// The server owns every bicycle (who has one, where it is, who's riding). The rider steers locally and reports where
// it got to; everyone else sees it glide there. Bicycles are never saved.
const BIKE_SPEED = 6.4; // about twice the walking speed
const BIKE_COLORS = [['#9be0c0', 'Mint'], ['#f6b8d0', 'Pink'], ['#8fc0f0', 'Sky'], ['#f2e28a', 'Lemon'], ['#c9a6ff', 'Lilac']];
const BIKE_IDLE_MS = 10 * 60 * 1000;
const bikes = new Map(); // bike id (= owner's player id) -> state plus its model
let bikeRide = null; // { id, target, speed, sendT, stuckT, last } while the local player rides
const BIKE_HOME = new THREE.Vector3(0.6, 0, 2.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), RENTAL.face).add(new THREE.Vector3(RENTAL.x, 0, RENTAL.z));
const myBike = () => { const b = bikes.get(net.id); return b && !b.gone ? b : null; };
function addBike(s) {
  let b = bikes.get(s.id);
  if (b && b.gone) { removeBikeNow(b); b = null; }
  if (!b) {
    const parts = makeBike(s.color);
    b = { id: s.id, parts, dx: s.x, dz: s.z, dh: s.h || 0, px: s.x, pz: s.z, roll: 0, lean: 0, leanT: 0, spd: 0, fade: 0, gone: null, ding: 0, lastRide: performance.now() };
    parts.g.position.set(s.x, groundY(s.x, s.z), s.z);
    scene.add(parts.g); bikes.set(s.id, b);
  }
  Object.assign(b, { owner: s.owner, name: s.name, color: s.color, riding: !!s.riding });
  if (!(bikeRide && bikeRide.id === b.id)) { b.x = s.x; b.z = s.z; b.h = s.h || 0; }
  return b;
}
function removeBikeNow(b) {
  scene.remove(b.parts.g);
  b.parts.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const m of b.parts.mats) m.dispose();
  b.parts.glow.material.dispose();
  if (bikes.get(b.id) === b) bikes.delete(b.id);
}
function applyBikes(list) {
  if (bikeRide) endBikeRide(false);
  for (const b of [...bikes.values()]) removeBikeNow(b);
  for (const s of list) addBike(s);
}
// a bicycle leaves: back to the stand (rolling there if it's not far), or it just fades away
function bikeGone(m) {
  const b = bikes.get(m.id);
  if (!b || b.gone) return;
  if (bikeRide && bikeRide.id === b.id) endBikeRide(false);
  b.riding = false; b.goneT = 0;
  b.gone = m.how === 'return' && Math.hypot(b.dx - BIKE_HOME.x, b.dz - BIKE_HOME.z) < 30 ? 'return' : 'fade';
}
// where a bicycle is, in words: "about 20 steps to the north-east, by the plaza"
function bikeWhere(x, z) {
  const dx = x - player.position.x, dz = z - player.position.z, d = Math.hypot(dx, dz);
  if (d < 4) return "It's right here beside you!";
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const dir = dirs[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
  const area = island.areaAt(x, z);
  const place = area === 'desert' ? ', out in the desert' : area === 'beach' ? ', down on the beach' : Math.hypot(x - TOWN.x, z - TOWN.z) < PLAZA_R + 6 ? ', by the plaza' : '';
  return `It's parked about ${Math.max(5, Math.round(d / 5) * 5)} steps to the ${dir}${place}.`;
}
// the server, or a stand-in for it on the solo island
function bikeSend(m) {
  if (/Borrow|Mount/.test(m.t) && pianoBlocked()) return;
  if (net.online) { net.send(m); return; }
  const id = net.id, b = myBike();
  if (m.t === 'bikeBorrow') {
    if (b) { handleBike({ t: 'bikeResult', ok: false, why: 'have', x: b.dx, z: b.dz }); return; }
    handleBike({ t: 'bikeResult', ok: true, why: 'borrowed' });
    handleBike({ t: 'bike', bike: { id, owner: id, name: '', color: m.color, x: player.position.x + 1.1, z: player.position.z + 0.4, h: 0, riding: false } });
  } else if (m.t === 'bikeReturn') {
    if (!b) handleBike({ t: 'bikeResult', ok: false, why: 'none' });
    else if (b.riding) handleBike({ t: 'bikeResult', ok: false, why: 'riding' });
    else { handleBike({ t: 'bikeGone', id, how: 'return' }); handleBike({ t: 'bikeResult', ok: true, why: 'returned' }); }
  } else if (m.t === 'bikeMount') {
    if (!b || b.riding) { handleBike({ t: 'bikeResult', ok: false, why: 'mount' }); return; }
    handleBike({ t: 'bike', bike: { id, owner: id, name: b.name, color: b.color, x: b.dx, z: b.dz, h: b.dh, riding: true } });
  }
}
function handleBike(m) {
  if (m.t === 'bike' && m.bike) {
    const s = m.bike, b = addBike(s);
    if (s.owner === net.id) {
      b.lastRide = performance.now();
      if (s.riding && !bikeRide) startBikeRide(b);
      else if (!s.riding && bikeRide && bikeRide.id === b.id) endBikeRide(false);
    }
  } else if (m.t === 'bikeMove') {
    const b = bikes.get(m.id);
    if (b && !b.gone && !(bikeRide && bikeRide.id === m.id)) { b.x = m.x; b.z = m.z; b.h = m.h; }
  } else if (m.t === 'bikeGone') bikeGone(m);
  else if (m.t === 'bikeFix') { // the server didn't believe that move: back to where it last agreed
    const b = bikeRide && bikes.get(bikeRide.id);
    if (b) { b.dx = b.x = m.x; b.dz = b.z = m.z; b.dh = b.h = m.h; bikeRide.speed = 0; }
  } else if (m.t === 'bikeResult') bikeAnswered(m);
}
function bikeAnswered(m) {
  const rex = dlg.npc && dlg.npc.kind === 'bike', line = (text) => { if (rex) say([text], showChoices); else toast(text); };
  if (m.why === 'borrowed') { line(pickFrom(DIALOGUE.bike.lent)); toast('Your bicycle is ready! Tap the Ride button above it'); }
  else if (m.why === 'returned') line(pickFrom(DIALOGUE.bike.back));
  else if (m.why === 'have') { line(`You've already got a bicycle! ${bikeWhere(m.x, m.z)}`); showMarker(m.x, m.z); }
  else if (m.why === 'far') toast("Come back to Rex's bike stand for that");
  else if (m.why === 'mount') toast(myBike() ? 'Stand a little closer to your bicycle' : 'You can only ride your own bicycle');
  else if (m.why === 'none') line("Hmm, you don't have one of my bicycles right now.");
  else if (m.why === 'riding') toast('Get off the bicycle first');
}
// talking to Rex: borrow (pick a colour first) or give it back
const bikeUI = { root: document.getElementById('bikePanel'), swatches: document.getElementById('bikeSwatches'), cancel: document.getElementById('bikeCancel'), off: document.getElementById('bikeOffBtn') };
bikeUI.swatches.innerHTML = BIKE_COLORS.map(([c, name]) => `<button type="button" class="bike-swatch" data-color="${c}" title="${name}" aria-label="${name}" style="background:${c}"><span>${name}</span></button>`).join('');
function bikeBorrowTalk() {
  const mine = myBike();
  if (mine) { say([`You've already got a bicycle! ${bikeWhere(mine.dx, mine.dz)}`], showChoices); showMarker(mine.dx, mine.dz); return; }
  say([pickFrom(DIALOGUE.bike.shop)], () => bikeUI.root.classList.add('open'));
}
function closeBikePanel(back) {
  if (!bikeUI.root.classList.contains('open')) return;
  bikeUI.root.classList.remove('open');
  if (back && dlg.npc) showChoices();
}
bikeUI.swatches.addEventListener('click', (e) => {
  const sw = e.target.closest && e.target.closest('[data-color]');
  if (!sw) return;
  closeBikePanel(false);
  bikeSend({ t: 'bikeBorrow', color: sw.dataset.color });
});
bikeUI.cancel.addEventListener('click', () => closeBikePanel(true));
// a floating "Ride" circle over your own bicycle when you're beside it
const BIKE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="13" cy="30" r="8" fill="none" stroke="#5a7fa8" stroke-width="3.5"/><circle cx="35" cy="30" r="8" fill="none" stroke="#5a7fa8" stroke-width="3.5"/><path d="M13 30 L20 17 L31 17 L35 30 M20 17 L24 30 L31 17 M17 13 H23 M29 13 L33 11" fill="none" stroke="#e0584a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const bikeBubble = makeDoorBubble(BIKE_ICON, 'Ride', () => {
  if (bikeRide || myRide) return;
  if (mySeat !== null) standUp();
  bikeSend({ t: 'bikeMount' });
});
bikeBubble.btn.classList.add('bike-bubble');
const _bikeV = new THREE.Vector3();
function updateBikeBubble() {
  const b = myBike();
  const show = !!b && !b.riding && !bikeRide && !myRide && myBalloonSpot() === null && walk.deck == null && myRoom === null && mySeat === null && b.fade > 0.9 && Math.hypot(b.dx - player.position.x, b.dz - player.position.z) <= 2.6;
  if (b) _bikeV.set(b.dx, groundY(b.dx, b.dz) + 1.7, b.dz); else _bikeV.copy(player.position);
  placeBubble(bikeBubble, _bikeV, show);
}
// getting on and off
function startBikeRide(b) {
  if (myRoom !== null) return;
  if (mySeat !== null) standUp();
  if (dlg.npc) endTalk();
  walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null; walk.waterSpot = null;
  bikeRide = { id: b.id, target: null, speed: 0, sendT: 0, stuckT: 0, last: '' };
  b.riding = true; b.ding = 0.6;
  document.body.classList.add('riding');
  toolSlot.visible = false;
  toast('Tap the ground to ride there');
}
function endBikeRide(send = true) {
  if (!bikeRide) return;
  const b = bikes.get(bikeRide.id);
  bikeRide = null;
  document.body.classList.remove('riding');
  toolSlot.visible = true;
  if (b) {
    b.riding = false; b.leanT = 0;
    // step off to the side (whichever side is clear)
    const h = b.dh, fx = Math.sin(h), fz = Math.cos(h);
    const spots = [[-fz * 0.9, fx * 0.9], [fz * 0.9, -fx * 0.9], [-fx * 1.2, -fz * 1.2], [fx * 1.3, fz * 1.3]];
    const ok = spots.find(([ox, oz]) => walkable(b.dx + ox, b.dz + oz) && !colliders.some((c) => Math.hypot(b.dx + ox - c.x, b.dz + oz - c.z) < c.r + 0.2)) || [0, 0];
    player.position.set(b.dx + ok[0], groundY(b.dx + ok[0], b.dz + ok[1]), b.dz + ok[1]);
    walk.heading = h;
    if (send) {
      if (net.online) net.send({ t: 'bikeMove', x: +b.dx.toFixed(2), z: +b.dz.toFixed(2), h: +b.dh.toFixed(2) });
      bikeSend({ t: 'bikeDismount' });
    }
    b.lastRide = performance.now();
  }
  player.rotation.set(0, walk.heading, 0);
  walk.target = null;
}
bikeUI.off.addEventListener('click', () => endBikeRide(true));
// tapping the ground while riding: ride there (doors need the bicycle parked first)
function bikeTap() {
  const hits = raycaster.intersectObjects([terrain, dockClick, pier2.click], false);
  if (!hits.length) return;
  const p = hits[0].point;
  for (const slot of plotSlots) if (slot.house && plotDoor(slot, _bikeV).distanceTo(_seatPos.set(p.x, _bikeV.y, p.z)) < 1.3) { toast('Park the bicycle first'); return; }
  bikeRide.target = new THREE.Vector3(p.x, 0, p.z); bikeRide.stuckT = 0;
  showMarker(p.x, p.z);
}
// solid for a bicycle: water, anything the walking grid treats as solid (buildings, hedges, fences, trees, rocks,
// NPCs, rides), the island garden's crop beds, and the other bicycles
function bikeBlocked(x, z, self) {
  if (!NAV.grid || NAV.built !== colliders.length) navBuild();
  const [i, j] = navCell(x, z);
  if (!navFree(i, j)) return true;
  if (Math.hypot(x - LAYOUT.islandGarden.x, z - LAYOUT.islandGarden.z) < 2.3) return true;
  for (const o of bikes.values()) if (o !== self && !o.gone && Math.hypot(o.dx - x, o.dz - z) < 1.25) return true;
  return false;
}
const bikeFree = (x, z, h, self) => !bikeBlocked(x, z, self) && !bikeBlocked(x + Math.sin(h) * 0.55, z + Math.cos(h) * 0.55, self);
// the rider: steer toward the target, ease off near it, slide along anything solid
function updateBikeRide(dt, time) {
  const b = bikes.get(bikeRide.id);
  if (!b || b.gone) { endBikeRide(false); return; }
  const r = bikeRide;
  let want = 0, turn = 0;
  if (r.target) {
    const dx = r.target.x - b.dx, dz = r.target.z - b.dz, dist = Math.hypot(dx, dz);
    if (dist < 0.45) r.target = null;
    else {
      const diff = ((Math.atan2(dx, dz) - b.dh + Math.PI) % TAU + TAU) % TAU - Math.PI;
      const t = clamp(diff, -2.6 * dt, 2.6 * dt);
      b.dh += t; turn = t / Math.max(dt, 1e-4);
      want = Math.min(BIKE_SPEED, dist * 1.7) * (Math.abs(diff) > 1.4 ? 0.35 : 1);
    }
  }
  r.speed += clamp(want - r.speed, -9 * dt, 5 * dt);
  if (r.speed > 0.01) {
    const step = r.speed * dt, fx = Math.sin(b.dh), fz = Math.cos(b.dh);
    const nx = b.dx + fx * step, nz = b.dz + fz * step, stuckHere = bikeBlocked(b.dx, b.dz, b);
    if (stuckHere || bikeFree(nx, nz, b.dh, b)) { b.dx = nx; b.dz = nz; r.stuckT = 0; }
    else if (Math.abs(fx) > 0.15 && bikeFree(nx, b.dz, b.dh, b)) { b.dx = nx; r.speed *= 0.97; } // slide along it
    else if (Math.abs(fz) > 0.15 && bikeFree(b.dx, nz, b.dh, b)) { b.dz = nz; r.speed *= 0.97; }
    else { r.speed = 0; r.stuckT += dt; if (r.stuckT > 0.6) r.target = null; }
  }
  b.x = b.dx; b.z = b.dz; b.h = b.dh;
  b.leanT = clamp(-turn * 0.16 * (r.speed / BIKE_SPEED), -0.32, 0.32);
  b.lastRide = performance.now();
  r.sendT -= dt;
  if (r.sendT <= 0 && net.online) {
    r.sendT = 0.1;
    const msg = { t: 'bikeMove', x: +b.dx.toFixed(2), z: +b.dz.toFixed(2), h: +b.dh.toFixed(2) }, key = `${msg.x},${msg.z},${msg.h}`;
    if (key !== r.last) { r.last = key; net.send(msg); }
  }
  placeOnBike(player, rig, b, dt, time);
  walk.heading = b.dh; walk.moving = false; walk.speed = 0; walk.target = null;
  shadowBlob.position.set(b.dx, groundY(b.dx, b.dz) + 0.03, b.dz);
}
// a character on a bicycle: on the saddle, hands on the handlebars, pedalling with the cranks
function placeOnBike(character, charRig, b, dt, time) {
  const h = b.dh, side = -Math.sin(b.lean) * 0.4;
  character.position.set(b.dx - Math.sin(h) * 0.22 + Math.cos(h) * side, groundY(b.dx, b.dz) + 0.4, b.dz - Math.cos(h) * 0.22 - Math.sin(h) * side);
  character.rotation.set(0, h, b.lean);
  animateRig(charRig, dt, time, false, 0, 0);
  const c = Math.sin(b.roll * 0.6);
  charRig.legL.rotation.x = -1.05 + c * 0.45; charRig.legR.rotation.x = -1.05 - c * 0.45;
  charRig.legL.rotation.z = charRig.legR.rotation.z = 0;
  charRig.armL.rotation.x = charRig.armR.rotation.x = -1.15;
  charRig.body.rotation.x = 0.18; charRig.body.position.y = 0.55;
}
const riderBike = (id) => { const b = bikes.get(id); return b && b.riding && !b.gone && b.owner === id ? b : null; };
// every bicycle: glide to where the server says, roll the wheels and cranks, lean, ding, lights, fades
function updateBikes(dt, time) {
  const k = 1 - Math.exp(-dt * 10), now = performance.now();
  for (const b of [...bikes.values()]) {
    const g = b.parts.g;
    g.visible = myRoom === null;
    if (b.gone) {
      b.goneT += dt;
      if (b.gone === 'return' && b.goneT < 5) { // roll home to the stand on its own, then fade
        const dx = BIKE_HOME.x - b.dx, dz = BIKE_HOME.z - b.dz, d = Math.hypot(dx, dz);
        if (d > 0.3) { const s = Math.min(d, 4 * dt); b.dx += (dx / d) * s; b.dz += (dz / d) * s; b.dh = lerpAngle(b.dh, Math.atan2(dx, dz), Math.min(1, dt * 5)); }
        else b.goneT = 5;
      } else b.fade -= dt * 1.2;
      if (b.fade <= 0) { removeBikeNow(b); continue; }
    } else {
      b.fade = Math.min(1, b.fade + dt * 3);
      if (!(bikeRide && bikeRide.id === b.id)) { // someone else's (or parked): glide to the server's spot
        const dx = b.x - b.dx, dz = b.z - b.dz;
        if (Math.hypot(dx, dz) > 10) { b.dx = b.x; b.dz = b.z; } else { b.dx += dx * k; b.dz += dz * k; }
        const before = b.dh; b.dh = lerpAngle(b.dh, b.h, k);
        const turn = (((b.dh - before + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.max(dt, 1e-4);
        b.leanT = b.riding ? clamp(-turn * 0.16 * Math.min(1, b.spd / BIKE_SPEED), -0.32, 0.32) : 0;
      }
      // solo island: an untouched bicycle goes back to the stand after 10 minutes (the server does this online)
      if (!net.online && b.owner === net.id && !b.riding && now - b.lastRide > BIKE_IDLE_MS) bikeGone({ id: b.id, how: 'fade' });
    }
    const moved = Math.hypot(b.dx - b.px, b.dz - b.pz); b.px = b.dx; b.pz = b.dz;
    const wasMoving = b.spd > 0.4;
    b.spd = lerp(b.spd, moved / Math.max(dt, 1e-4), Math.min(1, dt * 8));
    if (b.riding && !wasMoving && b.spd > 0.4) b.ding = 0.6; // a little ding as it sets off
    b.roll += moved / 0.31;
    b.lean = lerp(b.lean, b.leanT, Math.min(1, dt * 6));
    g.position.set(b.dx, groundY(b.dx, b.dz), b.dz);
    g.rotation.set(0, b.dh, b.lean);
    for (const w of b.parts.wheels) w.rotation.x = b.roll;
    b.parts.crank.rotation.x = b.roll * 0.6;
    b.parts.handle.rotation.y = clamp(b.leanT * -1.2, -0.4, 0.4);
    if (b.ding > 0) { b.ding -= dt; const u = Math.max(0, b.ding / 0.6); b.parts.bell.rotation.z = Math.sin(b.ding * 45) * 0.6 * u; b.parts.bell.scale.setScalar(1 + 0.5 * u); }
    else { b.parts.bell.rotation.z = 0; b.parts.bell.scale.setScalar(1); }
    for (const m of b.parts.mats) m.opacity = b.fade;
    b.parts.lightM.emissiveIntensity = cur.lamp * 2.2;
    b.parts.glow.material.opacity = cur.lamp * 0.8 * b.fade;
  }
}

// ---------------------------------------------------------------- the hot air balloon
// The server keeps the balloon's state ('tied' on the pad, 'rising', 'up', 'descending'), its height at a moment and
// who stands where in the basket; the height in between, the slow drift round the pad and the sway all come from the
// shared clock, so every screen shows the same balloon. On the solo island this page plays the server's part.
const BALLOON = { maxH: 60, up: 2.2, down: 2.8, seats: 4, reach: 6.5 }; // the same numbers as BALLOON in server.js
const balloonState = { s: 'tied', h: 0, at: 0, riders: [null, null, null, null], off: [] };
function balloonHeight(now = nowMs()) {
  const st = balloonState, dt = (now - st.at) / 1000;
  if (st.s === 'rising') return Math.min(BALLOON.maxH, st.h + BALLOON.up * dt);
  if (st.s === 'descending') return Math.max(0, st.h - BALLOON.down * dt);
  return st.h;
}
// the balloon drifts very slowly round the pad once it's off the ground (never further than 5 units out)
function balloonDrift(h, now, out) {
  const r = 5 * smooth(0, 18, h), a = now / 1000 * 0.04;
  return out.set(BPARK.x + Math.cos(a) * r, balloonPark.y0 + h, BPARK.z + Math.sin(a) * r);
}
const balloon = (() => {
  const g = new THREE.Group(); scene.add(g);
  // the envelope: a rounded, striped pastel balloon (one mesh, each stripe its own colour)
  const prof = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14, a = -Math.PI / 2 + t * Math.PI; prof.push(new THREE.Vector2(Math.max(0.35, Math.cos(a) * 3.1 * (t < 0.5 ? 0.6 + t * 0.8 : 1)), 3.3 + (Math.sin(a) + 1) * 3.1)); }
  let env = new THREE.LatheGeometry(prof, 16).toNonIndexed();
  { const pos = env.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
    const stripe = ['#f6b8d0', '#fbf0dc', '#9be0c0', '#fbf0dc', '#8fc0f0', '#fbf0dc', '#f2e28a', '#fbf0dc'];
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const k = Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * 16) % 16; c.set(stripe[k % stripe.length]);
      for (let j = 0; j < 3; j++) { cols[(i + j) * 3] = c.r; cols[(i + j) * 3 + 1] = c.g; cols[(i + j) * 3 + 2] = c.b; }
    }
    env.setAttribute('color', new THREE.BufferAttribute(cols, 3)); env.computeVertexNormals(); }
  const envelope = new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, side: THREE.DoubleSide }));
  envelope.castShadow = true; g.add(envelope);
  g.add(mesh(new THREE.SphereGeometry(0.4, 8, 4, 0, TAU, 0, Math.PI / 2), mat('#f6b8d0'), 0, 9.5, 0)); // a little cap on top
  // the basket: wicker sides, a low railing, a floor
  const wicker = mat('#c9a06e'), rail = mat('#8a5a36');
  g.add(mesh(new THREE.BoxGeometry(2.1, 0.12, 2.1), rail, 0, 0.06, 0));
  for (const [x, z, w, d] of [[0, 1.0, 2.1, 0.1], [0, -1.0, 2.1, 0.1], [1.0, 0, 0.1, 2.1], [-1.0, 0, 0.1, 2.1]]) {
    g.add(mesh(new THREE.BoxGeometry(w, 0.8, d), wicker, x, 0.45, z));
    g.add(mesh(new THREE.BoxGeometry(w + 0.08, 0.1, d + 0.08), rail, x, 0.88, z)); // the railing on top
  }
  for (let k = 0; k < 4; k++) { const band = mesh(new THREE.BoxGeometry(2.14, 0.04, 2.14), mat('#b48a5a'), 0, 0.25 + k * 0.17, 0); band.castShadow = false; g.add(band); }
  // ropes from the basket's corners up to the envelope, and the burner with its flame
  const ropeM = new THREE.LineBasicMaterial({ color: 0x8a6a4a });
  for (const [x, z] of [[0.95, 0.95], [-0.95, 0.95], [0.95, -0.95], [-0.95, -0.95]]) {
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.9, z), new THREE.Vector3(x * 0.55, 3.4, z * 0.55)]), ropeM));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), rail, x * 0.55, 2.6, z * 0.55)); // the burner frame posts
  }
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.25, 8), mat('#9aa2ad'), 0, 2.6, 0));
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 7), flameM); flame.position.y = 3.0; g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a0 })); core.position.y = 2.92; g.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  glow.position.y = 3.0; glow.scale.set(2.2, 2.2, 1); g.add(glow);
  // a little brass bell on the railing that rings (swings) when the balloon takes off
  const bell = new THREE.Group(); bell.position.set(0, 0.93, 1.05); g.add(bell);
  const bellM = mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.13, 8), mat('#f2c94c', { metalness: 0.5, roughness: 0.3 }), 0, -0.1, 0); bell.add(bellM);
  // the mooring ropes down to the pad's pegs (only while it's tied)
  const tetherGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => new THREE.Vector3()));
  const tethers = new THREE.LineSegments(tetherGeo, ropeM); tethers.frustumCulled = false; scene.add(tethers);
  // a soft round shadow on the ground under it
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1; scene.add(shadow);
  return { g, flame, core, flameM, glow, bell, tethers, shadow, h: 0, ring: 0 };
})();
// where each passenger stands in the basket (facing outward) and the point beside the basket to step out to
const BALLOON_SPOTS = [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]];
const balloonSpotOf = (id) => { const i = balloonState.riders.indexOf(id); return i < 0 ? null : i; };
const myBalloonSpot = () => balloonSpotOf(net.id);
let balloonHop = null; // { from, t } the little step up into the basket
let wasAboard = false, balloonWide = 0;
function placeInBalloon(character, charRig, spot, dt, time) {
  const [lx, lz] = BALLOON_SPOTS[spot], b = balloon.g;
  b.updateMatrixWorld(true);
  const w = b.localToWorld(_balV.set(lx, 0.12, lz));
  character.position.copy(w);
  character.rotation.set(b.rotation.x, b.rotation.y + Math.atan2(lx, lz), b.rotation.z);
  animateRig(charRig, dt, time, false, 0, 0);
  charRig.armL.rotation.x = charRig.armR.rotation.x = -0.5; // hands on the railing
  charRig.head.rotation.y = Math.sin(time * 0.3 + spot) * 0.4; // looking about at the view
}
const _balV = new THREE.Vector3(), _balW = new THREE.Vector3();
function applyBalloon(m) {
  const before = balloonState.s;
  balloonState.s = m.s; balloonState.h = m.h; balloonState.at = m.at; balloonState.riders = (m.riders || []).slice(0, 4); balloonState.off = m.off || [];
  while (balloonState.riders.length < 4) balloonState.riders.push(null);
  if (m.s === 'rising' && before !== 'rising') { balloon.ring = 1.2; balloonWhoosh(); }
  if (m.s === 'descending' && before !== 'descending' && myBalloonSpot() !== null) toast('Heading down gently');
  const aboard = myBalloonSpot() !== null;
  if (aboard && !wasAboard) { // stepped in
    balloonHop = { from: player.position.clone(), t: 0 };
    if (mySeat !== null) standUp();
    if (dlg.npc) endTalk();
    walk.target = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null; walk.balloon = false;
    if (fishing) endFishing();
    document.body.classList.add('ballooning'); toolSlot.visible = false;
    toast('Tap Up to rise. Get off any time with the button by your backpack');
  } else if (!aboard && wasAboard) stepOutOfBalloon();
  wasAboard = aboard;
}
function stepOutOfBalloon() { // beside the basket, on the pad, facing out
  const spot = balloonHop && balloonHop.spot !== undefined ? balloonHop.spot : 0;
  const [lx, lz] = BALLOON_SPOTS[spot], l = Math.hypot(lx, lz);
  const x = BPARK.x + (lx / l) * 2.1, z = BPARK.z + (lz / l) * 2.1;
  player.position.set(x, groundY(x, z), z); player.rotation.set(0, Math.atan2(lx, lz), 0);
  walk.heading = Math.atan2(lx, lz); walk.target = null;
  balloonHop = null;
  document.body.classList.remove('ballooning'); toolSlot.visible = true;
}
// takeoff: puffs of air rush out round the basket
function balloonWhoosh() {
  const base = balloon.g.position.clone();
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(base.x, balloonPark.y0 + 0.25 + k * 0.05, base.z); scene.add(ring);
    let t = -k * 0.18;
    transients.push((dt) => {
      t += dt; const u = Math.max(0, t);
      ring.scale.setScalar(1 + u * 5); ring.material.opacity = t < 0 ? 0 : Math.max(0, 0.7 - u * 0.9);
      if (u >= 0.8) { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); return false; }
      return true;
    });
  }
}
// the solo island: play the server's part here
function balloonLocal(m) {
  const st = balloonState, now = nowMs(), set = (s) => { st.h = balloonHeight(now); st.s = s; st.at = now; };
  const id = net.id, i = st.riders.indexOf(id);
  if (m.t === 'balloonBoard') {
    if (i >= 0) return;
    const free = st.riders.indexOf(null);
    if (st.s !== 'tied' || free < 0) return;
    st.riders[free] = id;
  } else if (m.t === 'balloonUp') { if (i < 0 || !(st.s === 'tied' || (st.s === 'descending' && !st.off.length))) return; set('rising'); }
  else if (m.t === 'balloonDown') { if (i < 0 || !(st.s === 'rising' || st.s === 'up')) return; set('descending'); }
  else if (m.t === 'balloonOff') { if (i < 0) return; if (st.s === 'tied') st.riders[i] = null; else { if (!st.off.includes(id)) st.off.push(id); } }
  applyBalloon({ ...st, riders: st.riders.slice(), off: st.off.slice() });
}
function balloonSend(m) { if (m.t === 'balloonBoard' && pianoBlocked()) return; if (net.online) net.send(m); else balloonLocal(m); }
function balloonLocalTick() { // the solo island's version of the server's tick
  const st = balloonState, h = balloonHeight(), aboard = st.riders.filter((r) => r !== null);
  let s = null;
  if (st.s === 'rising' && h >= BALLOON.maxH) s = 'up';
  else if (st.s === 'descending' && h <= 0) s = 'tied';
  else if ((st.s === 'rising' || st.s === 'up') && (!aboard.length || aboard.every((r) => st.off.includes(r)))) s = 'descending';
  if (!s) return;
  const now = nowMs(); st.h = s === 'tied' ? 0 : balloonHeight(now); st.s = s; st.at = now;
  if (s === 'tied') { for (const r of st.off) { const k = st.riders.indexOf(r); if (k >= 0) st.riders[k] = null; } st.off = []; }
  applyBalloon({ ...st, riders: st.riders.slice(), off: st.off.slice() });
}
// the floating circles: "Board" at the basket, "Up" / "Down" inside it for the passengers
const BOARD_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 C12 5 8 15 10 22 C12 28 19 31 21 34 H27 C29 31 36 28 38 22 C40 15 36 5 24 5 Z" fill="#f6b8d0" stroke="#b05a7a" stroke-width="2"/><path d="M24 5 C20 12 20 26 22 34 M24 5 C28 12 28 26 26 34" fill="none" stroke="#fbf0dc" stroke-width="2"/><rect x="19" y="37" width="10" height="7" rx="1.5" fill="#c9a06e" stroke="#8a5a36" stroke-width="1.6"/><path d="M21 34 L20 37 M27 34 L28 37" stroke="#8a5a36" stroke-width="1.4"/></svg>';
const UP_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 9 L37 25 H29 V38 H19 V25 H11 Z" fill="#9be0c0" stroke="#3f8f6a" stroke-width="2.4" stroke-linejoin="round"/></svg>';
const DOWN_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 39 L37 23 H29 V10 H19 V23 H11 Z" fill="#8fc0f0" stroke="#3f6fa0" stroke-width="2.4" stroke-linejoin="round"/></svg>';
const boardBubble = makeDoorBubble(BOARD_ICON, 'Board', () => {
  if (myBalloonSpot() !== null || bikeRide || myRide) return;
  if (mySeat !== null) standUp();
  const d = Math.hypot(player.position.x - BPARK.x, player.position.z - BPARK.z);
  if (d <= 3.4) { balloonSend({ t: 'balloonBoard' }); return; }
  const k = 2.4 / d; // walk to the pad's edge on this side, then step in
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null;
  walk.balloon = true; walk.target = new THREE.Vector3(BPARK.x + (player.position.x - BPARK.x) * k, 0, BPARK.z + (player.position.z - BPARK.z) * k);
});
const upBubble = makeDoorBubble(UP_ICON, 'Up', () => balloonSend({ t: 'balloonUp' }));
const downBubble = makeDoorBubble(DOWN_ICON, 'Down', () => balloonSend({ t: 'balloonDown' }));
for (const b of [boardBubble, upBubble, downBubble]) b.btn.classList.add('balloon-bubble');
document.getElementById('balloonOffBtn').addEventListener('click', () => {
  if (myBalloonSpot() === null) return;
  if (balloonState.s !== 'tied') toast("You'll step out as soon as it lands");
  balloonSend({ t: 'balloonOff' });
});
function updateBalloonBubbles() {
  const st = balloonState, me = myBalloonSpot(), onPad = st.s === 'tied' && balloon.h < 0.05;
  const free = st.riders.includes(null);
  const g = balloon.g;
  const showBoard = me === null && onPad && free && myRoom === null && mySeat === null && !myRide && !bikeRide && walk.deck == null
    && Math.hypot(player.position.x - BPARK.x, player.position.z - BPARK.z) <= BALLOON.reach;
  placeBubble(boardBubble, _balW.set(g.position.x, g.position.y + 1.7, g.position.z), showBoard);
  const waitingOff = me !== null && st.off.includes(net.id);
  const canUp = me !== null && !waitingOff && (st.s === 'tied' || (st.s === 'descending' && !st.off.length));
  const canDown = me !== null && (st.s === 'rising' || st.s === 'up');
  g.updateMatrixWorld(true);
  const tip = g.localToWorld(_balW.set(0, 1.55, 1.05));
  placeBubble(upBubble, tip, canUp);
  placeBubble(downBubble, tip, canDown);
}
// every frame: height (from the shared clock), the drift and sway, the flame, the ropes and the shadow
function updateBalloon(dt, time) {
  if (!net.online) balloonLocalTick();
  const now = nowMs(), st = balloonState, target = balloonHeight(now);
  balloon.h += (target - balloon.h) * (1 - Math.exp(-dt * 6)); // smooth over any jump from the server
  const h = balloon.h, g = balloon.g;
  balloonDrift(h, now, g.position);
  const sway = smooth(0, 6, h), t = now / 1000;
  g.rotation.set(Math.sin(t * 0.7) * 0.03 * (0.4 + sway), Math.sin(t * 0.05) * 0.4 * sway, Math.sin(t * 0.55 + 1) * 0.03 * (0.4 + sway));
  // the flame: a big flicker while rising, a small one aloft, just a pilot light on the pad
  const big = st.s === 'rising' ? 1.6 : st.s === 'up' ? 1 : st.s === 'descending' ? 0.6 : 0.35;
  const fl = big * (0.85 + 0.25 * Math.sin(time * 23) * Math.sin(time * 9.3));
  balloon.flame.scale.set(0.8 + fl * 0.2, fl, 0.8 + fl * 0.2); balloon.flame.position.y = 2.75 + fl * 0.3;
  balloon.core.scale.setScalar(Math.max(0.3, fl * 0.8));
  balloon.glow.material.opacity = 0.2 + fl * 0.25 + cur.lamp * 0.3;
  if (balloon.ring > 0) { balloon.ring -= dt; balloon.bell.rotation.z = Math.sin(balloon.ring * 30) * 0.5 * (balloon.ring / 1.2); } else balloon.bell.rotation.z = 0;
  // mooring ropes, only while it rests on the pad
  const tied = h < 0.3;
  balloon.tethers.visible = tied;
  if (tied) {
    const p = balloon.tethers.geometry.attributes.position;
    g.updateMatrixWorld(true);
    [[0.95, 0.95], [-0.95, 0.95], [0.95, -0.95], [-0.95, -0.95]].forEach(([x, z], i) => {
      const c = g.localToWorld(_balW.set(x, 0.8, z)), pg = balloonPark.pegs[i];
      p.setXYZ(i * 2, c.x, c.y, c.z); p.setXYZ(i * 2 + 1, pg.x, pg.y, pg.z);
    });
    p.needsUpdate = true;
  }
  const gy = Math.max(H(g.position.x, g.position.z), 0) + (Math.hypot(g.position.x - BPARK.x, g.position.z - BPARK.z) < 3.1 ? 0.17 : 0.04);
  balloon.shadow.position.set(g.position.x, gy, g.position.z);
  balloon.shadow.scale.setScalar(1.6 + h * 0.04);
  balloon.shadow.material.opacity = 0.24 * (1 - h / 110);
  // the flag on the pole ripples
  balloonPark.flag.rotation.y = Math.sin(time * 1.7) * 0.3; balloonPark.flag.children[0].rotation.y = Math.sin(time * 4.3) * 0.15;
  // a passenger's wide view from up high
  const k = myBalloonSpot() !== null ? smooth(0, BALLOON.maxH, h) : 0;
  balloonWide += (k - balloonWide) * (1 - Math.exp(-dt * 2));
}
// the local passenger: carried in the basket (after a little hop up into it)
function updateBalloonRider(dt, time) {
  const spot = myBalloonSpot();
  if (balloonHop && balloonHop.from) {
    balloonHop.spot = spot; balloonHop.t += dt;
    const u = Math.min(1, balloonHop.t / 0.45);
    placeInBalloon(player, rig, spot, dt, time);
    if (u < 1) { const to = player.position.clone(); player.position.lerpVectors(balloonHop.from, to, smooth(0, 1, u)); player.position.y += Math.sin(u * Math.PI) * 0.6; }
    else balloonHop.from = null;
  } else placeInBalloon(player, rig, spot, dt, time);
  if (balloonHop) balloonHop.spot = spot; else balloonHop = { spot };
  walk.heading = player.rotation.y; walk.moving = false; walk.speed = 0; walk.target = null;
  shadowBlob.position.set(player.position.x, -50, player.position.z); // the balloon's own shadow covers it
}
// ---------------------------------------------------------------- the sea off the beach: swimming, banana boats, dolphins
// Swimming: from the sand you wade in, then swim, as far as a line of buoys about 22 units out (only off the beach,
// never in the river or by the town). The boats' lane by the jetty is kept clear of swimmers.
const SWIM_OUT = 22, SWIM_A0 = 100, SWIM_A1 = 245; // how far out, and the beach's seaward directions (degrees round its middle)
function swimTable() { // per degree: where the water starts and where the buoys are, along a ray from the beach's middle
  if (swimTable.t) return swimTable.t;
  const B = LAYOUT.areas.beach, rows = [];
  for (let a = SWIM_A0; a <= SWIM_A1; a++) {
    const th = (a * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    let rw = 60; for (let r = 8; r < 60; r += 0.25) if (H(B.x + c * r, B.z + s * r) < 0) { rw = r; break; }
    rows.push({ a, rw, rb: rw + SWIM_OUT });
  }
  return (swimTable.t = rows);
}
function inBoatLane(x, z) { const l = LAYOUT.beach.banana.lane; return x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1; }
function inSwimZone(x, z) { // water you may be in: off the beach, inside the buoys, out of the boats' lane
  if (!beachSide(x) || H(x, z) > 0.03 || inBoatLane(x, z)) return false;
  const B = LAYOUT.areas.beach, a = (Math.atan2(z - B.z, x - B.x) * 180) / Math.PI, deg = a < 0 ? a + 360 : a;
  if (deg < SWIM_A0 || deg > SWIM_A1) return false;
  const T = swimTable(), row = T[Math.min(T.length - 1, Math.round(deg - SWIM_A0))];
  return Math.hypot(x - B.x, z - B.z) <= row.rb;
}
const SWIM_Y = -0.55; // a swimmer's feet in deep water (head and shoulders stay above the surface)
const swimming = (x, z) => myRoom === null && beachSide(x) && H(x, z) <= SWIM_Y && !onDock(x, z);
const isSwimming = () => walk.deck == null && mySeat === null && swimming(player.position.x, player.position.z);
let swimToastT = 0;
function tooDeep() { const t = performance.now(); if (t - swimToastT > 3000) { swimToastT = t; toast('Too deep, stay inside the buoys'); } }
// a tap while swimming: swim there (or as far as the buoys / the shore lets you)
function swimTap() {
  const hits = raycaster.intersectObjects([terrain, dockClick, pier2.click], false);
  if (!hits.length) return;
  const p = hits[0].point;
  if (!walkable(p.x, p.z)) {
    const dir = new THREE.Vector3(p.x - player.position.x, 0, p.z - player.position.z), len = dir.length(); dir.normalize();
    let last = null;
    for (let s2 = 0; s2 < len; s2 += 0.2) { const x = player.position.x + dir.x * s2, z = player.position.z + dir.z * s2; if (walkable(x, z)) last = { x, z }; else break; }
    if (beachSide(p.x) && H(p.x, p.z) < 0) tooDeep();
    if (!last) return;
    p.x = last.x; p.z = last.z;
  }
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null;
  walk.target = new THREE.Vector3(p.x, 0, p.z); showMarker(p.x, p.z);
}
// the swimming pose: lying forward in the water, arms paddling, legs kicking
function swimPose(character, charRig, time, moving) {
  character.rotation.x = 0.95;
  const sp = moving ? 5 : 2.4;
  charRig.armL.rotation.x = -2.5 + Math.sin(time * sp) * 0.8; charRig.armR.rotation.x = -2.5 + Math.sin(time * sp + Math.PI) * 0.8;
  charRig.armL.rotation.z = -0.4; charRig.armR.rotation.z = 0.4;
  charRig.legL.rotation.x = Math.sin(time * sp * 1.8) * 0.35; charRig.legR.rotation.x = -Math.sin(time * sp * 1.8) * 0.35;
  charRig.head.rotation.x = -0.75; // looking ahead, not down
}
// the buoy line, with a gap where the boats come and go
const buoys = (() => {
  const T = swimTable(), B = LAYOUT.areas.beach, pts = [];
  const ray = (row, r) => { const th = (row.a * Math.PI) / 180; return { x: B.x + Math.cos(th) * r, z: B.z + Math.sin(th) * r }; };
  for (let r = T[0].rw + 1.5; r < T[0].rb; r += 2.4) pts.push(ray(T[0], r)); // the north end, from the shore out
  let prev = null;
  for (const row of T) { const q = ray(row, row.rb); if (!prev || Math.hypot(q.x - prev.x, q.z - prev.z) >= 2.4) { pts.push(q); prev = q; } }
  const L = T[T.length - 1]; for (let r = L.rb - 2.4; r > L.rw + 1.5; r -= 2.4) pts.push(ray(L, r)); // the south end, back to the shore
  const keep = pts.filter((q) => !inBoatLane(q.x, q.z) && H(q.x, q.z) < -0.2);
  const red = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8, 0, TAU, 0, Math.PI / 2), mat('#ef5a4a'), keep.length);
  const white = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M.white, keep.length);
  red.castShadow = white.castShadow = false; scene.add(red, white);
  // the rope between neighbouring buoys (not across the boats' gap)
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; if (keep.includes(a) && keep.includes(b) && Math.hypot(a.x - b.x, a.z - b.z) < 4) segs.push(a.x, 0.06, a.z, b.x, 0.06, b.z); }
  const rope = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfff4d8 }));
  rope.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3)); scene.add(rope);
  const m4 = new THREE.Matrix4();
  return function update(time) {
    keep.forEach((q, i) => { m4.makeTranslation(q.x, 0.04 + Math.sin(time * 1.6 + q.x * 0.7 + q.z * 0.3) * 0.05, q.z); red.setMatrixAt(i, m4); white.setMatrixAt(i, m4); });
    red.instanceMatrix.needsUpdate = true; white.instanceMatrix.needsUpdate = true;
  };
})();
// what a swimmer can't pass through: the big pier and its boat, the restaurant's stilts and pier, the jetty, the boats
{
  const w = (x, z, r) => colliders.push({ x, z, r, lvl: 'w' });
  for (let t = 0; t <= pier2.len; t += 1.2) w(pier2.start.x + pier2.dir.x * t, pier2.start.y + pier2.dir.y * t, 1.45);
  { const b = pier2.boat.position, yaw = pier2.boat.rotation.y; for (const k of [-1.6, 0, 1.6]) w(b.x + Math.sin(yaw) * k, b.z + Math.cos(yaw) * k, 1.3); }
  const R = LAYOUT.beach.restaurant, ax = Math.cos(R.face), az = -Math.sin(R.face), fx = Math.sin(R.face), fz = Math.cos(R.face);
  const RW = (lx, lz) => [R.x + ax * lx + fx * lz, R.z + az * lx + fz * lz];
  for (let x = -6; x <= 6.01; x += 1.5) for (let z = -7; z <= 7.01; z += 1.5) w(...RW(x, z), 1.1);
  for (let x = -6.5; x >= -11; x -= 1.2) w(...RW(x, 4.2), 1.1);
  for (const z of [5.0, 6.0, 7.0]) w(...RW(-8.8, z + 0.4), 0.9); // the little fishing boat
  const [[jx0, jz0], [jx1, jz1]] = LAYOUT.beach.banana.jetty;
  for (let u = 0; u <= 1.001; u += 0.1) w(lerp(jx0, jx1, u), lerp(jz0, jz1, u), 1.25);
}

// ---- the banana boat jetty and Captain Lia's booth
const BAN = LAYOUT.beach.banana;
const jetty = (() => {
  const [[ax, az], [bx, bz]] = BAN.jetty, JY = 0.55, hw = 1.0, len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
  const g = new THREE.Group(); g.position.set(ax, 0, az); g.rotation.y = yaw; scene.add(g);
  for (let z = 0.2; z < len; z += 0.42) g.add(mesh(new THREE.BoxGeometry(hw * 2, 0.08, 0.38), Math.round(z / 0.42) % 3 ? M.wood : mat('#a9774f'), 0, JY - 0.04, z));
  for (let z = 1; z <= len; z += 2.2) for (const x of [-hw + 0.1, hw - 0.1]) { const wx = ax + Math.sin(yaw) * z + Math.cos(yaw) * x, wz = az + Math.cos(yaw) * z - Math.sin(yaw) * x, gh = Math.min(H(wx, wz), JY - 0.2); g.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, JY - gh + 0.5, 5), M.woodDark, x, (JY + gh + 0.5) / 2 - 0.05, z)); }
  for (const x of [-hw, hw]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, len - 1.2), M.wood, x, JY + 0.5, len / 2 + 0.6)); // low rails
  const deck = addDeck(ax, az, bx, bz, JY, JY, hw);
  LINKS.push({ a: deck, b: -1, x: ax + Math.sin(yaw) * -0.6, z: az + Math.cos(yaw) * -0.6 });
  const click = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.1, len), new THREE.MeshBasicMaterial({ visible: false })); click.position.set((ax + bx) / 2, JY, (az + bz) / 2); click.rotation.y = yaw; click.userData.deck = deck; scene.add(click); deckClicks.push(click);
  const end = new THREE.Vector3(bx, JY, bz);
  for (const x of [-hw, hw]) { const at = new THREE.Vector3(bx + Math.cos(yaw) * x, JY + 0.95, bz - Math.sin(yaw) * x); scene.add(mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), M.woodDark, at.x, JY + 0.48, at.z)); const lan = mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), M.lantern, at.x, at.y, at.z); lan.castShadow = false; scene.add(lan); const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.position.copy(at); glow.scale.set(1.4, 1.4, 1); scene.add(glow); lampData.push({ pos: at.clone(), light: null, glow }); }
  return { deck, JY, end, a: new THREE.Vector3(ax, JY, az), b: end };
})();
{ // the rental booth: striped awning, a banana picture sign, a counter
  const bo = BAN.booth, g = new THREE.Group(); g.position.set(bo.x, H(bo.x, bo.z), bo.z); g.rotation.y = bo.face; scene.add(g);
  for (const [px, pz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 6), M.wood, px, 1.1, pz));
  g.add(mesh(new THREE.BoxGeometry(2.2, 1.5, 0.08), mat('#fbf0dc'), 0, 1.15, -0.6));
  g.add(mesh(new THREE.BoxGeometry(2.3, 0.1, 1.5), mat('#f2c94c'), 0, 2.25, 0));
  const aw = makeAwning(2.3, '#f2c94c'); aw.position.set(0, 2.1, 0.45); g.add(aw);
  g.add(mesh(new THREE.BoxGeometry(2.1, 0.85, 0.45), M.wood, 0, 0.43, 0.45));
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.55, 0.04), mat('#5fb4e0'), 0, 0.43, 0.69));
  for (const [x, c] of [[-0.6, '#ff8a3a'], [0.5, '#ff8a3a']]) { const v = mesh(new THREE.BoxGeometry(0.4, 0.45, 0.16), mat(c), x, 1.1, 0.4); g.add(v); } // life vests on the counter
  const c2 = document.createElement('canvas'); c2.width = c2.height = 128; { const x = c2.getContext('2d'); x.fillStyle = '#fff6d0'; if (x.beginPath) { x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fill(); } x.font = '76px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🍌', 64, 70); }
  const tex = new THREE.CanvasTexture(c2); tex.colorSpace = THREE.SRGBColorSpace;
  const board = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 20), M.wood, 0, 2.75, 0.1); board.rotation.x = Math.PI / 2; g.add(board);
  const pic = flatPic(tex, 0.7, 0.7); pic.position.set(0, 2.75, 0.15); g.add(pic);
  colliders.push({ x: bo.x, z: bo.z, r: 1.3 });
  SHOPKEEPERS.banana = { name: 'Captain Lia', tag: '#f2c94c', skin: '#f0c8a0', hair: '#2b211c', top: '#fffaf0', bottom: '#3f6fa0', longHair: true, dress(n) { // a captain's cap and a life vest
    n.head.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 14), n.soft('#fbf0dc'), 0, 0.28, 0));
    n.head.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 14), n.soft('#2b3a5a'), 0, 0.21, 0));
    const brim = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12, 1, false, 0, Math.PI), n.soft('#2b3a5a'), 0, 0.2, 0.2); brim.rotation.y = -Math.PI / 2; n.head.add(brim);
    n.head.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), n.soft('#f2c94c'), 0, 0.3, 0.3));
    n.body.add(mesh(new THREE.BoxGeometry(0.46, 0.42, 0.34), n.soft('#ff8a3a'), 0, 0.2, 0)); // the life vest
    for (const y of [0.1, 0.28]) n.body.add(mesh(new THREE.BoxGeometry(0.47, 0.04, 0.35), n.soft('#fbf0dc'), 0, y, 0));
    n.props = [];
  } };
  const n = makeTownNpc(SHOPKEEPERS.banana); SHOPKEEPERS.banana.dress(n);
  const at = new THREE.Vector3(1.7, 0, 0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), bo.face).add(new THREE.Vector3(bo.x, 0, bo.z));
  n.g.position.set(at.x, H(at.x, at.z) + 0.02, at.z); n.baseYaw = bo.face; n.g.rotation.y = bo.face; n.kind = 'banana'; n.ph = 5.5;
  scene.add(n.g); colliders.push({ x: at.x, z: at.z, r: 0.4 }); shopkeepers.push(n);
  talkBubbles.push((() => { const b = makeDoorBubble(TALK_ICON, 'Talk to Captain Lia', () => { if (mySeat !== null) standUp(); talkTo(n); }); b.btn.classList.add('talk-bubble'); return { n, ...b }; })());
}
// a life vest any character can wear (made the first time they ride)
function lifeVest(c) {
  if (!c.userData.vest) {
    const v = new THREE.Group(), o = mat('#ff8a3a', { flatShading: false });
    v.add(mesh(new THREE.BoxGeometry(0.5, 0.42, 0.36), o, 0, 0.2, 0));
    for (const y of [0.1, 0.28]) v.add(mesh(new THREE.BoxGeometry(0.51, 0.04, 0.37), M.white, 0, y, 0));
    c.userData.vest = v;
  }
  return c.userData.vest;
}
// ---- the boats: a cute motorboat (with its driver at the wheel) towing an inflatable banana with 6 seats in pairs
const BANANA_SEATS = [[-0.3, 1.3], [0.3, 1.3], [-0.3, 0], [0.3, 0], [-0.3, -1.3], [0.3, -1.3]]; // [x, z] on the banana, +z = forward
const BANANA_TIP = new THREE.Vector3(0, 0.62, 2.85); // where the tow rope ties on, at the banana's raised front
const bananaState = { boats: BAN.boats.map(() => ({ s: 'wait', riders: [null, null, null, null, null, null], first: 0, at: 0, ret: null })) };
const BOAT_LOOKS = [
  { hull: '#fffaf0', stripe: '#f29ab8', bottom: '#f7c6d6', rail: '#f29ab8', motor: '#f29ab8', flag: '#f6d55c', fenders: '#8fd0f0', seat: '#f29ab8' },
  { hull: '#fffaf0', stripe: '#6fc4e8', bottom: '#bfe3f5', rail: '#6fc4e8', motor: '#6fc4e8', flag: '#f29ab8', fenders: '#f6d55c', seat: '#9be0c0' },
];
function makeBanana() {
  const banana = new THREE.Group();
  const yel = mat('#f6d55c', { flatShading: false }), seam = mat('#e8a93a', { flatShading: false });
  // the long curved tube: low and plump in the middle, the rounded front and tail lifting out of the water
  const spine = new THREE.CatmullRomCurve3([[0, 0.5, -2.85], [0, 0.24, -2.2], [0, 0.12, -1.1], [0, 0.1, 0], [0, 0.12, 1.1], [0, 0.24, 2.1], [0, 0.6, 2.85]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  banana.add(mesh(new THREE.TubeGeometry(spine, 28, 0.38, 10), yel));
  for (const e of [spine.getPoint(0), spine.getPoint(1)]) banana.add(mesh(new THREE.SphereGeometry(0.38, 10, 8), yel, e.x, e.y, e.z));
  // the seam stripe along the top, and two side pontoons for balance
  const top = new THREE.CatmullRomCurve3(spine.points.map((p) => p.clone().add(new THREE.Vector3(0, 0.37, 0))));
  banana.add(mesh(new THREE.TubeGeometry(top, 28, 0.035, 5), seam));
  for (const sx of [-0.6, 0.6]) {
    const side = new THREE.CatmullRomCurve3([[sx, 0.06, -1.9], [sx, 0.0, -0.8], [sx, 0.0, 0.8], [sx * 0.9, 0.08, 1.9]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    banana.add(mesh(new THREE.TubeGeometry(side, 12, 0.16, 8), mat('#f2c24c', { flatShading: false })));
    for (const e of [side.getPoint(0), side.getPoint(1)]) banana.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat('#f2c24c', { flatShading: false }), e.x, e.y, e.z));
  }
  // the stalk at the tip, a cheerful face, the brown tail end
  const tip = mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.4, 6), mat('#7a8a3a'), 0, 0.98, 3.05); tip.rotation.x = 0.9; banana.add(tip);
  banana.add(mesh(new THREE.SphereGeometry(0.12, 6, 4), mat('#6b4a2c'), 0, 0.55, -3.2));
  for (const x of [-0.17, 0.17]) { banana.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), M.white, x, 0.78, 2.92)); banana.add(mesh(new THREE.SphereGeometry(0.048, 6, 4), mat('#2b211c'), x, 0.79, 2.99)); }
  const smile = mesh(new THREE.TorusGeometry(0.1, 0.018, 4, 10, Math.PI), mat('#2b211c'), 0, 0.64, 3.08); smile.rotation.set(0.3, 0, Math.PI); banana.add(smile);
  // small handle loops in front of every seat, and a tie ring at the front for the tow rope
  for (const [x, zz] of BANANA_SEATS) { const h2 = mesh(new THREE.TorusGeometry(0.1, 0.025, 5, 10, Math.PI), mat('#e0584a'), x * 0.7, 0.56, zz + 0.42); h2.rotation.y = Math.PI / 2; banana.add(h2); }
  const ring = mesh(new THREE.TorusGeometry(0.07, 0.02, 4, 8), mat('#e0584a'), BANANA_TIP.x, BANANA_TIP.y, BANANA_TIP.z); ring.rotation.x = Math.PI / 2; banana.add(ring);
  return banana;
}
// the drivers, one per motorboat: the same for everyone (named in LAYOUT, so the server knows them too)
const DRIVER_LOOKS = [
  { name: 'Suri', tag: '#f29ab8', skin: '#f5d0b0', hair: '#5a3a2a', top: '#fffaf0', bottom: '#5fb4e0', shoes: '#f29ab8', longHair: true, dress(n) { // a cheerful girl: cap, ponytail, life vest
    n.head.add(mesh(new THREE.SphereGeometry(0.345, 14, 8, 0, TAU, 0, Math.PI * 0.42), n.soft('#f29ab8'), 0, 0.06, 0));
    const brim = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12, 1, false, 0, Math.PI), n.soft('#f29ab8'), 0, 0.12, 0.22); brim.rotation.y = -Math.PI / 2; n.head.add(brim);
    const tail = mesh(new THREE.CapsuleGeometry(0.07, 0.22, 3, 6), n.soft('#5a3a2a'), 0, -0.02, -0.36); tail.rotation.x = 0.5; n.head.add(tail);
    n.body.add(mesh(new THREE.BoxGeometry(0.48, 0.42, 0.36), n.soft('#ff8a3a'), 0, 0.2, 0));
    for (const y of [0.1, 0.28]) n.body.add(mesh(new THREE.BoxGeometry(0.49, 0.04, 0.37), n.soft('#fbf0dc'), 0, y, 0));
  } },
  { name: 'Mak Jah', tag: '#9be0c0', skin: '#e8b890', hair: '#e8e4dc', top: '#9be0c0', bottom: '#8a6fb0', shoes: '#6b4a2c', dress(n) { // a grandma: straw hat with a flower, round glasses, a bun
    const straw = n.soft('#e8c76a');
    n.head.add(mesh(new THREE.CylinderGeometry(0.52, 0.54, 0.04, 16), straw, 0, 0.2, 0));
    n.head.add(mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.2, 14), straw, 0, 0.31, 0));
    n.head.add(mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.05, 14), n.soft('#f29ab8'), 0, 0.25, 0));
    n.head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), n.soft('#ff8fa8'), 0.25, 0.28, 0.1));
    n.head.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), n.soft('#e8e4dc'), 0, 0.02, -0.3));
    for (const x of [-0.11, 0.11]) { const gl = mesh(new THREE.TorusGeometry(0.07, 0.012, 4, 12), n.soft('#6b4a2c'), x, 0.0, 0.31); n.head.add(gl); }
    n.body.add(mesh(new THREE.BoxGeometry(0.48, 0.42, 0.36), n.soft('#ff8a3a'), 0, 0.2, 0));
    for (const y of [0.1, 0.28]) n.body.add(mesh(new THREE.BoxGeometry(0.49, 0.04, 0.37), n.soft('#fbf0dc'), 0, y, 0));
  } },
];
const bananaBoats = BAN.boats.map((z, bi) => {
  const look = BOAT_LOOKS[bi % BOAT_LOOKS.length], course = bananaCourse(bi);
  const mb = makeCuteBoat({ L: 3.6, W: 0.86, ...look, windshield: true, wheel: true, motor: look.motor, lights: true, seats: [{ t: 0.33, w: 0.62, c: look.seat }, { t: 0.12, w: 1.0, c: look.seat }] });
  const boat = mb.g, banana = makeBanana();
  scene.add(boat, banana);
  // the tow rope: a gently sagging line from the motor's tow post to the banana's front ring
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 9 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xfff4d8 })); rope.frustumCulled = false; scene.add(rope);
  boat.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 5), M.white, 0, mb.deckY(0.02) + 0.3, mb.zAt(0.02)));
  // the driver, seated at the wheel
  const dl = DRIVER_LOOKS[bi % DRIVER_LOOKS.length], kind = 'driver' + bi;
  SHOPKEEPERS[kind] = { ...dl, name: BAN.drivers[bi] || dl.name };
  const n = makeTownNpc(SHOPKEEPERS[kind]); dl.dress(n);
  const smile = mesh(new THREE.TorusGeometry(0.07, 0.016, 4, 10, Math.PI), n.soft('#b0503a'), 0, -0.1, 0.31); smile.rotation.z = Math.PI; n.head.add(smile);
  n.kind = kind; n.driver = true; n.docked = true; n.ph = bi * 3.1; n.baseYaw = 0; n.props = [];
  scene.add(n.g); shopkeepers.push(n);
  talkBubbles.push((() => { const b = makeDoorBubble(TALK_ICON, `Talk to ${SHOPKEEPERS[kind].name}`, () => { if (mySeat !== null) standUp(); talkTo(n); }); b.btn.classList.add('talk-bubble'); return { n, ...b }; })());
  // the V wake: little foam dabs left behind on both sides that drift apart and fade
  const wake = Array.from({ length: 44 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, vx: 0, vz: 0, life: 0 }; });
  return { bi, z, course, mb, boat, banana, rope, driver: n, seatT: 0.33, wake, wi: 0, d: course.at[1], roll: 0, yaw: null, byaw: null, prevYaw: 0, turn: 0, wakeT: 0, sprayT: 0, ret: null, retKey: '' };
});
// how far you are from a driver's boat-and-banana (you chat with them from the jetty, or from the beach beside the banana)
function driverReach(n) {
  const b = bananaBoats.find((k) => k.driver === n); if (!b) return 99;
  const a = b.boat.position, bl = Math.hypot(b.banana.position.x - a.x, b.banana.position.z - a.z) || 1, k = (bl + 3) / bl; // to the banana's tail end
  const ux = (b.banana.position.x - a.x) * k, uz = (b.banana.position.z - a.z) * k, l2 = ux * ux + uz * uz || 1, t = clamp(((player.position.x - a.x) * ux + (player.position.z - a.z) * uz) / l2, 0, 1);
  return Math.hypot(player.position.x - (a.x + ux * t), player.position.z - (a.z + uz * t));
}
// where a boat and its banana are now (from its state and the shared clock), and how fast it's going
function bananaPose(b, now) {
  const st = bananaState.boats[b.bi];
  let path = b.course, r = { d: b.course.at[1], v: 0 };
  if (st.s === 'ride') r = bananaRideAt(b.course, st.at, now);
  else if (st.s === 'return' && st.ret) {
    const key = JSON.stringify(st.ret.ctrl); if (key !== b.retKey) { b.retKey = key; b.ret = makePath(st.ret.ctrl); }
    path = b.ret; r = bananaRetAt(st.ret, path.len, now);
  }
  return { boat: pathAt(path, r.d), banana: pathAt(path, r.d - 6), moving: r.v > 0.03, v: r.v };
}
const bananaSeatOf = (id) => { for (let i = 0; i < bananaState.boats.length; i++) { const k = bananaState.boats[i].riders.indexOf(id); if (k >= 0) return { boat: i, seat: k }; } return null; };
const myBananaSeat = () => bananaSeatOf(net.id);
let wasOnBanana = null, bananaHop = null;
function placeOnBanana(character, charRig, at, dt, time) {
  const b = bananaBoats[at.boat], [sx, sz] = BANANA_SEATS[at.seat];
  b.banana.updateMatrixWorld(true);
  const w = b.banana.localToWorld(new THREE.Vector3(sx, 0.48, sz));
  character.position.set(w.x, w.y - 0.55, w.z);
  character.rotation.set(0, b.banana.rotation.y, b.banana.rotation.z);
  animateRig(charRig, dt, time, false, 0, 0);
  charRig.legL.rotation.x = charRig.legR.rotation.x = -1.2; charRig.legL.rotation.z = 0.45; charRig.legR.rotation.z = -0.45; // astride the banana
  charRig.armL.rotation.x = charRig.armR.rotation.x = -1.0; // holding the handles
  charRig.body.rotation.x = 0.15 + Math.sin(time * 3 + at.seat) * 0.05; charRig.body.position.y = 0.55 + Math.abs(Math.sin(time * 4 + at.seat)) * 0.03;
  const v = lifeVest(character); if (v.parent !== charRig.body) charRig.body.add(v); v.visible = true;
}
function applyBanana(m) {
  bananaState.boats = (m.boats || []).map((b) => ({ driver: b.driver, s: b.s, riders: (b.riders || []).slice(0, 6), first: b.first, at: b.at, ret: b.ret }));
  while (bananaState.boats.length < bananaBoats.length) bananaState.boats.push({ s: 'wait', riders: [null, null, null, null, null, null], first: 0, at: 0, ret: null });
  bananaChanged();
}
function bananaChanged() {
  const mine = myBananaSeat();
  if (mine && !wasOnBanana) { // in: a little hop onto the banana, vest on
    if (mySeat !== null) standUp();
    if (dlg.npc) endTalk();
    if (fishing) endFishing();
    walk.target = null; walk.route = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null; walk.deck = null;
    bananaHop = { from: player.position.clone(), t: 0 };
    document.body.classList.add('bananaing'); toolSlot.visible = false;
    toast('Hold on tight! Tap Start, or the ride begins in a few seconds');
  } else if (!mine && wasOnBanana) { // off at the jetty, on the planks beside where the banana waits
    const b = bananaBoats[wasOnBanana.boat], p = bananaPose(b, nowMs()).banana, J = jetty;
    const ux = J.b.x - J.a.x, uz = J.b.z - J.a.z, l2 = ux * ux + uz * uz, t = clamp(((p.x - J.a.x) * ux + (p.z - J.a.z) * uz) / l2, 0.15, 0.95);
    player.position.set(J.a.x + ux * t, J.JY, J.a.z + uz * t); player.rotation.set(0, 0, 0);
    walk.deck = J.deck; walk.target = null; walk.heading = Math.atan2(J.a.x - J.b.x, J.a.z - J.b.z); // facing the beach
    const v = player.userData.vest; if (v) v.visible = false;
    document.body.classList.remove('bananaing'); toolSlot.visible = true;
  }
  wasOnBanana = mine;
}
// the solo island plays the server's part
function bananaSend(m) {
  if (m.t === 'bananaBoard' && pianoBlocked()) return;
  if (net.online) { net.send(m); return; }
  const now = nowMs(), mine = myBananaSeat();
  if (m.t === 'bananaBoard') { const st = bananaState.boats[m.boat]; if (!st || st.s !== 'wait' || st.riders[m.seat] !== null || mine) return; st.riders[m.seat] = net.id; if (!st.first) st.first = now; }
  else if (m.t === 'bananaStart' && mine) { const st = bananaState.boats[mine.boat]; if (st.s === 'wait') { st.s = 'ride'; st.at = now; } }
  else if (m.t === 'bananaOff' && mine) { const st = bananaState.boats[mine.boat]; if (st.s === 'wait') { st.riders[mine.seat] = null; if (!st.riders.some((r) => r !== null)) st.first = 0; } else if (st.s === 'ride') bananaLocalReturn(mine.boat, now); }
  bananaChanged();
}
function bananaLocalReturn(bi, now) {
  const b = bananaBoats[bi], st = bananaState.boats[bi], r = bananaRideAt(b.course, st.at, now), ctrl = bananaReturnCtrl(b.course, bi, r.d);
  if (!ctrl) return;
  st.s = 'return'; st.ret = { ctrl, at: now, d0: makePath(ctrl).at[2], v0: +r.v.toFixed(3) };
}
function bananaLocalTick() {
  const now = nowMs(); let changed = false;
  bananaState.boats.forEach((st, bi) => {
    const b = bananaBoats[bi], aboard = st.riders.some((r) => r !== null), finish = () => { st.s = 'wait'; st.riders.fill(null); st.first = 0; st.at = 0; st.ret = null; changed = true; };
    if (st.s === 'wait' && aboard && now - st.first >= BAN.waitMs) { st.s = 'ride'; st.at = now; changed = true; }
    else if (st.s === 'ride' && bananaRideAt(b.course, st.at, now).done) finish();
    else if (st.s === 'ride' && !aboard) { bananaLocalReturn(bi, now); changed = true; }
    else if (st.s === 'return' && st.ret && bananaRetAt(st.ret, makePath(st.ret.ctrl).len, now).done) finish();
  });
  if (changed) bananaChanged();
}
// the floating circles: "Ride" over every free seat of a waiting banana, "Start" at a boat you're aboard
const BANANA_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 30 C14 40 34 40 42 24 C36 32 18 34 10 26 Z" fill="#f6d55c" stroke="#b8862a" stroke-width="2.2" stroke-linejoin="round"/><path d="M40 25 L44 20" stroke="#7a8a3a" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="31" r="2" fill="#e0584a"/><circle cx="25" cy="33" r="2" fill="#e0584a"/><circle cx="33" cy="31" r="2" fill="#e0584a"/></svg>';
const START_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 11 L37 24 L16 37 Z" fill="#9be0c0" stroke="#3f8f6a" stroke-width="2.6" stroke-linejoin="round"/></svg>';
const bananaSeatBubbles = [], bananaStartBubbles = [];
bananaBoats.forEach((b, bi) => {
  BANANA_SEATS.forEach((_, si) => { const bb = makeDoorBubble(BANANA_ICON, 'Ride', () => { if (!myBananaSeat() && !bikeRide && myBalloonSpot() === null) bananaSend({ t: 'bananaBoard', boat: bi, seat: si }); }); bb.btn.classList.add('banana-bubble'); bananaSeatBubbles.push({ bb, bi, si }); });
  const sb = makeDoorBubble(START_ICON, 'Start the ride', () => bananaSend({ t: 'bananaStart' })); sb.btn.classList.add('banana-bubble'); bananaStartBubbles.push(sb);
});
document.getElementById('bananaOffBtn').addEventListener('click', () => {
  const mine = myBananaSeat(); if (!mine) return;
  if (bananaState.boats[mine.boat].s !== 'wait') toast('Heading back to the jetty');
  bananaSend({ t: 'bananaOff' });
});
const _banV = new THREE.Vector3();
function updateBananaBubbles() {
  const mine = myBananaSeat(), free = !mine && myRoom === null && mySeat === null && !bikeRide && myBalloonSpot() === null && !isSwimming();
  for (const { bb, bi, si } of bananaSeatBubbles) {
    const b = bananaBoats[bi], st = bananaState.boats[bi];
    b.banana.updateMatrixWorld(true); const w = b.banana.localToWorld(_banV.set(BANANA_SEATS[si][0], 1.05, BANANA_SEATS[si][1]));
    const show = free && st.s === 'wait' && st.riders[si] === null && Math.hypot(w.x - player.position.x, w.z - player.position.z) < 7;
    placeBubble(bb, w, show);
  }
  bananaStartBubbles.forEach((sb, bi) => { const b = bananaBoats[bi]; placeBubble(sb, _banV.set(b.boat.position.x, 1.4, b.boat.position.z), !!mine && mine.boat === bi && bananaState.boats[bi].s === 'wait'); });
}
// every frame: move the boats, sway the bananas, ropes, wakes, spray; the drivers steer, look round and wave
const _rope = new THREE.Vector3(), _ropeB = new THREE.Vector3();
let bananaRush = 0; // how fast the banana you ride is going (0..1): the speed streaks, the camera's tiny shake and widening
const sprayFx = (() => { // spray droplets thrown off the banana in the turns (a shared pool)
  const N = 160, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xeaf8ff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
  let n = 0;
  return {
    emit(x, z, dx, dz, k) { for (let j = 0; j < k; j++) { const i = n; n = (n + 1) % N; pos[i * 3] = x; pos[i * 3 + 1] = 0.25; pos[i * 3 + 2] = z; const s = 0.6 + Math.random() * 1.4; vel[i * 3] = dx * s + (Math.random() - 0.5) * 0.8; vel[i * 3 + 1] = 1.6 + Math.random() * 2.2; vel[i * 3 + 2] = dz * s + (Math.random() - 0.5) * 0.8; life[i] = 0.7 + Math.random() * 0.3; } },
    update(dt) { for (let i = 0; i < N; i++) { if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue; } life[i] -= dt; vel[i * 3 + 1] -= 9 * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt; } geo.attributes.position.needsUpdate = true; },
  };
})();
function updateDriver(b, p, st, time, f) {
  const n = b.driver, t = nowMs() / 1000;
  b.boat.updateMatrixWorld(true);
  n.g.position.copy(b.boat.localToWorld(_rope.set(0, b.mb.deckY(b.seatT) + 0.3 - 0.55 + 0.04, b.mb.zAt(b.seatT) - 0.02)));
  n.g.quaternion.copy(b.boat.quaternion);
  n.docked = st.s === 'wait';
  for (const l of n.legs) l.rotation.x = -1.45;
  n.body.position.y = 0.55 + Math.abs(Math.sin(time * 5 + b.bi)) * 0.02 * f;
  const k = Math.min(1, 0.12 + f);
  // anyone close by on the dock or the beach while the boat waits: look at them and wave
  let near = null, nd = 7;
  if (n.docked) for (const c of [...(myRoom === null ? [player] : []), ...[...remotes.values()].filter((r) => !r.room).map((r) => r.player)]) { const d = Math.hypot(c.position.x - n.g.position.x, c.position.z - n.g.position.z); if (d < nd) { nd = d; near = c; } }
  if (dlg.npc === n) near = player;
  const steer = clamp(b.turn * 0.35, -0.4, 0.4), sharp = Math.abs(b.turn) > 0.35 && f > 0.4;
  const cheer = sharp && Math.floor(t / 2.5 + b.bi) % 2 === 0; // a thumbs-up / wave in the turns, now and then
  const lookBack = f > 0.3 && (t + b.bi * 4) % 9 < 1.4; // a glance back at the riders
  let headYaw = Math.sin(t * 0.6 + b.bi) * 0.15 - steer * 0.6;
  if (near) headYaw = clamp(((Math.atan2(near.position.x - n.g.position.x, near.position.z - n.g.position.z) - p.boat.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI, -1.4, 1.4);
  else if (lookBack) headYaw = 2.3 * Math.sin(Math.min(1, ((t + b.bi * 4) % 9) / 1.4) * Math.PI) * (b.bi ? -1 : 1);
  n.head.rotation.y = lerp(n.head.rotation.y, headYaw, 0.15);
  n.head.rotation.x = -0.05;
  // hands on the wheel (turning it with the boat), or one hand up to wave
  n.armL.rotation.x = -1.2; n.armL.rotation.z = 0.32 + steer;
  const wave = (near && dlg.npc !== n) || cheer;
  n.armR.rotation.x = lerp(n.armR.rotation.x, wave ? 0 : -1.2, k * 0.5);
  n.armR.rotation.z = lerp(n.armR.rotation.z, wave ? 2.5 + Math.sin(t * 9) * 0.35 : -0.32 + steer, k * 0.5);
  const wh = b.boat.userData.wheel; if (wh) wh.rotation.z = -steer * 2;
  if (dlg.npc === n && !n.docked) endTalk(); // the boat set off: the chat's over
}
function updateBananas(dt, time) {
  if (!net.online) bananaLocalTick();
  const now = nowMs();
  for (const b of bananaBoats) {
    const st = bananaState.boats[b.bi], p = bananaPose(b, now), f = clamp(p.v / BAN.speed, 0, 1.2);
    if (b.yaw === null) { b.yaw = p.boat.yaw; b.byaw = p.banana.yaw; }
    const prev = b.yaw;
    b.yaw = lerpAngle(b.yaw, p.boat.yaw, Math.min(1, dt * 10)); b.byaw = lerpAngle(b.byaw, p.banana.yaw, Math.min(1, dt * 7));
    const turn = (((b.yaw - prev + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.max(dt, 1e-3);
    b.turn = lerp(b.turn, p.moving ? turn : 0, Math.min(1, dt * 4));
    b.roll = lerp(b.roll, p.moving ? clamp(-b.turn * 0.9, -0.5, 0.5) * Math.min(1, f * 1.3) : 0, Math.min(1, dt * 3));
    // at rest a gentle bob; under way the bow lifts and the hull rides up a little
    const bob = Math.sin(time * 1.4 + b.bi) * (0.045 - f * 0.02), pitch = Math.sin(time * 1.1 + b.bi) * 0.025 - f * 0.12;
    b.boat.position.set(p.boat.x, 0.05 + bob + f * 0.05, p.boat.z); b.boat.rotation.set(pitch, b.yaw, b.roll * 0.35);
    // the banana swings out wide in the turns and bounces over the wake
    const swing = b.roll * 0.9, bx = Math.cos(b.byaw) * swing, bz = -Math.sin(b.byaw) * swing;
    b.banana.position.set(p.banana.x + bx, 0.1 + Math.sin(time * 2.2 + b.bi) * 0.05 + Math.abs(Math.sin(time * 6.5 + b.bi)) * 0.06 * f, p.banana.z + bz);
    b.banana.rotation.set(Math.sin(time * 1.7) * 0.03 - f * 0.03 + Math.sin(time * 6.5) * 0.02 * f, b.byaw, b.roll * 1.15 + Math.sin(time * 1.3 + 1) * 0.04);
    boatFx(b.mb, f, time);
    // the tow rope, sagging less the harder it pulls
    b.boat.localToWorld(_rope.set(0, b.mb.deckY(0.02) + 0.45, b.mb.zAt(0.02))); b.banana.updateMatrixWorld(true); b.banana.localToWorld(_ropeB.copy(BANANA_TIP));
    const ra = b.rope.geometry.attributes.position, sag = 0.35 * (1 - Math.min(1, f));
    for (let i = 0; i < 9; i++) { const u = i / 8; ra.setXYZ(i, lerp(_rope.x, _ropeB.x, u), lerp(_rope.y, _ropeB.y, u) - Math.sin(u * Math.PI) * sag, lerp(_rope.z, _ropeB.z, u)); }
    ra.needsUpdate = true;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    if (p.moving) { // the V wake and foam rings behind the motor, spray off the banana
      b.wakeT -= dt;
      if (b.wakeT <= 0) {
        b.wakeT = f > 0.5 ? 0.05 : 0.12;
        for (const s of [-1, 1]) { const w = b.wake[b.wi]; b.wi = (b.wi + 1) % b.wake.length; w.m.position.set(p.boat.x - fx * 1.9 + fz * s * 0.35, 0.12, p.boat.z - fz * 1.9 - fx * s * 0.35); w.vx = fz * s * (0.8 + f * 1.6) - fx * 0.3; w.vz = -fx * s * (0.8 + f * 1.6) - fz * 0.3; w.life = 1.4; w.m.visible = true; }
        if (Math.random() < 0.35 + f * 0.3) ripple(p.boat.x - fx * 2.1, p.boat.z - fz * 2.1, 0.5 + f * 0.6);
        if (Math.random() < 0.3 * f) ripple(p.banana.x + (Math.random() - 0.5), p.banana.z + (Math.random() - 0.5), 0.4 + f * 0.3);
      }
      b.sprayT -= dt;
      if (b.sprayT <= 0 && f > 0.3) { // bigger sprays the sharper the turn, flung to the outside
        b.sprayT = 0.06;
        const out = b.turn > 0 ? -1 : 1, k = Math.round(1 + Math.min(5, Math.abs(b.turn) * 6) * f);
        sprayFx.emit(p.banana.x + Math.cos(b.byaw) * out * 0.6, p.banana.z - Math.sin(b.byaw) * out * 0.6, Math.cos(b.byaw) * out, -Math.sin(b.byaw) * out, k);
        sprayFx.emit(p.boat.x + fx * 1.3, p.boat.z + fz * 1.3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, Math.round(f * 2));
      }
    }
    for (const w of b.wake) if (w.life > 0) { w.life -= dt; w.m.position.x += w.vx * dt; w.m.position.z += w.vz * dt; w.vx *= 1 - dt * 0.8; w.vz *= 1 - dt * 0.8; w.m.scale.setScalar(1 + (1.4 - w.life) * 1.6); w.m.material.opacity = Math.max(0, w.life / 1.4) * 0.7; if (w.life <= 0) w.m.visible = false; }
    updateDriver(b, p, st, time, f);
  }
  sprayFx.update(dt);
  // the moored boats bob and flutter their flags
  for (const mb of mooredBoats) boatFx(mb, 0, time);
  pier2.boat.position.y = 0.05 + Math.sin(time * 1.1 + 2) * 0.04; pier2.boat.rotation.z = Math.sin(time * 0.8) * 0.03;
  // the local rider rides along (after a little hop on)
  const mine = myBananaSeat();
  if (!mine) for (const c of [player]) { const v = c.userData.vest; if (v) v.visible = false; }
  return mine;
}
function updateBananaRider(dt, time) {
  const mine = myBananaSeat();
  placeOnBanana(player, rig, mine, dt, time);
  if (bananaHop && bananaHop.from) {
    bananaHop.t += dt; const u = Math.min(1, bananaHop.t / 0.45), to = player.position.clone();
    if (u < 1) { player.position.lerpVectors(bananaHop.from, to, smooth(0, 1, u)); player.position.y += Math.sin(u * Math.PI) * 0.5; } else bananaHop.from = null;
  }
  walk.heading = player.rotation.y; walk.moving = false; walk.speed = 0; walk.target = null;
  shadowBlob.position.set(player.position.x, -50, player.position.z);
}
// the rush you feel on the banana: faint streaks at the screen's edges, a slightly wider view, the tiniest shake
const speedFxEl = document.getElementById('speedFx');
let rushNow = 0;
function bananaRushFx(dt, time) {
  const mine = myBananaSeat(), want = mine ? clamp(bananaPose(bananaBoats[mine.boat], nowMs()).v / BAN.speed, 0, 1) : 0;
  rushNow = lerp(rushNow, want, Math.min(1, dt * 2.5)); // eased so it never jumps
  if (speedFxEl) speedFxEl.style.opacity = rushNow > 0.02 ? (rushNow * 0.55).toFixed(3) : '0';
  const fov = 40 + rushNow * 5 + (myRoom === null ? (walk.runNow || 0) * 2.5 : 0); // and a touch wider while running
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (rushNow > 0.05) { camera.position.x += Math.sin(time * 23) * 0.018 * rushNow; camera.position.y += Math.sin(time * 31 + 1) * 0.014 * rushNow; }
}

// ---- pink dolphins: two little groups circling out in the deep; each jumps every 20-40 s on a schedule worked out
// from the server's seed and the shared clock (so everyone sees the same leaps), now and then in pairs or spinning
let dolphinSeed = 12345;
const dolphins = (() => {
  const pink = mat('#f6a6c0', { flatShading: false }), belly = mat('#ffd6e2', { flatShading: false }), eyeW = mat('#ffffff', { flatShading: false }), eyeD = mat('#2b211c', { flatShading: false });
  const make = () => {
    const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
    const body = mesh(new THREE.SphereGeometry(0.42, 14, 10), pink, 0, 0, 0); body.scale.set(0.95, 0.9, 2.6); b.add(body);
    const bl = mesh(new THREE.SphereGeometry(0.36, 12, 8), belly, 0, -0.1, 0.15); bl.scale.set(0.85, 0.7, 2.2); b.add(bl);
    const snout = mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 8), pink, 0, -0.05, 1.2); snout.rotation.x = Math.PI / 2; b.add(snout);
    for (const s of [-1, 1]) { b.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeW, s * 0.27, 0.12, 0.72)); b.add(mesh(new THREE.SphereGeometry(0.065, 8, 6), eyeD, s * 0.31, 0.13, 0.77)); b.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), eyeW, s * 0.33, 0.17, 0.81)); }
    const fin = mesh(new THREE.ConeGeometry(0.16, 0.45, 6), pink, 0, 0.45, -0.1); fin.rotation.x = -0.5; fin.scale.z = 0.4; b.add(fin);
    for (const s of [-1, 1]) { const fl = mesh(new THREE.ConeGeometry(0.1, 0.4, 5), pink, s * 0.38, -0.15, 0.35); fl.rotation.set(0.6, 0, s * 1.2); fl.scale.z = 0.4; b.add(fl); }
    const tail = new THREE.Group(); tail.position.z = -1.05; b.add(tail);
    for (const s of [-1, 1]) { const fk = mesh(new THREE.ConeGeometry(0.16, 0.45, 5), pink, s * 0.2, 0, -0.15); fk.rotation.set(-Math.PI / 2, 0, s * 0.8); fk.scale.x = 0.35; tail.add(fk); }
    scene.add(g);
    return { g, b, tail };
  };
  const groups = LAYOUT.beach.dolphins, list = [];
  groups.forEach((grp, gi) => { for (let k = 0; k < 2; k++) list.push({ ...make(), gi, grp, a0: k * 0.9 + gi * 2, dir: gi ? 1 : -1, r: grp.r + k * 1.2, ph: k * 7 + gi * 13, splashed: 0 }); });
  // droplets: a small shared pool of glowing points
  const ND = 90, dpos = new Float32Array(ND * 3), dvel = new Float32Array(ND * 3), dlife = new Float32Array(ND), dcol = new Float32Array(ND * 3);
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dgeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
  const drops = new THREE.Points(dgeo, new THREE.PointsMaterial({ map: glowTex, size: 0.28, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); drops.frustumCulled = false; scene.add(drops);
  let dn = 0;
  const burst = (x, z) => { splash({ x, z }, 1.2); for (let k = 0; k < 14; k++) { const i = dn; dn = (dn + 1) % ND; dpos[i * 3] = x; dpos[i * 3 + 1] = 0.1; dpos[i * 3 + 2] = z; const a = Math.random() * TAU, s2 = 0.8 + Math.random() * 1.4; dvel[i * 3] = Math.cos(a) * s2; dvel[i * 3 + 1] = 2 + Math.random() * 2.5; dvel[i * 3 + 2] = Math.sin(a) * s2; dlife[i] = 0.9; } };
  const rnd = (i, k, salt) => { const v = Math.sin((dolphinSeed % 100000) * 0.013 + i * 127.1 + k * 311.7 + salt * 74.7) * 43758.5453; return v - Math.floor(v); };
  const JUMP = 1.8;
  // when dolphin i's current (or most recent) jump started, in seconds of shared time, and whether it spins
  const jumpOf = (i, t) => {
    const slot = 30, at = (k) => { const lead = i % 2 === 1 && rnd(i - 1, k, 9) < 0.35; return lead ? at2(i - 1, k) + 0.35 : at2(i, k); }; // in pairs now and then
    const at2 = (j, k) => list[j].ph + k * slot + rnd(j, k, 1) * 10; // every 20-40 s
    const k = Math.floor((t - list[i].ph) / slot);
    for (const kk of [k, k - 1]) { const s0 = at(kk); if (t >= s0 && t < s0 + JUMP) return { s0, spin: rnd(i, kk, 5) < 0.3, k: kk }; }
    return null;
  };
  return function update(dt, time) {
    const t = nowMs() / 1000, on = cur.lamp;
    list.forEach((d, i) => {
      const a = d.a0 + d.dir * t * 0.11, cx = d.grp.x + Math.cos(a) * d.r, cz = d.grp.z + Math.sin(a) * d.r;
      const yaw = Math.atan2(-Math.sin(a) * d.dir, Math.cos(a) * d.dir);
      const j = jumpOf(i, t);
      let y = -0.42 + Math.sin(t * 1.3 + i) * 0.06, pitch = Math.sin(t * 1.3 + i) * 0.08, roll = 0;
      if (j) { const u = (t - j.s0) / JUMP; y = -0.5 + 3.2 * 4 * u * (1 - u); pitch = -Math.atan(3.2 * 4 * (1 - 2 * u) / 6); if (j.spin) roll = u * TAU;
        if (d.splashed !== j.k * 2 + 1 && u < 0.2) { d.splashed = j.k * 2 + 1; burst(cx, cz); }
        if (d.splashed !== j.k * 2 + 2 && u > 0.85) { d.splashed = j.k * 2 + 2; burst(cx + Math.sin(yaw) * 2, cz + Math.cos(yaw) * 2); } }
      d.g.position.set(cx, y, cz); d.g.rotation.set(0, yaw, 0); d.b.rotation.set(pitch, 0, roll);
      d.tail.rotation.x = Math.sin(time * 6 + i) * 0.25;
    });
    for (let i = 0; i < ND; i++) {
      if (dlife[i] <= 0) { dcol[i * 3] = dcol[i * 3 + 1] = dcol[i * 3 + 2] = 0; continue; }
      dlife[i] -= dt; dvel[i * 3 + 1] -= 9 * dt;
      dpos[i * 3] += dvel[i * 3] * dt; dpos[i * 3 + 1] = Math.max(0, dpos[i * 3 + 1] + dvel[i * 3 + 1] * dt); dpos[i * 3 + 2] += dvel[i * 3 + 2] * dt;
      const l = Math.max(0, dlife[i] / 0.9), warm = 0.5 + on * 0.5;
      dcol[i * 3] = (0.75 + 0.25 * on) * l * warm; dcol[i * 3 + 1] = (0.9 - 0.15 * on) * l * warm; dcol[i * 3 + 2] = (1 - 0.3 * on) * l * warm; // sparkles turn golden in the evening
    }
    dgeo.attributes.position.needsUpdate = true; dgeo.attributes.color.needsUpdate = true;
  };
})();
// ---------------------------------------------------------------- beach volleyball
// The court (island.js VOLLEY): net along x, side 0 "Left" on the smaller-z half, side 1 "Right" on the other. The
// server runs the match (ball flights, rules, the practice bot, hit checks); here we draw it, place the buttons and
// send taps. On the solo island the same engine runs right here.
const VOL = VOLLEY, VSIDE = ['Left', 'Right'];
for (const c of colliders) if (c.oldNet) { c.x = c.z = 1e4; c.r = 0; } // the old net's spot is open sand now (kept in place in the list: others index it)
const volCourt = (() => {
  const g = new THREE.Group(); g.position.set(VOL.x, 0, VOL.z); scene.add(g);
  const gy = (lx, lz) => H(VOL.x + lx, VOL.z + lz);
  // boundary ropes pegged into the sand, and a line under the net
  const rope = mat('#fff4dc'), peg = M.woodDark, W = VOL.hw, L = VOL.hl;
  const line = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), m = mesh(new THREE.BoxGeometry(0.07, 0.035, len), rope, (x0 + x1) / 2, gy((x0 + x1) / 2, (z0 + z1) / 2) + 0.03, (z0 + z1) / 2); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); m.castShadow = false; g.add(m); };
  line(-W, -L, W, -L); line(-W, L, W, L); line(-W, -L, -W, L); line(W, -L, W, L); line(-W, 0, W, 0);
  for (const [x, z] of [[-W, -L], [W, -L], [-W, L], [W, L], [-W, 0], [W, 0]]) g.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 5), peg, x, gy(x, z) + 0.06, z));
  // the posts and a taut net with a white band on top
  const PX = W + 0.35, top = VOL.net;
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, top + 0.35, 8), mat('#f29ab8'), s * PX, gy(s * PX, 0) + (top + 0.35) / 2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), mat('#f6d55c'), s * PX, gy(s * PX, 0) + top + 0.38, 0));
    const guy = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 3), rope, s * (PX + 0.4), gy(s * PX, 0) + top / 2, 0); guy.rotation.z = s * 0.55; g.add(guy);
  }
  const netMat = new THREE.MeshBasicMaterial({ color: 0xfff8ea, wireframe: true, transparent: true, opacity: 0.85 });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(PX * 2, 0.85, 22, 4), netMat); net.position.set(0, gy(0, 0) + top - 0.43, 0); g.add(net);
  g.add(mesh(new THREE.BoxGeometry(PX * 2, 0.08, 0.04), M.white, 0, gy(0, 0) + top, 0));
  g.add(mesh(new THREE.BoxGeometry(PX * 2, 0.03, 0.03), M.white, 0, gy(0, 0) + top - 0.86, 0));
  // you walk round the court, not through the net or its posts
  for (let x = -PX; x <= PX + 0.01; x += 0.45) colliders.push({ x: VOL.x + x, z: VOL.z, r: 0.22, nonav: true });
  // two little score signs on posts, one at each side's corner, and the big board over the net
  const signTex = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, t }; };
  const signs = [0, 1].map((side) => {
    const s = side ? 1 : -1, x = -(W + 0.9), z = s * (L - 0.6), st = new THREE.Group(); st.position.set(x, gy(x, z), z); g.add(st);
    st.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), M.wood, 0, 0.75, 0));
    st.add(mesh(new THREE.BoxGeometry(0.72, 0.6, 0.06), mat(side ? '#8fc0f0' : '#f29ab8'), 0, 1.55, 0));
    const tx = signTex(128, 96), face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshBasicMaterial({ map: tx.t, transparent: true }));
    face.position.set(0, 1.55, 0.035); face.rotation.y = Math.PI / 2; st.rotation.y = -Math.PI / 2; st.add(face);
    const back = face.clone(); back.position.z = -0.035; back.rotation.y = -Math.PI / 2 + Math.PI; st.add(back);
    colliders.push({ x: VOL.x + x, z: VOL.z + z, r: 0.2, nonav: true });
    return tx;
  });
  const board = signTex(512, 200), boardSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: board.t, transparent: true, depthWrite: false }));
  boardSpr.scale.set(3.4, 1.33, 1); boardSpr.position.set(0, gy(0, 0) + top + 1.35, 0); g.add(boardSpr);
  return { g, signs, board, boardSpr };
})();
// a round beach ball in pastel panels, and its little shadow
const volBall = (() => {
  const geo = new THREE.SphereGeometry(VOL.r, 16, 12), cols = ['#f29ab8', '#fffaf0', '#8fd0f0', '#fffaf0', '#f6d55c', '#fffaf0'].map((c) => new THREE.Color(c)), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = Math.floor(((a + Math.PI) / TAU) * 6) % 6, c = Math.abs(pos.getY(i)) > VOL.r * 0.88 ? new THREE.Color('#fffaf0') : cols[k]; col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true })); scene.add(m);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(VOL.r * 1.1, 12), new THREE.MeshBasicMaterial({ color: 0x5a4632, transparent: true, opacity: 0.28, depthWrite: false })); sh.rotation.x = -Math.PI / 2; scene.add(sh);
  return { m, sh };
})();
// Bonbon, the practice bot: a little round sweetie with a visor (only out on the court while someone practises)
const volBot = (() => {
  const n = makeTownNpc({ name: 'Bonbon (bot)', tag: '#9be0c0', skin: '#ffe0f0', hair: '#9be0c0', top: '#fffaf0', bottom: '#9be0c0', shoes: '#f29ab8' });
  n.head.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 14, 1, false, -1.2, 2.4), n.soft('#f6d55c'), 0, 0.12, 0.05));
  const ant = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4), n.soft('#8a5a36'), 0, 0.42, 0); n.head.add(ant);
  n.head.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), n.soft('#f29ab8'), 0, 0.56, 0));
  const smile = mesh(new THREE.TorusGeometry(0.07, 0.016, 4, 10, Math.PI), n.soft('#b0503a'), 0, -0.1, 0.31); smile.rotation.z = Math.PI; n.head.add(smile);
  n.g.visible = false; scene.add(n.g);
  return n;
})();
// ---- state (the server's, or the local engine's on the solo island)
let volState = { st: 'idle', sides: [null, null], names: ['', ''], score: [0, 0], serve: 0, ball: { segs: [], rest: [VOL.x, VOL.r, VOL.z - 1.2] }, land: null, last: -1, hit: null, until: 0, winner: -1, bot: null, join: [null, null], seq: -1 };
let volLocal = null;
const volMine = () => { const i = volState.sides.indexOf(net.id); return i >= 0 ? i : null; };
const volLive = () => ['count', 'serve', 'rally', 'point'].includes(volState.st);
let volWas = null, volLastHitAt = 0, volLastSt = '', volLanded = 0, volAim = null, volAnim = new Map(), volOverShown = 0, volCountShown = -1;
function volleySend(m) {
  if (m.t === 'volleyJoin' && pianoBlocked()) return;
  if (net.online) { net.send(m); return; }
  if (!volLocal) volLocal = volleyEngine({ now: nowMs, emit: () => { volState = JSON.parse(JSON.stringify(volLocal.view())); volChanged(); }, posOf: (id) => (id === net.id ? { x: player.position.x, z: player.position.z } : null) });
  const why = m.t === 'volleyJoin' ? volLocal.join(net.id, m.side, net.myName || 'You') : m.t === 'volleyPractice' ? volLocal.practice(net.id) : m.t === 'volleyAgain' ? volLocal.again(net.id) : m.t === 'volleyLeave' ? volLocal.leave(net.id) : m.t === 'volleyHit' ? volLocal.hit(net.id, m.at, m.tx, m.tz) : null;
  if (why) volResult(why);
}
function volResult(why) {
  const msg = { far: 'Walk over to the court first', taken: 'Someone is already playing on that side', busy: "You're already on the court", seat: 'Stand up first', bike: 'Park the bicycle first', balloon: 'Get out of the balloon first', banana: 'Hop off the banana boat first', reach: 'Too far from the ball!', turn: 'Not your touch yet', late: 'Too late!' }[why];
  if (msg) toast(msg);
}
function applyVolley(m) { const { t, now, ...rest } = m; volState = rest; volChanged(); }
// someone joined, left, scored, hit...: buttons, walking back to your side, the camera, banners
function volChanged() {
  const mine = volMine();
  if (mine !== volWas) {
    document.body.classList.toggle('volleying', mine !== null); toolSlot.visible = mine === null;
    if (mine !== null) {
      if (mySeat !== null) standUp(); if (fishing) endFishing(); if (dlg.npc) endTalk();
      const st = volleyStart(mine); walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.route = null; walk.deck = null;
      walk.target = new THREE.Vector3(st.x, 0, st.z); volAim = null;
      toast(`You're on the ${VSIDE[mine].toLowerCase()} side. Tap your half to move, the other half to aim`);
    } else if (volWas !== null) toast('You left the court');
    volWas = mine;
  }
  if (volState.st !== volLastSt) {
    const prev = volLastSt; volLastSt = volState.st;
    if (volState.st === 'count' && mine !== null) { // frame the court from behind your side
      orbit.yaw = mine ? 0 : Math.PI; orbit.pitch = THREE.MathUtils.degToRad(42); orbit.vYaw = orbit.vPitch = 0; setZoomTarget(ZOOM_DEFAULT * 1.15);
      const st = volleyStart(mine); walk.target = new THREE.Vector3(st.x, 0, st.z);
    }
    if ((volState.st === 'over' || (volState.st === 'wait' && prev === 'over')) && mine !== null) { const st = volleyStart(mine); walk.target = new THREE.Vector3(st.x, 0, st.z); }
  }
  if (volState.hit && volState.hit.at !== volLastHitAt) { // a hit: that side's player jumps, and a word for a great one
    volLastHitAt = volState.hit.at;
    const h = volState.hit, b = volleyBallAt(volState.ball, h.at);
    volAnim.set(h.side, { t0: performance.now(), kind: h.q === 'great' && b[1] > 1.4 ? 'spike' : b[1] < 0.9 ? 'dive' : 'bump' });
    volFloat(b, h.q === 'great' ? 'Great!' : h.q === 'weak' ? 'Oops!' : 'Nice!', h.q);
    if (b[1] < 0.9) sandPuff(b[0], b[2]);
  }
}
// ---- little effects: floating words, sand puffs, confetti
const volFloats = [];
function volFloat(at, text, q) {
  const el = document.createElement('div'); el.className = 'vol-float' + (q === 'great' ? ' great' : q === 'weak' ? ' weak' : ''); el.textContent = text; seatLayer.appendChild(el);
  volFloats.push({ el, at: new THREE.Vector3(at[0], at[1] + 0.6, at[2]), t: 0 });
}
const sandPuffGeo = new THREE.SphereGeometry(0.09, 6, 4), sandPuffMat = new THREE.MeshBasicMaterial({ color: 0xf0dcae, transparent: true, opacity: 0.8, depthWrite: false });
function sandPuff(x, z) {
  const y = groundY(x, z) + 0.05, bits = [];
  for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(sandPuffGeo, sandPuffMat.clone()); m.position.set(x, y, z); const a = (k / 9) * TAU; bits.push({ m, vx: Math.cos(a) * (0.8 + Math.random()), vz: Math.sin(a) * (0.8 + Math.random()), vy: 1.2 + Math.random() }); scene.add(m); }
  let t = 0;
  transients.push((dt) => {
    t += dt;
    for (const b of bits) { b.vy -= 6 * dt; b.m.position.x += b.vx * dt; b.m.position.z += b.vz * dt; b.m.position.y = Math.max(y, b.m.position.y + b.vy * dt); b.m.scale.setScalar(1 + t * 2); b.m.material.opacity = Math.max(0, 0.8 - t * 1.3); }
    if (t > 0.65) { for (const b of bits) { scene.remove(b.m); b.m.material.dispose(); } return false; }
    return true;
  });
}
const confetti = (() => {
  const N = 220, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), col = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
  const pal = ['#f29ab8', '#8fd0f0', '#f6d55c', '#9be0c0', '#c9a6ff', '#ffb37a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  return {
    burst(x, y, z) { for (let i = 0; i < N; i++) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; const a = Math.random() * TAU, s = 1 + Math.random() * 2.5; vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = 3 + Math.random() * 4; vel[i * 3 + 2] = Math.sin(a) * s; const c = pal[i % pal.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; life[i] = 2.5 + Math.random(); } geo.attributes.color.needsUpdate = true; },
    update(dt) { let any = false; for (let i = 0; i < N; i++) { if (life[i] <= 0) continue; any = true; life[i] -= dt; vel[i * 3 + 1] -= 5 * dt; vel[i * 3] *= 1 - dt * 1.5; vel[i * 3 + 2] *= 1 - dt * 1.5; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt; if (life[i] <= 0) pos[i * 3 + 1] = -50; } if (any) geo.attributes.position.needsUpdate = true; },
  };
})();
// ---- the floating circles: Play at each side, Practice, Play again, Hit!; and the "Waiting for a player" bubble
const PLAY_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="14" fill="#fffaf0" stroke="#8a5a36" stroke-width="2.4"/><path d="M12 19 C20 22 28 22 36 18 M14 31 C21 27 29 27 35 31 M24 10 C18 18 18 30 24 38" fill="none" stroke="#f29ab8" stroke-width="2.6"/></svg>';
const BOT_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="26" r="12" fill="#ffe0f0" stroke="#8a5a36" stroke-width="2.2"/><path d="M14 22 Q24 12 34 22" fill="#f6d55c" stroke="#8a5a36" stroke-width="2"/><circle cx="20" cy="27" r="2" fill="#2b211c"/><circle cx="28" cy="27" r="2" fill="#2b211c"/><path d="M24 14 V7" stroke="#8a5a36" stroke-width="2"/><circle cx="24" cy="6" r="2.6" fill="#f29ab8"/></svg>';
const AGAIN_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M35 18 A12 12 0 1 0 36 30" fill="none" stroke="#3f8f6a" stroke-width="4" stroke-linecap="round"/><path d="M36 9 V19 H26" fill="none" stroke="#3f8f6a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HIT_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="#ffd36a" stroke="#b0583a" stroke-width="2.6"/><text x="24" y="30" text-anchor="middle" font-size="15" font-weight="bold" fill="#7a3a10" font-family="sans-serif">Hit!</text></svg>';
const volPlayBtns = [0, 1].map((side) => { const b = makeDoorBubble(PLAY_ICON, `Play on the ${VSIDE[side].toLowerCase()} side`, () => volJoinTap(side)); b.btn.classList.add('volley-bubble'); return b; });
const volPracticeBtn = makeDoorBubble(BOT_ICON, 'Practice against Bonbon the bot', () => volleySend({ t: 'volleyPractice' })); volPracticeBtn.btn.classList.add('volley-bubble');
const volAgainBtn = makeDoorBubble(AGAIN_ICON, 'Play again', () => volleySend({ t: 'volleyAgain' })); volAgainBtn.btn.classList.add('volley-bubble');
const volHitBtn = makeDoorBubble(HIT_ICON, 'Hit!', () => volHitTap()); volHitBtn.btn.classList.add('volley-bubble', 'hit-bubble');
const volWaitEls = [0, 1].map(() => { const el = document.createElement('div'); el.className = 'vol-label'; el.textContent = 'Waiting for a player'; seatLayer.appendChild(el); return el; });
function volJoinTap(side) {
  if (volMine() !== null || bikeRide || myBalloonSpot() !== null || myBananaSeat() || myRide) return;
  if (mySeat !== null) standUp();
  volleySend({ t: 'volleyJoin', side });
}
document.getElementById('volleyOffBtn').addEventListener('click', () => { if (volMine() !== null) { if (volLive() && volState.sides[1 - volMine()] !== 'bot' && volState.sides[1 - volMine()] !== null) toast('You left the match'); volleySend({ t: 'volleyLeave' }); } });
// can the ball be hit right now (your serve, or the ball coming down within reach on your side)?
function volCanHit() {
  const mine = volMine(); if (mine === null) return false;
  if (volState.st === 'serve') return volState.serve === mine;
  if (volState.st !== 'rally' || volState.last === mine || !volState.land) return false;
  const now = nowMs(), b = volleyBallAt(volState.ball, now);
  return now < volState.land.t - 30 && b[1] > 0.3 && b[1] < 3.4 && (b[2] - VOL.z) * (mine ? 1 : -1) > -0.6 && Math.hypot(b[0] - player.position.x, b[2] - player.position.z) <= VOL.reach;
}
function volHitTap() {
  const mine = volMine(); if (mine === null || !volCanHit()) return;
  const m = { t: 'volleyHit', at: Math.round(nowMs()) };
  if (volAim) { m.tx = +volAim.x.toFixed(2); m.tz = +volAim.z.toFixed(2); }
  volleySend(m);
}
// a tap on the sand while you play: your half walks you there (never across the net), the other half sets your aim
function volleyTap() {
  const hits = raycaster.intersectObjects([terrain], false); if (!hits.length) return;
  const p = hits[0].point, mine = volMine();
  if (volleyHalfOf(p.z) !== mine && Math.abs(p.x - VOL.x) < VOL.hw + 1 && Math.abs(p.z - VOL.z) < VOL.hl + 1) { volAim = { x: p.x, z: p.z }; showMarker(p.x, p.z); return; }
  const c = volleyClamp(mine, p.x, p.z); walk.target = new THREE.Vector3(c.x, 0, c.z); walk.item = null; walk.tree = null; walk.route = null; showMarker(c.x, c.z);
}
// ---- every frame
const _volV = new THREE.Vector3();
let volBoardKey = '', volBotSeen = null;
function volDrawBoard() {
  const S = volState, now = nowMs(), cd = S.st === 'count' ? Math.max(1, Math.ceil((S.until - now) / 1000)) : 0;
  const mp = volLive() && S.st !== 'count' && S.winner < 0 ? [0, 1].filter((k) => volleyMatchPoint(S.score, k)) : [];
  const sub = S.st === 'count' ? `${cd}` : S.st === 'over' ? `${VSIDE[S.winner]} wins!` : mp.length ? 'Match point' : S.st === 'serve' ? `${S.names[S.serve] || VSIDE[S.serve]} to serve` : S.st === 'wait' ? (S.sides[0] && S.sides[1] ? 'Play again?' : 'Waiting for a player') : S.st === 'idle' ? 'Beach volleyball' : '';
  const key = [S.st, S.score.join(), S.names.join(), sub].join('|');
  if (key !== volBoardKey) {
    volBoardKey = key;
    const c = volCourt.board.c, x = c.getContext('2d');
    x.clearRect(0, 0, 512, 200);
    x.fillStyle = 'rgba(255, 250, 238, 0.92)'; if (x.beginPath) { x.beginPath(); if (x.roundRect) x.roundRect(8, 8, 496, 184, 34); else x.rect(8, 8, 496, 184); x.fill(); x.lineWidth = 6; x.strokeStyle = '#cf9e6c'; x.stroke(); }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 26px "Trebuchet MS", sans-serif';
    x.fillStyle = '#d0608a'; x.fillText((S.names[0] || 'Left').slice(0, 12), 110, 48);
    x.fillStyle = '#4a8fc8'; x.fillText((S.names[1] || 'Right').slice(0, 12), 402, 48);
    x.font = 'bold 76px "Trebuchet MS", sans-serif'; x.fillStyle = '#5a4632'; x.fillText(`${S.score[0]} : ${S.score[1]}`, 256, 102);
    x.font = 'bold 28px "Trebuchet MS", sans-serif'; x.fillStyle = mp.length ? '#e0584a' : '#8a5a36'; x.fillText(sub, 256, 160);
    volCourt.board.t.needsUpdate = true;
    volCourt.signs.forEach((sg, k) => { const y = sg.c.getContext('2d'); y.clearRect(0, 0, 128, 96); y.fillStyle = '#fffaf0'; y.fillRect(0, 0, 128, 96); y.textAlign = 'center'; y.textBaseline = 'middle'; y.font = 'bold 22px sans-serif'; y.fillStyle = k ? '#4a8fc8' : '#d0608a'; y.fillText(VSIDE[k], 64, 22); y.font = 'bold 50px sans-serif'; y.fillStyle = '#5a4632'; y.fillText(String(S.score[k]), 64, 64); sg.t.needsUpdate = true; });
  }
}
function volCharOf(side) { // the character playing a side (you, another player or the bot)
  const id = volState.sides[side];
  if (id === null) return null;
  if (id === 'bot') return { player: volBot.g, rig: null, npc: volBot };
  if (id === net.id) return { player, rig };
  const r = remotes.get(id); return r ? { player: r.player, rig: r.rig } : null;
}
function updateVolley(dt, time) {
  if (volLocal) volLocal.tick();
  const S = volState, now = nowMs(), mine = volMine();
  // the ball: held over the server's head, flying, or resting on the sand
  let bp;
  if (S.ball && S.ball.held !== undefined && S.st === 'serve') { const c = volCharOf(S.ball.held); bp = c ? [c.player.position.x, c.player.position.y + 2.05 + Math.sin(time * 4) * 0.06, c.player.position.z] : S.ball.rest; }
  else bp = volleyBallAt(S.ball, now);
  const gyB = groundY(bp[0], bp[2]);
  volBall.m.position.set(bp[0], Math.max(gyB + VOL.r, bp[1] + gyB), bp[2]);
  if (S.st === 'rally' || S.st === 'point') { volBall.m.rotation.x += dt * 6; volBall.m.rotation.z += dt * 3; }
  volBall.sh.position.set(bp[0], gyB + 0.025, bp[2]); volBall.sh.scale.setScalar(Math.max(0.4, 1.2 - bp[1] * 0.18));
  if (S.land && S.st !== 'serve' && now >= S.land.t && volLanded !== S.land.t) { volLanded = S.land.t; sandPuff(S.land.x, S.land.z); if (S.st === 'point' || S.st === 'rally') volFloat([S.land.x, 0.3, S.land.z], S.out ? 'Out!' : 'Point!', ''); }
  // the bot
  volBot.g.visible = !!S.bot;
  if (S.bot) {
    if (!volBotSeen) { volBot.g.position.set(S.bot.x, groundY(S.bot.x, S.bot.z), S.bot.z); volBotSeen = true; }
    const p = volBot.g.position, dx = S.bot.x - p.x, dz = S.bot.z - p.z;
    p.x += dx * Math.min(1, dt * 10); p.z += dz * Math.min(1, dt * 10); p.y = groundY(p.x, p.z);
    const face = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : Math.atan2(bp[0] - p.x, bp[2] - p.z);
    volBot.g.rotation.y = lerpAngle(volBot.g.rotation.y, face, Math.min(1, dt * 8));
    const mv = Math.hypot(dx, dz) > 0.03; volBot.legs.forEach((l, k) => { l.rotation.x = mv ? Math.sin(time * 14 + k * Math.PI) * 0.7 : 0; });
    volBot.armL.rotation.x = volBot.armR.rotation.x = -0.3;
  } else volBotSeen = null;
  // your half only, a quicker run, and facing the ball
  if (mine !== null) {
    const c = volleyClamp(mine, player.position.x, player.position.z); player.position.x = c.x; player.position.z = c.z;
    if (walk.target) { const t = volleyClamp(mine, walk.target.x, walk.target.z); walk.target.x = t.x; walk.target.z = t.z; }
    if (!walk.target && (S.st === 'rally' || S.st === 'serve')) walk.heading = lerpAngle(walk.heading, Math.atan2(bp[0] - player.position.x, bp[2] - player.position.z), Math.min(1, dt * 6));
  }
  // jumps, spikes and dives (and the winner's happy hop)
  for (const side of [0, 1]) {
    const c = volCharOf(side), a = volAnim.get(side); if (!c) continue;
    let hop = 0;
    if (a) {
      const u = (performance.now() - a.t0) / 1000;
      if (u > 0.7) volAnim.delete(side);
      else {
        const k = Math.sin(Math.min(1, u / 0.6) * Math.PI);
        const R = c.rig || (c.npc && { armL: c.npc.armL, armR: c.npc.armR, body: c.npc.body });
        if (a.kind === 'dive') { c.player.rotation.x = 0.9 * k; hop = 0.1 * k; if (R) R.armL.rotation.x = R.armR.rotation.x = -1.6 * k; }
        else { hop = (a.kind === 'spike' ? 0.75 : 0.45) * k; if (R) { R.armR.rotation.x = -2.9 * k; R.armL.rotation.x = (a.kind === 'spike' ? -1.2 : -2.9) * k; } }
      }
    } else if (c.player.rotation.x && !(side === mine && isSwimming())) c.player.rotation.x = 0;
    if (S.st === 'over' && S.winner === side) hop = Math.abs(Math.sin(time * 6)) * 0.35;
    c.player.position.y = groundY(c.player.position.x, c.player.position.z) + hop; // on the sand (plus any jump)
  }
  // banners: the countdown, "Left wins!", confetti over the winner
  const close = Math.hypot(player.position.x - VOL.x, player.position.z - VOL.z) < 26 && myRoom === null;
  if (S.st === 'count' && close) { const n = Math.ceil((S.until - now) / 1000); if (n !== volCountShown) { volCountShown = n; volBanner(n >= 1 && n <= 3 ? `${n}` : 'Go!'); } }
  else if (S.st === 'serve' && volCountShown > 0) { volCountShown = -1; if (close) volBanner('Go!'); }
  if (S.st === 'over' && S.winner >= 0 && volOverShown !== S.until) {
    volOverShown = S.until;
    if (close) volBanner(`${VSIDE[S.winner]} wins!${S.why === 'left' ? ' (the other player left)' : ''}`, 3500);
    const c = volCharOf(S.winner), at = c ? c.player.position : new THREE.Vector3(VOL.x, 0, VOL.z);
    confetti.burst(at.x, at.y + 2.4, at.z);
  }
  confetti.update(dt);
  volDrawBoard();
  // the floating buttons
  const freeToJoin = mine === null && myRoom === null && mySeat === null && !bikeRide && myBalloonSpot() === null && !myBananaSeat() && !myRide && !isSwimming();
  [0, 1].forEach((side) => {
    const s = side ? 1 : -1, at = _volV.set(VOL.x + (side ? 1.2 : -1.2) * 0, 0, VOL.z + s * (VOL.hl + 0.9)); at.y = groundY(at.x, at.z) + 0.9;
    const free = S.sides[side] === null || (S.sides[side] === 'bot' && !S.join[side]);
    placeBubble(volPlayBtns[side], at, freeToJoin && free && Math.hypot(player.position.x - at.x, player.position.z - at.z) < 3.2);
  });
  placeBubble(volPracticeBtn, _volV.set(player.position.x + 0.9, player.position.y + 2.3, player.position.z), mine !== null && S.st === 'wait' && S.sides[1 - mine] === null);
  placeBubble(volAgainBtn, _volV.set(player.position.x - 0.9, player.position.y + 2.3, player.position.z), mine !== null && S.st === 'wait' && S.sides[1 - mine] !== null);
  const canHit = volCanHit();
  placeBubble(volHitBtn, _volV.set(player.position.x + 0.7, player.position.y + 1.4, player.position.z), canHit);
  // "Waiting for a player" over a side that waits for an opponent
  [0, 1].forEach((side) => {
    const el = volWaitEls[side], c = volCharOf(side), show = S.st === 'wait' && c && S.sides[1 - side] === null && myRoom === null;
    if (!show) { el.classList.remove('show'); return; }
    _volV.set(c.player.position.x, c.player.position.y + 2.7, c.player.position.z).project(camera);
    if (_volV.z > 1) { el.classList.remove('show'); return; }
    el.classList.add('show'); el.style.transform = `translate(${((_volV.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px, ${((-_volV.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  });
  for (let i = volFloats.length - 1; i >= 0; i--) {
    const f = volFloats[i]; f.t += dt; f.at.y += dt * 0.8;
    _volV.copy(f.at).project(camera);
    f.el.style.transform = `translate(${((_volV.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px, ${((-_volV.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.1));
    if (f.t > 1.1) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); volFloats.splice(i, 1); }
  }
  // watching from the sand
  const watching = mine === null && volLive() && myRoom === null && Math.hypot(player.position.x - VOL.x, player.position.z - VOL.z) < 13;
  document.body.classList.toggle('volley-watching', watching);
}
const volBannerEl = document.getElementById('volleyBanner');
let volBannerT = 0;
function volBanner(text, ms = 900) { if (!volBannerEl) return; volBannerEl.textContent = text; volBannerEl.classList.add('show'); clearTimeout(volBannerT); volBannerT = setTimeout(() => volBannerEl.classList.remove('show'), ms); }
// ---------------------------------------------------------------- the home pond
// A soft kidney-shaped pond (pondR in island.js) on the lawn between the town and home 1: clear teal water (light at
// the edges, deeper blue in the middle) with ripples, sparkles and the sky's colour in it; a sandy, muddy bank with
// pebbles; reeds, cattails, lily pads and lilies; wildflowers and grass round it; a cherry blossom tree; dragonflies
// and butterflies by day, fireflies at dusk and night; koi and ducks that swim on a schedule every player shares
// (worked out from the server's pond seed and the shared clock); and a little wooden dock with a lantern.
let pondSeed = 4242;
const pond = (() => {
  const P = LAYOUT.pond, PX = P.x, PZ = P.z, at = (th, r) => ({ x: PX + Math.cos(th) * r, z: PZ + Math.sin(th) * r });
  const D = POND_DOCK, dYAt = (u) => lerp(D.ya, D.yb, clamp(u, 0, 1)), dockDir = Math.atan2(D.b[0] - D.a[0], D.b[1] - D.a[1]);
  const dockTh = Math.atan2(D.b[1] - PZ, D.b[0] - PX), riverTh = Math.atan2(LAYOUT.river.pts[0][1] - PZ, LAYOUT.river.pts[0][0] - PX);
  const pathEnd = LAYOUT.pondPath[LAYOUT.pondPath.length - 1], pathTh = Math.atan2(pathEnd[1] - PZ, pathEnd[0] - PX);
  // the real shoreline (where the lawn meets the water), measured once all round: everything here follows it
  const SHN = 72, SH = Array.from({ length: SHN }, (_, k) => { const th = (k / SHN) * TAU; for (let r = 0.5; r < 4.2; r += 0.05) if (H(PX + Math.cos(th) * r, PZ + Math.sin(th) * r) > 0.03) return Math.min(r, 3.6); return 3.6; });
  const shore = (th) => { const u = ((th / TAU) % 1 + 1) % 1 * SHN, k = Math.floor(u) % SHN; return lerp(SH[k], SH[(k + 1) % SHN], u - Math.floor(u)); };
  const angGap = (a, b) => Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);
  const keepClear = (th) => angGap(th, dockTh) < 0.45 || angGap(th, riverTh) < 0.5 || angGap(th, pathTh) < 0.35; // the dock, the river mouth, the path's end
  let sd = 917; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }; // its own random numbers (the island's stay untouched)
  // ---- the water: rings out from the middle, stretched to the kidney outline; colour, ripples and sparkles in a tiny shader
  const SEG = 64, RINGS = 6, wp = [], we = [], wi = [];
  wp.push(0, 0, 0); we.push(0);
  for (let k = 1; k <= RINGS; k++) for (let i = 0; i < SEG; i++) { const th = (i / SEG) * TAU, e = k / RINGS, r = (shore(th) + 0.25) * e; wp.push(Math.cos(th) * r, 0, Math.sin(th) * r); we.push(e); }
  for (let i = 0; i < SEG; i++) wi.push(0, 1 + ((i + 1) % SEG), 1 + i);
  for (let k = 1; k < RINGS; k++) for (let i = 0; i < SEG; i++) { const a = 1 + (k - 1) * SEG + i, b = 1 + (k - 1) * SEG + ((i + 1) % SEG), c = a + SEG, d = b + SEG; wi.push(a, b, c, b, d, c); }
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wgeo.setAttribute('edge', new THREE.Float32BufferAttribute(we, 1)); wgeo.setIndex(wi);
  const lanternAt = new THREE.Vector3(D.b[0], D.yb + 1.25, D.b[1]);
  const wmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uShallow: { value: new THREE.Color('#8fe6d8') }, uDeep: { value: new THREE.Color('#2f9cc8') }, uSky: { value: new THREE.Color('#bfe6ff') }, uDay: { value: 1 }, uLamp: { value: 0 }, uLampAt: { value: new THREE.Vector2(D.b[0] - PX, D.b[1] - PZ) } },
    vertexShader: 'attribute float edge; varying float vE; varying vec2 vP; void main() { vE = edge; vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uDay, uLamp; uniform vec3 uShallow, uDeep, uSky; uniform vec2 uLampAt; varying float vE; varying vec2 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 c = mix(uDeep, uShallow, smoothstep(0.25, 0.95, vE));
        float rip = sin(vP.x * 3.1 + uTime * 1.3) * sin(vP.y * 2.7 - uTime * 1.1) + 0.5 * sin(length(vP) * 5.0 - uTime * 1.6);
        c += vec3(0.06) * rip * uDay;
        c = mix(c, uSky, 0.28); // the sky's colour on the water
        vec2 g = floor(vP * 6.0 + vec2(uTime * 0.4, uTime * 0.25)); float sp = h(g); float tw = 0.5 + 0.5 * sin(uTime * 4.0 + sp * 30.0);
        c += vec3(1.0) * step(0.965, sp) * tw * (0.25 + 0.55 * uDay); // little sparkles
        c *= 0.45 + 0.55 * uDay;
        float ld = length(vP - uLampAt); c += vec3(1.0, 0.72, 0.38) * uLamp * 0.75 * exp(-ld * ld * 0.55); // the lantern's glow
        gl_FragColor = vec4(c, mix(0.8, 0.6, smoothstep(0.75, 1.0, vE)));
      }`,
  });
  const water = new THREE.Mesh(wgeo, wmat); water.position.set(PX, 0.075, PZ); water.renderOrder = 2; scene.add(water);
  // ---- the bank: a strip of sand and mud draped over the slope, with pebbles and a few small rocks
  const bp = [], bc = [], bi = [], sand = new THREE.Color('#e6cf9c'), mud = new THREE.Color('#a9875c');
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * TAU, r = shore(th), wob = Math.sin(th * 5) * 0.12;
    for (const [rr2, col] of [[r - 0.35, mud], [r + 0.25, sand], [r + 0.85 + wob, sand]]) { const q = at(th, rr2); bp.push(q.x, Math.max(H(q.x, q.z), 0.02) + 0.025, q.z); bc.push(col.r, col.g, col.b); }
  }
  for (let i = 0; i < SEG; i++) for (let k = 0; k < 2; k++) { const a = i * 3 + k, b = a + 3; bi.push(a, b, a + 1, b, b + 1, a + 1); }
  const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bgeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); bgeo.setIndex(bi); bgeo.computeVertexNormals();
  const bank = new THREE.Mesh(bgeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, transparent: true, opacity: 0.92, depthWrite: false })); bank.receiveShadow = true; bank.renderOrder = 1; scene.add(bank);
  const pebM = [mat('#c9c2b4'), mat('#a8a39a'), mat('#d9cdb4')];
  for (let i = 0; i < 46; i++) { const th = rnd() * TAU; if (angGap(th, dockTh) < 0.25) continue; const q = at(th, shore(th) + 0.15 + rnd() * 0.6), s = 0.05 + rnd() * 0.09, pb = mesh(new THREE.DodecahedronGeometry(s, 0), pebM[i % 3], q.x, Math.max(H(q.x, q.z), 0.02) + s * 0.4, q.z); pb.scale.y = 0.55; pb.castShadow = false; scene.add(pb); }
  for (let i = 0; i < 5; i++) { const th = rnd() * TAU; if (keepClear(th)) continue; const q = at(th, shore(th) + 0.55), s = 0.18 + rnd() * 0.12, rk = mesh(new THREE.DodecahedronGeometry(s, 0), mat('#b9b2a6'), q.x, Math.max(H(q.x, q.z), 0) + s * 0.35, q.z); rk.scale.y = 0.7; rk.rotation.y = rnd() * TAU; scene.add(rk); }
  // ---- reeds and cattails along the edge (they sway), lily pads and lilies on the water
  const swayers = [], reedM = mat('#7fae4a'), reedD = mat('#5f8f3a'), cat = mat('#7a4e2c');
  for (let i = 0; i < 22; i++) {
    const th = (i / 22) * TAU + rnd() * 0.2; if (keepClear(th)) continue;
    const q = at(th, shore(th) + (rnd() - 0.4) * 0.5), g = new THREE.Group(); g.position.set(q.x, Math.max(H(q.x, q.z), -0.3), q.z); scene.add(g);
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const h2 = 0.7 + rnd() * 0.7, lx = (rnd() - 0.5) * 0.35, lz = (rnd() - 0.5) * 0.35, blade = mesh(new THREE.ConeGeometry(0.035, h2, 3), k % 2 ? reedM : reedD, lx, h2 / 2, lz); blade.rotation.set((rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3); blade.castShadow = false; g.add(blade);
      if (k === 0 || rnd() < 0.3) { const ch = h2 + 0.15; g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, ch, 3), reedD, lx + 0.05, ch / 2, lz)); g.add(mesh(new THREE.CapsuleGeometry(0.045, 0.16, 2, 5), cat, lx + 0.05, ch - 0.05, lz)); }
    }
    swayers.push({ g, ph: rnd() * TAU });
  }
  const lilyM = mat('#6cbf5a'), lilyD = mat('#58a64a'), pads = [];
  for (let i = 0; i < 9; i++) {
    const th = rnd() * TAU; if (angGap(th, dockTh) < 0.5) { i--; continue; }
    const q = at(th, shore(th) * (0.35 + rnd() * 0.45)), s = 0.24 + rnd() * 0.14, g = new THREE.Group(); g.position.set(q.x, 0.085, q.z); g.rotation.y = rnd() * TAU; scene.add(g);
    const pad = mesh(new THREE.CircleGeometry(s, 10, 0.35, TAU - 0.7), i % 3 ? lilyM : lilyD); pad.rotation.x = -Math.PI / 2; pad.castShadow = false; g.add(pad);
    if (i % 2 === 0) { // a pink or white lily
      const fl = new THREE.Group(); fl.position.set(s * 0.15, 0.02, 0); g.add(fl);
      const pc = mat(i % 4 === 0 ? '#ffffff' : '#ffb3c8');
      for (let k = 0; k < 6; k++) { const pt = mesh(new THREE.ConeGeometry(0.045, 0.16, 4), pc, Math.cos((k / 6) * TAU) * 0.05, 0.05, Math.sin((k / 6) * TAU) * 0.05); pt.rotation.set(Math.sin((k / 6) * TAU) * 0.9, 0, -Math.cos((k / 6) * TAU) * 0.9); fl.add(pt); }
      fl.add(mesh(new THREE.SphereGeometry(0.03, 6, 4), mat('#f6d55c'), 0, 0.06, 0));
    }
    pads.push({ g, ph: rnd() * TAU });
  }
  // ---- wildflowers and tall grass tufts on the lawn round it (never on a path, never solid)
  const onPath = (x, z) => pathSegs.some(([a, b, w]) => { const ux = b.x - a.x, uz = b.z - a.z, l2 = ux * ux + uz * uz || 1, t = clamp(((x - a.x) * ux + (z - a.z) * uz) / l2, 0, 1); return Math.hypot(x - a.x - ux * t, z - a.z - uz * t) < w + 0.4; });
  const freeAt = (x, z, m) => H(x, z) > 0.12 && !onPath(x, z) && !colliders.some((c) => !c.lvl && Math.hypot(c.x - x, c.z - z) < (c.r || 0) + m);
  const flowerC = ['#f6d55c', '#ffffff', '#ff9ec0', '#f6d55c', '#ffd0e0'], tuft = mat('#8fc85a');
  for (let i = 0, made = 0; i < 160 && made < 34; i++) {
    const th = rnd() * TAU, q = at(th, shore(th) + 1.0 + rnd() * 2.2); if (keepClear(th) || !freeAt(q.x, q.z, 0.3)) continue;
    const y = H(q.x, q.z), g = new THREE.Group(); g.position.set(q.x, y, q.z); scene.add(g);
    if (made % 3 === 2) { for (let k = 0; k < 4; k++) { const b = mesh(new THREE.ConeGeometry(0.04, 0.45 + rnd() * 0.25, 3), tuft, (rnd() - 0.5) * 0.18, 0.25, (rnd() - 0.5) * 0.18); b.rotation.z = (rnd() - 0.5) * 0.5; b.castShadow = false; g.add(b); } }
    else { const c = mat(flowerC[made % flowerC.length]); for (let k = 0; k < 3; k++) { const fx = (rnd() - 0.5) * 0.3, fz = (rnd() - 0.5) * 0.3, st = 0.18 + rnd() * 0.1; g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, st, 3), reedM, fx, st / 2, fz)); const hd = mesh(new THREE.SphereGeometry(0.045, 6, 4), c, fx, st + 0.02, fz); hd.scale.y = 0.6; hd.castShadow = false; g.add(hd); } }
    made++;
  }
  // ---- a pink cherry blossom tree and two round bushes nearby (spots found on open lawn, off the paths)
  const spotNear = (th0, r0, m) => { for (let k = 0; k < 300; k++) { const th = th0 + (rnd() - 0.5) * 2.4, r = r0 + rnd() * 4, q = at(th, shore(th) + r); if (freeAt(q.x, q.z, m) && !keepClear(th)) return q; } return null; };
  const cherry = spotNear(Math.PI + 0.35, 2.0, 1.0); // the south-west side
  let petals = null;
  if (cherry) {
    const g = new THREE.Group(); g.position.set(cherry.x, H(cherry.x, cherry.z), cherry.z); scene.add(g);
    const bark = mat('#8a5a3a'); g.add(mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.6, 6), bark, 0, 0.8, 0));
    const br = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 5), bark, 0.25, 1.5, 0); br.rotation.z = -0.6; g.add(br);
    for (const [x, y, z, r, c] of [[0, 2.15, 0, 0.95, '#ffb7d0'], [0.6, 2.0, 0.3, 0.7, '#ffc8dc'], [-0.5, 1.95, -0.2, 0.72, '#ff9ec0'], [0.1, 2.6, -0.3, 0.6, '#ffd6e6']]) { const b = mesh(new THREE.IcosahedronGeometry(r, 1), mat(c), x, y, z); g.add(b); }
    colliders.push({ x: cherry.x, z: cherry.z, r: 0.4, nonav: true });
    const N = 40, pp = new Float32Array(N * 3), pv = new Float32Array(N * 3);
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: 0xffb7d0, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
    const respawn = (i, y0) => { const a = rnd() * TAU, r = rnd() * 1.1; pp[i * 3] = cherry.x + Math.cos(a) * r; pp[i * 3 + 1] = y0 ?? 1.8 + rnd() * 0.8 + H(cherry.x, cherry.z); pp[i * 3 + 2] = cherry.z + Math.sin(a) * r; pv[i * 3] = 0.15 + rnd() * 0.2; pv[i * 3 + 2] = (rnd() - 0.5) * 0.2; };
    for (let i = 0; i < N; i++) respawn(i, H(cherry.x, cherry.z) + rnd() * 2.6);
    petals = { N, pp, pv, pgeo, respawn };
  }
  for (const th0 of [-0.9, 2.0]) { const q = spotNear(th0, 1.5, 0.75); if (!q) continue; const g = new THREE.Group(); g.position.set(q.x, H(q.x, q.z), q.z); scene.add(g); for (const [x, z, r] of [[0, 0, 0.5], [0.4, 0.2, 0.38], [-0.35, 0.15, 0.36]]) g.add(mesh(new THREE.IcosahedronGeometry(r, 1), mat('#6fb84a'), x, r * 0.85, z)); colliders.push({ x: q.x, z: q.z, r: 0.55, nonav: true }); }
  // ---- the dock: planks on posts from the bank out over the water, low railings, a lantern at the end
  const dockDeck = addDeck(D.a[0], D.a[1], D.b[0], D.b[1], D.ya, D.yb, D.hw);
  LINKS.push({ a: dockDeck, b: -1, x: D.a[0] - Math.sin(dockDir) * 0.5, z: D.a[1] - Math.cos(dockDir) * 0.5 });
  const dg = new THREE.Group(); dg.position.set(D.a[0], 0, D.a[1]); dg.rotation.y = dockDir; scene.add(dg);
  const len = Math.hypot(D.b[0] - D.a[0], D.b[1] - D.a[1]);
  for (let z = 0.15; z < len; z += 0.34) dg.add(mesh(new THREE.BoxGeometry(D.hw * 2 + 0.1, 0.07, 0.3), Math.round(z / 0.34) % 3 ? M.wood : mat('#a9774f'), 0, dYAt(z / len) - 0.035, z));
  for (let z = 0.5; z <= len + 0.01; z += 1.0) for (const x of [-D.hw, D.hw]) { const wx = D.a[0] + Math.sin(dockDir) * z + Math.cos(dockDir) * x, wz = D.a[1] + Math.cos(dockDir) * z - Math.sin(dockDir) * x, y0 = dYAt(z / len), gh = Math.min(H(wx, wz), y0 - 0.2); dg.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, y0 - gh + 0.45, 5), M.woodDark, x, (y0 + gh + 0.45) / 2 - 0.02, z)); }
  for (const x of [-D.hw, D.hw]) { const rl = mesh(new THREE.BoxGeometry(0.05, 0.05, len - 0.5), M.wood, x, (dYAt(0.1) + dYAt(1)) / 2 + 0.43, len / 2 + 0.25); rl.rotation.x = Math.atan2(D.ya - D.yb, len); dg.add(rl); }
  dg.add(mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), M.woodDark, D.hw, D.yb + 0.5, len - 0.05));
  const lan = mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18), M.lantern, D.hw, D.yb + 1.12, len - 0.05); lan.castShadow = false; dg.add(lan);
  { const roof = mesh(new THREE.ConeGeometry(0.15, 0.12, 4), M.woodDark, D.hw, D.yb + 1.29, len - 0.05); roof.rotation.y = Math.PI / 4; dg.add(roof); }
  dg.updateMatrixWorld(true); const lanW = lan.getWorldPosition(new THREE.Vector3()); lanternAt.copy(lanW);
  wmat.uniforms.uLampAt.value.set(lanW.x - PX, lanW.z - PZ);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); glow.position.copy(lanW); glow.scale.set(1.5, 1.5, 1); scene.add(glow);
  lampData.push({ pos: lanW.clone(), light: null, glow });
  const click = new THREE.Mesh(new THREE.BoxGeometry(D.hw * 2, 0.1, len), new THREE.MeshBasicMaterial({ visible: false })); click.position.set((D.a[0] + D.b[0]) / 2, (D.ya + D.yb) / 2, (D.a[1] + D.b[1]) / 2); click.rotation.x = 0; click.rotation.y = dockDir; click.userData.deck = dockDeck; scene.add(click); deckClicks.push(click);
  // ---- koi and ducks: where they are follows from the shared seed and the shared clock
  const koiCols = [['#ff8a3a', '#fffaf0'], ['#fffaf0', '#ff7a4a'], ['#f6c84c', '#fffaf0'], ['#ff9a5a', '#2b2b3a']];
  const kois = koiCols.map(([c1, c2], i) => {
    const g = new THREE.Group(), body = mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(c1, { flatShading: false })); body.scale.set(0.6, 0.45, 1.6); body.castShadow = false; g.add(body);
    const spot = mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(c2, { flatShading: false }), 0, 0.03, 0.03); spot.scale.set(0.8, 0.5, 1.3); spot.castShadow = false; g.add(spot);
    const tail = mesh(new THREE.ConeGeometry(0.09, 0.16, 4), mat(c1, { flatShading: false }), 0, 0, -0.22); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.25; tail.castShadow = false; g.add(tail);
    scene.add(g); return { g, tail, i };
  });
  const makeDuck = (small) => {
    const g = new THREE.Group(), s = small ? 0.55 : 1, white = mat(small ? '#ffe680' : '#fffaf0', { flatShading: false }), bill = mat('#ffa23a');
    const body = mesh(new THREE.SphereGeometry(0.2 * s, 10, 8), white, 0, 0.1 * s, 0); body.scale.set(0.85, 0.75, 1.15); g.add(body);
    const tailB = mesh(new THREE.ConeGeometry(0.08 * s, 0.14 * s, 5), white, 0, 0.16 * s, -0.22 * s); tailB.rotation.x = -2.2; g.add(tailB);
    const neck = new THREE.Group(); neck.position.set(0, 0.2 * s, 0.14 * s); g.add(neck);
    const head = mesh(new THREE.SphereGeometry(0.11 * s, 10, 8), small ? white : mat('#5fae7a', { flatShading: false }), 0, 0.1 * s, 0.02 * s); neck.add(head);
    const b = mesh(new THREE.BoxGeometry(0.09 * s, 0.03 * s, 0.1 * s), bill, 0, 0.08 * s, 0.13 * s); neck.add(b);
    for (const x of [-0.05, 0.05]) neck.add(mesh(new THREE.SphereGeometry(0.018 * s, 5, 4), mat('#2b211c'), x * s, 0.13 * s, 0.1 * s));
    if (!small) for (const sx of [-1, 1]) { const w = mesh(new THREE.SphereGeometry(0.1, 8, 6), mat('#e8e2d4', { flatShading: false }), sx * 0.15, 0.13, -0.03); w.scale.set(0.35, 0.6, 1.1); g.add(w); }
    scene.add(g); return { g, neck, small, wakeT: 0 };
  };
  const ducks = [makeDuck(false), makeDuck(false), makeDuck(false)], duckling = makeDuck(true);
  // a smooth loop inside the pond for swimmer i (u = phase 0..1): a wobbly ellipse kept inside the kidney outline
  const loopAt = (i, u, inset) => {
    const a = u * TAU, wob = 0.18 * Math.sin(a * 2 + i * 1.7 + (pondSeed % 97) * 0.13), th = a + i * 1.3 + (pondSeed % 13) * 0.4;
    const r = (shore(th) - inset) * (0.55 + wob + 0.12 * Math.sin(a * 3 + i)); return { x: PX + Math.cos(th) * r, z: PZ + Math.sin(th) * r };
  };
  const nearPlayers = () => [...(myRoom === null ? [player] : []), ...[...remotes.values()].filter((r) => !r.room).map((r) => r.player)].filter((c) => Math.hypot(c.position.x - PX, c.position.z - PZ) < P.r + 2.2);
  // ---- dragonflies and butterflies by day, fireflies at dusk and night
  const flyers = [0, 1, 2, 3].map((k) => { const g = new THREE.Group(), dragon = k < 2, c = mat(dragon ? '#5fc0e8' : ['#ffb3c8', '#f6d55c'][k - 2]); const bd = mesh(new THREE.CapsuleGeometry(0.02, dragon ? 0.22 : 0.08, 2, 4), dragon ? c : mat('#5a4632')); bd.rotation.x = Math.PI / 2; g.add(bd); const wings = []; for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(dragon ? 0.2 : 0.14, dragon ? 0.06 : 0.12), new THREE.MeshBasicMaterial({ color: dragon ? 0xdff6ff : c.color, transparent: true, opacity: dragon ? 0.6 : 0.95, side: THREE.DoubleSide }), s * (dragon ? 0.1 : 0.07), 0.01, 0); w.rotation.x = -Math.PI / 2; g.add(w); wings.push(w); } scene.add(g); return { g, wings, dragon, k }; });
  const NF = 22, fpos = new Float32Array(NF * 3), fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const fmat = new THREE.PointsMaterial({ map: glowTex, color: 0xfff27a, size: 0.32, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const fireflies = new THREE.Points(fgeo, fmat); fireflies.frustumCulled = false; scene.add(fireflies);
  const ffSeed = Array.from({ length: NF }, (_, i) => ({ th: (i / NF) * TAU + rnd(), r: 0.2 + rnd() * 1.8, h: 0.4 + rnd() * 1.0, ph: rnd() * TAU }));
  const _c = new THREE.Color();
  const update = function (dt, time) {
    const t = nowMs() / 1000, day = 1 - cur.lamp * 0.75, near = Math.hypot(player.position.x - PX, player.position.z - PZ) < 45 && myRoom === null;
    wmat.uniforms.uTime.value = time; wmat.uniforms.uDay.value = day; wmat.uniforms.uLamp.value = cur.lamp;
    wmat.uniforms.uSky.value.copy(_c.copy(cur.top).lerp(cur.fog, 0.4));
    if (!near) return; // nothing to animate when nobody's looking
    for (const s of swayers) s.g.rotation.z = Math.sin(time * 1.3 + s.ph) * 0.05;
    for (const p of pads) p.g.position.y = 0.085 + Math.sin(time * 1.1 + p.ph) * 0.006;
    const watchers = nearPlayers();
    // koi: slow loops just under the surface; a player at the shore sends them gliding off deeper
    for (const k of kois) {
      const per = 26 + k.i * 5, u = ((t / per + k.i * 0.27 + (pondSeed % 1000) / 1000) % 1 + 1) % 1, a = loopAt(k.i, u, 0.7), b = loopAt(k.i, u + 0.004, 0.7);
      let shy = 0; for (const c of watchers) shy = Math.max(shy, 1 - Math.hypot(c.position.x - a.x, c.position.z - a.z) / 2.5);
      k.g.position.set(a.x, 0.02 - shy * 0.22, a.z); k.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      k.tail.rotation.y = Math.sin(time * (6 + shy * 8) + k.i) * 0.5;
    }
    // ducks: paddling round, now and then dipping their heads; one has a duckling paddling behind
    ducks.forEach((d, i) => {
      const per = 48 + i * 9, uOf = (tt) => ((tt / per + i * 0.33 + (pondSeed % 777) / 777) % 1 + 1) % 1, a = loopAt(i + 5, uOf(t), 0.55), b = loopAt(i + 5, uOf(t + 0.3), 0.55);
      let ax = a.x, az = a.z; for (const c of watchers) { const dx = a.x - c.position.x, dz = a.z - c.position.z, dd = Math.hypot(dx, dz); if (dd < 2.2) { ax += (dx / dd) * (2.2 - dd) * 0.35; az += (dz / dd) * (2.2 - dd) * 0.35; } } // paddle away a little
      d.g.position.x = lerp(d.g.position.x || ax, ax, Math.min(1, dt * 3)); d.g.position.z = lerp(d.g.position.z || az, az, Math.min(1, dt * 3)); d.g.position.y = 0.06 + Math.sin(time * 2 + i) * 0.012;
      d.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const dip = ((t + i * 7 + (pondSeed % 11)) % 11) < 1.2; d.neck.rotation.x = lerp(d.neck.rotation.x, dip ? 1.9 : 0, Math.min(1, dt * 6)); d.g.rotation.x = dip ? 0.35 : 0;
      d.wakeT -= dt; if (d.wakeT <= 0) { d.wakeT = 1.0; ripple(d.g.position.x - Math.sin(d.g.rotation.y) * 0.25, d.g.position.z - Math.cos(d.g.rotation.y) * 0.25, 0.22); }
      if (i === 0) { const c = loopAt(5, uOf(t - 1.6), 0.55), c2 = loopAt(5, uOf(t - 1.3), 0.55); duckling.g.position.set(c.x, 0.05 + Math.sin(time * 3) * 0.01, c.z); duckling.g.rotation.y = Math.atan2(c2.x - c.x, c2.z - c.z); }
    });
    // petals drifting down from the cherry tree
    if (petals) { const { N, pp, pv, pgeo, respawn } = petals; for (let i = 0; i < N; i++) { pp[i * 3] += (pv[i * 3] + Math.sin(time + i) * 0.1) * dt; pp[i * 3 + 1] -= (0.25 + (i % 5) * 0.04) * dt; pp[i * 3 + 2] += (pv[i * 3 + 2] + Math.cos(time * 0.8 + i) * 0.1) * dt; if (pp[i * 3 + 1] < H(pp[i * 3], pp[i * 3 + 2]) + 0.03) respawn(i); } pgeo.attributes.position.needsUpdate = true; }
    // insects
    const dayOn = cur.lamp < 0.5;
    for (const f of flyers) {
      f.g.visible = dayOn;
      if (!dayOn) continue;
      const ph = t * (f.dragon ? 0.35 : 0.22) + f.k * 1.7, th = ph + Math.sin(ph * 2.3) * 0.6, r = shore(th) * (f.dragon ? 0.75 : 1.25) + Math.sin(ph * 3.1) * 0.4;
      const x = PX + Math.cos(th) * r, z = PZ + Math.sin(th) * r, y = (f.dragon ? 0.55 : 0.8) + Math.sin(t * (f.dragon ? 2 : 3) + f.k) * 0.15 + Math.max(0, H(x, z));
      f.g.rotation.y = Math.atan2(x - f.g.position.x, z - f.g.position.z) || f.g.rotation.y; f.g.position.set(x, y, z);
      const flap = Math.sin(time * (f.dragon ? 40 : 14) + f.k); f.wings[0].rotation.y = flap * (f.dragon ? 0.3 : 0.9); f.wings[1].rotation.y = -flap * (f.dragon ? 0.3 : 0.9);
    }
    fmat.opacity = cur.lamp * 0.95;
    if (cur.lamp > 0.02) { for (let i = 0; i < NF; i++) { const s = ffSeed[i], th = s.th + Math.sin(t * 0.2 + s.ph) * 0.4, r = shore(th) + s.r * Math.sin(t * 0.13 + s.ph * 2); fpos[i * 3] = PX + Math.cos(th) * r; fpos[i * 3 + 1] = s.h + Math.sin(t * 0.9 + s.ph) * 0.25 + Math.max(0, H(fpos[i * 3], fpos[i * 3 + 2])); fpos[i * 3 + 2] = PZ + Math.sin(th) * r; } fgeo.attributes.position.needsUpdate = true; }
  };
  update.animals = () => [...kois.map((k) => k.g), ...ducks.map((d) => d.g), duckling.g];
  return update;
})();
// ---------------------------------------------------------------- game sound and the town piano
// All sound is made here with the Web Audio API (no audio files). Browsers only allow sound after the first tap, so the
// audio starts then; the round speaker button mutes or unmutes everything (remembered on this device).
const sound = (() => {
  const S = { ctx: null, master: null, piano: null, auto: null, live: null, voices: 0, muted: false };
  try { S.muted = localStorage.getItem('driftwood.muted') === '1'; } catch { /* private mode: not muted */ }
  S.start = () => {
    if (S.ctx) { if (S.ctx.state === 'suspended' && S.ctx.resume) S.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { S.ctx = new AC(); } catch { S.ctx = null; return; }
    const c = S.ctx;
    S.master = c.createGain(); S.master.gain.value = S.muted ? 0 : 1;
    const comp = c.createDynamicsCompressor(); S.master.connect(comp); comp.connect(c.destination);
    // a little room around the piano: a short reverb from softly decaying noise
    const len = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const verb = c.createConvolver(); verb.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.3; verb.connect(wet); wet.connect(S.master);
    S.piano = c.createGain(); S.piano.gain.value = 0; S.piano.connect(S.master); S.piano.connect(verb); // its loudness: how far away you are
    S.auto = c.createGain(); S.auto.connect(S.piano); // the piano playing by itself (fades out when someone sits down)
    S.live = c.createGain(); S.live.connect(S.piano); // a player's notes
    if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, S.start, true);
  S.ready = () => !!S.ctx && S.ctx.state === 'running';
  S.setMuted = (m) => {
    S.muted = m;
    try { localStorage.setItem('driftwood.muted', m ? '1' : '0'); } catch { /* not remembered */ }
    if (S.master) S.master.gain.setTargetAtTime(m ? 0 : 1, S.ctx.currentTime, 0.05);
  };
  // one soft piano note: a triangle tone with a quiet octave above, a quick gentle attack, a slow fade while held, a
  // short release, and a filter that mellows as the note rings
  S.note = (midi, when, dur, vel, bus) => {
    const c = S.ctx;
    if (!c || !bus || S.voices > 30) return;
    const f = 440 * Math.pow(2, (midi - 69) / 12), t = Math.max(when, c.currentTime), end = t + Math.max(0.12, dur), peak = 0.2 * vel;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), h = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'triangle'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 2; h.gain.value = 0.16;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(8000, f * 7), t); lp.frequency.setTargetAtTime(Math.max(400, f * 2.2), t, 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.007);
    g.gain.setTargetAtTime(peak * 0.3, t + 0.007, 0.45); g.gain.setTargetAtTime(0.0001, end, 0.16);
    o1.connect(lp); o2.connect(h); h.connect(lp); lp.connect(g); g.connect(bus);
    o1.start(t); o2.start(t); o1.stop(end + 1); o2.stop(end + 1);
    S.voices++;
    o1.onended = () => { S.voices--; try { g.disconnect(); } catch { /* already gone */ } };
  };
  return S;
})();
{ // the speaker button (top right, under the player count)
  const btn = document.getElementById('soundBtn');
  const show = () => { btn.classList.toggle('muted', sound.muted); btn.title = sound.muted ? 'Sound off (tap to turn on)' : 'Sound on (tap to mute)'; btn.setAttribute('aria-pressed', sound.muted ? 'true' : 'false'); };
  btn.addEventListener('click', () => { sound.start(); sound.setMuted(!sound.muted); show(); });
  show();
}

// The piano itself (PIANO in island.js): a pastel grand piano on a round rug, a padded bench, flowers, a lantern and
// a string of fairy lights. Who sits at it comes from the server ({ who, name, auto0 }); offline it's kept here.
let pianoS = { who: null, name: '', auto0: 0 };
const pianoMe = () => pianoS.who !== null && pianoS.who === net.id && myRoom === null;
const piano = (() => {
  const g = new THREE.Group(), y0 = H(PIANO.x, PIANO.z);
  g.position.set(PIANO.x, y0, PIANO.z); g.rotation.y = PIANO.face; scene.add(g);
  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), PIANO.face).add(g.position);
  const hAt = (x, z) => { const w = toWorld(x, 0, z); return H(w.x, w.z) - y0; }; // the lawn's height under a spot, from the piano's base
  // the rug: soft rings with little hearts, laid over the lawn's gentle bumps
  const rugTex = canvasTex(256, 256, (c) => {
    const ring = (r, col) => { c.fillStyle = col; c.beginPath(); c.arc(128, 128, r, 0, TAU); c.fill(); };
    ring(128, '#e98fae'); ring(118, '#fff1e2'); ring(104, '#f7c3d3'); ring(90, '#fff6ea'); ring(58, '#cfe9de'); ring(46, '#fff6ea');
    const heart = (x, y, s, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.3, y, x - s * 0.6, y - s * 1.1, x, y - s * 0.35); c.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.3, y, x, y + s * 0.9); c.fill(); };
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; heart(128 + Math.cos(a) * 97, 128 + Math.sin(a) * 97, 6, k % 2 ? '#e98fae' : '#9fd3c0'); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; c.fillStyle = '#f7c3d3'; c.beginPath(); c.arc(128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74, 5, 0, TAU); c.fill(); }
    heart(128, 130, 14, '#f7a8c4');
  });
  {
    const geo = new THREE.RingGeometry(0, 2.05, 40, 6), pos = geo.attributes.position;
    geo.rotateX(-Math.PI / 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); pos.setY(i, hAt(v.x, v.z) + 0.035); }
    geo.computeVertexNormals();
    const rug = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    rug.receiveShadow = true; g.add(rug);
  }
  // the body: a rounded grand-piano outline (straight bass side on the left, the curved side on the right), pink outside
  // and cream inside, on three legs with little gold feet
  const body = new THREE.Group(); body.position.y = 0.04; g.add(body);
  const outline = (s) => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.7 * s, -0.75 * s); sh.lineTo(0.7 * s, -0.75 * s); sh.lineTo(0.7 * s, -0.15 * s);
    sh.bezierCurveTo(0.7 * s, 0.35 * s, 0.14 * s, 0.3 * s, 0.12 * s, 0.75 * s);
    sh.bezierCurveTo(0.1 * s, 1.25 * s, -0.7 * s, 1.35 * s, -0.7 * s, 0.9 * s);
    sh.lineTo(-0.7 * s, -0.75 * s);
    return sh;
  };
  const slab = (s, depth, bevel) => { const geo = new THREE.ExtrudeGeometry(outline(s), { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 14 }); geo.rotateX(-Math.PI / 2); return geo; };
  const pink = mat('#f7bfd0', { flatShading: false, roughness: 0.55 }), cream = mat('#fff4e2', { flatShading: false }), gold = mat('#e8c46a', { roughness: 0.4, metalness: 0.3 });
  const TOP = 0.94;
  body.add(mesh(slab(1, 0.28, 0.04), pink, 0, TOP - 0.32, 0));
  body.add(mesh(slab(0.93, 0.02, 0), cream, 0.01, TOP - 0.035, 0.03)); // the inside, seen under the open lid
  for (const [x, z, w] of [[-0.25, -0.1, 0.9], [-0.05, -0.35, 0.6]]) { const st = mesh(new THREE.BoxGeometry(0.03, 0.015, w), gold, x, TOP - 0.02, z); st.rotation.y = 0.35; body.add(st); } // strings frame
  const lid = new THREE.Group(); lid.position.set(-0.7, TOP + 0.02, 0); lid.rotation.z = 0.5; body.add(lid);
  lid.add(mesh(slab(1, 0.03, 0.02), pink, 0.7, 0, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.56, 6), gold, 0.22, TOP + 0.25, -0.15)); // the lid's prop
  for (const [x, z] of [[-0.58, 0.6], [0.58, 0.6], [-0.4, -1.0]]) {
    body.add(mesh(new THREE.CylinderGeometry(0.075, 0.05, TOP - 0.36, 10), pink, x, (TOP - 0.36) / 2 + 0.04, z));
    body.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), gold, x, 0.04, z));
  }
  // the pedals: a little gold lyre under the keys
  body.add(mesh(new THREE.BoxGeometry(0.16, 0.42, 0.05), pink, 0, 0.3, 0.5));
  for (const x of [-0.05, 0, 0.05]) body.add(mesh(new THREE.BoxGeometry(0.03, 0.02, 0.1), gold, x, 0.07, 0.56));
  // the keyboard: C3 .. B5 (21 white keys, 15 black), each its own key that dips when it plays
  const KB = { x0: -0.64, w: 1.28, z: 0.88 }, wk = KB.w / 21;
  body.add(mesh(new THREE.BoxGeometry(1.46, 0.1, 0.32), pink, 0, TOP - 0.24, 0.84)); // the key bed
  for (const x of [-0.69, 0.69]) body.add(mesh(new THREE.BoxGeometry(0.08, 0.16, 0.32), pink, x, TOP - 0.17, 0.84)); // the cheek blocks
  body.add(mesh(new THREE.BoxGeometry(1.4, 0.1, 0.05), pink, 0, TOP - 0.12, 0.7)); // the fallboard behind the keys
  const mats = { w: mat('#fffdf7', { flatShading: false }), wd: mat('#ffd3e3', { flatShading: false }), b: mat('#3d3344', { flatShading: false }), bd: mat('#b3608a', { flatShading: false }) };
  const keys = new Map(), whiteGeo = new THREE.BoxGeometry(wk * 0.9, 0.035, 0.26), blackGeo = new THREE.BoxGeometry(wk * 0.56, 0.04, 0.16);
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  let wi = 0;
  for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
    const black = isBlack(m), x = black ? KB.x0 + wi * wk : KB.x0 + (wi + 0.5) * wk;
    const k = new THREE.Mesh(black ? blackGeo : whiteGeo, black ? mats.b : mats.w);
    k.position.set(x, black ? TOP - 0.135 : TOP - 0.165, black ? KB.z - 0.05 : KB.z);
    k.castShadow = false; body.add(k);
    keys.set(m, { k, black, y: k.position.y, down: 0 });
    if (!black) wi++;
  }
  // the music stand with a sheet of music: staff lines, round notes and tiny hearts (no words)
  const sheetTex = canvasTex(160, 64, (c) => {
    c.fillStyle = '#fffaf0'; c.fillRect(0, 0, 160, 64);
    c.strokeStyle = '#b9a58c'; c.lineWidth = 1;
    for (const y0s of [10, 38]) for (let l = 0; l < 5; l++) { c.beginPath(); c.moveTo(6, y0s + l * 4); c.lineTo(154, y0s + l * 4); c.stroke(); }
    c.fillStyle = '#6a4b5a';
    [[20, 22], [34, 18], [48, 14], [62, 20], [90, 16], [104, 12], [118, 18], [132, 22], [24, 46], [40, 50], [56, 42], [86, 48], [100, 44], [116, 40], [138, 46]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 3, 2.3, -0.4, 0, TAU); c.fill(); c.fillRect(x + 2, y - 10, 1.2, 10); });
    c.fillStyle = '#ef8fb1';
    for (const [x, y] of [[76, 8], [148, 34]]) { c.beginPath(); c.moveTo(x, y + 5); c.bezierCurveTo(x - 6, y, x - 3, y - 4, x, y - 1); c.bezierCurveTo(x + 3, y - 4, x + 6, y, x, y + 5); c.fill(); }
  });
  const stand = new THREE.Group(); stand.position.set(0, TOP + 0.02, 0.62); stand.rotation.x = -0.28; body.add(stand);
  stand.add(mesh(new THREE.BoxGeometry(0.72, 0.3, 0.025), pink, 0, 0.15, 0));
  stand.add(mesh(new THREE.BoxGeometry(0.72, 0.03, 0.06), pink, 0, 0.0, 0.03));
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.25), new THREE.MeshStandardMaterial({ map: sheetTex, roughness: 0.9 })); sheet.position.set(0, 0.16, 0.014); stand.add(sheet);
  // the bench: a padded pink cushion with little buttons on a wooden frame
  const BENCH = new THREE.Vector3(0, 0, 1.47);
  {
    const b = new THREE.Group(); b.position.copy(BENCH); g.add(b);
    const wood = mat('#c98c52');
    for (const [x, z] of [[-0.3, -0.13], [0.3, -0.13], [-0.3, 0.13], [0.3, 0.13]]) b.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.4, 6), wood, x, 0.2, z));
    b.add(mesh(new THREE.BoxGeometry(0.72, 0.06, 0.36), wood, 0, 0.42, 0));
    const cushion = mesh(new THREE.BoxGeometry(0.7, 0.08, 0.34), mat('#ffc4d6', { flatShading: false }), 0, 0.49, 0); b.add(cushion);
    for (const x of [-0.2, 0, 0.2]) b.add(mesh(new THREE.SphereGeometry(0.022, 6, 4), mat('#f28fb1'), x, 0.535, 0));
  }
  // flowers in pots round the rug's edge (not in front of the bench)
  const blooms = ['#ffb3c9', '#fff1a8', '#c9b8ff', '#ffd0a8', '#ffffff'];
  [[-1.75, 0.55], [1.7, 0.7], [1.55, -1.15], [-1.25, -1.45], [0.35, -1.85]].forEach(([x, z], i) => {
    const f = new THREE.Group(); f.position.set(x, hAt(x, z) + 0.02, z); g.add(f);
    f.add(mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.22, 8), mat('#e6a07a'), 0, 0.11, 0));
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + i; f.add(mesh(new THREE.SphereGeometry(0.075, 7, 5), mat(blooms[(i + k) % blooms.length]), Math.cos(a) * 0.08, 0.3 + (k % 2) * 0.06, Math.sin(a) * 0.08)); }
    f.add(mesh(new THREE.SphereGeometry(0.11, 6, 4), mat('#7cc46a'), 0, 0.22, 0));
  });
  // a lantern on a little post, and fairy lights strung on two poles behind the piano: they glow at dusk and night
  const glows = [];
  const lanternAt = new THREE.Vector3(-1.55, 0, -0.35);
  {
    const p = new THREE.Group(); p.position.set(lanternAt.x, hAt(lanternAt.x, lanternAt.z), lanternAt.z); g.add(p);
    const wood = mat('#8a5a36');
    p.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), wood, 0, 0.75, 0));
    p.add(mesh(new THREE.BoxGeometry(0.34, 0.04, 0.05), wood, 0.13, 1.48, 0));
    const lan = new THREE.Group(); lan.position.set(0.26, 1.24, 0); p.add(lan);
    lan.add(mesh(new THREE.ConeGeometry(0.13, 0.1, 6), mat('#e98fae'), 0, 0.15, 0));
    lan.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 6), M.lantern, 0, 0, 0));
    lan.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6), mat('#e98fae'), 0, -0.1, 0));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glow.scale.setScalar(1.6); lan.add(glow); glows.push({ glow, k: 0.85 });
  }
  const bulbCols = ['#ffb3cf', '#fff3c4', '#bff0dc', '#ffd2b0'];
  const bulbMats = bulbCols.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1, roughness: 0.4 }));
  {
    const ends = [new THREE.Vector3(-1.45, 0, -1.4), new THREE.Vector3(1.3, 0, -1.55)], hgt = 1.95, wood = mat('#8a5a36');
    for (const e of ends) { e.y = hAt(e.x, e.z); g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, hgt, 6), wood, e.x, e.y + hgt / 2, e.z)); }
    const pts = [];
    for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push(new THREE.Vector3(lerp(ends[0].x, ends[1].x, u), lerp(ends[0].y, ends[1].y, u) + hgt - 0.05 - Math.sin(u * Math.PI) * 0.38, lerp(ends[0].z, ends[1].z, u) - Math.sin(u * Math.PI) * 0.25)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 4), mat('#5a4632')));
    for (let k = 1; k < 14; k++) {
      const q = pts[Math.round((k / 14) * 24)], b = mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbMats[k % 4], q.x, q.y - 0.05, q.z); b.castShadow = false; g.add(b);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(bulbCols[k % 4]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glow.scale.setScalar(0.42); glow.position.copy(b.position); g.add(glow); glows.push({ glow, k: 0.6 });
    }
  }
  // the piano's small collision (the rug, the bench and the flowers can be walked round and over)
  { const c = toWorld(-0.15, 0, -0.1); colliders.push({ x: c.x, z: c.z, r: 1.0 }); const l = toWorld(lanternAt.x, 0, lanternAt.z); colliders.push({ x: l.x, z: l.z, r: 0.15 }); }
  g.traverse((o) => { if (o.isMesh && o !== g) o.castShadow = o.castShadow && o.geometry.type !== 'RingGeometry'; });
  return { g, y0, keys, mats, toWorld, bench: toWorld(BENCH.x, 0, BENCH.z), approach: toWorld(0, 0, 2.2), glows, bulbMats, top: TOP, heartsFrom: toWorld(0.05, 0, -0.15) };
})();
piano.bench.y = H(piano.bench.x, piano.bench.z) + 0.53; // the cushion's top
piano.approach.y = 0;

// ---- sound: the auto-play (from the shared clock), the players' notes, and how loud it is where you stand
let pianoAutoSched = 0, pianoAutoFaded = false;
const pianoLive = new Map(); // midi -> time (elapsed) its key lets go
const pianoHands = new Map(); // player id -> { l, r }: a little tap of each hand as notes play
function pianoVolume() {
  if (myRoom !== null) return 0;
  const d = Math.hypot(player.position.x - PIANO.x, player.position.z - PIANO.z);
  return d >= PIANO.hear ? 0 : d <= 4 ? 1 : Math.pow(1 - (d - 4) / (PIANO.hear - 4), 1.6);
}
function pianoKeyNote(midi, local, who) { // one key played by a player: the sound, the key, the hand, a heart
  if (sound.ready()) sound.note(midi, sound.ctx.currentTime + 0.005, 0.6, 0.85, sound.live);
  pianoLive.set(midi, elapsed + 0.22);
  const h = pianoHands.get(who) || { l: 0, r: 0 }; if (midi < 60) h.l = 1; else h.r = 1; pianoHands.set(who, h);
  pianoHeart(1);
  if (local) pianoOut.push(midi);
}
// ---- hearts: soft glowing pink, light pink and white hearts that float up from the piano, sway, grow and fade
const HEART_MAX = 36;
const heartTex = canvasTex(64, 64, (c) => {
  c.shadowColor = 'rgba(255, 255, 255, 0.95)'; c.shadowBlur = 9;
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(32, 54); c.bezierCurveTo(2, 34, 10, 6, 32, 20); c.bezierCurveTo(54, 6, 62, 34, 32, 54); c.fill();
});
const heartCols = [0xff8fb8, 0xff8fb8, 0xffb6d0, 0xff6fa3, 0xffffff, 0xffd6e6];
const hearts = [];
for (let i = 0; i < HEART_MAX; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  s.visible = false; s.renderOrder = 3; scene.add(s);
  hearts.push({ s, t: 0, life: 0, x: 0, z: 0, y: 0, ph: 0, rise: 0, size: 0 });
}
let heartNext = 0;
function pianoHeart(n, big) {
  if (myRoom !== null || Math.hypot(player.position.x - PIANO.x, player.position.z - PIANO.z) > 40) return; // only nearby players see them
  for (let k = 0; k < n; k++) {
    const h = hearts.find((q) => q.life <= 0) || hearts[heartNext++ % HEART_MAX];
    const a = Math.random() * TAU, r = Math.random() * (big ? 0.7 : 0.45);
    h.x = piano.heartsFrom.x + Math.cos(a) * r; h.z = piano.heartsFrom.z + Math.sin(a) * r; h.y = piano.y0 + piano.top + 0.15 + Math.random() * 0.2;
    h.t = 0; h.life = 2.6 + Math.random() * 0.8; h.ph = Math.random() * TAU; h.rise = 0.55 + Math.random() * 0.35 + (big ? 0.3 : 0); h.size = (big ? 0.26 : 0.2) + Math.random() * 0.08;
    h.s.material.color.setHex(heartCols[Math.floor(Math.random() * heartCols.length)]);
    h.s.visible = true;
  }
}
function updateHearts(dt) {
  for (const h of hearts) {
    if (h.life <= 0) continue;
    h.t += dt;
    if (h.t >= h.life || myRoom !== null) { h.life = 0; h.s.visible = false; h.s.material.opacity = 0; continue; }
    const u = h.t / h.life;
    h.s.position.set(h.x + Math.sin(h.t * 2.2 + h.ph) * 0.18, h.y + h.rise * h.t, h.z + Math.cos(h.t * 1.7 + h.ph) * 0.12);
    h.s.scale.setScalar(h.size * (0.75 + u * 0.55));
    h.s.material.opacity = Math.min(1, h.t / 0.25) * (u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1) * 0.95;
    h.s.material.rotation = Math.sin(h.t * 2.2 + h.ph) * 0.25;
  }
}

// ---- the pianist: sitting on the bench, hands on the keys (each hand taps as its notes play)
function placeAtPiano(character, charRig, who, dt, time) {
  character.position.set(piano.bench.x, piano.bench.y - 0.5, piano.bench.z);
  character.rotation.y = PIANO.face + Math.PI; character.rotation.x = 0;
  animateRig(charRig, dt, time, false, 0, 0);
  charRig.legL.rotation.x = charRig.legR.rotation.x = -1.45;
  charRig.body.rotation.x = 0.08; charRig.body.position.y = 0.55;
  const h = pianoHands.get(who) || { l: 0, r: 0 };
  h.l = Math.max(0, h.l - dt * 6); h.r = Math.max(0, h.r - dt * 6); pianoHands.set(who, h);
  charRig.armL.rotation.x = -1.15 + h.l * 0.3 + Math.sin(time * 1.3) * 0.03;
  charRig.armR.rotation.x = -1.15 + h.r * 0.3 + Math.sin(time * 1.3 + 1) * 0.03;
  charRig.armL.rotation.z = 0.12; charRig.armR.rotation.z = -0.12;
  charRig.head.rotation.x = 0.12; charRig.head.rotation.y = Math.sin(time * 0.6) * 0.15;
}

// ---- the state: who sits there (server online, here offline)
let pianoWasMe = false, pianoWasWho = null;
function pianoChanged() {
  const me = pianoMe();
  if (me && !pianoWasMe) { // sat down: the keyboard panel slides up
    walk.target = null; walk.route = null; walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.piano = false;
    if (fishing) endFishing();
    document.body.classList.add('piano');
    pianoPanel.classList.add('open');
  } else if (!me && pianoWasMe) { // stood up: back on the rug in front of the bench
    document.body.classList.remove('piano');
    pianoPanel.classList.remove('open');
    pianoDemoStop();
    for (const k of pianoKeyEls.values()) k.classList.remove('down', 'lit', 'next');
    if (myRoom === null) { player.position.set(piano.approach.x, groundY(piano.approach.x, piano.approach.z), piano.approach.z); walk.heading = PIANO.face; }
    player.rotation.x = 0;
  }
  if (pianoS.who !== null && pianoWasWho === null && sound.ready()) { sound.auto.gain.cancelScheduledValues(sound.ctx.currentTime); sound.auto.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.3); pianoAutoFaded = true; }
  pianoWasMe = me; pianoWasWho = pianoS.who;
}
function applyPiano(m) {
  pianoS = { who: m.who ?? null, name: m.name || '', auto0: Number.isFinite(m.auto0) ? m.auto0 : nowMs() };
  pianoChanged();
}
function pianoResult(m) {
  if (m.who !== undefined) applyPiano(m);
  const why = { taken: 'Someone else is playing the piano', far: 'Walk up to the piano bench first', seat: 'Stand up first', bike: 'Park the bicycle first', ride: 'Finish the ride first', balloon: 'Get out of the balloon first', banana: 'Get off the banana boat first', volley: 'Leave the volleyball court first' }[m.why];
  if (why) toast(why);
}
function pianoRequest() {
  if (pianoS.who !== null) { if (!pianoMe()) toast('Someone else is playing the piano'); return; }
  if (net.online) { net.send({ t: 'pianoSit' }); return; }
  pianoS = { who: net.id, name: net.myName || 'You', auto0: pianoS.auto0 }; pianoChanged();
}
function pianoStand() {
  if (!pianoMe()) return;
  if (net.online) net.send({ t: 'pianoStand' });
  pianoS = { who: null, name: '', auto0: nowMs() + PIANO.resumeMs }; pianoChanged();
}
function pianoBlocked() { if (!pianoMe()) return false; toast('Stand up from the piano first'); return true; }
function pianoRemoteNote(m) {
  if (m.id === net.id) return;
  for (const midi of (m.n || []).slice(0, 6)) if (Number.isInteger(midi)) pianoKeyNote(midi, false, m.id);
  if (m.b) pianoHeart(14, true);
}

// ---- the keyboard panel: two octaves (C4 .. B5), multi-touch, a demo song with the keys lighting up in order
const pianoPanel = document.getElementById('pianoPanel');
const pianoKeyEls = new Map(); // midi -> element
const pianoOut = []; // notes to send (a few each frame)
let pianoTok = 24, pianoTokAt = 0;
{
  const wrap = document.getElementById('pianoKeys');
  const whites = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83], blacks = [[61, 1], [63, 2], [66, 4], [68, 5], [70, 6], [73, 8], [75, 9], [78, 11], [80, 12], [82, 13]];
  whites.forEach((m) => { const k = document.createElement('div'); k.className = 'pk white'; k.dataset.m = String(m); wrap.appendChild(k); pianoKeyEls.set(m, k); });
  for (const [m, after] of blacks) { const k = document.createElement('div'); k.className = 'pk black'; k.dataset.m = String(m); k.style.left = `calc(${((after / 14) * 100).toFixed(3)}% - 3.4%)`; wrap.appendChild(k); pianoKeyEls.set(m, k); }
  const held = new Map(); // pointer id -> key element
  const press = (el) => { if (!el || !pianoMe()) return; el.classList.add('down'); pianoKeyNote(Number(el.dataset.m), true, net.id); };
  const keyAt = (e) => { const t = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : e.target; return t && t.closest ? t.closest('.pk') : null; };
  const let_go = (id) => { const el = held.get(id); held.delete(id); if (el && ![...held.values()].includes(el)) el.classList.remove('down'); };
  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault(); sound.start();
    const el = e.target && e.target.closest ? e.target.closest('.pk') : null;
    if (!el) return;
    try { wrap.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    held.set(e.pointerId, el); press(el);
  });
  wrap.addEventListener('pointermove', (e) => { // sliding a finger along the keys plays each one it reaches
    if (!held.has(e.pointerId)) return;
    const el = keyAt(e);
    if (el && el !== held.get(e.pointerId)) { let_go(e.pointerId); held.set(e.pointerId, el); press(el); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) wrap.addEventListener(ev, (e) => let_go(e.pointerId));
  document.getElementById('pianoClose').addEventListener('click', () => pianoStand());
  document.getElementById('pianoDemo').addEventListener('click', () => { sound.start(); if (pianoDemo) pianoDemoStop(); else pianoDemoStart(); });
}
let pianoDemo = null; // { t0, i } while the demo song plays
function pianoDemoStart() {
  if (!pianoMe()) return;
  pianoDemo = { t0: elapsed + 0.6, i: 0 };
  document.getElementById('pianoDemo').classList.add('on');
}
function pianoDemoStop() {
  pianoDemo = null;
  document.getElementById('pianoDemo').classList.remove('on');
  for (const k of pianoKeyEls.values()) k.classList.remove('lit', 'next');
}
function updatePianoDemo() {
  if (!pianoDemo) return;
  if (!pianoMe()) { pianoDemoStop(); return; }
  const t = (elapsed - pianoDemo.t0) * 1000;
  while (pianoDemo.i < PIANO_DEMO.length && PIANO_DEMO[pianoDemo.i].t <= t) {
    const n = PIANO_DEMO[pianoDemo.i++], el = pianoKeyEls.get(n.m);
    pianoKeyNote(n.m, true, net.id);
    if (el) { el.classList.remove('next'); el.classList.add('lit'); setTimeout(() => el.classList.remove('lit'), Math.min(n.d, 450)); }
  }
  for (const k of pianoKeyEls.values()) k.classList.remove('next');
  const nx = PIANO_DEMO[pianoDemo.i];
  if (nx) { const el = pianoKeyEls.get(nx.m); if (el && !el.classList.contains('lit')) el.classList.add('next'); }
  else if (t > PIANO_DEMO[PIANO_DEMO.length - 1].t + 700) { // the end: a big burst of hearts, for everyone nearby too
    pianoHeart(14, true);
    if (net.online) net.send({ t: 'pianoNote', n: [], b: 1 });
    pianoDemoStop();
  }
}

// the floating "Play" circle on the bench, and the player's name over whoever is playing
const PIANO_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="14" width="36" height="22" rx="5" fill="#fffaf0" stroke="#b3608a" stroke-width="2.5"/><path d="M14 15 v12 M24 15 v12 M34 15 v12" stroke="#b3608a" stroke-width="2"/><rect x="11.5" y="15" width="5" height="11" rx="1.5" fill="#3d3344"/><rect x="21.5" y="15" width="5" height="11" rx="1.5" fill="#3d3344"/><rect x="31.5" y="15" width="5" height="11" rx="1.5" fill="#3d3344"/><path d="M38 6 c-3 -3 -7 0 -4 4 l4 4 l4 -4 c3 -4 -1 -7 -4 -4z" fill="#f28fb1"/></svg>';
const pianoBubble = makeDoorBubble(PIANO_ICON, 'Play the piano', () => {
  if (bikeRide) { toast('Park the bicycle first'); return; }
  if (pianoS.who !== null) { toast('Someone else is playing the piano'); return; }
  if (mySeat !== null) standUp();
  walk.item = null; walk.tree = null; walk.cast = null; walk.bug = null; walk.water = null; walk.seat = null; walk.door = null; walk.talk = null;
  walk.piano = true; walk.target = new THREE.Vector3(piano.approach.x, 0, piano.approach.z);
});
pianoBubble.btn.classList.add('piano-bubble');
const pianoLabel = document.createElement('div'); pianoLabel.className = 'vol-label piano-label'; seatLayer.appendChild(pianoLabel);
const _pianoV = new THREE.Vector3();

// ---- every frame
function updatePiano(dt, time) {
  const now = nowMs(), near = myRoom === null && Math.hypot(player.position.x - PIANO.x, player.position.z - PIANO.z) < 45;
  if (!net.online && pianoS.who !== null && pianoS.who !== net.id) { pianoS = { who: null, name: '', auto0: now + PIANO.resumeMs }; pianoChanged(); } // solo: nobody else
  if (pianoWasMe && !pianoMe()) pianoChanged(); // went indoors, or the server moved us off
  const autoOn = pianoS.who === null && now >= pianoS.auto0;
  // sound
  const vol = pianoVolume();
  if (sound.ready()) {
    sound.piano.gain.setTargetAtTime(vol, sound.ctx.currentTime, 0.12);
    if (autoOn && vol > 0.001) {
      if (pianoAutoFaded) { sound.auto.gain.cancelScheduledValues(sound.ctx.currentTime); sound.auto.gain.setValueAtTime(1, sound.ctx.currentTime); pianoAutoFaded = false; }
      if (pianoAutoSched < now) pianoAutoSched = now;
      const to = now + 250;
      for (const n of pianoAutoNotes(pianoAutoSched, to, pianoS.auto0)) sound.note(n.m, sound.ctx.currentTime + (n.at - now) / 1000, n.d / 1000, n.v, sound.auto);
      pianoAutoSched = to;
    } else pianoAutoSched = now + 250;
  }
  // the keys: pressed by the auto-play or by a player
  if (near) {
    const auto = autoOn ? pianoAutoNotes(now - 450, now + 1, pianoS.auto0) : [];
    for (const [m, key] of piano.keys) {
      const down = (pianoLive.get(m) || 0) > time || auto.some((n) => n.m === m && now < n.at + Math.min(n.d, 320));
      key.down += ((down ? 1 : 0) - key.down) * Math.min(1, dt * 30);
      key.k.position.y = key.y - key.down * 0.018;
      key.k.material = down ? (key.black ? piano.mats.bd : piano.mats.wd) : key.black ? piano.mats.b : piano.mats.w;
    }
    // a few hearts drift up while it plays by itself
    if (autoOn && pianoPiecesIn(now, now + 1, pianoS.auto0).length) { piano.heartT = (piano.heartT ?? 1) - dt; if (piano.heartT <= 0) { piano.heartT = 0.9 + Math.random() * 0.8; pianoHeart(1); } }
  }
  updateHearts(dt);
  // the lights: off by day, glowing at dusk and night
  const on = cur.lamp;
  for (const b of piano.bulbMats) b.emissiveIntensity = 0.12 + on * 1.7;
  for (const gl of piano.glows) gl.glow.material.opacity = on * gl.k;
  // sending my notes: a few per message, no faster than the server allows
  if (pianoOut.length) {
    pianoTok = Math.min(24, pianoTok + (time - pianoTokAt) * 16); pianoTokAt = time;
    const n = [];
    while (pianoOut.length && n.length < 6 && pianoTok >= 1) { n.push(pianoOut.shift()); pianoTok--; }
    if (pianoOut.length > 12) pianoOut.length = 0;
    if (n.length && net.online && pianoMe()) net.send({ t: 'pianoNote', n });
  } else pianoTokAt = time;
  updatePianoDemo();
  // the Play circle and the name label
  _pianoV.set(piano.bench.x, piano.bench.y + 0.45, piano.bench.z);
  const free = pianoS.who === null && myRoom === null && mySeat === null && !walk.piano && !bikeRide && !myRide && myBalloonSpot() === null && !myBananaSeat() && volMine() === null && !isSwimming();
  placeBubble(pianoBubble, _pianoV, free && Math.hypot(player.position.x - piano.bench.x, player.position.z - piano.bench.z) <= 3);
  let label = false;
  if (pianoS.who !== null && near) {
    _pianoV.set(piano.bench.x, piano.bench.y + 1.75, piano.bench.z).project(camera);
    const x = (_pianoV.x * 0.5 + 0.5) * window.innerWidth, y = (-_pianoV.y * 0.5 + 0.5) * window.innerHeight;
    if (_pianoV.z < 1 && x > -60 && y > -40 && x < window.innerWidth + 60 && y < window.innerHeight + 40) {
      label = true;
      const txt = `🎹 ${pianoMe() ? 'You' : pianoS.name || 'Someone'}`;
      if (pianoLabel.textContent !== txt) pianoLabel.textContent = txt;
      pianoLabel.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
  if (label !== !!pianoLabel._on) { pianoLabel._on = label; pianoLabel.classList.toggle('show', label); }
}
const PROTOCOL = 9; // must match PROTOCOL in server.js
const playersEl = document.getElementById('players');
const net = {
  mode: 'connecting', online: false, ws: null, id: 0, sendT: 0, last: '',
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },
};
const remotes = new Map();
function addRemote(p) {
  if (remotes.has(p.id) || p.id === net.id) return;
  const c = makeCharacter(p.color);
  c.player.add(nameTag(p.name, p.color));
  c.player.position.set(p.x, groundY(p.x, p.z), p.z);
  c.player.rotation.y = p.h || 0;
  if (Number.isFinite(p.y)) c.player.position.y = p.y;
  remotes.set(p.id, { ...c, name: p.name, ty: Number.isFinite(p.y) ? p.y : null, tx: p.x, tz: p.z, th: p.h || 0, m: p.m, phase: 0, pickT: 0, room: p.room || null, color: p.color });
  refreshRemotes();
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.player);
  r.player.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
  });
  remotes.delete(id);
}
function goOffline() {
  if (net.mode === 'offline') return;
  net.mode = 'offline'; net.online = false;
  for (const id of [...remotes.keys()]) removeRemote(id);
  for (const b of [...bikes.values()]) if (b.owner !== net.id) removeBikeNow(b); // only your own bicycle stays
  for (const st of bananaState.boats) st.riders = st.riders.map((r) => (r === net.id ? r : null)); // only you stay aboard
  balloonState.riders = balloonState.riders.map((r) => (r === net.id ? r : null)); balloonState.off = balloonState.off.filter((r) => r === net.id);
  playersEl.textContent = 'Solo island';
  if (myRoom !== null) switchToIsland(myRoom); // no server, no rooms: back out in front of the house
  // seats are ours alone now: keep the one we're on, free the rest
  const kept = mySeat;
  seatState.occ = new Map(kept !== null ? [[kept, 'me']] : []);
  seatState.swing.occupied = false; localSwingUpdate();
  loginUI.root.classList.add('hidden'); // no server to log in to: play the solo island
  logoutBtn.classList.remove('show');
}

// ---------------------------------------------------------------- login / accounts
const TOKEN_KEY = 'driftwood-session';
const storage = {
  get() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(TOKEN_KEY, v); } catch { /* private mode: stay logged in for this visit only */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};
const loginUI = {
  root: document.getElementById('login'), form: document.getElementById('loginForm'),
  name: document.getElementById('loginName'), pass: document.getElementById('loginPass'),
  msg: document.getElementById('loginMsg'), login: document.getElementById('loginBtn'), register: document.getElementById('registerBtn'),
};
const logoutBtn = document.getElementById('logout');
function loginMessage(text, isError = false) {
  loginUI.msg.textContent = text;
  loginUI.msg.className = isError ? '' : 'info';
}
function setLoginBusy(busy) { loginUI.login.disabled = loginUI.register.disabled = busy; }
function showLogin(text, isError) {
  loginUI.root.classList.remove('hidden');
  logoutBtn.classList.remove('show');
  setLoginBusy(false);
  loginMessage(text || '', isError);
}
function submitLogin(kind) {
  const name = loginUI.name.value.trim(), password = loginUI.pass.value;
  if (!name || !password) { loginMessage('Please enter both a name and a password.', true); return; }
  if (name.length < 3 || name.length > 16) { loginMessage('Names are 3 to 16 characters.', true); return; }
  if (!net.ws || net.ws.readyState !== 1) { loginMessage('Not connected to the island server.', true); return; }
  setLoginBusy(true);
  loginMessage(kind === 'register' ? 'Creating your account…' : 'Logging in…');
  net.send({ t: kind, name, password });
}
loginUI.form.addEventListener('submit', (e) => { e.preventDefault(); submitLogin('login'); });
loginUI.register.addEventListener('click', () => submitLogin('register'));
logoutBtn.addEventListener('click', () => {
  if (!net.online) return;
  sendProgress();
  net.loggingOut = true;
  net.send({ t: 'logout', token: net.token });
  storage.clear();
});
// the server keeps backpack, energy, tool (and position, from move messages) for the account
function sendProgress() {
  progressDirty = false;
  net.send({ t: 'progress', tool: currentTool }); // backpack and energy are kept by the server
}
function restoreProgress(prog) {
  if (!prog) return;
  for (const k of Object.keys(pocket)) pocket[k] = prog.pocket && Number.isInteger(prog.pocket[k]) ? prog.pocket[k] : 0;
  energy = Number.isFinite(prog.energy) ? clamp(prog.energy, 0, ENERGY_MAX) : ENERGY_MAX;
  setCoins(prog.coins, false);
  const tool = ['axe', 'can', 'rod', 'net'].includes(prog.tool) ? prog.tool : null;
  if (tool !== currentTool) selectTool(tool || currentTool); // selectTool toggles, so re-selecting the current one puts it away
  if (Number.isFinite(prog.x) && Number.isFinite(prog.z) && walkable(prog.x, prog.z)) {
    player.position.set(prog.x, groundY(prog.x, prog.z), prog.z);
    walk.target = null;
  }
  const outside = Number.isInteger(prog.outsideRoom) && plotSlots[prog.outsideRoom - 1];
  if (outside) {
    const p = plotDoor(outside, new THREE.Vector3(), 1.25);
    player.position.set(p.x, groundY(p.x, p.z), p.z); walk.target = null;
  }
  faceThePlaza(); // every entry starts facing the plaza with the camera behind
  resetCameraBehind();
  renderPocket(); renderEnergy();
  progressDirty = false;
}
function handleNet(m) {
  if (typeof m.t === 'string' && m.t.startsWith('bike')) { handleBike(m); return; }
  if (m.t === 'balloon') { applyBalloon(m); return; }
  if (m.t === 'banana') { applyBanana(m); return; }
  if (m.t === 'volley') { applyVolley(m); return; }
  if (m.t === 'piano') { applyPiano(m); return; }
  if (m.t === 'pianoNote') { pianoRemoteNote(m); return; }
  if (m.t === 'pianoResult') { pianoResult(m); return; }
  if (m.t === 'volleyResult') { volResult(m.why); return; }
  if (m.t === 'bananaResult') { toast({ away: 'That boat is out on the water, wait for it to come back', taken: 'Someone just took that seat', far: 'Walk out onto the jetty first', balloon: 'Get out of the balloon first', bike: 'Park the bicycle first' }[m.why] || "You can't get on right now"); return; }
  if (m.t === 'balloonResult') { toast({ flying: 'The balloon is up in the air, wait for it to land', full: 'The basket is full (4 at most)', far: 'Walk up to the balloon first', bike: 'Park the bicycle first' }[m.why] || "You can't board right now"); return; }
  if (m.t === 'auth') {
    net.token = m.token;
    storage.set(m.token);
    restoreProgress(m.progress);
    loginUI.root.classList.add('hidden');
    loginUI.pass.value = '';
    logoutBtn.classList.add('show');
    const when = m.lastPlayed ? ` Last here ${new Date(m.lastPlayed).toLocaleString()}.` : '';
    const home = m.plot
      ? (m.newHouse ? ` Your new house is on plot ${m.plot}!` : ` Your house is on plot ${m.plot}.`)
      : ' All 8 home plots are taken, so there is no house for you yet.';
    setTimeout(() => toast((m.lastPlayed ? `Welcome back, ${m.name}!${when}` : `Welcome to the island, ${m.name}!`) + home), 50);
    return;
  }
  if (m.t === 'house') { setPlotOwner(m.plot, m.name, m.roof); return; }
  if (m.t === 'seats') { applySeats(m); return; }
  if (m.t === 'rides') { applyRides(m); return; }
  if (m.t === 'rideResult') { if (!m.ok && m.msg) toast(m.msg); return; }
  if (m.t === 'garden') { const sl = plotSlots[m.plot - 1]; if (sl) { setGarden(sl, m.cells); for (let i = 0; i < GARDEN_CELLS; i++) refreshGardenCell(sl, i, true); } return; }
  if (m.t === 'islandGarden') { islandWatered = Array.isArray(m.islandWatered) ? m.islandWatered : []; if (Array.isArray(m.islandHarvested)) islandHarvested = m.islandHarvested; gardenTick = 0; return; }
  if (m.t === 'harvestResult') { harvestAnswered(m); return; }
  if (m.t === 'fishResult') { fishAnswered(m); return; }
  if (m.t === 'waterResult') { waterAnswered(m); return; }
  if (m.t === 'watered') { onWatered(m); return; }
  if (m.t === 'entered') { roomReplied(); fadeSwap(() => switchToRoom(m)); return; }
  if (m.t === 'exited') { roomReplied(); if (myRoom !== null) fadeSwap(() => switchToIsland(m.plot)); return; }
  if (m.t === 'roomFull') { roomReplied(); toast('That house is full right now (8 visitors at most)'); return; }
  if (m.t === 'roomError') { roomReplied(); toast(m.msg || "You can't go in there"); return; }
  if (m.t === 'room') { const r = remotes.get(m.id); if (r) { r.room = m.room || null; refreshRemotes(); } return; }
  if (m.t === 'roomLayout') { if (myRoom === m.plot && !(roomInfo && roomInfo.own && (build.kind || build.moving || roomDirty()))) { buildRoomLayout(m.layout); if (roomInfo && roomInfo.own) markLayoutSaved(roomLayout); } return; }
  if (m.t === 'authError') {
    if (m.expired) storage.clear();
    showLogin(m.msg, true);
    return;
  }
  if (m.t === 'kicked') { net.kicked = m.msg; return; }
  if (m.t === 'stats') { // the server's numbers win over our optimistic local ones
    for (const k of Object.keys(pocket)) pocket[k] = m.pocket && Number.isInteger(m.pocket[k]) ? m.pocket[k] : 0;
    if (Number.isFinite(m.energy)) energy = clamp(m.energy, 0, ENERGY_MAX);
    setCoins(m.coins, true);
    if (sellUI.root.classList.contains('open')) renderSell();
    renderPocket(); renderEnergy(); refreshEatPopup();
    return;
  }
  if (m.t === 'eatResult') { eatAnswered(m); return; }
  if (m.t === 'bo') { setBoState(m); return; }
  if (m.t === 'boOpened') { boAnswered(m); return; }
  if (m.t === 'sellResult') { sellAnswered(m); return; }
  if (m.t === 'welcome') {
    if (m.proto !== PROTOCOL) setTimeout(() => serverProblem('The game server is older than this page. Restart it (node server.js), then reload.'), 2500);
    net.online = true; net.mode = 'online'; net.id = m.id; net.myName = m.name;
    rig.shirt.material = mat(m.color, { flatShading: false });
    player.add(nameTag(`${m.name} (you)`, m.color));
    syncClock(m.clock);
    const known = new Map(m.items.map(([id, gen, active]) => [id, { gen, active }]));
    for (const it of items) {
      const s = known.get(it.id) || { gen: 0, active: true };
      it.gen = s.gen;
      if (s.active) spawn(it); else despawn(it);
    }
    for (const p of m.players) addRemote(p);
    for (const h of m.houses || []) setPlotOwner(h.plot, h.name, h.roof);
    if (m.garden) { if (m.garden.growMs > 0) GARDEN.growMs = m.garden.growMs; if (m.garden.wetMs > 0) GARDEN.wetMs = m.garden.wetMs; }
    for (const gd of m.gardens || []) if (plotSlots[gd.plot - 1]) setGarden(plotSlots[gd.plot - 1], gd.cells);
    islandWatered = Array.isArray(m.islandWatered) ? m.islandWatered : [];
    islandHarvested = Array.isArray(m.islandHarvested) ? m.islandHarvested : [];
    setBoState(m.bo);
    if (m.sellPrices && typeof m.sellPrices === 'object') sellPrices = m.sellPrices;
    if (m.seats) applySeats(m);
    if (m.rides) applyRides(m.rides);
    applyBikes(Array.isArray(m.bikes) ? m.bikes : []);
    if (m.balloon) applyBalloon(m.balloon);
    if (m.banana) applyBanana(m.banana);
    if (m.volley) { volLocal = null; applyVolley(m.volley); }
    if (m.piano) applyPiano(m.piano);
    if (Number.isFinite(m.dolphinSeed)) dolphinSeed = m.dolphinSeed;
    if (Number.isFinite(m.pondSeed)) pondSeed = m.pondSeed;
    const treeState = new Map(m.trees || []), bugState = new Map((m.bugs || []).map(([id, gen, at]) => [id, { gen, at }]));
    for (const t of fruitTrees) t.readyAt = treeState.get(t.id) || 0;
    for (const b of bugs) { const s = bugState.get(b.id) || { gen: 0, at: 0 }; setBugState(b, s.gen, s.at); }
    toast(`Welcome to the island, ${m.name}!`);
  } else if (m.t === 'join') {
    addRemote(m.p);
    toast(`${m.p.name} arrived on the island`);
  } else if (m.t === 'move') {
    const r = remotes.get(m.id);
    if (r) { r.tx = m.x; r.tz = m.z; r.th = m.h; r.m = m.m; r.run = m.r ? 1 : 0; r.ty = Number.isFinite(m.y) ? m.y : null; }
  } else if (m.t === 'moveFix') { // the server didn't accept a jump that fast: back to where it last saw us
    if (Number.isFinite(m.x) && Number.isFinite(m.z) && myRoom === null) { player.position.set(m.x, groundY(m.x, m.z), m.z); walk.target = null; walk.route = null; walk.speed = 0; }
  } else if (m.t === 'leave') {
    const r = remotes.get(m.id);
    if (r) { toast(`${r.name} headed home`); removeRemote(m.id); }
  } else if (m.t === 'count') {
    playersEl.textContent = `👥 ${m.n} on the island`;
  } else if (m.t === 'picked') {
    const it = items[m.item];
    if (it) pickedBy(it, m.by === net.id ? null : (remotes.get(m.by) || 'someone'));
  } else if (m.t === 'chopped') {
    const tree = fruitTrees[m.tree];
    if (tree) applyChop(tree, m.n, m.readyAt, m.by === net.id ? null : (remotes.get(m.by) || 'someone'));
  } else if (m.t === 'caught') {
    const b = bugs[m.bug];
    if (b) applyCatch(b, m.gen, m.spawnAt, m.by === net.id ? null : (remotes.get(m.by) || 'someone'));
  } else if (m.t === 'spawn') {
    const it = items[m.item];
    if (it) { it.gen = m.gen; spawn(it); }
  } else if (m.t === 'time') {
    syncClock(m.clock);
  }
}
function connect() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') { goOffline(); return; }
  let ws;
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`); } catch { goOffline(); return; }
  net.ws = ws;
  // no server answering at all (e.g. a plain file server): fall back to the solo island
  const giveUp = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch { /* ignore */ } goOffline(); } }, 4000);
  ws.onopen = () => {
    clearTimeout(giveUp);
    net.connected = true;
    const token = storage.get();
    if (token) { setLoginBusy(true); loginMessage('Welcome back, restoring your session…'); net.send({ t: 'resume', token }); }
    else showLogin('');
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m && typeof m === 'object') handleNet(m);
  };
  ws.onclose = () => {
    clearTimeout(giveUp);
    // logging out or being replaced by another window starts over at the login screen
    if (net.loggingOut || net.kicked) { if (typeof location.reload === 'function') location.reload(); return; }
    if (net.online) toast('Lost the connection, the island is yours alone for now');
    goOffline();
  };
  ws.onerror = () => {};
}
function updateNet(dt, time) {
  if (net.online) {
    net.sendT -= dt;
    if (net.sendT <= 0) {
      net.sendT = 0.1;
      const msg = { t: 'move', x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2), h: +walk.heading.toFixed(2), m: walk.moving ? 1 : 0 };
      if (walk.moving && (walk.runNow || 0) > 0.3) msg.r = 1; // running (the others show the run)
      if (walk.deck != null) msg.y = +deckY(DECKS[walk.deck], player.position.x, player.position.z).toFixed(2); // up on a balcony or bridge
      const key = `${msg.x},${msg.z},${msg.h},${msg.m},${msg.y}`;
      if (key !== net.last) { net.last = key; net.send(msg); }
    }
    net.progressT = (net.progressT || 0) - dt;
    if (progressDirty && net.progressT <= 0) { net.progressT = 1; sendProgress(); }
  }
  const k = 1 - Math.exp(-dt * 10);
  for (const [rid, r] of remotes) {
    const bsp = balloonSpotOf(rid);
    if (bsp !== null) { placeInBalloon(r.player, r.rig, bsp, dt, time); continue; }
    const bns = bananaSeatOf(rid);
    if (bns) { placeOnBanana(r.player, r.rig, bns, dt, time); continue; }
    if (r.player.userData.vest) r.player.userData.vest.visible = false;
    const bk = riderBike(rid);
    if (bk) { placeOnBike(r.player, r.rig, bk, dt, time); continue; }
    r.player.rotation.z = 0;
    const riding = rideOf(rid);
    if (riding) { placeRiding(r.player, r.rig, riding.kind, riding.seat, dt, time); continue; }
    if (pianoS.who === rid && !r.room) { placeAtPiano(r.player, r.rig, rid, dt, time); continue; }
    const seated = seatOfPlayer(rid);
    if (seated !== null) { placeSeated(r.player, r.rig, seatSpots[seated], dt, time); continue; }
    r.player.rotation.x = 0;
    const p = r.player.position, dx = r.tx - p.x, dz = r.tz - p.z, d = Math.hypot(dx, dz);
    if (d > 8) { p.x = r.tx; p.z = r.tz; } else { p.x += dx * k; p.z += dz * k; }
    p.y = lerp(p.y, r.ty != null ? r.ty : groundY(p.x, p.z), Math.min(1, dt * 15));
    const diff = ((r.th - r.player.rotation.y + Math.PI) % TAU + TAU) % TAU - Math.PI;
    r.player.rotation.y += diff * Math.min(1, dt * 10);
    const moving = !!r.m || d > 0.05;
    r.spd = lerp(r.spd || 0, moving ? Math.hypot(dx, dz) * k / Math.max(dt, 1e-3) : 0, Math.min(1, dt * 5)); // how fast they really go
    r.runNow = lerp(r.runNow || 0, moving && r.run ? 1 : 0, Math.min(1, dt * 5));
    if (moving) { const ph = r.phase; r.phase += dt * strideRate(Math.max(r.spd, r.run ? MOVE.run * 0.8 : MOVE.walk * 0.8), r.runNow); if (r.ty == null) runDust(p, ph, r.phase, r.runNow, false); }
    if (r.pickT > 0) r.pickT -= dt;
    animateRig(r.rig, dt, time, moving, r.phase, r.pickT, r.runNow);
    if (r.ty == null && swimming(p.x, p.z)) swimPose(r.player, r.rig, time, moving); // swimming out in the sea
  }
}
connect();

// ---------------------------------------------------------------- beach life
const beachLife = (() => {
  const reefs = (scenery.beach && scenery.beach.reefs) || [];
  let seed = 4421;
  const br = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // fish: one instanced mesh, a few small schools circling the reefs
  const PER = 7, schools = reefs.slice(0, 6).map((r, i) => ({ r, ang: br() * TAU, spin: (i % 2 ? 1 : -1) * (0.35 + br() * 0.2), scare: 0, rad: r.r + 1.3 + br() * 0.6 }));
  const geo = new THREE.OctahedronGeometry(0.07, 0); geo.scale(0.6, 0.55, 1.8);
  const fishMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: true }), Math.max(1, schools.length * PER));
  const cols = ['#ff8a3a', '#f6d55c', '#6fb8f0', '#ff8fb8', '#9be0c0'], fish = [];
  schools.forEach((sc, si) => { const c = new THREE.Color(cols[si % cols.length]); for (let k = 0; k < PER; k++) { fishMesh.setColorAt(fish.length, c); fish.push({ sc, off: (k - PER / 2) * 0.22, lane: (br() - 0.5) * 0.7, ph: br() * TAU }); } });
  fishMesh.count = fish.length; fishMesh.castShadow = false; fishMesh.frustumCulled = false;
  if (fish.length) scene.add(fishMesh);
  // sand crabs: tiny decorative ones on the beach (the bug net's crabs are separate)
  const crabs = [];
  const B = LAYOUT.areas.beach;
  for (let k = 0; k < 4000 && crabs.length < 6; k++) {
    const x = B.x + (br() - 0.5) * 2 * B.rx, z = B.z + (br() - 0.5) * 2 * B.rz, h = H(x, z);
    if (!beachSide(x) || h < 0.05 || h > 0.35 || colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.8)) continue;
    const o = makeBug('crab').obj; o.scale.setScalar(0.7); scene.add(o);
    crabs.push({ o, home: { x, z }, x, z, tx: x, tz: z, wait: br() * 3, flee: 0 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const sandOk = (x, z) => H(x, z) > 0.04 && H(x, z) < 0.5 && !colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.2);
  return function update(dt, time) {
    const px = player.position.x, pz = player.position.z, onIsland = myRoom === null;
    fishMesh.visible = onIsland;
    if (onIsland && px < -20) { // only near the beach is anyone close enough to see them
      for (const sc of schools) {
        const cx = sc.r.x + Math.cos(sc.ang) * sc.rad, cz = sc.r.z + Math.sin(sc.ang) * sc.rad;
        if (Math.hypot(px - cx, pz - cz) < 2.6) sc.scare = 1; // someone wading close: dart away and wider
        sc.scare = Math.max(0, sc.scare - dt * 0.35);
        sc.ang += sc.spin * dt * (1 + sc.scare * 2.5);
      }
      fish.forEach((f, i) => {
        const sc = f.sc, a = sc.ang + f.off / (sc.rad + sc.scare * 1.5), rad = sc.rad + sc.scare * 1.5 + f.lane + Math.sin(time * 1.3 + f.ph) * 0.12;
        const x = sc.r.x + Math.cos(a) * rad, z = sc.r.z + Math.sin(a) * rad;
        const y = Math.max(H(x, z) + 0.08, -0.17 + Math.sin(time * 2 + f.ph) * 0.03);
        e.set(0, Math.atan2(-Math.sin(a) * sc.spin, Math.cos(a) * sc.spin) + Math.sin(time * 9 + f.ph) * 0.15, 0);
        fishMesh.setMatrixAt(i, m4.compose(v.set(x, y, z), q.setFromEuler(e), one));
      });
      fishMesh.instanceMatrix.needsUpdate = true;
    }
    for (const c of crabs) {
      c.o.visible = onIsland;
      const d = Math.hypot(px - c.x, pz - c.z);
      if (d < 2.2 && c.flee <= 0) { // scuttle away from whoever comes close
        const ax = (c.x - px) / (d || 1), az = (c.z - pz) / (d || 1);
        c.tx = c.x + ax * 2.6; c.tz = c.z + az * 2.6; c.flee = 1.2;
        if (!sandOk(c.tx, c.tz)) { c.tx = c.home.x; c.tz = c.home.z; }
      } else if (c.flee <= 0 && Math.hypot(c.tx - c.x, c.tz - c.z) < 0.05) {
        c.wait -= dt;
        if (c.wait <= 0) { c.wait = 2 + Math.random() * 4; const tx = c.home.x + (Math.random() - 0.5) * 3, tz = c.home.z + (Math.random() - 0.5) * 3; if (sandOk(tx, tz)) { c.tx = tx; c.tz = tz; } }
      }
      c.flee -= dt;
      const dx = c.tx - c.x, dz = c.tz - c.z, l = Math.hypot(dx, dz), sp = (c.flee > 0 ? 2.2 : 0.35) * dt, moving = l > 0.02;
      if (moving) { const st = Math.min(l, sp); c.x += (dx / l) * st; c.z += (dz / l) * st; c.o.rotation.y = lerpAngle(c.o.rotation.y, Math.atan2(dx, dz) + Math.PI / 2, Math.min(1, dt * 8)); }
      c.o.position.set(c.x, Math.max(H(c.x, c.z), 0) + 0.02, c.z);
      c.o.rotation.z = moving ? Math.sin(time * 22 + c.home.x) * 0.06 : 0;
    }
  };
})();
// ---------------------------------------------------------------- loop
let last = performance.now(), elapsed = 0;
// ---------------------------------------------------------------- the minimap
// A small round map in the top-left corner (under the coins and log out) that turns with the camera, so "up" is the
// way the camera looks (or stays north-up: the choice is in the full map and remembered on this device). Tapping it
// opens the whole island with a legend. The ground is drawn once into a cached canvas from the world data (the
// terrain's own colours and heights, the river, pond, paths, bridges and buildings), never by rendering the 3D scene;
// the markers are drawn over it a few times a second. Hidden indoors; it keeps following you swimming or riding.
const minimap = (() => {
  const X0 = -100, Z0 = -86, WU = 200, DU = 172, PPU = 2; // the terrain's 200 x 172 plane, 2 pixels a unit
  const VIEW = 70; // units across the round minimap
  const root = document.getElementById('minimap'), cv = document.getElementById('minimapCanvas');
  const panel = document.getElementById('mapPanel'), bigCv = document.getElementById('mapCanvas'), tip = document.getElementById('mapTip');
  const upBtn = document.getElementById('mapNorthUp'), legendEl = document.getElementById('mapLegend');
  let northUp = false;
  try { northUp = localStorage.getItem('driftwood.mapNorthUp') === '1'; } catch { /* private mode: camera-up */ }
  // the places: one cute icon each (the plots, players and Bo are drawn separately, as they change)
  const ray = (p) => ({ x: p.root.x + p.dir.x * p.len, z: p.root.z + p.dir.z * p.len });
  const B = LAYOUT.beach, pierEnd = { x: dockEnd.x, z: dockEnd.y }, beachPierEnd = ray(B.pier);
  const SHOP_ICON = { clothes: ['👗', 'Clothes shop'], seed: ['🌱', 'Seed shop'], furniture: ['🛋️', 'Furniture shop'], pet: ['🐾', 'Pet shop'] };
  const places = [
    { x: TOWN.x, z: TOWN.z, icon: '⛲', name: 'Town plaza' },
    ...SHOPS.map((s) => ({ x: s.x, z: s.z, icon: SHOP_ICON[s.kind][0], name: SHOP_ICON[s.kind][1] })),
    { x: LAYOUT.rental.x, z: LAYOUT.rental.z, icon: '🚲', name: "Rex's bicycle stand" },
    { x: PIANO.x, z: PIANO.z, icon: '🎹', name: 'Town piano' },
    { x: LAYOUT.rides.ferris.x, z: LAYOUT.rides.ferris.z, icon: '🎡', name: 'Ferris wheel' },
    { x: LAYOUT.rides.carousel.x, z: LAYOUT.rides.carousel.z, icon: '🎠', name: 'Merry-go-round' },
    { x: LAYOUT.balloon.x, z: LAYOUT.balloon.z, icon: '🎈', name: 'Hot air balloon park' },
    { x: B.restaurant.x, z: B.restaurant.z, icon: '🍤', name: "Mei's Seaside restaurant" },
    { x: VOLLEY.x, z: VOLLEY.z, icon: '🏐', name: 'Volleyball court' },
    { x: B.banana.jetty[0][0], z: B.banana.jetty[0][1], icon: '🍌', name: 'Banana boat dock' },
    { x: LAYOUT.pond.x, z: LAYOUT.pond.z, icon: '🪷', name: 'Pond' },
    { x: POND_DOCK.b[0], z: POND_DOCK.b[1], icon: '🎣', name: 'Fishing spot: pond dock', fish: true },
    { x: pierEnd.x, z: pierEnd.z, icon: '🎣', name: 'Fishing spot: town pier', fish: true },
    { x: beachPierEnd.x, z: beachPierEnd.z, icon: '🎣', name: 'Fishing spot: beach pier', fish: true },
  ];
  const LEGEND = [['⛲', 'Town plaza'], ['👗', 'Clothes shop'], ['🌱', 'Seed shop'], ['🛋️', 'Furniture shop'], ['🐾', 'Pet shop'], ['1', 'Home plot'], ['🏠', 'Claimed home'],
    ['★', 'Your home (gold)'], ['🚲', 'Bicycle stand'], ['🎹', 'Piano'], ['🎡', 'Ferris wheel'], ['🎠', 'Merry-go-round'], ['🎈', 'Balloon park'], ['🍤', 'Restaurant'],
    ['🏐', 'Volleyball'], ['🍌', 'Banana boats'], ['🪷', 'Pond'], ['🎣', 'Fishing spot'], ['🎒', 'Bo the trader'], ['●', 'Other players'], ['▲', 'You']];

  // ---- the base map, drawn once (and again only if the world's layout changes: minimap.refresh())
  const base = document.createElement('canvas'); base.width = WU * PPU; base.height = DU * PPU;
  const toSrgb = (v) => Math.round(255 * Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)));
  function drawBase() {
    const ctx = base.getContext('2d'), w = base.width, h = base.height;
    const img = ctx.createImageData(w, h), d = img && img.data;
    if (d) {
      for (let i = 0; i < d.length; i += 4) { d[i] = 150; d[i + 1] = 212; d[i + 2] = 232; d[i + 3] = 255; } // the open sea
      const pos = terrain.geometry.attributes.position, col = terrain.geometry.attributes.color, ox = terrain.position.x, oz = terrain.position.z;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + ox, z = pos.getZ(i) + oz, y = pos.getY(i);
        const px = Math.floor((x - X0) * PPU), pz = Math.floor((z - Z0) * PPU);
        if (px < 0 || pz < 0 || px >= w || pz >= h) continue;
        let r, g, b;
        if (y < -0.02) { const k = Math.min(1, -y / 1.6); r = 196 - 46 * k; g = 236 - 24 * k; b = 240 - 8 * k; } // shallow to deep, pastel
        else if (col) { r = toSrgb(col.getX(i)); g = toSrgb(col.getY(i)); b = toSrgb(col.getZ(i)); r += (255 - r) * 0.22; g += (255 - g) * 0.22; b += (255 - b) * 0.22; }
        else { r = 170; g = 220; b = 140; }
        for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
          if (px + a >= w || pz + c >= h) continue;
          const k = ((pz + c) * w + px + a) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    ctx.save(); ctx.scale(PPU, PPU); ctx.translate(-X0, -Z0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (pts, width, color) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z))); ctx.stroke(); };
    const disc = (x, z, r, color, edge) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, z, r, 0, TAU); ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 0.4; ctx.stroke(); } };
    const box = (x, z, w2, d2, yaw, color, edge) => {
      ctx.save(); ctx.translate(x, z); ctx.rotate(-yaw); ctx.fillStyle = color; ctx.fillRect(-w2, -d2, w2 * 2, d2 * 2);
      if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 0.45; ctx.strokeRect(-w2, -d2, w2 * 2, d2 * 2); }
      ctx.restore();
    };
    // the river and the pond
    line(RIVER_PTS, LAYOUT.river.half * 2, '#a9dcec');
    ctx.fillStyle = '#a9dcec'; ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const th = (k / 40) * TAU, r = pondR(th); ctx.lineTo(LAYOUT.pond.x + Math.cos(th) * r, LAYOUT.pond.z + Math.sin(th) * r); }
    ctx.fill();
    disc(LAYOUT.desert.oasis.x, LAYOUT.desert.oasis.z, LAYOUT.desert.oasis.r, '#a9dcec');
    // home yards (lawn inside a hedge), then the paths and roads over everything, the plaza and the bridges
    for (const p of PLOTS) box(p.x, p.z, PLOT_HALF, PLOT_HALF, p.face, '#d6efbc', '#8cc47a');
    for (const [a, b, w, boards] of pathSegs) line([a, b], Math.max(0.9, w * 2), boards ? '#d9b78e' : '#f4e8cf');
    disc(TOWN.x, TOWN.z, PLAZA_R, '#efe3c9', '#dccaa6');
    for (const b of bridges) { ctx.save(); ctx.translate(b.x, b.z); ctx.rotate(-Math.atan2(b.ux, b.uz)); ctx.fillStyle = '#c99a6a'; ctx.fillRect(-b.half, -b.len / 2, b.half * 2, b.len); ctx.restore(); }
    line([{ x: dockStart.x, z: dockStart.y }, pierEnd], 1.6, '#c99a6a');
    line([B.pier.root, beachPierEnd], 1.6, '#c99a6a');
    line(B.banana.jetty.map(([x, z]) => ({ x, z })), 1.4, '#c99a6a');
    line(B.boardwalk.map(([x, z]) => ({ x, z })), 2.2, '#d9b78e');
    // buildings and rides as small simple shapes
    const faceTo = (x, z) => Math.atan2(TOWN.x - x, TOWN.z - z);
    for (const s of SHOPS) box(s.x, s.z, 1.9, 1.7, faceTo(s.x, s.z), s.roof, '#ffffff');
    for (const dc of LAYOUT.decor) box(dc.x, dc.z, 1.5, 1.5, 0, dc.kind === 'tower' ? '#c8a88a' : '#e8b4a0', '#ffffff');
    disc(LAYOUT.rides.ferris.x, LAYOUT.rides.ferris.z, LAYOUT.rides.ferris.pad, '#f1e0f0', '#d7a8d0');
    disc(LAYOUT.rides.carousel.x, LAYOUT.rides.carousel.z, LAYOUT.rides.carousel.pad, '#fde6c8', '#e8b67a');
    disc(LAYOUT.balloon.x, LAYOUT.balloon.z, 6, 'rgba(255,255,255,0.28)');
    box(LAYOUT.rental.x, LAYOUT.rental.z, 1.1, 0.8, LAYOUT.rental.face, '#8cc2f0', '#ffffff');
    disc(PIANO.x, PIANO.z, 2.05, '#f7c3d3', '#e98fae');
    box(B.restaurant.x, B.restaurant.z, 3.2, 2.4, B.restaurant.face, '#e9a982', '#ffffff');
    box(VOLLEY.x, VOLLEY.z, VOLLEY.hw, VOLLEY.hl, 0, '#fbeccb', '#e6b98a'); line([{ x: VOLLEY.x - VOLLEY.hw, z: VOLLEY.z }, { x: VOLLEY.x + VOLLEY.hw, z: VOLLEY.z }], 0.3, '#ffffff');
    box(B.hut.x, B.hut.z, 1.2, 1.0, B.hut.face, '#f2b8a0', '#ffffff');
    for (const hut of LAYOUT.desert.huts) box(hut.x, hut.z, 1.3, 1.3, hut.face, '#e7b98a', '#ffffff');
    disc(LAYOUT.desert.volcano.x, LAYOUT.desert.volcano.z, LAYOUT.desert.volcano.r, '#d6a08a', '#f29ab8');
    disc(LAYOUT.desert.volcano.x, LAYOUT.desert.volcano.z, 1.4, '#f6b8d0');
    disc(LAYOUT.lighthouse.x, LAYOUT.lighthouse.z, 1.2, '#ffffff', '#e2735a');
    ctx.restore();
  }
  drawBase();

  // ---- the markers over it: world (x, z) to the map's pixels, for a map centred on (cx, cz), s pixels a unit, turned by rot
  const toScreen = (x, z, cx, cz, s, rot, w, h) => {
    const dx = (x - cx) * s, dz = (z - cz) * s, c = Math.cos(rot), sn = Math.sin(rot);
    return { x: w / 2 + dx * c - dz * sn, y: h / 2 + dx * sn + dz * c };
  };
  const icon = (ctx, ch, x, y, size) => { ctx.font = `${Math.round(size)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, x, y); };
  const badge = (ctx, x, y, r, fill, edge) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.5, r * 0.28); ctx.stroke(); } };
  const text = (ctx, t, x, y, px, color) => { ctx.fillStyle = color; ctx.font = `bold ${Math.round(px)}px "Trebuchet MS",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); };
  const hits = []; // what's on the full map, for taps: { x, y, name }
  function drawMap(ctx, w, h, cx, cz, s, rot, full) {
    ctx.save(); ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#96d4e8'; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-cx, -cz);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(base, X0, Z0, WU, DU);
    ctx.restore();
    // the time of day: a soft wash of the sky's colour (warm at dusk, deep blue at night)
    const night = cur.night || 0;
    if (night > 0.02) { ctx.fillStyle = `rgba(42, 52, 120, ${0.34 * night})`; ctx.fillRect(0, 0, w, h); }
    if (cur.name === 'Dusk') { ctx.fillStyle = 'rgba(255, 150, 110, 0.16)'; ctx.fillRect(0, 0, w, h); }
    if (full) hits.length = 0;
    const at = (x, z) => toScreen(x, z, cx, cz, s, rot, w, h);
    const inside = (p, pad) => (full ? p.x > -pad && p.y > -pad && p.x < w + pad && p.y < h + pad : Math.hypot(p.x - w / 2, p.y - h / 2) < w / 2 - pad);
    const sz = full ? Math.max(16, Math.min(24, w / 30)) : Math.max(11, w / 10.5);
    // the home plots: numbered badges, a little house on the claimed ones, a gold ring round your own
    for (const sl of plotSlots) {
      const pl = PLOTS[sl.n - 1] || sl, p = at(pl.x, pl.z); if (!inside(p, 4)) continue;
      const mine = !!sl.owner && sl.owner === net.myName, r = sz * 0.5;
      badge(ctx, p.x, p.y, r, mine ? '#ffe28a' : '#fffaf0', mine ? '#e0a020' : '#8c6a48');
      if (sl.owner) { icon(ctx, '🏠', p.x, p.y, sz * 0.7); text(ctx, String(sl.n), p.x + r * 0.95, p.y - r * 0.8, r * 0.85, '#5a4632'); }
      else text(ctx, String(sl.n), p.x, p.y + 0.5, r * 1.15, '#5a4632');
      if (full) hits.push({ x: p.x, y: p.y, name: `Home plot ${sl.n}${sl.owner ? (mine ? ' (your home)' : ` (${sl.owner}'s home)`) : ' (free)'}` });
    }
    for (const pl of places) {
      if (!full && pl.fish) continue; // the full map shows the fishing spots; the minimap keeps it simple
      const p = at(pl.x, pl.z); if (!inside(p, 4)) continue;
      badge(ctx, p.x, p.y, sz * 0.52, 'rgba(255,250,240,0.82)');
      icon(ctx, pl.icon, p.x, p.y + 0.5, sz * 0.72);
      if (full) hits.push({ x: p.x, y: p.y, name: pl.name });
    }
    // Bo, wandering round the homes
    {
      const p = at(bo.g.position.x, bo.g.position.z);
      if (inside(p, 4)) {
        badge(ctx, p.x, p.y, sz * 0.32, '#f2c94c', '#ffffff');
        if (full) { icon(ctx, '🎒', p.x, p.y - sz * 0.6, sz * 0.6); hits.push({ x: p.x, y: p.y, name: 'Bo the wandering trader' }); }
      }
    }
    // the other players
    for (const r of remotes.values()) {
      if (r.room) continue;
      const p = at(r.player.position.x, r.player.position.z); if (!inside(p, 3)) continue;
      badge(ctx, p.x, p.y, sz * 0.28, r.color || '#ff8fb8', '#ffffff');
      if (full) hits.push({ x: p.x, y: p.y, name: r.name || 'A player' });
    }
    // you: a bright arrow the way your character faces (glowing a little at night)
    {
      const p = at(player.position.x, player.position.z), hd = player.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd);
      const ang = Math.atan2(fx * Math.sin(rot) + fz * Math.cos(rot), fx * Math.cos(rot) - fz * Math.sin(rot)), L = sz * 0.62;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      if (night > 0.3) { ctx.shadowColor = 'rgba(255, 230, 140, 0.95)'; ctx.shadowBlur = 8; }
      ctx.fillStyle = '#ff5a8a'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * 0.7, L * 0.62); ctx.lineTo(-L * 0.35, 0); ctx.lineTo(-L * 0.7, -L * 0.62); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      if (full) hits.push({ x: p.x, y: p.y, name: 'You are here' });
    }
    // the compass: a little N on the rim where north (-z) is
    if (!full) {
      const R = w / 2 - sz * 0.62, x = w / 2 + Math.sin(rot) * R, y = h / 2 - Math.cos(rot) * R;
      badge(ctx, x, y, sz * 0.5, '#e2735a', '#fffaf0');
      text(ctx, 'N', x, y + 0.5, sz * 0.6, '#fffaf0');
    }
  }

  // ---- the minimap in the corner: a tap opens the full map; drags and taps never reach the world under it
  let dpr = 1, wait = 0, open = false, bigWait = 0, bigFit = null;
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = cv.clientWidth || 120;
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    wait = 0; if (open) bigLayout();
  }
  window.addEventListener('resize', fit);
  const camRot = () => (northUp ? 0 : orbit.yaw); // camera-up: the way the camera looks points up the map
  const swallow = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel', 'contextmenu']) root.addEventListener(t, swallow, { passive: false });
  root.addEventListener('click', (e) => { swallow(e); openMap(); });

  // ---- the full map: the whole island north-up, the same markers, a legend, the north-up switch and a close button
  function bigLayout() {
    const W = Math.round(bigCv.clientWidth || 600), Hh = Math.round(bigCv.clientHeight || 480);
    bigCv.width = Math.round(W * dpr); bigCv.height = Math.round(Hh * dpr);
    const minX = -86, maxX = 74, minZ = -58, maxZ = 50; // the land, its piers and the banana jetty
    bigFit = { W, H: Hh, s: Math.min(W / (maxX - minX), Hh / (maxZ - minZ)), cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }
  function openMap() {
    if (open || myRoom !== null) return;
    open = true; panel.classList.add('open'); tip.classList.remove('show');
    bigLayout(); bigWait = 0;
  }
  function closeMap() { open = false; panel.classList.remove('open'); tip.classList.remove('show'); }
  document.getElementById('mapClose').addEventListener('click', closeMap);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) closeMap(); });
  const syncUp = () => { upBtn.classList.toggle('on', northUp); upBtn.setAttribute('aria-pressed', String(northUp)); upBtn.textContent = northUp ? '🧭 Minimap: north up' : '🧭 Minimap: turns with camera'; };
  syncUp();
  upBtn.addEventListener('click', () => {
    northUp = !northUp; syncUp(); wait = 0;
    try { localStorage.setItem('driftwood.mapNorthUp', northUp ? '1' : '0'); } catch { /* not remembered this time */ }
  });
  legendEl.innerHTML = LEGEND.map(([ic, name]) => `<span class="lg"><b class="${/^[0-9★●▲]$/.test(ic) ? 'sym' : ''}">${ic}</b>${name}</span>`).join('');
  bigCv.addEventListener('click', (e) => { // tap a place, a plot, a player or Bo: its name
    if (!bigFit) return;
    const rc = bigCv.getBoundingClientRect ? bigCv.getBoundingClientRect() : { left: 0, top: 0 };
    const x = e.clientX - rc.left, y = e.clientY - rc.top;
    let best = null, bd = 22;
    for (const ht of hits) { const d = Math.hypot(ht.x - x, ht.y - y); if (d < bd) { bd = d; best = ht; } }
    if (!best) { tip.classList.remove('show'); return; }
    tip.textContent = best.name; tip.style.left = `${best.x}px`; tip.style.top = `${best.y}px`; tip.classList.add('show');
  });
  for (const t of ['pointerdown', 'wheel']) panel.addEventListener(t, (e) => e.stopPropagation());

  function update(dt) {
    const hide = myRoom !== null;
    root.classList.toggle('hidden', hide);
    if (hide && open) closeMap();
    root.classList.toggle('night', (cur.night || 0) > 0.5);
    if (!cv.width) fit();
    if (!hide && (wait -= dt) <= 0) {
      wait = 1 / 15;
      const w = cv.width, h = cv.height;
      drawMap(cv.getContext('2d'), w, h, player.position.x, player.position.z, w / VIEW, camRot(), false);
    }
    if (open && bigFit && (bigWait -= dt) <= 0) {
      bigWait = 1 / 8;
      const ctx = bigCv.getContext('2d');
      ctx.save(); ctx.scale(dpr, dpr); drawMap(ctx, bigFit.W, bigFit.H, bigFit.cx, bigFit.cz, bigFit.s, 0, true); ctx.restore();
    }
  }
  return { update, refresh: () => { drawBase(); wait = 0; }, openMap, closeMap, get open() { return open; }, get northUp() { return northUp; }, places, hits };
})();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  elapsed += dt;
  evalTime(dt); applyTime();
  clockEl.textContent = clockText();
  sunEl.textContent = `Sunrise ${hhmm(sunToday.rise)} · Sunset ${hhmm(sunToday.set)}`;

  updateHover();
  updateSeats();
  updatePlayer(dt, elapsed);
  updateItems(dt, elapsed);
  updateBugs(dt, elapsed);
  beachLife(dt, elapsed);
  updateGardens(dt);
  updateNet(dt, elapsed);
  updateBikes(dt, elapsed);
  updateBalloon(dt, elapsed);
  updateBananas(dt, elapsed);
  pond(dt, elapsed);
  dolphins(dt, elapsed);
  buoys(elapsed);
  festival(elapsed);
  restaurant(dt, elapsed);
  updateWorld(dt, elapsed);
  updateNpc(dt);
  updateShopkeepers(dt);
  updateDialogue(dt);
  updateBo(dt);
  updateRides(dt, elapsed);
  updateTownLights(elapsed);
  updatePetals(elapsed);
  scenery.updateDesert(nowMs() / 1000, cur.lamp);
  updateSailboats(dt);
  for (let i = transients.length - 1; i >= 0; i--) if (!transients[i](dt, elapsed)) transients.splice(i, 1);
  updateDust(dt);

  nextEvent -= dt;
  if (nextEvent <= 0) { triggerEvent(); nextEvent = rr(5, 9); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

  updateCamera(dt);
  updateParasolFade(dt);
  minimap.update(dt); // the round map in the corner (and the full map while it's open), after the camera turned
  updateVolley(dt, elapsed); // after the players and the camera: jumps, the ball, the floating buttons
  updatePiano(dt, elapsed); // the piano's music, keys, hearts, lights, its Play circle and the pianist's name
  updateSeatBubbles(); // after the camera moved, so the circles sit exactly over their seats
  updateDoorBubbles();
  updateBikeBubble();
  updateBalloonBubbles();
  updateBananaBubbles();
  updateRotHandle();
  updateGardenButton();
  renderer.render(myRoom !== null ? roomScene : scene, camera);
}
evalTime(0); applyTime();
requestAnimationFrame(frame);
