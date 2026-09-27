/* The live house. Loaded by house.js only when it is worth it (see the gate there).
   Camera, lens and target are the Blender ones from brand/house.py, converted to glTF axes (Blender Y -> -Z,
   Blender Z -> Y), so the first live frame sits exactly where the poster sat.

   v4 (2026-09-22): ONE INSTANCED MESH. Every fragment is an instance of one bevelled unit box; position, rotation,
   scale, colour, roughness, metalness and studio share are per-instance and live in flat Float32Arrays. The frame
   loop writes instanceMatrix.array in place (no Object3D, no per-frame allocation), the way the Wing sculpture
   engine does at ~7,000 instances. Draw calls: 2 (fragments + contact shadow), whatever the fragment count.

   DATA. assets/house-shapes.json is the per-instance table. The adapter below (readTable) accepts the current
   format (n, frags[{name,s,b,role,v}], targets{form:[{p,k,r,c}]}) and the flat-array contract the geometry
   rebuild is moving to (any of those columns as one flat Float32 list is also fine). Blender axes in, three axes
   out. If the table names a `geometry` file, that glTF's first mesh is the shared fragment (expected as a unit
   box centred on the origin); otherwise a procedural chamfered cube is used, so this file has no Draco/glTF
   dependency in the default path. `?frags=N` on the URL splits the fragments into a grid of roughly N cells for
   stress testing (every cell keeps its parent's colour, role and formation travel).

   PROGRAM. Each homepage section names the formation it resolves to (PROGRAM below). Scroll is one continuous
   value; every fragment reads its own staggered slice of it, so a transition scrubs both ways, moves as a wave
   rather than a block, and settles when the reader stops. In the hero the house sits in the page; as the hero
   scrolls away it flies up into the nav and PARKS AS THE LOGO (v5, 2026-09-22): the static mark fades and the
   live piece sits in its place, still breathing, still letting blocks out through the door, and re-forming per
   section. The logo and the piece are one object. Hovering the logo pushes its fragments the same way the hero
   does. On phones, with reduced motion, or on inner pages, the flat mark (assets/logo-mark.svg, generated from
   the same house by brand/mark.py) stands in.

   FEEL. Untouched, the piece performs: the four blocks ride out through the door, a slow breath wave rolls
   across the fragments every few seconds, the rig sways. Over the hero the pointer takes over: fragments near
   the hand push away on a spring (press and hold gathers them instead) and settle back when the hand leaves.
   The idle show fades while the visitor is engaged and returns a moment after.

   prefers-reduced-motion and phones never reach this file: house.js keeps the poster. */
import * as THREE from 'three';

const CYCLE = 24;             // seconds for one block to travel the whole arc in the house state
const POINTER_YAW = 0.16;     // radians of lean toward the pointer, either way
const POINTER_PITCH = 0.06;
const SWAY = 0.035;           // idle yaw sway, radians
const JIT_FORM = 0.25;        // brand/house.py JIT_FORM: jitter outside the house formation
const FLOOR = 0.58;           // brand/house.py FLOOR: studio dome brightness straight down
const RED_ROUGH = 0.08;       // live-only: the lacquer's highlight under NeutralToneMapping peaks hotter than AgX's, so it is a touch rougher
const RED_ENV = 0.28;         // how much studio the lacquer red reflects live (0.45 ran hotter than the poster's deep red)
const CHAMFER = 0.08;         // bevel of the shared unit fragment, as a share of its side (contract: 0.08)

// pointer field (world units in the rig's frame)
const PUSH_R = 1.15;          // radius of the hand's influence
const PUSH_F = 0.34;          // how far a fragment right under the hand moves
const GATHER_F = 0.5;         // press and hold: fragments come toward the hand instead (share of PUSH_F, capped so they never cross it)
const SPRING_K = 70, SPRING_C = 10;   // the spring every fragment sits on (slightly under-damped: a small overshoot, then rest)
const BREATH_EVERY = 7.5, BREATH_LEN = 2.2, BREATH_H = 0.07;   // the idle wave: how often, how long, how high

// house.py stage(): camera (9.8,-11.6,4.7) lens 105 on a 36mm sensor, target (1.05,-0.40,1.50), render 1500x1150
const CAM_POS = new THREE.Vector3(9.8, 4.7, 11.6);
const CAM_TGT = new THREE.Vector3(1.05, 1.50, 0.40);
const HFOV = 2 * Math.atan(18 / 105);
// poster.py prints this: the alpha crop of the full frame, padded to the page's 1400:1309 box
const CROP = { x: -7, y: -175, w: 1410, h: 1318 };   // v2 poster (brand/PIECE_CONTRACT.md)

// brand/house.py COLORS (linear) and SURF (metalness, roughness), kept in step by hand
const COLORS = [[0.062, 0.074, 0.094], [0.030, 0.037, 0.050], [0.014, 0.020, 0.036], [0.34, 0.038, 0.040]];   // red opened a touch: AgX in the poster desaturates it, Neutral here does not
const SURF = [[0.78, 0.34], [0.80, 0.36], [0.85, 0.28], [0.40, 0.30]];
// brand/house.py SOFTBOXES: (blender direction, half-width deg, half-height deg, intensity, tint)
const SOFTBOXES = [
  [[4.6, -5.6, 6.2], 30, 20, 3.5, [1, 1, 1]],
  [[7.0, -3.0, 1.2], 5, 42, 9.0, [0.98, 0.99, 1]],
  [[-5.2, 4.8, 3.8], 5, 34, 6.5, [0.92, 0.95, 1]],
  [[0, 0, 1], 48, 7, 3.2, [1, 1, 1]],
  [[3.5, -6.5, -0.7], 46, 6, 2.4, [0.96, 0.97, 1]],
  [[-5, -5, 1.6], 24, 16, 1.8, [0.95, 0.96, 1]],
];

// the homepage program: which formation each section resolves to. A section not listed keeps the previous form.
const PROGRAM = [
  { sel: '#how', form: 'message' },      // 02 text a photo, get a price back
  { sel: '#proof', form: 'truck' },      // 02b the reviews: the truck that showed up
  { sel: '#services', form: 'couch' },   // 03 what we take
  { sel: '#areas', form: 'map' },        // 04 six cities
  { sel: '#faq', form: 'fridge' },       // 05 what do you take, can it go today
  { sel: '#contact', form: 'house' },    // 06 the house again, where the reader arrives
];   // kept in page order: readScroll walks this list top-down and stops at the first section still below the fold
// the dock: the nav's brand mark (#nav .brand .mark). size is the canvas box (wider than the mark: the piece
// overhangs its slot the way the house overhangs its plinth); lift raises the visual centre so the house body,
// not the shadow, sits on the mark's centre.
const DOCK = { sel: '#nav .brand .mark', size: 62, lift: 3, shift: -5 };   // shift: the blocks leave to the right, so the box sits a hair left of the slot and they never cross the wordmark

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = ((h ^ (h >>> 13)) * 1274126177) | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- the table
// Reads either the current per-object JSON or a flat-array table into typed columns, in THREE axes.
function column(src, key, stride, n) {
  // src is a list of records ({key: [..]}) or an object of flat arrays ({key: [...]}); both come back as Float32Array(n*stride)
  const out = new Float32Array(n * stride);
  if (Array.isArray(src)) {
    for (let i = 0; i < n; i++) { const v = src[i][key]; if (stride === 1) out[i] = v; else for (let j = 0; j < stride; j++) out[i * stride + j] = v[j]; }
  } else if (src && src[key]) {
    const v = src[key];
    if (v.length === n * stride) out.set(v);
    else for (let i = 0; i < n; i++) { const r = v[i]; if (stride === 1) out[i] = r; else for (let j = 0; j < stride; j++) out[i * stride + j] = r[j]; }
  }
  return out;
}
function strings(src, key, n, fallback) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = Array.isArray(src) ? (src[i][key] ?? fallback) : (src && src[key] ? src[key][i] : fallback);
  return out;
}
function readTable(raw) {
  if (raw.v >= 2 && raw.f) return readTableV2(raw);
  const n = raw.n ?? (Array.isArray(raw.frags) ? raw.frags.length : raw.frags?.s?.length / 3);
  const frags = raw.frags;
  const forms = raw.targets || raw.forms;
  const names = Object.keys(forms);
  const size = column(frags, 's', 3, n), vari = column(frags, 'v', 2, n);
  const role = strings(frags, 'role', n, 'wall'), name = strings(frags, 'name', n, '');
  const T = {};
  for (const f of names) {
    const src = forms[f];
    const p = column(src, 'p', 3, n), r = column(src, 'r', 4, n), k = column(src, 'k', 3, n), c = column(src, 'c', 1, n);
    // Blender -> three: (x, y, z) -> (x, z, -y); scale ratio axes swap only; quaternion vector part like a vector
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i4 = i * 4;
      const py = p[i3 + 1]; p[i3 + 1] = p[i3 + 2]; p[i3 + 2] = -py;
      const ry = r[i4 + 1]; r[i4 + 1] = r[i4 + 2]; r[i4 + 2] = -ry;
      const ky = k[i3 + 1]; k[i3 + 1] = k[i3 + 2]; k[i3 + 2] = ky;
      if (!(k[i3] || k[i3 + 1] || k[i3 + 2])) { k[i3] = k[i3 + 1] = k[i3 + 2] = 1; }
    }
    T[f] = { p, r, k, c };
  }
  for (let i = 0; i < n; i++) { const i3 = i * 3, sy = size[i3 + 1]; size[i3 + 1] = size[i3 + 2]; size[i3 + 2] = sy; }
  return { n, size, vari, role, name, forms: names, T, geometry: raw.geometry || null };
}
// brand/PIECE_CONTRACT.md v2: quantised flat int arrays, absolute size per formation, lift clusters by `group`
function readTableV2(raw) {
  const n = raw.n, q = raw.q, forms = raw.forms;
  const size = new Float32Array(n * 3), vari = new Float32Array(n * 2), role = new Array(n), name = new Array(n).fill('');
  const group = Int8Array.from(raw.group || new Array(n).fill(0));
  for (let i = 0; i < n; i++) { role[i] = raw.roles[raw.role[i]] || 'wall'; vari[i * 2] = raw.jit[i * 2] / q.j; vari[i * 2 + 1] = raw.jit[i * 2 + 1] / q.j; }
  const H = raw.f[forms[0]];
  for (let i = 0; i < n; i++) { const i3 = i * 3; size[i3] = H.s[i3] / q.s; size[i3 + 1] = H.s[i3 + 2] / q.s; size[i3 + 2] = H.s[i3 + 1] / q.s; }
  const T = {};
  for (const f of forms) {
    const S = raw.f[f];
    const p = new Float32Array(n * 3), r = new Float32Array(n * 4), k = new Float32Array(n * 3), c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i4 = i * 4;
      p[i3] = S.p[i3] / q.p; p[i3 + 1] = S.p[i3 + 2] / q.p; p[i3 + 2] = -S.p[i3 + 1] / q.p;
      let x = S.r[i4] / q.r, y = S.r[i4 + 2] / q.r, z = -S.r[i4 + 1] / q.r, w = S.r[i4 + 3] / q.r;
      const l = Math.hypot(x, y, z, w) || 1; r[i4] = x / l; r[i4 + 1] = y / l; r[i4 + 2] = z / l; r[i4 + 3] = w / l;
      // the runtime scales the house size by a ratio per form, so absolute sizes become ratios here
      k[i3] = (S.s[i3] / q.s) / (size[i3] || 1e-6); k[i3 + 1] = (S.s[i3 + 2] / q.s) / (size[i3 + 1] || 1e-6); k[i3 + 2] = (S.s[i3 + 1] / q.s) / (size[i3 + 2] || 1e-6);
      c[i] = S.c[i];
    }
    T[f] = { p, r, k, c };
  }
  return { n, size, vari, role, name, forms, T, geometry: null, group, colors: raw.colors, surf: raw.surf };
}

// Stress split: every fragment becomes an a x b x c grid of cells (with a seam), so the piece can be tested at the
// density the geometry rebuild targets before that data lands. Cells inherit colour, role and travel.
function subdivide(tab, want) {
  const n = tab.n;
  let lo = 0.02, hi = 2, cell = 0.3;
  const countAt = (cs) => { let m = 0; for (let i = 0; i < n; i++) { const i3 = i * 3; m += Math.max(1, Math.round(tab.size[i3] / cs)) * Math.max(1, Math.round(tab.size[i3 + 1] / cs)) * Math.max(1, Math.round(tab.size[i3 + 2] / cs)); } return m; };
  for (let it = 0; it < 40; it++) { cell = (lo + hi) / 2; if (countAt(cell) > want) lo = cell; else hi = cell; }
  const split = [];
  let m = 0;
  for (let i = 0; i < n; i++) { const i3 = i * 3; const d = [Math.max(1, Math.round(tab.size[i3] / cell)), Math.max(1, Math.round(tab.size[i3 + 1] / cell)), Math.max(1, Math.round(tab.size[i3 + 2] / cell))]; split.push(d); m += d[0] * d[1] * d[2]; }
  const GAP = 0.014;
  const size = new Float32Array(m * 3), vari = new Float32Array(m * 2), role = new Array(m), name = new Array(m), parent = new Int32Array(m), off = new Float32Array(m * 3);
  const group = tab.group ? new Int8Array(m) : null;
  const T = {};
  for (const f of tab.forms) T[f] = { p: new Float32Array(m * 3), r: new Float32Array(m * 4), k: new Float32Array(m * 3), c: new Float32Array(m) };
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  let j = 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3, [a, b, c] = split[i];
    for (let x = 0; x < a; x++) for (let y = 0; y < b; y++) for (let z = 0; z < c; z++) {
      const j3 = j * 3, j4 = j * 4;
      const ox = ((x + 0.5) / a - 0.5) * tab.size[i3], oy = ((y + 0.5) / b - 0.5) * tab.size[i3 + 1], oz = ((z + 0.5) / c - 0.5) * tab.size[i3 + 2];
      size[j3] = tab.size[i3] / a - (a > 1 ? GAP : 0); size[j3 + 1] = tab.size[i3 + 1] / b - (b > 1 ? GAP : 0); size[j3 + 2] = tab.size[i3 + 2] / c - (c > 1 ? GAP : 0);
      vari[j * 2] = tab.vari[i * 2] + (hash(j, 21) - 0.5) * 0.03; vari[j * 2 + 1] = tab.vari[i * 2 + 1] + (hash(j, 22) - 0.5) * 0.03;
      role[j] = tab.role[i]; name[j] = tab.name[i]; parent[j] = i; off[j3] = ox; off[j3 + 1] = oy; off[j3 + 2] = oz;
      if (group) group[j] = tab.group[i];
      for (const f of tab.forms) {
        const S = tab.T[f], D = T[f];
        q.set(S.r[i * 4], S.r[i * 4 + 1], S.r[i * 4 + 2], S.r[i * 4 + 3]);
        v.set(ox * S.k[i3], oy * S.k[i3 + 1], oz * S.k[i3 + 2]).applyQuaternion(q);
        D.p[j3] = S.p[i3] + v.x; D.p[j3 + 1] = S.p[i3 + 1] + v.y; D.p[j3 + 2] = S.p[i3 + 2] + v.z;
        D.r[j4] = q.x; D.r[j4 + 1] = q.y; D.r[j4 + 2] = q.z; D.r[j4 + 3] = q.w;
        D.k[j3] = S.k[i3]; D.k[j3 + 1] = S.k[i3 + 1]; D.k[j3 + 2] = S.k[i3 + 2];
        D.c[j] = S.c[i];
      }
      j++;
    }
  }
  return { n: m, size, vari, role, name, forms: tab.forms, T, geometry: tab.geometry, parent, off, parentSize: tab.size, group, colors: tab.colors, surf: tab.surf };
}

// ---------------------------------------------------------------- geometry, studio, shadow
function chamferedCube(c) {
  // a unit cube with every edge bevelled: 6 inset faces, 12 edge strips, 8 corner triangles. Flat shaded.
  const P = [], h = 0.5 - c;
  const push = (...pts) => {
    // any polygon, wound so its normal points away from the origin
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length, cz = pts.reduce((s, p) => s + p[2], 0) / pts.length;
    const ax = pts[1][0] - pts[0][0], ay = pts[1][1] - pts[0][1], az = pts[1][2] - pts[0][2];
    const bx = pts[2][0] - pts[0][0], by = pts[2][1] - pts[0][1], bz = pts[2][2] - pts[0][2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * cx + ny * cy + nz * cz < 0) pts.reverse();
    for (let i = 1; i + 1 < pts.length; i++) P.push(...pts[0], ...pts[i], ...pts[i + 1]);
  };
  const pt = (a, va, b, vb, cc, vc) => { const o = [0, 0, 0]; o[a] = va; o[b] = vb; o[cc] = vc; return o; };
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, cc = (a + 2) % 3;
    for (const s of [-1, 1]) push(pt(a, s * 0.5, b, -h, cc, -h), pt(a, s * 0.5, b, h, cc, -h), pt(a, s * 0.5, b, h, cc, h), pt(a, s * 0.5, b, -h, cc, h));
    for (const sa of [-1, 1]) for (const sb of [-1, 1])
      push(pt(a, sa * 0.5, b, sb * h, cc, -h), pt(a, sa * 0.5, b, sb * h, cc, h), pt(a, sa * h, b, sb * 0.5, cc, h), pt(a, sa * h, b, sb * 0.5, cc, -h));
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    push([sx * 0.5, sy * h, sz * h], [sx * h, sy * 0.5, sz * h], [sx * h, sy * h, sz * 0.5]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

function studioTexture() {
  // the same procedural HDRI as brand/house.py write_studio(): three.js equirect, +Y up
  const W = 512, H = 256, data = new Float32Array(W * H * 4);
  const b2t = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
  const boxes = SOFTBOXES.map(([d, hw, hh, i, tint]) => {
    const c = b2t(d).normalize();
    const up = Math.abs(c.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(up, c).normalize();
    const t2 = new THREE.Vector3().crossVectors(c, t1);
    return { c, t1, t2, hw, hh, i, tint };
  });
  const dir = new THREE.Vector3();
  for (let y = 0; y < H; y++) {
    const el = ((y + 0.5) / H - 0.5) * Math.PI;                 // row 0 = straight down
    for (let x = 0; x < W; x++) {
      const az = ((x + 0.5) / W - 0.5) * 2 * Math.PI;           // three: u = atan2(z, x) / 2pi + 0.5
      dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      const t = dir.y;
      const sky = t < 0 ? 0.42 + (FLOOR - 0.42) * Math.pow(-t, 0.7) : 0.42 + (0.20 - 0.42) * Math.pow(t, 0.8);
      let r = sky * 0.96, g = sky * 0.975, b = sky;
      for (const bx of boxes) {
        const dot = dir.dot(bx.c);
        if (dot <= 0) continue;
        const a1 = THREE.MathUtils.radToDeg(Math.atan2(dir.dot(bx.t1), Math.max(dot, 1e-3)));
        const a2 = THREE.MathUtils.radToDeg(Math.atan2(dir.dot(bx.t2), Math.max(dot, 1e-3)));
        const m1 = clamp((bx.hw - Math.abs(a1)) / (bx.hw * 0.35), 0, 1);
        const m2 = clamp((bx.hh - Math.abs(a2)) / (bx.hh * 0.35), 0, 1);
        let m = (m1 * m1 * (3 - 2 * m1)) * (m2 * m2 * (3 - 2 * m2));
        m *= 1 - 0.35 * clamp((a2 / Math.max(bx.hh, 1e-3)) * 0.5 + 0.5, 0, 1);
        r += m * bx.i * bx.tint[0]; g += m * bx.i * bx.tint[1]; b += m * bx.i * bx.tint[2];
      }
      const o = (y * W + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(14,20,32,0.55)');
  grd.addColorStop(0.45, 'rgba(14,20,32,0.22)');
  grd.addColorStop(0.8, 'rgba(14,20,32,0.05)');
  grd.addColorStop(1, 'rgba(14,20,32,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

async function fragmentGeometry(file) {
  if (!file) return chamferedCube(CHAMFER);
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
    const draco = new DRACOLoader(); draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/');
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync('assets/' + file);
    let geo = null;
    gltf.scene.traverse((o) => { if (!geo && o.isMesh) geo = o.geometry; });
    if (geo) return geo;
  } catch (e) { console.warn('house: fragment geometry fell back to the built-in cube', e); }
  return chamferedCube(CHAMFER);
}

// ---------------------------------------------------------------- init
export async function init(piece, opts = {}) {
  const program = opts.program || PROGRAM;
  const dockCfg = opts.dock === undefined ? DOCK : opts.dock;
  const dockEl = dockCfg && document.querySelector(dockCfg.sel);
  const companion = dockEl ? dockCfg : null;
  const nav = dockEl && dockEl.closest('#nav');
  const params = new URLSearchParams(location.search);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(studioTexture()).texture;
  scene.environmentIntensity = 2.0;
  pmrem.dispose();

  const VFOV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HFOV / 2) * 1150 / 1500));
  const camera = new THREE.PerspectiveCamera(VFOV, 1500 / 1150, 1, 60);
  camera.position.copy(CAM_POS);
  camera.lookAt(CAM_TGT);
  camera.setViewOffset(1500, 1150, CROP.x, CROP.y, CROP.w, CROP.h);

  // the Blender area lamps, same places: they carry the diffuse, the studio carries the reflections
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(4.6, 6.2, 5.6); key.target.position.copy(CAM_TGT); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(-5.2, 3.8, -4.8); rim.target.position.copy(CAM_TGT); scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-4.8, 2.2, 5.4); fill.target.position.copy(CAM_TGT); scene.add(fill, fill.target);

  // ---- the table ----
  const raw = await fetch('assets/house-shapes.json?v=7').then((r) => r.json());
  let tab = readTable(raw);
  const want = parseInt(params.get('frags') || '0', 10);
  if (want > tab.n) tab = subdivide(tab, want);
  const geo = await fragmentGeometry(tab.geometry);
  const N = tab.n, FORMS = tab.forms;
  const T = tab.T;

  const rig = new THREE.Group();          // the pivot the pointer lean and sway act on
  rig.position.set(0.9, 0.9, 0);
  const house = new THREE.Group();        // the fragments' frame (house at the origin, same as Blender)
  house.position.set(-0.9, -0.9, 0);
  rig.add(house);
  scene.add(rig);

  // contact shadow under the plinth; fades as the house comes apart
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.09, 0.002, 0);
  shadow.scale.set(3.0, 1.25, 1);
  shadow.renderOrder = -1;
  house.add(shadow);

  // ---- one material for every fragment; roughness, metalness and studio share ride per-instance attributes ----
  const aRough = new Float32Array(N), aMetal = new Float32Array(N), aEnv = new Float32Array(N);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 1, clearcoat: 0.2, clearcoatRoughness: 0.16 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRough;\nattribute float aMetal;\nattribute float aEnv;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = vec3(aRough, aMetal, aEnv);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/\benvMapIntensity\b/g, '(envMapIntensity * vSurf.z)'));
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  geo.setAttribute('aRough', new THREE.InstancedBufferAttribute(aRough, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aMetal', new THREE.InstancedBufferAttribute(aMetal, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aEnv', new THREE.InstancedBufferAttribute(aEnv, 1).setUsage(THREE.DynamicDrawUsage));
  house.add(mesh);

  // ---- per-form columns, fully resolved: position, quaternion, full scale, colour, (rough, metal, env) ----
  const PAL = (tab.colors || COLORS).map((c, i) => (i === 3 ? COLORS[3] : c));   // the red stays the live-tuned one (Neutral vs AgX)
  const SRF = tab.surf || SURF;
  const F = {};
  for (const f of FORMS) {
    const S = T[f], jit = f === 'house' ? 1 : JIT_FORM;
    const sc = new Float32Array(N * 3), col = new Float32Array(N * 3), srf = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const i3 = i * 3, c = S.c[i] | 0, v0 = tab.vari[i * 2], v1 = tab.vari[i * 2 + 1];
      sc[i3] = tab.size[i3] * S.k[i3]; sc[i3 + 1] = tab.size[i3 + 1] * S.k[i3 + 1]; sc[i3 + 2] = tab.size[i3 + 2] * S.k[i3 + 2];
      const l = 1 + v0 * 2.2 * jit;
      col[i3] = PAL[c][0] * l; col[i3 + 1] = PAL[c][1] * l; col[i3 + 2] = PAL[c][2] * l;
      srf[i3] = Math.max(0.06, SRF[c][1] + v1 * jit + (c === 3 ? RED_ROUGH : 0)); srf[i3 + 1] = SRF[c][0]; srf[i3 + 2] = c === 3 ? RED_ENV : 1;
    }
    F[f] = { p: S.p, r: S.r, s: sc, col, srf };
  }

  // ---- static per-fragment data ----
  const stag = new Float32Array(N);        // where in the transition this fragment moves (0 first, 1 last)
  const fly = new Float32Array(N * 3);     // the arc it takes between formations
  const spin = new Float32Array(N * 4);    // axis xyz + amount
  const phase = new Float32Array(N);
  const push = new Float32Array(N * 3), vel = new Float32Array(N * 3);   // the spring
  const grp = new Int8Array(N).fill(-1);   // which travelling block this fragment belongs to, or -1
  const off = new Float32Array(N * 3);     // offset from that block's centre, block frame
  for (let i = 0; i < N; i++) {
    const i3 = i * 3, role = tab.role[i];
    const order = { lift: 0.0, inside: 0.12, roof: 0.2, wall: 0.45, gable: 0.55, base: 0.75 }[role] ?? 0.5;
    stag[i] = clamp(order + hash(i, 1) * 0.22, 0, 0.95);
    const v = new THREE.Vector3(hash(i, 2) - 0.5, 0.35 + hash(i, 3) * 0.5, hash(i, 4) - 0.5).normalize().multiplyScalar(0.5 + hash(i, 5) * 0.7);
    fly[i3] = v.x; fly[i3 + 1] = v.y; fly[i3 + 2] = v.z;
    v.set(hash(i, 6) - 0.5, hash(i, 7) - 0.5, hash(i, 8) - 0.5).normalize();
    spin[i * 4] = v.x; spin[i * 4 + 1] = v.y; spin[i * 4 + 2] = v.z; spin[i * 4 + 3] = (0.6 + hash(i, 9)) * (role === 'lift' ? 0.6 : 1);
    phase[i] = hash(i, 10) * Math.PI * 2;
    const m = /^lift(\d)$/.exec(tab.name[i] || '');
    if (tab.group) { if (tab.group[i] >= 1 && tab.group[i] <= 4) grp[i] = tab.group[i] - 1; }
    else if (m) grp[i] = +m[1];
  }
  // each travelling block is a cluster: its centre is the members' centroid in the house table, and every member keeps
  // its offset from that centre (v1 single-mesh lifts are a cluster of one, offset zero)
  const blkC = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, n: 0, ext: 0 }));
  { const H = T.house.p, S = tab.size;
    for (let i = 0; i < N; i++) { const g = grp[i]; if (g < 0) continue; const b = blkC[g], i3 = i * 3; b.x += H[i3]; b.y += H[i3 + 1]; b.z += H[i3 + 2]; b.n++; }
    for (const b of blkC) if (b.n) { b.x /= b.n; b.y /= b.n; b.z /= b.n; }
    for (let i = 0; i < N; i++) { const g = grp[i]; if (g < 0) continue; const b = blkC[g], i3 = i * 3;
      off[i3] = H[i3] - b.x; off[i3 + 1] = H[i3 + 1] - b.y; off[i3 + 2] = H[i3 + 2] - b.z;
      b.ext = Math.max(b.ext, Math.abs(off[i3]) * 2 + S[i3], Math.abs(off[i3 + 1]) * 2 + S[i3 + 1], Math.abs(off[i3 + 2]) * 2 + S[i3 + 2]); }
  }

  // ---- the four travelling blocks: the same arc out through the door, animated only in the house state ----
  let path = null, homeU = [], sizeAt = () => 1, ext = [];
  if (blkC.every((b) => b.n > 0)) {
    const inside = new THREE.Vector3(0.72, 0.40, 0.02);
    const door = new THREE.Vector3(1.32, 0.62, 0.02);
    const l = blkC.map((b) => new THREE.Vector3(b.x, b.y, b.z));
    const end = l[3].clone().add(l[3].clone().sub(l[2]).multiplyScalar(1.3));
    const pts = [inside, door, l[0], l[1], l[2], l[3], end];
    path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const n = pts.length - 1;
    homeU = [2 / n, 3 / n, 4 / n, 5 / n];
    ext = blkC.map((b) => b.ext);
    sizeAt = (u) => clamp(ext[0] + (u - homeU[0]) * (ext[3] - ext[0]) / (homeU[3] - homeU[0]), ext[3] * 0.55, ext[0] * 1.2);
  }
  const warp = (u) => {
    if (u < 0.10) return u * 0.6;
    if (u < 0.22) return 0.06 + (u - 0.10) * 0.5;
    const v = (u - 0.22) / 0.78;
    return 0.12 + 0.88 * (1 - Math.pow(1 - v, 1.6));
  };
  // per-block state, refreshed once per frame (not per fragment): centre, rotation, scale factor, visibility
  const blk = [0, 1, 2, 3].map(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), k: 1, vis: 1, pullX: 0, pullY: 0, pullZ: 0 }));

  // ---- canvas in the piece, sized to the poster's aspect ----
  const canvas = renderer.domElement;
  piece.appendChild(canvas);
  let docked = 0;   // 0 = in the hero, 1 = companion in the corner
  let bufW = 0;
  function resize() {
    const w = piece.clientWidth, h = piece.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); bufW = w;
    measure();
    if (docked) applyDock(docked, true);
  }

  // docking: the canvas leaves the hero box and settles on the nav's brand mark, scrubbed by scroll.
  // Layout is READ only on scroll and resize (measure), never in the frame loop, and the style is WRITTEN only when it changes.
  const M = { r: null, mark: null, stops: [], d: null };
  const stops = program.map((s) => ({ el: document.querySelector(s.sel), form: s.form })).filter((s) => s.el && T[s.form]);
  stops.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);   // page order, whatever order the list came in
  function measure() {
    M.r = piece.getBoundingClientRect();
    M.mark = dockEl ? dockEl.getBoundingClientRect() : null;
    M.stops = stops.map((s) => s.el.getBoundingClientRect().top);
  }
  function dockRect() {
    const s = companion.size, r = M.r, ar = r.width / r.height, m = M.mark;
    const w1 = s, h1 = s / ar;
    const x1 = m.left + m.width / 2 - w1 / 2 + (companion.shift || 0), y1 = m.top + m.height / 2 - h1 / 2 - companion.lift;
    return { w1, h1, x1, y1, ok: !!m && m.width > 0 };
  }
  let lastCss = '';
  function applyDock(k, force) {
    // (the css string is compared, so a settled companion costs nothing until something in it changes)
    if (!companion) return;
    if (k <= 0.001) {
      if (docked > 0.001 || force) {
        if (canvas.parentNode !== piece) piece.appendChild(canvas);   // back in the hero box: the page's own .piece rules apply again
        canvas.style.cssText = ''; lastCss = ''; M.d = null;
        if (nav) nav.classList.remove('piece-parked');
        if (bufW !== M.r.width) { renderer.setSize(Math.round(M.r.width), Math.round(M.r.height), false); bufW = M.r.width; }
      }
      docked = 0; return;
    }
    // while docked the canvas lives on <body>: the hero is its own stacking context (z-index) on this page, so a
    // fixed canvas left inside it would paint UNDER every later section. The WebGL context survives the move.
    if (canvas.parentNode !== document.body) document.body.appendChild(canvas);
    const r = M.r, d = dockRect();
    // the flight: ease the box, and arc it a little above the straight line so it lifts before it lands
    const e = k * k * (3 - 2 * k), arc = Math.sin(Math.PI * e) * 40;
    const w = r.width + (d.w1 - r.width) * e, h = r.height + (d.h1 - r.height) * e;
    const x = r.left + (d.x1 - r.left) * e, y = r.top + (d.y1 - r.top) * e - arc;
    const op = d.ok ? 1 : 1 - e;
    M.d = { x, y, w, h };
    // above the nav bar (z 50) so the parked piece paints over the faded mark; pointer-events none so the brand link stays a link
    const css = `position:fixed;inset:auto;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px !important;height:${h.toFixed(1)}px !important;z-index:51;pointer-events:none;opacity:${op.toFixed(3)};display:block`;
    if (css !== lastCss) { canvas.style.cssText = css; lastCss = css; }
    if (nav) { const parked = k > 0.6; if (parked !== nav.classList.contains('piece-parked')) nav.classList.toggle('piece-parked', parked); }
    // the drawing buffer follows the box in coarse steps and lands exactly at either end, so it is not reallocated every frame
    const settled = k > 0.995;
    if ((settled && Math.abs(w - bufW) > 1) || Math.abs(w - bufW) > 48) { renderer.setSize(Math.round(w), Math.round(h), false); bufW = w; }
    docked = k;
  }

  // ---- the program: scroll -> which two formations, and how far between them ----
  let fromForm = 'house', toForm = 'house', mix = 0, dockWant = 0, heroGone = 0;
  // parked on the nav, the logo stays the house: at 62px the other formations read as grey lumps, and a brand mark
  // that is a lump for most of the scroll is a worse mark. ?story=1 turns the per-section re-forming back on to compare.
  const story = params.has('story') || !companion;
  function readScroll() {
    measure();
    const r = M.r;
    heroGone = smooth(innerHeight * 0.55, -r.height * 0.2, r.bottom);
    dockWant = companion ? heroGone : 0;
    let a = 'house', b = 'house', m = 0;
    for (let i = 0; story && i < stops.length; i++) {
      const k = smooth(innerHeight * 0.85, innerHeight * 0.35, M.stops[i]);
      if (k <= 0) break;
      a = b; b = stops[i].form; m = k;
      if (k < 1) break;
    }
    if (m >= 1) { a = b; m = 0; }
    fromForm = a; toForm = b; mix = m;
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  // ---- pointer: lean over the whole window; the field acts while the hand is over the hero ----
  let px = 0, py = 0, yaw = 0, pitch = 0, over = 0, wantOver = 0, gather = 0, wantGather = 0, lastInput = -1e9;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hit = new THREE.Vector3(), hitL = new THREE.Vector3(), camDir = new THREE.Vector3();
  const centreW = new THREE.Vector3();
  let hitOk = false;
  function pointerAt(cx, cy) {
    // while parked, the piece's box is the fixed one on the nav, not the hero slot
    const r = (docked > 0.5 && M.d) ? { left: M.d.x, top: M.d.y, width: M.d.w, height: M.d.h, right: M.d.x + M.d.w, bottom: M.d.y + M.d.h } : (M.r || piece.getBoundingClientRect());
    const pad = docked > 0.5 ? 14 : 40;
    px = clamp((cx - (r.left + r.width / 2)) / innerWidth * 2, -1, 1);
    py = clamp((cy - (r.top + r.height / 2)) / innerHeight * 2, -1, 1);
    const inside = cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
    wantOver = inside ? 1 : 0;
    if (inside) {
      lastInput = performance.now();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // a plane facing the camera through the form's middle, so the hand meets the fragments where they are
      camera.getWorldDirection(camDir);
      // house body centre is (0, 1.0, 0) in the house frame; the other formations stand at FORM_OFFSET (0.75, -0.35, 0) Blender
      house.localToWorld(centreW.set(0.75 * (1 - inHouseS), 1.0, 0.35 * (1 - inHouseS)));
      // the plane sits at the form's NEAR surface (half a body depth toward the camera), so the hand meets the faces it can see
      plane.setFromNormalAndCoplanarPoint(camDir, centreW.addScaledVector(camDir, -0.6));
      hitOk = !!ray.ray.intersectPlane(plane, hit);
      if (hitOk) house.worldToLocal(hitL.copy(hit));
    }
  }
  addEventListener('pointermove', (e) => pointerAt(e.clientX, e.clientY), { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { px = 0; py = 0; wantOver = 0; wantGather = 0; });
  let beat = 0;
  piece.addEventListener('pointerdown', (e) => { if (e.button === 0) { wantGather = 1; pointerAt(e.clientX, e.clientY); } }, { passive: true });
  addEventListener('pointerup', () => { if (wantGather) beat = 1; wantGather = 0; }, { passive: true });
  addEventListener('pointercancel', () => { wantGather = 0; }, { passive: true });

  // ---- run only while something of it is on screen and the tab is visible ----
  let visible = true, hidden = document.hidden, raf = 0, last = performance.now(), t = 0, shown = false;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting || dockWant > 0; kick(); }, { threshold: 0.02 }).observe(piece);
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; kick(); });
  addEventListener('scroll', kick, { passive: true });
  function kick() { if (!hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  const arr = mesh.instanceMatrix.array, colArr = mesh.instanceColor.array;
  const qT = new THREE.Quaternion(), vT = new THREE.Vector3(), axis = new THREE.Vector3();
  let mixS = 0, dockS = 0, showFrom = 'house', showTo = 'house', inHouseS = 1, lastWritten = -1, lastPair = '';
  let fps = 60, breathT = -BREATH_LEN, nextBreath = 3.5, bAmpLast = 0;
  const K = 0.5;   // each fragment's own transition takes this share of the whole, staggered by stag[]
  const stats = { n: N, fps: 60, forms: FORMS };
  window.__house = stats;

  function frame(now) {
    raf = 0;
    if (hidden) return;
    if (!visible && dockS < 0.001 && mixS < 0.001) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (dt > 0) { fps += (1 / dt - fps) * 0.05; stats.fps = Math.round(fps); }
    stats.breath = +bAmpLast.toFixed(4); stats.dock = +dockS.toFixed(3); stats.want = +dockWant.toFixed(3); stats.mix = +mixS.toFixed(3); stats.from = showFrom; stats.to = showTo; stats.visible = visible;
    beat = THREE.MathUtils.damp(beat, 0, 1.1, dt);
    t += dt * (1 + beat * 5);
    over = THREE.MathUtils.damp(over, wantOver, 4, dt);
    gather = THREE.MathUtils.damp(gather, wantGather, 8, dt);
    const engaged = over * smooth(2.4, 0.4, (now - lastInput) / 1000);   // the show yields while the hand is active, and comes back after a pause

    // settle toward the scroll targets rather than snapping, so the object responds and then comes to rest
    if (showTo !== toForm || showFrom !== fromForm) {
      if (showTo === fromForm) { showFrom = showTo; showTo = toForm; mixS = 0; }
      else { showFrom = fromForm; showTo = toForm; mixS = Math.min(mixS, mix); }
    }
    mixS = THREE.MathUtils.damp(mixS, mix, 6, dt);
    dockS = THREE.MathUtils.damp(dockS, dockWant, 5, dt);
    applyDock(dockS);

    // orientation: idle sway + pointer lean
    const sway = Math.sin(t * (2 * Math.PI / 11)) * SWAY;
    // parked, the lean follows the hand only while it is over the logo (a logo that turns to watch the cursor across the page is a gimmick)
    const leanK = 1 - dockS * (1 - over);
    yaw = THREE.MathUtils.damp(yaw, px * POINTER_YAW * leanK + sway, 3.2, dt);
    pitch = THREE.MathUtils.damp(pitch, py * POINTER_PITCH * leanK + Math.sin(t * (2 * Math.PI / 13)) * 0.008, 3.2, dt);
    rig.rotation.set(pitch, yaw, 0);

    const A = F[showFrom], B = F[showTo], same = showFrom === showTo;
    const inHouse = (showFrom === 'house' ? 1 - mixS : 0) + (showTo === 'house' ? mixS : 0);
    inHouseS = inHouse;
    shadow.material.opacity = inHouse;
    shadow.visible = inHouse > 0.01;

    // the travelling blocks, once per block
    if (path) for (let g = 0; g < 4; g++) {
      const b = blk[g];
      const u = warp((homeU[g] + t / CYCLE) % 1);
      b.k = sizeAt(u) / ext[g];
      b.vis = smooth(0.09, 0.20, u) * (1 - smooth(0.84, 0.94, u));
      path.getPointAt(u, b.p);
      axis.set(0.6 + g * 0.1, 1, 0.3 - g * 0.15).normalize();
      qT.setFromAxisAngle(axis, t * (0.16 + g * 0.03));
      b.q.copy(qT);
      // the whole block drifts toward the hand a little (the old pull), so the door traffic notices the visitor
      let wx = 0, wy = 0, wz = 0;
      if (hitOk && over > 0.01 && u > 0.26 && u < 0.85 && inHouse > 0.5) {
        vT.copy(hitL).sub(b.p); const dd = vT.length();
        const want = over * 0.28 * Math.exp(-dd * dd / 4.5) * (1 - g * 0.12) * inHouse;
        vT.normalize().multiplyScalar(want); wx = vT.x; wy = vT.y; wz = vT.z;
      }
      b.pullX = THREE.MathUtils.damp(b.pullX, wx, 2.4, dt); b.pullY = THREE.MathUtils.damp(b.pullY, wy, 2.4, dt); b.pullZ = THREE.MathUtils.damp(b.pullZ, wz, 2.4, dt);
    }

    // the idle breath: a band of lift that rolls across the form every few seconds, only while nobody is engaged
    if (t - breathT > nextBreath) { breathT = t; nextBreath = params.has('breath') ? BREATH_LEN : BREATH_EVERY + hash(Math.floor(t), 30) * 3; }
    const bt = (t - breathT) / BREATH_LEN;                     // 0..1 while a breath is rolling
    const breathing = bt < 1 && engaged < 0.98;
    const bFront = -0.6 + bt * 3.4, bAmp = BREATH_H * (1 - engaged) * Math.sin(Math.PI * clamp(bt, 0, 1)) * (0.6 + 0.4 * (1 - inHouse));
    const bDirX = 0.62, bDirY = 0.5, bDirZ = -0.6;
    bAmpLast = breathing ? bAmp : 0;              // the breath rolls front-left to back-right and upward

    // pointer field
    const field = hitOk && over > 0.01;
    const hx = hitL.x, hy = hitL.y, hz = hitL.z;
    const pushF = over * PUSH_F, gatherF = gather * GATHER_F;
    const sK = 1 - Math.exp(-SPRING_C * dt);
    const floatAmp = 0.012 * (1 - inHouse);                     // outside the house the fragments hover a hair, never dead still

    // colours and surfaces are rewritten only while the mix moves (or the pair changes)
    const pair = showFrom + '>' + showTo;
    const writeCol = pair !== lastPair || Math.abs(mixS - lastWritten) > 1e-5;
    if (writeCol) { lastPair = pair; lastWritten = mixS; }

    for (let i = 0; i < N; i++) {
      const i3 = i * 3, i4 = i * 4, o = i * 16;
      // this fragment's own progress through the transition, staggered
      const lt = same ? 0 : smooth(0, 1, (mixS - stag[i] * (1 - K)) / K);
      const arc = Math.sin(Math.PI * lt);

      // endpoints, with the travelling blocks substituted in the house state
      let ax = A.p[i3], ay = A.p[i3 + 1], az = A.p[i3 + 2], bx = B.p[i3], by = B.p[i3 + 1], bz = B.p[i3 + 2];
      let qax = A.r[i4], qay = A.r[i4 + 1], qaz = A.r[i4 + 2], qaw = A.r[i4 + 3], qbx = B.r[i4], qby = B.r[i4 + 1], qbz = B.r[i4 + 2], qbw = B.r[i4 + 3];
      let sax = A.s[i3], say = A.s[i3 + 1], saz = A.s[i3 + 2], sbx = B.s[i3], sby = B.s[i3 + 1], sbz = B.s[i3 + 2];
      const g = grp[i];
      if (g >= 0 && path) {
        const b = blk[g];
        vT.set(off[i3] * b.k, off[i3 + 1] * b.k, off[i3 + 2] * b.k).applyQuaternion(b.q);
        const cx = b.p.x + vT.x + b.pullX, cy = b.p.y + vT.y + b.pullY, cz = b.p.z + vT.z + b.pullZ, kk = b.k * b.vis;
        // the member's own rotation, turned with the block: q = block * member
        const mx = b.q.x, my = b.q.y, mz = b.q.z, mw = b.q.w;
        if (showFrom === 'house') {
          const ox = qax, oy = qay, oz = qaz, ow = qaw;
          qax = mw * ox + mx * ow + my * oz - mz * oy; qay = mw * oy - mx * oz + my * ow + mz * ox; qaz = mw * oz + mx * oy - my * ox + mz * ow; qaw = mw * ow - mx * ox - my * oy - mz * oz;
          ax = cx; ay = cy; az = cz; sax *= kk; say *= kk; saz *= kk;
        }
        if (showTo === 'house') {
          const ox = qbx, oy = qby, oz = qbz, ow = qbw;
          qbx = mw * ox + mx * ow + my * oz - mz * oy; qby = mw * oy - mx * oz + my * ow + mz * ox; qbz = mw * oz + mx * oy - my * ox + mz * ow; qbw = mw * ow - mx * ox - my * oy - mz * oz;
          bx = cx; by = cy; bz = cz; sbx *= kk; sby *= kk; sbz *= kk;
        }
      }
      // position: lerp, plus the flight arc between formations
      let x = ax + (bx - ax) * lt + fly[i3] * arc, y = ay + (by - ay) * lt + fly[i3 + 1] * arc, z = az + (bz - az) * lt + fly[i3 + 2] * arc;

      // the spring: pushed away from (or gathered toward) the hand, then back to rest
      let tx = 0, ty = 0, tz = 0;
      if (field) {
        const dx = x - hx, dy = y - hy, dz = z - hz, dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dd < PUSH_R && dd > 1e-4) {
          const f = 1 - dd / PUSH_R, w = f * f * (3 - 2 * f);
          // push: away from the hand. Press and hold: toward it, into a loose ball ~0.3 wide around the hand
          const ring = Math.max(0.16, dd * 0.3);
          const mag = w * pushF * (1 - gather) - gather * w * Math.max(0, dd - ring);
          const k = mag / dd;
          tx = dx * k; ty = dy * k + w * pushF * 0.15; tz = dz * k;
        }
      }
      if (breathing) {
        const d = (x * bDirX + y * bDirY + z * bDirZ) - bFront;
        const lift = bAmp * Math.exp(-d * d * 3.2);
        ty += lift; tx += lift * 0.35; tz -= lift * 0.35;
      }
      let vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2], sx = push[i3], sy = push[i3 + 1], sz = push[i3 + 2];
      vx += (tx - sx) * SPRING_K * dt; vy += (ty - sy) * SPRING_K * dt; vz += (tz - sz) * SPRING_K * dt;
      vx -= vx * sK; vy -= vy * sK; vz -= vz * sK;
      sx += vx * dt; sy += vy * dt; sz += vz * dt;
      if (Math.abs(sx) + Math.abs(sy) + Math.abs(sz) + Math.abs(vx) + Math.abs(vy) + Math.abs(vz) < 2e-4) { sx = sy = sz = vx = vy = vz = 0; }
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz; push[i3] = sx; push[i3 + 1] = sy; push[i3 + 2] = sz;
      x += sx; y += sy; z += sz;
      if (floatAmp > 0) { const ph = phase[i]; y += Math.sin(t * 0.7 + ph) * floatAmp; x += Math.sin(t * 0.53 + ph * 1.7) * floatAmp * 0.5; }

      // rotation: normalised lerp of the endpoints (they are close in the house, and the arc spin hides the rest)
      let dot = qax * qbx + qay * qby + qaz * qbz + qaw * qbw, s2 = dot < 0 ? -1 : 1;
      let qx = qax + (qbx * s2 - qax) * lt, qy = qay + (qby * s2 - qay) * lt, qz = qaz + (qbz * s2 - qaz) * lt, qw = qaw + (qbw * s2 - qaw) * lt;
      let ql = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1; qx /= ql; qy /= ql; qz /= ql; qw /= ql;
      // the flight spin, plus a tilt proportional to how far the spring has it displaced
      const disp = Math.sqrt(sx * sx + sy * sy + sz * sz);
      const ang = arc * spin[i4 + 3] + disp * 1.4;
      if (ang > 1e-5) {
        const h = ang * 0.5, sn = Math.sin(h), rx = spin[i4] * sn, ry = spin[i4 + 1] * sn, rz = spin[i4 + 2] * sn, rw = Math.cos(h);
        const ox = qx, oy = qy, oz = qz, ow = qw;
        qx = ow * rx + ox * rw + oy * rz - oz * ry;
        qy = ow * ry - ox * rz + oy * rw + oz * rx;
        qz = ow * rz + ox * ry - oy * rx + oz * rw;
        qw = ow * rw - ox * rx - oy * ry - oz * rz;
      }
      const scx = sax + (sbx - sax) * lt, scy = say + (sby - say) * lt, scz = saz + (sbz - saz) * lt;
      const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
      const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
      arr[o] = (1 - (yy + zz)) * scx; arr[o + 1] = (xy + wz) * scx; arr[o + 2] = (xz - wy) * scx; arr[o + 3] = 0;
      arr[o + 4] = (xy - wz) * scy; arr[o + 5] = (1 - (xx + zz)) * scy; arr[o + 6] = (yz + wx) * scy; arr[o + 7] = 0;
      arr[o + 8] = (xz + wy) * scz; arr[o + 9] = (yz - wx) * scz; arr[o + 10] = (1 - (xx + yy)) * scz; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;

      if (writeCol) {
        colArr[i3] = A.col[i3] + (B.col[i3] - A.col[i3]) * lt; colArr[i3 + 1] = A.col[i3 + 1] + (B.col[i3 + 1] - A.col[i3 + 1]) * lt; colArr[i3 + 2] = A.col[i3 + 2] + (B.col[i3 + 2] - A.col[i3 + 2]) * lt;
        aRough[i] = A.srf[i3] + (B.srf[i3] - A.srf[i3]) * lt; aMetal[i] = A.srf[i3 + 1] + (B.srf[i3 + 1] - A.srf[i3 + 1]) * lt; aEnv[i] = A.srf[i3 + 2] + (B.srf[i3 + 2] - A.srf[i3 + 2]) * lt;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (writeCol) { mesh.instanceColor.needsUpdate = true; geo.attributes.aRough.needsUpdate = geo.attributes.aMetal.needsUpdate = geo.attributes.aEnv.needsUpdate = true; }

    renderer.render(scene, camera);
    if (!shown) { shown = true; piece.classList.add('live'); }
    raf = requestAnimationFrame(frame);
  }
  kick();
  return { renderer, scene, camera, house, rig, mesh, forms: FORMS, n: N, readScroll };
}
